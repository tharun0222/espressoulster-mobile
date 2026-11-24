import {sendOrderPush} from './order-push';
import {applyPriceRelease} from './price-release';
import {isSameOriginRequest} from './request-origin';
import {isCafeTableConflict,tableUnavailableMessage} from './cafe-table-manager';
import {paysAtCafe} from './order-payment';
import {cafeOffDutyMessage} from './cafe-order-intake';
import {orderPlacementStatements,reserveOrderStock} from './order-placement';
import {ensureSeedOnce} from './seed-once';
import {menuRecipe} from './menu-recipe';
import {cleanRecipeOverride,recipeOverrideError,resolveProductRecipe} from './product-recipe';
import {visibleSubscriptionOrders} from './visible-subscription-orders';
import {subscriberQuote} from './subscriber-discount';
import {hostedPaymentConfig} from './sandbox-config';
import {hostedPaymentMethod, isSandboxPayment, type CheckoutMode, type SandboxProvider} from './sandbox-checkout';
import {readPinSession,readStaffPinSession,pinReady,pinToken,staffPinCookie} from './pin-auth-core';
import {canSeeStaffPanel,staffRole} from './staff-panel-access';
import {passwordAdmin} from "./admin-auth";
import {androidAdminAccess,androidAdminRequired,localStaffPreview,requireAndroidAdmin,staffOtpRequired,staffPhoneAuthRequired,staffOtpDeviceIndependent} from "./android-admin-access";
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
  await ensureSeedOnce(d,async()=>{
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
  await applyPriceRelease(d, env.CATALOG_PRICE_RELEASE);
}
export async function cafeAcceptingOrders() {
  const row = await db().prepare("SELECT data FROM settings WHERE id='order-intake'").first<{data:string}>();
  return row?.data !== "false";
}

function storeSettings(data?: string) {
  const saved = JSON.parse(data || "{}");
  if (saved.brand === "My Coffee House") saved.brand = defaultSettings.brand;
  if (!saved.address?.trim()) saved.address = defaultSettings.address;
  return { ...defaultSettings, ...saved, testMode: (env as any).PUBLIC_TEST_MODE === "true" };
}

export async function cartCatalog(lines: unknown) {
  assert(Array.isArray(lines) && lines.length > 0 && lines.length <= 100, "Your cart is empty or too large");
  const productIds = [...new Set(lines.map(line => {
    assert(line && typeof line.productId === "string", "Invalid cart item");
    return line.productId;
  }))];
  const d = db();
  const [products, settings] = await d.batch([
    d.prepare(`SELECT p.*,c.enabled AS category_enabled FROM products p
      LEFT JOIN categories c ON c.id=p.category_id
      WHERE p.archived=0 AND p.id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(productIds)),
    d.prepare("SELECT data FROM settings WHERE id='store'"),
  ]);
  return {
    products: products.results.map((row: any) => ({
      ...JSON.parse(row.data), id: row.id, name: row.name, categoryId: row.category_id, price: row.price,
      inventory: row.inventory, available: !!row.available, archived: !!row.archived, _raw: row.data,
    })),
    categories: products.results.map((row: any) => ({ id: row.category_id, enabled: !!row.category_enabled })),
    settings: storeSettings((settings.results[0] as { data: string } | undefined)?.data),
  };
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
  const settings = storeSettings(s?.data);
  const storedProducts = p.results.map((row: any) => ({row, stored: JSON.parse(row.data)}));
  return {
    products: storedProducts.filter(({stored}) => admin || settings.testMode || !stored.testPrice).map(({row: r, stored}) => {
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
    settings,
  };
}
export async function identity(required = false, administrator = false) {
  // Admin cookies must not replace a customer identity after an external payment redirect.
  if (administrator) {
    const passwordUser = await passwordAdmin();
    if (passwordUser) return passwordUser;
  }
  if (!administrator && (env as any).CUSTOMER_AUTH_MODE === 'pin') {
    const profile=pinReady(env)?await readPinSession(db(),(await headers()).get('cookie'),undefined,env.STAFF_ONLY_PHONES):null;
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
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');
  await requireAndroidAdmin(cookie);
  const host = requestHeaders.get('host');
  const localStaff = localStaffPreview(host);
  const otpOnly = staffOtpRequired(host);
  const staffPhoneAuth = staffPhoneAuthRequired(host);
  if (!staffOtpDeviceIndependent() && staffPhoneAuth && !localStaff && !androidAdminRequired()) {
    assert(await androidAdminAccess(cookie), "Open Café Admin in the Espressoulster Android app.", 403);
  }
  if (androidAdminRequired() || localStaff || staffPhoneAuth || (pinToken(cookie,staffPinCookie) && await androidAdminAccess(cookie))) {
    const profile = await readStaffPinSession(db(),cookie,otpOnly);
    assert(profile, "Staff sign-in is required", 403);
    const account = await db().prepare('SELECT phone FROM pin_accounts WHERE user_id=?').bind(profile.id).first<{phone:string}>();
    const phone=account?.phone;
    const staffAccess = staffRole(phone, env);
    assert(staffAccess, "Staff access is unavailable for this number",403);
    return {userId:profile.id,email:profile.email,fullName:profile.name,displayName:profile.name,
      phoneVerified:false,authProvider:'staff-pin',admin:true,profile,staffAccess,
      staffDutyAccess:canSeeStaffPanel(phone, env.STAFF_DUTY_PHONES)};
  }
  const passwordUser = await passwordAdmin();
  if (passwordUser) return passwordUser;
  assert((env as any).ADMIN_PASSWORD_LOGIN_ONLY !== "true", "Administrator login is required", 403);
  const u = await identity(false, true);
  assert(u?.admin, "Administrator access is required", 403);
  return u!;
}

export function canManageStaffOrders(user: object) {
  return !("staffAccess" in user) || user.staffAccess === "operator";
}
export function canManageStaffDuty(user: object) {
  return canManageStaffOrders(user) || ("staffDutyAccess" in user && user.staffDutyAccess === true);
}
export function mutationGuard(req: Request) {
  // Next's custom server may normalize Request.url to localhost. Match the
  // configured public origin plus the validated Host on self-hosted requests.
  assert(
    isSameOriginRequest(req, process.env.APP_RUNTIME === 'selfhost' ? process.env.PAYMENT_APP_ORIGIN : undefined),
    "Cross-origin request rejected",
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
    where.push("(lower(id) LIKE lower(?) OR lower(order_number) LIKE lower(?) OR lower(contact) LIKE lower(?))");
    const pattern = "%" + search + "%";
    params.push(pattern, pattern, pattern);
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
    d.prepare(`SELECT order_id,method,created_at FROM payments WHERE order_id IN (${placeholders}) ORDER BY created_at,rowid`).bind(...ids),
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
  const paidTimes = new Map(payments.results.map((p: any) => [p.order_id, p.created_at]));
  return rows.results.map((o: any) => ({
    ...o, contact: JSON.parse(o.contact),
    collection_method: paymentMethods.get(o.id) || null,
    timer_started_at: ["stripe_test", "cashfree_test", "cashfree", "phonepe", "razorpay_test"].includes(String(paymentMethods.get(o.id))) ? paidTimes.get(o.id) || o.created_at : o.created_at,
    items: (itemGroups.get(o.id) || []).map((i: any) => ({...i,selections: JSON.parse(i.selections)})),
    events: eventGroups.get(o.id) || [],
  }));
}
export async function placeOrder(b: any, user: any) {
  const d = db();
  const key = text(b.idempotencyKey, 100, true);
  const prepaid = isSandboxPayment(b.paymentMethod) || b.paymentMethod === "cashfree";
  const gateway = prepaid ? hostedPaymentConfig(env) : null;
  const pending = await d.prepare("SELECT id,user_id,state,provider,mode FROM prepaid_checkouts WHERE idempotency_key=?")
    .bind(key).first<{id:string;user_id:string;state:string;provider:SandboxProvider;mode:CheckoutMode}>();
  if (pending) {
    assert(pending.user_id === user.userId && b.paymentMethod === hostedPaymentMethod(pending.provider, pending.mode), "Invalid checkout request", 409);
    assert(pending.state !== "expired", "This checkout expired. Start a new checkout.", 409);
    return { id: pending.id, checkoutPending: true, repeated: true };
  }
  const existing = await d
    .prepare("SELECT id,user_id,order_number FROM orders WHERE idempotency_key=?")
    .bind(key)
    .first<any>();
  if (existing) {
    assert(existing.user_id === user.userId, "Invalid checkout request", 409);
    return { id: existing.id, order_number: existing.order_number, repeated: true };
  }
  assert(await cafeAcceptingOrders(), cafeOffDutyMessage, 409);
  const cat = await cartCatalog(b.items);
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
  const table = b.fulfillment === "dine_in" ? b.contact?.table : undefined;
  if (table != null && table !== "") {
    assert(typeof table === "string" && /^T[0-9]{2}$/.test(table), "This table number is invalid.");
    const availableTable = await d.prepare("SELECT id FROM cafe_tables WHERE id=? AND enabled=1").bind(table).first();
    assert(availableTable, "This table is unavailable. Ask the café for your table number.", 409);
  }
  const contact = {
    ...(table ? { table } : {}),
    name: text(b.contact?.name, 100, true),
    phone: text(b.contact?.phone, 25, true),
    email: user.email,
    address: text(b.contact?.address || "", 1000),
    notes: text(b.contact?.notes || "", 500),
  };
  assert(/^[+\d ()-]{7,25}$/.test(contact.phone), "Enter a valid phone number");
  if (gateway?.mode === "live") {
    assert(/^(?:\+91)?[6-9]\d{9}$/.test(contact.phone.replace(/[\s()-]/g, "")), "Enter a valid Indian mobile number for online payment.");
  }
  if (b.fulfillment === "delivery")
    assert(contact.address.length >= 10, "Enter a complete delivery address");
  assert(
    (gateway && b.paymentMethod === gateway.method && quote.currency === "INR" && quote.total >= gateway.minimumAmount) ||
    (b.paymentMethod === "pay_at_pickup" && b.fulfillment === "pickup") ||
    (b.paymentMethod === "pay_at_counter" && b.fulfillment === "dine_in") ||
      (b.paymentMethod === "cash_on_delivery" && b.fulfillment === "delivery"),
    "Select an available payment method",
  );
  const id = "CH-" + crypto.randomUUID().slice(0, 8).toUpperCase();
  const { holds, statements: stock } = reserveOrderStock(d, quote.items, cat.products);
  let orderNumber: string;
  try {
    if (gateway) {
      const checkoutId = "PC-" + crypto.randomUUID().replaceAll("-", "").toUpperCase();
      await d.batch([
        d.prepare(`INSERT INTO prepaid_checkouts (id,order_id,user_id,idempotency_key,fulfillment,total,currency,contact,quote,cart_snapshot,stock_holds,provider,mode)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(checkoutId, id, user.userId, key, b.fulfillment, quote.total, quote.currency,
            JSON.stringify(contact), JSON.stringify(quote), JSON.stringify(b.items), JSON.stringify(holds), gateway.provider, gateway.mode),
        ...stock,
      ]);
      return { id: checkoutId, checkoutPending: true };
    }
    const statements = orderPlacementStatements(d, {
      id, userId: user.userId, key, fulfillment: b.fulfillment, paymentMethod: b.paymentMethod,
      quote, contact, openingTime: cat.settings.orderDayOpeningTime,
    });
    const [, saved] = await d.batch<{order_number:string}>([...statements, ...stock]);
    orderNumber = saved.results[0].order_number;
  } catch (error) {
    if (gateway) {
      const checkout = await d.prepare("SELECT id FROM prepaid_checkouts WHERE idempotency_key=? AND user_id=? AND provider=? AND mode=? AND state!='expired'")
        .bind(key, user.userId, gateway.provider, gateway.mode).first<{id:string}>();
      if (checkout) return { id: checkout.id, checkoutPending: true, repeated: true };
    }
    const already = await d
      .prepare("SELECT id,order_number FROM orders WHERE idempotency_key=? AND user_id=?")
      .bind(key, user.userId)
      .first<any>();
    if (already) return { id: already.id, order_number: already.order_number, repeated: true };
    if (String(error).includes("CAFE_OFF_DUTY")) throw new BusinessError(cafeOffDutyMessage, 409);
    if (String(error).includes("CHECKOUT_KEY_ALREADY_USED")) throw new BusinessError("A checkout is already open for this request.", 409);
    if (isCafeTableConflict(error)) throw new BusinessError(tableUnavailableMessage, 409);
    console.error("Order transaction failed", error);
    throw new BusinessError(
      "The menu or stock changed. Refresh your cart and try again.",
      409,
    );
  }
  return { id, order_number: orderNumber, ...quote, status: "pending", paymentStatus: "unpaid" };
}
export async function updateStatus(id: string, status: string, user: any, selectedTable?: unknown) {
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
  const acceptingDineIn = status === "confirmed" && order.fulfillment === "dine_in";
  const contact = JSON.parse(order.contact);
  if (selectedTable !== undefined)
    assert(acceptingDineIn, "A table can be selected only when accepting a dine-in order.");
  const table = acceptingDineIn ? selectedTable ?? contact.table : null;
  if (acceptingDineIn)
    assert(typeof table === "string" && /^T[0-9]{2}$/.test(table), "Choose a table before accepting this dine-in order.", 409);
  const needsCafePayment = status === "completed" && paysAtCafe(order);
  assert(!needsCafePayment || order.payment_status === "paid", "Record collected payment before completing this order.", 409);
  const statusUpdate = acceptingDineIn && typeof table === "string"
    ? d.prepare(`UPDATE orders SET status=?,contact=json_set(contact,'$.table',?)
        WHERE id=? AND status=? RETURNING id`)
      .bind(status, table, id, order.status)
    : d.prepare(
        "UPDATE orders SET status=? WHERE id=? AND status=? AND (? != 'cancelled' OR payment_status='unpaid') AND (?=0 OR payment_status='paid') RETURNING id",
      ).bind(status, id, order.status, status, needsCafePayment ? 1 : 0);
  const stmts = [
    statusUpdate,
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

  const result = await d.batch<{id:string}>(stmts);
  assert(
    result[0].results.length === 1,
    acceptingDineIn
      ? "That table is unavailable or this order has changed. Refresh and try again."
      : "Order changed. Refresh and try again.",
    409,
  );
  await audit(user.userId, "order." + status, id);

  try {
    await sendOrderPush(d, env, { ...order, status, contact: acceptingDineIn ? { ...contact, table } : contact });
  } catch { console.warn("Order notification could not be delivered"); }
  return { ok: true };
}
