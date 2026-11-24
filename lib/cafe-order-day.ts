import { visibleSubscriptionOrders } from './visible-subscription-orders.ts';

export const defaultCafeOpeningTime = '06:30';

export function isCafeOpeningTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function cafeBusinessDay(now: Date, openingTime: unknown) {
  const [hours, minutes] = (isCafeOpeningTime(openingTime) ? openingTime : defaultCafeOpeningTime).split(':').map(Number);
  const istOffset = 330 * 60_000;
  const shifted = new Date(now.getTime() + istOffset - (hours * 60 + minutes) * 60_000);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), hours, minutes) - istOffset;
  return {
    date: shifted.toISOString().slice(0, 10),
    startsAt: new Date(start).toISOString().slice(0, 19).replace('T', ' '),
  };
}

export function cafeOrderDay(now: Date, openingTime: unknown) {
  return cafeBusinessDay(now, openingTime).startsAt;
}

export const cafeCheckoutOrders =
  "idempotency_key NOT LIKE 'sandbox-subscription-%' AND idempotency_key NOT LIKE 'sandbox-coffee-%' AND idempotency_key NOT LIKE 'sandbox-item-code-%' AND idempotency_key NOT LIKE 'subscription-purchase-%' AND idempotency_key NOT LIKE 'subscription-item-code-%'";

export function readCafeOverviewStats(db: Pick<D1Database, 'prepare'>, start: string) {
  return db.prepare(`
    WITH day AS (SELECT julianday(?) AS start)
    SELECT COUNT(*) AS total,
      COUNT(*) FILTER (WHERE orders.status='pending' AND ${cafeCheckoutOrders}) AS pending,
      COUNT(*) FILTER (WHERE orders.status='completed' AND ${cafeCheckoutOrders} AND EXISTS (
        SELECT 1 FROM order_events e WHERE e.order_id=orders.id AND e.status='completed'
          AND julianday(e.created_at)>=day.start AND julianday(e.created_at)<day.start+1
      )) AS completed,
      COALESCE(SUM(p.amount) FILTER (WHERE orders.payment_status='paid' AND ${cafeCheckoutOrders}
        AND p.method NOT IN ('stripe_test','cashfree_test','razorpay_test','simulated')
        AND julianday(p.created_at)>=day.start AND julianday(p.created_at)<day.start+1), 0) AS revenue
    FROM orders CROSS JOIN day LEFT JOIN payments p ON p.order_id=orders.id
    WHERE ${visibleSubscriptionOrders()}
  `).bind(start).first<{total:number;pending:number;completed:number;revenue:number}>();
}
