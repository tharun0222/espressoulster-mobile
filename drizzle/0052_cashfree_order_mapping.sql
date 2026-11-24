ALTER TABLE prepaid_checkouts ADD COLUMN cashfree_order_id TEXT;
ALTER TABLE payment_intents ADD COLUMN cashfree_order_id TEXT;
ALTER TABLE table_booking_payments ADD COLUMN cashfree_order_id TEXT;
CREATE UNIQUE INDEX prepaid_cashfree_order ON prepaid_checkouts(cashfree_order_id) WHERE cashfree_order_id IS NOT NULL;
CREATE UNIQUE INDEX intent_cashfree_order ON payment_intents(cashfree_order_id) WHERE cashfree_order_id IS NOT NULL;
CREATE UNIQUE INDEX booking_cashfree_order ON table_booking_payments(cashfree_order_id) WHERE cashfree_order_id IS NOT NULL;

CREATE TABLE cashfree_webhook_receipts (
  mode TEXT NOT NULL CHECK(mode IN ('test','live')),
  payment_id TEXT NOT NULL,
  cashfree_order_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount>0),
  currency TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(mode,payment_id)
);
