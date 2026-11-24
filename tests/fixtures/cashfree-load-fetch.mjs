const { LOAD_STAGING_SECRET:secret, LOAD_GATEWAY_PORT:port } = process.env;
if (process.env.PGDATABASE !== 'espressoulster_load_staging' || process.env.PAYMENT_MODE !== 'test' ||
    process.env.PAYMENT_LIVE_ENABLED !== 'false' || !/^[a-f0-9]{64}$/.test(secret || '') || !/^\d{4,5}$/.test(port || '')) {
  throw new Error('The Cashfree load simulator requires an isolated staging runtime.');
}

const fetchImpl = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname.endsWith('.cashfree.com')) {
    if (url.origin !== 'https://sandbox.cashfree.com' || !/^\/pg\/orders(?:\/[A-Z0-9-]+)?$/.test(url.pathname)) {
      throw new Error('Real payments are blocked in the test runtime.');
    }
    return fetchImpl(`http://127.0.0.1:${port}${url.pathname}`, {...options, headers:{
      'content-type':'application/json', 'x-load-secret':secret,
    }});
  }
  return fetchImpl(input, options);
};
