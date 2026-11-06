import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

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
function mountComponent(path,{api,props={},timers}={}){
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
  if(['../table-booking','./product-options','./product-recipe-editor','./admin-subscriptions','./subscription-plan-manager','./subscription-redemption-form','../subscription-item-banner'].includes(name))return {__esModule:true,default:stub};
  throw Error('Unexpected component dependency: '+name);
 }
 const module={exports:{}};
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const context={module,exports:module.exports,require,console,queueMicrotask,setTimeout:timers?.setTimeout||setTimeout,clearTimeout:timers?.clearTimeout||clearTimeout,crypto:globalThis.crypto};
 vm.runInNewContext(compiled,context,{filename:path});
 const Component=module.exports.default;
 function render(){index=0;tree=Component(props);while(effects.length)effects.shift()()}
 render();
 return {
  get tree(){return tree},
  get updatesAfterUnmount(){return afterUnmount},
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

test('redemption item load failure is recoverable and a successful retry submits the selected item',async()=>{
 const network=controlledApi();let redeemed=0;
 const harness=mountComponent('app/admin/subscription-redemption-form.tsx',{api:network.api,props:{onRedeemed:()=>{redeemed++}}});
 assert.equal(network.calls.length,1);
 assert.equal(button(harness,'Verify code & redeem 1 test item').props.disabled,true);
 network.calls[0].reject(Error('Connection lost'));await harness.flush();
 assert.match(alerts(harness).join(' '),/Unable to load redemption items.*Connection lost/);
 find(harness,node=>node.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(network.calls.length,1,'Failed catalog cannot submit an ambiguous redemption');
 button(harness,'Retry loading items').props.onClick();await harness.flush();
 assert.equal(network.calls.length,2);
 assert.equal(button(harness,'Verify code & redeem 1 test item').props.disabled,true);
 network.calls[1].resolve({products:[{id:'latte',name:'Latte'}]});await harness.flush();
 assert.equal(alerts(harness).length,0);
 assert.ok(nodes(harness.tree).some(node=>node.type==='option'&&node.props.value==='latte'));
 find(harness,node=>node.type==='input'&&node.props.type==='tel').props.onChange({target:{value:'9000000001'}});
 find(harness,node=>node.type==='input'&&node.props.placeholder==='Six-digit code').props.onChange({target:{value:'123456'}});
 find(harness,node=>node.type==='select').props.onChange({target:{value:'latte'}});await harness.flush();
 const submit=find(harness,node=>node.type==='form').props.onSubmit({preventDefault(){}});await harness.flush();
 assert.equal(network.calls[2].args[0],'admin/subscriptions/redeem');
 assert.equal(network.calls[2].args[1],'POST');
 assert.deepEqual(JSON.parse(JSON.stringify(network.calls[2].args[2])),{phone:'9000000001',code:'123456',productId:'latte'});
 network.calls[2].resolve({message:'One item redeemed',receipt:'LOCAL-TEST-RECEIPT'});await submit;await harness.flush();
 assert.equal(redeemed,1);
 assert.equal(find(harness,node=>node.type==='input'&&node.props.placeholder==='Six-digit code').props.value,'');
 assert.match(text(harness.tree),/One item redeemed/);
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
  assert.match(text(harness.tree),/New plan/);assert.doesNotMatch(text(harness.tree),/Old plan|Old request failed/);
  assert.equal(alerts(harness).length,0);harness.unmount();
 }
});

test('successful plan retry clears a previously displayed loading error',async()=>{
 const network=controlledApi();const harness=mountComponent('app/admin/subscription-plan-manager.tsx',{api:network.api});
 network.calls[0].reject(Error('Temporary outage'));await harness.flush();assert.match(alerts(harness).join(' '),/Temporary outage/);
 button(harness,'Refresh plans').props.onClick();await harness.flush();assert.equal(alerts(harness).length,0);
 network.calls[1].resolve({plans:[plan('weekly','Weekly recovery plan')],products:[]});await harness.flush();
 assert.match(text(harness.tree),/Weekly recovery plan/);assert.equal(alerts(harness).length,0);harness.unmount();
});

test('catalog loaders ignore both successful and failed responses after unmount',async()=>{
 for(const path of ['app/admin/subscription-redemption-form.tsx','app/admin/subscription-plan-manager.tsx']){
  for(const fails of [false,true]){
   const network=controlledApi();const harness=mountComponent(path,{api:network.api,props:{onRedeemed(){}}});
   harness.unmount();
   if(fails)network.calls[0].reject(Error('Late failure'));
   else network.calls[0].resolve({plans:[],products:[{id:'late',name:'Late item'}]});
   await harness.flush();assert.equal(harness.updatesAfterUnmount,0,path+' should ignore the late response');
  }
 }
});

test('rapid admin order searches issue one request for the final filter value',async()=>{
 const network=controlledApi(),timers=controlledTimers();
 const harness=mountComponent('app/admin/admin-app.tsx',{api:network.api,timers});
 network.calls[0].resolve({settings:{offers:[],currency:'INR'},stats:{total:0,pending:0,completed:0,revenue:0},products:[],categories:[],customers:[],orders:[],suggestions:[],audit:[],bestSellers:[]});await harness.flush();
 button(harness,'Orders').props.onClick();await harness.flush();
 const search=()=>find(harness,node=>node.type==='input'&&node.props['aria-label']==='Search orders');
 for(const value of ['c','co','coffee']){search().props.onChange({target:{value}});await harness.flush()}
 assert.equal(network.calls.length,1,'No order request is sent before the debounce expires');
 assert.equal(timers.pending.size,1);
 timers.runAll();await harness.flush();assert.equal(network.calls.length,2);
 assert.match(network.calls[1].args[0],/q=coffee&status=all$/);
 network.calls[1].resolve({orders:[]});await harness.flush();harness.unmount();
});


test('customer subscription ledger clears fetch errors after Refresh balances succeeds',async()=>{
 const network=controlledApi();const harness=mountComponent('app/admin/admin-subscriptions.tsx',{api:network.api});
 network.calls[0].reject(Error('Failed to fetch'));await harness.flush();
 assert.match(alerts(harness).join(' '),/Failed to fetch/);
 button(harness,'Refresh balances').props.onClick();await harness.flush();
 assert.equal(alerts(harness).length,0);
 network.calls[1].resolve({total:0,subscriptions:[],hasMore:false});await harness.flush();
 assert.equal(alerts(harness).length,0);assert.match(text(harness.tree),/0\s+verified subscriptions/);
 harness.unmount();
});

test('ledger refresh ignores older failures and does not write state after unmount',async()=>{
 const network=controlledApi();const harness=mountComponent('app/admin/admin-subscriptions.tsx',{api:network.api});
 // A refresh starts a new effect and invalidates the previous request.
 button(harness,'Refresh balances').props.onClick();await harness.flush();assert.equal(network.calls.length,2);
 network.calls[1].resolve({total:7,subscriptions:[],hasMore:false});await harness.flush();
 network.calls[0].reject(Error('Stale ledger error'));await harness.flush();
 assert.match(text(harness.tree),/7\s+verified subscriptions/);assert.equal(alerts(harness).length,0);
 button(harness,'Refresh balances').props.onClick();await harness.flush();harness.unmount();
 network.calls[2].resolve({total:99,subscriptions:[],hasMore:false});await harness.flush();
 assert.equal(harness.updatesAfterUnmount,0);
});
