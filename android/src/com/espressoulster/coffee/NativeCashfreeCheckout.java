package com.espressoulster.coffee;

import android.app.Activity;
import android.webkit.WebView;
import com.cashfree.pg.api.CFPaymentGatewayService;
import com.cashfree.pg.core.api.CFSession;
import com.cashfree.pg.core.api.callback.CFCheckoutResponseCallback;
import com.cashfree.pg.core.api.utils.CFErrorResponse;
import com.cashfree.pg.core.api.webcheckout.CFWebCheckoutPayment;
import com.cashfree.pg.core.api.webcheckout.CFWebCheckoutTheme;
import org.json.JSONObject;

/** SDK callbacks are checkout outcomes only. The backend is the payment authority. */
final class NativeCashfreeCheckout implements CFCheckoutResponseCallback {
    private final Activity activity;
    private final WebView view;
    private String requestId;
    private String orderId;

    NativeCashfreeCheckout(Activity activity, WebView view) { this.activity = activity; this.view = view; }

    boolean open(String value) {
        if (requestId != null || value == null || value.length() > 4096) return false;
        try {
            JSONObject input = new JSONObject(value);
            String request = input.getString("requestId");
            String order = input.getString("orderId");
            String session = input.getString("paymentSessionId");
            // The build selects the gateway. The backend session must match.
            String expectedMode = StoreConfig.CASHFREE_LIVE ? "live" : "test";
            if (!request.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}")
                || !order.matches("(?:(?:PC|BK)-[A-F0-9]{32}|CH-[A-F0-9]{8}-[a-f0-9]{32})")
                || !session.matches("session_[a-zA-Z0-9_=\\-]{20,2048}") || !expectedMode.equals(input.getString("mode"))) return false;
            CFSession cfSession = new CFSession.CFSessionBuilder()
                .setEnvironment(StoreConfig.CASHFREE_LIVE ? CFSession.Environment.PRODUCTION : CFSession.Environment.SANDBOX)
                .setOrderId(order).setPaymentSessionID(session).build();
            CFWebCheckoutTheme theme = new CFWebCheckoutTheme.CFWebCheckoutThemeBuilder()
                .setNavigationBarBackgroundColor("#244D68").setNavigationBarTextColor("#F1FAFF").build();
            CFWebCheckoutPayment payment = new CFWebCheckoutPayment.CFWebCheckoutPaymentBuilder()
                .setSession(cfSession).setCFWebCheckoutUITheme(theme).build();
            requestId = request; orderId = order;
            CFPaymentGatewayService.getInstance().setCheckoutCallback(this);
            CFPaymentGatewayService.getInstance().doPayment(activity, payment);
            return true;
        } catch (Exception ignored) {
            requestId = null; orderId = null;
            return false;
        }
    }

    @Override public void onPaymentVerify(String id) { finish(id, "verify"); }
    @Override public void onPaymentFailure(CFErrorResponse error, String id) { finish(id, "closed"); }

    private void finish(String id, String state) {
        if (requestId == null || !orderId.equals(id)) return;
        final String request = requestId;
        requestId = null; orderId = null;
        // No SDK error text, card data, payment token or credentials leave this class.
        activity.runOnUiThread(() -> view.evaluateJavascript(
            "if(location.origin===" + JSONObject.quote(StoreConfig.ORIGIN) + ")window.dispatchEvent(new CustomEvent('espresso-cashfree-checkout',{detail:{requestId:"
            + JSONObject.quote(request) + ",state:" + JSONObject.quote(state) + "}}));", null));
    }
}
