"use client";
import {forwardRef,useEffect,useRef,useState,type ReactNode} from "react";
type Point={x:number;y:number};
const storageKey="espresso-cart-position-v1";
const MovableCart=forwardRef<HTMLButtonElement,{label:string;onOpen:()=>void;children:ReactNode}>(function MovableCart({label,onOpen,children},forwardedRef){
 const button=useRef<HTMLButtonElement|null>(null),drag=useRef<{id:number;x:number;y:number;start:Point;moved:boolean}|null>(null),suppressClick=useRef(false);
 const [position,setPosition]=useState<Point|null>(null),[dragging,setDragging]=useState(false);
 function bound(point:Point):Point{
  const el=button.current, shell=el?.closest(".app-shell")?.getBoundingClientRect();
  const size=el?.offsetWidth||56;
  const left=Math.max(8,shell?.left||0)+4, right=Math.min(window.innerWidth-8,shell?.right||window.innerWidth)-size-4;
  const nav=document.querySelector(".bottom-nav")?.getBoundingClientRect();
  const bottom=Math.min(window.innerHeight-12,nav?.top||window.innerHeight)-size-10;
  return {x:Math.min(Math.max(left,right),Math.max(left,point.x)),y:Math.min(Math.max(8,bottom),Math.max(8,point.y))};
 }
 function remember(point:Point){try{localStorage.setItem(storageKey,JSON.stringify(point));}catch{}}
 useEffect(()=>{
  try{const stored=JSON.parse(localStorage.getItem(storageKey)||"null");if(stored&&Number.isFinite(stored.x)&&Number.isFinite(stored.y))setPosition(bound(stored));}catch{}
  const resize=()=>setPosition(old=>old?bound(old):null);
  window.addEventListener("resize",resize);return()=>window.removeEventListener("resize",resize);
 },[]);
 function finish(id:number,cancelled=false){const current=drag.current;if(!current||current.id!==id)return;suppressClick.current=current.moved||cancelled;if(current.moved&&button.current){const rect=button.current.getBoundingClientRect();remember(bound({x:rect.left,y:rect.top}));}drag.current=null;setDragging(false);if(button.current?.hasPointerCapture(id))button.current.releasePointerCapture(id);}
 return <><button ref={node=>{button.current=node;if(typeof forwardedRef==="function")forwardedRef(node);else if(forwardedRef)forwardedRef.current=node;}} type="button" className={`floating-cart movable-cart${dragging?" is-dragging":""}`} aria-label={label} title="Tap to open cart · Drag to move" style={position?{left:position.x,top:position.y,right:"auto",bottom:"auto"}:undefined}
 onPointerDown={event=>{if(!event.isPrimary||event.button!==0)return;const rect=event.currentTarget.getBoundingClientRect();suppressClick.current=false;drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,start:{x:rect.left,y:rect.top},moved:false};event.currentTarget.setPointerCapture(event.pointerId);}}
 onPointerMove={event=>{const current=drag.current;if(!current||current.id!==event.pointerId)return;const dx=event.clientX-current.x,dy=event.clientY-current.y;if(!current.moved&&Math.hypot(dx,dy)<7)return;current.moved=true;setDragging(true);setPosition(bound({x:current.start.x+dx,y:current.start.y+dy}));}}
 onPointerUp={event=>finish(event.pointerId)} onPointerCancel={event=>finish(event.pointerId,true)} onLostPointerCapture={event=>{if(drag.current)finish(event.pointerId,true);}}
 onClick={event=>{if(suppressClick.current&&event.detail!==0){event.preventDefault();suppressClick.current=false;return;}onOpen();}}
 onKeyDown={event=>{const step=event.shiftKey?30:10;const directions:Record<string,Point>={ArrowLeft:{x:-step,y:0},ArrowRight:{x:step,y:0},ArrowUp:{x:0,y:-step},ArrowDown:{x:0,y:step}};const delta=directions[event.key];if(!delta)return;event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();const next=bound({x:rect.left+delta.x,y:rect.top+delta.y});setPosition(next);remember(next);}}
 >{children}</button></>;
});
export default MovableCart;
