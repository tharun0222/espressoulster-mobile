import {cashfreeSandboxEnabled} from './cashfree-sandbox.ts';

export function subscriptionTestEnabled(e:any){
 return e.PAYMENT_PROVIDER==='cashfree' ? cashfreeSandboxEnabled(e) :
  e.PAYMENT_PROVIDER==='stripe' && e.PUBLIC_TEST_MODE==='true' && e.PAYMENT_MODE==='test';
}
export async function syncTestSubscription(d:any,e:any,userId?:string){
 if(e.PAYMENT_PROVIDER==='cashfree' && e.PAYMENT_MODE==='live'){
  await syncLiveSubscription(d,userId);
  return;
 }
 if(!subscriptionTestEnabled(e))return;
 await d.prepare(`INSERT OR IGNORE INTO coffee_subscriptions(id,user_id,payment_id,plan_name,total_credits,starts_at,expires_at)
 SELECT 'sandbox-pass-'||o.id,o.user_id,p.id,'Sandbox coffee pass',8,strftime('%Y-%m-%dT%H:%M:%fZ',p.created_at),strftime('%Y-%m-%dT%H:%M:%fZ',p.created_at,'+30 days')
 FROM subscription_test_purchases t JOIN orders o ON o.id=t.order_id AND o.user_id=t.user_id JOIN payments p ON p.order_id=o.id
 WHERE o.payment_status='paid' AND o.status!='cancelled' AND o.total=159900 AND p.amount=159900 AND p.method IN ('stripe_test','cashfree_test') AND p.verified_by='provider_verified_test' AND (? IS NULL OR o.user_id=?)`).bind(userId||null,userId||null).run();
 await d.prepare(`INSERT OR IGNORE INTO coffee_subscriptions(id,user_id,payment_id,plan_name,total_credits,bonus_credits,plan_id,starts_at,expires_at)
 SELECT 'sandbox-pass-'||o.id,o.user_id,p.id,CASE t.plan_id WHEN 'monthly' THEN 'Monthly coffee pass (sandbox)' ELSE 'Weekly coffee pass (sandbox)' END,8,CASE t.plan_id WHEN 'monthly' THEN 26 ELSE 0 END,t.plan_id,strftime('%Y-%m-%dT%H:%M:%fZ',p.created_at),strftime('%Y-%m-%dT%H:%M:%fZ',p.created_at,'+30 days')
 FROM (SELECT * FROM subscription_plan_test_purchases UNION ALL SELECT * FROM subscription_renewal_purchases) t JOIN orders o ON o.id=t.order_id AND o.user_id=t.user_id JOIN payments p ON p.order_id=o.id
 WHERE o.payment_status='paid' AND o.status!='cancelled' AND o.total=CASE t.plan_id WHEN 'monthly' THEN 600000 ELSE 159900 END AND p.amount=o.total AND p.method IN ('stripe_test','cashfree_test') AND p.verified_by='provider_verified_test' AND (? IS NULL OR o.user_id=?)`).bind(userId||null,userId||null).run();
 await d.prepare(`INSERT OR IGNORE INTO coffee_subscriptions(id,user_id,payment_id,plan_name,total_credits,extended_credits,plan_id,starts_at,expires_at)
 SELECT 'sandbox-pass-'||o.id,o.user_id,p.id,'2-month coffee pass (sandbox)',8,52,'two_month',strftime('%Y-%m-%dT%H:%M:%fZ',p.created_at),strftime('%Y-%m-%dT%H:%M:%fZ',p.created_at,'+60 days')
 FROM subscription_extended_purchases t JOIN orders o ON o.id=t.order_id AND o.user_id=t.user_id JOIN payments p ON p.order_id=o.id
 WHERE o.payment_status='paid' AND o.status!='cancelled' AND o.total=1200000 AND p.amount=o.total AND p.method IN ('stripe_test','cashfree_test') AND p.verified_by='provider_verified_test' AND (? IS NULL OR o.user_id=?)`).bind(userId||null,userId||null).run();

 await d.prepare(`INSERT OR IGNORE INTO coffee_subscriptions(id,user_id,payment_id,plan_name,total_credits,purchased_credits,plan_id,starts_at,expires_at,item_scope,included_items)
 SELECT 'sandbox-pass-'||o.id,o.user_id,p.id,t.name,8,t.credits,t.plan_id,strftime('%Y-%m-%dT%H:%M:%fZ',p.created_at),strftime('%Y-%m-%dT%H:%M:%fZ',p.created_at,'+'||t.days||' days'),t.item_scope,t.included_items
 FROM subscription_purchase_snapshots t JOIN orders o ON o.id=t.order_id AND o.user_id=t.user_id JOIN payments p ON p.order_id=o.id
 WHERE o.payment_status='paid' AND o.status!='cancelled' AND o.total=t.amount AND p.amount=t.amount AND p.method IN ('stripe_test','cashfree_test') AND p.verified_by='provider_verified_test' AND (? IS NULL OR o.user_id=?)`).bind(userId||null,userId||null).run();

}
export async function createTestSubscriptionOrder(d:any,user:any,planId:unknown='weekly',paymentMethod?:string){
 if(typeof planId!=='string')throw Error('Choose a subscription plan.');
 const plan=await d.prepare('SELECT * FROM subscription_catalog WHERE id=? AND enabled=1 AND archived=0').bind(planId).first();if(!plan)throw Error('This subscription plan is no longer available.');
 async function previous(){return d.prepare(`SELECT o.id AS order_id,o.status,o.payment_status,o.total,
 EXISTS(SELECT 1 FROM coffee_subscriptions s WHERE s.payment_id IN(SELECT id FROM payments WHERE order_id=o.id) AND s.revoked=0 AND julianday(s.expires_at)>julianday('now') AND COALESCE(s.purchased_credits,(s.total_credits+s.bonus_credits+s.extended_credits))>(SELECT COALESCE(SUM(r.credits),0) FROM coffee_redemptions r WHERE r.subscription_id=s.id AND r.reversed_at IS NULL)) AS active_pass
 FROM orders o JOIN (SELECT order_id,user_id,plan_id FROM subscription_plan_test_purchases UNION ALL SELECT order_id,user_id,plan_id FROM subscription_renewal_purchases UNION ALL SELECT order_id,user_id,plan_id FROM subscription_extended_purchases UNION ALL SELECT order_id,user_id,plan_id FROM subscription_purchase_snapshots UNION ALL SELECT order_id,user_id,'weekly' AS plan_id FROM subscription_test_purchases) t ON t.order_id=o.id AND t.user_id=o.user_id
 WHERE t.user_id=? AND t.plan_id=?
 AND ((?='cashfree' AND o.checkout_payment_method='cashfree') OR (?!='cashfree' AND COALESCE(o.checkout_payment_method,'')!='cashfree'))
 ORDER BY o.rowid DESC LIMIT 1`).bind(user.userId,plan.id,paymentMethod??'',paymentMethod??'').first();}
 const old=await previous();
 if(old&&old.status!=='cancelled'&&((old.payment_status==='unpaid'&&old.status==='pending'&&old.total===plan.amount&&await d.prepare('SELECT order_id FROM subscription_purchase_snapshots WHERE order_id=? AND revision=?').bind(old.order_id,plan.revision).first())||old.active_pass))return old.order_id;
 const generation=old?.order_id||'first';
 const live=paymentMethod==='cashfree';
 const id='CH-'+crypto.randomUUID().slice(0,8).toUpperCase();
 try{await d.batch([
 d.prepare("INSERT INTO orders(id,user_id,idempotency_key,fulfillment,subtotal,tax,discount,fee,total,currency,contact,checkout_payment_method) VALUES(?,?,?,'pickup',?,0,0,0,?,'INR',?,?)").bind(id,user.userId,(live?'subscription-purchase-':'sandbox-subscription-')+plan.id+'-'+user.userId+'-'+generation+'-r'+plan.revision,plan.amount,plan.amount,JSON.stringify({name:user.displayName||'Customer',phone:user.profile?.phone||'',notes:plan.name+' purchase'}),paymentMethod??null),
 d.prepare('INSERT INTO subscription_purchase_snapshots(user_id,plan_id,order_id,name,amount,credits,days,revision,item_scope,included_items) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(user.userId,plan.id,id,plan.name,plan.amount,plan.credits,plan.days,plan.revision,plan.item_scope,plan.included_items),
 d.prepare("INSERT INTO order_events(id,order_id,status,actor) VALUES(?,?,'pending',?)").bind(crypto.randomUUID(),id,user.userId)
 ]);}catch(e){const existing=await previous();if(existing&&existing.order_id!==old?.order_id)return existing.order_id;throw e;}
 return id;
}

export function subscriptionRedemptionEnabled(env:any){
 return subscriptionTestEnabled(env) || (env.PAYMENT_PROVIDER==='cashfree' && env.PAYMENT_MODE==='live' && env.PUBLIC_TEST_MODE==='false');
}

async function syncLiveSubscription(d:any,userId?:string){
 await d.prepare(`INSERT OR IGNORE INTO coffee_subscriptions
  (id,user_id,payment_id,plan_name,total_credits,purchased_credits,plan_id,starts_at,expires_at,item_scope,included_items)
  SELECT 'pass-'||o.id,o.user_id,p.id,t.name,8,t.credits,t.plan_id,
   strftime('%Y-%m-%dT%H:%M:%fZ',p.created_at),strftime('%Y-%m-%dT%H:%M:%fZ',p.created_at,'+'||t.days||' days'),t.item_scope,t.included_items
  FROM subscription_purchase_snapshots t JOIN orders o ON o.id=t.order_id AND o.user_id=t.user_id
  JOIN payments p ON p.order_id=o.id
  WHERE o.payment_status='paid' AND o.status!='cancelled' AND o.checkout_payment_method='cashfree'
   AND o.total=t.amount AND p.amount=t.amount AND p.method='cashfree' AND p.verified_by='provider_verified'
   AND (? IS NULL OR o.user_id=?)`).bind(userId??null,userId??null).run();
}
