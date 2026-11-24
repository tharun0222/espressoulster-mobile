CREATE TABLE subscription_catalog_next(
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount BETWEEN 100 AND 100000000),
 credits INTEGER NOT NULL CHECK(credits BETWEEN 1 AND 3660),
 days INTEGER NOT NULL CHECK(days BETWEEN 1 AND 730),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1,
 item_scope TEXT NOT NULL DEFAULT 'coffee' CHECK(item_scope IN ('coffee','menu')),
 included_items TEXT NOT NULL DEFAULT '[]'
);
INSERT INTO subscription_catalog_next
 SELECT id,name,amount,credits,days,enabled,archived,revision,item_scope,included_items
 FROM subscription_catalog ORDER BY rowid;
DROP TABLE subscription_catalog;
ALTER TABLE subscription_catalog_next RENAME TO subscription_catalog;
