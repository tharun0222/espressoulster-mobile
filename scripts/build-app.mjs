import { spawnSync } from 'node:child_process';
import { reconcileSiteAssets } from '../build/reconcile-site-assets.mjs';

const sites = process.env.CAFE_BUILD_TARGET === 'sites';
const args = sites
  ? ['scripts/run-framework.mjs', 'build']
  : ['node_modules/next/dist/bin/next', 'build', '--webpack'];
const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: {
  ...process.env, NEXT_TELEMETRY_DISABLED: '1', APP_RUNTIME: sites ? 'sites' : 'selfhost',
} });
if (result.error) throw result.error;
if (result.status === 0 && sites) console.log(`Reconciled ${reconcileSiteAssets('dist')} stale asset preload hints.`);
process.exit(result.status ?? 1);
