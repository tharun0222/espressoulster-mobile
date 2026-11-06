CREATE TABLE cafe_tables(id TEXT PRIMARY KEY,seats INTEGER NOT NULL CHECK(seats IN (2,4,8)),enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)));
INSERT INTO cafe_tables(id,seats) VALUES ('T01',8),('T02',2),('T03',2),('T04',2),('T05',2),('T06',4),('T07',4),('T08',4),('T09',4),('T10',4),('T11',4),('T12',4),('T13',4),('T14',4),('T15',4);
ALTER TABLE table_bookings ADD COLUMN table_ids TEXT NOT NULL DEFAULT '[]';
CREATE TRIGGER booking_table_guard BEFORE UPDATE OF status,table_ids ON table_bookings WHEN NEW.status='confirmed' BEGIN
 SELECT CASE WHEN NOT json_valid(NEW.table_ids) THEN RAISE(ABORT,'Invalid table selection') END;
 SELECT CASE WHEN json_array_length(NEW.table_ids)=0 THEN RAISE(ABORT,'Select tables before confirming') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM json_each(NEW.table_ids)) != (SELECT COUNT(DISTINCT value) FROM json_each(NEW.table_ids)) THEN RAISE(ABORT,'Duplicate table selection') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.table_ids) j LEFT JOIN cafe_tables t ON t.id=j.value WHERE t.id IS NULL OR t.enabled!=1) THEN RAISE(ABORT,'A selected table is unavailable') END;
 SELECT CASE WHEN (SELECT COALESCE(SUM(t.seats),0) FROM cafe_tables t JOIN json_each(NEW.table_ids) j ON j.value=t.id)<NEW.guests THEN RAISE(ABORT,'Not enough seats for this booking') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM table_bookings b JOIN json_each(b.table_ids) oldtable JOIN json_each(NEW.table_ids) newtable ON newtable.value=oldtable.value WHERE b.id!=NEW.id AND b.status='confirmed' AND b.date=NEW.date AND b.time=NEW.time) THEN RAISE(ABORT,'A selected table is already booked for this slot') END;
END;
CREATE TRIGGER cafe_table_disable_guard BEFORE UPDATE OF enabled ON cafe_tables WHEN NEW.enabled=0 BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM table_bookings b JOIN json_each(b.table_ids) j ON j.value=NEW.id WHERE b.status='confirmed' AND datetime(b.date||'T'||b.time||':00','-330 minutes','+1 hour')>datetime('now')) THEN RAISE(ABORT,'Table has upcoming bookings') END;
END;
