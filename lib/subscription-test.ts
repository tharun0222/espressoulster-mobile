import {subscriptionPlan} from './subscription-plans.ts';
export function subscriptionTestEnabled(e:any){return e.PUBLIC_TEST_MODE==='true'&&e.PAYMENT_MODE==='test'&&e.PAYMENT_PROVIDER==='stripe';}
export async function syncTestSubscription(d:any,e:any,userId?:string){
 if(!subscriptionTestEnabled(e))return;
 await d.prepare(`INSERT OR IGNORE INTO coffee_subscriptions(id,user_id,payment_id,plan_name,total_credits,starts_at,expires_at)
 SELECT 'sandbox-pass-'||o.id,o.user_id,p.id,'Sandbox coffee pass',8,strftime('%Y-%m-%dT%H:%M:%fZ',p.created_at),strftime('%Y-%m-%dT%H:%M:%fZ',p.created_at,'+30 days')
 FROM subscription_test_purchases t JOIN orders o ON o.id=t.order_id AND o.user_id=t.user_id JOIN payments p ON p.order_id=o.id
 WHERE o.payment_status='paid' AND o.status!='cancelled' AND o.total=159900 AND p.amount=159900 AND p.method='stripe_test' AND p.verified_by='provider_verified_test' AND (? IS NULL OR o.user_id=?)`).bind(userId||null,userId||null).run();
 await d.prepare(`INSERT OR IGNORE INTO coffee_subscriptions(id,user_id,payment_id,plan_name,total_credits,bonus_credits,plan_id,starts_at,expires_at)
 SELECT 'sandbox-pass-'||o.id,o.user_id,p.id,CASE t.plan_id WHEN 'monthly' THEN 'Monthly coffee pass (sandbox)' ELSE 'Weekly coffee pass (sandbox)' END,8,CASE t.plan_id WHEN 'monthly' THEN 26 ELSE 0 END,t.plan_id,strftime('%Y-%m-%dT%H:%M:%fZ',p.created_at),strftime('%Y-%m-%dT%H:%M:%fZ',p.created_at,'+30 days')
 FROM subscription_plan_test_purchases t JOIN orders o ON o.id=t.order_id AND o.user_id=t.user_id JOIN payments p ON p.order_id=o.id
 WHERE o.payment_status='paid' AND o.status!='cancelled' AND o.total=CASE t.plan_id WHEN 'monthly' THEN 600000 ELSE 159900 END AND p.amount=o.total AND p.method='stripe_test' AND p.verified_by='provider_verified_test' AND (? IS NULL OR o.user_id=?)`).bind(userId||null,userId||null).run();
}
export async function createTestSubscriptionOrder(d:any,user:any,planId:unknown='weekly'){
 const plan=subscriptionPlan(planId);
 async function previous(){if(plan.id==='weekly'){const old=await d.prepare('SELECT order_id FROM subscription_test_purchases WHERE user_id=?').bind(user.userId).first();if(old)return old;}return d.prepare('SELECT order_id FROM subscription_plan_test_purchases WHERE user_id=? AND plan_id=?').bind(user.userId,plan.id).first();}
 const old=await previous();if(old)return old.order_id;
 const id='CH-'+crypto.randomUUID().slice(0,8).toUpperCase();
 try{await d.batch([
 d.prepare("INSERT INTO orders(id,user_id,idempotency_key,fulfillment,subtotal,tax,discount,fee,total,currency,contact) VALUES(?,?,?,'pickup',?,0,0,0,?,'INR',?)").bind(id,user.userId,'sandbox-subscription-'+plan.id+'-'+user.userId,plan.amount,plan.amount,JSON.stringify({name:user.displayName||'Customer',phone:user.profile?.phone||'',notes:'SANDBOX '+plan.name+' purchase — no real money'})),
 d.prepare('INSERT INTO subscription_plan_test_purchases(user_id,plan_id,order_id) VALUES(?,?,?)').bind(user.userId,plan.id,id),
 d.prepare("INSERT INTO order_events(id,order_id,status,actor) VALUES(?,?,'pending',?)").bind(crypto.randomUUID(),id,user.userId)
 ]);}catch(e){const existing=await previous();if(existing)return existing.order_id;throw e;}
 return id;
}
