import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase, migrateDatabase } from "../server/database.mjs";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";
import { createStripePayments } from "../lib/stripe-payment-core.ts";
import { createTestSubscriptionOrder, syncTestSubscription } from "../lib/subscription-test.ts";
import { createSubscriptionRedemption } from "../lib/subscription-redemption.ts";
import { readCafeOverviewStats } from "../lib/cafe-order-day.ts";

const config = {
  PAYMENT_PROVIDER: "cashfree", PAYMENT_MODE: "test", PUBLIC_TEST_MODE: "true",
  PAYMENT_APP_ORIGIN: "https://cafe.test", CASHFREE_TEST_CLIENT_ID: "sandbox-fixture",
  CASHFREE_TEST_CLIENT_SECRET: "sandbox-secret-fixture",
};
const liveConfig = {
  ...config, PAYMENT_MODE: "live", PAYMENT_LIVE_ENABLED: "true", PUBLIC_TEST_MODE: "false",
  CASHFREE_LIVE_CLIENT_ID: "production-fixture", CASHFREE_LIVE_CLIENT_SECRET: "production-secret-fixture",
};
const customer = { userId: "customer", displayName: "Test Customer" };
const checkoutId = "PC-11111111111111111111111111111111";
const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const booking = { date, time: "11:00", endTime: "12:00", guests: 2, purpose: "Visit" };

function fixture(t, env = config) {
  const live = env.PAYMENT_MODE === "live";
  const gatewayHost = live ? "api.cashfree.com" : "sandbox.cashfree.com";
  const checkoutHost = live ? "payments.cashfree.com" : "payments-test.cashfree.com";
  const webhookSecret = live ? env.CASHFREE_LIVE_CLIENT_SECRET : env.CASHFREE_TEST_CLIENT_SECRET;
  const db = openDatabase(":memory:");
  const sql = db.sql;
  t.after(() => db.close());
  migrateDatabase(db, fileURLToPath(new URL("../drizzle/", import.meta.url)));
  sql.exec(`INSERT INTO profiles(id,email) VALUES('customer','customer@example.test'),('other','other@example.test');
    INSERT INTO settings VALUES ('store','{}');
    INSERT INTO categories(id,name) VALUES('coffee','Coffee');
    INSERT INTO products(id,name,category_id,price,inventory,available,data) VALUES('latte','Latte','coffee',25000,2,1,'{}');`);
  const links = new Map();
  let nextId = 100;
  const send = async (url, init) => {
    assert.ok(url.startsWith("https://" + gatewayHost + "/pg/links"));
    assert.equal(init.headers["x-client-secret"], webhookSecret);
    assert.equal(init.redirect, "manual");
    assert.equal(init.headers["x-api-version"], "2026-01-01");
    const path = new URL(url).pathname.split("/");
    if (path.length === 3 && init.method === "POST") {
      const payload = JSON.parse(init.body);
      assert.equal(payload.link_partial_payments, false);
      assert.deepEqual(payload.link_notify, { send_sms: false, send_email: false, send_whatsapp: false });
      assert.match(init.headers["x-idempotency-key"], /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
      assert.equal(payload.link_meta.notify_url, "https://cafe.test/api/payments/cashfree/webhook");
      assert.match(payload.link_meta.return_url, /^https:\/\/cafe\.test\/(booking-)?payment-return\?/);
      if (!links.has(payload.link_id)) {
        const cf_link_id = String(nextId++);
        links.set(payload.link_id, {
          ...payload, cf_link_id, link_amount_paid: 0, link_status: "ACTIVE",
          link_url: "https://" + checkoutHost + "/links/test" + cf_link_id,
        });
      }
      return Response.json(links.get(payload.link_id));
    }
    const link = links.get(path[3]);
    assert.ok(link);
    if (path[4] === "cancel") link.link_status = "CANCELLED";
    return Response.json(link);
  };
  const app = createStripePayments(db, env, send);
  const req = (path, method = "POST") => new Request("https://cafe.test/api/" + path, { method });
  const route = async (path, method = "POST", user = customer) => (await app.route("payments/" + path, req("payments/" + path, method), user)).json();
  const latest = () => [...links.values()].at(-1);
  const paid = (link = latest()) => Object.assign(link, { link_status: "PAID", link_amount_paid: link.link_amount });
  async function webhook(link = latest(), secret = webhookSecret) {
    const raw = JSON.stringify({ type: "PAYMENT_LINK_EVENT", data: { link_id: link.link_id, cf_link_id: link.cf_link_id } });
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", secret).update(timestamp + raw).digest("base64");
    const response = await app.cashfreeWebhook(new Request("https://cafe.test/api/payments/cashfree/webhook", { method: "POST",
      headers: { "x-webhook-timestamp": timestamp, "x-webhook-signature": signature } }), raw);
    return response.json();
  }
  function seedOrder(mode = "test") {
    const cart = JSON.stringify([{ productId: "latte", quantity: 1 }]);
    const quote = {
      total: 25000, subtotal: 25000, tax: 0, fee: 0, discount: 0, currency: "INR",
      items: [{ productId: "latte", name: "Latte", quantity: 1, unitPrice: 25000, selections: {}, instructions: "" }],
    };
    sql.prepare("INSERT INTO carts(user_id,data) VALUES(?,?)").run(customer.userId, cart);
    sql.prepare(`INSERT INTO prepaid_checkouts(id,order_id,user_id,idempotency_key,fulfillment,total,currency,contact,quote,cart_snapshot,stock_holds,provider,mode)
      VALUES(?,'CH-111ABCDE','customer','checkout-key','pickup',25000,'INR',?,?,?,'[]','cashfree',?)`)
      .run(checkoutId, JSON.stringify({ name: "Cafe Customer", email: "customer@example.test", phone: "+919876543210" }), JSON.stringify(quote), cart, mode);
  }
  return { sql, db, app, req, route, latest, paid, webhook, seedOrder };
}

test("Cashfree sandbox creates one order after matching payment and ignores unsigned notifications", async t => {
  const f = fixture(t);
  f.seedOrder();
  assert.deepEqual(await f.route("config", "GET"), { enabled: true, provider: "cashfree", mode: "test", minimumAmount: 100 });
  await assert.rejects(f.route(checkoutId + "/start", "POST", { userId: "other" }), { status: 404 });
  const start = await f.route(checkoutId + "/start");
  assert.equal(start.provider, "cashfree");
  assert.equal(f.latest().link_amount, 250);
  assert.equal((await f.route(checkoutId + "/verify")).paid, false);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 0);
  f.paid().link_amount_paid = 249.99;
  await assert.rejects(f.route(checkoutId + "/verify"), { status: 409 });
  f.paid();
  await assert.rejects(f.webhook(f.latest(), "wrong-key"), { status: 401 });
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM payments").get().n, 0);
  f.sql.exec("INSERT INTO settings VALUES('order-intake','false')");
  await f.webhook();
  assert.equal((await f.route(checkoutId + "/verify")).paid, true);
  await f.webhook();
  assert.deepEqual({ ...f.sql.prepare("SELECT method,amount FROM payments").get() }, { method: "cashfree_test", amount: 25000 });
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM payments").get().n, 1);
});

