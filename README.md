# Spice POS — SWAMI MASALE SASWAD

Reconnects to the **old Replit MySQL** (Hostinger) and shows the live shop: items in grams, B2B/B2C rates, packs, sales orders, purchases, suppliers.

Copy `.env.example` to `.env` and set the database user/password. Do not commit `.env`.

```bash
npm install
npm start
```

Open http://127.0.0.1:5173

Default business: `00000000-0000-4000-8000-000000000001` (`company_settings.name` = SWAMI MASALE SASWAD).

## Deploy (Git — no FTP)

Hostinger should pull this repo from GitHub as a **Node.js web app**. Do not upload files with FTP, File Manager, or a zip.

1. Push the branch you want live (`main` for production).
2. hPanel → **Websites** → **Add website** → **Node.js web app** → **Import Git repository**.
3. Connect GitHub, pick `majharm/spicepos`, then set:
   - Framework: **Express**
   - Branch: **`main`** (or the branch you deploy from)
   - Node.js: **20**
   - Build command: **blank**
   - Output directory: **blank**
   - Entry file: **`server.js`**
4. Add environment variables (same keys as `.env.example`; use `DB_HOST=localhost` when MySQL is on the same Hostinger account). Never commit `.env`.
5. Click **Deploy**. After the first build, every `git push` to the connected branch installs dependencies and restarts Express.

From a clean working tree:

```bash
./scripts/deploy-via-git.sh
```

That runs tests, pushes the current branch, and tags `deployN` so a Hostinger deployment matches a commit. To rebuild the same branch without a new push: hPanel → **Deployments** → **Redeploy**.

GitHub Actions (`.github/workflows/hostinger-git-deploy.yml`) runs `npm test` on pushes so broken JS is caught before Hostinger restarts.

## QR ordering

Customers scan the shop QR (POS → **QR orders** → Print poster) and place a gram-based retail order at `/order.html`. Incoming tickets show on the till. **Complete & bill** creates a normal sales order, finds or creates the customer by mobile, and deducts stock.
