type SignInResult={requestId?:string;ready?:boolean;error?:string};
type SignInWindow=Pick<Window,'addEventListener'|'removeEventListener'|'prompt'>&{espressoAndroidSignIn?:boolean};
export type AndroidSignInFailure='unavailable'|'network'|'device'|'session'|'timeout'|'cancelled'|'verification';
type AndroidSignInPreparation={ready:boolean;error?:AndroidSignInFailure};

/** App proof never replaces the backend's staff allowlist or PIN check. */
export function prepareAndroidPinSignIn(bridge:SignInWindow=window):Promise<boolean>{
 return prepareAndroidStaffSignIn(bridge).then(result=>result.ready);
}

export function prepareAndroidStaffSignIn(bridge:SignInWindow=window):Promise<AndroidSignInPreparation>{
 if(bridge.espressoAndroidSignIn!==true)return Promise.resolve({ready:false,error:'unavailable'});
 return new Promise(resolve=>{
  const requestId=crypto.randomUUID();let done=false;
  function finish(ready:boolean,error?:AndroidSignInFailure){
   if(done)return;done=true;clearTimeout(timer);
   bridge.removeEventListener('espresso-android-signin',receive);
   bridge.removeEventListener('pagehide',cancel);resolve({ready,...(!ready?{error:error??'verification'}:{})});
  }
  function receive(event:Event){
   const result=(event as CustomEvent<SignInResult>).detail;
   if(result?.requestId===requestId){
    const code=result.error;
    finish(result.ready===true,code==='network'||code==='device'||code==='session'||code==='timeout'?code:'verification');
   }
  }
  function cancel(){finish(false,'cancelled');}
  // Device attestation can require status, challenge and proof HTTPS requests.
  // The UI must not abandon that flow before the native network deadlines.
  const timer=setTimeout(()=>finish(false,'timeout'),90000);
  bridge.addEventListener('espresso-android-signin',receive);
  bridge.addEventListener('pagehide',cancel,{once:true});
  try{if(bridge.prompt('espresso:app:prepare-signin',requestId)!=='ready')finish(false,'unavailable');}catch{finish(false,'unavailable');}
 });
}
