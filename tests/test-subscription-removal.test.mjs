import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {setQATestPassRemoved} from '../lib/test-subscription-removal.ts';
test('sandbox removal is reversible and cannot remove live or unverified passes',async()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE payments(id TEXT,method TEXT,verified_by TEXT);CREATE TABLE coffee_subscriptions(id TEXT,plan_name TEXT,payment_id TEXT,revoked INTEGER DEFAULT 0);INSERT INTO payments VALUES('test','stripe_test','provider_verified_test'),('live','card','provider_verified'),('fake','stripe_test','manual');INSERT INTO coffee_subscriptions(id,plan_name,payment_id) VALUES('qa','QA menu redemption pass','test'),('normal','Monthly coffee pass','test'),('live','QA live','live'),('fake','QA unverified','fake');`);
 const db={prepare(q){return {bind(...v){return {async first(){return sql.prepare(q).get(...v)}}}}}};
 assert.equal(await setQATestPassRemoved(db,'qa',true),true);
 assert.equal(sql.prepare("SELECT revoked FROM coffee_subscriptions WHERE id='qa'").get().revoked,1);
 assert.equal(await setQATestPassRemoved(db,'normal',true),true);
 for(const id of ['live','fake','missing'])assert.equal(await setQATestPassRemoved(db,id,true),false);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM coffee_subscriptions WHERE revoked=1').get().n,2);
 assert.equal(await setQATestPassRemoved(db,'qa',false),true);
 assert.equal(sql.prepare("SELECT revoked FROM coffee_subscriptions WHERE id='qa'").get().revoked,0);
 sql.close();
});
