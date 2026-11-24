'use client';
import {bookingSlots,slotTime,bookingTimeLabel,bookingDay,bookingDuration,tableBookingFeePaise} from '../lib/table-booking';
import {useEffect,useState,useRef} from 'react';
import {onLiveUpdate} from './use-live-updates';
import {hostedCheckoutUrl} from '../lib/sandbox-checkout';
import {customerJson} from '../lib/customer-flow';
import {reservedCafeTableIds} from '../lib/cafe-table-manager';
import {CalendarDays,Users,ChevronDown} from 'lucide-react';
async function request(method='GET',data?:any,admin=false,signal?:AbortSignal){return customerJson((admin?'admin/':'')+'table-bookings',{method,data,signal});}
type BookingFeedback={id:string;text:string;error?:boolean};
type TableAllocation = {id:string;allocation_id:string;table_id:string;table_ids:string;kind:'booking'|'hold'|'scan'|'visit';
 start_at:number;end_at:number;expires_at?:number|null};
type PaymentReview = {id:string;amount:number;start_at:number;customer_name:string};
const scheduleTime = new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
export default function TableBooking({user,admin=false,refreshVersion=0}:{user?:any;admin?:boolean;refreshVersion?:number}){
 const [open,setOpen]=useState(admin),[rows,setRows]=useState<any[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [tables,setTables]=useState<any[]>([]),[occupied,setOccupied]=useState<TableAllocation[]>([]),[assignments,setAssignments]=useState<Record<string,string[]>>({});
 const [paymentReviews,setPaymentReviews]=useState<PaymentReview[]>([]),[canCloseVisits,setCanCloseVisits]=useState(false);
 const [paymentProvider,setPaymentProvider]=useState<string|null>(null);
 const [bookingAmount,setBookingAmount]=useState(tableBookingFeePaise);
 const [canBookOnline,setCanBookOnline]=useState<boolean|null>(null);
 const [bookingFeedback,setBookingFeedback]=useState<BookingFeedback|null>(null);
 const [editingAssignment,setEditingAssignment]=useState<string|null>(null);
 const [availability,setAvailability]=useState<{query:string;seats?:number;error?:string}|null>(null);
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
    setRows(result.bookings);setTables(result.tables||[]);setOccupied(result.occupied||[]);
    setCanBookOnline(result.canBookOnline===true);setPaymentProvider(result.paymentProvider??null);if(Number.isSafeInteger(result.bookingFeePaise))setBookingAmount(result.bookingFeePaise);
    setPaymentReviews(result.paymentReviews||[]);setCanCloseVisits(result.canCloseVisits===true);setError('');
   }catch(e){if(alive.current&&!controller.signal.aborted&&ownerRef.current===requestOwner)setError((e as Error).message);}
  })().finally(()=>{if(refreshState.current?.controller===controller)refreshState.current=null;});
  refreshState.current={controller,promise};return promise;
 }
 useEffect(()=>{
  alive.current=true;setRows([]);setTables([]);setOccupied([]);setAssignments({});setBookingFeedback(null);setEditingAssignment(null);setError('');setBusy(false);
  const wake=()=>{if(document.visibilityState==='visible')void refresh();};
  if(open&&(user||admin)){
   wake();const timer=setInterval(wake,admin?5000:30000);window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);
   const stopLiveUpdates=onLiveUpdate(admin?['bookings','orders']:['bookings'],wake);
   return()=>{alive.current=false;refreshState.current?.controller.abort();refreshState.current=null;clearInterval(timer);stopLiveUpdates();window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake);};
  }
  return()=>{alive.current=false;refreshState.current?.controller.abort();refreshState.current=null;};
 },[open,owner,admin]);
 const lastRefresh=useRef(refreshVersion);
 useEffect(()=>{
  if(lastRefresh.current===refreshVersion)return;
  lastRefresh.current=refreshVersion;
  if(admin)void refresh(true);
 },[admin,refreshVersion]);

 useEffect(()=>{if(admin)return;const show=()=>{sessionStorage.removeItem('espresso-open-bookings');setOpen(true);requestAnimationFrame(()=>document.querySelector('.table-booking-section')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}))};window.addEventListener('espresso-open-bookings',show);if(sessionStorage.getItem('espresso-open-bookings'))show();return()=>window.removeEventListener('espresso-open-bookings',show)},[admin]);
 async function change(id:string,status:string,tableIds?:string[]){
  if(busy)return;
  setBusy(true);setError('');setBookingFeedback(null);
  try{
   await request('PATCH',{id,status,...(tableIds?{tableIds}:{})},admin);
   if(admin){
    setAssignments(({[id]:saved,...other})=>other);
    setEditingAssignment(current=>current===id?null:current);
   }
   if(tableIds){
    setRows(current=>current.map(row=>row.id===id?{...row,status,table_ids:JSON.stringify(tableIds)}:row));
    setBookingFeedback({id,text:'Table assignment saved · '+tableIds.join(', ')});
   }
   await refresh(true);
  }catch(e){
   const text=(e as Error).message;
   if(admin)setBookingFeedback({id,text,error:true});else setError(text);
  }finally{setBusy(false)}
 }
 const availabilityQuery=open&&!admin&&canBookOnline&&user&&date&&time&&endTime
  ?new URLSearchParams({date,time,endTime,guests:String(guests)}).toString():'';
 useEffect(()=>{
  if(!availabilityQuery)return;
  const controller=new AbortController();
  let checking=false;
  async function check(){
   if(checking||document.hidden)return;
   checking=true;
   try{
    const result=await customerJson('table-bookings/availability?'+availabilityQuery,{signal:controller.signal});
    if(!controller.signal.aborted)setAvailability({query:availabilityQuery,seats:result.availableSeats});
   }catch(error){
    if(!controller.signal.aborted)setAvailability({query:availabilityQuery,error:(error as Error).message});
   }finally{checking=false;}
  }
  void check();
  const timer=setInterval(check,15000);
  window.addEventListener('focus',check);
  return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',check);};
 },[availabilityQuery]);
 const currentAvailability=availability?.query===availabilityQuery?availability:null;
 const seatsAvailable=(currentAvailability?.seats??0)>=guests;
 const bookingFee=bookingAmount/100;

 async function payForBooking(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(busy||!canBookOnline||!seatsAvailable)return;
  setBusy(true);setError('');setMessage('');
  try{
   const result=await request('POST',{date,time,endTime,guests,purpose,notes});
   if(result.state==='paid'){
    setMessage('Booking fee verified. The café will review your request.');
    await refresh(true);
    return;
   }
   if(result.state==='review')throw Error('Your payment is being reviewed by the café.');
   location.assign(hostedCheckoutUrl(result.provider,result.mode??'test',result.redirectUrl));
  }catch(error){setError((error as Error).message);}
  finally{setBusy(false);}
 }

 const now=Date.now()/1000;
 const currentAllocations=occupied.filter(entry=>entry.start_at<=now&&(entry.kind==='visit'||entry.end_at>now));
 async function closeVisit(id:string,table:string){
  setBusy(true);setError('');
  try{
   await customerJson('admin/table-visits',{method:'PATCH',data:{id}});
   setMessage(`${table} visit closed.`);
   await refresh(true);
  }catch(error){setError((error as Error).message);}
  finally{setBusy(false);}
 }
 return <section className="table-booking-section">
 <div className="booking-intro"><span className="booking-icon"><CalendarDays size={27}/></span><div><small>MAKE ROOM FOR YOUR PLANS</small><h2>{admin?'Table bookings':'Your table. Your time.'}</h2><p>{admin?'Review requests before confirming table availability.':'Meet, catch up, or celebrate over coffee.'}</p></div></div>
 {admin&&<div className="table-inventory">
 <h3>Shared table schedule</h3><p>Placed dine-in orders and reservations. Scanning alone does not occupy a table. Close a visit when the guests leave.</p>
 <div className="table-grid">{tables.map(table=>{
  const current=currentAllocations.filter(entry=>entry.table_id===table.id);
  const visit=current.find(entry=>entry.kind==='visit');
  const next=occupied.find(entry=>entry.table_id===table.id&&entry.start_at>now);
  const status=!table.enabled?'Disabled':visit?'In use':current.some(entry=>entry.kind==='booking')?'Reserved':current.length?'Booking hold':'Available now';
  const locked=current.length>0||Boolean(next);
  return <div key={table.id} className="schedule-table-cell">
   <button type="button" className="table-tile" data-availability={status==='Available now'?'available':'unavailable'}
   disabled={busy||locked} aria-label={table.id+', '+table.seats+' seats, '+status+(locked?'':'. Toggle availability')}
   onClick={async()=>{
    setBusy(true);
    try{await customerJson('admin/cafe-tables',{method:'PATCH',data:{id:table.id,enabled:!table.enabled}});await refresh(true)}
    catch(e){setError((e as Error).message)}
    finally{setBusy(false)}
   }}>
   <strong>{table.id}</strong><span>{table.seats} seats</span><small>{status}</small>
   </button>
   {visit&&canCloseVisits&&<button type="button" className="text-button schedule-close-visit" disabled={busy}
     aria-label={`Close visit at ${table.id}`} onClick={()=>void closeVisit(visit.allocation_id,table.id)}>Close visit</button>}
   {next&&<small className="schedule-next">
    {next.kind==='booking'?'Next reservation':'Next booking hold'} · {scheduleTime.format(next.start_at*1000)} IST
   </small>}
  </div>;
 })}</div>
 {paymentReviews.length>0&&<div className="schedule-payment-reviews">
  <h4>Booking payments to review</h4>
  {paymentReviews.map(payment=><p key={payment.id}><strong>{payment.customer_name}</strong> · ₹{payment.amount/100} · {scheduleTime.format(payment.start_at*1000)} IST<br />
  <small>{payment.id} · verified payment without a table hold</small></p>)}
 </div>}
 </div>}
 {!admin&&<button className="primary booking-toggle" aria-expanded={open} onClick={()=>setOpen(!open)}>Book a table <ChevronDown size={18}/></button>}
 {open&&<div className="booking-body">{!admin&&!user?<p>Sign in to request a table booking.</p>:<>
 {error&&<p role="alert" className="error-banner">{error}</p>}{message&&<p role="status" className="booking-message">{message}</p>}
 {!admin&&canBookOnline===false&&<p>Contact the café to reserve a table.</p>}
 {!admin&&<form onSubmit={payForBooking}>
 <div className="booking-fields"><label>Café day<input type="date" required min={bookingDay()} value={date} onChange={e=>setDate(e.target.value)}/></label><label>Check-in (IST)<select required value={time} onChange={e=>{setTime(e.target.value);setEndTime('')}}><option value="">Select arrival</option>{bookingSlots.slice(0,-1).map(m=><option key={m} value={slotTime(m)}>{bookingTimeLabel(slotTime(m))}{m>=1440?' · next day':''}</option>)}</select></label><label>Check-out (IST)<select required disabled={!time} value={endTime} onChange={e=>setEndTime(e.target.value)}><option value="">Select departure</option>{ends.map(m=><option key={m} value={slotTime(m)}>{bookingTimeLabel(slotTime(m))}{m>=1440?' · next day':''}</option>)}</select></label><label>Guests<select value={guests} onChange={e=>setGuests(Number(e.target.value))}>{Array.from({length:20},(_,n)=><option key={n} value={n+1}>{n+1}</option>)}</select></label><label>Visit type<select value={purpose} onChange={e=>setPurpose(e.target.value)}>{['Office meeting','Catch-up','Celebration','Visit'].map(p=><option key={p}>{p}</option>)}</select></label></div>
 {time&&endTime&&<div className="booking-duration">Time at the café <strong>{bookingDuration(slotMinute(time)*60,slotMinute(endTime)*60)}</strong></div>}
 <label>Anything we should know? <textarea maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Seating preferences or meeting details (optional)"/></label>
 <p className="fine-print">Open daily: 6:00 AM–2:00 AM next day · All times are IST (India). Choose check-in and check-out in 30-minute steps. Times marked “next day” fall after your selected café day. Booking details show the actual arrival date. Request up to 30 days ahead; staff confirmation follows verified payment.</p>{availabilityQuery&&<p className="booking-slot-status" role="status">{currentAvailability?.error
  ??(currentAvailability?.seats===undefined?'Checking tables…':seatsAvailable?'Tables available for this time.':'Not enough seats at this time. Try another slot.')}</p>}
 {canBookOnline&&<p className="fine-print">Secure online checkout</p>}
 <button className="primary" disabled={busy||!canBookOnline||!seatsAvailable}>{busy?'Opening checkout…':'Pay ₹'+bookingFee+' to request booking'}</button></form>}
 <div className="booking-list"><div className="booking-list-heading"><h3>{admin?'Booking requests':'My bookings'}</h3><button className="text-button" disabled={busy} onClick={()=>void refresh(true)}>Refresh</button></div>{!rows.length&&<p>No booking requests yet.</p>}{rows.map(b=>{
  const saved=JSON.parse(b.table_ids||'[]') as string[];
  const chosen=assignments[b.id]??saved;
  const canAssign=admin&&(b.status==='pending'||(b.status==='confirmed'&&editingAssignment===b.id));
  const reserved=canAssign?reservedCafeTableIds(occupied,b,b.id):new Set<string>();
  const selected=canAssign?tables.filter(table=>chosen.includes(table.id)):[];
  const capacity=selected.reduce((count,table)=>count+table.seats,0);
  const unavailable=selected.length!==chosen.length||selected.some(table=>!table.enabled||reserved.has(table.id));
  const feedback=bookingFeedback?.id===b.id?bookingFeedback:null;

  function saveAssignment(){
   const message=unavailable?'Remove unavailable tables before saving.'
    :capacity<b.guests?'Select enough available seats for all '+b.guests+' guests.':'';
   if(message){setBookingFeedback({id:b.id,text:message,error:true});return}
   const tableIds=selected.map(table=>table.id as string);
   if(b.status==='confirmed'&&tableIds.length===saved.length&&tableIds.every(id=>saved.includes(id))){
    setBookingFeedback({id:b.id,text:'Tables already assigned · '+tableIds.join(', ')});
    setEditingAssignment(null);
    return;
   }
   void change(b.id,'confirmed',tableIds);
  }

  return <article className="booking-row" key={b.id}>
   <strong>{b.date} · {bookingTimeLabel(b.time)} IST</strong>
   {b.end_at&&<p>Until {new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(b.end_at*1000))} IST · {bookingDuration(b.start_at,b.end_at)}</p>}
   <span className={'booking-status '+b.status}>{({pending:'Awaiting confirmation',confirmed:'Confirmed',declined:'Unavailable',cancelled:'Cancelled'} as any)[b.status]}</span>
   <p><Users size={14}/> {b.guests} guests · {b.purpose}</p>
   {admin&&<p>{b.customer_name} · {b.customer_phone}</p>}
   {b.notes&&<p>{b.notes}</p>}
   {b.booking_fee&&<p className="booking-fee-paid">₹{b.booking_fee/100} booking fee verified</p>}
   {b.status==='confirmed'&&<p><strong>Tables: {saved.join(', ')||'Awaiting assignment'}</strong></p>}
   {!canAssign&&feedback&&<p className="booking-assignment-feedback" role={feedback.error?'alert':'status'}>{feedback.text}</p>}
   {admin&&b.status==='confirmed'&&!canAssign&&<button type="button" className="text-button" disabled={busy} onClick={()=>{
    setEditingAssignment(b.id);setBookingFeedback(null);
   }}>Change tables</button>}
   {canAssign?<><fieldset className="booking-table-picker">
    <legend>Assign tables · {b.guests} seats needed</legend>
    {tables.filter(table=>chosen.includes(table.id)||(table.enabled&&!reserved.has(table.id))).map(table=>{
     const status=!table.enabled?'Disabled':reserved.has(table.id)?'Booked for this time':'Available';
     const blocked=status!=='Available';
     const checked=chosen.includes(table.id);
     return <label key={table.id} data-availability={blocked?'unavailable':'available'}>
      <input type="checkbox" disabled={busy||(blocked&&!checked)} checked={checked} onChange={event=>{
       const isChecked=event.currentTarget.checked;
       setAssignments(current=>{
        const previous=current[b.id]??saved;
        return {...current,[b.id]:isChecked?[...previous,table.id]:previous.filter(id=>id!==table.id)};
       });
       setBookingFeedback(current=>current?.id===b.id?null:current);
      }}/>
      <span><strong>{table.id}</strong> · {table.seats} seats<small>{status}</small></span>
     </label>;
    })}
    <small>Selected capacity: {capacity} seats</small>
   </fieldset>
   {feedback&&<p className="booking-assignment-feedback" role={feedback.error?'alert':'status'}>{feedback.text}</p>}
   <div className="booking-actions">
    <button className="primary" disabled={busy} onClick={saveAssignment}>{b.status==='confirmed'?'Save table assignment':'Confirm booking'}</button>
    <button className="secondary" disabled={busy} onClick={()=>change(b.id,b.status==='confirmed'?'cancelled':'declined')}>{b.status==='confirmed'?'Cancel booking':'Decline'}</button>
    {b.status==='confirmed'&&<button type="button" className="text-button" disabled={busy} onClick={()=>{
     setEditingAssignment(null);setBookingFeedback(null);
     setAssignments(({[b.id]:discarded,...other})=>other);
    }}>Close</button>}
   </div>
   </>:!admin&&b.status==='pending'&&<button className="text-button" disabled={busy} onClick={()=>change(b.id,'cancelled')}>Cancel booking</button>}
  </article>;
 })}</div>
 </>}</div>}
 </section>
}
