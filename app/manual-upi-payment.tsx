'use client';
import {useState} from 'react';
import {manualUpiLink,paymentUpiId} from '../lib/manual-upi';
export default function ManualUpiPayment({order}:{order:{id:string;total:number;currency:string;status:string;payment_status:string}}){
 const [copied,setCopied]=useState(false);
 if(order.currency!=='INR'||order.total<=0||order.payment_status!=='unpaid'||order.status==='cancelled')return null;
 return <section className="manual-upi-payment" aria-label="Pay by UPI">
  <h3>Pay by UPI</h3>
  <p>Amount due: <strong>₹{(order.total/100).toFixed(2)}</strong></p>
  <img src="/images/payment-upi.svg" alt="UPI payment QR for 8220025037-4@ibl" width="208" height="208" />
  <p className="fine-print">Scan with another phone and enter the amount above. Check the recipient shown in your UPI app before paying.</p>
  <p className="upi-address">{paymentUpiId}</p>
  <div className="upi-payment-actions"><a className="primary" href={manualUpiLink(order.total,order.id)}>Open UPI app</a>
  <button type="button" className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(paymentUpiId);setCopied(true)}catch{setCopied(false)}}}>{copied?'UPI ID copied':'Copy UPI ID'}</button></div>
  <p className="fine-print">After paying, show your transaction reference to café staff. Payment stays unpaid until staff verify receipt. Do not pay again if your account was debited.</p>
 </section>;
}
