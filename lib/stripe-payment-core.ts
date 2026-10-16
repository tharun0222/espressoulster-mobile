import {PaymentError} from './payment-security.ts';
import {stripeTestConfig,stripeCheckoutUrl,validateStripePayment,verifyStripeSignature} from './stripe-security.ts';
export function createStripePayments(database:any,e:any,send:typeof fetch=fetch){
 const db=()=>database;
 const json=(value:any)=>Response.json(value,{headers:{'Cache-Control':'no-store'}});
async function stripe(path:string,body?:URLSearchParams,idempotency?:string){
 const c=stripeTestConfig(e),response=await send('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+c.key,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotency?{'Idempotency-Key':idempotency}:{})},body,signal:AbortSignal.timeout(15000)});
 const result:any=await response.json();if(!response.ok){if(result.error?.code==='amount_too_small')throw new PaymentError('Stripe sandbox requires a larger order total. Please use an order of at least ₹'+(c.minimumAmount/100).toFixed(2)+'.',409);if(result.error?.code==='idempotency_key_in_use')throw new PaymentError('Checkout is being prepared. Please check again in a moment.',409);throw new PaymentError('Stripe sandbox could not complete this request. Please check payment status before retrying.',502);}return result;
}
async function reconcile(intent:any,session:any){
 const d=db(),o=await d.prepare('SELECT * FROM orders WHERE id=?').bind(intent.order_id).first();
 if(!o||intent.provider!=='stripe'||intent.mode!=='test'||intent.amount!==o.total||intent.currency!==o.currency||session.id!==intent.provider_order_id)throw new PaymentError('Payment mapping mismatch',409);
 let remoteId:string;try{remoteId=validateStripePayment(session,o)}catch(e){throw new PaymentError((e as Error).message,409)}
 const receipt='stripe_test:'+remoteId;
 await d.batch([
 d.prepare("INSERT OR IGNORE INTO payments(id,order_id,amount,method,reference,verified_by) SELECT ?,id,total,'stripe_test',?,'provider_verified_test' FROM orders WHERE id=? AND total=? AND currency=? AND payment_status='unpaid'").bind(receipt,remoteId,o.id,intent.amount,intent.currency),
 d.prepare("UPDATE orders SET payment_status='paid' WHERE id=? AND EXISTS(SELECT 1 FROM payments WHERE id=? AND order_id=? AND amount=?)").bind(o.id,receipt,o.id,intent.amount),
 d.prepare("UPDATE payment_intents SET state=CASE WHEN EXISTS(SELECT 1 FROM payments WHERE id=? AND order_id=?) THEN 'paid' ELSE 'review' END WHERE id=?").bind(receipt,o.id,intent.id),
 ]);
 const stored=await d.prepare('SELECT id FROM payments WHERE order_id=?').bind(o.id).first();
 if(stored?.id!==receipt)throw new PaymentError('Payment requires staff reconciliation. Do not pay again.',409);
 return {paid:true,provider:'stripe',mode:'test',testOnly:true,realMoneyCollected:false,orderId:o.id,refundReviewRequired:o.status==='cancelled'};
}
async function verify(intent:any):Promise<any>{
 if(intent.provider!=='stripe'||intent.mode!=='test'||!/^cs_test_[A-Za-z0-9]+$/.test(intent.provider_order_id||''))throw new PaymentError('Stripe test checkout is not ready. Try again.',409);
 const session=await stripe('checkout/sessions/'+encodeURIComponent(intent.provider_order_id));
 if(session.payment_status==='paid')return reconcile(intent,session);
 return {paid:false,provider:'stripe',mode:'test',providerState:session.status==='expired'?'EXPIRED':'PENDING'};
}
async function stripePaymentRoute(path:string,req:Request,user:{userId:string}){
 if(path==='payments/config'&&req.method==='GET'){try{stripeTestConfig(e);return json({enabled:true,provider:'stripe',mode:'test',minimumAmount:stripeTestConfig(e).minimumAmount});}catch{return json({enabled:false,provider:'stripe',mode:'test',message:'Stripe test checkout is awaiting account configuration.'});}}
 const m=/^payments\/(CH-[A-F0-9]{8})\/(start|verify|status)$/.exec(path);if(!m)return null;
 const [,id,action]=m,d=db(),o=await d.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').bind(id,user.userId).first();
 if(!o)throw new PaymentError('Order not found',404);
 let intent=await d.prepare('SELECT * FROM payment_intents WHERE order_id=?').bind(id).first();
 if(action==='status'&&req.method==='GET')return json({paymentStatus:o.payment_status,intentState:intent?.state||null});
 if(req.method!=='POST')throw new PaymentError('Method not allowed',405);
 if(action==='verify'){if(!intent)return json({paid:o.payment_status==='paid',paymentStatus:o.payment_status});return json(await verify(intent));}
 const c=stripeTestConfig(e);
 if(o.payment_status!=='unpaid'||['cancelled','completed'].includes(o.status)||o.currency!=='INR'||!Number.isSafeInteger(o.total)||o.total<c.minimumAmount)throw new PaymentError('Stripe sandbox requires an unpaid INR order of at least ₹'+(c.minimumAmount/100).toFixed(2)+'.',409);
 if(intent&&(intent.provider!=='stripe'||intent.mode!=='test'))throw new PaymentError('This order already uses another payment provider.',409);
 if(!intent){await d.prepare("INSERT OR IGNORE INTO payment_intents(id,order_id,user_id,amount,currency,provider,mode,merchant_order_id) VALUES(?,?,?,?,?,'stripe','test',?)").bind(crypto.randomUUID(),id,user.userId,o.total,o.currency,'stripe-'+id).run();intent=await d.prepare('SELECT * FROM payment_intents WHERE order_id=?').bind(id).first();}
 if(intent.provider_order_id){
  const state=await verify(intent);if(state.paid)return json(state);
  if(state.providerState==='EXPIRED'){
   await d.prepare("UPDATE payment_intents SET id=?,provider_order_id=NULL,checkout_url=NULL,expires_at=NULL,state='creating' WHERE id=? AND provider_order_id=? AND state='ready'").bind(crypto.randomUUID(),intent.id,intent.provider_order_id).run();
   intent=await d.prepare('SELECT * FROM payment_intents WHERE order_id=?').bind(id).first();
   if(intent.provider_order_id)return json({provider:'stripe',mode:'test',redirectUrl:stripeCheckoutUrl(intent.checkout_url)});
  }else return json({provider:'stripe',mode:'test',redirectUrl:stripeCheckoutUrl(intent.checkout_url)});
 }
 const data=new URLSearchParams({mode:'payment',client_reference_id:id,'metadata[order_id]':id,'line_items[0][price_data][currency]':'inr','line_items[0][price_data][unit_amount]':String(o.total),'line_items[0][price_data][product_data][name]':'Espressoulster test order '+id,'line_items[0][quantity]':'1',success_url:c.origin+'/payment-return?order='+id,cancel_url:c.origin+'/payment-return?order='+id+'&cancelled=1'});
 const session=await stripe('checkout/sessions',data,'espresso-stripe-test-'+intent.id);
 if(session.livemode!==false||!/^cs_test_[A-Za-z0-9]+$/.test(session.id||'')||!Number.isSafeInteger(session.expires_at))throw new PaymentError('Invalid Stripe test response',502);
 const checkout=stripeCheckoutUrl(session.url);
 await d.prepare("UPDATE payment_intents SET provider_order_id=?,checkout_url=?,expires_at=?,state='ready' WHERE id=? AND state='creating'").bind(session.id,checkout,session.expires_at*1000,intent.id).run();
 return json({provider:'stripe',mode:'test',redirectUrl:checkout});
}
async function stripeWebhook(req:Request,raw:string){
 try{await verifyStripeSignature(raw,req.headers.get('stripe-signature'),e.STRIPE_TEST_WEBHOOK_SECRET);}catch{throw new PaymentError('Invalid Stripe webhook signature',401)}
 let event:any;try{event=JSON.parse(raw)}catch{throw new PaymentError('Invalid webhook body')}
 if(event.livemode!==false)throw new PaymentError('Live Stripe events are disabled',403);
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired'].includes(event.type))return json({received:true,ignored:true});
 const id=event.data?.object?.id;if(!/^cs_test_[A-Za-z0-9]+$/.test(id||''))throw new PaymentError('Invalid session');
 const intent=await db().prepare("SELECT * FROM payment_intents WHERE provider_order_id=? AND provider='stripe' AND mode='test'").bind(id).first();
 if(!intent){
  const localOrder=event.data?.object?.metadata?.order_id;
  if(/^CH-[A-F0-9]{8}$/.test(localOrder||'')&&await db().prepare('SELECT id FROM orders WHERE id=?').bind(localOrder).first())throw new PaymentError('Payment mapping is not ready. Retry delivery.',409);
  return json({received:true,ignored:true});
 }
 return json(await verify(intent));
}

 return {route:stripePaymentRoute,webhook:stripeWebhook};
}
