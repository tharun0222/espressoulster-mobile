-- Preserve existing eight-credit passes; monthly plans add 26 credits.
ALTER TABLE coffee_subscriptions ADD COLUMN bonus_credits INTEGER NOT NULL DEFAULT 0 CHECK(bonus_credits IN (0,26));
ALTER TABLE coffee_subscriptions ADD COLUMN plan_id TEXT NOT NULL DEFAULT 'weekly';
CREATE TABLE subscription_plan_test_purchases (
 user_id TEXT NOT NULL,
 plan_id TEXT NOT NULL CHECK(plan_id IN ('weekly','monthly')),
 order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,plan_id)
);
