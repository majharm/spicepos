# Spice POS QA checklist

Use this after any change to money, stock, or checkout. Check an item only when the step was executed, not when the code merely looks correct.

## Counter lock

- [ ] Wrong PIN stays locked and shows an error.
- [ ] PIN 1234 unlocks the catalog and cart.
- [ ] Lock returns the PIN screen; cart contents are still there after unlock.

## Catalog and cart

- [ ] Search filters by name and SKU (`tur`, `SAF-001`).
- [ ] Tapping a card adds one pack and updates line total and GST.
- [ ] Plus/minus change qty; minus at 1 removes the line.
- [ ] Adding more than on-hand stock is refused (saffron is the tight SKU).
- [ ] Out-of-stock cards are not addable.

## Money

- [ ] Totals use Indian grouping (`₹1,234.56` style), not JS floats like `94.499999`.
- [ ] GST is 5% of the taxable line, rounded to nearest paise, summed per line.
- [ ] Cash with tender below total is refused; stock does not move.
- [ ] Cash with extra tender shows the correct change on the receipt.
- [ ] UPI/Card charge the GST-inclusive total with ₹0.00 change.
- [ ] Tender parser rejects `12.345` and empty cash.

## Hold, recall, orders

- [ ] Empty cart cannot be held or paid.
- [ ] Hold clears the live cart; Held list can recall it.
- [ ] Recall is blocked while another bill is still in the cart.
- [ ] Paid bill decrements stock and appears under Orders.
- [ ] Opening an order shows an escaped receipt (no HTML injection).

## Persistence

- [ ] Reload keeps products, cart, held bills, and orders.
- [ ] Today’s takings ignore bills dated on another calendar day.
- [ ] Corrupt `localStorage` key `spicepos.v1` reseeds instead of crashing.

## Automated

- [ ] `npm test` passes (`js/money.test.js`, `js/store.test.js`).
