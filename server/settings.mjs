import { isIP } from 'node:net';

export function selfhostSettings(env, development = false) {
  const host = env.SELFHOST_HOST || '127.0.0.1';
  const port = Number(env.SELFHOST_PORT || 5173);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SELFHOST_PORT');
  const certificate = env.SELFHOST_TLS_CERT;
  const key = env.SELFHOST_TLS_KEY;
  if (Boolean(certificate) !== Boolean(key)) throw new Error('Both TLS certificate and private key are required');
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host);
  if (!loopback && !certificate) throw new Error('Public listeners require HTTPS. Configure SELFHOST_TLS_CERT and SELFHOST_TLS_KEY.');
  const live = env.PAYMENT_PROVIDER === 'cashfree' && env.PAYMENT_MODE === 'live' && env.PAYMENT_LIVE_ENABLED === 'true';
  let origin;
  try { origin = new URL(env.PAYMENT_APP_ORIGIN || `http://127.0.0.1:${port}`); }
  catch { throw new Error('Invalid PAYMENT_APP_ORIGIN'); }
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('PAYMENT_APP_ORIGIN must contain only the app origin');
  }
  const trustLoopbackProxy = env.SELFHOST_TRUST_PROXY === 'loopback';
  if (env.SELFHOST_TRUST_PROXY && !trustLoopbackProxy) throw new Error('SELFHOST_TRUST_PROXY must be loopback or unset');
  if (trustLoopbackProxy && !loopback) throw new Error('Trusted proxy mode requires a loopback listener');
  if (env.SELFHOST_DATABASE === 'postgres') {
    if (env.PGDATABASE !== 'espressoulster_runtime_staging' || !env.PGHOST?.startsWith('/') ||
      env.PUBLIC_TEST_MODE !== 'false' || development || origin.protocol !== 'https:' ||
      (!certificate && !trustLoopbackProxy) || env.PAYMENT_MODE === 'test' ||
      env.CASHFREE_STAGING_SANDBOX_ENABLED === 'true') {
      throw new Error('PostgreSQL checkout requires the existing app database, private socket, HTTPS and sandbox disabled.');
    }
  }
  if (live) {
    const name = origin.hostname.replace(/^\[|\]$/g, '');
    if (origin.protocol !== 'https:' || origin.port || isIP(name) ||
      !name.includes('.') || /\.(?:localhost|local|test|invalid)$/.test(name) ||
      (!certificate && !trustLoopbackProxy) || env.PUBLIC_TEST_MODE !== 'false' ||
      !env.CASHFREE_LIVE_CLIENT_ID || !env.CASHFREE_LIVE_CLIENT_SECRET) {
      throw new Error('Live Cashfree requires production keys, a public HTTPS domain on port 443, and its TLS certificate. Keep live payments disabled until these are ready.');
    }
  }
  if (env.SELFHOST_DATABASE === 'postgres-staging') {
    if (env.PAYMENT_LIVE_ENABLED === 'true') throw new Error('PostgreSQL staging cannot enable live payments');
    if (!loopback) {
      const name = origin.hostname.replace(/^\[|\]$/g, '');
      const publicName = !isIP(name) && name.includes('.') && !/\.(?:localhost|local|test|invalid)$/.test(name);
      if (env.SELFHOST_DIRECT_STAGING_HTTPS !== 'true' || !certificate || !publicName ||
        origin.protocol !== 'https:' || Number(origin.port || 443) !== port ||
        env.PGDATABASE !== 'espressoulster_runtime_staging' || env.PUBLIC_TEST_MODE !== 'false' ||
        env.PAYMENT_MODE === 'live' || development) {
        throw new Error('Public PostgreSQL staging requires direct HTTPS, the staging database, and tester login and live payments disabled');
      }
    }
  }
  const maxConcurrentRequests = Number(env.SELFHOST_MAX_CONCURRENT_REQUESTS || 64);
  if (!Number.isSafeInteger(maxConcurrentRequests) || maxConcurrentRequests < 1 || maxConcurrentRequests > 4096) throw new Error('Invalid SELFHOST_MAX_CONCURRENT_REQUESTS');
  return { host, port, origin, certificate, key, live, development, trustLoopbackProxy, maxConcurrentRequests };
}

export function sanitizeRequestHeaders(headers, remoteAddress, settings) {
  // Only an explicitly enabled, local reverse proxy may supply a client IP.
  // nginx must overwrite X-Real-IP, rather than append a client-supplied chain.
  const proxyIp = headers['x-real-ip'];
  const trusted = settings.trustLoopbackProxy && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress);
  const clientIp = trusted && typeof proxyIp === 'string' && isIP(proxyIp) ? proxyIp : remoteAddress;
  // Incoming requests do not get to supply identity or trusted proxy headers.
  for (const name of Object.keys(headers)) {
    if (name.startsWith('oai-') || name.startsWith('x-forwarded-') ||
      name.startsWith('cf-') || name === 'forwarded' || name === 'x-real-ip') delete headers[name];
  }
  headers['cf-connecting-ip'] = clientIp || 'unknown';
  headers['x-forwarded-proto'] = settings.certificate || (trusted && settings.origin.protocol === 'https:') ? 'https' : 'http';
}
