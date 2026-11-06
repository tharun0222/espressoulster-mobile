# Application review — 27 October 2026

Three agents reviewed customer flows, admin recovery, and backend/concurrent load. Fixes preserve the current light/dark themes, commercial settings, authentication boundaries, and sandbox payment behavior. No live test orders, users, subscriptions or charges were created.

## Fixed

- Cart retry now flushes pending changes before refresh and preserves the current user's hydrated cart. A failed favourites read cannot block cart initialization. Account changes clear stale cart/route state and ignore previous-account responses.
- Concurrent bootstrap/focus refreshes share one request. Quotes debounce and cancel obsolete requests; favourites requests are deduplicated.
- Subscription HTTP errors are explicit and retryable. Valid plans remain visible during transient refresh failures.
- Booking/notification reads have timeouts, cancellation and visible-tab polling. Table-booking refreshes do not overlap; successful mutations force a fresh read.
- Admin redemption item-loading errors are visible with Retry; submissions wait for item loading. Plan/overview refreshes ignore stale responses, and order search is debounced.
- Backend initialization is single-flight per D1 binding and retries failures. Each catalog JSON row is parsed once. Existing per-request joined profiles are reused without cross-request identity caching. Independent overview reads run concurrently, and duplicate recipe suggestions are omitted for unedited products.

## Verification

- All 36 Node test files pass, including async admin/customer recovery and simultaneous code-generation/redemption regressions.
- Full TypeScript check and production Worker build pass.
- 66/66 built-Worker HTTP integration checks pass (auth, orders, stock, idempotency, collection, customer isolation, admin edits and other existing cases).
- 12/12 ingredient/nutrition save-to-customer-data integration checks pass.
- Real SQLite migration/trigger races pass: overlapping customer requests and same-table assignments each have one winner; adjacent reservations are allowed. Five concurrent redemptions produce exactly one credit deduction, receipt and event.
- Browser local workflow: menu search, rapid quantity changes, checkout confirmation, one order creation, admin order visibility/status changes and customer status display checked. A deliberate local server disconnect/reconnect showed redemption-item errors with Retry and successful item reload; plan and balance refresh also recovered. No external payment provider or device permission was exercised.

The integration harness now accepts a validated loopback port because the default port was occupied. Two outdated assertions were corrected to enforce the existing policy: unauthorised admin access returns 403, and an admin cookie is never a customer identity. Production authentication was not weakened.

## Bounded load results

Both runs used isolated local Worker/SQLite fixtures, never the deployed café. Baseline: 223 requests; post-fix: 173; combined: 396 requests; maximum concurrency: 20; all measured responses HTTP 200, zero errors. Different small sample counts and local machine scheduling limit timing comparisons.

| Workload | Baseline p95 | Post-fix p95 |
| --- | ---: | ---: |
| Anonymous bootstrap | 240.0 ms | 258.8 ms |
| Authenticated bootstrap burst | 524.9 ms | 539.6 ms |
| Admin overview | 417.9 ms | 350.4 ms |
| Customer order history | 85.5 ms | 67.8 ms |
| App shell | 89.0 ms | 94.4 ms |

Admin response size decreased from 677,774 to 389,192 uncompressed bytes (42.6%). Bootstrap timing did not universally improve; client request coalescing reduces duplicate work separately. Stock, prices, settings and customer data remain fresh per request.

These checks validate bounded local request handling and database invariants. Production load-balancer routing, multi-region latency and maximum hosting capacity are not exposed by the available hosting tools and were not measured. Camera/UPI app launching, push delivery on a physical device and actual provider checkout require their separate device/provider environment.
