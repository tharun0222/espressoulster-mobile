import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {collectOrderNotices,orderNotice,staffOrderNotice} from '../lib/order-notifications.ts';
import {adminSectionPath} from '../lib/admin-section.ts';
import {validPushSubscription,sendOrderPush} from '../lib/order-push.ts';
test('new order alerts distinguish customers and staff, with a validated Admin deep link',()=>{
 const order={id:'CH-12345678',order_number:'23112026-001',status:'pending',fulfillment:'dine_in'};
 const customer=orderNotice(order), staff=staffOrderNotice(order);
 assert.match(customer.title,/Order received/);
 assert.match(orderNotice(order,'cancelled').title,/Order cancelled/);
 assert.equal(staff.title,'New café order');
 assert.match(staff.body,/Dine in/);
 assert.notEqual(customer.tag,staff.tag);
 assert.equal(adminSectionPath(new URLSearchParams('section=orders&order=CH-12345678')),'/admin?section=orders&order=CH-12345678');
 assert.equal(adminSectionPath(new URLSearchParams('section=orders&order=https://example.test')),'/admin?section=orders');
});
test('all four admin stages produce individual notices without duplicates',()=>{
 const seen=new Map(),order={id:'CH-12345678',status:'pending',events:[{status:'pending',created_at:'1'}]};
 assert.deepEqual(collectOrderNotices([order],seen),[]);
 order.status='completed';order.events.push(...['confirmed','preparing','ready','completed'].map((status,i)=>({status,created_at:String(i+2)})));
 assert.deepEqual(collectOrderNotices([order],seen).map(n=>n.status),['confirmed','preparing','ready','completed']);
 assert.deepEqual(collectOrderNotices([order],seen),[]);
 assert.equal(orderNotice(order).url,'/?trackOrder=CH-12345678#orders');
});
test('notices keep different orders and fulfillment distinct',()=>{
 const seen=new Map(),a={id:'CH-00000001',status:'pending'},b={id:'CH-00000002',status:'pending'};
 collectOrderNotices([a,b],seen);a.status='confirmed';b.status='ready';
 assert.deepEqual(collectOrderNotices([a,b],seen).map(n=>n.id),[a.id,b.id]);
 assert.match(orderNotice({...a,status:'ready',fulfillment:'dine_in'}).title,/Ready to serve/);
 assert.match(orderNotice({...a,status:'ready',fulfillment:'pickup'}).title,/Ready for pickup/);
 assert.match(orderNotice({...a,status:'ready',fulfillment:'pickup'}).body,/counter/);
 assert.match(orderNotice({...a,status:'ready',fulfillment:'delivery'}).body,/dispatch/);
});
test('dine-in acceptance includes the assigned table once',()=>{
 const seen=new Map();
 const order={id:'CH-00000007',status:'pending',fulfillment:'dine_in'};
 assert.deepEqual(collectOrderNotices([order],seen),[]);
 const accepted={...order,status:'confirmed',contact:{table:'T07'}};
 const notices=collectOrderNotices([accepted],seen);
 assert.equal(notices.length,1);
 assert.match(notices[0].body,/Table T07/);
 assert.match(orderNotice(accepted,'ready').body,/Table T07/);
 assert.deepEqual(collectOrderNotices([accepted],seen),[]);
 assert.doesNotMatch(orderNotice({...accepted,fulfillment:'pickup'}).body,/Table T07/);
});
test('accepted and ready pushes display device notifications for the correct order',async()=>{
 const handlers=new Map(),delivered=[];
 const self={
  addEventListener(name,handler){handlers.set(name,handler);},
  registration:{async showNotification(title,options){delivered.push({title,...options});}},
 };
 runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),{self});
 const order={id:'CH-12345678',order_number:'16112026-002',fulfillment:'pickup'};
 for(const status of ['confirmed','ready']){
  let notification;
  handlers.get('push')({data:{json:()=>orderNotice({...order,status})},waitUntil(promise){notification=promise;}});
  await notification;
 }
 assert.match(delivered[0].title,/Order accepted/);
 assert.match(delivered[1].title,/Ready for pickup/);
 for(const notice of delivered){
  assert.match(notice.body,/^Order 16112026-002 · /);
  assert.equal(notice.data.url,'/?trackOrder=CH-12345678#orders');
 }
 assert.notEqual(delivered[0].tag,delivered[1].tag);
});
function keys(){const key=createECDH('prime256v1');key.generateKeys();return {publicKey:key.getPublicKey().toString('base64url'),privateKey:key.getPrivateKey().toString('base64url')}}
test('push endpoints reject internal destinations and malformed keys',()=>{
 const key=keys();const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:key.publicKey,auth:randomBytes(16).toString('base64url')}};
 assert.equal(validPushSubscription(sub),true);
 assert.equal(validPushSubscription({...sub,endpoint:'https://jmt17.google.com/fcm/send/test'}),true);
 for(const endpoint of ['http://127.0.0.1/','https://localhost/','https://evil.test/','https://fcm.googleapis.com.evil.test/'])assert.equal(validPushSubscription({...sub,endpoint}),false);
 assert.equal(validPushSubscription({...sub,keys:{auth:'bad',p256dh:'bad'}}),false);
});
test('server sends an encrypted VAPID payload and removes expired devices',async()=>{
 const vapid=keys(),client=keys(),subscription={endpoint:'https://fcm.googleapis.com/fcm/send/fixture',keys:{p256dh:client.publicKey,auth:randomBytes(16).toString('base64url')}};
 let removed=false,called=false,captured;
 const d={prepare(sql){return {bind(){return {async all(){return {results:[{id:'device',subscription:JSON.stringify(subscription)}]}},async run(){removed=sql.startsWith('DELETE')}}}}}};
 await sendOrderPush(d,{VAPID_SERVER_PUBLIC_KEY:vapid.publicKey,VAPID_SERVER_PRIVATE_KEY:vapid.privateKey,VAPID_SUBJECT:'mailto:test@example.com'},{id:'CH-12345678',status:'confirmed',user_id:'customer'},async(url,payload)=>{
  called=true;captured={url,payload};return new Response('',{status:410});
 });
 assert.equal(called,true);assert.equal(removed,true);assert.equal(captured.url,subscription.endpoint);assert.equal(captured.payload.method.toUpperCase(),'POST');assert.equal(new Headers(captured.payload.headers).get('content-encoding'),'aes128gcm');assert.match(new Headers(captured.payload.headers).get('authorization'),/^vapid /);assert.ok(captured.payload.body);assert.ok(!JSON.stringify(captured.payload.body).includes('The café has your order.'));
});
