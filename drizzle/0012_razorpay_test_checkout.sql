-- Separate Razorpay sandbox results from real payments and order settlement.
CREATE TABLE razorpay_test_checkouts (
 id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
 user_id TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount>0),
 currency TEXT NOT NULL CHECK(currency='INR'),
 key_id TEXT NOT NULL CHECK(key_id LIKE 'rzp_test_%'),
 provider_order_id TEXT UNIQUE,
 payment_id TEXT UNIQUE,
 state TEXT NOT NULL DEFAULT 'creating' CHECK(state IN ('creating','ready','verified')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 verified_at TEXT
);
