import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { dispatchAndroidOrders, firebaseOrderSender } from '../server/android-order-push.mjs';
import { registerAndroidPush } from '../lib/android-push-registration.ts';
import { hashTesterToken } from '../lib/tester-auth.ts';
import { staffOtpSessionHash } from '../lib/pin-auth-core.ts';

test('Firebase payload is data-only with the intended role, binding and delivery lifetime', async () => {
  const cases = ['sent','unregistered','retry'];
  const send = firebaseOrderSender('espc-test-fixture', async () => 'fixture-access', async (url, request) => {
    assert.equal(url,'https://fcm.googleapis.com/v1/projects/espc-test-fixture/messages:send');
    assert.equal(request.headers.Authorization,'Bearer fixture-access');
    const {message} = JSON.parse(request.body);
    assert.equal(message.notification,undefined);
    assert.equal(message.token,'fixture-staff-token');
    assert.deepEqual(message.android,{priority:'HIGH',ttl:'600s'});
    assert.equal(message.data.kind,'order');
    assert.equal(message.data.scope,'staff');
    assert.equal(message.data.binding,'fixture-binding');
    assert.equal(message.data.tag,'CH-ABCD0001-staff-received');
    switch(cases.shift()) {
      case 'sent': return Response.json({name:'accepted'});
      case 'unregistered': return Response.json({error:{details:[{errorCode:'UNREGISTERED'}]}},{status:404});
      default: return new Response(null,{status:503});
    }
  });
  const notice = { id:'CH-ABCD0001', tag:'CH-ABCD0001-staff-received', reference:'CH-ABCD0001', title:'New café order', body:'Pickup order is ready for review.' };
  for (const expected of ['sent','unregistered','retry']) {
    assert.equal(await send('fixture-staff-token','fixture-binding','staff',notice,600),expected);
  }
});

test('Android registration rejects invalid payloads and missing sessions before SQL', async () => {
  const db = {prepare(){throw Error('Should not query');}};
  const input = {installation:randomUUID(),binding:randomUUID(),token:'fixture-device-fcm-token'};
  await assert.rejects(registerAndroidPush(db,null,'customer','customer',{...input,token:'bad'}),/Invalid Android/);
  await assert.rejects(registerAndroidPush(db,null,'customer','customer',input),/Sign in on this device/);
});

test('PostgreSQL delivers committed orders to the owner and approved Admin only, including retries and logout', {
  skip:process.env.SELFHOST_DATABASE !== 'postgres-staging',
}, async t => {
  assert.equal(process.env.PGDATABASE,'espressoulster_pg_fixture');
  const db = new pg.Pool({max:3});
  t.after(() => db.end());
  const migration = await readFile(new URL('../server/postgres/android-order-push.sql',import.meta.url),'utf8');
  await db.query(migration);
  const applicationDb = {prepare(text){return {bind(...values){return {async first(){
    let index = 0;
    return (await db.query(text.replace(/\?/g,()=>'$'+(++index)),values)).rows[0] ?? null;
  }};}};}};
  async function subscribe(scope, line) {
    const userId = randomUUID(), phone = '+91' + line, token = randomBytes(32).toString('hex');
    const session = await (scope === 'staff' ? staffOtpSessionHash(token) : hashTesterToken(token));
    await db.query('INSERT INTO profiles(id,email,name) VALUES($1,$2,$3)',[userId,userId+'@example.test','Fixture']);
    await db.query('INSERT INTO pin_accounts(phone,user_id,pin_salt,pin_hash) VALUES($1,$2,$3,$4)',[phone,userId,'fixture-salt','fixture-hash']);
    await db.query('INSERT INTO pin_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[session,userId,Math.floor(Date.now()/1000)+1800]);
    const input = {installation:randomUUID(),binding:randomUUID(),token:'fixture-'+randomUUID()};
    await registerAndroidPush(applicationDb,(scope==='staff'?'espresso_staff_pin=':'espresso_pin=')+token,userId,scope,input);
    return {...input,userId,session};
  }
  const customer = await subscribe('customer','9999999915');
  const other = await subscribe('customer','9999999916');
  const staff = await subscribe('staff','9999999917');
  const editor = await subscribe('staff','9999999918');
  const policy = {STAFF_ONLY_PHONES:'9999999917,9999999918',STAFF_ORDER_OPERATOR_PHONES:'9999999917'};
  function newOrder(key) {
    const order = 'CH-' + randomUUID().slice(0,8).toUpperCase();
    return db.query(`INSERT INTO orders(id,user_id,idempotency_key,fulfillment,subtotal,tax,discount,fee,total,currency,contact)
      VALUES($1,$2,$3,'pickup',100,0,0,0,100,'INR','{}')`,[order,customer.userId,key]).then(()=>order);
  }
  const event = (order,status) => db.query('INSERT INTO order_events(id,order_id,status,actor) VALUES($1,$2,$3,$4)',
    [randomUUID(),order,status,customer.userId]);
  const order = await newOrder(randomUUID());
  await event(order,'pending');
  const subscription = await newOrder('subscription-purchase-'+randomUUID());
  await event(subscription,'pending');
  const sent = [];
  const send = async (token,binding,scope,notice,ttl) => {
    sent.push({token,binding,scope,order:notice.id,status:notice.status,ttl});
    return scope === 'staff' ? 'retry' : 'sent';
  };
  await Promise.all([dispatchAndroidOrders(db,policy,send),dispatchAndroidOrders(db,policy,send)]);
  assert.deepEqual(sent.map(({token})=>token).sort(),[customer.token,staff.token].sort());
  assert.ok(sent.every(item=>item.order===order&&item.status==='pending'));
  assert.equal(sent.find(item=>item.scope==='staff').binding,staff.binding);
  assert.ok(sent.find(item=>item.scope==='staff').ttl<=600);
  assert.ok(sent.every(item=>item.token!==other.token&&item.token!==editor.token));
  assert.equal(Number((await db.query('SELECT count(*) FROM android_push_deliveries')).rows[0].count),1);
  await db.query("UPDATE android_push_deliveries SET next_attempt=now()");
  await dispatchAndroidOrders(db,policy,async (token) => {
    assert.equal(token,staff.token);
    return 'unregistered';
  });
  await event(order,'ready');
  const updates = [];
  await dispatchAndroidOrders(db,policy,async (token,_binding,scope,notice)=>{
    updates.push([token,scope,notice.status]);
    return 'sent';
  });
  assert.deepEqual(updates,[[customer.token,'customer','ready']]);
  await event(order,'completed');
  await db.query('DELETE FROM pin_sessions WHERE token_hash=$1',[customer.session]);
  await dispatchAndroidOrders(db,policy,async()=>assert.fail('The signed-out device was notified'));
  assert.equal(Number((await db.query('SELECT count(*) FROM android_push_deliveries')).rows[0].count),0);
});
