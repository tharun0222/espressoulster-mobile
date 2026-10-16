import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {restorePreviousPrices} from '../lib/restore-prices.ts';
function setup(rows){
 const sql=new DatabaseSync(':memory:');sql.exec("CREATE TABLE settings(id TEXT PRIMARY KEY,data TEXT);CREATE TABLE products(id TEXT PRIMARY KEY,price INTEGER,data TEXT,available INTEGER,updated_at TEXT);CREATE TABLE orders(id TEXT,total INTEGER);INSERT INTO orders VALUES('old-order',100);");
 sql.prepare('INSERT INTO products VALUES(?,?,?,?,NULL)').run('coffee',100,JSON.stringify({price:100,description:'Keep this'}),0);
 sql.prepare('INSERT INTO products VALUES(?,?,?,?,NULL)').run('recipe',100,JSON.stringify({price:100}),1);
 if(rows)sql.prepare('INSERT INTO settings VALUES(?,?)').run('price-backup-original',JSON.stringify(rows));
 const d={
  prepare(q){
   return {async first(){return sql.prepare(q).get()},bind(...v){
    return {async run(){const r=sql.prepare(q).run(...v);return {meta:{changes:Number(r.changes)}}}};
   }};
  },
  async batch(s){sql.exec('BEGIN');try{const r=[];for(const x of s)r.push(await x.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}
 };
 return{sql,d};
}
test('restores backed-up prices and JSON, retains stock, orders and a recovery snapshot',async()=>{
 const {sql,d}=setup([{id:'coffee',price:26500},{id:'recipe',price:10000}]);
 const r=await restorePreviousPrices(d);assert.equal(r.updated,2);
 const c=sql.prepare('SELECT * FROM products WHERE id=?').get('coffee');
 assert.equal(c.price,26500);assert.equal(JSON.parse(c.data).price,26500);assert.equal(JSON.parse(c.data).description,'Keep this');assert.equal(c.available,0);
 assert.equal(sql.prepare('SELECT total FROM orders').get().total,100);
 assert.equal(JSON.parse(sql.prepare('SELECT data FROM settings WHERE id=?').get(r.safetyBackup).data)[0].price,100);
 await restorePreviousPrices(d);assert.equal(sql.prepare('SELECT price FROM products WHERE id=?').get('coffee').price,26500);
});
test('missing backup fails without changing prices',async()=>{const {sql,d}=setup();await assert.rejects(restorePreviousPrices(d),/No previous/);assert.equal(sql.prepare('SELECT price FROM products').get().price,100)});
test('invalid duplicate backup fails without making changes',async()=>{const {sql,d}=setup([{id:'coffee',price:26500},{id:'coffee',price:10000}]);await assert.rejects(restorePreviousPrices(d),/invalid/);assert.equal(sql.prepare('SELECT price FROM products').get().price,100)});
