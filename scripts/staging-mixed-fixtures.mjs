import { createHash, createHmac } from 'node:crypto';
import pg from 'pg';

export const fixtureDatabase = 'espressoulster_load_staging';
export const fixtureProduct = 'load-test-coffee';
export const fixtureCookie = (secret, id) => createHmac('sha256', secret).update(`customer:${id}`).digest('hex');
export const fixturePhone = id => `+919000${String(id).padStart(6, '0')}`;

export async function withFixtureDatabase(action) {
  if (process.env.PGDATABASE !== fixtureDatabase || !process.env.PGHOST?.startsWith('/')) {
    throw new Error('Use the isolated PostgreSQL load test database and private socket.');
  }
  const client = new pg.Client({connectionTimeoutMillis:5000});
  await client.connect();
  try { return await action(client); }
  finally { await client.end(); }
}

export async function seedCustomers(secret, count) {
  if (!/^[a-f0-9]{64}$/.test(secret || '') || !Number.isSafeInteger(count) || count < 1 || count > 110000) {
    throw new Error('Invalid load fixture configuration.');
  }
  return withFixtureDatabase(async client => {
    await client.query('BEGIN');
    try {
      const existing = await client.query('SELECT EXISTS (SELECT 1 FROM profiles) AS populated');
      if (existing.rows[0].populated) throw new Error('Create a fresh load database for each run.');
      await client.query("INSERT INTO categories(id,name,position) VALUES('load-test','Load test',10000)");
      await client.query(`INSERT INTO products(id,name,category_id,price,available,data)
        VALUES($1,'Fixture Coffee','load-test',1000,1,$2)`,
      [fixtureProduct, JSON.stringify({id:fixtureProduct,name:'Fixture Coffee',categoryId:'load-test'})]);
      for (let start = 1; start <= count; start += 2000) {
        const ids = [], phones = [], hashes = [];
        for (let id = start; id <= count && id < start + 2000; id++) {
          ids.push(`load-${id}`);
          phones.push(fixturePhone(id));
          hashes.push(createHash('sha256').update(fixtureCookie(secret,id)).digest('hex'));
        }
        await client.query(`INSERT INTO profiles(id,email,name,phone)
          SELECT id,id||'@load.invalid','Load Customer',phone FROM unnest($1::text[],$2::text[]) x(id,phone)`, [ids,phones]);
        await client.query(`INSERT INTO pin_sessions(token_hash,user_id,expires_at)
          SELECT hash,id,extract(epoch FROM now())::bigint+86400 FROM unnest($1::text[],$2::text[]) x(id,hash)`, [ids,hashes]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

export async function reconcileLoad() {
  return withFixtureDatabase(async client => (await client.query(`SELECT
    (SELECT COUNT(*)::int FROM orders WHERE checkout_payment_method='pay_at_pickup') AS "counterOrders",
    (SELECT COUNT(*)::int FROM orders WHERE checkout_payment_method='cashfree_test' AND payment_status='paid') AS "paidOrders",
    (SELECT COUNT(*)::int FROM table_bookings) AS bookings,
    (SELECT COUNT(*)::int FROM orders o LEFT JOIN payments p ON p.order_id=o.id
      WHERE o.checkout_payment_method='cashfree_test' AND (p.id IS NULL OR p.amount<>o.total OR p.method<>'cashfree_test')) AS "badPayments",
    (SELECT COUNT(*)::int FROM table_bookings b LEFT JOIN table_booking_payments p ON p.id=b.id
      WHERE p.id IS NULL OR p.state<>'paid') AS "unpaidBookings",
    (SELECT COUNT(*)::int FROM live_cafe_table_schedule a JOIN live_cafe_table_schedule b
      ON a.table_id=b.table_id AND a.id<b.id AND a.start_at<b.end_at AND a.end_at>b.start_at) AS "tableConflicts"`)).rows[0]);
}
