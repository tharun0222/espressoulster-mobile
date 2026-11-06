ALTER TABLE table_bookings ADD COLUMN start_at INTEGER;
ALTER TABLE table_bookings ADD COLUMN end_at INTEGER;
UPDATE table_bookings SET start_at=CAST(strftime('%s',date||'T'||time||':00','-330 minutes') AS INTEGER),end_at=CAST(strftime('%s',date||'T'||time||':00','-330 minutes','+1 hour') AS INTEGER);
DROP TRIGGER booking_table_guard;
DROP TRIGGER cafe_table_disable_guard;
CREATE TRIGGER booking_table_guard BEFORE UPDATE OF status,table_ids,start_at,end_at ON table_bookings WHEN NEW.status='confirmed' BEGIN
 SELECT CASE WHEN NOT json_valid(NEW.table_ids) THEN RAISE(ABORT,'Invalid table selection') END;
 SELECT CASE WHEN json_array_length(NEW.table_ids)=0 THEN RAISE(ABORT,'Select tables before confirming') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM json_each(NEW.table_ids)) != (SELECT COUNT(DISTINCT value) FROM json_each(NEW.table_ids)) THEN RAISE(ABORT,'Duplicate table selection') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.table_ids) j LEFT JOIN cafe_tables t ON t.id=j.value WHERE t.id IS NULL OR t.enabled!=1) THEN RAISE(ABORT,'A selected table is unavailable') END;
 SELECT CASE WHEN (SELECT COALESCE(SUM(t.seats),0) FROM cafe_tables t JOIN json_each(NEW.table_ids) j ON j.value=t.id)<NEW.guests THEN RAISE(ABORT,'Not enough seats for this booking') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM table_bookings b JOIN json_each(b.table_ids) oldtable JOIN json_each(NEW.table_ids) newtable ON newtable.value=oldtable.value WHERE b.id!=NEW.id AND b.status='confirmed' AND b.start_at<NEW.end_at AND NEW.start_at<b.end_at) THEN RAISE(ABORT,'A selected table is already booked for this slot') END;
END;
CREATE TRIGGER cafe_table_disable_guard BEFORE UPDATE OF enabled ON cafe_tables WHEN NEW.enabled=0 BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM table_bookings b JOIN json_each(b.table_ids) j ON j.value=NEW.id WHERE b.status='confirmed' AND b.end_at>CAST(strftime('%s','now') AS INTEGER)) THEN RAISE(ABORT,'Table has upcoming bookings') END;
END;

CREATE TRIGGER booking_range_insert BEFORE INSERT ON table_bookings BEGIN
 SELECT CASE WHEN NEW.start_at IS NULL OR NEW.end_at IS NULL OR NEW.end_at<=NEW.start_at THEN RAISE(ABORT,'Invalid booking interval') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM table_bookings b WHERE b.user_id=NEW.user_id AND b.status IN ('pending','confirmed') AND b.start_at<NEW.end_at AND NEW.start_at<b.end_at) THEN RAISE(ABORT,'You already have an overlapping booking') END;
END;
