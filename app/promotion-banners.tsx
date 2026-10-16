"use client";
import {useRef,useState} from "react";
import {ArrowUpRight,ChevronLeft,ChevronRight} from "lucide-react";
export default function PromotionBanners({banners,onMenu,onSubscriptions}:{banners:any[];onMenu:(search:string)=>void;onSubscriptions:()=>void}){
 const rail=useRef<HTMLDivElement>(null),[active,setActive]=useState(0);
 const campaigns=(banners||[]).filter(b=>b.enabled && b.image);
 if(!campaigns.length)return null;
 function choose(index:number){const node=rail.current?.children[index] as HTMLElement|undefined;if(node)rail.current?.scrollTo({left:node.offsetLeft,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});}
 return <section className="promotions" aria-label="Featured promotions"><div className="promotion-rail" ref={rail} onScroll={()=>{const el=rail.current;if(el){const step=(el.children[0] as HTMLElement)?.offsetWidth+12;setActive(Math.min(campaigns.length-1,Math.max(0,Math.round(el.scrollLeft/step))));}}}>{campaigns.map((c,i)=><article className="promotion-banner" key={c.id} aria-label={c.title||"Café promotion"}><img src={c.image} alt={c.title||"Café promotion"} loading={i===0?"eager":"lazy"}/>{(c.title||c.copy||c.action)&&<><div className="promotion-shade"/><div className="promotion-copy">{c.tag&&<span className="promotion-tag">{c.tag}</span>}{c.title&&<h3>{c.title}</h3>}{c.copy&&<p>{c.copy}</p>}{c.action&&<button onClick={()=>c.destination==="subscriptions"?onSubscriptions():onMenu(c.search||"")}>{c.action}<ArrowUpRight size={17}/></button>}</div></>}</article>)}</div>{campaigns.length>1&&<div className="promotion-controls"><span>Swipe to explore</span><div className="promotion-arrows"><button aria-label="Previous promotion" disabled={active===0} onClick={()=>choose(active-1)}><ChevronLeft size={16}/></button><button aria-label="Next promotion" disabled={active===campaigns.length-1} onClick={()=>choose(active+1)}><ChevronRight size={16}/></button></div></div>}</section>;
}
