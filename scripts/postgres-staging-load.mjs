import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

const port = 5182;
const routes = ['/api/bootstrap', '/api/cafe/order-intake', '/api/cafe/order-intake'];
const agent = new http.Agent({ keepAlive:true, maxSockets:128 });
const stages = [{clients:16, seconds:5}, {clients:32, seconds:5}, {clients:64, seconds:5}, {clients:128, seconds:30}];
const results = [];

function request(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host:'127.0.0.1', port, path, agent }, res => {
      res.resume();
      res.once('end', () => resolve(res.statusCode));
      res.once('error', reject);
    });
    req.setTimeout(3000, () => req.destroy(new Error('Request timed out')));
    req.once('error', reject);
  });
}

async function stage({clients, seconds}) {
  const samples = [], statuses = {};
  let inFlight = 0, peakInFlight = 0, index = 0;
  const start = performance.now();
  const until = start + seconds*1000;
  await Promise.all(Array.from({ length:clients }, async () => {
    while (performance.now() < until) {
      const sent = performance.now();
      peakInFlight = Math.max(peakInFlight, ++inFlight);
      let status;
      try { status = await request(routes[index++ % routes.length]); }
      catch { status = 'networkError'; }
      finally { inFlight--; }
      statuses[status] = (statuses[status] || 0) + 1;
      samples.push(performance.now() - sent);
      await delay(250);
    }
  }));
  samples.sort((a,b) => a-b);
  const elapsed = (performance.now() - start) / 1000;
  return { clients, seconds, peakInFlight, requests:samples.length, requestsPerSecond:Math.round(samples.length/elapsed),
    p95Milliseconds: Math.round(samples[Math.ceil(samples.length*.95)-1]),
    failures:samples.length-(statuses[200] || 0), statuses };
}

try {
  if (process.env.SELFHOST_DATABASE !== 'postgres-staging' || process.env.PGDATABASE !== 'espressoulster_pg_fixture') {
    throw new Error('Run this rehearsal on the dedicated loopback PostgreSQL test instance');
  }
  for (const path of ['/api/ready', ...new Set(routes)]) {
    if (await request(path) !== 200) throw new Error(`Staging readiness check failed for ${path}`);
  }
  for (const configuration of stages) {
    const result = await stage(configuration);
    results.push(result);
    if (result.failures || result.p95Milliseconds > 1000) break;
    await delay(1000);
  }
  console.log(JSON.stringify({pauseBetweenRequestsMilliseconds:250, results}, null, 2));
  if (results.length < stages.length || results.at(-1).failures || results.at(-1).p95Milliseconds > 1000) process.exitCode = 1;
} finally { agent.destroy(); }
