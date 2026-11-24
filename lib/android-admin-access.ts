import { env } from 'cloudflare:workers';
import { body, db, json } from './server';
import { hashTesterToken } from './tester-auth';
import { assert } from './pricing';
import { verifyAndroidProof } from './android-admin-attestation';
import { msg91Ready } from './msg91-otp';
import { usesWhatsAppOtp } from './msg91-whatsapp';

const cookieName = 'espresso_android_admin';
const tokenPattern = /^[a-f0-9]{64}$/;
const nowSeconds = () => Math.floor(Date.now() / 1000);
const newToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
function diagnostic(stage:string,reason?:string) {
  if ((env as {ANDROID_ADMIN_DIAGNOSTICS?:string}).ANDROID_ADMIN_DIAGNOSTICS === 'true') {
    // Stage enums only: never log numbers, IPs, certificates, challenges,
    // signatures, tokens, cookies or provider responses.
    console.info('[android-admin]', JSON.stringify({stage,...(reason?{reason}:{})}));
  }
}
export const staffOtpDeviceIndependent = () => env.STAFF_DEVICE_POLICY === 'otp';
export const androidAdminRequired = () => !staffOtpDeviceIndependent() && env.ADMIN_ANDROID_ONLY === 'true';
export function localStaffPreview(host: string | null) {
  return process.env.NODE_ENV === 'development' && env.STAFF_LOCAL_PREVIEW === 'true'
    && /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host ?? '');
}
export function localStaffPreviewPin(host: string | null) {
  const pin = env.STAFF_LOCAL_PREVIEW_PIN;
  return localStaffPreview(host) && !androidAdminRequired() && !msg91Ready(env) && !usesWhatsAppOtp(env) && /^\d{6}$/.test(pin ?? '') ? pin : undefined;
}

export function staffPhoneAuthRequired(host: string | null) {
  if (staffOtpDeviceIndependent()) return true;
  return env.STAFF_OTP_ONLY === 'true' && !localStaffPreviewPin(host);
}

export function staffOtpRequired(host: string | null) {
  if (staffOtpDeviceIndependent()) return true;
  return staffPhoneAuthRequired(host) && (msg91Ready(env)||usesWhatsAppOtp(env));
}
const available = () => androidAdminRequired() || env.ADMIN_ANDROID_ENROLLMENT === 'true';
let revocationCache: { entries: Record<string, unknown>; until: number } | undefined;

export async function androidAdminAccess(cookie: string | null) {
  const token = cookie?.split(';').map(value => value.trim())
    .find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  if (!token || !tokenPattern.test(token)) return false;
  return !!await db().prepare('SELECT 1 FROM android_admin_access WHERE token_hash=? AND expires_at>?')
    .bind(await hashTesterToken(token), nowSeconds()).first();
}

export async function requireAndroidAdmin(cookie: string | null) {
  if (androidAdminRequired()) {
    assert(await androidAdminAccess(cookie), 'Open Café Admin in the Espressoulster Android app.', 403);
  }
}

async function revocations() {
  if (revocationCache && Date.now() < revocationCache.until) return revocationCache.entries;
  const response = await fetch('https://android.googleapis.com/attestation/status', {
    signal: AbortSignal.timeout(5000),
  });
  assert(response.ok, 'Android verification is temporarily unavailable.', 503);
  const { entries } = await response.json<{ entries?: Record<string, unknown> }>();
  assert(entries && typeof entries === 'object' && !Array.isArray(entries), 'Android verification is temporarily unavailable.', 503);
  revocationCache = { entries, until: Date.now() + 5 * 60_000 };
  return entries;
}

export async function androidAdminRoute(path: string, request: Request) {
  assert(available(), 'Android admin verification is unavailable.', 404);
  const database = db();
  const now = nowSeconds();
  if (path === 'auth/android-admin/status' && request.method === 'GET') {
    const verified=await androidAdminAccess(request.headers.get('cookie'));
    diagnostic('status',verified?'verified':'unverified');
    return json({ verified, required: androidAdminRequired() });
  }
  if (path === 'auth/android-admin/challenge' && request.method === 'GET') {
    const challenge = newToken();
    const result = await database.batch([
      database.prepare('DELETE FROM android_admin_challenges WHERE expires_at<=?').bind(now),
      database.prepare('DELETE FROM android_admin_access WHERE expires_at<=?').bind(now),
      database.prepare('INSERT INTO android_admin_challenges (challenge, expires_at) SELECT ?, ? WHERE (SELECT COUNT(*) FROM android_admin_challenges)<5000').bind(challenge, now + 180),
    ]);
    assert(result[2].meta.changes === 1, 'Android verification is busy. Try again shortly.', 429);
    diagnostic('challenge','issued');
    return json({ challenge });
  }
  assert(path === 'auth/android-admin/verify' && request.method === 'POST', 'Not found', 404);
  const { challenge, certificates, signature } = await body(request);
  const base64 = (value: unknown, max: number) => typeof value === 'string' && value.length > 0 &&
    value.length <= max && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
  const validShape=typeof challenge === 'string' && tokenPattern.test(challenge) &&
    Array.isArray(certificates) && certificates.length >= 2 && certificates.length <= 8 &&
    certificates.every(value => base64(value, 8192)) && base64(signature, 256);
  if(!validShape)diagnostic('verify','invalid_request');
  assert(validShape,'Invalid Android verification request.', 400);

  const consumed = await database.prepare('DELETE FROM android_admin_challenges WHERE challenge=? AND expires_at>? RETURNING challenge')
    .bind(challenge, now).first();
  if(!consumed)diagnostic('verify','challenge_expired');
  assert(consumed, 'Android verification expired. Open Café Admin again.', 403);
  let revoked:Record<string,unknown>;
  try { revoked=await revocations(); }
  catch(error){diagnostic('verify','revocation_unavailable');throw error;}
  let verified = false;
  let reason='malformed_proof';
  try {
    verified = verifyAndroidProof(certificates, challenge, signature, revoked,value=>{reason=value;});
  } catch {
    // Invalid certificate, attestation extension or signature.
  }
  diagnostic('verify',verified?'verified':reason);
  assert(verified, 'This phone could not verify the Espressoulster Android app.', 403);
  const token = newToken();
  const duration = 8 * 3600;
  await database.prepare('INSERT INTO android_admin_access (token_hash, expires_at) VALUES (?, ?)')
    .bind(await hashTesterToken(token), now + duration).run();
  return Response.json({ ok: true }, { headers: {
    'Cache-Control': 'no-store',
    'Set-Cookie': `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${duration}`,
  } });
}
