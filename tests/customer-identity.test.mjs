import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../lib/server.ts',import.meta.url),'utf8');
const identitySource=source.slice(source.indexOf('export async function identity('),source.indexOf('export function mutationGuard('));
const compiled=ts.transpileModule(identitySource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function setup({admin=true,tester=true,chat=null,adminOnly=true,pinMode=false,pinProfile=null}={}){
  let adminChecks=0;
  const customer={id:'tester-customer',email:'customer@tester.invalid',name:'Customer',phone:''};
  const context={exports:{},env:{CUSTOMER_AUTH_MODE:pinMode?'pin':'legacy',PUBLIC_TEST_MODE:'true',ADMIN_PASSWORD_LOGIN_ONLY:adminOnly?'true':'false'},pinReady:()=>true,readPinSession:async()=>pinProfile,headers:async()=>new Headers({cookie:'test-customer-and-admin'}),phoneSessionToken:()=>null,testerToken:()=>tester?'test-token':null,hashTesterToken:async v=>v,passwordAdmin:async()=>{adminChecks++;return admin?{userId:'password-admin',admin:true}:null},getChatGPTUser:async()=>chat,assert:(v,m,status)=>{if(!v)throw Object.assign(Error(m),{status})},db:()=>({prepare:sql=>({bind:()=>({first:async()=>sql.includes('tester_sessions')?customer:sql.includes('WHERE id=')&&tester?customer:null})})})};
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
