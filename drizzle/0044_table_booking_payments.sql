CREATE TABLE table_booking_payments (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES profiles(id),
 booking TEXT NOT NULL,
 start_at INTEGER NOT NULL,
 end_at INTEGER NOT NULL,
 amount INTEGER NOT NULL CHECK(amount=10000),
 state TEXT NOT NULL DEFAULT 'creating' CHECK(state IN ('creating','ready','paid','expired','review')),
 provider_session_id TEXT UNIQUE,
 checkout_url TEXT,
 payment_reference TEXT UNIQUE,
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX table_booking_payments_user ON table_booking_payments(user_id,state,start_at,end_at);
