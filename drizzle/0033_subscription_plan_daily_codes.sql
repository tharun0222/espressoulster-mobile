CREATE TABLE subscription_plan_daily_codes (
 user_id TEXT NOT NULL,
 day TEXT NOT NULL,
 subscription_id TEXT NOT NULL REFERENCES coffee_subscriptions(id),
 code_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 redeemed_order_id TEXT UNIQUE REFERENCES orders(id),
 PRIMARY KEY(user_id,day,subscription_id),
 UNIQUE(user_id,day,code_hash)
);
INSERT INTO subscription_plan_daily_codes SELECT * FROM subscription_daily_codes;
DROP TABLE subscription_daily_codes;
ALTER TABLE subscription_plan_daily_codes RENAME TO subscription_daily_codes;
