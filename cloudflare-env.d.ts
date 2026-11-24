declare namespace Cloudflare {
  interface Env {
    CATALOG_PRICE_RELEASE?: string;
  CASHFREE_CHECKOUT_API?: string;
  CASHFREE_NOTIFY_URL?: string;
  CASHFREE_STAGING_SANDBOX_ENABLED?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OPENROUTESERVICE_API_KEY?: string;
    PUBLIC_TEST_MODE?: string;
    STAFF_PANEL_PHONES?: string;
    STAFF_ONLY_PHONES?: string;
    STAFF_ORDER_OPERATOR_PHONE?: string;
    STAFF_ORDER_OPERATOR_PHONES?: string;
    STAFF_DUTY_PHONES?: string;
    STAFF_LOCAL_PREVIEW?: string;
    STAFF_LOCAL_PREVIEW_PIN?: string;
    STAFF_OTP_ONLY?: string;
    STAFF_DEVICE_POLICY?: 'otp' | 'attestation';
    PIN_AUTH_OTP_ENABLED?: string;
    MSG91_AUTH_KEY?: string;
    MSG91_OTP_TEMPLATE_ID?: string;
    OTP_DELIVERY_CHANNEL?: string;
    MSG91_IPV4_ONLY?: string;
    MSG91_RELAY_SOCKET?: string;
    MSG91_WHATSAPP_NUMBER?: string;
    MSG91_WHATSAPP_TEMPLATE?: string;
    MSG91_WHATSAPP_NAMESPACE?: string;
    MSG91_WHATSAPP_LANGUAGE?: string;
    MSG91_WHATSAPP_TEMPLATE_APPROVED?: string;
    ADMIN_ANDROID_ENROLLMENT?: string;
    ADMIN_ANDROID_ONLY?: string;
  }
}
declare namespace Cloudflare { interface Env { ADMIN_EMAILS?: string; } }

declare namespace Cloudflare { interface Env {
 PAYMENT_PROVIDER?: string; PAYMENT_MODE?: string; PAYMENT_LIVE_ENABLED?: string;
 PAYMENT_APP_ORIGIN?: string; PHONEPE_CLIENT_ID?: string; PHONEPE_CLIENT_VERSION?: string;
 PHONEPE_CLIENT_SECRET?: string; PHONEPE_WEBHOOK_USERNAME?: string; PHONEPE_WEBHOOK_PASSWORD?: string;
 CASHFREE_TEST_CLIENT_ID?: string; CASHFREE_TEST_CLIENT_SECRET?: string;
 CASHFREE_LIVE_CLIENT_ID?: string; CASHFREE_LIVE_CLIENT_SECRET?: string;
} }
