'use client';
import {SubscriptionBalance} from './subscription-tracker';
import {subscriptionSummary} from '../lib/subscription-calculations';
import SubscriptionPlanCard from './subscription-plan-card';
import PromotionBanners from './promotion-banners';
import type {SubscriptionAdvertisement} from '../lib/subscription-advertisements';
import './subscription-advertisements.css';
import {useEffect,useState,useRef} from 'react';
import {customerJson,singleFlight} from '../lib/customer-flow';
import {hostedCheckoutUrl} from '../lib/sandbox-checkout';
import {paymentRequest} from '../lib/payment-request';
import {Check} from 'lucide-react';
export default function CoffeeSubscriptions({onMenu}:{onMenu:()=>void}) {
 const slider=useRef<HTMLDivElement>(null);
 const [selected,setSelected]=useState(0);
 const [plans,setPlans]=useState<any[]>([]);
 const [advertisements,setAdvertisements]=useState<SubscriptionAdvertisement[]>([]);
 const [reload,setReload]=useState(0);
 function selectPlan(index:number){const el=slider.current;if(!el)return;const cards=el.children;if(!cards[index])return;el.scrollTo({left:(cards[index] as HTMLElement).offsetLeft-(cards[0] as HTMLElement).offsetLeft,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});setSelected(index)}
 const [provider,setProvider]=useState<string|null>(null),[redemptionEnabled,setRedemptionEnabled]=useState(false);
 const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[passes,setPasses]=useState<any[]>([]);
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
    const c=config.value;setEnabled(c.enabled===true);setProvider(c.provider??null);setRedemptionEnabled(c.redemptionEnabled===true);
    setAdvertisements(c.advertisements || []);
    setPlans((c.plans||[]).map((p:any)=>({...p,price:new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(p.amount/100),validity:p.days+' days',badge:p.credits+(p.itemScope==='menu'?' ITEM CREDITS':' COFFEES'),note:'Use credits any time before expiry. Unused credits expire without rollover.'})));
   }else failures.push(config.reason.message||'Unable to load subscription plans.');
   if(balance.status==='fulfilled'){setPasses(balance.value.subscriptions||[]);}
   else failures.push(balance.reason.message||'Unable to load your balance.');
   setError(failures.join(' '));
  });
  void refresh();const timer=setInterval(refresh,30000);
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[reload]);
 async function purchase(planId:string){
  if(busy)return;
  setBusy(true);setError('');
  try{
   const order=await customerJson('subscriptions/purchase',{method:'POST',data:{planId}});
   const checkout=await paymentRequest(order.orderId+'/start',{});
   location.assign(checkout.paid?'/payment-return?order='+order.orderId:hostedCheckoutUrl(checkout.provider,checkout.mode,checkout.redirectUrl));
  }catch(error){setError((error as Error).message);setBusy(false);}
 }
 return <section className="subscription-content" aria-label="Subscription plans">
  <div className="subscription-intro subscription-official-quote"><h1>Your favourites, one subscription away.</h1></div>
  {provider==='cashfree'&&!enabled&&<p className="subscription-status" role="status">Online checkout is being set up.</p>}
  {advertisements.length > 0 && (
   <div className="subscription-advertisements">
    <PromotionBanners label="Subscription offers" banners={advertisements.map(banner => ({ ...banner, action: 'View plan' }))}
     onAction={banner => {
      const index = plans.findIndex(plan => plan.id === banner.planId);
      if (index === -1) return;
      selectPlan(index);
      slider.current?.scrollIntoView({ block: 'start' });
      slider.current?.focus({ preventScroll: true });
     }} />
   </div>
  )}
  {passes.filter(pass => ['active','exhausted'].includes(pass.status)).map((pass, index) => (
   <div key={pass.id}>
    <SubscriptionBalance
     title={pass.planName + ' · ' + (index + 1)}
     data={subscriptionSummary([pass])}
     redemptionCode={redemptionEnabled}
     onRedeemed={()=>setReload(value=>value+1)}
    />
   </div>
  ))}
  <div className="subscription-plan-slider subscription-product-slider" ref={slider} role="region" tabIndex={0} aria-label="Swipe through coffee plans" onKeyDown={e=>{if(e.key==='ArrowRight'){e.preventDefault();selectPlan(Math.min(plans.length-1,selected+1))}if(e.key==='ArrowLeft'){e.preventDefault();selectPlan(Math.max(0,selected-1))}}} onScroll={e=>{const el=e.currentTarget;if(el.children.length<2){setSelected(0);return;}const width=(el.children[1] as HTMLElement).offsetLeft-(el.children[0] as HTMLElement).offsetLeft;setSelected(Math.min(plans.length-1,Math.max(0,Math.round(el.scrollLeft/width))))}}>
  {plans.map((plan,index)=>{
   const purchasedPasses = passes.filter(pass => pass.planId === plan.id && ['active','exhausted','upcoming'].includes(pass.status));
   const activePass = purchasedPasses.some(pass => pass.status === 'active');
   const remainingCredits = purchasedPasses.reduce((total, pass) => total + (pass.status === 'active' ? pass.remainingCredits : 0), 0);
   return <article key={plan.id} className={"subscription-plan subscription-slide-card"+(selected===index?" is-selected":"")} aria-labelledby={'subscription-'+plan.id+'-title'}>
   <SubscriptionPlanCard plan={plan} titleId={'subscription-'+plan.id+'-title'} purchasedCount={purchasedPasses.length}/>
   <details className="subscription-plan-details"><summary>Plan details</summary><p className="subscription-included-details">Includes: {plan.itemScope==='menu'?(plan.includedItems||[]).map((i:any)=>i.name).join(', '):'Coffee selection'}</p><ul className="subscription-benefits"><li><Check size={18} aria-hidden="true"/><span><strong>{plan.credits} credits</strong>{'One code per included item. Unused credits expire.'}</span></li><li><Check size={18} aria-hidden="true"/><span><strong>{plan.validity} validity</strong>From the verified purchase date</span></li><li><Check size={18} aria-hidden="true"/><span><strong>10% off app orders</strong>While the subscription is active</span></li></ul>
   <p className="subscription-clarification">{plan.note}</p></details>
   {!activePass&&<button className="primary" disabled={busy||!enabled} onClick={()=>purchase(plan.id)}>{busy?'Opening checkout…':'Buy '+plan.name}</button>}
   {(activePass||enabled||provider!=='cashfree')&&<p className="subscription-status">{activePass?`${remainingCredits} credits remaining across your purchases of this plan.`:enabled?'Secure online checkout':'Online purchases are currently unavailable.'}</p>}
  </article>})}
  </div>
  {!plans.length&&<p>No subscription plans are currently available.</p>}
  {error&&<div className="phone-error" role="alert"><p>{error}</p><button type="button" className="secondary" disabled={busy} onClick={()=>setReload(n=>n+1)}>Retry subscriptions</button></div>}


 </section>;
}
