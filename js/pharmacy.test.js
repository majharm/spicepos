import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateFefo,
  billTotals,
  cartBatchPreview,
  expiryDateToMonth,
  expiryMonthToDate,
  expiryStatus,
  primaryBatch,
  formatGstin,
  gstinStateCode,
  gstinStateName,
  isInterstate,
  isValidGstin,
  looseMrp,
  looseSaleRate,
  looseUnitLabel,
  MEDICINE_TYPES,
  mergeSaleLines,
  packSaleRate,
  PACK_TYPES,
  parseUnitsFromPackSize,
  unitsPerPack,
  partyStateCode,
  purchaseLineTotals,
  remainingReturnQty,
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

test("cart batch preview picks earliest expiry batch (FEFO)", () => {
  const item = { pack_unit: "Strip", stock_gm: 0 };
  const batches = [
    { id: "b2", batch_no: "B2", expiry_date: "2027-06-01", qty: 20 },
    { id: "b1", batch_no: "B1", expiry_date: "2026-08-01", qty: 15 },
  ];
  const preview = cartBatchPreview(batches, item, 2);
  assert.equal(preview.batchNo, "B1");
  assert.equal(preview.expiry, "2026-08");
  assert.equal(preview.pack, "Strip · 10 Tablet");
});

test("cart batch preview falls back to OPEN stock without batches", () => {
  const item = { pack_unit: "Strip", stock_gm: 50, default_expiry: "2027-12-31" };
  const preview = cartBatchPreview([], item, 1);
  assert.equal(preview.batchNo, "OPEN");
  assert.equal(preview.expiry, "2027-12");
});

test("expiry month helpers round-trip YYYY-MM for item master", () => {
  assert.equal(expiryMonthToDate("2027-06"), "2027-06-01");
  assert.equal(expiryDateToMonth("2027-06-15"), "2027-06");
  assert.equal(expiryMonthToDate(""), null);
});

test("cart batch preview falls back to saved batch metadata without live FEFO stock", () => {
  const item = { id: "x", pack_unit: "Strip", units_per_pack: 10, medicine_type: "Tablet" };
  const all = [{ item_id: "x", batch_no: "DOL2026A", expiry_date: "2027-06-01", qty: 0 }];
  const preview = cartBatchPreview([], item, 1, all);
  assert.equal(preview.batchNo, "DOL2026A");
  assert.equal(preview.expiry, "2027-06");
  assert.equal(preview.pack, "Strip · 10 Tablet");
});

test("primary batch picks earliest expiry for item master edit", () => {
  const batches = [
    { item_id: "x", batch_no: "B2", expiry_date: "2027-06-01", qty: 5 },
    { item_id: "x", batch_no: "B1", expiry_date: "2026-08-01", qty: 3 },
    { item_id: "y", batch_no: "Z1", expiry_date: "2026-01-01", qty: 1 },
  ];
  assert.equal(primaryBatch(batches, "x").batch_no, "B1");
  assert.equal(primaryBatch(batches, "missing"), null);
});

test("units per pack can be inferred from pack size text", () => {
  assert.equal(parseUnitsFromPackSize("10 Tablets"), 10);
  assert.equal(unitsPerPack({ pack_size: "10 Tablets", units_per_pack: 1 }), 10);
});

test("strip tablet items default to 10 per pack when unset", () => {
  const dolo = {
    name: "dolo650",
    selling_price: 20,
    units_per_pack: 1,
    medicine_type: "Tablet",
    pack_unit: "Strip",
  };
  assert.equal(unitsPerPack(dolo), 10);
  assert.equal(looseSaleRate(dolo), 2);
  const line = saleLineTotals({ qty: 2, rate: looseSaleRate(dolo), gstRate: 0 });
  assert.equal(line.taxable, 4);
});

test("strip medicines without medicine type still default to 10 per pack", () => {
  const dolo = { name: "dolo650", selling_price: 60, units_per_pack: 1, pack_unit: "Strip" };
  assert.equal(unitsPerPack(dolo), 10);
  assert.equal(looseSaleRate(dolo), 6);
  const line = saleLineTotals({ qty: 2, rate: looseSaleRate(dolo), gstRate: 0 });
  assert.equal(line.taxable, 12);
});

