# Espressoulster staging source

This branch captures the application source, public assets, migrations, tests, dependency lockfile, and configuration templates present in the running server release `mobile-recovery-1CAOzpkD` on 24 November 2026. It includes the deployed customer and staff WhatsApp sign-in code.

The server serves the customer and Admin interfaces used by the Android app. The Android project and APK build instructions are on [main](https://github.com/tharun0222/espressoulster-mobile/tree/main/android).

Use `npm run build:selfhost` to build the server. The running installation supplies credentials, database access and certificates separately. Operational data and generated build output are excluded from this source snapshot.
