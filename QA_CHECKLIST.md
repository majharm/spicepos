# Spice POS QA checklist

Executed automatically by `node scripts/e2e.mjs` (Chrome) plus `npm test`. Re-run both after checkout changes.

## Counter lock

- [x] Wrong PIN stays locked and shows an error.
- [x] PIN 1234 unlocks after Lock till.
- [x] Counter, Inventory, Orders, Held, Reports, and Settings are all reachable.
- [x] Lock returns the PIN screen; cart contents are still there after unlock.

## Catalog and cart

- [x] Search filters by name and SKU (`tur`, `SAF-001`).
- [x] Tapping a card adds one pack and updates line total and GST.
- [x] Plus/minus change qty; minus at 1 removes the line.
- [x] Adding more than on-hand stock is refused (saffron is the tight SKU).
- [x] Out-of-stock cards are not addable.

## Money

- [x] Totals use Indian grouping (`₹1,234.56` style), not JS floats like `94.499999`.
- [x] GST is 5% of the taxable line, rounded to nearest paise, summed per line.
- [x] Cash with tender below total is refused; stock does not move.
- [x] Cash with extra tender shows the correct change on the receipt.
- [x] UPI/Card charge the GST-inclusive total with ₹0.00 change.
- [x] Tender parser rejects `12.345` and empty cash.

## Hold, recall, orders

- [x] Empty cart cannot be held or paid.
- [x] Hold clears the live cart; Held list can recall it.
- [x] Recall is blocked while another bill is still in the cart.
- [x] Paid bill decrements stock and appears under Orders.
- [x] Opening an order shows an escaped receipt (no HTML injection).

## Persistence

- [x] Reload keeps products, cart, held bills, and orders.
- [x] Today’s takings ignore bills dated on another calendar day.
- [x] Corrupt `localStorage` key `spicepos.v2` reseeds instead of crashing.

## Automated

- [x] `npm test` passes (`js/money.test.js`, `js/store.test.js`).
- [x] Headless Chrome checklist (`scripts/e2e.mjs`) against a running `python3 -m http.server 5173`.

### Spot checks from the last e2e run

- 2× turmeric 100 g: taxable ₹90.00, GST ₹4.50, total ₹94.50
- Cash tender ₹1,000.00 → change ₹905.50; turmeric stock 48 → 46
- UPI bill: GST-inclusive total, change ₹0.00
