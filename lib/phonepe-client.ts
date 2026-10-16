import {configuration,checkoutUrl,PaymentError,type PaymentConfig} from './payment-security';
export function createPhonePeClient(bindings:PaymentConfig,fetcher:typeof fetch=fetch,now:()=>number=Date.now) {
  const c=configuration(bindings);
  const base=c.mode==='test'?'https://api-preprod.phonepe.com/apis/pg-sandbox':'https://api.phonepe.com/apis/pg';
  const auth=c.mode==='test'?base+'/v1/oauth/token':'https://api.phonepe.com/apis/identity-manager/v1/oauth/token';
  let cached:{value:string;expires:number}|undefined;
  let pending:Promise<string>|undefined;
  async function send(url:string,options:RequestInit) {
    let r:Response;
    try {r=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(2000)});}catch{throw new PaymentError('PhonePe did not respond. Check payment status before retrying.',503);}
    if(!r.ok)throw new PaymentError('PhonePe request was not confirmed. Check payment status before retrying.',503);
    try {return await r.json() as any;}catch{throw new PaymentError('Invalid PhonePe response',502);}
  }
  async function token():Promise<string> {
    if(cached && cached.expires>now()+60000)return cached.value;
    if(pending)return pending;
    pending=(async()=>{
      const r=await send(auth,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.clientId!,client_version:c.clientVersion,client_secret:c.secret,grant_type:'client_credentials'})});
      if(typeof r.access_token!=='string'||!r.access_token||!Number.isFinite(r.expires_at)||r.expires_at*1000<=now())throw new PaymentError('Invalid PhonePe authorization response',502);
      cached={value:r.access_token,expires:r.expires_at*1000};return cached.value;
    })();try{return await pending;}finally{pending=undefined;}
  }
  async function call(path:string,data?:unknown) {
    return send(base+path,{method:data===undefined?'GET':'POST',headers:{Authorization:'O-Bearer '+await token(),'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  }
  return {
    mode:c.mode,
    async start(merchantOrderId:string,amount:number,localOrderId:string) {
      if(!/^[a-zA-Z0-9_-]{1,63}$/.test(merchantOrderId)||!/^CH-[A-F0-9]{8}$/.test(localOrderId)||!Number.isSafeInteger(amount)||amount<100)throw new PaymentError('Invalid payment order');
      const redirect=new URL('/payment-return',c.origin);redirect.searchParams.set('order',localOrderId);
      const r=await call('/checkout/v2/pay',{merchantOrderId,amount,expireAfter:1200,paymentFlow:{type:'PG_CHECKOUT',merchantUrls:{redirectUrl:redirect.href}}});
      if(!/^OMO[a-zA-Z0-9]+$/.test(r.orderId||'')||r.state!=='PENDING'||!Number.isSafeInteger(r.expireAt)||r.expireAt<=now())throw new PaymentError('Invalid PhonePe checkout response',502);
      return {orderId:r.orderId,redirectUrl:checkoutUrl(r.redirectUrl,c.mode),expireAt:r.expireAt};
    },
    status(merchantOrderId:string) {
      if(!/^[a-zA-Z0-9_-]{1,63}$/.test(merchantOrderId))throw new PaymentError('Invalid payment order');
      return call('/checkout/v2/order/'+encodeURIComponent(merchantOrderId)+'/status?details=false');
    },
  };
}
