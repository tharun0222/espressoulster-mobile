import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureSeedOnce} from '../lib/seed-once.ts';

test('a pending cold request cannot block another request on the same binding', async () => {
  const database = {};
  let release;
  const pending = ensureSeedOnce(database, () => new Promise(resolve => { release = resolve; }));
  let calls = 0;
  await ensureSeedOnce(database, async () => { calls++; });
  assert.equal(calls, 1);
  await ensureSeedOnce(database, async () => { calls++; });
  assert.equal(calls, 1);
  release();
  await pending;
});

test('failed initialization can retry and only successful initialization is cached', async () => {
  const database = {};
  await assert.rejects(ensureSeedOnce(database, async () => { throw Error('temporary database failure'); }));
  let calls = 0;
  await ensureSeedOnce(database, async () => { calls++; });
  await ensureSeedOnce(database, async () => { calls++; });
  assert.equal(calls, 1);
});

test('database bindings initialize independently', async () => {
  let calls = 0;
  const initialize = async () => { calls++; };
  await ensureSeedOnce({}, initialize);
  await ensureSeedOnce({}, initialize);
  assert.equal(calls, 2);
});
