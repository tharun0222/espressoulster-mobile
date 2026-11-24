import {smsReady, verifyProvider, phoneNumber} from './phone-verification.ts';
import {hashTesterToken} from './tester-auth.ts';
import {passwordHash} from './admin-password.ts';
import {PinAuthError, registrationPin, registrationDetails, pinReady, pinCookie, staffPinCookie, staffOtpSessionHash} from './pin-auth-core.ts';
import {createSmsCode, customerOtpOnly, matchesSmsCode, msg91Ready, pinAuthOtpEnabled, sendMsg91Otp, smsCodeHash} from './msg91-otp.ts';
import {isApprovedStaff} from './staff-panel-access.ts';
import {usesWhatsAppOtp} from './msg91-whatsapp.ts';

const setupPurpose = 'verified-profile-setup';
const newToken = () => crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
const validToken = (token: unknown): token is string => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);

async function finishProfile(d:any, e:any, req:Request, input:any, phone:string, now:number) {
 const details = registrationDetails(input);
 if (!validToken(input.setup)) throw new PinAuthError('Verify your mobile number to continue.');
 const tokenHash = await hashTesterToken(input.setup);
 const id = 'pin-' + crypto.randomUUID();
 const salt = crypto.randomUUID();
 const unusedPinHash = await passwordHash(JSON.stringify([phone,crypto.randomUUID(),e.PIN_AUTH_SECRET]),salt);
 const session = newToken();
 const sessionHash = await hashTesterToken(session);
 // The authorization and all three writes share a transaction. A repeated
 // completion request has no proof to consume and cannot create another user.
 const proof = `SELECT 1 FROM pin_reset_challenges WHERE token_hash=? AND phone=? AND account_hash=? AND expires_at>?`;
 const proofValues = [tokenHash,phone,setupPurpose,now] as const;
 if (await d.prepare('SELECT 1 FROM phone_accounts WHERE phone=?').bind(phone).first()) {
  throw new PinAuthError('This number already has an account. Sign in again.',409);
 }
 let created;
 try {
  [created] = await d.batch([
   d.prepare(`INSERT INTO profiles(id,email,name,phone,date_of_birth,gender) SELECT ?,?,?,?,?,? WHERE EXISTS(${proof})`)
    .bind(id,id+'@pin.invalid',details.name,phone,details.dateOfBirth,details.gender,...proofValues),
   d.prepare('INSERT INTO pin_accounts(phone,user_id,pin_salt,pin_hash) SELECT ?,id,?,? FROM profiles WHERE id=?')
    .bind(phone,salt,unusedPinHash,id),
   d.prepare('INSERT INTO pin_sessions(token_hash,user_id,expires_at) SELECT ?,id,? FROM profiles WHERE id=?')
    .bind(sessionHash,now+2592000,id),
   d.prepare('DELETE FROM pin_reset_challenges WHERE token_hash=? AND phone=? AND account_hash=?').bind(tokenHash,phone,setupPurpose),
  ]);
 } catch {
  throw new PinAuthError('Unable to finish setup. Try again or sign in again.',409);
 }
 if ((created?.meta?.changes ?? created?.changes) !== 1) throw new PinAuthError('Verify your mobile number to continue.');
 return sessionResponse(req, session);
}

export function pinResetAvailable(e:any) {
 return pinAuthOtpEnabled(e) && !customerOtpOnly(e) && (msg91Ready(e) || smsReady(e));
}

