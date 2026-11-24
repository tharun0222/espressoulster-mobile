'use client';

import {useEffect,useRef,useState} from 'react';
import {startWhatsAppAutofill} from '../lib/native-whatsapp-otp';
import {rememberPinPhone} from '../lib/remembered-pin-phone';
import {adminSectionPath} from '../lib/admin-section';
import ProfileGenderField from './profile-gender-field';
import {publicMessage} from '../lib/public-message';
import {staffSignInRequest} from '../lib/staff-signin-request';

export default function ForgotPin({initialPhone,onBack,onReset,signIn=false,signup=false,channel='sms',backLabel='Back',onCreateAccount,preview=false}:{initialPhone:string;onBack:()=>void;onReset:(phone:string)=>void;signIn?:boolean;signup?:boolean;channel?:'sms'|'whatsapp';backLabel?:string;onCreateAccount?:()=>void;preview?:boolean}) {
 const [phone,setPhone] = useState(initialPhone);
 const [challenge,setChallenge] = useState('');
 const [code,setCode] = useState('');
 const [pin,setPin] = useState('');
 const [confirmation,setConfirmation] = useState('');
 const [busy,setBusy] = useState(false);
 const [error,setError] = useState('');
 const [name,setName] = useState('');
 const [dateOfBirth,setDateOfBirth] = useState('');
 const [gender,setGender] = useState('');
 const formRef=useRef<HTMLFormElement>(null);
 const autofill=useRef<ReturnType<typeof startWhatsAppAutofill>|null>(null);
 const mounted=useRef(true);
 const [automaticallyFilled,setAutomaticallyFilled]=useState(false);
 const whatsapp=channel==='whatsapp';
 const title = signup ? 'Create account' : signIn ? 'Welcome back' : 'Reset your PIN';
 const [resendAt,setResendAt]=useState(0),[seconds,setSeconds]=useState(0);
 useEffect(()=>{const update=()=>setSeconds(Math.max(0,Math.ceil((resendAt-Date.now())/1000)));update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[resendAt]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;autofill.current?.stop();};},[]);
 useEffect(()=>{
  if(challenge&&automaticallyFilled&&!busy&&/^\d{6}$/.test(code))formRef.current?.requestSubmit();
 },[challenge,automaticallyFilled,busy,code]);

 async function submit(event:React.FormEvent) {
  event.preventDefault();
  if (preview || busy) return;
  setBusy(true);
  setError('');
  try {
   if(challenge)setAutomaticallyFilled(false);
   if(!challenge&&whatsapp){
    autofill.current?.stop();
    autofill.current=startWhatsAppAutofill(received=>{
     if(mounted.current){setCode(received);setAutomaticallyFilled(true);}
    });
    await autofill.current.ready;
    if(!mounted.current)return;
   }
   const send = () => fetch('/api/auth/pin/'+(signup?'signup-otp':signIn?'otp':'reset')+'/'+(challenge?'confirm':'request'),{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({phone,challenge,code,...(signup?{name,dateOfBirth,gender}:signIn?{}:{pin,confirmPin:confirmation})}),
    signal:AbortSignal.timeout(15000),
   });
   const {response,result} = signIn ? await staffSignInRequest(send) : await (async()=>{
    const response=await send();return {response,result:await response.json() as {error?:string;challenge?:string;message?:string;destination?:string}};
   })();
   if (!response.ok) {
    throw Error(response.status>=500?'Log in is temporarily unavailable. Please try again shortly.':publicMessage(result.error,signIn?'Unable to log in. Please try again.':'Unable to verify your number. Please try again.'));
   }
   if (!challenge) {
    if(typeof result.challenge!=='string' || !/^[a-f0-9]{64}$/.test(result.challenge))throw Error('Unable to send a code. Please try again.');
    setChallenge(result.challenge);
    setResendAt(Date.now()+60000);
   } else {
    autofill.current?.stop();
    if (result.destination === 'admin') {window.location.replace(adminSectionPath(new URLSearchParams(location.search)));return;}
    rememberPinPhone(phone);
    onReset(phone);
   }
  } catch(error) {
   autofill.current?.stop();
   setAutomaticallyFilled(false);
   setError((error as Error).name==='TimeoutError'?'Please try again. Check your connection if this continues.':publicMessage((error as Error).message,'Unable to log in. Please try again.'));
  } finally { setBusy(false); }
 }

 return <main className="phone-welcome pin-welcome returning-pin" data-cafe-form={whatsapp?(signup?'register':'signin'):undefined}>
  {whatsapp?<div className="after-hours-brand">Espressoulster<span>Coffee</span></div>:<div className="welcome-brand-group"><div className="phone-brand">Espressoulster<span>COFFEE</span></div></div>}
  <section className="phone-welcome-card" aria-label={title}>
   {!signIn && <button type="button" className="pin-back" disabled={busy} onClick={onBack}>{backLabel}</button>}
   <h1>{title}</h1>
   {!challenge&&<p>{whatsapp?'We’ll send your code on WhatsApp.':'We’ll send a code to your mobile number.'}</p>}
   {signIn&&onCreateAccount&&<button type="button" className="cafe-account-switch" disabled={busy} onClick={onCreateAccount}>New here? Create account</button>}
   <form ref={formRef} onSubmit={submit}>
    {signup && !challenge && <>
     <label>Your name *<input className="pin-profile-input" autoComplete="name" required minLength={2} maxLength={100} disabled={busy} value={name} onChange={event=>setName(event.target.value)}/></label>
     <label>Date of birth *<input className="pin-profile-input" type="date" autoComplete="bday" required min="1900-01-01" max={new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})} disabled={busy} value={dateOfBirth} onChange={event=>setDateOfBirth(event.target.value)}/></label>
     <ProfileGenderField required value={gender} onChange={setGender} disabled={busy}/>
    </>}
    <label>Mobile number *<div className="phone-input-row"><span>+91</span><input type="tel" inputMode="numeric" autoComplete="tel-national" required pattern="[6-9][0-9]{9}" maxLength={10} placeholder="10-digit WhatsApp number" disabled={busy||Boolean(challenge)} value={phone} onChange={event=>{setPhone(event.target.value.replace(/\D/g,''));setError('')}}/></div></label>
    {challenge && <>
     <label>Enter OTP<input className="pin-profile-input" autoComplete="one-time-code" inputMode="numeric" required pattern="[0-9]{6}" maxLength={6} disabled={busy} value={code} onChange={event=>{setAutomaticallyFilled(false);setCode(event.target.value.replace(/\D/g,''));}}/></label>
     {!signIn && !signup && <>
     <label>New six-digit PIN<input className="pin-profile-input" type="password" inputMode="numeric" autoComplete="new-password" required pattern="[0-9]{6}" maxLength={6} disabled={busy} value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,''))}/></label>
     <label>Confirm new PIN<input className="pin-profile-input" type="password" inputMode="numeric" autoComplete="new-password" required pattern="[0-9]{6}" maxLength={6} disabled={busy} value={confirmation} onChange={event=>setConfirmation(event.target.value.replace(/\D/g,''))}/></label>
     <p className="pin-help">Use a unique PIN. Avoid repeated or consecutive numbers.</p>
     </>}
    </>}
    {automaticallyFilled&&<p role="status" className="phone-service-note">Code received. Verifying your number…</p>}
    {error&&<p role="alert" className="phone-error">{error}</p>}
    <button className="primary wide" disabled={preview||busy}>{busy?'Please wait…':signIn?'Log in':challenge?(signup?'Verify & create account':'Save new PIN'):whatsapp&&signup?'Create account':'Send OTP'}</button>
   </form>
   {challenge&&<button type="button" className="pin-back" disabled={busy||seconds>0} onClick={()=>{autofill.current?.stop();setAutomaticallyFilled(false);setChallenge('');setCode('');setError('')}}>{seconds>0?`Resend available in ${seconds}s`:'Change number or request a new code'}</button>}
  </section>
 </main>;
}
