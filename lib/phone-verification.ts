export const phoneCookie='espresso_phone';
export function phoneNumber(value:unknown){
 if(typeof value!=='string')throw Error('Enter a valid 10-digit Indian mobile number');
 const digits=value.replace(/[\s()-]/g,'');
 const local=digits.startsWith('+91')?digits.slice(3):digits;
 if(!/^[6-9]\d{9}$/.test(local))throw Error('Enter a valid 10-digit Indian mobile number');
 return '+91'+local;
}
export function phoneSessionToken(cookie:string|null){const token=(cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(phoneCookie+'='))?.slice(phoneCookie.length+1);return token&&/^[a-f0-9]{64}$/.test(token)?token:null;}
export type VerifyConfig={TWILIO_ACCOUNT_SID?:string;TWILIO_AUTH_TOKEN?:string;TWILIO_VERIFY_SERVICE_SID?:string};
export function smsReady(e:VerifyConfig){return /^AC[a-f0-9]{32}$/i.test(e.TWILIO_ACCOUNT_SID||'')&&!!e.TWILIO_AUTH_TOKEN&&/^VA[a-f0-9]{32}$/i.test(e.TWILIO_VERIFY_SERVICE_SID||'');}
export async function verifyProvider(e:VerifyConfig,phone:string,code?:string,send:typeof fetch=fetch){
 if(!smsReady(e))throw Error('SMS sign-in is not available yet. Please try again later.');
 const response=await send(`https://verify.twilio.com/v2/Services/${e.TWILIO_VERIFY_SERVICE_SID}/${code?'VerificationCheck':'Verifications'}`,{method:'POST',headers:{Authorization:'Basic '+btoa(e.TWILIO_ACCOUNT_SID+':'+e.TWILIO_AUTH_TOKEN),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(code?{To:phone,Code:code}:{To:phone,Channel:'sms'}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error(code?'Code is invalid or expired. Request a new OTP.':'Unable to send OTP. Please try again later.');
 const result:any=await response.json();
 return code?result.status==='approved'&&result.to===phone:result.status==='pending';
}
