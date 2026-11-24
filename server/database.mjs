import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function openDatabase(filename) {
  if (filename !== ':memory:') {
    mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  }
  const sql = new DatabaseSync(filename);
  if (filename !== ':memory:') chmodSync(filename, 0o600);
  sql.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');

  class Statement {
    constructor(query, values = []) { this.query = query; this.values = values; }
    bind(...values) { return new Statement(this.query, values.map(value => value ?? null)); }
    execute() {
      const statement = sql.prepare(this.query);
      const returnsRows = statement.columns().length > 0;
      const results = returnsRows ? statement.all(...this.values) : [];
      const info = returnsRows
        ? sql.prepare('SELECT changes() AS changes,last_insert_rowid() AS lastInsertRowid').get()
        : statement.run(...this.values);
      return { success: true, results, meta: {
        changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid),
      } };
    }
    async first(column) {
      const row = sql.prepare(this.query).get(...this.values);
      return row ? (column ? row[column] ?? null : row) : null;
    }
    async all() { return this.execute(); }
    async run() { return this.execute(); }
  }

  return {
    sql,
    prepare(query) { return new Statement(query); },
    async batch(statements) {
      // No awaits inside this transaction: other requests cannot interleave
      // stock, payment, subscription credit, or table schedule changes.
      sql.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(statement => statement.execute());
        sql.exec('COMMIT');
        return results;
      } catch (error) {
        try { sql.exec('ROLLBACK'); } catch { /* A trigger may have rolled back. */ }
        throw error;
      }
    },
    close() { sql.close(); },
  };
}

export function migrateDatabase(database, directory) {
  const sql = database.sql;
  sql.exec('CREATE TABLE IF NOT EXISTS app_migrations(name TEXT PRIMARY KEY,sha256 TEXT NOT NULL,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  const imported = sql.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='d1_migrations'").get()
    ? new Set(sql.prepare('SELECT name FROM d1_migrations').all().map(row => row.name)) : new Set();
  let applied = 0;
  for (const name of readdirSync(directory).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    const contents = readFileSync(path.join(directory, name), 'utf8');
    const hash = createHash('sha256').update(contents).digest('hex');
    const previous = sql.prepare('SELECT sha256 FROM app_migrations WHERE name=?').get(name);
    if (previous) {
      if (previous.sha256 !== hash) throw new Error(`Applied migration has changed: ${name}`);
      continue;
    }
    sql.exec('BEGIN IMMEDIATE');
    try {
      if (!imported.has(name)) { sql.exec(contents); applied++; }
      sql.prepare('INSERT INTO app_migrations(name,sha256) VALUES(?,?)').run(name, hash);
      sql.exec('COMMIT');
    } catch (error) {
      try { sql.exec('ROLLBACK'); } catch { /* Transaction was rolled back. */ }
      throw error;
    }
  }
  return applied;
}
