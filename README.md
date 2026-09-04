# Spice POS — SWAMI MASALE SASWAD

Reconnects to the **old Replit MySQL** (Hostinger) and shows the live shop: items in grams, B2B/B2C rates, packs, sales orders, purchases, suppliers.

Copy `.env.example` to `.env` and set the database user/password. Do not commit `.env`.

```bash
npm install
npm start
```

Open http://127.0.0.1:5173

Default business: `00000000-0000-4000-8000-000000000001` (`company_settings.name` = SWAMI MASALE SASWAD).

## QR ordering

Customers scan the shop QR (POS → **QR orders** → Print poster) and place a gram-based retail order at `/order.html`. Incoming tickets show on the till. **Complete & bill** creates a normal sales order, finds or creates the customer by mobile, and deducts stock.
