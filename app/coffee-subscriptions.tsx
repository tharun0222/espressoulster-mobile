'use client';
import SubscriptionItemBanner from './subscription-item-banner';
import SubscriptionDailyCode from './subscription-daily-code';
import {useEffect,useState,useRef} from 'react';
import {customerJson,singleFlight} from '../lib/customer-flow';
import {paymentRequest} from '../lib/payment-request';
import {Coffee,Check} from 'lucide-react';
export default function CoffeeSubscriptions({onMenu}:{onMenu:()=>void}) {
 const slider=useRef<HTMLDivElement>(null);
 const [selected,setSelected]=useState(0);
 const [plans,setPlans]=useState<any[]>([]);
 const [reload,setReload]=useState(0);
 function selectPlan(index:number){const el=slider.current;if(!el)return;const cards=el.children;if(!cards[index])return;el.scrollTo({left:(cards[index] as HTMLElement).offsetLeft-(cards[0] as HTMLElement).offsetLeft,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});setSelected(index)}
 const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[balance,setBalance]=useState<any>(null),[passes,setPasses]=useState<any[]>([]);
 useEffect(()=>{
  let active=true;const controller=new AbortController();
  const refresh=singleFlight(async()=>{
   if(document.visibilityState!=='visible')return;
   const [config,balance]=await Promise.allSettled([
    customerJson('subscriptions/config',{signal:controller.signal}),
    customerJson('subscriptions',{signal:controller.signal}),
   ]);
   if(!active)return;
   const failures:string[]=[];
   if(config.status==='fulfilled'){
    const c=config.value;setEnabled(c.testEnabled===true);
    setPlans((c.plans||[]).map((p:any)=>({...p,price:new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(p.amount/100),validity:p.days+' days',badge:p.credits+(p.itemScope==='menu'?' ITEM CREDITS':' COFFEES'),note:'One included item per day; unused credits expire without rollover.'})));
   }else failures.push(config.reason.message||'Unable to load subscription plans.');
   if(balance.status==='fulfilled'){setBalance(balance.value.summary);setPasses(balance.value.subscriptions||[]);}
   else failures.push(balance.reason.message||'Unable to load your balance.');
   setError(failures.join(' '));
  });
  void refresh();const timer=setInterval(refresh,30000);
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[reload]);
 async function purchase(planId:string){if(busy)return;setBusy(true);setError('');try{const r=await fetch('/api/subscriptions/test-purchase',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({planId})}),b:any=await r.json();if(!r.ok)throw Error(b.error||'Unable to start test subscription');const checkout=await paymentRequest(b.orderId+'/start',{});if(checkout.paid){location.assign('/payment-return?order='+b.orderId);return;}const target=new URL(checkout.redirectUrl);if(target.protocol!=='https:'||target.hostname!=='checkout.stripe.com'||target.port||target.username||target.password)throw Error('Invalid sandbox checkout address');location.assign(target.href);}catch(e){setError((e as Error).message);setBusy(false)}}
 return <section className="subscription-content" aria-label="Subscription plans">
  <div className="subscription-intro subscription-official-quote"><h1>Your favourites, one subscription away.</h1></div>
  <div className="subscription-plan-slider subscription-product-slider" ref={slider} role="region" tabIndex={0} aria-label="Swipe through coffee plans" onKeyDown={e=>{if(e.key==='ArrowRight'){e.preventDefault();selectPlan(Math.min(plans.length-1,selected+1))}if(e.key==='ArrowLeft'){e.preventDefault();selectPlan(Math.max(0,selected-1))}}} onScroll={e=>{const el=e.currentTarget;if(el.children.length<2){setSelected(0);return;}const width=(el.children[1] as HTMLElement).offsetLeft-(el.children[0] as HTMLElement).offsetLeft;setSelected(Math.min(plans.length-1,Math.max(0,Math.round(el.scrollLeft/width))))}}>
  {plans.map((plan,index)=>{const activePass=passes.find(p=>p.planId===plan.id&&p.status==='active');return <article key={plan.id} className={"subscription-plan subscription-slide-card"+(selected===index?" is-selected":"")} aria-labelledby={'subscription-'+plan.id+'-title'}>
   <div className="subscription-plan-top"><span className="subscription-badge">{plan.badge}</span><Coffee size={28} aria-hidden="true"/></div>
   <SubscriptionItemBanner items={plan.itemScope==='menu'?plan.includedItems:[]} credits={plan.credits} banner={plan.banner}/>
   <p className="eyebrow">ESPRESSOULSTER COFFEE PASS</p><h3 id={'subscription-'+plan.id+'-title'}>{plan.name}</h3>
   <div className="subscription-price">{plan.price} <span>one-time plan price</span></div>
   <p className="subscription-plan-summary">{plan.validity} · 1 included item daily · 10% off app orders</p>
   <p className="subscription-includes">Includes: {plan.itemScope==='menu'?(plan.includedItems||[]).map((i:any)=>i.name).join(', '):'Coffee selection'}</p>
   <details className="subscription-plan-details"><summary>Plan details</summary><p className="subscription-included-details">Includes: {plan.itemScope==='menu'?(plan.includedItems||[]).map((i:any)=>i.name).join(', '):'Coffee selection'}</p><ul className="subscription-benefits"><li><Check size={18} aria-hidden="true"/><span><strong>{plan.credits} credits</strong>{'One included item per day; unused credits expire'}</span></li><li><Check size={18} aria-hidden="true"/><span><strong>{plan.validity} validity</strong>From the verified purchase date</span></li><li><Check size={18} aria-hidden="true"/><span><strong>10% off app orders</strong>While the subscription is active</span></li></ul>
   <p className="subscription-clarification">{plan.note}</p></details>
   <button className="primary" disabled={!enabled||busy||!!activePass} onClick={()=>purchase(plan.id)}>{busy?'Opening Stripe sandbox…':activePass?'Test pass active':'Buy '+plan.name}</button>
   <p className="subscription-status">{activePass?`${activePass.remainingCredits} credits remaining in this plan.`:enabled?'Stripe sandbox · no real money collected':'Sandbox subscriptions are unavailable.'}</p>
  </article>})}
  </div>
  {!plans.length&&enabled&&<p role="status">No subscription plans are currently available.</p>}
  {error&&<div className="phone-error" role="alert"><p>{error}</p><button type="button" className="secondary" disabled={busy} onClick={()=>setReload(n=>n+1)}>Retry subscriptions</button></div>}
  {enabled&&balance?.activePlans>0&&<SubscriptionDailyCode onRedeemed={()=>customerJson('subscriptions').then((b:any)=>{setBalance(b.summary);setPasses(b.subscriptions||[])}).catch(()=>{})}/>}


 </section>;
}
