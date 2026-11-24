"use client";

import { useEffect } from "react";
import { refreshNativeOrderAlerts } from "../lib/native-order-alerts";

const updateEvent = "espresso-live-update";
type Topic = "orders" | "chat" | "bookings" | "intake";
const topics = new Set<string>(["orders", "chat", "bookings", "intake"]);

export function useLiveUpdates(scope: "customer" | "admin", enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    let source: EventSource | undefined;
    function publish(topic: string) {
      if (topic === "orders" || topic === "sync") refreshNativeOrderAlerts();
      window.dispatchEvent(new CustomEvent(updateEvent, {detail: topic}));
    }
    function synchronize() {
      if (document.hidden) {
        source?.close();
        source = undefined;
      } else if (!source) {
        source = new EventSource(scope === "admin" ? "/api/admin/live-updates" : "/api/live-updates");
        source.onopen = () => publish("sync");
        source.onmessage = event => { if (topics.has(event.data)) publish(event.data); };
      }
    }
    synchronize();
    document.addEventListener("visibilitychange", synchronize);
    return () => {
      document.removeEventListener("visibilitychange", synchronize);
      source?.close();
    };
  }, [enabled, scope]);
}

export function onLiveUpdate(accepted: Topic[], refresh: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listener = (event: Event) => {
    const topic = (event as CustomEvent<Topic | "sync">).detail;
    if (topic !== "sync" && !accepted.includes(topic)) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, 65);
  };
  window.addEventListener(updateEvent, listener);
  return () => {
    window.removeEventListener(updateEvent, listener);
    clearTimeout(timer);
  };
}
