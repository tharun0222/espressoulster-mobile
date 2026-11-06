import test from 'node:test';
import assert from 'node:assert/strict';
import {addressLocation,currentLocation} from '../lib/address-location.ts';
test('optional location pins preserve valid coordinates and reject invalid inputs',()=>{
 assert.equal(addressLocation(undefined),null);
 assert.deepEqual(addressLocation({latitude:12.9716,longitude:77.5946}),{latitude:12.9716,longitude:77.5946});
 for(const p of [{latitude:91,longitude:0},{latitude:0,longitude:181},{latitude:NaN,longitude:0},{latitude:'12',longitude:77},{}])assert.throws(()=>addressLocation(p));
});
test('location denial and unsupported browsers leave manual address entry available',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 try{
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
  await assert.rejects(currentLocation(),/manually/);
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation:{getCurrentPosition(_success,error){error({code:1})}}}});
  await assert.rejects(currentLocation(),/permission was declined/);
 }finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}
});
