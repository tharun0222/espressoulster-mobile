import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../lib/payment-request.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function setup(fetch,timers={}){const context={exports:{},fetch,AbortController,setTimeout,clearTimeout,...timers};vm.runInNewContext(compiled,context);return context.exports.paymentRequest;}
test('stalled payment requests abort with check-status guidance',async()=>{let cleared=false;const request=setup((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')))),{setTimeout:callback=>{queueMicrotask(callback);return 1},clearTimeout:()=>{cleared=true}});await assert.rejects(request('CH-1234ABCD/start',{}),/timed out.*Check payment status/);assert.equal(cleared,true)});
test('server rejection remains visible',async()=>{const request=setup(async()=>({ok:false,json:async()=>({error:'Order is cancelled'})}));await assert.rejects(request('CH-1234ABCD/start',{}),/Order is cancelled/)});
test('verification preserves provider-confirmed result',async()=>{const request=setup(async(url,options)=>{assert.equal(url,'/api/payments/CH-1234ABCD/verify');assert.equal(options.method,'POST');return {ok:true,json:async()=>({paid:true,testOnly:true})}});assert.equal((await request('CH-1234ABCD/verify',{})).paid,true)});
