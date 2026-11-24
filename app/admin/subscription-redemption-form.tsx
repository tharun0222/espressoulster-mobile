"use client";

import { useState, type FormEvent } from "react";
import { api } from "../store-app";

type SubscriptionMatch = {
  subscriptionId: string;
  planName: string;
};

export default function SubscriptionRedemptionForm() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [match, setMatch] = useState<SubscriptionMatch | null>(null);
  const [redeemed, setRedeemed] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function clearMatch() {
    setMatch(null);
    setRedeemed("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setRedeemed("");
    try {
      if (match) {
        const result = await api("admin/subscriptions/redeem", "POST", {
          phone, code, subscriptionId: match.subscriptionId,
        });
        setRedeemed(result.planName);
        setMatch(null);
        setCode("");
      } else {
        setMatch(await api("admin/subscriptions/redeem-preview", "POST", { phone, code }));
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel">
      <h2>Redeem a subscription credit</h2>
      <form onSubmit={submit}>
        <label>Customer mobile number
          <input type="tel" required inputMode="numeric" maxLength={10} pattern="[6-9][0-9]{9}"
            placeholder="10-digit mobile number" value={phone} disabled={busy}
            onChange={(event) => { setPhone(event.target.value.replace(/\D/g, "")); clearMatch(); }} />
        </label>
        <label>Customer’s redemption code
          <input required inputMode="numeric" maxLength={6} minLength={6} pattern="[0-9]{6}"
            placeholder="Six-digit code" value={code} disabled={busy}
            onChange={(event) => { setCode(event.target.value.replace(/\D/g, "")); clearMatch(); }} />
        </label>
        {match && <p role="status"><strong>{match.planName}</strong></p>}
        {error && <p className="phone-error" role="alert">{error}</p>}
        {redeemed && <p role="status"><strong>{redeemed}</strong><br />1 test credit redeemed.</p>}
        <button type="submit" className="primary" disabled={busy}>
          {match ? (busy ? "Redeeming…" : "Redeem 1 test credit") : (busy ? "Checking…" : "Check code")}
        </button>
      </form>
    </section>
  );
}
