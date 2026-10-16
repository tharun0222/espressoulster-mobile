'use client';
import {useEffect,useState} from 'react';
import PinLogin from './pin-login';
import StoreApp from './store-app';
export default function MobileEntry(){
 useEffect(()=>{const signedOut=()=>{window.history.replaceState(null,'','/#home');setState('signin')};window.addEventListener('espresso-pin-signedout',signedOut);return()=>window.removeEventListener('espresso-pin-signedout',signedOut)},[]);
 const [state,setState]=useState<'loading'|'signin'|'app'|'error'>('loading'),[ready,setReady]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  fetch('/api/auth/pin/session',{cache:'no-store',signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then((b:any)=>{if(active){setReady(b.ready===true);setState(b.enabled!==true||b.authenticated===true?'app':'signin')}}).catch(()=>{if(active)setState('error')}).finally(()=>clearTimeout(timer));return()=>{active=false;controller.abort();clearTimeout(timer)};
 },[retry]);
 if(state==='signin')return <PinLogin ready={ready} onSuccess={()=>setState('app')}/>;
 if(state==='app')return <StoreApp/>;
 return <main className="phone-welcome"><div className="phone-brand">Espressoulster<span>COFFEE</span></div><p role="status">{state==='error'?'We couldn’t check your sign-in. Please try again.':'Loading…'}</p>{state==='error'&&<button className="primary" onClick={()=>{setState('loading');setRetry(v=>v+1)}}>Try again</button>}</main>;
}
