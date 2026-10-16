CREATE TABLE pin_accounts (
 phone TEXT PRIMARY KEY,
 user_id TEXT NOT NULL UNIQUE REFERENCES profiles(id),
 pin_salt TEXT NOT NULL,
 pin_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE pin_sessions (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES profiles(id),
 expires_at INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX pin_sessions_user ON pin_sessions(user_id);
CREATE INDEX pin_sessions_expiry ON pin_sessions(expires_at);
CREATE TABLE pin_login_attempts (
 id TEXT PRIMARY KEY,
 phone_hash TEXT NOT NULL,
 ip_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX pin_attempts_phone ON pin_login_attempts(phone_hash,created_at);
CREATE INDEX pin_attempts_ip ON pin_login_attempts(ip_hash,created_at);
CREATE INDEX pin_attempts_time ON pin_login_attempts(created_at);