test("live Cashfree records one real café order only when the gateway verifies the exact payment", async t => {
  const f = fixture(t, liveConfig);
  f.seedOrder("live");
  assert.deepEqual(await f.route("config", "GET"), { enabled: true, provider: "cashfree", mode: "live", minimumAmount: 100 });
  const checkout = await f.route(checkoutId + "/start");
  assert.equal(checkout.mode, "live");
  assert.equal(new URL(checkout.redirectUrl).origin, "https://payments.cashfree.com");
  assert.deepEqual(f.latest().customer_details, { customer_name: "Cafe Customer", customer_phone: "9876543210" });
  assert.equal((await f.route(checkoutId + "/verify")).paid, false);
  f.paid().link_amount_paid = 249.99;
  await assert.rejects(f.webhook(), { status: 409 });
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 0);
  f.paid();
  await assert.rejects(f.webhook(f.latest(), config.CASHFREE_TEST_CLIENT_SECRET), { status: 401 });
  f.sql.exec("INSERT INTO settings VALUES('order-intake','false')");
  const [confirmed] = await Promise.all([f.webhook(), f.route(checkoutId + "/verify")]);
  assert.equal(confirmed.realMoneyCollected, true);
  assert.equal(confirmed.testOnly, false);
  assert.deepEqual(f.sql.prepare("SELECT method,amount,verified_by FROM payments").all().map(row=>({...row})),
    [{ method: "cashfree", amount: 25000, verified_by: "provider_verified" }]);
});

test("live booking uses the customer's number and reaches the café queue once after ₹100 verification", async t => {
  const f = fixture(t, liveConfig);
  f.sql.exec("UPDATE profiles SET name='Booking Customer',phone='+919876543210' WHERE id='customer'");
  const start = await f.app.booking.start(f.req("table-bookings"), customer.userId, booking);
  assert.equal(start.mode, "live");
  assert.equal(f.latest().link_amount, 100);
  assert.equal(f.latest().customer_details.customer_phone, "9876543210");
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM table_bookings").get().n, 0);
  f.paid();
  await f.webhook();
  await f.webhook();
  assert.equal((await f.app.booking.verifyOwner(f.latest().link_id, customer.userId, false)).mode, "live");
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM table_bookings WHERE status='pending'").get().n, 1);
});

