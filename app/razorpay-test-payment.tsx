"use client";
import {useEffect,useState} from 'react';
let checkoutScript:Promise<void>|undefined;
function loadCheckout(){
 if((window as any).Razorpay)return Promise.resolve();
 if(!checkoutScript)checkoutScript=new Promise<void>((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;
  script.onload=()=>resolve();script.onerror=()=>{script.remove();checkoutScript=undefined;reject(Error('Unable to load Razorpay. Check your connection and try again.'));};document.head.appendChild(script);
 });
 return checkoutScript;
}
async function request(path:string,data?:unknown){
 const r=await fetch('/api/razorpay-test/'+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const b:any=await r.json();if(!r.ok)throw Error(b.error||'Unable to complete test checkout');return b;
}
export default function RazorpayTestPayment({order}:{order:{id:string;status:string;payment_status:string}}){
 const [enabled,setEnabled]=useState(false),[loaded,setLoaded]=useState(false),[verified,setVerified]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[response,setResponse]=useState<any>(null);
 useEffect(()=>{let active=true;request('config').then(async c=>{if(!active)return;setEnabled(c.enabled);setLoaded(true);if(c.enabled){const s=await request(order.id+'/status');if(active)setVerified(s.testVerified===true);}}).catch(()=>{if(active)setLoaded(true)});return()=>{active=false}},[order.id]);
 if(!loaded||order.payment_status!=='unpaid'||['cancelled','completed'].includes(order.status))return null;
 async function verify(data:any){setBusy(true);setResponse(data);try{const r=await request(order.id+'/verify',data);if(r.testVerified){setVerified(true);setMessage('Razorpay test payment verified. No real money collected. Your café bill remains unpaid.');}}catch(e){setMessage((e as Error).message);}finally{setBusy(false)}}
 async function pay(){
  setBusy(true);setMessage('');
  try{
   const c=await request(order.id+'/start',{});if(c.testVerified){setVerified(true);setBusy(false);return;}
   if(c.mode!=='test'||!/^rzp_test_[a-zA-Z0-9]+$/.test(c.keyId))throw Error('Only Razorpay test checkout is permitted.');
   await loadCheckout();
   const checkout=new (window as any).Razorpay({key:c.keyId,order_id:c.providerOrderId,amount:c.amount,currency:c.currency,name:'Espressoulster Coffee',description:'TEST ONLY · '+order.id,theme:{color:'#173b36'},handler:(r:any)=>{void verify(r)},modal:{ondismiss:()=>{setBusy(false);setMessage('Test checkout closed. No payment has been verified.');}}});
   checkout.on('payment.failed',()=>{setBusy(false);setMessage('Razorpay test payment failed. You can retry using test payment details.');});checkout.open();
  }catch(e){setBusy(false);setMessage((e as Error).message)}
 }
 return <section className="test-payment" aria-label="Razorpay test checkout"><span className="test-payment-badge">RAZORPAY TEST MODE · NO REAL MONEY</span>
  {verified?<p role="status">Razorpay test payment verified. Your actual café bill remains unpaid.</p>:<><button type="button" className="secondary" disabled={!enabled||busy} onClick={pay}>{busy?'Opening test checkout…':'Pay online · Razorpay test'}</button>{!enabled&&<p>Razorpay test checkout is awaiting account setup.</p>}</>}
  {response&&!verified&&<button type="button" className="text-button" disabled={busy} onClick={()=>verify(response)}>Check test payment</button>}
  <p>Use test payment details only. This does not settle your café bill.</p>{message&&<p role="status">{message}</p>}
 </section>;
}
