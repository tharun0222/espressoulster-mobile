import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {canSeeStaffPanel} from '../lib/staff-panel-access.ts';

const source=fs.readFileSync(new URL('../lib/server.ts',import.meta.url),'utf8');
const identitySource=source.slice(source.indexOf('export async function identity('),source.indexOf('export function mutationGuard('));
const compiled=ts.transpileModule(identitySource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function setup({admin=true,tester=true,chat=null,adminOnly=true,pinMode=false,pinProfile=null,androidOnly=false,verifiedAndroid=false,localStaff=false,staffPhone='9000000000',staffAccess='operator',staffPhoneAuth=false,otpDeviceIndependent=false,staffOtpVerified=true}={}){
  let adminChecks=0;
  const customer={id:'tester-customer',email:'customer@tester.invalid',name:'Customer',phone:''};
  const context={exports:{},env:{CUSTOMER_AUTH_MODE:pinMode?'pin':'legacy',PUBLIC_TEST_MODE:'true',ADMIN_PASSWORD_LOGIN_ONLY:adminOnly?'true':'false'},pinReady:()=>true,readPinSession:async()=>pinProfile,readStaffPinSession:async()=>pinProfile,headers:async()=>new Headers({cookie:'test-customer-and-admin'}),phoneSessionToken:()=>null,testerToken:()=>tester?'test-token':null,hashTesterToken:async v=>v,passwordAdmin:async()=>{adminChecks++;return admin?{userId:'password-admin',admin:true}:null},getChatGPTUser:async()=>chat,assert:(v,m,status)=>{if(!v)throw Object.assign(Error(m),{status})},db:()=>({prepare:sql=>({bind:()=>({first:async()=>sql.includes('tester_sessions')?customer:sql.includes('WHERE id=')&&tester?customer:null})})})};
  Object.assign(context, {
    androidAdminRequired: () => androidOnly && !otpDeviceIndependent,
    androidAdminAccess: async () => verifiedAndroid,
    requireAndroidAdmin: async () => context.assert(otpDeviceIndependent || !androidOnly || verifiedAndroid, 'Android app required', 403),
    pinToken: () => null,
    staffPinCookie: 'espresso_staff_pin',
    localStaffPreview: () => localStaff,
    staffOtpRequired: () => otpDeviceIndependent,
    staffPhoneAuthRequired: () => staffPhoneAuth || otpDeviceIndependent,
    staffOtpDeviceIndependent: () => otpDeviceIndependent,
    canSeeStaffPanel,
    staffRole: phone => phone === '9000000000' ? staffAccess : null,
  });
  context.readStaffPinSession=async(_db,_cookie,requiresOtp)=>requiresOtp&&!staffOtpVerified?null:pinProfile;
  const prepare = context.db().prepare;
  context.db = () => ({ prepare: sql => sql.includes('pin_accounts') ? { bind: () => ({ first: async () => ({ phone: staffPhone }) }) } : prepare(sql) });
  vm.runInNewContext(compiled,context);
  return {...context.exports,adminChecks:()=>adminChecks};
}
test('customer identity stays unchanged when an admin cookie appears or disappears on Stripe return',async()=>{
  for(const admin of [true,false]){
    const s=setup({admin});
    const user=await s.identity(true);
    assert.equal(user.userId,'tester-customer');
    assert.equal(user.admin,false);
    assert.equal(s.adminChecks(),0);
  }
});
test('local editor can sign in as staff without gaining order controls', async () => {
  const pinProfile = {id:'staff-id',name:'Staff member',email:'staff@example.test'};
  const editor = setup({localStaff:true,pinProfile,staffAccess:'editor'});
  assert.equal(editor.canManageStaffOrders(await editor.adminIdentity()),false);
  assert.equal(editor.adminChecks(),0);
  const operator = setup({localStaff:true,pinProfile});
  assert.equal(operator.canManageStaffOrders(await operator.adminIdentity()),true);
  await assert.rejects(setup({localStaff:true,androidOnly:true,pinProfile}).adminIdentity(),error=>error.status===403);
});
test('Android-only admin requires a verified app and an approved staff account', async () => {
  const staff = {id:'staff-id',name:'Staff member',email:'staff@example.test'};
  const unverified = setup({androidOnly:true,pinProfile:staff});
  await assert.rejects(unverified.adminIdentity(), e => e.status === 403);
  assert.equal(unverified.adminChecks(),0);
  const signedOut = setup({androidOnly:true,verifiedAndroid:true});
  await assert.rejects(signedOut.adminIdentity(), e => e.status === 403);
  const unapproved = setup({androidOnly:true,verifiedAndroid:true,pinProfile:staff,staffPhone:'9000000001'});
  await assert.rejects(unapproved.adminIdentity(), e => e.status === 403);
  const approved = setup({androidOnly:true,verifiedAndroid:true,pinProfile:staff});
  assert.equal((await approved.adminIdentity()).userId,staff.id);
});
test('pausing staff OTP does not open browser admin', async () => {
  const staff = {id:'staff-id',name:'Staff member',email:'staff@example.test'};
  const browser = setup({staffPhoneAuth:true,pinProfile:staff});
  await assert.rejects(browser.adminIdentity(),error=>error.status===403);
  assert.equal(browser.adminChecks(),0);
  const android = setup({staffPhoneAuth:true,verifiedAndroid:true,pinProfile:staff});
  assert.equal((await android.adminIdentity()).userId,staff.id);
});
test('OTP device policy authenticates approved staff without hardware proof but rejects PIN-only and unapproved sessions',async()=>{
 const profile={id:'verified-staff',name:'Staff',email:''};
 const valid=setup({otpDeviceIndependent:true,androidOnly:true,pinProfile:profile});
 const staff=await valid.adminIdentity();
 assert.equal(staff.userId,profile.id);assert.equal(valid.canManageStaffOrders(staff),true);assert.equal(valid.adminChecks(),0);
 for(const settings of [{pinProfile:null},{pinProfile:profile,staffOtpVerified:false},{pinProfile:profile,staffPhone:'9000000001'}]){
  await assert.rejects(setup({otpDeviceIndependent:true,...settings}).adminIdentity(),error=>error.status===403);
 }
});
test('an admin cookie alone cannot authenticate a customer payment request',async()=>{
  const s=setup({tester:false});
  assert.equal(await s.identity(),null);
  await assert.rejects(s.identity(true),e=>e.status===401);
});
test('administrator routes retain password session access independently',async()=>{
  const s=setup();
  assert.equal((await s.adminIdentity()).userId,'password-admin');
  assert.equal((await s.identity(false,true)).userId,'password-admin');
  const expired=setup({admin:false});
  await assert.rejects(expired.adminIdentity(),e=>e.status===403);
});

test('PIN mode rejects legacy tester and hosted identities without a PIN session',async()=>{const s=setup({pinMode:true,chat:{userId:'hosted',email:'hosted@example.test'}});assert.equal(await s.identity(),null);await assert.rejects(s.identity(true),e=>e.status===401);assert.equal((await s.adminIdentity()).userId,'password-admin');});
test('PIN session is a customer identity and never grants administrator or phone verification privileges',async()=>{const s=setup({pinMode:true,pinProfile:{id:'pin-person',email:'pin-person@pin.invalid',name:'PIN customer'}});const u=await s.identity(true);assert.equal(u.userId,'pin-person');assert.equal(u.authProvider,'pin');assert.equal(u.admin,false);assert.equal(u.phoneVerified,false);});
