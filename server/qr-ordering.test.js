import assert from "node:assert/strict";
import test from "node:test";
import { normalizeQrOrderPayload, publicOrderUrl } from "./qr-ordering.js";

test("QR order payload requires customer, mobile, and item lines", () => {
  assert.throws(() => normalizeQrOrderPayload({}), /Customer name/);
  assert.throws(
    () =>
      normalizeQrOrderPayload({
        customer_name: "A",
        mobile: "123",
        lines: [{ item_id: "i1", quantity_gm: 100 }],
      }),
    /Valid mobile/,
  );
  assert.throws(
    () => normalizeQrOrderPayload({ customer_name: "A", mobile: "9876543210", lines: [] }),
    /at least one item/,
  );
});

test("QR order payload normalizes public customer fields and grams", () => {
  const row = normalizeQrOrderPayload({
    customerName: "  Ramesh  ",
    mobile: "+91 98765-43210",
    tableNo: " Counter ",
    notes: " coarse grind ",
    lines: [
      { itemId: "i1", quantity_gm: "250" },
      { itemId: "", quantity_gm: 200 },
      { itemId: "i2", quantity_gm: 0 },
      { item_id: "i3", quantity: 0.5 },
    ],
  });
  assert.equal(row.customerName, "Ramesh");
  assert.equal(row.mobile, "+919876543210");
  assert.equal(row.tableNo, "Counter");
  assert.equal(row.lines.length, 2);
  assert.deepEqual(row.lines[0], { item_id: "i1", quantity_gm: 250 });
  assert.deepEqual(row.lines[1], { item_id: "i3", quantity_gm: 500 });
});

test("public order URL uses forwarded host when present", () => {
  const url = publicOrderUrl({
    protocol: "http",
    headers: { "x-forwarded-proto": "https", "x-forwarded-host": "shop.example:443" },
  });
  assert.equal(url, "https://shop.example:443/order.html");
});
