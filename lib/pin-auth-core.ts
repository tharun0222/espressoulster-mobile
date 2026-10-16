import {passwordHash,equalHash} from './admin-password.ts';
import {hashTesterToken} from './tester-auth.ts';
import {phoneNumber} from './phone-verification.ts';
export const pinCookie='espresso_pin';
export class PinAuthError extends Error {constructor(message:string,public status=400){super(message)}}
export function pinValue(value:unknown){if(typeof value!=='string'||!/^\d{6}$/.test(value))throw new PinAuthError('Enter your six-digit PIN.');return value;}
export function registrationPin(value:unknown,confirmation:unknown){const pin=pinValue(value);if(pin!==confirmation)throw new PinAuthError('Your PINs do not match.');if(/^(\d)\1{5}$/.test(pin)||['123456','654321','012345','543210'].includes(pin))throw new PinAuthError('Choose a less predictable PIN. Avoid repeated or consecutive numbers.');return pin;}
export function registrationDetails(input:any){
 const name=typeof input.name==='string'?input.name.trim().replace(/\s+/g,' '):'';
 if(name.length<2||name.length>100||/[\u0000-\u001f\u007f]/.test(input.name||''))throw new PinAuthError('Enter your name (2–100 characters).');
 const dateOfBirth=input.dateOfBirth,today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
 if(typeof dateOfBirth!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)||dateOfBirth<'1900-01-01'||dateOfBirth>today)throw new PinAuthError('Enter a valid date of birth.');
 const date=new Date(dateOfBirth+'T00:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==dateOfBirth)throw new PinAuthError('Enter a valid date of birth.');
 return {name,dateOfBirth};
}
function phoneValue(value:unknown){try{return phoneNumber(value)}catch{throw new PinAuthError('Enter a valid 10-digit Indian mobile number.')}}
export function pinToken(cookie:string|null){const token=(cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(pinCookie+'='))?.slice(pinCookie.length+1);return token&&/^[a-f0-9]{64}$/.test(token)?token:null;}
export function pinReady(e:any){return e.CUSTOMER_AUTH_MODE==='pin'&&typeof e.PIN_AUTH_SECRET==='string'&&e.PIN_AUTH_SECRET.length>=32;}
export async function readPinSession(d:any,cookie:string|null,now=Math.floor(Date.now()/1000)){
 const token=pinToken(cookie);if(!token)return null;
 return d.prepare('SELECT p.* FROM pin_sessions s JOIN profiles p ON p.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND p.disabled=0').bind(await hashTesterToken(token),now).first();
}
export function createPinAuth(d:any,e:any){
 const json=(b:any,cookie?:string)=>Response.json(b,{headers:{'Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})}});
 async function route(path:string,req:Request,input:any={}){
  const now=Math.floor(Date.now()/1000),suffix=`; Path=/; HttpOnly; SameSite=Lax${new URL(req.url).protocol==='https:'?'; Secure':''}`;
  if(path==='auth/pin/session'&&req.method==='GET'){
   const enabled=e.CUSTOMER_AUTH_MODE==='pin',ready=pinReady(e);
   return json({enabled,ready,authenticated:ready&&!!await readPinSession(d,req.headers.get('cookie'),now)});
  }
  if(req.method!=='POST')throw new PinAuthError('Method not allowed',405);
  const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new PinAuthError('Cross-origin request rejected',403);
  if(path==='auth/pin/logout'){
   const token=pinToken(req.headers.get('cookie'));if(token)await d.prepare('DELETE FROM pin_sessions WHERE token_hash=?').bind(await hashTesterToken(token)).run();
   return json({ok:true},`${pinCookie}=; Max-Age=0${suffix}`);
  }
  if(!['auth/pin/register','auth/pin/login'].includes(path))throw new PinAuthError('Not found',404);
  if(!pinReady(e))throw new PinAuthError('PIN sign-in is being set up. Please try again later.',503);
  const phone=phoneValue(input.phone),register=path.endsWith('/register');
  const pin=register?registrationPin(input.pin,input.confirmPin):pinValue(input.pin);
  const details=register?registrationDetails(input):null;
  const phoneHash=await hashTesterToken(phone),ipHash=await hashTesterToken(req.headers.get('cf-connecting-ip')||'local');
  await d.prepare('DELETE FROM pin_login_attempts WHERE created_at<?').bind(now-3600).run();
  const reservation=await d.prepare(`INSERT INTO pin_login_attempts(id,phone_hash,ip_hash,created_at)
   SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM pin_login_attempts WHERE phone_hash=? AND created_at>?)<5
   AND (SELECT COUNT(*) FROM pin_login_attempts WHERE ip_hash=? AND created_at>?)<10
   AND (SELECT COUNT(*) FROM pin_login_attempts WHERE created_at>?)<1000 RETURNING id`).bind(crypto.randomUUID(),phoneHash,ipHash,now,phoneHash,now-900,ipHash,now-900,now-3600).first();
  if(!reservation)throw new PinAuthError('Too many attempts. Please try again in 15 minutes.',429);
  const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
  const tokenHash=await hashTesterToken(token);
  if(register){
   if(await d.prepare('SELECT user_id FROM pin_accounts WHERE phone=?').bind(phone).first()||await d.prepare('SELECT user_id FROM phone_accounts WHERE phone=?').bind(phone).first())throw new PinAuthError('This number already has an account. Sign in, or contact the café for help.',409);
   const id='pin-'+crypto.randomUUID(),salt=crypto.randomUUID(),hash=await passwordHash(JSON.stringify([phone,pin,e.PIN_AUTH_SECRET]),salt);
   try{await d.batch([
    d.prepare('INSERT INTO profiles(id,email,name,phone,date_of_birth) VALUES(?,?,?,?,?)').bind(id,id+'@pin.invalid',details!.name,phone,details!.dateOfBirth),
    d.prepare('INSERT INTO pin_accounts(phone,user_id,pin_salt,pin_hash) VALUES(?,?,?,?)').bind(phone,id,salt,hash),
    d.prepare('INSERT INTO pin_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(tokenHash,id,now+2592000)
   ])}catch(error){if(await d.prepare('SELECT user_id FROM pin_accounts WHERE phone=?').bind(phone).first())throw new PinAuthError('This number already has an account. Please sign in.',409);throw error;}
  }else{
   const account=await d.prepare('SELECT a.*,p.disabled FROM pin_accounts a JOIN profiles p ON p.id=a.user_id WHERE a.phone=?').bind(phone).first();
   const hash=await passwordHash(JSON.stringify([phone,pin,e.PIN_AUTH_SECRET]),account?.pin_salt||'unregistered-account');
   if(!account||!equalHash(hash,account.pin_hash)||account.disabled)throw new PinAuthError('Mobile number or PIN is incorrect.',401);
   await d.prepare('INSERT INTO pin_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(tokenHash,account.user_id,now+2592000).run();
  }
  return json({ok:true,phoneVerified:false},`${pinCookie}=${token}; Max-Age=2592000${suffix}`);
 }
 return {route};
}
