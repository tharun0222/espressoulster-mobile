import {PaymentError} from './payment-security.ts';
import {parseCashfreeJson} from './cashfree-json.ts';
import {stripeTestConfig,verifyStripeSignature} from './stripe-security.ts';
import {createPrepaidCheckouts} from './prepaid-checkout.ts';
import {isPrepaidCheckoutId} from './checkout-reference.ts';
import {createTableBookingCheckouts,isBookingCheckoutId} from './stripe-table-bookings.ts';
import {cashfreeLinkId,cashfreeLiveConfig,cashfreeTestConfig,createCashfreeCheckout,verifyCashfreeSignature} from './cashfree-sandbox.ts';
import {createStripeCheckout,hostedPaymentMethod,paymentVerificationSource,isSandboxProvider,sandboxLabel,sandboxMethod,sandboxReturnOrigin,type CheckoutMode,type SandboxProvider} from './sandbox-checkout.ts';
import {syncTestSubscription} from './subscription-test.ts';
export function createStripePayments(database:any,e:any,send:typeof fetch=fetch){
 const db=()=>database;
 const json=(value:any)=>Response.json(value,{headers:{'Cache-Control':'no-store'}});
 const selected:SandboxProvider = e.PAYMENT_PROVIDER==='cashfree'?'cashfree':'stripe';
 const mode:CheckoutMode = selected==='cashfree'&&e.PAYMENT_MODE==='live'?'live':'test';
 const providers = {stripe:createStripeCheckout(e,stripe),cashfree:createCashfreeCheckout(e,send)};
 const liveCashfree=createCashfreeCheckout(e,send,'live');
 const checkoutFor=(provider:SandboxProvider, paymentMode:CheckoutMode='test')=>{
  if(paymentMode==='test')return providers[provider];
  if(provider==='cashfree')return liveCashfree;
  throw new PaymentError('This payment provider is unavailable.',409);
 };
 const prepaid=createPrepaidCheckouts(database,checkoutFor);
 const booking=createTableBookingCheckouts(database,()=>isSandboxProvider(e.PAYMENT_PROVIDER)?selected:null,checkoutFor,mode);
async function stripe(path:string,body?:URLSearchParams,idempotency?:string){
 const c=stripeTestConfig(e),response=await send('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+c.key,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotency?{'Idempotency-Key':idempotency}:{})},body,signal:AbortSignal.timeout(15000)});
 const result:any=await response.json();if(!response.ok){if(result.error?.code==='amount_too_small')throw new PaymentError('Stripe sandbox requires a larger order total. Please use an order of at least ₹'+(c.minimumAmount/100).toFixed(2)+'.',409);if(result.error?.code==='idempotency_key_in_use')throw new PaymentError('Checkout is being prepared. Please check again in a moment.',409);throw new PaymentError('Stripe sandbox could not complete this request. Please check payment status before retrying.',502);}return result;
}
async function reconcile(intent:any,order:any,reference:string){
 const d=db(),paymentMethod=hostedPaymentMethod(intent.provider,intent.mode),receipt=paymentMethod+':'+reference;
 await d.batch([
 d.prepare("INSERT OR IGNORE INTO payments(id,order_id,amount,method,reference,verified_by) SELECT ?,id,total,?,?,? FROM orders WHERE id=? AND total=? AND currency=? AND payment_status='unpaid'").bind(receipt,paymentMethod,reference,paymentVerificationSource(intent.mode),order.id,intent.amount,intent.currency),
 d.prepare("UPDATE orders SET payment_status='paid' WHERE id=? AND EXISTS(SELECT 1 FROM payments WHERE id=? AND order_id=? AND amount=?)").bind(order.id,receipt,order.id,intent.amount),
 d.prepare("UPDATE payment_intents SET state=CASE WHEN EXISTS(SELECT 1 FROM payments WHERE id=? AND order_id=?) THEN 'paid' ELSE 'review' END WHERE id=?").bind(receipt,order.id,intent.id),
 ]);
 const stored=await d.prepare('SELECT id FROM payments WHERE order_id=?').bind(order.id).first();
 if(stored?.id!==receipt)throw new PaymentError('Payment requires staff reconciliation. Do not pay again.',409);
 return {paid:true,provider:intent.provider,mode:intent.mode,testOnly:intent.mode==='test',realMoneyCollected:intent.mode==='live',orderId:order.id,refundReviewRequired:order.status==='cancelled'};
}

async function verify(intent:any,cancel=false):Promise<any>{
 if(!isSandboxProvider(intent.provider)||intent.mode!==mode||!intent.provider_order_id)throw new PaymentError('Test checkout is not ready. Try again.',409);
 const order=await db().prepare('SELECT * FROM orders WHERE id=?').bind(intent.order_id).first();
 if(!order||intent.user_id!==order.user_id||intent.amount!==order.total||intent.currency!==order.currency)throw new PaymentError('Payment mapping mismatch.',409);
 if(intent.state==='paid'&&order.payment_status==='paid'){
  const receipt=await db().prepare("SELECT id FROM payments WHERE order_id=? AND amount=? AND method=? AND verified_by=?").bind(order.id,order.total,hostedPaymentMethod(intent.provider,intent.mode),paymentVerificationSource(intent.mode)).first();
  if(receipt)return {paid:true,provider:intent.provider,mode:intent.mode,testOnly:intent.mode==='test',realMoneyCollected:intent.mode==='live',orderId:order.id,refundReviewRequired:order.status==='cancelled'};
 }
 const status=await checkoutFor(intent.provider,intent.mode).verify(order,intent.provider_order_id,intent.id,cancel);
 if(status.state==='paid')return reconcile(intent,order,status.reference);
 return {paid:false,provider:intent.provider,mode:intent.mode,providerState:status.state==='expired'?'EXPIRED':'PENDING'};
}

async function sandboxPaymentRoute(path:string,req:Request,user:{userId:string}){
 if(path==='payments/config'&&req.method==='GET'){
  try{return json({enabled:true,provider:selected,mode,minimumAmount:checkoutFor(selected,mode).config().minimumAmount});}
  catch{return json(selected==='cashfree'
   ?{enabled:false,provider:'cashfree',mode}:{enabled:false,provider:null});}
 }
 if(mode==='live')cashfreeLiveConfig(e);
 else if(selected==='cashfree')cashfreeTestConfig(e);
 else if(e.PUBLIC_TEST_MODE!=='true'||e.PAYMENT_MODE!=='test')throw new PaymentError('Online checkout is unavailable.',409);
 const sdkMatch=/^payments\/((?:PC|BK)-[A-F0-9]{32}|CH-[A-F0-9]{8})\/session$/.exec(path);
 if(sdkMatch&&req.method==='GET'){
  const id=sdkMatch[1];let input:any,providerId:string,requestId=id;
  if(isPrepaidCheckoutId(id)){
   const row=await db().prepare("SELECT * FROM prepaid_checkouts WHERE id=? AND user_id=? AND provider='cashfree' AND mode=?").bind(id,user.userId,mode).first();
   if(!row?.provider_session_id)throw new PaymentError('Checkout not found or not ready.',404);
   input={id,total:row.total,currency:row.currency};providerId=row.provider_session_id;
  }else if(isBookingCheckoutId(id)){
   const row=await db().prepare("SELECT * FROM table_booking_payments WHERE id=? AND user_id=? AND provider='cashfree' AND mode=?").bind(id,user.userId,mode).first();
   if(!row?.provider_session_id)throw new PaymentError('Booking checkout not found or not ready.',404);
   input={id,total:row.checkout_amount??row.amount,currency:'INR'};providerId=row.provider_session_id;
  }else{
   const row=await db().prepare("SELECT * FROM payment_intents WHERE order_id=? AND user_id=? AND provider='cashfree' AND mode=? ORDER BY created_at DESC LIMIT 1").bind(id,user.userId,mode).first();
   if(!row?.provider_order_id)throw new PaymentError('Pass checkout not found or not ready.',404);
   input={id,total:row.amount,currency:row.currency};providerId=row.provider_order_id;requestId=row.id;
  }
  const gateway=checkoutFor('cashfree',mode);
  if(!gateway.session)throw new PaymentError('This checkout uses a different Cashfree integration.',409);
  const session=await gateway.session(input,providerId,requestId);
  return json({...session,...(session.state==='ready'?{order_id:session.orderId,payment_session_id:session.paymentSessionId}:{})});
 }
 const draftMatch=/^payments\/(PC-[A-F0-9]{32})\/(start|verify)$/.exec(path);
 if(draftMatch)return json(await prepaid.route(draftMatch[1],draftMatch[2],req,user.userId,mode));
 const match=/^payments\/(CH-[A-F0-9]{8})\/(start|verify|status)$/.exec(path);
 if(!match)return null;
 const [,id,action]=match,d=db();
 const order=await d.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').bind(id,user.userId).first();
 if(!order)throw new PaymentError('Order not found',404);
 if(mode==='live' && (order.checkout_payment_method!=='cashfree' ||
  !await d.prepare('SELECT 1 FROM subscription_purchase_snapshots WHERE order_id=? AND user_id=?').bind(id,user.userId).first())){
  throw new PaymentError('Start Cashfree checkout from your cart or Coffee Pass.',409);
 }
 const intentForOrder=()=>d.prepare('SELECT * FROM payment_intents WHERE order_id=?').bind(id).first();
 let intent=await intentForOrder();
 if(action==='status'&&req.method==='GET')return json({paymentStatus:order.payment_status,intentState:intent?.state||null});
 if(req.method!=='POST')throw new PaymentError('Method not allowed',405);
 if(action==='verify'){
  if(!intent)return json({paid:order.payment_status==='paid',paymentStatus:order.payment_status});
  if(!intent.provider_order_id)return json({paid:false,providerState:'PENDING'});
  return json(await verify(intent,new URL(req.url).searchParams.get('cancelled')==='1'));
 }
 if(intent&&(!isSandboxProvider(intent.provider)||intent.mode!==mode))throw new PaymentError('This order already uses another payment provider.',409);
 if(intent?.state==='paid'&&order.payment_status==='paid')return json(await verify(intent));
 if(order.checkout_payment_method&&!intent&&order.checkout_payment_method!==hostedPaymentMethod(selected,mode))throw new PaymentError('This order is set to pay at the café.',409);
 if(selected==='cashfree'&&!intent&&!await d.prepare('SELECT 1 FROM subscription_purchase_snapshots WHERE order_id=? AND user_id=?').bind(id,user.userId).first()){
  throw new PaymentError('Start Cashfree checkout from your cart or a Coffee Pass.',409);
 }
 const minimum=checkoutFor(intent?.provider??selected,mode).config().minimumAmount;
 if(order.payment_status!=='unpaid'||['cancelled','completed'].includes(order.status)||order.currency!=='INR'||!Number.isSafeInteger(order.total)||order.total<minimum){
  throw new PaymentError(sandboxLabel(intent?.provider??selected)+' requires an unpaid INR order of at least ₹'+(minimum/100).toFixed(2)+'.',409);
 }
 if(!intent){
  await d.prepare("INSERT OR IGNORE INTO payment_intents(id,order_id,user_id,amount,currency,provider,mode,merchant_order_id) VALUES(?,?,?,?,?,?,?,?)")
   .bind(crypto.randomUUID(),id,user.userId,order.total,order.currency,selected,mode,selected+'-'+mode+'-'+id).run();
  intent=await intentForOrder();
 }
 if(!intent||!isSandboxProvider(intent.provider)||intent.mode!==mode||intent.amount!==order.total||intent.currency!==order.currency||intent.user_id!==user.userId){
  throw new PaymentError('Payment mapping mismatch.',409);
 }
 if(intent.provider_order_id){
  const status=await verify(intent);
  if(status.paid)return json(status);
  if(status.providerState!=='EXPIRED')return json({provider:intent.provider,mode:intent.mode,redirectUrl:checkoutFor(intent.provider,intent.mode).checkoutUrl(intent.checkout_url)});
  await d.prepare("UPDATE payment_intents SET id=?,provider_order_id=NULL,checkout_url=NULL,expires_at=NULL,state='creating' WHERE id=? AND provider_order_id=? AND state='ready'")
   .bind(crypto.randomUUID(),intent.id,intent.provider_order_id).run();
  intent=await intentForOrder();
  if(intent.provider_order_id)return json({provider:intent.provider,mode:intent.mode,redirectUrl:checkoutFor(intent.provider,intent.mode).checkoutUrl(intent.checkout_url)});
 }
 const gateway=checkoutFor(intent.provider,intent.mode);
 const returnUrl=sandboxReturnOrigin(gateway.config().origin,req)+'/payment-return?order='+id;
 const session=await gateway.create({
  id,total:order.total,currency:order.currency,requestId:intent.id,purpose:'Espressoulster Coffee Pass '+id,contact:JSON.parse(order.contact||'{}'),returnUrl,cancelUrl:returnUrl+'&cancelled=1',
 });
 await d.prepare("UPDATE payment_intents SET provider_order_id=?,checkout_url=?,expires_at=?,cashfree_order_id=?,state='ready' WHERE id=? AND state='creating'")
  .bind(session.id,session.url,session.expiresAt*1000,session.orderId??null,intent.id).run();
 const saved=await intentForOrder();
 if(!saved||!saved.provider_order_id)throw new PaymentError('Payment checkout is still being saved. Check again shortly.',409);
 return json({provider:saved.provider,mode:saved.mode,redirectUrl:checkoutFor(saved.provider,saved.mode).checkoutUrl(saved.checkout_url),
  ...(session.orderId&&session.paymentSessionId?{order_id:session.orderId,payment_session_id:session.paymentSessionId}:{})});
}

async function cashfreeWebhook(req:Request,raw:string){
 const config=mode==='live'?cashfreeLiveConfig(e):cashfreeTestConfig(e);
 await verifyCashfreeSignature(raw,req.headers,config.secret);
 let event:any;
 try{event=parseCashfreeJson(raw);}catch{throw new PaymentError('Invalid webhook body.');}
 const data=event.data??event;
 const gatewayOrder=typeof data.order?.order_id==='string'?data.order.order_id:null;
 const linkId=gatewayOrder??data.link_id;
 let sessionId=String(data.cf_link_id??'');
 if(gatewayOrder){
  if(event.type!=='PAYMENT_SUCCESS_WEBHOOK'||data.payment?.payment_status!=='SUCCESS')return json({received:true,ignored:true});
  let kind:'prepaid'|'booking'|'pass',row:any,amount:number,currency:string;
  if(isPrepaidCheckoutId(gatewayOrder)){
   kind='prepaid';
   row=await db().prepare("SELECT * FROM prepaid_checkouts WHERE id=? AND provider='cashfree' AND mode=?").bind(gatewayOrder,mode).first();
   amount=row?.total;currency=row?.currency;
  }else if(isBookingCheckoutId(gatewayOrder)){
   kind='booking';
   row=await db().prepare("SELECT * FROM table_booking_payments WHERE id=? AND provider='cashfree' AND mode=?").bind(gatewayOrder,mode).first();
   amount=row?.checkout_amount??row?.amount;currency='INR';
  }else{
   kind='pass';
   const orderId=/^(CH-[A-F0-9]{8})-[0-9a-f]{32}$/.exec(gatewayOrder)?.[1];
   if(!orderId)return json({received:true,ignored:true});
   row=await db().prepare("SELECT * FROM payment_intents WHERE order_id=? AND provider='cashfree' AND mode=?").bind(orderId,mode).first();
   if(row&&cashfreeLinkId(orderId,row.id)!==gatewayOrder)row=null;
   amount=row?.amount;currency=row?.currency;
  }
  if(!row)return json({received:true,ignored:true});
  if(row.cashfree_order_id&&row.cashfree_order_id!==gatewayOrder)throw new PaymentError('Cashfree order mapping mismatch.',409);
  const matches=(value:unknown)=>['string','number'].includes(typeof value)&&String(value).trim()!==''&&
   Number.isFinite(Number(value))&&Math.abs(Number(value)*100-amount)<.000001;
  if(!Number.isSafeInteger(amount)||amount<1||!matches(data.order?.order_amount)||!matches(data.payment?.payment_amount)||
    data.order?.order_currency!==currency||data.payment?.payment_currency!==currency)
   throw new PaymentError('Cashfree webhook amount or currency does not match this checkout.',409);
  const paymentId=String(data.payment?.cf_payment_id??'');
  if(!/^[0-9]{1,64}$/.test(paymentId))throw new PaymentError('Invalid Cashfree payment reference.',400);
  const receipt=await db().prepare('SELECT * FROM cashfree_webhook_receipts WHERE mode=? AND payment_id=?').bind(mode,paymentId).first();
  if(receipt){
   if(receipt.cashfree_order_id!==gatewayOrder||receipt.amount!==amount||receipt.currency!==currency)
    throw new PaymentError('Cashfree payment reference mismatch.',409);
   return json({received:true,duplicate:true});
  }
  sessionId=String(kind==='pass'?row.provider_order_id:row.provider_session_id);
  if(!/^[0-9]+$/.test(sessionId))throw new PaymentError('Payment mapping is not ready. Retry delivery.',409);
  // Reuse the same transactional finalization as the authenticated status call.
  // Get Order independently checks PAID, merchant order, total, currency and cf_order_id.
  const result=kind==='prepaid'?await prepaid.webhook(gatewayOrder,sessionId,'cashfree',mode):
   kind==='booking'?await booking.webhook(gatewayOrder,sessionId,'cashfree','cashfree',mode):await verify(row);
  if(kind==='pass'&&result.paid&&!result.refundReviewRequired)await syncTestSubscription(db(),e,row.user_id);
  if(result.paid||result.state==='paid'||result.state==='review'){
   await db().prepare('INSERT OR IGNORE INTO cashfree_webhook_receipts(mode,payment_id,cashfree_order_id,amount,currency) VALUES(?,?,?,?,?)')
    .bind(mode,paymentId,gatewayOrder,amount,currency).run();
  }
  return json({received:true,...result});
 }
 if(typeof linkId!=='string'||!/^\d+$/.test(sessionId))return json({received:true,ignored:true});
 if(isBookingCheckoutId(linkId))return json(await booking.webhook(linkId,sessionId,'cashfree','cashfree',mode));
 if(isPrepaidCheckoutId(linkId))return json(await prepaid.webhook(linkId,sessionId,'cashfree',mode));
 const orderId=/^(CH-[A-F0-9]{8})-[0-9a-f]{32}$/.exec(linkId)?.[1];
 if(!orderId)return json({received:true,ignored:true});
 const intent=await db().prepare("SELECT * FROM payment_intents WHERE order_id=? AND provider='cashfree' AND mode=?").bind(orderId,mode).first();
 if(!intent||cashfreeLinkId(orderId,intent.id)!==linkId)return json({received:true,ignored:true});
 if(!intent.provider_order_id)throw new PaymentError('Payment mapping is not ready. Retry delivery.',409);
 if(intent.provider_order_id!==sessionId)return json({received:true,ignored:true});
 const result=await verify(intent);
 if(result.paid&&!result.refundReviewRequired)await syncTestSubscription(db(),e,intent.user_id);
 return json(result);
}
async function stripeWebhook(req:Request,raw:string){
 if(e.PUBLIC_TEST_MODE!=='true')throw new PaymentError('Online checkout is unavailable.',409);
 try{await verifyStripeSignature(raw,req.headers.get('stripe-signature'),e.STRIPE_TEST_WEBHOOK_SECRET);}catch{throw new PaymentError('Invalid Stripe webhook signature',401)}
 let event:any;try{event=JSON.parse(raw)}catch{throw new PaymentError('Invalid webhook body')}
 if(event.livemode!==false)throw new PaymentError('Live Stripe events are disabled',403);
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(event.type))return json({received:true,ignored:true});
 const id=event.data?.object?.id;if(!/^cs_test_[A-Za-z0-9]+$/.test(id||''))throw new PaymentError('Invalid session');
 const checkoutId=event.data?.object?.metadata?.order_id;
 if(typeof checkoutId==='string'&&isBookingCheckoutId(checkoutId))return json(await booking.webhook(checkoutId,id,event.type));
 if(event.type==='checkout.session.async_payment_failed')return json({received:true,ignored:true});
 if(typeof checkoutId==='string'&&isPrepaidCheckoutId(checkoutId))return json(await prepaid.webhook(checkoutId,id,'stripe'));
 const intent=await db().prepare("SELECT * FROM payment_intents WHERE provider_order_id=? AND provider='stripe' AND mode='test'").bind(id).first();
 if(!intent){
  const localOrder=event.data?.object?.metadata?.order_id;
  if(/^CH-[A-F0-9]{8}$/.test(localOrder||'')&&await db().prepare('SELECT id FROM orders WHERE id=?').bind(localOrder).first())throw new PaymentError('Payment mapping is not ready. Retry delivery.',409);
  return json({received:true,ignored:true});
 }
 return json(await verify(intent));
}

 return {route:sandboxPaymentRoute,webhook:stripeWebhook,cashfreeWebhook,reconcileExpired:()=>prepaid.reconcileExpired(mode),booking};
}
