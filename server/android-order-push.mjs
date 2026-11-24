import pg from 'pg';
import { postgresConnectionSettings } from './postgres.mjs';
import { GoogleAuth } from 'google-auth-library';
import { orderNotice, staffOrderNotice } from '../lib/order-notifications.ts';
import { canSeeStaffPanel, staffRole } from '../lib/staff-panel-access.ts';

const scopeUrl = 'https://www.googleapis.com/auth/firebase.messaging';

export function firebaseOrderSender(projectId, accessToken, send = fetch) {
  return async (token, binding, scope, notice, ttl) => {
    const access = await accessToken();
    if (!access) throw Error('FCM access is unavailable');
    const response = await send(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { Authorization:`Bearer ${access}`, 'Content-Type':'application/json' },
      body: JSON.stringify({message: {
        token,
        android: { priority: 'HIGH', ttl: `${ttl}s` },
        data: { kind:'order', scope, binding, id:notice.id, tag:notice.tag,
          reference:notice.reference, title:notice.title, body:notice.body },
      }}),
    });
    if (response.ok) { await response.body?.cancel(); return 'sent'; }
    const failure = await response.json().catch(() => null);
    if (failure?.error?.details?.some(item => item.errorCode === 'UNREGISTERED')) return 'unregistered';
    return [400, 413].includes(response.status) ? 'discard' : 'retry';
  };
}

export async function dispatchAndroidOrders(db, config, send) {
  await db.query('DELETE FROM android_push_deliveries WHERE expires_at <= now() OR (attempts >= 8 AND next_attempt <= now())');
  const { rows: claims } = await db.query(`
    WITH due AS (
      SELECT event_id, installation, scope FROM android_push_deliveries
      WHERE next_attempt <= now() AND attempts < 8 ORDER BY next_attempt, event_id LIMIT 8 FOR UPDATE SKIP LOCKED
    )
    UPDATE android_push_deliveries d SET next_attempt = now() + interval '60 seconds', attempts = d.attempts + 1
    FROM due WHERE (d.event_id,d.installation,d.scope) = (due.event_id,due.installation,due.scope)
    RETURNING d.event_id,d.installation,d.scope,d.attempts
  `);
  await Promise.all(claims.map(async claim => {
    const keys = [claim.event_id, claim.installation, claim.scope, claim.attempts];
    const predicate = 'q.event_id=$1 AND q.installation=$2 AND q.scope=$3 AND q.attempts=$4';
    const { rows:[delivery] } = await db.query(`
      SELECT d.token,d.binding,a.phone,o.id,o.order_number,o.fulfillment,e.status,
        CASE WHEN o.fulfillment='dine_in' THEN o.contact::jsonb->>'table' END AS table_number,
        floor(extract(epoch FROM q.expires_at - now()))::integer AS ttl
      FROM android_push_deliveries q
      JOIN android_push_devices d ON (d.installation,d.scope,d.binding)=(q.installation,q.scope,q.binding)
      JOIN pin_sessions s ON s.token_hash=d.session_hash
      JOIN profiles p ON p.id=s.user_id AND p.disabled=0
      JOIN pin_accounts a ON a.user_id=s.user_id
      JOIN order_events e ON e.id=q.event_id
      JOIN orders o ON o.id=e.order_id
      WHERE ${predicate} AND s.expires_at>extract(epoch FROM now())
        AND (q.scope='staff' OR s.user_id=o.user_id)
    `,keys);
    let notice;
    if (delivery?.ttl > 0) {
      if (claim.scope === 'staff' && staffRole(delivery.phone, config) === 'operator') {
        notice = staffOrderNotice(delivery);
      } else if (claim.scope === 'customer' && !canSeeStaffPanel(delivery.phone, config.STAFF_ONLY_PHONES)) {
        notice = orderNotice({...delivery, contact: delivery.table_number ? {table:delivery.table_number} : undefined});
      }
    }
    const outcome = notice
      ? await send(delivery.token,delivery.binding,claim.scope,notice,delivery.ttl).catch(()=>'retry')
      : 'discard';
    if (outcome === 'retry') {
      const backoff = Math.min(120, 2 ** claim.attempts * 2);
      await db.query(`UPDATE android_push_deliveries q SET next_attempt=now()+make_interval(secs=>$5) WHERE ${predicate}`, [...keys,backoff]);
    } else if (outcome === 'unregistered') {
      await db.query('DELETE FROM android_push_devices WHERE installation=$1 AND scope=$2 AND binding=$3 AND token=$4',
        [claim.installation,claim.scope,delivery.binding,delivery.token]);
      await db.query(`DELETE FROM android_push_deliveries q WHERE ${predicate}`,keys);
    } else {
      await db.query(`DELETE FROM android_push_deliveries q WHERE ${predicate}`,keys);
    }
  }));
}

export function startAndroidOrderPush(config = process.env) {
  if (!/^[a-z][a-z0-9-]{4,29}$/.test(config.ANDROID_PUSH_PROJECT_ID ?? '') ||
    !config.GOOGLE_APPLICATION_CREDENTIALS) return async () => {};
  const auth = new GoogleAuth({keyFile:config.GOOGLE_APPLICATION_CREDENTIALS, scopes:[scopeUrl]});
  const send = firebaseOrderSender(config.ANDROID_PUSH_PROJECT_ID, () => auth.getAccessToken());
  const pool = new pg.Pool({...postgresConnectionSettings(config),max:3,statement_timeout:8000,application_name:'espc-android-order-push'});
  let timer, run, stopped = false;
  pool.on('error', () => console.warn('Android order push database connection closed'));
  function schedule(delay) {
    timer = setTimeout(() => {
      if (stopped) return;
      run = dispatchAndroidOrders(pool,config,send).catch(() => {
        console.warn('Android order push will retry');
      }).finally(() => { if (!stopped) schedule(2000); });
    },delay);
    timer.unref();
  }
  schedule(0);
  return async () => { stopped = true; clearTimeout(timer); await run; await pool.end(); };
}
