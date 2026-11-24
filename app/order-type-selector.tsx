'use client';

import {useRef, useState, type CSSProperties} from 'react';
import {Truck} from 'lucide-react';
import {enabledOrderTypes, type OrderType, type OrderTypeSettings} from '../lib/order-type';
import './order-type-selector.css';

type Props = {
  value: string;
  settings: OrderTypeSettings;
  onChange: (value: OrderType) => void;
  illustrated?: boolean;
  label?: string;
  dineInLabel?: string;
  takeAwayLabel?: string;
};

export default function OrderTypeSelector({value, settings, onChange, illustrated = false, label = 'Order type', dineInLabel = 'Dine in', takeAwayLabel = 'Take away'}: Props) {
  const modes = enabledOrderTypes(settings);
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<{x: number; y: number; pointer: number} | null>(null);
  const skipClickUntil = useRef(0);
  const [motion, setMotion] = useState({version: 0, direction: 1});

  const choose = (mode: OrderType) => {
    setMotion(old => ({version: old.version + 1, direction: modes.indexOf(mode) >= modes.indexOf(value as OrderType) ? 1 : -1}));
    onChange(mode);
  };

  if (!modes.length) return null;

  const names = {dine_in: dineInLabel, pickup: takeAwayLabel, delivery: 'Delivery'};
  const images = {dine_in: '/images/navigation/dine-in.svg', pickup: '/images/navigation/take-away.svg', delivery: ''};

  return <div ref={root} className={`order-mode home-order-cards order-type-selector${illustrated ? '' : ' order-type-compact'}`} role="group" aria-label={label}
    style={{'--order-shift': `${motion.direction * -16}px`, '--order-tilt': `${motion.direction * -7}deg`} as CSSProperties}
    onPointerDown={event => { if (event.isPrimary && event.button === 0) gesture.current = {x: event.clientX, y: event.clientY, pointer: event.pointerId}; }}
    onPointerCancel={() => { gesture.current = null; }}
    onPointerUp={event => {
      const start = gesture.current;
      gesture.current = null;
      if (!start || start.pointer !== event.pointerId || !root.current) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) < 32 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      const buttons = [...root.current.querySelectorAll('button')];
      const nearest = buttons.reduce((best, button, index) => {
        const rect = button.getBoundingClientRect();
        const distance = Math.abs(event.clientX - (rect.left + rect.width / 2));
        return distance < best.distance ? {index, distance} : best;
      }, {index: 0, distance: Infinity});
      skipClickUntil.current = event.timeStamp + 350;
      choose(modes[nearest.index]);
    }}
    onClickCapture={event => {
      const skip = event.timeStamp < skipClickUntil.current;
      skipClickUntil.current = 0;
      if (skip) { event.preventDefault(); event.stopPropagation(); }
    }}>
    {modes.map((mode, index) => <button type="button" key={mode} data-order-type={mode} aria-pressed={value === mode} onClick={() => choose(mode)}
      onKeyDown={event => {
        const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!offset) return;
        event.preventDefault();
        const next = Math.max(0, Math.min(modes.length - 1, index + offset));
        choose(modes[next]);
        root.current?.querySelectorAll('button')[next]?.focus();
      }}>
      <span key={`${mode}-${value === mode ? motion.version : 'idle'}`} className="order-mode-content">
        <span className="order-mode-art" aria-hidden="true">
          {images[mode] ? <img src={images[mode]} alt="" width={80} height={64} draggable={false}/> : <Truck size={28} strokeWidth={1.6}/>}
        </span>
        <span className="order-mode-label">{names[mode]}</span>
      </span>
    </button>)}
  </div>;
}
