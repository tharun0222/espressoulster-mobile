# WhatsApp sign-in through MSG91

The app sends OTPs from its own backend using MSG91's WhatsApp template endpoint. The existing MSG91 Authkey remains in ignored server environment files. No Authkey or verification code is returned to the browser or APK.

## Connect the existing MSG91 account

1. Open MSG91 → WhatsApp → Number. Connect or select the business sender.
2. Open Templates → Create new template. Choose **Authentication**, **Zero-tap auto-fill**, language **en**, expiry **10 minutes**, TTL **600 seconds**, and enable the security recommendation. The account owner must authorize the Zero-tap terms.
3. Template `espressoulster_signin_otp` was submitted on 19 November 2026. Approval was confirmed on 20 November 2026 in the account’s Approved filter and the authenticated Get Templates API. The app's cheerful greeting is separate; authentication body wording is supplied by Meta.
4. The template's Android package is `com.espressoulster.coffee`, with signature hash `MnUXoKYS/4I` from the existing local APK signing certificate. Keep the same signing key. Register Google's actual app-signing certificate separately when publishing through Play App Signing.
5. Open the approved template's API/code panel. Copy the integrated number, template name, language and namespace into the backend's ignored `.env.selfhost` file. This account currently reports a null namespace; the adapter sends JSON null when no namespace is configured. Do not invent a namespace or paste Authkeys into browser code or APK resources.

```dotenv
PIN_AUTH_OTP_ENABLED=true
CUSTOMER_OTP_ONLY=true
STAFF_OTP_ONLY=true
OTP_DELIVERY_CHANNEL=whatsapp
MSG91_WHATSAPP_NUMBER=919538250038
MSG91_WHATSAPP_TEMPLATE=espressoulster_signin_otp
MSG91_WHATSAPP_LANGUAGE=en
MSG91_WHATSAPP_NAMESPACE=
MSG91_IPV4_ONLY=true
MSG91_WHATSAPP_TEMPLATE_APPROVED=true
```

`MSG91_AUTH_KEY` is already configured locally. Set `MSG91_WHATSAPP_TEMPLATE_APPROVED=true` only after verifying Meta approval and the generated language-specific payload. Restart the local Node app after changing the environment. The local sign-in screen uses WhatsApp OTP only. Customer and admin PIN entry is disabled.

Missing configuration fails closed: no fake OTP, no SMS fallback and no OTP authorization bypass. Sender/template approval and actual delivery remain separate from an API accepting a message. After approval, test with a real WhatsApp recipient and confirm delivery in MSG91 Logs.

## Routing and security

Approved admin numbers use the same phone/code form and receive staff sessions only after OTP verification. Other existing users keep their account ID, orders, subscriptions and profile. New customers use Create account and verify their own number. Android admin attestation remains required when enabled; local preview is restricted to development on loopback.

Codes are random, six digits, HMAC-bound to the number, challenge and purpose, valid ten minutes, rate limited and consumed once. Codes never authorize another account or another purpose. Resending has a server-enforced 60-second cooldown. Already signed-in customer sessions are retained.

## Android autofill

The official MIT-licensed WhatsApp Android OTP SDK is pinned under `android/vendor/whatsapp-otp`. A handshake starts before the message request and targets WhatsApp and WhatsApp Business. Both the zero-tap receiver and one-tap fallback activity validate the SDK's random handshake ID; unsolicited, mismatched, expired and replayed codes are ignored. The server still independently verifies the code before issuing a customer or staff session.

The WebView uses an origin-checked prompt callback rather than a JavaScript interface exposed to arbitrary frames. Autofill is restricted to the configured HTTPS app origin and the current sign-in request. No code or handshake ID is logged or persisted. Navigation, cancellation and Activity destruction clear the listener. Copy/paste remains available in browsers and unsupported devices. The app tells users that requesting a WhatsApp code permits automatic filling on supported Android phones.

Native Android changes require an updated APK installation; an already installed APK cannot receive new Java receivers through a webpage refresh. No new APK was generated for this task. A physical Android phone was not connected over ADB during these checks, so actual WhatsApp delivery and device autofill remain unverified.

Both configured admins (`8220025037`, `8904397434`) get staff-only sessions after OTP verification. Both have operator permissions for live orders, payments, tables, chat, duty status and foreground order alerts. No customer session is issued to either admin number.

On a fresh Android installation, the OTP form first encounters the protected staff route, requests native app verification, then retries the same request once. Device proof does not replace OTP verification, approved-number checks, or server-side authorization. Ordinary customer requests do not invoke staff enrollment. App verification can take up to 90 seconds across its native HTTPS round trips; leaving the page cancels the pending browser listener.

Each approved number may sign in on multiple supported phones. Each phone gets its own app-proof cookie and OTP-verified staff session; logging in on the second phone does not revoke the first phone's session. A staff session expires after eight hours. OTP resend cooldown and attempt limits still apply to the mobile number.

Android Admin requires Android 8 or newer, supported Google hardware-backed attestation and verified, locked boot. This deliberately excludes browser Admin, untrusted signing certificates, rooted/unlocked devices and emulators without valid hardware attestation. Therefore universal access on every kind of phone is not established. Current and legacy Google RSA root certificates are accepted by the same pinned Google public key, alongside the 2026 ECDSA root. All chain signatures, revocation, app package/signing digest and fresh challenge checks remain required. Official trust-anchor guidance: https://developer.android.com/privacy-and-security/security-key-attestation.

Staff alerts currently work through polling while Admin is visible. Closed-app/background staff push is not implemented by the customer-native notification helper. Actual WhatsApp delivery, native proof and sounds still require supported physical-phone testing.

For an Admin login diagnosis, the server may temporarily enable `ANDROID_ADMIN_DIAGNOSTICS=true`. The Android verification routes then log only fixed stage/reason enums (for example `status/unverified`, `challenge/issued`, `verify/boot_unverified`). They never log phone numbers, IP addresses, certificates, challenges, signatures, session tokens or cookies, and the public response remains unchanged. Disable this switch after the diagnosis. The native handoff reports only a safe category (`network`, `device` or `session`), so the form explains the failed step instead of wrongly telling an installed-app user to open the Android app. A missing row in `android_admin_challenges` alone is not proof that the endpoint was never reached: verification consumes the challenge before validating the device proof.

Official references:
- https://msg91.com/help/whatsapp/whatsapp-otp
- https://docs.msg91.com/en/whatsapp/template-bulk
- https://msg91.com/help/whatsapp/step-by-step-process-to-configure-whatsapp-api-in-msg91/
- https://github.com/WhatsApp/WhatsApp-Android-OTP-SDK
- https://github.com/WhatsApp/WhatsApp-OTP-Sample-App

## Existing IP allowlist

The key’s IP security stays enabled and its allowlist has not changed. The computer’s existing allowed IPv4 address works; its IPv6 address is rejected by MSG91. The server-only MSG91 transport therefore uses IPv4 for MSG91 HTTPS requests, retaining TLS certificate verification, request cancellation and timeouts. It never follows redirects or forwards the Authkey to another host. Re-check the allowlisted address if the computer’s internet connection changes.

Staging can route WhatsApp requests through a private Unix socket on the backend using `MSG91_RELAY_SOCKET`. An SSH reverse forward from a machine on the approved network can connect that socket to `control.msg91.com:443`. TLS still runs between staging and MSG91, with certificate checks enabled. The forward carries only this provider’s traffic. Check provider access from the approved machine before enabling the socket on staging. If MSG91 returns 418 through the forward, restore the approved network connection before trying sign-in again.
