import {subscriptionTestEnabled,syncTestSubscription} from './subscription-test.ts';
import {hashTesterToken} from './tester-auth.ts';
import {equalHash} from './admin-password.ts';
import {phoneNumber} from './phone-verification.ts';
export class RedemptionError extends Error{constructor(message:string,public status=400){super(message)}}
export function indiaDay(now=Date.now()){return new Date(now+19800000).toISOString().slice(0,10)}
export async function dailyCode(secret:string,user:string,day:string,subscription:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(['subscription-redemption-v1',user,day,subscription])));return (new DataView(bytes).getUint32(0)%1000000).toString().padStart(6,'0')}
export function createSubscriptionRedemption(d:any,e:any){
 function ready(){if(!subscriptionTestEnabled(e)||typeof e.PIN_AUTH_SECRET!=='string'||e.PIN_AUTH_SECRET.length<32)throw new RedemptionError('Sandbox redemption is not configured.',503)}
 async function generate(user:string){ready();await syncTestSubscription(d,e,user);const day=indiaDay();let row=await d.prepare('SELECT * FROM subscription_daily_codes WHERE user_id=? AND day=?').bind(user,day).first();
  if(!row){const pass=await d.prepare(`SELECT s.id FROM coffee_subscriptions s JOIN payments p ON p.id=s.payment_id JOIN orders o ON o.id=p.order_id WHERE s.user_id=? AND s.revoked=0 AND o.user_id=s.user_id AND o.payment_status='paid' AND o.status!='cancelled' AND p.method='stripe_test' AND p.verified_by='provider_verified_test' AND julianday(s.starts_at)<=julianday('now') AND julianday(s.expires_at)>julianday('now') AND (SELECT COALESCE(SUM(r.credits),0) FROM coffee_redemptions r WHERE r.subscription_id=s.id AND r.reversed_at IS NULL)<(s.total_credits+s.bonus_credits) ORDER BY s.expires_at,s.id LIMIT 1`).bind(user).first();if(!pass)throw new RedemptionError('An active sandbox pass with coffee credits is required.',409);
   const code=await dailyCode(e.PIN_AUTH_SECRET,user,day,pass.id);await d.prepare('INSERT OR IGNORE INTO subscription_daily_codes(user_id,day,subscription_id,code_hash,expires_at) VALUES(?,?,?,?,?)').bind(user,day,pass.id,await hashTesterToken(JSON.stringify([e.PIN_AUTH_SECRET,user,day,code])),Date.parse(day+'T18:30:00Z')/1000).run();row=await d.prepare('SELECT * FROM subscription_daily_codes WHERE user_id=? AND day=?').bind(user,day).first();
  }
  return {testOnly:true,code:row.redeemed_order_id?null:await dailyCode(e.PIN_AUTH_SECRET,user,day,row.subscription_id),redeemed:!!row.redeemed_order_id,expiresAt:new Date(row.expires_at*1000).toISOString(),day,receipt:row.redeemed_order_id};
 }
 async function redeem(input:any,admin:string){ready();let phone:string;try{phone=phoneNumber(input.phone)}catch{throw new RedemptionError('Enter the customer’s Indian mobile number.')}if(!/^\d{6}$/.test(input.code||''))throw new RedemptionError('Enter the six-digit code.');
  const day=indiaDay(),row=await d.prepare('SELECT c.* FROM subscription_daily_codes c JOIN profiles p ON p.id=c.user_id WHERE p.phone=? AND c.day=?').bind(phone,day).first();if(!row)throw new RedemptionError('Mobile number or daily code is incorrect.',400);
  const attempt=await d.prepare('INSERT INTO subscription_code_attempts(id,user_id,day) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM subscription_code_attempts WHERE user_id=? AND day=?)<5 RETURNING id').bind(crypto.randomUUID(),row.user_id,day,row.user_id,day).first();if(!attempt)throw new RedemptionError('Daily verification limit reached. Try again tomorrow.',429);
  if(!equalHash(await hashTesterToken(JSON.stringify([e.PIN_AUTH_SECRET,row.user_id,day,input.code])),row.code_hash))throw new RedemptionError('Mobile number or daily code is incorrect.');if(row.redeemed_order_id)throw new RedemptionError('Today’s coffee has already been redeemed.',409);if(row.expires_at<=Date.now()/1000)throw new RedemptionError('This daily code has expired.',409);
  const order='CH-'+crypto.randomUUID().slice(0,8).toUpperCase();
  try{await d.batch([
   d.prepare("INSERT INTO orders(id,user_id,idempotency_key,fulfillment,payment_status,status,subtotal,tax,discount,fee,total,currency,contact) VALUES(?,?,?,'dine_in','paid','completed',0,0,0,0,0,'INR',?)").bind(order,row.user_id,'sandbox-coffee-'+row.user_id+'-'+day,JSON.stringify({phone,notes:'SANDBOX: one subscription coffee redeemed; no real bill or Petpooja change'})),
   d.prepare(`UPDATE subscription_daily_codes SET redeemed_order_id=? WHERE user_id=? AND day=? AND redeemed_order_id IS NULL AND expires_at>unixepoch() AND EXISTS (
    SELECT 1 FROM coffee_subscriptions s JOIN payments p ON p.id=s.payment_id JOIN orders purchase ON purchase.id=p.order_id
    WHERE s.id=subscription_daily_codes.subscription_id AND s.user_id=subscription_daily_codes.user_id AND s.revoked=0
    AND julianday(s.starts_at)<=julianday('now') AND julianday(s.expires_at)>julianday('now')
    AND purchase.user_id=s.user_id AND purchase.payment_status='paid' AND purchase.status!='cancelled'
    AND p.method='stripe_test' AND p.verified_by='provider_verified_test'
    AND (SELECT COALESCE(SUM(r.credits),0) FROM coffee_redemptions r WHERE r.subscription_id=s.id AND r.reversed_at IS NULL)<(s.total_credits+s.bonus_credits)
   )`).bind(order,row.user_id,day),
   d.prepare('INSERT INTO subscription_redemption_checks(order_id,valid) VALUES(?,(SELECT COUNT(*) FROM subscription_daily_codes WHERE user_id=? AND day=? AND redeemed_order_id=?))').bind(order,row.user_id,day,order),
   d.prepare('INSERT INTO coffee_redemptions(id,subscription_id,order_id,credits) VALUES(?,?,?,1)').bind('sandbox-redemption-'+crypto.randomUUID(),row.subscription_id,order),
   d.prepare("INSERT INTO order_events(id,order_id,status,actor) VALUES(?,?,'completed',?)").bind(crypto.randomUUID(),order,admin)
  ])}catch{throw new RedemptionError('Coffee could not be redeemed. It may already be used, expired or have no credits left. Refresh the balance.',409)}
  return {ok:true,testOnly:true,receipt:order,creditsUsed:1,message:'One test coffee redeemed. No real bill or Petpooja record was changed.'};
 }
 async function status(user:string){ready();const row=await d.prepare('SELECT redeemed_order_id,expires_at FROM subscription_daily_codes WHERE user_id=? AND day=?').bind(user,indiaDay()).first();return {redeemed:!!row?.redeemed_order_id,expired:!row||row.expires_at<=Date.now()/1000,testOnly:true};}
 return {generate,redeem,status};
}
