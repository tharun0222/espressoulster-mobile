 'use client';
import {useState} from 'react';
function ItemImage({item}:{item:any}){
 const [failed,setFailed]=useState(false);
 if(!item.image||failed)return <div className="subscription-image-missing"><span>{item.name}</span><small>Image unavailable</small></div>;
 return item.imageAtlas?<div role="img" aria-label={item.name} className="subscription-item-photo" style={{backgroundImage:`url("${item.image}")`,backgroundSize:'500% 200%',backgroundPosition:item.imagePosition||'center'}}/>:<img className="subscription-item-photo" src={item.image} alt={item.name} loading="lazy" onError={()=>setFailed(true)} style={{objectPosition:item.imagePosition||'center'}}/>;
}
export default function SubscriptionItemBanner({items=[],credits,banner={}}:{items?:any[],credits?:number,banner?:any}){
 const selected=banner.image?[{id:'custom',name:'Subscription banner',image:banner.image}]:items.slice(0,4);const positioned=selected.map(item=>({...item,imagePosition:item.imageAtlas?item.imagePosition:`center ${banner.position??50}%`}));
 return <div className="subscription-items-banner" style={{height:banner.height||220}}>
 {selected.length?<div style={{transform:`scale(${(banner.zoom||100)/100})`,transformOrigin:`center ${banner.position??50}%`}} className={'subscription-item-photos count-'+selected.length}>{positioned.map(item=><ItemImage key={item.id+item.image} item={item}/>)}</div>:<img style={{objectPosition:`center ${banner.position??70}%`,transform:`scale(${(banner.zoom||100)/100})`,transformOrigin:`center ${banner.position??50}%`}} className="subscription-default-photo" src="/images/launch-coffee.webp" alt="Coffee at Espressoulster"/>}
 {credits!==undefined&&<div className="subscription-credit-overlay"><strong style={{color:banner.numberColor||'#efc77f'}}>{credits}</strong><span style={{color:banner.textColor||'#ffffff'}}>item credits</span></div>}
 {items.length>4&&<span className="subscription-more-items">+{items.length-4} more items</span>}
 </div>;
}
