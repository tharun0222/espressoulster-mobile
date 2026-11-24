import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import {openDatabase,migrateDatabase} from '../server/database.mjs';
import {createStripePayments} from '../lib/stripe-payment-core.ts';
import {createTestSubscriptionOrder} from '../lib/subscription-test.ts';

const origin='https://cafe.example';
const env={PAYMENT_PROVIDER:'cashfree',PAYMENT_MODE:'live',PAYMENT_LIVE_ENABLED:'true',PUBLIC_TEST_MODE:'false',
 PAYMENT_APP_ORIGIN:origin,CASHFREE_CHECKOUT_API:'orders',CASHFREE_LIVE_CLIENT_ID:'fixture-production',CASHFREE_LIVE_CLIENT_SECRET:'fixture-production-secret'};
const customer={userId:'customer',displayName:'Customer',email:'customer@example.test',profile:{phone:'+919999999999'}};
const pc='PC-11111111111141118111111111111111';
function fixture(t,overrides={}){
 const settings={...env,...overrides};
 const db=openDatabase(':memory:');t.after(()=>db.close());migrateDatabase(db,path.resolve('drizzle'));
 db.sql.exec(`INSERT INTO profiles(id,email,name,phone) VALUES('customer','customer@example.test','Customer','+919999999999'),('other','other@example.test','Other','+919999999998');
 INSERT INTO settings VALUES('store','{"tableBookingFeePaise":100}');
 INSERT INTO categories(id,name) VALUES('coffee','Coffee');
 INSERT INTO products(id,name,category_id,price,inventory,available,data) VALUES('latte','Latte','coffee',100,5,1,'{}');
 UPDATE subscription_catalog SET amount=100;`);
 const orders=new Map();let counter=1000,terminating=false;
 const send=async(url,init)=>{
  assert.equal(init.redirect,'manual');assert.equal(init.headers['x-client-secret'],(settings.PAYMENT_MODE==='test'?settings.CASHFREE_TEST_CLIENT_SECRET:settings.CASHFREE_LIVE_CLIENT_SECRET));
  if(init.method==='POST')assert.match(init.headers['x-idempotency-key'],/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert.ok(url.startsWith((settings.PAYMENT_MODE==='test'?'https://sandbox.cashfree.com':'https://api.cashfree.com')+'/pg/orders'));
  assert.equal(init.headers['x-api-version'],'2026-01-01');
  const id=new URL(url).pathname.split('/')[3];
  if(init.method==='POST'){
   const body=JSON.parse(init.body);
   const defaultCallback=settings.CASHFREE_STAGING_SANDBOX_ENABLED==='true' ? undefined : origin+'/api/payments/cashfree/webhook';
   assert.equal(body.order_meta.notify_url,settings.CASHFREE_NOTIFY_URL||defaultCallback);
   if(orders.has(body.order_id))return Response.json({code:'order_already_exists'},{status:409});
   const order={...body,cf_order_id:String(++counter),order_status:'ACTIVE',order_amount:String(body.order_amount),payment_session_id:'session_'+String(counter).padEnd(40,'x')};
   orders.set(body.order_id,order);return Response.json(order);
  }
  const order=orders.get(id);if(!order)return Response.json({code:'order_not_found'},{status:404});
  if(init.method==='PATCH'){
   assert.deepEqual(JSON.parse(init.body),{order_status:'TERMINATED'});
   order.order_status=terminating?'TERMINATION_REQUESTED':'TERMINATED';
  }
  return Response.json(order);
 };
 const app=createStripePayments(db,settings,send);
 const req=(route,method='POST')=>new Request(origin+'/api/payments/'+route,{method});
 const route=async(route,method='POST',user=customer)=>(await app.route('payments/'+route,req(route,method),user)).json();
 async function webhook(order,secret=(settings.PAYMENT_MODE==='test'?settings.CASHFREE_TEST_CLIENT_SECRET:settings.CASHFREE_LIVE_CLIENT_SECRET)){
  const raw=JSON.stringify({type:'PAYMENT_SUCCESS_WEBHOOK',data:{order:{order_id:order.order_id,order_amount:order.order_amount,order_currency:order.order_currency},payment:{payment_status:'SUCCESS',payment_amount:order.order_amount,payment_currency:order.order_currency,cf_payment_id:order.cf_order_id+'9'}}});
  const stamp=String(Date.now());const signature=createHmac('sha256',secret).update(stamp+raw).digest('base64');
  return (await app.cashfreeWebhook(new Request(origin+'/api/payments/cashfree/webhook',{method:'POST',headers:{'x-webhook-timestamp':stamp,'x-webhook-signature':signature}}),raw)).json();
 }
 function seedOrder(total=100){
  const cart=JSON.stringify([{productId:'latte',quantity:1}]);
  const quote={total,subtotal:total,tax:0,fee:0,discount:0,currency:'INR',items:[{productId:'latte',name:'Latte',quantity:1,unitPrice:total,selections:{},instructions:''}]};
  db.sql.prepare(`INSERT INTO prepaid_checkouts(id,order_id,user_id,idempotency_key,fulfillment,total,currency,contact,quote,cart_snapshot,stock_holds,provider,mode)
   VALUES(?,'CH-111ABCDE','customer','order-key','pickup',?,'INR',?,?,?,'[]','cashfree',?)`).run(pc,total,JSON.stringify({name:'Customer',phone:'+919999999999',email:'customer@example.test'}),JSON.stringify(quote),cart,settings.PAYMENT_MODE);
 }
 return{db,app,route,req,orders,webhook,seedOrder,setTerminating:value=>{terminating=value;}};
}

test('public staging enables only the Cashfree sandbox and uses test contact data without a default webhook',async t=>{
 const f=fixture(t,{PAYMENT_MODE:'test',PAYMENT_LIVE_ENABLED:'false',PUBLIC_TEST_MODE:'false',
  CASHFREE_STAGING_SANDBOX_ENABLED:'true',CASHFREE_TEST_CLIENT_ID:'TEST-fixture',CASHFREE_TEST_CLIENT_SECRET:'sandbox-fixture'});
 f.seedOrder();
 assert.deepEqual(await f.route('config','GET'),{enabled:true,provider:'cashfree',mode:'test',minimumAmount:100});
 await f.route(pc+'/start');
 const order=f.orders.get(pc);
 assert.equal(order.customer_details.customer_name,'Espressoulster Test Customer');
 assert.equal(order.customer_details.customer_phone,'9999999999');
 assert.equal('notify_url' in order.order_meta,false);
 assert.equal((await f.route(pc+'/verify')).paid,false);
 order.order_status='PAID';
 assert.equal((await f.route(pc+'/verify')).paid,true);
});

test('standard Cashfree ₹1 order uses an owner-only SDK session and verifies money before placing one café order',async t=>{
 const f=fixture(t);f.seedOrder();
 const started=await f.route(pc+'/start');assert.equal(started.redirectUrl,'/cashfree-checkout?order='+pc);
 assert.equal(f.orders.size,1);await f.route(pc+'/start');assert.equal(f.orders.size,1);
 await assert.rejects(f.route(pc+'/session','GET',{userId:'other'}),{status:404});
 const session=await f.route(pc+'/session','GET');assert.equal(session.mode,'live');assert.match(session.paymentSessionId,/^session_/);
 const remote=f.orders.get(pc);
 await f.webhook(remote);assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM orders').get().n,0);
 await assert.rejects(f.webhook(remote,'wrong-secret'),{status:401});
 remote.order_status='PAID';remote.order_amount='1.01';await assert.rejects(f.webhook(remote),{status:409});
 remote.order_amount='1.00';await f.webhook(remote);await f.webhook(remote);
 assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM orders').get().n,1);
 assert.deepEqual({...f.db.sql.prepare('SELECT amount,method,verified_by FROM payments').get()},{amount:100,method:'cashfree',verified_by:'provider_verified'});
 assert.equal((await f.route(pc+'/verify')).paid,true);
});

test('standard Cashfree ₹1 Coffee Pass activates purchased credits once and never on an unsigned or pending callback',async t=>{
 const f=fixture(t),purchase=await createTestSubscriptionOrder(f.db,customer,'monthly','cashfree');
 await f.route(purchase+'/start');
 const remote=[...f.orders.values()][0];assert.match(remote.order_id,/^CH-/);
 const session=await f.route(purchase+'/session','GET');assert.equal(session.state,'ready');
 await f.webhook(remote);assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM coffee_subscriptions').get().n,0);
 remote.order_status='PAID';await f.webhook(remote);await f.webhook(remote);
 const pass=f.db.sql.prepare('SELECT purchased_credits FROM coffee_subscriptions').get();assert.equal(pass.purchased_credits,34);
 assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM coffee_subscriptions').get().n,1);
});

test('standard Cashfree ₹1 booking verifies its own fee and termination requests never prematurely release pending payments',async t=>{
 const f=fixture(t),date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
 const booking=await f.app.booking.start(new Request(origin+'/api/table-bookings',{method:'POST'}),customer.userId,{date,time:'11:00',endTime:'12:00',guests:2,purpose:'Visit'});
 const bookingId=new URL(booking.redirectUrl,origin).searchParams.get('order');
 const remote=f.orders.get(bookingId);assert.ok(remote);assert.equal(remote.order_amount,'1');
 assert.equal((await f.route(bookingId+'/session','GET')).state,'ready');
 f.setTerminating(true);
 const pending=await f.app.booking.verifyOwner(bookingId,customer.userId,true);
 assert.equal(pending.state,'pending');assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM table_bookings').get().n,0);
 remote.order_status='PAID';await f.webhook(remote);await f.webhook(remote);
 assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS n FROM table_bookings').get().n,1);
 assert.equal(f.db.sql.prepare('SELECT payment_reference FROM table_booking_payments WHERE id=?').get(bookingId).payment_reference,remote.cf_order_id);
});

const sandboxEnv={PAYMENT_MODE:'test',PAYMENT_LIVE_ENABLED:'false',PUBLIC_TEST_MODE:'true',CASHFREE_TEST_CLIENT_ID:'TEST-fixture',CASHFREE_TEST_CLIENT_SECRET:'test-secret-fixture'};
function successEvent(remote){return {type:'PAYMENT_SUCCESS_WEBHOOK',data:{order:{order_id:remote.order_id,order_amount:remote.order_amount,order_currency:remote.order_currency},payment:{cf_payment_id:remote.cf_order_id+'9',payment_status:'SUCCESS',payment_amount:remote.order_amount,payment_currency:remote.order_currency}}};}
async function deliver(f,event,{secret=sandboxEnv.CASHFREE_TEST_CLIENT_SECRET,mutateRaw=false}={}){
 const raw=JSON.stringify(event),timestamp=String(Date.now());
 const signature=createHmac('sha256',secret).update(timestamp+raw).digest('base64');
 return f.app.cashfreeWebhook(new Request(origin+'/webhooks/cashfree',{method:'POST',headers:{'x-webhook-timestamp':timestamp,'x-webhook-signature':signature}}),mutateRaw?raw+' ':raw);
}

test('₹10 sandbox uses the saved total and returns SDK credentials only to its owner',async t=>{
 const f=fixture(t,sandboxEnv);f.seedOrder(1000);
 const start=await f.route(pc+'/start');
 assert.equal(start.order_id,pc);assert.match(start.payment_session_id,/^session_/);
 assert.equal(f.orders.get(pc).order_amount,'10');
 assert.equal(f.db.sql.prepare('SELECT cashfree_order_id FROM prepaid_checkouts WHERE id=?').get(pc).cashfree_order_id,pc);
 await assert.rejects(f.route(pc+'/session','GET',{userId:'other'}),{status:404});
 const remote=f.orders.get(pc);remote.order_status='PAID';
 const verified=await f.route(pc+'/verify');assert.equal(verified.paid,true);
 assert.equal(f.db.sql.prepare('SELECT amount FROM payments').get().amount,1000);
 assert.equal(f.db.sql.prepare('SELECT payment_status FROM orders').get().payment_status,'paid');
 assert.equal((await f.route(pc+'/verify')).paid,true);
 assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM payments').get().n,1);
});

test('fresh cancelled and failed sandbox checkout never create paid café orders',async t=>{
 const f=fixture(t,sandboxEnv);f.seedOrder(1000);await f.route(pc+'/start');
 const event=successEvent(f.orders.get(pc));event.type='PAYMENT_FAILED_WEBHOOK';event.data.payment.payment_status='FAILED';
 assert.equal((await deliver(f,event)).status,200);
 assert.equal((await f.route(pc+'/verify')).paid,false);
 const cancelled=await (await f.app.route('payments/'+pc+'/verify',new Request(origin+'/api/payments/'+pc+'/verify?cancelled=1',{method:'POST'}),customer)).json();
 assert.equal(cancelled.paid,false);assert.equal(cancelled.providerState,'EXPIRED');
 assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
 assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM payments').get().n,0);
});

test('₹10 webhook alone finalizes once; concurrent app verification and duplicate delivery do not fulfill twice',async t=>{
 const f=fixture(t,sandboxEnv);f.seedOrder(1000);await f.route(pc+'/start');
 const remote=f.orders.get(pc);remote.order_status='PAID';
 assert.equal((await deliver(f,successEvent(remote))).status,200);
 assert.equal(f.db.sql.prepare('SELECT payment_status FROM orders').get().payment_status,'paid');
 await Promise.all([deliver(f,successEvent(remote)),deliver(f,successEvent(remote)),f.route(pc+'/verify')]);
 assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM orders').get().n,1);
 assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM payments').get().n,1);
 assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM cashfree_webhook_receipts').get().n,1);
});

test('bad signature, modified raw bytes and mismatched webhook money leave the order unpaid',async t=>{
 const f=fixture(t,sandboxEnv);f.seedOrder(1000);await f.route(pc+'/start');
 const remote=f.orders.get(pc);remote.order_status='PAID';
 await assert.rejects(deliver(f,successEvent(remote),{secret:'wrong-key'}),{status:401});
 await assert.rejects(deliver(f,successEvent(remote),{mutateRaw:true}),{status:401});
 for(const patch of [{payment_amount:9.99},{payment_currency:'USD'}]){
  const event=successEvent(remote);Object.assign(event.data.payment,patch);
  await assert.rejects(deliver(f,event),{status:409});
 }
 const wrongTotal=successEvent(remote);wrongTotal.data.order.order_amount=11;
 await assert.rejects(deliver(f,wrongTotal),{status:409});
 assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
 assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM payments').get().n,0);
 assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM cashfree_webhook_receipts').get().n,0);
});

test('a signed success event cannot override a mismatched Get Order response',async t=>{
 const f=fixture(t,sandboxEnv);f.seedOrder(1000);await f.route(pc+'/start');
 const remote=f.orders.get(pc),event=successEvent(remote);remote.order_status='PAID';remote.order_currency='USD';
 await assert.rejects(deliver(f,event),{status:409});
 assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
});

test('fresh sandbox orders carry the explicit HTTPS ngrok webhook URL',async t=>{
 const notify='https://espresso.example.ngrok-free.dev/webhooks/cashfree';
 const f=fixture(t,{...sandboxEnv,CASHFREE_NOTIFY_URL:notify});f.seedOrder(1000);await f.route(pc+'/start');
 assert.equal(f.orders.get(pc).order_meta.notify_url,notify);
 const invalid=fixture(t,{...sandboxEnv,CASHFREE_NOTIFY_URL:'http://untrusted.example/webhooks/cashfree'});invalid.seedOrder(1000);
 await assert.rejects(invalid.route(pc+'/start'),{status:503});assert.equal(invalid.orders.size,0);
});

test('non-success webhook does not fulfill an order even if Get Order later says PAID',async t=>{
 const f=fixture(t,sandboxEnv);f.seedOrder(1000);await f.route(pc+'/start');
 const remote=f.orders.get(pc);remote.order_status='PAID';
 const event=successEvent(remote);event.type='PAYMENT_USER_DROPPED_WEBHOOK';event.data.payment.payment_status='USER_DROPPED';
 assert.equal((await deliver(f,event)).status,200);
 assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
 assert.equal((await deliver(f,successEvent(remote))).status,200);
 assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM orders').get().n,1);
});
