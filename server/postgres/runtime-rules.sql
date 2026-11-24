-- PostgreSQL ports of the 19 active triggers and two views in the SQLite schema.
-- Keep these business rules aligned with SQLite until the live switch is approved.
CREATE VIEW cafe_dine_in_requests AS
  SELECT NULL::text AS table_id,NULL::text AS customer_id,NULL::text AS kind,NULL::text AS source_id WHERE false;
CREATE VIEW live_cafe_table_schedule AS
  SELECT * FROM cafe_table_schedule
  WHERE closed_at IS NULL AND (expires_at IS NULL OR expires_at>cafe_epoch())
    AND (kind='visit' OR end_at>cafe_epoch());

CREATE FUNCTION booking_confirmation_notice_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT COALESCE((NEW.status='confirmed' AND (OLD.status!='confirmed' OR OLD.table_ids!=NEW.table_ids)), false) THEN RETURN NEW; END IF;
 INSERT INTO booking_notifications(id,user_id,booking_id,data) VALUES(replace(gen_random_uuid()::text, '-', ''),NEW.user_id,NEW.id,jsonb_build_object('tables',NEW.table_ids::jsonb,'start',NEW.start_at,'end',NEW.end_at,'updated',(OLD.status='confirmed')::int)::text);
 RETURN NEW;
END;
$$;
CREATE TRIGGER booking_confirmation_notice AFTER UPDATE OF status,table_ids ON table_bookings
  FOR EACH ROW EXECUTE FUNCTION booking_confirmation_notice_fn();

CREATE FUNCTION booking_range_insert_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM profiles WHERE id=NEW.user_id FOR UPDATE;
 IF NEW.start_at IS NULL OR NEW.end_at IS NULL OR NEW.end_at<=NEW.start_at THEN RAISE EXCEPTION USING MESSAGE = 'Invalid booking interval', ERRCODE = '23514'; END IF;
 IF EXISTS(SELECT 1 FROM table_bookings b WHERE b.user_id=NEW.user_id AND b.status IN ('pending','confirmed') AND b.start_at<NEW.end_at AND NEW.start_at<b.end_at) THEN RAISE EXCEPTION USING MESSAGE = 'You already have an overlapping booking', ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER booking_range_insert BEFORE INSERT ON table_bookings
  FOR EACH ROW EXECUTE FUNCTION booking_range_insert_fn();

CREATE FUNCTION booking_table_guard_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT COALESCE((NEW.status='confirmed'), false) THEN RETURN NEW; END IF;
 IF NOT cafe_json_valid(NEW.table_ids) THEN RAISE EXCEPTION USING MESSAGE = 'Invalid table selection', ERRCODE = '23514'; END IF;
 IF cafe_json_type(NEW.table_ids)<>'array' THEN RAISE EXCEPTION USING MESSAGE = 'Invalid table selection', ERRCODE = '23514'; END IF;
 IF jsonb_array_length(NEW.table_ids::jsonb)=0 THEN RAISE EXCEPTION USING MESSAGE = 'Select tables before confirming', ERRCODE = '23514'; END IF;
 IF (SELECT COUNT(*) FROM cafe_json_each(NEW.table_ids)) != (SELECT COUNT(DISTINCT value) FROM cafe_json_each(NEW.table_ids)) THEN RAISE EXCEPTION USING MESSAGE = 'Duplicate table selection', ERRCODE = '23514'; END IF;
 IF EXISTS(SELECT 1 FROM cafe_json_each(NEW.table_ids) j LEFT JOIN cafe_tables t ON t.id=j.value WHERE t.id IS NULL OR t.enabled!=1) THEN RAISE EXCEPTION USING MESSAGE = 'A selected table is unavailable', ERRCODE = '23514'; END IF;
 IF (SELECT COALESCE(SUM(t.seats),0) FROM cafe_tables t JOIN cafe_json_each(NEW.table_ids) j ON j.value=t.id)<NEW.guests THEN RAISE EXCEPTION USING MESSAGE = 'Not enough seats for this booking', ERRCODE = '23514'; END IF;
 IF EXISTS(SELECT 1 FROM table_bookings b CROSS JOIN LATERAL cafe_json_each(b.table_ids) oldtable JOIN cafe_json_each(NEW.table_ids) newtable ON newtable.value=oldtable.value WHERE b.id!=NEW.id AND b.status='confirmed' AND b.start_at<NEW.end_at AND NEW.start_at<b.end_at) THEN RAISE EXCEPTION USING MESSAGE = 'A selected table is already booked for this slot', ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER booking_table_guard BEFORE UPDATE OF status,table_ids,start_at,end_at ON table_bookings
  FOR EACH ROW EXECUTE FUNCTION booking_table_guard_fn();

