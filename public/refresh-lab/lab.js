const groups = [
  ["Café", "#ef9867", ["Latte Bloom", "Espresso Drip", "Steam Ribbon", "Bean Tumble", "Kettle Pour"], ["Milk opens into a rosette.", "A droplet stretches, then lands in ripples.", "Steam unfurls into a ribbon.", "Coffee beans roll into a neat stack.", "A kettle tips and fills the cup."]],
  ["Physics", "#9ce4dc", ["Pendulum", "Magnet Snap", "Spring Coil", "Ripple Pond", "Gravity Stack"], ["A weight swings under tension.", "Two poles pull together.", "A coil stretches and rebounds.", "A pull sends rings across water.", "Blocks fall into place."]],
  ["Arcade", "#ffcc62", ["Pixel Invader", "Pinball Launch", "Snake Trail", "Coin Flip", "Boss Charge"], ["Pixels assemble an invader.", "A plunger launches a ball.", "A snake winds through a grid.", "A coin turns on its edge.", "A segmented power meter charges."]],
  ["Nature", "#a9db91", ["Fern Unfurl", "Firefly Swarm", "Waterfall", "Moon Phases", "Jellyfish Drift"], ["A frond curls open.", "Fireflies gather around the pull.", "Streams spill into a pool.", "A shadow crosses the moon.", "A jellyfish pulses upward."]],
  ["Machines", "#a5c4ff", ["Gear Train", "Vault Dial", "Piston Press", "Scanner Sweep", "Radar Lock"], ["Two gears turn together.", "A vault dial lands on its mark.", "A piston presses down.", "A scanline reveals a barcode.", "Radar sweeps and locks onto a dot."]],
  ["Space", "#c0a5ff", ["Orbital Dock", "Comet Tail", "Eclipse", "Warp Tunnel", "Constellation"], ["A satellite docks at the center.", "A comet sheds a fading tail.", "Two discs align into a corona.", "A tunnel expands toward you.", "Stars connect into a constellation."]],
  ["Paper", "#f6b7b7", ["Paper Fan", "Accordion Fold", "Ribbon Knot", "Rubber Stamp", "Page Peel"], ["A folded fan opens.", "Pleats expand as you pull.", "A ribbon draws itself into a knot.", "A stamp drops and leaves a mark.", "The corner curls away."]],
  ["Music", "#f4a5e3", ["Vinyl Groove", "Equalizer", "Plucked String", "Metronome", "Wave Mixer"], ["A record spins under its stylus.", "Frequency bars rise and settle.", "A string bends and vibrates.", "A weighted arm keeps time.", "Two waves blend together."]],
  ["Digital", "#7ef7b2", ["Packet Route", "Data Rain", "Fingerprint", "Cursor Trace", "Circuit Pulse"], ["Packets travel through a network.", "Terminal glyphs fall in columns.", "Print ridges draw from the center.", "A cursor traces a path.", "A signal lights a circuit."]],
  ["Geometry", "#ff9f9d", ["Kaleidoscope", "Möbius Twist", "Spiral Galaxy", "Prism Split", "Origami Bird"], ["Petals mirror around an axis.", "A strip twists through itself.", "Stars form curved arms.", "One beam splits into a spectrum.", "Two wings fold into flight."]],
];
const concepts = groups.flatMap(([group,color,names,descriptions]) =>
  names.map((name,i)=>({group,color,name,description:descriptions[i]})));
