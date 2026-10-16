import {subscriptionPlans} from '../../../lib/subscription-plans';
import {createSubscriptionRedemption,RedemptionError} from "../../../lib/subscription-redemption";
import {subscriptionTestEnabled,syncTestSubscription,createTestSubscriptionOrder} from "../../../lib/subscription-test";
import {subscriberQuote} from "../../../lib/subscriber-discount";
import {stripeWebhook} from "../../../lib/stripe-payments";
import {pinAuth} from "../../../lib/pin-auth";
import {PinAuthError} from "../../../lib/pin-auth-core";
import {restorePreviousPrices} from "../../../lib/restore-prices";
import {adminAuth} from "../../../lib/admin-auth";
import {phoneAuth} from "../../../lib/phone-auth";
import {testerCookie,testerName,testerToken,hashTesterToken} from "../../../lib/tester-auth";
import {simulatePayment} from "../../../lib/test-payment";
import { subscriptionSummary } from "../../../lib/subscription-calculations";
import { onlinePaymentRoute, paymentWebhook } from "../../../lib/online-payments";
import { PaymentError } from "../../../lib/payment-security";
import { env } from "cloudflare:workers";
import {
  json,
  db,
  seed,
  catalog,
  identity,
  adminIdentity,
  mutationGuard,
  body,
  limitedBytes,
  audit,
  saveProduct,
  orderList,
  placeOrder,
  updateStatus,
} from "../../../lib/server";
import {
  assert,
  BusinessError,
  text,
  whole,
  priceCart,
  validateProduct,
} from "../../../lib/pricing";
export const dynamic = "force-dynamic";
async function handle(req: Request) {
  try {
    const url = new URL(req.url),
      path = url.pathname.slice(5),
      method = req.method,
      d = db();
    if (path === "payments/stripe/webhook" && method === "POST") return await stripeWebhook(req);
    if (path === "payments/webhook" && method === "POST") return await paymentWebhook(req);
    if (method !== "GET") mutationGuard(req);
    if(path.startsWith("auth/admin/")) return await adminAuth(path,req);
    if(path.startsWith("auth/pin/")) return await pinAuth(path,req);
    if(path.startsWith("auth/phone/")) {
      if((env as any).CUSTOMER_AUTH_MODE==='pin'&&!path.endsWith('/logout'))return json({error:'OTP sign-in has been replaced by mobile number and PIN.'},410);
      return await phoneAuth(path,req);
    }
    if (path === "tester-session" || path === "tester-session/logout") {
      assert((env as any).CUSTOMER_AUTH_MODE!=='pin'||path.endsWith('/logout'),'Sign in with your mobile number and PIN',410);
      assert((env as any).PUBLIC_TEST_MODE === "true", "Tester login is disabled", 404);
      assert(method === "POST", "Unsupported method", 405);
      const suffix = `; Path=/; HttpOnly; SameSite=Lax${url.protocol === "https:" ? "; Secure" : ""}`;
      if(path.endsWith("/logout")) {
        const token=testerToken(req.headers.get("cookie"));
        if(token) await d.prepare("DELETE FROM tester_sessions WHERE token_hash=?").bind(await hashTesterToken(token)).run();
        return Response.json({ok:true},{headers:{"Set-Cookie":`${testerCookie}=; Max-Age=0${suffix}`,"Cache-Control":"no-store"}});
      }
      const input=await body(req);let name:string;
      try{name=testerName(input.name)}catch{throw new BusinessError("Enter a name between 2 and 60 characters")}
      const now=Math.floor(Date.now()/1000),ip=await hashTesterToken(req.headers.get("cf-connecting-ip")||"local");
      const count=await d.prepare("SELECT COUNT(*) AS n FROM tester_sessions WHERE ip_hash=? AND created_at>?").bind(ip,now-3600).first<any>();
      assert(count.n<120,"Too many tester sessions. Please try again later",429);
      const token=crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");
      const id="tester-"+crypto.randomUUID();
      await d.batch([
        d.prepare("INSERT INTO profiles(id,email,name,phone) VALUES(?,?,?,'')").bind(id,id+"@tester.invalid",name),
        d.prepare("INSERT INTO tester_sessions(token_hash,user_id,expires_at,created_at,ip_hash) VALUES(?,?,?,?,?)").bind(await hashTesterToken(token),id,now+604800,now,ip)
      ]);
      return Response.json({ok:true},{headers:{"Set-Cookie":`${testerCookie}=${token}; Max-Age=604800${suffix}`,"Cache-Control":"no-store"}});
    }
    if (path === "bootstrap" && method === "GET") {
      await seed();
      const [c, u] = await Promise.all([catalog(), identity()]);
      return json({ ...c, settings: {...c.settings, testMode:(env as any).PUBLIC_TEST_MODE === "true"}, user: u, authentication: (env as any).CUSTOMER_AUTH_MODE === "pin" ? "pin" : "chatgpt" });
    }
    if (path.startsWith("images/") && method === "GET") {
      assert(env.BUCKET, "Image storage unavailable", 503);
      const id = path.slice(7);
      assert(/^[a-zA-Z0-9.-]+$/.test(id), "Invalid image");
      const obj = await env.BUCKET.get(id);
      assert(obj, "Image not found", 404);
      return new Response(obj.body, {
        headers: {
          "Content-Type":
            obj.httpMetadata?.contentType || "application/octet-stream",
          "Cache-Control": "public,max-age=86400",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'",
        },
      });
    }
    const user = path.startsWith("admin/") ? await adminIdentity() : await identity(true);
    assert(user, "Please sign in", 401);
    if (path.startsWith("test-payments/")) {
      const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || (env as any).PUBLIC_TEST_MODE === "true";
      if (path === "test-payments/config" && method === "GET") return json({enabled:local,testOnly:true});
      assert(local, "Test gateway is disabled", 404);
      assert(method === "POST", "Unsupported method", 405);
      const order = await d.prepare("SELECT id,total,currency,status,payment_status FROM orders WHERE id=? AND user_id=?").bind(path.slice("test-payments/".length),user.userId).first<any>();
      assert(order, "Order not found", 404);
      const input = await body(req);
      // Simulation only: never insert receipts, grant credits or change orders.
      return json({...simulatePayment(order,input.outcome),testReference:"TEST-"+crypto.randomUUID()});
    }
    if (path.startsWith("razorpay-test/")) throw new PaymentError("Razorpay testing has been disabled",410);
    if (path.startsWith("paypal-test/")) throw new PaymentError("PayPal has been removed",410);
    if (path.startsWith("payments/")) { const paymentResponse=await onlinePaymentRoute(path,req,user); if(paymentResponse) return paymentResponse; }
    if(path==='subscriptions/daily-code'&&method==='GET')return json(await createSubscriptionRedemption(d,env).status(user.userId));
    if(path==='subscriptions/daily-code'&&method==='POST')return json(await createSubscriptionRedemption(d,env).generate(user.userId));
    if (path === "subscriptions/config" && method === "GET") return json({testEnabled:subscriptionTestEnabled(env),plans:Object.values(subscriptionPlans)});
    if (path === "subscriptions/test-purchase" && method === "POST") {
      assert(subscriptionTestEnabled(env),"Sandbox subscriptions are unavailable",409);
      const input=await body(req);
      assert(input.planId===undefined||["weekly","monthly"].includes(input.planId),"Choose a valid plan");
      const id=await createTestSubscriptionOrder(d,user,input.planId||"weekly");
      return json({orderId:id,testOnly:true});
    }
    if (path === "subscriptions" && method === "GET") {
      await syncTestSubscription(d,env,user.userId);
      const result = await d.prepare(`SELECT s.id,s.plan_name AS planName,s.plan_id AS planId,(s.total_credits+s.bonus_credits) AS totalCredits,
        s.starts_at AS startsAt,s.expires_at AS expiresAt,s.revoked,p.amount AS amountPaid,
        COALESCE((SELECT SUM(r.credits) FROM coffee_redemptions r WHERE r.subscription_id=s.id AND r.reversed_at IS NULL),0) AS usedCredits
        FROM coffee_subscriptions s JOIN payments p ON p.id=s.payment_id
        JOIN orders o ON o.id=p.order_id
        WHERE s.user_id=? AND o.user_id=s.user_id AND o.payment_status='paid' AND o.status!='cancelled'
        AND p.amount>=159900 ORDER BY s.expires_at ASC`).bind(user.userId).all<any>();
      return json(subscriptionSummary(result.results.map(r=>({...r,revoked:!!r.revoked}))));
    }
    if (path === "cart") {
      if (method === "GET") {
        const c = await d
          .prepare("SELECT data FROM carts WHERE user_id=?")
          .bind(user.userId)
          .first<any>();
        return json({ items: JSON.parse(c?.data || "[]") });
      }
      if (method === "PUT") {
        const b = await body(req);
        assert(Array.isArray(b.items) && b.items.length <= 100, "Invalid cart");
        for (const i of b.items) {
          text(i.productId, 80, true);
          whole(i.quantity, 1, 99);
          text(i.instructions || "", 300);
          assert(
            Array.isArray(i.addonIds || []) && (i.addonIds || []).length <= 20,
            "Invalid add-ons",
          );
        }
        await d
          .prepare(
            "INSERT INTO carts (user_id,data) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=CURRENT_TIMESTAMP",
          )
          .bind(user.userId, JSON.stringify(b.items))
          .run();
        return json({ ok: true });
      }
    }
    if (path === "quote" && method === "POST") {
      const b = await body(req),
        c = await catalog();
      return json(
        await subscriberQuote(d,user,priceCart(
          b.items,
          c.products,
          c.categories,
          c.settings,
          b.code || "",
          b.fulfillment,
        ),c.settings),
      );
    }
    if (path === "orders") {
      if (method === "GET")
        return json({
          orders: await orderList(
            user.userId,
            whole(Number(url.searchParams.get("offset") || 0), 0, 1000000),
          ),
        });
      if (method === "POST")
        return json(await placeOrder(await body(req), user), 201);
    }
    if (path.startsWith("orders/") && method === "GET") {
      const id=path.slice(7);
      assert(/^CH-[A-F0-9]{8}$/.test(id),"Invalid order reference",400);
      const order=await d.prepare("SELECT id,status,fulfillment FROM orders WHERE id=? AND user_id=?").bind(id,user.userId).first();
      assert(order,"Order not found",404);
      return Response.json({order},{headers:{"Cache-Control":"no-store"}});
    }
    if (path.startsWith("orders/") && method === "PATCH") {
      const b = await body(req);
      return json(
        await updateStatus(path.slice(7), text(b.status, 30, true), user),
      );
    }
    if (path === "profile") {
      if (method === "GET") return json({ profile: user.profile });
      if (method === "PUT") {
        const b = await body(req);
        const avatar = b.avatar === undefined ? user.profile?.avatar || "" : text(b.avatar || "", 2000);
        if (avatar) {
          assert(/^\/api\/images\/[a-zA-Z0-9.-]+$/.test(avatar), "Please upload a profile photo");
          const owned = await d.prepare("SELECT id FROM uploads WHERE id=? AND user_id=?").bind(avatar.slice(12), user.userId).first();
          assert(owned, "Choose a photo uploaded by your account", 403);
        }
        await d
          .prepare(
            "INSERT INTO profiles (id,email,name,phone,avatar) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,phone=excluded.phone,avatar=excluded.avatar",
          )
          .bind(
            user.userId,
            user.email,
            text(b.name, 100, true),
            text(b.phone || "", 25),
            avatar,
          )
          .run();
        return json({ ok: true });
      }
    }
    if (path === "addresses") {
      if (method === "GET")
        return json({
          addresses: (
            await d
              .prepare("SELECT id,data FROM addresses WHERE user_id=?")
              .bind(user.userId)
              .all<any>()
          ).results.map((a) => ({ id: a.id, ...JSON.parse(a.data) })),
        });
      if (method === "POST") {
        const b = await body(req),
          id = crypto.randomUUID();
        const data = {
          label: text(b.label, 50, true),
          address: text(b.address, 1000, true),
        };
        await d
          .prepare("INSERT INTO addresses (id,user_id,data) VALUES (?,?,?)")
          .bind(id, user.userId, JSON.stringify(data))
          .run();
        return json({ id, ...data }, 201);
      }
    }
    if (path.startsWith("addresses/") && method === "DELETE") {
      await d
        .prepare("DELETE FROM addresses WHERE id=? AND user_id=?")
        .bind(path.slice(10), user.userId)
        .run();
      return json({ ok: true });
    }
    if (path === "favorites") {
      if (method === "GET")
        return json({
          ids: (
            await d
              .prepare("SELECT product_id FROM favorites WHERE user_id=?")
              .bind(user.userId)
              .all<any>()
          ).results.map((r) => r.product_id),
        });
      if (method === "POST") {
        const b = await body(req),
          id = text(b.productId, 80, true);
        assert(
          await d
            .prepare("SELECT id FROM products WHERE id=?")
            .bind(id)
            .first(),
          "Product not found",
        );
        if (b.remove)
          await d
            .prepare("DELETE FROM favorites WHERE user_id=? AND product_id=?")
            .bind(user.userId, id)
            .run();
        else
          await d
            .prepare(
              "INSERT OR IGNORE INTO favorites (id,user_id,product_id) VALUES (?,?,?)",
            )
            .bind(crypto.randomUUID(), user.userId, id)
            .run();
        return json({ ok: true });
      }
    }
    if (path === "suggestions") {
      if (method === "GET")
        return json({
          suggestions: (
            await d
              .prepare(
                "SELECT * FROM suggestions WHERE user_id=? ORDER BY created_at DESC",
              )
              .bind(user.userId)
              .all<any>()
          ).results.map((r) => ({ ...r, ...JSON.parse(r.data) })),
        });
      if (method === "POST") {
        const b = await body(req),
          id = crypto.randomUUID(),
          data = {
            name: text(b.name, 150, true),
            category: text(b.category || "", 100),
            description: text(b.description || "", 2000),
            notes: text(b.notes || "", 1000),
            image: text(b.image || "", 300),
          };
        assert(
          !data.image || data.image.startsWith("/api/images/"),
          "Upload a reference image",
        );
        await d
          .prepare("INSERT INTO suggestions (id,user_id,data) VALUES (?,?,?)")
          .bind(id, user.userId, JSON.stringify(data))
          .run();
        return json({ id, status: "pending" }, 201);
      }
    }
    if (path === "upload" && method === "POST") {
      assert(env.BUCKET, "Image storage is unavailable", 503);
      assert(
        Number(req.headers.get("content-length") || 0) <= 5500000,
        "Maximum image size is 5 MB",
        413,
      );
      const bytes = await limitedBytes(req, 5500000);
      const copy = new Request(req.url, {
        method: "POST",
        headers: { "Content-Type": req.headers.get("content-type") || "" },
        body: bytes,
      });
      const form = await copy.formData(),
        file = form.get("file");
      assert(
        file instanceof File && file.size > 0 && file.size <= 5000000,
        "Choose an image under 5 MB",
      );
      const data = await file.arrayBuffer(),
        v = new Uint8Array(data);
      const mime =
        v[0] === 137 && v[1] === 80 && v[2] === 78 && v[3] === 71
          ? "image/png"
          : v[0] === 255 && v[1] === 216 && v[2] === 255
            ? "image/jpeg"
            : String.fromCharCode(...v.slice(0, 4)) === "RIFF" &&
                String.fromCharCode(...v.slice(8, 12)) === "WEBP"
              ? "image/webp"
              : "";
      assert(
        mime && mime === file.type,
        "Only valid PNG, JPEG, and WebP images are accepted",
      );
      if (mime === "image/png") {
        assert(
          v.length >= 33 &&
            [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => v[i] === n) &&
            String.fromCharCode(...v.slice(12, 16)) === "IHDR",
          "Invalid PNG image",
        );
        const view = new DataView(data);
        assert(
          view.getUint32(16) > 0 &&
            view.getUint32(16) <= 8192 &&
            view.getUint32(20) > 0 &&
            view.getUint32(20) <= 8192,
          "Image dimensions are too large",
        );
      } else if (mime === "image/jpeg")
        assert(
          v.length >= 20 && v[v.length - 2] === 255 && v[v.length - 1] === 217,
          "Invalid JPEG image",
        );
      else
        assert(
          v.length >= 20 && String.fromCharCode(...v.slice(12, 15)) === "VP8",
          "Invalid WebP image",
        );
      const id = crypto.randomUUID();
      await env.BUCKET.put(id, data, { httpMetadata: { contentType: mime } });
      await d
        .prepare("INSERT INTO uploads (id,user_id,mime,size) VALUES (?,?,?,?)")
        .bind(id, user.userId, mime, file.size)
        .run();
      return json({ url: "/api/images/" + id }, 201);
    }
    if (path.startsWith("admin/")) {
      const user = await adminIdentity();
      const part = path.slice(6);
      if(part==='subscriptions/redeem'&&method==='POST')return json(await createSubscriptionRedemption(d,env).redeem(await body(req),user.userId));
      if (part === "subscriptions" && method === "GET") {
        await syncTestSubscription(d,env);
        const offset=whole(Number(url.searchParams.get("offset")||0),0,1000000);
        const base=`FROM coffee_subscriptions s JOIN payments p ON p.id=s.payment_id JOIN orders o ON o.id=p.order_id JOIN profiles c ON c.id=s.user_id WHERE o.user_id=s.user_id AND o.payment_status='paid' AND o.status!='cancelled'`;
        const count=await d.prepare(`SELECT COUNT(*) AS n ${base}`).first<any>();
        const rows=await d.prepare(`SELECT s.id,s.plan_name AS planName,s.plan_id AS planId,(s.total_credits+s.bonus_credits) AS totalCredits,s.starts_at AS startsAt,s.expires_at AS expiresAt,s.revoked,p.amount AS amountPaid,c.name AS customerName,c.phone AS customerPhone,COALESCE((SELECT SUM(r.credits) FROM coffee_redemptions r WHERE r.subscription_id=s.id AND r.reversed_at IS NULL),0) AS usedCredits ${base} ORDER BY s.created_at DESC,s.id LIMIT 50 OFFSET ?`).bind(offset).all<any>();
        const subscriptions=rows.results.map((r:any)=>({...subscriptionSummary([{...r,revoked:!!r.revoked}]).subscriptions[0],customerName:r.customerName,customerPhone:r.customerPhone}));
        return Response.json({subscriptions,total:count.n,hasMore:offset+subscriptions.length<count.n},{headers:{"Cache-Control":"no-store"}});
      }
      if (part === "orders" && method === "GET")
        return json({
          orders: await orderList(
            undefined,
            whole(Number(url.searchParams.get("offset") || 0), 0, 1000000),
            text(url.searchParams.get("q") || "", 150),
            text(url.searchParams.get("status") || "", 30),
          ),
        });
      const customerOrders = /^customers\/([^/]+)\/orders$/.exec(part);
      if (customerOrders && method === "GET") {
        const customerId = decodeURIComponent(customerOrders[1]);
        const offset = whole(Number(url.searchParams.get("offset") || 0), 0, 1000000);
        const customer = await d.prepare("SELECT id FROM profiles WHERE id=?").bind(customerId).first();
        assert(customer, "Customer not found", 404);
        const count = await d.prepare("SELECT COUNT(*) AS total FROM orders WHERE user_id=?").bind(customerId).first<any>();
        const orders = await orderList(customerId, offset);
        return json({orders, total: count.total, hasMore: offset + orders.length < count.total});
      }
      if (part === "overview" && method === "GET") {
        const paymentResponse = await onlinePaymentRoute("payments/config", req, user);
        const paymentConfig = paymentResponse ? await paymentResponse.json() : {enabled:false};
        const c = await catalog(true);
        const stats = await d
          .prepare(
            "SELECT COUNT(*) AS total,SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,SUM(CASE WHEN payment_status='paid' AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.order_id=orders.id AND p.method='stripe_test') THEN total ELSE 0 END) AS revenue FROM orders",
          )
          .first<any>();
        const bestSellers = (
          await d
            .prepare(
              "SELECT i.name,SUM(i.quantity) AS quantity FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.status!='cancelled' GROUP BY i.product_id,i.name ORDER BY quantity DESC LIMIT 5",
            )
            .all()
        ).results;
        return json({
          ...c,
          stats,
          bestSellers,
          paymentConfig,
          orders: await orderList(),
          customers: (
            await d
              .prepare(
                "SELECT p.id,p.email,p.name,p.phone,p.disabled,p.created_at,COALESCE(o.order_count,0) AS order_count FROM profiles p LEFT JOIN (SELECT user_id,COUNT(*) AS order_count FROM orders GROUP BY user_id) o ON o.user_id=p.id ORDER BY p.created_at DESC LIMIT 200",
              )
              .all()
          ).results,
          suggestions: (
            await d
              .prepare(
                "SELECT * FROM suggestions ORDER BY created_at DESC LIMIT 200",
              )
              .all<any>()
          ).results.map((r) => ({ ...r, ...JSON.parse(r.data) })),
          audit: (
            await d
              .prepare(
                "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100",
              )
              .all()
          ).results,
        });
      }
      if (part.startsWith("payments/") && method === "POST") {
        const id = part.slice(9),
          b = await body(req);
        const o = await d
          .prepare("SELECT * FROM orders WHERE id=?")
          .bind(id)
          .first<any>();
        assert(o && o.status !== "cancelled", "No eligible order found");
        assert(o.payment_status === "unpaid", "Payment already recorded", 409);
        const reference = text(b.reference, 150, true);
        const collectionMethod = text(b.collection_method || "cash", 20, true);
        assert(["cash", "upi", "card"].includes(collectionMethod), "Choose cash, UPI or card");
        const paymentId = crypto.randomUUID();
        const result = await d.batch([
          d
            .prepare(
              "INSERT INTO payments (id,order_id,amount,method,reference,verified_by) SELECT ?,id,total,?,?,? FROM orders WHERE id=? AND payment_status='unpaid' AND status!='cancelled'",
            )
            .bind(
              paymentId,
              collectionMethod,
              reference,
              user.userId,
              id,
            ),
          d
            .prepare(
              "UPDATE orders SET payment_status='paid' WHERE id=? AND EXISTS(SELECT 1 FROM payments WHERE id=?)",
            )
            .bind(id, paymentId),
        ]);
        assert(
          result[0].meta.changes === 1,
          "Order changed. Refresh before recording payment.",
          409,
        );
        await audit(user.userId, "payment.collected", id);
        return json({ ok: true });
      }
      const availabilityItem = /^products\/([^/]+)\/availability$/.exec(part);
      if (availabilityItem && method === "PATCH") {
        const id=decodeURIComponent(availabilityItem[1]), input=await body(req);
        assert(typeof input.available === "boolean", "Choose available or out of stock");
        const result=await d.prepare("UPDATE products SET available=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND archived=0 AND (?=0 OR (price IS NOT NULL AND (inventory IS NULL OR inventory>0)))").bind(input.available?1:0,id,input.available?1:0).run();
        assert(result.meta.changes===1, "Item cannot be made available. Check its price, stock and archive status.",409);
        await audit(user.userId,input.available?"product.available":"product.out_of_stock",id);
        return json({ok:true});
      }
      if (part === "products/restore-prices" && method === "POST") {
        const result = await restorePreviousPrices(d);
        await audit(user.userId, "products.prices_restored", result.restoredFrom);
        return json(result);
      }
      if (part === "products/test-price" && method === "POST") {
        const input = await body(req);
        assert(input.price === 100, "Temporary price must be ₹1");
        const backupId = "price-backup-" + crypto.randomUUID();
        const result = await d.batch([
          d.prepare("INSERT INTO settings(id,data) SELECT ?,json_group_array(json_object('id',id,'price',price)) FROM products").bind(backupId),
          d.prepare("UPDATE products SET price=100,data=json_set(data,'$.price',100),updated_at=CURRENT_TIMESTAMP"),
        ]);
        await audit(user.userId, "products.temporary_price", backupId);
        return json({ok:true,updated:result[1].meta.changes});
      }
      if (part === "products" && method === "POST") {
        const b = await body(req);
        await saveProduct(b, user.userId);
        return json({ ok: true });
      }
      if (part === "import" && method === "POST") {
        const b = await body(req);
        assert(
          Array.isArray(b.products) && b.products.length <= 500,
          "Import up to 500 products",
        );
        const cats = await d.prepare("SELECT id FROM categories").all<any>();
        const ids = new Set();
        for (const p of b.products) {
          validateProduct(p);
          assert(
            cats.results.some((c) => c.id === p.categoryId),
            "Unknown category: " + p.categoryId,
          );
          assert(!ids.has(p.id), "Duplicate import id");
          ids.add(p.id);
        }
        const statements = b.products.map((p: any) =>
          d
            .prepare(
              "INSERT INTO products (id,name,category_id,price,inventory,available,archived,data) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category_id=excluded.category_id,price=excluded.price,inventory=excluded.inventory,available=excluded.available,archived=excluded.archived,data=excluded.data",
            )
            .bind(
              p.id,
              p.name,
              p.categoryId,
              p.price,
              p.inventory,
              p.available ? 1 : 0,
              p.archived ? 1 : 0,
              JSON.stringify(p),
            ),
        );
        if (statements.length) await d.batch(statements);
        await audit(user.userId, "products.import", String(b.products.length));
        return json({ imported: b.products.length, skipped: 0 });
      }
      if (part === "categories" && method === "POST") {
        const b = await body(req);
        await d
          .prepare(
            "INSERT INTO categories (id,name,position,enabled,image) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,position=excluded.position,enabled=excluded.enabled,image=excluded.image",
          )
          .bind(
            text(b.id, 80, true),
            text(b.name, 100, true),
            whole(b.position, 0, 1000),
            b.enabled ? 1 : 0,
            text(b.image || "", 500),
          )
          .run();
        await audit(user.userId, "category.save", b.id);
        return json({ ok: true });
      }
      if (part === "settings" && method === "PUT") {
        const b = await body(req);
        text(b.brand, 100, true);
        assert(/^[A-Z]{3}$/.test(b.currency), "Use a three-letter currency");
        whole(b.taxBps, 0, 10000);
        whole(b.deliveryFee);
        text(b.contact || "", 200);
        text(b.location || "", 200);
        text(b.address || "", 1000);
        text(b.bannerTitle || "", 100);
        text(b.bannerSubtitle || "", 200);
        text(b.openingHours || "", 500);
        assert(
          Array.isArray(b.offers) && b.offers.length <= 30,
          "Invalid offers",
        );
        for (const o of b.offers) {
          text(o.code, 40, true);
          assert(["percent", "fixed"].includes(o.type), "Invalid discount");
          whole(o.value, 0, o.type === "percent" ? 10000 : 100000000);
          whole(o.minimum || 0);
          assert(
            !o.expires || /^\d{4}-\d{2}-\d{2}$/.test(o.expires),
            "Invalid expiration",
          );
          text(o.title || "", 100);
        }
        if (b.promotionBanners !== undefined) {
          assert(Array.isArray(b.promotionBanners), "Invalid promotion banners");
          const ids = new Set();
          for (const banner of b.promotionBanners) {
            text(banner.id, 100, true);
            assert(!ids.has(banner.id), "Duplicate banner ID"); ids.add(banner.id);
            text(banner.image || "", 2000);
            assert(!banner.image || /^\/api\/images\//.test(banner.image) || /^\/images\//.test(banner.image) || /^https:\/\//.test(banner.image), "Use an uploaded image or HTTPS image URL");
            text(banner.tag || "", 100); text(banner.title || "", 200);
            text(banner.copy || "", 500); text(banner.action || "", 60); text(banner.search || "", 150);
            assert(["menu", "subscriptions"].includes(banner.destination), "Invalid banner destination");
            assert(typeof banner.enabled === "boolean", "Invalid banner visibility");
          }
        }
        const { settings: old } = await catalog();
        const safe = { ...old, ...b, onlinePayments: false };
        await d
          .prepare("UPDATE settings SET data=? WHERE id=?")
          .bind(JSON.stringify(safe), "store")
          .run();
        await audit(user.userId, "settings.save", "store");
        return json({ ok: true });
      }
      if (part.startsWith("orders/") && method === "PATCH") {
        const b = await body(req);
        return json(
          await updateStatus(part.slice(7), text(b.status, 30, true), user),
        );
      }
      if (part.startsWith("customers/") && method === "PATCH") {
        const b = await body(req),
          id = part.slice(10);
        assert(id !== user.userId, "You cannot disable your own account");
        await d
          .prepare("UPDATE profiles SET disabled=? WHERE id=?")
          .bind(b.disabled ? 1 : 0, id)
          .run();
        await audit(user.userId, "customer.status", id);
        return json({ ok: true });
      }
      if (part.startsWith("suggestions/") && method === "PATCH") {
        const b = await body(req),
          id = part.slice(12);
        assert(
          ["approved", "rejected", "pending"].includes(b.status),
          "Invalid suggestion status",
        );
        const s = await d
          .prepare("SELECT * FROM suggestions WHERE id=?")
          .bind(id)
          .first<any>();
        assert(s, "Suggestion not found", 404);
        if (b.status === "approved") {
          assert(b.product, "Review product details before approving");
          const p = {
            ...b.product,
            id: "suggestion-" + id,
            available: false,
            archived: false,
          };
          await saveProduct(p, user.userId);
        }
        await d
          .prepare("UPDATE suggestions SET status=? WHERE id=?")
          .bind(b.status, id)
          .run();
        await audit(user.userId, "suggestion." + b.status, id);
        return json({ ok: true });
      }
    }
    throw new BusinessError("This endpoint is unavailable", 404);
  } catch (error) {
    if (req.body && !req.bodyUsed) {
      try {
        await limitedBytes(req, 1000000);
      } catch {}
    }
    if (error instanceof RedemptionError || error instanceof PinAuthError) return json({error:error.message},error.status);
    if (error instanceof PaymentError) return json({error:error.message},error.status);
    if (error instanceof BusinessError)
      return json({ error: error.message }, error.status);
    console.error("Store API error", error);
    return json(
      {
        error:
          "The store is temporarily unavailable. Your changes were not confirmed. Please retry.",
      },
      503,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
