ALTER TABLE prepaid_checkouts ADD COLUMN mode TEXT NOT NULL DEFAULT 'test'
  CHECK(mode='test' OR (mode='live' AND provider='cashfree'));
ALTER TABLE table_booking_payments ADD COLUMN mode TEXT NOT NULL DEFAULT 'test'
  CHECK(mode='test' OR (mode='live' AND provider='cashfree'));

DROP TRIGGER cafe_order_intake_guard;
CREATE TRIGGER cafe_order_intake_guard
BEFORE INSERT ON orders
WHEN NEW.checkout_payment_method IS NOT NULL
  AND EXISTS (SELECT 1 FROM settings WHERE id='order-intake' AND data='false')
  AND NOT (
    NEW.payment_status='paid' AND EXISTS (
      SELECT 1 FROM prepaid_checkouts
      WHERE order_id=NEW.id AND state='ready'
        AND NEW.checkout_payment_method=CASE WHEN mode='live' THEN 'cashfree' ELSE provider || '_test' END
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'CAFE_OFF_DUTY');
END;
