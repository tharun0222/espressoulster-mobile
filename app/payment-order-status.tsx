'use client';
import {useEffect,useState,useRef} from 'react';
import {celebrationSound} from '../lib/celebration-audio';
const stages=['pending','confirmed','preparing','ready','completed'];
const labels=['Order received','Confirmed','Preparing','Ready','Completed'];
export default function PaymentOrderStatus(){
 const notified=useRef<string|null>(null);
 const [greeting,setGreeting]=useState(false);
 const [order,setOrder]=useState<{id:string;status:string;fulfillment:string}|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{
  const id=new URLSearchParams(window.location.search).get('order');if(!/^CH-[A-F0-9]{8}$/.test(id||''))return;
  let active=true,timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController;
  async function load(){
   controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
   try{const r=await fetch('/api/orders/'+id,{cache:'no-store',signal:controller.signal});const b=await r.json() as {error?:string;order:{id:string;status:string;fulfillment:string}};if(!r.ok)throw Error(b.error||'Unable to load order status.');if(!active)return;setOrder(b.order);setError('');if(!['completed','cancelled','delivered'].includes(b.order.status))timer=setTimeout(load,10000);}
   catch(e){if(active){setError('Order updates are temporarily unavailable. Please refresh or open My orders.');timer=setTimeout(load,20000);}}
   finally{clearTimeout(timeout);}
  }
  load();return()=>{active=false;clearTimeout(timer);controller?.abort()};
 },[refresh]);
 useEffect(()=>{
  if(!order||order.status!=='completed'||notified.current===order.id)return;
  notified.current=order.id;setGreeting(true);
  // Keep the greeting visible on revisits, but play its sound once per order in this tab.
  try{const key='espresso-completed-'+order.id;if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1');}catch{}
  celebrationSound('welcome');
 },[order]);
 const index=order?stages.indexOf(order.status):-1;
 const description=order?.status==='pending'?'Waiting for the café to confirm your order.':order?.status==='confirmed'?'The café has accepted your order.':order?.status==='preparing'?'Your order is being prepared.':order?.status==='ready'?(order.fulfillment==='dine_in'?'Your order is ready to serve.':'Your order is ready for collection.'):order?.status==='completed'?'Your order is complete. Thank you!':order?.status==='cancelled'?'This order was cancelled. Contact the café about your payment.':'Checking your latest order status…';
 return <section className="payment-order-status" aria-label="Order tracking">{greeting&&<div className="order-complete-greeting" role="status" aria-live="polite"><span aria-hidden="true">✓</span><div><strong>Thanks for ordering with us!</strong><p>Your order is complete. Enjoy, and see you again soon.</p></div><button aria-label="Dismiss thank-you notification" onClick={()=>setGreeting(false)}>×</button></div>}<h2>Track your order</h2>{order&&<p className="payment-order-reference">{order.id}</p>}<p role="status">{description}</p>{index>=0&&<ol>{stages.map((stage,i)=><li key={stage} className={i<=index?'reached':''} aria-current={i===index?'step':undefined}><span aria-hidden="true">{i<index?'✓':i+1}</span>{labels[i]}</li>)}</ol>}{error&&<p role="alert">{error}</p>}<button className="secondary" onClick={()=>setRefresh(v=>v+1)}>Refresh status</button><small>Updates automatically while this page is open.</small></section>;
}
