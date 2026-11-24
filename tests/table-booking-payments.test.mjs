import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createStripeTableBookings} from '../lib/stripe-table-bookings.ts';
import {cafeSeatsForTime,reservedCafeTableIds,dineInTableOptions} from '../lib/cafe-table-manager.ts';
import {validateBooking} from '../lib/table-booking.ts';

function setup(){
 const sql=new DatabaseSync(':memory:');
 for(const migration of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort()){
  sql.exec(readFileSync(new URL('../drizzle/'+migration,import.meta.url),'utf8'));
 }
 sql.exec("INSERT INTO profiles(id,email) VALUES('customer','customer@example.test'),('other','other@example.test')");
 const db={
  prepare(query){return {bind(...args){return {
   async first(){return sql.prepare(query).get(...args);},
   async all(){return {results:sql.prepare(query).all(...args)};},
   run(){return sql.prepare(query).run(...args);},
  };}};},
  async batch(statements){
   sql.exec('BEGIN');
   try { const results=await Promise.all(statements.map(statement=>statement.all()));sql.exec('COMMIT');return results; }
   catch(error){sql.exec('ROLLBACK');throw error;}
  }
 };
 const sessions=new Map();
 async function stripe(path,data){
  if(path==='checkout/sessions'){
   const id='cs_test_booking'+(sessions.size+1);
   assert.equal(data.get('line_items[0][price_data][unit_amount]'),'10000');
   assert.equal(data.get('line_items[0][price_data][currency]'),'inr');
   const row={id,livemode:false,mode:'payment',status:'open',payment_status:'unpaid',
    client_reference_id:data.get('client_reference_id'),metadata:{order_id:data.get('metadata[order_id]')},
    amount_total:10000,currency:'inr',url:'https://checkout.stripe.com/c/pay/'+id};
   sessions.set(id,row);
   return row;
  }
  const [, , id, operation]=path.split('/');
  const session=sessions.get(id);
  assert.ok(session);
  if(operation==='expire')session.status='expired';
  return session;
 }
 const service=createStripeTableBookings(db,{PAYMENT_PROVIDER:'stripe',PUBLIC_TEST_MODE:'true', PAYMENT_MODE:'test',
  PAYMENT_APP_ORIGIN:'http://localhost:5173',STRIPE_TEST_SECRET_KEY:'sk_test_fixture',STRIPE_TEST_WEBHOOK_SECRET:'whsec_fixture'},stripe);
 const req=new Request('http://localhost:5173/api/table-bookings',{method:'POST'});
 const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
 const input={date,time:'11:00',endTime:'12:00',guests:6,purpose:'Visit'};
 return {sql,db,service,req,input,sessions};
}

