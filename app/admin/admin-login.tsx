"use client";

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {unlockCelebrationAudio} from '../../lib/celebration-audio';
import {ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole} from 'lucide-react';
import {api} from '../store-app';

export default function AdminLogin() {
 const router = useRouter();
 const [username, setUsername] = useState('');
 const [password, setPassword] = useState('');
 const [showPassword, setShowPassword] = useState(false);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');

 async function submit(event: React.FormEvent) {
  event.preventDefault();
  if (busy) return;
  unlockCelebrationAudio();
  setBusy(true);
  setError('');
  try {
   await api('auth/admin/login', 'POST', {username, password});
   router.refresh();
  } catch (failure) {
   setError((failure as Error).message);
  } finally {
   setBusy(false);
  }
 }

 return <main className="admin-signin-page">
  <div className="admin-signin-brand">Espressoulster<span>COFFEE</span></div>
  <section className="admin-signin-card" aria-labelledby="admin-signin-title">
   <header>
    <span className="admin-signin-icon" aria-hidden="true"><LockKeyhole size={22}/></span>
    <p className="admin-signin-eyebrow">ADMIN PORTAL</p>
    <h1 id="admin-signin-title">Sign in</h1>
    <p>Access your café dashboard.</p>
   </header>
   <form onSubmit={submit} aria-busy={busy}>
    <label htmlFor="admin-username">Username</label>
    <input id="admin-username" autoComplete="username" autoCapitalize="none" spellCheck={false}
      placeholder="Enter your username" required maxLength={80} disabled={busy}
      value={username} onChange={event => setUsername(event.target.value)}/>
    <label htmlFor="admin-password">Password</label>
    <div className="admin-password-field">
     <input id="admin-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
       placeholder="Enter your password" required maxLength={256}
       disabled={busy} value={password} onChange={event => setPassword(event.target.value)}/>
     <button type="button" className="admin-password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'}
       aria-pressed={showPassword} disabled={busy} onClick={() => setShowPassword(value => !value)}>
       {showPassword ? <EyeOff size={19}/> : <Eye size={19}/>}
     </button>
    </div>
    {error && <p className="admin-signin-error" role="alert">{error}</p>}
    <button className="admin-signin-submit" disabled={busy}>
      {busy ? 'Signing in…' : 'Sign in to dashboard'}<ArrowRight size={18} aria-hidden="true"/>
    </button>
   </form>
   <a className="admin-login-back" href="/#home"><ArrowLeft size={16} aria-hidden="true"/>Back to customer app</a>
  </section>
 </main>;
}
