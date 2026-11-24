package com.espressoulster.coffee;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.net.Uri;
import android.service.notification.StatusBarNotification;
import java.util.Map;

final class OrderAlertNotifications {
    static final String CUSTOMER_CHANNEL = "cafe_order_updates";
    static final String STAFF_CHANNEL = "cafe_new_orders";

    static void createChannels(Context context) {
        NotificationChannel customer = channel(CUSTOMER_CHANNEL, "Order updates", "Updates for your café orders");
        NotificationChannel staff = channel(STAFF_CHANNEL, "New café orders", "Incoming orders for café staff");
        Uri tone = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + context.getPackageName()
            + "/raw/espresso_house_order");
        staff.setSound(tone, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).build());
        staff.enableVibration(true);
        NotificationManager manager = notifications(context);
        manager.createNotificationChannel(customer);
        manager.createNotificationChannel(staff);
    }

    private static NotificationChannel channel(String id, String name, String description) {
        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(description);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        return channel;
    }

    static NotificationManager notifications(Context context) {
        return context.getSystemService(NotificationManager.class);
    }

    static boolean enabled(Context context, NativeOrderAlerts.Scope scope) {
        NotificationManager manager = notifications(context);
        NotificationChannel channel = manager.getNotificationChannel(scope.channel);
        return manager.areNotificationsEnabled() && channel != null
            && channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    static void clear(Context context, NativeOrderAlerts.Scope scope) {
        NotificationManager manager = notifications(context);
        for (StatusBarNotification notice : manager.getActiveNotifications()) {
            if (scope.channel.equals(notice.getNotification().getChannelId())) {
                manager.cancel(notice.getTag(), notice.getId());
            }
        }
    }

    // FCM may retry a message, or its foreground fallback may see the same event.
    static synchronized void post(Context context, NativeOrderAlerts.Scope scope,
            String id, String tag, String reference, String title, String message) {
        String stages = scope == NativeOrderAlerts.Scope.STAFF
            ? "staff-received" : "pending|confirmed|preparing|ready|completed|cancelled|out_for_delivery";
        if (id == null || !id.matches("CH-[A-F0-9]{8}") || tag == null || !tag.matches(id + "-(" + stages + ")")
                || title == null || message == null || !enabled(context,scope)) return;
        SharedPreferences recent = context.getSharedPreferences("order_alert_dedup",Context.MODE_PRIVATE);
        long now = System.currentTimeMillis(), cutoff = now - 24 * 60 * 60 * 1000;
        if (recent.getLong(tag,0) > cutoff) return;
        if (reference == null || !reference.matches("[0-9]{8}-[0-9]{3,}|CH-[A-F0-9]{8}")) reference = id;
        String body = "Order " + reference + " · " + message;
        Intent onTap = new Intent(context, MainActivity.class).setAction(NativeOrderAlerts.OPEN_ORDER_ACTION)
            .setData(Uri.parse("espresso-order:" + tag))
            .putExtra(NativeOrderAlerts.ORDER_ID,id).putExtra(NativeOrderAlerts.STAFF,scope==NativeOrderAlerts.Scope.STAFF)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent target = PendingIntent.getActivity(context,0,onTap,PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification alert = new Notification.Builder(context,scope.channel)
            .setSmallIcon(R.drawable.order_alert_icon).setContentTitle(title.replaceFirst("^Espressoulster · ", ""))
            .setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body)).setCategory(Notification.CATEGORY_STATUS)
            .setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(target).setAutoCancel(true).build();
        notifications(context).notify(tag,0,alert);
        SharedPreferences.Editor edit = recent.edit().putLong(tag,now);
        for (Map.Entry<String,?> entry : recent.getAll().entrySet()) {
            if (entry.getValue() instanceof Long && (Long)entry.getValue() <= cutoff) edit.remove(entry.getKey());
        }
        edit.apply();
    }
}
