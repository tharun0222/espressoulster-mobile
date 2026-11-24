import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';import {createSubscriptionRedemption} from '../lib/subscription-redemption.ts';
const env={PUBLIC_TEST_MODE:'true',PAYMENT_MODE:'test',PAYMENT_PROVIDER:'stripe',PIN_AUTH_SECRET:'fixture-only-secret-longer-than-32-characters'};
const itemCodeMigration=readFileSync(new URL('../drizzle/0043_subscription_item_codes.sql',import.meta.url),'utf8');
function fixture(legacy=false){const sql=new DatabaseSync(':memory:');sql.exec(`PRAGMA foreign_keys=ON;CREATE TABLE profiles(id TEXT PRIMARY KEY,phone TEXT);CREATE TABLE orders(id TEXT PRIMARY KEY,user_id TEXT,idempotency_key TEXT UNIQUE,fulfillment TEXT,payment_status TEXT,status TEXT,subtotal INTEGER,tax INTEGER,discount INTEGER,fee INTEGER,total INTEGER,currency TEXT,contact TEXT);CREATE TABLE payments(id TEXT PRIMARY KEY,order_id TEXT,amount INTEGER,method TEXT,verified_by TEXT,created_at TEXT);CREATE TABLE order_events(id TEXT PRIMARY KEY,order_id TEXT,status TEXT,actor TEXT);`+readFileSync(new URL('../drizzle/0006_subscription_tracking.sql',import.meta.url),'utf8')+readFileSync(new URL('../drizzle/0021_subscription_test_purchases.sql',import.meta.url),'utf8')+readFileSync(new URL('../drizzle/0023_monthly_subscription_plan.sql',import.meta.url),'utf8')+readFileSync(new URL('../drizzle/0022_subscription_daily_codes.sql',import.meta.url),'utf8')+readFileSync(new URL('../drizzle/0024_subscription_renewals.sql',import.meta.url),'utf8')+readFileSync(new URL('../drizzle/0029_two_month_subscription.sql',import.meta.url),'utf8')+readFileSync(new URL('../drizzle/0030_subscription_plan_manager.sql',import.meta.url),'utf8')+readFileSync(new URL('../drizzle/0031_subscription_menu_items.sql',import.meta.url),'utf8')+readFileSync(new URL('../drizzle/0033_subscription_plan_daily_codes.sql',import.meta.url),'utf8')+(legacy?'':itemCodeMigration));
 sql.exec("INSERT INTO profiles VALUES('customer','+919999999901');INSERT INTO orders(id,user_id,payment_status,status,total) VALUES('purchase','customer','paid','pending',159900);INSERT INTO payments VALUES('receipt','purchase',159900,'stripe_test','provider_verified_test',CURRENT_TIMESTAMP);");sql.prepare('INSERT INTO coffee_subscriptions(id,user_id,payment_id,total_credits,starts_at,expires_at) VALUES(?,?,?,8,?,?)').run('pass','customer','receipt',new Date(Date.now()-3600000).toISOString(),new Date(Date.now()+86400000).toISOString());
 const d={prepare(q){return {bind(...v){return {async first(){return sql.prepare(q).get(...v)||null},run(){return sql.prepare(q).run(...v)}}}}},async batch(items){sql.exec('BEGIN');try{for(const s of items)s.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};return {sql,d,service:createSubscriptionRedemption(d,env)};}
test('active code is returned on refresh, expires within ten minutes and is stored as a hash',async()=>{const f=fixture(),a=await f.service.generate('customer'),b=await f.service.generate('customer');assert.equal(a.code,b.code);assert.match(a.code,/^\d{6}$/);assert.ok(Date.parse(a.expiresAt)-Date.now()<=600000);assert.ok(Date.parse(a.expiresAt)>Date.now());assert.notEqual(f.sql.prepare('SELECT code_hash FROM subscription_item_codes').get().code_hash,a.code)});
test('one matching code redeems exactly one credit and produces a sandbox-only zero-value receipt',async()=>{const f=fixture(),a=await f.service.generate('customer'),r=await f.service.redeem({phone:'9999999901',code:a.code},'admin');assert.equal(r.creditsUsed,1);assert.equal(r.testOnly,true);assert.equal(f.sql.prepare('SELECT SUM(credits) n FROM coffee_redemptions').get().n,1);assert.equal(f.sql.prepare('SELECT total FROM orders WHERE id=?').get(r.receipt).total,0);assert.notEqual((await f.service.generate('customer')).code,a.code);await assert.rejects(f.service.redeem({phone:'9999999901',code:a.code},'admin'),e=>e.status===409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM coffee_redemptions').get().n,1)});
test('wrong code and wrong customer do not consume credits',async()=>{const f=fixture(),a=await f.service.generate('customer');await assert.rejects(f.service.redeem({phone:'9999999901',code:a.code==='000000'?'000001':'000000'},'admin'));await assert.rejects(f.service.redeem({phone:'9999999902',code:a.code},'admin'));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM coffee_redemptions').get().n,0)});
test('guessing is limited to five attempts per customer per ten minutes',async()=>{const f=fixture(),a=await f.service.generate('customer');for(let i=0;i<5;i++)await assert.rejects(f.service.redeem({phone:'9999999901',code:a.code==='000000'?'000001':'000000'},'admin'));await assert.rejects(f.service.redeem({phone:'9999999901',code:a.code},'admin'),e=>e.status===429)});
test('revoked or expired pass after code issuance cannot be redeemed and transaction leaves no receipt',async()=>{for(const sql of ['UPDATE coffee_subscriptions SET revoked=1',"UPDATE coffee_subscriptions SET expires_at='2000-01-01T00:00:00Z'","UPDATE orders SET payment_status='unpaid' WHERE id='purchase'"]){const f=fixture(),a=await f.service.generate('customer');f.sql.exec(sql);await assert.rejects(f.service.redeem({phone:'9999999901',code:a.code},'admin'),e=>e.status===409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM orders').get().n,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM coffee_redemptions').get().n,0)}});
test('live configuration rejects code generation',async()=>{const f=fixture();await assert.rejects(createSubscriptionRedemption(f.d,{...env,PAYMENT_MODE:'live'}).generate('customer'),e=>e.status===503)});
test('monthly balance is 34 credits and rejects reuse of its own item code',async()=>{const f=fixture();f.sql.exec("UPDATE coffee_subscriptions SET bonus_credits=26,plan_id='monthly';UPDATE orders SET total=600000;UPDATE payments SET amount=600000;");const a=await f.service.generate('customer');await f.service.redeem({phone:'9999999901',code:a.code},'admin');assert.equal(f.sql.prepare('SELECT s.total_credits+s.bonus_credits-SUM(r.credits) AS remaining FROM coffee_subscriptions s JOIN coffee_redemptions r ON r.subscription_id=s.id').get().remaining,33);await assert.rejects(f.service.redeem({phone:'9999999901',code:a.code},'admin'),e=>e.status===409)});
test('menu-item pass rejects unselected items and redeems a purchased eligible item',async()=>{const f=fixture();f.sql.exec(`UPDATE coffee_subscriptions SET item_scope='menu',included_items='[{"id":"food-1","name":"Sandwich"}]' WHERE id='pass'`);const code=await f.service.generate('customer');assert.equal(code.includedItems[0].name,'Sandwich');await assert.rejects(f.service.redeem({phone:'9999999901',code:code.code,productId:'wrong'},'admin'),/included/);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM coffee_redemptions').get().n,0);const result=await f.service.redeem({phone:'9999999901',code:code.code,productId:'food-1'},'admin');assert.equal(result.creditsUsed,1);assert.match(result.message,/Sandwich/)});

test('parallel code generation converges to one outstanding code',async()=>{
 const f=fixture();
 try{
  const codes=await Promise.all(Array.from({length:20},()=>f.service.generate('customer')));
  assert.equal(new Set(codes.map(result=>result.code)).size,1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM subscription_item_codes').get().n,1);
 }finally{f.sql.close()}
});

test('admin preview reveals only the purchased plan and confirms redemption against that plan', async () => {
 const { sql, service } = fixture();
 try {
  sql.exec(`UPDATE coffee_subscriptions SET plan_name='Lunch Pass', item_scope='menu', included_items='[{"id":"food-1","name":"Sandwich"},{"id":"food-2","name":"Toast"}]' WHERE id='pass'`);
  const { code } = await service.generate('customer');
  const credentials = { phone: '9999999901', code };
  const match = await service.preview(credentials);
  assert.deepEqual(match, { subscriptionId: 'pass', planName: 'Lunch Pass' });
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM subscription_item_code_attempts').get().n, 0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM coffee_redemptions').get().n, 0);
  await assert.rejects(service.redeem({ ...credentials, subscriptionId: 'another-pass' }, 'admin'), /does not match/);
  const result = await service.redeem({ ...credentials, subscriptionId: match.subscriptionId }, 'admin');
  assert.equal(result.planName, 'Lunch Pass');
  assert.equal(result.creditsUsed, 1);
  assert.equal(sql.prepare('SELECT SUM(credits) AS n FROM coffee_redemptions WHERE subscription_id=?').get('pass').n, 1);
  await assert.rejects(service.preview(credentials), /already been redeemed/);
 } finally {
  sql.close();
 }
});
test('parallel matching-code redemption claims one item and rolls losing transactions back completely',async()=>{
 const f=fixture();
 try{
  const code=await f.service.generate('customer');
  const results=await Promise.allSettled(Array.from({length:5},()=>f.service.redeem({phone:'9999999901',code:code.code},'admin')));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.ok(results.filter(result=>result.status==='rejected').every(result=>[409,429].includes(result.reason.status)));
  assert.equal(f.sql.prepare('SELECT COALESCE(SUM(credits),0) AS n FROM coffee_redemptions').get().n,1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM orders WHERE id!='purchase'").get().n,1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM order_events').get().n,1);
  assert.equal(f.sql.prepare('SELECT total_credits-(SELECT SUM(credits) FROM coffee_redemptions WHERE subscription_id=coffee_subscriptions.id) AS remaining FROM coffee_subscriptions').get().remaining,7);
 }finally{f.sql.close()}
});


test('two subscriptions redeem independently on the same India day',async()=>{
 const f=fixture();
 f.sql.exec("INSERT INTO orders(id,user_id,payment_status,status,total) VALUES('purchase-2','customer','paid','pending',159900);INSERT INTO payments VALUES('receipt-2','purchase-2',159900,'stripe_test','provider_verified_test',CURRENT_TIMESTAMP);");
 f.sql.prepare('INSERT INTO coffee_subscriptions(id,user_id,payment_id,total_credits,starts_at,expires_at) VALUES(?,?,?,8,?,?)').run('pass-2','customer','receipt-2',new Date(Date.now()-3600000).toISOString(),new Date(Date.now()+86400000).toISOString());
 const first=await f.service.generate('customer','pass');
 const second=await f.service.generate('customer','pass-2');
 assert.notEqual(first.code,second.code);
 assert.equal(second.subscriptionId,'pass-2');
 await f.service.redeem({phone:'9999999901',code:first.code},'admin');
 assert.equal((await f.service.status('customer','pass')).redeemed,true);
 assert.equal((await f.service.status('customer','pass-2')).redeemed,false);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM coffee_redemptions WHERE subscription_id='pass-2'").get().n,0);
 await f.service.redeem({phone:'9999999901',code:second.code},'admin');
 for(const id of ['pass','pass-2'])assert.equal(f.sql.prepare('SELECT SUM(credits) n FROM coffee_redemptions WHERE subscription_id=?').get(id).n,1);
 await assert.rejects(f.service.redeem({phone:'9999999901',code:second.code},'admin'),e=>e.status===409);
 await assert.rejects(f.service.generate('someone-else','pass'),e=>e.status===409);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM orders').get().n,4);
});

test('credits from legacy redemptions survive the migration',async()=>{
 const f=fixture(true);
 f.sql.exec(`
  INSERT INTO orders(id,user_id,payment_status,status,total) VALUES('legacy-redemption','customer','paid','completed',0);
  INSERT INTO coffee_redemptions(id,subscription_id,order_id,credits) VALUES('legacy-use','pass','legacy-redemption',1);
  INSERT INTO subscription_daily_codes(user_id,day,subscription_id,code_hash,expires_at,redeemed_order_id)
  VALUES('customer','2026-10-15','pass','legacy-hash',unixepoch()+3600,'legacy-redemption');
 `);
 f.sql.exec(itemCodeMigration);
 const next=await f.service.generate('customer','pass');
 await f.service.redeem({phone:'9999999901',code:next.code},'admin');
 assert.equal(f.sql.prepare("SELECT SUM(credits) n FROM coffee_redemptions WHERE subscription_id='pass'").get().n,2);
});

test('eight credits can be redeemed consecutively with eight separate codes',async()=>{
 const f=fixture();
 const seen=new Set();
 for(let credit=0;credit<8;credit++){
  const next=await f.service.generate('customer','pass');
  assert.equal(seen.has(next.code),false);
  seen.add(next.code);
  await f.service.redeem({phone:'9999999901',code:next.code},'admin');
  assert.equal((await f.service.status('customer','pass',next.codeId)).redeemed,true);
 }
 assert.equal(f.sql.prepare("SELECT SUM(credits) n FROM coffee_redemptions WHERE subscription_id='pass'").get().n,8);
 await assert.rejects(f.service.generate('customer','pass'),e=>e.status===409);
});

test('an expired code cannot be used and a new code can be issued immediately',async()=>{
 const f=fixture();
 const first=await f.service.generate('customer','pass');
 f.sql.exec("UPDATE subscription_item_codes SET expires_at=unixepoch()-1");
 assert.equal((await f.service.status('customer','pass',first.codeId)).expired,true);
 await assert.rejects(f.service.redeem({phone:'9999999901',code:first.code},'admin'),/expired/);
 const newCode=await f.service.generate('customer','pass');
 assert.notEqual(newCode.code,first.code);
 await f.service.redeem({phone:'9999999901',code:newCode.code},'admin');
 assert.equal(f.sql.prepare("SELECT SUM(credits) n FROM coffee_redemptions").get().n,1);
});