CREATE FUNCTION cafe_order_intake_guard_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT COALESCE((NEW.checkout_payment_method IS NOT NULL
  AND EXISTS (SELECT 1 FROM settings WHERE id='order-intake' AND data='false')
  AND NOT (
    NEW.payment_status='paid' AND EXISTS (
      SELECT 1 FROM prepaid_checkouts
      WHERE order_id=NEW.id AND state='ready'
        AND NEW.checkout_payment_method=CASE WHEN mode='live' THEN 'cashfree' ELSE provider || '_test' END
    )
  )), false) THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING MESSAGE = 'CAFE_OFF_DUTY', ERRCODE = '23514';
 RETURN NEW;
END;
$$;
CREATE TRIGGER cafe_order_intake_guard BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION cafe_order_intake_guard_fn();

CREATE FUNCTION cafe_schedule_allocate_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Serialize reservations for this physical table even if called directly.
  PERFORM 1 FROM cafe_tables WHERE id=NEW.table_id FOR UPDATE;
 UPDATE cafe_table_schedule SET closed_at=cafe_epoch() WHERE table_id=NEW.table_id AND closed_at IS NULL
   AND kind<>'visit' AND (end_at<=cafe_epoch() OR expires_at<=cafe_epoch());
 IF NOT EXISTS(SELECT 1 FROM cafe_tables WHERE id=NEW.table_id AND enabled=1) THEN RAISE EXCEPTION USING MESSAGE = 'Cafe table unavailable', ERRCODE = '23514'; END IF;
 IF EXISTS(
   SELECT 1 FROM live_cafe_table_schedule s WHERE s.table_id=NEW.table_id
    AND NOT (NEW.booking_id IS NOT NULL AND s.booking_id IS NOT DISTINCT FROM NEW.booking_id
             AND ((s.kind='booking' AND NEW.kind IN ('scan','visit'))
               OR (NEW.kind='booking' AND s.kind IN ('scan','visit'))))
    AND NOT (s.kind='scan' AND NEW.kind='visit' AND s.customer_id=NEW.customer_id)
    AND ((s.start_at<NEW.end_at AND s.end_at>NEW.start_at)
         OR (s.kind IN ('scan','visit') AND NEW.kind IN ('scan','visit')))
 ) THEN RAISE EXCEPTION USING MESSAGE = 'Cafe table conflict', ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER cafe_schedule_allocate BEFORE INSERT ON cafe_table_schedule
  FOR EACH ROW EXECUTE FUNCTION cafe_schedule_allocate_fn();

CREATE FUNCTION cafe_schedule_booking_confirm_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT COALESCE((NEW.status='confirmed' AND (OLD.status<>NEW.status OR OLD.table_ids<>NEW.table_ids)), false) THEN RETURN NEW; END IF;
 IF EXISTS(
   SELECT 1 FROM live_cafe_table_schedule v WHERE v.booking_id=NEW.id AND v.kind='visit'
     AND NOT EXISTS(SELECT 1 FROM cafe_json_each(NEW.table_ids) selected WHERE selected.value=v.table_id)
 ) THEN RAISE EXCEPTION USING MESSAGE = 'Cafe table visit in progress', ERRCODE = '23514'; END IF;
 UPDATE cafe_table_schedule SET closed_at=cafe_epoch()
   WHERE source_id=NEW.id AND kind IN ('booking','hold') AND closed_at IS NULL;
 INSERT INTO cafe_table_schedule(table_id,customer_id,kind,source_id,booking_id,start_at,end_at)
   SELECT value,NEW.user_id,'booking',NEW.id,NEW.id,NEW.start_at,NEW.end_at FROM cafe_json_each(NEW.table_ids);
 RETURN NEW;
END;
$$;
CREATE TRIGGER cafe_schedule_booking_confirm AFTER UPDATE OF status,table_ids ON table_bookings
  FOR EACH ROW EXECUTE FUNCTION cafe_schedule_booking_confirm_fn();

CREATE FUNCTION cafe_schedule_booking_release_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT COALESCE((NEW.status IN ('cancelled','declined') AND OLD.status<>NEW.status), false) THEN RETURN NEW; END IF;
 UPDATE cafe_table_schedule SET closed_at=cafe_epoch()
   WHERE source_id=NEW.id AND kind IN ('booking','hold') AND closed_at IS NULL;
 RETURN NEW;
END;
$$;
CREATE TRIGGER cafe_schedule_booking_release AFTER UPDATE OF status ON table_bookings
  FOR EACH ROW EXECUTE FUNCTION cafe_schedule_booking_release_fn();

CREATE FUNCTION cafe_schedule_checkout_release_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT COALESCE((NEW.state IN ('expired','review') AND OLD.state<>NEW.state), false) THEN RETURN NEW; END IF;
 UPDATE cafe_table_schedule SET closed_at=cafe_epoch()
   WHERE source_id=NEW.id AND kind='hold' AND closed_at IS NULL;
 RETURN NEW;
