# Cashfree sandbox: app checkout and backend verification

The customer UI is React/Next.js. The Android app embeds that UI in a native Android shell; it is not Flutter or React Native. Android checkout uses Cashfree's Android SDK **2.6.1** in `SANDBOX`. Mobile browser previews use Cashfree's hosted JavaScript SDK in `sandbox` mode. Neither callback can mark an order paid.

## Backend configuration

Keep these values in the ignored, permission-600 `.env.selfhost`. Never put either credential in an APK, a `NEXT_PUBLIC_*` variable, a URL, source control, screenshots, or logs.

```dotenv
SELFHOST_HOST=127.0.0.1
SELFHOST_PORT=5173
PAYMENT_APP_ORIGIN=http://127.0.0.1:5173
PAYMENT_PROVIDER=cashfree
PAYMENT_MODE=test
PUBLIC_TEST_MODE=true
PAYMENT_LIVE_ENABLED=false
CASHFREE_CHECKOUT_API=orders
CASHFREE_TEST_CLIENT_ID=<sandbox App ID>
CASHFREE_TEST_CLIENT_SECRET=<sandbox Secret Key>
# Set before creating a NEW checkout when testing server-to-server delivery:
CASHFREE_NOTIFY_URL=https://<ngrok-host>/webhooks/cashfree
```

Retain the existing identity, OTP, role and database settings. No new authentication bypass is required. Existing café prices are unchanged; a ₹10 test cart can contain ten ₹1 items. The backend calculates its own quote and verifies it against the stored checkout. Client-supplied totals never set the gateway amount.

```sh
npm run db:selfhost
npm run dev:selfhost
```

Local app: `http://127.0.0.1:5173/#home`. API base: `http://127.0.0.1:5173/api`; the React app uses relative API requests so its authenticated HttpOnly cookies remain attached.

## Request flow

1. Signed-in customer selects **Pay now** in Checkout. The backend remains explicitly configured for Cashfree sandbox. The existing `POST /api/orders` flow prices the cart, validates availability, reserves stock and saves a `prepaid_checkouts` draft. Café fulfillment is created only after payment.
2. `POST /api/payments/<PC-checkout-id>/start` loads that customer's draft and calls `POST https://sandbox.cashfree.com/pg/orders`, API version `2026-01-01`, using a stable merchant order reference and UUID idempotency header. It saves `cashfree_order_id` and the provider's numeric order reference against the draft and returns `order_id`, `payment_session_id` and the app checkout URL.
3. `/cashfree-checkout?order=<checkout-id>` fetches `GET /api/payments/<checkout-id>/session`. This owner-only route returns the IDs and environment for the SDK. Other users receive 404. Payment session values are not logged or stored in browser storage.
4. Android opens its native SDK via an origin-checked, request-ID-bound bridge. The SDK uses `CFSession.Environment.SANDBOX`, the backend's order ID and payment session. Browser previews use Cashfree JS checkout.
5. Every SDK return, including close/failure, asks `POST /api/payments/<checkout-id>/verify`. The backend calls Get Order, validates `order_id`, provider reference, total and currency, and requires `order_status=PAID`. Only then does the existing atomic fulfillment transaction create one café order/payment receipt. Pending/closed checkout remains unpaid. A cancellation return may terminate an unpaid gateway order but still verifies in case payment won the race.
6. Coffee Passes reuse the existing order/payment intent and verified credit activation. Table bookings use their saved fee, temporary table schedule hold and `POST /api/table-bookings/payment` verification. The SDK route supports PC, CH and BK references.

For ordinary CH orders already marked Pay at café, changing the gateway is deliberately rejected: start an online checkout from the cart rather than paying an unrelated or completed order.

## Webhook endpoint and idempotency

`POST /webhooks/cashfree` is public and does not require a customer cookie or CSRF header. The older `/api/payments/cashfree/webhook` remains supported.

- Read the raw request stream, with the existing 128 KB limit. Verify `Base64(HMAC-SHA256(secret, timestamp + exactRawBody))` using `x-webhook-signature` and `x-webhook-timestamp` **before** parsing JSON. Invalid signatures receive 401.
- For Orders API events, handle only `PAYMENT_SUCCESS_WEBHOOK` with `payment_status=SUCCESS`. Failed/pending/user-dropped/other events return 200 without fulfilling an order.
- Match the saved merchant order reference, both event amounts and both currencies against the local checkout. Independently call Get Order to verify PAID and matching money before fulfillment. A mismatch receives 409 with no fulfillment.
- Reuse the transactional finalizer used by app status checks. Database order/payment uniqueness and conditional checkout updates prevent duplicate fulfillment even when app verification and webhooks race.
- Record successful payment-event IDs in `cashfree_webhook_receipts`. A matching duplicate returns HTTP 200 without fulfilling again. Record the receipt after fulfillment, so a transient failure can safely retry. A reused payment reference mapped to a different order is rejected.

Do not manually update `payment_status` to demonstrate success. Read the saved payment receipt and Cashfree Get Order.

## Local HTTPS webhook testing with ngrok

Install ngrok from its official distribution and authenticate once using your own account token. The local installation used here is `.tools/ngrok/ngrok`; configuration is outside the repository. Disable request inspection so checkout cookies, session IDs and webhook bodies are not retained by ngrok's inspector.

For the existing local browser app, the backend expects the loopback Host header:

```sh
.tools/ngrok/ngrok http 5173 --host-header=127.0.0.1:5173 --inspect=false
```

