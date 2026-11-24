CREATE TABLE IF NOT EXISTS pin_reset_challenges (
  token_hash TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  account_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  checking INTEGER NOT NULL DEFAULT 0
);
