# WhatsApp OTP Android SDK

Source: https://github.com/WhatsApp/WhatsApp-Android-OTP-SDK
Pinned commit: 580df49f15404ec23c3eeb43f138410e3faa37c7 (MIT).

Vendored for this project’s Java/aapt build. Only compile-time AndroidX nullability annotations were removed and BuildConfig.DEBUG was replaced with false. The upstream handshake, UUID validation and OTP extraction logic are unchanged. No MSG91 keys belong here.
