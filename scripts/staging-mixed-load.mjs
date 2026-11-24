import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { setTimeout as wait } from 'node:timers/promises';
import { fixtureCookie, fixturePhone, fixtureProduct, reconcileLoad, seedCustomers } from './staging-mixed-fixtures.mjs';

const secret = process.env.LOAD_STAGING_SECRET;
const total = Number(process.env.LOAD_STAGING_CLIENTS || 128);
const offset = Number(process.env.LOAD_STAGING_OFFSET || 0);
const seconds = Number(process.env.LOAD_STAGING_SECONDS || 30);
const origin = 'http://127.0.0.1:5184';
if (!/^[a-f0-9]{64}$/.test(secret || '') || ![total,offset,seconds].every(Number.isSafeInteger) ||
    total < 1 || offset < 0 || offset+total > 110000 || seconds < 10 || seconds > 3600) {
  throw new Error('Invalid synthetic load configuration.');
}
const command = process.argv[2];
if (command === 'seed') {
  if (offset) throw new Error('Seed the complete customer range once, starting with customer one.');
  await seedCustomers(secret,total);
  console.log(JSON.stringify({syntheticCustomers:total}));
} else if (command === 'reconcile') {
  const report = await reconcileLoad();
  console.log(JSON.stringify(report));
  if (report.badPayments || report.unpaidBookings || report.tableConflicts) process.exitCode = 1;
} else if (command === 'run') {
  await run();
} else {
  throw new Error('Choose seed, run or reconcile.');
}

