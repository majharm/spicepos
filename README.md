# Medical POS — Pharmacy billing

Pharmacy / medical POS on the live MySQL shop: **Supplier → Purchase → Batch → Stock → Expiry → Sales → Pharmacy Bill → Return → Reports**.

Copy `.env.example` to `.env` and set the database user/password. Do not commit `.env`.

```bash
npm install
npm start
```

Open http://127.0.0.1:5173

Default business: `00000000-0000-4000-8000-000000000001`.

## Modules

- **Medicines** — item name, generic, type, manufacturer, HSN, pack, MRP, selling/purchase price, GST, barcode, reorder level
- **Suppliers** — firm, address, GSTIN, PAN, drug licence, FSSAI, state/city
- **Purchases** — invoice, payment, e-way bill, batch no., expiry, free qty, GST split (CGST/SGST/IGST)
- **Stock / Expiry** — FEFO batches, 90-day near-expiry and expired flags
- **Pharmacy bill** — medicine table (batch, expiry, pack, qty, MRP, rate, GST), round off, payment, licence footer
- **Returns** — restock to the original batch
- **Settings** — Drug Licence, GSTIN, FSSAI, pharmacy registration, other licences, validity

On first boot the server adds the extra MySQL columns and `item_batches` / `sales_returns` tables.

## Deploy (Git — no FTP)

Hostinger should pull this repo from GitHub as a **Node.js web app**.

1. Push the branch you want live (`main` for production).
2. hPanel → **Websites** → **Add website** → **Node.js web app** → **Import Git repository**.
3. Connect GitHub, pick `majharm/spicepos`, then set Framework **Express**, Node.js **20**, entry file **`server.js`**.
4. Add environment variables (same keys as `.env.example`).
5. Click **Deploy**. Each `git push` to the connected branch installs dependencies and restarts Express.

From a clean working tree:

```bash
./scripts/deploy-via-git.sh
```
