CREATE TABLE table_bookings (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES profiles(id),date TEXT NOT NULL,time TEXT NOT NULL,
 guests INTEGER NOT NULL CHECK(guests BETWEEN 1 AND 20),purpose TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','declined','cancelled')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX table_bookings_user ON table_bookings(user_id,date);
CREATE UNIQUE INDEX table_bookings_active_slot ON table_bookings(user_id,date,time) WHERE status IN ('pending','confirmed');
