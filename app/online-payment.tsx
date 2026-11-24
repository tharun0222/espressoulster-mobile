'use client';
import {useEffect,useState} from 'react';
import {paymentRequest as request} from '../lib/payment-request';
import {hostedCheckoutUrl,isSandboxProvider} from '../lib/sandbox-checkout';
export default function OnlinePayment({order,onUpdate}:{order:{id:string;status:string;payment_status:string;total:number;currency:string};onUpdate:()=>void}){
 const [config,setConfig]=useState<{enabled:boolean;mode?:string;provider?:string;message?:string;minimumAmount?:number}>({enabled:false}),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{request('config').then(setConfig).catch(()=>setConfig({enabled:false}));},[]);
 if(!config.enabled||order.payment_status!=='unpaid'||['cancelled','completed'].includes(order.status))return null;
 async function check(){setBusy(true);try{const s=await request(order.id+'/verify',{});if(s.paid&&!s.refundReviewRequired){window.location.assign('/payment-return?order='+order.id);return;}setMessage(s.paid?'Payment verified. Thank you!':s.providerState==='EXPIRED'?'This checkout expired. You can safely open a new checkout.':s.providerState==='FAILED'?'Payment failed. Contact the café if money was deducted.':'Payment is not yet confirmed. Please check again before paying.');onUpdate();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 async function pay(){setBusy(true);setMessage('');try{const p=await request(order.id+'/start',{});if(p.paid){window.location.assign('/payment-return?order='+order.id);return;}
  if(isSandboxProvider(p.provider)){window.location.assign(hostedCheckoutUrl(p.provider,p.mode,p.redirectUrl));return;}
  const u=new URL(p.redirectUrl);const host=p.mode==='test'?'mercury-uat.phonepe.com':'mercury.phonepe.com';
  if(u.protocol!=='https:'||u.hostname!==host||u.port||u.username||u.password)throw Error('Untrusted checkout address');
  window.location.assign(u.href);
 }catch(e){setMessage((e as Error).message);setBusy(false);}}
 const belowMinimum=isSandboxProvider(config.provider)&&order.total<(config.minimumAmount||50);
 return <div className="online-payment">{belowMinimum&&<p>{(config.provider==='cashfree'?'Cashfree':'Stripe')} needs an order of at least ₹{((config.minimumAmount||50)/100).toFixed(2)}. Review your order to continue.</p>}<button className="secondary" disabled={busy||belowMinimum} onClick={pay}>{busy?'Please wait…':isSandboxProvider(config.provider)?'Pay with '+(config.provider==='cashfree'?'Cashfree':'Stripe'):config.mode==='test'?'Pay with PhonePe (test)':'Pay securely with PhonePe'}</button><button className="text-button" disabled={busy} onClick={check}>Check payment status</button>{message&&<p role="status">{message}</p>}</div>;
}
