import {subscriptionRedemptionEnabled,syncTestSubscription} from './subscription-test.ts';
import {hashTesterToken} from './tester-auth.ts';
import {phoneNumber} from './phone-verification.ts';

export class RedemptionError extends Error {
 constructor(message:string, public status=400){super(message)}
}

const codeLifetimeSeconds=600;
const eligiblePass=(live:boolean)=>`
 s.revoked=0
 AND purchase.user_id=s.user_id AND purchase.payment_status='paid' AND purchase.status!='cancelled'
 AND ${live?"p.method='cashfree' AND p.verified_by='provider_verified'":"p.method IN ('stripe_test','cashfree_test') AND p.verified_by='provider_verified_test'"}
 AND julianday(s.starts_at)<=julianday('now') AND julianday(s.expires_at)>julianday('now')
 AND (SELECT COALESCE(SUM(r.credits),0) FROM coffee_redemptions r
      WHERE r.subscription_id=s.id AND r.reversed_at IS NULL)
     < COALESCE(s.purchased_credits,s.total_credits+s.bonus_credits+s.extended_credits)
`;

async function itemCode(secret:string,user:string,id:string){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(['subscription-item-code-v1',user,id])));
 return (new DataView(bytes).getUint32(0)%1000000).toString().padStart(6,'0');
}

function validatePassId(subscriptionId?:string){
 if(subscriptionId!==undefined&&(typeof subscriptionId!=='string'||!subscriptionId||subscriptionId.length>200)){
  throw new RedemptionError('Choose a valid subscription.');
 }
}

