# Razorpay test checkout

The app uses Razorpay Standard Checkout in test mode only. Existing PhonePe live payment paths remain disabled during public testing. No real payment or subscription credit can be created by the Razorpay test endpoints.

## Required configuration

In Razorpay Dashboard, select Test Mode and generate API keys. Configure these server runtime settings:

- PUBLIC_TEST_MODE=true
- RAZORPAY_TEST_KEY_ID=rzp_test_…
- RAZORPAY_TEST_KEY_SECRET=(secret setting, never exposed to customers)

Use the test keys from your own account. Live keys are rejected. Do not put the key secret in source, browser storage, public environment variables or chat. Enable automatic capture for the sandbox account; an authorized payment is not accepted as captured.

Customer flow: place a test order → My orders → Pay online · Razorpay test → use Razorpay-provided sandbox payment details. A verified result is stored separately in razorpay_test_checkouts. The actual café bill remains unpaid.

If account setup is incomplete, the button is disabled and displays an awaiting-setup message. The existing generic dummy simulator remains available.

## Security and verification

The server creates the Razorpay order using the stored local order total; it ignores browser amounts. Checkout belongs to the signed-in customer. The handler sends the provider response to the server. The server verifies HMAC-SHA256 using the stored provider order ID, fetches payment status from Razorpay, and checks captured status, payment ID, order ID, exact amount, INR currency and no refund before recording a test result. Same-order checkout creation is locked and reused. A failed/ambiguous creation requires a new test order rather than an unsafe duplicate creation.

No webhook is configured for this sandbox-only implementation. The checkout handler and explicit retry verification cover the browser session. A closed/lost browser callback is not reconciled automatically. End-to-end Razorpay account validation requires actual test keys and has not been performed.

Official references:
- https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
- https://razorpay.com/docs/api/orders/create/
- https://razorpay.com/docs/api/payments/fetch-with-id/
