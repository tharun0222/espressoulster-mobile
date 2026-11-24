import test from 'node:test';
import assert from 'node:assert/strict';
import {X509Certificate} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {isTrustedAndroidRoot,verifyAndroidProof} from '../lib/android-admin-attestation.ts';

// Public Google trust anchors, including legacy RSA certificates and the 2026
// ECDSA root, sourced 20 Nov 2026 from Android's attestation documentation.
const anchors=JSON.parse(readFileSync(new URL('./fixtures/android-attestation-roots.json',import.meta.url),'utf8'));
test('all five published current and legacy Google Android root certificates remain trusted',()=>{
 assert.equal(anchors.length,5);
 for(const pem of anchors)assert.equal(isTrustedAndroidRoot(new X509Certificate(pem)),true);
});
test('a trusted root alone cannot stand in for an app-bound attestation chain',()=>{
 for(const pem of anchors){
  const root=new X509Certificate(pem);
  const reasons=[];
  assert.equal(verifyAndroidProof([root.raw.toString('base64')],'a'.repeat(64),'AAAA',{},reason=>reasons.push(reason)),false);
  assert.deepEqual(reasons,['attestation_extension_invalid']);
 }
});
test('a self-signed non-Google CA cannot enroll an Admin device',()=>{
 const directory=mkdtempSync(join(tmpdir(),'espresso-root-test-'));
 try{
  execFileSync('openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:prime256v1','-nodes','-days','1','-subj','/CN=Untrusted Fixture CA','-addext','basicConstraints=critical,CA:TRUE','-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem')],{stdio:'ignore'});
  const root=new X509Certificate(readFileSync(join(directory,'cert.pem')));
  assert.equal(root.ca,true);assert.equal(isTrustedAndroidRoot(root),false);
  const reasons=[];
  assert.equal(verifyAndroidProof([root.raw.toString('base64')],'a'.repeat(64),'AAAA',{},reason=>reasons.push(reason)),false);
  assert.deepEqual(reasons,['root_untrusted']);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