const tau = Math.PI * 2;
const clamp = (x) => Math.min(1,Math.max(0,x));
function draw(canvas,id,p,t,done=false,area=canvas.clientHeight) {
  const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(2,devicePixelRatio);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  }
  const g=canvas.getContext("2d");
  g.setTransform(dpr,0,0,dpr,0,0);
  const bg=g.createLinearGradient(0,0,w,h);
  bg.addColorStop(0,"#311d23");bg.addColorStop(1,"#170f1b");
  g.fillStyle=bg;g.fillRect(0,0,w,h);
  g.save();g.translate(w/2,area/2);const scale=Math.min(w/124,area/82,1.6);g.scale(scale,scale);
  const color=concepts[id].color;
  g.strokeStyle=color;g.fillStyle=color;g.lineCap="round";g.lineJoin="round";g.lineWidth=2;
  const line=(...points)=>{g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.stroke()};
  const circle=(x,y,r,fill=false)=>{g.beginPath();g.arc(x,y,Math.max(.1,r),0,tau);fill?g.fill():g.stroke()};
  const arc=(x,y,r,a,b)=>{g.beginPath();g.arc(x,y,r,a,b);g.stroke()};
  const ellipse=(x,y,a,b,angle=0,fill=false)=>{g.beginPath();g.ellipse(x,y,Math.max(.1,a),Math.max(.1,b),angle,0,tau);fill?g.fill():g.stroke()};
  const seq=(n,fn)=>Array.from({length:n},(_,i)=>fn(i));
  const wave=(fn)=>line(...seq(43,i=>{const x=i*2-42;return [x,fn(x,i)]}));
  const poly=(r,n,a=0)=>seq(n+1,i=>[r*Math.cos(a+i*tau/n),r*Math.sin(a+i*tau/n)]);
  const q=p*2+t;
  const cup=()=>{line([-23,4],[-19,23],[-12,29],[12,29],[20,22],[23,4]);ellipse(0,4,23,6);arc(24,13,8,-Math.PI/2,Math.PI/2);line([-26,33],[26,33])};
  switch(id){
    case 0: cup();seq(8,i=>{let a=i*tau/8;ellipse(Math.cos(a)*p*13,4+Math.sin(a)*p*3,2+p*4,1+p*1.3,a*.35)});break;
    case 1: ellipse(0,-22+40*p,3+p*3,4+6*Math.sin(Math.PI*p),0,true);seq(3,i=>ellipse(0,22,5+i*7+p*6,2+i*2));break;
    case 2: cup();seq(3,j=>line(...seq(22,i=>[j*9-9+Math.sin(i*.24+q)*i*p*.5, -3-i*1.55])));break;
    case 3: seq(5,i=>{g.save();g.translate((i-2)*(15-3*p),-12+Math.sin(i*2+q)*15*(1-p));g.rotate(i*.6+q);ellipse(0,0,6,10,0,true);g.strokeStyle="#321d24";line([0,-7],[-2,0],[1,7]);g.restore()});break;
    case 4: cup();g.save();g.translate(-24,-23);g.rotate(p*.75);ellipse(0,0,13,8);line([11,2],[20,-6],[24,-6]);g.restore();line([-1,-23],[2,2]);break;
    case 5: {const a=Math.sin(q)*p;circle(0,-29,3,true);line([0,-29],[Math.sin(a)*30,-29+Math.cos(a)*30]);circle(Math.sin(a)*30,-29+Math.cos(a)*30,7,true);break}
    case 6: seq(2,i=>{let s=i?1:-1,x=s*(38-p*23);line([x-s*12,-13],[x,-13],[x,13],[x-s*12,13]);seq(3,j=>line([x-s*4,j*6-6],[x-s*9,j*6-6]))});break;
    case 7: line(...seq(65,i=>[Math.sin(i*.52)*12,-30+i*(.55+p*.38)]));break;
    case 8: seq(5,i=>{g.globalAlpha=(5-i)/5;ellipse(0,0,5+i*8+p*8,2+i*4+p*4)});break;
    case 9: seq(5,i=>{let x=i%2*14-14,y=24-i*11-(1-p)*((i*13)%30);g.strokeRect(x,y,14,11)});break;
    case 10: ["001000100","000101000","001111100","011010110","111111111","101111101","101000101","000101000"].forEach((row,y)=>[...row].forEach((v,x)=>{if(v==="1"){g.globalAlpha=clamp(p*2+(x+y)%4*.13);g.fillRect(x*6-27,y*6-24,5,5)}}));break;
    case 11: line([-30,23],[25,23],[31,-25]);line([-34,28-p*16],[-18,28-p*16]);circle(-21+50*p,17-38*p*p,5,true);break;
    case 12: seq(17,i=>{let a=i*.42+q;g.globalAlpha=(i+1)/17;g.fillRect((i-8)*4,Math.sin(a)*16*p,4,4)});break;
    case 13: ellipse(0,0,4+Math.abs(Math.cos(q*2))*22,26,0,true);g.strokeStyle="#442b20";ellipse(0,0,2+Math.abs(Math.cos(q*2))*15,19);break;
    case 14: g.strokeRect(-44,-11,88,22);seq(10,i=>{if(i<p*10)g.fillRect(-40+i*8,-7,6,14)});break;
    case 15: line([-19,28],[0,-27]);seq(7,i=>{let y=21-i*7,x=-17+i*2.4;line([x,y],[x-13*p,y-7]);line([x,y],[x+19*p,y-11])});break;
    case 16: seq(25,i=>{let a=i*2.4+q*.2,r=(1-p)*27+(i%7)*3;g.globalAlpha=.3+(i%5)*.14;circle(Math.cos(a)*r,Math.sin(a)*r*.7,1+i%3*.5,true)});break;
    case 17: seq(10,i=>{let y=((i*11+t*30)%48)-24;line([i*6-28,y],[i*6-31,y+9+p*8])});ellipse(0,30,24+p*10,4);break;
    case 18: circle(0,0,25,true);g.fillStyle="#211420";circle(37-65*p,-5,24,true);break;
    case 19: arc(0,1,24,Math.PI,tau);line([-24,1],[24,1]);seq(6,j=>line(...seq(16,i=>[j*8-20+Math.sin(i*.36+q+j)*p*4,3+i*1.8])));break;
    case 20: seq(2,j=>{g.save();g.translate(j*34-17,j*8-4);line(...seq(49,i=>{const a=i*tau/48+q*(j?-1:1),r=i%4<2?17:13;return [Math.cos(a)*r,Math.sin(a)*r]}));circle(0,0,5);g.restore()});break;
    case 21: circle(0,0,27);seq(12,i=>{let a=i*tau/12+q;line([Math.cos(a)*21,Math.sin(a)*21],[Math.cos(a)*25,Math.sin(a)*25])});line([0,0],[0,-18]);break;
    case 22: g.strokeRect(-24,23,48,5);g.strokeRect(-6,-32,12,29*p+8);g.fillRect(-20,-24+29*p,40,7);break;
    case 23: seq(19,i=>{g.globalAlpha=i/19<p?.9:.17;let x=i*4-38;g.fillRect(x,-16,1+i%3,32)});g.globalAlpha=1;line([p*76-38,-23],[p*76-38,23]);break;
    case 24: seq(3,i=>circle(0,0,9+i*9));line([0,0],[Math.cos(q*2)*27,Math.sin(q*2)*27]);circle(p*12,-p*11,3,true);break;
    case 25: ellipse(0,0,39,19,-.35);circle(0,0,8,true);circle(Math.cos(q*2)*39*(1-p),Math.sin(q*2)*18*(1-p),4,true);break;
    case 26: seq(20,i=>{g.globalAlpha=(20-i)/20;circle(33*p-i*3,i*.6+Math.sin(i*.2+q)*5,5-i*.19,true)});break;
    case 27: circle(0,0,25,true);g.fillStyle="#211420";circle(38*(1-p),0,22,true);break;
    case 28: seq(9,i=>{g.globalAlpha=(i+1)/9;line(...poly(3+i*4+p*4,6,q*.15+i*.05))});break;
    case 29: {const stars=[[-35,10],[-22,-12],[-4,1],[13,-18],[23,4],[36,16]];stars.forEach(([x,y])=>circle(x,y,2,true));line(...stars.slice(0,Math.max(2,Math.ceil(p*6))));break}
    case 30: seq(15,i=>{let a=-Math.PI/2+(i-7)*p*.19;line([0,24],[Math.cos(a)*53,24+Math.sin(a)*53])});break;
    case 31: seq(7,i=>{let x=i*(6+p*6)-36;line([x,-23],[x+5,-16],[x+5,23],[x,17],[x,-23])});break;
    case 32: line(...seq(80,i=>{let a=i*tau/79;return [Math.sin(a)*38*p,Math.sin(2*a)*18]}));break;
    case 33: g.strokeRect(-21,-30+37*p,42,10);g.strokeRect(-7,-40+37*p,14,10);if(p>.7)line([-13,22],[0,28],[15,20]);break;
    case 34: line([-29,-24],[29,-24],[29,14],[13,27],[-29,27],[-29,-24]);line([29,14],[25-p*16,9-p*14],[13,27]);break;
    case 35: seq(5,i=>circle(-8,0,6+i*5));line([34,-24],[31-p*20,-10],[21-p*16,-3]);circle(-8,0,3,true);break;
    case 36: seq(11,i=>{let r=4+Math.abs(Math.sin(i*.7+q*3))*p*24;g.fillRect(i*8-43,-r,5,r*2)});break;
    case 37: wave((x,i)=>Math.sin(i*Math.PI/42)*Math.cos(q*5)*p*21);circle(-42,0,3,true);circle(42,0,3,true);break;
    case 38: line([-19,26],[-7,-25],[7,-25],[19,26],[-19,26]);line([0,24],[Math.sin(q*3)*28*p,-18]);circle(Math.sin(q*3)*18*p,-3,4,true);break;
    case 39: seq(3,j=>{g.globalAlpha=.45+j*.23;wave(x=>Math.sin(x*.11+q+j*p)*12+Math.cos(x*.22-q)*p*6)});break;
    case 40: line([-38,-16],[-12,-16],[-12,15],[16,15],[16,-9],[38,-9]);circle(-38+76*p,p<.34?-16:p<.71?15:-9,4,true);break;
    case 41: g.font="10px monospace";seq(9,j=>seq(5,i=>{g.globalAlpha=.15+i*.15;g.fillText((i+j)%2?"1":"0",j*10-43,((i*11+j*4+t*22)%55)-24)}));break;
    case 42: seq(7,i=>arc(0,10,5+i*3.7,Math.PI*.8,Math.PI*(1+p*.98)));break;
    case 43: line([-38,20],[-15,-18],[10,17],[34,-14]);{let x=-38+p*72;line([x,0],[x+8,13],[x+3,11],[x,15],[x,0])}break;
    case 44: seq(6,i=>{let y=i*8-20;line([-42,y],[-18,y],[-5,y-8],[42,y-8]);circle(-42+p*84,y-(p>.45?8:0),2,true)});break;
    case 45: seq(12,i=>{let a=i*tau/12+q*.3;ellipse(Math.cos(a)*p*20,Math.sin(a)*p*20,10,4,a)});break;
    case 46: seq(13,j=>line(...seq(40,i=>{let a=i*tau/39,s=j-6;return [(25+s*Math.cos(a/2+q))*Math.cos(a),(18+s*Math.cos(a/2+q))*Math.sin(a)*.75+s*Math.sin(a/2+q)]})));break;
    case 47: seq(3,j=>seq(17,i=>{let r=i*2,a=i*.22+j*tau/3+q*.35;circle(Math.cos(a)*r,Math.sin(a)*r*.7,1.2,true)}));break;
    case 48: line([-42,3],[-13,3]);line(...poly(19,3,-Math.PI/2));seq(6,i=>{g.strokeStyle=`hsl(${i*48} 90% 70%)`;line([10,2],[42,(i-2.5)*p*10])});break;
    case 49: {let y=13-p*33+Math.sin(t*4)*3;line([-40,y],[-9,6],[0,-8],[9,6],[40,y],[13,17],[0,23],[-13,17],[-40,y]);line([0,-8],[0,23]);break}
  }
  g.restore();
  if(done){g.fillStyle="#a9db91";g.font="bold 17px system-ui";g.fillText("✓",w-26,Math.min(area-5,23));}
}

