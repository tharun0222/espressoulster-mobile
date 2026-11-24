import http from 'node:http';
import https from 'node:https';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const origin = new URL(process.env.PAYMENT_APP_ORIGIN);
const directTls = Boolean(process.env.SELFHOST_TLS_CERT);
const transport = directTls ? https : http;
const stateFile = path.join(process.env.SELFHOST_DATA_DIR, 'health-state.json');
let previous = {};
try { previous = JSON.parse(await readFile(stateFile, 'utf8')); } catch { /* First check. */ }
const healthy = await new Promise(resolve => {
  const req = transport.get({
    host:'127.0.0.1',
    port:Number(process.env.SELFHOST_PORT || 5175),
    path:'/api/ready',
    headers:{ Host:origin.host },
    ...(directTls ? { servername:origin.hostname } : {}),
  }, res => {
    let body = '';
    res.on('data', chunk => { body += chunk; if (body.length > 256) res.destroy(); });
    res.on('end', () => { try { resolve(res.statusCode === 200 && JSON.parse(body).ok === true); } catch { resolve(false); } });
    res.on('error', () => resolve(false));
  });
  req.setTimeout(5000, () => req.destroy());
  req.on('error', () => resolve(false));
});
const failures = healthy ? 0 : Math.min(3, Number(previous.failures || 0) + 1);
const restart = failures >= 3;
const state = { checkedAt:new Date().toISOString(), healthy, failures:restart ? 0 : failures, restartRequested:restart };
await writeFile(stateFile + '.tmp', JSON.stringify(state), { mode:0o600 });
await rename(stateFile + '.tmp', stateFile);
if (restart) {
  execFileSync('/usr/bin/systemctl', ['--user', 'restart', 'espressoulster-staging.service'], { timeout:35000, stdio:'ignore' });
  console.log('Restarted the staging app after three consecutive readiness failures.');
} else console.log(healthy ? 'Staging readiness healthy.' : 'Readiness check failed; waiting for consecutive failures before restarting.');
