import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHmac } from "node:crypto";
import { createStripePayments } from "../lib/stripe-payment-core.ts";
import { reserveOrderStock } from "../lib/order-placement.ts";

const config = {
  PUBLIC_TEST_MODE:"true", PAYMENT_MODE:"test", STRIPE_TEST_SECRET_KEY: "sk_test_fixture",
  STRIPE_TEST_WEBHOOK_SECRET: "whsec_fixture", PAYMENT_APP_ORIGIN: "https://cafe.test",
};
const id = "PC-11111111111111111111111111111111";
const orderId = "CH-1234ABCD";
const cart = JSON.stringify([{ productId: "latte", quantity: 1 }]);
const quote = {
  items: [{ productId: "latte", name: "Latte", quantity: 1, unitPrice: 5000, selections: {}, instructions: "" }],
  subtotal: 5000, total: 5000, tax: 0, discount: 0, fee: 0, currency: "INR",
};

async function fixture(table) {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const migration of readdirSync(new URL("../drizzle/", import.meta.url)).filter(name => name.endsWith(".sql")).sort())
    sql.exec(readFileSync(new URL(`../drizzle/${migration}`, import.meta.url), "utf8"));
  sql.exec(`INSERT INTO categories (id,name) VALUES ('coffee','Coffee');
    INSERT INTO products (id,name,category_id,price,inventory,available,data)
      VALUES ('latte','Latte','coffee',5000,2,1,'{}');
    INSERT INTO settings VALUES ('store','{}');`);
  sql.prepare("INSERT INTO carts (user_id,data) VALUES (?,?)").run("customer",cart);

  const db = {
    prepare(query) {
      return { bind(...args) {
        const execute = () => {
          const statement = sql.prepare(query);
          if (/\bRETURNING\b/i.test(query)) return { results: statement.all(...args) };
          return { meta: statement.run(...args) };
        };
        return {
          execute, async run() { return execute(); },
          async first() { return sql.prepare(query).get(...args) || null; },
          async all() { return { results: sql.prepare(query).all(...args) }; },
        };
      } };
    },
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const result = statements.map((statement) => statement.execute());
        sql.exec("COMMIT");
        return result;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const inventory = reserveOrderStock(db, quote.items, [{ id: "latte", price: 5000, _raw: "{}", inventory: 2 }]);
  await db.batch([
    db.prepare(`INSERT INTO prepaid_checkouts(id,order_id,user_id,idempotency_key,fulfillment,total,currency,contact,quote,cart_snapshot,stock_holds)
      VALUES (?,?,?,'key',?,5000,'INR',?,?,?,?)`)
      .bind(id,orderId,"customer",table?"dine_in":"pickup",JSON.stringify({name:"Test customer",email:"test@example.com",phone:"9999999999",table}),
        JSON.stringify(quote),cart,JSON.stringify(inventory.holds)),
    ...inventory.statements,
  ]);

  let session;
  let expiryCalls = 0;
  const send = async (url, request) => {
    if (url.endsWith("/expire")) {
      expiryCalls++;
      assert.equal(session.status, "open");
      session.status = "expired";
    } else if (request.method === "POST") {
      session ??= {
        id: "cs_test_prepaid", livemode: false, mode: "payment", status: "open", payment_status: "unpaid",
        amount_total: 5000, currency: "inr", client_reference_id: request.body.get("client_reference_id"),
        metadata: { order_id: request.body.get("metadata[order_id]") },
        expires_at: Math.floor(Date.now()/1000)+1800, url: "https://checkout.stripe.com/c/pay/cs_test_prepaid",
      };
    }
    return Response.json(session);
  };
  const stripe = createStripePayments(db,config,send);
  return {
    sql,
    created: () => sql.prepare("SELECT * FROM orders").all(),
    held: () => sql.prepare("SELECT inventory FROM products WHERE id='latte'").get().inventory,
    expiryCalls: () => expiryCalls,
    pay(data = {}) { Object.assign(session,{status:"complete",payment_status:"paid",payment_intent:"pi_prepaid"},data); },
    async route(action, userId = "customer", cancel = false) {
      const path = "payments/"+id+"/"+action;
      const response = await stripe.route(path,new Request("https://cafe.test/api/"+path+(cancel?"?cancelled=1":""),{method:"POST"}),{userId});
      return response.json();
    },
    async webhook() {
      const raw = JSON.stringify({livemode:false,type:"checkout.session.completed",data:{object:session}});
      const timestamp = Math.floor(Date.now()/1000);
      const signature = createHmac("sha256",config.STRIPE_TEST_WEBHOOK_SECRET).update(timestamp+"."+raw).digest("hex");
      const request = new Request("https://cafe.test/api/payments/stripe/webhook",{headers:{"Stripe-Signature":`t=${timestamp},v1=${signature}`}});
      return (await stripe.webhook(request,raw)).json();
    },
  };
}

