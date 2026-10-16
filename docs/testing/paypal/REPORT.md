# PayPal Sandbox test report

Scope: Espressoulster public testing app. Sandbox only; fixed fictional USD 1.00, separate from the INR order total. Real orders remain unpaid and no subscription credits are issued.

## Automated checks
- TypeScript: passed.
- Production build: passed.
- Sandbox security tests: 3 passed. Reject disabled/missing configuration; reject live/off-domain approval URLs; reject wrong order, currency, amount, pending capture, partial capture and multiple purchase units/captures.
- Backend integration: 59 cases, including anonymous denial, missing credential fail-closed, no secret in config, disabled Razorpay routes and unchanged unpaid order.

## Implementation boundaries
- Existing PayPal Sandbox credentials stored as runtime secrets, absent from source/client responses.
- All provider requests use api-m.sandbox.paypal.com, HTTPS, no redirects, and bounded timeouts.
- Server session ownership and existing same-origin mutation guard apply to checkout routes.
- Stable provider request IDs make create/capture retries idempotent.
- Provider completion is read server-side and validated before storing a sandbox receipt.
- Return URL query parameters alone never verify a payment.
- Failed/cancelled checkout does not settle a bill.

## Browser test
Published and tested in the browser on 2026-10-09. Server successfully creates PayPal sandbox order and redirects to the sandbox checkout. Existing dummy buyer login succeeds. PayPal rejects approval with UNSUPPORTED_PAYEE_CURRENCY for the default India test-account pairing. No completed capture exists; full success is not yet verified. A US sandbox buyer account is the next test.

The first hosted request exposed a Worker redirect-mode incompatibility; manual redirects with non-2xx rejection fixed it. Direct OAuth credential validation returned HTTP 200. PayPal appends token parameters on return, so app routing now explicitly recognizes valid paypalOrder query parameters.

References: https://developer.paypal.com/api/orders/v2 ; https://developer.paypal.com/api/codes/currency

Browser dummy simulator: synthetic order CH-F3361DF0, Mocha INR 100. Success returned “Simulation: paid” and explicitly kept the actual order unpaid. No real money or card data used. Evidence: dummy-success.png. PayPal rejection evidence: currency-error.png.

Next: approval required to generate a US Sandbox buyer account. The existing real PayPal account country will not be changed.

Additional browser checks: simulator failure and cancellation each returned the expected result with actual café bill unchanged. Disposable order CH-F3361DF0 was cancelled after testing; final UI showed Cancelled and Unpaid.

## Dine-in browser retest
Order CH-C8C78A41: one Classic Cold Brew, INR 265, Dine In. Checkout correctly created an unpaid dine-in order and opened PayPal Sandbox with fictional USD 1.00. Newly created India personal sandbox buyer was used. Initial stale copied password failed; directly verified password succeeded. PayPal then returned UNSUPPORTED_PAYEE_CURRENCY with “This seller doesn’t accept payments in your currency.” No capture or verified sandbox receipt occurred, and no real money was collected. Evidence: dine-in-currency-error.png. A compatible sandbox account setup is still needed before successful PayPal end-to-end approval can be claimed.


## Removed at user request
PayPal UI and provider request code removed. All authenticated paypal-test endpoints now return HTTP 410. Runtime Sandbox credentials removed. Historical test receipts/schema preserved. The existing dummy payment simulator remains available.
