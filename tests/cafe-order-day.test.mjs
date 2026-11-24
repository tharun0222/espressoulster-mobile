import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { cafeBusinessDay, cafeOrderDay, isCafeOpeningTime, readCafeOverviewStats } from '../lib/cafe-order-day.ts';

test('the café day includes post-midnight orders and resets at opening in IST', () => {
  assert.equal(cafeOrderDay(new Date('2026-11-13T20:00:00Z'), '06:30'), '2026-11-13 01:00:00');
  assert.equal(cafeOrderDay(new Date('2026-11-14T00:59:59Z'), '06:30'), '2026-11-13 01:00:00');
  assert.equal(cafeOrderDay(new Date('2026-11-14T01:00:00Z'), '06:30'), '2026-11-14 01:00:00');
  assert.equal(cafeOrderDay(new Date('2026-11-14T01:30:00Z'), '07:00'), '2026-11-14 01:30:00');
});

test('older store settings use the default opening time', () => {
  const now = new Date('2026-11-14T01:00:00Z');
  for (const value of [null, '', '6:30', '24:00', undefined]) {
    assert.equal(isCafeOpeningTime(value), false);
    assert.equal(cafeOrderDay(now, value), '2026-11-14 01:00:00');
  }
});

test('the number date uses the local business date when opening falls on the previous UTC date', () => {
  assert.deepEqual(cafeBusinessDay(new Date('2026-11-14T20:00:00Z'), '00:00'), {
    date: '2026-11-15',
    startsAt: '2026-11-14 18:30:00',
  });
  assert.equal(cafeBusinessDay(new Date('2026-11-14T20:00:00Z'), '06:30').date, '2026-11-14');
});

test('overview keeps pending café orders and counts only completions and revenue in the current café day', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE orders(id TEXT, idempotency_key TEXT, status TEXT, payment_status TEXT);
      CREATE TABLE order_events(order_id TEXT, status TEXT, created_at TEXT);
      CREATE TABLE payments(id TEXT, order_id TEXT, method TEXT, verified_by TEXT, amount INTEGER, created_at TEXT);
      CREATE TABLE coffee_subscriptions(id TEXT, payment_id TEXT, revoked INTEGER);
      CREATE TABLE coffee_redemptions(subscription_id TEXT, order_id TEXT);
      INSERT INTO orders VALUES
        ('pending','checkout-pending','pending','unpaid'),
        ('pass','sandbox-subscription-mocha','pending','paid'),
        ('old','checkout-old','completed','paid'),
        ('new','checkout-new','completed','paid'),
        ('test','checkout-test','completed','paid'),
        ('code','sandbox-item-code-mocha','completed','paid'),
        ('tomorrow','checkout-future','completed','paid');
      INSERT INTO order_events VALUES
        ('old','completed','2026-11-15T00:59:59Z'),
        ('new','completed','2026-11-15 01:00:00'),
        ('test','completed','2026-11-15 09:00:00'),
        ('code','completed','2026-11-15 10:00:00'),
        ('tomorrow','completed','2026-11-16 01:00:00');
      INSERT INTO payments VALUES
        ('receipt-old','old','cash','admin',12000,'2026-11-15 00:59:59'),
        ('receipt-new','new','upi','admin',18000,'2026-11-15 01:00:00'),
        ('receipt-test','test','stripe_test','provider_verified_test',6000,'2026-11-15 09:00:00'),
        ('receipt-pass','pass','stripe_test','provider_verified_test',300000,'2026-11-15 09:00:00'),
        ('receipt-future','tomorrow','card','admin',9000,'2026-11-16 01:00:00');
    `);
    const adapter = { prepare(query) { return { bind(...params) { return {
      async first() { return db.prepare(query).get(...params); },
    }; } }; } };
    const stats = await readCafeOverviewStats(adapter, cafeOrderDay(new Date('2026-11-15T20:00:00Z'), '06:30'));
    assert.deepEqual({ ...stats }, { total: 7, pending: 1, completed: 2, revenue: 18000 });
  } finally {
    db.close();
  }
});
