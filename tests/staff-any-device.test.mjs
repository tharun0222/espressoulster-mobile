import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import * as pinCore from '../lib/pin-auth-core.ts';
import * as staffPolicy from '../lib/staff-panel-access.ts';
import * as otp from '../lib/msg91-otp.ts';
import * as whatsapp from '../lib/msg91-whatsapp.ts';
import {createPinReset} from '../lib/pin-reset.ts';
import {hashTesterToken} from '../lib/tester-auth.ts';

const admins=['8220025037','8904397434'];
const customer='9999999901';
function moduleAt(path,dependencies,globals={}){
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const context={exports:{},require:name=>{assert.ok(name in dependencies,`Unexpected dependency ${name}`);return dependencies[name]},process:{env:{NODE_ENV:'production'}},Buffer,crypto,Date,Response,Request,URL,AbortSignal,console,...globals};
 vm.runInNewContext(compiled,context);return context.exports;
}
function fixture(overrides={}){
 const sql=new DatabaseSync(':memory:');
 sql.exec('PRAGMA foreign_keys=ON; CREATE TABLE profiles(id TEXT PRIMARY KEY,email TEXT,name TEXT,phone TEXT,disabled INTEGER DEFAULT 0,date_of_birth TEXT,gender TEXT);CREATE TABLE phone_accounts(phone TEXT PRIMARY KEY,user_id TEXT);');
 for(const migration of ['0019_mobile_pin_signin.sql','0032_pin_reset.sql','0036_android_admin.sql'])sql.exec(readFileSync(new URL('../drizzle/'+migration,import.meta.url),'utf8'));
 for(const phone of [...admins,customer]){
  sql.prepare('INSERT INTO profiles(id,email,name,phone) VALUES(?,?,?,?)').run('person-'+phone,phone+'@fixture.invalid','Fixture '+phone.slice(-4),'+91'+phone);
  sql.prepare('INSERT INTO pin_accounts(phone,user_id,pin_salt,pin_hash) VALUES(?,?,?,?)').run('+91'+phone,'person-'+phone,'unused-fixture-salt','unused-fixture-hash');
 }
 const d={prepare(q){return{bind(...v){return{async first(){return sql.prepare(q).get(...v)||null},async run(){return{meta:sql.prepare(q).run(...v)}}}}}},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}}};
 const env={CUSTOMER_AUTH_MODE:'pin',PIN_AUTH_SECRET:'fixture-only-secret-at-least-32-characters',PIN_AUTH_OTP_ENABLED:'true',CUSTOMER_OTP_ONLY:'true',STAFF_OTP_ONLY:'true',STAFF_DEVICE_POLICY:'otp',ADMIN_ANDROID_ONLY:'true',STAFF_ONLY_PHONES:admins.join(','),STAFF_ORDER_OPERATOR_PHONES:admins.join(','),OTP_DELIVERY_CHANNEL:'whatsapp',MSG91_AUTH_KEY:'fixture',MSG91_WHATSAPP_NUMBER:'919000000000',MSG91_WHATSAPP_TEMPLATE:'signin_fixture',MSG91_WHATSAPP_LANGUAGE:'en',...overrides};
 const codes=new Map();let sends=0,hardwareChecks=0,providerUnavailable=false;
 const provider=async(_url,options)=>{
  sends++;const recipient=JSON.parse(options.body).payload.template.to_and_components[0];
  if (providerUnavailable) return Response.json({status:'fail',apiError:'418'}, {status:401});
  codes.set(recipient.to[0],recipient.components.body_1.value);
  return Response.json({status:'success',request_id:'fixture'});
 };
 const server={db:()=>d,body:req=>req.json(),json:value=>Response.json(value),adminIdentity:async()=>null};
 const android=moduleAt('lib/android-admin-access.ts',{
  'cloudflare:workers':{env},'./server':server,'./tester-auth':{hashTesterToken},
  './pricing':{assert:(value,message,status)=>{if(!value)throw Object.assign(Error(message),{status})}},
  './android-admin-attestation':{verifyAndroidProof:()=>assert.fail('OTP policy does not use hardware proof')},
  './msg91-otp':otp,'./msg91-whatsapp':whatsapp,
 },{fetch:()=>assert.fail('No hardware network requests in this fixture')});
 const route=moduleAt('lib/pin-auth.ts',{
  'cloudflare:workers':{env},'./server':server,'./pin-auth-core':pinCore,
  './android-admin-access':{...android,androidAdminAccess:async(...args)=>{hardwareChecks++;return android.androidAdminAccess(...args)}},
  './pin-reset':{createPinReset:(database,settings)=>createPinReset(database,settings,provider)},
  './msg91-otp':otp,'./staff-panel-access':staffPolicy,
 }).pinAuth;
 const call=async(action,input,device='first-phone',headers={})=>{
  const previous=globalThis.fetch;globalThis.fetch=provider;
  try{return await route('auth/pin/'+action,new Request('https://cafe.test/api/auth/pin/'+action,{method:'POST',headers:{origin:'https://cafe.test','cf-connecting-ip':device,...headers},body:JSON.stringify(input)}))}
  finally{globalThis.fetch=previous}
 };
 return {sql,d,env,android,call,get sends(){return sends},get hardwareChecks(){return hardwareChecks},code:phone=>codes.get('91'+phone),advanceCooldown(){sql.exec('UPDATE pin_login_attempts SET created_at=created_at-61')},rejectDelivery(){providerUnavailable=true}};
}

