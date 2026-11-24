import test from 'node:test';
import assert from 'node:assert/strict';
import {orderElapsed,orderTime,elapsedLabel} from '../lib/order-timer.ts';
const start='2026-11-10 05:00:00';
test('elapsed time uses saved UTC timestamp and survives reopening',()=>{
 assert.equal(orderTime(start),Date.parse('2026-11-10T05:00:00Z'));
 assert.equal(orderElapsed({created_at:start,status:'preparing'},Date.parse('2026-11-10T05:02:05Z')).seconds,125);
 assert.equal(orderElapsed({created_at:start,status:'preparing'},Date.parse('2026-11-10T05:03:05Z')).seconds,185);
});
test('completed and cancelled orders freeze at their own terminal status event',()=>{
 for(const status of ['cancelled','completed']){
  assert.deepEqual(orderElapsed({created_at:start,status,events:[{status,created_at:'2026-11-10T05:04:00Z'}]},Date.parse('2026-11-10T06:00:00Z')),{seconds:240,finished:true,hasTime:true});
 }
});
test('invalid and future timestamps do not produce negative or NaN time',()=>{
 for(const created_at of ['bad','2027-01-01T00:00:00Z'])assert.equal(orderElapsed({created_at,status:'pending'},0).seconds,0);
 assert.equal(elapsedLabel(125),'02:05');assert.equal(elapsedLabel(3661),'01:01:01');
});

test('multiple orders run independently and completion stops only its own clock',()=>{
 const first={created_at:start,status:'completed',events:[{status:'ready',created_at:'2026-11-10T05:02:00Z'},{status:'completed',created_at:'2026-11-10T05:03:00Z'}]};
 const second={created_at:'2026-11-10T05:01:00Z',status:'ready'};
 const now=Date.parse('2026-11-10T05:04:00Z');
 assert.equal(orderElapsed(first,now).seconds,180);
 assert.equal(orderElapsed(first,now+60000).seconds,180);
 assert.equal(orderElapsed(second,now).seconds,180);
 assert.equal(orderElapsed(second,now+60000).seconds,240);
 assert.equal(orderElapsed(second,now).finished,false);
});
test('missing completion timestamp is shown as unavailable instead of an invented duration',()=>{
 assert.equal(orderElapsed({created_at:start,status:'completed'},Date.now()).hasTime,false);
});

test('online order timing starts at saved payment verification, not checkout creation',()=>{
 const order={created_at:'2026-11-10T05:00:00Z',timer_started_at:'2026-11-10T05:02:00Z',status:'pending'};
 assert.equal(orderElapsed(order,Date.parse('2026-11-10T05:02:00Z')).seconds,0);
 assert.equal(orderElapsed(order,Date.parse('2026-11-10T05:03:00Z')).seconds,60);
 const completed={...order,status:'completed',events:[{status:'completed',created_at:'2026-11-10T05:04:00Z'}]};
 assert.equal(orderElapsed(completed,Date.now()).seconds,120);
});
