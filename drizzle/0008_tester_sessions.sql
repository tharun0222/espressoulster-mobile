CREATE TABLE tester_sessions (token_hash TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,ip_hash TEXT NOT NULL);
CREATE INDEX idx_tester_session_expiry ON tester_sessions(expires_at);
CREATE INDEX idx_tester_session_rate ON tester_sessions(ip_hash,created_at);
