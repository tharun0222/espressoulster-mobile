'use client';
import {useEffect,useState,useRef} from 'react';
import {unlockCelebrationAudio,celebrationSound} from '../../lib/celebration-audio';
import SubscriptionActivationCard from '../subscription-activation-card';
import PaymentOrderStatus from '../payment-order-status';
import {paymentRequest} from '../../lib/payment-request';
export default function PaymentReturn(){
 const celebrated=useRef(false);
 const [purchaseKind,setPurchaseKind]=useState('order'),[subscription,setSubscription]=useState<any>(null);
 const [message,setMessage]=useState('Checking your payment securely…'),[busy,setBusy]=useState(false),[paid,setPaid]=useState(false),[test,setTest]=useState(false);
 async function check(){
  const order=new URLSearchParams(window.location.search).get('order');if(!/^CH-[A-F0-9]{8}$/.test(order||'')){setMessage('Invalid order reference. Open My orders to check your payment.');return;}
  setBusy(true);
  try{const b=await paymentRequest(order+'/verify',{});setPurchaseKind(b.purchaseKind==='subscription'?'subscription':'order');setSubscription(b.subscription||null);setPaid(b.paid===true&&!b.refundReviewRequired);setTest(b.testOnly===true);setMessage(b.paid?(b.refundReviewRequired?'Payment received. Your cancelled order needs café refund review.':b.testOnly?'Your test payment was verified. No real money was collected.':'Your payment was verified. Thank you!'):b.providerState==='EXPIRED'?'This checkout expired. Return to My orders to open a new test checkout.':new URLSearchParams(window.location.search).get('cancelled')==='1'?'Checkout was cancelled. No successful payment was confirmed. You can retry from My orders.':b.providerState==='FAILED'?'Payment failed. Contact the café if money was deducted.':'Payment is pending or not confirmed. Check again before paying.');}catch(e){setMessage((e as Error).message);setPaid(false);}finally{setBusy(false);}
 }
 useEffect(()=>{check();},[]);
 useEffect(()=>{if(paid&&!celebrated.current){celebrated.current=true;celebrationSound('payment');}},[paid]);
 return <main className={'payment-return-screen'+(paid?' payment-success':'')+(purchaseKind==='subscription'?' subscription-payment-success':'')}><section className="payment-return-card">
 {paid&&<div className="payment-confetti" aria-hidden="true">{Array.from({length:22},(_,i)=><i key={i} style={{'--i':i} as React.CSSProperties}/>)}</div>}
 <p className="payment-brand">ESPRESSOULSTER COFFEE</p>
 {paid&&<div className="payment-success-emblem" aria-hidden="true"><span className="payment-ripple payment-ripple-one"/><span className="payment-ripple payment-ripple-two"/><div className="payment-success-check">✓</div><span className="payment-spark payment-spark-one">✦</span><span className="payment-spark payment-spark-two">✧</span><span className="payment-spark payment-spark-three">✦</span></div>}
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
