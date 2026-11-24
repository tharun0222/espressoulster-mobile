'use client';
import {useEffect,useState} from 'react';
import {Coffee,ChevronRight} from 'lucide-react';
import {activeCafeOrders,liveOrderLabel} from '../lib/live-order-status';
import {elapsedLabel,orderElapsed,type TimedOrder} from '../lib/order-timer';
import {orderReference,type OrderReference} from '../lib/order-reference';
import './home-live-orders.css';
type LiveOrder=TimedOrder&OrderReference&{fulfillment?:string;items?:{product_id?:string;name?:string;quantity?:number}[]};
export default function HomeLiveOrders({orders,onOpen}:{orders:LiveOrder[];onOpen:(id:string)=>void}){
 const active=activeCafeOrders(orders);
 const [now,setNow]=useState<number|null>(null);
 useEffect(()=>{if(!active.length)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[active.length]);
 if(!active.length)return null;
 return <aside className="home-live-orders" aria-label="Your active orders">
  {active.length>1&&<div className="home-live-order-count">{active.length} ongoing orders · swipe to view</div>}
  <div className="home-live-order-rail">{active.map((order,index)=>{
   const elapsed=orderElapsed(order,now??0);
   const count=order.items?.reduce((sum,item)=>sum+(item.quantity||0),0)||0;
   return <button key={order.id} className="home-live-order-card" onClick={()=>onOpen(order.id)} aria-label={`Track order ${orderReference(order)}: ${liveOrderLabel(order)}`}>
    <span className="home-live-order-icon" aria-hidden="true"><Coffee size={22}/><i/></span>
    <span className="home-live-order-copy"><strong>{liveOrderLabel(order)}</strong><small>{orderReference(order)} · {count} {count===1?'item':'items'}{active.length>1?` · ${index+1}/${active.length}`:''}</small></span>
    <span className="home-live-order-action"><span suppressHydrationWarning>{now!==null&&elapsed.hasTime?elapsedLabel(elapsed.seconds):'--:--'}</span><span>Track <ChevronRight size={13}/></span></span>
   </button>;
  })}</div>
 </aside>;
}
