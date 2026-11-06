CREATE TABLE booking_notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,booking_id TEXT NOT NULL,data TEXT NOT NULL,read_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX booking_notifications_user ON booking_notifications(user_id,read_at,created_at);
CREATE TRIGGER booking_confirmation_notice AFTER UPDATE OF status,table_ids ON table_bookings
WHEN NEW.status='confirmed' AND (OLD.status!='confirmed' OR OLD.table_ids!=NEW.table_ids)
BEGIN
 INSERT INTO booking_notifications(id,user_id,booking_id,data) VALUES(lower(hex(randomblob(16))),NEW.user_id,NEW.id,json_object('tables',json(NEW.table_ids),'start',NEW.start_at,'end',NEW.end_at,'updated',OLD.status='confirmed'));
END;
