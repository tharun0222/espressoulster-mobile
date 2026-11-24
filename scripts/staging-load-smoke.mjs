// A bounded read-only smoke test, NOT a 100,000-user capacity certification.
import { performance } from 'node:perf_hooks';
import http from 'node:http';

const origin = new URL(process.env.PAYMENT_APP_ORIGIN || 'http://127.0.0.1:5175');
const port = Number(process.env.SELFHOST_PORT || 5175);
const samples = [], statuses = {};
const count = 300, concurrency = 10;
let next = 0, bytes = 0;
function request(route) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host:'127.0.0.1', port, path:route, headers:{ Host:origin.host } }, res => {
      let length = 0;
      res.on('data', chunk => { length += chunk.length; });
      res.on('end', () => resolve({ status:res.statusCode, bytes:length }));
      res.on('error', reject);
    });
    req.setTimeout(10000, () => req.destroy(new Error('Read-only smoke request timed out')));
    req.on('error', reject);
  });
}
const started = performance.now();
await Promise.all(Array.from({ length:concurrency }, async () => {
  while (next < count) {
    const index = next++;
    const start = performance.now();
    try {
      const route = index % 3 === 0 ? '/api/bootstrap' : '/api/cafe/order-intake';
      const response = await request(route);
      bytes += response.bytes;
      statuses[response.status] = (statuses[response.status] || 0) + 1;
    } catch { statuses.networkError = (statuses.networkError || 0) + 1; }
    samples.push(performance.now() - start);
  }
}));
samples.sort((a,b) => a-b);
const seconds = (performance.now() - started) / 1000;
const failures = Object.entries(statuses).filter(([status]) => status !== '200').reduce((sum,[,n]) => sum+n, 0);
console.log(JSON.stringify({ kind:'bounded-read-only-smoke', simulatedUsers:concurrency, requests:count, seconds:+seconds.toFixed(2), requestsPerSecond:+(count/seconds).toFixed(1), p50Milliseconds:+samples[Math.floor(samples.length*.5)].toFixed(1), p95Milliseconds:+samples[Math.floor(samples.length*.95)].toFixed(1), statuses, responseBytes:bytes, failures, certifiedFor100000Users:false }, null, 2));
if (failures) process.exitCode = 1;
