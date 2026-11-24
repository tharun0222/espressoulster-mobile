import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAndroidPinSignIn} from '../lib/native-pin-signin.ts';
function bridge(handle){const target=new EventTarget();target.espressoAndroidSignIn=true;target.prompt=handle;return target;}
function result(target,requestId,ready){target.dispatchEvent(new CustomEvent('espresso-android-signin',{detail:{requestId,ready}}));}
test('ordinary browser sign-in never opens a native prompt',async()=>{
 const target=bridge(()=>{throw Error('Prompt must not open');});target.espressoAndroidSignIn=false;
 assert.equal(await prepareAndroidPinSignIn(target),false);
});
test('only the matching native request can finish app verification',async()=>{
 let id;const target=bridge((message,value)=>{assert.equal(message,'espresso:app:prepare-signin');id=value;return 'ready';});
 let completed=false;const pending=prepareAndroidPinSignIn(target).then(value=>{completed=true;return value;});
 result(target,crypto.randomUUID(),true);await Promise.resolve();assert.equal(completed,false);
 result(target,id,true);assert.equal(await pending,true);
 result(target,id,false);assert.equal(completed,true);
});
test('native rejection returns failure instead of granting app proof',async()=>{
 let id;const target=bridge((message,value)=>{id=value;return 'ready';});const pending=prepareAndroidPinSignIn(target);
 result(target,id,false);assert.equal(await pending,false);
 assert.equal(await prepareAndroidPinSignIn(bridge(()=>null)),false);
});
test('leaving the page cancels pending native verification',async()=>{
 let id;const target=bridge((message,value)=>{id=value;return 'ready';});const pending=prepareAndroidPinSignIn(target);
 target.dispatchEvent(new Event('pagehide'));assert.equal(await pending,false);
 result(target,id,true);
});
test('native attestation has enough time for its HTTPS round trips while page cancellation still wins',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let id;const target=bridge((_message,value)=>{id=value;return 'ready';});
 let settled=false;const pending=prepareAndroidPinSignIn(target).then(value=>{settled=true;return value});
 t.mock.timers.tick(25000);await Promise.resolve();assert.equal(settled,false);
 result(target,id,true);assert.equal(await pending,true);
 const timed=prepareAndroidPinSignIn(target);
 t.mock.timers.tick(90000);assert.equal(await timed,false);
});
