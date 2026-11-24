 'use client';
import {useState} from 'react';
import {subscriptionBannerInk} from '../lib/subscription-catalog';
function ItemImage({item}:{item:any}){
 const [failed,setFailed]=useState(false);
 if(!item.image||failed)return <div className="subscription-image-missing"><span>{item.name}</span><small>Image unavailable</small></div>;
 return item.imageAtlas?<div role="img" aria-label={item.name} className="subscription-item-photo subscription-item-atlas-photo" style={{backgroundImage:`url("${item.image}")`,backgroundSize:'500% 200%',backgroundPosition:item.imagePosition||'center'}}/>:<img className="subscription-item-photo" src={item.image} alt={item.name} loading="lazy" onError={()=>setFailed(true)}/>;
}
export default function SubscriptionItemBanner({items=[],credits,creditLabel='item credits',banner={},purchasedCount=0}:{items?:any[],credits?:number,creditLabel?:string,banner?:any,purchasedCount?:number}){
 const selected=banner.image?[{id:'custom',name:'Subscription banner',image:banner.image}]:items.slice(0,4);
 return <div className="subscription-items-banner">
 {selected.length?<div className={'subscription-item-photos count-'+selected.length}>{selected.map(item=><ItemImage key={item.id+item.image} item={item}/>)}</div>:<img className="subscription-default-photo" src="/images/launch-coffee.webp" alt="Coffee at Espressoulster"/>}
 {credits!==undefined&&<div className="subscription-credit-overlay"><strong style={{color:banner.numberColor||subscriptionBannerInk}}>{credits}</strong><span style={{color:banner.textColor||subscriptionBannerInk}}>{creditLabel}</span></div>}
 {purchasedCount>0&&<span className="subscription-purchased-count">{purchasedCount} purchased</span>}
 {items.length>4&&<span className="subscription-more-items">+{items.length-4} more items</span>}
 </div>;
}
