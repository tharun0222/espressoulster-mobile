'use client';
import DancingCoffee from './dancing-coffee';
import {unlockCelebrationAudio,welcomeSound} from '../lib/celebration-audio';
import {useState} from 'react';
import {ArrowRight,LockKeyhole,Eye,EyeOff} from 'lucide-react';
export default function PinLogin({ready,onSuccess}:{ready:boolean;onSuccess:()=>void}){
 const [mode,setMode]=useState<'welcome'|'login'|'register'>('welcome'),[name,setName]=useState(''),[dateOfBirth,setDateOfBirth]=useState(''),[phone,setPhone]=useState(''),[pin,setPin]=useState(''),[confirmPin,setConfirmPin]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 function switchMode(next:'welcome'|'login'|'register'){setMode(next);setPin('');setConfirmPin('');setShow(false);setError('');}
 async function submit(e:React.FormEvent){e.preventDefault();if(busy||!ready)return;unlockCelebrationAudio();setBusy(true);setError('');try{
  const r=await fetch('/api/auth/pin/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,pin,...(mode==='register'?{confirmPin,name,dateOfBirth}:{})}),signal:AbortSignal.timeout(15000)});
  const b:any=await r.json();if(!r.ok)throw Error(b.error||'Unable to sign in. Please try again.');setPin('');setConfirmPin('');welcomeSound();onSuccess();
 }catch(e){setError((e as Error).name==='TimeoutError'?'Sign-in timed out. Please try again.':(e as Error).message)}finally{setBusy(false)}}
 return <main className="phone-welcome pin-welcome">
  <div className="welcome-brand-group">{mode==='welcome'&&<DancingCoffee/>}<div className="phone-brand">Espressoulster<span>COFFEE</span></div></div>
  <section className="phone-welcome-card" aria-label="Mobile and PIN sign-in">
   {mode!=='welcome'&&<button className="pin-back" type="button" disabled={busy} onClick={()=>switchMode('welcome')}>← Back</button>}
   {mode==='welcome'?<>
    <div className="phone-icon"><LockKeyhole size={26}/></div>
    <h1>Let’s get started</h1>
    <p>Create an account to save your favourites and orders, or sign in if you already have one.</p>
    <div className="pin-welcome-actions"><button className="primary wide" onClick={()=>switchMode('register')}>Create account <ArrowRight size={17}/></button><button className="pin-existing" onClick={()=>switchMode('login')}>Already have an account? Sign in</button></div>
   </>:<>
   <div className="phone-icon"><LockKeyhole size={26}/></div>
   <h1>{mode==='register'?'Create account':'Welcome back'}</h1>
   <p>{mode==='register'?'Add your details and set a six-digit PIN.':'Sign in with your mobile number and PIN.'}</p>
   <form onSubmit={submit}>
    {mode==='register'&&<>
     <label>Your name<input className="pin-profile-input" aria-label="Your name" autoComplete="name" required minLength={2} maxLength={100} placeholder="Enter your name" disabled={busy} value={name} onChange={e=>setName(e.target.value)}/></label>
     <label>Date of birth<input className="pin-profile-input" aria-label="Date of birth" type="date" autoComplete="bday" required min="1900-01-01" max={new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})} disabled={busy} value={dateOfBirth} onChange={e=>setDateOfBirth(e.target.value)}/></label>
    </>}

    <label>Mobile number<div className="phone-input-row"><span>+91</span><input aria-label="Mobile number" type="tel" inputMode="numeric" autoComplete="tel-national" required pattern="[6-9][0-9]{9}" maxLength={10} placeholder="10-digit mobile number" disabled={busy} value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,''))}/></div></label>
    <label>{mode==='register'?'Create a six-digit PIN':'Six-digit PIN'}<div className="pin-input-row"><input aria-label={mode==='register'?'Create a six-digit PIN':'Six-digit PIN'} type={show?'text':'password'} inputMode="numeric" autoComplete={mode==='register'?'new-password':'current-password'} required pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="••••••" disabled={busy} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))}/><button type="button" aria-label={show?'Hide PIN':'Show PIN'} aria-pressed={show} onClick={()=>setShow(v=>!v)}>{show?<EyeOff size={19}/>:<Eye size={19}/>}</button></div></label>
    {mode==='register'&&<label>Confirm PIN<div className="pin-input-row"><input aria-label="Confirm PIN" type={show?'text':'password'} inputMode="numeric" autoComplete="new-password" required pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="Enter your PIN again" disabled={busy} value={confirmPin} onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,''))}/></div></label>}
    {!ready&&<p className="phone-service-note" role="status">PIN sign-in is being set up. Please try again shortly.</p>}
    {error&&<p className="phone-error" role="alert">{error}</p>}
    <button className="primary wide" disabled={busy||!ready}>{busy?'Please wait…':mode==='register'?'Create account & continue':'Sign in & continue'}<ArrowRight size={17}/></button>
   </form>
   <p className="pin-help">{mode==='register'?'Use a unique PIN. Avoid repeated or consecutive numbers.':'Forgot your PIN? Contact the café. Your account cannot be reset using a mobile number alone.'}</p>
   <small><LockKeyhole size={13}/> Keep your PIN private. We never display it in your profile.</small>
   </>}
  </section>
 </main>;
}
