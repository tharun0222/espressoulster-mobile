import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../app/store-app.tsx', import.meta.url), 'utf8');
const apiSource = source.slice(source.indexOf('export async function api('), source.indexOf('export function money('));
const compiled = ts.transpileModule(apiSource, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
function setup(fetch, timers = {}) {
  const context = {exports: {}, fetch, AbortController, FormData, setTimeout, clearTimeout, ...timers};
  vm.runInNewContext(compiled, context);
  return context.exports.api;
}
test('customer API aborts stalled requests and returns a retryable timeout', async () => {
  let cleared = false;
  const api = setup((url, {signal}) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  }), {setTimeout: callback => {queueMicrotask(callback); return 1;}, clearTimeout: () => {cleared = true;}});
  await assert.rejects(api('cart', 'PUT', {items: []}), /request timed out/);
  assert.equal(cleared, true);
});
test('customer API clears deadlines and preserves server validation errors', async () => {
  let cleared = false;
  const api = setup(async () => ({ok: false, headers: new Headers({'Content-Type':'application/json'}), json: async () => ({error:'Item is out of stock'})}), {clearTimeout: id => {clearTimeout(id); cleared = true;}});
  await assert.rejects(api('quote', 'POST', {items: []}), /Item is out of stock/);
  assert.equal(cleared, true);
});
