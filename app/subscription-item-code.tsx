'use client';

import {useEffect,useRef,useState} from 'react';

type PendingCode={codeId:string;code:string;expiresAt:string};

export default function SubscriptionItemCode({subscriptionId,onRedeemed}:{subscriptionId:string;onRedeemed?:()=>void}) {
 const [data,setData]=useState<PendingCode|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const callback=useRef(onRedeemed);
 callback.current=onRedeemed;
 const codeId=data?.codeId;

 useEffect(()=>{
  if(!codeId)return;
  let inFlight=false;
  const controller=new AbortController();
  const query=new URLSearchParams({subscriptionId,codeId});
  async function refresh(){
   if(inFlight||document.visibilityState!=='visible')return;
   inFlight=true;
   try{
    const response=await fetch('/api/subscriptions/item-code?'+query,{signal:controller.signal,cache:'no-store'});
    if(!response.ok)return;
    const status=await response.json() as {redeemed:boolean;expired:boolean};
    if(!controller.signal.aborted&&(status.redeemed||status.expired)){
     setData(null);
     if(status.redeemed)callback.current?.();
    }
   }catch{ /* Retry on focus or the next poll. */ }
   finally{inFlight=false;}
  }
  void refresh();
  const timer=setInterval(refresh,2500);
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',refresh);
  return()=>{
   controller.abort();
   clearInterval(timer);
   window.removeEventListener('focus',refresh);
   document.removeEventListener('visibilitychange',refresh);
  };
 },[subscriptionId,codeId]);

 async function generate(){
  setBusy(true);
  setError('');
  try{
   const response=await fetch('/api/subscriptions/item-code',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscriptionId}),
    signal:AbortSignal.timeout(12000)
   });
   if(!response.ok){
    const result=await response.json() as {error?:string};
    throw Error(result.error||'Unable to generate this plan’s code.');
   }
   setData(await response.json() as PendingCode);
  }catch(error){setError((error as Error).message)}
  finally{setBusy(false)}
 }

 return <div className="plan-item-code">
  {data
   ?<div><small>ONE-TIME CODE</small><strong aria-label={'Redemption code '+data.code}>{data.code}</strong><small>For one item · expires {new Date(data.expiresAt).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Kolkata'})} IST</small></div>
   :<button type="button" onClick={generate} disabled={busy}>{busy?'Generating…':'Get redemption code'}</button>}
  {error&&<span className="phone-error" role="alert">{error}</span>}
 </div>;
}
