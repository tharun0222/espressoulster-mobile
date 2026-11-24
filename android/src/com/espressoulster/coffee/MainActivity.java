package com.espressoulster.coffee;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JsPromptResult;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final Uri STORE_ORIGIN = Uri.parse(StoreConfig.ORIGIN);
    private static final String STORE_ORIGIN_JS = org.json.JSONObject.quote(StoreConfig.ORIGIN);
    private static final String HOME = StoreConfig.ORIGIN + "/";
    private static final String ADMIN = HOME + "admin";
    private static final String OPEN_ADMIN = "com.espressoulster.coffee.OPEN_ADMIN";
    private static final String[] CAMERA_RESOURCES = { PermissionRequest.RESOURCE_VIDEO_CAPTURE };
    private static final int CAMERA_REQUEST = 1;
    private static final int LOCATION_REQUEST = 2;
    private static final int FILE_REQUEST = 3;
    private static final int LOCATION_SETTINGS_REQUEST = 4;

    private WebView webView;
    private FrameLayout content;
    private LinearLayout unavailable;
    private boolean backPending;
    private String retryUrl = HOME;
    private PermissionRequest cameraRequest;
    private GeolocationPermissions.Callback locationCallback;
    private JsPromptResult locationSettingsPrompt;
    private AlertDialog locationSettingsDialog;
    private String locationOrigin;
    private ValueCallback<Uri[]> fileCallback;
    private String showcaseScript;
    private String adminMobileScript;
    private String adminMobileCss;
    private boolean loadVerifiedAdminPage;
    private NativeOrderAlerts orderAlerts;
    private NativeWhatsAppOtp whatsAppOtp;
    private NativeCashfreeCheckout cashfreeCheckout;
    private String preparingWhatsAppRequest;
    private String preparingPinRequest;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attributes);
        }
        showcaseScript = readAsset("drink-showcase.js");
        adminMobileScript = readAsset("admin-mobile.js");
        adminMobileCss = org.json.JSONObject.quote(readAsset("admin-mobile.css"));
        content = new FrameLayout(this);
        WebView.setWebContentsDebuggingEnabled(false);
        webView = new WebView(this);
        whatsAppOtp = new NativeWhatsAppOtp(webView);
        cashfreeCheckout = new NativeCashfreeCheckout(this, webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setSafeBrowsingEnabled(true);
        if (usesNgrokPreview()) {
            // loadUrl headers do not reach CSS, scripts or fetch requests. Identify
            // every WebView request as an app client on the temporary ngrok host.
            // Retain Android/WebKit/Chrome tokens for browser feature compatibility.
            settings.setUserAgentString(WebSettings.getDefaultUserAgent(this)
                .replaceFirst("^Mozilla/5\\.0", "EspressoulsterAndroid/1.0"));
        }
        try {
            int version = getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
            if (getPreferences(MODE_PRIVATE).getInt("web_asset_version", 0) != version) {
                // Discard previously cached tunnel HTML masquerading as CSS/JS.
                // Cookies and DOM storage retain the user's account and session.
                webView.clearCache(true);
                getPreferences(MODE_PRIVATE).edit().putInt("web_asset_version", version).apply();
            }
        } catch (android.content.pm.PackageManager.NameNotFoundException ignored) {
            webView.clearCache(true);
        }
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setWebViewClient(new StoreClient());
        webView.setWebChromeClient(new StoreChrome());
        content.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(content);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBackNavigation);
        }
        orderAlerts = new NativeOrderAlerts(this, HOME, this::notificationScope);
        enterFullscreen();
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            if (OPEN_ADMIN.equals(getIntent().getAction())) openAdmin();
            else if (!openOrderAlert(getIntent())) loadStoreUrl(HOME);
        }
        if (savedInstanceState == null && NativeOrderAlerts.SETTINGS_ACTION.equals(getIntent().getAction())) {
            orderAlerts.openSettings();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (OPEN_ADMIN.equals(intent.getAction())) {
            dismissUnavailable();
            openAdmin();
        } else if (NativeOrderAlerts.SETTINGS_ACTION.equals(intent.getAction())) {
            orderAlerts.openSettings();
        } else {
            openOrderAlert(intent);
        }
    }

    private boolean openOrderAlert(Intent intent) {
        if (!NativeOrderAlerts.OPEN_ORDER_ACTION.equals(intent.getAction())) return false;
        String id = intent.getStringExtra(NativeOrderAlerts.ORDER_ID);
        if (id == null || !id.matches("CH-[A-F0-9]{8}")) return false;
        dismissUnavailable();
        if (intent.getBooleanExtra(NativeOrderAlerts.STAFF, false)) {
            loadVerifiedAdminPage = true;
            loadStoreUrl(ADMIN + "?section=orders&order=" + id);
        } else {
            loadStoreUrl(HOME + "?trackOrder=" + id + "#orders");
        }
        return true;
    }

    private NativeOrderAlerts.Scope notificationScope() {
        String url = webView.getUrl();
        if (url == null) return null;
        Uri page = Uri.parse(url);
        if (!isStore(page)) return null;
        String path = page.getPath();
        return "/admin".equals(path) || "/admin/".equals(path)
            ? NativeOrderAlerts.Scope.STAFF : NativeOrderAlerts.Scope.CUSTOMER;
    }

    private void openAdmin() {
        // The backend authenticates approved staff through their verified OTP.
        // Hardware attestation must not block a legitimate account on a new phone.
        loadVerifiedAdminPage = true;
        loadStoreUrl(ADMIN);
    }

    private void preparePinSignIn(String requestId) {
        preparingPinRequest = requestId;
        new Thread(() -> {
            AndroidAdminVerification.Result verification = null;
            String failureCode = null;
            try { verification = AndroidAdminVerification.verify(HOME, CookieManager.getInstance().getCookie(HOME)); }
            catch (Exception failure) { failureCode = AndroidAdminVerification.failureCode(failure); }
            final AndroidAdminVerification.Result result = verification;
            final String errorCode = failureCode;
            runOnUiThread(() -> {
                if (isDestroyed() || !requestId.equals(preparingPinRequest) || webView.getUrl() == null
                        || !isStore(Uri.parse(webView.getUrl()))) return;
                if (result != null && result.cookie != null) {
                    CookieManager.getInstance().setCookie(HOME, result.cookie, stored -> finishPinSignIn(requestId, Boolean.TRUE.equals(stored), Boolean.TRUE.equals(stored) ? null : "session"));
                } else { finishPinSignIn(requestId, result != null && result.verified, errorCode); }
            });
        }, "cafe-pin-app-verification").start();
    }

    private void finishPinSignIn(String requestId, boolean ready, String errorCode) {
        if (isDestroyed() || !requestId.equals(preparingPinRequest) || webView.getUrl() == null
                || !isStore(Uri.parse(webView.getUrl()))) return;
        preparingPinRequest = null;
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('espresso-android-signin',{detail:{requestId:"
            + org.json.JSONObject.quote(requestId) + ",ready:" + (ready ? "true" : "false")
            + (ready || errorCode == null ? "" : ",error:" + org.json.JSONObject.quote(errorCode)) + "}}));", null);
    }

    private void prepareWhatsAppSignIn(String requestId) {
        preparingWhatsAppRequest = requestId;
        whatsAppOtp.stop();
        // Register autofill before requesting the OTP. Staff device verification
        // belongs to the protected staff request, not every customer's autofill.
        whatsAppOtp.begin(this, requestId);
    }

    private void enterFullscreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsets.Type.systemBars());
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    private String readAsset(String name) {
        try (InputStream input = getAssets().open(name);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        } catch (IOException error) {
            throw new IllegalStateException("Could not read bundled asset " + name, error);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterFullscreen();
    }

    private static boolean isHttps(Uri uri, String host) {
        return "https".equals(uri.getScheme()) && host.equals(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443)
            && uri.getUserInfo() == null;
    }

    private boolean isStore(Uri uri) {
        return STORE_ORIGIN.getScheme().equals(uri.getScheme()) && STORE_ORIGIN.getHost().equals(uri.getHost())
            && originPort(STORE_ORIGIN) == originPort(uri) && uri.getUserInfo() == null;
    }

    private static int originPort(Uri uri) {
        if (uri.getPort() != -1) return uri.getPort();
        return "https".equals(uri.getScheme()) ? 443 : 80;
    }

    private boolean usesNgrokPreview() {
        return STORE_ORIGIN.getHost().endsWith(".ngrok-free.dev") || STORE_ORIGIN.getHost().endsWith(".ngrok-free.app");
    }

    private void loadStoreUrl(String url) {
        if (usesNgrokPreview() && isStore(Uri.parse(url))) {
            // ngrok's documented app-client header; TLS and origin checks stay enabled.
            webView.loadUrl(url, java.util.Collections.singletonMap("ngrok-skip-browser-warning", "1"));
        } else webView.loadUrl(url);
    }

    private boolean canLoad(Uri uri) {
        return isStore(uri) || isHttps(uri, "checkout.stripe.com")
            || isHttps(uri, "payments-test.cashfree.com") || isHttps(uri, "payments.cashfree.com")
            || isHttps(uri, "mercury-uat.phonepe.com") || isHttps(uri, "mercury.phonepe.com");
    }

    private void openExternal(Uri uri) {
        String scheme = uri.getScheme();
        if (!"https".equals(scheme) && !"tel".equals(scheme) && !"mailto".equals(scheme)
                && !"upi".equals(scheme)) {
            return;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "No app can open this link.", Toast.LENGTH_SHORT).show();
        }
    }

    private void showUnavailable(Uri failedUrl) {
        retryUrl = canLoad(failedUrl) ? failedUrl.toString() : HOME;
        if (unavailable != null) return;
        unavailable = new LinearLayout(this);
        unavailable.setOrientation(LinearLayout.VERTICAL);
        unavailable.setGravity(Gravity.CENTER);
        unavailable.setPadding(32, 32, 32, 32);
        unavailable.setBackgroundColor(0xFFF6F3EC);
        TextView message = new TextView(this);
        message.setGravity(Gravity.CENTER);
        message.setText("http".equals(STORE_ORIGIN.getScheme())
            ? "Connect your Android phone to the staging USB tunnel, then try again."
            : "Couldn’t open Espressoulster Coffee. Check your connection and try again.");
        message.setTextSize(18);
        unavailable.addView(message);
        Button retry = new Button(this);
        retry.setText("Try again");
        retry.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                dismissUnavailable();
                loadStoreUrl(retryUrl);
            }
        });
        unavailable.addView(retry);
        content.addView(unavailable, new FrameLayout.LayoutParams(-1, -1));
    }

    private void dismissUnavailable() {
        if (unavailable == null) return;
        content.removeView(unavailable);
        unavailable = null;
    }

    private final class StoreClient extends WebViewClient {
        private void announceNativeReady(WebView view, String url) {
            if (url != null && isStore(Uri.parse(url))) {
                String checkoutMode = StoreConfig.CASHFREE_LIVE ? "'live'" : "'test'";
                view.evaluateJavascript("window.espressoCashfreeMode=" + checkoutMode + ";window.espressoWhatsAppAutofill=true;window.espressoAndroidSignIn=true;window.espressoCashfreeCheckout=true;window.espressoLocationSettings=true;window.espressoOrderAlerts=true;window.dispatchEvent(new Event('espresso-native-ready'));", null);
            }
        }

        @Override
        public void onPageCommitVisible(WebView view, String url) {
            // Sign-in may be usable before background images and fonts finish.
            // Do not leave a fast first OTP request waiting for onPageFinished.
            announceNativeReady(view, url);
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            preparingWhatsAppRequest = null;
            preparingPinRequest = null;
            whatsAppOtp.stop();
            Uri page = Uri.parse(url);
            boolean adminPage = isStore(page) && ("/admin".equals(page.getPath()) || "/admin/".equals(page.getPath()));
            view.getSettings().setMediaPlaybackRequiresUserGesture(!adminPage);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (!isStore(Uri.parse(url))) return;
            announceNativeReady(view, url);
            orderAlerts.refresh();
            view.evaluateJavascript(
                "if (location.origin === " + STORE_ORIGIN_JS + ") {\n"
                    + showcaseScript + "\n}",
                null);
            if ("/admin".equals(Uri.parse(url).getPath()) || "/admin/".equals(Uri.parse(url).getPath())) {
                loadVerifiedAdminPage = false;
                view.evaluateJavascript(
                    "if (location.origin === " + STORE_ORIGIN_JS + " && "
                        + "(location.pathname === '/admin' || location.pathname === '/admin/')) {\n"
                        + "const adminMobileCss = " + adminMobileCss
                        + ";\n" + adminMobileScript + "\n}", null);
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (request.isForMainFrame() && request.hasGesture() && isStore(request.getUrl()) && !loadVerifiedAdminPage
                    && ("/admin".equals(request.getUrl().getPath()) || "/admin/".equals(request.getUrl().getPath()))) {
                openAdmin();
                return true;
            }
            if (request.isForMainFrame() && usesNgrokPreview() && isStore(request.getUrl())) {
                loadStoreUrl(request.getUrl().toString());
                return true;
            }
            if (!request.isForMainFrame() || canLoad(request.getUrl())) return false;
            String scheme = request.getUrl().getScheme();
            if (request.hasGesture() || "upi".equals(scheme)) openExternal(request.getUrl());
            return true;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showUnavailable(request.getUrl());
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (request.isForMainFrame() && response.getStatusCode() >= 500) {
                showUnavailable(request.getUrl());
            }
        }
    }

    private final class StoreChrome extends WebChromeClient {
        @Override
        public boolean onJsPrompt(WebView view, String url, String message, String value, JsPromptResult result) {
            // Prompt callbacks include the calling frame's URL. No JavaScript interface is
            // exposed to payment pages, iframes or other origins.
            if (url == null || view.getUrl() == null || !isStore(Uri.parse(url))
                    || !isStore(Uri.parse(view.getUrl()))) { result.cancel(); return true; }
            if ("espresso:location:enable".equals(message)) {
                ensureLocationEnabled(result);
                return true;
            }
            if ("espresso:order-alerts:status".equals(message)) {
                result.confirm(orderAlerts.enabled() ? "enabled" : "disabled");
                return true;
            }
            if ("espresso:order-alerts:refresh".equals(message)) {
                orderAlerts.refresh();
                result.confirm("ready");
                return true;
            }
            if ("espresso:order-alerts:settings".equals(message)) {
                result.confirm("ready");
                view.post(orderAlerts::openSettings);
                return true;
            }
            if ("espresso:cashfree:checkout".equals(message)) {
                if ("/cashfree-checkout".equals(Uri.parse(url).getPath())
                    && "/cashfree-checkout".equals(Uri.parse(view.getUrl()).getPath()) && cashfreeCheckout.open(value)) result.confirm("opened");
                else result.confirm("unavailable");
                return true;
            }
            if (value != null && value.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}")) {
                if ("espresso:app:prepare-signin".equals(message)) {
                    preparePinSignIn(value);
                    result.confirm("ready");
                    return true;
                }
                if ("espresso:whatsapp:start".equals(message)) {
                    prepareWhatsAppSignIn(value);
                    result.confirm("ready");
                    return true;
                }
                if ("espresso:whatsapp:stop".equals(message)) {
                    if (value.equals(preparingWhatsAppRequest)) preparingWhatsAppRequest = null;
                    whatsAppOtp.stop(value);
                    result.confirm("stopped");
                    return true;
                }
            }
            result.cancel();
            return true;
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            boolean wantsCamera = false;
            for (String resource : request.getResources()) {
                if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) wantsCamera = true;
            }
            if (!wantsCamera || !isStore(request.getOrigin()) || cameraRequest != null) {
                request.deny();
            } else if (allowed(Manifest.permission.CAMERA)) {
                request.grant(CAMERA_RESOURCES);
            } else {
                cameraRequest = request;
                requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_REQUEST);
            }
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (cameraRequest == request) cameraRequest = null;
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (!isStore(Uri.parse(origin)) || locationCallback != null) {
                callback.invoke(origin, false, false);
            } else if (hasLocationPermission()) {
                callback.invoke(origin, true, false);
            } else {
                locationOrigin = origin;
                locationCallback = callback;
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_REQUEST);
            }
        }

        @Override
        public void onGeolocationPermissionsHidePrompt() {
            locationCallback = null;
            locationOrigin = null;
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (view.getUrl() == null || !isStore(Uri.parse(view.getUrl()))) return false;
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            try {
                startActivityForResult(params.createIntent(), FILE_REQUEST);
            } catch (ActivityNotFoundException error) {
                fileCallback = null;
                callback.onReceiveValue(null);
            }
            return true;
        }
    }

    private boolean allowed(String permission) {
        return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasLocationPermission() {
        return allowed(Manifest.permission.ACCESS_FINE_LOCATION)
            || allowed(Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    private boolean locationServicesEnabled() {
        LocationManager manager = getSystemService(LocationManager.class);
        if (manager == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return manager.isLocationEnabled();
        return Settings.Secure.getInt(getContentResolver(), Settings.Secure.LOCATION_MODE,
            Settings.Secure.LOCATION_MODE_OFF) != Settings.Secure.LOCATION_MODE_OFF;
    }

    private void finishLocationSettings(boolean enabled) {
        JsPromptResult pending = locationSettingsPrompt;
        locationSettingsPrompt = null;
        locationSettingsDialog = null;
        if (pending != null) pending.confirm(enabled ? "enabled" : "disabled");
    }

    private void ensureLocationEnabled(JsPromptResult result) {
        if (locationServicesEnabled()) { result.confirm("enabled"); return; }
        if (locationSettingsPrompt != null) { result.confirm("disabled"); return; }
        locationSettingsPrompt = result;
        locationSettingsDialog = new AlertDialog.Builder(this)
            .setTitle("Turn on location")
            .setMessage("Turn on location services to find the shortest route to the café.")
            .setNegativeButton("Not now", (dialog, which) -> finishLocationSettings(false))
            .setOnCancelListener(dialog -> finishLocationSettings(false))
            .setPositiveButton("Open settings", (dialog, which) -> {
                locationSettingsDialog = null;
                try {
                    startActivityForResult(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS), LOCATION_SETTINGS_REQUEST);
                } catch (ActivityNotFoundException unavailable) {
                    finishLocationSettings(false);
                }
            })
            .show();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_REQUEST && cameraRequest != null) {
            if (allowed(Manifest.permission.CAMERA)) cameraRequest.grant(CAMERA_RESOURCES);
            else cameraRequest.deny();
            cameraRequest = null;
        } else if (requestCode == LOCATION_REQUEST && locationCallback != null) {
            locationCallback.invoke(locationOrigin, hasLocationPermission(), false);
            locationCallback = null;
            locationOrigin = null;
        } else if (requestCode == NativeOrderAlerts.PERMISSION_REQUEST) {
            orderAlerts.refresh();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_REQUEST && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        } else if (requestCode == LOCATION_SETTINGS_REQUEST && locationSettingsPrompt != null) {
            finishLocationSettings(locationServicesEnabled());
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        webView.saveState(state);
        super.onSaveInstanceState(state);
    }

    @Override
    protected void onPause() {
        orderAlerts.pause();
        CookieManager.getInstance().flush();
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        orderAlerts.resume();
    }

    @Override
    protected void onDestroy() {
        preparingWhatsAppRequest = null;
        if (locationSettingsDialog != null) locationSettingsDialog.dismiss();
        finishLocationSettings(false);
        if (whatsAppOtp != null) whatsAppOtp.stop();
        if (orderAlerts != null) orderAlerts.close();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        handleBackNavigation();
    }

    private void handleBackNavigation() {
        if (webView == null || backPending) return;
        if (unavailable != null) {
            if (webView.canGoBack()) {
                dismissUnavailable();
                webView.goBack();
            }
            return;
        }
        String url = webView.getUrl();
        if (url == null || !isStore(Uri.parse(url))) {
            if (webView.canGoBack()) webView.goBack();
            return;
        }
        // Overlays and local sign-in steps can consume Back before the WebView
        // visits the previous page. With no history, the activity stays open.
        backPending = true;
        webView.evaluateJavascript(
            "window.dispatchEvent(new Event('espresso-android-back',{cancelable:true}))",
            result -> {
                backPending = false;
                if ("true".equals(result) && url.equals(webView.getUrl()) && webView.canGoBack()) {
                    webView.goBack();
                }
            }
        );
    }
}
