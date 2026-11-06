-- New renewal history leaves every existing purchase and entitlement unchanged.
CREATE TABLE subscription_renewal_purchases (
 user_id TEXT NOT NULL,
 plan_id TEXT NOT NULL CHECK(plan_id IN ('weekly','monthly')),
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_subscription_renewal_user_plan ON subscription_renewal_purchases(user_id,plan_id,created_at);
