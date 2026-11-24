import { PaymentError } from "./payment-security.ts";
import { orderPlacementStatements } from "./order-placement.ts";
import { isCafeTableConflict } from "./cafe-table-manager.ts";
import { hostedPaymentMethod, paymentVerificationSource, sandboxReturnOrigin, type CheckoutMode, type SandboxCheckout, type SandboxProvider } from "./sandbox-checkout.ts";

type Draft = {
  id: string;
  order_id: string;
  user_id: string;
  idempotency_key: string;
  fulfillment: string;
  total: number;
  currency: string;
  contact: string;
  quote: string;
  cart_snapshot: string;
  state: "creating" | "ready" | "paid" | "expired";
  provider_session_id: string | null;
  checkout_url: string | null;
  provider: SandboxProvider;
  mode: CheckoutMode;
};

export function createPrepaidCheckouts(
  db: D1Database,
  checkoutFor: (provider: SandboxProvider, mode: CheckoutMode) => SandboxCheckout,
) {
  const draftById = (id: string) => db.prepare("SELECT * FROM prepaid_checkouts WHERE id=?").bind(id).first<Draft>();
  const expired = { prepaidCheckout: true, paid: false as const, providerState: "EXPIRED" };

  async function paidResult(draft: Draft, reference?: string) {
    const receipt = await db.prepare(`SELECT o.id,o.order_number,p.reference FROM orders o JOIN payments p ON p.order_id=o.id
      WHERE o.id=? AND o.user_id=? AND o.payment_status='paid' AND p.method=? AND p.verified_by=? AND p.amount=?`)
      .bind(draft.order_id, draft.user_id, hostedPaymentMethod(draft.provider, draft.mode), paymentVerificationSource(draft.mode), draft.total)
      .first<{id:string;order_number:string;reference:string}>();
    if (!receipt || (reference && receipt.reference !== reference)) {
      throw new PaymentError("Payment verification needs café review. Do not pay again.", 409);
    }
    return {
      prepaidCheckout: true, paid: true as const, provider: draft.provider, mode: draft.mode,
      testOnly: draft.mode === "test", realMoneyCollected: draft.mode === "live", orderId: receipt.id, orderNumber: receipt.order_number,
    };
  }

  async function finalize(draft: Draft, reference: string) {
    const settings = await db.prepare("SELECT json_extract(data,'$.orderDayOpeningTime') AS openingTime FROM settings WHERE id='store'")
      .bind().first<{openingTime: string}>();
    const contact = JSON.parse(draft.contact);
    const placement = {
      id: draft.order_id, userId: draft.user_id, key: draft.idempotency_key, fulfillment: draft.fulfillment,
      paymentMethod: hostedPaymentMethod(draft.provider, draft.mode), contact, quote: JSON.parse(draft.quote),
      openingTime: settings?.openingTime,
      verifiedPayment: { reference, cartSnapshot: draft.cart_snapshot, mode: draft.mode },
    };
    const save = (assignedContact: typeof contact) => db.batch([
        ...orderPlacementStatements(db, { ...placement, contact: assignedContact }),
        db.prepare("UPDATE prepaid_checkouts SET state='paid' WHERE id=? AND state='ready' AND provider_session_id=?")
          .bind(draft.id, draft.provider_session_id),
      ]);
    try {
      try {
        await save(contact);
      } catch (error) {
        if (!isCafeTableConflict(error)) throw error;
        // A late payment still produces an order. Staff can assign a free table.
        await save({ ...contact, table: undefined });
      }
    } catch (error) {
      // The webhook and the return page may finalize the same checkout concurrently.
      if ((await draftById(draft.id))?.state !== "paid") {
        console.error("Verified checkout could not be finalized", draft.id, error);
        throw new PaymentError("Payment is verified. Your order is still being saved. Check again shortly.", 503);
      }
    }
    return paidResult(draft, reference);
  }

  async function verify(draft: Draft, cancel = false) {
    if (draft.state === "paid") return paidResult(draft);
    if (draft.state === "expired") return expired;
    const pending = { prepaidCheckout: true, paid: false as const, providerState: "PENDING" };
    if (!draft.provider_session_id) return pending;
    const status = await checkoutFor(draft.provider, draft.mode).verify(draft, draft.provider_session_id, draft.id, cancel);
    if (status.state === "paid") return finalize(draft, status.reference);
    if (status.state === "expired") {
      await db.prepare("UPDATE prepaid_checkouts SET state='expired' WHERE id=? AND state='ready' AND provider_session_id=?")
        .bind(draft.id, draft.provider_session_id).run();
      return (await draftById(draft.id))?.state === "paid" ? paidResult(draft) : expired;
    }
    return pending;
  }

  async function start(draft: Draft, req: Request) {
    const checkout = checkoutFor(draft.provider, draft.mode);
    let credentials: {orderId?: string; paymentSessionId?: string} | undefined;
    if (draft.state === "paid") return paidResult(draft);
    if (draft.state === "expired") return expired;
    if (draft.state === "ready") {
      const result = await verify(draft);
      if (result.paid || result.providerState === "EXPIRED") return result;
    } else {
      const origin = sandboxReturnOrigin(checkout.config().origin, req);
      const returnUrl = origin + "/payment-return?order=" + draft.id;
      const contact = JSON.parse(draft.contact);
      const table = draft.fulfillment === "dine_in" ? contact.table : undefined;
      const cancelUrl = returnUrl + "&cancelled=1" + (table ? "&table=" + encodeURIComponent(table) : "");
      const session = await checkout.create({
        ...draft, contact, requestId: draft.id, purpose: "Espressoulster Coffee order", returnUrl, cancelUrl,
      });
      await db.prepare(`UPDATE prepaid_checkouts SET provider_session_id=?,checkout_url=?,expires_at=?,cashfree_order_id=?,state='ready'
        WHERE id=? AND state='creating'`)
        .bind(session.id, session.url, session.expiresAt, session.orderId ?? null, draft.id).run();
      credentials = session;
      draft = (await draftById(draft.id))!;
      if (draft.state === "paid") return paidResult(draft);
      if (draft.state === "expired") return expired;
    }
    if (!credentials && checkout.session && draft.provider_session_id) {
      credentials = await checkout.session(draft, draft.provider_session_id, draft.id);
    }
    return {
      prepaidCheckout: true, provider: draft.provider, mode: draft.mode, redirectUrl: checkout.checkoutUrl(draft.checkout_url),
      ...(credentials?.orderId && credentials.paymentSessionId ? {
        order_id: credentials.orderId, payment_session_id: credentials.paymentSessionId,
      } : {}),
    };
  }

  async function route(id: string, action: string, req: Request, userId: string, mode: CheckoutMode) {
    const draft = await draftById(id);
    if (!draft || draft.user_id !== userId) throw new PaymentError("Checkout not found", 404);
    if (draft.mode !== mode) throw new PaymentError("This checkout belongs to a different payment environment.", 409);
    if (req.method !== "POST") throw new PaymentError("Method not allowed", 405);
    return action === "start" ? start(draft, req) : verify(draft, new URL(req.url).searchParams.get("cancelled") === "1");
  }

  async function webhook(id: string, sessionId: string, provider: SandboxProvider, mode: CheckoutMode = "test") {
    const draft = await draftById(id);
    if (!draft || draft.provider !== provider || draft.mode !== mode) return { received: true, ignored: true };
    if (draft.state === "creating") throw new PaymentError("Prepaid checkout is still being saved. Retry delivery.", 409);
    if (draft.provider_session_id !== sessionId) return { received: true, ignored: true };
    return verify(draft);
  }

  async function reconcileExpired(mode: CheckoutMode) {
    // No redirect can be shared until its session mapping has been saved.
    await db.prepare(`UPDATE prepaid_checkouts SET state='expired'
      WHERE state='creating' AND mode=? AND created_at<=datetime('now','-15 minutes')`).bind(mode).run();
    const due = await db.prepare(`SELECT * FROM prepaid_checkouts
      WHERE state='ready' AND mode=? AND expires_at<=unixepoch() ORDER BY expires_at LIMIT 4`).bind(mode).all<Draft>();
    await Promise.allSettled(due.results.map((draft) => verify(draft)));
  }

  return { route, webhook, reconcileExpired };
}
