'use client';
import {useEffect,useState} from 'react';
import {ArrowLeft,ArrowRight,ShieldCheck,Smartphone} from 'lucide-react';
export default function PhoneLogin(){
 const [phone,setPhone]=useState(''),[code,setCode]=useState(''),[challenge,setChallenge]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[enabled,setEnabled]=useState<boolean|null>(null),[countdown,setCountdown]=useState(0);
 useEffect(()=>{fetch('/api/auth/phone/config').then(r=>{if(!r.ok)throw Error();return r.json()}).then((b:any)=>setEnabled(b.enabled===true)).catch(()=>setEnabled(false))},[]);
 useEffect(()=>{if(!countdown)return;const t=setTimeout(()=>setCountdown(v=>v-1),1000);return()=>clearTimeout(t)},[countdown]);
 async function request(verify=false){setBusy(true);setError('');try{
  const r=await fetch('/api/auth/phone/'+(verify?'verify':'send'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,code,challenge})});const b:any=await r.json();if(!r.ok)throw Error(b.error||'Please try again');
  if(verify){const requested=new URLSearchParams(location.search).get('return_to')||'/#home';location.assign(/^\/#(?:home|menu|cart|checkout|orders|profile|favorites|addresses|suggest|subscriptions)$/.test(requested)?requested:'/#home');return;}
  setChallenge(b.challenge);setCountdown(b.retryAfter||60);setCode('');
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <main className="phone-welcome">
  <div className="phone-brand">Espressoulster<span>COFFEE</span></div>
  <div className="phone-welcome-card">
   <div className="phone-icon">{challenge?<ShieldCheck size={28}/>:<Smartphone size={28}/>}</div>
   <p className="phone-kicker">YOUR DAILY RITUAL STARTS HERE</p>
   <h1>{challenge?'A little code.\nA warm welcome.':'Good coffee.\nYour kind of company.'}</h1>
   <p>{challenge?`Enter the OTP sent to +91 ${phone.replace(/^\+91/,'')}.`:'Sign in with your mobile number to keep your favourites and orders together.'}</p>
   <form onSubmit={e=>{e.preventDefault();request(!!challenge)}}>
    {!challenge?<label>Mobile number<div className="phone-input-row"><span>+91</span><input type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="10-digit mobile number" required pattern="[6-9][0-9]{9}" maxLength={10} value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,''))}/></div></label>:<label>One-time password<input className="otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="Enter OTP" required pattern="[0-9]{4,10}" minLength={4} maxLength={10} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>}
    {enabled===false&&<p className="phone-service-note" role="status">SMS sign-in is being set up. Please try again once SMS sign-in is available.</p>}
    {error&&<p className="phone-error" role="alert">{error}</p>}
    <button className="primary wide" disabled={busy||enabled!==true}>{busy?'Please wait…':challenge?'Verify & continue':'Get OTP'}<ArrowRight size={17}/></button>
   </form>
   {challenge&&<div className="phone-actions"><button type="button" disabled={busy} onClick={()=>{setChallenge('');setCode('');setError('')}}><ArrowLeft size={14}/>Change number</button><button type="button" disabled={busy||countdown>0} onClick={()=>request()}>{countdown?`Resend in ${countdown}s`:'Resend OTP'}</button></div>}

   <small><ShieldCheck size={14}/> We use your number for sign-in. No password needed.</small>
  </div>
  <p className="phone-signature">Brewed with soul. Made for your moment.</p>
 </main>
}
