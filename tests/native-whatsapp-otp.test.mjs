import test from 'node:test';
import assert from 'node:assert/strict';
import {startWhatsAppAutofill} from '../lib/native-whatsapp-otp.ts';

function shell(){
 const previous=globalThis.window;
 const target=new EventTarget();const calls=[];
 globalThis.window=Object.assign(target,{espressoWhatsAppAutofill:true,setTimeout,clearTimeout,
  prompt(command,id){calls.push({command,id});return command.endsWith(':start')?'ready':'stopped';}});
 function emit(id,type,code){const e=new Event('espresso-whatsapp-otp');e.detail={requestId:id,type,code};target.dispatchEvent(e);}
 return {calls,emit,restore(){globalThis.window=previous;}};
}

test('browser fallback requires no native prompt',async()=>{
 const previous=globalThis.window;globalThis.window={};
 try{const flow=startWhatsAppAutofill(()=>assert.fail('No code'));await flow.ready;flow.stop();}finally{globalThis.window=previous;}
});

test('native autofill binds callbacks to the active request and consumes a code once',async()=>{
 const s=shell();try{
  const codes=[];const flow=startWhatsAppAutofill(code=>codes.push(code));const id=s.calls[0].id;
  s.emit('unrelated','code','123456');s.emit(id,'code','invalid');assert.deepEqual(codes,[]);
  s.emit(id,'ready');await flow.ready;
  s.emit(id,'code','246810');s.emit(id,'code','246810');
  assert.deepEqual(codes,['246810']);assert.equal(s.calls.at(-1).command,'espresso:whatsapp:stop');
 }finally{s.restore();}
});

test('leaving sign-in removes the native listener and ignores late deliveries',async()=>{
 const s=shell();try{
  const codes=[];const flow=startWhatsAppAutofill(code=>codes.push(code));const id=s.calls[0].id;
  flow.stop();await flow.ready;s.emit(id,'code','246810');assert.deepEqual(codes,[]);
 }finally{s.restore();}
});
