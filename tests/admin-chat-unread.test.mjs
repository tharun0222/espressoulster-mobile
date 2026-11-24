import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openDatabase} from '../server/database.mjs';
import {adminChatUnread,markAdminChatRead} from '../lib/admin-chat-unread.ts';

test('unread messages are customer-only, per-order and per-staff; read cursors cannot hide concurrent or foreign messages',async()=>{
 const d=openDatabase(':memory:');
 try{
  d.sql.exec("CREATE TABLE orders(id TEXT PRIMARY KEY,order_number TEXT); INSERT INTO orders VALUES('CH-11111111','19112026-001'),('CH-22222222','19112026-002');");
  for(const file of ['0037_order_chat.sql','0050_admin_chat_reads.sql'])d.sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  function message(order,role,id){d.sql.prepare('INSERT INTO order_chat_messages(order_id,sender_id,sender_role,request_id,message) VALUES(?,?,?,?,?)').run(order,role,role,id,'Message '+id);}
  message('CH-11111111','customer','one');message('CH-11111111','staff','reply');message('CH-22222222','customer','two');
  let unread=await adminChatUnread(d,'operator');assert.equal(unread.total,2);assert.equal(unread.orders.length,2);
  assert.equal(await markAdminChatRead(d,'operator','CH-11111111',3),false,'another order cannot be marked through this thread');
  assert.equal(await markAdminChatRead(d,'operator','CH-11111111',2),false,'staff replies cannot clear customer messages');
  assert.equal(await markAdminChatRead(d,'operator','CH-11111111',Number.MAX_SAFE_INTEGER),false);
  message('CH-11111111','customer','arrived-during-read');
  assert.equal(await markAdminChatRead(d,'operator','CH-11111111',1),true);
  unread=await adminChatUnread(d,'operator');assert.equal(unread.total,2);assert.equal(unread.orders.find(o=>o.orderId==='CH-11111111').unread,1);
  assert.equal((await adminChatUnread(d,'other-staff')).total,3);
  await markAdminChatRead(d,'operator','CH-11111111',4);await markAdminChatRead(d,'operator','CH-11111111',1);
  assert.equal((await adminChatUnread(d,'operator')).total,1,'late acknowledgements never move the cursor backwards');
  await markAdminChatRead(d,'operator','CH-22222222',3);assert.deepEqual(await adminChatUnread(d,'operator'),{total:0,orders:[]});
 }finally{d.close();}
});
