import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import {hashTesterToken} from '../lib/tester-auth.ts';

const source=readFileSync(new URL('../lib/android-admin-access.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(diagnostics){
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync(new URL('../drizzle/0036_android_admin.sql',import.meta.url),'utf8'));
 const logs=[];
 const env={ADMIN_ANDROID_ONLY:'true',ANDROID_ADMIN_DIAGNOSTICS:diagnostics?'true':'false'};
 const d={prepare(q){return {bind(...args){return {async first(){return sql.prepare(q).get(...args)||null},async run(){return {meta:sql.prepare(q).run(...args)}}}}}},async batch(statements){const results=[];for(const s of statements)results.push(await s.run());return results}};
 const dependencies={
  'cloudflare:workers':{env},
  './server':{body:req=>req.json(),db:()=>d,json:value=>Response.json(value)},
  './tester-auth':{hashTesterToken},
  './pricing':{assert:(value,message,status)=>{if(!value)throw Object.assign(Error(message),{status})}},
  './android-admin-attestation':{verifyAndroidProof:(_chain,_challenge,_signature,_revocations,report)=>{report('boot_unverified');return false}},
  './msg91-otp':{msg91Ready:()=>false},
  './msg91-whatsapp':{usesWhatsAppOtp:()=>false},
 };
 const context={exports:{},require:name=>{assert.ok(name in dependencies,name);return dependencies[name]},process:{env:{NODE_ENV:'production'}},Buffer,crypto,Date,Response,Request,AbortSignal,fetch:async()=>Response.json({entries:{}}),console:{info:(...args)=>logs.push(args)}};
 vm.runInNewContext(compiled,context);
 const request=(path,body)=>new Request('https://cafe.test/api/'+path,body?{method:'POST',body:JSON.stringify(body)}:{});
 return {...context.exports,sql,logs,request};
}

test('Android verification diagnostics are off by default and never alter the status response',async()=>{
 const f=fixture(false);
 const result=await f.androidAdminRoute('auth/android-admin/status',f.request('auth/android-admin/status'));
 assert.deepEqual(await result.json(),{verified:false,required:true});assert.deepEqual(f.logs,[]);
});

test('enabled Android diagnostics emit only stage and reason enums, without proof or session material',async()=>{
 const f=fixture(true);
 await f.androidAdminRoute('auth/android-admin/status',f.request('auth/android-admin/status'));
 const challenge=await(await f.androidAdminRoute('auth/android-admin/challenge',f.request('auth/android-admin/challenge'))).json();
 const proof={challenge:challenge.challenge,certificates:['cHJpdmF0ZS1jZXJ0','cHJpdmF0ZS1yb290'],signature:'cHJpdmF0ZS1zaWc='};
 await assert.rejects(f.androidAdminRoute('auth/android-admin/verify',f.request('auth/android-admin/verify',proof)),error=>error.status===403);
 assert.deepEqual(f.logs.map(log=>[log[0],JSON.parse(log[1])]),[
  ['[android-admin]',{stage:'status',reason:'unverified'}],
  ['[android-admin]',{stage:'challenge',reason:'issued'}],
  ['[android-admin]',{stage:'verify',reason:'boot_unverified'}],
 ]);
 const serialized=JSON.stringify(f.logs);
 for(const value of [proof.challenge,...proof.certificates,proof.signature])assert.equal(serialized.includes(value),false);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM android_admin_access').get().n,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM android_admin_challenges').get().n,0);
});
