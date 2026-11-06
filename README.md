# Espressoulster Coffee

A mobile-first, installable coffee ordering PWA built with TypeScript, React/Vinext, Cloudflare Workers, D1, and R2. The uploaded video determines the interface; the Espressoulster website determines the catalog.

**Launch status:** the application is implemented and locally tested, but the source menu supplies no prices or availability. All 30 imported items intentionally start unavailable with a null price. An administrator must verify prices and store operations before customers can order. No production orders or synthetic test prices are seeded.

## Run locally

Requires Node.js 22.13+ and npm. Keep the bundled lockfile.

```sh
npm run install:ci
cp .env.example .env
# For local dev only, set ADMIN_EMAILS=seedy@sites.test in .env.
npm run db:generate  # only after changing db/schema.ts
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_orange_unicorn.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_mixed_silk_fever.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_careful_scorpion.sql
npm run dev
```

Apply each local migration once, in order, to a fresh database. Never replay migrations against an existing database. The local preview URL is printed by the dev script. Sign in through the app; local dev uses the starter's loopback-only Seedy account. This mock is excluded from production. `/admin` is the administrator dashboard.

## Production configuration and deployment

`.openai/hosting.json` identifies the Site and declares logical `DB` (D1) and `BUCKET` (R2) bindings. Sites creates and wires production resources, applies generated migrations, and supplies trusted identity headers. Secrets belong in Sites environment settings, never source or browser bundles.

Runtime variable:

- `ADMIN_EMAILS`: comma-separated, verified email addresses allowed to administer the café. Empty means no administrator access. The verified Site owner's account has been configured for this deployment. The local test address is not a production administrator.

Use the Sites publishing workflow to build, commit and push the exact source, package the Worker, and save/deploy a private version. The site remains owner-private until the owner deliberately changes sharing. Do not expose the raw Worker outside the Sites dispatcher: it relies on the dispatcher's authenticated identity headers and stripping of caller-supplied identity headers.

There are no Supabase/Firebase credentials: Sites-managed D1 and R2 supply equivalent durable database and image storage. There are no configured payment-provider keys. Adding online payments requires a provider-specific server integration and verified webhook processing; entering an API key alone will not enable payments.

## Open the café for ordering

1. Sign in with the configured owner administrator account and open `/admin`.
2. In Store settings, set the brand, logo, contact details, pickup address, opening hours, currency, tax rate, and appropriate fulfilment methods.
3. Review each product's price, availability, inventory, category, and verified details. Configure options only when confirmed by the business.
4. Upload owned product images in the editor. The source's illustrative atlas image URLs are retained as references; if access is restricted, the interface shows a consistent coffee icon fallback.
5. Create any verified offers in Store settings. No third-party discount or rewards claim from the video is activated.
6. Test a real staff-controlled pickup flow before expanding sharing. Place and collect actual orders only after operational setup is complete.

## Import and export

Admin → Import catalog accepts a JSON object with a `products` array. Export the catalog for a complete template. `docs/catalog-import.json` contains the original 30-item source import. Categories must exist before an import. Every row is validated before one atomic batch updates the catalog.

Money uses integer minor units: `10000` means ₹100.00. `price: null` means unknown; unknown prices require `available: false`. A null inventory is unlimited. Variant and add-on `price` fields are additional minor units. Verified dietary labels use `Veg`, `Non-veg`, `Vegan`, `Egg`, or `Gluten-free`; none are inferred from product names.

Categories can be disabled, reordered, and renamed. Products are archived rather than physically deleted, preserving order references. Suggestions can only be approved into an unavailable draft; publication requires a separate product edit.

## Authentication and payments

Sign in/out and session restoration use platform-managed Sign in with ChatGPT. Profiles, phone numbers, addresses, carts, favourites, suggestions, and orders are scoped to the trusted user ID. Independent email/password registration and app-owned password reset are not implemented; credential management belongs to the identity provider.

Checkout supports pay at pickup, or cash on delivery when delivery is enabled. Every order starts unpaid. Only an authorised administrator can record actual cash collection with a receipt reference. Provider payment verification, digital wallets, scanning payments, refunds, and courier tracking are not configured. Paid orders cannot be cancelled without a refund integration.

## Tests

Pricing and validation (21 tests):

```sh
node --experimental-transform-types tests/pricing.test.mjs
```

For backend integration tests, build and run the Worker on loopback with a test administrator. Do not run the synthetic fixture suite against production. Stop the dev preview while using the built Worker.

```sh
npm run build
npm start -- --port 8787 --var ADMIN_EMAILS:seedy@sites.test
# In a second terminal in this project:
python3 tests/integration.py
```

The 36 integration tests use synthetic identity headers only against the raw loopback Worker to model the production dispatcher's trusted identity. They test isolation, forbidden administrator actions, persistent carts, pricing, concurrent checkout, inventory, order snapshots, cancellation, statuses, payment collection, imports, uploads, suggestions, and input limits. Local test state remains in ignored `.wrangler/` and is never included in the deployment.

```sh
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

See `docs/FINAL_REVIEW.md`, `docs/integration-results.json`, and `docs/pricing-results.txt` for actual results and limitations.

## Android

On Android Chrome, open the HTTPS Site, sign in, and choose Install app / Add to Home screen. The manifest contains 192px and 512px icons, a standalone display, and a safe offline screen. Personal pages and orders are not cached by the service worker.

No APK is generated. This environment has no Java, Android SDK, Gradle, or signing configuration. A native or Trusted Web Activity package, public manifest access, domain association, and release signing would be a separate delivery step. Installation and offline behaviour have not been tested on physical Android hardware.

## Code layout

- `app/store-app.tsx`: customer views and interaction state.
- `app/admin/`: protected server entry and administrator interface.
- `app/api/[...path]/route.ts`: authenticated API, validation, uploads, and administration.
- `lib/server.ts`: D1 operations, identity, transactions, and immutable order snapshots.
- `lib/pricing.ts`: authoritative integer pricing and order transition rules.
- `lib/catalog.ts`: traceable source import and configurable defaults.
- `db/schema.ts`, `drizzle/`: database schema and versioned migrations.
- `public/`: reference-video banner, PWA assets, and offline shell.
- `tests/`, `docs/`: verification and delivery report.

## Opening sequence

Every fresh app launch shows the Espressoulster wordmark on warm cream, followed by the Espressoulster Coffee scene with a slow camera move, brand reveal, and progress line. It fades into the customer screen after 5.2 seconds. The animation does not replay during navigation, and reduced-motion preferences disable its motion.

## Administrator password sign-in

Production `/admin` uses server-verified username/password login. Runtime secrets `ADMIN_LOGIN_USERNAME`, `ADMIN_PASSWORD_SALT`, and `ADMIN_PASSWORD_HASH` configure PBKDF2-SHA256 verification (100,000 iterations). `ADMIN_PASSWORD_LOGIN_ONLY=true` disables hosted-identity admin fallback. Never store the plaintext password in source. Sessions use hashed random tokens in D1, Secure/HttpOnly/SameSite=Strict cookies on HTTPS, eight-hour expiry, and explicit revocation on logout. Changing the configured password hash invalidates existing sessions. Login is limited to ten attempts per IP in fifteen minutes, with a global hourly ceiling. Migration `0018_admin_password.sql` creates session/rate-limit tables.

Local regression tests retain synthetic hosted administrator identities while separately testing password login, bad-password rejection, forged tokens, revocation, origin checks and rate limiting. Production password-only access must be verified after publication.