END;
$$;
CREATE TRIGGER cafe_schedule_checkout_release AFTER UPDATE OF state ON table_booking_payments
  FOR EACH ROW EXECUTE FUNCTION cafe_schedule_checkout_release_fn();

CREATE FUNCTION cafe_schedule_dine_in_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind NOT IN ('scan','visit') THEN RAISE EXCEPTION USING MESSAGE = 'Cafe table unavailable', ERRCODE = '23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM cafe_tables WHERE id=NEW.table_id AND enabled=1) THEN RAISE EXCEPTION USING MESSAGE = 'Cafe table unavailable', ERRCODE = '23514'; END IF;

 -- Validate a scan without allocating anything. Orders and staff assignments
 -- below still claim their table in the same transaction that saves the order.
 IF NEW.kind='scan'
   AND NOT EXISTS(SELECT 1 FROM live_cafe_table_schedule own
     WHERE own.table_id=NEW.table_id AND own.customer_id=NEW.customer_id AND own.kind='visit')
   AND EXISTS(
     SELECT 1 FROM live_cafe_table_schedule s WHERE s.table_id=NEW.table_id
       AND (
         (s.kind='visit' AND s.customer_id<>NEW.customer_id)
         OR (s.kind IN ('booking','hold') AND s.end_at>cafe_epoch()
           AND NOT(s.kind='booking' AND s.customer_id=NEW.customer_id AND s.start_at<=cafe_epoch())
           AND s.start_at<COALESCE(
             (SELECT b.end_at FROM live_cafe_table_schedule b
               WHERE b.table_id=NEW.table_id AND b.customer_id=NEW.customer_id
                 AND b.kind='booking' AND b.start_at<=cafe_epoch() ORDER BY b.end_at LIMIT 1),
             cafe_epoch()+5400))
       )
   ) THEN RAISE EXCEPTION USING MESSAGE = 'Cafe table conflict', ERRCODE = '23514'; END IF;

 INSERT INTO cafe_table_schedule(table_id,customer_id,kind,source_id,booking_id,start_at,end_at)
 SELECT NEW.table_id,NEW.customer_id,'visit',NEW.source_id,b.booking_id,cafe_epoch(),
   COALESCE(b.end_at,cafe_epoch()+5400)
 FROM (SELECT 1) AS origin
 LEFT JOIN live_cafe_table_schedule b ON b.table_id=NEW.table_id AND b.customer_id=NEW.customer_id
   AND b.kind='booking' AND b.start_at<=cafe_epoch()
 WHERE NEW.kind='visit' AND NOT EXISTS(
   SELECT 1 FROM live_cafe_table_schedule v WHERE v.table_id=NEW.table_id
      AND v.customer_id=NEW.customer_id AND v.kind='visit'
 );
 RETURN NEW;
END;
$$;
CREATE TRIGGER cafe_schedule_dine_in INSTEAD OF INSERT ON cafe_dine_in_requests
  FOR EACH ROW EXECUTE FUNCTION cafe_schedule_dine_in_fn();

CREATE FUNCTION cafe_schedule_disable_table_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT COALESCE((NEW.enabled=0 AND EXISTS(SELECT 1 FROM live_cafe_table_schedule WHERE table_id=NEW.id)), false) THEN RETURN NEW; END IF;
 RAISE EXCEPTION USING MESSAGE = 'Cafe table is allocated', ERRCODE = '23514';
 RETURN NEW;
END;
$$;
CREATE TRIGGER cafe_schedule_disable_table BEFORE UPDATE OF enabled ON cafe_tables
  FOR EACH ROW EXECUTE FUNCTION cafe_schedule_disable_table_fn();

CREATE FUNCTION cafe_schedule_prepaid_qr_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT COALESCE((NEW.fulfillment='dine_in' AND COALESCE(cafe_json_text(NEW.contact,'$.table'),'')<>''), false) THEN RETURN NEW; END IF;
 INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind,source_id)
 VALUES(cafe_json_text(NEW.contact,'$.table'),NEW.user_id,'scan',NEW.id);
 RETURN NEW;
END;
$$;
CREATE TRIGGER cafe_schedule_prepaid_qr AFTER INSERT ON prepaid_checkouts
  FOR EACH ROW EXECUTE FUNCTION cafe_schedule_prepaid_qr_fn();

CREATE FUNCTION cafe_schedule_qr_order_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT COALESCE((NEW.fulfillment='dine_in' AND COALESCE(cafe_json_text(NEW.contact,'$.table'),'')<>''), false) THEN RETURN NEW; END IF;
 INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind,source_id)
 VALUES(cafe_json_text(NEW.contact,'$.table'),NEW.user_id,'visit',NEW.id);
 RETURN NEW;
