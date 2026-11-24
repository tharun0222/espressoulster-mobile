'use client';
import {useEffect,useState} from 'react';
import OrderPendulum from './order-pendulum';
import {OrderAlerts} from './mobile-experience';
import type {TimedOrder} from '../lib/order-timer';
import {orderReference,type OrderReference} from '../lib/order-reference';
import './payment-order-flow.css';
type PaymentOrder=TimedOrder&OrderReference&{fulfillment:string;contact?:{table?:string}};
export default function PaymentOrderStatus({test=false,orderId}:{test?:boolean;orderId?:string}){
 const [phase,setPhase]=useState('success');
 const [order,setOrder]=useState<PaymentOrder|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{const exit=setTimeout(()=>setPhase('leaving'),1600),clock=setTimeout(()=>setPhase('clock'),2100);return()=>{clearTimeout(exit);clearTimeout(clock)}},[]);
 useEffect(()=>{
  const id=orderId||new URLSearchParams(window.location.search).get('order');if(!/^CH-[A-F0-9]{8}$/.test(id||'')){setError('Invalid order reference. Open My orders.');return;}
  let active=true,timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController;
  async function load(){
   controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
   try{const r=await fetch('/api/orders/'+id,{cache:'no-store',signal:controller.signal});const b=await r.json() as {error?:string;order:PaymentOrder};if(!r.ok)throw Error(b.error||'Unable to load order status.');if(!active)return;setOrder(b.order);setError('');if(!['completed','cancelled','delivered'].includes(b.order.status))timer=setTimeout(load,3000);}
   catch{if(active){setError('Order updates are temporarily unavailable. Retry or open My orders.');timer=setTimeout(load,6000);}}
   finally{clearTimeout(timeout);}
  }
  void load();return()=>{active=false;clearTimeout(timer);controller?.abort()};
 },[refresh,orderId]);
 return <section className={phase==='clock'?'paid-order-flow order-tracking-layout':'paid-order-flow'} data-phase={phase} aria-label="Payment and order tracking">
  {phase!=='clock'?<div className="paid-order-intro" role="status"><span>ESPRESSOULSTER</span><svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="32"/><path d="m25 40 11 11 21-23"/></svg><h1>Payment successful</h1><p>Your payment is confirmed.</p></div>:<>
   <header className="paid-order-header"><a href="/#home" aria-label="Return to Home">←</a><div><span>Order status</span><strong>{order?orderReference(order):'Your order'}{order?.contact?.table && ` · Table ${order.contact.table}`}</strong></div></header>
   {order&&<OrderAlerts orders={[order]} userId={order.id} onNavigate={()=>{}} onOpen={()=>{}}/>}
   {order?<OrderPendulum key={order.id} order={order} fitViewport/>:<p role="status">Loading your order…</p>}
   {error&&<div role="alert" className="paid-order-error"><p>{error}</p><button onClick={()=>setRefresh(n=>n+1)}>Retry updates</button><a href="/#orders">My orders</a></div>}
  </>}
 </section>;
}
