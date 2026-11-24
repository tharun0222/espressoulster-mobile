import SubscriptionItemBanner from './subscription-item-banner';
import SubscriptionPlanSymbol from './subscription-plan-symbol';
import './subscription-plan-card.css';

type PlanCard = {
 name:string;amount:number;credits:number;days:number;itemScope?:string;
 includedItems?:any[];banner?:any;
};

export default function SubscriptionPlanCard({plan,titleId,purchasedCount=0}:{plan:PlanCard;titleId?:string;purchasedCount?:number}) {
 const items=plan.itemScope==='menu'?plan.includedItems||[]:[];
 const hasPrice=Number.isFinite(plan.amount)&&plan.amount>0;
 const price=hasPrice
  ?new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(plan.amount/100)
  :'Set a price';
 return <>
  <SubscriptionItemBanner items={items} credits={plan.credits||0} creditLabel={plan.itemScope==='coffee'?'coffees':'item credits'} banner={plan.banner} purchasedCount={purchasedCount}/>
  <div className="subscription-plan-top">
   <div className="subscription-plan-heading">
    <p className="eyebrow">ESPRESSOULSTER {plan.itemScope==='coffee'?'COFFEE':'ITEM'} PASS</p>
    <h3 id={titleId}>{plan.name||'Your subscription plan'}</h3>
   </div>
   <SubscriptionPlanSymbol scope={plan.itemScope} items={items} size={28}/>
  </div>
  <div className="subscription-price">{price}{hasPrice && <span>one-time plan price</span>}</div>
  <p className="subscription-plan-summary">{plan.days||0} days · Use credits any day · 10% off app orders</p>
  <p className="subscription-includes">Includes: {plan.itemScope==='coffee'?'Coffee selection':items.map(item=>item.name).join(', ')||'Select menu items'}</p>
 </>;
}
