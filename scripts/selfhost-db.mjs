import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { postgresConnectionSettings } from '../server/postgres.mjs';

export async function initializeDatabase(settings = process.env) {
  const client = new pg.Client(postgresConnectionSettings(settings));
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL search_path = public, pg_catalog; SET LOCAL timezone = 'UTC'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('espressoulster-bootstrap'))");
    const { rows: [schema] } = await client.query(`
      SELECT to_regclass('public.settings') IS NOT NULL
             AND to_regclass('public.products') IS NOT NULL
             AND to_regclass('public.pin_sessions') IS NOT NULL AS initialized,
             EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public') AS occupied
    `);
    if (!schema.initialized) {
      if (schema.occupied) throw new Error('The PostgreSQL database contains an incomplete or unrelated schema.');
      if (settings.SELFHOST_DATABASE && settings.SELFHOST_DATABASE !== 'postgres-local') {
        throw new Error('Restore the staging or production PostgreSQL backup before starting the app.');
      }
      for (const filename of ['bootstrap.sql', 'functions.sql', 'runtime-rules.sql', 'live-updates.sql', 'android-order-push.sql']) {
        const sql = await readFile(new URL('../server/postgres/' + filename, import.meta.url), 'utf8');
        await client.query(sql.replace(/^BEGIN;\s*|\s*COMMIT;\s*$/g, ''));
      }
    }
    await client.query('COMMIT');
    return !schema.initialized;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('Usage: npm run db:selfhost');
  const initialized = await initializeDatabase();
  console.log(initialized ? 'PostgreSQL schema and catalog initialized.' : 'PostgreSQL database ready.');
}
