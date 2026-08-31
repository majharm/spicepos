import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadInvoicePrint() {
  const code = fs.readFileSync(new URL("../js/invoice.js", import.meta.url), "utf8");
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.window.InvoicePrint;
}

test("thermal invoice groups GST by rate with CGST/SGST split", () => {
  const InvoicePrint = loadInvoicePrint();
  const lines = InvoicePrint.enrichLines(
    {
      lines: [
        { item_name: "Cardamom", item_id: "i1", quantity_gm: 500, rate_per_kg: 1200, amount: 600, gst_rate: 5 },
        { item_name: "Clove", item_id: "i2", quantity_gm: 250, rate_per_kg: 800, amount: 200, gst_rate: 5 },
        { item_name: "Sugar", item_id: "i3", quantity_gm: 1000, rate_per_kg: 50, amount: 50, gst_rate: 12 },
      ],
    },
    [
      { id: "i1", code: "0908", gst_rate: 5 },
      { id: "i2", code: "0907", gst_rate: 5 },
      { id: "i3", code: "1701", gst_rate: 12 },
    ],
  );
  const breakdown = InvoicePrint.gstBreakdown(lines);
  assert.equal(breakdown.length, 2);
  assert.equal(breakdown[0].rate, 5);
  assert.equal(breakdown[0].taxable, 800);
  assert.equal(breakdown[0].gst, 40);
  assert.equal(breakdown[1].rate, 12);
  assert.equal(breakdown[1].gst, 6);
});

test("thermal invoice HTML includes tax invoice header and invoice number", () => {
  const InvoicePrint = loadInvoicePrint();
  const html = InvoicePrint.invoiceBody(
    {
      order_number: "SO-10042",
      customer_name: "Walk-in",
      subtotal: 100,
      gst: 5,
      total: 105,
      payment_method: "cash",
      payment_status: "paid",
      created_at: "2026-08-30T10:30:00.000Z",
      lines: [{ item_name: "Test", quantity_gm: 500, rate_per_kg: 200, amount: 100, gst_rate: 5 }],
    },
    {
      company: { name: "ATAV Spices", gstin: "27AABCU9603R1ZX", address: "Pune" },
      customers: [],
      items: [],
      formatDateTime: (v) => String(v),
      money: (n) => `₹${Number(n).toFixed(2)}`,
      escapeHtml: (v) => String(v),
    },
  );
  assert.match(html, /TAX INVOICE/);
  assert.match(html, /SO-10042/);
  assert.match(html, /CGST/);
  assert.match(html, /SGST/);
});

test("purchase bill HTML includes purchase header and input GST", () => {
  const InvoicePrint = loadInvoicePrint();
  const html = InvoicePrint.purchaseBody(
    {
      purchase_number: "PO-10005",
      supplier_id: "s1",
      supplier_name: "Spice Traders",
      supplier_invoice_number: "ST-8821",
      purchase_date: "2026-08-30",
      subtotal: 500,
      gst: 25,
      total: 525,
      payment_method: "credit",
      payment_status: "unpaid",
      lines: [
        {
          item_name: "Turmeric",
          item_id: "i1",
          quantity_gm: 1000,
          rate_per_kg: 500,
          amount: 500,
          gst_rate: 5,
          gst_amount: 25,
        },
      ],
    },
    {
      company: { name: "ATAV Spices", gstin: "27AABCU9603R1ZX", address: "Pune" },
      suppliers: [{ id: "s1", name: "Spice Traders", gstin: "27AAAAA0000A1Z5", mobile: "9999999999" }],
      items: [{ id: "i1", code: "0910", gst_rate: 5 }],
      formatDateTime: (v) => String(v),
      money: (n) => `₹${Number(n).toFixed(2)}`,
      escapeHtml: (v) => String(v),
    },
  );
  assert.match(html, /PURCHASE BILL/);
  assert.match(html, /PO-10005/);
  assert.match(html, /ST-8821/);
  assert.match(html, /Input CGST/);
  assert.match(html, /Input SGST/);
  assert.match(html, /Spice Traders/);
});