test("live cashfree cannot start with test credentials, an insecure return URL, or an old test draft", async t => {
  const f = fixture(t, liveConfig);
  f.seedOrder("test");
  await assert.rejects(f.route(checkoutId + "/start"), { status: 409 });
  const disabled = [
    { PAYMENT_LIVE_ENABLED: "false" }, { PUBLIC_TEST_MODE: "true" },
    { PAYMENT_APP_ORIGIN: "http://cafe.test" }, { PAYMENT_APP_ORIGIN: "https://localhost" },
    { CASHFREE_LIVE_CLIENT_ID: config.CASHFREE_TEST_CLIENT_ID },
    { CASHFREE_LIVE_CLIENT_SECRET: config.CASHFREE_TEST_CLIENT_SECRET },
  ];
  for (const override of disabled) {
    const app = createStripePayments(f.db, { ...liveConfig, ...override }, () => assert.fail("Unexpected gateway call"));
    const response = await app.route("payments/config", f.req("payments/config", "GET"), customer);
    assert.equal((await response.json()).enabled, false);
  }
});

test("live ₹1 Coffee Pass activates once, stays out of café pending orders, and redeems independent item codes", async t => {
  const env = {...liveConfig, PIN_AUTH_SECRET:"cashfree-redemption-fixture-secret-with-32-characters"};
  const f = fixture(t, env);
  const buyer = {...customer,profile:{phone:"+919876543210"}};
  f.sql.exec("UPDATE profiles SET name='Pass Customer',phone='+919876543210' WHERE id='customer'");
  f.sql.exec("UPDATE subscription_catalog SET amount=100 WHERE id='monthly'");
  const id=await createTestSubscriptionOrder(f.db,buyer,"monthly","cashfree");
  const same=await createTestSubscriptionOrder(f.db,buyer,"monthly","cashfree");
  assert.equal(same,id);
  const checkout=await f.route(id+"/start");
  assert.equal(checkout.mode,"live");
  assert.equal(f.latest().link_amount,1);
  assert.equal((await f.route(id+"/verify")).paid,false);
  await syncTestSubscription(f.db,env,buyer.userId);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM coffee_subscriptions").get().n,0);
  f.paid();
  await f.webhook();
  await f.webhook();
  const verification=await f.route(id+"/verify");
  assert.equal(verification.realMoneyCollected,true);
  assert.equal(verification.testOnly,false);
  await syncTestSubscription(f.db,env,buyer.userId);
  const passes=f.sql.prepare("SELECT id,purchased_credits,plan_name FROM coffee_subscriptions").all();
  assert.equal(passes.length,1);
  assert.equal(passes[0].purchased_credits,34);
  assert.equal(passes[0].plan_name,"Monthly coffee pass");
  assert.equal((await readCafeOverviewStats(f.db,"2000-01-01 00:00:00")).pending,0);
  const redemption=createSubscriptionRedemption(f.db,env);
  const first=await redemption.generate(buyer.userId,passes[0].id);
  assert.equal(first.testOnly,false);
  const result=await redemption.redeem({phone:buyer.profile.phone,code:first.code,subscriptionId:passes[0].id},"operator");
  assert.equal(result.creditsUsed,1);
  await assert.rejects(redemption.redeem({phone:buyer.profile.phone,code:first.code},"operator"));
  const second=await redemption.generate(buyer.userId,passes[0].id);
  assert.notEqual(first.codeId,second.codeId);
  await redemption.redeem({phone:buyer.profile.phone,code:second.code,subscriptionId:passes[0].id},"operator");
  assert.equal(f.sql.prepare("SELECT SUM(credits) AS used FROM coffee_redemptions WHERE reversed_at IS NULL").get().used,2);
});

test("a cancelled or mismatched live Coffee Pass payment cannot issue credits", async t => {
  const f=fixture(t,liveConfig);
  const buyer={...customer,profile:{phone:"+919876543210"}};
  const id=await createTestSubscriptionOrder(f.db,buyer,"weekly","cashfree");
  await f.route(id+"/start");
  f.paid().link_amount_paid-=1;
  await assert.rejects(f.route(id+"/verify"),{status:409});
  f.paid();
  f.sql.prepare("UPDATE orders SET status='cancelled' WHERE id=?").run(id);
  assert.equal((await f.webhook()).refundReviewRequired,true);
  await syncTestSubscription(f.db,liveConfig,customer.userId);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM coffee_subscriptions").get().n,0);
});

