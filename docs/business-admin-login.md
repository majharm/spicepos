# Business Admin login: WhatsApp OTP or 6-digit PIN

Business Admin sign-in stays User ID and password first. A second check runs only after that password is valid, and only when that admin has turned on WhatsApp OTP or saved a PIN. Cashiers, other staff, and Master Admin are unchanged. Master Admin impersonation does not ask for the shop PIN or OTP.

WhatsApp OTP and the PIN are alternative checks. They are not combined into multi-factor authentication, and a PIN alone is not treated as a second independent factor.

## When the second check starts

- No security row, OTP off, and no PIN: password login issues the session as before.
- WhatsApp OTP login is on and the WhatsApp number is verified: the password response is a challenge and no `pos_sid` cookie.
- A PIN hash exists: same challenge path. The admin can choose WhatsApp OTP, the PIN, or whichever of the two is available.
- Enabling OTP requires a verified WhatsApp number. Saving, changing, or resetting a PIN requires a fresh WhatsApp code to that number.

## OTP

- Six digits, 5-minute expiry, single use. A resend replaces the previous code.
- Resend cooldown is 45 seconds.
- Five wrong attempts end that challenge.
- Send limits: 5 per account, 20 per IP, and 8 per device in 15 minutes.
- The code is sent with the existing WAMaster send API as an authentication message. It is not returned by the API and is not written to application logs.
- Login errors on the OTP and PIN steps stay generic. They do not say whether a User ID or WhatsApp number exists. The existing password errors (`Invalid login`, `User is inactive`, `Account locked`) are unchanged.

## PIN

- Six digits, stored only as an Argon2id hash (`m=19456`, `t=2`, `p=1`).
- Five failures lock the account and the device for 15 minutes.
- Settings path: Business Admin, Settings, Security & Login.
- Password changes, PIN changes, WhatsApp verification, and turning OTP login on revoke other sessions for that admin. The current session stays.

## API

- `POST /api/auth/login`
- `POST /api/auth/otp/send`
- `POST /api/auth/otp/verify`
- `POST /api/auth/pin/verify`
- `POST /api/auth/pin/setup`
- `POST /api/auth/pin/reset`
- `GET /api/auth/security/settings` and `POST /api/auth/security/settings`
- `GET /api/auth/login/history`
- `POST /api/auth/session/revoke`

The PHP fallback implements the same routes. If that PHP build cannot verify Argon2id, PIN checks fail closed and do not issue a session. WhatsApp OTP still works there. Node is the path that hashes new PINs when PHP has no Argon2id.

## Deploy

Ship the Node app and these files together: `server/admin-security.js`, `server/admin-pin.js`, `server/admin-security-rules.js`, `pos-admin-security.php`, `js/login-verify.js`, and `js/security-login.js`. Tables are created on first use and are also in `scripts/base-schema.sql`. Login history is kept for 180 days. OTP rows are kept for 2 days. Revoked device rows are kept for 90 days. Shop deletion already removes every table that has `business_id`, including these.

Cookies stay HttpOnly and SameSite=Lax, and Secure on HTTPS. State-changing auth requests with an `Origin` header must match the host. The challenge is bound to the account, the device id, and an expiry, and it cannot be reused after a successful check.
