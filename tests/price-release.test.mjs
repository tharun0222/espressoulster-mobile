import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openDatabase, migrateDatabase } from '../server/database.mjs';
import { applyPriceRelease, oneRupeePriceRelease } from '../lib/price-release.ts';

test('₹1 release backs up prices once and preserves prior orders, credits, stock and subsequent Admin edits', async t => {
  const db = openDatabase(':memory:'); t.after(() => db.close());
  migrateDatabase(db, path.resolve('drizzle'));
  db.sql.exec(`INSERT INTO settings VALUES('store','{"taxBps":0,"tableBookingFeePaise":10000}');
    INSERT INTO categories(id,name) VALUES('coffee','Coffee');
    INSERT INTO products(id,name,category_id,price,inventory,available,data) VALUES('latte','Latte','coffee',20000,4,1,
    '{"price":20000,"testPrice":true,"variants":[{"id":"v","price":5000}],"addons":[{"id":"free","price":0},{"id":"paid","price":2000}]}');
    INSERT INTO profiles(id,email) VALUES('customer','customer@example.test');
    INSERT INTO orders(id,user_id,idempotency_key,fulfillment,total,subtotal,tax,discount,fee,currency,contact)
    VALUES('CH-111ABCDE','customer','previous-order','pickup',20000,20000,0,0,0,'INR','{}');`);
  const beforePlans = db.sql.prepare('SELECT SUM(credits) AS n FROM subscription_catalog').get().n;
  await Promise.all([applyPriceRelease(db, oneRupeePriceRelease), applyPriceRelease(db, oneRupeePriceRelease)]);
  const product = await db.prepare("SELECT * FROM products WHERE id='latte'").first();
  assert.equal(product.price,100); assert.equal(product.inventory,4); assert.equal(product.available,1);
  const data=JSON.parse(product.data);
  assert.equal(data.testPrice,undefined); assert.equal(data.variants[0].price,100);
  assert.deepEqual(data.addons.map(a=>a.price),[0,100]);
  assert.equal(await db.prepare("SELECT total FROM orders WHERE id='CH-111ABCDE'").first('total'),20000);
  assert.equal(db.sql.prepare('SELECT MAX(amount) AS n FROM subscription_catalog').get().n,100);
  assert.equal(db.sql.prepare('SELECT SUM(credits) AS n FROM subscription_catalog').get().n,beforePlans);
  assert.equal(JSON.parse(await db.prepare("SELECT data FROM settings WHERE id='store'").first('data')).tableBookingFeePaise,100);
  const backup=JSON.parse(await db.prepare('SELECT data FROM settings WHERE id=?').bind('price-backup:'+oneRupeePriceRelease).first('data'));
  assert.equal(backup.products.find(p=>p.id==='latte').price,20000);
  db.sql.exec("UPDATE products SET price=25000 WHERE id='latte'");
  assert.equal(await applyPriceRelease(db,oneRupeePriceRelease),false);
  assert.equal(await db.prepare("SELECT price FROM products WHERE id='latte'").first('price'),25000);
  assert.equal(await applyPriceRelease(db,undefined),false);
});
