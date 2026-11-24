import {env} from 'cloudflare:workers';
import {adminIdentity,db,body} from './server';
import {createPinAuth,pinToken,PinAuthError,staffPinCookie} from './pin-auth-core';
import {androidAdminAccess,androidAdminRequired,localStaffPreview,localStaffPreviewPin,staffOtpRequired,staffOtpDeviceIndependent} from './android-admin-access';
import {createPinReset} from './pin-reset';
import {msg91Ready} from './msg91-otp';
import {canSeeStaffPanel,isApprovedStaff} from './staff-panel-access';

export async function pinAuth(path:string,req:Request) {
 const database = db();
 const auth = createPinAuth(database,env);
 const input = req.method === 'POST' && !path.endsWith('/logout') ? await body(req) : {};
 const host = new URL(req.url).host;
 const cookie = req.headers.get('cookie');
 const previewPin = localStaffPreviewPin(host);
 const staffOnly = canSeeStaffPanel(input.phone, env.STAFF_ONLY_PHONES);
 const pinSignIn = path === 'auth/pin/login';
 const otpSignIn = ['auth/pin/otp/request', 'auth/pin/otp/confirm', 'auth/pin/access/request', 'auth/pin/access/confirm'].includes(path);
 const previewStaff = pinSignIn && previewPin && input.pin === previewPin && isApprovedStaff(input.phone,env);

 if (req.method === 'POST' && (((staffOnly || isApprovedStaff(input.phone,env)) && (pinSignIn || otpSignIn)) || previewStaff)) {
  if (!staffOtpDeviceIndependent() && !(localStaffPreview(host) && !androidAdminRequired()) && !await androidAdminAccess(cookie)) {
   throw new PinAuthError('Open the Espressoulster Android app to sign in with this number.',403,true);
  }
  if (otpSignIn) {
   if (!msg91Ready(env)) throw new PinAuthError('Log in is temporarily unavailable. Please try again shortly.',503);
   return createPinReset(database,env)(path,req,input,true);
  }
  if (staffOtpRequired(host)) throw new PinAuthError('Sign in with a verification code.',410);
  return auth.route(path,req,input,true,previewPin);
 }
 const response = await auth.route(path,req,input);
 if (path === 'auth/pin/session' && pinToken(cookie,staffPinCookie)) {
  const staff = await adminIdentity().catch(() => null);
  if (staff?.authProvider === 'staff-pin') {
   return Response.json({...await response.json() as object,staffAuthenticated:true}, {headers:{'Cache-Control':'no-store'}});
  }
 }
 return response;
}
