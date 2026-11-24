# Espressoulster staging deployment and capacity status

Deployment date: 20 November 2026.

## Current staging database

On 21 November 2026, staging switched to PostgreSQL 17.12. The app still listens on `127.0.0.1:5175` on the server. The existing SSH tunnel exposes staging at `http://127.0.0.1:5176` on the Mac. The live app stayed on SQLite.

- PostgreSQL runs as `espressoulster-postgres.service` under the staging user. It uses a private Unix socket and has no TCP listener.
- The final SQLite snapshot and the PostgreSQL import matched for all 908 rows in 56 tables. The 19 triggers, 2 views, and existing image files were preserved. The previous SQLite release and final snapshot are retained under the private staging deployment directory.
- The Home page, menu, table list, WhatsApp sign-in configuration, and Admin access checks were verified on the active staging endpoint. Automated PostgreSQL tests covered customer and staff sign-in with a simulated WhatsApp provider, order placement and Admin updates, Pay at café, and simulated Cashfree payments for orders, bookings, and Coffee Pass.
- The backup timer now saves a PostgreSQL archive and uploaded images. A restore into a disposable database verified the archive and matched the live schema and key table counts.

The staging app and backup service load PostgreSQL settings from `shared/postgres.env`. The original `shared/runtime.env` supplies the app and provider settings. Migration records are under `postgres-migration/`. If staging has received new writes since the switch, recover from PostgreSQL backups so those writes are preserved.

The sections below record the original SQLite deployment on 20 November.

## Actual deployment

- Server: `37.27.51.7`, existing SSH account `interns`.
- Isolated directory: `/home/interns/apps/espressoulster-staging`.
- Release: `releases/20261120-183618`, selected by the `current` symlink.
- Private listener: **127.0.0.1:5175**. No public HTTP listener or firewall rule was opened.
- Dedicated, checksum-verified Node **24.22.2**; the system Node 18 installation and other apps were left unchanged.
- Linux dependencies installed with `npm ci`; Next production build completed.
- Consistent SQLite snapshot and uploaded images copied from the local app. This is a staging copy, not ongoing replication with the Mac.
- Secrets are in `shared/runtime.env`, mode 600, outside the public directory and source repository. Production gateway credentials were not transferred.
- WhatsApp OTP remains required. Local preview shortcuts are disabled. Both existing staff numbers retain device-independent OTP Admin access.
- Cashfree remains sandbox-only; real payments are disabled.

User services:

| Service | Behavior |
| --- | --- |
| `espressoulster-staging.service` | Starts at boot through the already-enabled user linger setting; restarts on process failure. Memory ceiling 2 GiB, CPU ceiling two cores, bounded tasks/open files. |
| `espressoulster-health.timer` | Checks process/database readiness every 30 seconds; restarts only this app after three consecutive failures. |
| `espressoulster-backup.timer` | Daily consistent SQLite backup plus uploaded images, retaining seven completed snapshots. |

The new request admission guard permits 64 active requests per Node process by default. Excess work receives HTTP 503 with Retry-After, instead of unlimited queue growth. This protects resources; it is **not** a guarantee that all users are served during overload.

Backups are currently on the same server. An independent off-server backup is still needed for recovery from server/disk loss.

## Verified results

- **577 automated checks passed on Linux**, including HTTP integration, payment rules, Admin access policies, table scheduling and the new admission/proxy tests. Fixture tests do not establish real phone checkout, OTP delivery or notifications.
- Home, unauthenticated Admin entry, bootstrap/catalog and order-intake HTTP responses work internally.
- Unauthenticated orders access returns HTTP 401.
- Database readiness endpoint works. Backup SQLite integrity check returned `ok`.
- Controlled recovery: stopped only this staging app; two failed readiness checks did not restart it; the third restarted it successfully.
- Read-only baseline: **300 requests, 10 simultaneous clients, 0 errors**, approximately 546.5 requests/second during the short run, p50 15.8 ms and p95 34.1 ms. Mix: 100 bootstrap reads and 200 order-intake reads. This excludes TLS, internet latency, signed-in workflows and external payments. It cannot be extrapolated to 100,000 users.
- Direct routing checks from staging returned HTTP 200 and valid geometry for **walking and driving** with the existing routing key. The earlier Mac routing connectivity failure did not reproduce on this server.
- No WhatsApp messages were sent from staging and no MSG91 allowlist was changed. Staging OTP delivery is not verified.

Private evidence files are under `shared/`: `tests.log`, `load-smoke.json`, `routing-check.json`, `build.log`, and `install.log`.

## Direct HTTPS on the staging server

Staging serves the PostgreSQL copy at `127.0.0.1:5175`. The Mac reaches it through the existing SSH tunnel on port 5176.

As of 23 November 2026, TCP 8443 is reachable from the internet. The separate `espressoulster-direct-staging.service` runs the app's HTTPS listener at `https://espressoulster.37-27-51-7.nip.io:8443`, using the same staging PostgreSQL database. It reads overrides from `shared/direct-https.env` and uses the release linked at `direct-current`. The v1.0.19 staging APK embeds the staging CA certificate and trusts it only for that hostname. The server certificate expires on 22 May 2027. Renew it with the same CA before expiry to keep installed APKs working.

