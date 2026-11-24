import { pinToken, staffOtpSessionHash, staffPinCookie, staffPinSessionHash } from './pin-auth-core.ts';
import { hashTesterToken } from './tester-auth.ts';
import { assert } from './pricing.ts';

export function androidPushConfigured(env: Record<string, string | undefined>) {
  return /^[a-z][a-z0-9-]{4,29}$/.test(env.ANDROID_PUSH_PROJECT_ID ?? '') &&
    Boolean(env.GOOGLE_APPLICATION_CREDENTIALS);
}

const id = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export async function registerAndroidPush(
  db: Pick<D1Database, 'prepare'>,
  cookie: string | null,
  userId: string,
  scope: 'customer' | 'staff',
  input: Record<string, unknown>,
) {
  assert(typeof input.installation === 'string' && id.test(input.installation) &&
    typeof input.binding === 'string' && id.test(input.binding) &&
    typeof input.token === 'string' && /^[A-Za-z0-9_:.-]{20,2048}$/.test(input.token),
    'Invalid Android notification registration.');
  const token = scope === 'staff' ? pinToken(cookie, staffPinCookie) : pinToken(cookie);
  assert(token, 'Sign in on this device again.', 401);
  const hashes = scope === 'staff'
    ? await Promise.all([staffOtpSessionHash(token), staffPinSessionHash(token)])
    : [await hashTesterToken(token)];
  const updated = await db.prepare(`
    INSERT INTO android_push_devices(installation,scope,binding,token,session_hash)
    SELECT ?,?,?,?,token_hash FROM pin_sessions
    WHERE token_hash IN (${hashes.map(() => '?').join(',')}) AND user_id=? AND expires_at>?
    LIMIT 1
    ON CONFLICT(installation,scope) DO UPDATE SET binding=excluded.binding,
      token=excluded.token,session_hash=excluded.session_hash
    RETURNING installation
  `).bind(input.installation, scope, input.binding, input.token, ...hashes, userId, Math.floor(Date.now()/1000)).first();
  assert(updated, 'Sign in on this device again.', 401);
}
