# Mobile number and OTP sign-in

Implemented a branded opening screen, +91 phone validation, OTP entry/autofill, change-number and 60-second resend countdown, guest browsing, secure server verification and seven-day hashed cookie sessions. Returning verified numbers use a stable account. Phone sessions never confer administrator access. Existing tester accounts remain separate during PUBLIC_TEST_MODE.

Provider integration: Twilio Verify. Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID as private runtime values. Service requires an activated, funded provider account and deliverability setup for India as required by the provider. No account, billing or SMS credentials were available during implementation. Config reports disabled, send/verify return 503, and the UI explicitly states SMS sign-in is being set up. There is no fixed code or simulated success. Live SMS and real-device verification have not been tested and cannot operate until configured.

Security: OTP verified only with provider-approved status and matching number. 10-minute app challenge expiry, five check attempts, single-use challenge, atomic send budgets (3/phone/hour, 10/IP/hour, 100 global/hour), 60-second resend interval. Sessions use random 256-bit tokens stored only as SHA-256 hashes, HttpOnly, SameSite=Lax and Secure under HTTPS. Mutations retain same-origin guard. Provider errors are redacted. Phone ownership verification does not grant admin privileges.

Validation: TypeScript passed. Six pure/provider-mock verification tests passed (validation, missing credentials, SMS endpoint, approved status/phone matching, provider errors, cookie validation). All 60 backend integration tests passed, including unavailable-provider fail-closed responses and logout. Mock tests are not evidence of live SMS delivery. New auth tables are additive; existing orders and tester records are preserved.

Provider references: https://www.twilio.com/docs/verify/api/verification and https://www.twilio.com/docs/verify/api/verification-check .

Browser QA at 390 x 844 passed: branded mobile-number screen, +91 input, clear SMS setup notice, disabled Get OTP, accessible guest action and no horizontal overflow. Guest action reached /#menu with menu cards visible. Screenshot: mobile.png. OTP-entry UI and live authentication still require a configured provider for browser end-to-end verification.

Opening-screen correction: legacy tester and ChatGPT sessions no longer skip the phone welcome screen. Only a server-verified phone session skips it. Guest browsing applies to the current app load; refreshing presents the welcome again for non-phone sessions.

Final user-requested flow supersedes guest behavior: login now precedes the existing splash animation and customer app. A verified phone session persists for 30 days on the same browser; then the user must verify again. No guest bypass remains. Live SMS is not configured, so new users cannot complete sign-in until provider credentials are added. Existing customer data is retained, but old tester/ChatGPT identities do not count as phone verification.

Final verification: main URL /#orders at 390 x 844 opens the phone login directly, without displaying the splash or customer orders first. SMS unavailable notice remains explicit and guest bypass is absent. Evidence: login-first.png. Production build and typecheck passed; 60 backend checks passed after session changes.
