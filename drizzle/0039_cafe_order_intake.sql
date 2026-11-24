CREATE TRIGGER cafe_order_intake_guard
BEFORE INSERT ON orders
WHEN NEW.checkout_payment_method IS NOT NULL
  AND EXISTS (SELECT 1 FROM settings WHERE id = 'order-intake' AND data = 'false')
BEGIN
  SELECT RAISE(ABORT, 'CAFE_OFF_DUTY');
END;
