import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {publicMessage} from '../lib/public-message.ts';

const source = fs.readFileSync(new URL('../app/store-app.tsx', import.meta.url), 'utf8');
const apiSource = source.slice(source.indexOf('export async function api('), source.indexOf('export function money('));
const compiled = ts.transpileModule(apiSource, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
function setup(fetch, timers = {}) {
  const context = {exports: {}, fetch, publicMessage, AbortController, FormData, setTimeout, clearTimeout, ...timers};
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

test('customer reads can be cancelled when their cart or route becomes obsolete',async()=>{
 let aborted=false;
 const api=setup((url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(Error('cancelled'));});}));
 const controller=new AbortController();const pending=api('quote','POST',{items:[]},controller.signal);controller.abort();
 await assert.rejects(pending,error=>error.name==='AbortError');assert.equal(aborted,true);
});

test('interrupted banner reads recover once and a disconnected write is never sent twice', async () => {
  let calls = 0;
  const ok = () => new Response('{"advertisement":null}', {headers:{'Content-Type':'application/json'}});
  const api = setup(async () => {
    if (++calls === 1) throw new TypeError('Failed to fetch');
    return ok();
  });
  assert.equal((await api('admin/advertisement')).advertisement, null);
  assert.equal(calls, 2);
  calls = 0;
  const disconnected = setup(async () => { calls++; throw new TypeError('Failed to fetch'); });
  await assert.rejects(disconnected('admin/advertisement', 'PUT', {banners:[]}), /Check whether your change was saved/);
  assert.equal(calls, 1);
});

test('banner uploads have a longer deadline and receive a useful lost-connection message', async () => {
  let deadline;
  let calls = 0;
  const api = setup(async () => { calls++; throw new TypeError('Failed to fetch'); }, {
    Blob, setTimeout: (_, ms) => { deadline = ms; return 1; }, clearTimeout: () => {},
  });
  await assert.rejects(api('admin/upload','POST',new Blob([new Uint8Array([137,80,78,71])])), /choose the image again/);
  assert.equal(deadline, 120000);
  assert.equal(calls, 1);
});

test('an Android picker file without a MIME type uploads with its original image bytes', async () => {
  const bytes = new Uint8Array([255,216,255,224]);
  const api = setup(async (_, {body}) => {
    assert.equal(body.type, 'image/jpeg');
    assert.deepEqual(new Uint8Array(await body.arrayBuffer()), bytes);
    return new Response('{"url":"/api/images/photo"}',{headers:{'Content-Type':'application/json'}});
  }, {Blob});
  assert.equal((await api('admin/upload','POST',new Blob([bytes]))).url, '/api/images/photo');
});
