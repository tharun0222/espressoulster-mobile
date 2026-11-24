import { backup, DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { openDatabase, migrateDatabase } from '../server/database.mjs';

const directory = path.resolve(process.env.SELFHOST_DATA_DIR || '.selfhost/data');
const destination = path.join(directory, 'cafe.sqlite');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--import')) {
  throw new Error('Usage: selfhost-db.mjs [--import /path/to/existing.sqlite]');
}
if (args[0] === '--import') {
  if (existsSync(destination)) throw new Error('Database already exists; refusing to overwrite customer data.');
  const source = new DatabaseSync(path.resolve(args[1]), { readOnly: true });
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { await backup(source, destination); chmodSync(destination, 0o600); }
  finally { source.close(); }
}
const database = openDatabase(destination);
try {
  console.log(`Self-hosted database ready (${migrateDatabase(database, path.resolve('drizzle'))} migrations applied).`);
} finally { database.close(); }
