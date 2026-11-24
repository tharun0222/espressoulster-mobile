import {sandboxPaymentRoute} from './stripe-payments';
import {env} from 'cloudflare:workers';
import {db,json,limitedBytes} from './server';
import {configuration,PaymentError,validateCompleted,verifyWebhookAuthorization,checkoutUrl} from './payment-security';
import {createPhonePeClient} from './phonepe-client';
// Reuse OAuth tokens within a Worker isolate. Rotated bindings replace the client.
let active:{fingerprint:string;client:ReturnType<typeof createPhonePeClient>}|undefined;
function livePhonePeConfiguration(){
 const c=configuration(env);
 if(c.mode!=='live')throw new PaymentError('Online payments are unavailable. You can pay at the café.',503);
 return c;
}
function client(){const c=configuration(env);const fingerprint=JSON.stringify([c.mode,c.origin,c.clientId,c.clientVersion,c.secret]);if(active?.fingerprint!==fingerprint)active={fingerprint,client:createPhonePeClient(env)};return active.client;}
function belongs(intent:any){const c=configuration(env);if(intent.provider!=='phonepe'||intent.mode!==c.mode||!intent.merchant_order_id)throw new PaymentError('This payment belongs to a different provider or environment. Contact the café.',409);}
async function orderForUser(id:string,userId:string){
 const o=await db().prepare('SELECT * FROM orders WHERE id=? AND user_id=?').bind(id,userId).first<any>();
 if(!o)throw new PaymentError('Order not found',404);return o;
}
async function reconcile(intent:any,remote:any){
 belongs(intent);const remoteId=validateCompleted(remote,intent),d=db(),receipt='phonepe:'+remoteId;
 await d.batch([
  d.prepare("INSERT OR IGNORE INTO payments (id,order_id,amount,method,reference,verified_by) SELECT ?,id,total,'phonepe',?,'provider_verified' FROM orders WHERE id=? AND total=? AND currency=? AND payment_status='unpaid'").bind(receipt,remoteId,intent.order_id,intent.amount,intent.currency),
  d.prepare("UPDATE orders SET payment_status='paid' WHERE id=? AND EXISTS(SELECT 1 FROM payments WHERE id=? AND order_id=? AND amount=?)").bind(intent.order_id,receipt,intent.order_id,intent.amount),
  d.prepare("UPDATE payment_intents SET provider_order_id=?,state=CASE WHEN EXISTS(SELECT 1 FROM payments WHERE id=? AND order_id=?) THEN 'paid' ELSE 'review' END WHERE id=?").bind(remoteId,receipt,intent.order_id,intent.id),
 ]);
 const stored=await d.prepare('SELECT id FROM payments WHERE order_id=?').bind(intent.order_id).first<any>();
 if(stored?.id!==receipt)throw new PaymentError('Payment received but needs staff reconciliation. Do not pay again.',409);
 const o=await d.prepare('SELECT status FROM orders WHERE id=?').bind(intent.order_id).first<any>();
 return {paid:true,paymentStatus:'paid',orderId:intent.order_id,provider:'phonepe',refundReviewRequired:o?.status==='cancelled'};
}
async function verifyIntent(intent:any){
 belongs(intent);const remote=await client().status(intent.merchant_order_id);
 if(intent.provider_order_id && remote.orderId!==intent.provider_order_id)throw new PaymentError('PhonePe order mismatch',409);
 if(remote.state==='COMPLETED')return reconcile(intent,remote);
 if(!['PENDING','FAILED'].includes(remote.state)||remote.amount!==intent.amount||!/^OMO[a-zA-Z0-9]+$/.test(remote.orderId||''))throw new PaymentError('Invalid PhonePe payment status',502);
 return {paid:false,paymentStatus:'unpaid',providerState:remote.state,orderId:intent.order_id,intentState:intent.state};
}
export async function paymentWebhook(req:Request){
 const c=livePhonePeConfiguration();
 await verifyWebhookAuthorization(c.webhookUsername,c.webhookPassword,req.headers.get('authorization'));
 const raw=new TextDecoder('utf-8',{fatal:true}).decode(await limitedBytes(req,128000));
 let event:any;try{event=JSON.parse(raw);}catch{throw new PaymentError('Invalid webhook body');}
 if(!['checkout.order.completed','checkout.order.failed'].includes(event.event))return json({received:true,ignored:true});
 const p=event.payload;
 if(!/^[a-zA-Z0-9_-]{1,63}$/.test(p?.merchantOrderId||'')||!['COMPLETED','FAILED'].includes(p?.state))throw new PaymentError('Invalid PhonePe webhook');
 const intent=await db().prepare("SELECT * FROM payment_intents WHERE merchant_order_id=? AND provider='phonepe' AND mode=?").bind(p.merchantOrderId,c.mode).first<any>();
 if(!intent)throw new PaymentError('Unknown PhonePe payment mapping',404);
 // Callback credentials authenticate the sender; fetched order status verifies money.
 return json(await verifyIntent(intent));
}
export async function onlinePaymentRoute(path:string,req:Request,user:{userId:string}){
 if(env.PAYMENT_PROVIDER==='stripe'||env.PAYMENT_PROVIDER==='cashfree')return sandboxPaymentRoute(path,req,user);
 if((env as any).PUBLIC_TEST_MODE==='true'){if(path==='payments/config')return json({enabled:false,provider:null});throw new PaymentError('Real payments are disabled during public testing',403);}
 if(path==='payments/config'&&req.method==='GET'){
  try{const c=livePhonePeConfiguration();return json({enabled:true,provider:'phonepe',mode:c.mode});}catch{return json({enabled:false,provider:null});}
 }
 const m=path.match(/^payments\/(CH-[A-F0-9]{8})\/(start|verify|status)$/);if(!m)return null;
 const [,orderId,action]=m,c=livePhonePeConfiguration(),d=db(),o=await orderForUser(orderId,user.userId);
 let intent=await d.prepare('SELECT * FROM payment_intents WHERE order_id=?').bind(orderId).first<any>();
 if(action==='status'&&req.method==='GET')return json({orderId,paymentStatus:o.payment_status,intentState:intent?.state||null,cancelled:o.status==='cancelled'});
 if(req.method!=='POST')throw new PaymentError('Method not allowed',405);
 if(action==='verify'){
  if(!intent) return json({paid:o.payment_status==='paid',paymentStatus:o.payment_status,orderId});
  return json(await verifyIntent(intent));
 }
 if(action!=='start')throw new PaymentError('Method not allowed',405);
 if(o.payment_status!=='unpaid'||['cancelled','completed'].includes(o.status))throw new PaymentError('Order is not eligible for online payment',409);
 if(o.currency!=='INR'||!Number.isSafeInteger(o.total)||o.total<100)throw new PaymentError('Online payment requires an INR order of at least ₹1',409);
 if(!intent){
  const id=crypto.randomUUID(),merchantId='ESP-'+id;
  const lock=await d.prepare("INSERT OR IGNORE INTO payment_intents (id,order_id,user_id,amount,currency,provider,mode,merchant_order_id) VALUES (?,?,?,?,?,'phonepe',?,?)").bind(id,orderId,user.userId,o.total,o.currency,c.mode,merchantId).run();
  if(lock.meta.changes!==1)throw new PaymentError('Payment setup is in progress. Check status.',409);
  const remote=await client().start(merchantId,o.total,orderId);
  await d.prepare("UPDATE payment_intents SET provider_order_id=?,checkout_url=?,expires_at=?,state=CASE WHEN state='creating' THEN 'ready' ELSE state END WHERE id=?").bind(remote.orderId,remote.redirectUrl,remote.expireAt,id).run();
  intent=await d.prepare('SELECT * FROM payment_intents WHERE id=?').bind(id).first<any>();
 }else{
  belongs(intent);
  const status=await verifyIntent(intent);if(status.paid)return json(status);
 }
 belongs(intent);
 if(intent.state!=='ready'||!intent.checkout_url||intent.expires_at<=Date.now())throw new PaymentError('Checkout is unavailable or expired. Check status or contact the café; do not pay again.',409);
 return json({provider:'phonepe',mode:c.mode,localOrderId:orderId,redirectUrl:checkoutUrl(intent.checkout_url,c.mode)});
}