For a publicly trusted browser certificate, use an owned staging hostname and DNS-01 to issue and renew the certificate without binding port 80 or 443. Use the following values as a reference for the direct listener's private environment. Keep the existing PostgreSQL Unix-socket configuration.

```ini
SELFHOST_HOST=0.0.0.0
SELFHOST_PORT=8443
SELFHOST_DIRECT_STAGING_HTTPS=true
SELFHOST_TLS_CERT=/path/to/fullchain.pem
SELFHOST_TLS_KEY=/path/to/privkey.pem
SELFHOST_TRUST_PROXY=
PAYMENT_APP_ORIGIN=https://staging.your-domain.example:8443
PAYMENT_PROVIDER=cashfree
PAYMENT_MODE=test
PAYMENT_LIVE_ENABLED=false
PUBLIC_TEST_MODE=false
CASHFREE_CHECKOUT_API=orders
CASHFREE_STAGING_SANDBOX_ENABLED=true
CASHFREE_NOTIFY_URL=
SELFHOST_LIVE_UPDATES=true
```

Keep tester login disabled on the public staging listener. Cashfree Sandbox requires `CASHFREE_TEST_CLIENT_ID` and `CASHFREE_TEST_CLIENT_SECRET` in the server's private environment. The app checks payment status with the backend after checkout. To verify external Cashfree webhook delivery, set `CASHFREE_NOTIFY_URL` to the webhook endpoint on HTTPS with a publicly trusted certificate. WhatsApp OTP requires staging's outgoing connection to match the existing MSG91 allowlist.

From a separate network, verify the current staging database and Android WebView assets with the staging CA:

```sh
staging_ca="$HOME/.local/share/espressoulster/staging-tls/ca.pem"
staging_origin=https://espressoulster.37-27-51-7.nip.io:8443
curl --fail --cacert "$staging_ca" "$staging_origin/api/ready"
NODE_EXTRA_CA_CERTS="$staging_ca" node scripts/check-android-assets.mjs "$staging_origin"
```

Use `ESPC_ANDROID_BUILD_MODE=staging-https`, `ESPC_ANDROID_STORE_ORIGIN` set to the verified URL and `ESPC_ANDROID_STAGING_CA` set to the public CA certificate file when building the mobile-data test APK. It uses the separate staging Android package. Enter the WhatsApp OTP manually on staging because the approved autofill template targets the live Android package.

## What 100,000 simultaneous users requires

**The current deployment is not certified for 100,000 simultaneous users. Zero downtime cannot be guaranteed.** This is one process with SQLite on a shared host, and HTTPS activation is still pending.

Concrete current bottlenecks:

1. Frequent Home/order/chat/booking polling generates repeated authenticated database work. The previous audit estimated about 2,100 requests/hour per active Home client: if that workload applied to 100,000 clients, it would mean about 58,333 requests/second. That is a scenario estimate, not a measured load.
2. Bootstrap currently returns about 387 KB before compression. Re-sending the entire catalog every 30 seconds to 100,000 clients would be roughly 1.29 GB/second before compression. Split versioned public catalog data from private user/cart data; cache only public data and use conditional responses. Prepared nginx enables response compression once installed.
3. SQLite has one writer. Launching more Node workers against it does not create a horizontally scalable transaction system.
4. A single server, single database disk and single upstream direction/OTP/payment providers remain failure points.

Required scale implementation:

1. Move transactional data to PostgreSQL with pooled connections, transactional table allocation constraints and idempotent order/payment/redemption writes. Preserve the existing ledger and concurrency rules during migration.
2. Run at least two independently supervised application instances behind a health-checked load balancer; keep per-user sessions, rate limits and idempotency state shared. A second process on the same host does not provide host-level redundancy.
3. Use Redis or an equivalent shared store for public catalog/version caching, shared rate limits and transient event distribution. Do not cache authenticated bootstrap responses as public data.
4. Replace repeated full-page polling with one authenticated event stream per active client, plus durable native push delivery for background devices. Add a durable outbox/worker for notifications and webhook processing with retries and deduplication.
5. Put public static assets behind a cache and uploads in durable shared storage. Keep secrets and private receipts inaccessible to the public cache.
6. Add external availability monitoring, error/latency/saturation alerts, off-server backups, restore drills, database failover and deployment rollback.
7. Test from separate load-generator machines against dedicated capacity-test infrastructure. Ramp 100 → 1,000 → 10,000 → 25,000 → 50,000 → 100,000 active sessions, measure real workload mixes, hold the target for at least an hour, then perform an extended soak and instance-failure tests. Do not flood this shared server or external payment/OTP providers.

Release gate: agreed latency/error targets met at 100,000 sessions, zero duplicate payment fulfillment, zero table allocation conflicts or ledger corruption, stable resource headroom, recovery/restore demonstrated, and physical Android workflows verified. Extra machines/domain permissions/provider limits must exist before this gate can be passed.

## Operations

As `interns`:

```sh
systemctl --user status espressoulster-staging.service
systemctl --user list-timers 'espressoulster-*'
journalctl --user -u espressoulster-staging.service --since '10 minutes ago'
systemctl --user start espressoulster-backup.service
```

For restoration: stop this app and its health timer, take a separate snapshot of current data, restore one completed backup's database and images together, check SQLite integrity/migrations, then start the app and health timer. Do not overwrite a live SQLite database or copy only a WAL main file.
