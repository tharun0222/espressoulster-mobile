import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { bottomNavOutline } from '../lib/bottom-nav-glass.ts';
import { paysAtCafe } from '../lib/order-payment.ts';
import { orderReference } from '../lib/order-reference.ts';
import { subscriptionBannerInk } from '../lib/subscription-catalog.ts';
import * as openingAds from '../lib/launch-advertisement.ts';
import * as publicMessages from '../lib/public-message.ts';

// Execute the real TSX components with controlled hooks, API promises and timers.
// No DOM renderer is installed. The harness preserves state/ref/effect lifetimes
// and exposes the actual rendered event handlers rather than matching source text.
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};}
function controlledApi(){
 const calls=[];
 return {calls,api:(...args)=>{const pending=deferred();calls.push({args,...pending});return pending.promise;}};
}
function controlledTimers(){
 let id=0;const pending=new Map();
 return {pending,setTimeout:(callback,ms)=>{const token=++id;pending.set(token,{callback,ms});return token},clearTimeout:token=>pending.delete(token),runAll:()=>{const jobs=[...pending.values()];pending.clear();for(const job of jobs)job.callback()}};
}
const stubs = new Map([
 '../table-booking', '../order-chat', '../search-field', '../bottom-nav-refresh-wave',
 './product-options', './product-recipe-editor', './admin-subscriptions', './advertisement-manager',
 './home-design-editor', './subscription-plan-manager', './subscription-redemption-form',
 './subscription-advertisement-manager', '../subscription-plan-card', '../promotion-banners',
].map(name=>[name,()=>null]));
const pullRefresh=()=>null;
const advertisementDialog=()=>null;
function mountComponent(path,{api,props={},timers,exportName='default'}={}){
 const hooks=[];let index=0,tree,mounted=true,scheduled=false,afterUnmount=0;
 const effects=[];
 const schedule=()=>{if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;if(mounted)render()})}};
 const react={
  useState(initial){
   const slot=index++;
   if(!hooks[slot]){
    const record={value:typeof initial==='function'?initial():initial};
    record.set=next=>{if(!mounted){afterUnmount++;return}const value=typeof next==='function'?next(record.value):next;if(!Object.is(value,record.value)){record.value=value;schedule()}};
    hooks[slot]=record;
   }
   return [hooks[slot].value,hooks[slot].set];
  },
  useRef(initial){const slot=index++;return hooks[slot]??(hooks[slot]={current:initial})},
  useCallback(callback,deps){
   const slot=index++,previous=hooks[slot];
   if(!previous||deps.length!==previous.deps.length||deps.some((value,i)=>!Object.is(value,previous.deps[i]))) {
    hooks[slot]={deps,callback};
   }
   return hooks[slot].callback;
  },
  useEffect(effect,deps){
   const slot=index++,previous=hooks[slot];
   if(!previous||!deps||deps.some((value,i)=>!Object.is(value,previous.deps?.[i]))||deps.length!==previous.deps?.length){
    const record={deps,cleanup:previous?.cleanup};hooks[slot]=record;effects.push(()=>{record.cleanup?.();record.cleanup=effect()});
   }
  },
 };
 const jsx=(type,props)=>({type,props:props||{}});
 const stub=()=>null;
 function require(name){
  if(name==='react')return react;
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:Symbol.for('test.fragment')};
  if(name==='lucide-react')return new Proxy({},{get:()=>stub});
  if(name==='../store-app')return {api,money:value=>'₹'+((value||0)/100).toFixed(2),ProductImage:stub};
  if(name==='../../lib/dialog')return {useDialogAccessibility:()=>{}};
  if(name==='../../lib/pricing')return {transitions:{pending:['confirmed'],confirmed:['preparing'],preparing:['ready'],ready:['completed'],completed:[]}};
  if(name==='../../lib/bottom-nav-glass')return {bottomNavOutline};
  if(name==='../../lib/order-payment')return {paysAtCafe};
  if(name==='../../lib/order-reference')return {orderReference};
  if(name==='../../lib/subscription-catalog')return {subscriptionBannerInk};
  if(name==='../../lib/launch-advertisement')return openingAds;
  if(name==='../../lib/public-message')return publicMessages;
  if(name==='./use-admin-order-alerts')return {useAdminOrderAlerts:()=>({ordersToday:0,alertCount:0,clearAlert:()=>{}})};
  if(name==='./use-admin-chat-alerts')return {useAdminChatAlerts:()=>({total:0,orders:[],markRead:async()=>{}})};
  if(name==='../use-live-updates')return {useLiveUpdates:()=>{},onLiveUpdate:()=>()=>{}};
  if(name==='../../lib/native-order-alerts')return {hasNativeOrderAlerts:()=>false,openNativeOrderAlertSettings:()=>false};
  if(name==='../home-pull-refresh')return {HomePullRefresh:pullRefresh};
  if(name==='../launch-advertisement')return {AdvertisementDialog:advertisementDialog};
  if(name.endsWith('.css'))return {};
  if(stubs.has(name))return {__esModule:true,default:stubs.get(name)};
  throw Error('Unexpected component dependency: '+name);
 }
 const module={exports:{}};
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const context={module,exports:module.exports,require,console,queueMicrotask,setTimeout:timers?.setTimeout||setTimeout,
  clearTimeout:timers?.clearTimeout||clearTimeout,setInterval:()=>0,clearInterval:()=>{},crypto:globalThis.crypto,AbortController,URL,URLSearchParams,
  document:{hidden:false,addEventListener(){},removeEventListener(){},querySelector(){return null}},
  window:{scrollTo(){},matchMedia(){return {matches:true}},addEventListener(){},removeEventListener(){},
   history:{state:null,pushState(state){this.state=state}}},
  MutationObserver:class{observe(){} disconnect(){}},
 };
 vm.runInNewContext(compiled,context,{filename:path});
 const Component=module.exports[exportName];
 function render(){index=0;tree=Component(props);while(effects.length)effects.shift()()}
 render();
 return {
  get tree(){return tree},
  get updatesAfterUnmount(){return afterUnmount},
  updateProps(next){props=next;render();},
  unmount(){mounted=false;for(const hook of hooks)hook?.cleanup?.()},
  async flush(){for(let i=0;i<12;i++)await Promise.resolve()},
 };
}
function nodes(tree){
 if(tree==null||typeof tree==='boolean')return [];
 if(Array.isArray(tree))return tree.flatMap(nodes);
 if(typeof tree!=='object')return [];
 return [tree,...nodes(tree.props?.children)];
}
function text(node){
 if(node==null||typeof node==='boolean')return '';
 if(Array.isArray(node))return node.map(text).join(' ');
 if(typeof node==='object')return text(node.props?.children);
 return String(node);
}
function find(harness,predicate){const node=nodes(harness.tree).find(predicate);assert.ok(node,'Expected rendered control');return node;}
function button(harness,label){return find(harness,node=>node.type==='button'&&text(node).trim()===label);}
function alerts(harness){return nodes(harness.tree).filter(node=>node.props?.role==='alert').map(text);}
const plan=(id,name)=>({id,name,amount:10000,credits:7,days:7,enabled:true,archived:false,itemScope:'coffee',includedItems:[]});

