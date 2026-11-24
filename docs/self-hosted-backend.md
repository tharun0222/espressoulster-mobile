# Backend on your own computer

The Android app, customer screens, mobile Admin, API, database migrations, and
Cashfree verification code live in this project. The default `dev`, `build`, and
`start` commands use Node.js and Next.js. They do not run Cloudflare, Wrangler,
ChatGPT Sites, a hosted database, or a tunnel.

The local server is running at `http://127.0.0.1:5173`. Its customer checkout is
`/#checkout`. The backend and user interface share the same origin, so the app
does not send secrets to the browser or require cross-origin cookie changes.

## Files and commands

- `server/database.mjs`: local SQLite database, transactional batches, checked migrations.
- `server/storage.mjs`: private on-disk image uploads.
- `server/runtime.mjs`: server-only database, storage, and environment bindings.
- `scripts/selfhost-server.mjs`: HTTP on loopback, or HTTPS using your certificate.
- `.env.selfhost`: ignored server settings; mode 600. Existing `.env` is loaded
  first and the self-host settings override it. Shell environment variables take precedence.
- `.selfhost/data/cafe.sqlite`: persistent database. The previous local database
  was copied using SQLite's backup API, preserving accounts, sessions and history.
- `.selfhost/data/images`: the four previous local uploads were imported.

```sh
npm run db:selfhost
npm run build
npm start
```

For development, use `npm run dev`. Stop an existing server before starting
another on the same port. Builds and database files are ignored by Git. Back up
the database with SQLite's backup API; do not copy only the database file while
its WAL is active. Uploaded images also need backups.

## Cashfree and the current ₹1 prices

All 110 current menu items and four Coffee Pass catalog prices are 100 paise.
The stored booking fee is 100 paise. Existing order totals and receipts were
preserved. One item is ₹1; buying multiple items still sums the quantities.

The payment code supports:

1. Orders: reserve stock, create Cashfree checkout, independently verify amount
   and currency, then place one paid order. Duplicate callbacks cannot place it twice.
2. Table bookings: hold available tables, verify the stored fee, and send one
   booking request to Admin. Expired holds and late payments require review.
3. Coffee Pass: snapshot the selected plan, verify payment, and activate exactly
   the purchased credits once. Each redemption uses its own one-use code.

The production Cashfree credentials are read only on the server. Payment
callbacks verify the raw-body signature and retrieve payment status from
Cashfree before updating the database. The automated gateway tests use mocks;
they do not charge any money.

**Live payments are disabled locally.** `127.0.0.1` is reachable only from this
computer; Cashfree cannot deliver a public callback there, and another phone
cannot use it as the backend address. Running the code does not create a public
HTTPS address or a trusted TLS certificate.

## Enable on your own public HTTPS server

Keep this same code and database on your computer or your own server. Supply:

1. A domain you control resolving to that computer's public IP address.
2. Inbound TCP 443 routed to it; the computer must stay on and reachable.
3. A valid CA-issued TLS certificate and private key for that domain.

In the ignored `.env.selfhost`, configure:

```dotenv
SELFHOST_HOST=0.0.0.0
SELFHOST_PORT=443
SELFHOST_TLS_CERT=/absolute/path/fullchain.pem
SELFHOST_TLS_KEY=/absolute/path/privkey.pem
PAYMENT_APP_ORIGIN=https://your-owned-domain.example
PAYMENT_PROVIDER=cashfree
PAYMENT_MODE=live
CASHFREE_CHECKOUT_API=orders
PUBLIC_TEST_MODE=false
PAYMENT_LIVE_ENABLED=false
```

`CASHFREE_LIVE_CLIENT_ID` and `CASHFREE_LIVE_CLIENT_SECRET` must be present in the
server environment. Rotate the production key previously shared in the chat
before public activation. Do not add keys to Android resources, public files,
Next.js `env`, or `NEXT_PUBLIC_*` variables.

Follow the [Cashfree test and rollout steps](cashfree-live.md) before enabling live payments.
Restart the backend and verify its health from outside your Wi-Fi. Use that same
HTTPS origin in the Android app configuration when the next APK is requested.
Cashfree receives `https://your-owned-domain.example/api/payments/cashfree/webhook`
as the notify URL when this backend creates a checkout.

Then test one ₹1 order, one ₹1 booking, and one ₹1 pass on a phone, including
return-to-app, cancellation and duplicate callbacks. The customer must complete
the real payment. Until that rollout is tested, this is a local backend, not a
verified live payment deployment.

This SQLite runtime is intended for one app instance on one computer. It is not
a claim of capacity for 200,000 simultaneous users.
