import {subscriptionSummary} from './subscription-calculations.ts';
export function applySubscriberDiscount<T extends {subtotal:number;discount:number;tax:number;fee:number;total:number}>(quote:T,taxBps:number,eligible:boolean){
 if(!eligible)return {...quote,discountLabel:'Discount'};
 const benefit=Math.round(quote.subtotal*.1);
 // Use the better benefit without stacking a coupon with the subscription offer.
 if(benefit<quote.discount)return {...quote,discountLabel:'Discount'};
 const discount=benefit,tax=Math.round((quote.subtotal-discount)*taxBps/10000);
 return {...quote,discount,tax,total:quote.subtotal-discount+tax+quote.fee,discountLabel:'Subscriber discount (10%)'};
}
export async function subscriberQuote<T extends {subtotal:number;discount:number;tax:number;fee:number;total:number}>(d:any,user:any,quote:T,settings:any,now=Date.now()){
 if(!user?.userId||user.admin)return applySubscriberDiscount(quote,settings.taxBps,false);
 const rows=await d.prepare(`SELECT s.id,s.plan_name AS planName,(s.total_credits+s.bonus_credits) AS totalCredits,s.starts_at AS startsAt,s.expires_at AS expiresAt,s.revoked,p.amount AS amountPaid,COALESCE((SELECT SUM(r.credits) FROM coffee_redemptions r WHERE r.subscription_id=s.id AND r.reversed_at IS NULL),0) AS usedCredits FROM coffee_subscriptions s JOIN payments p ON p.id=s.payment_id JOIN orders o ON o.id=p.order_id WHERE s.user_id=? AND o.user_id=s.user_id AND o.payment_status='paid' AND o.status!='cancelled'`).bind(user.userId).all();
 const eligible=rows.results.some((r:any)=>{try{return ['active','exhausted'].includes(subscriptionSummary([{...r,revoked:!!r.revoked}],now).subscriptions[0].status)}catch{return false}});
 return applySubscriberDiscount(quote,settings.taxBps,eligible);
}
