'use client';

import {useEffect,useState} from 'react';
import {customerJson} from '../../lib/customer-flow';
import '../payment-order-flow.css';

type Verification = {state:'pending'|'paid'|'expired'|'review';mode?:'test'|'live';amount?:number};

export default function BookingPaymentReturn(){
 const [result,setResult]=useState<Verification['state']>('pending');
 const [error,setError]=useState('');
 const [amount,setAmount]=useState<number|null>(null);
 const [attempt,setAttempt]=useState(0);

 useEffect(()=>{
  const params=new URLSearchParams(location.search);
  const id=params.get('booking')||'';
  if(!/^BK-[A-F0-9]{32}$/.test(id)){setError('This booking payment link is invalid.');return;}
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>;
  let checks=0;
  async function verify(){
   try{
    const response:Verification=await customerJson('table-bookings/payment',{
     method:'POST',data:{id,cancelled:params.get('cancelled')==='1'},signal:controller.signal
    });
    if(controller.signal.aborted)return;
    setResult(response.state);
    if(Number.isSafeInteger(response.amount))setAmount(response.amount!);
    if(response.state==='pending'&&++checks<6)timer=setTimeout(verify,3000);
   }catch(error){if(!controller.signal.aborted)setError((error as Error).message);}
  }
  void verify();
  return()=>{controller.abort();clearTimeout(timer);};
 },[attempt]);

 const status={
  pending:'We’re checking the booking payment.',
  paid:`Your ${amount===null?'':'₹'+(amount/100)+' '}payment was verified. The café will review your request and notify you when it’s confirmed.`,
  expired:'This checkout closed before payment. You can choose a time and try again.',
  review:'Your payment was verified, but the booking needs café review. Please avoid paying again.',
 };
 return <main className="payment-return-screen"><section className="payment-return-card">
  <h1>{result==='paid'?'Booking request sent':'Booking payment'}</h1>
  <p role={error?'alert':'status'}>{error||status[result]}</p>
  {result==='pending'&&<button type="button" className="secondary" onClick={()=>{setError('');setAttempt(value=>value+1);}}>Check payment</button>}
  <a className="primary" href="/#home" onClick={()=>sessionStorage.setItem('espresso-open-bookings','1')}>View bookings</a>
 </section></main>;
}
