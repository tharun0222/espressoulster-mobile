# Mobile number and PIN sign-in — local implementation

Status: implemented and tested locally; production publication and migration await separate approval under the user's Gate 6. Production version 67 and runtime settings have not been changed.

Flow: new user enters +91 mobile number, six-digit PIN and confirmation. Returning user selects Sign in and enters mobile/PIN. A valid server session persists for 30 days. Sign-out revokes that PIN session without signing out an administrator in another tab.

PIN mode is enabled only with CUSTOMER_AUTH_MODE=pin and a unique high-entropy PIN_AUTH_SECRET of at least 32 characters. Keep this secret server-side and stable; changing it without a credential migration prevents existing PIN logins. Local preview uses an isolated fixture secret, never suitable for production.

Security: PBKDF2-SHA256 (100,000 iterations), random per-account salt and server pepper; no plaintext PIN storage. HttpOnly/SameSite=Lax cookies (Secure on HTTPS); hashed session tokens. Five attempts per mobile/15 minutes, ten per IP/15 minutes, global ceiling and atomic reservations. Unknown numbers and incorrect PINs return the same error. OTP/tester creation is disabled in PIN mode; hosted/admin identities cannot bypass the customer PIN gate. PIN users never gain administrator or verified-phone status.

Mobile numbers are identifiers, not proof of possession. No PIN-only recovery is provided. An existing verified-phone account cannot be claimed by registering a PIN. Previous tester/hosted/phone records remain intact, and are not silently merged into new PIN accounts.

Database: additive migration drizzle/0019_mobile_pin_signin.sql creates pin_accounts, pin_sessions and pin_login_attempts, with indexes. No existing business records are updated or deleted. The separate unfinished WhatsApp checkout has its own 0019 migration; do not merge both numbered migrations without reconciling numbering.

Validation: TypeScript and production build passed. 21 PIN/identity/logout checks passed, plus 180 existing pricing/payment/request regressions (201 automated checks total). Thirteen HTTP API checks against the built isolated local Worker passed. Browser evidence/report are outside the source checkout in ../reports/mobile-pin-2026-10-14. The older full backend suite was not rerun; its known stale admin-bootstrap assertions remain a separate audit finding.

Release checklist after approval: reconcile source with the current hosted commit; preserve public audience and existing payment secrets; apply only this additive migration; generate and securely configure a production PIN_AUTH_SECRET; set CUSTOMER_AUTH_MODE=pin; publish the tested version; verify registration, returning login, protected APIs, logout and admin access. Never copy the local fixture secret into production.

Rollback: restore the preceding source and CUSTOMER_AUTH_MODE value. Retain the additive PIN tables and all created customer records for reconciliation. Do not drop tables or reset the database. Preserve the production pepper for a future forward migration. Payments, prices, Petpooja and WhatsApp message sending are outside this change.
