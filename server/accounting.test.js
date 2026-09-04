import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_COA, expenseJournalLines, saleDiscountAmount } from "./accounting.js";
import { splitGstAmount } from "./gst-supply.js";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function splitGst(gst, interState = false) {
  return splitGstAmount(gst, interState);
}

function saleJournalLines(order) {
  const subtotal = round2(order.subtotal);
  const { cgst, sgst } = splitGst(order.gst);
  const total = round2(order.total);
  const discountOff = saleDiscountAmount(order);
  const lines = [
    { debit: total, credit: 0 },
    { debit: discountOff, credit: 0 },
    { debit: 0, credit: subtotal },
  ];
  if (cgst > 0) lines.push({ debit: 0, credit: cgst });
  if (sgst > 0) lines.push({ debit: 0, credit: sgst });
  return lines;
}

test("DEFAULT_COA seeds core ledger, GST, and expense accounts", () => {
  assert.ok(DEFAULT_COA.some((a) => a.code === "4101" && a.account_group === "income"));
  assert.ok(DEFAULT_COA.some((a) => a.code === "4102" && a.account_group === "income"));
  assert.ok(DEFAULT_COA.some((a) => a.code === "1001" && a.account_group === "asset"));
  assert.ok(DEFAULT_COA.some((a) => a.code === "2203" && a.account_group === "liability"));
  assert.ok(DEFAULT_COA.some((a) => a.code === "2303" && a.account_group === "asset"));
  assert.ok(DEFAULT_COA.some((a) => a.code === "5102" && a.account_group === "expense"));
  assert.equal(DEFAULT_COA.filter((a) => a.account_group === "expense").length, 9);
});

test("sale journal lines are balanced", () => {
  const lines = saleJournalLines({ subtotal: 250, gst: 45, total: 295 });
  const debit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const credit = round2(lines.reduce((s, l) => s + l.credit, 0));
  assert.equal(debit, credit);
  assert.equal(debit, 295);
});

test("sale journal stays balanced after bill and loyalty discounts", () => {
  const order = { subtotal: 32.32, gst: 3.59, total: 32.32 };
  assert.equal(saleDiscountAmount(order), 3.59);
  const lines = saleJournalLines(order);
  const debit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const credit = round2(lines.reduce((s, l) => s + l.credit, 0));
  assert.equal(debit, credit);
  assert.equal(debit, 35.91);
});

test("expense journal lines are balanced with optional GST", () => {
  const lines = expenseJournalLines({
    amount: 1000,
    gst: 180,
    payment_method: "upi",
    account_code: "5103",
  });
  const debit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const credit = round2(lines.reduce((s, l) => s + l.credit, 0));
  assert.equal(debit, credit);
  assert.equal(debit, 1180);
  assert.ok(lines.some((l) => l.accountCode === "5103" && l.debit === 1000));
  assert.ok(lines.some((l) => l.accountCode === "1003" && l.credit === 1180));
});
