import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { freeCafeBookingTables } from '../lib/cafe-table-manager.ts';
import { createStripePayments } from '../lib/stripe-payment-core.ts';
import { createPinReset } from '../lib/pin-reset.ts';
import { readPinSession, readStaffPinSession } from '../lib/pin-auth-core.ts';
import { createTestSubscriptionOrder, syncTestSubscription } from '../lib/subscription-test.ts';
import { createSubscriptionRedemption } from '../lib/subscription-redemption.ts';
import { openPostgres } from '../server/postgres.mjs';

const origin = 'https://cafe-staging.example';
const secret = 'cashfree-sandbox-fixture-only';
const env = {
  PAYMENT_PROVIDER:'cashfree', PAYMENT_MODE:'test', PAYMENT_LIVE_ENABLED:'false', PUBLIC_TEST_MODE:'false',
  CASHFREE_STAGING_SANDBOX_ENABLED:'true',
  PAYMENT_APP_ORIGIN:origin, CASHFREE_CHECKOUT_API:'orders', CASHFREE_TEST_CLIENT_ID:'TEST-fixture',
  CASHFREE_TEST_CLIENT_SECRET:secret,
};
const enabled = process.env.SELFHOST_DATABASE === 'postgres-staging';
function openFixture(t) {
  assert.equal(process.env.PGDATABASE, 'espressoulster_pg_fixture');
  const db = openPostgres();
  t.after(() => db.close());
  return db;
}

function fakeCashfree() {
  const orders = new Map();
  const fetch = async (url, input) => {
    const address = new URL(url);
    assert.equal(address.origin, 'https://sandbox.cashfree.com');
    assert.equal(input.headers['x-api-version'], '2026-01-01');
    assert.equal(input.headers['x-client-secret'], secret);
    if (input.method === 'POST') {
      const body = JSON.parse(input.body);
      if (orders.has(body.order_id)) return Response.json({code:'order_already_exists'}, {status:409});
      const order = {...body, cf_order_id:String(BigInt('0x'+randomBytes(7).toString('hex'))), order_amount:String(body.order_amount),
        order_status:'ACTIVE', payment_session_id:`session_${randomUUID()}`};
      orders.set(order.order_id, order);
      return Response.json(order);
    }
    const order = orders.get(address.pathname.split('/').at(-1));
    if (!order) return Response.json({code:'order_not_found'}, {status:404});
    if (input.method === 'PATCH') order.order_status = 'TERMINATED';
    return Response.json(order);
  };
  return { orders, fetch };
}

function webhook(app, order, signingKey = secret) {
  const money = {order_id:order.order_id, order_amount:order.order_amount, order_currency:order.order_currency};
  const raw = JSON.stringify({type:'PAYMENT_SUCCESS_WEBHOOK', data:{order:money, payment:{
    payment_status:'SUCCESS', payment_amount:money.order_amount, payment_currency:money.order_currency,
    cf_payment_id:`${order.cf_order_id}7`,
  }}});
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', signingKey).update(timestamp+raw).digest('base64');
  return app.cashfreeWebhook(new Request(`${origin}/webhooks/cashfree`, {method:'POST', headers:{
    'x-webhook-timestamp':timestamp, 'x-webhook-signature':signature,
  }}), raw);
}

async function addCustomer(db) {
  const userId = randomUUID();
  const email = `${userId}@example.test`;
  const profile = {phone:'+919999999991'};
  await db.prepare('INSERT INTO profiles(id,email,name,phone) VALUES(?,?,?,?)').bind(userId,email,'Staging Fixture',profile.phone).run();
  return {userId,email,displayName:'Staging Fixture',profile};
}

