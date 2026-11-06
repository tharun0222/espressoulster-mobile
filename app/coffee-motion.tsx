'use client';
import {useEffect} from 'react';
import {ArrowUpRight} from 'lucide-react';
export function CoffeeMotionHero({onMenu}:{onMenu:()=>void}){
 return <section className="coffee-photo-hero" aria-label="Explore the café menu">
  <img className="coffee-photo-image" src="/images/launch-coffee.webp" alt="Coffee and a croissant at Espressoulster" fetchPriority="high" />
  <div className="coffee-photo-shade" />
  <div className="coffee-photo-copy">
   <span className="eyebrow">ESPRESSOULSTER COFFEE</span>
   <h2>Your next<br/>favourite.</h2>
   <p>Drinks, bites and a little time for you.</p>
   <button onClick={onMenu}>Explore the menu <ArrowUpRight size={18}/></button>
  </div>
 </section>;
}
export function MobileMotion({route}:{route:string}){useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>document.documentElement.classList.toggle('motion-paused',document.hidden||media.matches);update();document.addEventListener('visibilitychange',update);media.addEventListener('change',update);return()=>{document.documentElement.classList.remove('motion-paused');document.removeEventListener('visibilitychange',update);media.removeEventListener('change',update)}},[]);useEffect(()=>{if(matchMedia('(prefers-reduced-motion: reduce)').matches||!('IntersectionObserver' in window))return;const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('mobile-reveal');observer.unobserve(entry.target)}}),{threshold:.08});document.querySelectorAll('.product-card,.subscription-slide-card,.order-card,.usual-card,.club-offer').forEach(el=>observer.observe(el));return()=>observer.disconnect()},[route]);return null}
