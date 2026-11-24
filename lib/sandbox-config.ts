import { cashfreeLiveConfig, cashfreeTestConfig } from "./cashfree-sandbox.ts";
import { hostedPaymentMethod, isSandboxProvider } from "./sandbox-checkout.ts";
import { stripeSandboxAvailable, stripeTestConfig } from "./stripe-security.ts";

export function sandboxAvailable(env: Parameters<typeof cashfreeTestConfig>[0] & { PAYMENT_PROVIDER?: string }) {
  if (env.PAYMENT_PROVIDER !== "cashfree") return stripeSandboxAvailable(env);
  try { cashfreeTestConfig(env); return true; }
  catch { return false; }
}

export function sandboxMinimum(env: Parameters<typeof sandboxAvailable>[0]) {
  return env.PAYMENT_PROVIDER === "cashfree" ? cashfreeTestConfig(env).minimumAmount : stripeTestConfig(env).minimumAmount;
}

export function hostedPaymentConfig(env: Parameters<typeof cashfreeLiveConfig>[0]) {
  if (env.PAYMENT_PROVIDER === "cashfree" && env.PAYMENT_MODE === "live") {
    try {
      return { provider: "cashfree" as const, mode: "live" as const, method: "cashfree" as const, minimumAmount: cashfreeLiveConfig(env).minimumAmount };
    } catch { return null; }
  }
  const provider = env.PAYMENT_PROVIDER;
  return isSandboxProvider(provider) && sandboxAvailable(env)
    ? { provider, mode: "test" as const, method: hostedPaymentMethod(provider, "test"), minimumAmount: sandboxMinimum(env) }
    : null;
}
