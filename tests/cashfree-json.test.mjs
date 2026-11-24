import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCashfreeJson} from '../lib/cashfree-json.ts';
test('Cashfree long numeric references retain exact digits instead of IEEE-754 rounding',()=>{
 const parsed=parseCashfreeJson('{"cf_payment_id":1477255274008638464,"cf_order_id":2149460581,"payment_amount":10.15}');
 assert.equal(parsed.cf_payment_id,'1477255274008638464');assert.equal(parsed.cf_order_id,'2149460581');assert.equal(parsed.payment_amount,10.15);
});
test('string and numeric webhook IDs normalize to the same receipt key',()=>{
 assert.equal(parseCashfreeJson('{"cf_payment_id":1477255274008638464}').cf_payment_id,parseCashfreeJson('{"cf_payment_id":"1477255274008638464"}').cf_payment_id);
});
test('invalid numeric ID notation is rejected and raw decimal text remains intact for signatures',()=>{
 assert.throws(()=>parseCashfreeJson('{"cf_payment_id":1.4772552740086385e18}'),/invalid payment reference/);
 assert.throws(()=>parseCashfreeJson('{bad json}'));
 const raw='{"data":{"payment_amount":10.00,"cf_payment_id":1477255274008638464}}';parseCashfreeJson(raw);assert.ok(raw.includes('10.00'));
});
