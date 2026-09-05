import assert from "node:assert/strict";
import test from "node:test";
import { normalizeQrOrderPayload, qrLineAmount, qrQuantityToBase } from "./qr-ordering.js";

test("QR order payload requires customer, mobile, and item lines", () => {
  assert.throws(() => normalizeQrOrderPayload({}), /Customer name/);
  assert.throws(
    () => normalizeQrOrderPayload({ customer_name: "A", mobile: "123", lines: [{ item_id: "i1", quantity: 1 }] }),
    /Valid mobile/,
  );
  assert.throws(
    () => normalizeQrOrderPayload({ customer_name: "A", mobile: "9876543210", lines: [] }),
    /at least one item/,
  );
});

test("QR order payload normalizes public customer fields and valid lines", () => {
  const row = normalizeQrOrderPayload({
    customerName: "  Ramesh  ",
    mobile: "+91 98765-43210",
    tableNo: " Table 4 ",
    notes: " less spicy ",
    lines: [
      { itemId: "i1", quantity: "1.5" },
      { itemId: "", quantity: 2 },
      { itemId: "i2", quantity: 0 },
    ],
  });
  assert.equal(row.customerName, "Ramesh");
  assert.equal(row.mobile, "+919876543210");
  assert.equal(row.tableNo, "Table 4");
  assert.equal(row.lines.length, 1);
  assert.deepEqual(row.lines[0], { item_id: "i1", quantity: 1.5 });
});

test("QR menu quantities convert kg/litre and piece orders to base stock", () => {
  assert.equal(qrQuantityToBase(1.5, "GM"), 1500);
  assert.equal(qrQuantityToBase(2, "KG"), 2000);
  assert.equal(qrQuantityToBase(1.25, "ML"), 1250);
  assert.equal(qrQuantityToBase(3, "PCS"), 3);
  assert.equal(qrLineAmount(1500, 200, "GM"), 300);
  assert.equal(qrLineAmount(3, 25, "PCS"), 75);
});
