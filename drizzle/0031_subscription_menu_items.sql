ALTER TABLE subscription_catalog ADD COLUMN item_scope TEXT NOT NULL DEFAULT 'coffee' CHECK(item_scope IN ('coffee','menu'));
ALTER TABLE subscription_catalog ADD COLUMN included_items TEXT NOT NULL DEFAULT '[]';
ALTER TABLE subscription_purchase_snapshots ADD COLUMN item_scope TEXT NOT NULL DEFAULT 'coffee';
ALTER TABLE subscription_purchase_snapshots ADD COLUMN included_items TEXT NOT NULL DEFAULT '[]';
ALTER TABLE coffee_subscriptions ADD COLUMN item_scope TEXT NOT NULL DEFAULT 'coffee';
ALTER TABLE coffee_subscriptions ADD COLUMN included_items TEXT NOT NULL DEFAULT '[]';
