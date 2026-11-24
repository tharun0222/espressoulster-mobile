CREATE TABLE android_admin_challenges (
  challenge TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE TABLE android_admin_access (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
