const CACHE='espressoulster-shell-v3';
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(['/favicon.svg','/offline.html','/manifest.webmanifest']);await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(key=>key!==CACHE).map(key=>caches.delete(key)));await clients.claim()})()));
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')))});
self.addEventListener('push',event=>{
 let data;
 try{data=event.data.json()}catch{return}
 if(!data||typeof data.title!=='string'||typeof data.body!=='string')return;
 const deviceOnly=data.status==='confirmed'||data.status==='ready';
 const body=deviceOnly&&typeof data.reference==='string'&&data.reference?`Order ${data.reference} · ${data.body}`:data.body;
 event.waitUntil(self.registration.showNotification(data.title,{
  body,tag:data.tag||'order-update',icon:'/icon-192.png',badge:'/icon-192.png',data:{url:data.url||'/#orders'},
 }));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{let path='/#orders';try{const requested=new URL(event.notification.data?.url||path,self.location.origin);if(requested.origin===self.location.origin&&requested.pathname==='/'){const id=requested.searchParams.get('trackOrder');path=id&&/^CH-[A-F0-9]{8}$/.test(id)?'/?trackOrder='+id+'#orders':requested.hash==='#home'?'/#home':'/#orders'}}catch{}const target=new URL(path,self.location.origin).href;for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.navigate(target);return client.focus()}}return clients.openWindow(target)}))});
