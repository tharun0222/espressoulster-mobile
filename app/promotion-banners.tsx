"use client";

import { useRef, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";

type PromotionBanner = {
  id: string;
  enabled: boolean;
  image: string;
  title?: string;
  copy?: string;
  tag?: string;
  action?: string;
  destination?: string;
  search?: string;
  planId?: string;
};

export default function PromotionBanners({ banners, onAction, label = "Featured promotions" }: {
  banners: PromotionBanner[];
  onAction?: (banner: PromotionBanner) => void;
  label?: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const campaigns = banners.filter(banner => banner.enabled && banner.image);
  if (!campaigns.length) return null;
  const current = Math.min(active, campaigns.length - 1);

  function choose(index: number) {
    const node = rail.current?.children[index] as HTMLElement | undefined;
    if (!node) return;
    rail.current?.scrollTo({ left: node.offsetLeft, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  return (
    <section className="promotions" aria-label={label}>
      <div className="promotion-rail" ref={rail} onScroll={event => {
        const node = event.currentTarget;
        const first = node.children[0] as HTMLElement | undefined;
        const next = node.children[1] as HTMLElement | undefined;
        const step = first && next ? next.offsetLeft - first.offsetLeft : 0;
        setActive(step ? Math.min(campaigns.length - 1, Math.max(0, Math.round(node.scrollLeft / step))) : 0);
      }}>
        {campaigns.map((banner, index) => (
          <article className="promotion-banner" key={banner.id} aria-label={banner.title || "Café promotion"}>
            <img src={banner.image} alt={banner.title || "Café promotion"} loading={index === 0 ? "eager" : "lazy"} />
            {(banner.title || banner.copy || banner.action) && <>
              <div className="promotion-shade" />
              <div className="promotion-copy">
                {banner.tag && <span className="promotion-tag">{banner.tag}</span>}
                {banner.title && <h3>{banner.title}</h3>}
                {banner.copy && <p>{banner.copy}</p>}
                {banner.action && <button type="button" aria-disabled={!onAction} tabIndex={onAction ? undefined : -1} onClick={onAction ? () => onAction(banner) : undefined}>{banner.action}<ArrowUpRight size={17} aria-hidden="true" /></button>}
              </div>
            </>}
          </article>
        ))}
      </div>
      {campaigns.length > 1 && (
        <div className="promotion-controls">
          <span>Swipe to explore</span>
          <div className="promotion-arrows">
            <button type="button" aria-label="Previous promotion" disabled={current === 0} onClick={() => choose(current - 1)}><ChevronLeft size={16} /></button>
            <button type="button" aria-label="Next promotion" disabled={current === campaigns.length - 1} onClick={() => choose(current + 1)}><ChevronRight size={16} /></button>
          </div>
        </div>
      )}
    </section>
  );
}
