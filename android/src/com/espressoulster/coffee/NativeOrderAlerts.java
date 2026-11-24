package com.espressoulster.coffee;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.CookieManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Posts Android system notifications from the account's authenticated order feed. */
final class NativeOrderAlerts {
    static final String SETTINGS_ACTION = "com.espressoulster.coffee.ORDER_ALERTS";
    static final String OPEN_ORDER_ACTION = "com.espressoulster.coffee.OPEN_ORDER_ALERT";
    static final String ORDER_ID = "orderId";
    static final String STAFF = "staffOrderAlert";
    static final int PERMISSION_REQUEST = 4;
    private static final int POLL_INTERVAL_MS = 6000;
    private static final int MIN_REFRESH_MS = 800;
    private static final Pattern CUSTOMER_COOKIE = Pattern.compile("(?:^|;\\s*)(espresso_pin=[0-9a-f]{64})(?:;|$)");
    private static final Pattern STAFF_COOKIE = Pattern.compile("(?:^|;\\s*)(espresso_staff_pin=[0-9a-f]{64})(?:;|$)");
    private static final Pattern APP_COOKIE = Pattern.compile("(?:^|;\\s*)(espresso_android_admin=[0-9a-f]{64})(?:;|$)");

    enum Scope {
        CUSTOMER(OrderAlertNotifications.CUSTOMER_CHANNEL, "api/order-notifications/device", CUSTOMER_COOKIE),
        STAFF(OrderAlertNotifications.STAFF_CHANNEL, "api/admin/order-alerts?view=device", STAFF_COOKIE);

        final String channel, path;
        final Pattern authCookie;

        Scope(String channel, String path, Pattern authCookie) {
            this.channel = channel;
            this.path = path;
            this.authCookie = authCookie;
        }
    }

    private final Activity activity;
    private final Supplier<Scope> pageScope;
    private final String home;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Runnable scheduledPoll = this::poll;
    private final Snapshot customerSnapshot = new Snapshot();
    private final Snapshot staffSnapshot = new Snapshot();
    private boolean active;
    private boolean loading;
    private boolean refreshPending;
    private long lastStarted;

    NativeOrderAlerts(Activity activity, String home, Supplier<Scope> pageScope) {
        this.activity = activity;
        this.home = home;
        this.pageScope = pageScope;
        OrderAlertNotifications.createChannels(activity);
    }

