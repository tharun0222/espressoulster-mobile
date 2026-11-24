import pg from 'pg';

const subscribers = new Set();
const topics = new Set(['orders', 'chat', 'bookings', 'intake']);
const encode = new TextEncoder();
let listening;

function listen() {
  if (listening) return listening;
  const client = new pg.Client({connectionTimeoutMillis:3000, application_name:'espressoulster-live-updates'});
  function disconnect() {
    if (listening !== connection) return;
    listening = undefined;
    for (const subscriber of subscribers) subscriber.close();
    void client.end().catch(() => {});
  }
  client.on('error', disconnect);
  client.on('end', disconnect);
  client.on('notification', ({payload}) => {
    let event;
    try { event = JSON.parse(payload); } catch { return; }
    if (!event || !topics.has(event.topic)) return;
    for (const subscriber of subscribers) {
      if (subscriber.staff || event.topic === 'intake' || subscriber.userId === event.userId) {
        subscriber.send(`data: ${event.topic}\n\n`);
      }
    }
  });
  const connection = client.connect().then(() => client.query('LISTEN espc_live_updates')).catch(error => {
    disconnect();
    throw error;
  });
  listening = connection;
  return connection;
}

export async function liveUpdatesResponse(userId, staff, signal) {
  if (!['postgres-staging', 'postgres'].includes(process.env.SELFHOST_DATABASE) || process.env.SELFHOST_LIVE_UPDATES !== 'true') {
    return new Response(null,{status:204});
  }
  await listen();
  if (subscribers.size >= 96) return new Response(null,{status:503});
  let close;
  const stream = new ReadableStream({
    start(controller) {
      const subscriber = {userId, staff, close:() => close(), send(text) {
        if (controller.desiredSize > 0) controller.enqueue(encode.encode(text));
        else close();
      }};
      const heartbeat = setInterval(() => subscriber.send(': keep-alive\n\n'), 12000);
      const expiry = setTimeout(() => close(), 55000);
      close = () => {
        if (!subscribers.delete(subscriber)) return;
        clearInterval(heartbeat);
        clearTimeout(expiry);
        signal.removeEventListener('abort', close);
        try {controller.close();} catch { /* The client disconnected. */ }
      };
      subscribers.add(subscriber);
      signal.addEventListener('abort', close, {once:true});
      if (signal.aborted) close();
      else subscriber.send('retry: 1800\n\n: connected\n\n');
    },
    cancel() { close?.(); },
  },{highWaterMark:16});
  return new Response(stream,{headers:{
    'Content-Type':'text/event-stream', 'Cache-Control':'no-store, no-transform',
  }});
}
