import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {singleFlight} from '../lib/customer-flow.ts';
import {resolveOrderType, orderTypeStorageKey} from '../lib/order-type.ts';

test('overlapping reads share one request but completed responses are not cached',async()=>{
 let calls=0,release;
 const run=singleFlight(()=>{calls++;return new Promise(resolve=>{release=resolve;});});
 const first=run(),second=run();assert.equal(first,second);
 await Promise.resolve();assert.equal(calls,1);release('first');assert.equal(await second,'first');
 const third=run();await Promise.resolve();assert.equal(calls,2);release('next');assert.equal(await third,'next');
});
test('a failed shared read releases its slot so a retry can recover',async()=>{
 let calls=0;const run=singleFlight(async()=>{if(++calls===1)throw Error('offline');return 'online';});
 const first=run(),second=run();assert.equal(first,second);await assert.rejects(first,/offline/);
 assert.equal(await run(),'online');assert.equal(calls,2);
});

const source=fs.readFileSync(new URL('../app/store-app.tsx',import.meta.url),'utf8');
const start=source.indexOf('  function acceptBootstrap(');
const end=source.indexOf('\n\n  useEffect(() => {',start);
const loadSource=source.slice(start,end)+'\nexports.load=load;exports.retryLoad=retryLoad;';
const compiled=ts.transpileModule(loadSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness({favoriteFails=false,cartFails=false}={}){
 const state={cart:[],favorites:[],ready:false,error:'',calls:[],saves:0};
 const context={exports:{},useCallback:f=>f,accountOwner:{current:null},keyRef:{current:''},setQuote:()=>{},initialLoad:{current:null},cartOwner:{current:''},favoritesOwner:{current:''},savedCart:{current:''},pendingCart:{current:null},bootstrapRequest:{current:async()=>({user:{userId:'customer-a',profile:{name:'A',phone:''}}})},
  api:async path=>{state.calls.push(path);if(path==='cart'){if(cartFails)throw Error('cart offline');return {items:[{productId:'latte',quantity:1}]};}if(favoriteFails)throw Error('favorites offline');return {ids:['latte']};},
  setData:()=>{},setCart:value=>{state.cart=JSON.parse(JSON.stringify(value));},setFavoriteIds:value=>{state.favorites=JSON.parse(JSON.stringify(value));},setContact:()=>{},setCartReady:value=>{state.ready=value;},setError:value=>{state.error=value;},
  setTrackingOrderId:()=>{},setChatOrderId:()=>{},setDetailsOrderId:()=>{},setOrders:()=>{},rememberPinPhone:()=>{},
  resolveOrderType,orderTypeStorageKey,defaultSettings:{pickupEnabled:true,dineInEnabled:true},setFulfillment:()=>{},
  sessionStorage:{getItem:()=>null},window:{location:{href:'https://cafe.test/#home'}},URL,
  homeRevision:{current:'default'},defaultHomeDesignRevision:'default',previewingHome:false,
  flushCart:async()=>{state.saves++;context.pendingCart.current=null;},Promise,String,
 };
 vm.runInNewContext(compiled,context);return {...context.exports,state,context};
}
test('a favourites read failure does not prevent the saved cart from becoming ready',async()=>{
 const h=harness({favoriteFails:true});await h.load();
 assert.equal(h.state.ready,true);assert.equal(h.state.cart[0].quantity,1);assert.match(h.state.error,/favourites/);
});
test('retry preserves local cart changes and flushes a pending save before refreshing',async()=>{
 const h=harness();await h.load();h.state.cart=[{productId:'latte',quantity:3}];h.context.pendingCart.current=h.state.cart;
 await h.retryLoad();assert.equal(h.state.saves,1);assert.equal(h.state.cart[0].quantity,3);assert.equal(h.state.calls.filter(path=>path==='cart').length,1);
});
test('a failed cart hydration stays blocked and can be retried without marking it loaded',async()=>{
 const h=harness({cartFails:true});await h.load();assert.equal(h.state.ready,false);assert.equal(h.context.cartOwner.current,'');
 h.context.api=async path=>path==='cart'?{items:[{productId:'latte',quantity:2}]}:{ids:[]};
 await h.retryLoad();assert.equal(h.state.ready,true);assert.equal(h.state.cart[0].quantity,2);
});

test('a cart read from a previous account cannot replace the new account state',async()=>{
 const h=harness();let release;
 h.context.api=path=>path==='cart'?new Promise(resolve=>{release=resolve;}):Promise.resolve({ids:[]});
 const loading=h.load();await new Promise(resolve=>setImmediate(resolve));
 h.context.accountOwner.current='customer-b';h.state.cart=[{productId:'b',quantity:4}];
 release({items:[{productId:'old-a',quantity:1}]});await loading;
 assert.equal(h.state.cart[0].productId,'b');assert.equal(h.context.cartOwner.current,'');
});

test('customer JSON rejects HTTP failures and times out stalled requests',async()=>{
 const {customerJson}=await import('../lib/customer-flow.ts');const previous=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'Temporary subscription failure'}),{status:503,headers:{'Content-Type':'application/json'}});
  await assert.rejects(customerJson('subscriptions/config'),/Temporary subscription failure/);
  globalThis.fetch=(url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Error('aborted')));});
  await assert.rejects(customerJson('subscriptions',{timeoutMs:5}),/timed out/);
 }finally{globalThis.fetch=previous;}
});
