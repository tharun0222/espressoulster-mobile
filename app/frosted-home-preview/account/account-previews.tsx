'use client';

import { useState, type CSSProperties } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import PinLogin from '../../pin-login';
import './account-previews.css';

const options = [
  ['Frosted Card', 'card', '#315b7a', '#f6fbff', '#a6bfd4', '#e0ecf6'],
  ['Glacier Sheet', 'sheet', '#295876', '#f0f8fc', '#a5d1e5', '#d8eaf4'],
  ['Espresso Ink', 'dark', '#b6dcf4', '#203246', '#0e1d2a', '#355471'],
  ['Café Window', 'photo', '#325779', '#f2f8fc', '#728fa9', '#d6e6f2'],
  ['Porcelain', 'paper', '#2b4b65', '#fcfdfe', '#c8d8e7', '#f6fafc'],
  ['Blue Hour', 'dark', '#ced3ff', '#263352', '#101b35', '#475d86'],
  ['Silver Outline', 'outline', '#365d76', '#edf6fb', '#adc1d4', '#d8e6f1'],
  ['Quiet Mint', 'card', '#295c5e', '#eff9f7', '#a6c9cb', '#dceef0'],
  ['Studio Column', 'studio', '#325d80', '#edf6fd', '#a4c4dd', '#e8f1fa'],
  ['Cloud Dock', 'sheet', '#465882', '#f6f7fe', '#aebcda', '#e7ecfa'],
  ['Copper & Ice', 'outline', '#784b36', '#f7f4f0', '#a7bdce', '#e6edf2'],
  ['Moonlight Frame', 'dark', '#ddebf3', '#233740', '#142027', '#435b66'],
  ['Counter Light', 'photo', '#36586a', '#f7f4ed', '#8ea7b7', '#ebedeb'],
  ['Glacial Stripe', 'studio', '#244e76', '#eaf4fb', '#8fb0cc', '#d0e4f1'],
  ['Skyline', 'paper', '#395579', '#f2f8fd', '#a9c2d8', '#e4eff8'],
] as const;

export default function AccountPreviews() {
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, layout, accent, surface, shade, glow] = options[index];
  const style = { '--auth-accent': accent, '--auth-surface': surface, '--auth-shade': shade, '--auth-glow': glow } as CSSProperties;

  function move(offset: number) {
    setIndex(current => (current + offset + options.length) % options.length);
  }

  return (
    <div className="account-gallery">
      <header className="account-toolbar">
        <div className="account-heading">
          <a href="/frosted-home-preview#home" aria-label="Back to Home"><ArrowLeft size={20} /></a>
          <h1>Account previews</h1>
        </div>
        <div className="account-picker">
          <button type="button" aria-label="Previous design" onClick={() => move(-1)}><ChevronLeft size={20} /></button>
          <select aria-label="Choose account design" value={index} onChange={event => setIndex(Number(event.target.value))}>
            {options.map(([label], position) => <option key={label} value={position}>{String(position + 1).padStart(2, '0')} · {label}</option>)}
          </select>
          <button type="button" aria-label="Next design" onClick={() => move(1)}><ChevronRight size={20} /></button>
        </div>
        <div className="account-modes" role="group" aria-label="Choose account screen">
          <button type="button" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>Sign in</button>
          <button type="button" aria-pressed={mode === 'register'} onClick={() => setMode('register')}>Create account</button>
        </div>
        <p>Preview only. Use sample details.</p>
      </header>
      <div className="account-design" data-layout={layout} style={style} aria-label={name}>
        <PinLogin key={mode} ready preview previewMode={mode} onSuccess={() => {}} />
      </div>
    </div>
  );
}
