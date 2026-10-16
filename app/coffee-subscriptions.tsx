'use client';
import SubscriptionDailyCode from './subscription-daily-code';
import {useEffect,useState,useRef} from 'react';
import {paymentRequest} from '../lib/payment-request';
import {Coffee,Check,ArrowRight} from 'lucide-react';
export default function CoffeeSubscriptions({onMenu}:{onMenu:()=>void}) {
 const slider=useRef<HTMLDivElement>(null);
 const [selected,setSelected]=useState(0);
 const plans=[{id:'weekly',name:'Weekly coffee pass',price:'₹1,599',credits:8,badge:'7 COFFEES + 1 ON US',note:'Weekly pass keeps its existing 30-day redemption validity. One coffee per day.'},{id:'monthly',name:'Monthly coffee pass',price:'₹6,000',credits:34,badge:'MONTHLY MEMBERSHIP',note:'One coffee per day: up to 30 redemptions in 30 days. Unused credits expire without rollover.'}];
 function selectPlan(index:number){const el=slider.current;if(!el)return;const cards=el.children;el.scrollTo({left:(cards[index] as HTMLElement).offsetLeft-(cards[0] as HTMLElement).offsetLeft,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});setSelected(index)}
 const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[balance,setBalance]=useState<any>(null),[passes,setPasses]=useState<any[]>([]);
 useEffect(()=>{let active=true;Promise.all([fetch('/api/subscriptions/config').then(r=>r.json()),fetch('/api/subscriptions').then(r=>r.json())]).then(([config,b]:any)=>{if(active){setEnabled(config.testEnabled===true);setBalance(b.summary);setPasses(b.subscriptions||[])}}).catch(()=>{if(active)setError('Unable to load subscriptions. Please reopen this page.')});return()=>{active=false}},[]);
 async function purchase(planId:string){if(busy)return;setBusy(true);setError('');try{const r=await fetch('/api/subscriptions/test-purchase',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({planId})}),b:any=await r.json();if(!r.ok)throw Error(b.error||'Unable to start test subscription');const checkout=await paymentRequest(b.orderId+'/start',{});if(checkout.paid){location.assign('/payment-return?order='+b.orderId);return;}const target=new URL(checkout.redirectUrl);if(target.protocol!=='https:'||target.hostname!=='checkout.stripe.com'||target.port||target.username||target.password)throw Error('Invalid sandbox checkout address');location.assign(target.href);}catch(e){setError((e as Error).message);setBusy(false)}}
 return <section className="subscription-content" aria-label="Coffee subscription plans">
  <div className="subscription-intro"><span className="eyebrow">COFFEE SUBSCRIPTIONS</span><h2>Your coffee pass</h2><p>Test your subscription with Stripe sandbox. No real money is collected.</p></div>
  <div className="subscription-plan-slider subscription-product-slider" ref={slider} role="region" tabIndex={0} aria-label="Swipe through coffee plans" onKeyDown={e=>{if(e.key==='ArrowRight'){e.preventDefault();selectPlan(1)}if(e.key==='ArrowLeft'){e.preventDefault();selectPlan(0)}}} onScroll={e=>{const el=e.currentTarget;const width=(el.children[1] as HTMLElement).offsetLeft-(el.children[0] as HTMLElement).offsetLeft;setSelected(Math.min(1,Math.max(0,Math.round(el.scrollLeft/width))))}}>
  {plans.map((plan,index)=>{const activePass=passes.find(p=>p.planId===plan.id&&['active','exhausted'].includes(p.status));return <article key={plan.id} className={"subscription-plan subscription-slide-card"+(selected===index?" is-selected":"")} aria-labelledby={'subscription-'+plan.id+'-title'}>
   <div className="subscription-plan-top"><span className="subscription-badge">{plan.badge}</span><Coffee size={28} aria-hidden="true"/></div>
   <div className="subscription-product-art"><img src="/images/launch-coffee.webp" alt="Coffee at Espressoulster"/><div className="subscription-credit-overlay"><strong>{plan.credits}</strong><span>coffee credits</span></div></div>
   <p className="eyebrow">ESPRESSOULSTER COFFEE PASS</p><h3 id={'subscription-'+plan.id+'-title'}>{plan.name}</h3>
   <div className="subscription-price">{plan.price} <span>one-time plan price</span></div>
   <p className="subscription-plan-summary">30 days · 1 coffee daily · 10% off app orders</p>
   <details className="subscription-plan-details"><summary>Plan details</summary><ul className="subscription-benefits"><li><Check size={18} aria-hidden="true"/><span><strong>{plan.credits} coffee credits</strong>{plan.id==='weekly'?'7 coffees plus 1 complimentary coffee':'One coffee per day; unused credits expire'}</span></li><li><Check size={18} aria-hidden="true"/><span><strong>30-day validity</strong>From the verified purchase date</span></li><li><Check size={18} aria-hidden="true"/><span><strong>10% off app orders</strong>While the subscription is active</span></li></ul>
   <p className="subscription-clarification">{plan.note}</p></details>
   <button className="primary" disabled={!enabled||busy||!!activePass} onClick={()=>purchase(plan.id)}>{busy?'Opening Stripe sandbox…':activePass?'Test pass active':'Buy '+plan.id+' test pass'}</button>
   <p className="subscription-status">{activePass?`${activePass.remainingCredits} coffees remaining in this plan.`:enabled?'Stripe sandbox · no real money collected':'Sandbox subscriptions are unavailable.'}</p>
  </article>})}
  </div>
  {error&&<p className="phone-error" role="alert">{error}</p>}
  {enabled&&<SubscriptionDailyCode onRedeemed={()=>fetch('/api/subscriptions').then(r=>r.json()).then((b:any)=>{setBalance(b.summary);setPasses(b.subscriptions||[])}).catch(()=>{})}/>}
  <section className="subscription-how"><h3>Testing your pass</h3><ol><li>Complete the Stripe sandbox checkout.</li><li>Reopen Subscriptions after payment to activate your verified test balance.</li><li>Track your remaining coffees and expiry in the app.</li></ol><p>Generate your daily code below. Staff can redeem one test coffee per day in admin. No real bill is changed.</p></section>
  <button className="secondary subscription-menu-link" onClick={onMenu}>Explore the coffee menu <ArrowRight size={17} aria-hidden="true"/></button>
 </section>;
}
