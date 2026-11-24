# Espressoulster PostgreSQL migration rehearsal

On 21 November 2026, a consistent SQLite backup was imported into a private PostgreSQL database on staging. A separate copy ran the app tests. The production and regular staging services continued to use SQLite.

| Check | Result |
| --- | --- |
| SQLite health | Integrity check passed and no broken foreign keys were found |
| Records | 890 rows in 56 tables matched field for field during import and again after commit |
| Key records | 21 customer profiles, 35 orders, 24 payment rows, 8 payment intents, 3 bookings, 3 subscriptions, 95 session rows |
| Schema | Ported 19 triggers and 2 views. Verified 44 explicit indexes, 2 identity counters and 7 row-order counters |
| Files | The separately transferred archive of 4 uploaded images matched the source checksum |
| Customer and Admin | Verified order placement, Pay at café, staff status updates, dine-in assignment, and chat on both databases. Four simultaneous order retries produced one order. Four distinct orders received distinct order numbers. |
| Table booking | Verified payment, confirmation, one notification, and rejection of competing claims on the same table. The next time slot could still be booked. |
| Cashfree | Simulated responses and signed callbacks on staging. Verified ₹10 checkout, cancellation, invalid signatures, wrong amounts, simultaneous payment checks, and Coffee Pass credit issuance. |
| App read load | 16,933 requests across the ramp with zero errors. At 128 concurrent clients for 30 seconds, the app processed 14,783 requests at 489 per second. The 95th-percentile response time was 32 ms in this stage. |
| Capacity target | 110,000 simultaneously active users remains unverified. |

## Repeating the copy check

Take the source copy with SQLite's backup API so it includes committed changes from the WAL. Keep the database and upload snapshots private. Create an empty rehearsal database on the private socket.

```sh
npm ci
export PGHOST=/private/socket PGPORT=55432 PGDATABASE=espressoulster_runtime_staging
createdb "$PGDATABASE"
node scripts/rehearse-postgres-migration.mjs snapshot.sqlite import-report.json --with-runtime
node scripts/rehearse-postgres-migration.mjs snapshot.sqlite reread-report.json --with-runtime --verify-only
```

The script rejects an existing populated target. It compares every row by value and accounts for duplicate rows. The report contains counts, schema object names and verification results. It preserves timestamp strings and large integers. A failed import check rolls back the imported schema and rows. Staging evidence is stored under `/home/interns/apps/espressoulster-staging/pg-rehearsal`.

## Repeating app tests

Run on a fresh clone. These tests write synthetic orders, bookings and payments. They use local sign-in and simulated Cashfree responses.

```sh
createdb -T espressoulster_runtime_staging espressoulster_pg_fixture
export PGDATABASE=espressoulster_pg_fixture SELFHOST_DATABASE=postgres-staging
npm run build:selfhost
node --experimental-transform-types --test tests/postgres-staging.test.mjs
npm run test:backend
```

For the read test, start `scripts/selfhost-server.mjs` on `127.0.0.1:5182` with the same PostgreSQL settings, an isolated files directory, `PAYMENT_APP_ORIGIN=http://127.0.0.1:5182`, `PAYMENT_PROVIDER=disabled`, `PAYMENT_LIVE_ENABLED=false`, and `SELFHOST_MAX_CONCURRENT_REQUESTS=160`. Run `node scripts/postgres-staging-load.mjs` on the same host. This checks bootstrap and order-intake reads. The booking and payment write races are covered by the app tests above.

## Mixed workload rehearsal

The private rehearsal runs two app processes behind a loopback proxy. They share a fresh synthetic PostgreSQL database and a local Cashfree simulator. Every simulated customer browses and reads their order history. The workload assigns about 5% each to Pay at café, online checkout and paid table booking. Each online checkout sends two concurrent verification requests through the replica pool to exercise the shared payment ledger. The simulator and pre-seeded sessions keep real payment and WhatsApp traffic out of the test.

The first run with 128 users exposed four rejected order attempts when transactions competed for the same records. The fix leaves valid unlimited stock untouched, increments the order counter atomically, and retries conflicting transactions with bounded delays. The 128-user rerun recorded no failures.

The final run used 110,000 synthetic profiles and sessions in PostgreSQL. **256 simulated users** ran for one minute and reached 255 requests in flight. The app handled 4,738 API requests with zero failures. The database recorded 13 Pay at café orders, 13 online payments and 13 paid bookings, with zero payment mismatches and zero overlapping table allocations. The 95th-percentile response times were 658 ms for browsing, 324 ms for placing an order, 347 ms for verifying a payment and 72 ms for verifying a booking. This measured the shared test host with local provider simulation. It did not measure 110,000 active users or real Cashfree response times.

Use the private PostgreSQL socket and a fresh `espressoulster_load_staging` database. Build once before starting the app processes.

```sh
export PGDATABASE=espressoulster_load_staging
export LOAD_STAGING_SECRET="$(openssl rand -hex 32)"
export LOAD_STAGING_DATA=/private/load-test/files
export SELFHOST_DATA_DIR=/private/load-test/clean-sqlite
export LOAD_STAGING_CLIENTS=128 LOAD_STAGING_SECONDS=30
node scripts/selfhost-db.mjs
createdb "$PGDATABASE"
node scripts/rehearse-postgres-migration.mjs "$SELFHOST_DATA_DIR/cafe.sqlite" mixed-import.json --with-runtime
node scripts/staging-mixed-load.mjs seed
npm run build:selfhost
node scripts/staging-mixed-server.mjs
```

In a second shell with the same settings, run `node scripts/staging-mixed-load.mjs run` and then `node scripts/staging-mixed-load.mjs reconcile`. On the shared host the rehearsal runs under a two-core and 2 GiB limit. The harness provides offsets and a scheduled start time for separate generators. A full-scale test needs a dedicated deployment and enough generators, followed by a combined report using the request latency histograms and the overlap of the run windows.

## Before the 110,000-user test

1. Deploy the app to a dedicated staging environment with multiple app instances, a load balancer, pooled database connections and a supported PostgreSQL release. Drive the test with [separate load generators](https://grafana.com/docs/k6/latest/testing-guides/running-large-tests/). The rehearsal used the shared server’s existing PostgreSQL 14 installation. [PostgreSQL version policy](https://www.postgresql.org/support/versioning/)
2. Seed synthetic customer and staff accounts. Include normal browsing and authenticated order status, checkout, booking, payment callbacks and retries. Simulate external providers. The current Home screen checks café availability every four seconds. With 110,000 active Home screens, that one endpoint alone would receive roughly 27,500 requests per second. Measure it at the intended traffic mix before deciding what to cache or move to event delivery.
3. Ramp to 100, 1,000, 10,000, 50,000 and 110,000 simultaneous users. Hold the final load for an hour. Measure response times, failure rates, database connection usage, and recovery after an app instance restarts.
4. Reconcile payments, stock, credits and table allocations. Check the rollback plan before requesting approval for the live switch. A rollback after live writes start would need to reconcile those writes before SQLite can resume.

The existing staging host runs other services and limits the Espressoulster app to two CPU cores and 2 GiB. The rehearsal ran on a private listener with those same app limits.
