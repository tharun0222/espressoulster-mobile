'use client';
import {useEffect,useRef,type RefObject} from 'react';

export const cinematicOptions=[
 {name:'Hollywood fireball',description:'The clock bursts into a fireball, smoke and sparks.',hue:0,fire:1,smoke:1,spread:1,speed:1,mode:'fire'},
 {name:'Ground detonation',description:'A low impact sends a dust cloud and sparks upward.',hue:-8,fire:.8,smoke:1.3,spread:1.25,speed:1,mode:'ground'},
 {name:'Solar flare',description:'An intense golden core opens into sweeping solar fire.',hue:12,fire:1.35,smoke:.25,spread:1.2,speed:.85,mode:'solar'},
 {name:'Supernova',description:'The clock face breaks apart in a brilliant central flare.',hue:22,fire:1.15,smoke:.3,spread:1.4,speed:1.05,mode:'nova'},
 {name:'Smoke bomb',description:'Dense copper-lit smoke rolls outward with a few embers.',hue:0,fire:.15,smoke:1.65,spread:1.15,speed:.85,mode:'smoke'},
 {name:'Golden core rupture',description:'A golden core breaks the clock face into sparks.',hue:18,fire:.18,smoke:.35,spread:1.4,speed:1.1,mode:'wave'},
 {name:'Meteor impact',description:'A falling meteor strikes, then throws out fire and debris.',hue:-12,fire:1.2,smoke:1.1,spread:1.15,speed:1,mode:'meteor'},
 {name:'Electric plasma',description:'Blue plasma builds around the core and bursts through the clock face.',hue:175,fire:1.2,smoke:.25,spread:1,speed:1.05,mode:'plasma'},
 {name:'Ember storm',description:'Glowing embers sweep across lingering dark smoke.',hue:-5,fire:.25,smoke:1.3,spread:1.15,speed:.8,mode:'embers'},
 {name:'Copper nebula',description:'A slow spiralling cloud glows with warm copper light.',hue:-18,fire:.8,smoke:.75,spread:1.25,speed:.75,mode:'vortex'},
 {name:'Frozen impact',description:'An icy blue impact with bright frost-like sparks.',hue:165,fire:.65,smoke:.4,spread:1.25,speed:.9,mode:'ice'},
 {name:'Stardust nova',description:'A violet core releases a dense field of golden stars.',hue:260,fire:.45,smoke:.2,spread:1.3,speed:.85,mode:'stars'},
 {name:'Rising inferno',description:'A tall flame plume rises into billowing smoke.',hue:-10,fire:1.4,smoke:1.25,spread:.95,speed:.9,mode:'inferno'},
 {name:'Energy vortex',description:'A rotating teal energy cloud collapses into the greeting.',hue:130,fire:.8,smoke:.4,spread:1.2,speed:.9,mode:'vortex'},
 {name:'Slow-motion blast',description:'The fireball and flying sparks unfold at half speed.',hue:0,fire:1.1,smoke:1.1,spread:1.2,speed:.55,mode:'slow'},
];

function drawGlassBlast(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, time: number, random: (seed: number) => number) {
 const age = time - .45;
 if (age < 0 || age > 2.4) return;

 for (let i = 0; i < 58; i++) {
  const angle = i * 2.39996;
  const distance = radius * (.12 + random(i + 51) * .84);
  const speed = radius * (.55 + random(i + 107) * 1.8);
  const size = radius * (.035 + random(i + 170) * .23);
  const travel = distance + speed * (1 - Math.exp(-age * 2.2));
  const fall = radius * .93 * age * age;
  const opacity = Math.min(1, age * 22, (2.4 - age) * 1.12);
  const rotation = angle + age * (random(i + 250) - .5) * 12;
  const tilt = .18 + .82 * Math.abs(Math.cos(rotation));

  ctx.save();
  ctx.translate(x + Math.cos(angle) * travel, y + Math.sin(angle) * travel + fall);
  ctx.rotate(rotation);
  ctx.scale(tilt, 1);
  ctx.globalAlpha = opacity;
  const reflection = ctx.createLinearGradient(-size, -size, size, size);
  reflection.addColorStop(0, 'rgba(248, 253, 255, .96)');
  reflection.addColorStop(.3, 'rgba(213, 239, 251, .44)');
  reflection.addColorStop(.57, 'rgba(92, 144, 178, .28)');
  reflection.addColorStop(1, 'rgba(58, 101, 135, .72)');
  ctx.beginPath();
  ctx.moveTo(-size * .75, -size * .25);
  ctx.lineTo(size * .22, -size);
  ctx.lineTo(size * (.32 + random(i + 390) * .72), size * .13);
  ctx.lineTo(-size * .12, size * .8);
  ctx.closePath();
  ctx.fillStyle = reflection;
  ctx.fill();
  ctx.lineWidth = i % 4 === 0 ? 1.15 : .65;
  ctx.strokeStyle = 'rgba(246, 252, 255, .9)';
  ctx.stroke();
  ctx.restore();
 }
}

