# Espressoulster Coffee

One project for the Android customer app, mobile Admin, and the café backend.
The self-hosted Node.js backend uses PostgreSQL for local development and staging.
The Android build, server code, and deployed media assets
are maintained together on `main`. The [staging source snapshot](https://github.com/tharun0222/espressoulster-mobile/commit/90b4f1540fb45dcc4b8611d908cff221a996928a)
records the version running on 24 November 2026.

## Run on this computer

Requires Node.js 24+ and a running PostgreSQL 17+ server. Copy
`.env.selfhost.example` to the ignored `.env.selfhost` file for a new setup.
Set `PGHOST` to the absolute path of the PostgreSQL Unix socket directory,
`PGPORT` to its port, and `PGUSER` to your local role if it differs from your OS user.
The role must be able to create tables in `espressoulster_local`.

```sh
createdb -h /path/to/postgres/socket -p 5432 espressoulster_local
npm run install:ci
npm run db:selfhost
npm run build
npm start
```

Open `http://127.0.0.1:5173/#home`. For development, stop the existing server and
run `npm run dev`. Database setup initializes the schema and starter catalog,
and can be rerun against an initialized database. Keep existing PostgreSQL
settings and backups when upgrading a deployed instance. See the
[backend setup guide](docs/self-hosted-backend.md) for importing older data.

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

The backend integration check starts a separate Node server and creates a
temporary PostgreSQL database on the configured local server. The local test
role needs `CREATEDB` and access to the `postgres` maintenance database. Older
SQLite migrations and fixtures are retained for legacy imports and regression tests.

## Android and mobile Admin

Android source and existing signing configuration stay in `android/`. No APK
is generated until requested. When public HTTPS is ready, the next APK must
point to that backend address. A phone's own `127.0.0.1` does not point to this
computer. Admin access continues to use the existing approved-number policy.

## Code

- `app/`: customer and mobile Admin screens and API routes.
- `server/`: PostgreSQL, upload storage, environment binding and server settings.
- `scripts/selfhost-server.mjs`: HTTP loopback or built-in HTTPS server.
- `scripts/selfhost-db.mjs`: PostgreSQL schema and starter catalog initialization.
- `lib/`: pricing, payments, subscriptions, table scheduling and authentication.
- `server/postgres/`: PostgreSQL bootstrap, functions, triggers and views.
- `tests/`: payment, business logic and self-hosted backend checks.
