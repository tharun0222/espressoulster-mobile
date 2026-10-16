declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
declare namespace Cloudflare { interface Env { ADMIN_EMAILS?: string; } }

declare namespace Cloudflare { interface Env {
 PAYMENT_PROVIDER?: string; PAYMENT_MODE?: string; PAYMENT_LIVE_ENABLED?: string;
 PAYMENT_APP_ORIGIN?: string; PHONEPE_CLIENT_ID?: string; PHONEPE_CLIENT_VERSION?: string;
 PHONEPE_CLIENT_SECRET?: string; PHONEPE_WEBHOOK_USERNAME?: string; PHONEPE_WEBHOOK_PASSWORD?: string;
} }
