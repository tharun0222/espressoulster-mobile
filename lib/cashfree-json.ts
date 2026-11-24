import {PaymentError} from './payment-security.ts';

/** Cashfree may send 64-bit IDs as JSON numbers or strings. Preserve their exact digits. */
export function parseCashfreeJson(raw: string): unknown {
  return JSON.parse(raw, (key: string, value: unknown, context?: {source?: string}) => {
    if (['cf_payment_id', 'cf_order_id', 'cf_link_id'].includes(key) && typeof value === 'number') {
      if (Number.isSafeInteger(value) && value >= 0) return String(value);
      if (context?.source && /^[0-9]{1,64}$/.test(context.source)) return context.source;
      throw new PaymentError('Cashfree returned an invalid payment reference.', 502);
    }
    return value;
  });
}
