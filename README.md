# Espressoulster Coffee

One project for the Android customer app, mobile Admin, and the café backend.
The self-hosted Node.js backend uses PostgreSQL on staging and defaults to SQLite
for local development. The Android build, server code, and deployed media assets
are maintained together on `main`. The [staging source snapshot](https://github.com/tharun0222/espressoulster-mobile/commit/90b4f1540fb45dcc4b8611d908cff221a996928a)
records the version running on 24 November 2026.

## Run on this computer

Requires Node.js 24+ and the existing npm lockfile. Keep your current ignored
`.env` and `.env.selfhost` files; they contain server settings and credentials.

```sh
npm run db:selfhost
npm run build
npm start
```

Open `http://127.0.0.1:5173/#home`. For development, stop the existing server and
run `npm run dev`. All default commands now use the self-hosted runtime.

The current local database and four uploads have been copied to `.selfhost/data`.
Accounts, sessions, order history, and table schedule records were preserved.
The current 110 menu items, four pass catalog prices, and booking fee are ₹1.
Existing order totals were preserved. Do not publish these prices accidentally.

## Cashfree

Orders, table bookings, and Coffee Pass purchases have server-side Cashfree
checkout and verification. Paid orders are placed only after matching provider
confirmation. Table booking requests and pass credits are also created only
once after verified payment. Callback signatures, ownership, amounts, and
currencies are checked. Gateway responses are mocked in automated tests.

Real Cashfree checkout remains disabled until this computer has a reachable
public HTTPS domain and valid TLS certificate. Running localhost does not
provide either. Store production credentials only in the server environment;
never in an APK, public asset, or `NEXT_PUBLIC_*` variable.

See [self-hosted backend setup](docs/self-hosted-backend.md) for the HTTPS
configuration, data files, backups, activation, and remaining phone checks.
Online payments are currently disabled. Orders use Pay at café; online booking and Coffee Pass purchases remain unavailable until a gateway is connected again. Existing records and the updated pull-to-refresh animation are retained.

## Checks

```sh
npm run test:selfhost
npm run test:payments
npm run typecheck
npm run build
npm run test:backend
```

The backend integration check starts a separate local Node server with an
isolated temporary database. It does not change customer data or charge money.
The prior Worker-specific scripts are retained as historical tooling and are
not part of the default runtime or backend integration check.

## Android and mobile Admin

Android source and existing signing configuration stay in `android/`. No APK
is generated until requested. When public HTTPS is ready, the next APK must
point to that backend address. A phone's own `127.0.0.1` does not point to this
computer. Admin access continues to use the existing approved-number policy.

## Code

- `app/`: customer and mobile Admin screens and API routes.
- `server/`: local SQLite, upload storage, environment binding and server settings.
- `scripts/selfhost-server.mjs`: HTTP loopback or built-in HTTPS server.
- `scripts/selfhost-db.mjs`: checked migrations and optional database import.
- `lib/`: pricing, payments, subscriptions, table scheduling and authentication.
- `drizzle/`: versioned SQL migrations.
- `tests/`: payment, business logic and self-hosted backend checks.

SQLite here is intended for one app instance on one computer. Large concurrent
traffic requires separate capacity planning and load testing.
