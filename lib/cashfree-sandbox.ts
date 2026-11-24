import { PaymentError } from "./payment-security.ts";
import { hostedCheckoutUrl, type CheckoutMode, type ExpectedPayment, type SandboxCheckout } from "./sandbox-checkout.ts";
import { phoneNumber } from "./phone-verification.ts";
import { createCashfreeOrderCheckout } from './cashfree-orders.ts';
import {parseCashfreeJson} from './cashfree-json.ts';

type CashfreeEnv = {
  CASHFREE_CHECKOUT_API?: string;
  CASHFREE_NOTIFY_URL?: string;
  CASHFREE_STAGING_SANDBOX_ENABLED?: string;
  PAYMENT_PROVIDER?: string;
  PAYMENT_LIVE_ENABLED?: string;
  PUBLIC_TEST_MODE?: string;
  PAYMENT_MODE?: string;
  PAYMENT_APP_ORIGIN?: string;
  CASHFREE_TEST_CLIENT_ID?: string;
  CASHFREE_TEST_CLIENT_SECRET?: string;
  CASHFREE_LIVE_CLIENT_ID?: string;
  CASHFREE_LIVE_CLIENT_SECRET?: string;
};
type CashfreeLink = {
  cf_link_id?: string | number;
  link_id?: string;
  link_status?: string;
  link_currency?: string;
  link_amount?: number;
  link_amount_paid?: number;
  link_expiry_time?: string;
  link_url?: string;
};

const authorizationError = "Cashfree sandbox is awaiting secure account setup.";

function directStagingSandbox(env: CashfreeEnv) {
  return env.CASHFREE_STAGING_SANDBOX_ENABLED === "true" && env.PAYMENT_PROVIDER === "cashfree" &&
    env.PAYMENT_LIVE_ENABLED === "false" && env.PUBLIC_TEST_MODE === "false";
}

export function cashfreeSandboxEnabled(env: CashfreeEnv) {
  return env.PAYMENT_MODE === "test" && (env.PUBLIC_TEST_MODE === "true" || directStagingSandbox(env));
}

export function cashfreeTestConfig(env: CashfreeEnv) {
  const clientId = env.CASHFREE_TEST_CLIENT_ID?.trim();
  const secret = env.CASHFREE_TEST_CLIENT_SECRET?.trim();
  if (!cashfreeSandboxEnabled(env) || !clientId || !secret || (directStagingSandbox(env) && !/^TEST/i.test(clientId))) {
    throw new PaymentError(authorizationError, 503);
  }
  const origin = cashfreeOrigin(env, true);
  const notifyUrl = cashfreeNotifyUrl(env) ?? (origin.loopback || directStagingSandbox(env) ? undefined : defaultCashfreeNotifyUrl(origin.origin));
  return { clientId, secret, ...origin, notifyUrl, minimumAmount: 100 };
}

const defaultCashfreeNotifyUrl = (origin: string) => origin + "/api/payments/cashfree/webhook";

function cashfreeNotifyUrl(env: CashfreeEnv) {
  if (!env.CASHFREE_NOTIFY_URL?.trim()) return undefined;
  try {
    const url = new URL(env.CASHFREE_NOTIFY_URL.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !['/webhooks/cashfree', '/api/payments/cashfree/webhook'].includes(url.pathname)) throw Error();
    return url.href;
  } catch { throw new PaymentError('Invalid Cashfree notification URL.', 503); }
}

function cashfreeOrigin(env: CashfreeEnv, test: boolean) {
  let url: URL;
  try { url = new URL(env.PAYMENT_APP_ORIGIN ?? ""); }
  catch { throw new PaymentError("Invalid payment return origin.", 503); }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((!test && (loopback || url.port || !url.hostname.includes("."))) ||
    (url.protocol !== "https:" && !(test && loopback && url.protocol === "http:")) ||
    url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new PaymentError("Invalid payment return origin.", 503);
  }
  return { origin: url.origin, loopback };
}

export function cashfreeLiveConfig(env: CashfreeEnv) {
  const clientId = env.CASHFREE_LIVE_CLIENT_ID?.trim();
  const secret = env.CASHFREE_LIVE_CLIENT_SECRET?.trim();
  if (env.PAYMENT_PROVIDER !== "cashfree" || env.PAYMENT_MODE !== "live" ||
    env.PAYMENT_LIVE_ENABLED !== "true" || env.PUBLIC_TEST_MODE !== "false" ||
    !clientId || !secret || clientId === env.CASHFREE_TEST_CLIENT_ID?.trim() ||
    secret === env.CASHFREE_TEST_CLIENT_SECRET?.trim() || /^TEST/i.test(clientId)) {
    throw new PaymentError("Cashfree online checkout is unavailable.", 503);
  }
  const origin = cashfreeOrigin(env, false);
  return { clientId, secret, ...origin, notifyUrl: cashfreeNotifyUrl(env) ?? defaultCashfreeNotifyUrl(origin.origin), minimumAmount: 100 };
}

export function cashfreeLinkId(checkoutId: string, requestId: string) {
  return checkoutId.startsWith("CH-") ? checkoutId + "-" + requestId.replaceAll("-", "") : checkoutId;
}

function idempotencyUuid(requestId: string) {
  const hex = requestId.replace(/^(?:PC|BK)-/, "").replaceAll("-", "").toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(hex)) throw new PaymentError("Invalid Cashfree checkout reference.", 409);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function rupeesMatch(value: unknown, paise: number) {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value * 100 - paise) < 0.000001;
}

