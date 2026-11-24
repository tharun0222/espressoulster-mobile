import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../app/coffee-showcase.tsx',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function AvailableCoffeeShowcase('),source.indexOf('\nfunction MenuGlass('));
const compiled=ts.transpileModule(code+'\nexports.render=AvailableCoffeeShowcase;', {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
function harness(){
 const refs=[],frames=new Map(),writes=[];let frameId=0,boundsReads=0;
 const context={exports:{},memo:f=>f,useCallback:f=>f,useRef:value=>{const ref={current:value};refs.push(ref);return ref;},useState:value=>[value,()=>{}],useEffect:()=>{},MenuGlass:()=>null,
  React:{createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity).filter(Boolean)})},
  window:{matchMedia:()=>({matches:false})},performance:{now:()=>0},cancelAnimationFrame:id=>frames.delete(id),requestAnimationFrame:f=>{const id=++frameId;frames.set(id,f);return id;},Intl,Math,Array,
 };
 vm.runInNewContext(compiled,context);
 const flavors=Array.from({length:26},(_,i)=>({id:'drink-'+i,name:'Drink '+i,price:100,image:'/image-'+i+'.webp'}));
 const tree=context.exports.render({flavors,currency:'INR',onSelect:()=>{}}),stage=tree.children[0],wheel=stage.children.find(n=>n.props?.className==='espresso-wheel');
 const element={getBoundingClientRect(){boundsReads++;return {width:390,height:400};},setPointerCapture(){}};
 stage.props.ref.current=element;wheel.props.ref.current={setAttribute(){},removeAttribute(){},style:{setProperty:(name,value)=>writes.push([name,Number(value)])}};
 const pointer=(x,y)=>({pointerType:'touch',button:0,pointerId:1,clientX:x,clientY:y,target:{closest:()=>null},currentTarget:element});
 function paint(){for(const [id,callback] of frames){frames.delete(id);callback();}}
 return{stage,wheel,pointer,writes,frames,paint,get boundsReads(){return boundsReads;}};
}

test('touch drag coalesces updates and settles without a JavaScript animation loop',()=>{
 const h=harness();h.stage.props.onPointerDown(h.pointer(300,100));
 for(const x of [280,250,210,180])h.stage.props.onPointerMove(h.pointer(x,103));
 assert.equal(h.boundsReads,1);assert.equal(h.frames.size,1);assert.equal(h.writes.length,0);
 h.paint();
 assert.equal(h.writes.length,1);assert.ok(h.writes.at(-1)[1]>1);
 h.stage.props.onPointerUp(h.pointer(180,103));assert.equal(h.frames.size,0);
 assert.deepEqual(h.writes.at(-1),['--rot',1]);
});

test('a swipe starting on a glass settles once and preserves ordinary glass taps',()=>{
 const h=harness(),stage=h.stage.props;
 const tile={classList:{contains:name=>name==='espresso-tile'}};
 const down=()=>stage.onPointerDown({...h.pointer(280,100),target:{closest:()=>tile}});
 let stopped=0;const click=()=>stage.onClickCapture({detail:1,preventDefault(){},stopPropagation(){stopped++;}});
 down();stage.onPointerUp(h.pointer(280,100));click();assert.equal(stopped,0);
 down();stage.onPointerMove(h.pointer(180,102));
 // Transferring implicit capture from the thumbnail to the stage emits a bubbling lost event.
 stage.onLostPointerCapture({...h.pointer(180,102),target:tile});
 stage.onPointerUp({...h.pointer(180,102),pointerId:2});
 stage.onPointerUp(h.pointer(180,102));click();
 assert.deepEqual(h.writes.at(-1),['--rot',1]);assert.equal(stopped,1);
});

test('vertical page scroll does not drag the drink carousel',()=>{
 const h=harness();h.stage.props.onPointerDown(h.pointer(180,100));
 h.stage.props.onPointerMove(h.pointer(182,135));h.stage.props.onPointerMove(h.pointer(140,160));
 assert.equal(h.writes.length,0);assert.equal(h.frames.size,0);
});

test('the scene render budget excludes invisible full-size masked photos and distant thumbnails',()=>{
 const h=harness(),scene=h.stage.children.find(n=>n.props?.className==='espresso-scene');
 assert.equal(scene.children.length,1);assert.equal(h.wheel.children.length,7);
});

test('keyboard navigation settles in CSS without scheduling animation frames',()=>{
 const h=harness(), target={};
 h.stage.props.onKeyDown({target,currentTarget:target,key:'ArrowRight',preventDefault(){}});
 assert.deepEqual(h.writes,[['--rot',1]]);
 assert.equal(h.frames.size,0);
});

test('the native adapter never creates a second carousel clock or layout polling loop',()=>{
 let styles=0;
 const context={window:{},document:{createElement:()=>({}),head:{append:()=>styles++}},setInterval:()=>{throw Error('Competing native autoplay timer');}};
 vm.runInNewContext(readFileSync(new URL('../android/assets/drink-showcase.js',import.meta.url),'utf8'),context);
 assert.equal(styles,1);
});
