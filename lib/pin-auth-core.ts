import {createPinReset,pinResetAvailable} from './pin-reset.ts';
import {passwordHash,equalHash} from './admin-password.ts';
import {hashTesterToken} from './tester-auth.ts';
import {phoneNumber} from './phone-verification.ts';
import {isProfileGender} from './daily-greeting.ts';
import {canSeeStaffPanel,isApprovedStaff} from './staff-panel-access.ts';
import {customerOtpOnly,msg91Ready} from './msg91-otp.ts';
import {usesWhatsAppOtp} from './msg91-whatsapp.ts';
export const pinCookie='espresso_pin';
export const staffPinCookie='espresso_staff_pin';
export const staffPinSessionHash=(token:string)=>hashTesterToken('staff:'+token);
export const staffOtpSessionHash=(token:string)=>hashTesterToken('staff-otp:'+token);
export class PinAuthError extends Error {constructor(message:string,public status=400,public staffOnly=false){super(message)}}
function requireCustomerNumber(phone:unknown, staffOnlyNumbers?:string) {
 if(canSeeStaffPanel(phone,staffOnlyNumbers))throw new PinAuthError('This mobile number is for staff access. Use Staff sign-in.',403,true);
}
export function pinValue(value:unknown){if(typeof value!=='string'||!/^\d{6}$/.test(value))throw new PinAuthError('Enter your six-digit PIN.');return value;}
export function registrationPin(value:unknown,confirmation:unknown){const pin=pinValue(value);if(pin!==confirmation)throw new PinAuthError('Your PINs do not match.');if(/^(\d)\1{5}$/.test(pin)||['123456','654321','012345','543210'].includes(pin))throw new PinAuthError('Choose a less predictable PIN. Avoid repeated or consecutive numbers.');return pin;}
export function registrationDetails(input:any){
 const name=typeof input.name==='string'?input.name.trim().replace(/\s+/g,' '):'';
 if(name.length<2||name.length>100||/[\u0000-\u001f\u007f]/.test(input.name||''))throw new PinAuthError('Enter your name (2–100 characters).');
 const dateOfBirth=input.dateOfBirth,today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
 if(typeof dateOfBirth!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)||dateOfBirth<'1900-01-01'||dateOfBirth>today)throw new PinAuthError('Enter a valid date of birth.');
 const date=new Date(dateOfBirth+'T00:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==dateOfBirth)throw new PinAuthError('Enter a valid date of birth.');
 const gender = input.gender;
 if (!gender || !isProfileGender(gender) || gender === 'nonbinary') throw new PinAuthError('Choose a valid gender option.');
 return {name,dateOfBirth,gender};
}
function phoneValue(value:unknown){try{return phoneNumber(value)}catch{throw new PinAuthError('Enter a valid 10-digit Indian mobile number.')}}
export function pinToken(cookie:string|null,name=pinCookie){const token=(cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);return token&&/^[a-f0-9]{64}$/.test(token)?token:null;}
export function pinReady(e:any){return e.CUSTOMER_AUTH_MODE==='pin'&&typeof e.PIN_AUTH_SECRET==='string'&&e.PIN_AUTH_SECRET.length>=32;}
export async function readPinSession(d:any,cookie:string|null,now=Math.floor(Date.now()/1000),staffOnlyNumbers?:string,sessionCookie=pinCookie,staffOtp=false){
 const token=pinToken(cookie,sessionCookie);if(!token)return null;
 const hash=await (staffOtp?staffOtpSessionHash(token):sessionCookie===staffPinCookie?staffPinSessionHash(token):hashTesterToken(token));
 const profile=await d.prepare('SELECT p.* FROM pin_sessions s JOIN profiles p ON p.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND p.disabled=0').bind(hash,now).first();
 if(!staffOnlyNumbers||!profile)return profile;
 const account=await d.prepare('SELECT phone FROM pin_accounts WHERE user_id=?').bind(profile.id).first();
 return canSeeStaffPanel(account?.phone,staffOnlyNumbers)?null:profile;
}
export async function readStaffPinSession(d:Parameters<typeof readPinSession>[0],cookie:string|null,otpOnly=false,now=Math.floor(Date.now()/1000)){
 if(!otpOnly){const profile=await readPinSession(d,cookie,now,undefined,staffPinCookie);if(profile)return profile;}
 return readPinSession(d,cookie,now,undefined,staffPinCookie,true);
}
export function createPinAuth(d:any,e:any){
 const json=(b:any,cookie?:string)=>Response.json(b,{headers:{'Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})}});
 async function route(path:string,req:Request,input:any={},staff=false,staffPreviewPin?:string){
  const now=Math.floor(Date.now()/1000),suffix=`; Path=/; HttpOnly; SameSite=Lax${new URL(req.url).protocol==='https:'?'; Secure':''}`;
  if(path==='auth/pin/session'&&req.method==='GET'){
   const enabled=e.CUSTOMER_AUTH_MODE==='pin',ready=pinReady(e);
   return json({enabled,ready,otpAvailable:ready&&msg91Ready(e),otpOnly:ready&&customerOtpOnly(e),otpChannel:usesWhatsAppOtp(e)?'whatsapp':'sms',otpConfigured:msg91Ready(e),
    pinResetAvailable:ready&&pinResetAvailable(e),authenticated:ready&&!!await readPinSession(d,req.headers.get('cookie'),now,e.STAFF_ONLY_PHONES)});
  }
  if(req.method!=='POST')throw new PinAuthError('Method not allowed',405);
  const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new PinAuthError('Cross-origin request rejected',403);
  if (['auth/pin/access/request','auth/pin/access/confirm','auth/pin/access/profile'].includes(path)) {
   if(isApprovedStaff(input.phone,e)) throw new PinAuthError('Staff sign-in is unavailable here.',403,true);
   return createPinReset(d,e)(path,req,input);
  }
  if (['auth/pin/reset/request','auth/pin/reset/confirm','auth/pin/otp/request','auth/pin/otp/confirm','auth/pin/signup-otp/request','auth/pin/signup-otp/confirm'].includes(path)) {
   requireCustomerNumber(input.phone,e.STAFF_ONLY_PHONES);
   if (customerOtpOnly(e) && path.includes('/reset/')) throw new PinAuthError('Sign in with a verification code.',410);
   return createPinReset(d,e)(path,req,input);
  }
  if(path==='auth/pin/logout'){
   const token=pinToken(req.headers.get('cookie'));if(token)await d.prepare('DELETE FROM pin_sessions WHERE token_hash=?').bind(await hashTesterToken(token)).run();
   return json({ok:true},`${pinCookie}=; Max-Age=0${suffix}`);
  }
  if(!['auth/pin/register','auth/pin/login'].includes(path))throw new PinAuthError('Not found',404);
  if(!pinReady(e))throw new PinAuthError('PIN sign-in is being set up. Please try again later.',503);
  const phone=phoneValue(input.phone),register=path.endsWith('/register');
  if(staff){
   if(register || !isApprovedStaff(phone,e))
    throw new PinAuthError('Staff sign-in is unavailable for this number.',403);
  }else{
   requireCustomerNumber(phone,e.STAFF_ONLY_PHONES);
   if(customerOtpOnly(e))throw new PinAuthError('Sign in with a verification code.',410);
  }
  const pin=register?registrationPin(input.pin,input.confirmPin):pinValue(input.pin);
  const details=register?registrationDetails(input):null;
  const localPreview = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(req.url).hostname);
  if(register || staff || !localPreview){
  const scope = register ? '' : staff ? 'staff-pin-login:' : 'pin-login:';
  const phoneHash=await hashTesterToken(scope+phone),ipHash=await hashTesterToken(scope+(req.headers.get('cf-connecting-ip')||'local'));
  await d.prepare('DELETE FROM pin_login_attempts WHERE created_at<?').bind(now-3600).run();
  const reservation=await d.prepare(`INSERT INTO pin_login_attempts(id,phone_hash,ip_hash,created_at)
   SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM pin_login_attempts WHERE phone_hash=? AND created_at>?)<5
   AND (SELECT COUNT(*) FROM pin_login_attempts WHERE ip_hash=? AND created_at>?)<10
   RETURNING id`).bind(crypto.randomUUID(),phoneHash,ipHash,now,phoneHash,now-900,ipHash,now-900).first();
  if(!reservation)throw new PinAuthError('Too many attempts. Please try again in 15 minutes.',429);
  }
  const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
  const tokenHash=await (staff?staffPinSessionHash(token):hashTesterToken(token));
  if(register){
   if(await d.prepare('SELECT user_id FROM pin_accounts WHERE phone=?').bind(phone).first()||await d.prepare('SELECT user_id FROM phone_accounts WHERE phone=?').bind(phone).first())throw new PinAuthError('This number already has an account. Sign in, or contact the café for help.',409);
   const id='pin-'+crypto.randomUUID(),salt=crypto.randomUUID(),hash=await passwordHash(JSON.stringify([phone,pin,e.PIN_AUTH_SECRET]),salt);
   try{await d.batch([
    d.prepare('INSERT INTO profiles(id,email,name,phone,date_of_birth,gender) VALUES(?,?,?,?,?,?)').bind(id,id+'@pin.invalid',details!.name,phone,details!.dateOfBirth,details!.gender),
    d.prepare('INSERT INTO pin_accounts(phone,user_id,pin_salt,pin_hash) VALUES(?,?,?,?)').bind(phone,id,salt,hash),
    d.prepare('INSERT INTO pin_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(tokenHash,id,now+2592000)
   ])}catch(error){if(await d.prepare('SELECT user_id FROM pin_accounts WHERE phone=?').bind(phone).first())throw new PinAuthError('This number already has an account. Please sign in.',409);throw error;}
  }else{
   const account=await d.prepare('SELECT a.*,p.disabled FROM pin_accounts a JOIN profiles p ON p.id=a.user_id WHERE a.phone=?').bind(phone).first();
   const hash=await passwordHash(JSON.stringify([phone,pin,e.PIN_AUTH_SECRET]),account?.pin_salt||'unregistered-account');
   const previewPinMatches = staff && localPreview && staffPreviewPin === pin;
   if(!account||account.disabled||(!previewPinMatches&&!equalHash(hash,account.pin_hash)))throw new PinAuthError('Mobile number or PIN is incorrect.',401);
   if (staff || !localPreview) {
    const scope=staff?'staff-pin-login:':'pin-login:';
    await d.prepare('DELETE FROM pin_login_attempts WHERE phone_hash=? AND ip_hash=?')
      .bind(await hashTesterToken(scope+phone),await hashTesterToken(scope+(req.headers.get('cf-connecting-ip')||'local'))).run();
   }
   await d.prepare('INSERT INTO pin_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(tokenHash,account.user_id,now+(staff?28800:2592000)).run();
  }
  if(staff) return json({ok:true,destination:'admin'},`${staffPinCookie}=${token}; Max-Age=28800${suffix.replace('SameSite=Lax','SameSite=Strict')}`);
  return json({ok:true,phoneVerified:false},`${pinCookie}=${token}; Max-Age=2592000${suffix}`);
 }
 return {route};
}
