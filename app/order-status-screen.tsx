'use client';
import {useEffect,useRef} from 'react';
import OrderPendulum from './order-pendulum';
import type {TimedOrder} from '../lib/order-timer';
import {orderReference,type OrderReference} from '../lib/order-reference';
import './order-status-screen.css';
export default function OrderStatusScreen({order,onClose,onChat,backLabel="Back to orders"}:{order:TimedOrder&OrderReference&{fulfillment?:string;contact?:{table?:string}};onClose:()=>void;onChat?:()=>void;backLabel?:string}){
 const dialog=useRef<HTMLDialogElement>(null);
 const reference=orderReference(order);
 useEffect(()=>{
  const element=dialog.current;
  const before=document.body.style.overflow;
  element?.showModal();document.body.style.overflow='hidden';
  return()=>{element?.close();document.body.style.overflow=before};
 },[]);
 return <dialog ref={dialog} className="order-status-screen order-tracking-layout" aria-label={'Order status '+reference} onCancel={event=>{event.preventDefault();onClose()}}>
  <header className="order-status-screen-header"><button type="button" onClick={onClose} aria-label={backLabel}>←</button><div><span>Order status</span><strong>{reference}</strong></div>
   {order.fulfillment === "dine_in" && order.contact?.table && <strong className="order-status-table">Table {order.contact.table}</strong>}
  </header>
  <OrderPendulum key={order.id} order={order} fitViewport/>
  {onChat && <button className="secondary order-status-chat" type="button" onClick={onChat}>Chat with the café</button>}
 </dialog>;
}
