// Exercise the same app-client User-Agent as the Android WebView, without a
// top-level-only ngrok header. This catches HTML notices returned as CSS/JS.
const origin = new URL(process.env.ESPC_ANDROID_STORE_ORIGIN || process.argv[2] || '');
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/') {
  throw new Error('Provide the HTTPS Android store origin.');
}
const headers = {
  'User-Agent': 'EspressoulsterAndroid/1.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36',
};
const page = await fetch(origin, {headers, signal: AbortSignal.timeout(15000)});
if (!page.ok) throw new Error(`Opening page: HTTP ${page.status}`);
const html = await page.text();
if (!html.includes('Espressoulster') || !html.includes('/_next/static/')) throw new Error('Opening page is not the application.');
const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?#]+\.(?:css|js))"/g)].map(match => match[1]))];
if (!assets.some(path => path.endsWith('.css')) || !assets.some(path => path.endsWith('.js'))) {
  throw new Error('Opening page has no styles or scripts.');
}
let checked = 0;
for (let offset = 0; offset < assets.length; offset += 5) {
  await Promise.all(assets.slice(offset, offset + 5).map(async path => {
    const response = await fetch(new URL(path, origin), {headers, signal: AbortSignal.timeout(15000)});
    const expected = path.endsWith('.css') ? /^text\/css\b/i : /^(?:application|text)\/(?:javascript|x-javascript)\b/i;
    const type = response.headers.get('content-type') || '';
    const content = await response.text();
    if (!response.ok || !expected.test(type) || /^\s*<!doctype html/i.test(content)) {
      throw new Error(`Android asset failed: ${path} (HTTP ${response.status}, ${type})`);
    }
    checked++;
  }));
}
console.log(`PASS: app opening and ${checked} CSS/JavaScript assets loaded with the Android app-client User-Agent; no per-request skip header.`);
