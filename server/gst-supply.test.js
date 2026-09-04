import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateGstByRate,
  gstinStateCode,
  isInterStateSupply,
  splitGstAmount,
  splitOrderGst,
  sumSplitGst,
} from "./gst-supply.js";

test("gstinStateCode reads first two digits", () => {
  assert.equal(gstinStateCode("27AABCU9603R1ZX"), "27");
  assert.equal(gstinStateCode("  06XYZ "), "06");
  assert.equal(gstinStateCode(""), "");
});

test("isInterStateSupply compares GSTIN state codes", () => {
  const shop = { gstin: "27AABCU9603R1ZX", state: "Maharashtra" };
  assert.equal(isInterStateSupply(shop, { gstin: "27BBBBB0000B1Z5" }), false);
  assert.equal(isInterStateSupply(shop, { gstin: "06BBBBB0000B1Z5" }), true);
});

test("isInterStateSupply falls back to state names", () => {
  const shop = { state: "Maharashtra" };
  assert.equal(isInterStateSupply(shop, { state: "Maharashtra" }), false);
  assert.equal(isInterStateSupply(shop, { state: "Gujarat" }), true);
});

test("splitGstAmount splits CGST/SGST or IGST", () => {
  assert.deepEqual(splitGstAmount(100, false), { cgst: 50, sgst: 50, igst: 0 });
  assert.deepEqual(splitGstAmount(100, true), { cgst: 0, sgst: 0, igst: 100 });
  assert.deepEqual(splitGstAmount(99, false), { cgst: 49.5, sgst: 49.5, igst: 0 });
});

test("aggregateGstByRate splits output GST by rate", () => {
  const shop = { gstin: "27AABCU9603R1ZX" };
  const rows = [
    { gst_rate: 5, amount: 1000, order_id: "o1", party_gstin: "27X", party_state: null },
    { gst_rate: 5, amount: 500, order_id: "o2", party_gstin: "06Y", party_state: null },
    { gst_rate: 12, amount: 200, order_id: "o3", party_gstin: "27Z", party_state: null },
  ];
  const out = aggregateGstByRate(rows, shop);
  assert.equal(out.length, 2);
  const five = out.find((r) => r.gst_rate === 5);
  assert.equal(five.taxable, 1500);
  assert.equal(five.gst, 75);
  assert.equal(five.cgst, 25);
  assert.equal(five.sgst, 25);
  assert.equal(five.igst, 25);
  assert.equal(five.bills, 2);
});

test("splitOrderGst marks inter-state B2B orders", () => {
  const shop = { gstin: "27AABCU9603R1ZX" };
  const intra = splitOrderGst({ gst: 40, customer_gstin: "27BBBBB0000B1Z5" }, shop);
  assert.equal(intra.interState, false);
  assert.equal(intra.cgst, 20);
  const inter = splitOrderGst({ gst: 40, customer_gstin: "06BBBBB0000B1Z5" }, shop);
  assert.equal(inter.interState, true);
  assert.equal(inter.igst, 40);
});

test("sumSplitGst totals purchase input GST", () => {
  const shop = { gstin: "27AABCU9603R1ZX" };
  const rows = [
    { gst: 50, party_gstin: "27S", party_state: null },
    { gst: 30, party_gstin: "29S", party_state: null },
  ];
  const sum = sumSplitGst(rows, shop);
  assert.equal(sum.cgst, 25);
  assert.equal(sum.sgst, 25);
  assert.equal(sum.igst, 30);
  assert.equal(sum.total, 80);
});
