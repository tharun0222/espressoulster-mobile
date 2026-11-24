'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import PinLogin from './pin-login';
import StoreApp, {api} from './store-app';
import {adminSectionPath,sampleCarouselPreview} from '../lib/admin-section';
import './opening-reveal.css';
const openingOptions = [
 ['impact', '01 · Bronze Impact'],
 ['soft', '02 · Soft Copper'],
 ['orbit', '03 · Espresso Orbit'],
 ['steam', '04 · Steam First'],
] as const;

export default function MobileEntry({previewPath = '/'}: {previewPath?: string} = {}){
 const [state,setState]=useState<'loading'|'signin'|'app'|'error'>('loading'),[ready,setReady]=useState(false),[retry,setRetry]=useState(0);
 const [pinPreview, setPinPreview] = useState(false);
 const [accountPreview, setAccountPreview] = useState<'welcome' | 'login' | 'register' | null>(null);
 const [signInRequested, setSignInRequested] = useState(false);
 const [openingStyle, setOpeningStyle] = useState<string>('steam');
 const [opening, setOpening] = useState(true);
 const [revealMode, setRevealMode] = useState<"app" | "preview" | null>(null);
 const openingBootstrap = useRef<ReturnType<typeof api> | null>(null);
 const requestBootstrap = useCallback(() => {
  const pending = openingBootstrap.current;
  openingBootstrap.current = null;
  return pending ?? api('bootstrap');
 }, []);
 useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (previewPath === '/' && params.get('signIn') === '1') {
   setSignInRequested(true);
   setOpening(false);
   return;
  }
  setPinPreview(params.get('preview') === 'returning-pin');
  if (previewPath === '/frosted-home-preview') {
   const screen = params.get('preview');
   if (screen === 'welcome' || screen === 'login' || screen === 'register') setAccountPreview(screen);
  }
  if (params.get('preview') === 'steam-51') {
   const style = params.get('style');
   if (openingOptions.some(([id]) => id === style) && style) setOpeningStyle(style);
   setRevealMode('preview');
   return;
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
   setOpening(false);
   return;
  }
  setRevealMode('app');
  const timeout = window.setTimeout(() => setOpening(false), 2800);
  return () => window.clearTimeout(timeout);
 }, [previewPath]);
 useEffect(()=>{const signedOut=()=>{openingBootstrap.current=null;window.history.replaceState(null,'',previewPath+'#home');setState('signin')};window.addEventListener('espresso-pin-signedout',signedOut);return()=>window.removeEventListener('espresso-pin-signedout',signedOut)},[previewPath]);
 const [otpAvailable,setOtpAvailable]=useState(false);
 const [otpOnly,setOtpOnly]=useState(false);
 const [otpChannel,setOtpChannel]=useState<'sms'|'whatsapp'>('sms');
 const [pinResetAvailable,setPinResetAvailable]=useState(false);
 useEffect(()=>{let active=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  fetch('/api/auth/pin/session',{cache:'no-store',signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();const result=await r.json();if(!result||typeof result!=='object')throw Error();return result as {staffAuthenticated?:boolean;authenticated?:boolean;ready?:boolean;otpAvailable?:boolean;otpOnly?:boolean;otpChannel?:string;pinResetAvailable?:boolean;enabled?:boolean};}).then(b=>{
   if(!active)return;
   const customerCheckout = location.hash === '#checkout';
   const entryParams=new URLSearchParams(location.search);
   const explicitSignIn = previewPath === '/' && entryParams.get('signIn') === '1';
   const requestedSwitch = explicitSignIn && entryParams.get('switchAccount') === '1';
   if(previewPath==='/'&&b.staffAuthenticated===true&&b.authenticated!==true&&!customerCheckout&&!requestedSwitch){
    location.replace(adminSectionPath(entryParams));return;
   }
   // An explicit Admin entry can change accounts; an old sign-in link cannot
   // force an already authenticated customer through OTP again.
   const switchAccount=explicitSignIn&&entryParams.get('switchAccount')==='1';
   if(explicitSignIn&&!switchAccount&&b.authenticated===true){
    const url=new URL(location.href);url.searchParams.delete('signIn');
    window.history.replaceState(window.history.state,'',url);setSignInRequested(false);
   }
   const nextState = b.enabled===true&&(switchAccount||b.authenticated!==true)?'signin':'app';
   if (nextState === 'app' && previewPath === '/' && !entryParams.has('preview')) {
    // Start the normal Home read during the opening animation, after the session check.
    const pending = api('bootstrap', 'GET', undefined, controller.signal);
    openingBootstrap.current = pending;
    void pending.catch(() => {}); // StoreApp handles the result, including its normal Retry UI.
   }
   setReady(b.ready===true);setOtpAvailable(b.otpAvailable===true);setOtpOnly(b.otpOnly===true);setOtpChannel(b.otpChannel==='whatsapp'?'whatsapp':'sms');setPinResetAvailable(b.pinResetAvailable===true);setState(nextState);
  }).catch(()=>{if(active)setState('error')}).finally(()=>clearTimeout(timer));return()=>{active=false;controller.abort();openingBootstrap.current=null;clearTimeout(timer)};
 },[retry,previewPath]);
 if (opening) return (
  <main className="phone-welcome opening-reveal" data-reveal={revealMode} data-opening-style={openingStyle} aria-label="Espressoulster Coffee opening">
   <svg className="opening-mark" viewBox="0 0 120 120" role="img" aria-label="Steam and Saucer">
    <defs>
     <linearGradient id="opening-bronze" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
      <stop stopColor="#ffe0b5" />
      <stop offset=".46" stopColor="#d88e64" />
      <stop offset="1" stopColor="#87462d" />
     </linearGradient>
     <path id="opening-steam" d="M42 39C29 28 61 25 53 10L57 8C68 27 37 30 46 37ZM60 39C50 31 73 25 71 18L75 17C79 28 57 33 64 37Z" />
     <path id="opening-cup" fillRule="evenodd" clipRule="evenodd" d="M18 48H86V59H93A14 14 0 0 1 93 87H79A31 31 0 0 1 52 102A34 34 0 0 1 18 68ZM86 67V70Q86 75 83 80H93A6.5 6.5 0 0 0 93 67Z" />
     <path id="opening-saucer" d="M19 107H90A3 3 0 0 1 90 113H19A3 3 0 0 1 19 107Z" />
     <clipPath id="opening-silhouette">
      <use href="#opening-steam" /><use href="#opening-cup" /><use href="#opening-saucer" />
     </clipPath>
     <linearGradient id="opening-glint">
      <stop stopColor="#fff4db" stopOpacity="0" />
      <stop offset=".5" stopColor="#fff4db" stopOpacity=".72" />
      <stop offset="1" stopColor="#fff4db" stopOpacity="0" />
     </linearGradient>
    </defs>
    <g className="opening-piece opening-steam"><use href="#opening-steam" x="2" y="2" fill="#713b26" /><use href="#opening-steam" /></g>
    <g className="opening-piece opening-cup"><use href="#opening-cup" x="2" y="3" fill="#713b26" /><use href="#opening-cup" /></g>
    <g className="opening-piece opening-saucer"><use href="#opening-saucer" x="2" y="2" fill="#713b26" /><use href="#opening-saucer" /></g>
    <g clipPath="url(#opening-silhouette)">
     <path className="opening-glint" d="M38 0H67L95 120H66Z" fill="url(#opening-glint)" />
    </g>
   </svg>
   <div className="phone-brand opening-wordmark">Espressoulster<span>COFFEE</span></div>
   {revealMode === 'preview' && (
    <nav className="opening-options" aria-label="Choose a coffee reveal">
     {openingOptions.map(([id, label]) => (
      <a key={id} href={`?preview=steam-51&style=${id}`} aria-current={openingStyle === id ? 'true' : undefined}>{label}</a>
     ))}
    </nav>
   )}
  </main>
 );
 if(pinPreview)return <PinLogin ready preview initialSignIn otpOnly otpChannel="whatsapp" onSuccess={()=>{}}/>;
 if(accountPreview)return <PinLogin ready preview otpOnly otpChannel="whatsapp" previewMode={accountPreview} minimalWelcome onSuccess={()=>{}}/>;
 if(state==='signin')return <PinLogin ready={ready} otpAvailable={otpAvailable} otpOnly={otpOnly} otpChannel={otpChannel} pinResetAvailable={pinResetAvailable} initialSignIn={signInRequested} minimalWelcome onSuccess={()=>{
  if (signInRequested) {
   const url = new URL(location.href);
   url.searchParams.delete('signIn');
   url.searchParams.delete('switchAccount');
   url.searchParams.delete('section');
   if (url.searchParams.get('preview') === sampleCarouselPreview) url.searchParams.delete('preview');
   window.history.replaceState(window.history.state, '', url);
   setSignInRequested(false);
  }
  setState('app');
 }}/>;
 if(state==='app')return <StoreApp requestBootstrap={requestBootstrap}/>;
 return <main className="phone-welcome"><div className="phone-brand">Espressoulster<span>COFFEE</span></div><p role="status">{state==='error'?'We couldn’t check your sign-in. Please try again.':'Loading…'}</p>{state==='error'&&<button className="primary" onClick={()=>{setState('loading');setRetry(v=>v+1)}}>Try again</button>}</main>;
}
