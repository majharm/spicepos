# Spice POS

Browser counter for a spice shop. Totals are integer **paise**, so GST and change do not drift.

## Open the till

**Live demo (this branch):**  
https://raw.githack.com/majharm/spicepos/cursor/pos-qa-checklist-fixes-1a88/index.html

Click **Fill demo PIN 1234**. Or type `1234` and Unlock.

`http://127.0.0.1:5173` only works on the machine that is running the server. It will not load from a Cloud Agent if you open that address on your laptop.

You can also double-click `index.html` after checking out this branch — no install needed.

```bash
npm start
```

Then open http://127.0.0.1:5173 on **that same computer**.

```bash
npm test
npm run bundle
```

## Shift flow

1. Search or tap a spice pack to add it to the bill.
2. Adjust quantity. Stock is checked against on-hand, including units already in the cart.
3. Pay with **Cash** (enter tender, get change), **UPI**, or **Card**.
4. Use **Hold** if a customer steps aside; **Held** recalls that bill when the live cart is empty.
5. **Orders** reprints a receipt. **Lock** covers the counter.

GST is 5% per line, rounded to the nearest paise. Today’s bill count and takings sit in the top bar.
