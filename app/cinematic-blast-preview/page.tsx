'use client';
import {useState} from 'react';
import CinematicBlast,{cinematicOptions} from '../cinematic-blast';
import './cinematic.css';

export default function CinematicPreview(){
 const [replay,setReplay]=useState(0),[inspect,setInspect]=useState(false),[selected,setSelected]=useState(0);
 const option=cinematicOptions[selected];
 function restart(hold:boolean){window.scrollTo({top:0,behavior:'instant'});setInspect(hold);setReplay(n=>n+1)}
 function choose(index:number){window.scrollTo({top:0,behavior:'instant'});setSelected(index);setInspect(false);setReplay(n=>n+1)}
 return <main className="cinema-preview"><header><a href="/blast-preview">← 20 previews</a><span>15 CINEMATIC BLASTS · SELECT A NUMBER</span></header>
  <section className="cinema-screen" key={selected+':'+replay+':'+inspect} style={{'--reveal-delay':`${2.9/option.speed}s`,'--blast-speed':`${.95/option.speed}s`} as React.CSSProperties}>
   <svg className="cinema-source-clock" viewBox="0 0 320 465" aria-label="Clock before completion blast" role="img">
    <defs><radialGradient id="preview-clock-face" cx=".3" cy=".2" r=".95"><stop stopColor="#ecc59d"/><stop offset="1" stopColor="#c68b60"/></radialGradient><linearGradient id="preview-clock-metal"><stop stopColor="#8e5d33"/><stop offset=".4" stopColor="#f3d1a2"/><stop offset="1" stopColor="#9c6b43"/></linearGradient></defs>
    <path d="M160 230v181" stroke="#d3ae77" strokeWidth="1.5"/><circle cx="160" cy="420" r="21" fill="url(#preview-clock-metal)"/>
    <circle cx="160" cy="128" r="105" fill="#080808"/><circle cx="160" cy="128" r="102" fill="url(#preview-clock-metal)"/><circle cx="160" cy="128" r="97" fill="url(#preview-clock-face)"/>
    {Array.from({length:60},(_,i)=><line key={i} x1="160" y1="39" x2="160" y2={i%5===0?46:42} transform={`rotate(${i*6} 160 128)`} stroke="#69452d" strokeWidth={i%5===0?1.2:.6}/>)}
    {Array.from({length:12},(_,i)=><text key={i} x={160+Math.sin((i+1)*Math.PI/6)*72} y={132-Math.cos((i+1)*Math.PI/6)*72} textAnchor="middle" fontSize="10" fill="#513722" fontFamily="Georgia,serif">{i+1}</text>)}
    <text x="160" y="101" textAnchor="middle" fontSize="6" letterSpacing="1" fill="#573b27">ESPRESSOULSTER</text><text x="160" y="171" textAnchor="middle" fontSize="13" letterSpacing="1" fill="#513722">02:37</text>
    <path d="M160 128 142 86M160 128 200 76" stroke="#332319" strokeWidth="2" strokeLinecap="round"/><path d="M160 141V47" transform="rotate(225 160 128)" stroke="#965c3d" strokeWidth=".9"/><circle cx="160" cy="128" r="3" fill="#332319"/>
    <path d="M142 231c-3 8 8 14 12 9l6-7 6 7c5 5 15-1 12-9m-26 8 8 18 8-18" fill="none" stroke="#c9a16e" strokeWidth="1.2"/>
   </svg>
   <CinematicBlast replay={replay} inspect={inspect} preset={selected}/>
   {!inspect&&<div className="cinema-greeting" role="status"><span>ESPRESSOULSTER</span><svg viewBox="0 0 50 50" aria-hidden="true"><circle cx="25" cy="25" r="21"/><path d="m15 25 7 7 14-15"/></svg><small>ORDER COMPLETED</small><h1>Enjoy every sip.</h1><p>Thank you for choosing Espressoulster.</p><em>Order time · 02:37</em></div>}
  </section>
  <footer><small>{String(selected+1).padStart(2,'0')} / 15</small><br/><strong>{option.name}</strong><p>{option.description}</p><div><button aria-label="Previous cinematic blast" onClick={()=>choose((selected+14)%15)}>←</button><button onClick={()=>restart(false)}>Replay blast</button><button onClick={()=>restart(!inspect)}>{inspect?'Play animation':'Inspect blast frame'}</button><button aria-label="Next cinematic blast" onClick={()=>choose((selected+1)%15)}>→</button></div><small>Visual preview only. Your current app animation is unchanged.</small></footer>
  <div className="cinema-options" role="group" aria-label="Choose a cinematic blast">{cinematicOptions.map((item,index)=><button key={item.name} aria-pressed={index===selected} onClick={()=>choose(index)}><span>{String(index+1).padStart(2,'0')}</span><div><strong>{item.name}</strong><small>{item.description}</small></div><b aria-hidden="true">{selected===index?'●':'↗'}</b></button>)}</div>
  <p className="cinema-select-note">Try each one and tell me the number to apply. Your app animation is unchanged.</p>
 </main>;
}
