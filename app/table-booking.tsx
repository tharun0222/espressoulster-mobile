'use client';
import {bookingSlots,slotTime,bookingTimeLabel,bookingDay,bookingDuration,bookingsOverlap} from '../lib/table-booking';
import {useEffect,useState,useRef} from 'react';
import {customerJson} from '../lib/customer-flow';
import {CalendarDays,Users,ChevronDown} from 'lucide-react';
async function request(method='GET',data?:any,admin=false,signal?:AbortSignal){return customerJson((admin?'admin/':'')+'table-bookings',{method,data,signal});}
export default function TableBooking({user,admin=false}:{user?:any;admin?:boolean}){
 const [open,setOpen]=useState(admin),[rows,setRows]=useState<any[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [tables,setTables]=useState<any[]>([]),[occupied,setOccupied]=useState<any[]>([]),[assignments,setAssignments]=useState<Record<string,string[]>>({});
 const [date,setDate]=useState(''),[time,setTime]=useState(''),[endTime,setEndTime]=useState(''),[guests,setGuests]=useState(2),[purpose,setPurpose]=useState('Office meeting'),[notes,setNotes]=useState('');
 const slotMinute=(t:string)=>{const [h,m]=t.split(':').map(Number);return h*60+m+(h<6?1440:0)};
 const ends=bookingSlots.filter(m=>time&&m>slotMinute(time));
 const owner=String(admin?'admin':user?.userId||user?.id||'guest');
 const ownerRef=useRef(owner);ownerRef.current=owner;
 const refreshState=useRef<{controller:AbortController;promise:Promise<void>}|null>(null);
 const alive=useRef(false);
 function refresh(force=false):Promise<void>{
  if(refreshState.current&&!force)return refreshState.current.promise;
  if(force)refreshState.current?.controller.abort();
  const controller=new AbortController(),requestOwner=ownerRef.current;
  const promise=(async()=>{
   try{
    const result=await request('GET',undefined,admin,controller.signal);
    if(!alive.current||controller.signal.aborted||ownerRef.current!==requestOwner)return;
    setRows(result.bookings);setTables(result.tables||[]);setOccupied(result.occupied||[]);setError('');
   }catch(e){if(alive.current&&!controller.signal.aborted&&ownerRef.current===requestOwner)setError((e as Error).message);}
  })().finally(()=>{if(refreshState.current?.controller===controller)refreshState.current=null;});
  refreshState.current={controller,promise};return promise;
 }
 useEffect(()=>{
  alive.current=true;setRows([]);setTables([]);setOccupied([]);setAssignments({});setError('');setBusy(false);
  const wake=()=>{if(document.visibilityState==='visible')void refresh();};
  if(open&&(user||admin)){
   wake();const timer=setInterval(wake,30000);window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);
   return()=>{alive.current=false;refreshState.current?.controller.abort();refreshState.current=null;clearInterval(timer);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake);};
  }
  return()=>{alive.current=false;refreshState.current?.controller.abort();refreshState.current=null;};
 },[open,owner,admin]);

 useEffect(()=>{if(admin)return;const show=()=>{sessionStorage.removeItem('espresso-open-bookings');setOpen(true);requestAnimationFrame(()=>document.querySelector('.table-booking-section')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}))};window.addEventListener('espresso-open-bookings',show);if(sessionStorage.getItem('espresso-open-bookings'))show();return()=>window.removeEventListener('espresso-open-bookings',show)},[admin]);
 async function change(id:string,status:string){setBusy(true);setError('');try{await request('PATCH',{id,status,...(status==='confirmed'?{tableIds:assignments[id]||JSON.parse(rows.find(b=>b.id===id)?.table_ids||'[]')}:{})},admin);await refresh(true)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <section className="table-booking-section">
 <div className="booking-intro"><span className="booking-icon"><CalendarDays size={27}/></span><div><small>MAKE ROOM FOR YOUR PLANS</small><h2>{admin?'Table bookings':'Your table. Your time.'}</h2><p>{admin?'Review requests before confirming table availability.':'Meet, catch up, or celebrate over coffee.'}</p></div></div>
 {admin&&<div className="table-inventory"><h3>Table inventory · 15 tables · 56 seats</h3><p>1 × 8 seats · 4 × 2 seats · 10 × 4 seats. Availability below is for booking use; booked tables must be reassigned or cancelled before disabling.</p><div className="table-grid">{tables.map(t=><button key={t.id} className={'table-tile '+(t.enabled?'enabled':'disabled')} disabled={busy} aria-label={`${t.id}, ${t.seats} seats, ${t.enabled?'available':'disabled'}. Toggle availability`} onClick={async()=>{setBusy(true);try{await customerJson('admin/cafe-tables',{method:'PATCH',data:{id:t.id,enabled:!t.enabled}});await refresh(true)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}><strong>{t.id}</strong><span>{t.seats} seats</span><small>{t.enabled?'Enabled':'Disabled'}</small></button>)}</div></div>}
 {!admin&&<button className="primary booking-toggle" aria-expanded={open} onClick={()=>setOpen(!open)}>Book a table <ChevronDown size={18}/></button>}
 {open&&<div className="booking-body">{!admin&&!user?<p>Sign in to request a table booking.</p>:<>
 {error&&<p role="alert" className="error-banner">{error}</p>}{message&&<p role="status" className="booking-message">{message}</p>}
 {!admin&&<form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');try{await request('POST',{date,time,endTime,guests,purpose,notes});setMessage('Request sent! Your table is awaiting café confirmation. Check the status below.');setNotes('');await refresh(true)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>
 <div className="booking-fields"><label>Café day<input type="date" required min={bookingDay()} value={date} onChange={e=>setDate(e.target.value)}/></label><label>Check-in (IST)<select required value={time} onChange={e=>{setTime(e.target.value);setEndTime('')}}><option value="">Select arrival</option>{bookingSlots.slice(0,-1).map(m=><option key={m} value={slotTime(m)}>{bookingTimeLabel(slotTime(m))}{m>=1440?' · next day':''}</option>)}</select></label><label>Check-out (IST)<select required disabled={!time} value={endTime} onChange={e=>setEndTime(e.target.value)}><option value="">Select departure</option>{ends.map(m=><option key={m} value={slotTime(m)}>{bookingTimeLabel(slotTime(m))}{m>=1440?' · next day':''}</option>)}</select></label><label>Guests<select value={guests} onChange={e=>setGuests(Number(e.target.value))}>{Array.from({length:20},(_,n)=><option key={n} value={n+1}>{n+1}</option>)}</select></label><label>Visit type<select value={purpose} onChange={e=>setPurpose(e.target.value)}>{['Office meeting','Catch-up','Celebration','Visit'].map(p=><option key={p}>{p}</option>)}</select></label></div>
 {time&&endTime&&<div className="booking-duration">Time at the café <strong>{bookingDuration(slotMinute(time)*60,slotMinute(endTime)*60)}</strong></div>}
 <label>Anything we should know? <textarea maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Seating preferences or meeting details (optional)"/></label>
 <p className="fine-print">Open daily: 6:00 AM–2:00 AM next day · All times are IST (India). Choose check-in and check-out in 30-minute steps. Times marked “next day” fall after your selected café day. Booking details show the actual arrival date. Request up to 30 days ahead; staff confirmation required. No payment required.</p><button className="primary" disabled={busy}>{busy?'Sending…':'Request booking'}</button></form>}
 <div className="booking-list"><div className="booking-list-heading"><h3>{admin?'Booking requests':'My bookings'}</h3><button className="text-button" disabled={busy} onClick={()=>void refresh(true)}>Refresh</button></div>{!rows.length&&<p>No booking requests yet.</p>}{rows.map(b=><article className="booking-row" key={b.id}><strong>{b.date} · {bookingTimeLabel(b.time)} IST</strong>{b.end_at&&<p>Until {new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(b.end_at*1000))} IST · {bookingDuration(b.start_at,b.end_at)}</p>}<span className={'booking-status '+b.status}>{({pending:'Awaiting confirmation',confirmed:'Confirmed',declined:'Unavailable',cancelled:'Cancelled'} as any)[b.status]}</span><p><Users size={14}/> {b.guests} guests · {b.purpose}</p>{admin&&<p>{b.customer_name} · {b.customer_phone}</p>}{b.notes&&<p>{b.notes}</p>}{b.status==='confirmed'&&<p><strong>Tables: {JSON.parse(b.table_ids||'[]').join(', ')||'Awaiting assignment'}</strong></p>}{admin&&['pending','confirmed'].includes(b.status)?<><fieldset className="booking-table-picker"><legend>Assign tables · {b.guests} seats needed</legend>{tables.map(t=>{const blocked=!t.enabled||occupied.some(o=>o.id!==b.id&&bookingsOverlap(o,b)&&JSON.parse(o.table_ids||'[]').includes(t.id));const chosen=assignments[b.id]||JSON.parse(b.table_ids||'[]');return <label key={t.id} className={blocked?'blocked':''}><input type="checkbox" disabled={busy||blocked} checked={chosen.includes(t.id)} onChange={e=>setAssignments({...assignments,[b.id]:e.target.checked?[...chosen,t.id]:chosen.filter((id:string)=>id!==t.id)})}/>{t.id} · {t.seats} seats {blocked?'(unavailable)':''}</label>})}<small>Selected capacity: {tables.filter(t=>(assignments[b.id]||JSON.parse(b.table_ids||'[]')).includes(t.id)).reduce((n,t)=>n+t.seats,0)} seats</small></fieldset><div className="booking-actions"><button className="primary" disabled={busy} onClick={()=>change(b.id,'confirmed')}>{b.status==='confirmed'?'Save table assignment':'Confirm booking'}</button><button className="secondary" disabled={busy} onClick={()=>change(b.id,b.status==='confirmed'?'cancelled':'declined')}>{b.status==='confirmed'?'Cancel booking':'Decline'}</button></div></>:!admin&&['pending','confirmed'].includes(b.status)&&<button className="text-button" disabled={busy} onClick={()=>change(b.id,'cancelled')}>Cancel booking</button>}</article>)}</div>
 </>}</div>}
 </section>
}
