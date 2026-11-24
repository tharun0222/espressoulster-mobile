import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { localImageStorage } from '../server/storage.mjs';

// One-time, read-only migration of the old local preview's uploads. No network.
const [metadata, blobs] = process.argv.slice(2);
if (!metadata || !blobs) throw new Error('Provide the old image metadata SQLite file and its blobs directory.');
const source = new DatabaseSync(path.resolve(metadata), { readOnly: true });
const bucket = localImageStorage(path.resolve(process.env.SELFHOST_DATA_DIR || '.selfhost/data', 'images'));
try {
  let count = 0;
  for (const row of source.prepare('SELECT key,blob_id,http_metadata FROM _mf_objects').all()) {
    if (!row.blob_id || !/^[a-zA-Z0-9]+$/.test(row.blob_id)) throw new Error('Unsupported old upload format');
    if (await bucket.get(row.key)) continue;
    await bucket.put(row.key, await readFile(path.join(path.resolve(blobs), row.blob_id)), {
      httpMetadata: JSON.parse(row.http_metadata),
    });
    count++;
  }
  console.log(`Imported ${count} local images.`);
} finally { source.close(); }
