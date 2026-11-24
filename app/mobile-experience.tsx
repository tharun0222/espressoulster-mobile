'use client';
import {orderReference} from '../lib/order-reference';
import {collectOrderNotices,orderNotice} from '../lib/order-notifications';
import {hasNativeOrderAlerts} from '../lib/native-order-alerts';
import {useEffect,useRef,useState} from 'react';
import {Repeat2,Download,ChevronRight,Bell,X} from 'lucide-react';
import './order-notice-stack.css';
import {pairingCandidates,paymentLabel,receiptText} from '../lib/mobile-experience';
const cash=(n:number,c='INR')=>new Intl.NumberFormat('en-IN',{style:'currency',currency:c}).format(n/100);
export function PersonalHome({orders,onReorder}:{orders:any[];onReorder:(o:any)=>void;onNavigate:(r:string)=>void}){
 const last=orders.find(o=>o.status!=='cancelled'&&o.items?.length&&!o.items.every((i:any)=>i.product_id.startsWith('subscription-')));
 if(!last)return null;
 return <section className="personal-home"><article className="usual-card"><div><Repeat2 size={22}/><h3>Your last order, one tap away</h3><p>{last.items.map((i:any)=>`${i.quantity} × ${i.name}`).join(', ')}</p><small>Added to your cart at current menu prices.</small></div><button className="primary" onClick={()=>onReorder(last)}>Order again</button></article></section>;
}
export function Pairings({products,categories,cart,onSelect}:{products:any[];categories:any[];cart:any[];onSelect:(p:any)=>void}) {
 const choices = pairingCandidates(products, categories, cart.map(item => item.productId));
 if (!choices.length) return null;
 return (
  <section className="coffee-pairings" aria-label="Better together">
   <h3>Better together</h3>
   <div>
    {choices.map(product => (
     <button type="button" key={product.id} onClick={() => onSelect(product)}>
      {product.image && <img src={product.image} alt="" loading="lazy" />}
      <span className="coffee-pairing-copy"><strong>{product.name}</strong><small>{cash(product.price)}</small></span>
      <span className="coffee-pairing-arrow" aria-hidden="true"><ChevronRight size={16} /></span>
     </button>
    ))}
   </div>
  </section>
 );
}
export function DigitalReceipt({order:o}:{order:any}){return <details className="digital-receipt"><summary>View receipt & savings</summary><dl>{[['Subtotal',o.subtotal],['Discount',-o.discount],['Tax',o.tax],['Fees',o.fee],['Total',o.total]].map(([label,n])=><div key={String(label)}><dt>{label}</dt><dd>{cash(Number(n),o.currency)}</dd></div>)}</dl><p>Payment: {o.payment_status==='paid'?'Paid':o.payment_status} · {paymentLabel(o.collection_method)}</p>{o.discount>0&&<p className="receipt-savings">You saved {cash(o.discount,o.currency)} on this order.</p>}<button className="secondary" onClick={()=>{const blob=new Blob([receiptText(o)],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=orderReference(o)+'-receipt.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}}><Download size={16}/> Download receipt</button></details>}
export function OrderAlerts({orders,userId,onNavigate,onOpen}:{orders:any[];userId:string;onNavigate:(r:string)=>void;onOpen?:(id:string)=>void}){
 const seen=useRef(new Map<string,Set<string>>()),owner=useRef('');
 const [notices,setNotices]=useState<NonNullable<ReturnType<typeof orderNotice>>[]>([]);
 useEffect(()=>{
  if(owner.current!==userId){owner.current=userId;seen.current.clear();setNotices([])}
  const updates=collectOrderNotices(orders,seen.current)
   .filter(({status})=>status!=='confirmed'&&status!=='ready');
  if(updates.length)setNotices(previous=>[...previous,...updates].slice(-12));
 },[orders,userId]);
 function dismiss(index:number){
  setNotices(previous=>previous.filter((_,current)=>current!==index));
 }
 if(!notices.length||hasNativeOrderAlerts())return null;
 const firstVisible=Math.max(0,notices.length-3);
 return <section className="order-notice-stack" aria-label="Order updates" aria-live="polite">
  {notices.slice(firstVisible).reverse().map((notice,position)=>{
   const index=notices.length-1-position;
   return <article key={notice.tag} className="order-notice-card">
    <button className="order-notice-open" type="button" onClick={()=>{if(onOpen)onOpen(notice.id);else onNavigate('orders');dismiss(index);}}>
     <Bell size={17} aria-hidden="true"/>
     <span className="order-notice-copy">
      <strong>{notice.title.replace('Espressoulster · ','')}</strong>
      <small>{notice.reference} · {notice.body}</small>
     </span>
     <ChevronRight size={16} aria-hidden="true"/>
    </button>
    <button className="order-notice-dismiss" type="button" aria-label={'Dismiss '+notice.title} onClick={()=>dismiss(index)}><X size={17} aria-hidden="true"/></button>
   </article>;
  })}
 </section>;
}
