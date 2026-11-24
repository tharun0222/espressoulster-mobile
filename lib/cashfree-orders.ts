import { PaymentError } from './payment-security.ts';
import { phoneNumber } from './phone-verification.ts';
import {parseCashfreeJson} from './cashfree-json.ts';
import { hostedCheckoutUrl, type CheckoutMode, type ExpectedPayment, type SandboxCheckout } from './sandbox-checkout.ts';

type CashfreeOrder = {order_id:string; cf_order_id:string|number; order_currency:string; order_amount:string|number; order_status:string; order_expiry_time:string; payment_session_id:string};
type Config = { clientId:string; secret:string; origin:string; minimumAmount:number; notifyUrl?:string };
export const cashfreeOrderReference = (id:string, requestId:string) => id.startsWith('CH-') ? id+'-'+requestId.replaceAll('-','') : id;

export function createCashfreeOrderCheckout(config:()=>Config, mode:CheckoutMode, send:typeof fetch):SandboxCheckout {
  const base = mode==='live' ? 'https://api.cashfree.com/pg/' : 'https://sandbox.cashfree.com/pg/';
  async function request(route:string, method='GET', payload?:object, missing=false, idempotency?:string):Promise<CashfreeOrder|null> {
    const c=config();
    const response=await send(base+route,{method,redirect:'manual',headers:{'x-api-version':'2026-01-01',
      'x-client-id':c.clientId,'x-client-secret':c.secret,...(payload?{'Content-Type':'application/json'}:{}),
      ...(idempotency?{'x-idempotency-key':idempotency}:{})},
      ...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(12000)});
    if(missing&&response.status===404)return null;
    if(!response.ok){
      console.warn('Cashfree order request rejected',{status:response.status,operation:method});
      throw new PaymentError(response.status===401||response.status===403?'Cashfree checkout is awaiting merchant setup.':'Cashfree could not prepare this payment. Check payment status before retrying.',502);
    }
    try{return parseCashfreeJson(await response.text()) as CashfreeOrder;}catch{throw new PaymentError('Cashfree returned an unreadable response. Please check payment status.',502);}
  }
  function check(order:CashfreeOrder,input:ExpectedPayment,reference:string,providerId?:string){
    const amount=Number(order?.order_amount);
    if(order?.order_id!==reference||!/^\d+$/.test(String(order?.cf_order_id??''))||
      (providerId&&String(order.cf_order_id)!==providerId)||order.order_currency!==input.currency||
      !Number.isFinite(amount)||Math.abs(amount*100-input.total)>.000001)
      throw new PaymentError('Cashfree payment does not match this checkout. Do not pay again.',409);
    return String(order.cf_order_id);
  }
  const status=(order:CashfreeOrder)=>order.order_status==='PAID'?'paid':['EXPIRED','TERMINATED'].includes(order.order_status)?'expired':
    ['ACTIVE','TERMINATION_REQUESTED'].includes(order.order_status)?'ready':null;
  return {provider:'cashfree',config,checkoutUrl:value=>hostedCheckoutUrl('cashfree',mode,value),
    async create(input){
      const c=config(),reference=cashfreeOrderReference(input.id,input.requestId);
      if(input.currency!=='INR'||!Number.isSafeInteger(input.total)||input.total<c.minimumAmount)
        throw new PaymentError('Cashfree requires a payment of at least ₹1.',409);
      let phone:string;try{phone=phoneNumber(input.contact?.phone).slice(3);}catch{throw new PaymentError('Enter a valid Indian mobile number.',409);}
      if(!input.contact?.name?.trim()||new URL(input.returnUrl).origin!==c.origin)throw new PaymentError('Missing payment contact details.',409);
      let order=await request('orders/'+encodeURIComponent(reference),'GET',undefined,true);
      if(!order){
        const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(phone)));
        const customer='cafe_'+Array.from(digest).slice(0,16).map(n=>n.toString(16).padStart(2,'0')).join('');
        const key=input.requestId.replace(/^(?:PC|BK)-/,'').replaceAll('-','').toLowerCase();
        if(!/^[a-f0-9]{32}$/.test(key))throw new PaymentError('Invalid checkout reference.',409);
        const idempotency=[key.slice(0,8),key.slice(8,12),key.slice(12,16),key.slice(16,20),key.slice(20)].join('-');
        try{order=await request('orders','POST',{order_id:reference,order_amount:input.total/100,order_currency:input.currency,
          customer_details:{customer_id:customer,customer_name:mode==='live'?input.contact.name.trim():'Espressoulster Test Customer',customer_phone:mode==='live'?phone:'9999999999'},
          order_expiry_time:new Date((input.expiresAt??Math.floor(Date.now()/1000)+1800)*1000).toISOString(),
          order_meta:{return_url:input.returnUrl,...(c.notifyUrl?{notify_url:c.notifyUrl}:{})},
          order_note:input.purpose},false,idempotency);}
        catch(error){
          // A timeout or concurrent create may have succeeded. The merchant
          // order reference is unique at Cashfree; recover it before retrying.
          order=await request('orders/'+encodeURIComponent(reference),'GET',undefined,true);
          if(!order)throw error;
        }
      }
      if(!order)throw new PaymentError('Cashfree checkout was not found.',502);
      const id=check(order,input,reference),expiry=Math.floor(Date.parse(order.order_expiry_time)/1000);
      if(!status(order)||!Number.isSafeInteger(expiry)||(input.expiresAt&&expiry>input.expiresAt))throw new PaymentError('Invalid Cashfree checkout expiry.',502);
      if(order.order_status==='ACTIVE'&&!validPaymentSession(order.payment_session_id))throw new PaymentError('Invalid Cashfree checkout session.',502);
      return {id,url:'/cashfree-checkout?order='+input.id,expiresAt:expiry,orderId:reference,
        ...(order.order_status==='ACTIVE'?{paymentSessionId:order.payment_session_id}:{})};
    },
    async verify(input,providerId,requestId,cancel){
      const reference=cashfreeOrderReference(input.id,requestId),route='orders/'+encodeURIComponent(reference);
      let order=await request(route);
      if(!order)throw new PaymentError('Cashfree order was not found.',502);
      check(order,input,reference,providerId);
      if(cancel&&order.order_status==='ACTIVE'){
        try{await request(route,'PATCH',{order_status:'TERMINATED'});}catch{/* A payment can win a termination race. */}
        order=await request(route);
        if(!order)throw new PaymentError('Cashfree order was not found.',502);
        check(order,input,reference,providerId);
      }
      const state=status(order);
      if(state==='paid')return {state:'paid',reference:providerId};
      if(state==='expired')return {state:'expired'};
      if(state==='ready')return {state:'pending'};
      throw new PaymentError('Cashfree payment needs café review. Do not pay again.',409);
    },
    async session(input,providerId,requestId){
      const reference=cashfreeOrderReference(input.id,requestId),order=await request('orders/'+encodeURIComponent(reference));
      if(!order)throw new PaymentError('Cashfree order was not found.',502);
      check(order,input,reference,providerId);
      const state=status(order);
      if(state==='paid'||state==='expired')return {state,mode};
      if(order.order_status!=='ACTIVE'||!validPaymentSession(order.payment_session_id))
        throw new PaymentError('This Cashfree checkout is no longer available. Check payment status.',409);
      return {state:'ready',mode,orderId:reference,paymentSessionId:order.payment_session_id};
    },
  };
}

function validPaymentSession(value:unknown): value is string {
  return typeof value==='string'&&/^session_[a-zA-Z0-9_=-]{20,2048}$/.test(value);
}
