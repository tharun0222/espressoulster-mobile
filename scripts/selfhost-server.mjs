import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import next from 'next';
import { selfhostSettings, sanitizeRequestHeaders } from '../server/settings.mjs';
import { requestAdmission } from '../server/admission.mjs';
import { env as runtimeEnv } from '../server/runtime.mjs';
import { startAndroidOrderPush } from '../server/android-order-push.mjs';

process.env.APP_RUNTIME = 'selfhost';
process.env.NEXT_TELEMETRY_DISABLED = '1';
const settings = selfhostSettings(process.env, process.argv.includes('--dev'));
const app = next({ dev: settings.development, hostname: settings.origin.hostname, port: settings.port,
  ...(settings.development ? { webpack: true } : {}),
});
const database = runtimeEnv.DB;
try {
  await database.prepare('SELECT 1 FROM settings LIMIT 1').first();
} catch (error) {
  await database.close();
  throw new Error('PostgreSQL is unavailable or uninitialized. Check the connection settings and run npm run db:selfhost.', { cause: error });
}
await app.prepare();
const handler = app.getRequestHandler();
const admit = requestAdmission(settings.maxConcurrentRequests);
const admitLiveUpdates = requestAdmission(96);
const serve = async (req, res) => {
  sanitizeRequestHeaders(req.headers, req.socket.remoteAddress, settings);
  if (req.headers.host !== settings.origin.host) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end('Invalid host'); return;
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (settings.certificate) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  if (req.url === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end('{"ok":true}'); return;
  }
  const liveUpdatesRequest = req.method === 'GET' && ['/api/live-updates','/api/admin/live-updates'].includes(req.url);
  if (!(liveUpdatesRequest ? admitLiveUpdates : admit)(req, res)) return;
  if (req.url === '/api/ready' && req.method === 'GET') {
    try {
      const ok = await database.prepare('SELECT 1 AS ok').first('ok');
      res.writeHead(ok === 1 ? 200 : 503, { 'Content-Type':'application/json', 'Cache-Control':'no-store' });
      res.end(JSON.stringify({ ok:ok === 1 }));
    } catch {
      res.writeHead(503, { 'Content-Type':'application/json', 'Cache-Control':'no-store' });
      res.end('{"ok":false}');
    }
    return;
  }
  // Allow large photos on mobile networks while keeping the ordinary body deadline.
  if (!req.complete && !(req.method === 'POST' && ['/api/upload', '/api/admin/upload'].includes(req.url))) {
    const bodyDeadline = setTimeout(() => {
      if (req.complete || res.headersSent) return;
      res.writeHead(408, { 'Content-Type':'application/json', Connection:'close' });
      res.end('{"error":"The request timed out. Please try again."}');
    }, 30000);
    bodyDeadline.unref();
    const clearDeadline = () => clearTimeout(bodyDeadline);
    req.once('end', clearDeadline);
    res.once('close', clearDeadline);
  }
  handler(req, res).catch(() => {
    // Never print request bodies, cookies, or gateway errors containing keys.
    console.error('Request failed');
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"error":"Please try again shortly."}');
  });
};
const server = settings.certificate
  ? https.createServer({ cert: readFileSync(settings.certificate), key: readFileSync(settings.key), minVersion: 'TLSv1.2' }, serve)
  : http.createServer(serve);
server.requestTimeout = 125000;
server.headersTimeout = 15000;
server.maxHeadersCount = 100;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 1000;
server.maxConnections = 1024;
const stopAndroidOrderPush = startAndroidOrderPush();
server.on('error', error => { console.error(`Backend could not listen (${error.code || 'server error'}).`); process.exitCode = 1; });
server.listen(settings.port, settings.host, () => {
  console.log(`Espressoulster self-hosted app: ${settings.certificate ? 'https' : 'http'}://${settings.host}:${settings.port}`);
  console.log(`Online payments: ${settings.live ? 'live enabled' : process.env.PAYMENT_PROVIDER === 'cashfree' && process.env.PAYMENT_MODE === 'test' ? 'Cashfree sandbox; no real money collected' : 'disabled; Pay at café available'}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  server.close(async () => { await stopAndroidOrderPush(); await app.close(); await database.close(); process.exit(0); });
});
