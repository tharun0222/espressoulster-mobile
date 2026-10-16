'use client';
import {useEffect,useState} from 'react';
import {paymentRequest as request} from '../lib/payment-request';
export default function OnlinePayment({order,onUpdate}:{order:{id:string;status:string;payment_status:string;total:number;currency:string};onUpdate:()=>void}){
 const [config,setConfig]=useState<{enabled:boolean;mode?:string;provider?:string;message?:string;minimumAmount?:number}>({enabled:false}),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{request('config').then(setConfig).catch(e=>{setConfig({enabled:false,provider:'stripe',message:(e as Error).message});});},[]);
 if(!config.enabled && config.provider==='stripe' && order.payment_status==='unpaid' && !['cancelled','completed'].includes(order.status))return <div className="online-payment"><button className="secondary" disabled>Stripe test checkout — setup pending</button><p>{config.message}</p></div>;
 if(!config.enabled||order.payment_status!=='unpaid'||['cancelled','completed'].includes(order.status))return null;
 async function check(){setBusy(true);try{const s=await request(order.id+'/verify',{});if(s.paid&&!s.refundReviewRequired){window.location.assign('/payment-return?order='+order.id);return;}setMessage(s.paid?'Payment verified. Thank you!':s.providerState==='EXPIRED'?'This checkout expired. You can safely open a new test checkout.':s.providerState==='FAILED'?'Payment failed. Contact the café if money was deducted.':'Payment is not yet confirmed. Please check again before paying.');onUpdate();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 async function pay(){setBusy(true);setMessage('');try{const p=await request(order.id+'/start',{});if(p.paid){window.location.assign('/payment-return?order='+order.id);return;}
  const u=new URL(p.redirectUrl);const host=p.provider==='stripe'?'checkout.stripe.com':p.mode==='test'?'mercury-uat.phonepe.com':'mercury.phonepe.com';
  if(u.protocol!=='https:'||u.hostname!==host||u.port||u.username||u.password)throw Error('Untrusted checkout address');
  window.location.assign(u.href);
 }catch(e){setMessage((e as Error).message);setBusy(false);}}
 const belowMinimum=config.provider==='stripe'&&order.total<(config.minimumAmount||50);
 return <div className="online-payment">{belowMinimum&&<p>Stripe sandbox needs an order of at least ₹{((config.minimumAmount||50)/100).toFixed(2)}. Start a new order to test online payment.</p>}<button className="secondary" disabled={busy||belowMinimum} onClick={pay}>{busy?'Please wait…':config.provider==='stripe'?'Pay with Stripe (test)':config.mode==='test'?'Pay with PhonePe (test)':'Pay securely with PhonePe'}</button><button className="text-button" disabled={busy} onClick={check}>Check payment status</button>{config.mode==='test'&&<p>Test mode — no real money is collected.</p>}{message&&<p role="status">{message}</p>}</div>;
}