const submitForm=harness=>find(harness,node=>node.type==='form').props.onSubmit({preventDefault(){}});
const codeInput=harness=>find(harness,node=>node.type==='input'&&node.props.placeholder==='Six-digit code');
const phoneInput=harness=>find(harness,node=>node.type==='input'&&node.props.type==='tel');
const setInput=(input,value)=>input.props.onChange({target:{value}});
const payload=call=>JSON.parse(JSON.stringify(call.args[2]));
const matchedPlan={subscriptionId:'test-pass-1',planName:'Weekly test plan'};
const visiblePlans=harness=>nodes(harness.tree)
 .filter(node=>node.type===stubs.get('../subscription-plan-card')).map(node=>node.props.plan.name);
const overview={settings:{offers:[],currency:'INR'},stats:{total:0,pending:0,completed:0,revenue:0},
 products:[],categories:[],customers:[],orders:[],suggestions:[],audit:[],bestSellers:[]};

test('redemption preview is retryable and only confirmation redeems the matched subscription',async()=>{
 const network=controlledApi();
 const harness=mountComponent('app/admin/subscription-redemption-form.tsx',{api:network.api});
 assert.equal(network.calls.length,0);
 setInput(phoneInput(harness),'9000000001');
 setInput(codeInput(harness),'123456');
 await harness.flush();

 const failedPreview=submitForm(harness);await harness.flush();
 assert.equal(button(harness,'Checking…').props.disabled,true);
 assert.deepEqual(network.calls[0].args.slice(0,2),['admin/subscriptions/redeem-preview','POST']);
 assert.deepEqual(payload(network.calls[0]),{phone:'9000000001',code:'123456'});
 network.calls[0].reject(Error('Connection lost'));
 await failedPreview;await harness.flush();
 assert.match(alerts(harness).join(' '),/Connection lost/);
 assert.ok(button(harness,'Check code'));

 const retry=submitForm(harness);await harness.flush();
 assert.equal(alerts(harness).length,0);
 assert.equal(network.calls[1].args[0],'admin/subscriptions/redeem-preview');
 network.calls[1].resolve(matchedPlan);await retry;await harness.flush();
 assert.match(text(harness.tree),/Weekly test plan/);
 assert.ok(button(harness,'Redeem 1 test credit'));
 assert.equal(network.calls.length,2,'A successful preview must not redeem a credit');

 const debit=submitForm(harness);await harness.flush();
 assert.equal(button(harness,'Redeeming…').props.disabled,true);
 assert.deepEqual(network.calls[2].args.slice(0,2),['admin/subscriptions/redeem','POST']);
 assert.deepEqual(payload(network.calls[2]),{phone:'9000000001',code:'123456',subscriptionId:'test-pass-1'});
 network.calls[2].resolve({planName:matchedPlan.planName});await debit;await harness.flush();
 assert.match(text(harness.tree),/1 test credit redeemed/);
 assert.equal(codeInput(harness).props.value,'');
 assert.ok(button(harness,'Check code'));
 harness.unmount();
});

