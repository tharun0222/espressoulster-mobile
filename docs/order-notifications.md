# Order notifications

## Android

Customer notifications cover order received, accepted, preparing, ready, completed, cancelled and out for delivery. The ready message distinguishes pickup from dine-in service. Tap a notification to open its order.

Approved café operators receive a separate new-order notification using the Espresso House tone. It opens the matching order in Admin. The backend includes only committed orders and excludes Coffee Pass receipts. An operator can manage the channel under **Admin menu → Order alerts**. Customers can use **Profile → Notification settings**. Android notification permission and the corresponding channel must be enabled.

### Delivery while Android is closed

Firebase Cloud Messaging wakes the Android receiver without opening the café screen. The receiver uses the same notification channels and deduplication as the foreground fallback. Android's system notification permission and channel settings apply. The app must be opened again after an Android force stop.

For staging, register `com.espressoulster.coffee.staging` in the café's Firebase project. Build the APK with `ESPC_ANDROID_FIREBASE_CONFIG` pointing to that app's downloaded `google-services.json`. The build checks that the configuration names the selected Android package. The production package is `com.espressoulster.coffee`.

Apply `server/postgres/android-order-push.sql` to the staging PostgreSQL database in the usual deployment migration step. Set `ANDROID_PUSH_PROJECT_ID` to the same Firebase project and `GOOGLE_APPLICATION_CREDENTIALS` to the backend-only credential file for an identity allowed to send FCM messages. Keep this credential outside the repository and the APK. The backend starts its delivery worker when those settings are present. Registration requires an active session and the existing operator role for staff alerts. Logout removes a device's registration for that session.

To verify live delivery, sign in and allow notifications on one customer Android device and one approved Admin device. Close the app from Recents on both. Create a test order from a separate client and verify that Admin receives it with the Espresso House tone. Advance the order and verify that the customer receives the update. Tap both notifications to verify their matching order opens.

The emulator check in `tests/android/run-order-push.sh` exercises native rendering, device binding, the bundled Admin audio and deduplication with an injected payload. It does not require Firebase credentials. The PostgreSQL test in `tests/android-order-push.test.mjs` uses a mocked provider.

## Browser

Admin order status changes send an encrypted Web Push message to the customer's registered browser devices. In-app alerts also catch intermediate order events between refreshes.

Customers connect each device in Profile → Notification settings. Notification clicks open that exact order. Signing out unregisters the current device. Expired push subscriptions are removed after a 404/410 response.

Apply `drizzle/0034_order_push_subscriptions.sql` to each deployment. Configure these server secrets:

- `VAPID_SERVER_PUBLIC_KEY`: uncompressed P-256 public key, base64url.
- `VAPID_SERVER_PRIVATE_KEY`: matching private scalar, base64url.
- `VAPID_SUBJECT`: a real operator contact URI (`mailto:` or HTTPS) for production.

Local test keys are in the ignored `.env` file; private keys never go to the browser. Keep keys stable or existing subscriptions will need to be renewed. Production requires its own persistent configuration and device opt-in on that origin.

Browser push was checked with encrypted-payload tests and browser registration. Delivery depends on the device, browser, OS notification settings, and push provider.
