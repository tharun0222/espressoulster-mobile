'use client';
import {useEffect,useRef,useState} from 'react';
import {onLiveUpdate} from './use-live-updates';
import {CalendarCheck,X} from 'lucide-react';
import './booking-alert-banner.css';
import {customerJson} from '../lib/customer-flow';
import {bookingNoticeText} from '../lib/booking-notification';
export default function BookingNotifications({userId,onView}:{userId:string;onView:()=>void}){
 const [items,setItems]=useState<any[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);const delivered=useRef(new Set<string>());
 useEffect(()=>{let active=true,running=false;setItems([]);delivered.current.clear();const controller=new AbortController();async function refresh(){if(running||document.visibilityState!=='visible')return;running=true;try{const data:any=await customerJson('booking-notifications',{signal:controller.signal});if(!active)return;setItems(data.notifications);for(const n of data.notifications){if(delivered.current.has(n.id))continue;delivered.current.add(n.id);if(typeof Notification!=='undefined'&&Notification.permission==='granted'){const text=bookingNoticeText(n.data);const options={body:`${text.tables}\nCheck-in: ${text.checkIn}\nCheck-out: ${text.checkOut}`,tag:'booking-'+n.id,icon:'/icon-192.png',data:{url:'/#home'}};navigator.serviceWorker?.getRegistration().then(sw=>sw?.showNotification(text.title,options)).catch(()=>{})}}}catch{}finally{running=false}}refresh();const timer=setInterval(refresh,10000);const wake=()=>{if(!document.hidden)refresh()};window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);const stopLiveUpdates=onLiveUpdate(['bookings'],wake);return()=>{active=false;controller.abort();clearInterval(timer);stopLiveUpdates();window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake)}},[userId]);
 const item=items[0];if(!item)return null;const text=bookingNoticeText(item.data);
 async function dismiss(){setBusy(true);setError('');try{const r=await fetch('/api/booking-notifications',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id})});if(!r.ok)throw Error('Could not dismiss. Please try again.');setItems(old=>old.filter(n=>n.id!==item.id))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <aside className="booking-alert-banner" aria-label="Booking notification">
  <button type="button" className="booking-alert-open" aria-label={'View my booking. '+text.title} onClick={()=>{onView();void dismiss();}} disabled={busy}>
   <span className="booking-alert-icon" aria-hidden="true"><CalendarCheck size={21}/></span>
   <span className="booking-alert-copy" role="status"><strong>{text.title}</strong><small>{text.tables} · {text.checkIn}</small></span>
  </button>
  <button type="button" className="booking-alert-close" aria-label="Dismiss booking notification" disabled={busy} onClick={dismiss}><X size={18} aria-hidden="true"/></button>
  {error&&<p role="alert">{error}</p>}
 </aside>;
}
