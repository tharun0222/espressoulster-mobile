-- A QR scan is an availability check, not a reservation. Preserve its history,
-- but release temporary holds created by the previous scanner behaviour.
UPDATE cafe_table_schedule SET closed_at=unixepoch()
 WHERE kind='scan' AND closed_at IS NULL;

DROP TRIGGER cafe_schedule_dine_in;
DROP TRIGGER IF EXISTS cafe_schedule_scan_to_visit;

CREATE TRIGGER cafe_schedule_dine_in INSTEAD OF INSERT ON cafe_dine_in_requests
BEGIN
 SELECT CASE WHEN NEW.kind NOT IN ('scan','visit')
   THEN RAISE(ABORT,'Cafe table unavailable') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM cafe_tables WHERE id=NEW.table_id AND enabled=1)
   THEN RAISE(ABORT,'Cafe table unavailable') END;

 -- Validate a scan without allocating anything. Orders and staff assignments
 -- below still claim their table in the same transaction that saves the order.
 SELECT CASE WHEN NEW.kind='scan'
   AND NOT EXISTS(SELECT 1 FROM live_cafe_table_schedule own
     WHERE own.table_id=NEW.table_id AND own.customer_id=NEW.customer_id AND own.kind='visit')
   AND EXISTS(
     SELECT 1 FROM live_cafe_table_schedule s WHERE s.table_id=NEW.table_id
       AND (
         (s.kind='visit' AND s.customer_id<>NEW.customer_id)
         OR (s.kind IN ('booking','hold') AND s.end_at>unixepoch()
           AND NOT(s.kind='booking' AND s.customer_id=NEW.customer_id AND s.start_at<=unixepoch())
           AND s.start_at<COALESCE(
             (SELECT b.end_at FROM live_cafe_table_schedule b
               WHERE b.table_id=NEW.table_id AND b.customer_id=NEW.customer_id
                 AND b.kind='booking' AND b.start_at<=unixepoch() ORDER BY b.end_at LIMIT 1),
             unixepoch()+5400))
       )
   ) THEN RAISE(ABORT,'Cafe table conflict') END;

 INSERT INTO cafe_table_schedule(table_id,customer_id,kind,source_id,booking_id,start_at,end_at)
 SELECT NEW.table_id,NEW.customer_id,'visit',NEW.source_id,b.booking_id,unixepoch(),
   COALESCE(b.end_at,unixepoch()+5400)
 FROM (SELECT 1)
 LEFT JOIN live_cafe_table_schedule b ON b.table_id=NEW.table_id AND b.customer_id=NEW.customer_id
   AND b.kind='booking' AND b.start_at<=unixepoch()
 WHERE NEW.kind='visit' AND NOT EXISTS(
   SELECT 1 FROM live_cafe_table_schedule v WHERE v.table_id=NEW.table_id
      AND v.customer_id=NEW.customer_id AND v.kind='visit'
 );
END;
