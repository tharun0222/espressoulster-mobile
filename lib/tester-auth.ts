export const testerCookie='espresso_tester';
export async function hashTesterToken(token:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');}
export function testerToken(cookie:string|null){const raw=(cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(testerCookie+'='))?.slice(testerCookie.length+1);return raw&&/^[a-f0-9]{64}$/.test(raw)?raw:null;}
export function testerName(value:unknown){if(typeof value!=='string')throw Error('Enter your name');const name=value.trim();if(name.length<2||name.length>60||/[\x00-\x1f\x7f]/.test(name))throw Error('Enter a name between 2 and 60 characters');return name;}
