import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createPinAuth,readPinSession,PinAuthError,pinValue,registrationPin,pinCookie,staffPinCookie,readStaffPinSession} from '../lib/pin-auth-core.ts';
import {createPinReset} from '../lib/pin-reset.ts';
import {staffRole} from '../lib/staff-panel-access.ts';
import {msg91WhatsAppReady,sendMsg91WhatsAppOtp} from '../lib/msg91-whatsapp.ts';
const config={CUSTOMER_AUTH_MODE:'pin',PIN_AUTH_SECRET:'fixture-only-secret-at-least-32-characters'};
test('only the designated approved staff number handles orders', () => {
 const roles={STAFF_PANEL_PHONES:'9000000001,9000000002',STAFF_ONLY_PHONES:'9000000003',STAFF_ORDER_OPERATOR_PHONE:'9000000003'};
 assert.equal(staffRole('9000000001',roles),'editor');
 assert.equal(staffRole('9000000002',roles),'editor');
 assert.equal(staffRole('+919000000003',roles),'operator');
 assert.equal(staffRole('9000000004',roles),null);
});
test('both approved admin numbers can handle orders, chat and alerts without authorizing other numbers', () => {
 const roles={STAFF_ONLY_PHONES:'8220025037,8904397434',STAFF_PANEL_PHONES:'9008007868',STAFF_ORDER_OPERATOR_PHONES:'8220025037,8904397434',STAFF_ORDER_OPERATOR_PHONE:'8904397434'};
 for(const phone of ['8220025037','+918220025037','8904397434','+918904397434']) {
  assert.equal(staffRole(phone,roles),'operator');
 }
 assert.equal(staffRole('9008007868',roles),'editor');
 assert.equal(staffRole('9999999901',roles),null);
 assert.equal(staffRole('9999999901',{...roles,STAFF_ORDER_OPERATOR_PHONES:'9999999901'}),null);
 assert.equal(staffRole('8220025037',{...roles,STAFF_ORDER_OPERATOR_PHONES:''}),'editor');
});
test('temporary staff PIN works only in staff mode on loopback and leaves the customer PIN intact', async () => {
 const env={...config,STAFF_PANEL_PHONES:'9999999901'};
 const f=fixture(env);
 await f.register();
 const input={phone:f.input.phone,pin:'123456'};
 const local=new Request('http://127.0.0.1:5173/api/auth/pin/login',{method:'POST'});
 const hosted=new Request('https://cafe.test/api/auth/pin/login',{method:'POST'});
 const login=await f.auth.route('auth/pin/login',local,input,true,'123456');
 assert.equal((await login.json()).destination,'admin');
 assert.match(login.headers.get('set-cookie'),/^espresso_staff_pin=/);
 await assert.rejects(f.auth.route('auth/pin/login',hosted,input,true,'123456'),error=>error.status===401);
 await assert.rejects(f.auth.route('auth/pin/login',local,input,false,'123456'),error=>error.status===401);
 assert.equal((await f.call('login',{phone:f.input.phone,pin:f.input.pin})).status,200);
});
function fixture(e=config){
 const sql=new DatabaseSync(':memory:');sql.exec("PRAGMA foreign_keys=ON;CREATE TABLE profiles(id TEXT PRIMARY KEY,email TEXT,name TEXT,phone TEXT,disabled INTEGER DEFAULT 0);CREATE TABLE phone_accounts(phone TEXT PRIMARY KEY,user_id TEXT);"+readFileSync(new URL('../drizzle/0019_mobile_pin_signin.sql',import.meta.url),'utf8')+readFileSync(new URL('../drizzle/0020_pin_profile_details.sql',import.meta.url),'utf8')+readFileSync(new URL('../drizzle/0035_profile_gender.sql',import.meta.url),'utf8'));
 const d={prepare(q){return{bind(...v){return{async first(){return sql.prepare(q).get(...v)||null},async run(){return sql.prepare(q).run(...v)}}}}},async batch(s){sql.exec('BEGIN');try{const results=[];for(const a of s)results.push(await a.run());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
 sql.exec(readFileSync(new URL('../drizzle/0032_pin_reset.sql',import.meta.url),'utf8'));
 const auth=createPinAuth(d,e);
 const input={name:'  Test Customer  ',dateOfBirth:'1995-06-15',gender:'undisclosed',phone:'9999999901',pin:'246810',confirmPin:'246810'};
 async function call(action,b=input,cookie='',extra={}){const method=action==='session'?'GET':'POST';return auth.route('auth/pin/'+action,new Request('https://cafe.test/api/auth/pin/'+action,{method,headers:{origin:'https://cafe.test',cookie,'cf-connecting-ip':'fixture-ip',...extra}}),b)}
 async function register(){const response=await call('register');return response.headers.get('set-cookie').split(';')[0]}
 return{sql,d,auth,input,call,register};
}
test('staff-only numbers cannot create or use customer PIN sessions',async()=>{
 const settings={...config,STAFF_ONLY_PHONES:''};
 const f=fixture(settings), oldSession=await f.register();
 settings.STAFF_ONLY_PHONES=f.input.phone;
 for(const action of ['login','register','reset/request','reset/confirm']){
  await assert.rejects(f.call(action),error=>error.status===403&&error.staffOnly===true);
 }
 assert.equal((await (await f.call('session',{},oldSession)).json()).authenticated,false);
 assert.equal(await readPinSession(f.d,oldSession,undefined,settings.STAFF_ONLY_PHONES),null);
 assert.equal((await f.call('register',{...f.input,phone:'9999999902'})).status,200);
});
test('staff sign-in checks the allowlist and keeps its session separate from customer sign-in', async () => {
 const settings = {...config, STAFF_PANEL_PHONES: '', STAFF_ONLY_PHONES: ''};
 const f = fixture(settings);
 const customerCookie = await f.register();
 const request = new Request('https://cafe.test/api/auth/admin/login', {method:'POST'});
 const signIn = () => f.auth.route('auth/pin/login', request, f.input, true);
 await assert.rejects(signIn(), error => error.status === 403);
 settings.STAFF_ONLY_PHONES = f.input.phone;
 const response = await signIn();
 const cookie = response.headers.get('set-cookie');
 assert.match(cookie, /Max-Age=28800; Path=\/; HttpOnly; SameSite=Strict; Secure/);
 const staff = await readPinSession(f.d, cookie, undefined, undefined, staffPinCookie);
 assert.equal(staff.id, (await readPinSession(f.d, customerCookie)).id);
 assert.equal(await readPinSession(f.d, cookie.replace(staffPinCookie, pinCookie)), null);
 assert.equal(await readPinSession(f.d, customerCookie.replace(pinCookie, staffPinCookie), undefined, undefined, staffPinCookie), null);
});
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
test('hosted PIN login blocks repeated guesses and successful sign-ins clear attempts',async()=>{
 const f=fixture();await f.register();
 for(let i=0;i<12;i++)assert.equal((await f.call('login')).status,200);
 for(let i=0;i<5;i++)await assert.rejects(f.call('login',{...f.input,pin:'135790'}),e=>e.status===401);
 await assert.rejects(f.call('login',{...f.input,pin:'135790'}),e=>e.status===429);
});
test('registration still enforces its per-number attempt budget',async()=>{
 const f=fixture();await f.register();
 for(let i=0;i<4;i++)await assert.rejects(f.call('register'),e=>e.status===409);
 await assert.rejects(f.call('register'),e=>e.status===429);
});
test('disabled or incomplete PIN configuration fails closed',async()=>{
 for(const e of [{CUSTOMER_AUTH_MODE:'pin'},{CUSTOMER_AUTH_MODE:'whatsapp',PIN_AUTH_SECRET:config.PIN_AUTH_SECRET}]){const f=fixture(e);await assert.rejects(f.call('register'),x=>x.status===503);const b=await(await f.call('session')).json();assert.equal(b.authenticated,false);assert.equal(b.ready,false)}
});
test('cross-origin requests and invalid phone numbers are rejected',async()=>{
 const f=fixture();await assert.rejects(f.call('register',f.input,'',{origin:'https://evil.test'}),e=>e.status===403);await assert.rejects(f.call('register',{...f.input,phone:'123'}),e=>e.status===400);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM profiles').get().n,0);
});

test('registration stores name and date of birth; existing accounts can sign in without those fields',async()=>{const f=fixture();await f.register();const p=f.sql.prepare('SELECT * FROM profiles').get();assert.equal(p.name,'Test Customer');assert.equal(p.date_of_birth,'1995-06-15');assert.equal((await f.call('login',{phone:f.input.phone,pin:f.input.pin})).status,200)});
test('invalid registration details never create an account',async()=>{for(const patch of [{name:''},{name:'A'},{name:'A\u0000B'},{dateOfBirth:''},{dateOfBirth:'2025-02-30'},{dateOfBirth:'2999-01-01'},{dateOfBirth:'1899-01-01'}]){const f=fixture();await assert.rejects(f.call('register',{...f.input,...patch}),e=>e.status===400);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM profiles').get().n,0)}});

test('signup requires a gender selection and saves supported choices', async () => {
 const f = fixture();
 await assert.rejects(f.call('register', {...f.input, gender: 'invalid'}), /valid gender/);
 const response = await f.call('register', {...f.input, gender: 'female'});
 const profile = await readPinSession(f.d, response.headers.get('set-cookie'));
 assert.equal(profile.gender, 'female');
 for (const gender of [undefined, '', null, 'nonbinary']) {
  const missing = fixture();
  await assert.rejects(missing.call('register', {...missing.input, gender}), /valid gender/);
  assert.equal(missing.sql.prepare('SELECT COUNT(*) n FROM profiles').get().n, 0);
 }
 const undisclosed = fixture();
 assert.equal((await readPinSession(undisclosed.d, await undisclosed.register())).gender, 'undisclosed');
});


test('PIN reset requires SMS configuration and never changes credentials without it',async()=>{
 const f=fixture();await f.register();
 await assert.rejects(f.call('reset/request'),e=>e.status===503);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM pin_sessions').get().n,1);
});

test('paused OTP leaves PIN sign-in active and blocks SMS even with provider credentials', async () => {
 const settings = {...config, PIN_AUTH_OTP_ENABLED:'false', CUSTOMER_OTP_ONLY:'true',
  MSG91_AUTH_KEY:'fixture', MSG91_OTP_TEMPLATE_ID:'fixture',
  TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32), TWILIO_AUTH_TOKEN:'fixture', TWILIO_VERIFY_SERVICE_SID:'VA'+'b'.repeat(32)};
 const f=fixture(settings);
 try {
  await f.register();
  assert.equal((await f.call('login')).status,200);
  const state=await (await f.call('session')).json();
  assert.equal(state.otpAvailable,false);
  assert.equal(state.otpOnly,false);
  assert.equal(state.pinResetAvailable,false);
  const otp=createPinReset(f.d,settings,async()=>assert.fail('SMS must not be sent while paused'));
  const request=new Request('https://cafe.test',{method:'POST'});
  for (const path of ['auth/pin/otp/request','auth/pin/signup-otp/request','auth/pin/reset/request','auth/admin/otp/request']) {
   await assert.rejects(otp(path,request,f.input,path.startsWith('auth/admin/')),error=>error.status===503);
  }
 } finally { f.sql.close(); }
});

test('OTP reset changes the PIN only after approval, consumes challenge and revokes sessions',async()=>{
 const f=fixture();await f.register();
 const env={...config,PIN_AUTH_OTP_ENABLED:'true',TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'fixture',TWILIO_VERIFY_SERVICE_SID:'VA'+'b'.repeat(32)};
 const send=async(url,options)=>{
  const body=new URLSearchParams(options.body);
  if(url.endsWith('/VerificationCheck'))return Response.json({status:body.get('Code')==='456789'?'approved':'pending',to:body.get('To')});
  return Response.json({status:'pending'});
 };
 const reset=createPinReset(f.d,env,send);
 const req=new Request('https://cafe.test/api/auth/pin/reset/confirm',{method:'POST',headers:{origin:'https://cafe.test'}});
 const {challenge}=await (await reset('auth/pin/reset/request',req,{phone:f.input.phone})).json();
 const input={phone:f.input.phone,challenge,pin:'975310',confirmPin:'975310'};
 await assert.rejects(reset('auth/pin/reset/confirm',req,{...input,code:'111111'}),/invalid or expired/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM pin_sessions').get().n,1);
 await reset('auth/pin/reset/confirm',req,{...input,code:'456789'});
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM pin_sessions').get().n,0);
 await assert.rejects(reset('auth/pin/reset/confirm',req,{...input,code:'456789'}),/invalid or expired/);
 await f.call('login',{...f.input,pin:'975310'});
 await assert.rejects(f.call('login'),e=>e.status===401);
});

test('reset challenges cannot be used for a different phone or after expiry',async()=>{
 const f=fixture();await f.register();
 const env={...config,PIN_AUTH_OTP_ENABLED:'true',TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'fixture',TWILIO_VERIFY_SERVICE_SID:'VA'+'b'.repeat(32)};
 const reset=createPinReset(f.d,env,async()=>Response.json({status:'pending'}));
 const req=new Request('https://cafe.test',{method:'POST'});
 const {challenge}=await (await reset('auth/pin/reset/request',req,{phone:f.input.phone})).json();
 const input={phone:'9999999902',challenge,code:'456789',pin:'975310',confirmPin:'975310'};
 await assert.rejects(reset('auth/pin/reset/confirm',req,input),/invalid or expired/);
 f.sql.exec('UPDATE pin_reset_challenges SET expires_at=0');
 await assert.rejects(reset('auth/pin/reset/confirm',req,{...input,phone:f.input.phone}),/invalid or expired/);
});

test('MSG91 signs into the existing account and binds each code to its intended action', async () => {
 const f = fixture();
 const oldCookie = await f.register();
 const profile = await readPinSession(f.d, oldCookie);
 const env = {...config, PIN_AUTH_OTP_ENABLED:'true', MSG91_AUTH_KEY:'fixture', MSG91_OTP_TEMPLATE_ID:'test-template'};
 const sent = [];
 const otp = createPinReset(f.d,env,async (url, options) => {
  assert.equal(url.origin,'https://control.msg91.com');
  assert.equal(url.searchParams.get('template_id'),'test-template');
  assert.equal(url.searchParams.get('mobile'),'919999999901');
  assert.equal(options.headers.authkey,'fixture');
  sent.push(url.searchParams.get('otp'));
  return Response.json({type:'success',request_id:'fixture'});
 });
 const req=new Request('https://cafe.test',{method:'POST'});
 const phone=f.input.phone;
 const {challenge}=await (await otp('auth/pin/otp/request',req,{phone})).json();
 const resetInput={phone,pin:'975310',confirmPin:'975310'};
 await assert.rejects(otp('auth/pin/reset/confirm',req,{...resetInput,challenge,code:sent[0]}),/invalid or expired/);
 const signedIn=await otp('auth/pin/otp/confirm',req,{phone,challenge,code:sent[0]});
 assert.equal((await readPinSession(f.d,signedIn.headers.get('set-cookie'))).id,profile.id);
 await assert.rejects(otp('auth/pin/otp/confirm',req,{phone,challenge,code:sent[0]}),/invalid or expired/);
 const reset=await (await otp('auth/pin/reset/request',req,{phone})).json();
 await otp('auth/pin/reset/confirm',req,{...resetInput,challenge:reset.challenge,code:sent[1]});
 assert.equal(await readPinSession(f.d,oldCookie),null);
 assert.equal((await f.call('login',{phone,pin:resetInput.pin})).status,200);
 await otp('auth/pin/otp/request',req,{phone:'9999999902'});
 assert.equal(sent.length,2);
});

test('OTP-only mode creates accounts without a PIN and blocks customer PIN routes', async () => {
 const env={...config,PIN_AUTH_OTP_ENABLED:'true',CUSTOMER_OTP_ONLY:'true',MSG91_AUTH_KEY:'fixture',MSG91_OTP_TEMPLATE_ID:'test-template'};
 const f=fixture(env);
 assert.equal((await (await f.call('session')).json()).otpOnly,true);
 await assert.rejects(f.call('register'),error=>error.status===410);
 await assert.rejects(f.call('login'),error=>error.status===410);
 await assert.rejects(f.call('reset/request'),error=>error.status===410);
 let code;
 const route=createPinReset(f.d,env,async url=>{
  code=url.searchParams.get('otp');
  return Response.json({type:'success'});
 });
 const req=new Request('https://cafe.test',{method:'POST'});
 const {phone,name,dateOfBirth,gender}=f.input;
 const details={phone,name,dateOfBirth,gender};
 const {challenge}=await (await route('auth/pin/signup-otp/request',req,details)).json();
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM profiles').get().n,0);
 const response=await route('auth/pin/signup-otp/confirm',req,{...details,challenge,code});
 assert.equal((await readPinSession(f.d,response.headers.get('set-cookie'))).name,'Test Customer');
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM profiles').get().n,1);
 await assert.rejects(route('auth/pin/signup-otp/confirm',req,{...details,challenge,code}),/invalid or expired/);
});

test('staff OTP only sends to allowlisted accounts and creates a separate staff session', async () => {
 const f = fixture();
 await f.register();
 const {phone} = f.input;
 const env = {...config, PIN_AUTH_OTP_ENABLED:'true', STAFF_ONLY_PHONES:phone, MSG91_AUTH_KEY:'fixture', MSG91_OTP_TEMPLATE_ID:'fixture'};
 const sent = [];
 const route = createPinReset(f.d,env,async url => {
  sent.push(url.searchParams.get('otp'));
  return Response.json({type:'success'});
 });
 const req = new Request('https://cafe.test/api/auth/admin/otp/request',{method:'POST'});
 await f.call('register',{...f.input,phone:'9999999902'});
 await route('auth/admin/otp/request',req,{phone:'9999999902'},true);
 assert.equal(sent.length,0);
 const {challenge} = await (await route('auth/admin/otp/request',req,{phone},true)).json();
 assert.equal(sent.length,1);
 await assert.rejects(route('auth/pin/otp/confirm',req,{phone,challenge,code:sent[0]}),/invalid or expired/);
 const result = await route('auth/admin/otp/confirm',req,{phone,challenge,code:sent[0]},true);
 const cookie = result.headers.get('set-cookie');
 assert.match(cookie,/^espresso_staff_pin=/);
 assert.match(cookie,/SameSite=Strict/);
 assert.equal(await readPinSession(f.d,cookie),null);
 assert.equal(await readPinSession(f.d,cookie,undefined,undefined,staffPinCookie),null);
 assert.equal((await readPinSession(f.d,cookie,undefined,undefined,staffPinCookie,true)).name,'Test Customer');
 assert.equal((await readStaffPinSession(f.d,cookie,false)).name,'Test Customer');
 const pinResponse=await createPinAuth(f.d,env).route('auth/pin/login',req,f.input,true);
 const pinStaffCookie=pinResponse.headers.get('set-cookie');
 assert.equal((await readStaffPinSession(f.d,pinStaffCookie,false)).name,'Test Customer');
 assert.equal(await readStaffPinSession(f.d,pinStaffCookie,true),null);
 await assert.rejects(route('auth/admin/otp/confirm',req,{phone,challenge,code:sent[0]},true),/invalid or expired/);
});

test('MSG91 WhatsApp OTP signs into the same customer account, rejects replay and enforces resend delay',async()=>{
 const f=fixture();const previousCookie=await f.register();const previous=await readPinSession(f.d,previousCookie);
 const e={...config,PIN_AUTH_OTP_ENABLED:'true',CUSTOMER_OTP_ONLY:'true',OTP_DELIVERY_CHANNEL:'whatsapp',MSG91_AUTH_KEY:'fixture',MSG91_WHATSAPP_NUMBER:'919000000000',MSG91_WHATSAPP_TEMPLATE:'cafe_signin',MSG91_WHATSAPP_NAMESPACE:'fixture_namespace',MSG91_WHATSAPP_LANGUAGE:'en'};
 let code;let sends=0;
 const route=createPinReset(f.d,e,async(url,options)=>{
  sends++;assert.equal(url,'https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/');assert.equal(options.redirect,'manual');
  assert.equal(options.headers.authkey,'fixture');const data=JSON.parse(options.body);
  assert.equal(data.integrated_number,e.MSG91_WHATSAPP_NUMBER);const recipient=data.payload.template.to_and_components[0];
  assert.deepEqual(recipient.to,['919999999901']);code=recipient.components.body_1.value;
  assert.match(code,/^\d{6}$/);assert.equal(recipient.components.button_1.value,code);
  return Response.json({status:'success',hasError:false,errors:null,request_id:'fixture-request'});
 });
 const req=new Request('https://cafe.test',{method:'POST'}),phone=f.input.phone;
 const body=await (await route('auth/pin/otp/request',req,{phone})).json();assert.equal(body.channel,'whatsapp');assert.equal(body.code,undefined);assert.equal(sends,1);
 const stored=f.sql.prepare('SELECT account_hash FROM pin_reset_challenges').get();assert.ok(!stored.account_hash.endsWith(':'+code));
 await assert.rejects(route('auth/pin/otp/request',req,{phone}),e=>e.status===429);assert.equal(sends,1);
 const signed=await route('auth/pin/otp/confirm',req,{phone,challenge:body.challenge,code});
 assert.equal((await readPinSession(f.d,signed.headers.get('set-cookie'))).id,previous.id);
 await assert.rejects(route('auth/pin/otp/confirm',req,{phone,challenge:body.challenge,code}),/invalid or expired/);
 assert.equal((await readPinSession(f.d,previousCookie)).id,previous.id);
});

test('WhatsApp OTP requires configured sender, never falls back to SMS and rejects rejected provider responses',async()=>{
 const f=fixture();await f.register();let calls=0;
 const e={...config,PIN_AUTH_OTP_ENABLED:'true',CUSTOMER_OTP_ONLY:'true',OTP_DELIVERY_CHANNEL:'whatsapp',MSG91_AUTH_KEY:'fixture',MSG91_OTP_TEMPLATE_ID:'sms-template'};
 const unavailable=createPinReset(f.d,e,async()=>{calls++;return Response.json({type:'success'});});
 const req=new Request('https://cafe.test',{method:'POST'});
 await assert.rejects(unavailable('auth/pin/otp/request',req,{phone:f.input.phone}),e=>e.status===503);assert.equal(calls,0);
 const configured={...e,MSG91_WHATSAPP_NUMBER:'919000000000',MSG91_WHATSAPP_TEMPLATE:'cafe_signin',MSG91_WHATSAPP_NAMESPACE:'fixture_namespace',MSG91_WHATSAPP_LANGUAGE:'en'};
 const failed=createPinReset(f.d,configured,async()=>Response.json({status:'error',hasError:true,request_id:'bad'}));
 const result=await (await failed('auth/pin/otp/request',req,{phone:f.input.phone})).json();
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM pin_reset_challenges').get().n,0);
 await assert.rejects(failed('auth/pin/otp/confirm',req,{phone:f.input.phone,challenge:result.challenge,code:'123456'}),/invalid or expired/);
});

test('WhatsApp verified admin gets staff-only session and expired WhatsApp codes cannot sign in',async()=>{
 const f=fixture();await f.register();const phone=f.input.phone;
 const e={...config,PIN_AUTH_OTP_ENABLED:'true',OTP_DELIVERY_CHANNEL:'whatsapp',STAFF_ONLY_PHONES:phone,MSG91_AUTH_KEY:'fixture',MSG91_WHATSAPP_NUMBER:'919000000000',MSG91_WHATSAPP_TEMPLATE:'cafe_signin',MSG91_WHATSAPP_NAMESPACE:'fixture_namespace',MSG91_WHATSAPP_LANGUAGE:'en'};
 let code;const route=createPinReset(f.d,e,async(_url,options)=>{code=JSON.parse(options.body).payload.template.to_and_components[0].components.body_1.value;return Response.json({status:'success',request_id:'fixture-request'});});
 const req=new Request('https://cafe.test',{method:'POST'});
 let body=await (await route('auth/admin/otp/request',req,{phone},true)).json();
 const signed=await route('auth/admin/otp/confirm',req,{phone,challenge:body.challenge,code},true);
 assert.equal((await signed.json()).destination,'admin');const cookie=signed.headers.get('set-cookie');assert.equal(await readPinSession(f.d,cookie),null);
 assert.ok(await readPinSession(f.d,cookie,undefined,undefined,staffPinCookie,true));
 f.sql.prepare('DELETE FROM pin_login_attempts').run();
 body=await (await route('auth/admin/otp/request',req,{phone},true)).json();f.sql.prepare('UPDATE pin_reset_challenges SET expires_at=0').run();
 await assert.rejects(route('auth/admin/otp/confirm',req,{phone,challenge:body.challenge,code},true),/invalid or expired/);
});

test('MSG91 cloud templates accept null namespace while pending review blocks delivery',async()=>{
 const e={MSG91_AUTH_KEY:'fixture',MSG91_WHATSAPP_NUMBER:'919000000000',MSG91_WHATSAPP_TEMPLATE:'cafe_signin',MSG91_WHATSAPP_LANGUAGE:'en'};
 assert.equal(msg91WhatsAppReady(e),true);
 let count=0;
 await sendMsg91WhatsAppOtp(e,'+919000000001','246810',async(_url,options)=>{
  count++;assert.equal(JSON.parse(options.body).payload.template.namespace,null);
  return Response.json({status:'success',request_id:'fixture'});
 });
 const pending={...e,MSG91_WHATSAPP_TEMPLATE_APPROVED:'false'};
 assert.equal(msg91WhatsAppReady(pending),false);
 await assert.rejects(sendMsg91WhatsAppOtp(pending,'+919000000001','246810',async()=>{count++;}),/being connected/);
 assert.equal(count,1);
});

test('both configured admins sign into Admin with WhatsApp proof; customer routes remain separate',async()=>{
 for(const phone of ['8220025037','8904397434']){
  const f=fixture();f.input.phone=phone;await f.register();
  const e={...config,PIN_AUTH_OTP_ENABLED:'true',CUSTOMER_OTP_ONLY:'true',OTP_DELIVERY_CHANNEL:'whatsapp',STAFF_ONLY_PHONES:'8220025037,8904397434',STAFF_ORDER_OPERATOR_PHONES:'8220025037,8904397434',MSG91_AUTH_KEY:'fixture',MSG91_WHATSAPP_NUMBER:'919000000000',MSG91_WHATSAPP_TEMPLATE:'cafe_signin',MSG91_WHATSAPP_LANGUAGE:'en'};
  let code;const route=createPinReset(f.d,e,async(_url,options)=>{
   const recipient=JSON.parse(options.body).payload.template.to_and_components[0];
   assert.deepEqual(recipient.to,['91'+phone]);code=recipient.components.body_1.value;
   return Response.json({status:'success',request_id:'fixture'});
  });
  const req=new Request('https://cafe.test/api/auth/pin/otp/request',{method:'POST',headers:{origin:'https://cafe.test'}});
  const challenge=await(await route('auth/pin/otp/request',req,{phone},true)).json();
  const signed=await route('auth/pin/otp/confirm',req,{phone,challenge:challenge.challenge,code},true);
  assert.equal((await signed.json()).destination,'admin');
  const cookie=signed.headers.get('set-cookie');assert.match(cookie,/^espresso_staff_pin=/);
  assert.equal(await readPinSession(f.d,cookie),null);
  assert.ok(await readPinSession(f.d,cookie,undefined,undefined,staffPinCookie,true));
  assert.equal(staffRole(phone,e),'operator');
  // A later login from another phone creates an independent session. It must
  // not revoke the first phone or require a customer session.
  f.sql.exec('UPDATE pin_login_attempts SET created_at=created_at-61');
  const nextRequest=new Request(req,{headers:{origin:'https://cafe.test','cf-connecting-ip':'second-phone'}});
  const nextChallenge=await(await route('auth/pin/otp/request',nextRequest,{phone},true)).json();
  const second=await route('auth/pin/otp/confirm',nextRequest,{phone,challenge:nextChallenge.challenge,code},true);
  const secondCookie=second.headers.get('set-cookie');
  assert.notEqual(cookie,secondCookie);
  assert.equal((await second.json()).destination,'admin');
  const firstSession=await readPinSession(f.d,cookie,undefined,undefined,staffPinCookie,true);
  const secondSession=await readPinSession(f.d,secondCookie,undefined,undefined,staffPinCookie,true);
  assert.ok(firstSession);assert.equal(firstSession.id,secondSession.id);
  assert.equal(await readPinSession(f.d,secondCookie),null);
  await assert.rejects(createPinAuth(f.d,e).route('auth/pin/signup-otp/request',req,{...f.input}),error=>error.status===403);
  await assert.rejects(route('auth/pin/otp/request',new Request(req,{headers:{origin:'https://other.test'}}),{phone},true),error=>error.status===403);
 }
});
