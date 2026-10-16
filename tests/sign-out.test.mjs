import test from 'node:test';
import assert from 'node:assert/strict';
import {signOutSession} from '../lib/sign-out.ts';
test('tester and phone logout clear both cookies before returning home',async()=>{
 const calls=[];
 const destination=await signOutSession(async(path)=>{calls.push(path);return path==='bootstrap'?{user:null}:{ok:true}});
 assert.equal(destination,'/#home');assert.deepEqual(calls,['auth/pin/logout','auth/admin/logout','auth/phone/logout','tester-session/logout','bootstrap']);
});
test('underlying hosted identity is signed out instead of silently signing back in',async()=>{
 assert.equal(await signOutSession(async path=>path==='bootstrap'?{user:{authProvider:'chatgpt'}}:{ok:true}),'/signout-with-chatgpt?return_to=%2F%23home');
});
test('failure still attempts both logout endpoints and prevents false success',async()=>{
 const calls=[];await assert.rejects(signOutSession(async path=>{calls.push(path);if(path==='auth/phone/logout')throw Error('offline');return {ok:true}}),/offline/);
 assert.deepEqual(calls,['auth/pin/logout','auth/admin/logout','auth/phone/logout','tester-session/logout']);
});

test('PIN sign-out revokes the customer session without signing out an administrator',async()=>{const calls=[];assert.equal(await signOutSession(async p=>{calls.push(p);return{ok:true}},'pin'),'/#home');assert.deepEqual(calls,['auth/pin/logout']);});
