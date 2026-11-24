import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { reconcileSiteAssets } from '../build/reconcile-site-assets.mjs';

test('Site preload hints use final client chunks and discard merged chunks without changing browser imports', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cafe-assets-'));
  t.after(() => rmSync(dir, {recursive:true,force:true}));
  for (const folder of ['client/.vite','client/_next/static/chunks','server']) mkdirSync(path.join(dir,folder),{recursive:true});
  writeFileSync(path.join(dir,'client/_next/static/chunks/clock-NEW12345.js'),'export default 1');
  writeFileSync(path.join(dir,'client/_next/static/chunks/index-NEW12345.js'),'import("./clock-NEW12345.js")');
  writeFileSync(path.join(dir,'client/.vite/manifest.json'),JSON.stringify({clock:{name:'clock',file:'_next/static/chunks/clock-NEW12345.js'}}));
  const file=path.join(dir,'server/__vite_rsc_assets_manifest.js');
  writeFileSync(file,'export default '+JSON.stringify({bootstrapScriptContent:'import("/_next/static/chunks/index-NEW12345.js")',clientReferenceDeps:{view:{js:['/_next/static/chunks/clock-OLD12345.js','/_next/static/chunks/merged-OLD12345.js']}}}));
  assert.equal(reconcileSiteAssets(dir),2);
  const data=JSON.parse(readFileSync(file,'utf8').replace('export default ',''));
  assert.deepEqual(data.clientReferenceDeps.view.js,['/_next/static/chunks/clock-NEW12345.js']);
  assert.equal(readFileSync(path.join(dir,'client/_next/static/chunks/index-NEW12345.js'),'utf8'),'import("./clock-NEW12345.js")');
});
