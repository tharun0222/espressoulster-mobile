import { PaymentError } from "./payment-security.ts";
import { stripeCheckoutUrl, stripeTestConfig, validateStripePayment } from "./stripe-security.ts";

export type SandboxProvider = "stripe" | "cashfree";
export type CheckoutMode = "test" | "live";
export type ExpectedPayment = { id: string; total: number; currency: string };
export type CheckoutRequest = ExpectedPayment & {
  requestId: string;
  purpose: string;
  returnUrl: string;
  cancelUrl: string;
  expiresAt?: number;
  contact?: { name?: string; phone?: string };
};
export type CheckoutStatus =
  | { state: "paid"; reference: string }
  | { state: "pending" | "expired" };
export type SandboxCheckout = {
  provider: SandboxProvider;
  config: () => { origin: string; minimumAmount: number };
  create: (input: CheckoutRequest) => Promise<{ id: string; url: string; expiresAt: number; orderId?: string; paymentSessionId?: string }>;
  verify: (input: ExpectedPayment, sessionId: string, requestId: string, cancel?: boolean) => Promise<CheckoutStatus>;
  checkoutUrl: (value: unknown) => string;
  session?: (input: ExpectedPayment, sessionId: string, requestId: string) => Promise<{
    state: 'ready'|'paid'|'expired'; mode: CheckoutMode; orderId?: string; paymentSessionId?: string;
  }>;
};

export const isSandboxProvider = (value: unknown): value is SandboxProvider => value === "cashfree" || value === "stripe";
export const isSandboxPayment = (value: unknown) => value === "cashfree_test" || value === "stripe_test";
export const sandboxMethod = (provider: SandboxProvider) => `${provider}_test` as const;
export const hostedPaymentMethod = (provider: SandboxProvider, mode: CheckoutMode) =>
  mode === "live" ? "cashfree" : sandboxMethod(provider);
export const paymentVerificationSource = (mode: CheckoutMode) =>
  mode === "live" ? "provider_verified" : "provider_verified_test";
export const sandboxLabel = (provider: unknown) => provider === "cashfree" ? "Cashfree sandbox" : "Stripe sandbox";

export function sandboxReturnOrigin(origin: string, req: Request) {
  const configured = new URL(origin);
  const source = new URL(req.url);
  const loopback = ["localhost", "127.0.0.1", "[::1]"];
  return loopback.includes(configured.hostname) && loopback.includes(source.hostname) &&
    source.protocol === "http:" && source.port === configured.port ? source.origin : origin;
}

export function sandboxCheckoutUrl(provider: unknown, value: unknown) {
  return hostedCheckoutUrl(provider, "test", value);
}

export function hostedCheckoutUrl(provider: unknown, mode: unknown, value: unknown) {
  if (provider === "stripe" && mode === "test") return stripeCheckoutUrl(value);
  if (provider === "cashfree" && typeof value === "string") {
    if ((mode === 'live' || mode === 'test') && /^\/cashfree-checkout\?order=(?:(?:PC|BK)-[A-F0-9]{32}|CH-[A-F0-9]{8})$/.test(value)) return value;
    const host = mode === "live" ? "payments.cashfree.com" : mode === "test" ? "payments-test.cashfree.com" : null;
    let url: URL;
    try { url = new URL(value); } catch { throw new PaymentError("Invalid checkout address.", 502); }
    if (host && url.origin === "https://" + host && !url.username && !url.password &&
      /^\/links\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname) && !url.search && !url.hash) return url.href;
  }
  throw new PaymentError("Untrusted checkout address.", 502);
}

export function createStripeCheckout(
  env: unknown,
  request: (path: string, data?: URLSearchParams, idempotencyKey?: string) => Promise<any>,
): SandboxCheckout {
  const validId = (id: unknown): id is string => typeof id === "string" && /^cs_test_[A-Za-z0-9]+$/.test(id);
  return {
    provider: "stripe",
    config: () => stripeTestConfig(env),
    checkoutUrl: stripeCheckoutUrl,
    async create(input) {
      const data = new URLSearchParams({
        mode: "payment", client_reference_id: input.id, "metadata[order_id]": input.id,
        "line_items[0][price_data][currency]": "inr",
        "line_items[0][price_data][unit_amount]": String(input.total),
        "line_items[0][price_data][product_data][name]": input.purpose,
        "line_items[0][quantity]": "1", success_url: input.returnUrl, cancel_url: input.cancelUrl,
      });
      const prefix = input.id.startsWith("PC-") ? "espresso-prepaid-" :
        input.id.startsWith("BK-") ? "espresso-booking-" : "espresso-stripe-test-";
      const session = await request("checkout/sessions", data, prefix + input.requestId);
      if (session.livemode !== false || !validId(session.id) ||
        (!input.id.startsWith("BK-") && !Number.isSafeInteger(session.expires_at))) {
        throw new PaymentError("Invalid Stripe test response.", 502);
      }
      return { id: session.id, url: stripeCheckoutUrl(session.url), expiresAt: session.expires_at ?? input.expiresAt };
    },
    async verify(input, sessionId, _requestId, cancel) {
      if (!validId(sessionId)) throw new PaymentError("Stripe test checkout is not ready. Try again.", 409);
      const path = "checkout/sessions/" + encodeURIComponent(sessionId);
      let session = await request(path);
      if (cancel && session.status === "open") {
        try { session = await request(path + "/expire", new URLSearchParams()); }
        catch { session = await request(path); }
      }
      if (session.id !== sessionId || session.livemode !== false ||
        session.client_reference_id !== input.id || session.metadata?.order_id !== input.id) {
        throw new PaymentError("Payment mapping mismatch.", 409);
      }
      if (session.payment_status === "paid") {
        try { return { state: "paid", reference: validateStripePayment(session, input) }; }
        catch (error) { throw new PaymentError((error as Error).message, 409); }
      }
      return { state: session.status === "expired" ? "expired" : "pending" };
    },
  };
}
