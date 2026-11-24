CREATE TABLE subscription_item_codes (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL,
 subscription_id TEXT NOT NULL REFERENCES coffee_subscriptions(id),
 code_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 retired INTEGER NOT NULL DEFAULT 0,
 redeemed_order_id TEXT UNIQUE REFERENCES orders(id),
 UNIQUE(user_id,code_hash)
);
CREATE UNIQUE INDEX subscription_item_code_pending ON subscription_item_codes(subscription_id)
 WHERE retired=0 AND redeemed_order_id IS NULL;
CREATE INDEX subscription_item_codes_by_pass ON subscription_item_codes(user_id,subscription_id);

CREATE TABLE subscription_item_code_attempts (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL,
 attempted_at INTEGER NOT NULL
);
CREATE INDEX subscription_item_code_attempt_budget ON subscription_item_code_attempts(user_id,attempted_at);
