import test from 'node:test';
import assert from 'node:assert/strict';
import {staffSignInRequest} from '../lib/staff-signin-request.ts';

async function withoutNativePrompt(work){
 const previous=globalThis.window;
 globalThis.window={espressoAndroidSignIn:true,prompt:()=>assert.fail('OTP sign-in must not start hardware verification')};
 try{return await work()}finally{globalThis.window=previous}
}

test('OTP sign-in forwards one request and its challenge without native device verification',async()=>withoutNativePrompt(async()=>{
 let calls=0;
 const response=Response.json({challenge:'a'.repeat(64)});
 const result=await staffSignInRequest(async()=>{calls++;return response});
 assert.equal(result.response,response);assert.equal(result.result.challenge,'a'.repeat(64));assert.equal(calls,1);
}));

test('staff denial stays denied and cannot trigger a device-based retry or grant Admin',async()=>withoutNativePrompt(async()=>{
 let calls=0;
 const response=Response.json({error:'Staff access is unavailable.',staffOnly:true},{status:403});
 const result=await staffSignInRequest(async()=>{calls++;return response});
 assert.equal(result.response,response);assert.equal(result.result.error,'Staff access is unavailable.');
 assert.equal(result.result.destination,undefined);assert.equal(calls,1);
}));

test('OTP network failure propagates without retrying or inventing a verification result',async()=>withoutNativePrompt(async()=>{
 let calls=0;
 await assert.rejects(staffSignInRequest(async()=>{calls++;throw Error('Offline')}),/Offline/);
 assert.equal(calls,1);
}));
