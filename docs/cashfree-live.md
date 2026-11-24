# Cashfree checkout

The app uses Cashfree Hosted Web Checkout for café orders, one-time Coffee Pass purchases, and paid table bookings. The server creates the payment session and verifies the matching Cashfree order before it records a payment.

## Test setup

1. In Cashfree Merchant Dashboard, switch to **Test**, then open **Payment Gateway → Developers → API Keys**. Copy the test App ID and Secret Key directly into the server's ignored `.env.selfhost`.
2. Run a separate test server and database. Configure the following values in its server environment. Use the public HTTPS address of the test app for the return page and webhook.

```dotenv
PAYMENT_PROVIDER=cashfree
PAYMENT_MODE=test
PUBLIC_TEST_MODE=true
PAYMENT_LIVE_ENABLED=false
CASHFREE_CHECKOUT_API=orders
PAYMENT_APP_ORIGIN=https://your-staging-domain.example
CASHFREE_TEST_CLIENT_ID=
CASHFREE_TEST_CLIENT_SECRET=
```

3. Build with `npm run build:selfhost` and restart with `npm run start:selfhost`. Use the same HTTPS origin when building an Android APK for testing.
4. In the Cashfree test dashboard, open **Payment Gateway → Developers → Webhooks** and add `https://your-staging-domain.example/api/payments/cashfree/webhook`. Select payment success, payment failure, and user dropped. Check delivery in the webhook logs.
5. Test checkout using [Cashfree's sandbox test data](https://www.cashfree.com/docs/api-reference/payments/data-to-test-integration). Verify that success creates one paid receipt, failed and cancelled attempts stay unpaid, and the webhook records a successful payment even when the customer closes the app before returning. Also close the app before paying and confirm that reopening it shows no paid order. Repeat on the Android device and verify the café order, pass activation, and table booking flows.

## Production setup

In the Cashfree production dashboard, generate production credentials, whitelist the public app domain, and register the production webhook URL under **Payment Gateway → Developers → Webhooks**. Follow the [self-hosted server setup](self-hosted-backend.md) for public HTTPS. Keep production credentials in the server environment.

Set `PAYMENT_PROVIDER=cashfree`, `PAYMENT_MODE=live`, `PUBLIC_TEST_MODE=false`, and `CASHFREE_CHECKOUT_API=orders`. Set `PAYMENT_APP_ORIGIN` to the production origin. Put the production credentials in `CASHFREE_LIVE_CLIENT_ID` and `CASHFREE_LIVE_CLIENT_SECRET`. Keep `PAYMENT_LIVE_ENABLED=false` until sandbox checks pass and the production webhook and domain are ready. Set it to `true` and restart for a supervised first payment. Verify the receipt, return to the app, and webhook delivery before offering checkout to customers.

A paid booking whose hold expired appears in Admin booking payment review. Check pending payments before switching providers or disabling an active integration.

### Existing server handoff for the café administrator

Cashfree lists `espressoulstercoffeeindia.com` as an approved website. Its DNS is managed in Wix. The proposed app hostname is `pay.espressoulstercoffeeindia.com`. Confirm Cashfree accepts the exact checkout origin or Android app before switching on payments.

1. In Wix DNS, create an **A** record with host **pay** and value **37.27.51.7**. Preserve the existing root, www and mail records.
2. On the existing HTTPS listener on port **443**, add the exact new hostname and a publicly trusted certificate with renewal. Forward requests, including `POST /webhooks/cashfree`, to the existing app at `https://127.0.0.1:8443`. Validate the upstream certificate against the app's staging CA using TLS server name `espressoulster.37-27-51-7.nip.io`. Preserve the public Host header, the webhook signature headers and raw request body. Leave other sites on port 443 alone.
3. Coordinate the app origin cutover and Android release. The current app enforces one canonical Host. Until its origin is updated, a forwarded request with the new Host can return HTTP 400. APKs pinned to the previous origin also need the updated release. Keep the same app database, credentials for customer sign-in and image storage.
4. Check public DNS, TLS and `https://pay.espressoulstercoffeeindia.com/api/ready` from outside the server. Register `https://pay.espressoulstercoffeeindia.com/webhooks/cashfree` for the payment-success webhook, install the replacement Cashfree production credentials privately, and verify webhook delivery and the first payment receipt before general release.

### Android release

On the existing PostgreSQL host, `SELFHOST_DATABASE=postgres` uses the same database, Unix socket, users, orders and image storage. Keep the existing `PGDATABASE`, `PGHOST` and `SELFHOST_DATA_DIR`. Use this profile for cutover after establishing trusted public HTTPS and replacement production credentials. Disable `CASHFREE_STAGING_SANDBOX_ENABLED`. If TLS terminates at the server’s existing HTTPS listener, bind the app to loopback and set `SELFHOST_TRUST_PROXY=loopback`. The listener must preserve Host and overwrite X-Real-IP. The original `postgres-staging` profile still disallows live payments.

Build the Android app with `ESPC_ANDROID_BUILD_MODE=release`, the existing release signing configuration, and `ESPC_ANDROID_STORE_ORIGIN` set to the same HTTPS origin as `PAYMENT_APP_ORIGIN`. This build opens live sessions through the Cashfree Android SDK. Review and staging builds use the sandbox SDK. The SDK returns control to the app, which asks the backend to verify the result.

Keep the production App ID and secret in the backend's private environment. If a production secret was shared in a screenshot, replace it in the Cashfree dashboard before activation. Register the production HTTPS webhook and confirm a successful delivery from Cashfree. The PostgreSQL staging deployment uses a private certificate and separate payment settings.

[Cashfree Hosted Web Checkout](https://www.cashfree.com/docs/payments/online/web/redirect) · [Webhook setup](https://www.cashfree.com/docs/payments/webhooks)
