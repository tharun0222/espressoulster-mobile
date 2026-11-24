'use client';

import {memo, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties} from 'react';
import './coffee-showcase.css';

// Wheel motion follows the reference; every drink photo comes from the live menu.
// See public/coffee-showcase/SOURCE.md for provenance.
import {availableShowcaseItems, type ShowcaseProduct, type ShowcaseItem} from '../lib/coffee-showcase';

const ROTATION_DELAY = 4200;

export default memo(function CoffeeShowcase({products, currency = "INR", onSelect}: {products: ShowcaseProduct[]; currency?: string; onSelect: (id: string) => void}) {
  const items = useMemo(() => availableShowcaseItems(products), [products]);
  if (!items.length) return null;
  return <AvailableCoffeeShowcase key={items.map(item => item.id).join(':')} flavors={items} currency={currency} onSelect={onSelect}/>;
});

function AvailableCoffeeShowcase({flavors, currency, onSelect}: {flavors: ShowcaseItem[]; currency: string; onSelect: (id: string) => void}) {
  const wrap = useCallback((value: number) => (value % flavors.length + flavors.length) % flavors.length, [flavors.length]);
  const stage = useRef<HTMLDivElement>(null);
  const wheel = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const offset = useRef(0);
  const dragValue = useRef(0);
  const drag = useRef<{id: number; x: number; y: number; step: number; active: boolean} | null>(null);
  const suppressDragClick = useRef(false);
  const [scene, setScene] = useState({position: 0, previous: -1});
  const [inView, setInView] = useState(false);
  const position = scene.position;
  const active = wrap(position);

  const settle = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    wheel.current?.removeAttribute('data-dragging');
    const next = offset.current;
    wheel.current?.style.setProperty('--rot', String(next));
    setScene(current => current.position === next ? current : {position: next, previous: wrap(current.position)});
  }, [wrap]);

  useEffect(() => () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);

  const pick = useCallback((delta: number) => {offset.current += delta; settle();}, [settle]);

  useEffect(() => {
    if (!stage.current || flavors.length < 2) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [flavors.length]);

  useEffect(() => {
    if (!inView || flavors.length < 2) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const timer = window.setInterval(() => {
      if (document.hidden || reducedMotion.matches || drag.current) return;
      pick(1);
    }, ROTATION_DELAY);
    return () => window.clearInterval(timer);
  }, [flavors.length, inView, pick, position]);

  function finish(cancelled: boolean) {
    if (!drag.current) return;
    if (drag.current.active && !cancelled) {
      const amount = dragValue.current;
      offset.current += Math.round(amount) || (Math.abs(amount) > .25 ? Math.sign(amount) : 0);
    }
    dragValue.current = 0;
    drag.current = null;
    settle();
  }

  return <section className="espresso-showcase" aria-label="Espressoulster coffee showcase">
    <div ref={stage} className="espresso-stage" tabIndex={0}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault(); pick(event.key === 'ArrowRight' ? 1 : -1);
        }
      }}
      onPointerDown={event => {
        if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
        suppressDragClick.current = false;
        const control = (event.target as HTMLElement).closest('button,a');
        if (flavors.length < 2 || (control && !control.classList.contains('espresso-tile'))) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const step = Math.min(bounds.height, bounds.width * 1.2) * 1.38 * .1822;
        drag.current = {id: event.pointerId, x: event.clientX, y: event.clientY, step: Math.max(1, step), active: false};
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        const dx = event.clientX - current.x, dy = event.clientY - current.y;
        if (!current.active) {
          if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {drag.current = null; return;}
          if (Math.abs(dx) < 8) return;
          current.active = true;
          suppressDragClick.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          wheel.current?.setAttribute('data-dragging', '');
        }
        dragValue.current = Math.max(-2.4, Math.min(2.4, -dx / current.step));
        if (!frame.current) frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          wheel.current?.style.setProperty('--rot', (offset.current + dragValue.current).toFixed(4));
        });
      }} onPointerUp={event => {if (event.pointerId === drag.current?.id) finish(false);}}
      onPointerCancel={event => {if (event.pointerId === drag.current?.id) finish(true);}}
      onLostPointerCapture={event => {
        if (event.target === event.currentTarget && event.pointerId === drag.current?.id) finish(true);
      }}
      onClickCapture={event => {
        if (suppressDragClick.current && event.detail > 0) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}>
      <div className="espresso-scene" aria-hidden="true">
        {flavors.map((flavor,index) => index===active || index===scene.previous ? <div key={flavor.id} className={'espresso-menu-scene '+(index===active?'active':'previous')}>
          <MenuGlass flavor={flavor} hero priority={position===0 && index===active}/>
        </div> : null)}
      </div>
      <div ref={wheel} className="espresso-wheel" role="group" aria-label="Coffee flavours">
        {Array.from({length: 7}, (_, index) => position - 3 + index).map(slot => {
          const flavor = flavors[wrap(slot)], delta = slot - position;
          const reachable = flavors.length > 1 && delta !== 0 && Math.abs(delta) <= Math.min(2, Math.floor(flavors.length / 2));
          return <button type="button" key={slot} className="espresso-tile" style={{'--v': slot} as CSSProperties}
            tabIndex={reachable ? 0 : -1} aria-hidden={!reachable} disabled={!reachable}
            aria-label={`Choose ${flavor.name}`} onClick={() => pick(delta)}>
            <WheelGlass flavor={flavor}/>
          </button>;
        })}
      </div>
      <p className="espresso-flavour" key={position}>{flavors[active].name}</p>
      <button className="espresso-showcase-menu" onClick={() => onSelect(flavors[active].id)}>View drink · {new Intl.NumberFormat("en-IN", {style: "currency", currency}).format(flavors[active].price / 100)} <span aria-hidden="true">↗</span></button>
    </div>
  </section>;
}

