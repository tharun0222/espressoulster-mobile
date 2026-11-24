'use client';

import { useState, type CSSProperties } from 'react';
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, RotateCcw, ScanLine } from 'lucide-react';
import './scanner-previews.css';

const designs = [
  ['Frosted Focus', 'A cool light sweeps down the glass frame.', 'frost', 'sweep'],
  ['Edge to Edge', 'A mint beam travels across a wide grid.', 'edge', 'wide'],
  ['Soft Lens', 'A soft blue band glides through a rounded lens.', 'soft', 'lens'],
  ['Corner Lock', 'Four brackets move inward to frame the code.', 'frost', 'lock'],
  ['Glass Ripple', 'Two outlines expand from the center and dissolve.', 'soft', 'ripple'],
  ['Dual Sweep', 'Two lines meet in the middle and pass through each other.', 'edge', 'dual'],
  ['Prism Sweep', 'A narrow beam crosses the frame on a diagonal.', 'frost', 'prism'],
  ['Aperture', 'A circular iris opens and closes around the target.', 'soft', 'iris'],
  ['Radar Arc', 'A translucent arc rotates around the viewfinder.', 'edge', 'radar'],
  ['Corner Relay', 'Light travels around the four corners in sequence.', 'frost', 'relay'],
  ['Focus Pull', 'A soft outline moves from blurred to sharp.', 'soft', 'focus'],
  ['Crosshair', 'Two axes converge on the center of the frame.', 'edge', 'cross'],
  ['Orbit Dots', 'Two small lights orbit the target.', 'frost', 'orbit'],
  ['Split Frame', 'The left and right brackets slide apart and back.', 'frost', 'split'],
  ['Center Out', 'A bright line grows outward from the center.', 'soft', 'expand'],
  ['Pixel Trail', 'Four light points move down the scan window.', 'edge', 'pixels'],
  ['Waterline', 'A soft wave rolls across the bottom of the lens.', 'soft', 'wave'],
  ['Border Draw', 'A bright trace follows the viewfinder’s edge.', 'frost', 'trace'],
  ['Shutter Reveal', 'Two panels retract to reveal the scan area.', 'edge', 'shutter'],
  ['Scan to Review', 'The frame locks, then a check confirms the code was read.', 'frost', 'review'],
] as const;

export default function ScannerPreviews() {
  const [selected, setSelected] = useState(0);
  const [replay, setReplay] = useState(0);
  const [name, description, design, motion] = designs[selected];

  function step(direction: number) {
    setSelected((index) => (index + direction + designs.length) % designs.length);
  }

  return (
    <main className="pay-designs">
      <header>
        <a href="/frosted-home-preview#home" aria-label="Back to Home"><ArrowLeft size={20} /></a>
        <h1>Pay in Store previews</h1>
      </header>
      <div className="pay-gallery-controls">
        <button type="button" aria-label="Previous animation" onClick={() => step(-1)}><ChevronLeft size={20} /></button>
        <select aria-label="Choose an animation" value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
          {designs.map(([label], index) => <option key={label} value={index}>{String(index + 1).padStart(2, '0')} · {label}</option>)}
        </select>
        <button type="button" aria-label="Next animation" onClick={() => step(1)}><ChevronRight size={20} /></button>
        <button type="button" aria-label="Replay animation" onClick={() => setReplay((value) => value + 1)}><RotateCcw size={17} /></button>
      </div>
      <section className="pay-design" data-design={design} data-motion={motion} key={motion + replay} aria-label={name}>
        <div className="pay-design-title"><ScanLine size={20} aria-hidden="true" /><h2>Scan &amp; pay</h2></div>
        <div className="pay-design-camera">
          <div className="pay-design-frame" aria-hidden="true">
            <i /><i /><i /><i />
            <span className="pay-design-beam" />
            <Camera className="pay-design-camera-icon" size={24} />
            <div className="pay-motion">
              {[0, 1, 2, 3].map((index) => <span key={index} style={{ '--part': index } as CSSProperties} />)}
            </div>
          </div>
          <span className="pay-design-camera-label">Simulated camera</span>
        </div>
        <p>Point your camera at the café’s UPI QR code.</p>
      </section>
      <p className="pay-design-description">{description}</p>
    </main>
  );
}