async function run() {
  const agent = new http.Agent({keepAlive:true,maxSockets:total});
  const stats = new Map();
  const completed = {counterOrders:0, paidOrders:0, bookings:0};
  const failures = {};
  let activeUsers = 0, peakUsers = 0, inFlight = 0, peakInFlight = 0;
  function call(path, {cookie, data, metric, readJson=true} = {}) {
    const payload = data === undefined ? null : JSON.stringify(data);
    const headers = {origin,'x-load-secret':secret,...(cookie ? {cookie}:{}),
      ...(payload ? {'content-type':'application/json','content-length':Buffer.byteLength(payload)} : {})};
    const start = performance.now();
    peakInFlight = Math.max(peakInFlight,++inFlight);
    return new Promise((resolve,reject)=>{
      const req = http.request(origin+path,{agent,headers,method:payload ? 'POST':'GET'},res=>{
        const chunks = [];
        res.on('data',chunk=>{ if (readJson) chunks.push(chunk); });
        res.once('error',reject);
        res.once('end',()=>{
          try { resolve({status:res.statusCode,body:readJson ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null}); }
          catch { reject(new Error('invalid response')); }
        });
      });
      req.setTimeout(12000,()=>req.destroy(new Error('timeout')));
      req.once('error',reject);
      req.end(payload);
    }).then(result=>{
      if (result.status !== 200 && result.status !== 201) throw new Error(`HTTP ${result.status}`);
      return result.body;
    }).catch(error=>{
      if (metric) {
        const key = `${metric} ${error.message}`;
        failures[key] = (failures[key] || 0)+1;
      }
      throw error;
    }).finally(()=>{
      inFlight--;
      if (metric) {
        const series = stats.get(metric) || {requests:0, milliseconds:{}};
        const ms = Math.ceil(performance.now()-start);
        series.requests++;
        series.milliseconds[ms] = (series.milliseconds[ms] || 0)+1;
        stats.set(metric,series);
      }
    });
  }

  async function orderFlow(callAsUser, user, online) {
    const items = [{productId:fixtureProduct,quantity:1}];
    const draft = {items,fulfillment:'pickup',code:''};
    const quote = await callAsUser('/api/quote','quote',draft);
    const order = await callAsUser('/api/orders','createOrder',{
      ...draft,expectedTotal:quote.total,paymentMethod:online?'cashfree_test':'pay_at_pickup',
      idempotencyKey:randomUUID(),contact:{name:'Load Customer',phone:fixturePhone(user)},
    });
    if (!online) {
      requireValue(/^CH-/.test(order.id),'counter order missing');
      completed.counterOrders++;
      return;
    }
    const checkout = await callAsUser(`/api/payments/${order.id}/start`,'startCheckout',{});
    requireValue(checkout.order_id===order.id && Boolean(checkout.payment_session_id),'checkout session missing');
    await callAsUser(`/__load/orders/${order.id}/paid`,'simulateGateway',{});
    const [first,second] = await Promise.all([
      callAsUser(`/api/payments/${order.id}/verify`,'verifyPayment',{}),
      callAsUser(`/api/payments/${order.id}/verify`,'verifyPayment',{}),
    ]);
    requireValue(first.paid && second.paid && first.orderId === second.orderId && /^CH-/.test(first.orderId),'payment not recorded');
    completed.paidOrders++;
  }

  async function bookingFlow(callAsUser,user,bookingDate) {
    const slot = Math.floor((user-3)/20)%1120;
    const date = new Date(bookingDate+Math.floor(slot/40)*86400000).toISOString().slice(0,10);
    const time = minute => `${String(Math.floor(minute/60)%24).padStart(2,'0')}:${minute%60?'30':'00'}`;
    const start = 360+(slot%40)*30;
    const input = {date,time:time(start),endTime:time(start+30),guests:2};
    const availability = await callAsUser('/api/table-bookings/availability?'+new URLSearchParams(input),'bookingAvailability');
    requireValue(availability.canBook,'no seats for fixture booking');
    const checkout = await callAsUser('/api/table-bookings','startBooking',input);
    const bookingId = new URL(checkout.redirectUrl,origin).searchParams.get('order');
    requireValue(bookingId && /^BK-/.test(bookingId),'booking checkout missing');
    await callAsUser(`/__load/orders/${bookingId}/paid`,'simulateGateway',{});
    const result = await callAsUser('/api/table-bookings/payment','verifyBooking',{id:bookingId});
    requireValue(result.state==='paid' && result.bookingId===bookingId,'booking payment not recorded');
    completed.bookings++;
  }

  try {
    const readiness = await call('/__load/ready');
    requireValue(readiness.staging && readiness.replicas===2,'wrong staging target');
    // Warm the catalog before recording the requests sent by simulated users.
    await call('/api/bootstrap',{readJson:false});
    const scheduled = Number(process.env.LOAD_STAGING_START_AT || 0);
    if (scheduled > Date.now()) await wait(scheduled-Date.now());
    const start = performance.now(), deadline = start+seconds*1000;
    const bookingDate = Date.now()+86400000;
    await Promise.all(Array.from({length:total},(_,i)=>i+offset+1).map(async user=>{
      const cookie = `espresso_pin=${fixtureCookie(secret,user)}`;
      const callAsUser = (path,metric,data) => call(path,{cookie,metric,data});
      activeUsers++;
      peakUsers = Math.max(peakUsers,activeUsers);
      try {
        await wait(user%400);
        await call('/api/bootstrap',{cookie,metric:'browse',readJson:false});
        await callAsUser('/api/orders','readOrders');
        if (user%20===1) await orderFlow(callAsUser,user,true);
        if (user%20===2) await orderFlow(callAsUser,user,false);
        if (user%20===3) await bookingFlow(callAsUser,user,bookingDate);
        let lastBrowse = performance.now();
        while (performance.now() < deadline) {
          await call('/api/cafe/order-intake',{cookie,metric:'availabilityPoll',readJson:false});
          if (performance.now()-lastBrowse>=30000) {
            await call('/api/bootstrap',{cookie,metric:'browse',readJson:false});
            lastBrowse = performance.now();
          }
          await wait(Math.max(0,Math.min(4000,deadline-performance.now())));
        }
      } catch (error) {
        if (!error.message.startsWith('HTTP ') || !Object.keys(failures).some(key=>key.endsWith(error.message))) {
          failures.workflow = (failures.workflow || 0)+1;
          if (error.message.startsWith('fixture: ')) failures[error.message] = (failures[error.message] || 0)+1;
        }
      } finally { activeUsers--; }
    }));
    const metrics = Object.fromEntries([...stats].map(([name,series])=>[name,{requests:series.requests,
      p95Ms:percentile(series,.95),histogramMs:series.milliseconds}]));
    console.log(JSON.stringify({configuredUsers:total,firstUser:offset+1,seconds,peakUsers,peakInFlight,completed,failures,metrics}));
    if (Object.keys(failures).length || Object.values(metrics).some(metric=>metric.p95Ms>1000)) process.exitCode = 1;
  } finally { agent.destroy(); }
}

function requireValue(condition,message) { if (!condition) throw new Error('fixture: '+message); }

function percentile({requests,milliseconds},fraction) {
  let count = 0;
  for (const [ms,frequency] of Object.entries(milliseconds)) if ((count+=frequency)>=Math.ceil(requests*fraction)) return Number(ms);
  return 0;
}