for(const phone of admins)test(`approved Admin ${phone} completes OTP without a device cookie and retains independent phone sessions`,async()=>{
 const f=fixture();
 const challenge=await(await f.call('otp/request',{phone})).json();
 assert.match(challenge.challenge,/^[a-f0-9]{64}$/);assert.equal(f.sends,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM pin_sessions').get().n,0);
 const first=await f.call('otp/confirm',{phone,challenge:challenge.challenge,code:f.code(phone)});
 assert.equal((await first.json()).destination,'admin');
 const firstCookie=first.headers.get('set-cookie');assert.match(firstCookie,/^espresso_staff_pin=.*HttpOnly.*SameSite=Strict.*Secure/);
 assert.equal(await pinCore.readPinSession(f.d,firstCookie),null);
 const profile=await pinCore.readStaffPinSession(f.d,firstCookie,true);assert.equal(profile.id,'person-'+phone);
 assert.equal(staffPolicy.staffRole(phone,f.env),'operator');
 f.advanceCooldown();
 const secondChallenge=await(await f.call('otp/request',{phone},'second-phone')).json();
 const second=await f.call('otp/confirm',{phone,challenge:secondChallenge.challenge,code:f.code(phone)},'second-phone');
 const secondCookie=second.headers.get('set-cookie');assert.notEqual(firstCookie,secondCookie);
 assert.equal((await second.json()).destination,'admin');
 assert.equal((await pinCore.readStaffPinSession(f.d,firstCookie,true)).id,profile.id);
 assert.equal((await pinCore.readStaffPinSession(f.d,secondCookie,true)).id,profile.id);
 assert.equal(f.hardwareChecks,0);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM android_admin_access').get().n,0);
 await assert.rejects(f.call('otp/confirm',{phone,challenge:secondChallenge.challenge,code:f.code(phone)}),error=>error.status===400);
});

test('incorrect, expired and cross-purpose OTPs cannot issue staff sessions on any device',async()=>{
 const f=fixture(),phone=admins[0];
 const challenge=await(await f.call('otp/request',{phone})).json();
 const correct=f.code(phone),wrong=correct==='000000'?'000001':'000000';
 await assert.rejects(f.call('otp/confirm',{phone,challenge:challenge.challenge,code:wrong}),error=>error.status===400);
 await assert.rejects(f.call('otp/confirm',{phone:admins[1],challenge:challenge.challenge,code:correct}),error=>error.status===400);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM pin_sessions').get().n,0);
 await assert.rejects(f.call('signup-otp/confirm',{phone,challenge:challenge.challenge,code:correct}),error=>error.status===403);
 f.sql.exec('UPDATE pin_reset_challenges SET expires_at=0');
 await assert.rejects(f.call('otp/confirm',{phone,challenge:challenge.challenge,code:correct}),error=>error.status===400);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM pin_sessions').get().n,0);
});

test('device-independent staff login still fails closed when the OTP provider is not configured',async()=>{
 const f=fixture({MSG91_AUTH_KEY:''});
 await assert.rejects(f.call('otp/request',{phone:admins[0]}),error=>error.status===503);
 await assert.rejects(f.call('login',{phone:admins[0],pin:'123456'}),error=>error.status===410);
 assert.equal(f.sends,0);assert.equal(f.hardwareChecks,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM pin_sessions').get().n,0);
});

test('a normal customer and a forged device or Admin claim never receive a staff session',async()=>{
 const f=fixture();
 const headers={'User-Agent':'EspressoulsterAndroid/1.0',cookie:'espresso_android_admin='+'f'.repeat(64)};
 const challenge=await(await f.call('otp/request',{phone:customer,admin:true},'browser',headers)).json();
 const result=await f.call('otp/confirm',{phone:customer,challenge:challenge.challenge,code:f.code(customer),admin:true,destination:'admin'},'browser',headers);
 assert.equal((await result.json()).destination,undefined);
 const cookie=result.headers.get('set-cookie');assert.match(cookie,/^espresso_pin=/);
 assert.equal(await pinCore.readStaffPinSession(f.d,cookie,true),null);
 assert.equal(staffPolicy.staffRole(customer,f.env),null);
});

test('OTP device independence is opt-in and does not remove OTP, cooldown or origin checks',async()=>{
 const strict=fixture({STAFF_DEVICE_POLICY:undefined});
 await assert.rejects(strict.call('otp/request',{phone:admins[0]}),error=>error.status===403);
 assert.equal(strict.sends,0);assert.ok(strict.hardwareChecks>0);
 const f=fixture();
 await assert.rejects(f.call('otp/request',{phone:admins[0]},'browser',{origin:'https://other.test'}),error=>error.status===403);
 assert.equal(f.sends,0);
 await f.call('otp/request',{phone:admins[0]});
 await assert.rejects(f.call('otp/request',{phone:admins[0]}),error=>error.status===429);
 await assert.rejects(f.call('login',{phone:admins[0],pin:'123456'}),error=>error.status===403||error.status===410);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM pin_sessions').get().n,0);
});

test('unified WhatsApp flow resends directly, invalidates the old challenge and signs in an existing customer', async () => {
 const f = fixture();
 const first = await (await f.call('access/request',{phone:customer})).json();
 const oldCode = f.code(customer);
 await assert.rejects(f.call('access/request',{phone:customer}),error=>error.status===429);
 f.advanceCooldown();
 const second = await (await f.call('access/request',{phone:customer})).json();
 assert.notEqual(first.challenge,second.challenge);
 assert.equal(f.sends,2);
 await assert.rejects(f.call('access/confirm',{phone:customer,challenge:first.challenge,code:oldCode}),error=>error.status===400);
 const verified = await f.call('access/confirm',{phone:customer,challenge:second.challenge,code:f.code(customer)});
 assert.equal((await pinCore.readPinSession(f.d,verified.headers.get('set-cookie'))).id,'person-'+customer);
});

test('new customer can complete profile only with a verified number, once, without a separate signup', async () => {
 const f = fixture(), phone = '9999999902';
 const details={phone,name:'New Customer',dateOfBirth:'1995-06-15',gender:'female'};
 const requested=await (await f.call('access/request',{phone})).json();
 await assert.rejects(f.call('access/profile',{...details,setup:requested.challenge}),error=>error.status===400);
 const verified=await f.call('access/confirm',{phone,challenge:requested.challenge,code:f.code(phone)});
 assert.equal(verified.headers.get('set-cookie'),null);
 const {setup}=await verified.json();
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM pin_accounts').get().n,3);
 await assert.rejects(f.call('access/profile',{...details,phone:'9999999903',setup}),error=>error.status===400);
 const created=await f.call('access/profile',{...details,setup});
 assert.equal((await pinCore.readPinSession(f.d,created.headers.get('set-cookie'))).name,'New Customer');
 await assert.rejects(f.call('access/profile',{...details,setup}),error=>error.status===400);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM pin_accounts').get().n,4);
});

test('unified login retains a legacy phone profile and routes existing staff to Admin', async () => {
 const f=fixture(), phone='9999999902';
 f.sql.prepare('INSERT INTO profiles(id,name,phone) VALUES(?,?,?)').run('legacy-person','Legacy customer','+91'+phone);
 f.sql.prepare('INSERT INTO phone_accounts(phone,user_id) VALUES(?,?)').run('+91'+phone,'legacy-person');
 const legacy=await (await f.call('access/request',{phone})).json();
 const migrated=await f.call('access/confirm',{phone,challenge:legacy.challenge,code:f.code(phone)});
 assert.equal((await pinCore.readPinSession(f.d,migrated.headers.get('set-cookie'))).id,'legacy-person');
 const staff=await (await f.call('access/request',{phone:admins[0]})).json();
 const result=await f.call('access/confirm',{phone:admins[0],challenge:staff.challenge,code:f.code(admins[0])});
 assert.equal((await result.json()).destination,'admin');
 assert.equal((await pinCore.readStaffPinSession(f.d,result.headers.get('set-cookie'),true)).id,'person-'+admins[0]);
});

test('unified request reports delivery failure without exposing MSG91 or issuing a usable challenge', async () => {
 const f=fixture();
 f.rejectDelivery();
 await assert.rejects(f.call('access/request',{phone:customer}),error=>error.status===503 && !/MSG91|418/.test(error.message));
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM pin_reset_challenges').get().n,0);
});
