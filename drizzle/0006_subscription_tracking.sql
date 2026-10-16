-- No subscription is granted automatically. Only verified purchase records qualify.
CREATE TABLE coffee_subscriptions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id),
 plan_name TEXT NOT NULL DEFAULT '1 Week Subscription',
 total_credits INTEGER NOT NULL CHECK(total_credits = 8),
 starts_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_coffee_subscriptions_user ON coffee_subscriptions(user_id);
CREATE TABLE coffee_redemptions (
 id TEXT PRIMARY KEY,
 subscription_id TEXT NOT NULL REFERENCES coffee_subscriptions(id),
 order_id TEXT NOT NULL REFERENCES orders(id),
 credits INTEGER NOT NULL CHECK(credits BETWEEN 1 AND 8),
 reversed_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(subscription_id,order_id)
);
