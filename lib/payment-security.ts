// PhonePe Standard Checkout v2 boundaries. Secrets stay server-side.
export class PaymentError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type PaymentConfig = {
  PAYMENT_PROVIDER?: string; PAYMENT_MODE?: string; PAYMENT_LIVE_ENABLED?: string;
  PAYMENT_APP_ORIGIN?: string; PHONEPE_CLIENT_ID?: string; PHONEPE_CLIENT_VERSION?: string;
  PHONEPE_CLIENT_SECRET?: string; PHONEPE_WEBHOOK_USERNAME?: string; PHONEPE_WEBHOOK_PASSWORD?: string;
};
export function configuration(c: PaymentConfig) {
  if (c.PAYMENT_PROVIDER !== 'phonepe' || !['test','live'].includes(c.PAYMENT_MODE || '') ||
      !c.PHONEPE_CLIENT_ID?.trim() || !/^\d+$/.test(c.PHONEPE_CLIENT_VERSION || '') ||
      !c.PHONEPE_CLIENT_SECRET?.trim() || !c.PHONEPE_WEBHOOK_USERNAME?.trim() ||
      (c.PHONEPE_WEBHOOK_PASSWORD?.length || 0) < 16 ||
      (c.PAYMENT_MODE === 'live' && c.PAYMENT_LIVE_ENABLED !== 'true'))
    throw new PaymentError('Online payments are not configured. You can pay at fulfilment.', 503);
  let origin: URL;
  try { origin = new URL(c.PAYMENT_APP_ORIGIN || ''); } catch { throw new PaymentError('Payment return address is not configured',503); }
  const local = c.PAYMENT_MODE === 'test' && ['localhost','127.0.0.1'].includes(origin.hostname);
  if ((origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
    throw new PaymentError('Payment return address must be a trusted HTTPS origin',503);
  return {mode:c.PAYMENT_MODE as 'test'|'live',origin:origin.origin,clientId:c.PHONEPE_CLIENT_ID,
    clientVersion:c.PHONEPE_CLIENT_VERSION!,secret:c.PHONEPE_CLIENT_SECRET!,
    webhookUsername:c.PHONEPE_WEBHOOK_USERNAME!,webhookPassword:c.PHONEPE_WEBHOOK_PASSWORD!};
}
export async function sha256(value:string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function verifyWebhookAuthorization(username:string,password:string,authorization:unknown) {
  if(typeof authorization!=='string'||!/^[a-f0-9]{64}$/.test(authorization)) throw new PaymentError('Invalid webhook authorization',401);
  const expected=await sha256(username+':'+password);
  let different=0;for(let i=0;i<64;i++) different|=authorization.charCodeAt(i)^expected.charCodeAt(i);
  if(different!==0) throw new PaymentError('Invalid webhook authorization',401);
}
export function checkoutUrl(value:unknown,mode:'test'|'live') {
  let u:URL;try { if(typeof value!=='string')throw Error();u=new URL(value); }catch{throw new PaymentError('Invalid PhonePe checkout address',502);}
  const host=mode==='test'?'mercury-uat.phonepe.com':'mercury.phonepe.com';
  if(u.protocol!=='https:'||u.hostname!==host||u.port||u.username||u.password)throw new PaymentError('Untrusted PhonePe checkout address',502);
  return u.href;
}
export function validateCompleted(payment:any,expected:{provider_order_id:string|null;amount:number;currency:string}) {
  if(!payment||payment.state!=='COMPLETED'||!/^OMO[a-zA-Z0-9]+$/.test(payment.orderId||'')||
    (expected.provider_order_id && payment.orderId!==expected.provider_order_id)||
    !Number.isSafeInteger(payment.amount)||payment.amount!==expected.amount||expected.currency!=='INR')
    throw new PaymentError('Payment is not a matching completed transaction. Do not pay again before checking status.',409);
  return payment.orderId as string;
}
