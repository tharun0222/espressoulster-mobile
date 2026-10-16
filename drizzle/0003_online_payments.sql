CREATE TABLE IF NOT EXISTS payment_intents (
 id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
 user_id TEXT NOT NULL,
 provider_order_id TEXT UNIQUE,
 amount INTEGER NOT NULL CHECK(amount > 0),
 currency TEXT NOT NULL CHECK(currency = 'INR'),
 state TEXT NOT NULL DEFAULT 'creating' CHECK(state IN ('creating','ready','paid','review')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
