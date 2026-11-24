export function stripeTestConfig(e:any){
 if(e.PUBLIC_TEST_MODE!=='true')throw Error('Online checkout is unavailable.');
 if(e.PAYMENT_MODE!=='test'||!/^whsec_[A-Za-z0-9]+$/.test(e.STRIPE_TEST_WEBHOOK_SECRET||''))throw Error('Stripe sandbox verification is awaiting secure account setup.');
 if(!/^(?:sk|rk|rkcs)_test_[A-Za-z0-9]+$/.test(e.STRIPE_TEST_SECRET_KEY||''))throw Error('Stripe test checkout is awaiting secure account setup.');
 const u=new URL(e.PAYMENT_APP_ORIGIN||'');
 const localSandbox=u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname);
 if((u.protocol!=='https:'&&!localSandbox)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('Invalid payment return origin');
 const minimumAmount=Number(e.STRIPE_TEST_MIN_AMOUNT||50);
 if(!Number.isSafeInteger(minimumAmount)||minimumAmount<50||minimumAmount>10000000)throw Error('Invalid sandbox minimum');
 return {key:e.STRIPE_TEST_SECRET_KEY as string,origin:u.origin,minimumAmount};
}
export function stripeSandboxAvailable(config:{PAYMENT_PROVIDER?:string}) {
 if(config.PAYMENT_PROVIDER!=='stripe')return false;
 try{stripeTestConfig(config);return true;}catch{return false;}
}
export function stripeCheckoutUrl(value:unknown){const u=new URL(String(value));if(u.protocol!=='https:'||u.hostname!=='checkout.stripe.com'||u.port||u.username||u.password)throw Error('Untrusted Stripe checkout address');return u.href;}
export function validateStripePayment(s:any,o:{id:string;total:number;currency:string}){
 if(!s||s.livemode!==false||s.mode!=='payment'||s.status!=='complete'||s.payment_status!=='paid'||!/^cs_test_[A-Za-z0-9]+$/.test(s.id||'')||!/^pi_[A-Za-z0-9]+$/.test(s.payment_intent||'')||s.client_reference_id!==o.id||s.metadata?.order_id!==o.id||s.amount_total!==o.total||s.currency!==o.currency.toLowerCase())throw Error('Payment does not match this test order. Do not pay again.');
 return s.payment_intent as string;
}
export async function verifyStripeSignature(raw:string,header:string|null,secret:string,now=Math.floor(Date.now()/1000)){
 if(!secret?.startsWith('whsec_')||!header)throw Error('Invalid Stripe webhook signature');
 const parts=header.split(',').map(p=>p.split('=')),t=parts.find(p=>p[0]==='t')?.[1];
 if(!t||!/^\d+$/.test(t)||Math.abs(now-Number(t))>300)throw Error('Expired Stripe webhook signature');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(t+'.'+raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const valid=parts.filter(p=>p[0]==='v1'&&/^[a-f0-9]{64}$/.test(p[1]||'')).some(p=>{let diff=0;for(let i=0;i<64;i++)diff|=p[1].charCodeAt(i)^signature.charCodeAt(i);return diff===0;});
 if(!valid)throw Error('Invalid Stripe webhook signature');
}
