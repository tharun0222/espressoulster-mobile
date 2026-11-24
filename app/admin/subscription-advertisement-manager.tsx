"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../store-app";
import PromotionBanners from "../promotion-banners";
import type { SubscriptionAdvertisement } from "../../lib/subscription-advertisements";
import "../subscription-advertisements.css";

type Plan = { id: string; name: string; available: boolean };

export default function SubscriptionAdvertisementManager({ refreshVersion }: { refreshVersion: number }) {
  const [banners, setBanners] = useState<SubscriptionAdvertisement[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [draft, setDraft] = useState<SubscriptionAdvertisement | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const loadVersion = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const version = ++loadVersion.current;
    setError("");
    try {
      const result = await api("admin/subscription-advertisements", "GET", undefined, signal);
      if (signal?.aborted || version !== loadVersion.current) return false;
      setBanners(result.advertisements);
      setPlans(result.plans);
      return true;
    } catch (failure) {
      if (!signal?.aborted && version === loadVersion.current) setError((failure as Error).message);
      return false;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshVersion]);

  useEffect(() => {
    if (!pendingImage) { setPreviewImage(""); return; }
    const url = URL.createObjectURL(pendingImage);
    setPreviewImage(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingImage]);

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setError("");
    setStatus("");
    try { await operation(); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  function change(patch: Partial<SubscriptionAdvertisement>) {
    setDraft(current => current && { ...current, ...patch });
    setReviewing(false);
  }

  async function save(banner: SubscriptionAdvertisement, enabled: boolean) {
    const response = await api("admin/subscription-advertisements", banner.id ? "PUT" : "POST", { ...banner, enabled });
    const saved = response.advertisement as SubscriptionAdvertisement;
    loadVersion.current++;
    setBanners(current => banner.id ? current.map(item => item.id === saved.id ? saved : item) : [saved, ...current]);
    setStatus(enabled ? "Banner published to customer Subscriptions." : "Banner hidden from customers.");
  }

  const selectedPlan = plans.find(plan => plan.id === draft?.planId);
  const displayedImage = pendingImage ? previewImage : draft?.image || "";
  const canReview = Boolean(draft?.title.trim() && displayedImage && selectedPlan);
  const planById = new Map(plans.map(plan => [plan.id, plan]));

  return (
    <section className="admin-panel subscription-advertisement-manager" aria-labelledby="subscription-advertisements-heading">
      <h2 id="subscription-advertisements-heading">Promotion banners</h2>
      <p className="fine-print">Publish an offer at the top of the customer Subscriptions page.</p>
      {error && <p role="alert" className="error">{error}</p>}
      {status && <p role="status">{status}</p>}
      <button type="button" className="secondary" disabled={busy || Boolean(draft)} onClick={() => void run(async () => {
        if (await load()) setDraft({ id: "", revision: 0, planId: "", image: "", title: "", copy: "", enabled: false });
      })}>Add banner</button>
      {draft && (
        <form onSubmit={event => {
          event.preventDefault();
          if (!canReview || !reviewing || !selectedPlan?.available || busy) return;
          void run(async () => {
            let banner = draft;
            if (pendingImage) {
              const result = await api("admin/upload", "POST", pendingImage);
              banner = { ...draft, image: result.url };
              setDraft(banner);
              setPendingImage(null);
            }
            await save(banner, true);
            setDraft(null);
            setReviewing(false);
          });
        }}>
          <fieldset disabled={busy} className="subscription-advertisement-fields">
            <label>Subscription plan<select aria-label="Subscription plan" required value={draft.planId} onChange={event => change({ planId: event.target.value })}>
              <option value="" disabled>Choose a plan</option>
              {draft.planId && !planById.has(draft.planId) && <option value={draft.planId} disabled>Plan unavailable</option>}
              {plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}{!plan.available ? " (off sale)" : ""}</option>)}
            </select></label>
            <label>Banner headline<input required value={draft.title} maxLength={90} onChange={event => change({ title: event.target.value })} /></label>
            <label>Description (optional)<textarea value={draft.copy} maxLength={160} onChange={event => change({ copy: event.target.value })} /></label>
            <label className="admin-banner-image-picker">
              {displayedImage && <img src={displayedImage} alt="" />}
              <strong>{displayedImage ? "Change banner image" : "Choose banner image"}</strong>
              <small>PNG, JPG or WebP · up to 5 MB</small>
              <input type="file" aria-label="Upload subscription banner image" accept="image/png,image/jpeg,image/webp" onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                if (file.size > 5_000_000) { setError("Choose an image under 5 MB."); return; }
                if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Choose a PNG, JPG or WebP image."); return; }
                setError("");
                setReviewing(false);
                setPendingImage(file);
              }} />
            </label>
            {!plans.length && <p className="fine-print">Create a subscription plan to preview a banner for it.</p>}
            {selectedPlan && !selectedPlan.available && <p className="fine-print">You can preview this banner now. Put the plan back on sale to publish it.</p>}
            {reviewing && <div className="subscription-advertisements">
              <PromotionBanners label="Mobile banner preview" banners={[{ ...draft, image: displayedImage, enabled: true, action: "View plan" }]} />
            </div>}
            <div className="admin-ad-actions">
              <button type="button" className="secondary" disabled={!canReview} onClick={() => setReviewing(true)}>Preview banner</button>
              <button type="submit" className="primary" disabled={!canReview || !reviewing || !selectedPlan?.available}>Publish banner</button>
              <button type="button" className="secondary" onClick={() => { setDraft(null); setReviewing(false); setPendingImage(null); }}>Cancel</button>
            </div>
          </fieldset>
        </form>
      )}
      {banners.map(banner => (
        <div key={banner.id} className="subscription-advertisement-entry">
          <img src={banner.image} alt="" loading="lazy" />
          <div><strong>{banner.title}</strong><small>{banner.enabled && planById.get(banner.planId)?.available ? "Live" : "Hidden"} · {planById.get(banner.planId)?.name || "Plan unavailable"}</small></div>
          <div className="admin-ad-actions">
            <button type="button" className="secondary" disabled={busy || Boolean(draft)} onClick={() => void run(async () => {
              if (await load()) { setDraft(banner); setReviewing(false); }
            })}>Edit banner</button>
            {banner.enabled && <button type="button" className="secondary" disabled={busy || Boolean(draft)} onClick={() => void run(() => save(banner, false))}>Hide banner</button>}
            {!banner.enabled && <button type="button" className="secondary danger" disabled={busy || Boolean(draft)} onClick={() => void run(async () => {
              await api("admin/subscription-advertisements", "DELETE", { id: banner.id, revision: banner.revision });
              loadVersion.current++;
              setBanners(current => current.filter(item => item.id !== banner.id));
              setStatus("Banner removed.");
            })}>Remove banner</button>}
          </div>
        </div>
      ))}
    </section>
  );
}
