import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createMsg91Ipv4Fetch} from '../lib/msg91-transport.ts';
function fixture(status=200){
 const calls=[];
 const transport=createMsg91Ipv4Fetch((url,options,receive)=>{
  const req=new EventEmitter();req.body='';req.setTimeout=()=>req;
  req.write=value=>req.body+=value;
  req.destroy=error=>{queueMicrotask(()=>{req.emit('error',error);req.emit('close');});return req;};
  req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=status;res.headers={'content-type':'application/json',...(status===302?{location:'https://untrusted.invalid/'}:{})};receive(res);res.emit('data',Buffer.from('{"status":"success"}'));res.emit('end');req.emit('close');});
  calls.push({url,options,req});return req;
 });
 return {transport,calls};
}
test('MSG91 transport uses IPv4 with TLS and retains the exact request body',async()=>{
 const f=fixture();const r=await f.transport('https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/',{method:'POST',headers:{authkey:'fixture-secret'},body:'{"fixture":true}'});
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.family,4);assert.notEqual(f.calls[0].options.rejectUnauthorized,false);
 assert.equal(f.calls[0].options.headers.authkey,'fixture-secret');assert.equal(f.calls[0].req.body,'{"fixture":true}');assert.equal((await r.json()).status,'success');
});
test('MSG91 credentials cannot be sent to an insecure or different endpoint',async()=>{
 const f=fixture();for(const url of ['http://control.msg91.com/api/','https://untrusted.invalid/','https://control.msg91.com:444/','https://person@control.msg91.com/'])await assert.rejects(f.transport(url,{headers:{authkey:'fixture-secret'}}),/Invalid MSG91 endpoint/);
 assert.equal(f.calls.length,0);
});
test('MSG91 redirects are returned without forwarding credentials',async()=>{
 const f=fixture(302);const r=await f.transport('https://control.msg91.com/api/v5/otp',{headers:{authkey:'fixture-secret'}});
 assert.equal(r.status,302);assert.equal(f.calls.length,1);
});
test('aborted OTP requests never start an outbound connection',async()=>{
 const f=fixture();const controller=new AbortController();controller.abort();
 await assert.rejects(f.transport('https://control.msg91.com/api/v5/otp',{signal:controller.signal}),error=>error.name==='AbortError');assert.equal(f.calls.length,0);
});