test('editing the redemption code after a failed confirmation requires a new preview',async()=>{
 const network=controlledApi();
 const harness=mountComponent('app/admin/subscription-redemption-form.tsx',{api:network.api});
 setInput(phoneInput(harness),'9000000001');
 setInput(codeInput(harness),'123456');
 await harness.flush();
 const preview=submitForm(harness);
 network.calls[0].resolve(matchedPlan);await preview;await harness.flush();

 const failedDebit=submitForm(harness);
 network.calls[1].reject(Error('This code has expired'));
 await failedDebit;await harness.flush();
 assert.match(alerts(harness).join(' '),/This code has expired/);
 assert.ok(button(harness,'Redeem 1 test credit'));
 assert.doesNotMatch(text(harness.tree),/1 test credit redeemed/);

 setInput(codeInput(harness),'654321');
 await harness.flush();
 assert.equal(alerts(harness).length,0);
 assert.ok(button(harness,'Check code'));
 assert.doesNotMatch(text(harness.tree),/Weekly test plan/);
 const newPreview=submitForm(harness);
 assert.equal(network.calls[2].args[0],'admin/subscriptions/redeem-preview');
 assert.deepEqual(payload(network.calls[2]),{phone:'9000000001',code:'654321'});
 network.calls[2].resolve({subscriptionId:'test-pass-2',planName:'New pass'});
 await newPreview;await harness.flush();
 assert.match(text(harness.tree),/New pass/);
 harness.unmount();
});

