CREATE TABLE cafe_table_schedule (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  table_id TEXT NOT NULL REFERENCES cafe_tables(id),
  customer_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('booking','hold','scan','visit')),
  source_id TEXT,
  booking_id TEXT,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL CHECK(end_at>start_at),
  expires_at INTEGER,
  closed_at INTEGER
);
CREATE INDEX cafe_schedule_table ON cafe_table_schedule(table_id,start_at,end_at) WHERE closed_at IS NULL;
CREATE INDEX cafe_schedule_source ON cafe_table_schedule(source_id,kind) WHERE closed_at IS NULL;
CREATE INDEX cafe_schedule_customer ON cafe_table_schedule(customer_id,kind) WHERE closed_at IS NULL;

CREATE VIEW live_cafe_table_schedule AS
 SELECT * FROM cafe_table_schedule
 WHERE closed_at IS NULL AND (expires_at IS NULL OR expires_at>unixepoch())
   AND (kind='visit' OR end_at>unixepoch());

CREATE TRIGGER cafe_schedule_allocate BEFORE INSERT ON cafe_table_schedule
BEGIN
 UPDATE cafe_table_schedule SET closed_at=unixepoch() WHERE table_id=NEW.table_id AND closed_at IS NULL
   AND kind<>'visit' AND (end_at<=unixepoch() OR expires_at<=unixepoch());
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM cafe_tables WHERE id=NEW.table_id AND enabled=1)
   THEN RAISE(ABORT,'Cafe table unavailable') END;
 SELECT CASE WHEN EXISTS(
   SELECT 1 FROM live_cafe_table_schedule s WHERE s.table_id=NEW.table_id
    AND NOT (NEW.booking_id IS NOT NULL AND s.booking_id IS NEW.booking_id
             AND ((s.kind='booking' AND NEW.kind IN ('scan','visit'))
               OR (NEW.kind='booking' AND s.kind IN ('scan','visit'))))
    AND NOT (s.kind='scan' AND NEW.kind='visit' AND s.customer_id=NEW.customer_id)
    AND ((s.start_at<NEW.end_at AND s.end_at>NEW.start_at)
         OR (s.kind IN ('scan','visit') AND NEW.kind IN ('scan','visit')))
 ) THEN RAISE(ABORT,'Cafe table conflict') END;
END;

-- Preserve confirmed reservations before importing walk-in orders.
INSERT INTO cafe_table_schedule(table_id,customer_id,kind,source_id,booking_id,start_at,end_at)
 SELECT assigned.value,b.user_id,'booking',b.id,b.id,b.start_at,b.end_at
 FROM table_bookings b JOIN json_each(b.table_ids) assigned JOIN cafe_tables t ON t.id=assigned.value AND t.enabled=1
 WHERE b.status='confirmed' AND b.end_at>unixepoch();

-- Import the earliest ongoing party for each table. Keep conflicting legacy orders
-- intact so staff can review or reassign them without rewriting order history.
INSERT INTO cafe_table_schedule(table_id,customer_id,kind,source_id,booking_id,start_at,end_at)
 WITH ranked AS (
   SELECT o.*,json_extract(contact,'$.table') AS table_id,
     row_number() OVER(PARTITION BY json_extract(contact,'$.table') ORDER BY created_at,id) AS position
   FROM orders o WHERE fulfillment='dine_in' AND status IN ('confirmed','preparing','ready')
 )
 SELECT t.id,r.user_id,'visit',r.id,b.booking_id,unixepoch(),COALESCE(b.end_at,unixepoch()+5400)
 FROM ranked r JOIN cafe_tables t ON t.id=r.table_id AND t.enabled=1
 LEFT JOIN live_cafe_table_schedule b ON b.table_id=t.id AND b.customer_id=r.user_id AND b.kind='booking'
   AND b.start_at<=unixepoch()
 WHERE r.position=1 AND NOT EXISTS (
   SELECT 1 FROM live_cafe_table_schedule s WHERE s.table_id=t.id AND s.start_at<COALESCE(b.end_at,unixepoch()+5400)
     AND (b.id IS NULL OR s.id<>b.id)
 );

-- Staff confirmation and reassignment publish every allocated table together.
CREATE TRIGGER cafe_schedule_booking_confirm AFTER UPDATE OF status,table_ids ON table_bookings
WHEN NEW.status='confirmed' AND (OLD.status<>NEW.status OR OLD.table_ids<>NEW.table_ids)
BEGIN
 SELECT CASE WHEN EXISTS(
   SELECT 1 FROM live_cafe_table_schedule v WHERE v.booking_id=NEW.id AND v.kind='visit'
     AND NOT EXISTS(SELECT 1 FROM json_each(NEW.table_ids) selected WHERE selected.value=v.table_id)
 ) THEN RAISE(ABORT,'Cafe table visit in progress') END;
 UPDATE cafe_table_schedule SET closed_at=unixepoch()
   WHERE source_id=NEW.id AND kind IN ('booking','hold') AND closed_at IS NULL;
 INSERT INTO cafe_table_schedule(table_id,customer_id,kind,source_id,booking_id,start_at,end_at)
   SELECT value,NEW.user_id,'booking',NEW.id,NEW.id,NEW.start_at,NEW.end_at FROM json_each(NEW.table_ids);
