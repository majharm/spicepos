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

## Hostinger Node.js (Business Web Hosting)

This app is **Express + MySQL**, not a React/Vite frontend. In hPanel use **Node.js web app** with these settings:

| Field | Value |
| --- | --- |
| Framework preset | **Express** (not React, Vite, or Next.js) |
| Node.js version | **20.x** (22.x also works) |
| Package manager | **npm** |
| Build command | leave **blank** (no frontend build) |
| Output directory | leave **blank** |
| Entry file | `server.js` (or `index.js` / `app.js`) |

Do **not** deploy this as a normal PHP/static website in `public_html`. Create **Add website → Node.js web app → Express**, with **no output directory** and **no build command**.

If the site shows **403 Forbidden** or Hostinger **This Page Does Not Exist** for `/api/health`:
1. This repo must **not** contain `.htaccess` (Hostinger writes that file itself).
2. In hPanel open the **Node.js web app** for `pos.atavtelecom.in` (not a static/PHP website).
3. Click **Redeploy** so Hostinger regenerates `public_html/.htaccess` with the CloudLinux Passenger block.
4. **Restart** the Node process (entry `server.js`, Express, empty build/output).
5. Open `/api/health` and `/pos-api.php?p=health`. After this change `/api/health` is a real PHP folder so it should return JSON (either POS health or a message that Node is not running). If it says Node is not running, the domain is only serving PHP/HTML — attach a **Node.js web app** to `pos.atavtelecom.in` and Restart. Optionally create `pos-node.json` from `pos-node.json.example` with the port shown in hPanel.

Hostinger sets `PORT` and `NODE_ENV=production`. The process must listen on `process.env.PORT` (already wired).

### MySQL

Create the database in hPanel → **Databases** (or keep the existing shop DB). Put credentials in **Environment variables**, not in Git:

```
NODE_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_NAME=...
DB_USER=...
DB_PASSWORD=...
MASTER_ADMIN_EMAIL=...
MASTER_ADMIN_PASSWORD=...
BUSINESS_ID=00000000-0000-4000-8000-000000000001
```

Use `DB_HOST=localhost` when MySQL is on the same Hostinger account. If the database is remote, use that host and allow the hosting IP. Optional: `DATABASE_URL=mysql://user:pass@localhost:3306/dbname`.

Do **not** use the Web App “Connect a database” wizard (that is for Supabase/Mongo). This POS uses Hostinger MySQL via `mysql2`.

### Deploy

1. Push this repo to GitHub.
2. hPanel → Websites → Add website → **Node.js web app** → Import Git repository.
3. Confirm Express, entry `server.js`, no build command.
4. Paste environment variables, then Deploy.
5. After a green build, open Runtime Logs. You should see `Multi-tenant POS listening on …`.
6. Open `/login.html` and `/master.html` on your domain.

If login shows a web-page error, Apache is answering instead of Node. Open `https://your-domain/pos-api.php?p=health`. Confirm framework **Express**, entry **`server.js`**, build command empty, then **Restart**. Also set `DB_HOST=localhost` (same-account MySQL) or the process may crash before it can serve the API.

If the domain is still a PHP site, open **`/setup.html`** and save MySQL settings (`DB_HOST=localhost` plus name, user, password). That writes `pos-db.php` on the server (Git will not deploy secrets). Prefer attaching a **Node.js web app** for the till.


Schema updates run on boot (`ensureSchema`). Master Admin is created from `MASTER_ADMIN_EMAIL` / `MASTER_ADMIN_PASSWORD` if that email is not already in `platform_admins`.