test('plan refresh keeps the newest result when an older request finishes later',async()=>{
 for(const olderFails of [false,true]){
  const network=controlledApi();const harness=mountComponent('app/admin/subscription-plan-manager.tsx',{api:network.api});
  button(harness,'Refresh plans').props.onClick();assert.equal(network.calls.length,2);
  network.calls[1].resolve({plans:[plan('new','New plan')],products:[]});await harness.flush();
  if(olderFails)network.calls[0].reject(Error('Old request failed'));
  else network.calls[0].resolve({plans:[plan('old','Old plan')],products:[]});
  await harness.flush();
  assert.deepEqual(visiblePlans(harness),['New plan']);
  assert.equal(alerts(harness).length,0);harness.unmount();
 }
});

test('successful plan retry clears a previously displayed loading error',async()=>{
 const network=controlledApi();const harness=mountComponent('app/admin/subscription-plan-manager.tsx',{api:network.api});
 network.calls[0].reject(Error('Temporary outage'));await harness.flush();assert.match(alerts(harness).join(' '),/Temporary outage/);
 button(harness,'Refresh plans').props.onClick();await harness.flush();assert.equal(alerts(harness).length,0);
 network.calls[1].resolve({plans:[plan('weekly','Weekly recovery plan')],products:[]});await harness.flush();
 assert.deepEqual(visiblePlans(harness),['Weekly recovery plan']);
 assert.equal(alerts(harness).length,0);harness.unmount();
});

test('plan loader ignores both successful and failed responses after unmount',async()=>{
 for(const fails of [false,true]){
  const network=controlledApi();
  const harness=mountComponent('app/admin/subscription-plan-manager.tsx',{api:network.api});
  assert.equal(network.calls[0].args[0],'admin/subscription-plans');
  harness.unmount();
  if(fails)network.calls[0].reject(Error('Late failure'));
  else network.calls[0].resolve({plans:[plan('late','Late plan')],products:[]});
  await harness.flush();
  assert.equal(harness.updatesAfterUnmount,0);
 }
});

test('rapid mobile Admin order searches issue one request for the final filter value',async()=>{
 const network=controlledApi(),timers=controlledTimers();
 const harness=mountComponent('app/admin/admin-app.tsx',{api:network.api,timers});
 network.calls[0].resolve(overview);await harness.flush();
 find(harness,node=>node.type==='button'&&node.props['aria-label']==='Orders').props.onClick();
 await harness.flush();
 const search=()=>find(harness,node=>node.type===stubs.get('../search-field')&&node.props.label==='Search orders');
 const searchField=mountComponent('app/search-field.tsx',{props:search().props});
 for(const value of ['c','co','coffee']){
  const field=find(searchField,node=>node.type==='input'&&node.props['aria-label']==='Search orders');
  setInput(field,value);
  await harness.flush();
  searchField.updateProps(search().props);
 }
 assert.equal(network.calls.length,1,'No order request is sent before the debounce expires');
 assert.equal(timers.pending.size,1);
 timers.runAll();await harness.flush();assert.equal(network.calls.length,2);
 assert.equal(network.calls[1].args[0],'admin/orders?offset=0&q=coffee&status=all');
 network.calls[1].resolve({orders:[]});await harness.flush();
 assert.equal(search().props.value,'coffee');
 searchField.unmount();harness.unmount();
});

