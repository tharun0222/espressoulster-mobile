'use client';
import './after-hours-welcome.css';
import './returning-pin.css';
import './cafe-account.css';
import ForgotPin from './forgot-pin';
import WhatsAppLogin from './whatsapp-login';
import {prepareAndroidPinSignIn} from '../lib/native-pin-signin';
import ProfileGenderField from './profile-gender-field';
import {unlockCelebrationAudio,welcomeSound} from '../lib/celebration-audio';
import {useState} from 'react';
import {readRememberedPinPhone, rememberPinPhone} from '../lib/remembered-pin-phone';
import {adminSectionPath} from '../lib/admin-section';
import {ArrowRight,LockKeyhole,Eye,EyeOff,UserRoundPlus,LogIn} from 'lucide-react';
export default function PinLogin({ready,onSuccess,preview=false,previewMode,minimalWelcome=false,otpAvailable=false,otpOnly=false,otpChannel='sms',pinResetAvailable=false,initialSignIn=false}:{ready:boolean;onSuccess:()=>void;preview?:boolean;previewMode?:'welcome'|'login'|'register';minimalWelcome?:boolean;otpAvailable?:boolean;otpOnly?:boolean;otpChannel?:'sms'|'whatsapp';pinResetAvailable?:boolean;initialSignIn?:boolean}){
 const [differentAccount,setDifferentAccount] = useState(initialSignIn);
 const [forgot,setForgot] = useState(false);
 const [otpSignIn,setOtpSignIn] = useState(otpAvailable);
 const [resetMessage,setResetMessage] = useState('');
 const [gender,setGender] = useState('');
 const [rememberedPhone] = useState(() => preview ? (previewMode ? '' : '9000000000') : readRememberedPinPhone());
 const [mode,setMode]=useState<'welcome'|'login'|'register'>((preview && previewMode) || (initialSignIn || rememberedPhone ? 'login' : 'welcome')),[name,setName]=useState(''),[dateOfBirth,setDateOfBirth]=useState(''),[phone,setPhone]=useState(rememberedPhone),[pin,setPin]=useState(''),[confirmPin,setConfirmPin]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pinOnly = !differentAccount && mode === 'login' && Boolean(rememberedPhone) && phone === rememberedPhone;
 function switchMode(next:'welcome'|'login'|'register'){setMode(next);if(next==='welcome'){setDifferentAccount(true);setPhone('');}setPin('');setConfirmPin('');setShow(false);setError('');}
 async function submit(e:React.FormEvent){e.preventDefault();if(preview||busy||!ready)return;unlockCelebrationAudio();setBusy(true);setError('');try{
  const send=()=>fetch('/api/auth/pin/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,pin,...(mode==='register'?{confirmPin,name,dateOfBirth,gender}:{})}),signal:AbortSignal.timeout(15000)});
  let r=await send(), b:{error?:string;staffOnly?:boolean;destination?:string}=await r.json();
  if(mode==='login' && r.status===403 && b.staffOnly===true && await prepareAndroidPinSignIn()){r=await send();b=await r.json();}
  if (!r.ok) {
   if (r.status===410 && mode==='login' && otpAvailable) {setPin('');setOtpSignIn(true);return;}
   throw Error(b.error||'Unable to sign in. Please try again.');
  }
  if(b.destination==='admin'){window.location.replace(adminSectionPath(new URLSearchParams(location.search)));return;}
  rememberPinPhone(phone);setPin('');setConfirmPin('');welcomeSound();onSuccess();
 }catch(e){setError((e as Error).name==='TimeoutError'?'Sign-in timed out. Please try again.':(e as Error).message)}finally{setBusy(false)}}
 if (otpOnly && otpChannel === 'whatsapp' && (!preview || !previewMode)) return <WhatsAppLogin initialPhone={phone} ready={ready && (preview || otpAvailable)} preview={preview} onSuccess={onSuccess}/>;
 if (otpOnly && mode !== 'welcome') return <ForgotPin preview={preview} key={mode} onCreateAccount={mode==='login'?()=>switchMode('register'):undefined} channel={otpChannel} signup={mode==='register'} signIn={mode==='login'} initialPhone={phone} onBack={()=>switchMode('welcome')} onReset={onSuccess}/>;
 if (otpAvailable && otpSignIn && mode === 'login') return <ForgotPin preview={preview} backLabel="Use PIN instead" onCreateAccount={()=>{setOtpSignIn(false);switchMode('register');}} channel={otpChannel} signIn initialPhone={phone} onBack={()=>setOtpSignIn(false)} onReset={onSuccess}/>;
 if (pinResetAvailable && forgot) return <ForgotPin channel={otpChannel} initialPhone={phone} onBack={()=>setForgot(false)} onReset={number=>{setPhone(number);setMode('login');setPin('');setConfirmPin('');setForgot(false);setResetMessage('PIN updated. Sign in with your new PIN.')}}/>;
 if (mode === 'welcome') return (
  <main className="after-hours-welcome" data-cafe-welcome={minimalWelcome ? '' : undefined} aria-label={minimalWelcome ? 'Espressoulster Coffee welcome' : undefined}>
   <div className="after-hours-brand">Espressoulster<span>Coffee</span></div>
   <section className="after-hours-content" aria-label={minimalWelcome ? 'Account options' : undefined} aria-labelledby={minimalWelcome ? undefined : 'after-hours-title'}>
    {!minimalWelcome && <>
     <p className="after-hours-kicker">Welcome to the café</p>
     <h1 id="after-hours-title">Meet me for coffee.</h1>
     <p>Save your favourites and order from the café.</p>
    </>}
    <div className="after-hours-actions">
     <button type="button" onClick={() => switchMode('register')}>{minimalWelcome && <UserRoundPlus size={21} aria-hidden="true" />}Create account</button>
     <button type="button" onClick={() => switchMode('login')}>{minimalWelcome && <LogIn size={21} aria-hidden="true" />}Log in</button>
    </div>
   </section>
  </main>
 );
 const styledForm = minimalWelcome && !pinOnly;
 return <main key={mode} className={pinOnly ? "phone-welcome pin-welcome returning-pin" : "phone-welcome pin-welcome"} data-cafe-form={styledForm ? mode : undefined}>
  {styledForm ? <div className="after-hours-brand">Espressoulster<span>Coffee</span></div> : <div className="welcome-brand-group"><div className="phone-brand">Espressoulster<span>COFFEE</span></div></div>}
  <section className="phone-welcome-card" aria-label="Mobile and PIN sign-in">
   {!preview && !styledForm && <button className="pin-back" type="button" disabled={busy} onClick={()=>switchMode('welcome')}>{pinOnly ? 'Use a different account' : '← Back'}</button>}
   {!styledForm && <div className="phone-icon" aria-hidden="true"><LockKeyhole size={26}/></div>}
   {pinOnly && <p className="returning-pin-kicker">ESPRESSOULSTER ACCESS</p>}
   <h1>{mode==='register'?'Create account':'Welcome back'}</h1>
   <p>{mode==='register'?'Add your details and set a six-digit PIN.':pinOnly?'Enter your six-digit PIN.':'Sign in with your mobile number and PIN.'}</p>
   {resetMessage && <p role="status" className="phone-service-note">{resetMessage}</p>}
   <form onSubmit={submit}>
    {mode==='register'&&<>
     <label>Your name *<input className="pin-profile-input" aria-label="Your name" autoComplete="name" required minLength={2} maxLength={100} placeholder="Enter your name" disabled={busy} value={name} onChange={e=>setName(e.target.value)}/></label>
     <label>Date of birth *<input className="pin-profile-input" aria-label="Date of birth" type="date" autoComplete="bday" required min="1900-01-01" max={new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})} disabled={busy} value={dateOfBirth} onChange={e=>setDateOfBirth(e.target.value)}/></label>
     <ProfileGenderField required value={gender} onChange={setGender} disabled={busy}/>
    </>}

    {!pinOnly && <label>Mobile number<div className="phone-input-row"><span>+91</span><input aria-label="Mobile number" type="tel" inputMode="numeric" autoComplete="tel-national" required pattern="[6-9][0-9]{9}" maxLength={10} placeholder="10-digit mobile number" disabled={busy} value={phone} onChange={e=>{setPhone(e.target.value.replace(/\D/g,''));setError('');}}/></div></label>}
    <label>{mode==='register'?'Create a six-digit PIN':'Six-digit PIN'}<div className="pin-input-row" data-masked={pinOnly && !show ? 'true' : undefined}>
     {pinOnly && !show && <span className="pin-slots" aria-hidden="true">
      {Array.from({length:6}, (_, index) => <span key={index} data-filled={index < pin.length} data-next={index === pin.length}><i /></span>)}
     </span>}
     <input aria-label={mode==='register'?'Create a six-digit PIN':'Six-digit PIN'} type={show?'text':'password'} inputMode="numeric" autoComplete={mode==='register'?'new-password':'current-password'} required pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="••••••" disabled={busy} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))}/><button type="button" aria-label={show?'Hide PIN':'Show PIN'} aria-pressed={show} onClick={()=>setShow(v=>!v)}>{show?<EyeOff size={19}/>:<Eye size={19}/>}</button></div></label>
    {mode==='register'&&<label>Confirm PIN<div className="pin-input-row"><input aria-label="Confirm PIN" type={show?'text':'password'} inputMode="numeric" autoComplete="new-password" required pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="Enter your PIN again" disabled={busy} value={confirmPin} onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,''))}/></div></label>}
    {!ready&&<p className="phone-service-note" role="status">PIN sign-in is being set up. Please try again shortly.</p>}
    {error&&<p className="phone-error" role="alert">{error}</p>}
    {preview && !previewMode && <p className="phone-service-note">Preview only. Use a sample PIN to try the field.</p>}
    <button className="primary wide" disabled={preview||busy||!ready}>{busy?'Please wait…':mode==='register'?'Create account & continue':pinOnly?'Unlock app':'Log in'}<ArrowRight size={17}/></button>
   </form>
   {mode==='login' && pinResetAvailable && !preview && <button type="button" className="pin-back" disabled={busy} onClick={()=>{setForgot(true);setError('');setPin('')}}>Forgot PIN?</button>}
   {mode==='login' && !preview && otpAvailable && <button type="button" className="pin-back" disabled={busy} onClick={()=>{setOtpSignIn(true);setError('');setPin('')}}>{otpChannel==='whatsapp'?'Log in with WhatsApp':'Log in with OTP'}</button>}
   {styledForm && <button type="button" className="cafe-account-switch" disabled={busy} onClick={()=>switchMode(mode === 'register' ? 'login' : 'register')}>{mode === 'register' ? 'Already have an account? Sign in' : 'New here? Create account'}</button>}
   {mode==='register' && <p className="pin-help">Use a unique PIN. Avoid repeated or consecutive numbers.</p>}
   <small><LockKeyhole size={13}/> Keep your PIN private. We never display it in your profile.</small>
  </section>
 </main>;
}
