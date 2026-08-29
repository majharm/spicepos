# Spice POS

Browser counter for a spice shop. Totals are integer **paise**, so GST and change do not drift.

## Open the till

Use this link on your laptop (not `127.0.0.1` — that is only the Cloud Agent VM):

https://htmlpreview.github.io/?https://github.com/majharm/spicepos/blob/cursor/pos-qa-checklist-fixes-1a88/app.html

Click **Fill demo PIN 1234**.

You can also open `app.html` directly after checking out this branch.

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
