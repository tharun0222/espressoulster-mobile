CREATE TABLE IF NOT EXISTS paypal_test_checkouts (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES orders(id), user_id TEXT NOT NULL,
 client_id TEXT NOT NULL, provider_order_id TEXT UNIQUE, capture_id TEXT UNIQUE,
 state TEXT NOT NULL DEFAULT 'creating' CHECK(state IN ('creating','ready','verified')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, verified_at TEXT
);
