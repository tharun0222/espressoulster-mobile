'use client';
import {useEffect,useState} from 'react';
import HomeLiveOrders from '../home-live-orders';
import OrderStatusScreen from '../order-status-screen';
export default function LiveOrderPreview(){
 const [starts]=useState(()=>[new Date(Date.now()-90000).toISOString(),new Date(Date.now()-20000).toISOString()]);
 const [states,setStates]=useState(['confirmed','preparing']);
 const [events,setEvents]=useState<{status:string;created_at:string}[][]>([[],[]]);
 const [selected,setSelected]=useState<string|null>(null),[run,setRun]=useState(0);
 const orders=starts.map((created_at,index)=>({id:'DEMO-'+(index+1),created_at,status:states[index],fulfillment:'pickup',items:[{product_id:'demo-latte',name:'Latte',quantity:index+1}],events:events[index]}));
 useEffect(()=>{
  if(!run)return;
  const update=(status:string)=>{setStates(previous=>[status,previous[1]]);setEvents(previous=>[[...previous[0],{status,created_at:new Date().toISOString()}],previous[1]])};
  const timers=[setTimeout(()=>update('confirmed'),1800),setTimeout(()=>update('preparing'),4200),setTimeout(()=>update('completed'),8500)];
  return()=>timers.forEach(clearTimeout);
 },[run]);
 return <main style={{maxWidth:430,minHeight:'100svh',margin:'auto',padding:'26px 22px 220px',background:'#080808',color:'#f5eee3',fontFamily:'Arial,sans-serif'}}>
  <div style={{fontSize:18,fontWeight:600}}>Espressoulster Coffee</div>
  <p style={{fontSize:9,color:'#bc956c',letterSpacing:2,marginTop:22}}>HOME PREVIEW · SAMPLE ORDERS</p>
  <h1 style={{fontSize:27,lineHeight:1.2,fontWeight:500}}>What sounds good?<br/><span style={{color:'#d7ab7e'}}>Make it coffee.</span></h1>
  <div style={{height:260,borderRadius:24,background:'url(/coffee-showcase/original.webp) center / cover',margin:'25px 0'}}/>
  <p style={{fontSize:12,lineHeight:1.7,color:'#b7a18a'}}>Use the live order bar below. Swipe to see the second order, then tap Track to open its clock.</p>
  <button onClick={()=>{setStates(previous=>['pending',previous[1]]);setEvents(previous=>[[],previous[1]]);setRun(n=>n+1);setSelected('DEMO-1')}} style={{width:'100%',padding:14,borderRadius:25,border:'1px solid #785636',background:'#e6bd91',color:'#251a10',cursor:'pointer'}}>Preview admin updates & completion</button>
  <a href="/#home" style={{display:'block',marginTop:22,color:'#b99671',fontSize:12}}>Open real Home →</a>
  <HomeLiveOrders orders={orders} onOpen={setSelected}/>
  <nav aria-label="Preview navigation" style={{position:'fixed',bottom:18,left:'50%',transform:'translateX(-50%)',width:'min(calc(100% - 28px),402px)',display:'flex',justifyContent:'space-around',padding:20,borderRadius:40,background:'#bd7145',color:'#20140b',fontSize:11,boxSizing:'border-box'}}><span>Home</span><span>Menu</span><span>Pay</span><span>Subscriptions</span><span>Profile</span></nav>
  {selected&&<OrderStatusScreen backLabel="Back to Home" order={orders.find(order=>order.id===selected)!} onClose={()=>setSelected(null)}/>}
 </main>;
}
