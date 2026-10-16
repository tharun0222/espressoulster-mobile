export const adminCookie = 'espresso_admin';
export function adminToken(cookie: string | null) {
  const token = (cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(adminCookie + '='))?.slice(adminCookie.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256);
  return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2,'0')).join('');
}
export function equalHash(a: string, b: string) {
  if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  let difference = 0; for (let i=0;i<64;i++) difference |= a.charCodeAt(i)^b.charCodeAt(i);
  return difference === 0;
}
