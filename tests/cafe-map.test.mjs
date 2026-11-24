import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../app/cafe-map.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function harness(prepareWorker=async()=> 'blob:map-worker'){
 const state=[],refs=[],effects=[],maps=[],resources=[],timers=new Map();let si=0,ri=0,ei=0,nextTimer=0,pending=[],tree;
 class FakeMap{
  handlers=new Map();sources=new Map();layers=new Set();removed=false;resizes=0;
  constructor(){maps.push(this);}
  on(type,fn){const list=this.handlers.get(type)||[];list.push(fn);this.handlers.set(type,list);return this;}
  once(type,fn){const once=(...args)=>{this.handlers.set(type,this.handlers.get(type).filter(f=>f!==once));fn(...args);};return this.on(type,once);}
  emit(type){for(const fn of [...(this.handlers.get(type)||[])])fn();}
  addSource(id){this.sources.set(id,{setData(){}});}
  addLayer(layer){this.layers.add(layer.id);}
  getSource(id){return this.sources.get(id);}
  addControl(){}
  setPaintProperty(){}
  jumpTo(){}
  resize(){this.resizes++;}
  remove(){this.removed=true;resources.push('remove');}
 }
 class FakeMarker{setLngLat(){return this;}setPopup(){return this;}addTo(){return this;}}
 class FakePopup{setText(){return this;}}
 const react={
  useState(initial){const i=si++;if(!(i in state))state[i]=initial;return[state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},
  useRef(initial){const i=ri++;return refs[i]??=(i===0?{current:{}}:{current:initial});},
  useEffect(fn,deps){const i=ei++;const previous=effects[i];if(!previous||deps.some((v,j)=>v!==previous.deps[j]))pending.push({i,fn,deps});},
 };
 const jsx=(type,props)=>({type,props});
 const ctx={exports:{},require(id){if(id==='react')return react;if(id==='react/jsx-runtime')return{jsx,jsxs:jsx};if(id.endsWith('maplibre-gl-csp.js'))return{default:{Map:FakeMap,Marker:FakeMarker,Popup:FakePopup,NavigationControl:class{},setWorkerUrl(){}}};if(id.endsWith('?url'))return{default:'/map-worker.js'};if(id.includes('cafe-map-worker'))return{cafeMapWorker:prepareWorker};if(id.endsWith('.css'))return{};throw Error('Unexpected module '+id);},console:{warn(){}},AbortController,URL:{revokeObjectURL(value){resources.push('revoke:'+value);}},window:{setTimeout(fn){const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}}};
 vm.runInNewContext(compiled,ctx);
 const pin=[77.630215,12.934217];
 function render(){si=ri=ei=0;pending=[];tree=ctx.exports.default({pin,label:'Koramangala',route:null});for(const next of pending){effects[next.i]?.cleanup?.();effects[next.i]={deps:next.deps,cleanup:next.fn()};}return tree;}
 function find(node,type){if(!node||typeof node!=='object')return null;if(node.type===type)return node;for(const child of [node.props?.children].flat()) {const match=find(child,type);if(match)return match;}return null;}
 function renderText(node){if(node===null||node===undefined||node===false)return'';if(typeof node!=='object')return String(node);return[node.props?.children].flat().map(child=>renderText(child)).join(' ');}
 function expire(){for(const[id,fn]of[...timers]){timers.delete(id);fn();}}
 function dispose(){for(const effect of effects)effect?.cleanup?.();}
 render();
 return{maps,resources,render,find,text:()=>renderText(tree),expire,dispose,timers,get tree(){return tree;}};
}

test('failed worker/style load exposes a reload action, and retry removes the old map before a clean load',async()=>{
 const h=harness();await flush();assert.equal(h.maps.length,1);
 h.maps[0].emit('error');h.render();assert.match(h.text(),/couldn’t load/);
 h.find(h.tree,'button').props.onClick();h.render();await flush();
 assert.equal(h.maps[0].removed,true);assert.equal(h.maps.length,2);assert.deepEqual(h.resources.slice(0,2),['remove','revoke:blob:map-worker']);
 h.maps[1].emit('load');h.render();assert.doesNotMatch(h.text(),/Loading map|couldn’t load/);
 assert.equal(h.maps[1].layers.has('cafe-route'),true);h.dispose();
});
test('a slow load becomes actionable after the deadline and a later valid load recovers',async()=>{
 const h=harness();await flush();h.expire();h.render();assert.match(h.text(),/couldn’t load/);
 h.maps[0].emit('load');h.render();assert.doesNotMatch(h.text(),/couldn’t load/);assert.equal(h.timers.size,0);h.dispose();
});
test('one missing tile does not hide a loaded map; GPU context loss does and restoration redraws it',async()=>{
 const h=harness();await flush();const map=h.maps[0];map.emit('load');h.render();
 map.emit('error');h.render();assert.doesNotMatch(h.text(),/couldn’t load/);
 map.emit('webglcontextlost');h.render();assert.match(h.text(),/couldn’t load/);
 map.emit('webglcontextrestored');map.emit('idle');h.render();assert.doesNotMatch(h.text(),/couldn’t load/);assert.equal(map.resizes,1);h.dispose();
});
test('late map events after closing the panel cannot resurrect its ready state or add layers',async()=>{
 const h=harness();await flush();const map=h.maps[0];h.dispose();
 map.emit('load');map.emit('error');map.emit('webglcontextlost');map.emit('webglcontextrestored');map.emit('idle');
 assert.equal(map.removed,true);assert.equal(map.layers.size,0);assert.equal(map.resizes,0);assert.equal(h.timers.size,0);
});

test('a worker that finishes after unmount is revoked without constructing a map',async()=>{
 let finish;const h=harness(()=>new Promise(resolve=>{finish=resolve;}));await flush();h.dispose();finish('blob:late');await flush();
 assert.equal(h.maps.length,0);assert.deepEqual(h.resources,['revoke:blob:late']);assert.equal(h.timers.size,0);
});
