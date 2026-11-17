import assert from "node:assert/strict";
import test from "node:test";
import "./sync-engine.js";

const E = globalThis.POSSyncEngine;
const shop = { businessId: "shop-1", deviceId: "deviceabc1" };

test("a local transaction id is unique and safe to store", () => {
  const a = E.transactionId("device abc 1");
  const b = E.transactionId("device abc 1");
  assert.match(a, /^txn_deviceabc1_[A-Za-z0-9]+$/);
  assert.notEqual(a, b);
  assert.equal(E.reviewTransaction({
    transactionId: a,
    kind: "checkout",
    businessId: "shop-1",
    deviceId: "deviceabc1",
    payload: { customerId: "c1", lines: [{ quantity_gm: 2, rate: 10, amount: 20 }], discount: 5, total: 15, amountPaid: 15 },
  }, shop).ok, true);
});

test("the cloud rejects another shop, a bad device, and a bill that does not add up", () => {
  const bill = {
    transactionId: "txn_deviceabc1_bill01",
    kind: "checkout",
    deviceId: "deviceabc1",
    payload: { customerId: "c1", lines: [{ quantity_gm: 2, rate: 10 }] },
  };
  assert.equal(E.reviewTransaction({ ...bill, businessId: "shop-9" }, shop).reject, "This transaction belongs to another shop");
  assert.equal(E.reviewTransaction(bill, { businessId: "shop-1", deviceId: "no" }).reject, "This device is not authorized");
  assert.equal(E.reviewTransaction({
    ...bill,
    businessId: "shop-1",
    payload: { customerId: "c1", lines: [{ quantity_gm: 2, rate: 10, amount: 30 }], discount: 0, total: 20 },
  }, shop).reject, "Line total does not match rate and quantity");
  assert.equal(E.reviewTransaction({
    ...bill,
    businessId: "shop-1",
    payload: { customerId: "c1", lines: [{ quantity_gm: 2, rate: 10 }], discount: 25, total: 0 },
  }, shop).reject, "Discount is larger than the bill");
  assert.equal(E.checkInvoiceMath({ lines: [] }), "Cart is empty");
});

test("accepted and duplicate ids sync, rejected ids stay on the device", () => {
  const rows = [
    { transactionId: "txn_ok", idempotencyKey: "txn_ok", offlineNumber: "OFF-1", payload: {} },
    { transactionId: "txn_dup", idempotencyKey: "txn_dup", offlineNumber: "OFF-2", payload: {} },
    { transactionId: "txn_bad", idempotencyKey: "txn_bad", offlineNumber: "OFF-3", payload: {} },
  ];
  const next = E.applyBatchAck(rows, {
    accepted: ["txn_ok"],
    duplicate: ["txn_dup"],
    rejected: [{ transactionId: "txn_bad", error: "Customer not found" }],
    applied: { txn_ok: { orderNumber: "SO-41", orderId: "ord-41" } },
  });
  assert.equal(next[0].status, "synced");
  assert.equal(next[0].serverNumber, "SO-41");
  assert.equal(next[1].status, "synced");
  assert.equal(next[1].duplicate, true);
  assert.equal(next[2].status, "conflict");
  assert.equal(next[2].error, "Customer not found");
});

test("downloaded prices, customers, taxes and settings replace the local copy", () => {
  const next = E.mergeChanges(
    {
      items: [{ id: "tea", name: "Tea", retail_rate: 10, stock_gm: 5 }],
      customers: [{ id: "c1", name: "Asha", outstanding: 0 }],
      taxes: [{ id: "old", rate: 5 }],
      company: { name: "Old" },
      syncSince: "",
    },
    {
      nextSince: "2026-11-18T00:00:00.000Z",
      items: [{ id: "tea", retail_rate: 12, stock_gm: 4 }, { id: "milk", name: "Milk", retail_rate: 20 }],
      customers: [{ id: "c1", outstanding: 40 }],
      taxes: [{ id: "gst5", name: "GST 5", rate: 5 }],
      settings: { company: { name: "Spice", timezone: "Asia/Kolkata" }, business: { id: "shop-1", name: "Spice" } },
    },
  );
  assert.equal(next.items[0].retail_rate, 12);
  assert.equal(next.items[0].name, "Tea");
  assert.equal(next.items[1].name, "Milk");
  assert.equal(next.customers[0].outstanding, 40);
  assert.equal(next.taxes[0].id, "gst5");
  assert.equal(next.company.name, "Spice");
  assert.equal(next.company.timezone, "Asia/Kolkata");
  assert.equal(next.business.name, "Spice");
  assert.equal(next.syncSince, "2026-11-18T00:00:00.000Z");
});
