'use client';
import {useEffect,useState,type CSSProperties} from 'react';
import './subscription-tracker.css';
import SubscriptionPlanSymbol from './subscription-plan-symbol';
import {subscriptionAppearance} from '../lib/subscription-appearance';
import SubscriptionItemCode from './subscription-item-code';
import {Coffee,ChevronRight} from 'lucide-react';
import type {subscriptionSummary} from '../lib/subscription-calculations';
type Tracking=ReturnType<typeof subscriptionSummary>;
export default function SubscriptionTracker({userId,onOpen}:{userId?:string;onOpen:()=>void}){
 const [data,setData]=useState<Tracking|null>(null),[refresh,setRefresh]=useState(0);
 useEffect(()=>{setData(null);if(!userId)return;const abort=new AbortController();
  fetch('/api/subscriptions',{signal:abort.signal}).then(async r=>{const b:any=await r.json();if(!r.ok)throw Error(b.error||'Unable to load subscriptions');if(!abort.signal.aborted)setData(b);}).catch(()=>{if(!abort.signal.aborted)setData(null);});
  const focus=()=>setRefresh(n=>n+1);window.addEventListener('focus',focus);return()=>{abort.abort();window.removeEventListener('focus',focus);};
 },[userId,refresh]);
 return <SubscriptionBalance data={data} onOpen={onOpen} />;
}

export function SubscriptionBalance({data,onOpen,title="Every credit, accounted for.",redemptionCode=false,onRedeemed}:{data:Tracking|null;onOpen?:()=>void;title?:string;redemptionCode?:boolean;onRedeemed?:()=>void}){
 const s=data?.summary;
 if (!s?.totalCredits) return null;
 const pass=data!.subscriptions[0];
 const items=typeof pass.includedItems==='string'?JSON.parse(pass.includedItems):pass.includedItems||[];
 const coffeeOnly=subscriptionAppearance(pass.itemScope,items)==='coffee';
 return <section className="ritual-card subscription-tracker" aria-label="My subscription tracker">
  <div className="tracker-heading"><span className="eyebrow">YOUR SUBSCRIPTION</span><h2 className="tracker-plan-name"><SubscriptionPlanSymbol scope={pass.itemScope} items={items} size={24}/>{title}</h2><p>{s.remainingCredits?'Your next item is already included.':'All credits redeemed. Explore your next plan.'}</p></div>
  <div className="tracker-counts"><div><strong>{s.usedCredits}</strong><span>Credits used</span></div><div className="tracker-remaining"><strong>{s.remainingCredits}</strong><span>Credits left</span></div><div><strong>{s.totalCredits}</strong><span>Total credits</span></div></div>
  <div className="tracker-credit-strip" role="progressbar" aria-label="Subscription credits redeemed" aria-valuemin={0} aria-valuemax={s.totalCredits} aria-valuenow={s.usedCredits} aria-valuetext={`${s.usedCredits} of ${s.totalCredits} credits redeemed`}>
   <div className="tracker-credit-label" aria-hidden="true"><span>{coffeeOnly ? "YOUR COFFEE RITUAL" : "YOUR ITEM CREDITS"}</span><strong>{s.usedCredits} / {s.totalCredits}</strong></div>
   {s.totalCredits <= 24 ? <div className="tracker-credit-cells" key={s.usedCredits + ':' + s.totalCredits} aria-hidden="true">
    {Array.from({length:s.totalCredits}, (_, index) => {
     const used = index < s.usedCredits;
     return <span key={index} className={used ? 'credit-cell is-used' : 'credit-cell'} style={{'--credit-delay': Math.min(index * 90, 1400) + 'ms'} as CSSProperties}><SubscriptionPlanSymbol scope={pass.itemScope} items={items} size={14}/></span>;
    })}
   </div> : <div className="tracker-progress"><span className="tracker-progress-fill" style={{width:s.progressPercent+'%'}}><i className="tracker-progress-light" /></span></div>}
   <div className="tracker-credit-caption" aria-hidden="true"><span>Redeemed</span><span>{s.remainingCredits} left to enjoy</span></div>
  </div>
  <div className="tracker-meta">
   <div className="plan-credit-code-row">
    <span>{`${s.usedCredits} of ${s.totalCredits} credits redeemed`}</span>
    {redemptionCode && s.remainingCredits>0 && data!.subscriptions.length===1 && <SubscriptionItemCode key={data!.subscriptions[0].id} subscriptionId={data!.subscriptions[0].id} onRedeemed={onRedeemed} />}
   </div>{s.nextExpiry&&<span>Next expiry: {new Date(s.nextExpiry).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'})}</span>}<span>Plan value ₹{(s.amountPaid/100).toFixed(2)} · approx. ₹{(s.averagePerCoffee!/100).toFixed(2)} per item</span></div>
  {onOpen && <button className="tracker-open" onClick={onOpen}><span><Coffee size={15} aria-hidden="true"/> View subscription</span><ChevronRight size={16} aria-hidden="true"/></button>}
 </section>;
}
