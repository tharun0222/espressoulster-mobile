package com.espressoulster.coffee;

import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.webkit.WebView;
import com.whatsapp.otp.android.sdk.WhatsAppOtpHandler;
import com.whatsapp.otp.android.sdk.WhatsAppOtpIncomingIntentHandler;
import java.lang.ref.WeakReference;
import java.util.UUID;
import org.json.JSONObject;

/** In-memory, single-use OTP handoff. The server still verifies every code. */
final class NativeWhatsAppOtp {
    static final String ACTION = "com.whatsapp.otp.OTP_RETRIEVED";
    private static WeakReference<NativeWhatsAppOtp> active = new WeakReference<>(null);
    private final WebView webView;
    private String handshakeId;
    private String webRequestId;
    private long expiresAt;

    NativeWhatsAppOtp(WebView view) { webView = view; }

    void begin(Context context, String requestId) {
        stop();
        try {
            UUID.fromString(requestId);
            webRequestId = requestId;
            // Save the ID before sending either broadcast: delivery can be immediate.
            UUID id = UUID.randomUUID();
            handshakeId = id.toString();
            expiresAt = SystemClock.elapsedRealtime() + 600_000;
            active = new WeakReference<>(this);
            WhatsAppOtpHandler handler = new WhatsAppOtpHandler();
            handler.sendOtpIntentToWhatsApp(id, context,
                com.whatsapp.otp.android.sdk.enums.WhatsAppClientType.CONSUMER);
            handler.sendOtpIntentToWhatsApp(id, context,
                com.whatsapp.otp.android.sdk.enums.WhatsAppClientType.BUSINESS);
            emit("ready", null);
        } catch (RuntimeException failure) {
            // Copy/paste remains available; never log the OTP or handshake ID.
            emit("ready", null);
            stop();
        }
    }

    static void receive(Intent intent) {
        NativeWhatsAppOtp listener = active.get();
        if (listener != null) listener.accept(intent);
    }

    private void accept(Intent intent) {
        if (intent == null || !ACTION.equals(intent.getAction()) || handshakeId == null
                || SystemClock.elapsedRealtime() >= expiresAt) return;
        try {
            String code = new WhatsAppOtpIncomingIntentHandler()
                .getOtpCodeFromWhatsAppIntent(intent, handshakeId);
            if (code == null || !code.matches("[0-9]{6}")) return;
            emit("code", code);
            stop();
        } catch (RuntimeException invalidIntent) {
            // Ignore unsolicited, malformed, mismatched and replayed broadcasts.
        }
    }

    private void emit(String type, String code) {
        if (webRequestId == null) return;
        String detail = "{requestId:" + JSONObject.quote(webRequestId)
            + ",type:" + JSONObject.quote(type)
            + (code == null ? "" : ",code:" + JSONObject.quote(code)) + "}";
        final String script = "if(location.origin===" + JSONObject.quote(StoreConfig.ORIGIN)
            + "){window.dispatchEvent(new CustomEvent('espresso-whatsapp-otp',{detail:"
            + detail + "}));}";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    void stop() {
        handshakeId = null;
        webRequestId = null;
        expiresAt = 0;
        if (active.get() == this) active.clear();
    }

    void stop(String requestId) {
        if (requestId != null && requestId.equals(webRequestId)) stop();
    }
}