export function createSubscriptionRedemption(d:any,e:any){
 const live=e.PAYMENT_PROVIDER==='cashfree'&&e.PAYMENT_MODE==='live'&&e.PUBLIC_TEST_MODE==='false';
 function ready(){
  if(!subscriptionRedemptionEnabled(e)||typeof e.PIN_AUTH_SECRET!=='string'||e.PIN_AUTH_SECRET.length<32){
   throw new RedemptionError('Subscription redemption is not configured.',503);
  }
 }
 function codeHash(user:string,code:string){
  return hashTesterToken(JSON.stringify(['subscription-item-code-v1',e.PIN_AUTH_SECRET,user,code]));
 }

 async function generate(user:string,subscriptionId?:string){
  ready();
  validatePassId(subscriptionId);
  await syncTestSubscription(d,e,user);
  const pass=await d.prepare(`
   SELECT s.id,s.item_scope,s.included_items
   FROM coffee_subscriptions s JOIN payments p ON p.id=s.payment_id JOIN orders purchase ON purchase.id=p.order_id
   WHERE s.user_id=? AND (? IS NULL OR s.id=?) AND ${eligiblePass(live)}
   ORDER BY s.expires_at,s.id LIMIT 1
  `).bind(user,subscriptionId??null,subscriptionId??null).first();
  if(!pass)throw new RedemptionError('An active pass with item credits is required.',409);

  await d.prepare(`
   UPDATE subscription_item_codes SET retired=1
   WHERE subscription_id=? AND retired=0 AND redeemed_order_id IS NULL AND expires_at<=unixepoch()
  `).bind(pass.id).run();

  for(let i=0;i<5;i++){
   const id=crypto.randomUUID();
   const code=await itemCode(e.PIN_AUTH_SECRET,user,id);
   await d.prepare(`
    INSERT OR IGNORE INTO subscription_item_codes(id,user_id,subscription_id,code_hash,expires_at)
    SELECT ?,s.user_id,s.id,?,MIN(unixepoch()+?,unixepoch(s.expires_at))
    FROM coffee_subscriptions s JOIN payments p ON p.id=s.payment_id JOIN orders purchase ON purchase.id=p.order_id
    WHERE s.id=? AND s.user_id=? AND ${eligiblePass(live)}
   `).bind(id,await codeHash(user,code),codeLifetimeSeconds,pass.id,user).run();
   const row=await d.prepare(`
    SELECT id,expires_at FROM subscription_item_codes
    WHERE subscription_id=? AND retired=0 AND redeemed_order_id IS NULL AND expires_at>unixepoch()
   `).bind(pass.id).first();
   if(row){
    return {
     codeId:row.id,subscriptionId:pass.id,itemScope:pass.item_scope||'coffee',
     includedItems:JSON.parse(pass.included_items||'[]'),testOnly:!live,
     code:row.id===id?code:await itemCode(e.PIN_AUTH_SECRET,user,row.id),
     expiresAt:new Date(row.expires_at*1000).toISOString()
    };
   }
  }
  throw new RedemptionError('Unable to generate a code. Try again.',409);
 }

 async function verifyCode(input:any){
  ready();
  let phone:string;
  try{phone=phoneNumber(input.phone)}catch{throw new RedemptionError('Enter the customer’s Indian mobile number.')}
  if(typeof input.code!=='string'||!/^\d{6}$/.test(input.code))throw new RedemptionError('Enter the six-digit code.');
  const customer=await d.prepare('SELECT id FROM profiles WHERE phone=?').bind(phone).first();
  if(!customer)throw new RedemptionError('Mobile number or redemption code is incorrect.');
  const attempt=await d.prepare(`
   INSERT INTO subscription_item_code_attempts(id,user_id,attempted_at)
   SELECT ?,?,unixepoch() WHERE (SELECT COUNT(*) FROM subscription_item_code_attempts
     WHERE user_id=? AND attempted_at>unixepoch()-?)<5 RETURNING id
  `).bind(crypto.randomUUID(),customer.id,customer.id,codeLifetimeSeconds).first();
  if(!attempt)throw new RedemptionError('Too many code attempts. Try again in a few minutes.',429);
  const row=await d.prepare(`
   SELECT c.*,s.plan_name,s.item_scope,s.included_items
   FROM subscription_item_codes c JOIN coffee_subscriptions s ON s.id=c.subscription_id
   WHERE c.user_id=? AND c.code_hash=?
  `).bind(customer.id,await codeHash(customer.id,input.code)).first();
  if(!row)throw new RedemptionError('Mobile number or redemption code is incorrect.');
  await d.prepare('DELETE FROM subscription_item_code_attempts WHERE id=?').bind(attempt.id).run();
  if(row.redeemed_order_id)throw new RedemptionError('This code has already been redeemed.',409);
  if(row.retired||row.expires_at<=Date.now()/1000)throw new RedemptionError('This code expired. Ask for a new code.',409);
  return {phone,row};
 }

 async function preview(input:any){
  const {row}=await verifyCode(input);
  return {subscriptionId:row.subscription_id,planName:row.plan_name};
 }

 async function redeem(input:any,admin:string){
  const {phone,row}=await verifyCode(input);
  const byPlan=input.subscriptionId!==undefined;
  if(byPlan&&input.subscriptionId!==row.subscription_id)throw new RedemptionError('The code does not match this subscription.');
  const eligible=JSON.parse(row.included_items||'[]');
  const redeemedItem=row.item_scope==='menu'?eligible.find((p:any)=>p.id===input.productId):null;
  if(row.item_scope==='menu'&&(byPlan ? !eligible.length : !redeemedItem))throw new RedemptionError('Choose a menu item included in this customer’s purchased plan.',400);
  const redemptionLabel=byPlan?' — '+row.plan_name:redeemedItem?' — '+redeemedItem.name:' (coffee)';
  const order='CH-'+crypto.randomUUID().slice(0,8).toUpperCase();
  try{
   await d.batch([
    d.prepare("INSERT INTO orders(id,user_id,idempotency_key,fulfillment,payment_status,status,subtotal,tax,discount,fee,total,currency,contact) VALUES(?,?,?,'dine_in','paid','completed',0,0,0,0,0,'INR',?)")
     .bind(order,row.user_id,(live?'subscription-item-code-':'sandbox-item-code-')+row.id,JSON.stringify({phone,notes:'One subscription item redeemed'+redemptionLabel})),
    d.prepare(`
     UPDATE subscription_item_codes SET redeemed_order_id=?
     WHERE id=? AND redeemed_order_id IS NULL AND retired=0 AND expires_at>unixepoch() AND EXISTS (
      SELECT 1 FROM coffee_subscriptions s JOIN payments p ON p.id=s.payment_id JOIN orders purchase ON purchase.id=p.order_id
      WHERE s.id=subscription_item_codes.subscription_id AND s.user_id=subscription_item_codes.user_id AND ${eligiblePass(live)}
     )
    `).bind(order,row.id),
    // The check constraint rolls back the receipt if the code or the credit was unavailable.
    d.prepare('INSERT INTO subscription_redemption_checks(order_id,valid) VALUES(?,(SELECT COUNT(*) FROM subscription_item_codes WHERE id=? AND redeemed_order_id=?))')
     .bind(order,row.id,order),
    d.prepare('INSERT INTO coffee_redemptions(id,subscription_id,order_id,credits) VALUES(?,?,?,1)')
     .bind((live?'redemption-':'sandbox-redemption-')+crypto.randomUUID(),row.subscription_id,order),
    d.prepare("INSERT INTO order_events(id,order_id,status,actor) VALUES(?,?,'completed',?)").bind(crypto.randomUUID(),order,admin)
   ]);
  }catch{
   throw new RedemptionError('Item could not be redeemed. The code may be used or expired, or there may be no credits left.',409);
  }
  return {ok:true,testOnly:!live,receipt:order,creditsUsed:1,planName:row.plan_name,message:'One item redeemed'+redemptionLabel+'.'};
 }

 async function status(user:string,subscriptionId?:string,codeId?:string){
  ready();
  validatePassId(subscriptionId);
  const row=await d.prepare(`
   SELECT id,subscription_id,redeemed_order_id,retired,expires_at FROM subscription_item_codes
   WHERE user_id=? AND (? IS NULL OR subscription_id=?) AND (? IS NULL OR id=?)
   ORDER BY rowid DESC LIMIT 1
  `).bind(user,subscriptionId??null,subscriptionId??null,codeId??null,codeId??null).first();
  return {
   codeId:row?.id,subscriptionId:subscriptionId??row?.subscription_id,
   redeemed:!!row?.redeemed_order_id,expired:!row||!!row.retired||row.expires_at<=Date.now()/1000,testOnly:!live
  };
 }

 return {generate,preview,redeem,status};
}