const get=(id)=>document.getElementById(id);
const screen=get("screen"), art=get("art"), mock=get("mock"), grid=get("grid"), jump=get("jump");
const reduced=matchMedia("(prefers-reduced-motion: reduce)");
let tiles=[];
let selected=0, filter="All", pull=0, start=null, frame=0;
const saved=new Set();
try {for(const id of JSON.parse(localStorage.getItem("refresh-lab-shortlist")||"[]")) saved.add(id)} catch {}
function paint(t=0,done=false){
  mock.style.transform=`translateY(${pull}px)`;
  draw(art,selected,clamp(pull/110),t,done,Math.max(1,pull));
}
function renderGrid(){
  grid.replaceChildren();
  tiles=[];
  concepts.forEach((c,i)=>{
    if(filter!=="All"&&filter!==c.group&&!(filter==="Shortlisted"&&saved.has(i)))return;
    const button=document.createElement("button");
    button.className="card";
    button.setAttribute("aria-pressed",String(selected===i));
    const tile=document.createElement("canvas");
    tile.setAttribute("aria-hidden","true");
    const label=document.createElement("span");
    label.textContent=`${String(i+1).padStart(2,"0")} · ${c.name}`;
    button.append(tile,label);grid.append(button);
    draw(tile,i,.78,0);
    tiles.push({tile,id:i});
    button.addEventListener("click",()=>{select(i);document.querySelector(".stage").scrollIntoView({block:"nearest"});});
  });
}
function syncFavorite(){
  get("favorite").textContent=saved.has(selected)?"★ Shortlisted":"☆ Shortlist";
  get("favorite").setAttribute("aria-pressed",String(saved.has(selected)));
}
function select(i){
  cancelAnimationFrame(frame);selected=i;pull=0;start=null;
  const c=concepts[i];
  get("number").textContent=`CONCEPT ${String(i+1).padStart(2,"0")} / 50 · ${c.group.toUpperCase()}`;
  get("name").textContent=c.name;get("description").textContent=c.description;
  get("status").textContent="Swipe down to preview";jump.value=String(i);
  syncFavorite();renderGrid();paint();
}
function finish(commit){
  const initial=pull, begin=performance.now(), hold=commit?650:0, duration=reduced.matches?0:330;
  get("status").textContent=commit?"Refreshing preview…":"Swipe down to preview";
  function tick(now){
    const elapsed=now-begin;
    pull=initial*(1-clamp((elapsed-hold)/Math.max(1,duration)));
    paint(reduced.matches?0:elapsed/300,commit&&elapsed>=hold*.72);
    if(elapsed<hold+duration)frame=requestAnimationFrame(tick);
    else {pull=0;paint();get("status").textContent=commit?"Preview refreshed":"Swipe down to preview";}
  }
  frame=requestAnimationFrame(tick);
}
screen.addEventListener("pointerdown",e=>{
  if(!e.isPrimary||e.button!==0||e.target.closest("button"))return;
  cancelAnimationFrame(frame);start=e.clientY;screen.setPointerCapture(e.pointerId);
});
screen.addEventListener("pointermove",e=>{
  if(start===null||!e.isPrimary)return;
  pull=Math.max(0,Math.min(132,(e.clientY-start)*.74));paint();
  get("status").textContent=pull>=84?"Release to refresh":"Keep pulling";
});
for(const event of ["pointerup","pointercancel","lostpointercapture"]){
  screen.addEventListener(event,e=>{if(start===null||!e.isPrimary)return;start=null;finish(event==="pointerup"&&pull>=84);});
}
get("play").addEventListener("click",()=>{
  cancelAnimationFrame(frame);start=null;
  if(reduced.matches){pull=108;paint();finish(true);return;}
  const begin=performance.now();
  function tick(now){
    const p=clamp((now-begin)/470);
    pull=108*p;paint();get("status").textContent=p>.78?"Release to refresh":"Pulling…";
    if(p<1)frame=requestAnimationFrame(tick);else finish(true);
  }
  frame=requestAnimationFrame(tick);
});
get("screen-play").addEventListener("click",()=>get("play").click());
get("favorite").addEventListener("click",()=>{
  if(saved.has(selected))saved.delete(selected);else saved.add(selected);
  try{localStorage.setItem("refresh-lab-shortlist",JSON.stringify([...saved]));}catch{}
  syncFavorite();renderGrid();
});
concepts.forEach((c,i)=>jump.add(new Option(`${i+1} · ${c.name}`,i)));
jump.addEventListener("change",()=>select(Number(jump.value)));
for(const label of ["All",...groups.map(g=>g[0]),"Shortlisted"]){
  const button=document.createElement("button");
  button.textContent=label;button.setAttribute("aria-pressed",String(label===filter));
  button.addEventListener("click",()=>{
    filter=label;for(const item of get("filters").children)item.setAttribute("aria-pressed",String(item===button));renderGrid();
  });
  get("filters").append(button);
}
window.addEventListener("resize",()=>{paint();renderGrid();});
select(0);

setInterval(()=>{
  if(reduced.matches||document.hidden)return;
  const time=performance.now()/1000;
  for(const {tile,id} of tiles){
    const rect=tile.getBoundingClientRect();
    if(rect.bottom>0&&rect.top<innerHeight)draw(tile,id,.68+.28*Math.sin(time*2),time);
  }
},80);

for (const [button, step] of [["previous", -1], ["next", 1]]) {
  get(button).addEventListener("click", () => {
    select((selected + step + concepts.length) % concepts.length);
    get("play").click();
  });
}
