'use client';
import {useEffect,useId,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {elapsedLabel,orderElapsed,type TimedOrder} from '../lib/order-timer';
import './order-pendulum.css';
import CinematicBlast from './cinematic-blast';

export default function OrderPendulum({order,renderCompletion,fitViewport=false}:{order:TimedOrder;renderCompletion?:(elapsed:string|null)=>ReactNode;fitViewport?:boolean}) {
 const [now,setNow]=useState<number|null>(null);
 const [clockHeight,setClockHeight]=useState(465);
 const [clockWidth,setClockWidth]=useState<number>();
 const [blastOrigin,setBlastOrigin]=useState(128);
 const id=useId().replace(/:/g,'');
 const swing=useRef<SVGGElement>(null);
 const clock=useRef<SVGSVGElement>(null);
 useEffect(()=>{
  const element=clock.current;
  const panel=element?.parentElement;
  if(!element || !panel)return;
  const measure=()=>{
   if(fitViewport){
    const height=element.clientHeight;
    const width=Math.min(320,panel.clientWidth,height*320/340);
    if(!width)return;
    setClockWidth(width);
    setClockHeight(height*320/width);
    setBlastOrigin(width*.4);
    return;
   }
   const rect=element.getBoundingClientRect();
   if(!rect.width)return;
   setBlastOrigin(rect.width*.4);
   const stage=element.closest('.completion-preview-stage');
   const visibleBottom = stage?.getBoundingClientRect().bottom ?? window.innerHeight;
   setClockHeight(Math.max(465,Math.round((visibleBottom-rect.top-66)*320/rect.width)));
  };
  measure();
  const observer=new ResizeObserver(measure);
  observer.observe(fitViewport ? element : panel);
  window.addEventListener('resize',measure);
  return()=>{observer.disconnect();window.removeEventListener('resize',measure)};
 },[fitViewport]);
 const motion=useRef({angle:.18,velocity:0,dragging:false,last:0});
 const result=orderElapsed(order,now??0);
 useEffect(()=>{
  setNow(Date.now());
  if(result.finished)return;
  const timer=window.setInterval(()=>setNow(Date.now()),1000);
  const sync=()=>setNow(Date.now());
  document.addEventListener('visibilitychange',sync);
  return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',sync)};
 },[order.created_at,order.status,result.finished]);
 useEffect(()=>{
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  if(!result.finished && Math.abs(motion.current.angle)+Math.abs(motion.current.velocity)<.001) motion.current.angle=.18;
  let frame=0,previous=0;
  const render=(time:number)=>{
   const m=motion.current;
   const dt=previous?Math.min((time-previous)/1000,.032):.016;previous=time;
   if(result.finished||reduced.matches){m.angle=0;m.velocity=0;}
   else if(!m.dragging){
    // Gravity plus a small escapement drive keeps the pendulum's natural swing.
    const energy=m.angle*m.angle+(m.velocity/Math.PI)**2;
    m.velocity+=(-Math.PI*Math.PI*Math.sin(m.angle)+.35*(1-energy/(.18*.18))*m.velocity)*dt;
    m.angle+=m.velocity*dt;
   }
   swing.current?.setAttribute('transform',`rotate(${m.angle*180/Math.PI} 160 232)`);
   if(!result.finished&&!reduced.matches)frame=requestAnimationFrame(render);
  };
  frame=requestAnimationFrame(render);
  return()=>cancelAnimationFrame(frame);
 },[result.finished]);
 function movePendulum(clientX:number,clientY:number){
  const rect=clock.current?.getBoundingClientRect();if(!rect)return;
  const x=(clientX-rect.left)*320/rect.width,y=(clientY-rect.top)*clockHeight/rect.height;
  const m=motion.current,next=Math.max(-.8,Math.min(.8,Math.atan2(160-x,y-232)));
  const time=performance.now();
  m.velocity=Math.max(-3,Math.min(3,(next-m.angle)/Math.max(.016,(time-m.last)/1000)));
  m.angle=next;m.last=time;
  swing.current?.setAttribute('transform',`rotate(${next*180/Math.PI} 160 232)`);
 }
 const status=order.status==='cancelled'?'Order cancelled':order.status==='ready'?'Ready for you':order.status==='completed'?'Order completed':order.status==='out_for_delivery'?'On its way':order.status==='preparing'?'Preparing your order':order.status==='confirmed'?'Order accepted by the café':'Waiting for café acceptance';
 const seconds=result.seconds;
 return <section style={{'--clock-origin-y':`${blastOrigin}px`} as CSSProperties} className="order-pendulum" data-fit-viewport={fitViewport || undefined} data-stopped={result.finished} data-completed={order.status==='completed'} aria-label="Order preparation clock">
  <svg ref={clock} className="order-pendulum-clock" style={fitViewport ? {width:clockWidth} : undefined} viewBox={`0 0 320 ${clockHeight}`} role="group" aria-label="Copper clock with a swinging pendulum">
   <defs>
    <linearGradient id={id+'rim'} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffdfb1"/><stop offset=".25" stopColor="#aa6c40"/><stop offset=".5" stopColor="#edbe8a"/><stop offset=".8" stopColor="#83502e"/><stop offset="1" stopColor="#e6b27c"/></linearGradient>
    <radialGradient id={id+'face'} cx=".35" cy=".25" r=".85"><stop stopColor="#e6aa79"/><stop offset="1" stopColor="#ca895d"/></radialGradient>
    <radialGradient id={id+'bob'} cx=".3" cy=".25"><stop stopColor="#ffdfb3"/><stop offset=".7" stopColor="#ce935b"/><stop offset="1" stopColor="#8b542f"/></radialGradient>
   </defs>
   <g ref={swing} className="order-pendulum-swing">
    <path d={`M160 232V${clockHeight-48}`} stroke="#d8b579" strokeWidth="1.7"/>
    <path d={`M159 233V${clockHeight-48}`} stroke="#ffdfaa" strokeWidth=".5" opacity=".7"/>
    <g className="order-pendulum-grip" role="button" tabIndex={result.finished?-1:0} aria-label="Swing the pendulum" aria-disabled={result.finished}
     onKeyDown={event=>{if(!result.finished&&(event.key==='ArrowLeft'||event.key==='ArrowRight')){event.preventDefault();motion.current.angle=event.key==='ArrowLeft'?.5:-.5;motion.current.velocity=0;}}}
     onPointerDown={event=>{if(result.finished)return;event.preventDefault();motion.current.dragging=true;motion.current.last=performance.now();event.currentTarget.setPointerCapture(event.pointerId);movePendulum(event.clientX,event.clientY);}}
     onPointerMove={event=>{if(motion.current.dragging)movePendulum(event.clientX,event.clientY)}}
     onPointerUp={()=>{motion.current.dragging=false;}}
     onPointerCancel={()=>{motion.current.dragging=false;motion.current.velocity=0;}}>
     <circle cx="160" cy={clockHeight-42} r="33" fill="transparent"/>
     <circle cx="160" cy={clockHeight-42} r="21" fill={'url(#'+id+'bob)'} stroke="#e8ba87" strokeWidth=".7"/>
     <circle cx="160" cy={clockHeight-42} r="17.7" fill="none" stroke="#79522d" strokeOpacity=".35" strokeWidth=".7"/>
     <path d={`M146 ${clockHeight-50}c3-10 16-12 23-6`} fill="none" stroke="#ffe2af" strokeOpacity=".5" strokeWidth="1.2"/>
    </g>
   </g>
   <circle cx="160" cy="128" r="105" fill="#100c09" stroke="#000" strokeWidth="1.5"/>
   <circle cx="160" cy="128" r="103" fill={'url(#'+id+'rim)'}/>
   <circle cx="160" cy="128" r="99" fill="#52321e"/>
   <circle cx="160" cy="128" r="97" fill={'url(#'+id+'face)'}/>
   <circle cx="160" cy="128" r="91" fill="none" stroke="#634028" strokeWidth=".5"/>
   {Array.from({length:60},(_,index)=><line key={index} x1="160" y1="47" x2="160" y2={index%5===0?54:50} transform={`rotate(${index*6} 160 128)`} stroke="#4c3020" strokeWidth={index%5===0?1.6:.7}/>) }
   {Array.from({length:12},(_,index)=>{
    const n=index+1,angle=n*Math.PI/6;
    return <text key={n} x={160+Math.sin(angle)*66} y={133-Math.cos(angle)*66} textAnchor="middle" fill="#422a1c" fontSize="11" fontFamily="Georgia,serif">{n}</text>;
   })}
   <text x="160" y="100" textAnchor="middle" fill="#573820" fontSize="6.4" fontFamily="Arial,sans-serif" letterSpacing="1.1">ESPRESSOULSTER</text>
   <path d="M141 232c-3 8 7 15 13 10l6-8 6 8c6 5 16-2 13-10M150 236l10 20 10-20m-10 20v12" fill="none" stroke="#cda570" strokeWidth="1.2"/>
   <circle cx="160" cy="258" r="2" fill="#e8c58b"/>
   <text x="160" y="171" textAnchor="middle" fill="#51321f" fontSize="12" fontFamily="Arial,sans-serif" fontVariant="tabular-nums" letterSpacing="1" aria-label={(result.finished?'Final order time: ':'Time since ordering: ')+(now===null||!result.hasTime?'unavailable':elapsedLabel(seconds))} suppressHydrationWarning>{now===null||!result.hasTime?'--:--':elapsedLabel(seconds)}</text>
   <g style={{transform:`rotate(${seconds/120}deg)`} as CSSProperties} className="order-clock-hand"><path d="M157.5 139 158 92 160 83 162 92 162.5 139Z" fill="#33251c"/></g>
   <g style={{transform:`rotate(${seconds/10}deg)`} as CSSProperties} className="order-clock-hand"><path d="M158.5 141 159 63 160 56 161 63 161.5 141Z" fill="#33251c"/></g>
   <g style={{transform:`rotate(${seconds*6}deg)`} as CSSProperties} className="order-clock-hand"><path d="M160 147V50" stroke="#95513a" strokeWidth="1"/><circle cx="160" cy="143" r="3" fill="none" stroke="#95513a"/></g>
   <circle cx="160" cy="128" r="4" fill="#38261b"/><circle cx="160" cy="128" r="1.5" fill="#e5b580"/>
   {order.status === 'completed' && <path className="order-glass-cracks" aria-hidden="true" d="M162 127 145 101 116 89 93 60M145 101 148 72 134 35M116 89 91 98 65 93M162 127 183 105 204 108 236 66M183 105 180 81 191 37M204 108 226 127 256 122M162 127 188 149 181 176 205 215M188 149 221 149 250 167M162 127 149 149 113 158 87 195M149 149 153 181 137 221M113 158 99 137 64 131" />}
  </svg>
  {order.status==='completed' ? <div className="order-clock-celebration" role="status">
   <CinematicBlast glass sourceRef={clock} className="order-clock-cinematic" decorative/>
   {renderCompletion ? renderCompletion(result.hasTime ? elapsedLabel(seconds) : null) : <div className="order-completion-finish">
    <svg className="order-completion-tick" viewBox="0 0 48 48" aria-hidden="true">
     <circle cx="24" cy="24" r="21" fill="#315f7d" />
     <path d="m13 24 7 7 15-15" fill="none" stroke="white" strokeWidth="3.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <div className="order-completion-copy">
     <strong>Thank you!</strong>
     {result.hasTime && <small>Order time · {elapsedLabel(seconds)}</small>}
    </div>
   </div>}
  </div> : <div key={order.status} className="order-clock-status" role="status"><span>{status}</span></div>}

 </section>;
}
