"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { api } from "../store-app";
import { AdvertisementDialog } from "../launch-advertisement";
import { isAdvertisementDestination, launchAdvertisementDestinations, type AdvertisementDraft, type LaunchAdvertisement } from "../../lib/launch-advertisement";

type Slide = AdvertisementDraft & { key: string };
const emptyDraft: AdvertisementDraft = { title: "", image: "", destination: null };
const sampleBanners: AdvertisementDraft[] = [
  { title: "Coffee on the menu", image: "/images/launch-coffee.webp", destination: "menu" },
  { title: "Espressoulster Coffee", image: "/images/frosted-welcome-cafe-full.jpg", destination: null },
];

export default function AdvertisementManager({ previewSamples = false }: { previewSamples?: boolean }) {
  const [published, setPublished] = useState<LaunchAdvertisement | null>(null);
  const [draft, setDraft] = useState<Slide[]>([]);
  const [editing, setEditing] = useState(false);
  const [reviewedDraft, setReviewedDraft] = useState<Slide[] | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<"saved" | "samples" | "draft" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api("admin/advertisement", "GET", undefined, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      const saved = result.advertisement as LaunchAdvertisement | null;
      setPublished(saved);
      setReady(true);
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setError(error.message);
    });
    return () => controller.abort();
  }, [reload]);

  async function save(operation: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try { await operation(); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  function update(key: string, patch: Partial<AdvertisementDraft>) {
    setDraft(current => current.map(slide => slide.key === key ? { ...slide, ...patch } : slide));
  }

  async function upload(event: ChangeEvent<HTMLInputElement>, key: string) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    await save(async () => {
      if (file.size > 5_000_000) throw new Error("Choose an image under 5 MB.");
      const result = await api("admin/upload", "POST", file);
      update(key, { image: result.url });
    });
  }

  function moveBanner(key: string, position: number) {
    setDraft(current => {
      const index = current.findIndex(banner => banner.key === key);
      if (index < 0 || index === position || position < 0 || position >= current.length) return current;
      const next = [...current];
      const [banner] = next.splice(index, 1);
      next.splice(position, 0, banner);
      return next;
    });
  }

  const canReview = draft.length > 0 && draft.every(slide => slide.image && slide.title.trim());
  const canSave = draft.length ? canReview && reviewedDraft === draft : Boolean(published);
  const savedBanners = published?.banners ?? [];
  const previewBanners = preview === "samples" ? sampleBanners : preview === "draft" ? draft : savedBanners;
  const closePreview = () => setPreview(null);
  function closeEditor() {
    setEditing(false);
    setDraft([]);
    setReviewedDraft(null);
  }
  return (
    <section className="admin-panel admin-advertisement" aria-label="App opening advertisement">
      <h2>Opening banners</h2>
      <p className="fine-print">Saved banners appear when customers open the app.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!ready ? (error ? (
        <button type="button" className="secondary" onClick={() => { setError(""); setReload(value => value + 1); }}>Try again</button>
      ) : <p role="status">Loading banners…</p>) : (
        <>
          <p><strong>{published ? `Live · ${published.banners.length} ${published.banners.length === 1 ? "banner" : "banners"}` : "No live banners"}</strong></p>
          {!editing && (
            <div className="admin-ad-actions">
              <button type="button" className="primary" onClick={() => {
                setDraft(savedBanners.map(banner => ({ ...banner, key: crypto.randomUUID() })));
                setError(""); setMessage(""); setEditing(true);
              }}>Edit banners</button>
              <button type="button" className="secondary" disabled={!previewSamples && !savedBanners.length}
                onClick={() => setPreview(previewSamples ? "samples" : "saved")}>Preview banners</button>
            </div>
          )}
          {editing && <form onSubmit={event => {
            event.preventDefault();
            if (!canSave || busy) return;
            void save(async () => {
              const result = await api("admin/advertisement", "PUT", { banners: draft, expectedId: published?.id ?? null });
              setPublished(result.advertisement);
              closeEditor();
              setMessage(result.advertisement ? "Banners saved for customers." : "Banners removed from customer Home.");
            });
          }}>
            <fieldset disabled={busy} className="advertisement-editor-fields">
              <p className="fine-print">{draft.length || !published ? "Preview your edits before saving them for customers." : "Saving without banners removes them from customer Home."}</p>
              {draft.map((banner, index) => (
                <fieldset key={banner.key} className="advertisement-slide-editor">
                  <legend>Banner {index + 1}{index === 0 && " · Opens first"}</legend>
                  {draft.length > 1 && <label className="advertisement-position">
                    Playback position
                    <select value={index} aria-label={`Playback position for ${banner.title.trim() || `banner ${index + 1}`}`}
                      onChange={event => moveBanner(banner.key, Number(event.target.value))}>
                      {draft.map((_, position) => (
                        <option key={position} value={position}>{position === 0 ? "1 · Opens first" : position + 1}</option>
                      ))}
                    </select>
                  </label>}
                  <label className="admin-banner-image-picker">
                    {banner.image && <img src={banner.image} alt="" />}
                    <strong>{banner.image ? "Change banner image" : "Upload banner image"}</strong>
                    <small>PNG, JPG or WebP · up to 5 MB</small>
                    <input type="file" aria-label="Upload banner image" accept="image/png,image/jpeg,image/webp" onChange={event => void upload(event, banner.key)} />
                  </label>
                  <label>Banner title<input required value={banner.title} maxLength={150}
                    onChange={event => update(banner.key, { title: event.target.value })} /></label>
                  <label>Redirect to<select value={banner.destination ?? ""}
                    aria-label={`Redirect for ${banner.title.trim() || `banner ${index + 1}`}`}
                    onChange={event => {
                      const value = event.currentTarget.value;
                      update(banner.key, { destination: isAdvertisementDestination(value) ? value : null });
                    }}>
                    <option value="">No redirect</option>
                    {launchAdvertisementDestinations.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                  </select></label>
                  <div className="admin-ad-actions">
                    <button type="button" className="secondary danger" onClick={() => setDraft(current => current.filter(slide => slide.key !== banner.key))}>Remove banner</button>
                  </div>
                </fieldset>
              ))}
              <div className="admin-ad-actions">
                <button type="button" className="secondary" onClick={() => setDraft(current => [...current, { ...emptyDraft, key: crypto.randomUUID() }])}>Add banner</button>
                <button type="button" className="secondary" disabled={!canReview} onClick={() => setPreview("draft")}>Preview banners</button>
                <button type="submit" className="primary" disabled={!canSave}>Save for customers</button>
                <button type="button" className="secondary" onClick={() => { setError(""); closeEditor(); }}>Cancel</button>
              </div>
            </fieldset>
          </form>}
        </>
      )}
      {preview && <AdvertisementDialog banners={previewBanners} onClose={closePreview}
        onShown={preview === "draft" ? () => setReviewedDraft(draft) : undefined}
        onAction={closePreview} onImageError={() => { closePreview(); setError("The banner images could not be opened."); }} />}
    </section>
  );
}
