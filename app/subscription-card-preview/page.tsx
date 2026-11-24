'use client';

import {useState} from 'react';
import SubscriptionPlanCard from '../subscription-plan-card';

const examples = [
 {id:'sample-coffee',name:'Cappuccino',categoryId:'classic-hot-iced',image:'/images/menu/items/source-04.webp'},
 {id:'sample-food',name:'The Classic Schmear',categoryId:'bagel',image:'/images/menu/items/recipe-the-classic-schmear.webp'},
];

export default function SubscriptionCardPreview() {
 const [selected,setSelected]=useState(['sample-food']);
 const items=examples.filter(item=>selected.includes(item.id));
 const name=items.length===2?'Coffee & bites pass':selected.includes('sample-coffee')?'Coffee pass':'Café food pass';
 return <main className="app-shell dribbble-theme reel-theme" style={{padding:20}}>
  <h1>Automatic subscription card</h1>
  <p>Sample preview. Select items to see the generated customer card.</p>
  <fieldset style={{marginBottom:20}}>
   <legend>Included menu items</legend>
   {examples.map(item=><label key={item.id} style={{display:'block',padding:10}}>
    <input type="checkbox" checked={selected.includes(item.id)} onChange={event=>setSelected(current=>event.target.checked?[...current,item.id]:current.filter(id=>id!==item.id))}/>{' '}{item.name}
   </label>)}
  </fieldset>
  <section className="subscription-content">
   <article className="subscription-plan subscription-slide-card">
    <SubscriptionPlanCard plan={{name,amount:120000,credits:8,days:30,itemScope:'menu',includedItems:items}}/>
   </article>
  </section>
 </main>;
}
