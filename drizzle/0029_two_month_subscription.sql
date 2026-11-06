ALTER TABLE coffee_subscriptions ADD COLUMN extended_credits INTEGER NOT NULL DEFAULT 0 CHECK(extended_credits IN (0,52));
CREATE TABLE subscription_extended_purchases(user_id TEXT NOT NULL,plan_id TEXT NOT NULL CHECK(plan_id='two_month'),order_id TEXT PRIMARY KEY REFERENCES orders(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX subscription_extended_user ON subscription_extended_purchases(user_id,plan_id,created_at);
