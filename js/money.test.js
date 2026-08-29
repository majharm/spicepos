import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changeDue,
  formatINR,
  lineAmounts,
  parseMoneyInput,
  rupeesToPaise,
  sumCart,
} from "./money.js";

test("never uses floating rupees for GST line totals", () => {
  const line = lineAmounts(3333, 3, 500);
  assert.equal(line.taxable, 9999);
  assert.equal(line.tax, 500);
  assert.equal(line.total, 10499);
});

test("Indian grouping in currency format", () => {
  assert.equal(formatINR(123456), "₹1,234.56");
  assert.equal(formatINR(0), "₹0.00");
});

test("cart GST is summed per line, not on the basket subtotal", () => {
  const totals = sumCart([
    { unitPaise: 4500, qty: 2, gstBps: 500 },
    { unitPaise: 18500, qty: 1, gstBps: 500 },
  ]);
  assert.equal(totals.taxable, 27500);
  assert.equal(totals.tax, 1375);
  assert.equal(totals.total, 28875);
});

test("cash shortfall is rejected; exact and overpay compute change", () => {
  assert.equal(changeDue(10000, 9999).ok, false);
  assert.equal(changeDue(10000, 10000).change, 0);
  assert.equal(changeDue(10000, 15000).change, 5000);
});

test("money parser rejects extra decimals and commas-only junk", () => {
  assert.equal(parseMoneyInput("12.345").ok, false);
  assert.equal(parseMoneyInput("₹1,250.50").paise, 125050);
  assert.equal(parseMoneyInput("").ok, false);
  assert.equal(rupeesToPaise(10.5), 1050);
});