test("QR checkout leaves the table available until payment actually places the order", async () => {
  const f = await fixture("T04");
  try {
    const allocations = () => f.sql.prepare("SELECT kind,customer_id FROM live_cafe_table_schedule WHERE table_id='T04'").all();
    assert.deepEqual(allocations(), []);
    await f.route("start");
    assert.equal(f.created().length, 0);
    assert.deepEqual(allocations(), []);
    f.pay();
    assert.equal((await f.route("verify")).paid, true);
    assert.equal(f.created().length, 1);
    assert.deepEqual(allocations().map(row => ({...row})), [{kind:"visit",customer_id:"customer"}]);
  } finally { f.sql.close(); }
});

test("a late paid QR order goes to staff assignment when its table was taken", async () => {
  const f = await fixture("T04");
  try {
    await f.route("start");
    f.sql.exec("UPDATE cafe_table_schedule SET expires_at=unixepoch()-1 WHERE table_id='T04'");
    f.sql.exec("INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind) VALUES('T04','other','visit')");
    f.pay();
    const results = await Promise.all([f.webhook(), f.route("verify")]);
    assert.ok(results.every(result=>result.paid));
    assert.equal(f.created().length,1);
    assert.equal(JSON.parse(f.created()[0].contact).table,undefined);
    assert.deepEqual(f.sql.prepare("SELECT customer_id FROM live_cafe_table_schedule WHERE table_id='T04'").all().map(r=>r.customer_id),['other']);
  } finally { f.sql.close(); }
});

test("successful return and webhook place one paid order and consume the reserved stock once", async () => {
  const f = await fixture();
  try {
    await f.route("start");
    assert.equal((await f.route("verify")).providerState,"PENDING");
    assert.equal(f.created().length,0);
    assert.equal(f.held(),1);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM cafe_order_sequences").get().n,0);
    // A café may stop accepting new requests while an already reserved checkout is open.
    f.sql.exec("INSERT INTO settings VALUES ('order-intake','false')");
    f.pay();
    const results = await Promise.all([f.webhook(), f.route("verify"), f.route("verify")]);
    assert.ok(results.every(result=>result.paid && result.orderId===orderId));
    assert.equal(new Set(results.map(result=>result.orderNumber)).size,1);
    assert.equal(f.created().length,1);
    assert.equal(f.created()[0].payment_status,"paid");
    assert.equal(f.held(),1);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM payments").get().n,1);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM order_events").get().n,1);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM carts").get().n,0);
  } finally { f.sql.close(); }
});

test("cancelled checkout releases stock once and keeps the cart", async () => {
  const f = await fixture();
  try {
    await f.route("start");
    await assert.rejects(f.route("verify","other-customer",true),error=>error.status===404);
    for (let retry=0; retry<2; retry++) {
      assert.equal((await f.route("verify","customer",true)).providerState,"EXPIRED");
    }
    assert.equal(f.expiryCalls(),1);
    assert.equal(f.held(),2);
    assert.equal(f.created().length,0);
    assert.equal(f.sql.prepare("SELECT data FROM carts").get().data,cart);
  } finally { f.sql.close(); }
});

test("a payment for the wrong amount cannot create an order or clear the cart", async () => {
  const f = await fixture();
  try {
    await f.route("start");
    f.pay({amount_total:4900});
    await assert.rejects(f.route("verify"),error=>error.status===409);
    assert.equal(f.created().length,0);
    assert.equal(f.sql.prepare("SELECT data FROM carts").get().data,cart);
  } finally { f.sql.close(); }
});

test("a changed cart survives verified payment, even on the cancel return", async () => {
  const f = await fixture();
  try {
    await f.route("start");
    const changedCart = JSON.stringify([{productId:"latte",quantity:2}]);
    f.sql.prepare("UPDATE carts SET data=?").run(changedCart);
    f.pay();
    assert.equal((await f.route("verify","customer",true)).paid,true);
    assert.equal(f.expiryCalls(),0);
    assert.equal(f.sql.prepare("SELECT data FROM carts").get().data,changedCart);
  } finally { f.sql.close(); }
});
