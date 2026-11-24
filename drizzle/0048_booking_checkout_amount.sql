-- Existing booking rows retain their original fee. New checkouts snapshot the
-- currently configured fee in checkout_amount.
ALTER TABLE table_booking_payments ADD COLUMN checkout_amount INTEGER
  CHECK(checkout_amount IS NULL OR checkout_amount >= 100);
