-- Keep earlier provider records distinguishable; never reinterpret an old intent.
ALTER TABLE payment_intents ADD COLUMN provider TEXT NOT NULL DEFAULT 'razorpay';
ALTER TABLE payment_intents ADD COLUMN mode TEXT NOT NULL DEFAULT 'test';
ALTER TABLE payment_intents ADD COLUMN merchant_order_id TEXT;
ALTER TABLE payment_intents ADD COLUMN checkout_url TEXT;
ALTER TABLE payment_intents ADD COLUMN expires_at INTEGER;
CREATE UNIQUE INDEX idx_payment_intents_merchant ON payment_intents(merchant_order_id);