export default function CinematicBlast({replay=0,inspect=false,preset=0,sourceRef,className='cinema-canvas',decorative=false,glass=false}:{replay?:number;inspect?:boolean;preset?:number;sourceRef?:RefObject<SVGSVGElement|null>;className?:string;decorative?:boolean;glass?:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const element=canvas.current;if(!element)return;
  const ctx=element.getContext('2d');if(!ctx)return;
  const config=cinematicOptions[preset];
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frame=0,start=0;
  const rand=(n:number)=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};
  const clouds=Array.from({length:64},(_,i)=>({angle:rand(i+1)*Math.PI*2,distance:.04+rand(i+3)*.92,size:.1+rand(i+5)*.21,lift:rand(i+8),seed:i}));
  const sparks=Array.from({length:150},(_,i)=>({angle:rand(i+130)*Math.PI*2,speed:90+rand(i+330)*360,life:1.1+rand(i+430)*2.3,width:.4+rand(i+530)*1.6}));
  function draw(time:number){
   if(!element||!ctx)return;
   if(!start)start=time;
   const t=inspect?1.35:Math.min(5.8,(time-start)/1000*config.speed);
   const rect=element.getBoundingClientRect(),w=rect.width,h=rect.height;
   const ratio=Math.min(window.devicePixelRatio||1,2);
   if(element.width!==Math.round(w*ratio)||element.height!==Math.round(h*ratio)){element.width=Math.round(w*ratio);element.height=Math.round(h*ratio)}
   ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
   const sourceElement=sourceRef?.current || element.parentElement?.querySelector<SVGSVGElement>('.cinema-source-clock');
   const source=sourceElement?.getBoundingClientRect();
   const sourceHeight=sourceElement?.viewBox.baseVal.height||465;
   const x=source?source.left-rect.left+source.width/2:w/2;
   const y=source?source.top-rect.top+source.height*128/sourceHeight:h*.3;
   if (glass) {
    const radius = (source?.width ?? Math.min(w, 320)) * 105 / 320;
    if (!reduced) drawGlassBlast(ctx, x, y, radius, t, rand);
    if (!inspect && !reduced && t < 2.85) frame = requestAnimationFrame(draw);
    return;
   }
   const age=Math.max(0,t-.6),energy=Math.max(0,1-age/3.9);
   const jitter=age>0&&age<.55?Math.pow(1-age/.55,2)*7:0;
   ctx.save();ctx.filter=`hue-rotate(${config.hue}deg)`;ctx.translate(Math.sin(t*93)*jitter,Math.cos(t*117)*jitter*.6);
   function glow(cx:number,cy:number,r:number,stops:[number,string][]){
    if(!ctx||r<=0)return;const g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);for(const [offset,color]of stops)g.addColorStop(offset,color);ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
   }
   if(!reduced){
    if(config.mode==='meteor'&&t<.6){const p=t/.6;ctx.strokeStyle='#ffdfa9';ctx.lineWidth=3;ctx.shadowBlur=20;ctx.shadowColor='#ff9545';ctx.beginPath();ctx.moveTo(x-150*(1-p),y-300*(1-p));ctx.lineTo(x-150*(1-p)-55,y-300*(1-p)-110);ctx.stroke();ctx.shadowBlur=0;}
    if(t<.6){const charge=t/.6;glow(x,y,12+charge*90,[[0,`rgba(255,223,175,${charge*.8})`],[.2,`rgba(226,133,48,${charge*.45})`],[1,'rgba(60,20,0,0)']]);}
    if(age>0){
     const expand=1-Math.exp(-age*3.5),radius=expand*Math.min(w*.7,245)*config.spread;
     glow(x,y,radius*2.2,[[0,`rgba(246,145,42,${energy*.3})`],[.4,`rgba(193,64,14,${energy*.13})`],[1,'rgba(0,0,0,0)']]);
     // Dark, rolling density first; illuminated lobes provide volume over it.
     for(const cloud of clouds){
      const distance=radius*cloud.distance;
      const px=x+Math.cos(cloud.angle+(config.mode==='vortex'?age*1.6:0))*distance*(1+age*.08);
      const py=y+Math.sin(cloud.angle+(config.mode==='vortex'?age*1.6:0))*distance*(config.mode==='inferno'?1.4:config.mode==='ground'?.4:.72)-age*age*(9+cloud.lift*10);
      const r=radius*cloud.size*(1+age*.17);
      const smoke=Math.min(1,age*.9)*config.smoke*Math.max(0,1-(age-1.5)/2.8);
      glow(px,py,r*1.3,[[0,`rgba(27,24,23,${smoke*.9})`],[.45,`rgba(48,40,34,${smoke*.8})`],[.8,`rgba(33,29,27,${smoke*.4})`],[1,'rgba(15,15,15,0)']]);
     }
     ctx.globalCompositeOperation='screen';
     const flame=Math.max(0,1-age/2.2)*config.fire;
     for(const cloud of clouds){
      const distance=radius*cloud.distance;
      const px=x+Math.cos(cloud.angle+(config.mode==='vortex'?age*1.6:0))*distance,py=y+Math.sin(cloud.angle+(config.mode==='vortex'?age*1.6:0))*distance*(config.mode==='inferno'?1.4:config.mode==='ground'?.4:.72)-age*age*10;
      const r=radius*cloud.size;
      const brightness=flame*(.45+.55*rand(cloud.seed+702));
      glow(px,py,r,[[0,`rgba(255,${Math.round(105+brightness*120)},${Math.round(20+brightness*75)},${brightness*.88})`],[.35,`rgba(247,110,15,${brightness*.75})`],[.7,`rgba(170,42,5,${brightness*.5})`],[.83,`rgba(86,16,1,${brightness*.22})`],[1,'rgba(54,9,0,0)']]);
      glow(px-r*.25,py-r*.3,r*.4,[[0,`rgba(255,225,151,${brightness*.45})`],[1,'rgba(255,118,14,0)']]);
     }
     // Fragments begin at the dial itself, then fly through the fire and smoke.
     if(age<1.65){
      for(let i=0;i<12;i++){
       const angle=i*Math.PI/6,travel=age*(100+rand(i+901)*150),px=x+Math.sin(angle)*travel,py=y-Math.cos(angle)*travel+age*age*35;
       ctx.save();ctx.translate(px,py);ctx.rotate(angle+age*(rand(i+902)-.5)*5);ctx.globalAlpha=Math.max(0,1-age/1.65);ctx.fillStyle='#c99a70';ctx.beginPath();ctx.moveTo(-7,-10);ctx.lineTo(12,-4);ctx.lineTo(6,12);ctx.lineTo(-10,7);ctx.closePath();ctx.fill();ctx.strokeStyle='#f0ce9b';ctx.lineWidth=.7;ctx.stroke();ctx.fillStyle='#49311e';ctx.font='9px Georgia';ctx.fillText(String(i+1),-3,4);ctx.restore();
      }
     }
     const core=Math.max(0,1-age/1.8)*config.fire;
     glow(x,y,radius*.72,[[0,`rgba(255,239,177,${core*.9})`],[.25,`rgba(255,178,54,${core*.7})`],[.7,`rgba(221,71,6,${core*.5})`],[1,'rgba(120,17,0,0)']]);
     const flash=Math.max(0,1-age/(config.mode==='nova'?.7:.42));
     glow(x,y,25+age*90,[[0,`rgba(255,250,221,${flash})`],[.25,`rgba(255,229,164,${flash*.9})`],[.6,`rgba(255,150,45,${flash*.6})`],[1,'rgba(255,70,0,0)']]);
     for(const spark of sparks){
      const life=Math.max(0,1-age/spark.life);if(!life)continue;
      const px=x+Math.cos(spark.angle)*spark.speed*age,py=y+Math.sin(spark.angle)*spark.speed*age+90*age*age;
      const length=(config.mode==='stars'||config.mode==='ice'?1:3)+spark.speed*(config.mode==='embers'?.055:.024)*life;
      ctx.strokeStyle=`rgba(255,${Math.round(130+life*100)},${Math.round(35+life*120)},${life})`;ctx.lineWidth=spark.width*life;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px-Math.cos(spark.angle)*length,py-Math.sin(spark.angle)*length);ctx.stroke();
     }
     ctx.globalCompositeOperation='source-over';
    }
   }
   ctx.restore();
   if(!inspect&&t<5.8)frame=requestAnimationFrame(draw);
  }
  frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
 },[replay,inspect,preset,sourceRef,glass]);
 return <canvas ref={canvas} className={className} aria-hidden={decorative||undefined} aria-label={glass ? 'Glass shards bursting from the clock face' : 'Fire and smoke bursting from the clock face'} role="img"/>;
}
