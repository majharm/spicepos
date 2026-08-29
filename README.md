# Spice POS

Full spice-shop till: **Counter**, **Inventory**, **Orders**, **Held**, **Reports**, and **Settings**. The counter opens unlocked so the whole app is on screen.

## Open the till

https://htmlpreview.github.io/?https://github.com/majharm/spicepos/blob/cursor/pos-qa-checklist-fixes-1a88/app.html

Use the left (or top, on a phone) nav to move through every screen. Optional **Lock till** uses PIN `1234`.

Or checkout this branch and open `app.html`.

```bash
npm start
npm test
npm run bundle
```

`http://127.0.0.1:5173` only works on the computer running the server.

## Screens

1. **Counter** — search, spice grid, GST bill, cash/UPI/card.
2. **Inventory** — every SKU and +10 receive.
3. **Orders** — paid bills and reprint.
4. **Held** — parked carts, recall when the live bill is empty.
5. **Reports** — today’s takings by tender, GST, low stock.
6. **Settings** — shop name / GSTIN on receipts, reset demo.
