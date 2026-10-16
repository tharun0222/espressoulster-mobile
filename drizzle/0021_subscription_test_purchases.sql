-- Isolated sandbox purchase mapping. No Petpooja records are changed.
CREATE TABLE subscription_test_purchases (
 user_id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
