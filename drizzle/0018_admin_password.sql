CREATE TABLE admin_sessions(token_hash TEXT PRIMARY KEY NOT NULL,expires_at INTEGER NOT NULL,credential_hash TEXT NOT NULL);
CREATE TABLE admin_login_attempts(id TEXT PRIMARY KEY NOT NULL,ip_hash TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX admin_login_attempts_ip ON admin_login_attempts(ip_hash,created_at);
CREATE INDEX admin_login_attempts_time ON admin_login_attempts(created_at);
