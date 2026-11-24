import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { openDatabase, migrateDatabase } from '../server/database.mjs';
import { openPostgres } from '../server/postgres.mjs';
import { passwordHash } from '../lib/admin-password.ts';

test('built self-hosted app supports sign-in, ₹1 quote and ordering while rejecting cross-origin requests', { timeout: 30000 }, async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'cafe-http-'));
  const postgres = process.env.SELFHOST_DATABASE === 'postgres-staging';
  if (postgres) assert.equal(process.env.PGDATABASE, 'espressoulster_pg_fixture');
  const db = postgres ? openPostgres() : openDatabase(path.join(directory, 'cafe.sqlite'));
  if (!postgres) migrateDatabase(db, path.resolve('drizzle'));
  const id = `http-fixture-${crypto.randomUUID()}`;
  const phone = '9' + String(BigInt('0x' + randomBytes(5).toString('hex')) % 1000000000n).padStart(9, '0');
  try {
    await db.batch([
      db.prepare(`INSERT INTO settings(id,data) VALUES('store','{"tableBookingFeePaise":100}') ON CONFLICT(id) DO UPDATE SET data=excluded.data`),
      db.prepare('INSERT INTO categories(id,name) VALUES(?,?)').bind(id, 'Fixture Coffee'),
      db.prepare('INSERT INTO products(id,name,category_id,price,inventory,available,data) VALUES(?,?,?,?,20,1,?)')
        .bind(id, 'Fixture Latte', id, 100, JSON.stringify({id, name:'Fixture Latte', categoryId:id})),
    ]);
  } finally { await db.close(); }
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const adminPassword = randomBytes(24).toString('hex');
  const adminSalt = randomBytes(24).toString('hex');
  const adminHash = await passwordHash(adminPassword, adminSalt);
  const child = spawn(process.execPath, ['scripts/selfhost-server.mjs'], { stdio: ['ignore','pipe','pipe'], env: {
    ...process.env, NODE_ENV: 'production', APP_RUNTIME: 'selfhost', SELFHOST_HOST: '127.0.0.1', SELFHOST_PORT: String(port),
    SELFHOST_DATA_DIR: directory, SELFHOST_TLS_CERT: '', SELFHOST_TLS_KEY: '', PAYMENT_APP_ORIGIN: origin,
    PAYMENT_PROVIDER: 'disabled', PAYMENT_MODE: 'disabled', PAYMENT_LIVE_ENABLED: 'false', PUBLIC_TEST_MODE: 'false',
    CUSTOMER_AUTH_MODE: 'pin', CUSTOMER_OTP_ONLY: 'false', PIN_AUTH_OTP_ENABLED: 'false', PIN_AUTH_SECRET: randomBytes(32).toString('hex'),
    CASHFREE_LIVE_CLIENT_ID: '', CASHFREE_LIVE_CLIENT_SECRET: '', MSG91_AUTH_KEY: '',
    STAFF_PANEL_PHONES: '', STAFF_ONLY_PHONES: '', STAFF_ORDER_OPERATOR_PHONE: '', STAFF_ORDER_OPERATOR_PHONES: '', STAFF_LOCAL_PREVIEW: 'false',
    ADMIN_ANDROID_ONLY: 'false', ADMIN_PASSWORD_LOGIN_ONLY: 'true', STAFF_OTP_ONLY: 'false', STAFF_DEVICE_POLICY:'attestation',
    ADMIN_LOGIN_USERNAME: 'fixture-admin', ADMIN_PASSWORD_SALT: adminSalt, ADMIN_PASSWORD_HASH: adminHash,
  } });
  let diagnostic = '';
  const capture = data => { diagnostic = (diagnostic + data.toString()).slice(-3000); };
  child.stdout.on('data', capture); child.stderr.on('data', capture);
  let cookie = '';
  const feeds = [];
  async function request(route, input, extraHeaders = {}, method = input === undefined ? 'GET' : 'POST') {
    return fetch(origin + '/api/' + route, { method,
      headers: { origin, 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...extraHeaders },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
  }
  async function feed(route, session) {
    const controller = new AbortController();
    feeds.push(controller);
    const response = await fetch(origin+'/api/'+route,{headers:{cookie:session,accept:'text/event-stream'},signal:controller.signal});
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type')||'',/text\/event-stream/);
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffered = '';
    return async function expectChunk(text) {
      const timeout = setTimeout(()=>controller.abort(),5000);
      try {
        while (!buffered.includes(text)) {
          const part = await reader.read();
          assert.equal(part.done,false,'The update stream closed before '+text);
          buffered += decoder.decode(part.value,{stream:true});
        }
        buffered = buffered.slice(buffered.indexOf(text)+text.length);
      } finally { clearTimeout(timeout); }
    };
  }
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Backend exited: ' + diagnostic);
      try { ready = (await fetch(origin + '/api/health')).ok; } catch { /* Starting. */ }
      if (ready) break;
      await delay(100);
    }
    assert.ok(ready, 'Backend did not start: ' + diagnostic);
    const compactBootstrap = await request('bootstrap', undefined, {'Accept-Encoding':'gzip'});
    const plainBootstrap = await request('bootstrap', undefined, {'Accept-Encoding':'gzip;q=0, *;q=1'});
    assert.equal(compactBootstrap.headers.get('content-encoding'), 'gzip');
    assert.equal(plainBootstrap.headers.get('content-encoding'), null);
    assert.match(compactBootstrap.headers.get('vary') || '', /accept-encoding/i);
    assert.equal(compactBootstrap.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await compactBootstrap.json(), await plainBootstrap.json());
    assert.equal((await request('quote', {})).status, 401);
    assert.equal((await request('order-notifications/device')).status, 401);
    assert.equal((await request('quote', {}, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await request('payments/config', undefined, { 'oai-authenticated-user-id':'forged', 'oai-authenticated-user-email':'forged@example.test' })).status, 401);
    const signup = await request('auth/pin/register', { name: 'Local Backend QA', phone, pin: '246810', confirmPin: '246810', dateOfBirth: '1995-06-15', gender: 'male' });
    assert.equal(signup.status, 200, await signup.clone().text());
    cookie = signup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    assert.ok(cookie.includes('espresso_pin='));
    const payment = await request('payments/config');
    assert.deepEqual(await payment.json(), { enabled:false, provider:null });
    const items = [{productId:id,quantity:1}];
    const priced = await request('quote', { items, fulfillment:'pickup', code:'' });
    assert.equal(priced.status, 200, await priced.clone().text());
    assert.equal((await priced.json()).total, 100);
    const booking = await request('table-bookings');
    assert.equal(booking.status, 200);
    const bookingConfig = await booking.json();
    assert.equal(bookingConfig.bookingFeePaise, 100);
    assert.equal(bookingConfig.canBookOnline, false);
    const plans = await request('subscriptions/config');
    assert.equal((await plans.json()).enabled, false);
    const removedSdk = await fetch(origin + '/cashfree-checkout');
    assert.equal(removedSdk.status, 404);
    const blocked = await request('payments/CH-12345678/start', {});
    assert.equal(blocked.status, 503);
    assert.equal((await (await request('orders')).json()).orders.length, 0);
    const placed = await request('orders', { items, fulfillment:'pickup', code:'', paymentMethod:'pay_at_pickup', expectedTotal:100,
      idempotencyKey: randomBytes(16).toString('hex'), contact:{name:'Local Backend QA',phone} });
    assert.equal(placed.status, 201, await placed.clone().text());
    const placedOrder = (await placed.json()).id;
    assert.match(placedOrder, /^CH-/);
    const orders = await request('orders');
    assert.equal((await orders.json()).orders.length, 1);
    assert.equal((await request('admin/overview')).status, 403);
    assert.equal((await request('admin/order-alerts?view=device')).status, 403);
    const customerAlerts = async () => {
      const response = await request('order-notifications/device');
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return (await response.json()).notices;
    };
    assert.deepEqual((await customerAlerts()).map(({id,status})=>[id,status]), [[placedOrder,'pending']]);
    const adminLogin = await request('auth/admin/login', {username:'fixture-admin',password:adminPassword});
    assert.equal(adminLogin.status, 200, await adminLogin.clone().text());
    const adminCookie = adminLogin.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const admin = (route, data, method = data === undefined ? 'GET' : 'POST') => fetch(origin + '/api/admin/' + route, {
      method, headers:{origin,cookie:adminCookie,'Content-Type':'application/json'},
      body:data === undefined ? undefined : JSON.stringify(data),
    });
    const staffAlerts = await admin('order-alerts?view=device');
    assert.equal(staffAlerts.status, 200, await staffAlerts.clone().text());
    const staffNotice = (await staffAlerts.json()).notices.find(notice=>notice.id===placedOrder);
    assert.equal(staffNotice.title, 'New café order');
    assert.match(staffNotice.body, /Pickup/);
    assert.equal(Object.hasOwn(staffNotice, 'contact'), false);
    if (postgres && process.env.SELFHOST_LIVE_UPDATES === 'true') {
      const [customerEvents, adminEvents] = await Promise.all([feed('live-updates',cookie),feed('admin/live-updates',adminCookie)]);
      await Promise.all([customerEvents(': connected'),adminEvents(': connected')]);
      const liveMessage = {message:'Fixture live chat.',requestId:crypto.randomUUID()};
      assert.equal((await request('orders/'+placedOrder+'/chat',liveMessage)).status,201);
      await Promise.all([customerEvents('data: chat'),adminEvents('data: chat')]);
      const updated = await admin('orders/'+placedOrder,{status:'confirmed'},'PATCH');
      assert.equal(updated.status,200,await updated.clone().text());
      await Promise.all([customerEvents('data: orders'),adminEvents('data: orders')]);
      for (const controller of feeds) controller.abort();
      console.log('Verified concurrent customer and Admin streams receive chat and order changes.');
    }
    assert.equal((await admin('overview')).status, 200);
    for (const status of postgres && process.env.SELFHOST_LIVE_UPDATES === 'true' ? ['preparing','ready'] : ['confirmed','preparing','ready']) {
      const update = await admin('orders/'+placedOrder,{status},'PATCH');
      assert.equal(update.status, 200, await update.clone().text());
    }
    assert.equal((await admin('orders/'+placedOrder,{status:'completed'},'PATCH')).status,409);
    const messageId = randomBytes(16).toString('hex');
    const chat = {message:'Please let me know when ready.',requestId:crypto.randomUUID()};
    assert.equal((await request('orders/'+placedOrder+'/chat',chat)).status,201);
    assert.equal((await request('orders/'+placedOrder+'/chat',chat)).status,201);
    const staffMessages = await (await admin('orders/'+placedOrder+'/chat')).json();
    assert.equal(staffMessages.messages.filter(message=>message.message===chat.message).length,1);
    assert.equal(staffMessages.messages.at(-1).role,'customer');
    assert.equal((await admin('orders/'+placedOrder+'/chat',{message:'Your order is ready.',requestId:crypto.randomUUID()})).status,201);
    const customerMessages = await (await request('orders/'+placedOrder+'/chat')).json();
    assert.equal(customerMessages.messages.length,staffMessages.messages.length+1);
    assert.equal(customerMessages.messages.at(-1).role,'staff');
    const collected = await admin('payments/'+placedOrder,{collection_method:'cash',reference:messageId});
    assert.equal(collected.status,200,await collected.clone().text());
    assert.equal((await admin('payments/'+placedOrder,{collection_method:'cash',reference:messageId})).status,409);
    assert.equal((await admin('orders/'+placedOrder,{status:'completed'},'PATCH')).status,200);
    const finished = (await (await request('orders')).json()).orders[0];
    assert.equal(finished.status,'completed');
    assert.equal(finished.payment_status,'paid');
    const lifecycle = (await customerAlerts()).filter(notice=>notice.id===placedOrder);
    assert.deepEqual(lifecycle.map(notice=>notice.status), ['pending','confirmed','preparing','ready','completed']);
    assert.equal(new Set(lifecycle.map(notice=>notice.tag)).size, 5);
    const dineIn = await request('orders',{items,fulfillment:'dine_in',paymentMethod:'pay_at_counter',expectedTotal:100,
      idempotencyKey:crypto.randomUUID(),contact:{name:'Local Backend QA',phone}});
    assert.equal(dineIn.status,201,await dineIn.clone().text());
    const dineId=(await dineIn.json()).id;
    assert.equal((await admin('orders/'+dineId,{status:'confirmed'},'PATCH')).status,409);
    const options=await(await admin('orders/table-options?order='+dineId)).json();
    const table=options.tables[dineId][0];
    assert.ok(table,'Available table required in isolated fixture');
    const assigned=await admin('orders/'+dineId,{status:'confirmed',table},'PATCH');
    assert.equal(assigned.status,200,await assigned.clone().text());
    const customerDine=(await(await request('orders')).json()).orders.find(order=>order.id===dineId);
    assert.equal(customerDine.contact.table,table);
    assert.equal(customerDine.status,'confirmed');
    assert.match((await customerAlerts()).find(notice=>notice.id===dineId&&notice.status==='confirmed').body, new RegExp(`Table ${table}\\.`));
    const tableSchedule = await admin('table-bookings');
    assert.equal(tableSchedule.status,200,await tableSchedule.clone().text());
    const {occupied} = await tableSchedule.json();
    const visit = occupied.find(allocation=>allocation.id===dineId);
    assert.deepEqual(JSON.parse(visit.table_ids),[table]);
    assert.equal((await admin('order-intake',{acceptingOrders:false},'PUT')).status,200);
    assert.equal((await(await request('cafe/order-intake')).json()).acceptingOrders,false);
    const paused=await request('orders',{items,fulfillment:'pickup',paymentMethod:'pay_at_pickup',expectedTotal:100,
      idempotencyKey:crypto.randomUUID(),contact:{name:'Local Backend QA',phone}});
    assert.equal(paused.status,409);
    assert.equal((await admin('order-intake',{acceptingOrders:true},'PUT')).status,200);
    assert.equal((await(await request('cafe/order-intake')).json()).acceptingOrders,true);
    const repeatedKey = crypto.randomUUID();
    const orderPayload = key => ({items,fulfillment:'pickup',paymentMethod:'pay_at_pickup',expectedTotal:100,
      idempotencyKey:key,contact:{name:'Local Backend QA',phone}});
    const retries = await Promise.all(Array.from({length:4},() => request('orders',orderPayload(repeatedKey))));
    assert.ok(retries.every(response => response.ok));
    const repeats = await Promise.all(retries.map(response=>response.json()));
    assert.equal(new Set(repeats.map(order=>order.id)).size,1);
    const simultaneous = await Promise.all(Array.from({length:4},() => request('orders',orderPayload(crypto.randomUUID()))));
    assert.ok(simultaneous.every(response=>response.status===201));
    const ordersAtOnce = await Promise.all(simultaneous.map(response=>response.json()));
    assert.equal(new Set(ordersAtOnce.map(order=>order.order_number)).size,4);

    async function jsonAt(responsePromise, status = 200) {
      const response = await responsePromise;
      assert.equal(response.status, status, `${response.url}: ${await response.clone().text()}`);
      return response.json();
    }

    const address = await jsonAt(request('addresses', {label:'Home',address:'Fixture address',location:{latitude:12.93,longitude:77.63}}), 201);
    assert.deepEqual((await jsonAt(request('addresses'))).addresses, [address]);
    await jsonAt(request('addresses/'+address.id, undefined, {}, 'DELETE'));
    assert.deepEqual((await jsonAt(request('addresses'))).addresses, []);
    await jsonAt(request('favorites', {productId:id}));
    assert.deepEqual((await jsonAt(request('favorites'))).ids, [id]);
    await jsonAt(request('favorites', {productId:id,remove:true}));
    assert.deepEqual((await jsonAt(request('favorites'))).ids, []);
    await jsonAt(request('cart', {items}, {}, 'PUT'));
    assert.deepEqual((await jsonAt(request('cart'))).items, items);
    await jsonAt(request('profile', {name:'Updated fixture customer',phone,gender:'female'}, {}, 'PUT'));
    const customer = (await jsonAt(request('profile'))).profile;
    assert.equal(customer.name,'Updated fixture customer');
    assert.equal(customer.gender,'female');
    const suggestion = await jsonAt(request('suggestions',{name:'Fixture Mocha'}), 201);

    await jsonAt(admin('categories',{id,name:'Updated QA category',position:2,enabled:true}));
    const editedProduct = {id,name:'Updated QA latte',categoryId:id,price:200,inventory:12,available:true,archived:false,variants:[],addons:[],dietary:[]};
    await jsonAt(admin('products',editedProduct));
    const newQuote = await jsonAt(request('quote', {items,fulfillment:'pickup',code:''}));
    assert.equal(newQuote.total,200);
    await jsonAt(admin('products/'+id+'/availability',{available:false},'PATCH'));
    assert.equal((await jsonAt(request('bootstrap'))).products.find(item=>item.id===id).available,false);
    await jsonAt(admin('products/'+id+'/availability',{available:true},'PATCH'));
    await jsonAt(admin('suggestions/'+suggestion.id,{status:'rejected'},'PATCH'));
    assert.equal((await jsonAt(request('suggestions'))).suggestions[0].status,'rejected');
    assert.ok((await jsonAt(admin('customers/'+customer.id+'/orders'))).total>=4);
    assert.ok(Array.isArray((await jsonAt(admin('table-bookings'))).tables));
    assert.ok(Array.isArray((await jsonAt(admin('subscriptions'))).subscriptions));

    const overview = await jsonAt(admin('overview'));
    await jsonAt(admin('settings',{...overview.settings,orderDayOpeningTime:'06:00'},'PUT'));
    const savedLayout = {...overview.homeDesign,copy:{...overview.homeDesign.copy,searchPlaceholder:'Find your fixture coffee'}};
    await jsonAt(admin('home-design',savedLayout,'PUT'));
    const home = await jsonAt(request('bootstrap'));
    assert.equal(home.homeDesign.copy.searchPlaceholder,'Find your fixture coffee');
    assert.equal(home.settings.orderDayOpeningTime,'06:00');

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jOogAAAAASUVORK5CYII=', 'base64');
    const uploaded = await jsonAt(fetch(origin+'/api/admin/upload',{method:'POST',headers:{origin,cookie:adminCookie,'Content-Type':'image/png'},body:png}),201);
    const original = await fetch(origin+uploaded.url);
    assert.equal(original.status,200);
    assert.deepEqual(Buffer.from(await original.arrayBuffer()),png);
    const banners = [{title:'Fixture first',image:uploaded.url,destination:'menu'},{title:'Fixture second',image:uploaded.url,destination:'subscriptions'}];
    const published = await jsonAt(admin('advertisement',{expectedId:null,banners},'PUT'));
    assert.deepEqual((await jsonAt(request('bootstrap'))).homeAdvertisement.banners,banners);
    await jsonAt(admin('advertisement',{expectedId:null,banners},'PUT'),409);
    await jsonAt(admin('advertisement',{expectedId:published.advertisement.id,banners:[]},'PUT'));
    assert.equal((await jsonAt(request('bootstrap'))).homeAdvertisement,null);

    const planData = {name:'Fixture Latte Pass',amount:100,credits:4,days:20,enabled:true,itemScope:'menu',itemIds:[id]};
    const pass = await jsonAt(admin('subscription-plans',planData));
    const catalog = await jsonAt(request('subscriptions/config'));
    const savedPlan = catalog.plans.find(plan=>plan.id===pass.id);
    assert.equal(savedPlan.credits,4);
    assert.equal(savedPlan.includedItems[0].id,id);
    await jsonAt(admin('subscription-plans',{...planData,id:pass.id,revision:savedPlan.revision,enabled:false},'PUT'));
    assert.ok(!(await jsonAt(request('subscriptions/config'))).plans.some(plan=>plan.id===pass.id));
    await jsonAt(admin('customers/'+customer.id,{disabled:true},'PATCH'));
    assert.equal((await request('profile')).status,401);
    await jsonAt(admin('customers/'+customer.id,{disabled:false},'PATCH'));
    assert.equal((await request('profile')).status,200);

    console.log('Verified isolated customer/Admin HTTP flow: accept → prepare → ready → require payment → paid → complete; duplicate-safe chat, dine-in table acceptance and Off/On duty.');
    console.log('Verified the built Node backend: signup, ₹1 quote/order/booking fee, Pay at café only, disabled online booking/pass purchases and removed gateway screen, identity headers and CSRF.');
    console.log('Verified customer profile, addresses, favourites, cart and suggestions, plus Admin catalog, customer controls, Home design, image uploads, advertising and subscription publishing.');
  } finally {
    for (const controller of feeds) controller.abort();
    child.kill('SIGTERM');
    for (let i=0; i<50 && child.exitCode===null; i++) await delay(100);
    if (child.exitCode === null) { child.kill('SIGKILL'); await delay(100); }
    rmSync(directory, { recursive:true, force:true });
  }
});
