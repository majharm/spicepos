import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadInvoicePrint() {
  const gst = fs.readFileSync(new URL("./gst-supply.js", import.meta.url), "utf8");
  const units = fs.readFileSync(new URL("./units.js", import.meta.url), "utf8");
  const code = fs.readFileSync(new URL("./invoice.js", import.meta.url), "utf8");
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(gst, context);
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
  assert.doesNotMatch(html, />VOID</);
});

test("cancelled invoices print VOID on thermal and office copies", () => {
  const InvoicePrint = loadInvoicePrint();
  const order = {
    order_number: "SO-10042",
    status: "cancelled",
    customer_name: "Walk-in",
    subtotal: 100,
    gst: 5,
    total: 105,
    payment_method: "cash",
    payment_status: "paid",
    created_at: "2026-08-30T10:30:00.000Z",
    lines: [{ item_name: "Test", quantity_gm: 500, rate_per_kg: 200, amount: 100, gst_rate: 5 }],
  };
  const ctx = {
    company: { name: "ATAV Spices", gstin: "27AABCU9603R1ZX", address: "Pune" },
    customers: [],
    items: [],
    formatDateTime: (v) => String(v),
    money: (n) => `₹${Number(n).toFixed(2)}`,
    escapeHtml: (v) => String(v),
  };
  const thermal = InvoicePrint.invoiceBody(order, ctx);
  const office = InvoicePrint.officeInvoiceBody(order, ctx);
  assert.match(thermal, /class="inv-void">VOID</);
  assert.match(office, /class="off-void">VOID</);
  const live = InvoicePrint.invoiceBody({ ...order, status: "confirmed" }, ctx);
  assert.doesNotMatch(live, />VOID</);
});