test('pulling to refresh Admin Subscriptions forwards the new revision to both loaders',async()=>{
 const network=controlledApi();
 const sandboxOverview={...overview,settings:{...overview.settings,testMode:true},paymentConfig:{provider:'stripe',enabled:true}};
 const harness=mountComponent('app/admin/admin-app.tsx',{api:network.api,props:{initialTab:'subscriptions'}});
 network.calls[0].resolve(sandboxOverview);await harness.flush();
 const subscriptions=()=>find(harness,node=>node.type===stubs.get('./admin-subscriptions'));
 const section=mountComponent('app/admin/admin-subscriptions.tsx',{props:subscriptions().props});
 const revision=manager=>find(section,node=>node.type===stubs.get(manager)).props.refreshVersion;
 assert.equal(revision('./subscription-plan-manager'),0);
 assert.equal(revision('./subscription-advertisement-manager'),0);
 const refresh=find(harness,node=>node.type===pullRefresh).props.onRefresh();
 assert.deepEqual(network.calls.map(call=>call.args[0]),['admin/overview','admin/overview']);
 network.calls[1].resolve(sandboxOverview);assert.equal(await refresh,true);await harness.flush();
 section.updateProps(subscriptions().props);
 assert.equal(revision('./subscription-plan-manager'),1);
 assert.equal(revision('./subscription-advertisement-manager'),1);
 assert.ok(find(section,node=>node.type===stubs.get('./subscription-redemption-form')));
 section.unmount();harness.unmount();
});

function bannerResponse(title){
 return {advertisements:[{id:'review-banner',title,image:'/banner.png',planId:'plan-1',enabled:true}],
  plans:[{id:'plan-1',name:'Test plan',available:true}]};
}

test('opening ads preview and save the selected four-banner sequence',async()=>{
 const network=controlledApi();
 const harness=mountComponent('app/admin/advertisement-manager.tsx',{api:network.api});
 const banners=['Coffee','Lunch','Dessert','Pass'].map(title=>({title,image:`/${title}.webp`,destination:null}));
 network.calls[0].resolve({advertisement:{id:'saved-carousel',banners}});
 await harness.flush();
 button(harness,'Edit banners').props.onClick();
 await harness.flush();
 const choosePosition=(title,position)=>setInput(find(harness,node=>node.type==='select'&&node.props['aria-label']===`Playback position for ${title}`),String(position));
 const preview=async()=>{
  button(harness,'Preview banners').props.onClick();
  await harness.flush();
  return find(harness,node=>node.type===advertisementDialog).props;
 };

 choosePosition('Pass',0);
 await harness.flush();
 const firstPreview=await preview();
 assert.deepEqual(Array.from(firstPreview.banners,banner=>banner.title),['Pass','Coffee','Lunch','Dessert']);
 firstPreview.onShown();
 firstPreview.onClose();
 await harness.flush();
 assert.equal(button(harness,'Save for customers').props.disabled,false);

 choosePosition('Coffee',3);
 await harness.flush();
 const redirect=find(harness,node=>node.type==='select'&&node.props['aria-label']==='Redirect for Pass');
 redirect.props.onChange({currentTarget:{value:'subscriptions'}});
 await harness.flush();
 assert.equal(button(harness,'Save for customers').props.disabled,true);
 const finalPreview=await preview();
 const expected=['Pass','Lunch','Dessert','Coffee'];
 assert.deepEqual(Array.from(finalPreview.banners,banner=>banner.title),expected);
 assert.equal(finalPreview.banners[0].destination,'subscriptions');
 finalPreview.onShown();
 finalPreview.onClose();
 await harness.flush();
 submitForm(harness);
 assert.deepEqual(network.calls[1].args.slice(0,2),['admin/advertisement','PUT']);
 assert.deepEqual(payload(network.calls[1]).banners.map(banner=>banner.title),expected);
 assert.equal(payload(network.calls[1]).banners[0].destination,'subscriptions');
 assert.equal(payload(network.calls[1]).banners[1].destination,null);
 assert.equal(payload(network.calls[1]).expectedId,'saved-carousel');
 network.calls[1].resolve({advertisement:{id:'updated-carousel',banners:payload(network.calls[1]).banners}});
 await harness.flush();
 harness.unmount();
});

