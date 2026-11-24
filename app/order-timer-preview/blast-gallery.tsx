'use client';
import {useState,type CSSProperties} from 'react';
import './blast-gallery.css';
const options=[
 ['Copper confetti','Warm copper strips burst across the screen.','confetti'],
 ['Golden shockwave','Three glowing rings expand from the timer.','rings'],
 ['Espresso spark','Fine golden sparks radiate outwards.','sparks'],
 ['Coffee bean burst','Coffee beans scatter from the centre.','beans'],
 ['Crema ripple','Soft cream-coloured ripples dissolve outward.','crema'],
 ['Ribbon celebration','Long curled ribbons sweep across the screen.','ribbons'],
 ['Star shower','Small stars bloom and drift down.','stars'],
 ['Orbit release','Copper dots spiral away from the timer.','orbit'],
 ['Champagne bubbles','Tiny golden bubbles rise from below.','bubbles'],
 ['Paper bloom','Folded paper petals open around the clock.','paper'],
 ['Firework crown','Three fireworks blossom above the greeting.','fireworks'],
 ['Pixel scatter','Small square pixels scatter and fade.','pixels'],
 ['Halo bloom','A luminous halo blooms behind the greeting.','halo'],
 ['Copper rain','Metallic confetti falls from the top.','rain'],
 ['Heart flutter','Small hearts float upward in a warm breeze.','hearts'],
 ['Sunburst','Long fine rays radiate around the timer.','sunburst'],
 ['Petal drift','Soft petals sweep diagonally across the screen.','petals'],
 ['Diamond burst','Copper diamonds scatter in layered rings.','diamonds'],
 ['Steam flourish','Wisps of steam curl upwards and disappear.','steam'],
 ['Quiet applause','A restrained ring and six floating sparks.','quiet'],
];
export default function BlastGallery(){
 const [selected,setSelected]=useState(0),[replay,setReplay]=useState(0),[playing,setPlaying]=useState(false);
 const option=options[selected];
 function play(index=selected){window.scrollTo({top:0,behavior:"instant"});setSelected(index);setPlaying(true);setReplay(value=>value+1)}
 return <main className="blast-gallery">
  <header><a href="/order-timer-preview">← Order preview</a><span>20 COMPLETION ANIMATIONS</span><h1>Pick your celebration.</h1><p>Preview only. Your app’s animation stays unchanged until you choose.</p></header>
  <section className="blast-stage" aria-label="Completion animation preview">
   {!playing?<div className="blast-idle"><span>ESPRESSOULSTER</span><div className="blast-demo-clock">02:37</div><p>Tap play to see the full animation.</p></div>:<div key={replay} className={'blast-effect effect-'+option[2]}>
    <div className="blast-particles" aria-hidden="true">{Array.from({length:option[2]==='quiet'?6:64},(_,index)=>{
     const total=option[2]==='quiet'?6:64,angle=index*Math.PI*2/total;
     return <i key={index} style={{'--x':`${Math.cos(angle)*(100+index%6*48)}px`,'--y':`${Math.sin(angle)*(100+index%6*48)}px`,'--angle':`${index*47}deg`,'--delay':`${index%8*.045}s`,'--left':`${index*37%100}%`,'--sway':`${(index%2?1:-1)*(30+index%5*20)}px`,'--origin-x':`${(index%3-1)*110}px`,'--origin-y':`${index%3===1?-105:-45}px`} as CSSProperties}>{option[2]==='stars'?'✦':option[2]==='hearts'?'♥':option[2]==='beans'?'':null}</i>;
    })}<b/><b/><b/></div>
    <strong className="blast-timer">02:37</strong>
    <div className="blast-greeting"><svg viewBox="0 0 50 50" aria-hidden="true"><circle cx="25" cy="25" r="21"/><path d="m15 25 7 7 14-15"/></svg><small>ORDER COMPLETED</small><h2>Enjoy every sip.</h2><p>Thank you for choosing Espressoulster.</p><span>Order time · 02:37</span></div>
   </div>}
  </section>
  <section className="blast-controls"><span>{String(selected+1).padStart(2,'0')} / 20</span><h2>{option[0]}</h2><p>{option[1]}</p><div><button onClick={()=>play((selected+19)%20)} aria-label="Previous animation">←</button><button className="blast-play" onClick={()=>play()}>▶ {playing?'Replay animation':'Play animation'}</button><button onClick={()=>play((selected+1)%20)} aria-label="Next animation">→</button></div></section>
  <div className="blast-options" role="group" aria-label="Choose a completion animation">{options.map(([name,,type],index)=><button key={type} aria-pressed={index===selected} onClick={()=>play(index)}><span>{String(index+1).padStart(2,'0')}</span>{name}<b aria-hidden="true">{index===selected?'●':'↗'}</b></button>)}</div>
  <footer>Choose a number from 01–20 and tell me which one to apply.</footer>
 </main>;
}
