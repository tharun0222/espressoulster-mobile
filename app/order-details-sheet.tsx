"use client";
import {useEffect,useRef,useState} from 'react';
import {ReceiptText,X} from 'lucide-react';
import {orderReference} from '../lib/order-reference';
import './order-details-sheet.css';

const time=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'});
export default function OrderDetailsSheet({order,onClose}:{order:any;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const closing=useRef(false);
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const [leaving,setLeaving]=useState(false);
 const amount=(value:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:order.currency||'INR'}).format(value/100);
 useEffect(()=>{
  const element=dialog.current;const previous=document.activeElement as HTMLElement|null;
  const overflow=document.body.style.overflow;document.body.style.overflow='hidden';element?.showModal();
  return()=>{clearTimeout(timer.current);element?.close();document.body.style.overflow=overflow;previous?.focus();};
 },[]);
 function close(){
  if(closing.current)return;closing.current=true;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){onClose();return;}
  setLeaving(true);timer.current=setTimeout(onClose,220);
 }
 const created=new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(order.created_at)?order.created_at:order.created_at.replace(' ','T')+'Z');
 return <dialog ref={dialog} className="order-details-sheet" data-leaving={leaving||undefined}
  aria-labelledby="order-details-title" onCancel={event=>{event.preventDefault();close();}}
  onClick={event=>{if(event.target===event.currentTarget){const rect=event.currentTarget.getBoundingClientRect();if(event.clientY<rect.top||event.clientX<rect.left||event.clientX>rect.right||event.clientY>rect.bottom)close();}}}>
  <header><ReceiptText size={21} aria-hidden="true"/><div><h2 id="order-details-title">Order details</h2><p>{orderReference(order)}</p></div><button type="button" aria-label="Close order details" onClick={close} autoFocus><X size={22}/></button></header>
  <div className="order-details-body">
   <div className="order-details-meta"><span>{Number.isFinite(created.getTime())?time.format(created)+' IST':''}</span><strong>{order.status.replaceAll('_',' ')}</strong></div>
   <p className="order-details-service">{order.fulfillment==='dine_in'?'Dine in':order.fulfillment==='pickup'?'Take away':'Delivery'}{order.contact?.table?' · Table '+order.contact.table:''}</p>
   <ul className="order-details-items" aria-label="Ordered items">{order.items?.map((item:any)=><li key={item.id}><div><strong>{item.quantity} × {item.name}</strong>{item.selections?.variant?.name&&<small>{item.selections.variant.name}</small>}{item.selections?.addons?.map((addon:any)=><small key={addon.id}>{addon.name}</small>)}{item.instructions&&<small>{item.instructions}</small>}</div><span>{amount(item.unit_price*item.quantity)}</span></li>)}</ul>
   <dl className="order-details-totals"><div><dt>Subtotal</dt><dd>{amount(order.subtotal)}</dd></div>{order.discount>0&&<div><dt>Savings</dt><dd>−{amount(order.discount)}</dd></div>}{order.tax>0&&<div><dt>Tax</dt><dd>{amount(order.tax)}</dd></div>}{order.fee>0&&<div><dt>Fees</dt><dd>{amount(order.fee)}</dd></div>}<div className="order-details-total"><dt>Total</dt><dd>{amount(order.total)}</dd></div><div><dt>Payment</dt><dd>{order.payment_status==='paid'?'Paid':order.payment_status==='unpaid'?'Not paid':order.payment_status.replaceAll('_',' ')}</dd></div></dl>
   {order.contact?.name&&<p className="order-details-contact">{order.contact.name}{order.contact.phone&&<span>{order.contact.phone}</span>}</p>}
   {order.contact?.address&&<p>{order.contact.address}</p>}{order.contact?.notes&&<p>{order.contact.notes}</p>}
   {order.events?.length>0&&<details className="order-details-timeline"><summary>Order timeline</summary><ol>{order.events.map((event:any,index:number)=>{
    const date=new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(event.created_at)?event.created_at:event.created_at.replace(' ','T')+'Z');
    return <li key={index}><strong>{event.status.replaceAll('_',' ')}</strong><span>{Number.isFinite(date.getTime())?time.format(date)+' IST':''}</span></li>;
   })}</ol></details>}
  </div>
  <footer>ESPRESSOULSTER COFFEE</footer>
 </dialog>;
}
