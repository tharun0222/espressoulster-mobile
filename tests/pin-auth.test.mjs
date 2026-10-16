import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createPinAuth,readPinSession,PinAuthError,pinValue,registrationPin} from '../lib/pin-auth-core.ts';
const config={CUSTOMER_AUTH_MODE:'pin',PIN_AUTH_SECRET:'fixture-only-secret-at-least-32-characters'};
function fixture(e=config){
 const sql=new DatabaseSync(':memory:');sql.exec("PRAGMA foreign_keys=ON;CREATE TABLE profiles(id TEXT PRIMARY KEY,email TEXT,name TEXT,phone TEXT,disabled INTEGER DEFAULT 0);CREATE TABLE phone_accounts(phone TEXT PRIMARY KEY,user_id TEXT);"+readFileSync(new URL('../drizzle/0019_mobile_pin_signin.sql',import.meta.url),'utf8')+readFileSync(new URL('../drizzle/0020_pin_profile_details.sql',import.meta.url),'utf8'));
 const d={prepare(q){return{bind(...v){return{async first(){return sql.prepare(q).get(...v)||null},async run(){return sql.prepare(q).run(...v)}}}}},async batch(s){sql.exec('BEGIN');try{for(const a of s)await a.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};
 const auth=createPinAuth(d,e);
 const input={name:'  Test Customer  ',dateOfBirth:'1995-06-15',phone:'9999999901',pin:'246810',confirmPin:'246810'};
 async function call(action,b=input,cookie='',extra={}){const method=action==='session'?'GET':'POST';return auth.route('auth/pin/'+action,new Request('https://cafe.test/api/auth/pin/'+action,{method,headers:{origin:'https://cafe.test',cookie,'cf-connecting-ip':'fixture-ip',...extra}}),b)}
 async function register(){const response=await call('register');return response.headers.get('set-cookie').split(';')[0]}
 return{sql,d,auth,input,call,register};
}
test('PIN validation rejects malformed, mismatched and predictable registration PINs',()=>{
 for(const p of ['12345','1234567','abcdef',123456])assert.throws(()=>pinValue(p),PinAuthError);
 assert.throws(()=>registrationPin('246810','135790'),/match/);
 for(const p of ['000000','111111','123456','654321'])assert.throws(()=>registrationPin(p,p),/predictable/);
 assert.equal(registrationPin('246810','246810'),'246810');
});
test('register hashes the PIN, creates one account and returns a Secure HttpOnly session without verifying the number',async()=>{
 const f=fixture(),r=await f.call('register'),body=await r.json(),cookie=r.headers.get('set-cookie');
 assert.deepEqual(body,{ok:true,phoneVerified:false});assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);
 const account=f.sql.prepare('SELECT * FROM pin_accounts').get();assert.equal(account.phone,'+919999999901');assert.match(account.pin_hash,/^[a-f0-9]{64}$/);assert.notEqual(account.pin_hash,f.input.pin);
 const session=f.sql.prepare('SELECT * FROM pin_sessions').get();assert.ok(!cookie.includes(session.token_hash));assert.equal((await readPinSession(f.d,cookie)).id,account.user_id);
});
test('correct PIN restores the same account across sessions',async()=>{
 const f=fixture(),original=await f.register(),login=await f.call('login');const next=login.headers.get('set-cookie');assert.equal((await readPinSession(f.d,original)).id,(await readPinSession(f.d,next)).id);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM profiles').get().n,1);
});
test('incorrect PIN and unknown number receive the same generic rejection and create no session',async()=>{
 const f=fixture();await f.register();for(const b of [{...f.input,pin:'135790'},{...f.input,phone:'9999999902'}])await assert.rejects(f.call('login',b),e=>e.status===401&&e.message==='Mobile number or PIN is incorrect.');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM pin_sessions').get().n,1);
});
test('duplicate registration and pre-existing verified phone accounts cannot be reassigned',async()=>{
 const f=fixture();await f.register();await assert.rejects(f.call('register',{...f.input,pin:'135790',confirmPin:'135790'}),e=>e.status===409);
 f.sql.prepare('INSERT INTO phone_accounts VALUES(?,?)').run('+919999999902','verified-person');await assert.rejects(f.call('register',{...f.input,phone:'9999999902'}),e=>e.status===409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM profiles').get().n,1);
});
test('parallel registration cannot create duplicate users or leave orphan profiles',async()=>{
 const f=fixture(),r=await Promise.allSettled([f.call('register'),f.call('register')]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM profiles').get().n,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM pin_sessions').get().n,1);
});
test('expired, forged and disabled-account sessions cannot authenticate',async()=>{
 const f=fixture(),cookie=await f.register();assert.equal(await readPinSession(f.d,'espresso_pin='+'a'.repeat(64)),null);
 f.sql.exec('UPDATE pin_sessions SET expires_at=0');assert.equal(await readPinSession(f.d,cookie),null);
 f.sql.exec('UPDATE pin_sessions SET expires_at=9999999999;UPDATE profiles SET disabled=1');assert.equal(await readPinSession(f.d,cookie),null);await assert.rejects(f.call('login'),e=>e.status===401);
});
test('logout revokes only the presented PIN session',async()=>{
 const f=fixture(),first=await f.register(),second=(await f.call('login')).headers.get('set-cookie');const r=await f.call('logout',{},first);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.equal(await readPinSession(f.d,first),null);assert.ok(await readPinSession(f.d,second));
});
test('atomic per-number budget blocks guessing under concurrent attempts',async()=>{
 const f=fixture();await f.register();f.sql.exec('DELETE FROM pin_login_attempts');const attempts=await Promise.allSettled(Array.from({length:8},(_,i)=>f.call('login',{...f.input,pin:'135790'},'',{'cf-connecting-ip':'ip-'+i})));assert.equal(attempts.filter(x=>x.status==='rejected'&&x.reason.status===429).length,3);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM pin_login_attempts').get().n,5);
});
test('IP budget prevents spreading guesses across many mobile numbers',async()=>{
 const f=fixture();for(let i=0;i<10;i++)await assert.rejects(f.call('login',{...f.input,phone:'99999999'+String(i).padStart(2,'0')}),e=>e.status===401);await assert.rejects(f.call('login',{...f.input,phone:'9999999920'}),e=>e.status===429);
});
test('disabled or incomplete PIN configuration fails closed',async()=>{
 for(const e of [{CUSTOMER_AUTH_MODE:'pin'},{CUSTOMER_AUTH_MODE:'whatsapp',PIN_AUTH_SECRET:config.PIN_AUTH_SECRET}]){const f=fixture(e);await assert.rejects(f.call('register'),x=>x.status===503);const b=await(await f.call('session')).json();assert.equal(b.authenticated,false);assert.equal(b.ready,false)}
});
test('cross-origin requests and invalid phone numbers are rejected',async()=>{
 const f=fixture();await assert.rejects(f.call('register',f.input,'',{origin:'https://evil.test'}),e=>e.status===403);await assert.rejects(f.call('register',{...f.input,phone:'123'}),e=>e.status===400);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM profiles').get().n,0);
});

test('registration stores name and date of birth; existing accounts can sign in without those fields',async()=>{const f=fixture();await f.register();const p=f.sql.prepare('SELECT * FROM profiles').get();assert.equal(p.name,'Test Customer');assert.equal(p.date_of_birth,'1995-06-15');assert.equal((await f.call('login',{phone:f.input.phone,pin:f.input.pin})).status,200)});
test('invalid registration details never create an account',async()=>{for(const patch of [{name:''},{name:'A'},{name:'A\u0000B'},{dateOfBirth:''},{dateOfBirth:'2025-02-30'},{dateOfBirth:'2999-01-01'},{dateOfBirth:'1899-01-01'}]){const f=fixture();await assert.rejects(f.call('register',{...f.input,...patch}),e=>e.status===400);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM profiles').get().n,0)}});