const WheelGlass = memo(MenuGlass);

function MenuGlass({flavor, hero=false, priority=false}: {flavor: ShowcaseItem; hero?: boolean; priority?: boolean}) {
  const printId = `cup-print-${useId().replace(/:/g, '')}`;
  const logo = hero ? flavor.logo : undefined;
  return <span className="espresso-menu-glass" style={{maskImage:flavor.mask?`url("${flavor.mask}")`:undefined,WebkitMaskImage:flavor.mask?`url("${flavor.mask}")`:undefined}}>
    {flavor.imageAtlas?<span className="espresso-menu-atlas" style={{backgroundImage:`url("${flavor.image}")`,backgroundPosition:flavor.imagePosition}}/>:<img src={flavor.image} alt="" draggable={false} decoding="async" loading="eager" fetchPriority={priority?'high':'auto'} style={{objectPosition:flavor.imagePosition}}/>}
    {logo && <svg className="espresso-cup-wordmark" style={{left: `${logo.x}%`, top: `${logo.y}%`, width: `${logo.width}%`, color: logo.ink, opacity: logo.opacity, mixBlendMode: logo.ink === '#fff4df' ? 'screen' : 'multiply', rotate: `${logo.tilt}deg`}} viewBox="0 0 320 150" aria-hidden="true">
          <defs>
            <path id={`${printId}-name`} d={`M32 101 Q160 ${101 + logo.curve} 288 101`}/>
            <path id={`${printId}-coffee`} d={`M80 132 Q160 ${132 + logo.curve * .5} 240 132`}/>
            <linearGradient id={`${printId}-ink`}>
              <stop offset="0" stopColor="white" stopOpacity=".65"/>
              <stop offset=".22" stopColor="white" stopOpacity=".95"/>
              <stop offset=".48" stopColor="white"/>
              <stop offset=".57" stopColor="white" stopOpacity=".8"/>
              <stop offset=".68" stopColor="white" stopOpacity=".96"/>
              <stop offset="1" stopColor="white" stopOpacity=".65"/>
            </linearGradient>
            <mask id={`${printId}-surface`}><rect width="320" height="150" fill={`url(#${printId}-ink)`}/></mask>
          </defs>
          <g fill="currentColor" textAnchor="middle" mask={`url(#${printId}-surface)`}>
            <text fontFamily="Arial, Helvetica, sans-serif" fontSize="34" fontWeight="600" letterSpacing="-1.2"><textPath href={`#${printId}-name`} startOffset="50%">Espressoulster</textPath></text>
            <text fontFamily="Arial, Helvetica, sans-serif" fontSize="10" fontWeight="500" letterSpacing="5"><textPath href={`#${printId}-coffee`} startOffset="50%">COFFEE</textPath></text>
          </g>
        </svg>}
  </span>;
}
