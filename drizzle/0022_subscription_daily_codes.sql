CREATE TABLE subscription_daily_codes (
 user_id TEXT NOT NULL,
 day TEXT NOT NULL,
 subscription_id TEXT NOT NULL REFERENCES coffee_subscriptions(id),
 code_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 redeemed_order_id TEXT UNIQUE REFERENCES orders(id),
 PRIMARY KEY(user_id,day)
);
CREATE TABLE subscription_code_attempts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,day TEXT NOT NULL);
CREATE INDEX subscription_code_attempt_budget ON subscription_code_attempts(user_id,day);
-- A failed assertion aborts the entire D1 batch, including its test receipt.
CREATE TABLE subscription_redemption_checks (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 valid INTEGER NOT NULL CHECK(valid=1)
);
