CREATE TABLE phone_accounts(phone TEXT PRIMARY KEY NOT NULL,user_id TEXT UNIQUE NOT NULL);
CREATE TABLE phone_sessions(token_hash TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX phone_sessions_expiry ON phone_sessions(expires_at);
CREATE TABLE phone_challenges(id TEXT PRIMARY KEY NOT NULL,phone TEXT NOT NULL,phone_hash TEXT NOT NULL,ip_hash TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,sent INTEGER NOT NULL DEFAULT 0);
CREATE INDEX phone_challenges_rate ON phone_challenges(created_at,phone_hash,ip_hash);
