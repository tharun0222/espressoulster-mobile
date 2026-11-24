import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../app/home-pull-refresh.tsx',import.meta.url),'utf8');
const start=source.indexOf('    const shell = panel.current?.parentElement;\n    if (!shell) return;');
const end=source.indexOf('\n  }, [bottomNav]);',start);
assert.ok(start>0&&end>start,'Refresh effect must be present');
const compiled=ts.transpileModule('exports.mount=function(){'+source.slice(start,end)+'\n}',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

class ElementStub {
  constructor(parent=null,kind='article'){this.parentElement=parent;this.kind=kind;this.listeners=new Map();this.attributes=new Map();this.scrollTop=0;this.scrollHeight=100;this.clientHeight=100;this.overflowY='visible';}
  closest(selectors){return selectors.split(',').map(x=>x.trim()).includes(this.kind)?this:this.parentElement?.closest(selectors)??null;}
  addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}
  removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(f=>f!==fn));}
  fire(type,event={}){for(const fn of [...(this.listeners.get(type)||[])])fn(event);}
  setAttribute(name,value){this.attributes.set(name,value);}
  removeAttribute(name){this.attributes.delete(name);}
  hasAttribute(name){return this.attributes.has(name);}
  toggleAttribute(name,force){if(force??!this.hasAttribute(name))this.setAttribute(name,'');else this.removeAttribute(name);}
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function harness(onRefresh=async()=>true){
  let now=0,nextId=0;const timers=new Map(),frames=new Map();
  const shell=new ElementStub(),target=new ElementStub(shell),nav=new ElementStub();
  const svg={getBoundingClientRect:()=>({left:12,top:740,width:366,height:62}),getScreenCTM:()=>({a:.95,d:.96,e:14,f:740}),createSVGPoint:()=>({x:0,y:0,matrixTransform(m){return {x:this.x*m.a+m.e,y:this.y*m.d+m.f};}})};
  nav.querySelector=()=>svg;nav.getBoundingClientRect=svg.getBoundingClientRect;
  const window=new ElementStub();Object.assign(window,{scrollY:0,innerWidth:390,innerHeight:844});
  const state={distance:0,dragging:false,phases:[],calls:0,landing:null};
  const context={exports:{},Element:ElementStub,window,document:{scrollingElement:{scrollTop:0}},panel:{current:{parentElement:shell}},sheen:{current:{getBoundingClientRect:()=>({top:40,height:16})}},bottomNav:{current:nav},impact:{current:()=>{}},refresh:{current:async()=>{state.calls++;return onRefresh();}},
    setPhase:value=>state.phases.push(value),setDistance:value=>state.distance=value,setDragging:value=>state.dragging=value,setReleaseY:value=>state.releaseY=value,setLanding:value=>state.landing=value,
    performance:{now:()=>now},matchMedia:()=>({matches:false}),getComputedStyle:element=>({overflowY:element.overflowY}),triggerDistance:56,springFrequency:15,releaseDuration:1600,gestureSlop:8,
    setTimeout:(fn,ms)=>{const id=++nextId;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{const id=++nextId;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),Promise,Math,parseFloat,
  };
  vm.runInNewContext(compiled,context);const cleanup=context.exports.mount();
  function touch(type,x=180,y=100,element=target){const event={target:element,touches:type==='touchend'||type==='touchcancel'?[]:[{clientX:x,clientY:y}],cancelable:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};shell.fire(type,event);return event;}
  async function advance(ms){const until=now+ms;while(true){const due=[...timers].filter(([,v])=>v.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;timers.delete(due[0]);now=due[1].at;due[1].fn();await flush();}now=until;await flush();}
  async function spring(){for(let i=0;i<100&&frames.size;i++){now+=16;const due=[...frames];frames.clear();for(const [,fn]of due)fn(now);await flush();}}
  return {shell,target,nav,state,context,touch,advance,spring,cleanup};
}

test('a committed touch pull refreshes once, lands at the actual SVG center, and clears repeatable wave state',async()=>{
  let resolve;const h=harness(()=>new Promise(r=>{resolve=r;}));
  h.nav.setAttribute('data-refresh-impact','');
  h.touch('touchstart');assert.equal(h.nav.hasAttribute('data-refresh-impact'),false);
  const move=h.touch('touchmove',180,210);assert.equal(move.defaultPrevented,true);
  h.touch('touchend');await flush();
  h.touch('touchstart');h.touch('touchmove',180,240);h.touch('touchend');
  assert.equal(h.state.calls,1);assert.equal(h.nav.hasAttribute('data-refresh-active'),true);
  resolve(true);await flush();
  assert.equal(h.state.phases.at(-1),'falling');assert.equal(h.state.releaseY,48);
  assert.equal(h.state.landing.x,194.5);assert.equal(h.state.landing.y,781.28);
  await h.advance(780);h.context.impact.current();assert.equal(h.nav.hasAttribute('data-refresh-impact'),true);
  await h.advance(900);await h.spring();
  assert.equal(h.nav.hasAttribute('data-refresh-impact'),false);assert.equal(h.nav.hasAttribute('data-refresh-active'),false);assert.equal(h.state.distance,0);
  h.cleanup();
});

test('horizontal swipes, inner-panel scrolls, and cart dragging do not refresh Home',async()=>{
  const h=harness();h.touch('touchstart');const sideways=h.touch('touchmove',260,110);h.touch('touchend');
  assert.equal(sideways.defaultPrevented,false);assert.equal(h.state.calls,0);
  const scrolled=new ElementStub(h.shell);scrolled.scrollTop=30;scrolled.scrollHeight=500;scrolled.clientHeight=100;scrolled.overflowY='auto';
  h.touch('touchstart',180,100,scrolled);h.touch('touchmove',180,240,scrolled);h.touch('touchend');assert.equal(h.state.calls,0);
  const cart=new ElementStub(h.shell,'.movable-cart');h.touch('touchstart',180,100,cart);h.touch('touchmove',180,240,cart);h.touch('touchend');assert.equal(h.state.calls,0);
  h.cleanup();
});

test('a cancelled pull returns to idle without refreshing, and a failed refresh does not play a success wave',async()=>{
  const h=harness(async()=>false);h.touch('touchstart');h.touch('touchmove',180,140);h.touch('touchcancel');await h.spring();
  assert.equal(h.state.calls,0);assert.equal(h.state.distance,0);assert.equal(h.state.phases.at(-1),'idle');assert.equal(h.nav.hasAttribute('data-refresh-active'),false);
  h.touch('touchstart');h.touch('touchmove',180,240);h.touch('touchend');await flush();await h.spring();
  assert.equal(h.state.calls,1);assert.equal(h.state.phases.at(-1),'error');assert.equal(h.nav.hasAttribute('data-refresh-impact'),false);assert.equal(h.nav.hasAttribute('data-refresh-active'),false);
  h.cleanup();
});

test('small touch jitter leaves Home and Admin button taps intact',async()=>{
  const h=harness();const button=new ElementStub(h.shell,'button');
  h.touch('touchstart',180,100,button);
  const jitter=h.touch('touchmove',182,103,button);
  h.touch('touchend',182,103,button);await flush();
  assert.equal(jitter.defaultPrevented,false);
  assert.equal(h.state.distance,0);assert.equal(h.state.calls,0);
  assert.equal(h.nav.hasAttribute('data-refresh-active'),false);
  h.cleanup();
});

test('a scrolled refresh shell belongs to native scrolling instead of refreshing',async()=>{
  const h=harness();h.shell.scrollTop=80;h.shell.scrollHeight=1400;h.shell.clientHeight=700;h.shell.overflowY='auto';
  h.touch('touchstart');const move=h.touch('touchmove',180,240);h.touch('touchend');await flush();
  assert.equal(move.defaultPrevented,false);assert.equal(h.state.calls,0);assert.equal(h.state.distance,0);
  h.cleanup();
});

test('scrolling below the top releases the blocking move listener and returning restores it once',()=>{
  const h=harness();
  const listeners=()=>h.shell.listeners.get('touchmove')?.length??0;
  assert.equal(listeners(),1);
  h.context.window.scrollY=180;h.context.window.fire('scroll');assert.equal(listeners(),0);
  h.context.window.scrollY=0;h.context.window.fire('scroll');h.context.window.fire('scroll');
  assert.equal(listeners(),1);h.cleanup();assert.equal(listeners(),0);
});

test('unmounting a settling gesture cannot clear the next screen’s refresh marker',async()=>{
  const h=harness();h.touch('touchstart');h.touch('touchmove',180,140);h.touch('touchcancel');await flush();
  h.cleanup();
  const nextNav=new ElementStub();nextNav.setAttribute('data-refresh-active','');h.context.bottomNav.current=nextNav;
  await flush();assert.equal(nextNav.hasAttribute('data-refresh-active'),true);
});

test('repeat pulls and reduced-motion refresh use the same safe success and failure paths',async()=>{
  let succeeds=true;const h=harness(async()=>succeeds);h.context.matchMedia=()=>({matches:true});
  h.touch('touchstart');h.touch('touchmove',180,220);h.touch('touchend');await flush();
  assert.equal(h.state.calls,1);assert.equal(h.state.phases.at(-1),'success');assert.equal(h.state.distance,0);
  await h.advance(900);assert.equal(h.nav.hasAttribute('data-refresh-impact'),false);
  succeeds=false;
  h.touch('touchstart');h.touch('touchmove',180,220);h.touch('touchend');await flush();
  await flush();
  assert.equal(h.state.calls,2);assert.equal(h.state.phases.at(-1),'error');assert.equal(h.nav.hasAttribute('data-refresh-impact'),false);
  assert.equal(h.nav.hasAttribute('data-refresh-active'),false);h.cleanup();
});

test('adding a second finger cancels a pull rather than committing a refresh',async()=>{
  const h=harness();h.touch('touchstart');h.touch('touchmove',180,240);
  h.shell.fire('touchstart',{target:h.target,touches:[{clientX:180,clientY:240},{clientX:230,clientY:240}]});
  h.touch('touchend');await h.spring();
  assert.equal(h.state.calls,0);assert.equal(h.state.distance,0);
  assert.equal(h.state.phases.at(-1),'idle');assert.equal(h.nav.hasAttribute('data-refresh-active'),false);
  h.cleanup();
});
