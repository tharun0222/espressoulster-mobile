'use client';
import {useEffect,useState,useRef} from 'react';
import {unlockCelebrationAudio,celebrationSound} from '../../lib/celebration-audio';
import SubscriptionActivationCard from '../subscription-activation-card';
import PaymentOrderStatus from '../payment-order-status';
import {paymentRequest} from '../../lib/payment-request';
export default function PaymentReturn(){
 const celebrated=useRef(false),checking=useRef(false),mounted=useRef(true);
 const [purchaseKind,setPurchaseKind]=useState('order'),[subscription,setSubscription]=useState<any>(null);
 const [message,setMessage]=useState('Checking your payment securely…'),[busy,setBusy]=useState(false),[paid,setPaid]=useState(false),[test,setTest]=useState(false);
 async function check(){
  if(checking.current)return false;
  const order=new URLSearchParams(window.location.search).get('order');if(!/^CH-[A-F0-9]{8}$/.test(order||'')){setMessage('Invalid order reference. Open My orders to check your payment.');return;}
  checking.current=true;setBusy(true);
  try{const b=await paymentRequest(order+'/verify',{});if(!mounted.current)return false;setPurchaseKind(b.purchaseKind==='subscription'?'subscription':'order');setSubscription(b.subscription||null);setPaid(b.paid===true&&!b.refundReviewRequired);setTest(b.testOnly===true);setMessage(b.paid?(b.refundReviewRequired?'Payment received. Your cancelled order needs café refund review.':b.testOnly?'Your test payment was verified. No real money was collected.':'Your payment was verified. Thank you!'):b.providerState==='EXPIRED'?'This checkout expired. Return to My orders to open a new test checkout.':new URLSearchParams(window.location.search).get('cancelled')==='1'?'Checkout was cancelled. No successful payment was confirmed. You can retry from My orders.':b.providerState==='FAILED'?'Payment failed. Contact the café if money was deducted.':'Payment is pending. We will check again automatically.');return !b.paid&&!['EXPIRED','FAILED'].includes(b.providerState)&&new URLSearchParams(window.location.search).get('cancelled')!=='1';}catch(e){if(mounted.current){setMessage((e as Error).message);setPaid(false);}return true;}finally{checking.current=false;if(mounted.current)setBusy(false);}
 }
 useEffect(()=>{mounted.current=true;let timer:ReturnType<typeof setTimeout>,stopped=false,attempts=0;const poll=async()=>{if(stopped)return;if(document.visibilityState!=='visible'){timer=setTimeout(poll,10000);return;}const pending=await check();attempts++;if(!stopped&&pending){if(attempts<6)timer=setTimeout(poll,10000);else setMessage('Payment is still unconfirmed. Tap Check again or return to My orders. Do not pay again until the status is confirmed.');}};poll();return()=>{stopped=true;mounted.current=false;clearTimeout(timer)}},[]);
 useEffect(()=>{if(paid&&!celebrated.current){celebrated.current=true;celebrationSound('payment');}},[paid]);
 return <main className={'payment-return-screen'+(paid?' payment-success':'')+(purchaseKind==='subscription'?' subscription-payment-success':'')}><section className="payment-return-card">
 <p className="payment-brand">ESPRESSOULSTER COFFEE</p>
 <h1>{paid?purchaseKind==='subscription'?(subscription&&['active','exhausted'].includes(subscription.status)?'Your pass is active':'Payment confirmed'):'You’re all set!':'Payment status'}</h1>
 {paid&&<p className="payment-success-caption">PAYMENT CONFIRMED</p>}
 {paid&&<h2>{test?'Test payment successful':'Payment successful'}</h2>}
 <p role="status">{message}</p>
 {!paid&&<button className="secondary" disabled={busy} onClick={check}>{busy?'Checking…':'Check again'}</button>}
 {paid&&(purchaseKind==='subscription'?<SubscriptionActivationCard subscription={subscription}/>:<PaymentOrderStatus/>)}
 {paid&&<button className="secondary payment-sound-button" onClick={()=>{unlockCelebrationAudio();celebrationSound('payment');}}>Play celebration sound</button>}
 {purchaseKind!=='subscription'&&<a className="primary" href="/#orders">Return to My orders</a>}
 </section></main>;
}