test('PostgreSQL Cashfree order records one verified payment across simultaneous callbacks', {skip:!enabled}, async t => {
  const db = openFixture(t);
  const user = await addCustomer(db);
  const gateway = fakeCashfree();
  const app = createStripePayments(db,env,gateway.fetch);
  const product = `cashfree-fixture-${randomUUID()}`;
  await db.batch([
    db.prepare('INSERT INTO categories(id,name) VALUES(?,?)').bind(product,'Payment Fixture'),
    db.prepare("INSERT INTO products(id,name,category_id,price,inventory,available,data) VALUES(?,?,?,1000,5,1,'{}')")
      .bind(product,'Payment Fixture',product),
  ]);
  async function seedDraft(orderId) {
    const id = `PC-${randomUUID().replaceAll('-','').toUpperCase()}`;
    const items = [{productId:product,name:'Payment Fixture',quantity:1,unitPrice:1000,selections:{},instructions:''}];
    const quote = {total:1000,subtotal:1000,tax:0,fee:0,discount:0,currency:'INR',items};
    await db.prepare(`INSERT INTO prepaid_checkouts(id,order_id,user_id,idempotency_key,fulfillment,total,currency,contact,quote,cart_snapshot,stock_holds,provider,mode)
      VALUES(?,?,?,?,'pickup',1000,'INR',?,?,?,'[]','cashfree','test')`).bind(id,orderId,user.userId,randomUUID(),
      JSON.stringify({name:user.displayName,phone:user.profile.phone,email:user.email}),JSON.stringify(quote),JSON.stringify(items)).run();
    return id;
  }
  const route = async (id, action, query = '') => (await app.route(`payments/${id}/${action}`,
    new Request(`${origin}/api/payments/${id}/${action}${query}`, {method:'POST'}),user)).json();
  const orderId = `CH-${randomUUID().slice(0,8).toUpperCase()}`;
  const id = await seedDraft(orderId);
  const session = await route(id,'start');
  assert.equal(session.order_id,id);
  const remote = gateway.orders.get(id);
  assert.equal(Number(remote.order_amount),10);
  assert.equal((await route(id,'verify')).paid,false);
  remote.order_status = 'PAID';
  await assert.rejects(webhook(app,remote,'wrong-secret'), {status:401});
  await assert.rejects(webhook(app,{...remote,order_amount:'9.99'}), {status:409});
  assert.equal(await db.prepare('SELECT id FROM orders WHERE id=?').bind(orderId).first(),null);
  assert.equal((await webhook(app,remote)).status,200);
  await Promise.all([webhook(app,remote),webhook(app,remote),route(id,'verify')]);
  const order = await db.prepare('SELECT payment_status,total FROM orders WHERE id=?').bind(orderId).first();
  assert.deepEqual(order,{payment_status:'paid', total:1000});
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM payments WHERE order_id=?').bind(orderId).first('n'),1);
  assert.equal((await route(id,'verify')).paid,true);
  const cancelledOrder = `CH-${randomUUID().slice(0,8).toUpperCase()}`;
  const cancelled = await seedDraft(cancelledOrder);
  await route(cancelled,'start');
  assert.equal((await route(cancelled,'verify','?cancelled=1')).paid,false);
  assert.equal(await db.prepare('SELECT id FROM orders WHERE id=?').bind(cancelledOrder).first(),null);
});

test('PostgreSQL paid booking allocates a table once and blocks competing bookings, scans and dine-in visits', {skip:!enabled}, async t => {
  const db = openFixture(t);
  const user = await addCustomer(db);
  const gateway = fakeCashfree();
  const app = createStripePayments(db,env,gateway.fetch);
  const date = new Date(Date.now()+10*86400000).toISOString().slice(0,10);
  const input = {date,time:'11:00',endTime:'12:00',guests:2,purpose:'Visit'};
  const checkout = await app.booking.start(new Request(`${origin}/api/table-bookings`,{method:'POST'}),user.userId,input);
  const id = new URL(checkout.redirectUrl,origin).searchParams.get('order');
  const remote = gateway.orders.get(id);
  assert.ok(remote);
  assert.equal(await db.prepare('SELECT status FROM table_bookings WHERE id=?').bind(id).first(),null);
  remote.order_status = 'PAID';
  await Promise.all([webhook(app,remote),webhook(app,remote),app.booking.verifyOwner(id,user.userId,false)]);
  const booking = await db.prepare('SELECT * FROM table_bookings WHERE id=?').bind(id).first();
  assert.equal(booking.status,'pending');
  const hold = await db.prepare("SELECT table_id FROM live_cafe_table_schedule WHERE source_id=? AND kind='hold'").bind(id).first();
  assert.ok(hold);
  await db.prepare("UPDATE table_bookings SET status='confirmed',table_ids=? WHERE id=?").bind(JSON.stringify([hold.table_id]),id).run();
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM booking_notifications WHERE booking_id=?').bind(id).first('n'),1);
  const free = await freeCafeBookingTables(db,booking);
  assert.ok(free.every(table=>table.id!==hold.table_id));
  const target = free[0].id;
  const start = booking.end_at+3600, end = start+3600;
  const claims = ['booking','scan','visit'].map(kind=>db.prepare(`INSERT INTO cafe_table_schedule(table_id,customer_id,kind,start_at,end_at)
    VALUES(?,?,?,?,?)`).bind(target,randomUUID(),kind,start,end).run());
  const results = await Promise.allSettled(claims);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.ok(results.filter(result=>result.status==='rejected').every(result=>/Cafe table conflict/.test(result.reason.message)));
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM live_cafe_table_schedule WHERE table_id=? AND start_at=?').bind(target,start).first('n'),1);
  await db.prepare("INSERT INTO cafe_table_schedule(table_id,customer_id,kind,start_at,end_at) VALUES(?,?,'booking',?,?)")
    .bind(target,randomUUID(),end,end+3600).run();
});