`--host-header` remains supported by this installed agent but is deprecated; ngrok recommends its Host-header traffic policy for future deployments. Set `CASHFREE_NOTIFY_URL=https://<ngrok-host>/webhooks/cashfree`, restart the backend, and **create a fresh sandbox order**. Its `order_meta.notify_url` is then set to that URL. An already-created order keeps its old metadata.

For a shareable phone preview, use a separate production-mode process from the same project and database, keeping the existing local app running:

```sh
NEXT_DIST_DIR=.next-phone npm run build:selfhost
# Stop the old tunnel, then point ngrok at this process instead:
.tools/ngrok/ngrok http 5175 --inspect=false
# Set the actual ngrok origin; these explicit variables override env-file values.
NEXT_DIST_DIR=.next-phone NODE_ENV=production SELFHOST_PORT=5175 \
PAYMENT_APP_ORIGIN=https://<ngrok-host> ADMIN_ANDROID_ONLY=true STAFF_LOCAL_PREVIEW=false \
node --env-file-if-exists=.env --env-file-if-exists=.env.selfhost scripts/selfhost-server.mjs
```

The public process must receive its original public Host header, so do **not** use `--host-header` in this second mode. The mobile app/API base is `https://<ngrok-host>` / `https://<ngrok-host>/api`. Build the Android review APK with that same HTTPS origin when a device build is requested. `127.0.0.1` in an installed phone APK refers to the phone, not this Mac. The computer, backend and tunnel must stay running; this is a sandbox preview, not permanent production hosting.

## Published sandbox card

Use Cashfree's [current sandbox test data](https://www.cashfree.com/docs/api-reference/payments/data-to-test-integration): Visa debit `4706131211212123`, expiry `03/2028`, CVV `123`, name `Test`, simulator OTP `111000`. Choose **Pay without saving the card**. These are public test fixtures, not real card details. The simulator supports SUCCESS, PENDING, USER_DROPPED and FAILED.

## Checks

```sh
npm run typecheck
npm run test:payments
node --experimental-transform-types --test tests/native-cashfree-checkout.test.mjs
```

The payment suite includes owner isolation, ₹10 saved-total checkout, server verification, cancelled/failed unpaid checkout, webhook-only fulfillment, concurrent duplicate delivery and app verification, wrong keys, modified raw bytes and mismatched event/provider currency/amount. Existing Stripe, Coffee Pass and table-booking flows remain covered.

Android SDK build check (requires Gradle 8.11.1, JDK 21, Android SDK 35/build-tools 35.0.1 and the existing signing files):

```sh
JAVA_HOME=<jdk-home> ANDROID_SDK_ROOT=<android-sdk> \
ESPC_GRADLE_BIN=<gradle-8.11.1>/bin/gradle \
ESPC_ANDROID_BUILD_MODE=review ESPC_ANDROID_STORE_ORIGIN=https://<ngrok-host> \
android/build-apk.sh .selfhost/cashfree-test/review.apk
```

`android/build-apk.sh` now uses Gradle to include the published Cashfree SDK and its dependencies, then signs with the existing configured key. No gateway secret enters that build.

## Implementation files

- `lib/cashfree-orders.ts`, `lib/cashfree-sandbox.ts`, `lib/cashfree-json.ts`: Orders API, API version, sandbox config, idempotency, SDK session, amount/currency checks and notification URL.
- `lib/sandbox-checkout.ts`, `lib/prepaid-checkout.ts`, `lib/stripe-payment-core.ts`, `lib/stripe-table-bookings.ts`: shared checkout contract, persisted gateway mapping, verification, signed event validation and existing single fulfillment path.
- `drizzle/0052_cashfree_order_mapping.sql`: order-reference columns/indexes and processed webhook payment IDs.
- `app/webhooks/cashfree/route.ts`: raw-body public webhook endpoint.
- `app/cashfree-checkout/checkout.tsx`, `lib/native-cashfree-checkout.ts`: SDK handoff and backend verification after checkout returns.
- `app/store-app.tsx`: simplified **Pay now** option and checkout button.
- `android/src/com/espressoulster/coffee/NativeCashfreeCheckout.java`, `MainActivity.java`: native Android SDK and origin-checked bridge.
- `android/build.gradle`, `settings.gradle`, `gradle.properties`, `build-apk.sh`: dependency-aware Android build, preserving signing.
- `tests/cashfree-orders.test.mjs`, `tests/cashfree-json.test.mjs`, `tests/native-cashfree-checkout.test.mjs`, `tests/stripe-checkout.test.mjs`: payment/bridge contracts and updated schema fixture.
- `cloudflare-env.d.ts`, `.env.selfhost.example`, `.gitignore`, `scripts/selfhost-server.mjs`: private config typing/examples, ignored generated state and accurate startup logging. The self-hosted backend is used; Cloudflare is not deployed or needed.

Sources: [Create Order](https://www.cashfree.com/docs/api-reference/payments/latest/orders/create-order), [Get Order](https://www.cashfree.com/docs/api-reference/payments/latest/orders/get-order), [Android SDK](https://www.cashfree.com/docs/payments/online/mobile/android), [web SDK](https://www.cashfree.com/docs/payments/online/web/redirect), [webhook verification](https://www.cashfree.com/docs/payments/online/webhooks/signature-verification), [webhook idempotency](https://www.cashfree.com/docs/payments/online/webhooks/webhook-indempotency).

For the webhook-only local QA check, open `/cashfree-checkout?order=<PC-id>&webhookOnly=1` on the **development** server. Complete checkout normally. This development-only branch deliberately skips the app verification request and return navigation, so the database can change only through the signed webhook. This branch is eliminated from the public production build. Do not confuse a locally generated signed replay with a provider-delivered webhook.
