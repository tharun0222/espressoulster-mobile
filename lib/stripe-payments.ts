import {subscriptionSummary} from './subscription-calculations';
import {syncTestSubscription} from './subscription-test';
import {env} from 'cloudflare:workers';
import {db,limitedBytes} from './server';
import {createStripePayments} from './stripe-payment-core';
export async function stripePaymentRoute(path:string,req:Request,user:{userId:string}){
 const response=await createStripePayments(db(),env).route(path,req,user);
 if(!response?.ok)return response;
 const b:any=await response.clone().json();
 if(b.paid===true&&!b.refundReviewRequired){
  const orderId=b.orderId||/^payments\/(CH-[A-F0-9]{8})\//.exec(path)?.[1];
  if(!orderId)return response;
  const d=db();await syncTestSubscription(d,env,user.userId);
  const purchase=await d.prepare('SELECT order_id FROM subscription_test_purchases WHERE order_id=? AND user_id=? UNION ALL SELECT order_id FROM subscription_plan_test_purchases WHERE order_id=? AND user_id=? UNION ALL SELECT order_id FROM subscription_renewal_purchases WHERE order_id=? AND user_id=? UNION ALL SELECT order_id FROM subscription_extended_purchases WHERE order_id=? AND user_id=? UNION ALL SELECT order_id FROM subscription_purchase_snapshots WHERE order_id=? AND user_id=?').bind(orderId,user.userId,orderId,user.userId,orderId,user.userId,orderId,user.userId,orderId,user.userId).first();
  if(purchase){
   const row=await d.prepare(`SELECT s.id,s.plan_name AS planName,s.plan_id AS planId,COALESCE(s.purchased_credits,(s.total_credits+s.bonus_credits+s.extended_credits)) AS totalCredits,s.starts_at AS startsAt,s.expires_at AS expiresAt,s.revoked,p.amount AS amountPaid,COALESCE((SELECT SUM(r.credits) FROM coffee_redemptions r WHERE r.subscription_id=s.id AND r.reversed_at IS NULL),0) AS usedCredits FROM coffee_subscriptions s JOIN payments p ON p.id=s.payment_id WHERE p.order_id=? AND s.user_id=?`).bind(orderId,user.userId).first<any>();
   const subscription=row?subscriptionSummary([{...row,revoked:!!row.revoked}]).subscriptions[0]:null;
   return Response.json({...b,purchaseKind:'subscription',subscription},{status:response.status,headers:response.headers});
  }
 }
 return response;
}
export async function stripeWebhook(req:Request){const raw=new TextDecoder('utf-8',{fatal:true}).decode(await limitedBytes(req,128000));return createStripePayments(db(),env).webhook(req,raw)}
