"use client";
import {useState} from 'react';
import {ArrowRight,Eye,EyeOff,LockKeyhole} from 'lucide-react';
import {api} from '../store-app';
export default function AdminLogin() {
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[showPassword,setShowPassword]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <main className="admin-signin-page">
  <div className="admin-signin-brand">Espressoulster<span>COFFEE</span></div>
  <section className="admin-signin-card" aria-labelledby="admin-signin-title">
   <header><span className="admin-signin-icon" aria-hidden="true"><LockKeyhole size={22}/></span><p className="admin-signin-eyebrow">ADMIN PORTAL</p><h1 id="admin-signin-title">Sign in</h1><p>Access your café dashboard.</p></header>
   <form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{await api('auth/admin/login','POST',{username,password});location.assign('/admin')}catch(e){setError((e as Error).message);setBusy(false)}}}>
    <label htmlFor="admin-username">Username</label>
    <input id="admin-username" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Enter your username" required maxLength={80} disabled={busy} value={username} onChange={e=>setUsername(e.target.value)}/>
    <label htmlFor="admin-password">Password</label>
    <div className="admin-password-field"><input id="admin-password" type={showPassword?'text':'password'} autoComplete="current-password" placeholder="Enter your password" required maxLength={256} disabled={busy} value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" className="admin-password-toggle" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} disabled={busy} onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff size={19}/>:<Eye size={19}/>}</button></div>
    {error&&<p className="admin-signin-error" role="alert">{error}</p>}
    <button className="admin-signin-submit" disabled={busy}>{busy?'Signing in…':'Sign in to dashboard'}<ArrowRight size={18} aria-hidden="true"/></button>
   </form>
  </section>
 </main>;
}
