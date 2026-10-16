import { spawnSync } from 'node:child_process';
import './sites-env.mjs';
const persist = process.argv[2] || '.wrangler/state';
const result = spawnSync(process.execPath, ['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--config','wrangler.local.json','--persist-to',persist], {stdio:'inherit',env:{...process.env,CI:'true'}});
if(result.error)throw result.error;
process.exit(result.status ?? 1);
