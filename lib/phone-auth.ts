import {env} from 'cloudflare:workers';
import {db,body,json} from './server';
import {assert,BusinessError} from './pricing';
import {hashTesterToken} from './tester-auth';
import {phoneCookie,phoneNumber,phoneSessionToken,smsReady,verifyProvider} from './phone-verification';
export async function phoneAuth(path:string,req:Request){
 const e=env as any,d=db(),now=Math.floor(Date.now()/1000),url=new URL(req.url);
 const suffix=`; Path=/; HttpOnly; SameSite=Lax${url.protocol==='https:'?'; Secure':''}`;
 if(path==='auth/phone/config'&&req.method==='GET')return json({enabled:smsReady(e)});
 assert(req.method==='POST','Unsupported method',405);
 if(path==='auth/phone/logout'){
  const token=phoneSessionToken(req.headers.get('cookie'));if(token)await d.prepare('DELETE FROM phone_sessions WHERE token_hash=?').bind(await hashTesterToken(token)).run();
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':`${phoneCookie}=; Max-Age=0${suffix}`}});
 }
 assert(['auth/phone/send','auth/phone/verify'].includes(path),'Not found',404);
 assert(smsReady(e),'SMS sign-in is not available yet. Please try again later.',503);
 const input=await body(req);let phone:string;
 try{phone=phoneNumber(input.phone)}catch{throw new BusinessError('Enter a valid 10-digit Indian mobile number')}
 if(path.endsWith('/send')){
  const phoneHash=await hashTesterToken(phone),ip=await hashTesterToken(req.headers.get('cf-connecting-ip')||'local'),id=crypto.randomUUID();
  // One atomic statement reserves the send budget, even under parallel requests.
  const reservation=await d.prepare(`INSERT INTO phone_challenges(id,phone,phone_hash,ip_hash,created_at,expires_at)
   SELECT ?,?,?,?,?,? WHERE
   (SELECT COUNT(*) FROM phone_challenges WHERE created_at>?)<100 AND
   (SELECT COUNT(*) FROM phone_challenges WHERE ip_hash=? AND created_at>?)<10 AND
   (SELECT COUNT(*) FROM phone_challenges WHERE phone_hash=? AND created_at>?)<3 AND
   NOT EXISTS(SELECT 1 FROM phone_challenges WHERE phone_hash=? AND created_at>?) RETURNING id`).bind(id,phone,phoneHash,ip,now,now+600,now-3600,ip,now-3600,phoneHash,now-3600,phoneHash,now-60).first();
  assert(reservation,'Please wait before requesting another OTP. Too many requests.',429);
  try{assert(await verifyProvider(e,phone),'Unable to send OTP. Try again later.',502)}catch{throw new BusinessError('Unable to send OTP. Please try again later.',502)}
  await d.prepare('UPDATE phone_challenges SET sent=1 WHERE id=?').bind(id).run();
  return json({challenge:id,retryAfter:60,expiresIn:600});
 }
 assert(typeof input.challenge==='string'&&input.challenge.length===36&&typeof input.code==='string'&&/^\d{4,10}$/.test(input.code),'Enter the OTP from your SMS');
 const claim=await d.prepare('UPDATE phone_challenges SET attempts=attempts+1 WHERE id=? AND phone=? AND sent=1 AND expires_at>? AND attempts<5 RETURNING id').bind(input.challenge,phone,now).first();
 assert(claim,'OTP expired or too many attempts. Request a new code.',400);
 let approved=false;try{approved=await verifyProvider(e,phone,input.code)}catch{throw new BusinessError('Code is invalid or expired. Request a new OTP.')}
 assert(approved,'Incorrect OTP. Please try again.');
 const consumed=await d.prepare('UPDATE phone_challenges SET sent=0 WHERE id=? AND sent=1 RETURNING id').bind(input.challenge).first();
 assert(consumed,'This OTP has already been used. Request a new code.');
 const candidate='phone-'+crypto.randomUUID();
 await d.prepare('INSERT OR IGNORE INTO phone_accounts(phone,user_id) VALUES(?,?)').bind(phone,candidate).run();
 const account=await d.prepare('SELECT user_id FROM phone_accounts WHERE phone=?').bind(phone).first<any>();
 const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
 await d.prepare("INSERT OR IGNORE INTO profiles(id,email,name,phone) VALUES(?,?,'Coffee lover',?)").bind(account.user_id,account.user_id+'@phone.invalid',phone).run();
 const profile=await d.prepare('SELECT disabled FROM profiles WHERE id=?').bind(account.user_id).first<any>();assert(!profile?.disabled,'This account is disabled. Contact the café.',403);
 await d.prepare('INSERT INTO phone_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await hashTesterToken(token),account.user_id,now+2592000).run();
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':`${phoneCookie}=${token}; Max-Age=2592000${suffix}`}});
}
