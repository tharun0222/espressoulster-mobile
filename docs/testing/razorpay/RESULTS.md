# Razorpay sandbox verification

- TypeScript check and production app build: passed.
- Five security test cases in tests/razorpay-test.test.mjs: passed (run with Node experimental transform types).
- All 59 backend integration tests: passed. Test 59 covers anonymous access denial, missing-credential configuration, disabled start/verify and unchanged actual unpaid bill status.
- Mobile test order: created locally; My orders shows Razorpay test mode, a disabled checkout button and an awaiting-account-setup explanation. Actual order remains unpaid. See mobile-setup.png.

Security cases verify a valid HMAC signature and reject changed order/payment IDs, invalid signatures, wrong secrets, live keys, disabled public test mode, missing keys, uncaptured/refunded payments, and provider amount/currency/order/receipt mismatches.

Not yet verified against a Razorpay account: opening hosted checkout, provider sandbox success/failure/cancellation, actual capture settings and provider API connectivity. These require the user's Razorpay Test Key ID and Test Key Secret. No real credentials, real payments or production orders were used during these checks.
