import test from 'node:test';
import assert from 'node:assert/strict';
import {createTableScanGate, parseCafeTableQr, scannerWords, espressoMotion, tableCameraCrop} from '../lib/table-scanner.ts';

test('video scanning uses the square area visible in either camera orientation', () => {
 assert.deepEqual(tableCameraCrop(1280,720),{x:280,y:0,side:720,output:640});
 assert.deepEqual(tableCameraCrop(720,1280),{x:0,y:280,side:720,output:640});
 assert.deepEqual(tableCameraCrop(320,240),{x:40,y:0,side:240,output:240});
});
const origin='http://127.0.0.1:5173', valid=origin+'/?table=T07#menu';
function harness(verify=async()=>{}) {
 const events=[],opened=[];let finish;
 const gate=createTableScanGate({origin:()=>origin,verify,feedback:(...e)=>events.push(e),present:()=>new Promise(r=>finish=r),open:t=>opened.push(t)});
 return {gate,events,opened,finish:()=>finish?.()};
}
test('only a single table parameter from this cafe origin and root path is accepted',()=>{
 assert.equal(parseCafeTableQr(valid,origin),'T07');
 for(const value of ['garbage','https://example.com/?table=T07',origin+'/menu?table=T07',origin+'/?table=T07&table=T08',origin+'/?table=T7',origin.replace('http://','http://other@')+'/?table=T07','javascript:alert(1)']) assert.equal(parseCafeTableQr(value,origin),null,value);
});
test('intro blocks scans and duplicate readiness cannot start a second session',async()=>{
 let calls=0;const h=harness(async()=>calls++);
 await h.gate.scan(valid);assert.equal(calls,0);assert.equal(h.gate.activate(),true);assert.equal(h.gate.activate(),false);
 assert.ok(espressoMotion.introduceAt<espressoMotion.returnAt&&espressoMotion.returnAt<espressoMotion.readyAt);
});
test('wrong QR gives gentle guidance without checking a table and permits a later valid scan',async()=>{
 const h=harness();h.gate.activate();await h.gate.scan('https://example.com/');assert.deepEqual(h.events,[['wrong-qr']]);
 const p=h.gate.scan(valid);await Promise.resolve();assert.deepEqual(h.events.at(-1),['confirmed','T07']);h.finish();await p;assert.deepEqual(h.opened,['T07']);
});
test('concurrent frames verify once and navigation waits for the success animation',async()=>{
 let calls=0,release;const h=harness(()=>{calls++;return new Promise(r=>release=r);});h.gate.activate();
 const p=h.gate.scan(valid);await h.gate.scan(valid);assert.equal(calls,1);release();await Promise.resolve();assert.deepEqual(h.opened,[]);
 h.finish();await p;await h.gate.scan(valid);assert.deepEqual(h.opened,['T07']);assert.equal(calls,1);
});
test('closing during verification aborts and never opens a late success',async()=>{
 let release,signal;const h=harness((t,s)=>{signal=s;return new Promise(r=>release=r);});h.gate.activate();const p=h.gate.scan(valid);h.gate.close();assert.equal(signal.aborted,true);release();await p;assert.deepEqual(h.opened,[]);assert.deepEqual(h.events,[['checking','T07']]);
});
test('background cancellation during the confirmation also prevents navigation',async()=>{
 const h=harness();h.gate.activate();const p=h.gate.scan(valid);await Promise.resolve();h.gate.cancel();h.finish();await p;assert.deepEqual(h.opened,[]);
});
test('unavailable tables and network failures stay in the scanner and allow retry',async()=>{
 let fail=true;const h=harness(async()=>{if(fail)throw Error('This table is unavailable.');});h.gate.activate();await h.gate.scan(valid);assert.equal(h.events.at(-1)[0],'unavailable');assert.deepEqual(h.opened,[]);
 fail=false;const p=h.gate.scan(valid);await Promise.resolve();h.finish();await p;assert.deepEqual(h.opened,['T07']);
 assert.match(scannerWords('wrong-qr').join(' '),/Please scan.*café table/);
});
