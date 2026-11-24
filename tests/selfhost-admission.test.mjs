import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { requestAdmission } from '../server/admission.mjs';
import { selfhostSettings } from '../server/settings.mjs';

const response = () => Object.assign(new EventEmitter(), {
  writeHead(status, headers) { this.status = status; this.headers = headers; },
  end(body) { this.body = body; this.emit('finish'); },
});
test('overload rejects excess work and releases a finished or aborted slot exactly once', () => {
  const admit = requestAdmission(1), first = response(), rejected = response();
  assert.equal(admit({}, first), true);
  assert.equal(admit({}, rejected), false);
  assert.equal(rejected.status, 503);
  assert.equal(rejected.headers['Retry-After'], '3');
  first.emit('finish'); first.emit('close');
  const second = response(); assert.equal(admit({}, second), true);
  assert.equal(admit({}, response()), false);
  second.emit('close');
  assert.equal(admit({}, response()), true);
});
test('concurrency limit rejects an invalid deployment configuration', () => {
  assert.equal(selfhostSettings({}).maxConcurrentRequests, 64);
  for (const limit of ['0','-1','1.5','NaN','4097']) assert.throws(() => selfhostSettings({ SELFHOST_MAX_CONCURRENT_REQUESTS:limit }), /MAX_CONCURRENT/);
});
