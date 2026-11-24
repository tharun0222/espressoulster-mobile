"use client";

import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import { ArrowDown, ArrowUp, GripVertical, X } from "lucide-react";
import { homeSections, parseHomeDesign, type HomeDesign, type HomeSection } from "../../lib/home-design";
import { api } from "../store-app";

const copyFields = [
  { id: "greeting", label: "Greeting", placeholder: "Automatic daily greeting" },
  { id: "greetingSubtitle", label: "Greeting subtitle", placeholder: "Optional" },
  { id: "outletAction", label: "Café location button" },
  { id: "dineInLabel", label: "Dine-in button" },
  { id: "takeAwayLabel", label: "Takeaway button" },
  { id: "searchPlaceholder", label: "Menu search placeholder" },
] as const;

export default function HomeDesignEditor({ design, busy, onPublish }: {
  design: HomeDesign;
  busy: boolean;
  onPublish: (design: HomeDesign) => void;
}) {
  const [draft, setDraft] = useState(design);
  const [preview, setPreview] = useState(false);
  const [dragging, setDragging] = useState<HomeSection | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const list = useRef<HTMLOListElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const draggingSection = useRef<{ id: HomeSection; pointer: number; y: number; animation: number } | null>(null);
  const normalized = parseHomeDesign(draft);
  const changed = !!normalized && JSON.stringify(normalized) !== JSON.stringify(design);

  function move(id: HomeSection, index: number) {
    setDraft(current => {
      const sections = [...current.sections];
      const from = sections.findIndex(section => section.id === id);
      if (from === index || index < 0 || index >= sections.length) return current;
      const [section] = sections.splice(from, 1);
      sections.splice(index, 0, section);
      return { ...current, sections };
    });
  }

  function endDrag() {
    if (draggingSection.current) cancelAnimationFrame(draggingSection.current.animation);
    draggingSection.current = null;
    setDragging(null);
  }

  useEffect(() => () => {
    if (draggingSection.current) cancelAnimationFrame(draggingSection.current.animation);
  }, []);

  function startDrag(event: PointerEvent<HTMLButtonElement>, id: HomeSection) {
    if (event.button !== 0 || busy || draggingSection.current) return;
    list.current?.setPointerCapture(event.pointerId);
    const active = { id, pointer: event.pointerId, y: event.clientY, animation: 0 };
    draggingSection.current = active;
    setDragging(id);

    function track() {
      if (draggingSection.current !== active) return;
      const rows = Array.from(list.current?.children ?? []);
      const target = rows.findIndex(row => {
        const { top, bottom } = row.getBoundingClientRect();
        return active.y >= top && active.y < bottom;
      });
      if (target >= 0 && rows[target].getAttribute("data-section") !== active.id) move(active.id, target);
      if (active.y < 80) window.scrollBy(0, -8);
      if (active.y > window.innerHeight - 80) window.scrollBy(0, 8);
      active.animation = requestAnimationFrame(track);
    }

    active.animation = requestAnimationFrame(track);
  }

  function changeCopy(key: keyof HomeDesign["copy"], value: string) {
    setDraft(current => ({ ...current, copy: { ...current.copy, [key]: value } }));
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a PNG, JPEG or WebP photo.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError("Choose a photo smaller than 3 MB.");
      return;
    }
    setUploading(true);
    try {
      const result = await api("admin/upload", "POST", file);
      changeCopy("heroImage", result.url);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    if (!preview) return;
    const deliver = () => frame.current?.contentWindow?.postMessage(
      { type: "espresso-home-preview", design: draft }, window.location.origin,
    );
    const sendDesign = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.source === frame.current?.contentWindow &&
        event.data?.type === "espresso-home-preview-ready") deliver();
    };
    window.addEventListener("message", sendDesign);
    deliver();
    return () => window.removeEventListener("message", sendDesign);
  }, [preview, draft]);

  useEffect(() => {
    if (preview) frame.current?.parentElement?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [preview]);

  return (
    <form className="admin-panel admin-home-design" onSubmit={event => {
      event.preventDefault();
      if (normalized && changed) onPublish(normalized);
    }}>
      <h2>Customer Home</h2>
      <p>Drag sections into place, edit the content and preview before publishing.</p>
      <ol ref={list} aria-label="Home sections" onPointerMove={event => {
        const active = draggingSection.current;
        if (active?.pointer === event.pointerId) active.y = event.clientY;
      }} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
        {draft.sections.map(({ id, visible }, index) => (
          <li key={id} data-section={id} data-dragging={dragging === id}>
            <button className="icon-button admin-home-design-handle" type="button" tabIndex={-1}
              aria-label={`Drag ${homeSections[id]}`} disabled={busy}
              onPointerDown={event => startDrag(event, id)}>
              <GripVertical size={18} aria-hidden="true" />
            </button>
            <label className="admin-home-design-toggle">
              <input type="checkbox" checked={visible} disabled={busy} onChange={event => {
                const visible = event.target.checked;
                setDraft(current => ({ ...current, sections: current.sections.map(section =>
                  section.id === id ? { id, visible } : section) }));
              }} />
              {homeSections[id]}
            </label>
            <div className="admin-home-design-move">
              <button className="icon-button" type="button" aria-label={`Move ${homeSections[id]} up`}
                disabled={busy || index === 0} onClick={() => move(id, index - 1)}><ArrowUp size={17} aria-hidden="true" /></button>
              <button className="icon-button" type="button" aria-label={`Move ${homeSections[id]} down`}
                disabled={busy || index === draft.sections.length - 1} onClick={() => move(id, index + 1)}><ArrowDown size={17} aria-hidden="true" /></button>
            </div>
          </li>
        ))}
      </ol>
      <details className="admin-design-fields">
        <summary>Text and labels</summary>
        {copyFields.map(field => (
          <label key={field.id}>{field.label}
            <input value={draft.copy[field.id]} placeholder={"placeholder" in field ? field.placeholder : undefined}
              maxLength={field.id === "greetingSubtitle" ? 150 : 60} disabled={busy}
              onChange={event => changeCopy(field.id, event.target.value)} />
          </label>
        ))}
      </details>
      <details className="admin-design-fields">
        <summary>Featured drinks or photo banner</summary>
        <label>Banner photo
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || uploading} onChange={upload} />
        </label>
        {draft.copy.heroImage && <>
          <img className="admin-design-photo" src={draft.copy.heroImage} alt="Draft banner" />
          <button type="button" className="secondary" disabled={busy || uploading} onClick={() => changeCopy("heroImage", "")}>Use featured drinks animation</button>
          <label>Banner headline
            <input maxLength={60} value={draft.copy.heroTitle} disabled={busy} onChange={event => changeCopy("heroTitle", event.target.value)} />
          </label>
          <label>Menu button
            <input maxLength={60} value={draft.copy.heroAction} disabled={busy} onChange={event => changeCopy("heroAction", event.target.value)} />
          </label>
        </>}
      </details>
      {uploading && <p role="status">Uploading photo…</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="admin-home-design-actions">
        <button type="button" className="secondary" disabled={!normalized || busy || uploading} onClick={() => setPreview(true)}>Preview on mobile</button>
        <button type="submit" className="primary" disabled={!changed || busy || uploading}>Publish to all customers</button>
      </div>
      {preview && (
        <section className="admin-home-preview" aria-labelledby="admin-home-preview-title">
          <div className="admin-home-preview-toolbar">
            <h2 id="admin-home-preview-title">Mobile Home preview</h2>
            <button type="button" className="icon-button" onClick={() => setPreview(false)} aria-label="Close preview"><X size={20} aria-hidden="true" /></button>
          </div>
          <iframe ref={frame} title="Customer Home preview" src="/home-design-preview" />
        </section>
      )}
    </form>
  );
}