test("the configured ₹1 booking fee is snapshotted and verified even if Admin changes the fee later", async t => {
  const f=fixture(t,liveConfig);
  f.sql.exec("UPDATE profiles SET name='Booking Customer',phone='+919876543210' WHERE id='customer'");
  f.sql.exec(`UPDATE settings SET data='{"tableBookingFeePaise":100}' WHERE id='store'`);
  await f.app.booking.start(f.req("table-bookings"),customer.userId,booking);
  assert.equal(f.latest().link_amount,1);
  f.sql.exec(`UPDATE settings SET data='{"tableBookingFeePaise":10000}' WHERE id='store'`);
  f.paid();
  await f.webhook();
  const result=await f.app.booking.verifyOwner(f.latest().link_id,customer.userId,false);
  assert.equal(result.amount,100);
  assert.equal(result.state,"paid");
});

test("closing an unpaid Coffee Pass checkout issues no credits and closing a booking frees its held tables", async t => {
  const f=fixture(t,liveConfig);
  const buyer={...customer,profile:{phone:"+919876543210"}};
  f.sql.exec("UPDATE profiles SET name='Customer',phone='+919876543210' WHERE id='customer'");
  const id=await createTestSubscriptionOrder(f.db,buyer,"weekly","cashfree");
  await f.route(id+"/start");
  const response=await f.app.route("payments/"+id+"/verify",
    new Request("https://cafe.test/api/payments/"+id+"/verify?cancelled=1",{method:"POST"}),buyer);
  assert.equal((await response.json()).providerState,"EXPIRED");
  await syncTestSubscription(f.db,liveConfig,customer.userId);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM coffee_subscriptions").get().n,0);
  await f.app.booking.start(f.req("table-bookings"),customer.userId,booking);
  const bookingId=f.latest().link_id;
  assert.ok(f.sql.prepare("SELECT COUNT(*) AS n FROM live_cafe_table_schedule WHERE source_id=?").get(bookingId).n>0);
  assert.equal((await f.app.booking.verifyOwner(bookingId,customer.userId,true)).state,"expired");
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM live_cafe_table_schedule WHERE source_id=?").get(bookingId).n,0);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM table_bookings").get().n,0);
});

test("Cashfree verifies the full ₹100 and opens exactly one booking request", async t => {
  const f = fixture(t);
  await f.app.booking.start(f.req("table-bookings"), customer.userId, booking);
  const link = f.latest();
  assert.equal(link.link_amount, 100);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM table_bookings").get().n, 0);
  await assert.rejects(f.app.booking.verifyOwner(link.link_id, "other", false), { status: 404 });
  f.paid();
  await f.webhook();
  await f.webhook();
  assert.deepEqual(await f.app.booking.verifyOwner(link.link_id, customer.userId, false), { state: "paid", bookingId: link.link_id });
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM table_bookings WHERE status='pending'").get().n, 1);
});

test("Cashfree Coffee Pass receives its purchased credits only after verified payment", async t => {
  const f = fixture(t);
  const id = await createTestSubscriptionOrder(f.db, customer, "weekly");
  await f.route(id + "/start");
  await syncTestSubscription(f.db, config, customer.userId);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM coffee_subscriptions").get().n, 0);
  f.paid();
  assert.equal((await f.webhook()).paid, true);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM coffee_subscriptions").get().n, 1);
  assert.equal((await f.route(id + "/verify")).paid, true);
  await syncTestSubscription(f.db, config, customer.userId);
  await syncTestSubscription(f.db, config, customer.userId);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM coffee_subscriptions").get().n, 1);
  assert.equal(f.sql.prepare("SELECT purchased_credits FROM coffee_subscriptions").get().purchased_credits, 8);
});

test("expired Cashfree checkouts preserve the cart and reject unsafe redirects", async t => {
  const f = fixture(t);
  f.seedOrder();
  await f.route(checkoutId + "/start");
  f.latest().link_url = "https://payments.cashfree.com/links/live";
  f.sql.prepare("UPDATE prepaid_checkouts SET checkout_url=?").run(f.latest().link_url);
  await assert.rejects(f.route(checkoutId + "/start"), { status: 502 });
  f.latest().link_status = "EXPIRED";
  assert.equal((await f.route(checkoutId + "/verify")).providerState, "EXPIRED");
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM carts").get().n, 1);
});

test("missing credentials disable Cashfree and live mode cannot use the sandbox", async t => {
  const f = fixture(t, { ...config, CASHFREE_TEST_CLIENT_SECRET: "" });
  assert.deepEqual(await f.route("config", "GET"), { enabled: false, provider: "cashfree", mode: "test" });
  const live = createStripePayments(f.db, { ...config, PAYMENT_MODE: "live" }, () => assert.fail("Unexpected gateway call"));
  assert.deepEqual(await (await live.route("payments/config", f.req("payments/config", "GET"), customer)).json(), { enabled: false, provider: 'cashfree', mode: 'live' });
});
