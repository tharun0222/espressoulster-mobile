import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase, migrateDatabase } from '../server/database.mjs';
import { localImageStorage } from '../server/storage.mjs';
import { selfhostSettings, sanitizeRequestHeaders } from '../server/settings.mjs';
import { isSameOriginRequest, canonicalServerRequest } from '../lib/request-origin.ts';

test('self-hosted database applies migrations once and rolls back a partial batch', async t => {
  const db = openDatabase(':memory:'); t.after(() => db.close());
  assert.ok(migrateDatabase(db, path.resolve('drizzle')) > 40);
  assert.equal(migrateDatabase(db, path.resolve('drizzle')), 0);
  await db.prepare('INSERT INTO settings(id,data) VALUES(?,?)').bind('store', '{}').run();
  await assert.rejects(db.batch([
    db.prepare("UPDATE settings SET data='changed' WHERE id='store'"),
    db.prepare("INSERT INTO settings(id,data) VALUES('store','duplicate')"),
  ]));
  assert.equal(await db.prepare("SELECT data FROM settings WHERE id='store'").first('data'), '{}');
  const result = await db.batch([
    db.prepare("UPDATE settings SET data='saved' WHERE id='store' RETURNING id"),
    db.prepare('SELECT changes() AS changed'),
  ]);
  assert.equal(result[0].results[0].id, 'store');
  assert.equal(result[1].results[0].changed, 1);
});

test('database persists prices and booking fee after restart', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'cafe-selfhost-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'cafe.sqlite');
  let db = openDatabase(filename);
  migrateDatabase(db, path.resolve('drizzle'));
  await db.prepare("INSERT INTO settings VALUES('store',?)").bind('{"tableBookingFeePaise":100}').run();
  db.close(); db = openDatabase(filename);
  try {
    assert.equal(JSON.parse(await db.prepare("SELECT data FROM settings WHERE id='store'").first('data')).tableBookingFeePaise, 100);
  } finally { db.close(); }
});

test('private image storage saves metadata and bytes and rejects traversal', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'cafe-images-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bucket = localImageStorage(directory);
  assert.equal(await bucket.get('missing.jpg'), null);
  await bucket.put('banner.jpg', new Blob(['image bytes']), { httpMetadata: { contentType: 'image/jpeg' } });
  const image = await bucket.get('banner.jpg');
  assert.equal(image.body.toString(), 'image bytes');
  assert.equal(image.httpMetadata.contentType, 'image/jpeg');
  await assert.rejects(bucket.get('../.env'));
  await assert.rejects(bucket.put('..', Buffer.from('x')));
});

test('local backend defaults to loopback and refuses insecure public or live settings', () => {
  assert.equal(selfhostSettings({}).host, '127.0.0.1');
  assert.throws(() => selfhostSettings({ SELFHOST_HOST: '0.0.0.0' }), /require HTTPS/);
  assert.throws(() => selfhostSettings({ SELFHOST_TLS_CERT: 'certificate' }), /Both TLS/);
  const live = { PAYMENT_PROVIDER: 'cashfree', PAYMENT_MODE: 'live', PAYMENT_LIVE_ENABLED: 'true',
    PUBLIC_TEST_MODE: 'false', CASHFREE_LIVE_CLIENT_ID: 'production-fixture', CASHFREE_LIVE_CLIENT_SECRET: 'production-secret-fixture' };
  assert.throws(() => selfhostSettings(live), /public HTTPS/);
  for (const origin of ['http://cafe.example', 'https://127.0.0.1', 'https://cafe.local', 'https://cafe.test', 'https://cafe.example:8443']) {
    assert.throws(() => selfhostSettings({ ...live, PAYMENT_APP_ORIGIN: origin, SELFHOST_TLS_CERT: 'cert', SELFHOST_TLS_KEY: 'key' }), /public HTTPS/);
  }
  assert.equal(selfhostSettings({ ...live, PAYMENT_APP_ORIGIN: 'https://cafe.example', SELFHOST_TLS_CERT: 'cert', SELFHOST_TLS_KEY: 'key' }).live, true);
});

test('PostgreSQL staging requires explicit HTTPS settings for a public listener', () => {
  const privateStaging = { SELFHOST_DATABASE: 'postgres-staging', PGDATABASE: 'espressoulster_pg_fixture' };
  assert.equal(selfhostSettings(privateStaging).host, '127.0.0.1');
  assert.throws(() => selfhostSettings({ ...privateStaging, PAYMENT_LIVE_ENABLED: 'true' }), /cannot enable live payments/);

  const publicStaging = {
    ...privateStaging,
    PGDATABASE: 'espressoulster_runtime_staging',
    SELFHOST_HOST: '0.0.0.0',
    SELFHOST_PORT: '8443',
    SELFHOST_TLS_CERT: 'cert',
    SELFHOST_TLS_KEY: 'key',
    SELFHOST_DIRECT_STAGING_HTTPS: 'true',
    PAYMENT_APP_ORIGIN: 'https://staging.cafe.example:8443',
    PAYMENT_PROVIDER: 'disabled',
    PAYMENT_MODE: 'disabled',
    PAYMENT_LIVE_ENABLED: 'false',
    PUBLIC_TEST_MODE: 'false',
  };
  assert.equal(selfhostSettings(publicStaging).origin.host, 'staging.cafe.example:8443');
  const invalid = [
    { SELFHOST_DIRECT_STAGING_HTTPS: '' },
    { PAYMENT_APP_ORIGIN: 'http://staging.cafe.example:8443' },
    { PAYMENT_APP_ORIGIN: 'https://staging.cafe.example' },
    { PAYMENT_APP_ORIGIN: 'https://127.0.0.1:8443' },
    { PGDATABASE: 'espressoulster_pg_fixture' },
    { PUBLIC_TEST_MODE: 'true' },
    { PAYMENT_MODE: 'live' },
  ];
  for (const override of invalid) {
    assert.throws(() => selfhostSettings({ ...publicStaging, ...override }), /Public PostgreSQL staging/);
  }
  assert.throws(() => selfhostSettings(publicStaging, true), /Public PostgreSQL staging/);
  assert.throws(() => selfhostSettings({ ...publicStaging, SELFHOST_TLS_CERT: '', SELFHOST_TLS_KEY: '' }), /require HTTPS/);
});

