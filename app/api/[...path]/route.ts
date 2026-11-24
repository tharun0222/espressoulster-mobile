import {pushConfig,validPushSubscription} from '../../../lib/order-push';
import {adminChatUnread,markAdminChatRead} from '../../../lib/admin-chat-unread';
import {canonicalServerRequest} from '../../../lib/request-origin';
import {subscriptionId} from '../../../lib/order-notifications';
import {customerOrderAlertFeed,staffOrderAlertFeed} from '../../../lib/order-alert-feed';
import {androidPushConfigured,registerAndroidPush} from '../../../lib/android-push-registration';
import {isProfileGender} from '../../../lib/daily-greeting';
import {canSeeStaffPanel,isApprovedStaff} from '../../../lib/staff-panel-access';
import {isAdvertisementDestination,launchAdvertisementKey,readLaunchAdvertisement,type AdvertisementDraft,type LaunchAdvertisement} from '../../../lib/launch-advertisement';
import {addressLocation} from '../../../lib/address-location';
import {isCoordinates, isKoramangala, koramangalaPin} from "../../../lib/cafe-routing";
import {getOpenRoute} from "../../../lib/openroute-cafe";
import {visibleSubscriptionOrders} from '../../../lib/visible-subscription-orders';
import {cafeCheckoutOrders,cafeOrderDay,isCafeOpeningTime,readCafeOverviewStats} from '../../../lib/cafe-order-day';
import {setQATestPassRemoved} from '../../../lib/test-subscription-removal';
import {subscriptionCatalog,subscriptionPlanImages,validateSubscriptionBanner,validateSubscriptionPlan,validatePlanItems} from '../../../lib/subscription-catalog';
import {readSubscriptionAdvertisements,subscriptionAdvertisementPrefix,type SubscriptionAdvertisement} from '../../../lib/subscription-advertisements';
import {isBookingCheckoutId} from '../../../lib/stripe-table-bookings';
import {bookingFee,validateBooking} from '../../../lib/table-booking';
import {cafeSeatsForTime,dineInTableOptions,isCafeTableConflict,tableUnavailableMessage} from '../../../lib/cafe-table-manager';
import {parseHomeDesign,readHomeDesign} from '../../../lib/home-design';
import {createSubscriptionRedemption,RedemptionError} from "../../../lib/subscription-redemption";
import {syncTestSubscription,createTestSubscriptionOrder,subscriptionRedemptionEnabled} from "../../../lib/subscription-test";
import {subscriberQuote} from "../../../lib/subscriber-discount";
import {cashfreeWebhook, reconcileExpiredSandboxCheckouts, sandboxBookingCheckout, stripeWebhook} from "../../../lib/stripe-payments";
import {hostedPaymentConfig,sandboxAvailable} from "../../../lib/sandbox-config";
import {isSandboxProvider} from "../../../lib/sandbox-checkout";
import {pinAuth} from "../../../lib/pin-auth";
import {PinAuthError} from "../../../lib/pin-auth-core";
import {publicMessage} from '../../../lib/public-message';
import {restorePreviousPrices} from "../../../lib/restore-prices";
import {adminAuth} from "../../../lib/admin-auth";
import {androidAdminRoute} from "../../../lib/android-admin-access";
import {phoneAuth} from "../../../lib/phone-auth";
import {bootstrapResponse} from "../../../lib/bootstrap-response";
import {liveUpdatesResponse} from "../../../server/live-updates.mjs";
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
  cartCatalog,
  cafeAcceptingOrders,
  identity,
  adminIdentity,
  canManageStaffOrders,
  canManageStaffDuty,
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
    req = canonicalServerRequest(req, process.env.APP_RUNTIME === 'selfhost' ? process.env.PAYMENT_APP_ORIGIN : undefined);
    const url = new URL(req.url),
      path = url.pathname.slice(5),
      method = req.method,
      d = db();
    if (path === "payments/cashfree/webhook" && method === "POST") return await cashfreeWebhook(req);
    if (path === "payments/stripe/webhook" && method === "POST") return await stripeWebhook(req);
    if (path === "payments/webhook" && method === "POST") return await paymentWebhook(req);
    if (method !== "GET") mutationGuard(req);
    if (path === "cafe/order-intake" && method === "GET") {
      const currentRevision = url.searchParams.get("homeDesignRevision");
      const [acceptingOrders, home] = await Promise.all([
        cafeAcceptingOrders(),
        currentRevision !== null ? readHomeDesign(d, currentRevision) : null,
      ]);
      return json({ acceptingOrders, ...(home?.design ? { homeDesign: home.design, homeDesignRevision: home.revision } : {}) });
    }
    if (path === "cafe/directions" && method === "POST") {
      await identity(true);
      const input = await body(req);
      const origin = typeof input.origin === "string" ? input.origin.trim() : input.origin;
      assert(input.mode === undefined || input.mode === "drive" || input.mode === "walk", "Choose driving or walking.");
      assert(isCoordinates(origin) || (typeof origin === "string" && origin.length > 0 && origin.length <= 200), "Enter a valid starting point.");
      const key = env.OPENROUTESERVICE_API_KEY?.trim();
      if (!key) return json({ error: "Live directions are currently unavailable." }, 503);
      const { settings } = await catalog();
      if (!isKoramangala(settings.address || "")) return json({ error: "Directions for this outlet are unavailable." }, 404);
      try {
        return json(await getOpenRoute(origin, koramangalaPin, key, input.mode));
      } catch (error) {
        return json({ error: error instanceof Error && error.name === "Error"
          ? publicMessage(error.message,"Directions are temporarily unavailable. Try again.") : "Directions are temporarily unavailable. Try again." }, 502);
      }
    }
    if(path.startsWith("auth/android-admin/")) return await androidAdminRoute(path, req);
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
      const [c, u, tables, homeDesign] = await Promise.all([
        catalog(),
        identity(),
        d.prepare("SELECT id FROM cafe_tables WHERE enabled=1 ORDER BY id").all<{id: string}>(),
        readHomeDesign(d),
      ]);
      return bootstrapResponse({
        ...c,
        settings: {
          ...c.settings,
          testMode: (env as any).PUBLIC_TEST_MODE === "true",
          cafeDirectionsAvailable: Boolean(env.OPENROUTESERVICE_API_KEY?.trim()),
        },
        dineInTables: tables.results.map(table => table.id),
        homeDesign: homeDesign.design,
        homeDesignRevision: homeDesign.revision,
        homeAdvertisement: u && !u.admin ? await readLaunchAdvertisement(d) : null,
        user: u ? {
          ...u,
          canSeeStaffPanel: u.authProvider === "pin" && "loginPhone" in u &&
            canSeeStaffPanel(u.loginPhone, env.STAFF_PANEL_PHONES),
        } : null,
        authentication: (env as any).CUSTOMER_AUTH_MODE === "pin" ? "pin" : "chatgpt",
      }, req.headers.get("accept-encoding"));
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
    if (method === "GET" && (path === "live-updates" || path === "admin/live-updates")) {
      return await liveUpdatesResponse(user.userId, path.startsWith("admin/"), req.signal);
    }
    if (method === "GET" && path === "order-notifications/device") {
      return json({ notices: await customerOrderAlertFeed(d, user.userId) });
    }
    if (method === "POST" && (path === "order-notifications/android" || path === "admin/order-alerts/android")) {
      assert(androidPushConfigured(process.env), "Android push is unavailable.", 503);
      const staff = path.startsWith("admin/");
      assert(staff ? user.authProvider === "staff-pin" && canManageStaffOrders(user) : user.authProvider === "pin",
        "Android push requires an eligible account.", 403);
      await registerAndroidPush(d, req.headers.get("cookie"), user.userId, staff ? "staff" : "customer", await body(req));
      return json({ok:true});
    }
    if (method !== "GET" && (path.startsWith("admin/orders/") || path.startsWith("admin/payments/"))) {
      assert(canManageStaffOrders(user), "Live order controls are for the café operator.", 403);
    }
    if(path==='admin/subscription-plans'){
      if(method==='GET'){const products=(await catalog(true)).products.filter((p:any)=>!p.archived);return json({plans:subscriptionPlanImages(await subscriptionCatalog(d,true),products),products:products.map((p:any)=>({id:p.id,name:p.name,categoryId:p.categoryId,image:p.image,imageAtlas:p.imageAtlas,imagePosition:p.imagePosition}))});}
      const input=await body(req);
      if(method==='DELETE'){assert(typeof input.id==='string','Choose a plan');const row=await d.prepare('UPDATE subscription_catalog SET archived=1,enabled=0,revision=revision+1 WHERE id=? AND revision=? RETURNING id').bind(input.id,input.revision).first();assert(row,'Plan changed. Refresh and retry.',409);await audit(user.userId,'subscription-plan.remove',input.id);return json({ok:true})}
      assert(['POST','PUT'].includes(method),'Unsupported method',405);let plan;try{plan=validateSubscriptionPlan(input)}catch(e){throw new BusinessError((e as Error).message)}
      let banner;try{banner=validateSubscriptionBanner(input.banner)}catch(e){throw new BusinessError((e as Error).message)}
      let items;try{items=validatePlanItems(input.itemScope,input.itemIds,(await catalog(true)).products)}catch(e){throw new BusinessError((e as Error).message)}
      const id=method==='POST'?'plan-'+crypto.randomUUID():input.id;assert(typeof id==='string'&&id.length<=80,'Choose a plan');
      if(method==='POST')await d.prepare('INSERT INTO subscription_catalog(id,name,amount,credits,days,enabled,item_scope,included_items) VALUES(?,?,?,?,?,?,?,?)').bind(id,plan.name,plan.amount,plan.credits,plan.days,plan.enabled?1:0,items.itemScope,JSON.stringify(items.includedItems)).run();
      else{const row=await d.prepare('UPDATE subscription_catalog SET name=?,amount=?,credits=?,days=?,enabled=?,item_scope=?,included_items=?,archived=0,revision=revision+1 WHERE id=? AND revision=? RETURNING id').bind(plan.name,plan.amount,plan.credits,plan.days,plan.enabled?1:0,items.itemScope,JSON.stringify(items.includedItems),id,input.revision).first();assert(row,'Plan changed. Refresh and retry.',409)}
      await d.prepare('INSERT INTO settings(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind('subscription-banner:'+id,JSON.stringify(banner)).run();
      await audit(user.userId,'subscription-plan.save',id);return json({ok:true,id});
    }
    if(path==='order-notifications/push'){
      const config=pushConfig(env);
      if (method === "GET") {
        const device = url.searchParams.get("device");
        if (device === null) return json(config);
        assert(/^[a-f0-9]{64}$/.test(device), "Invalid notification device.", 400);
        const registered = config.enabled && await d.prepare("SELECT 1 FROM order_push_subscriptions WHERE id=? AND user_id=?")
          .bind(device, user.userId).first();
        return json({ registered: Boolean(registered) });
      }
      assert(config.enabled,'Push notifications are not configured',503);
      const input=await body(req);
      assert(validPushSubscription(input),'Invalid push subscription',400);
      const id=await subscriptionId(input.endpoint);
      if(method==='DELETE'){await d.prepare('DELETE FROM order_push_subscriptions WHERE id=? AND user_id=?').bind(id,user.userId).run();return json({ok:true})}
      assert(method==='POST','Method not allowed',405);
      const count=await d.prepare('SELECT COUNT(*) AS n FROM order_push_subscriptions WHERE user_id=? AND id!=?').bind(user.userId,id).first();
      assert(Number(count?.n||0)<8,'Too many notification devices',429);
      await d.prepare('INSERT INTO order_push_subscriptions(id,user_id,subscription) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,subscription=excluded.subscription').bind(id,user.userId,JSON.stringify({endpoint:input.endpoint,expirationTime:input.expirationTime||null,keys:input.keys})).run();
      return json({ok:true});
    }
    if(path==='booking-notifications'){
      if(method==='GET')return json({notifications:(await d.prepare("SELECT n.* FROM booking_notifications n JOIN table_bookings b ON b.id=n.booking_id WHERE n.user_id=? AND n.read_at IS NULL AND b.status='confirmed' AND b.end_at>unixepoch('now') AND NOT EXISTS(SELECT 1 FROM booking_notifications newer WHERE newer.booking_id=n.booking_id AND newer.rowid>n.rowid) ORDER BY n.created_at DESC,n.rowid DESC LIMIT 20").bind(user.userId).all()).results.map((n:any)=>({...n,data:JSON.parse(n.data)}))});
      if(method==='PATCH'){const input=await body(req);assert(typeof input.id==='string','Choose a notification');await d.prepare("UPDATE booking_notifications SET read_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(input.id,user.userId).run();return json({ok:true})}
      return json({error:'Unsupported method'},405);
    }
    if (path === "table-visits/scan" && method === "POST") {
      const input = await body(req);
      assert(typeof input.table === "string" && /^T[0-9]{2}$/.test(input.table), "Scan a valid table QR code.");
      assert(await cafeAcceptingOrders(), "The café is not taking orders right now.", 409);
      await d.prepare("INSERT INTO cafe_dine_in_requests(table_id,customer_id,kind) VALUES (?,?,'scan')")
        .bind(input.table, user.userId).run();
      return json({ table: input.table });
    }
    if (path === "admin/table-visits" && method === "PATCH") {
      assert(canManageStaffOrders(user), "Live table controls are for the café operator.", 403);
      const input = await body(req);
      assert(typeof input.id === "string" && /^[a-f0-9]{32}$/.test(input.id), "Choose an open table visit.");
      const closed = await d.prepare(`UPDATE cafe_table_schedule SET closed_at=unixepoch()
        WHERE id=? AND kind='visit' AND closed_at IS NULL RETURNING table_id`).bind(input.id).first();
      assert(closed, "This visit has already closed. Refresh the table schedule.", 409);
      await audit(user.userId, "table.visit_close", input.id);
      return json({ ok: true });
    }
    if(path==='admin/cafe-tables'&&method==='PATCH'){
      const input=await body(req);assert(typeof input.id==='string'&&typeof input.enabled==='boolean','Choose a table and availability');
      const occupied=await d.prepare("SELECT id FROM table_bookings WHERE status='confirmed' AND end_at>unixepoch('now') AND EXISTS(SELECT 1 FROM json_each(table_ids) WHERE value=?)").bind(input.id).first();
      assert(input.enabled||!occupied,'Cancel or reassign upcoming bookings before disabling this table.',409);
      await d.prepare('UPDATE cafe_tables SET enabled=? WHERE id=?').bind(input.enabled?1:0,input.id).run();await audit(user.userId,'table.availability',input.id);return json({ok:true});
    }
    if(path==='table-bookings/availability'&&method==='GET'){
      let booking:ReturnType<typeof validateBooking>;
      try{booking=validateBooking({date:url.searchParams.get('date'),time:url.searchParams.get('time'),endTime:url.searchParams.get('endTime'),guests:url.searchParams.get('guests')});}
      catch(error){throw new BusinessError((error as Error).message);}
      const availableSeats=await cafeSeatsForTime(d,booking);
      return json({availableSeats,canBook:availableSeats>=booking.guests});
    }
    if(path==='table-bookings/payment'&&method==='POST'){
      const input=await body(req);
      assert(typeof input.id==='string'&&isBookingCheckoutId(input.id),'Choose a valid booking checkout.');
      return json(await sandboxBookingCheckout().verifyOwner(input.id,user.userId,input.cancelled===true));
    }
    if(path==='table-bookings'||path==='admin/table-bookings') {
      const admin=path.startsWith('admin/');
      const gateway=hostedPaymentConfig(env);
      const canBookOnline=gateway!==null;
      if(method==='GET') {
        const bookings=(await d.prepare(admin?
          "SELECT b.*,p.name AS customer_name,p.phone AS customer_phone,COALESCE(fee.checkout_amount,fee.amount) AS booking_fee,fee.mode AS booking_fee_mode FROM table_bookings b JOIN profiles p ON p.id=b.user_id LEFT JOIN table_booking_payments fee ON fee.id=b.id AND fee.state='paid' ORDER BY b.date DESC,b.time LIMIT 200":
          "SELECT b.*,COALESCE(fee.checkout_amount,fee.amount) AS booking_fee,fee.mode AS booking_fee_mode FROM table_bookings b LEFT JOIN table_booking_payments fee ON fee.id=b.id AND fee.state='paid' WHERE b.user_id=? ORDER BY b.date DESC,b.time LIMIT 50").bind(...(admin?[]:[user.userId])).all()).results;
        const tables=(await d.prepare("SELECT * FROM cafe_tables ORDER BY id").all()).results;
        const occupied=admin?(await d.prepare(`
          SELECT id AS allocation_id,COALESCE(booking_id,source_id,id) AS id,table_id,
            json_array(table_id) AS table_ids,kind,start_at,end_at,expires_at
          FROM live_cafe_table_schedule ORDER BY start_at,table_id
        `).all()).results:[];
        const paymentReviews=admin?(await d.prepare(`
          SELECT p.id,COALESCE(p.checkout_amount,p.amount) AS amount,p.start_at,p.end_at,customer.name AS customer_name
          FROM table_booking_payments p JOIN profiles customer ON customer.id=p.user_id
          WHERE p.state='review' ORDER BY p.created_at DESC LIMIT 20
        `).all()).results:[];
        const paymentProvider=gateway?.provider??(env.PUBLIC_TEST_MODE==='true'&&isSandboxProvider(env.PAYMENT_PROVIDER)?env.PAYMENT_PROVIDER:null);
        return json({bookings,tables,occupied,paymentReviews,canBookOnline,bookingFeePaise:await bookingFee(d),paymentProvider,paymentMode:gateway?.mode??null,canCloseVisits:admin&&canManageStaffOrders(user)});
      }
      const input=await body(req);
      if(method==='POST'&&!admin){
        assert(canBookOnline,'Online table booking is currently unavailable. Contact the café to reserve.',409);
        return json(await sandboxBookingCheckout().start(req,user.userId,input));
      }
      if(method==='PATCH'){
        assert(typeof input.id==='string','Choose a booking');
        assert((admin?['confirmed','declined','cancelled']:['cancelled']).includes(input.status),'Invalid booking status');
        let result;
        if(admin&&input.status==='confirmed'){
          assert(Array.isArray(input.tableIds)&&input.tableIds.length>0&&input.tableIds.length<=15&&input.tableIds.every((id:any)=>typeof id==='string'),'Select tables for this booking');
          try{result=await d.prepare("UPDATE table_bookings SET status='confirmed',table_ids=? WHERE id=? AND status IN ('pending','confirmed') AND start_at>unixepoch('now') RETURNING id").bind(JSON.stringify(input.tableIds),input.id).first()}
          catch(e){const message=(e as Error).message;throw new BusinessError(message.includes('already booked')||isCafeTableConflict(e)?'A selected table is no longer available for this time. Refresh and choose another.':message.includes('Not enough')?'Select enough seats for all guests.':message.includes('unavailable')?'A selected table is unavailable. Refresh and try again.':'Unable to assign these tables. Refresh and try again.',409)}
        }else result=await d.prepare(admin?"UPDATE table_bookings SET status=? WHERE id=? AND status IN ('pending','confirmed') RETURNING id":"UPDATE table_bookings SET status=? WHERE id=? AND user_id=? AND status='pending' RETURNING id").bind(input.status,input.id,...(admin?[]:[user.userId])).first();
        assert(result,admin?'Booking has already changed or its time has passed. Refresh and try again.':'Only bookings awaiting café confirmation can be cancelled in the app.',409);
        await audit(user.userId,'booking.'+input.status,input.id);return json({ok:true});
      }
      return json({error:'Unsupported method'},405);
    }
    if(path==='club'&&method==='GET'){
      const rows=await d.prepare("SELECT total FROM orders WHERE user_id=? AND payment_status='paid' AND status!='cancelled' AND created_at>=datetime('now','-90 days') AND NOT EXISTS(SELECT 1 FROM coffee_subscriptions s JOIN payments p ON p.id=s.payment_id WHERE p.order_id=orders.id)").bind(user.userId).all<any>();
      const profile=await d.prepare("SELECT date_of_birth FROM profiles WHERE id=?").bind(user.userId).first<any>();
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.userId));
      const referralCode='ESS-'+Array.from(new Uint8Array(digest)).slice(0,8).map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
      return json({paidOrders:rows.results.length,tier:'Coffee lover',rules:{enabled:false},referralCode,birthday:profile?.date_of_birth||null});
    }
    if (path.startsWith("test-payments/")) {
      const enabled = env.PAYMENT_PROVIDER !== "disabled" &&
        (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || env.PUBLIC_TEST_MODE === "true");
      if (path === "test-payments/config" && method === "GET") return json({enabled,testOnly:true});
      assert(enabled, "Test gateway is disabled", 404);
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
    if(path==='subscriptions/item-code'||path==='subscriptions/daily-code'){
      const redemption=createSubscriptionRedemption(d,env);
      if(method==='GET')return json(await redemption.status(user.userId,url.searchParams.get('subscriptionId')??undefined,url.searchParams.get('codeId')??undefined));
      if(method==='POST')return json(await redemption.generate(user.userId,(await body(req)).subscriptionId));
    }
    if (path === "subscriptions/config" && method === "GET") {
      const [catalogPlans, store, advertisements] = await Promise.all([
        subscriptionCatalog(d), catalog(), readSubscriptionAdvertisements(d),
      ]);
      const planIds = new Set(catalogPlans.map((plan: { id: string }) => plan.id));
      return json({
        enabled: hostedPaymentConfig(env)!==null,
        testEnabled: sandboxAvailable(env),
        mode: hostedPaymentConfig(env)?.mode??null,
        redemptionEnabled: subscriptionRedemptionEnabled(env),
        provider: hostedPaymentConfig(env)?.provider??(env.PAYMENT_PROVIDER==='cashfree'?'cashfree':null),
        plans: subscriptionPlanImages(catalogPlans, store.products),
        advertisements: advertisements.filter(banner => banner.enabled && planIds.has(banner.planId)),
      });
    }
    if (["subscriptions/purchase","subscriptions/test-purchase"].includes(path) && method === "POST") {
      const checkout=hostedPaymentConfig(env);
      assert(checkout && (path==='subscriptions/purchase'||checkout.mode==='test'),"Subscription purchases are currently unavailable.",409);
      const input=await body(req);
      assert(typeof input.planId==='string'&&input.planId.length<=80,"Choose a valid plan");
      await syncTestSubscription(d,env,user.userId);
      const id=await createTestSubscriptionOrder(d,user,input.planId||"weekly",checkout.method);
      return json({orderId:id,testOnly:checkout.mode==='test',mode:checkout.mode});
    }
    if (path === "subscriptions" && method === "GET") {
      await syncTestSubscription(d,env,user.userId);
      const result = await d.prepare(`SELECT s.id,s.plan_name AS planName,s.plan_id AS planId,s.item_scope AS itemScope,s.included_items AS includedItems,COALESCE(s.purchased_credits,(s.total_credits+s.bonus_credits+s.extended_credits)) AS totalCredits,
        s.starts_at AS startsAt,s.expires_at AS expiresAt,s.revoked,p.amount AS amountPaid,
        COALESCE((SELECT SUM(r.credits) FROM coffee_redemptions r WHERE r.subscription_id=s.id AND r.reversed_at IS NULL),0) AS usedCredits
        FROM coffee_subscriptions s JOIN payments p ON p.id=s.payment_id
        JOIN orders o ON o.id=p.order_id
        WHERE s.user_id=? AND s.revoked=0 AND o.user_id=s.user_id AND o.payment_status='paid' AND o.status!='cancelled'
        AND p.amount>0 ORDER BY s.expires_at ASC`).bind(user.userId).all<any>();
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
      const b = await body(req);
      await reconcileExpiredSandboxCheckouts().catch(() => {});
      const c = await cartCatalog(b.items);
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
    if (path === 'admin/chat-unread') {
      assert(canManageStaffOrders(user), 'Chat alerts are for the café operator.', 403);
      assert(method === 'GET', 'Unsupported method', 405);
      return json(await adminChatUnread(d,user.userId));
    }
    const chatReadMatch = /^admin\/orders\/(CH-[A-F0-9]{8})\/chat\/read$/.exec(path);
    if (chatReadMatch) {
      assert(method === 'POST', 'Unsupported method', 405);
      const input = await body(req);
      assert(await markAdminChatRead(d,user.userId,chatReadMatch[1],input.messageId), 'Message not found', 404);
      return json({ok:true});
    }
    const chatMatch = /^(admin\/)?orders\/(CH-[A-F0-9]{8})\/chat$/.exec(path);
    if (chatMatch) {
      const [, staffPrefix, orderId] = chatMatch;
      const role = staffPrefix ? "staff" : "customer";
      const order = await d.prepare(
        staffPrefix ? "SELECT id FROM orders WHERE id=?" : "SELECT id FROM orders WHERE id=? AND user_id=?",
      ).bind(orderId, ...(staffPrefix ? [] : [user.userId])).first();
      assert(order, "Order not found", 404);
      if (method === "GET") {
        const after = url.searchParams.get("after");
        if (after !== null) {
          const cursor = whole(Number(after), 0, Number.MAX_SAFE_INTEGER);
          const { results } = await d.prepare(
            "SELECT id, sender_role AS role, message, created_at AS createdAt FROM order_chat_messages WHERE order_id=? AND id>? ORDER BY id LIMIT 50",
          ).bind(orderId, cursor).all();
          return Response.json({ messages: results }, { headers: { "Cache-Control": "no-store" } });
        }
        const before = url.searchParams.get("before");
        const cursor = before === null ? Number.MAX_SAFE_INTEGER : whole(Number(before), 1, Number.MAX_SAFE_INTEGER);
        const { results } = await d.prepare(
          "SELECT id, sender_role AS role, message, created_at AS createdAt FROM order_chat_messages WHERE order_id=? AND id<? ORDER BY id DESC LIMIT 51",
        ).bind(orderId, cursor).all();
        return Response.json({ messages: results.slice(0, 50).reverse(), hasOlder: results.length > 50 }, { headers: { "Cache-Control": "no-store" } });
      }
      if (method === "POST") {
        const input = await body(req);
        const message = typeof input.message === "string" ? input.message.trim() : "";
        assert(message.length > 0 && message.length <= 500, "Enter a message up to 500 characters");
        const requestId = input.requestId;
        assert(typeof requestId === "string" && /^[a-f0-9-]{36}$/.test(requestId), "Invalid message reference");
        await d.prepare(
          "INSERT INTO order_chat_messages (order_id,sender_id,sender_role,request_id,message) VALUES (?,?,?,?,?) ON CONFLICT(order_id,sender_id,sender_role,request_id) DO NOTHING",
        ).bind(orderId, user.userId, role, requestId, message).run();
        return Response.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
      }
      return json({ error: "Unsupported method" }, 405);
    }
    if (path === "orders") {
      if (method === "GET" && url.searchParams.get("view") === "alerts") {
        const rows = await d.prepare(`
          SELECT recent.*, (
            SELECT json_group_array(json_object('status', event.status)) FROM (
              SELECT status FROM order_events WHERE order_id=recent.id AND status IN ('confirmed','ready')
              ORDER BY rowid
            ) event
          ) AS events
          FROM (
            SELECT o.id,o.order_number,o.fulfillment,
              CASE WHEN o.fulfillment='dine_in' THEN json_extract(o.contact,'$.table') END AS table_number
            FROM orders o WHERE o.user_id=? AND ${visibleSubscriptionOrders('o')}
            ORDER BY o.created_at DESC,o.rowid DESC LIMIT 50
          ) recent
        `).bind(user.userId).all<{id:string;order_number:string|null;fulfillment:string;table_number:string|null;events:string}>();
        return json({orders:rows.results.map(({table_number, events, ...order})=>({
          ...order, contact:table_number ? {table:table_number} : undefined, events:JSON.parse(events),
        }))});
      }
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
      const order=await d.prepare("SELECT o.id,o.order_number,o.status,o.fulfillment,o.created_at,o.payment_status,CASE WHEN o.fulfillment='dine_in' THEN json_extract(o.contact,'$.table') END AS table_number,CASE WHEN p.method IN ('stripe_test','cashfree_test','cashfree','phonepe','razorpay_test') THEN COALESCE(p.created_at,o.created_at) ELSE o.created_at END AS timer_started_at FROM orders o LEFT JOIN payments p ON p.order_id=o.id WHERE o.id=? AND o.user_id=?").bind(id,user.userId).first<{table_number:string|null}>();
      assert(order,"Order not found",404);
      const events=await d.prepare("SELECT status,created_at FROM order_events WHERE order_id=? ORDER BY created_at,rowid").bind(id).all();
      const {table_number, ...status} = order;
      return Response.json({order:{...status,contact:table_number ? {table:table_number} : undefined,events:events.results}},{headers:{"Cache-Control":"no-store"}});
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
        assert(b.gender === undefined || isProfileGender(b.gender), 'Choose a valid gender option.');
        const avatar = b.avatar === undefined ? user.profile?.avatar || "" : text(b.avatar || "", 2000);
        if (avatar) {
          assert(/^\/api\/images\/[a-zA-Z0-9.-]+$/.test(avatar), "Please upload a profile photo");
          const owned = await d.prepare("SELECT id FROM uploads WHERE id=? AND user_id=?").bind(avatar.slice(12), user.userId).first();
          assert(owned, "Choose a photo uploaded by your account", 403);
        }
        await d
          .prepare(
            "INSERT INTO profiles (id,email,name,phone,avatar,gender) VALUES (?,?,?,?,?,COALESCE(?,'')) ON CONFLICT(id) DO UPDATE SET name=excluded.name,phone=excluded.phone,avatar=excluded.avatar,gender=COALESCE(?,profiles.gender)",
          )
          .bind(
            user.userId,
            user.email,
            text(b.name, 100, true),
            text(b.phone || "", 25),
            avatar,
            b.gender ?? null,
            b.gender ?? null,
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
          location: (()=>{try{return addressLocation(b.location)}catch(e){throw new BusinessError((e as Error).message)}})(),
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
    if ((path === "upload" || path === "admin/upload") && method === "POST") {
      assert(env.BUCKET, "Image storage is unavailable", 503);
      const contentType = req.headers.get("content-type") || "";
      const directImage = ["image/png", "image/jpeg", "image/webp"].includes(contentType);
      assert(
        Number(req.headers.get("content-length") || 0) <= 5500000,
        "Maximum image size is 5 MB",
        413,
      );
      let v = await limitedBytes(req, directImage ? 5000000 : 5500000);
      let submittedType = contentType;
      if (!directImage) {
        assert(contentType.startsWith("multipart/form-data;"), "Choose a PNG, JPEG or WebP image.");
        const multipart = new Request(req.url, { method: "POST", headers: { "Content-Type": contentType }, body: v });
        const file = (await multipart.formData()).get("file");
        assert(file instanceof File, "Choose an image under 5 MB");
        submittedType = file.type;
        v = new Uint8Array(await file.arrayBuffer());
      }
      assert(v.length > 0 && v.length <= 5000000, "Choose an image under 5 MB");
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
        mime && mime === submittedType,
        "Only valid PNG, JPEG, and WebP images are accepted",
      );
      if (mime === "image/png") {
        assert(
          v.length >= 33 &&
            [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => v[i] === n) &&
            String.fromCharCode(...v.slice(12, 16)) === "IHDR",
          "Invalid PNG image",
        );
        const view = new DataView(v.buffer, v.byteOffset, v.byteLength);
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
      await env.BUCKET.put(id, v, { httpMetadata: { contentType: mime } });
      await d
        .prepare("INSERT INTO uploads (id,user_id,mime,size) VALUES (?,?,?,?)")
        .bind(id, user.userId, mime, v.length)
        .run();
      return json({ url: "/api/images/" + id }, 201);
    }
    if (path.startsWith("admin/")) {
      const part = path.slice(6);
      if (part === "subscription-advertisements") {
        if (method === "GET") {
          const [advertisements, plans] = await Promise.all([
            readSubscriptionAdvertisements(d),
            d.prepare("SELECT id,name,(enabled=1 AND archived=0) AS available FROM subscription_catalog ORDER BY name")
              .all<{ id: string; name: string; available: number }>(),
          ]);
          return json({ advertisements, plans: plans.results.map(plan => ({ ...plan, available: Boolean(plan.available) })) });
        }
        assert(method === "POST" || method === "PUT" || method === "DELETE", "Unsupported method", 405);
        const input = await body(req);
        const id = method === "POST" ? crypto.randomUUID() : text(input.id, 36, true);
        const key = subscriptionAdvertisementPrefix + id;
        const revision = method === "POST" ? 0 : whole(input.revision, 1);
        if (method === "DELETE") {
          const deleted = await d.prepare("DELETE FROM settings WHERE id=? AND json_extract(data,'$.revision')=? RETURNING id")
            .bind(key, revision).first();
          assert(deleted, "This banner changed. Refresh and try again.", 409);
          await audit(user.userId, "subscription-advertisement.remove", id);
          return json({ ok: true });
        }

        const planId = text(input.planId, 80, true);
        const image = text(input.image, 80, true);
        const title = text(input.title, 90, true);
        const copy = text(input.copy ?? "", 160);
        assert(typeof input.enabled === "boolean", "Choose whether to publish the banner.");
        assert(/^\/api\/images\/[0-9a-f-]{36}$/i.test(image), "Upload an image for the banner.");
        const [plan, upload] = await Promise.all([
          d.prepare("SELECT id FROM subscription_catalog WHERE id=? AND enabled=1 AND archived=0").bind(planId).first(),
          d.prepare("SELECT id FROM uploads WHERE id=?").bind(image.split("/").at(-1)).first(),
        ]);
        assert(plan || !input.enabled, "Choose a subscription plan that customers can buy.");
        assert(upload, "The banner image is unavailable. Upload it again.");
        const advertisement: SubscriptionAdvertisement = { id, revision: revision + 1, planId, image, title, copy, enabled: input.enabled };
        if (method === "POST") {
          await d.prepare("INSERT INTO settings(id,data) VALUES (?,?)").bind(key, JSON.stringify(advertisement)).run();
        } else {
          const saved = await d.prepare("UPDATE settings SET data=? WHERE id=? AND json_extract(data,'$.revision')=? RETURNING id")
            .bind(JSON.stringify(advertisement), key, revision).first();
          assert(saved, "This banner changed. Refresh and try again.", 409);
        }
        await audit(user.userId, input.enabled ? "subscription-advertisement.publish" : "subscription-advertisement.hide", id);
        return json({ advertisement }, method === "POST" ? 201 : 200);
      }
      if (part === "advertisement") {
        if (method === "GET") return json({ advertisement: await readLaunchAdvertisement(d) });
        if (method === "PUT") {
          const input = await body(req);
          const slides = input.banners ?? [input];
          assert(Array.isArray(slides), "Add a valid list of banners.");
          const expectedId = input.expectedId === undefined || input.expectedId === null
            ? input.expectedId : text(input.expectedId, 80, true);
          if (!slides.length) {
            assert(typeof expectedId === "string", "Select a saved carousel to remove.");
            const removed = await d.prepare("DELETE FROM settings WHERE id=? AND json_extract(data,'$.id')=? RETURNING id")
              .bind(launchAdvertisementKey, expectedId).first();
            assert(removed, "The carousel changed. Reopen Advertising and try again.", 409);
            await audit(user.userId, "advertisement.unpublish", expectedId);
            return json({ advertisement: null });
          }
          const banners: AdvertisementDraft[] = slides.map((slide): AdvertisementDraft => {
            assert(slide && typeof slide === "object", "Invalid banner.");
            const title = text(slide.title, 150, true);
            const image = text(slide.image, 80, true);
            assert(/^\/api\/images\/[0-9a-f-]{36}$/i.test(image), "Upload an image for each banner.");
            const destination = slide.destination ?? null;
            assert(destination === null || isAdvertisementDestination(destination), "Choose a page in the customer app.");
            const legacyButtonDisabled = slide.action !== undefined && !text(slide.action ?? "", 40);
            return { title, image, destination: legacyButtonDisabled ? null : destination };
          });
          for (const image of new Set(banners.map(banner => banner.image))) {
            const upload = await d.prepare("SELECT id FROM uploads WHERE id=?").bind(image.split("/").at(-1)).first();
            assert(upload, "A banner image is unavailable. Upload it again.");
          }
          const advertisement: LaunchAdvertisement = { id: crypto.randomUUID(), banners };
          const saved = JSON.stringify(advertisement);
          if (expectedId === undefined) {
            await d.prepare("INSERT INTO settings(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data")
              .bind(launchAdvertisementKey, saved).run();
          } else {
            const updated = expectedId === null
              ? await d.prepare("INSERT INTO settings(id,data) VALUES (?,?) ON CONFLICT(id) DO NOTHING RETURNING id")
                .bind(launchAdvertisementKey, saved).first()
              : await d.prepare("UPDATE settings SET data=? WHERE id=? AND json_extract(data,'$.id')=? RETURNING id")
                .bind(saved, launchAdvertisementKey, expectedId).first();
            assert(updated, "The carousel changed. Reopen Advertising and try again.", 409);
          }
          await audit(user.userId, "advertisement.publish", advertisement.id);
          return json({ advertisement });
        }
        if (method === "DELETE") {
          const previous = await d.prepare("DELETE FROM settings WHERE id=? RETURNING data")
            .bind(launchAdvertisementKey).first<{ data: string }>();
          if (previous) await audit(user.userId, "advertisement.unpublish", (JSON.parse(previous.data) as LaunchAdvertisement).id);
          return json({ advertisement: null });
        }
      }
      if (part === "order-intake" && method === "PUT") {
        assert(canManageStaffDuty(user), "This staff account cannot change café duty.", 403);
        const input = await body(req);
        assert(typeof input.acceptingOrders === "boolean", "Choose On duty or Off duty.");
        await d.prepare("INSERT INTO settings(id,data) VALUES ('order-intake',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data")
          .bind(JSON.stringify(input.acceptingOrders)).run();
        await audit(user.userId, input.acceptingOrders ? "cafe.on_duty" : "cafe.off_duty", "order-intake");
        return json({ acceptingOrders: input.acceptingOrders });
      }
      if (part === "order-alerts" && method === "GET") {
        if (url.searchParams.get("view") === "device") {
          assert(canManageStaffOrders(user), "Order alerts are for the café operator.", 403);
          return json({ notices: await staffOrderAlertFeed(d) });
        }
        assert(canManageStaffOrders(user) || !url.searchParams.has("after"), "Order alerts are for the café operator.", 403);
        const after = whole(Number(url.searchParams.get('after') ?? Number.MAX_SAFE_INTEGER), 0, Number.MAX_SAFE_INTEGER);
        const store = await d.prepare("SELECT json_extract(data,'$.orderDayOpeningTime') AS openingTime FROM settings WHERE id='store'").first<{openingTime: string}>();
        const start = cafeOrderDay(new Date(), store?.openingTime);
        return json(await d.prepare(`SELECT COALESCE((SELECT MAX(rowid) FROM orders),0) AS cursor,
          (SELECT COUNT(*) FROM orders WHERE rowid>? AND ${cafeCheckoutOrders}) AS newOrders,
          (SELECT COUNT(*) FROM orders WHERE created_at>=? AND ${cafeCheckoutOrders}) AS today`)
          .bind(after,start).first());
      }
      if(part==='subscriptions/redeem-preview'&&method==='POST')return json(await createSubscriptionRedemption(d,env).preview(await body(req)));
      if(part==='subscriptions/redeem'&&method==='POST')return json(await createSubscriptionRedemption(d,env).redeem(await body(req),user.userId));
      if (part.startsWith('subscriptions/') && method === 'PATCH') {
        const id=part.slice('subscriptions/'.length), input=await body(req);
        assert(typeof input.removed==='boolean','Choose whether to remove or restore the sandbox pass');
        assert(await setQATestPassRemoved(d,id,input.removed),'Only verified sandbox passes can be removed here',409);
        await audit(user.userId,input.removed?'subscription-test.remove':'subscription-test.restore',id);
        return json({ok:true});
      }
      if (part === "subscriptions" && method === "GET") {
        await syncTestSubscription(d,env);
        const offset=whole(Number(url.searchParams.get("offset")||0),0,1000000);
        const base=`FROM coffee_subscriptions s JOIN payments p ON p.id=s.payment_id JOIN orders o ON o.id=p.order_id JOIN profiles c ON c.id=s.user_id WHERE o.user_id=s.user_id AND o.payment_status='paid' AND o.status!='cancelled' ${url.searchParams.get('includeRemoved')==='true'?"":'AND s.revoked=0'}`;
        const count=await d.prepare(`SELECT COUNT(*) AS n ${base}`).first<any>();
        const rows=await d.prepare(`SELECT s.id,s.plan_name AS planName,s.plan_id AS planId,s.item_scope AS itemScope,s.included_items AS includedItems,COALESCE(s.purchased_credits,(s.total_credits+s.bonus_credits+s.extended_credits)) AS totalCredits,s.starts_at AS startsAt,s.expires_at AS expiresAt,s.revoked,p.method AS paymentMethod,p.verified_by AS paymentVerification,p.amount AS amountPaid,c.name AS customerName,c.phone AS customerPhone,COALESCE((SELECT SUM(r.credits) FROM coffee_redemptions r WHERE r.subscription_id=s.id AND r.reversed_at IS NULL),0) AS usedCredits ${base} ORDER BY s.created_at DESC,s.id LIMIT 50 OFFSET ?`).bind(offset).all<any>();
        const subscriptions=rows.results.map((r:any)=>({...subscriptionSummary([{...r,revoked:!!r.revoked}]).subscriptions[0],customerName:r.customerName,customerPhone:r.customerPhone,removed:!!r.revoked,canRemoveTest:['stripe_test','cashfree_test'].includes(r.paymentMethod)&&r.paymentVerification==='provider_verified_test'}));
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
      if (part === "orders/table-options" && method === "GET") {
        assert(canManageStaffOrders(user), "Live order controls are for the café operator.", 403);
        const ids = url.searchParams.getAll("order");
        assert(ids.length <= 50 && ids.every(id => /^CH-[A-F0-9]{8}$/.test(id)), "Invalid order reference.");
        return json({ tables: await dineInTableOptions(d, [...new Set(ids)]) });
      }
      const customerOrders = /^customers\/([^/]+)\/orders$/.exec(part);
      if (customerOrders && method === "GET") {
        const customerId = decodeURIComponent(customerOrders[1]);
        const offset = whole(Number(url.searchParams.get("offset") || 0), 0, 1000000);
        const customer = await d.prepare("SELECT id FROM profiles WHERE id=?").bind(customerId).first();
        assert(customer, "Customer not found", 404);
        const count = await d.prepare(`SELECT COUNT(*) AS total FROM orders WHERE user_id=? AND ${visibleSubscriptionOrders()}`).bind(customerId).first<any>();
        const orders = await orderList(customerId, offset);
        return json({orders, total: count.total, hasMore: offset + orders.length < count.total});
      }
      if (part === "home-design" && method === "PUT") {
        const design = parseHomeDesign(await body(req));
        assert(design, "Choose a valid Home layout.");
        await d.prepare("INSERT INTO settings(id,data) VALUES('home-design',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data")
          .bind(JSON.stringify({ design, revision: crypto.randomUUID() })).run();
        await audit(user.userId, "home-design.publish", "store");
        return json({ ok: true });
      }
      if (part === "overview" && method === "GET") {
        const menu = catalog(true);
        // Independent reads can run together. Each still reads current database state.
        const [c,stats,bestSellers,orders,customers,suggestions,activity,paymentResponse,acceptingOrders,tables,homeDesign]=await Promise.all([
          menu,
          menu.then(c => readCafeOverviewStats(d, cafeOrderDay(new Date(), c.settings.orderDayOpeningTime))),
          d.prepare(`SELECT i.name,SUM(i.quantity) AS quantity FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.status!='cancelled' AND ${visibleSubscriptionOrders('o')} GROUP BY i.product_id,i.name ORDER BY quantity DESC LIMIT 5`).all(),
          orderList(),
          d.prepare(`SELECT p.id,p.email,p.name,p.phone,p.disabled,p.created_at,pin.phone AS login_phone,COALESCE(o.order_count,0) AS order_count
            FROM profiles p LEFT JOIN pin_accounts pin ON pin.user_id=p.id
            LEFT JOIN (SELECT user_id,COUNT(*) AS order_count FROM orders WHERE ${visibleSubscriptionOrders()} GROUP BY user_id) o ON o.user_id=p.id
            ORDER BY p.created_at DESC LIMIT 200`).all(),
          d.prepare("SELECT * FROM suggestions ORDER BY created_at DESC LIMIT 200").all<any>(),
          d.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100").all(),
          onlinePaymentRoute("payments/config",req,user),
          cafeAcceptingOrders(),
          d.prepare("SELECT id FROM cafe_tables WHERE enabled=1 ORDER BY id").all<{ id: string }>(),
          readHomeDesign(d),
        ]);
        const paymentConfig=paymentResponse?await paymentResponse.json():{enabled:false};
        return json({
          ...c,stats,bestSellers:bestSellers.results,paymentConfig,orders,acceptingOrders,
          dineInTables: tables.results.map(table => table.id),
          homeDesign: homeDesign.design,
          customers:customers.results.map(({login_phone,...customer})=>({...customer,staff:isApprovedStaff(login_phone,env)})),
          suggestions:suggestions.results.map((r)=>({...r,...JSON.parse(r.data)})),
          audit:activity.results,
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
        const result=await d.prepare(`UPDATE products SET available=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND archived=0
          AND (?=0 OR (price IS NOT NULL AND (inventory IS NULL OR inventory>0) AND (?=1 OR COALESCE(json_extract(data,'$.testPrice'),0)=0)))`)
          .bind(input.available?1:0,id,input.available?1:0,env.PUBLIC_TEST_MODE==='true'?1:0).run();
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
        assert(env.PUBLIC_TEST_MODE === "true", "This action is unavailable.", 403);
        const input = await body(req);
        assert(input.price === 100, "Temporary price must be ₹1");
        const backupId = "price-backup-" + crypto.randomUUID();
        const result = await d.batch([
          d.prepare("INSERT INTO settings(id,data) SELECT ?,json_group_array(json_object('id',id,'price',price,'testPrice',COALESCE(json_extract(data,'$.testPrice'),0))) FROM products").bind(backupId),
          d.prepare("UPDATE products SET price=100,data=json_set(data,'$.price',100,'$.testPrice',json('true')),updated_at=CURRENT_TIMESTAMP"),
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
        assert(b.orderDayOpeningTime === undefined || isCafeOpeningTime(b.orderDayOpeningTime), "Choose a valid café opening time.");
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
        if(b.clubRules!==undefined){
          assert(b.clubRules&&typeof b.clubRules==='object'&&!Array.isArray(b.clubRules),'Invalid coffee club rules');
          const limits:Record<string,number>={qualifyingRupees:100000,silverOrders:1000,goldOrders:1000,silverCashbackPercent:100,goldCashbackPercent:100,referralRupees:10000,birthdayRupees:10000};
          assert(Object.keys(b.clubRules).every(k=>k in limits),'Unknown coffee club rule');
          for(const [key,value] of Object.entries(b.clubRules)){if(value!==null)whole(value,0,limits[key]);}
          if(b.clubRules.silverOrders!=null&&b.clubRules.goldOrders!=null)assert(b.clubRules.goldOrders>b.clubRules.silverOrders,'Highest tier must require more orders than the second tier');
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
      const tableAssignment = /^orders\/([^/]+)\/table$/.exec(part);
      if (tableAssignment && method === "PATCH") {
        const input = await body(req);
        const table = text(input.table, 3, true);
        assert(/^T[0-9]{2}$/.test(table), "Choose a valid table.");
        const assigned = await d.prepare(`UPDATE orders SET contact=json_set(contact,'$.table',?)
          WHERE id=? AND fulfillment='dine_in' AND status NOT IN ('cancelled','completed')
          RETURNING id`).bind(table, tableAssignment[1]).first();
        assert(assigned, "Assign an available table to an active dine-in order.", 409);
        await audit(user.userId, "order.assign_table", tableAssignment[1]);
        return json({ ok: true });
      }
      if (part.startsWith("orders/") && method === "PATCH") {
        const b = await body(req);
        return json(
          await updateStatus(part.slice(7), text(b.status, 30, true), user, b.table),
        );
      }
      if (part.startsWith("customers/") && method === "PATCH") {
        const b = await body(req),
          id = part.slice(10);
        assert(id !== user.userId, "You cannot disable your own account");
        assert(typeof b.disabled === "boolean", "Choose whether to disable this customer.");
        const account = await d.prepare("SELECT pin.phone AS login_phone FROM profiles p LEFT JOIN pin_accounts pin ON pin.user_id=p.id WHERE p.id=?")
          .bind(id).first<{login_phone:string|null}>();
        assert(account, "Customer not found", 404);
        assert(!isApprovedStaff(account.login_phone,env), "Staff accounts are managed separately.", 403);
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
    if (error instanceof PinAuthError) return json({error:publicMessage(error.message,'Unable to log in. Please try again.'),...(error.staffOnly?{staffOnly:true}:{})},error.status);
    if (error instanceof RedemptionError) return json({error:publicMessage(error.message)},error.status);
    if (error instanceof PaymentError) return json({error:publicMessage(error.message,'Please check your payment status before trying again.')},error.status);
    if (error instanceof BusinessError)
      return json({ error: publicMessage(error.message) }, error.status);
    if (isCafeTableConflict(error))
      return json({ error: tableUnavailableMessage }, 409);
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