test('saved opening ads inherit only enabled legacy links',async()=>{
 const banners=[
  {title:'Coffee',image:'/coffee.webp',action:'Explore menu',destination:'menu'},
  {title:'Portrait',image:'/portrait.webp',action:'',destination:'menu'},
  {title:'Visit',image:'/visit.webp',destination:'bookings'},
  {title:'Unsupported URL',image:'/other.webp',destination:'https://example.test'},
 ];
 const db={prepare:()=>({bind:()=>({first:async()=>({data:JSON.stringify({id:'carousel',banners})})})})};
 const result=await openingAds.readLaunchAdvertisement(db);
 assert.deepEqual(result.banners.map(({destination})=>destination),['menu',null,'bookings',null]);
 assert.ok(result.banners.every(banner=>!('action' in banner)));
});

test('opening ads advance on dismissal, activate the linked artwork, and stop after the last ad',async()=>{
 const timers=controlledTimers();
 const destinations=[];
 let exits=0;
 const banners=[
  {title:'First',image:'/first.webp',destination:null},
  {title:'Second',image:'/second.webp',destination:'bookings'},
  {title:'Third',image:'/third.webp',destination:null},
 ];
 const harness=mountComponent('app/launch-advertisement.tsx',{exportName:'AdvertisementDialog',timers,props:{
  banners,onClose:()=>exits++,onAction:destination=>destinations.push(destination),onImageError:()=>assert.fail('Unexpected broken artwork'),
 }});
 const dialog={open:false,isConnected:true,showModal(){this.open=true},close(){this.open=false;harness.tree.props.onClose()}};
 harness.tree.props.ref.current=dialog;
 const artwork=()=>find(harness,node=>node.type==='img');
 const dismiss=()=>find(harness,node=>node.props['aria-label']==='Close advertisement').props.onClick();
 await artwork().props.onLoad();
 await harness.flush();
 assert.equal(dialog.open,true);
 assert.equal(timers.pending.size,0);
 assert.equal(artwork().props.alt,'First');

 dismiss();
 await harness.flush();
 assert.equal(artwork().props.alt,'Second');
 artwork().props.onLoad();
 await harness.flush();
 find(harness,node=>node.props['aria-label']==='Open Second').props.onClick();
 assert.deepEqual(destinations,['bookings']);
 assert.equal(dialog.open,true);

 dismiss();
 await harness.flush();
 assert.equal(artwork().props.alt,'Third');
 artwork().props.onLoad();
 await harness.flush();
 dismiss();
 assert.equal(dialog.open,false);
 assert.equal(exits,1);
 harness.unmount();
});

test('a successful promotion refresh clears the earlier loading error',async()=>{
 const network=controlledApi();
 const harness=mountComponent('app/admin/subscription-advertisement-manager.tsx',{api:network.api,props:{refreshVersion:0}});
 network.calls[0].reject(Error('Failed to fetch'));
 await harness.flush();
 assert.match(alerts(harness).join(' '),/Failed to fetch/);
 harness.updateProps({refreshVersion:1});
 await harness.flush();
 assert.deepEqual(network.calls.map(call=>call.args[0]),['admin/subscription-advertisements','admin/subscription-advertisements']);
 assert.equal(network.calls[0].args[3].aborted,true);
 network.calls[1].resolve(bannerResponse('Fresh banner'));
 await harness.flush();
 assert.match(text(harness.tree),/Fresh banner/);
 assert.equal(alerts(harness).length,0);
 harness.unmount();
});

test('promotion refresh ignores older failures and does not apply results after unmount',async()=>{
 const network=controlledApi();
 const harness=mountComponent('app/admin/subscription-advertisement-manager.tsx',{api:network.api,props:{refreshVersion:0}});
 harness.updateProps({refreshVersion:1});
 network.calls[1].resolve(bannerResponse('New live banner'));
 await harness.flush();
 network.calls[0].reject(Error('Stale banner load error'));
 await harness.flush();
 assert.match(text(harness.tree),/New live banner/);
 assert.equal(alerts(harness).length,0);
 harness.updateProps({refreshVersion:2});
 harness.unmount();
 assert.equal(network.calls[2].args[3].aborted,true);
 network.calls[2].resolve(bannerResponse('Late banner'));
 await harness.flush();
 assert.equal(harness.updatesAfterUnmount,0);
});
