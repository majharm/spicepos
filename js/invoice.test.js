import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadInvoicePrint() {
  const units = fs.readFileSync(new URL("./units.js", import.meta.url), "utf8");
  const code = fs.readFileSync(new URL("./invoice.js", import.meta.url), "utf8");
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(units, context);
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
      suppliers: [{ id: "s1", name: "Spice Traders", gstin: "27AAAAA0000A1Z5", mobile: "9999999999", email: "traders@example.com", address: "Pune Market" }],
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
  assert.match(html, /traders@example.com/);
  assert.match(html, /Pune Market/);
});

test("piece items print qty in pcs and rate per pc", () => {
  const InvoicePrint = loadInvoicePrint();
  const html = InvoicePrint.invoiceBody(
    {
      order_number: "SO-9",
      customer_name: "Walk-in",
      payment_method: "cash",
      payment_status: "paid",
      subtotal: 80,
      gst: 4,
      total: 84,
      created_at: "2026-09-01",
      lines: [{ item_name: "Bottle", item_id: "b1", quantity_gm: 2, rate_per_kg: 40, amount: 80, gst_rate: 5 }],
    },
    {
      company: { name: "Shop" },
      items: [{ id: "b1", code: "2201", base_unit: "PCS", gst_rate: 5 }],
      formatDateTime: (v) => String(v),
      money: (n) => `₹${Number(n).toFixed(2)}`,
      escapeHtml: (v) => String(v),
    },
  );
  assert.match(html, /2 pcs/);
  assert.match(html, /\/pc/);
});

test("official invoice is an A4 list view not a POS slip", () => {
  const InvoicePrint = loadInvoicePrint();
  const html = InvoicePrint.officeInvoiceBody(
    {
      order_number: "SO-10042",
      customer_name: "Ramesh Traders",
      customer_type: "b2b",
      customer_gstin: "27AABCU9603R1ZX",
      subtotal: 800,
      gst: 40,
      total: 840,
      payment_method: "upi",
      payment_status: "paid",
      created_at: "2026-08-30T10:30:00.000Z",
      lines: [
        { item_name: "Cardamom", quantity_gm: 500, rate_per_kg: 1200, amount: 600, gst_rate: 5 },
        { item_name: "Clove", quantity_gm: 250, rate_per_kg: 800, amount: 200, gst_rate: 5 },
      ],
    },
    {
      company: { name: "ATAV Spices", gstin: "27AABCU9603R1ZX", address: "Pune", city: "Pune", state: "Maharashtra" },
      customers: [],
      items: [],
      formatDateTime: (v) => String(v),
      money: (n) => `₹${Number(n).toFixed(2)}`,
      escapeHtml: (v) => String(v),
    },
  );
  assert.match(html, /class="office-invoice"/);
  assert.match(html, /TAX INVOICE/);
  assert.match(html, /Original for Recipient/);
  assert.match(html, /Bill to/);
  assert.match(html, /SO-10042/);
  assert.match(html, /Ramesh Traders/);
  assert.match(html, /<th>Item<\/th>/);
  assert.match(html, /Cardamom/);
  assert.match(html, /Clove/);
  assert.match(html, /Amount in words/);
  assert.match(html, /Authorised signatory/);
  assert.doesNotMatch(html, /thermal-invoice/);
  const doc = InvoicePrint.officeInvoiceDocument(
    { order_number: "SO-10042", total: 840, lines: [] },
    {
      company: { name: "ATAV Spices" },
      formatDateTime: (v) => String(v),
      money: (n) => `₹${Number(n).toFixed(2)}`,
      escapeHtml: (v) => String(v),
    },
  );
  assert.match(doc, /size: A4/);
  assert.doesNotMatch(doc, /size: 80mm/);
});

test("duplicate official invoice is the same A4 bill with a supplier copy label", () => {
  const InvoicePrint = loadInvoicePrint();
  const ctx = {
    company: { name: "ATAV Spices" },
    customers: [],
    items: [],
    formatDateTime: (v) => String(v),
    money: (n) => `₹${Number(n).toFixed(2)}`,
    escapeHtml: (v) => String(v),
  };
  const order = { order_number: "SO-10042", total: 840, lines: [] };
  assert.equal(InvoicePrint.officeCopyLabel("duplicate"), "Duplicate for Supplier");
  assert.equal(InvoicePrint.officeCopyLabel("original"), "Original for Recipient");
  const html = InvoicePrint.officeInvoiceBody(order, ctx, { copy: "duplicate" });
  assert.match(html, /class="office-invoice"/);
  assert.match(html, /TAX INVOICE/);
  assert.match(html, /Duplicate for Supplier/);
  assert.doesNotMatch(html, /Original for Recipient/);
  const doc = InvoicePrint.officeInvoiceDocument(order, ctx, { copy: "duplicate" });
  assert.match(doc, /Duplicate for Supplier/);
  assert.match(doc, /Tax invoice SO-10042 \(Duplicate\)/);
  assert.match(doc, /size: A4/);
  assert.doesNotMatch(doc, /size: 80mm/);
});

test("amount in words uses Indian numbering", () => {
  const InvoicePrint = loadInvoicePrint();
  assert.equal(InvoicePrint.amountInWords(0), "Rupees Zero Only");
  assert.equal(InvoicePrint.amountInWords(105), "Rupees One Hundred Five Only");
  assert.equal(InvoicePrint.amountInWords(125000), "Rupees One Lakh Twenty Five Thousand Only");
});

test("invoice HSN uses item hsn ahead of SKU code", () => {
  const InvoicePrint = loadInvoicePrint();
  const lines = InvoicePrint.enrichLines(
    {
      lines: [{ item_name: "Turmeric", item_id: "i1", quantity_gm: 1000, rate_per_kg: 100, amount: 100, gst_rate: 5 }],
    },
    [{ id: "i1", code: "SP-007", hsn: "0910", gst_rate: 5 }],
  );
  assert.equal(lines[0].hsn, "0910");
});
