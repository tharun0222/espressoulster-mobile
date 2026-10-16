import {PaymentError} from './payment-security.ts';
export type RazorpayTestEnv={PUBLIC_TEST_MODE?:string;RAZORPAY_TEST_KEY_ID?:string;RAZORPAY_TEST_KEY_SECRET?:string};
export function razorpayTestConfig(c:RazorpayTestEnv){
 if(c.PUBLIC_TEST_MODE!=='true'||!/^rzp_test_[a-zA-Z0-9]+$/.test(c.RAZORPAY_TEST_KEY_ID||'')||!c.RAZORPAY_TEST_KEY_SECRET?.trim())throw new PaymentError('Razorpay test keys are not configured',503);
 return {keyId:c.RAZORPAY_TEST_KEY_ID!,secret:c.RAZORPAY_TEST_KEY_SECRET!};
}
export async function verifyRazorpaySignature(orderId:string,paymentId:unknown,signature:unknown,secret:string){
 if(!/^order_[a-zA-Z0-9]+$/.test(orderId)||typeof paymentId!=='string'||!/^pay_[a-zA-Z0-9]+$/.test(paymentId)||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))throw new PaymentError('Invalid Razorpay payment signature',400);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const bytes=Uint8Array.from(signature.match(/../g)!,s=>parseInt(s,16));
 if(!await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(orderId+'|'+paymentId)))throw new PaymentError('Invalid Razorpay payment signature',400);
}
export function validateRazorpayTestPayment(p:any,expected:{provider_order_id:string;amount:number;currency:string},paymentId:string){
 if(p?.id!==paymentId||p?.order_id!==expected.provider_order_id||p?.amount!==expected.amount||p?.currency!==expected.currency||p?.status!=='captured'||p?.captured!==true||p?.amount_refunded!==0)throw new PaymentError('Test payment is not a matching captured transaction',409);
}
export function validateRazorpayTestOrder(p:any,amount:number,receipt:string){
 if(!/^order_[a-zA-Z0-9]+$/.test(p?.id||'')||p?.amount!==amount||p?.currency!=='INR'||p?.receipt!==receipt||p?.status!=='created')throw new PaymentError('Invalid Razorpay test order response',502);
}
