package com.espressoulster.coffee;

import android.content.Context;
import android.content.SharedPreferences;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class AndroidOrderPush extends FirebaseMessagingService {
    private static final ExecutorService registration = Executors.newSingleThreadExecutor();
    private static final String HOME = StoreConfig.ORIGIN + "/";

    static SharedPreferences state(Context context) {
        return context.getSharedPreferences("android_order_push", Context.MODE_PRIVATE);
    }

    private static String fingerprint(String cookie) {
        try {
            // The optional Android proof cookie can rotate independently of the signed-in session.
            int separator = cookie.indexOf(';');
            if (separator >= 0) cookie = cookie.substring(0, separator);
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(cookie.getBytes(StandardCharsets.UTF_8));
            return android.util.Base64.encodeToString(digest,android.util.Base64.NO_WRAP);
        } catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }

    static synchronized void syncSession(Context context, NativeOrderAlerts.Scope scope, String cookie) {
        SharedPreferences prefs = state(context);
        if (!java.util.Objects.equals(prefs.getString(scope.name()+"_session",null),cookie == null ? null : fingerprint(cookie))) {
            prefs.edit().remove(scope.name()+"_binding").remove(scope.name()+"_session").apply();
        }
    }

    private static synchronized String binding(Context context, NativeOrderAlerts.Scope scope, String cookie, boolean create) {
        SharedPreferences prefs = state(context);
        String key=scope.name();
        String hash=fingerprint(cookie);
        String bound=hash.equals(prefs.getString(key+"_session",null)) ? prefs.getString(key+"_binding",null) : null;
        if (bound != null || !create) return bound;
        bound=UUID.randomUUID().toString();
        prefs.edit().putString(key+"_session",hash).putString(key+"_binding",bound).apply();
        return bound;
    }

    private static synchronized String installation(Context context) {
        SharedPreferences prefs = state(context);
        String id = prefs.getString("installation",null);
        if (id != null) return id;
        id = UUID.randomUUID().toString();
        prefs.edit().putString("installation",id).apply();
        return id;
    }

    static void refreshRegistration(Context context, NativeOrderAlerts.Scope scope, String cookie) {
        if (FirebaseApp.getApps(context).isEmpty()) return;
        FirebaseMessaging messaging = FirebaseMessaging.getInstance();
        if (!messaging.isAutoInitEnabled()) messaging.setAutoInitEnabled(true);
        messaging.getToken().addOnSuccessListener(token ->
            registration.execute(() -> register(context.getApplicationContext(),scope,cookie,token,true)));
    }

    private static void register(Context context, NativeOrderAlerts.Scope scope, String cookie, String token, boolean initial) {
        if (cookie == null || !OrderAlertNotifications.enabled(context,scope)
                || !cookie.equals(NativeOrderAlerts.readCookie(HOME,scope))) return;
        String binding = binding(context,scope,cookie,initial);
        if (binding == null) return;
        String path = scope == NativeOrderAlerts.Scope.STAFF
            ? "api/admin/order-alerts/android" : "api/order-notifications/android";
        HttpURLConnection request = null;
        try {
            byte[] body = new JSONObject().put("installation",installation(context)).put("binding",binding)
                .put("token",token).toString().getBytes(StandardCharsets.UTF_8);
            request=(HttpURLConnection)new URL(HOME+path).openConnection();
            request.setInstanceFollowRedirects(false);
            request.setConnectTimeout(5000);
            request.setReadTimeout(5000);
            request.setRequestMethod("POST");
            request.setRequestProperty("Origin",StoreConfig.ORIGIN);
            request.setRequestProperty("Cookie",cookie);
            request.setRequestProperty("Content-Type","application/json");
            request.setFixedLengthStreamingMode(body.length);
            request.setDoOutput(true);
            try (java.io.OutputStream output=request.getOutputStream()) { output.write(body); }
            request.getResponseCode();
        } catch (Exception ignored) {
            // Try again at the next foreground refresh.
        } finally { if (request != null) request.disconnect(); }
    }

    @Override public void onNewToken(String token) {
        for (NativeOrderAlerts.Scope scope : NativeOrderAlerts.Scope.values()) {
            register(this,scope,NativeOrderAlerts.readCookie(HOME,scope),token,false);
        }
    }

    @Override public void onMessageReceived(RemoteMessage message) {
        deliver(this,message.getData());
    }

    static void deliver(Context context, Map<String,String> data) {
        if (!"order".equals(data.get("kind"))) return;
        String recipient=data.get("scope");
        NativeOrderAlerts.Scope scope;
        if ("staff".equals(recipient)) scope=NativeOrderAlerts.Scope.STAFF;
        else if ("customer".equals(recipient)) scope=NativeOrderAlerts.Scope.CUSTOMER;
        else return;
        String cookie=NativeOrderAlerts.readCookie(HOME,scope);
        String bound=cookie == null ? null : binding(context,scope,cookie,false);
        if (bound == null || !bound.equals(data.get("binding"))) return;
        OrderAlertNotifications.createChannels(context);
        OrderAlertNotifications.post(context,scope,data.get("id"),data.get("tag"),data.get("reference"),data.get("title"),data.get("body"));
    }
}
