import './subscription-plan-symbol.css';
import {Coffee,UtensilsCrossed} from 'lucide-react';
import {subscriptionAppearance} from '../lib/subscription-appearance';

export default function SubscriptionPlanSymbol({scope,items=[],size=24}:{scope?:string;items?:{categoryId?:string}[];size?:number}) {
 const type=subscriptionAppearance(scope,items);
 return <span className="subscription-plan-symbol" aria-hidden="true">
  {type!=='food'&&<Coffee size={size}/>}
  {type!=='coffee'&&<UtensilsCrossed size={size}/>}
 </span>;
}
