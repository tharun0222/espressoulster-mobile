"use client";

import { useEffect, useState } from "react";
import { ArrowRight, BellRing, Check, X } from "lucide-react";
import { enableOrderNotifications, orderNotificationsConnected } from "../lib/enable-order-notifications";
import { useDialogAccessibility } from "../lib/dialog";
import { openNativeOrderAlertSettings } from "../lib/native-order-alerts";
import "./notification-sheet.css";

type Permission = NotificationPermission | "unsupported";

function currentPermission(): Permission {
  return typeof Notification !== "undefined" && "serviceWorker" in navigator && "PushManager" in window
    ? Notification.permission
    : "unsupported";
}

export default function AppPermissionSetup() {
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<Permission>("default");
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function close() {
    navigator.serviceWorker?.getRegistration().then(registration => registration?.update()).catch(() => {});
    try { localStorage.setItem("espresso-permissions-reviewed-v1", "true"); } catch {}
    setOpen(false);
  }

  useDialogAccessibility(open, close);

  useEffect(() => {
    function show() {
      if (openNativeOrderAlertSettings()) return;
      setPermission(currentPermission());
      setConnected(false);
      setChecking(false);
      setError("");
      setOpen(true);
    }
    let reviewed = false;
    try { reviewed = localStorage.getItem("espresso-permissions-reviewed-v1") === "true"; } catch {}
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    if (standalone && !reviewed) show();
    const installed = () => { if (!reviewed) show(); };
    window.addEventListener("appinstalled", installed);
    window.addEventListener("espresso-open-permissions", show);
    return () => {
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("espresso-open-permissions", show);
    };
  }, []);

  useEffect(() => {
    if (!open || permission !== "granted") return;
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 5000);
    setChecking(true);
    orderNotificationsConnected(controller.signal).then(active => {
      if (!controller.signal.aborted) setConnected(active);
    }).catch(() => {}).finally(() => {
      clearTimeout(timeout);
      if (active) setChecking(false);
    });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [open, permission]);

  async function enable() {
    setBusy(true);
    setError("");
    try {
      const result = await enableOrderNotifications();
      setPermission(result);
      setConnected(result === "granted");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  const unavailable = permission === "denied" || permission === "unsupported";
  const status = checking ? "Checking" : unavailable ? (permission === "denied" ? "Blocked" : "Unavailable") : connected ? "On" : "Off";

  return (
    <div className="notification-sheet-backdrop" onClick={event => {
      if (event.target === event.currentTarget && !busy) close();
    }}>
      <section className="notification-sheet" role="dialog" aria-modal="true" aria-labelledby="notification-sheet-title">
        <button type="button" className="notification-sheet-close" aria-label="Close notification settings" disabled={busy} onClick={close}>
          <X size={20} aria-hidden="true" />
        </button>
        <div className="notification-sheet-icon" aria-hidden="true"><BellRing size={28} strokeWidth={1.7} /></div>
        <h2 id="notification-sheet-title">Order alerts</h2>
        <p className="notification-sheet-description">
          Get a heads-up when the café accepts your order, starts preparing it, has it ready or marks it complete.
        </p>
        <div className="notification-device" role="status">
          <span>This device</span>
          <span className="notification-device-status" data-enabled={connected}>
            {connected && <Check size={13} aria-hidden="true" />}{status}
          </span>
        </div>
        {permission === "denied" && <p className="notification-sheet-help">Allow notifications for this site in your browser settings.</p>}
        {permission === "unsupported" && <p className="notification-sheet-help">This browser doesn’t support order alerts. On iPhone, try opening the app from your Home Screen.</p>}
        {error && <p className="notification-sheet-error" role="alert">{error}</p>}
        <button type="button" className="notification-sheet-action" disabled={busy || checking}
          onClick={connected || unavailable ? close : enable}>
          {checking ? "Checking device…" : connected || unavailable ? "Done" : busy ? "Turning on alerts…" : "Turn on alerts"}
          {!connected && !unavailable && !busy && !checking && <ArrowRight size={18} aria-hidden="true" />}
        </button>
      </section>
    </div>
  );
}
