CREATE TRIGGER prepaid_checkout_key_guard
BEFORE INSERT ON prepaid_checkouts
WHEN EXISTS (SELECT 1 FROM orders WHERE idempotency_key = NEW.idempotency_key)
BEGIN
  SELECT RAISE(ABORT, 'CHECKOUT_KEY_ALREADY_USED');
END;

CREATE TRIGGER order_checkout_key_guard
BEFORE INSERT ON orders
WHEN EXISTS (
  SELECT 1 FROM prepaid_checkouts
  WHERE idempotency_key = NEW.idempotency_key AND order_id != NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'CHECKOUT_KEY_ALREADY_USED');
END;