test("loose tablet billing uses pack size when units_per_pack is unset", () => {
  const dolo = {
    selling_price: 20,
    retail_rate: 20,
    pack_size: "10 Tablets",
    units_per_pack: 1,
    medicine_type: "Tablet",
    pack_unit: "Strip",
  };
  assert.equal(looseSaleRate(dolo), 2);
  const line = saleLineTotals({ qty: 2, rate: looseSaleRate(dolo), gstRate: 0 });
  assert.equal(line.taxable, 4);
});

test("loose tablet billing divides strip price by units per pack", () => {
  const dolo = {
    selling_price: 20,
    retail_rate: 20,
    units_per_pack: 10,
    medicine_type: "Tablet",
    pack_unit: "Strip",
    mrp: 25,
  };
  assert.equal(unitsPerPack(dolo), 10);
  assert.equal(looseUnitLabel(dolo), "Tablet");
  assert.equal(packSaleRate(dolo), 20);
  assert.equal(looseSaleRate(dolo), 2);
  assert.equal(looseMrp(dolo), 2.5);
  const line = saleLineTotals({ qty: 2, rate: looseSaleRate(dolo), gstRate: 0 });
  assert.equal(line.taxable, 4);
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

test("bill discount reduces taxable GST, not only the grand total", () => {
  const totals = billTotals({
    lines: [saleLineTotals({ qty: 1, rate: 100, gstRate: 12 })],
    billDiscount: 10,
  });
  assert.equal(totals.subtotal, 100);
  assert.equal(totals.discount, 10);
  assert.equal(totals.gst, 10.8);
  assert.equal(totals.grandTotal, 101);
});

test("FEFO can honour a preferred in-date batch", () => {
  const batches = [
    { id: "b2", batch_no: "B2", expiry_date: "2026-10-01", qty: 5 },
    { id: "b1", batch_no: "B1", expiry_date: "2027-01-01", qty: 5 },
  ];
  const plan = allocateFefo(batches, 3, { preferredId: "b1" });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.allocations.map((a) => [a.batch_no, a.take]), [["B1", 3]]);
});

test("merged sale lines combine FEFO-split qty for the same medicine", () => {
  const merged = mergeSaleLines([
    { itemId: "a", qty: 2 },
    { item_id: "a", quantity_gm: 3 },
    { itemId: "b", quantity: 1 },
  ]);
  assert.equal(merged.find((l) => l.itemId === "a").qty, 5);
  assert.equal(merged.length, 2);
});

test("return qty cannot exceed remaining billed units", () => {
  assert.equal(remainingReturnQty(10, 4), 6);
  assert.equal(remainingReturnQty(10, 10), 0);
});

test("medicine and pack type lists include lotion and vial units", () => {
  assert.equal(MEDICINE_TYPES.includes("Lotion"), true);
  assert.equal(PACK_TYPES.includes("Vial"), true);
});

test("GSTIN state codes detect inter-state purchase/sale", () => {
  assert.equal(gstinStateCode("27AABCU9603R1ZX"), "27");
  assert.equal(formatGstin("27aabcu9603r1zx"), "27AABCU9603R1ZX");
  assert.equal(isValidGstin("27AABCU9603R1ZX"), true);
  assert.equal(isValidGstin(""), true);
  assert.equal(isValidGstin("27-bad"), false);
  assert.equal(gstinStateName("27"), "Maharashtra");
  assert.equal(isInterstate("27AABCU9603R1ZX", "24AAAAA0000A1Z5"), true);
  assert.equal(isInterstate("27AABCU9603R1ZX", "27AAAAA0000A1Z5"), false);
  assert.equal(isInterstate("27AABCU9603R1ZX", ""), false);
  assert.equal(partyStateCode({ state_code: "27" }), "27");
  assert.equal(isInterstate({ gstin: "27AABCU9603R1ZX" }, { state_code: "24" }), true);
});
