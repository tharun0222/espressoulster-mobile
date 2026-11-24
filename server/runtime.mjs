import path from 'node:path';
import { openDatabase } from './database.mjs';
import { openPostgres } from './postgres.mjs';
import { localImageStorage } from './storage.mjs';
import { selfhostSettings } from './settings.mjs';

const stateKey = Symbol.for('espressoulster.selfhost.runtime');
function runtime() {
  if (typeof window !== 'undefined') throw new Error('Server runtime cannot run in the browser');
  if (!globalThis[stateKey]) {
    const directory = path.resolve(process.env.SELFHOST_DATA_DIR || '.selfhost/data');
    const usePostgres = process.env.SELFHOST_DATABASE === 'postgres-staging';
    if (usePostgres) selfhostSettings(process.env);
    globalThis[stateKey] = {
      DB: usePostgres ? openPostgres() : openDatabase(path.join(directory, 'cafe.sqlite')),
      BUCKET: localImageStorage(path.join(directory, 'images')),
    };
  }
  return globalThis[stateKey];
}

// Read runtime secrets on the server, never with Next's public env configuration.
export const env = new Proxy({}, {
  get(_target, name) {
    if (name === 'DB' || name === 'BUCKET') return runtime()[name];
    return typeof name === 'string' ? process.env[name] : undefined;
  },
});