    void openSettings() {
        Scope scope = pageScope.get();
        if (scope == null) scope = Scope.CUSTOMER;
        if (requestPermissionOnce()) return;
        Intent settings = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, activity.getPackageName())
            .putExtra(Settings.EXTRA_CHANNEL_ID, scope.channel);
        if (!OrderAlertNotifications.notifications(activity).areNotificationsEnabled()) {
            settings = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, activity.getPackageName());
        }
        activity.startActivity(settings);
    }

    private boolean canAskPermission() {
        return Build.VERSION.SDK_INT >= 33
            && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            && !activity.getPreferences(Activity.MODE_PRIVATE).getBoolean("asked_order_alerts", false);
    }

    private boolean requestPermissionOnce() {
        if (!canAskPermission()) return false;
        activity.getPreferences(Activity.MODE_PRIVATE).edit().putBoolean("asked_order_alerts", true).apply();
        activity.requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, PERMISSION_REQUEST);
        return true;
    }

    boolean enabled() {
        Scope scope = pageScope.get();
        return scope != null && enabled(scope);
    }

    private boolean enabled(Scope scope) {
        return OrderAlertNotifications.enabled(activity,scope);
    }

    void resume() { active = true; refresh(); }

    void pause() {
        active = false;
        refreshPending = false;
        main.removeCallbacks(scheduledPoll);
    }

    void close() { pause(); executor.shutdownNow(); }

    void refresh() {
        if (loading && active) refreshPending = true;
        else schedule(0);
    }

    private void schedule(int delay) {
        main.removeCallbacks(scheduledPoll);
        if (active && !loading) {
            long debounce = lastStarted + MIN_REFRESH_MS - android.os.SystemClock.elapsedRealtime();
            main.postDelayed(scheduledPoll, Math.max(debounce, delay));
        }
    }

    static String readCookie(String home, Scope scope) {
        String cookies = CookieManager.getInstance().getCookie(home + scope.path);
        if (cookies == null) return null;
        Matcher session = scope.authCookie.matcher(cookies);
        if (!session.find()) return null;
        String result = session.group(1);
        if (scope == Scope.STAFF) {
            Matcher proof = APP_COOKIE.matcher(cookies);
            if (proof.find()) result += "; " + proof.group(1);
        }
        return result;
    }

    private String cookie(Scope scope) { return readCookie(home,scope); }

    private Snapshot snapshot(Scope scope) {
        return scope == Scope.STAFF ? staffSnapshot : customerSnapshot;
    }

    private void syncSession(Scope scope) {
        Snapshot state = snapshot(scope);
        String cookie = cookie(scope);
        if (state.initialized && java.util.Objects.equals(cookie, state.cookie)) return;
        if (state.cookie != null || cookie == null) OrderAlertNotifications.clear(activity,scope);
        AndroidOrderPush.syncSession(activity,scope,cookie);
        state.initialized = true;
        state.cookie = cookie;
        state.seen = null;
        state.nextRegistration = 0;
    }

    private void poll() {
        if (!active || loading) return;
        syncSession(Scope.CUSTOMER);
        syncSession(Scope.STAFF);
        Scope scope = pageScope.get();
        if (scope == null) return;
        String cookie = snapshot(scope).cookie;
        if (cookie == null) {
            schedule(POLL_INTERVAL_MS);
            return;
        }
        if (!enabled(scope) && !(scope == Scope.STAFF && canAskPermission())) return;
        lastStarted = android.os.SystemClock.elapsedRealtime();
        loading = true;
        executor.execute(() -> {
            Feed feed = load(scope, cookie);
            main.post(() -> receive(scope, cookie, feed));
        });
    }

    private void receive(Scope scope, String cookie, Feed feed) {
        loading = false;
        if (active && scope == pageScope.get() && cookie.equals(cookie(scope)) && feed != null) {
            Snapshot state = snapshot(scope);
            if (feed.unauthorized) {
                OrderAlertNotifications.clear(activity,scope);
                AndroidOrderPush.syncSession(activity,scope,null);
                state.seen = null;
            } else {
                if (scope == Scope.STAFF && canAskPermission()) requestPermissionOnce();
                long now = android.os.SystemClock.elapsedRealtime();
                if (enabled(scope) && now >= state.nextRegistration) {
                    state.nextRegistration = now + 5 * 60 * 1000;
                    AndroidOrderPush.refreshRegistration(activity.getApplicationContext(),scope,cookie);
                }
                Set<String> current = new HashSet<>();
                for (int index = 0; index < feed.notices.length(); index++) {
                    JSONObject notice = feed.notices.optJSONObject(index);
                    if (notice == null) continue;
                    String id = notice.optString("id");
                    String tag = notice.optString("tag");
                    if (!id.matches("CH-[A-F0-9]{8}") || !tag.matches("CH-[A-F0-9]{8}-[a-z_-]{1,32}")) continue;
                    if (current.add(tag) && state.seen != null && !state.seen.contains(tag) && enabled(scope)) {
                        OrderAlertNotifications.post(activity,scope,id,tag,notice.optString("reference"),
                            notice.optString("title"),notice.optString("body"));
                    }
                }
                state.seen = current;
            }
        }
        int delay = refreshPending ? 0 : POLL_INTERVAL_MS;
        refreshPending = false;
        schedule(delay);
    }

    private Feed load(Scope scope, String cookie) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(home + scope.path).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(6000);
            connection.setReadTimeout(6000);
            connection.setRequestProperty("Cookie", cookie);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cache-Control", "no-cache");
            int response = connection.getResponseCode();
            if (response == 401 || response == 403) return new Feed(null, true);
            if (response != 200) return null;
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (output.size() + count > 128 * 1024) return null;
                    output.write(buffer, 0, count);
                }
                JSONArray notices = new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8)).getJSONArray("notices");
                return new Feed(notices, false);
            }
        } catch (Exception error) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static final class Snapshot {
        boolean initialized;
        String cookie;
        Set<String> seen;
        long nextRegistration;
    }

    private static final class Feed {
        final JSONArray notices;
        final boolean unauthorized;

        Feed(JSONArray notices, boolean unauthorized) {
            this.notices = notices;
            this.unauthorized = unauthorized;
        }
    }
}
