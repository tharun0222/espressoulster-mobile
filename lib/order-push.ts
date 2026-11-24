import {buildPushPayload} from '@block65/webcrypto-web-push';
import {orderNotice,type NoticeOrder} from './order-notifications.ts';
export function pushConfig(e:any){return {enabled:!!(e.VAPID_SERVER_PUBLIC_KEY&&e.VAPID_SERVER_PRIVATE_KEY&&e.VAPID_SUBJECT),publicKey:e.VAPID_SERVER_PUBLIC_KEY||''};}
export function validPushSubscription(value:any){
 if(!value||typeof value.endpoint!=='string'||value.endpoint.length>2048)return false;
 let url:URL;try{url=new URL(value.endpoint)}catch{return false}
 const host=url.hostname;
 if(url.protocol!=='https:'||url.username||url.password||url.port||!(host==='fcm.googleapis.com'||host==='jmt17.google.com'||host.endsWith('.push.apple.com')||host.endsWith('.push.services.mozilla.com')||host==='updates.push.services.mozilla.com'||host.endsWith('.notify.windows.com')))return false;
 return typeof value.keys?.p256dh==='string'&&/^[A-Za-z0-9_-]{87}=?$/.test(value.keys.p256dh)&&typeof value.keys?.auth==='string'&&/^[A-Za-z0-9_-]{22}={0,2}$/.test(value.keys.auth);
}
export async function sendOrderPush(d:any,e:any,order:NoticeOrder&{user_id:string},fetcher:typeof fetch=fetch){
 const notice=orderNotice(order);if(!notice||!pushConfig(e).enabled)return;
 const devices=await d.prepare('SELECT id,subscription FROM order_push_subscriptions WHERE user_id=? LIMIT 8').bind(order.user_id).all();
 await Promise.allSettled(devices.results.map(async(device:any)=>{
  const subscription=JSON.parse(device.subscription);if(!validPushSubscription(subscription))return;
  const payload=await buildPushPayload({data:JSON.stringify(notice),options:{ttl:3600}},subscription,{subject:e.VAPID_SUBJECT,publicKey:e.VAPID_SERVER_PUBLIC_KEY,privateKey:e.VAPID_SERVER_PRIVATE_KEY});
  const response=await fetcher(subscription.endpoint,{...payload,signal:AbortSignal.timeout(4000)});
  if(response.status===404||response.status===410)await d.prepare('DELETE FROM order_push_subscriptions WHERE id=?').bind(device.id).run();
 }));
}
