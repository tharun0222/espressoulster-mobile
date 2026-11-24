import test from 'node:test';
import assert from 'node:assert/strict';
import {activeCafeOrders,liveOrderLabel} from '../lib/live-order-status.ts';
test('Home lists each active café order and excludes finished and subscription-only purchases',()=>{
 const order=(id,status,product_id='latte')=>({id,status,items:[{product_id}]});
 const orders=[order('one','pending'),order('two','preparing'),order('three','ready'),order('four','completed'),order('five','cancelled'),order('six','pending','subscription-weekly')];
 assert.deepEqual(activeCafeOrders(orders).map(o=>o.id),['one','two','three']);
 orders[1].status='completed';assert.deepEqual(activeCafeOrders(orders).map(o=>o.id),['one','three']);
 assert.deepEqual(activeCafeOrders([]),[]);
});
test('Home status changes follow the admin lifecycle and fulfillment',()=>{
 assert.equal(liveOrderLabel({status:'confirmed'}),'Order accepted');
 assert.equal(liveOrderLabel({status:'preparing'}),'Preparing your order');
 assert.equal(liveOrderLabel({status:'ready',fulfillment:'dine_in'}),'Ready to serve');
 assert.equal(liveOrderLabel({status:'ready',fulfillment:'pickup'}),'Ready for collection');
});
