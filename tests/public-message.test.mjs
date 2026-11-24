import test from 'node:test';
import assert from 'node:assert/strict';
import {publicMessage,customerEmail} from '../lib/public-message.ts';

test('customer instructions and ordinary validation remain visible',()=>{
 for(const text of ['Enter your mobile number.','That table is unavailable. Choose another.','Order is cancelled','Check payment status before trying again.'])assert.equal(publicMessage(text),text);
});

test('internal errors and credentials are replaced with a safe message',()=>{
 const fallback='Please try again.';
 for(const value of [undefined,{},'','a'.repeat(351),'MSG91 Authkey is missing','Bearer fixture-token','SQLITE_CONSTRAINT: pin_accounts.phone','TypeError: invalid response','https://internal.example.test/private','/Users/example/project/secret.env','0123456789abcdef0123456789abcdef','Error\nat internal-module:12:3','<script>private</script>']){
  assert.equal(publicMessage(value,fallback),fallback);
 }
});

test('generated account email placeholders stay out of customer lists',()=>{
 for(const email of ['pin-fixture@pin.invalid','fixture@phone.invalid','fixture@tester.invalid',null])assert.equal(customerEmail(email),'');
 assert.equal(customerEmail('person@example.test'),'person@example.test');
});
