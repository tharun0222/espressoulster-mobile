import test from 'node:test';
import assert from 'node:assert/strict';
import {openNativeCashfreeCheckout} from '../lib/native-cashfree-checkout.ts';
const session={orderId:'PC-'+'1'.repeat(32),paymentSessionId:'session_'+'x'.repeat(40),mode:'test'};
function mock(t,handler){
 const target=new EventTarget();target.espressoCashfreeCheckout=true;target.setTimeout=setTimeout;target.clearTimeout=clearTimeout;target.prompt=handler;
 const old=globalThis.window;globalThis.window=target;t.after(()=>{if(old===undefined)delete globalThis.window;else globalThis.window=old;});return target;
}
function callback(target,requestId,state){target.dispatchEvent(new CustomEvent('espresso-cashfree-checkout',{detail:{requestId,state}}));}
test('browser preview uses web SDK without opening a native prompt',t=>{
 const target=mock(t,()=>assert.fail('no prompt'));target.espressoCashfreeCheckout=false;
 assert.equal(openNativeCashfreeCheckout(session),null);
});
test('native sandbox checkout passes only order/session and waits for its own SDK callback',async t=>{
 let input;const target=mock(t,(name,value)=>{assert.equal(name,'espresso:cashfree:checkout');input=JSON.parse(value);return 'opened';});
 let finished=false;const pending=openNativeCashfreeCheckout(session).then(v=>{finished=true;return v;});
 assert.equal(input.orderId,session.orderId);assert.equal(input.paymentSessionId,session.paymentSessionId);
 assert.deepEqual(Object.keys(input).sort(),['mode','orderId','paymentSessionId','requestId']);
 callback(target,crypto.randomUUID(),'verify');await Promise.resolve();assert.equal(finished,false);
 callback(target,input.requestId,'paid');await Promise.resolve();assert.equal(finished,false);
 callback(target,input.requestId,'verify');assert.equal(await pending,'verify');
});
test('closing SDK only returns closed; it never grants payment confirmation',async t=>{
 let input;const target=mock(t,(_name,value)=>{input=JSON.parse(value);return 'opened';});
 const pending=openNativeCashfreeCheckout(session);callback(target,input.requestId,'closed');assert.equal(await pending,'closed');
});
test('unsupported native checkout rejects without exposing a session or treating it as paid',async t=>{
 mock(t,()=> 'unavailable');await assert.rejects(openNativeCashfreeCheckout(session),/check payment status/i);
 assert.equal(openNativeCashfreeCheckout({...session,mode:'live'}),null);
});
test('leaving checkout releases pending native listeners',async t=>{
 const target=mock(t,()=> 'opened');const pending=openNativeCashfreeCheckout(session);
 target.dispatchEvent(new Event('pagehide'));assert.equal(await pending,'closed');
});
