CREATE TABLE admin_order_chat_reads (
  staff_id TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  last_message_id INTEGER NOT NULL DEFAULT 0 CHECK(last_message_id >= 0),
  PRIMARY KEY(staff_id, order_id)
);
CREATE INDEX idx_order_chat_customer_unread ON order_chat_messages(sender_role, order_id, id);