END;
$$;
CREATE TRIGGER cafe_schedule_qr_order AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION cafe_schedule_qr_order_fn();

CREATE FUNCTION cafe_schedule_staff_assignment_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT COALESCE((NEW.fulfillment='dine_in' AND NEW.status NOT IN ('cancelled','completed')
 AND COALESCE(cafe_json_text(NEW.contact,'$.table'),'')<>''
 AND (cafe_json_text(OLD.contact,'$.table') IS DISTINCT FROM cafe_json_text(NEW.contact,'$.table')
      OR (OLD.status='pending' AND NEW.status='confirmed'))), false) THEN RETURN NEW; END IF;
 INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind,source_id)
 VALUES(cafe_json_text(NEW.contact,'$.table'),NEW.user_id,'visit',NEW.id);
 RETURN NEW;
END;
$$;
CREATE TRIGGER cafe_schedule_staff_assignment AFTER UPDATE OF contact,status ON orders
  FOR EACH ROW EXECUTE FUNCTION cafe_schedule_staff_assignment_fn();

CREATE FUNCTION cafe_table_disable_guard_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT COALESCE((NEW.enabled=0), false) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM table_bookings b JOIN cafe_json_each(b.table_ids) j ON j.value=NEW.id WHERE b.status='confirmed' AND b.end_at>cafe_epoch()) THEN RAISE EXCEPTION USING MESSAGE = 'Table has upcoming bookings', ERRCODE = '23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER cafe_table_disable_guard BEFORE UPDATE OF enabled ON cafe_tables
  FOR EACH ROW EXECUTE FUNCTION cafe_table_disable_guard_fn();

CREATE FUNCTION order_checkout_key_guard_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT COALESCE((EXISTS (
  SELECT 1 FROM prepaid_checkouts
  WHERE idempotency_key = NEW.idempotency_key AND order_id != NEW.id
)), false) THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING MESSAGE = 'CHECKOUT_KEY_ALREADY_USED', ERRCODE = '23514';
 RETURN NEW;
END;
$$;
CREATE TRIGGER order_checkout_key_guard BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION order_checkout_key_guard_fn();

CREATE FUNCTION prepaid_checkout_intake_guard_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT COALESCE((EXISTS (SELECT 1 FROM settings WHERE id = 'order-intake' AND data = 'false')), false) THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING MESSAGE = 'CAFE_OFF_DUTY', ERRCODE = '23514';
 RETURN NEW;
END;
$$;
CREATE TRIGGER prepaid_checkout_intake_guard BEFORE INSERT ON prepaid_checkouts
  FOR EACH ROW EXECUTE FUNCTION prepaid_checkout_intake_guard_fn();

CREATE FUNCTION prepaid_checkout_key_guard_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT COALESCE((EXISTS (SELECT 1 FROM orders WHERE idempotency_key = NEW.idempotency_key)), false) THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING MESSAGE = 'CHECKOUT_KEY_ALREADY_USED', ERRCODE = '23514';
 RETURN NEW;
END;
$$;
CREATE TRIGGER prepaid_checkout_key_guard BEFORE INSERT ON prepaid_checkouts
  FOR EACH ROW EXECUTE FUNCTION prepaid_checkout_key_guard_fn();

CREATE FUNCTION prepaid_checkout_release_stock_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT COALESCE((NEW.state = 'expired' AND OLD.state IN ('creating','ready')), false) THEN RETURN NEW; END IF;
  UPDATE products
  SET inventory = inventory + (
    SELECT cafe_json_number(value, '$.quantity')
    FROM cafe_json_each(OLD.stock_holds)
    WHERE cafe_json_text(value, '$.productId') = products.id
  )
  WHERE inventory IS NOT NULL AND id IN (
    SELECT cafe_json_text(value, '$.productId') FROM cafe_json_each(OLD.stock_holds)
  );
 RETURN NEW;
END;
$$;
CREATE TRIGGER prepaid_checkout_release_stock AFTER UPDATE OF state ON prepaid_checkouts
  FOR EACH ROW EXECUTE FUNCTION prepaid_checkout_release_stock_fn();

CREATE FUNCTION prepaid_order_payment_guard_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT COALESCE((EXISTS (
  SELECT 1 FROM prepaid_checkouts checkout
  WHERE checkout.order_id = NEW.id
    AND (checkout.state != 'ready' OR NEW.payment_status != 'paid')
)), false) THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING MESSAGE = 'PREPAID_CHECKOUT_NOT_READY', ERRCODE = '23514';
 RETURN NEW;
END;
$$;
CREATE TRIGGER prepaid_order_payment_guard BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION prepaid_order_payment_guard_fn();
