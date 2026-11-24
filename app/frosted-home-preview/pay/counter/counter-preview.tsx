'use client';

import { useState } from 'react';
import { ArrowLeft, CheckCircle2, QrCode } from 'lucide-react';
import './counter-preview.css';

export default function CounterPreview() {
  const [scanned, setScanned] = useState(false);

  return (
    <main className="counter-preview">
      <header>
        <a href="/frosted-home-preview#home" aria-label="Back to Home"><ArrowLeft size={20} /></a>
        <h1>Pay in Store</h1>
      </header>
      <section className="counter-card">
        <p className="counter-brand">Espressoulster Coffee</p>
        <div className="counter-code" aria-hidden="true">
          {scanned ? <CheckCircle2 size={72} strokeWidth={1.4} /> : <QrCode size={142} strokeWidth={1.4} />}
        </div>
        <div role="status">
          <h2>{scanned ? 'Code recognized' : 'Show your code'}</h2>
          <p>{scanned ? 'Staff can now confirm your bill at the counter.' : 'Ask the cashier to scan this code at the counter.'}</p>
        </div>
      </section>
      <button type="button" onClick={() => setScanned(!scanned)}>
        {scanned ? 'Replay preview' : 'Simulate cashier scan'}
      </button>
      <p className="counter-demo-note">Demo only. The sample code does not identify an account or make a payment.</p>
    </main>
  );
}