test("thermal and office invoices print the dining table", () => {
  const InvoicePrint = loadInvoicePrint();
  const order = {
    order_number: "SO-10099",
    customer_name: "Walk-in",
    table_no: "4",
    subtotal: 100,
    gst: 5,
    total: 105,
    payment_method: "cash",
    payment_status: "paid",
    created_at: "2026-09-09T10:30:00.000Z",
    lines: [{ item_name: "Masala dosa", quantity_gm: 1, rate_per_kg: 100, amount: 100, gst_rate: 5 }],
  };
  const ctx = {
    company: { name: "Demo Kitchen" },
    customers: [],
    items: [{ id: "i1", unit: "PCS", base_unit: "PCS" }],
    formatDateTime: (v) => String(v),
    money: (n) => `₹${Number(n).toFixed(2)}`,
    escapeHtml: (v) => String(v),
  };
  const thermal = InvoicePrint.invoiceBody(order, ctx);
  const office = InvoicePrint.officeInvoiceBody(order, ctx);
  assert.match(thermal, /Table 4/);
  assert.match(office, /Table 4/);
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
  assert.match(html, /Bill To/);
  assert.match(html, /Invoice#/);
  assert.match(html, /Balance Due/);
  assert.match(html, /SO-10042/);
  assert.match(html, /Ramesh Traders/);
  assert.match(html, /Item &amp; Description/);
  assert.match(html, /Invoice total/);
  assert.match(html, /Payments till date/);
  assert.match(html, /Total due/);
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

test("receipt voucher prints party, amount, and mode; payment voucher labels differ", () => {
  const InvoicePrint = loadInvoicePrint();
  const ctx = {
    company: { name: "SWAMI MASALE SASWAD", phone: "9876543210", gstin: "27AAAAA0000A1Z5" },
    formatDateTime: (v) => String(v),
    money: (n) => `₹${Number(n).toFixed(2)}`,
    escapeHtml: (v) => String(v),
  };
  const receipt = {
    entry_no: "PR-00001",
    entry_type: "receipt",
    party_name: "Ramesh Traders",
    amount: 3000,
    payment_method: "upi",
    invoice_no: "INV-00001",
    invoice_amount: 5000,
    previous_due: 10000,
    remaining_due: 12000,
    payment_reference: "UTR123456",
    payment_date: "2026-09-19",
    created_at: "2026-09-19T10:00:00.000Z",
  };
  const html = InvoicePrint.voucherBody(receipt, ctx);
  assert.match(html, /PAYMENT RECEIPT/);
  assert.match(html, /PR-00001/);
  assert.match(html, /Customer/);
  assert.match(html, /Ramesh Traders/);
  assert.match(html, /Against Invoice/);
  assert.match(html, /INV-00001/);
  assert.match(html, /Previous Due/);
  assert.match(html, /Invoice Amount/);
  assert.match(html, /Payment Received/);
  assert.match(html, /Remaining Due/);
  assert.match(html, /Payment Date/);
  assert.match(html, /2026-09-19/);
  assert.match(html, /UTR123456/);
  assert.match(html, /UPI/);
  assert.doesNotMatch(html, /Paid to/);

  const payment = { ...receipt, entry_no: "PAY-2001", entry_type: "payment", party_name: "Spice Traders" };
  const payHtml = InvoicePrint.voucherBody(payment, ctx);
  assert.match(payHtml, /PAYMENT VOUCHER/);
  assert.match(payHtml, /Paid to/);
  assert.match(payHtml, /Spice Traders/);
  assert.doesNotMatch(payHtml, /Received from/);

  const doc = InvoicePrint.voucherDocument(receipt, ctx);
  assert.match(doc, /PR-00001/);
  assert.match(doc, /window\.print\(\)/);
});

test("invoice due rows use previous due + invoice − payment", () => {
  const InvoicePrint = loadInvoicePrint();
  const due = InvoicePrint.invoiceDueFigures({
    total: 5000,
    previous_due: 10000,
    amount_paid: 3000,
    subtotal: 4800,
    discount: 100,
    gst: 300,
  });
  assert.equal(due.previous, 10000);
  assert.equal(due.paid, 3000);
  assert.equal(due.current, 12000);
  const html = InvoicePrint.invoiceDueRowsHtml(
    { total: 5000, previous_due: 10000, amount_paid: 3000, payment_reference: "UTR123456", payment_date: "2026-09-19" },
    (n) => `₹${Number(n).toFixed(2)}`,
    (v) => String(v),
  );
  assert.match(html, /Previous due/);
  assert.match(html, /Total due/);
  assert.match(html, /UTR123456/);

  const cashPaid = InvoicePrint.invoiceDueFigures({
    total: 840,
    payment_method: "upi",
    payment_status: "paid",
    amount_paid: 0,
  });
  assert.equal(cashPaid.paid, 840);
  assert.equal(cashPaid.current, 0);

  const creditOpen = InvoicePrint.invoiceDueFigures({
    total: 840,
    payment_method: "credit",
    payment_status: "unpaid",
    amount_paid: 0,
  });
  assert.equal(creditOpen.paid, 0);
  assert.equal(creditOpen.current, 840);

  const office = InvoicePrint.officeInvoiceBody(
    {
      order_number: "SO-10042",
      total: 840,
      payment_method: "upi",
      payment_status: "paid",
      amount_paid: 0,
      lines: [],
    },
    {
      company: { name: "ATAV Spices" },
      customers: [],
      items: [],
      formatDateTime: (v) => String(v),
      money: (n) => `₹${Number(n).toFixed(2)}`,
      escapeHtml: (v) => String(v),
    },
  );
  assert.match(office, /class="off-paid"/);
  assert.match(office, /Payments till date/);
  assert.match(office, /\(\-\) ₹840\.00/);
});

test("office invoice lists ledger receipts till date then total due", () => {
  const InvoicePrint = loadInvoicePrint();
  const html = InvoicePrint.officeInvoiceBody(
    {
      order_number: "SO-10003",
      customer_name: "Swami Masale",
      total: 40000,
      payment_method: "credit",
      payment_status: "partial",
      amount_paid: 0,
      previous_due: 0,
      customer_outstanding: 14000,
      payments: [
        {
          entry_no: "RCP-1002",
          entry_type: "receipt",
          party_name: "Swami Masale",
          amount: 26000,
          payment_method: "cash",
          reference_type: "manual",
          notes: "cash payment recived M.Mulani sir",
          created_at: "2026-09-19T06:42:00.000Z",
        },
      ],
      lines: [],
    },
    {
      company: { name: "ATAV TELECOM" },
      customers: [],
      items: [],
      formatDateTime: (v) => String(v),
      money: (n) => `₹${Number(n).toFixed(2)}`,
      escapeHtml: (v) => String(v ?? ""),
    },
  );
  assert.match(html, /Invoice total/);
  assert.match(html, /Payments till date/);
  assert.match(html, /RCP-1002/);
  assert.match(html, /receipt/);
  assert.match(html, /Swami Masale/);
  assert.match(html, /₹26000\.00|₹26,000\.00/);
  assert.match(html, /cash payment recived M\.Mulani sir/);
  assert.match(html, /Total due/);
  assert.match(html, /₹14000\.00|₹14,000\.00/);
  const due = InvoicePrint.invoiceDueFigures({
    total: 40000,
    payments: [{ entry_no: "RCP-1002", entry_type: "receipt", amount: 26000 }],
    customer_outstanding: 14000,
  });
  assert.equal(due.paid, 26000);
  assert.equal(due.current, 14000);
});

test("thermal invoice HTML shows IGST for inter-state supply", () => {
  const InvoicePrint = loadInvoicePrint();
  const html = InvoicePrint.invoiceBody(
    {
      order_number: "SO-20001",
      customer_name: "Delhi Traders",
      customer_gstin: "07AABCU9603R1ZX",
      subtotal: 1000,
      gst: 180,
      total: 1180,
      payment_method: "cash",
      payment_status: "paid",
      created_at: "2026-08-30T10:30:00.000Z",
      lines: [{ item_name: "Test", quantity_gm: 1000, rate_per_kg: 1000, amount: 1000, gst_rate: 18 }],
    },
    {
      company: { name: "ATAV Spices", gstin: "27AABCU9603R1ZX", state: "Maharashtra" },
      customers: [{ id: "c1", gstin: "07AABCU9603R1ZX", state: "Delhi" }],
      items: [],
      formatDateTime: (v) => String(v),
      money: (n) => `₹${Number(n).toFixed(2)}`,
      escapeHtml: (v) => String(v),
    },
  );
  assert.match(html, /IGST @ 18%/);
  assert.doesNotMatch(html, /CGST @ 9%/);
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

test("POS slip and official bill print customer notes and terms from the shop profile", () => {
  const InvoicePrint = loadInvoicePrint();
  const order = {
    order_number: "SO-2001",
    customer_name: "Walk-in",
    subtotal: 100,
    gst: 5,
    total: 105,
    payment_method: "cash",
    payment_status: "paid",
    created_at: "2026-09-07T10:00:00.000Z",
    lines: [{ item_name: "Test", quantity_gm: 500, rate_per_kg: 200, amount: 100, gst_rate: 5 }],
  };
  const ctx = {
    company: {
      name: "ATAV Spices",
      invoice_footer: "Thank you.\nVisit again.",
      invoice_terms: "No returns after 7 days.\nCheck weight on delivery.",
    },
    customers: [],
    items: [],
    formatDateTime: (v) => String(v),
    money: (n) => `₹${Number(n).toFixed(2)}`,
    escapeHtml: (v) => String(v),
  };
  const slip = InvoicePrint.invoiceBody(order, ctx);
  assert.match(slip, /class="inv-footer"/);
  assert.match(slip, /Thank you\.<br>Visit again\./);
  assert.match(slip, /class="inv-terms"/);
  assert.match(slip, /Terms &amp; conditions|Terms & conditions/);
  assert.match(slip, /No returns after 7 days\.<br>Check weight on delivery\./);
  const office = InvoicePrint.officeInvoiceBody(order, ctx);
  assert.match(office, /class="off-note"/);
  assert.match(office, /Thank you\.<br>Visit again\./);
  assert.match(office, /No returns after 7 days\.<br>Check weight on delivery\./);
  const blank = InvoicePrint.invoiceBody(order, { ...ctx, company: { name: "ATAV Spices" } });
  assert.match(blank, /Thank you for your business/);
  assert.doesNotMatch(blank, /class="inv-terms"/);
});

test("POS slip and official bill print the shop payment QR for customers to pay", () => {
  const InvoicePrint = loadInvoicePrint();
  const order = {
    order_number: "SO-2101",
    customer_name: "Walk-in",
    subtotal: 100,
    gst: 5,
    total: 105,
    payment_method: "upi",
    payment_status: "paid",
    created_at: "2026-09-07T10:00:00.000Z",
    lines: [{ item_name: "Test", quantity_gm: 500, rate_per_kg: 200, amount: 100, gst_rate: 5 }],
  };
  const qr = "data:image/png;base64,iVBORw0KGgo=";
  const ctx = {
    company: { name: "ATAV Spices", payment_qr_url: qr, payment_upi: "shop@upi" },
    customers: [],
    items: [],
    formatDateTime: (v) => String(v),
    money: (n) => `₹${Number(n).toFixed(2)}`,
    escapeHtml: (v) => String(v ?? ""),
  };
  const slip = InvoicePrint.invoiceBody(order, ctx);
  assert.match(slip, /class="inv-pay-qr"/);
  assert.match(slip, /Scan to pay/);
  assert.match(slip, /data:image\/png;base64,iVBORw0KGgo=/);
  assert.match(slip, /shop@upi/);
  const office = InvoicePrint.officeInvoiceBody(order, ctx);
  assert.match(office, /class="off-pay-qr"/);
  assert.match(office, /Scan to pay/);
  assert.match(office, /shop@upi/);
  const none = InvoicePrint.invoiceBody(order, { ...ctx, company: { name: "ATAV Spices" } });
  assert.doesNotMatch(none, /inv-pay-qr/);
  assert.doesNotMatch(none, /javascript:/);
});

test("pharmacy licences print on thermal and office invoices", () => {
  const InvoicePrint = loadInvoicePrint();
  const order = {
    order_number: "SO-MED-1",
    customer_name: "Walk-in",
    payment_method: "cash",
    payment_status: "paid",
    subtotal: 50,
    gst: 0,
    total: 50,
    created_at: "2026-09-13",
    lines: [{ item_name: "Paracetamol 500mg", quantity_gm: 1, rate_per_kg: 50, amount: 50, gst_rate: 0, unit: "PCS" }],
  };
  const ctx = {
    company: {
      name: "ABC MEDICAL",
      address: "Shop 12, Main Road",
      phone: "9876543210",
      gstin: "27AAAAA0000A1Z5",
      drug_licence_no: "20B/MH/12345",
      fssai_licence_no: "11223344556677",
      ndps_licence_no: "NDPS-9",
    },
    customers: [],
    items: [],
    formatDateTime: (v) => String(v),
    money: (n) => `₹${Number(n).toFixed(2)}`,
    escapeHtml: (v) => String(v ?? ""),
  };
  const thermal = InvoicePrint.invoiceBody(order, ctx);
  assert.match(thermal, /ABC MEDICAL/);
  assert.match(thermal, /Shop 12, Main Road/);
  assert.match(thermal, /Ph: 9876543210/);
  assert.match(thermal, /GSTIN: 27AAAAA0000A1Z5/);
  assert.match(thermal, /Drug Lic\.: 20B\/MH\/12345/);
  assert.match(thermal, /FSSAI: 11223344556677/);
  assert.match(thermal, /NDPS: NDPS-9/);
  const office = InvoicePrint.officeInvoiceBody(order, ctx);
  assert.match(office, /Drug Lic\.: 20B\/MH\/12345/);
  assert.match(office, /FSSAI: 11223344556677/);
  assert.match(office, /NDPS: NDPS-9/);
});

test("pharmacy bill prints customer, doctor/Rx, and medicine columns", () => {
  const InvoicePrint = loadInvoicePrint();
  const order = {
    order_number: "SO-RX-1",
    customer_name: "Ramesh Patil",
    customer_mobile: "9876543210",
    customer_address: "12 Main Road, Pune",
    doctor_rx: "Dr. Shah / Rx-441",
    payment_method: "cash",
    payment_status: "paid",
    subtotal: 36,
    gst: 4.32,
    total: 40.32,
    created_at: "2026-09-13",
    lines: [
      {
        item_name: "Paracetamol 500mg",
        quantity_gm: 2,
        rate_per_kg: 18,
        amount: 36,
        gst_rate: 12,
        mrp: 40,
        batch_no: "PCM09",
        expiry_date: "2027-09-30",
        pack_label: "10 Tab",
        unit: "PCS",
      },
    ],
  };
  const ctx = {
    company: { name: "ABC MEDICAL" },
    businessMeta: { category: "Medical", name: "ABC MEDICAL" },
    customers: [],
    items: [],
    formatDateTime: (v) => String(v),
    money: (n) => `₹${Number(n).toFixed(2)}`,
    escapeHtml: (v) => String(v ?? ""),
  };
  const thermal = InvoicePrint.invoiceBody(order, ctx);
  assert.match(thermal, /Ramesh Patil/);
  assert.match(thermal, /Mobile No\./);
  assert.match(thermal, /9876543210/);
  assert.match(thermal, /12 Main Road, Pune/);
  assert.match(thermal, /Dr\. Shah \/ Rx-441/);
  assert.match(thermal, /Paracetamol 500mg/);
  assert.match(thermal, /PCM09/);
  assert.match(thermal, /09\/27/);
  assert.match(thermal, /10 Tab/);
  const office = InvoicePrint.officeInvoiceBody(order, ctx);
  assert.match(office, /Batch No\./);
  assert.match(office, /Doctor \/ Rx: Dr\. Shah \/ Rx-441/);
  assert.match(office, /PCM09/);
});

test("QR invoice prints 3 pcs × rate as gross, then header discount", () => {
  const InvoicePrint = loadInvoicePrint();
  const order = {
    order_number: "QRO-T4ZVZY",
    customer_name: "Majhar",
    table_no: "3",
    subtotal: 170,
    discount: 130,
    gst: 0,
    total: 170,
    payment_method: "cash",
    payment_status: "unpaid",
    created_at: "2026-09-10T00:47:00.000Z",
    lines: [
      {
        item_name: "Masala Dosa",
        hsn: "FD-002",
        quantity_gm: 3,
        rate_per_kg: 100,
        unit: "PCS",
        amount: 170,
        gst_rate: 0,
      },
    ],
  };
  const ctx = {
    company: { name: "ABC cafe" },
    customers: [],
    items: [],
    formatDateTime: (v) => String(v),
    money: (n) => `₹${Number(n).toFixed(2)}`,
    escapeHtml: (v) => String(v ?? ""),
  };
  const figs = InvoicePrint.invoiceFigures(order, InvoicePrint.enrichLines(order, []));
  assert.equal(figs.subtotal, 300);
  assert.equal(figs.discount, 130);
  assert.equal(figs.total, 170);
  assert.equal(figs.lines[0].amount, 300);
  const html = InvoicePrint.invoiceBody(order, ctx);
  assert.match(html, /₹300\.00/);
  assert.match(html, /Discount/);
  assert.match(html, /₹130\.00/);
  assert.match(html, /₹170\.00/);
  assert.match(html, /3 pcs/);
});

test("bill discount on already-net lines does not inflate taxable value", () => {
  const InvoicePrint = loadInvoicePrint();
  const order = {
    order_number: "SO-10003",
    customer_name: "Swami Masale",
    subtotal: 40000,
    discount: 10000,
    gst: 0,
    total: 30000,
    payment_method: "credit",
    payment_status: "partial",
    amount_paid: 0,
    previous_due: 0,
    current_due: 30000,
    created_at: "2026-09-19T01:11:00.000Z",
    lines: [
      {
        item_name: "POS SPICE",
        quantity_gm: 1,
        rate_per_kg: 40000,
        unit: "PCS",
        amount: 40000,
        gst_rate: 0,
        gst_amount: 0,
      },
    ],
  };
  const ctx = {
    company: { name: "ATAV TELECOM" },
    customers: [],
    items: [{ id: "i1", unit: "PCS", base_unit: "PCS" }],
    formatDateTime: () => "19 Sept 2026, 06:41 am",
    money: (n) => `₹${Number(n).toFixed(2)}`,
    escapeHtml: (v) => String(v ?? ""),
  };
  const figs = InvoicePrint.invoiceFigures(order, InvoicePrint.enrichLines(order, ctx.items));
  assert.equal(figs.subtotal, 40000);
  assert.equal(figs.discount, 10000);
  assert.equal(figs.total, 30000);
  const html = InvoicePrint.invoiceBody(order, ctx);
  assert.match(html, /₹40000\.00/);
  assert.match(html, /₹10000\.00/);
  assert.match(html, /₹30000\.00/);
  assert.doesNotMatch(html, /₹50000\.00/);
  assert.match(html, /UNPAID/);
  assert.doesNotMatch(html, /PARTIAL/);
});
