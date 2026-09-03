import test from "node:test";
import assert from "node:assert/strict";
import "./discount.js";

const D = globalThis.POSDiscount;

test("item-wise percent discount then GST on discounted price", () => {
  const line = D.computeLine({
    qty: 1,
    rate: 500,
    gstRate: 5,
    mrp: 550,
    purchase_rate: 400,
    isCount: true,
    discountType: "pct",
    discountValue: 10,
  });
  assert.equal(line.gross, 500);
  assert.equal(line.discount, 50);
  assert.equal(line.taxable, 450);
  assert.equal(line.gst, 22.5);
  assert.equal(line.total, 472.5);
  assert.equal(line.cost, 400);
  assert.equal(line.profit, 50);
  assert.equal(line.mrp, 550);
});

test("rupee line discount and bill percent discount", () => {
  const line = D.computeLine({
    qty: 1000,
    rate: 200,
    gstRate: 5,
    isCount: false,
    discountType: "amt",
    discountValue: 20,
  });
  assert.equal(line.gross, 200);
  assert.equal(line.discount, 20);
  assert.equal(line.taxable, 180);
  assert.equal(line.gst, 9);
  const bill = D.computeBill([line], { discountType: "pct", discountValue: 10 });
  assert.equal(bill.subtotal, 180);
  assert.equal(bill.gst, 9);
  assert.equal(bill.billDiscount, 18.9);
  assert.equal(bill.total, 170.1);
});

test("discount cannot exceed line amount", () => {
  const line = D.computeLine({
    qty: 2,
    rate: 10,
    isCount: true,
    discountType: "amt",
    discountValue: 999,
  });
  assert.equal(line.discount, 20);
  assert.equal(line.taxable, 0);
});
