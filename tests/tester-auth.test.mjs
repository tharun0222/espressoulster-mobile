import test from 'node:test';import assert from 'node:assert/strict';import {testerName,testerToken,hashTesterToken} from '../lib/tester-auth.ts';
test('valid trimmed tester name',()=>assert.equal(testerName(' Tharun '),'Tharun'));
for(const n of ['', 'x', 'a'.repeat(61),null,{},'ab\ncd'])test('invalid name '+JSON.stringify(n),()=>assert.throws(()=>testerName(n)));
test('cookie parsing accepts only 256 bit hex token',()=>{const token='a'.repeat(64);assert.equal(testerToken('other=1; espresso_tester='+token),token);assert.equal(testerToken('espresso_tester=admin'),null);assert.equal(testerToken(null),null)});
test('tokens hashed deterministically and distinctly',async()=>{const raw='a'.repeat(64),h=await hashTesterToken(raw);assert.equal(h.length,64);assert.notEqual(h,raw);assert.equal(h,await hashTesterToken(raw));assert.notEqual(h,await hashTesterToken('b'.repeat(64)))});