test('self-hosted requests cannot forge proxy identity or source IP', () => {
  const headers = { 'oai-authenticated-user-email': 'owner@example.test', 'cf-connecting-ip': 'forged',
    'x-forwarded-proto': 'https', 'x-forwarded-for': 'forged', 'x-real-ip': 'forged', cookie: 'session=keep' };
  sanitizeRequestHeaders(headers, '127.0.0.1', selfhostSettings({}));
  assert.equal(headers['oai-authenticated-user-email'], undefined);
  assert.equal(headers['x-forwarded-for'], undefined);
  assert.equal(headers['x-real-ip'], undefined);
  assert.equal(headers['cf-connecting-ip'], '127.0.0.1');
  assert.equal(headers['x-forwarded-proto'], 'http');
  assert.equal(headers.cookie, 'session=keep');
});

test('configured origin works with Next localhost normalization without allowing foreign origins', () => {
  const request = headers => new Request('http://localhost:5173/api/quote', { method: 'POST', headers });
  const headers = { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173', 'sec-fetch-site': 'same-origin' };
  assert.equal(isSameOriginRequest(request(headers), 'http://127.0.0.1:5173'), true);
  assert.equal(isSameOriginRequest(request({ ...headers, origin: 'https://evil.example' }), 'http://127.0.0.1:5173'), false);
  assert.equal(isSameOriginRequest(request({ ...headers, host: 'evil.example' }), 'http://127.0.0.1:5173'), false);
  assert.equal(isSameOriginRequest(request({ ...headers, 'sec-fetch-site': 'cross-site' }), 'http://127.0.0.1:5173'), false);
  assert.equal(isSameOriginRequest(request({ ...headers, origin: 'http://localhost:5173' })), true);
  const secure = new Request('https://localhost/api/quote', { method: 'POST', headers: { host: 'cafe.example', origin: 'https://cafe.example' } });
  assert.equal(isSameOriginRequest(secure, 'https://cafe.example'), true);
});

test('explicit loopback proxy preserves a validated client IP without accepting identity headers', () => {
  const settings = selfhostSettings({ SELFHOST_TRUST_PROXY:'loopback', PAYMENT_APP_ORIGIN:'https://cafe.example' });
  const headers = { 'x-real-ip':'203.0.113.7', 'x-forwarded-for':'forged', 'oai-authenticated-user-id':'forged' };
  sanitizeRequestHeaders(headers, '127.0.0.1', settings);
  assert.equal(headers['cf-connecting-ip'], '203.0.113.7');
  assert.equal(headers['x-forwarded-proto'], 'https');
  assert.equal(headers['oai-authenticated-user-id'], undefined);
  assert.equal(headers['x-forwarded-for'], undefined);
  for (const [peer, ip] of [['203.0.113.9','203.0.113.7'], ['127.0.0.1','203.0.113.7, 1.2.3.4']]) {
    const forged = { 'x-real-ip':ip };
    sanitizeRequestHeaders(forged, peer, settings);
    assert.equal(forged['cf-connecting-ip'], peer);
  }
  assert.throws(() => selfhostSettings({ SELFHOST_TRUST_PROXY:'any' }), /SELFHOST_TRUST_PROXY/);
  assert.throws(() => selfhostSettings({ SELFHOST_TRUST_PROXY:'loopback', SELFHOST_HOST:'0.0.0.0', SELFHOST_TLS_CERT:'cert', SELFHOST_TLS_KEY:'key' }), /loopback listener/);
});

test('canonical self-hosted request retains the exact webhook bytes and rejects a forged host', async () => {
  const raw = '{ "amount": 1.00, "reference": "example" }\n';
  const req = new Request('http://localhost:5173/api/payments/cashfree/webhook?sample=1', {
    method:'POST', headers:{host:'127.0.0.1:5173','x-webhook-signature':'example-signature'}, body:raw,
  });
  const canonical = canonicalServerRequest(req, 'http://127.0.0.1:5173');
  assert.equal(canonical.url, 'http://127.0.0.1:5173/api/payments/cashfree/webhook?sample=1');
  assert.equal(canonical.headers.get('x-webhook-signature'), 'example-signature');
  assert.equal(await canonical.text(), raw);
  assert.throws(() => canonicalServerRequest(new Request('http://localhost/api/quote', {headers:{host:'forged.example'}}), 'http://127.0.0.1:5173'), /Invalid request host/);
});
