package com.espressoulster.coffee.qa;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
import android.webkit.CookieManager;

import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Map;

public final class OrderPushInstrumentation extends Instrumentation {
    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        start();
    }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            Context app = getTargetContext();
            NotificationManager manager = app.getSystemService(NotificationManager.class);
            require(manager.areNotificationsEnabled(), "Grant notifications to the test app first");
            Class<?> receiver = app.getClassLoader().loadClass("com.espressoulster.coffee.AndroidOrderPush");
            Method deliver = receiver.getDeclaredMethod("deliver", Context.class, Map.class);
            deliver.setAccessible(true);
            Class<?> config = app.getClassLoader().loadClass("com.espressoulster.coffee.StoreConfig");
            java.lang.reflect.Field origin = config.getDeclaredField("ORIGIN");
            origin.setAccessible(true);
            String home = origin.get(null) + "/";
            String customerCookie = "espresso_pin=" + String.format("%064x",1);
            String staffCookie = "espresso_staff_pin=" + String.format("%064x",2);
            CookieManager.getInstance().setCookie(home,customerCookie+"; Path=/; Secure; HttpOnly");
            CookieManager.getInstance().setCookie(home,staffCookie+"; Path=/; Secure; HttpOnly");
            app.getSharedPreferences("android_order_push",Context.MODE_PRIVATE).edit()
                .putString("CUSTOMER_binding","fixture-customer").putString("STAFF_binding","fixture-staff")
                .putString("CUSTOMER_session",fingerprint(customerCookie)).putString("STAFF_session",fingerprint(staffCookie)).commit();
            app.getSharedPreferences("order_alert_dedup",Context.MODE_PRIVATE).edit().clear().commit();
            manager.cancelAll();
            Map<String,String> customer = alert("customer","fixture-customer","CH-ABCD0001","ready","Ready for pickup");
            deliver.invoke(null, app, customer);
            Map<String,String> staff = alert("staff","fixture-staff","CH-ABCD0002","staff-received","New café order");
            deliver.invoke(null, app, staff);
            Map<String,String> otherAccount = alert("staff","different-binding","CH-ABCD0003","staff-received","Do not display");
            deliver.invoke(null, app, otherAccount);
            require(posted(manager,customer.get("tag"),"cafe_order_updates","Ready for pickup"), "Missing customer status alert");
            require(posted(manager,staff.get("tag"),"cafe_new_orders","New café order"), "Missing staff new-order alert");
            require(manager.getActiveNotifications().length == 2, "Displayed an alert for the wrong binding");
            android.net.Uri tone = manager.getNotificationChannel("cafe_new_orders").getSound();
            require(tone != null && tone.toString().endsWith("/raw/espresso_house_order"), "Staff channel lacks Espresso House");
            try (java.io.InputStream audio = app.getContentResolver().openInputStream(tone)) {
                require(audio!=null && audio.read()=='R' && audio.read()=='I' && audio.read()=='F' && audio.read()=='F',
                    "Custom staff channel sound is unreadable");
            }
            manager.cancel(customer.get("tag"),0);
            long deadline = android.os.SystemClock.elapsedRealtime() + 2000;
            while (posted(manager,customer.get("tag"),"cafe_order_updates","Ready for pickup") &&
                    android.os.SystemClock.elapsedRealtime() < deadline) android.os.SystemClock.sleep(25);
            require(!posted(manager,customer.get("tag"),"cafe_order_updates","Ready for pickup"),"Customer alert did not clear");
            deliver.invoke(null, app, customer);
            android.os.SystemClock.sleep(200);
            require(!posted(manager,customer.get("tag"),"cafe_order_updates","Ready for pickup"),"Duplicate customer alert reappeared");
            CookieManager.getInstance().setCookie(home,"espresso_pin=; Path=/; Secure; Max-Age=0");
            Map<String,String> signedOut = alert("customer","fixture-customer","CH-ABCD0004","ready","Signed-out alert");
            deliver.invoke(null, app, signedOut);
            require(!posted(manager,signedOut.get("tag"),"cafe_order_updates","Signed-out alert"),"Displayed an alert after sign-out");
            result.putString("stream","\nPASS: Android posted customer and Admin alerts without launching an Activity. Staff channel resolves the café WAV; wrong binding, signed-out receiver and retry were ignored.\n");
            finish(Activity.RESULT_OK,result);
        } catch (Throwable error) {
            result.putString("stream","\nFAIL: "+error+"\n");
            finish(Activity.RESULT_CANCELED,result);
        }
    }

    private static Map<String,String> alert(String scope,String binding,String id,String stage,String title) {
        Map<String,String> data = new HashMap<>();
        data.put("kind","order");
        data.put("scope",scope);
        data.put("binding",binding);
        data.put("id",id);
        data.put("tag",id+"-"+stage);
        data.put("title",title);
        data.put("body","Android test alert.");
        return data;
    }

    private static boolean posted(NotificationManager manager,String tag,String channel,String title) {
        for (StatusBarNotification entry : manager.getActiveNotifications()) {
            Notification notice = entry.getNotification();
            if (tag.equals(entry.getTag()) && channel.equals(notice.getChannelId()) &&
                title.contentEquals(notice.extras.getCharSequence(Notification.EXTRA_TITLE)) &&
                notice.contentIntent != null) return true;
        }
        return false;
    }

    private static String fingerprint(String cookie) throws Exception {
        byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
            .digest(cookie.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        return android.util.Base64.encodeToString(digest, android.util.Base64.NO_WRAP);
    }

    private static void require(boolean condition,String explanation) {
        if (!condition) throw new AssertionError(explanation);
    }
}
