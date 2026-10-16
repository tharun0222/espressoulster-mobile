import test from 'node:test';
import assert from 'node:assert/strict';
import {manualUpiLink,paymentUpiId} from '../lib/manual-upi.ts';
test('UPI payment uses supplied recipient and exact paise amount',()=>{const u=new URL(manualUpiLink(26500,'CH-1234ABCD'));assert.equal(u.protocol,'upi:');assert.equal(u.searchParams.get('pa'),paymentUpiId);assert.equal(u.searchParams.get('am'),'265.00');assert.equal(u.searchParams.get('cu'),'INR');assert.equal(u.searchParams.get('tn'),'Order CH-1234ABCD');});
test('rejects invalid amounts and references',()=>{for(const amount of [0,-1,NaN,1.5])assert.throws(()=>manualUpiLink(amount,'CH-1234ABCD'));assert.throws(()=>manualUpiLink(100,'other'));});
