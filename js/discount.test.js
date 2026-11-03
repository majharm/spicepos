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
  assert.equal(bill.billDiscount, 18);
  assert.equal(bill.taxable, 162);
  assert.equal(bill.gst, 8.1);
  assert.equal(bill.total, 170.1);
});

test("discount and royalty reduce the taxable amount before GST", () => {
  const line = D.computeLine({ qty: 1, rate: 10000, gstRate: 18, isCount: true });
  const bill = D.computeBill([line], { discountType: "amt", discountValue: 1000, loyaltyDiscount: 500 });
  assert.equal(bill.subtotal, 10000);
  assert.equal(bill.billDiscount, 1000);
  assert.equal(bill.loyaltyDiscount, 500);
  assert.equal(bill.taxable, 8500);
  assert.equal(bill.gst, 1530);
  assert.equal(bill.total, 10030);
});

test("royalty cannot exceed the taxable amount and is not applied twice", () => {
  const line = D.computeLine({ qty: 1, rate: 100, gstRate: 18, isCount: true });
  const once = D.computeBill([line], { loyaltyDiscount: 9999 });
  assert.equal(once.loyaltyDiscount, 100);
  assert.equal(once.taxable, 0);
  assert.equal(once.gst, 0);
  assert.equal(once.total, 0);
  const again = D.computeBill([line], { loyaltyDiscount: once.loyaltyDiscount });
  assert.equal(again.total, once.total);
});

test("GST rates and inclusive prices use the same sequence", () => {
  for (const rate of [0, 5, 12, 18, 28]) {
    const line = D.computeLine({ qty: 2, rate: 100, gstRate: rate, isCount: true });
    const bill = D.computeBill([line], { discountValue: 10 });
    assert.equal(bill.taxable, 190);
    assert.equal(bill.gst, D.paise((190 * rate) / 100));
    assert.equal(bill.total, D.paise(190 + bill.gst));
  }
  const inclusive = D.computeLine({
    qty: 1,
    rate: 11800,
    gstRate: 18,
    isCount: true,
    gstInclusive: true,
    discountValue: 0,
  });
  const bill = D.computeBill([inclusive], { discountValue: 1000, loyaltyDiscount: 500 });
  assert.equal(bill.taxable, 8728.81);
  assert.equal(bill.gst, 1571.19);
  assert.equal(bill.total, 10300);
});

test("bill discount is shared across GST rates before tax", () => {
  const low = D.computeLine({ qty: 1, rate: 1000, gstRate: 5, isCount: true });
  const high = D.computeLine({ qty: 1, rate: 1000, gstRate: 18, isCount: true });
  const bill = D.computeBill([low, high], { discountValue: 200 });
  assert.equal(bill.lines[0].taxable, 900);
  assert.equal(bill.lines[0].gst, 45);
  assert.equal(bill.lines[1].taxable, 900);
  assert.equal(bill.lines[1].gst, 162);
  assert.equal(bill.gst, 207);
  assert.equal(bill.total, 2007);
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

test("sale line keeps eight-decimal unit prices", () => {
  const line = D.computeLine({
    qty: 1,
    rate: 0.00000001,
    gstRate: 0,
    isCount: true,
  });
  assert.equal(line.gross, 0.00000001);
  assert.equal(line.taxable, 0.00000001);
  const sms = D.computeLine({
    qty: 1,
    rate: 0.1456,
    gstRate: 0,
    isCount: true,
  });
  assert.equal(sms.gross, 0.1456);
  assert.equal(sms.taxable, 0.1456);
});
