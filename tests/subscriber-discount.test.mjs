import test from 'node:test';import assert from 'node:assert/strict';import {applySubscriberDiscount,subscriberQuote} from '../lib/subscriber-discount.ts';
const quote={subtotal:10000,discount:0,tax:500,fee:200,total:10700};
test('10 percent excludes fees and recalculates tax',()=>{const q=applySubscriberDiscount(quote,500,true);assert.equal(q.discount,1000);assert.equal(q.tax,450);assert.equal(q.total,9650)});
test('ordinary customers retain original total',()=>assert.equal(applySubscriberDiscount(quote,500,false).total,10700));
test('larger coupon is preserved without stacking',()=>assert.equal(applySubscriberDiscount({...quote,discount:2000},500,true).discount,2000));
test('smaller coupon is replaced with subscription benefit',()=>assert.equal(applySubscriberDiscount({...quote,discount:500},500,true).discount,1000));
test('zero-cost items receive no extra discount',()=>assert.equal(applySubscriberDiscount({...quote,subtotal:0,fee:0},500,true).discount,0));
const now=Date.parse('2026-10-15T06:00:00Z'),plan={id:'p',planName:'Pass',totalCredits:8,usedCredits:1,amountPaid:159900,startsAt:'2026-10-01T00:00:00Z',expiresAt:'2026-11-01T00:00:00Z',revoked:0};
function db(rows){return {prepare(sql){assert.match(sql,/payment_status='paid'/);return {bind(user){assert.equal(user,'customer');return {async all(){return {results:rows}}}}}}}}
test('verified active subscription qualifies',async()=>assert.equal((await subscriberQuote(db([plan]),{userId:'customer'},quote,{taxBps:500},now)).discount,1000));
test('expired, future, revoked and overdrawn subscriptions do not qualify',async()=>{for(const patch of [{expiresAt:'2026-10-14T00:00:00Z'},{startsAt:'2026-10-20T00:00:00Z'},{revoked:1},{usedCredits:9}])assert.equal((await subscriberQuote(db([{...plan,...patch}]),{userId:'customer'},quote,{taxBps:500},now)).discount,0)});
test('subscription remains valid for discount after all coffee credits used',async()=>assert.equal((await subscriberQuote(db([{...plan,usedCredits:8}]),{userId:'customer'},quote,{taxBps:500},now)).discount,1000));
test('admin channel never receives mobile subscriber discount',async()=>assert.equal((await subscriberQuote({}, {userId:'admin',admin:true},quote,{taxBps:500},now)).discount,0));