END;

CREATE TRIGGER cafe_schedule_booking_release AFTER UPDATE OF status ON table_bookings
WHEN NEW.status IN ('cancelled','declined') AND OLD.status<>NEW.status
BEGIN
 UPDATE cafe_table_schedule SET closed_at=unixepoch()
   WHERE source_id=NEW.id AND kind IN ('booking','hold') AND closed_at IS NULL;
END;

CREATE TRIGGER cafe_schedule_checkout_release AFTER UPDATE OF state ON table_booking_payments
WHEN NEW.state IN ('expired','review') AND OLD.state<>NEW.state
BEGIN
 UPDATE cafe_table_schedule SET closed_at=unixepoch()
   WHERE source_id=NEW.id AND kind='hold' AND closed_at IS NULL;
END;

CREATE TRIGGER cafe_schedule_disable_table BEFORE UPDATE OF enabled ON cafe_tables
WHEN NEW.enabled=0 AND EXISTS(SELECT 1 FROM live_cafe_table_schedule WHERE table_id=NEW.id)
BEGIN
 SELECT RAISE(ABORT,'Cafe table is allocated');
END;

-- Shared write entry point for camera QR scans, QR checkout and staff assignments.
CREATE VIEW cafe_dine_in_requests AS
 SELECT NULL AS table_id,NULL AS customer_id,NULL AS kind,NULL AS source_id WHERE 0;

CREATE TRIGGER cafe_schedule_dine_in INSTEAD OF INSERT ON cafe_dine_in_requests
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM cafe_tables WHERE id=NEW.table_id AND enabled=1)
   THEN RAISE(ABORT,'Cafe table unavailable') END;
 -- A successful scan at a different table replaces the previous temporary scan.
 UPDATE cafe_table_schedule SET closed_at=unixepoch() WHERE NEW.kind='scan' AND kind='scan'
   AND customer_id=NEW.customer_id AND table_id<>NEW.table_id AND closed_at IS NULL;
 INSERT INTO cafe_table_schedule(table_id,customer_id,kind,source_id,booking_id,start_at,end_at,expires_at)
 SELECT NEW.table_id,NEW.customer_id,NEW.kind,NEW.source_id,b.booking_id,unixepoch(),
   COALESCE(scan.end_at,b.end_at,unixepoch()+5400),
   CASE WHEN NEW.kind='scan' THEN unixepoch()+600 END
 FROM (SELECT 1)
 LEFT JOIN live_cafe_table_schedule b ON b.table_id=NEW.table_id AND b.customer_id=NEW.customer_id
   AND b.kind='booking' AND b.start_at<=unixepoch()
 LEFT JOIN live_cafe_table_schedule scan ON scan.table_id=NEW.table_id AND scan.customer_id=NEW.customer_id
   AND scan.kind='scan'
 WHERE NOT EXISTS(
   SELECT 1 FROM live_cafe_table_schedule v WHERE v.table_id=NEW.table_id AND v.customer_id=NEW.customer_id
      AND (v.kind='visit' OR (NEW.kind='scan' AND v.kind='scan'))
 );
END;

CREATE TRIGGER cafe_schedule_scan_to_visit AFTER INSERT ON cafe_table_schedule WHEN NEW.kind='visit'
BEGIN
 UPDATE cafe_table_schedule SET closed_at=unixepoch() WHERE kind='scan'
   AND table_id=NEW.table_id AND customer_id=NEW.customer_id AND closed_at IS NULL;
END;

CREATE TRIGGER cafe_schedule_qr_order AFTER INSERT ON orders
WHEN NEW.fulfillment='dine_in' AND COALESCE(json_extract(NEW.contact,'$.table'),'')<>''
BEGIN
 INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind,source_id)
 VALUES(json_extract(NEW.contact,'$.table'),NEW.user_id,'visit',NEW.id);
END;

CREATE TRIGGER cafe_schedule_staff_assignment AFTER UPDATE OF contact,status ON orders
WHEN NEW.fulfillment='dine_in' AND NEW.status NOT IN ('cancelled','completed')
 AND COALESCE(json_extract(NEW.contact,'$.table'),'')<>''
 AND (json_extract(OLD.contact,'$.table') IS NOT json_extract(NEW.contact,'$.table')
      OR (OLD.status='pending' AND NEW.status='confirmed'))
BEGIN
 INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind,source_id)
 VALUES(json_extract(NEW.contact,'$.table'),NEW.user_id,'visit',NEW.id);
END;

CREATE TRIGGER cafe_schedule_prepaid_qr AFTER INSERT ON prepaid_checkouts
WHEN NEW.fulfillment='dine_in' AND COALESCE(json_extract(NEW.contact,'$.table'),'')<>''
BEGIN
 INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind,source_id)
 VALUES(json_extract(NEW.contact,'$.table'),NEW.user_id,'scan',NEW.id);
END;
