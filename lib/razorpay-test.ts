import {env} from 'cloudflare:workers';
import {db,json,body} from './server';
import {PaymentError} from './payment-security';
import {razorpayTestConfig,verifyRazorpaySignature,validateRazorpayTestPayment,validateRazorpayTestOrder} from './razorpay-test-security';
async function remote(path:string,data?:unknown){
 const c=razorpayTestConfig(env as any);
 let response:Response;
 try{response=await fetch('https://api.razorpay.com/v1/'+path,{method:data===undefined?'GET':'POST',headers:{Authorization:'Basic '+btoa(c.keyId+':'+c.secret),'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw new PaymentError('Razorpay test service is unavailable. Retry verification before starting another payment.',502);}
 if(!response.ok)throw new PaymentError('Razorpay could not process the test request. Check test credentials and capture settings.',502);
 try{return await response.json() as any;}catch{throw new PaymentError('Invalid Razorpay response',502);}
}
export async function razorpayTestRoute(path:string,req:Request,user:{userId:string}){
 if(path==='razorpay-test/config'&&req.method==='GET'){
  try{razorpayTestConfig(env as any);return json({enabled:true,provider:'razorpay',mode:'test'});}catch{return json({enabled:false,provider:'razorpay',mode:'test',reason:'Test keys are not configured'});}
 }
 const m=path.match(/^razorpay-test\/(CH-[A-F0-9]{8})\/(start|verify|status)$/);if(!m)throw new PaymentError('Payment endpoint not found',404);
 const [,orderId,action]=m,c=razorpayTestConfig(env as any),d=db();
 const order=await d.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').bind(orderId,user.userId).first<any>();
 if(!order)throw new PaymentError('Order not found',404);
 let intent=await d.prepare('SELECT * FROM razorpay_test_checkouts WHERE order_id=?').bind(orderId).first<any>();
 if(intent&&(intent.key_id!==c.keyId||intent.user_id!==user.userId||intent.amount!==order.total||intent.currency!==order.currency))throw new PaymentError('Test checkout configuration changed. Create a new test order.',409);
 if(action==='status'&&req.method==='GET')return json({testOnly:true,testVerified:intent?.state==='verified',actualPaymentStatus:order.payment_status});
 if(req.method!=='POST')throw new PaymentError('Method not allowed',405);
 if(order.payment_status!=='unpaid'||['cancelled','completed'].includes(order.status))throw new PaymentError('Order is not eligible for a test payment',409);
 if(order.currency!=='INR'||!Number.isSafeInteger(order.total)||order.total<100)throw new PaymentError('Test checkout requires an INR order of at least ₹1',409);
 if(action==='start'){
  if(!intent){
   const id=crypto.randomUUID();
   const lock=await d.prepare('INSERT OR IGNORE INTO razorpay_test_checkouts(id,order_id,user_id,amount,currency,key_id) VALUES(?,?,?,?,?,?)').bind(id,orderId,user.userId,order.total,order.currency,c.keyId).run();
   if(lock.meta.changes!==1)throw new PaymentError('Test checkout is being prepared. Try again shortly.',409);
   const receipt='test-'+orderId;
   const result=await remote('orders',{amount:order.total,currency:'INR',receipt,partial_payment:false});
   validateRazorpayTestOrder(result,order.total,receipt);
   await d.prepare("UPDATE razorpay_test_checkouts SET provider_order_id=?,state='ready' WHERE id=? AND state='creating'").bind(result.id,id).run();
   intent=await d.prepare('SELECT * FROM razorpay_test_checkouts WHERE id=?').bind(id).first<any>();
  }
  if(intent.state==='verified')return json({testOnly:true,testVerified:true,actualPaymentStatus:order.payment_status});
  if(intent.state!=='ready'||!intent.provider_order_id)throw new PaymentError('Test checkout setup did not finish. Create a new test order; no payment has been verified.',409);
  return json({testOnly:true,provider:'razorpay',mode:'test',keyId:c.keyId,providerOrderId:intent.provider_order_id,amount:intent.amount,currency:intent.currency});
 }
 if(!intent?.provider_order_id)throw new PaymentError('No test checkout exists',409);
 const input=await body(req);
 if(input.razorpay_order_id!==intent.provider_order_id)throw new PaymentError('Razorpay order mismatch',400);
 await verifyRazorpaySignature(intent.provider_order_id,input.razorpay_payment_id,input.razorpay_signature,c.secret);
 const payment=await remote('payments/'+encodeURIComponent(input.razorpay_payment_id));
 validateRazorpayTestPayment(payment,intent,input.razorpay_payment_id);
 if(intent.payment_id&&intent.payment_id!==payment.id)throw new PaymentError('A different test payment was already verified',409);
 // Sandbox receipts live in their own table: never change actual bill status or issue credits.
 await d.prepare("UPDATE razorpay_test_checkouts SET state='verified',payment_id=?,verified_at=CURRENT_TIMESTAMP WHERE id=? AND (payment_id IS NULL OR payment_id=?)").bind(payment.id,intent.id,payment.id).run();
 return json({testOnly:true,testVerified:true,actualPaymentStatus:order.payment_status});
}
