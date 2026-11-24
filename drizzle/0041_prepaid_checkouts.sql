CREATE TABLE prepaid_checkouts (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  fulfillment TEXT NOT NULL,
  total INTEGER NOT NULL CHECK (total > 0),
  currency TEXT NOT NULL CHECK (currency = 'INR'),
  contact TEXT NOT NULL,
  quote TEXT NOT NULL,
  cart_snapshot TEXT NOT NULL,
  stock_holds TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'creating' CHECK (state IN ('creating','ready','paid','expired')),
  provider_session_id TEXT UNIQUE,
  checkout_url TEXT,
  expires_at INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prepaid_checkout_expiry ON prepaid_checkouts(state, expires_at);

CREATE TRIGGER prepaid_checkout_intake_guard
BEFORE INSERT ON prepaid_checkouts
WHEN EXISTS (SELECT 1 FROM settings WHERE id = 'order-intake' AND data = 'false')
BEGIN
  SELECT RAISE(ABORT, 'CAFE_OFF_DUTY');
END;

DROP TRIGGER cafe_order_intake_guard;

CREATE TRIGGER cafe_order_intake_guard
BEFORE INSERT ON orders
WHEN NEW.checkout_payment_method IS NOT NULL
  AND EXISTS (SELECT 1 FROM settings WHERE id = 'order-intake' AND data = 'false')
  AND NOT (
    NEW.payment_status = 'paid' AND NEW.checkout_payment_method = 'stripe_test'
    AND EXISTS (SELECT 1 FROM prepaid_checkouts WHERE order_id = NEW.id AND state = 'ready')
  )
BEGIN
  SELECT RAISE(ABORT, 'CAFE_OFF_DUTY');
END;

CREATE TRIGGER prepaid_order_payment_guard
BEFORE INSERT ON orders
WHEN EXISTS (
  SELECT 1 FROM prepaid_checkouts checkout
  WHERE checkout.order_id = NEW.id
    AND (checkout.state != 'ready' OR NEW.payment_status != 'paid')
)
BEGIN
  SELECT RAISE(ABORT, 'PREPAID_CHECKOUT_NOT_READY');
END;

CREATE TRIGGER prepaid_checkout_release_stock
AFTER UPDATE OF state ON prepaid_checkouts
WHEN NEW.state = 'expired' AND OLD.state IN ('creating','ready')
BEGIN
  UPDATE products
  SET inventory = inventory + (
    SELECT json_extract(value, '$.quantity')
    FROM json_each(OLD.stock_holds)
    WHERE json_extract(value, '$.productId') = products.id
  )
  WHERE inventory IS NOT NULL AND id IN (
    SELECT json_extract(value, '$.productId') FROM json_each(OLD.stock_holds)
  );
END;
