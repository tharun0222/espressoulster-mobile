"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { AdvertisementDestination, AdvertisementDraft, LaunchAdvertisement } from "../lib/launch-advertisement";
import "./launch-advertisement.css";

export function AdvertisementDialog({ banners, onClose, onAction, onShown, onImageError }: {
  banners: AdvertisementDraft[];
  onClose: () => void;
  onAction: (destination: AdvertisementDestination) => void;
  onShown?: () => void;
  onImageError: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const advancing = useRef(false);
  const [opened, setOpened] = useState(false);
  const [active, setActive] = useState(0);
  const [readyImage, setReadyImage] = useState("");
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const available = banners.map((banner, index) => ({ banner, index }))
    .filter(({ banner, index }) => index >= active && !failedImages.includes(banner.image));
  const [current, next] = available;
  const currentIndex = current?.index;
  const nextIndex = next?.index;
  const hasBanner = Boolean(current);
  const imageReady = Boolean(current && readyImage === current.banner.image);

  useEffect(() => {
    if (!hasBanner) onImageError();
  }, [hasBanner, onImageError]);

  useEffect(() => {
    if (!imageReady || opened) return;
    function show() {
      const element = dialog.current;
      if (!element || element.open || document.hidden) return;
      if (document.querySelector('dialog[open], [aria-modal="true"]')) return;
      element.showModal();
      setOpened(true);
      onShown?.();
      observer.disconnect();
    }
    const observer = new MutationObserver(show);
    observer.observe(document.body, { attributes: true, attributeFilter: ["open", "aria-modal"], childList: true, subtree: true });
    document.addEventListener("visibilitychange", show);
    show();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", show);
    };
  }, [imageReady, onShown, opened]);

  useEffect(() => {
    if (!opened || !imageReady) return;
    advancing.current = false;
    closeButton.current?.focus({ preventScroll: true });
  }, [opened, imageReady, currentIndex]);

  function dismissCurrent() {
    const element = dialog.current;
    if (!element?.open || advancing.current) return;
    if (nextIndex === undefined) {
      element.close();
      return;
    }

    advancing.current = true;
    const advance = () => {
      if (element.isConnected && element.open) setActive(nextIndex);
    };
    const content = card.current;
    if (!content?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      advance();
      return;
    }
    const exit = content.animate([{}, { opacity: 0 }], { duration: 160, easing: "ease-in", fill: "forwards" });
    void exit.finished.then(advance, advance);
  }

  if (!current) return null;
  const { banner } = current;
  const image = <img src={banner.image} alt={banner.title}
    onLoad={() => setReadyImage(banner.image)}
    onError={() => setFailedImages(images => [...images, banner.image])} />;
  const destination = banner.destination;
  return (
    <dialog ref={dialog} className="launch-ad-dialog" aria-label="Café offers" onClose={onClose}
      onCancel={event => {
        if (!imageReady) return;
        event.preventDefault();
        dismissCurrent();
      }}
      onClick={event => { if (event.target === event.currentTarget) dismissCurrent(); }}>
      <div key={current.index} ref={card} className="launch-ad-content" data-ready={imageReady}>
        {next && <link rel="preload" as="image" href={next.banner.image} />}
        <div className="launch-ad-slide">
          {destination ? <button type="button" className="launch-ad-artwork" aria-label={`Open ${banner.title}`}
            onClick={() => { if (imageReady && !advancing.current) onAction(destination); }}>{image}</button> : image}
        </div>
        <button ref={closeButton} type="button" className="launch-ad-close" aria-label="Close advertisement"
          autoFocus onClick={dismissCurrent}><X size={21} aria-hidden="true" /></button>
      </div>
    </dialog>
  );
}

export default function HomeAdvertisement({ advertisement, seen, onShown, onAction }: {
  advertisement: LaunchAdvertisement;
  seen: boolean;
  onShown: () => void;
  onAction: (destination: AdvertisementDestination) => void;
}) {
  const [eligible, setEligible] = useState(!seen);
  if (!eligible) return null;
  const dismiss = () => setEligible(false);
  return <AdvertisementDialog banners={advertisement.banners} onClose={dismiss} onImageError={dismiss}
    onShown={onShown} onAction={destination => { dismiss(); onAction(destination); }} />;
}
