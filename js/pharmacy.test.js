import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateFefo,
  billTotals,
  expiryStatus,
  gstinStateCode,
  isInterstate,
  purchaseLineTotals,
  saleLineTotals,
  splitGst,
} from "./pharmacy.js";

test("GST split is intra-state CGST/SGST and inter-state IGST", () => {
  const intra = splitGst({ taxable: 100, gstRate: 12, interstate: false });
  assert.equal(intra.gst, 12);
  assert.equal(intra.cgst, 6);
  assert.equal(intra.sgst, 6);
  assert.equal(intra.igst, 0);
  const inter = splitGst({ taxable: 100, gstRate: 12, interstate: true });
  assert.equal(inter.igst, 12);
  assert.equal(inter.cgst, 0);
});

test("purchase line stock includes free quantity and GST on billed packs", () => {
  const line = purchaseLineTotals({
    packQty: 10,
    unitsPerPack: 10,
    freeQty: 10,
    purchaseRate: 50,
    discount: 20,
    gstRate: 12,
  });
  assert.equal(line.totalQty, 100);
  assert.equal(line.stockQty, 110);
  assert.equal(line.taxable, 480);
  assert.equal(line.gst, 57.6);
  assert.equal(line.total, 537.6);
});

test("sale line is qty × rate, not grams per kg", () => {
  const line = saleLineTotals({ qty: 2, rate: 35, gstRate: 12, mrp: 40 });
  assert.equal(line.taxable, 70);
  assert.equal(line.amount, 78.4);
});

test("pharmacy bill rounds off and tracks due", () => {
  const totals = billTotals({
    lines: [saleLineTotals({ qty: 1, rate: 33.33, gstRate: 12 })],
    billDiscount: 0,
    amountPaid: 30,
  });
  assert.equal(totals.subtotal, 33.33);
  assert.equal(totals.gst, 4);
  assert.equal(totals.grandTotal, 37);
  assert.equal(totals.roundOff, -0.33);
  assert.equal(totals.due, 7);
});

test("FEFO allocates earliest expiry first and refuses oversell", () => {
  const batches = [
    { id: "b2", batch_no: "B2", expiry_date: "2027-01-01", qty: 5 },
    { id: "b1", batch_no: "B1", expiry_date: "2026-10-01", qty: 3 },
  ];
  const ok = allocateFefo(batches, 4);
  assert.equal(ok.ok, true);
  assert.deepEqual(
    ok.allocations.map((a) => [a.batch_no, a.take]),
    [
      ["B1", 3],
      ["B2", 1],
    ],
  );
  assert.equal(allocateFefo(batches, 20).ok, false);
});

test("expiry status flags expired and near-expiry batches", () => {
  assert.equal(expiryStatus("2020-01-01", new Date("2026-09-12")), "expired");
  assert.equal(expiryStatus("2026-10-01", new Date("2026-09-12")), "near");
  assert.equal(expiryStatus("2028-01-01", new Date("2026-09-12")), "ok");
});

test("GSTIN state codes detect inter-state purchase/sale", () => {
  assert.equal(gstinStateCode("27AABCU9603R1ZX"), "27");
  assert.equal(isInterstate("27AABCU9603R1ZX", "24AAAAA0000A1Z5"), true);
  assert.equal(isInterstate("27AABCU9603R1ZX", "27AAAAA0000A1Z5"), false);
  assert.equal(isInterstate("27AABCU9603R1ZX", ""), false);
});