export function createPinReset(d:any,e:any,send:typeof fetch=fetch) {
 return async function reset(path:string,req:Request,input:any,staff=false) {
  if(req.method!=='POST')throw new PinAuthError('Method not allowed',405);
  const origin=req.headers.get('origin');
  if(origin&&origin!==new URL(req.url).origin)throw new PinAuthError('Cross-origin request rejected',403);
  const unified = path.startsWith('auth/pin/access/');
  const signup = !staff && path.includes('/signup-otp/');
  const signIn = unified || staff || path.includes('/otp/');
  const purpose = staff ? 'staff-signin' : unified ? 'mobile-access' : signup ? 'signup' : signIn ? 'signin' : 'reset';
  const requesting = path.endsWith('/request');
  const useMsg91 = msg91Ready(e);
  const whatsapp = usesWhatsAppOtp(e);
  const channel = whatsapp ? 'WhatsApp' : 'SMS';
  if (unified && (!whatsapp || !customerOtpOnly(e))) throw new PinAuthError('Log in is temporarily unavailable.',503);
  if(whatsapp && !useMsg91)throw new PinAuthError('WhatsApp sign-in is being connected. Please try again later.',503);
  if (signup && !customerOtpOnly(e)) throw new PinAuthError('SMS account creation is not available yet.',503);
  if (!pinReady(e) || !pinAuthOtpEnabled(e) || (!useMsg91 && (signIn || !smsReady(e)))) {
   throw new PinAuthError(signIn ? 'SMS sign-in is not available yet.' : 'SMS PIN reset is not available yet. Please contact the café.',503);
  }
  let phone:string;
  try { phone = phoneNumber(input.phone); } catch { throw new PinAuthError('Enter your registered mobile number.'); }
  const now = Math.floor(Date.now()/1000);
  if (path === 'auth/pin/access/profile') {
   if (staff || isApprovedStaff(phone,e)) throw new PinAuthError('Sign in again to continue.',403);
   return finishProfile(d,e,req,input,phone,now);
  }
  const limitPurpose = purpose === 'mobile-access' ? 'signin' : purpose;
  const scope = (staff ? 'staff' : 'customer') + (requesting ? '-otp-request:' : '-otp-confirm:')+(whatsapp?limitPurpose+':':'');
  const phoneHash = await hashTesterToken(scope+phone);
  const ipHash = await hashTesterToken(scope+(req.headers.get('cf-connecting-ip')||'local'));
  await d.prepare('DELETE FROM pin_login_attempts WHERE created_at<?').bind(now-3600).run();
  const reservation = await d.prepare(`INSERT INTO pin_login_attempts(id,phone_hash,ip_hash,created_at)
   SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM pin_login_attempts WHERE phone_hash=? AND created_at>?)<5
   AND (SELECT COUNT(*) FROM pin_login_attempts WHERE ip_hash=? AND created_at>?)<10
   AND (SELECT COUNT(*) FROM pin_login_attempts WHERE created_at>?)<1000
   AND (?=0 OR NOT EXISTS(SELECT 1 FROM pin_login_attempts WHERE phone_hash=? AND created_at>?)) RETURNING id`)
   .bind(crypto.randomUUID(),phoneHash,ipHash,now,phoneHash,now-900,ipHash,now-900,now-3600,whatsapp&&requesting?1:0,phoneHash,now-60).first();
  if (!reservation) throw new PinAuthError(whatsapp&&requesting?'Please wait before requesting another code.':'Too many attempts. Please try again in 15 minutes.',429);
  await d.prepare('DELETE FROM pin_reset_challenges WHERE expires_at<=?').bind(now).run();
  const account = await d.prepare('SELECT a.*,p.disabled FROM pin_accounts a JOIN profiles p ON p.id=a.user_id WHERE a.phone=?').bind(phone).first();
  const eligibleAccount = account && !account.disabled && (!staff || isApprovedStaff(phone,e));
  const legacy = unified && !staff && !account
   ? await d.prepare('SELECT p.id,p.disabled FROM phone_accounts a JOIN profiles p ON p.id=a.user_id WHERE a.phone=?').bind(phone).first()
   : null;
  const unifiedNew = unified && !staff && !account && !legacy?.disabled;
  const legacyAccount = signup && await d.prepare('SELECT user_id FROM phone_accounts WHERE phone=?').bind(phone).first();
  const signupAvailable = signup && !account && !legacyAccount;
  const details = signup ? registrationDetails(input) : null;

  if (requesting) {
   const token = newToken();
   // Unknown and disabled accounts get the same response without sending a message.
   if (signupAvailable || unifiedNew || (!signup && eligibleAccount)) {
    const tokenHash = await hashTesterToken(token);
    const code = useMsg91 ? createSmsCode() : '';
    const accountHash = useMsg91
     ? [purpose,account?.pin_hash ?? '',await smsCodeHash(e.PIN_AUTH_SECRET,purpose,phone,tokenHash,code)].join(':')
     : account.pin_hash;
    try {
     if (useMsg91) await sendMsg91Otp(e,phone,code,send);
     else if (!await verifyProvider(e,phone,undefined,send)) throw Error('Unable to send OTP.');
     const insert = d.prepare('INSERT INTO pin_reset_challenges(token_hash,phone,account_hash,expires_at) VALUES(?,?,?,?)')
      .bind(tokenHash,phone,accountHash,now+600);
     if (unified) {
      await d.batch([
       insert,
       d.prepare('DELETE FROM pin_reset_challenges WHERE phone=? AND token_hash<>? AND substr(account_hash,1,?)=?')
        .bind(phone,tokenHash,purpose.length+1,purpose+':'),
      ]);
     } else await insert.run();
    } catch {
     if (unified) throw new PinAuthError('Couldn’t send the OTP. Try again in a minute.',503);
     // Return the same response for all numbers, including when SMS delivery fails.
    }
   }
   return Response.json({ok:true,challenge:token,channel:whatsapp?'whatsapp':'sms',retryAfter:60,expiresIn:600,message:signup?`If this number can be registered, a verification code will arrive on ${channel}.`:`If this number has an account, a verification code will arrive on ${channel}.`},{headers:{'Cache-Control':'no-store'}});
  }

  const pin = signIn || signup ? undefined : registrationPin(input.pin,input.confirmPin);
  if (typeof input.code !== 'string' || !/^\d{6}$/.test(input.code) || !validToken(input.challenge)) {
   throw new PinAuthError(`Enter the six-digit verification code from ${channel}.`);
  }
  const tokenHash = await hashTesterToken(input.challenge);
  const challenge = await d.prepare(`UPDATE pin_reset_challenges SET checking=1,attempts=attempts+1
   WHERE token_hash=? AND phone=? AND expires_at>? AND checking=0 AND attempts<5 RETURNING *`).bind(tokenHash,phone,now).first();
  if (!challenge) throw new PinAuthError('OTP is invalid or expired. Request a new code.',400);
  const [storedPurpose, accountHash, expectedCode] = challenge.account_hash.split(':');
  const appGenerated = Boolean(expectedCode);
  const originalPinHash = appGenerated ? accountHash : challenge.account_hash;
  let approved = false;
  try {
   if (appGenerated && storedPurpose === purpose) {
    approved = await matchesSmsCode(e.PIN_AUTH_SECRET,purpose,phone,tokenHash,input.code,expectedCode);
   } else if (!appGenerated && !signIn && !signup && !useMsg91) {
    approved = await verifyProvider(e,phone,input.code,send);
   }
  }
  catch { /* Provider errors never authorize a PIN change. */ }
  const mayContinue = signup ? signupAvailable : unifiedNew ? originalPinHash === '' : eligibleAccount && account.pin_hash === originalPinHash;
  if (!approved || !mayContinue) {
   await d.prepare('UPDATE pin_reset_challenges SET checking=0 WHERE token_hash=?').bind(tokenHash).run();
   throw new PinAuthError('OTP is invalid or expired. Request a new code.',400);
  }
  if (unifiedNew) {
   if (legacy) {
    const session = newToken();
    const salt = crypto.randomUUID();
    const unusedPinHash = await passwordHash(JSON.stringify([phone,crypto.randomUUID(),e.PIN_AUTH_SECRET]),salt);
    const sessionHash = await hashTesterToken(session);
    try {
     await d.batch([
      d.prepare('INSERT INTO pin_accounts(phone,user_id,pin_salt,pin_hash) VALUES(?,?,?,?)').bind(phone,legacy.id,salt,unusedPinHash),
      d.prepare('INSERT INTO pin_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(sessionHash,legacy.id,now+2592000),
      d.prepare('DELETE FROM pin_reset_challenges WHERE token_hash=?').bind(tokenHash),
     ]);
    } catch {
     await d.prepare('UPDATE pin_reset_challenges SET checking=0 WHERE token_hash=?').bind(tokenHash).run();
     throw new PinAuthError('Unable to log in. Request a new OTP.',409);
    }
    return sessionResponse(req,session);
   }
   const setup = newToken();
   const updated = await d.prepare(`UPDATE pin_reset_challenges SET token_hash=?,account_hash=?,expires_at=?,attempts=0,checking=0
    WHERE token_hash=? AND checking=1 RETURNING token_hash`)
    .bind(await hashTesterToken(setup),setupPurpose,now+600,tokenHash).first();
   if (!updated) throw new PinAuthError('OTP is invalid or expired. Request a new code.');
   return Response.json({ok:true,setup},{headers:{'Cache-Control':'no-store'}});
  }
  if (signup && details) {
   const userId = 'pin-'+crypto.randomUUID();
   const token = crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
   const salt = crypto.randomUUID();
   const unusedPinHash = await passwordHash(JSON.stringify([phone,crypto.randomUUID(),e.PIN_AUTH_SECRET]),salt);
   try {
    await d.batch([
     d.prepare('INSERT INTO profiles(id,email,name,phone,date_of_birth,gender) VALUES(?,?,?,?,?,?)')
      .bind(userId,userId+'@pin.invalid',details.name,phone,details.dateOfBirth,details.gender),
     d.prepare('INSERT INTO pin_accounts(phone,user_id,pin_salt,pin_hash) VALUES(?,?,?,?)').bind(phone,userId,salt,unusedPinHash),
     d.prepare('INSERT INTO pin_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await hashTesterToken(token),userId,now+2592000),
     d.prepare('DELETE FROM pin_reset_challenges WHERE token_hash=?').bind(tokenHash),
    ]);
   } catch {
    await d.prepare('DELETE FROM pin_reset_challenges WHERE token_hash=?').bind(tokenHash).run();
    throw new PinAuthError('Unable to create an account. Try signing in or request a new OTP.',409);
   }
   return sessionResponse(req,token);
  }
  if (signIn) {
   const session = crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
   const lifetime = staff ? 28800 : 2592000;
   const [created] = await d.batch([
    d.prepare(`INSERT INTO pin_sessions(token_hash,user_id,expires_at)
     SELECT ?,a.user_id,? FROM pin_accounts a JOIN profiles p ON p.id=a.user_id
     WHERE a.phone=? AND a.pin_hash=? AND p.disabled=0
     AND EXISTS(SELECT 1 FROM pin_reset_challenges WHERE token_hash=? AND checking=1)`)
     .bind(await (staff ? staffOtpSessionHash(session) : hashTesterToken(session)),now+lifetime,phone,originalPinHash,tokenHash),
    d.prepare('DELETE FROM pin_reset_challenges WHERE token_hash=?').bind(tokenHash),
   ]);
   if ((created?.meta?.changes ?? created?.changes) !== 1) throw new PinAuthError('OTP is invalid or expired. Request a new code.',400);
   return sessionResponse(req,session,staff);
  }
  const salt = crypto.randomUUID();
  const hash = await passwordHash(JSON.stringify([phone,pin,e.PIN_AUTH_SECRET]),salt);
  await d.batch([
   d.prepare('UPDATE pin_accounts SET pin_salt=?,pin_hash=? WHERE phone=? AND pin_hash=?').bind(salt,hash,phone,originalPinHash),
   d.prepare('DELETE FROM pin_sessions WHERE user_id=?').bind(account.user_id),
   d.prepare('DELETE FROM pin_reset_challenges WHERE phone=?').bind(phone),
  ]);
  const updated = await d.prepare('SELECT pin_hash FROM pin_accounts WHERE phone=?').bind(phone).first();
  if (updated?.pin_hash !== hash) throw new PinAuthError('This reset was replaced by another request. Request a new OTP.',409);
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':`espresso_pin=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${new URL(req.url).protocol==='https:'?'; Secure':''}`}});
 };
}

function sessionResponse(req: Request, token: string, staff = false) {
 const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
 const cookie = staff ? staffPinCookie : pinCookie;
 const session = staff ? 'Max-Age=28800; Path=/; HttpOnly; SameSite=Strict' : 'Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax';
 return Response.json(staff ? {ok:true,destination:'admin'} : {ok:true},
  {headers:{'Cache-Control':'no-store','Set-Cookie':`${cookie}=${token}; ${session}${secure}`}});
}
