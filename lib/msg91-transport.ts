import {request} from 'node:https';

/** Use the existing allowlisted IPv4 address without relaxing TLS or MSG91 IP security. */
export function createMsg91Ipv4Fetch(httpsRequest: typeof request = request): typeof fetch {
 return async (input, init = {}) => {
  if (typeof input !== 'string' && !(input instanceof URL)) throw new TypeError('MSG91 requires a URL');
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.hostname !== 'control.msg91.com' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new TypeError('Invalid MSG91 endpoint');
  }
  if (init.body != null && typeof init.body !== 'string') throw new TypeError('Unsupported MSG91 request body');
  if (init.signal?.aborted) throw init.signal.reason;
  return new Promise<Response>((resolve, reject) => {
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const req = httpsRequest(url, {family: 4, method: init.method || 'GET', headers}, res => {
      const chunks: Buffer[] = []; let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 1024 * 1024) { req.destroy(new Error('MSG91 response too large')); return; }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(res.headers)) if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : value);
        const status = res.statusCode || 502;
        resolve(new Response([204,205,304].includes(status) ? null : Buffer.concat(chunks), {status,headers:responseHeaders}));
      });
    });
    const abort = () => req.destroy(new DOMException('Request aborted', 'AbortError'));
    init.signal?.addEventListener('abort', abort, {once: true});
    req.on('close', () => init.signal?.removeEventListener('abort', abort));
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('MSG91 request timed out')));
    if (init.body) req.write(init.body);
    req.end();
  });
 };
}
export const msg91Ipv4Fetch = createMsg91Ipv4Fetch();
