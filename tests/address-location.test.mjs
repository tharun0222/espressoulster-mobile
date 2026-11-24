import test from 'node:test';
import assert from 'node:assert/strict';
import {addressLocation,currentLocation,ensureDirectionsLocationEnabled} from '../lib/address-location.ts';
test('directions checks Android location settings before starting GPS and leaves ordinary browsers alone',t=>{
 const previous=globalThis.window;
 t.after(()=>{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;});
 globalThis.window={prompt:()=>assert.fail('Ordinary browsers never use the native prompt')};
 assert.doesNotThrow(ensureDirectionsLocationEnabled);
 globalThis.window={espressoLocationSettings:true,prompt(command){assert.equal(command,'espresso:location:enable');return 'disabled';}};
 assert.throws(ensureDirectionsLocationEnabled,{reason:'off'});
 window.prompt=()=>'enabled';
 assert.doesNotThrow(ensureDirectionsLocationEnabled);
});
test('optional location pins preserve valid coordinates and reject invalid inputs',()=>{
 assert.equal(addressLocation(undefined),null);
 assert.deepEqual(addressLocation({latitude:12.9716,longitude:77.5946}),{latitude:12.9716,longitude:77.5946});
 for(const p of [{latitude:91,longitude:0},{latitude:0,longitude:181},{latitude:NaN,longitude:0},{latitude:'12',longitude:77},{}])assert.throws(()=>addressLocation(p));
});
test('location keeps listening for a better fix and stops on success, timeout or cancellation', async (t) => {
 const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
 let position, fail;
 const cleared = [];
 globalThis.window = {isSecureContext:true};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
 t.after(() => {delete globalThis.window; Object.defineProperty(globalThis,'navigator',original);});
 t.mock.timers.enable({apis:['setTimeout']});
 const controller = new AbortController();
 await assert.rejects(currentLocation(controller.signal), {reason:'unsupported'});
 navigator.geolocation = {
  watchPosition(success, error) {position = success; fail = error; return 12;},
  clearWatch(id) {cleared.push(id);},
 };
 const fix = accuracy => position({coords:{latitude:12.934, longitude:77.63, accuracy}});
 let result = currentLocation(controller.signal);
 fix(500);
 t.mock.timers.tick(8000);
 fix(42);
 assert.equal((await result).accuracy,42);
 assert.deepEqual(cleared,[12]);
 result = currentLocation(controller.signal);
 fix(165);
 fix(235);
 t.mock.timers.tick(20000);
 assert.equal((await result).accuracy,165);
 for (const [reason, report] of [['approximate',() => fix(500)],['timeout',() => {}],['permission',() => fail({code:1})]]) {
  result = currentLocation(controller.signal);
  report();
  t.mock.timers.tick(20000);
  await assert.rejects(result,{reason});
 }
 result = currentLocation(controller.signal);
 controller.abort();
 await assert.rejects(result,{name:'AbortError'});
 assert.equal(cleared.length,6);
});