function checkLink(link: CashfreeLink, input: ExpectedPayment, linkId: string, sessionId?: string) {
  const id = String(link?.cf_link_id ?? "");
  if (!/^\d+$/.test(id) || (sessionId && id !== sessionId) || link.link_id !== linkId ||
    link.link_currency !== input.currency || !rupeesMatch(link.link_amount, input.total)) {
    throw new PaymentError("Cashfree payment does not match this checkout. Do not pay again.", 409);
  }
  return id;
}

export function createCashfreeCheckout(env: CashfreeEnv, send: typeof fetch = fetch, mode: CheckoutMode = "test"): SandboxCheckout {
  const live = mode === "live";
  const config = () => live ? cashfreeLiveConfig(env) : cashfreeTestConfig(env);
  if(env.CASHFREE_CHECKOUT_API==='orders')return createCashfreeOrderCheckout(config,mode,send);
  const label = live ? "Cashfree" : "Cashfree sandbox";
  async function request(path: string, payload?: object, idempotency?: string) {
    const { clientId, secret } = config();
    const response = await send((live ? "https://api.cashfree.com/pg/" : "https://sandbox.cashfree.com/pg/") + path, {
      method: payload ? "POST" : "GET",
      // Workers supports manual/follow, while Node also supports error. Manual
      // keeps the request portable and never forwards credentials to a redirect.
      redirect: "manual",
      headers: {
        "x-api-version": "2026-01-01", "x-client-id": clientId, "x-client-secret": secret,
        ...(payload ? { "Content-Type": "application/json" } : {}),
        ...(idempotency ? { "x-idempotency-key": idempotency } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new PaymentError(live ? "Cashfree online checkout is unavailable." : authorizationError, 503);
      throw new PaymentError(label + " could not complete this request. Check payment status before retrying.", 502);
    }
    try { return parseCashfreeJson(await response.text()) as CashfreeLink; }
    catch { throw new PaymentError(label + " returned an unreadable response. Check payment status before retrying.", 502); }
  }

  const checkoutUrl = (value: unknown) => hostedCheckoutUrl("cashfree", mode, value);
  return {
    provider: "cashfree",
    config,
    checkoutUrl,
    async create(input) {
      const { origin, minimumAmount, notifyUrl } = config();
      if (input.currency !== "INR" || !Number.isSafeInteger(input.total) || input.total < minimumAmount) {
        throw new PaymentError(label + " requires an INR payment of at least ₹1.", 409);
      }
      const name = input.contact?.name?.trim();
      let phone: string;
      try { phone = live ? phoneNumber(input.contact?.phone).slice(3) : "9999999999"; }
      catch { throw new PaymentError("Enter a valid Indian mobile number for online payment.", 409); }
      if (live && (new URL(input.returnUrl).origin !== origin || !name)) {
        throw new PaymentError("Missing or invalid Cashfree checkout details.", 409);
      }
      const linkId = cashfreeLinkId(input.id, input.requestId);
      const expiry = input.expiresAt ?? Math.floor(Date.now() / 1000) + 1800;
      const link = await request("links", {
        link_id: linkId,
        link_amount: input.total / 100,
        link_currency: "INR",
        link_purpose: input.purpose,
        link_expiry_time: new Date(expiry * 1000).toISOString(),
        link_partial_payments: false,
        link_auto_reminders: false,
        link_notify: { send_sms: false, send_email: false, send_whatsapp: false },
        customer_details: { customer_name: live ? name : "Espressoulster Test Customer", customer_phone: phone },
        link_meta: {
          return_url: input.returnUrl,
          ...(notifyUrl ? { notify_url: notifyUrl } : {}),
        },
      }, idempotencyUuid(input.requestId));
      const id = checkLink(link, input, linkId);
      const expiresAt = Math.floor(Date.parse(link.link_expiry_time ?? "") / 1000);
      if (!Number.isSafeInteger(expiresAt) || (input.expiresAt && expiresAt > input.expiresAt)) {
        throw new PaymentError("Invalid Cashfree checkout expiry.", 502);
      }
      return { id, url: checkoutUrl(link.link_url), expiresAt };
    },
    async verify(input, sessionId, requestId, cancel) {
      const linkId = cashfreeLinkId(input.id, requestId);
      const path = "links/" + encodeURIComponent(linkId);
      let link = await request(path);
      checkLink(link, input, linkId, sessionId);
      if (cancel && link.link_status === "ACTIVE") {
        try { await request(path + "/cancel", {}); }
        catch { /* The payment and cancellation may have crossed. Fetch the current status. */ }
        link = await request(path);
        checkLink(link, input, linkId, sessionId);
      }
      if (link.link_status === "PAID" && rupeesMatch(link.link_amount_paid, input.total)) {
        return { state: "paid", reference: sessionId };
      }
      if ((link.link_status === "EXPIRED" || link.link_status === "CANCELLED") && link.link_amount_paid === 0) {
        return { state: "expired" };
      }
      if (link.link_status === "ACTIVE" && link.link_amount_paid === 0) return { state: "pending" };
      throw new PaymentError("Cashfree payment needs café review. Do not pay again.", 409);
    },
  };
}

export async function verifyCashfreeSignature(raw: string, headers: Headers, secret: string) {
  const timestamp = headers.get("x-webhook-timestamp") ?? "";
  const signature = headers.get("x-webhook-signature") ?? "";
  if (!/^\d{13}$/.test(timestamp) || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) {
    throw new PaymentError("Invalid Cashfree webhook signature.", 401);
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const digest = Uint8Array.from(atob(signature), (character) => character.charCodeAt(0));
  if (!await crypto.subtle.verify("HMAC", key, digest, encoder.encode(timestamp + raw))) {
    throw new PaymentError("Invalid Cashfree webhook signature.", 401);
  }
}
