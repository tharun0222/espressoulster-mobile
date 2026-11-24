export function isSameOriginRequest(req: Request, selfhostOrigin?: string) {
  let expected: URL;
  try { expected = new URL(selfhostOrigin || req.url); }
  catch { return false; }
  if (selfhostOrigin && (req.headers.get('host') !== expected.host ||
    expected.username || expected.password || expected.pathname !== '/' || expected.search || expected.hash)) return false;
  const origin = req.headers.get('origin');
  return (!origin || origin === expected.origin) && req.headers.get('sec-fetch-site') !== 'cross-site';
}

export function canonicalServerRequest(req: Request, origin?: string) {
  if (!origin) return req;
  const expected = new URL(origin);
  if (req.headers.get('host') !== expected.host) throw new Error('Invalid request host');
  const incoming = new URL(req.url);
  const url = new URL(expected.origin);
  url.pathname = incoming.pathname;
  url.search = incoming.search;
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body;
  // Preserve the raw stream for signed webhooks and uploads. Rewriting only the
  // server-known origin also keeps the PIN/OTP helpers' own CSRF checks correct.
  return new Request(url, {
    method: req.method, headers: req.headers, signal: req.signal,
    ...(body ? { body, duplex: 'half' } : {}),
  } as RequestInit);
}
