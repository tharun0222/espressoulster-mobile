import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function localImageStorage(directory) {
  function filename(key) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,199}$/.test(key) || key.includes('..')) {
      throw new Error('Invalid image key');
    }
    return path.join(directory, key);
  }
  return {
    async get(key) {
      let bytes;
      try { bytes = await readFile(filename(key)); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      const boundary = bytes.indexOf(10);
      if (boundary < 0) throw new Error('Image metadata is invalid');
      const metadata = JSON.parse(bytes.subarray(0, boundary).toString('utf8'));
      return { body: bytes.subarray(boundary + 1), httpMetadata: metadata };
    },
    async put(key, value, options = {}) {
      const destination = filename(key);
      const bytes = typeof value.arrayBuffer === 'function'
        ? Buffer.from(await value.arrayBuffer()) : Buffer.from(value);
      if (bytes.length > 10 * 1024 * 1024) throw new Error('Image is too large');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      // Metadata and image share one atomic file, including on replacement.
      const temporary = destination + '.' + randomUUID() + '.tmp';
      await writeFile(temporary, Buffer.concat([
        Buffer.from(JSON.stringify(options.httpMetadata || {}) + '\n'), bytes,
      ]), { mode: 0o600, flag: 'wx' });
      await rename(temporary, destination);
    },
  };
}
