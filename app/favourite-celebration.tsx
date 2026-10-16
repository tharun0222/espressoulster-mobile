"use client";
import {useEffect, useId, useState} from 'react';
const heartPath = 'M12 21s-8-4.8-8-11a4.6 4.6 0 0 1 8-3.1A4.6 4.6 0 0 1 20 10c0 6.2-8 11-8 11Z';
export default function FavouriteCelebration({event}:{event:number}) {
 const [visible,setVisible]=useState(false);
 const id=useId();
 useEffect(()=>{
  if(!event)return;
  setVisible(true);
  const timer=setTimeout(()=>setVisible(false),1800);
  return ()=>clearTimeout(timer);
 },[event]);
 if(!visible)return null;
 return <div key={event} className="favourite-celebration" aria-hidden="true" data-testid="favourite-celebration">
  <span className="favourite-screen-border" />
  <div className="favourite-pop"><span className="favourite-pop-heart">
   <svg viewBox="0 0 24 24" fill="none">
    <defs>
     <linearGradient id={`${id}-gold`} x1="4" y1="3" x2="18" y2="22" gradientUnits="userSpaceOnUse"><stop stopColor="#fff2d9"/><stop offset=".5" stopColor="#f8e4c8"/><stop offset="1" stopColor="#d6ad67"/></linearGradient>
     <clipPath id={`${id}-clip`}><path d={heartPath}/></clipPath>
    </defs>
    <path d={heartPath} fill={`url(#${id}-gold)`} stroke="#e7c38d" strokeWidth=".35"/>
    <g clipPath={`url(#${id}-clip)`}><path className="heart-shine" d="M-10-5h3L8 29H5Z" fill="white" fillOpacity=".75"/></g>
    <path d="M6.3 8.2c.6-1.5 2-1.8 3.1-1.2" stroke="white" strokeOpacity=".65" strokeWidth=".65" strokeLinecap="round"/>
   </svg>
  </span></div>
 </div>;
}
