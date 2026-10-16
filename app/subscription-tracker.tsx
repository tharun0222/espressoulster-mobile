'use client';
import {useEffect,useState} from 'react';
import {Coffee,ChevronRight,RefreshCw} from 'lucide-react';
import type {subscriptionSummary} from '../lib/subscription-calculations';
type Tracking=ReturnType<typeof subscriptionSummary>;
export default function SubscriptionTracker({userId,onOpen}:{userId?:string;onOpen:()=>void}){
 const [data,setData]=useState<Tracking|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{setData(null);setError('');if(!userId)return;const abort=new AbortController();
  fetch('/api/subscriptions',{signal:abort.signal}).then(async r=>{const b:any=await r.json();if(!r.ok)throw Error(b.error||'Unable to load subscriptions');if(!abort.signal.aborted)setData(b);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});
  const focus=()=>setRefresh(n=>n+1);window.addEventListener('focus',focus);return()=>{abort.abort();window.removeEventListener('focus',focus);};
 },[userId,refresh]);
 const s=data?.summary;
 const hasPass=!!s?.totalCredits;
 return <section className="ritual-card subscription-tracker" aria-label="My subscription tracker">
  <div className="tracker-heading"><span className="eyebrow">YOUR COFFEE SUBSCRIPTION</span><h2>Every coffee, accounted for.</h2><p>{!userId?'Sign in to see your coffee pass.':error?'Your balance could not be loaded.':!data?'Loading your coffee balance…':hasPass?s!.remainingCredits?'Your next coffee is already part of the ritual.':'All coffees redeemed. Time for your next ritual.':'No active coffee pass yet.'}</p></div>
  {userId&&s&&<><div className="tracker-counts"><div><strong>{s.usedCredits}</strong><span>Coffees used</span></div><div className="tracker-remaining"><strong>{s.remainingCredits}</strong><span>Coffees left</span></div><div><strong>{s.totalCredits}</strong><span>Total coffees</span></div></div>
  <div className="tracker-progress" role="progressbar" aria-label="Subscription coffees redeemed" aria-valuemin={0} aria-valuemax={s.totalCredits||1} aria-valuenow={s.usedCredits} aria-valuetext={hasPass?`${s.usedCredits} of ${s.totalCredits} coffees redeemed`:'No active subscription'}><span style={{width:s.progressPercent+'%'}}/></div>
  <div className="tracker-meta"><span>{hasPass?`${s.usedCredits} of ${s.totalCredits} coffees redeemed`:'Your balance starts after a verified subscription purchase'}</span>{s.nextExpiry&&<span>Next expiry: {new Date(s.nextExpiry).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'})}</span>}{hasPass&&<span>Plan value ₹{(s.amountPaid/100).toFixed(2)} · approx. ₹{(s.averagePerCoffee!/100).toFixed(2)} per coffee</span>}</div></>}
  {error&&<button onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={14}/> Retry balance</button>}
  <button className="tracker-open" onClick={onOpen}><span><Coffee size={15} aria-hidden="true"/> {hasPass?'View subscription':'Explore subscriptions'}</span><ChevronRight size={16} aria-hidden="true"/></button>
 </section>;
}
