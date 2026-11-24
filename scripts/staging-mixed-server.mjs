import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { userInfo } from 'node:os';
import { withFixtureDatabase } from './staging-mixed-fixtures.mjs';

const secret = process.env.LOAD_STAGING_SECRET;
const ports = [5185,5186];
const gatewayPort = 5187;
const origin = 'http://127.0.0.1:5184';
if (!/^[a-f0-9]{64}$/.test(secret || '') || !process.env.LOAD_STAGING_DATA?.startsWith('/')) {
  throw new Error('A private data directory and a random load-test secret are required.');
}
await withFixtureDatabase(async client => {
  const check = await client.query("SELECT EXISTS(SELECT 1 FROM profiles WHERE email NOT LIKE '%@load.invalid') AS real_data");
  if (check.rows[0].real_data) throw new Error('The load fixture database must contain only synthetic profiles.');
});

const authorize = (req,res) => {
  if (req.headers['x-load-secret'] === secret) return true;
  res.writeHead(404).end();
  return false;
};
const sendJson = (res,data,status=200) => res.writeHead(status,{'content-type':'application/json'}).end(JSON.stringify(data));
const orders = new Map();
let gatewaySequence = 0;
const gateway = http.createServer(async (req,res) => {
  if (!authorize(req,res)) return;
  const match = /^\/pg\/orders\/([A-Z0-9-]+)(\/paid)?$/.exec(req.url);
  try {
    if (req.url === '/pg/orders' && req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 8192) return res.writeHead(413).end();
      }
      const {order_id,order_amount,order_currency,order_expiry_time} = JSON.parse(raw);
      if (!orders.has(order_id)) orders.set(order_id,{
        order_id,order_amount,order_currency,order_expiry_time,order_status:'ACTIVE',
        cf_order_id:String(++gatewaySequence),payment_session_id:`session_${randomBytes(24).toString('hex')}`,
      });
      return sendJson(res,orders.get(order_id));
    }
    const order = match && orders.get(match[1]);
    if (!order) return sendJson(res,{code:'order_not_found'},404);
    if (req.method === 'POST' && match[2] && order.order_status === 'ACTIVE') order.order_status = 'PAID';
    if (req.method === 'PATCH' && !match[2] && order.order_status === 'ACTIVE') order.order_status = 'TERMINATED';
    sendJson(res,order);
  } catch { res.writeHead(400).end(); }
});
gateway.listen(gatewayPort,'127.0.0.1');
await once(gateway,'listening');

const children = ports.map(port => spawn(process.execPath, ['--import','./tests/fixtures/cashfree-load-fetch.mjs','scripts/selfhost-server.mjs'], {
  stdio:'inherit', env:{
    PATH:process.env.PATH, NODE_ENV:'production', APP_RUNTIME:'selfhost',
    PGHOST:process.env.PGHOST, PGPORT:process.env.PGPORT || '5432', PGDATABASE:process.env.PGDATABASE,
    PGUSER:process.env.PGUSER || userInfo().username,
    SELFHOST_DATABASE:'postgres-staging', SELFHOST_DATA_DIR:process.env.LOAD_STAGING_DATA,
    SELFHOST_POSTGRES_POOL_SIZE:'6', SELFHOST_HOST:'127.0.0.1', SELFHOST_PORT:String(port), SELFHOST_MAX_CONCURRENT_REQUESTS:'128',
    CUSTOMER_AUTH_MODE:'pin', PIN_AUTH_SECRET:randomBytes(32).toString('hex'),
    PAYMENT_PROVIDER:'cashfree', PAYMENT_MODE:'test', PAYMENT_LIVE_ENABLED:'false', PUBLIC_TEST_MODE:'true',
    PAYMENT_APP_ORIGIN:origin, CASHFREE_CHECKOUT_API:'orders', CASHFREE_TEST_CLIENT_ID:'TEST-load-fixture',
    CASHFREE_TEST_CLIENT_SECRET:'load-fixture-placeholder', LOAD_STAGING_SECRET:secret, LOAD_GATEWAY_PORT:String(gatewayPort),
  },
}));
const proxyAgent = new http.Agent({keepAlive:true,maxSockets:128});
let cursor = 0;
let closing = false;
const proxy = http.createServer(async (req,res) => {
  if (!authorize(req,res)) return;
  if (req.url === '/__load/ready') {
    try {
      const ready = await Promise.all(ports.map(port => new Promise(resolve => {
        const health = http.get({host:'127.0.0.1',port,path:'/api/ready',headers:{host:new URL(origin).host}},response => {
          response.resume();
          resolve(response.statusCode===200);
        });
        health.once('error',()=>resolve(false));
        health.setTimeout(1000,()=>health.destroy());
      })));
      return sendJson(res,{staging:ready.every(Boolean), replicas:ports.length},ready.every(Boolean)?200:503);
    } catch { return sendJson(res,{staging:false},503); }
  }
  const simulatedPayment = /^\/__load\/orders\/([A-Z0-9-]+)\/paid$/.exec(req.url);
  if (!simulatedPayment && !req.url.startsWith('/api/')) return res.writeHead(404).end();
  const port = simulatedPayment ? gatewayPort : ports[cursor++ % ports.length];
  const headers = {...req.headers,host:new URL(origin).host,origin};
  if (!simulatedPayment) delete headers['x-load-secret'];
  const upstream = http.request({host:'127.0.0.1',port,agent:proxyAgent,headers,method:req.method,
    path:simulatedPayment ? `/pg/orders/${simulatedPayment[1]}/paid` : req.url}, response => {
    res.writeHead(response.statusCode,response.headers);
    response.pipe(res);
  });
  upstream.setTimeout(10000,()=>upstream.destroy());
  upstream.on('error',()=>{ if (!res.headersSent) res.writeHead(502); res.end(); });
  res.once('close',()=>{ if (!res.writableFinished) upstream.destroy(); });
  req.pipe(upstream);
});

function close(error = false) {
  if (closing) return;
  closing = true;
  if (error) process.exitCode = 1;
  proxy.close();
  gateway.close();
  proxyAgent.destroy();
  for (const child of children) child.kill('SIGTERM');
}
for (const child of children) { child.on('exit',()=>close(true)); child.on('error',()=>close(true)); }
proxy.on('error',()=>close(true));
proxy.listen(5184,'127.0.0.1');
process.once('SIGTERM',()=>close());
process.once('SIGINT',()=>close());