test('PostgreSQL Coffee Pass credits are issued once for the verified purchase', {skip:!enabled}, async t => {
  const db = openFixture(t);
  const user = await addCustomer(db);
  const gateway = fakeCashfree();
  const app = createStripePayments(db,env,gateway.fetch);
  const plan = {id:`pass-fixture-${randomUUID()}`, credits:8};
  await db.prepare('INSERT INTO subscription_catalog(id,name,amount,credits,days,enabled) VALUES(?,?,?,?,?,1)')
    .bind(plan.id,'Fixture Coffee Pass',1000,plan.credits,30).run();
  const id = await createTestSubscriptionOrder(db,user,plan.id,'cashfree_test');
  const start = await app.route(`payments/${id}/start`,new Request(`${origin}/api/payments/${id}/start`,{method:'POST'}),user);
  assert.equal(start.status,200);
  const [remote] = gateway.orders.values();
  const credits = db.prepare('SELECT purchased_credits FROM coffee_subscriptions WHERE user_id=? AND plan_id=?').bind(user.userId,plan.id);
  await syncTestSubscription(db,env);
  assert.deepEqual((await credits.all()).results,[]);
  remote.order_status = 'PAID';
  await Promise.all([webhook(app,remote),webhook(app,remote)]);
  assert.deepEqual((await credits.all()).results,[{purchased_credits:plan.credits}]);
  const redemption = createSubscriptionRedemption(db,{...env,PIN_AUTH_SECRET:'staging-fixture-subscription-secret'});
  const status = await redemption.status(user.userId);
  assert.equal(status.expired,true);
});

test('PostgreSQL preserves customer and staff sessions through the unified WhatsApp OTP flow', {skip:!enabled}, async t => {
  const db = openFixture(t);
  const phone = () => '9'+String(BigInt('0x'+randomBytes(5).toString('hex'))%1000000000n).padStart(9,'0');
  const customerPhone = phone(), staffPhone = phone(), staffId = randomUUID();
  await db.batch([
    db.prepare('INSERT INTO profiles(id,email,name,phone) VALUES(?,?,?,?)').bind(staffId,`${staffId}@example.test`,'Fixture Staff',`+91${staffPhone}`),
    db.prepare('INSERT INTO pin_accounts(phone,user_id,pin_salt,pin_hash) VALUES(?,?,?,?)').bind(`+91${staffPhone}`,staffId,'staging-fixture-salt','staging-fixture-hash'),
  ]);
  const codes = new Map();
  const auth = createPinReset(db,{
    CUSTOMER_AUTH_MODE:'pin', PIN_AUTH_SECRET:'staging-fixture-auth-secret-never-used-live', PIN_AUTH_OTP_ENABLED:'true',
    CUSTOMER_OTP_ONLY:'true', STAFF_OTP_ONLY:'true', STAFF_ONLY_PHONES:staffPhone, STAFF_ORDER_OPERATOR_PHONES:staffPhone,
    OTP_DELIVERY_CHANNEL:'whatsapp', MSG91_AUTH_KEY:'fixture', MSG91_WHATSAPP_NUMBER:'919000000000',
    MSG91_WHATSAPP_TEMPLATE:'fixture', MSG91_WHATSAPP_LANGUAGE:'en',
  }, async (url, options) => {
    assert.equal(new URL(url).hostname,'control.msg91.com');
    const recipient = JSON.parse(options.body).payload.template.to_and_components[0];
    codes.set(recipient.to[0],recipient.components.body_1.value);
    return Response.json({status:'success',request_id:'fixture'});
  });
  const call = (action, input, staff=false) => {
    const path = `auth/pin/access/${action}`;
    const req = new Request(`${origin}/api/${path}`,{method:'POST',headers:{origin,'cf-connecting-ip':'fixture-'+input.phone}});
    return auth(path,req,input,staff);
  };
  const confirm = async (number, staff=false) => {
    const request = await (await call('request',{phone:number},staff)).json();
    assert.equal(request.channel,'whatsapp');
    return call('confirm',{phone:number,challenge:request.challenge,code:codes.get(`91${number}`)},staff);
  };
  const {setup} = await (await confirm(customerPhone)).json();
  const customer = await call('profile',{phone:customerPhone,setup,name:'Fixture Customer',dateOfBirth:'1995-06-15',gender:'female'});
  const profile = await readPinSession(db,customer.headers.get('set-cookie'));
  assert.equal(profile.name,'Fixture Customer');
  assert.equal(profile.phone,`+91${customerPhone}`);
  const staff = await confirm(staffPhone,true);
  assert.equal((await staff.json()).destination,'admin');
  assert.equal((await readStaffPinSession(db,staff.headers.get('set-cookie'),true)).id,staffId);
});
