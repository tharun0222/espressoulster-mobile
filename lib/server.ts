import {ensureSeedOnce} from './seed-once';
import {menuRecipe} from './menu-recipe';
import {cleanRecipeOverride,recipeOverrideError,resolveProductRecipe} from './product-recipe';
import {visibleSubscriptionOrders} from './visible-subscription-orders';
import {subscriberQuote} from './subscriber-discount';
import {stripeTestConfig} from './stripe-security';
import {readPinSession,pinReady} from './pin-auth-core';
import {passwordAdmin} from "./admin-auth";
import {phoneSessionToken} from "./phone-verification";
import {headers} from "next/headers";
import {testerToken,hashTesterToken} from "./tester-auth";
import { env } from "cloudflare:workers";
import { catalogSeed, categorySeed, defaultSettings } from "./catalog";
import { getChatGPTUser } from "../app/chatgpt-auth";
import {
  BusinessError,
  assert,
  whole,
  text,
  validateProduct,
  priceCart,
  validTransition,
} from "./pricing";
export const json = (data: any, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export function db() {
  assert(env.DB, "The store database is temporarily unavailable", 503);
  return env.DB;
}
export async function seed() {
  const d = db();
  return ensureSeedOnce(d,async()=>{
    if(await d.prepare("SELECT id FROM settings WHERE id=?").bind("store").first())return;
    await d.batch([
      ...categorySeed.map((c) =>
        d
          .prepare(
            "INSERT OR IGNORE INTO categories (id,name,position) VALUES (?,?,?)",
          )
          .bind(c.id, c.name, c.position),
      ),
      ...catalogSeed.map((p) =>
        d
          .prepare(
            "INSERT OR IGNORE INTO products (id,name,category_id,price,inventory,available,archived,data) VALUES (?,?,?,?,NULL,?,0,?)",
          )
          .bind(p.id, p.name, p.categoryId, p.price, p.available ? 1 : 0, JSON.stringify(p)),
      ),
      d
        .prepare("INSERT OR IGNORE INTO settings (id,data) VALUES (?,?)")
        .bind("store", JSON.stringify(defaultSettings)),
    ]);
  });
}
export async function catalog(admin = false) {
  const d = db();
  const [p, c, s] = await Promise.all([
    d
      .prepare("SELECT * FROM products" + (admin ? "" : " WHERE archived=0"))
      .all(),
    d.prepare("SELECT * FROM categories ORDER BY position,name").all(),
    d
      .prepare("SELECT data FROM settings WHERE id=?")
      .bind("store")
      .first<any>(),
  ]);
  const savedSettings = JSON.parse(s?.data || "{}");
  if (savedSettings.brand === "My Coffee House") savedSettings.brand = defaultSettings.brand;
  return {
    products: p.results.map((r: any) => {
      const stored=JSON.parse(r.data);
      const suggested=menuRecipe(r.id,r.name);
      return Object.defineProperty(
        {
          ...stored,
          recipeMeasurements:resolveProductRecipe(suggested,stored.recipeOverride),
          // Unedited recipes already have the suggestion in recipeMeasurements.
          ...(admin&&stored.recipeOverride?{recipeSuggestion:suggested}:{}),
          id:r.id,name:r.name,categoryId:r.category_id,price:r.price,
          inventory:r.inventory,available:!!r.available,archived:!!r.archived,
        },
        "_raw",{value:r.data},
      );
    }),
    categories: c.results.map((r: any) => ({ ...r, enabled: !!r.enabled })),
    settings: { ...defaultSettings, ...savedSettings, testMode:(env as any).PUBLIC_TEST_MODE === "true" },
  };
}
export async function identity(required = false, administrator = false) {
  // Admin cookies must not replace a customer identity after an external payment redirect.
  if (administrator) {
    const passwordUser = await passwordAdmin();
    if (passwordUser) return passwordUser;
  }
  if (!administrator && (env as any).CUSTOMER_AUTH_MODE === 'pin') {
    const profile=pinReady(env)?await readPinSession(db(),(await headers()).get('cookie')):null;
    assert(!required||profile,'Please sign in with your mobile number and PIN',401);
    const login=profile?await db().prepare('SELECT phone FROM pin_accounts WHERE user_id=?').bind(profile.id).first<any>():null;
    return profile?{loginPhone:login?.phone,userId:profile.id,email:profile.email,fullName:profile.name,displayName:profile.name,phoneVerified:false,authProvider:'pin',admin:false,profile}:null;
  }
  let tester = null;
  let phoneVerified = false;
  if (!administrator) {
    const token=phoneSessionToken((await headers()).get("cookie"));
    if(token) tester=await db().prepare("SELECT p.* FROM phone_sessions s JOIN profiles p ON p.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(await hashTesterToken(token),Math.floor(Date.now()/1000)).first<any>();
  }
  phoneVerified = !!tester;
  if (!tester && !administrator && (env as any).PUBLIC_TEST_MODE === "true") {
    const token = testerToken((await headers()).get("cookie"));
    if (token) tester = await db().prepare("SELECT p.* FROM tester_sessions s JOIN profiles p ON p.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(await hashTesterToken(token),Math.floor(Date.now()/1000)).first<any>();
  }
  const u = tester ? {userId:tester.id,email:tester.email,fullName:tester.name,displayName:tester.name} : await getChatGPTUser();
  assert(!required || u, "Please sign in to continue", 401);
  if (!u) return null;
  const p = tester || await db()
    .prepare("SELECT * FROM profiles WHERE id=?")
    .bind(u.userId)
    .first<any>();
  assert(!p?.disabled, "This account is disabled. Contact the café.", 403);
  const admin = !tester && (env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(u.email.toLowerCase());
  return {
    ...u,
    phoneVerified,
    authProvider: tester ? (phoneVerified ? "phone" : "tester") : "chatgpt",
    admin,
    profile: p || {
      id: u.userId,
      email: u.email,
      name: u.fullName || "",
      phone: "",
    },
  };
}
export async function adminIdentity() {
  const passwordUser = await passwordAdmin();
  if (passwordUser) return passwordUser;
  assert((env as any).ADMIN_PASSWORD_LOGIN_ONLY !== "true", "Administrator login is required", 403);
  const u = await identity(false, true);
  assert(u?.admin, "Administrator access is required", 403);
  return u!;
}
export function mutationGuard(req: Request) {
  const origin = req.headers.get("origin");
  assert(
    !origin || origin === new URL(req.url).origin,
    "Cross-origin request rejected",
    403,
  );
  assert(
    req.headers.get("sec-fetch-site") !== "cross-site",
    "Cross-site request rejected",
    403,
  );
}
export async function limitedBytes(req: Request, max: number) {
  assert(
    Number(req.headers.get("content-length") || 0) <= max,
    "Request is too large",
    413,
  );
  const reader = req.body?.getReader();
  assert(reader, "Request body is missing");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    length += r.value.length;
    if (length > max) {
      await reader.cancel();
      throw new BusinessError("Request is too large", 413);
    }
    chunks.push(r.value);
  }
  const all = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return all;
}
export async function body(req: Request): Promise<any> {
  const bytes = await limitedBytes(req, 1000000);
  try {
    const b = JSON.parse(new TextDecoder().decode(bytes));
    assert(
      b && typeof b === "object" && !Array.isArray(b),
      "Expected a JSON object",
    );
    return b;
  } catch (e) {
    if (e instanceof BusinessError) throw e;
    throw new BusinessError("Invalid JSON request");
  }
}

export async function audit(actor: string, action: string, target: string) {
  await db()
    .prepare("INSERT INTO audit_logs (id,actor,action,target) VALUES (?,?,?,?)")
    .bind(crypto.randomUUID(), actor, action, target)
    .run();
}
export async function saveProduct(p: any, actor: string) {
  validateProduct(p);
  const {recipeMeasurements,recipeSuggestion,...stored}=p;
  const d = db();
  if(Object.hasOwn(p,'recipeOverride'))stored.recipeOverride=cleanRecipeOverride(p.recipeOverride,menuRecipe(p.id,p.name));
  else{
    const previous=await d.prepare('SELECT data FROM products WHERE id=?').bind(p.id).first<any>();
    const custom=previous?JSON.parse(previous.data).recipeOverride:null;
    stored.recipeOverride=recipeOverrideError(custom)?null:cleanRecipeOverride(custom,menuRecipe(p.id,p.name));
  }
  assert(
    await d
      .prepare("SELECT id FROM categories WHERE id=?")
      .bind(p.categoryId)
      .first(),
    "Choose an existing category",
  );
  await d
    .prepare(
      "INSERT INTO products (id,name,category_id,price,inventory,available,archived,data) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category_id=excluded.category_id,price=excluded.price,inventory=excluded.inventory,available=excluded.available,archived=excluded.archived,data=excluded.data,updated_at=CURRENT_TIMESTAMP",
    )
    .bind(
      p.id,
      p.name,
      p.categoryId,
      p.price,
      p.inventory,
      p.available ? 1 : 0,
      p.archived ? 1 : 0,
      JSON.stringify(stored),
    )
    .run();
  await audit(actor, "product.save", p.id);
}
export async function orderList(
  userId?: string,
  offset = 0,
  search = "",
  status = "",
) {
  const d = db();
  const where: string[] = [visibleSubscriptionOrders()];
  const params: any[] = [];
  if (userId) {
    where.push("user_id=?");
    params.push(userId);
  }
  if (search) {
    where.push("(id LIKE ? OR contact LIKE ?)");
    params.push("%" + search + "%", "%" + search + "%");
  }
  if (status && status !== "all") {
    where.push("status=?");
    params.push(status);
  }
  const rows = await d
    .prepare(
      "SELECT * FROM orders" +
        (where.length ? " WHERE " + where.join(" AND ") : "") +
        " ORDER BY created_at DESC,rowid DESC LIMIT 50 OFFSET ?",
    )
    .bind(...params, offset)
    .all<any>();
  if (!rows.results.length) return [];
  const ids = rows.results.map((o: any) => o.id);
  const placeholders = ids.map(() => "?").join(",");
  const [items, events, payments] = await d.batch([
    d.prepare(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`).bind(...ids),
    d.prepare(`SELECT order_id,status,created_at FROM order_events WHERE order_id IN (${placeholders}) ORDER BY created_at,rowid`).bind(...ids),
    d.prepare(`SELECT order_id,method FROM payments WHERE order_id IN (${placeholders}) ORDER BY created_at,rowid`).bind(...ids),
  ]);
  const byOrder = (records: any[]) => {
    const grouped = new Map<string, any[]>();
    for (const record of records) {
      const group = grouped.get(record.order_id) || [];
      group.push(record); grouped.set(record.order_id, group);
    }
    return grouped;
  };
  const itemGroups = byOrder(items.results), eventGroups = byOrder(events.results);
  const paymentMethods = new Map(payments.results.map((p: any) => [p.order_id, p.method]));
  return rows.results.map((o: any) => ({
    ...o, contact: JSON.parse(o.contact),
    collection_method: paymentMethods.get(o.id) || null,
    items: (itemGroups.get(o.id) || []).map((i: any) => ({...i,selections: JSON.parse(i.selections)})),
    events: eventGroups.get(o.id) || [],
  }));
}
export async function placeOrder(b: any, user: any) {
  const d = db();
  const key = text(b.idempotencyKey, 100, true);
  const existing = await d
    .prepare("SELECT id,user_id FROM orders WHERE idempotency_key=?")
    .bind(key)
    .first<any>();
  if (existing) {
    assert(existing.user_id === user.userId, "Invalid checkout request", 409);
    return { id: existing.id, repeated: true };
  }
  const cat = await catalog();
  const quote = await subscriberQuote(d,user,priceCart(
    b.items,
    cat.products,
    cat.categories,
    cat.settings,
    text(b.code || "", 40),
    b.fulfillment,
  ),cat.settings);
  assert(
    b.expectedTotal === quote.total,
    "Your order total changed. Review the refreshed total and try again.",
    409,
  );
  const contact = {
    name: text(b.contact?.name, 100, true),
    phone: text(b.contact?.phone, 25, true),
    email: user.email,
    address: text(b.contact?.address || "", 1000),
    notes: text(b.contact?.notes || "", 500),
  };
  assert(/^[+\d ()-]{7,25}$/.test(contact.phone), "Enter a valid phone number");
  if (b.fulfillment === "delivery")
    assert(contact.address.length >= 10, "Enter a complete delivery address");
  assert(
    (b.paymentMethod === "stripe_test" && (env as any).PAYMENT_PROVIDER === "stripe" && quote.currency === "INR" && quote.total >= stripeTestConfig(env).minimumAmount) ||
    (b.paymentMethod === "pay_at_pickup" && b.fulfillment === "pickup") ||
    (b.paymentMethod === "pay_at_counter" && b.fulfillment === "dine_in") ||
      (b.paymentMethod === "cash_on_delivery" && b.fulfillment === "delivery"),
    "Select an available payment method",
  );
  const id = "CH-" + crypto.randomUUID().slice(0, 8).toUpperCase();
  const statements = [
    d
      .prepare(
        "INSERT INTO orders (id,user_id,idempotency_key,fulfillment,subtotal,tax,discount,fee,total,currency,contact) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        user.userId,
        key,
        b.fulfillment,
        quote.subtotal,
        quote.tax,
        quote.discount,
        quote.fee,
        quote.total,
        quote.currency,
        JSON.stringify(contact),
      ),
  ];
  for (const pid of new Set(quote.items.map((i) => i.productId))) {
    const p = cat.products.find((p) => p.id === pid)!;
    const qty = quote.items
      .filter((i) => i.productId === pid)
      .reduce((s, i) => s + i.quantity, 0);
    statements.push(
      d
        .prepare(
          "UPDATE products SET inventory=CASE WHEN price=? AND data=? AND available=1 AND archived=0 AND EXISTS(SELECT 1 FROM categories WHERE id=products.category_id AND enabled=1) THEN CASE WHEN inventory IS NULL THEN NULL ELSE inventory-? END ELSE -1 END WHERE id=?",
        )
        .bind(p.price, p._raw, qty, pid),
    );
  }
  for (const item of quote.items)
    statements.push(
      d
        .prepare(
          "INSERT INTO order_items (id,order_id,product_id,name,quantity,unit_price,selections,instructions) VALUES (?,?,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          id,
          item.productId,
          item.name,
          item.quantity,
          item.unitPrice,
          JSON.stringify(item.selections),
          item.instructions,
        ),
    );
  statements.push(
    d
      .prepare(
        "INSERT INTO order_events (id,order_id,status,actor) VALUES (?,?,?,?)",
      )
      .bind(crypto.randomUUID(), id, "pending", user.userId),
  );
  statements.push(
    d.prepare("DELETE FROM carts WHERE user_id=?").bind(user.userId),
  );
  statements.push(
    d
      .prepare(
        "INSERT INTO profiles (id,email,name,phone) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,phone=excluded.phone",
      )
      .bind(user.userId, user.email, contact.name, contact.phone),
  );
  try {
    await d.batch(statements);
  } catch (error) {
    const already = await d
      .prepare("SELECT id FROM orders WHERE idempotency_key=? AND user_id=?")
      .bind(key, user.userId)
      .first<any>();
    if (already) return { id: already.id, repeated: true };
    console.error("Order transaction failed", error);
    throw new BusinessError(
      "The menu or stock changed. Refresh your cart and try again.",
      409,
    );
  }
  return { id, ...quote, status: "pending", paymentStatus: "unpaid" };
}
export async function updateStatus(id: string, status: string, user: any) {
  const d = db();
  const order = await d
    .prepare("SELECT * FROM orders WHERE id=?")
    .bind(id)
    .first<any>();
  assert(order, "Order not found", 404);
  if (!user.admin) {
    assert(order.user_id === user.userId, "Order not found", 404);
    const c = await catalog();
    assert(
      c.settings.cancelPending &&
        order.status === "pending" &&
        status === "cancelled",
      "This order can no longer be cancelled",
      403,
    );
  }
  if (status === "cancelled")
    assert(
      order.payment_status === "unpaid",
      "Paid orders require a refund integration before cancellation",
      409,
    );
  validTransition(order.status, status, order.fulfillment);
  const stmts = [
    d
      .prepare(
        "UPDATE orders SET status=? WHERE id=? AND status=? AND (? != 'cancelled' OR payment_status='unpaid')",
      )
      .bind(status, id, order.status, status),
    d
      .prepare(
        "INSERT INTO order_events (id,order_id,status,actor) SELECT ?,?,?,? WHERE changes()=1",
      )
      .bind(crypto.randomUUID(), id, status, user.userId),
  ];
  if (status === "cancelled") {
    const items = await d
      .prepare(
        "SELECT product_id,SUM(quantity) AS qty FROM order_items WHERE order_id=? GROUP BY product_id",
      )
      .bind(id)
      .all<any>();
    const eventId = crypto.randomUUID();
    stmts[1] = d
      .prepare(
        "INSERT INTO order_events (id,order_id,status,actor) SELECT ?,?,?,? WHERE changes()=1",
      )
      .bind(eventId, id, status, user.userId);
    for (const i of items.results)
      stmts.push(
        d
          .prepare(
            "UPDATE products SET inventory=CASE WHEN inventory IS NULL THEN NULL ELSE inventory+? END WHERE id=? AND EXISTS(SELECT 1 FROM order_events WHERE id=?)",
          )
          .bind(i.qty, i.product_id, eventId),
      );
  }

  const result = await d.batch(stmts);
  assert(
    result[0].meta.changes === 1,
    "Order changed. Refresh and try again.",
    409,
  );
  await audit(user.userId, "order." + status, id);
  return { ok: true };
}
