import { cafeCheckoutOrders } from './cafe-order-day.ts';
import { orderNotice, staffOrderNotice, type NoticeOrder } from './order-notifications.ts';
import { visibleSubscriptionOrders } from './visible-subscription-orders.ts';

const oneDay = 24 * 60 * 60 * 1000;
const alertStart = () => new Date(Date.now() - oneDay).toISOString().slice(0, 19).replace('T', ' ');

type CustomerEvent = Omit<NoticeOrder, 'contact'> & { table_number: string | null };

export async function customerOrderAlertFeed(db: Pick<D1Database, 'prepare'>, userId: string) {
  const { results } = await db.prepare(`
    SELECT o.id, o.order_number, o.fulfillment, e.status,
      CASE WHEN o.fulfillment='dine_in' THEN json_extract(o.contact,'$.table') END AS table_number
    FROM orders o JOIN order_events e ON e.order_id=o.id
    WHERE o.user_id=? AND e.created_at>=? AND (${cafeCheckoutOrders})
      AND ${visibleSubscriptionOrders('o')}
    ORDER BY e.created_at DESC, e.rowid DESC LIMIT 120
  `).bind(userId, alertStart()).all<CustomerEvent>();
  return results.reverse().flatMap(({table_number, ...order}) => {
    const notice = orderNotice({...order, contact: table_number ? {table: table_number} : undefined});
    return notice ? [notice] : [];
  });
}

export async function staffOrderAlertFeed(db: Pick<D1Database, 'prepare'>) {
  const { results } = await db.prepare(`
    SELECT id, order_number, fulfillment FROM orders
    WHERE created_at>=? AND (${cafeCheckoutOrders})
    ORDER BY created_at DESC, rowid DESC LIMIT 120
  `).bind(alertStart()).all<Parameters<typeof staffOrderNotice>[0]>();
  return results.reverse().map(staffOrderNotice);
}
