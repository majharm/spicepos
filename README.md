# Spice POS

Counter POS for a spice shop. Runs in the browser, keeps the shift on this device, and prices everything in **paise** so GST and change cannot drift from floating-point rupees.

## Run

```bash
npm test
python3 -m http.server 5173 --bind 127.0.0.1
```

Open `http://127.0.0.1:5173`. Unlock with PIN **1234**.

Optional browser checklist (needs Chrome + `npm install puppeteer-core`):

```bash
node scripts/e2e.mjs
```

## Shift flow

1. Search or tap a spice pack to add it to the bill.
2. Adjust quantity. Stock is checked against on-hand, including units already in the cart.
3. Pay with **Cash** (enter tender, get change), **UPI**, or **Card**.
4. Use **Hold** if a customer steps aside; **Held** recalls that bill when the live cart is empty.
5. **Orders** reprints a receipt. **Lock** covers the counter.

GST is 5% per line, rounded to the nearest paise. Today’s bill count and takings sit in the top bar.
