# ATAV Multi-Tenant POS

Cloud POS for **many independent businesses** on one platform. Each shop is isolated by `business_id`. Master Admin is separate from Business Admin.

```bash
npm install
cp .env.example .env
npm start
```

Open http://127.0.0.1:5173 — you will be asked to sign in.

## Sign in

| Who | URL | Demo login (local seed) |
| --- | --- | --- |
| Master Admin | `/master.html` | `MASTER_ADMIN_EMAIL` / `MASTER_ADMIN_PASSWORD` in `.env` (default `master@atavpos.local` / `Master@12345` if unset) |
| SWAMI MASALE cashier | `/login.html` | `cashier@swamimasale.local` / `Cashier@12345` |
| Demo second tenant | `/login.html` | `admin@abc-supermart.local` / `Demo@12345` |

New shops use **Create business** on `/login.html` (name, type, category, owner, mobile, email, address, city, state, PIN, optional GST/PAN/logo, admin username and password). Signup starts a 30-day trial and signs the owner in as business admin.


The live SWAMI shop (`swami@atavtelecom.in`) stays a **Business Admin** for that tenant only. Master Admin cannot be that account.

Expired subscriptions keep all data. The shop sees a renewal message until Master Admin extends the plan.

Do not commit `.env`.
