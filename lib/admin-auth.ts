import {env} from 'cloudflare:workers';
import {headers} from 'next/headers';
import {adminCookie,adminToken,passwordHash,equalHash} from './admin-password';
import {hashTesterToken} from './tester-auth';
import {db,body,json} from './server';
import {assert} from './pricing';
import {androidAdminAccess,androidAdminRequired,localStaffPreview,localStaffPreviewPin,requireAndroidAdmin,staffOtpRequired,staffPhoneAuthRequired,staffOtpDeviceIndependent} from './android-admin-access';
import {createPinAuth,pinToken,staffPinCookie,staffPinSessionHash,staffOtpSessionHash} from './pin-auth-core';
import {createPinReset} from './pin-reset';
import {msg91Ready} from './msg91-otp';
export async function passwordAdmin() {
  const token = adminToken((await headers()).get('cookie'));
  if (!token) return null;
  const e=env as any;
  if (!e.ADMIN_PASSWORD_HASH) return null;
  const session=await db().prepare('SELECT token_hash FROM admin_sessions WHERE token_hash=? AND expires_at>? AND credential_hash=?').bind(await hashTesterToken(token),Math.floor(Date.now()/1000),e.ADMIN_PASSWORD_HASH).first();
  return session ? {userId:'password-admin',email:'',displayName:'Administrator',fullName:'Administrator',phoneVerified:false,authProvider:'admin-password',admin:true,profile:{id:'password-admin',name:'Administrator',phone:'',email:''}} : null;
}
export async function adminAuth(path: string, req: Request) {
  assert(req.method==='POST','Unsupported method',405);
  const e=env as any, d=db(), now=Math.floor(Date.now()/1000);
  const suffix=`; Path=/; HttpOnly; SameSite=Strict${new URL(req.url).protocol==='https:'?'; Secure':''}`;
  if(path==='auth/admin/logout') {
    const staffToken=pinToken(req.headers.get('cookie'),staffPinCookie);
    if(staffToken)await d.prepare('DELETE FROM pin_sessions WHERE token_hash IN (?,?)')
      .bind(await staffPinSessionHash(staffToken),await staffOtpSessionHash(staffToken)).run();
    const token=adminToken(req.headers.get('cookie'));
    if(token)await d.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await hashTesterToken(token)).run();
    const responseHeaders = new Headers({'Cache-Control':'no-store'});
    for (const name of [staffPinCookie,adminCookie]) responseHeaders.append('Set-Cookie',`${name}=; Max-Age=0${suffix}`);
    return Response.json({ok:true},{headers:responseHeaders});
  }
  const staffOtp = path === 'auth/admin/otp/request' || path === 'auth/admin/otp/confirm';
  assert(path==='auth/admin/login' || staffOtp,'Not found',404);
  await requireAndroidAdmin(req.headers.get('cookie'));
  const input=await body(req);
  const host = new URL(req.url).host;
  const localStaff = localStaffPreview(host);
  const otpOnly = staffOtpRequired(host);
  if(androidAdminRequired() || localStaff || staffPhoneAuthRequired(host) || staffOtp || Object.hasOwn(input,'phone')) {
    if(!staffOtpDeviceIndependent() && !androidAdminRequired() && !localStaff)assert(await androidAdminAccess(req.headers.get('cookie')),
      'Open Café Admin in the Espressoulster Android app.',403);
    if(staffOtp) {
      assert(msg91Ready(e),'Staff OTP sign-in is unavailable.',503);
      return createPinReset(d,e)(path,req,input,true);
    }
    assert(!otpOnly,'Sign in with a verification code to open Café Admin.',410);
    return createPinAuth(d,e).route('auth/pin/login',req,input,true,localStaffPreviewPin(host));
  }
  assert(e.ADMIN_LOGIN_USERNAME && e.ADMIN_PASSWORD_SALT && /^[a-f0-9]{64}$/.test(e.ADMIN_PASSWORD_HASH||''),'Administrator login is not configured',503);
  assert(typeof input.username==='string' && input.username.length<=80 && typeof input.password==='string' && input.password.length<=256,'Invalid username or password',401);
  const ip=await hashTesterToken(req.headers.get('cf-connecting-ip')||'local');
  await d.batch([d.prepare('DELETE FROM admin_login_attempts WHERE created_at<?').bind(now-3600),d.prepare('DELETE FROM admin_sessions WHERE expires_at<?').bind(now)]);
  const reservation=await d.prepare('INSERT INTO admin_login_attempts(id,ip_hash,created_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM admin_login_attempts WHERE ip_hash=? AND created_at>?)<10 AND (SELECT COUNT(*) FROM admin_login_attempts WHERE created_at>?)<1000 RETURNING id').bind(crypto.randomUUID(),ip,now,ip,now-900,now-3600).first();
  assert(reservation,'Too many login attempts. Try again in 15 minutes.',429);
  const hash=await passwordHash(input.password,e.ADMIN_PASSWORD_SALT);
  assert(equalHash(hash,e.ADMIN_PASSWORD_HASH) && input.username===e.ADMIN_LOGIN_USERNAME,'Invalid username or password',401);
  const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
  await d.prepare('INSERT INTO admin_sessions(token_hash,expires_at,credential_hash) VALUES(?,?,?)').bind(await hashTesterToken(token),now+28800,e.ADMIN_PASSWORD_HASH).run();
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':`${adminCookie}=${token}; Max-Age=28800${suffix}`}});
}
