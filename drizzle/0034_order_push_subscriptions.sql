CREATE TABLE IF NOT EXISTS order_push_subscriptions (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL,
 subscription TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS order_push_owner ON order_push_subscriptions(user_id);
