import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function reconcileSiteAssets(directory) {
  const client = path.join(directory, 'client');
  const manifest = JSON.parse(readFileSync(path.join(client, '.vite/manifest.json'), 'utf8'));
  const chunks = new Map();
  for (const entry of Object.values(manifest)) {
    if (entry.name && entry.file?.endsWith('.js')) {
      const files = chunks.get(entry.name) || new Set(); files.add('/' + entry.file); chunks.set(entry.name, files);
    }
  }
  let repaired = 0;
  for (const name of ['server/__vite_rsc_assets_manifest.js', 'server/ssr/__vite_rsc_assets_manifest.js']) {
    const file = path.join(directory, name);
    if (!existsSync(file)) continue;
    const source = readFileSync(file, 'utf8');
    const data = JSON.parse(source.replace(/^export default\s+/, '').replace(/;\s*$/, ''));
    for (const dependencies of Object.values(data.clientReferenceDeps || {})) {
      dependencies.js = (dependencies.js || []).flatMap(url => {
        if (existsSync(path.join(client, url))) return [url];
        const logicalName = path.basename(url).replace(/-[A-Za-z0-9_-]{8}\.js$/, '');
        const replacements = [...(chunks.get(logicalName) || [])];
        if (replacements.length > 1) throw new Error('Ambiguous client chunk: ' + logicalName);
        repaired++;
        // Vinext's final SSR pass can rename a chunk or merge it away. These
        // are preload hints only; actual browser imports use the final manifest.
        return replacements;
      });
    }
    const bootstrap = data.bootstrapScriptContent?.match(/\/_next\/static\/[^"\\]+/g) || [];
    for (const url of bootstrap) if (!existsSync(path.join(client, url))) throw new Error('Missing bootstrap script: ' + url);
    writeFileSync(file, 'export default ' + JSON.stringify(data, null, 2) + '\n');
  }
  return repaired;
}
