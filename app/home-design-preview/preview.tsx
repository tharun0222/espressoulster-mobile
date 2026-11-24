"use client";

import { useEffect, useState } from "react";
import StoreApp from "../store-app";
import { parseHomeDesign, type HomeDesign } from "../../lib/home-design";

export default function HomePreview() {
  const [design, setDesign] = useState<HomeDesign | null>(null);

  useEffect(() => {
    if (window.parent === window) return;
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== window.parent ||
        event.data?.type !== "espresso-home-preview") return;
      setDesign(parseHomeDesign(event.data.design));
    }
    window.addEventListener("message", receive);
    window.parent.postMessage({ type: "espresso-home-preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, []);

  if (!design) return <p role="status">Opening Home preview…</p>;
  return <div className="frosted-preview profile-glass-preview" inert><StoreApp previewDesign={design} /></div>;
}
