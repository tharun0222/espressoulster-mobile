'use client';

import {useEffect,useRef,useState} from 'react';
import OrderStatusScreen from '../order-status-screen';

export default function OrderTimerDemo({homePath = '/'}: {homePath?: string}) {
 const [selected,setSelected]=useState<number|null>(null);
 const [starts,setStarts]=useState(()=>[new Date().toISOString(),new Date(Date.now()-125000).toISOString()]);
 const [states,setStates]=useState(['pending','preparing']);
 const [events,setEvents]=useState<{status:string;created_at:string}[][]>([[],[]]);
 const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

 function update(index:number,status:string) {
  const event = {status, created_at: new Date().toISOString()};
  setStates(previous=>previous.map((s,i)=>i===index?status:s));
  setEvents(previous=>previous.map((list,i)=>i===index?[...list,event]:list));
 }

 useEffect(() => () => timers.current.forEach(clearTimeout), []);

 function play() {
  const startedAt = new Date().toISOString();
  setStarts(previous=>[startedAt,previous[1]]);
  setStates(previous=>['pending',previous[1]]);
  setEvents(previous=>[[],previous[1]]);
  setSelected(0);
  timers.current.forEach(clearTimeout);
  timers.current = [
   setTimeout(() => update(0, 'confirmed'), 2500),
   setTimeout(() => update(0, 'preparing'), 5500),
   setTimeout(() => update(0, 'ready'), 8000),
   setTimeout(() => update(0, 'completed'), 10500),
  ];
 }

 const button={padding:12,borderRadius:22,border:'1px solid var(--frosted-edge, #735038)',background:'var(--frosted-pill, #e8bd90)',color:'var(--frosted-ink, #22160e)',cursor:'pointer',margin:'6px 0',width:'100%'};
 const muted='var(--frosted-muted, #b49d89)';
 return <main style={{maxWidth:430,margin:'0 auto',minHeight:'100svh',padding:'24px 20px',background:'var(--frosted-sky, #080808)',color:'var(--frosted-ink, #f4eee6)'}}>
  <a href={`${homePath}#home`} style={{color:'var(--frosted-accent, #d6ac84)',fontSize:13}}>← Back to Home</a>
  <h1 style={{fontSize:24,marginTop:26}}>Sample orders</h1>
  <button style={button} onClick={play}>Play clock and completion blast</button>
  {starts.map((start,index)=><article key={index} style={{border:'1px solid var(--frosted-edge, #32271e)',background:'var(--frosted-glass, transparent)',borderRadius:22,padding:16,marginTop:16}}>
   <strong style={{fontSize:12}}>Sample order {index+1}</strong>
   <p style={{fontSize:12,color:muted}}>{states[index]}</p>
   <button onClick={()=>setSelected(index)} style={button}>View order status</button>
   <button onClick={()=>update(index,'completed')} style={button}>Complete sample order {index+1}</button>
  </article>)}
  {selected!==null&&<OrderStatusScreen order={{id:'Sample order '+(selected+1),created_at:starts[selected],status:states[selected],events:events[selected]}} onClose={()=>setSelected(null)}/>}
  <p style={{fontSize:12,color:muted,lineHeight:1.6}}>Sample updates only. Each real order has its own clock and follows the café’s status updates.</p>
 </main>;
}
