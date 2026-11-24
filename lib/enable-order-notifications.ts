export async function enableOrderNotifications(){
 if(typeof Notification==='undefined'||!('serviceWorker' in navigator)||!('PushManager' in window))throw Error('Push notifications are not supported here. On iPhone, install the app on your Home Screen first.');
 const response=await fetch('/api/order-notifications/push',{cache:'no-store'});const config=await response.json() as {enabled:boolean;publicKey:string;error?:string};
 if(!response.ok||!config.enabled)throw Error(config.error||'Push notifications are not configured for this deployment.');
 const permission=await Notification.requestPermission();if(permission!=='granted')return permission;
 const registration=await navigator.serviceWorker.ready;
 await registration.update();
 const decoded=atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/'));const key=Uint8Array.from(decoded,c=>c.charCodeAt(0));
 let subscription=await registration.pushManager.getSubscription();
 if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 const saved=await fetch('/api/order-notifications/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(subscription.toJSON())});
 if(!saved.ok){const detail=await saved.json().catch(()=>({})) as {error?:string};throw Error(detail.error||'Could not save notification settings. Try again.');}
 return permission;
}

export async function disableOrderNotifications(){
 if(typeof navigator==='undefined'||!('serviceWorker' in navigator))return;
 const registration=await navigator.serviceWorker.getRegistration();
 const subscription=await registration?.pushManager?.getSubscription();
 if(!subscription)return;
 await fetch('/api/order-notifications/push',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify(subscription.toJSON())});
 await subscription.unsubscribe();
}
import { subscriptionId } from "./order-notifications";

export async function orderNotificationsConnected(signal: AbortSignal) {
 const registration = await navigator.serviceWorker.getRegistration();
 const subscription = await registration?.pushManager?.getSubscription();
 if (!subscription) return false;
 const id = await subscriptionId(subscription.endpoint);
 const response = await fetch("/api/order-notifications/push?device=" + id, { cache: "no-store", signal });
 if (!response.ok) return false;
 const result = await response.json() as { registered?: boolean };
 return result.registered === true;
}

