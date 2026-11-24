import { backup, DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { chmod, cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const data = path.resolve(process.env.SELFHOST_DATA_DIR || '.selfhost/data');
const root = path.resolve(process.env.SELFHOST_BACKUP_DIR || '.selfhost/backups');
const name = new Date().toISOString().replace(/[:.]/g, '-');
const destination = path.join(root, name);
const postgres = process.env.SELFHOST_DATABASE === 'postgres-staging';
const postgresBin = process.env.SELFHOST_POSTGRES_BIN;
if (postgres && (!process.env.PGHOST?.startsWith('/') || process.env.PGDATABASE !== 'espressoulster_runtime_staging' ||
  !postgresBin || !path.isAbsolute(postgresBin))) {
  throw new Error('PostgreSQL backups require the staging database, private socket, and PostgreSQL binary directory.');
}
const run = promisify(execFile);
await mkdir(root, { recursive:true, mode:0o700 });
await mkdir(destination, { mode:0o700 });
try {
  if (postgres) {
    const dump = path.join(destination, 'cafe.pg_dump');
    await run(path.join(postgresBin, 'pg_dump'), ['--format=custom','--no-password','--lock-wait-timeout=10s','--file',dump], { timeout:120000 });
    await chmod(dump,0o600);
    if (!(await stat(dump)).size) throw new Error('PostgreSQL backup archive is empty.');
    await run(path.join(postgresBin, 'pg_restore'), ['--list',dump], { timeout:10000 });
  } else {
    const database = new DatabaseSync(path.join(data, 'cafe.sqlite'), { readOnly:true });
    try { await backup(database, path.join(destination, 'cafe.sqlite')); }
    finally { database.close(); }
    await chmod(path.join(destination, 'cafe.sqlite'), 0o600);
  }
  await cp(path.join(data, 'images'), path.join(destination, 'images'), { recursive:true });
  await writeFile(path.join(destination, 'complete.json'), JSON.stringify({
    createdAt:new Date().toISOString(), database:postgres?'postgresql':'sqlite', ...(!postgres?{sqliteBackup:true}:{}),
  }), { mode:0o600 });
} catch (error) {
  await rm(destination, { recursive:true, force:true });
  throw error;
}

// Only prune completed backups made by this script, after a new backup succeeds.
const completed = [];
for (const entry of await readdir(root, { withFileTypes:true })) {
  if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(entry.name)) continue;
  if ((await readdir(path.join(root, entry.name))).includes('complete.json')) completed.push(entry.name);
}
for (const old of completed.sort().slice(0, -7)) await rm(path.join(root, old), { recursive:true });
console.log(`Completed ${postgres?'PostgreSQL':'SQLite'} and uploaded-image backup. Retained the latest seven snapshots.`);
