"use client";

import { useEffect, useState } from "react";
import OrderPendulum from "../order-pendulum";
import "../order-status-screen.css";
import "../frosted-home-preview/preview.css";
import "./completion-preview.css";

const finishes = [
  { name: "Drawn tick", motion: "draw" },
  { name: "Soft fade", motion: "fade" },
  { name: "Gentle rise", motion: "rise" },
  { name: "Small pop", motion: "pop" },
  { name: "Outline circle", motion: "circle" },
  { name: "Frosted badge", motion: "glass" },
  { name: "Soft focus", motion: "focus" },
  { name: "Side reveal", motion: "slide" },
  { name: "Filled circle", motion: "filled" },
  { name: "One pulse", motion: "pulse" },
];

function Sequence({ option }: { option: (typeof finishes)[number] }) {
  const [startedAt, setStartedAt] = useState("");
  const [completedAt, setCompletedAt] = useState("");

  useEffect(() => {
    setStartedAt(new Date(Date.now() - 118000).toISOString());
  }, []);

  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setTimeout(() => setCompletedAt(new Date().toISOString()), 2000);
    return () => window.clearTimeout(timer);
  }, [startedAt]);

  return (
    <div className="order-status-screen completion-preview-stage" aria-label="Sample order status">
      <header className="order-status-screen-header"><div><span>Order status</span><strong>Sample order</strong></div></header>
      {startedAt && <OrderPendulum order={{
        created_at: startedAt,
        status: completedAt ? "completed" : "preparing",
        events: completedAt ? [{ status: "completed", created_at: completedAt }] : [],
      }} renderCompletion={elapsed => (
        <article className="completion-preview-finish" data-motion={option.motion}>
          <div className="completion-preview-tick" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none">
              <circle className="completion-preview-ring" cx="24" cy="24" r="21" />
              <path d="m13 24 7 7 15-15" pathLength="1" />
            </svg>
          </div>
          <div className="completion-preview-copy">
            <strong>Thank you!</strong>
            {elapsed && <small>Order time · {elapsed}</small>}
          </div>
        </article>
      )} />}
    </div>
  );
}

export default function OrderCompletionPreview() {
  const [index, setIndex] = useState(0);
  const [replay, setReplay] = useState(0);
  const choose = (next: number) => {
    setIndex((next + finishes.length) % finishes.length);
    setReplay(count => count + 1);
  };

  return <main className="frosted-preview completion-preview">
    <h1>Order completion previews</h1>
    <label htmlFor="completion-option">Choose a finish</label>
    <select id="completion-option" value={index} onChange={event => choose(Number(event.target.value))}>
      {finishes.map(({ name }, position) => <option key={name} value={position}>
        {String(position + 1).padStart(2, "0")} · {name}
      </option>)}
    </select>
    <Sequence key={replay} option={finishes[index]} />
    <nav aria-label="Preview controls">
      <button type="button" onClick={() => choose(index - 1)}>Previous</button>
      <button type="button" onClick={() => choose(index)}>Replay sequence</button>
      <button type="button" onClick={() => choose(index + 1)}>Next</button>
    </nav>
  </main>;
}
