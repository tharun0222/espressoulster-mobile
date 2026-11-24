import pg from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
import { postgresStatement } from './postgres-dialect.mjs';

const reads = /^\s*(?:SELECT\b|WITH\b)/i;
const retryable = new Set(['40001','40P01']);
const transactionAttempts = 10;
const permitted = new Set(['espressoulster_runtime_staging','espressoulster_pg_fixture','espressoulster_load_staging']);
const appTypes = {
  getTypeParser(oid, format) {
    if (oid === 20 || oid === 1700) return value => {
      const number = Number(value);
      if (!Number.isFinite(number) || (Number.isInteger(number) && !Number.isSafeInteger(number))) {
        throw new RangeError('Database numeric value exceeds application precision');
      }
      return number;
    };
    return pg.types.getTypeParser(oid, format);
  },
};

export function openPostgres(settings = process.env) {
  if (!settings.PGHOST?.startsWith('/') || !(settings.SELFHOST_DATABASE === 'postgres'
    ? settings.PGDATABASE === 'espressoulster_runtime_staging' : permitted.has(settings.PGDATABASE))) {
    throw new Error('PostgreSQL runtime is restricted to an isolated staging database and Unix socket.');
  }
  const max = Number(settings.SELFHOST_POSTGRES_POOL_SIZE || 8);
  if (!Number.isInteger(max) || max < 1 || max > 32) throw new Error('Invalid PostgreSQL pool size');
  const pool = new pg.Pool({
    host:settings.PGHOST, database:settings.PGDATABASE, port:Number(settings.PGPORT || 5432),
    ...(settings.PGUSER ? {user:settings.PGUSER} : {}),
    max, connectionTimeoutMillis:3000, statement_timeout:15000, lock_timeout:3000,
    idle_in_transaction_session_timeout:20000, options:'-c timezone=UTC', types:appTypes,
  });
  // An idle connection can be dropped during a PostgreSQL restart.
  pool.on('error', error => console.error('PostgreSQL connection dropped', error.code || 'connection error'));

  async function query(client, statement, previousChanges = 0) {
    const text = postgresStatement(statement.query, statement.values, previousChanges);
    const result = await client.query(text, statement.values);
    const isRead = result.command === 'SELECT';
    const rows = result.rows.map(row => {
      // SQLite does not expose its hidden rowid when selecting *.
      delete row.rowid;
      return row;
    });
    return { success:true, results:rows, meta:{changes:isRead ? 0 : result.rowCount ?? 0} };
  }

  async function batch(statements) {
    if (!statements.length) return [];
    const readOnly = statements.every(statement=>reads.test(statement.query));
    for (let attempt = 0; attempt < transactionAttempts; attempt++) {
      const client = await pool.connect();
      let retry = false, releaseError;
      try {
        await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN ISOLATION LEVEL SERIALIZABLE');
        const results = [];
        let lastChange = 0;
        for (const statement of statements) {
          const item = await query(client, statement, lastChange);
          results.push(item);
          if (!reads.test(statement.query)) lastChange = item.meta.changes;
        }
        await client.query('COMMIT');
        return results;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch (reason) { releaseError = reason; }
        if (attempt === transactionAttempts-1 || !retryable.has(error.code)) throw error;
        retry = true;
      } finally {
        client.release(releaseError);
      }
      if (retry) await delay(Math.random()*Math.min(200,12*2**attempt));
    }
  }

  class Statement {
    constructor(query, values = []) { this.query = query; this.values = values; }
    bind(...values) { return new Statement(this.query, values.map(value => value ?? null)); }
    async all() { return reads.test(this.query) ? query(pool, this) : (await batch([this]))[0]; }
    async first(column) {
      const row = (await this.all()).results[0];
      return column ? row?.[column] ?? null : row ?? null;
    }
    async run() { return this.all(); }
  }
  return {prepare:sql=>new Statement(sql),batch,close:()=>pool.end()};
}
