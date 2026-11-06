import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureSeedOnce} from '../lib/seed-once.ts';

test('concurrent cold requests share one initialization and later requests do not repeat it',async()=>{
 const database={};let calls=0,release;
 const gate=new Promise(resolve=>{release=resolve});
 const initialize=async()=>{calls++;await gate};
 const requests=Array.from({length:20},()=>ensureSeedOnce(database,initialize));
 await Promise.resolve();assert.equal(calls,1);
 release();await Promise.all(requests);
 await ensureSeedOnce(database,async()=>{calls++});assert.equal(calls,1);
});
test('a failed initialization rejects callers and allows a successful retry',async()=>{
 const database={};let calls=0;
 const initialize=async()=>{calls++;throw Error('temporary database failure')};
 const results=await Promise.allSettled(Array.from({length:10},()=>ensureSeedOnce(database,initialize)));
 assert.equal(calls,1);assert.ok(results.every(result=>result.status==='rejected'));
 await ensureSeedOnce(database,async()=>{calls++});assert.equal(calls,2);
 await ensureSeedOnce(database,async()=>{calls++});assert.equal(calls,2);
});
test('database bindings initialize independently',async()=>{
 const first={},second={};let calls=0;
 await Promise.all([ensureSeedOnce(first,async()=>{calls++}),ensureSeedOnce(second,async()=>{calls++})]);
 assert.equal(calls,2);
});
