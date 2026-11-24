'use client';
import {useEffect,useState,useRef} from 'react';
import {unlockCelebrationAudio,celebrationSound} from '../../lib/celebration-audio';
import SubscriptionActivationCard from '../subscription-activation-card';
import PaymentOrderStatus from '../payment-order-status';
import {paymentRequest} from '../../lib/payment-request';
import {isPrepaidCheckoutId} from '../../lib/checkout-reference';
export default function PaymentReturn(){
 const celebrated=useRef(false),checking=useRef(false),mounted=useRef(true);
 const [purchaseKind,setPurchaseKind]=useState('order'),[subscription,setSubscription]=useState<any>(null);
 const [message,setMessage]=useState('Checking your payment securely…'),[busy,setBusy]=useState(false),[paid,setPaid]=useState(false),[test,setTest]=useState(false);
 const [orderId,setOrderId]=useState<string>();
 const [cartUrl,setCartUrl]=useState<string|null>(null);
 const [canReturnToCart,setCanReturnToCart]=useState(false);
 async function check(){
  if(checking.current)return false;
  const params=new URLSearchParams(window.location.search);
  const order=params.get('order');
  const prepaid=isPrepaidCheckoutId(order);
  if(!prepaid&&!/^CH-[A-F0-9]{8}$/.test(order||'')){setMessage('Invalid order reference. Open My orders to check your payment.');return false;}
  const cancelled=params.get('cancelled')==='1';
  const table=params.get('table')||'';
  if(prepaid)setCartUrl(/^T[0-9]{2}$/.test(table)?'/?table='+table+'#cart':'/#cart');
  checking.current=true;setBusy(true);
  try {
   const b=await paymentRequest(order+'/verify'+(cancelled?'?cancelled=1':''),{});
   if(!mounted.current)return false;
   const ended=b.providerState==='EXPIRED'||b.providerState==='FAILED';
   setPurchaseKind(b.purchaseKind==='subscription'?'subscription':'order');
   setSubscription(b.subscription||null);
   setOrderId(b.orderId);
   setPaid(b.paid===true&&!b.refundReviewRequired);
   setTest(b.testOnly===true);
   setCanReturnToCart(prepaid&&ended&&!b.paid);
   if(prepaid&&!b.paid){
    setMessage(ended
     ? (cancelled?'Checkout cancelled. Your cart is saved.':'Checkout expired. Your cart is saved.')
     : (cancelled?'We’re checking whether checkout was closed. Please wait before paying again.':'Checking payment before placing your order…'));
   }else{
    setMessage(b.paid
     ? (b.refundReviewRequired?'Payment received. Your cancelled order needs café refund review.':'Your payment was verified. Thank you!')
     : (ended?'This checkout is closed. Return to My orders to check the order.':cancelled?'Checkout was cancelled. You can retry from My orders.':'Payment is pending. We will check again automatically.'));
   }
   return !b.paid&&!ended&&(prepaid||!cancelled);
  }catch(e){
   if(mounted.current){setMessage((e as Error).message);setPaid(false);}
   return true;
  }finally{checking.current=false;if(mounted.current)setBusy(false);}
 }
 useEffect(()=>{mounted.current=true;let timer:ReturnType<typeof setTimeout>,stopped=false,attempts=0;const poll=async()=>{if(stopped)return;if(document.visibilityState!=='visible'){timer=setTimeout(poll,10000);return;}const pending=await check();attempts++;if(!stopped&&pending){if(attempts<6)timer=setTimeout(poll,10000);else setMessage('Payment is still unconfirmed. Tap Check again or return to My orders. Do not pay again until the status is confirmed.');}};poll();return()=>{stopped=true;mounted.current=false;clearTimeout(timer)}},[]);
 useEffect(()=>{if(paid&&!celebrated.current){celebrated.current=true;celebrationSound('payment');}},[paid]);
 if(paid&&purchaseKind==='order')return <main className="paid-order-main"><PaymentOrderStatus test={test} orderId={orderId}/></main>;
 return <main className={'payment-return-screen'+(paid?' payment-success':'')+(purchaseKind==='subscription'?' subscription-payment-success':'')}><section className="payment-return-card">
 <p className="payment-brand">ESPRESSOULSTER COFFEE</p>
 <h1>{paid?purchaseKind==='subscription'?(subscription&&['active','exhausted'].includes(subscription.status)?'Your pass is active':'Payment confirmed'):'You’re all set!':'Payment status'}</h1>
 {paid&&<p className="payment-success-caption">PAYMENT CONFIRMED</p>}
 {paid&&<h2>Payment successful</h2>}
 <p role="status">{message}</p>
 {!paid&&!canReturnToCart&&<button className="secondary" disabled={busy} onClick={check}>{busy?'Checking…':'Check again'}</button>}
 {paid&&(purchaseKind==='subscription'?<SubscriptionActivationCard subscription={subscription}/>:<PaymentOrderStatus/>)}
 {paid&&<button className="secondary payment-sound-button" onClick={()=>{unlockCelebrationAudio();celebrationSound('payment');}}>Play celebration sound</button>}
 {purchaseKind!=='subscription'&&(cartUrl
  ? canReturnToCart&&<a className="primary" href={cartUrl}>Back to cart</a>
  : <a className="primary" href="/#orders">Return to My orders</a>)}
 </section></main>;
}