test('a booking reaches the queue only after matching Stripe payment and staff confirmation generates the notice',async()=>{
 const f=setup();
 try{
  const checkout=await f.service.start(f.req,'customer',f.input);
  const [session]=f.sessions.values();
  const id=session.client_reference_id;
  assert.match(checkout.redirectUrl,/cs_test_booking/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM table_bookings').get().n,0);
  assert.equal((await f.service.start(f.req,'customer',f.input)).redirectUrl,checkout.redirectUrl);
  await assert.rejects(f.service.verifyOwner(id,'other',false),{status:404});
  assert.deepEqual(await f.service.verifyOwner(id,'customer',false),{state:'pending'});
  Object.assign(session,{status:'complete',payment_status:'paid',payment_intent:'pi_testbooking',amount_total:12000});
  await assert.rejects(f.service.verifyOwner(id,'customer',false),{status:409});
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM table_bookings').get().n,0);
  session.amount_total=10000;
  assert.deepEqual(await f.service.webhook(id,session.id,'checkout.session.completed'),{state:'paid',bookingId:id});
  assert.deepEqual(await f.service.verifyOwner(id,'customer',false),{state:'paid',bookingId:id});
  assert.equal(f.sql.prepare('SELECT status FROM table_bookings WHERE id=?').get(id).status,'pending');
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM booking_notifications').get().n,0);
  f.sql.prepare("UPDATE table_bookings SET status='confirmed',table_ids='[\"T02\",\"T06\"]' WHERE id=?").run(id);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM booking_notifications WHERE booking_id=?').get(id).n,1);
 }finally{f.sql.close();}
});

test('dine-in choices and the assignment guard agree on booked and occupied tables',async()=>{
 const f=setup();
 try{
  f.sql.exec(`
   INSERT INTO orders(id,user_id,idempotency_key,fulfillment,status,contact,subtotal,tax,discount,fee,total,currency) VALUES
     ('target','customer','target','dine_in','pending','{}',100,0,0,0,100,'INR'),
     ('seated','other','seated','dine_in','ready','{"table":"T02"}',100,0,0,0,100,'INR'),
     ('same-party','other','same-party','dine_in','pending','{"table":"T02"}',100,0,0,0,100,'INR');
   UPDATE cafe_tables SET enabled=0 WHERE id NOT IN ('T01','T02','T03','T04');
  `);
  const now=Math.floor(Date.now()/1000);
  const reservation=f.sql.prepare("INSERT INTO table_bookings(id,user_id,date,time,guests,purpose,start_at,end_at) VALUES(?,'other',?,?,2,'Visit',?,?)");
  reservation.run('current',f.input.date,'11:00',now-600,now+600);
  reservation.run('future',f.input.date,'11:30',now+1800,now+2400);
  const confirm=f.sql.prepare("UPDATE table_bookings SET status='confirmed',table_ids=json_array(?) WHERE id=?");
  confirm.run('T01','current');
  confirm.run('T03','future');
  assert.deepEqual(await dineInTableOptions(f.db,['target','same-party']),{
   target:['T04'], 'same-party':['T01','T02','T04'],
  });
  const assign=f.sql.prepare(`
   UPDATE orders SET contact=json_set(contact,'$.table',?) WHERE id='target'
  `);
  assert.throws(()=>assign.run('T01'),/Cafe table conflict/);
  assert.throws(()=>assign.run('T02'),/Cafe table conflict/);
  assert.throws(()=>assign.run('T03'),/Cafe table conflict/);
  assert.equal(assign.run('T04').changes,1);
  f.sql.exec("UPDATE orders SET status='completed' WHERE id='seated'");
  assert.deepEqual((await dineInTableOptions(f.db,['target'])).target,['T04']);
  f.sql.exec("UPDATE cafe_table_schedule SET closed_at=unixepoch() WHERE table_id='T02' AND kind='visit'");
  assert.deepEqual((await dineInTableOptions(f.db,['target'])).target,['T02','T04']);
 }finally{f.sql.close();}
});

test('confirmed tables are excluded only during overlapping times and an undersupplied time cannot start checkout',async()=>{
 const f=setup();
 try{
  const {date,time,start_at,end_at}=validateBooking(f.input);
  const overlap={start_at:start_at+60,end_at:end_at-60};
  const tables='["T01","T06"]';
  f.sql.prepare("INSERT INTO table_bookings(id,user_id,date,time,guests,purpose,start_at,end_at) VALUES('r','other',?,?,6,'Visit',?,?)")
   .run(date,time,start_at,end_at);
  f.sql.prepare("UPDATE table_bookings SET status='confirmed',table_ids=? WHERE id='r'").run(tables);
  assert.deepEqual([...reservedCafeTableIds([{id:'r',start_at,end_at,table_ids:tables}],overlap)],['T01','T06']);
  assert.equal(await cafeSeatsForTime(f.db,overlap),44);
  assert.equal(await cafeSeatsForTime(f.db,{start_at:end_at,end_at:end_at+1800}),56);
  f.sql.exec("UPDATE cafe_tables SET enabled=0 WHERE id NOT IN ('T01','T06','T02')");
  await assert.rejects(f.service.start(f.req,'customer',f.input),/not enough free seats/);
  assert.equal(f.sessions.size,0);
 }finally{f.sql.close();}
});

test('an unpaid booking holds seats, and a late verified payment cannot take a reassigned table',async()=>{
 const f=setup();
 try{
  f.sql.exec("UPDATE cafe_tables SET enabled=0 WHERE id<>'T01'");
  await f.service.start(f.req,'customer',f.input);
  const [first]=f.sessions.values();
  await assert.rejects(f.service.start(f.req,'other',f.input),/not enough free seats/);
  f.sql.exec("UPDATE cafe_table_schedule SET expires_at=unixepoch()-1 WHERE kind='hold'");
  await f.service.start(f.req,'other',f.input);
  Object.assign(first,{status:'complete',payment_status:'paid',payment_intent:'pi_latehold'});
  assert.deepEqual(await f.service.webhook(first.client_reference_id,first.id,'checkout.session.completed'),{state:'review'});
  assert.equal(f.sql.prepare("SELECT count(*) AS n FROM live_cafe_table_schedule WHERE table_id='T01'").get().n,1);
 }finally{f.sql.close();}
});
