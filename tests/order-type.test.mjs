import test from 'node:test';
import assert from 'node:assert/strict';
import {enabledOrderTypes, resolveOrderType, orderTypeStorageKey} from '../lib/order-type.ts';

const settings = {dineInEnabled: true, pickupEnabled: true, deliveryEnabled: false};

test('both customer choices restore unchanged across screens or reloads', () => {
  assert.deepEqual(enabledOrderTypes(settings), ['dine_in', 'pickup']);
  for (const choice of ['dine_in', 'pickup']) assert.equal(resolveOrderType(choice, settings), choice);
});
test('table QR selects dine-in ahead of a remembered take-away choice', () => {
  assert.equal(resolveOrderType('pickup', settings, true), 'dine_in');
  assert.equal(resolveOrderType('pickup', {...settings, dineInEnabled: false}, true), 'pickup');
});
test('disabled or invalid preferences fall back to an enabled mode', () => {
  assert.equal(resolveOrderType('delivery', settings), 'pickup');
  assert.equal(resolveOrderType('pickup', {...settings, pickupEnabled: false}), 'dine_in');
  assert.equal(resolveOrderType(null, {deliveryEnabled: true}), 'delivery');
});
test('different customers do not inherit one another’s remembered selection', () => {
  const session = new Map([[orderTypeStorageKey('customer-a'), 'dine_in'], [orderTypeStorageKey('customer-b'), 'pickup']]);
  assert.equal(resolveOrderType(session.get(orderTypeStorageKey('customer-a')), settings), 'dine_in');
  assert.equal(resolveOrderType(session.get(orderTypeStorageKey('customer-b')), settings), 'pickup');
  assert.notEqual(orderTypeStorageKey('customer-a'), orderTypeStorageKey(''));
});
