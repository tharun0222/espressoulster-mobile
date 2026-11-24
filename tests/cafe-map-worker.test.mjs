import test from 'node:test';
import assert from 'node:assert/strict';
import {cafeMapWorker} from '../lib/cafe-map-worker.ts';

function location(t,origin='https://cafe.ngrok-free.dev'){
 const original=Object.getOwnPropertyDescriptor(globalThis,'window');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:new URL(origin+'/')}});
 t.after(()=>{if(original)Object.defineProperty(globalThis,'window',original);else delete globalThis.window;});
}
test('map worker fetch carries the preview app header, validates JavaScript and creates a local worker',async t=>{
 location(t);let request,script;
 t.mock.method(globalThis,'fetch',async(url,options)=>{request={url,options};return new Response('self.onmessage = function(){};',{headers:{'content-type':'application/javascript; charset=utf-8'}});});
 t.mock.method(URL,'createObjectURL',blob=>{script=blob;return'blob:worker';});
 const result=await cafeMapWorker('/_next/static/media/map-worker.js',new AbortController().signal);
 assert.equal(result,'blob:worker');assert.equal(request.url.origin,window.location.origin);
 assert.equal(request.options.headers['ngrok-skip-browser-warning'],'1');assert.equal(request.options.redirect,'error');
 assert.equal(request.options.cache,'no-store');assert.equal(request.options.credentials,'same-origin');
 assert.equal(script.type,'application/javascript');assert.match(await script.text(),/self.onmessage/);
});
test('HTML interstitial, wrong MIME and HTTP failure cannot become executable map workers',async t=>{
 location(t);let body,status,type;let blobs=0;
 t.mock.method(URL,'createObjectURL',()=>{blobs++;return'blob:bad';});
 t.mock.method(globalThis,'fetch',async()=>new Response(body,{status,headers:{'content-type':type}}));
 for(const input of [
  ['<!DOCTYPE html><title>Visit Site</title>',200,'text/html'],
  ['<html>notice</html>',200,'application/javascript'],
  ['not found',404,'application/javascript'],
  ['',200,'application/javascript'],
 ]){
  [body,status,type]=input;
  await assert.rejects(cafeMapWorker('/worker.js',new AbortController().signal),/unavailable/);
 }
 assert.equal(blobs,0);
});
test('worker source cannot move to another origin, and ordinary HTTPS hosts get no tunnel header',async t=>{
 location(t,'https://coffee.example');let calls=0;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{calls++;assert.deepEqual(options.headers,{});return new Response('self.onmessage=()=>{}',{headers:{'content-type':'text/javascript'}});});
 t.mock.method(URL,'createObjectURL',()=> 'blob:worker');
 await assert.rejects(cafeMapWorker('https://another.example/worker.js',new AbortController().signal),/app origin/);
 assert.equal(calls,0);await cafeMapWorker('/worker.js',new AbortController().signal);assert.equal(calls,1);
});
test('cancellation while reading worker code creates no Blob or orphaned worker',async t=>{
 location(t);const controller=new AbortController();let finish,blobs=0;
 t.mock.method(globalThis,'fetch',async()=>({ok:true,headers:new Headers({'content-type':'text/javascript'}),text:()=>new Promise(resolve=>{finish=resolve;})}));
 t.mock.method(URL,'createObjectURL',()=>{blobs++;return'blob:late';});
 const promise=cafeMapWorker('/worker.js',controller.signal);
 await Promise.resolve();controller.abort();finish('self.onmessage=()=>{};');
 await assert.rejects(promise,{name:'AbortError'});assert.equal(blobs,0);
});
