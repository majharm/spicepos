import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEFAULT_COA, expenseJournalLines, saleDiscountAmount, buildPartyLedger, sortPartyLedgerRows, allocatePartyLedgerInvoices } from "./accounting.js";
import { splitGstAmount } from "./gst-supply.js";
import { splitInvoiceCollection } from "./accounts.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

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
  assert.equal(DEFAULT_COA.filter((a) => a.account_group === "expense").length, 12);
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

test("party ledger running balance for customer and supplier", () => {
  const customer = buildPartyLedger({
    opening: 200,
    rows: [
      { entry_type: "sale_credit", amount: 500, entry_no: "JV-1" },
      { entry_type: "receipt", amount: 150, entry_no: "RCP-1" },
    ],
  });
  assert.equal(customer.opening, 200);
  assert.equal(customer.rows[0].debit, 500);
  assert.equal(customer.rows[0].credit, 0);
  assert.equal(customer.rows[0].balance, 700);
  assert.equal(customer.rows[1].debit, 0);
  assert.equal(customer.rows[1].credit, 150);
  assert.equal(customer.rows[1].balance, 550);
  assert.equal(customer.closing, 550);

  const supplier = buildPartyLedger({
    opening: 80,
    rows: [
      { entry_type: "purchase_credit", amount: 400, entry_no: "JV-2" },
      { entry_type: "payment", amount: 100, entry_no: "PMT-1" },
    ],
  });
  assert.equal(supplier.rows[0].credit, 400);
  assert.equal(supplier.rows[0].balance, 480);
  assert.equal(supplier.rows[1].debit, 100);
  assert.equal(supplier.closing, 380);
});

test("customer ledger sorts by payment date so backdated receipts do not jump the sale", () => {
  const ledger = buildPartyLedger({
    opening: 0,
    rows: [
      { entry_type: "sale_credit", amount: 30000, payment_date: null, created_at: "2026-09-19 12:00:00", entry_no: "SO-10003", invoice_no: "SO-10003" },
      { entry_type: "receipt", amount: 1000, payment_date: "2026-09-08", created_at: "2026-09-20 10:00:00", entry_no: "RCP-1" },
      { entry_type: "receipt", amount: 15000, payment_date: "2026-09-11", created_at: "2026-09-20 10:01:00", entry_no: "RCP-2" },
      { entry_type: "receipt", amount: 10000, payment_date: "2026-09-16", created_at: "2026-09-20 10:02:00", entry_no: "RCP-3" },
      { entry_type: "receipt", amount: 26000, payment_date: "2026-09-19", created_at: "2026-09-20 10:03:00", entry_no: "RCP-4" },
      { entry_type: "receipt", amount: 3000, payment_date: "2026-10-21", created_at: "2026-10-21 11:00:00", entry_no: "RCP-5" },
    ],
  });
  assert.deepEqual(ledger.rows.map((r) => r.entry_no), ["RCP-1", "RCP-2", "RCP-3", "SO-10003", "RCP-4", "RCP-5"]);
  assert.equal(ledger.rows[0].balance, -1000);
  assert.equal(ledger.rows[1].balance, -16000);
  assert.equal(ledger.rows[2].balance, -26000);
  assert.equal(ledger.rows[3].entry_type, "sale_credit");
  assert.equal(ledger.rows[3].balance, 4000);
  assert.equal(ledger.rows[4].balance, -22000);
  assert.equal(ledger.rows[5].balance, -25000);
  assert.equal(ledger.closing, -25000);
  assert.equal(sortPartyLedgerRows(ledger.rows)[3].entry_type, "sale_credit");
});

test("customer-wise ledger allocates receipts to the invoice and reports billed/paid/due", () => {
  const ledger = buildPartyLedger({
    opening: 0,
    rows: [
      { entry_type: "sale_credit", amount: 30000, payment_date: null, created_at: "2026-09-19 12:00:00", entry_no: "JV-1", notes: "SO-10003" },
      { entry_type: "receipt", amount: 1000, payment_date: "2026-09-08", created_at: "2026-09-20 10:00:00", entry_no: "RCP-1" },
      { entry_type: "receipt", amount: 15000, payment_date: "2026-09-11", created_at: "2026-09-20 10:01:00", entry_no: "RCP-2" },
      { entry_type: "receipt", amount: 10000, payment_date: "2026-09-16", created_at: "2026-09-20 10:02:00", entry_no: "RCP-3" },
      { entry_type: "receipt", amount: 3000, payment_date: "2026-10-21", created_at: "2026-10-21 11:00:00", entry_no: "RCP-5" },
    ],
  });
  assert.equal(ledger.closing, 1000);
  assert.ok(ledger.rows.every((r) => r.entry_type !== "receipt" || r.invoice_no === "SO-10003"));
  assert.equal(ledger.invoices.length, 1);
  assert.equal(ledger.invoices[0].invoice_no, "SO-10003");
  assert.equal(ledger.invoices[0].billed, 30000);
  assert.equal(ledger.invoices[0].paid, 29000);
  assert.equal(ledger.invoices[0].due, 1000);
  const missingSale = buildPartyLedger({
    opening: 0,
    rows: [{ entry_type: "receipt", amount: 1000, payment_date: "2026-09-08", created_at: "2026-09-08", entry_no: "RCP-1" }],
    sales: [{ id: "ord-1", order_number: "SO-10003", total: 30000, created_at: "2026-09-19", customer_id: "c1" }],
  });
  assert.equal(missingSale.rows.some((r) => r.entry_type === "sale_credit" && r.invoice_no === "SO-10003"), true);
  assert.equal(missingSale.invoices[0].due, 29000);
  assert.equal(allocatePartyLedgerInvoices([{ entry_type: "receipt", amount: 50, invoice_no: "" }])[0].invoice_no, "Advance");
});

test("Accounts wires customer and supplier ledgers", () => {
  const accounts = readFileSync(path.join(root, "server/accounts.js"), "utf8");
  const php = readFileSync(path.join(root, "pos-accounting.php"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(accounts, /\/api\/accounts\/party-ledger/);
  assert.match(php, /accounts\/party-ledger/);
  assert.match(php, /function pos_build_party_ledger/);
  assert.match(php, /function pos_sort_party_ledger_rows/);
  assert.match(php, /function pos_allocate_party_ledger_invoices/);
  assert.match(php, /function pos_merge_party_ledger_sales/);
  assert.match(php, /pos_ledger_event_between/);
  assert.match(accounts, /ledgerEventBetween/);
  assert.match(accounts, /ledgerEventOrderAsc/);
  assert.match(accounts, /linked_order_number/);
  assert.match(app, /function loadPartyLedgerTab/);
  assert.match(app, /function ledgerBalanceText/);
  assert.match(app, /acc-inv-head/);
  assert.match(app, /formatShopDate\(data\?\.from\)/);
  assert.match(app, /\/api\/accounts\/party-ledger/);
  assert.match(index, /data-acc-tab="customer-ledger"/);
  assert.match(index, /data-acc-tab="supplier-ledger"/);
  assert.match(index, /id="acc-customer"/);
  assert.match(index, /id="acc-supplier"/);
  assert.match(index, /id="acc-pane-customer-ledger"/);
  assert.match(index, /id="acc-pane-supplier-ledger"/);
  assert.match(accounts, /AS \\`lines\\`/);
  assert.match(php, /AS `lines`/);
});

test("receipts and payments can be altered after save", () => {
  const accounts = readFileSync(path.join(root, "server/accounts.js"), "utf8");
  const accounting = readFileSync(path.join(root, "server/accounting.js"), "utf8");
  const php = readFileSync(path.join(root, "pos-accounting.php"), "utf8");
  const core = readFileSync(path.join(root, "pos-php-core.php"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  assert.match(accounting, /export async function replaceLedgerJournal/);
  assert.match(accounts, /\/api\/accounts\/receipts\/:id/);
  assert.match(accounts, /\/api\/accounts\/payments\/:id/);
  assert.match(accounts, /Customer Receipt Altered/);
  assert.match(php, /accounts\/receipts\/\(\[\^\/\]\+\)/);
  assert.match(php, /function pos_replace_ledger_journal/);
  assert.match(php, /accounts\/payments\/\(\[\^\/\]\+\)/);
  assert.match(app, /function showAlterVoucherModal/);
  assert.match(app, /data-voucher-alter/);
  assert.match(app, /modal-alter-voucher/);
  assert.match(app, /\/api\/accounts\/receipts\/\$\{entry\.id\}/);
  assert.match(app, /payment_date: paymentDate/);
  assert.match(accounts, /function clipPaymentDate/);
  assert.match(accounts, /payment_date: paymentDate/);
  assert.match(core, /function pos_clip_payment_date/);
  assert.match(php, /pos_clip_payment_date/);
  assert.match(php, /payment_date = \? WHERE id = \? AND business_id = \?/);
  const fn = accounts.match(/export function clipPaymentDate\(raw\) \{[\s\S]*?\n\}/);
  assert.ok(fn);
  const clipPaymentDate = Function(`${fn[0].replace("export ", "")}; return clipPaymentDate;`)();
  assert.equal(clipPaymentDate("2026-09-09"), "2026-09-09");
  assert.equal(clipPaymentDate("09/09/2026"), "2026-09-09");
  assert.equal(clipPaymentDate("19-09-2026"), "2026-09-19");
});

test("receipts and payments can be deleted after save", () => {
  const accounts = readFileSync(path.join(root, "server/accounts.js"), "utf8");
  const accounting = readFileSync(path.join(root, "server/accounting.js"), "utf8");
  const php = readFileSync(path.join(root, "pos-accounting.php"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  assert.match(accounting, /export async function deleteLedgerJournal/);
  assert.match(accounts, /app.delete\("\/api\/accounts\/receipts\/:id"/);
  assert.match(accounts, /app.delete\("\/api\/accounts\/payments\/:id"/);
  assert.match(accounts, /Customer Receipt Deleted/);
  assert.match(accounts, /Supplier Payment Deleted/);
  assert.match(php, /function pos_delete_ledger_journal/);
  assert.match(php, /\$method === "DELETE"/);
  assert.match(app, /function deleteVoucherEntry/);
  assert.match(app, /canDeletePaymentEntry/);
  assert.match(app, /data-voucher-delete/);
  assert.match(app, /modal-delete-voucher/);
  assert.match(app, /data-exp-delete/);
  assert.match(accounts, /app.delete\("\/api\/expenses\/:id"/);
  assert.match(php, /pos_require_business_admin_delete/);
});

test("business admin can delete invoices and reverse credit sale", () => {
  const accounts = readFileSync(path.join(root, "server/accounts.js"), "utf8");
  const crud = readFileSync(path.join(root, "server/crud.js"), "utf8");
  const orders = readFileSync(path.join(root, "pos-orders.php"), "utf8");
  const core = readFileSync(path.join(root, "pos-php-core.php"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  assert.match(accounts, /export async function reverseCreditSale/);
  assert.match(accounts, /export async function settleCustomerInvoice/);
  assert.match(accounts, /formatPaymentReceiptNo/);
  assert.match(accounts, /\/api\/accounts\/open-invoices/);
  assert.doesNotMatch(accounts, /Cannot delete invoice with customer receipts/);
  assert.match(crud, /app.delete\("\/api\/orders\/:id"/);
  assert.match(crud, /reverseLoyaltyOnSale/);
  assert.match(crud, /recomputeCustomerOutstanding/);
  assert.match(orders, /function pos_delete_order/);
  assert.match(orders, /pos_recompute_customer_outstanding/);
  assert.match(core, /function pos_reverse_credit_sale/);
  assert.match(core, /function pos_recompute_customer_outstanding/);
  assert.match(core, /function pos_recompute_business_outstanding/);
  assert.match(core, /function pos_settle_customer_invoice/);
  assert.match(core, /function pos_is_walk_in_customer/);
  assert.match(accounts, /function isWalkInParty/);
  assert.match(app, /data-delete-order/);
  assert.match(app, /Delete invoice/);
  assert.match(app, /await loadBootstrap\(\)/);
});

test("customer outstanding hydrates from open invoice remainders on the Customers page", () => {
  const accounts = readFileSync(path.join(root, "server/accounts.js"), "utf8");
  const core = readFileSync(path.join(root, "pos-php-core.php"), "utf8");
  const till = readFileSync(path.join(root, "pos-php-till.php"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  const css = readFileSync(path.join(root, "css/pos.css"), "utf8");
  assert.match(accounts, /export async function invoiceOpenDueByCustomer/);
  assert.match(accounts, /async function recomputeBusinessOutstandingSetBased/);
  assert.match(accounts, /export async function recomputeAllBusinessesOutstanding/);
  assert.match(accounts, /GROUP BY l.business_id, l.party_id/);
  assert.match(accounts, /export function hydrateCustomerOutstandingRows/);
  assert.match(accounts, /export async function persistHydratedOutstanding/);
  assert.match(accounts, /Object.prototype.hasOwnProperty.call\(map, c\?\.id\)/);
  assert.match(accounts, /WHEN inv.id IS NOT NULL THEN COALESCE\(inv.open_due, 0\)/);
  assert.match(accounts, /if \(Number\(inv\?\.n\) > 0\) next = round2\(Number\(inv\?\.open_due\) \|\| 0\)/);
  assert.match(core, /function pos_hydrate_customer_outstanding_rows/);
  assert.match(core, /function pos_invoice_open_dues/);
  assert.match(core, /array_key_exists\(\$cid, \$dues\)/);
  assert.match(core, /WHEN inv.id IS NOT NULL THEN COALESCE\(inv.open_due, 0\)/);
  assert.match(accounts, /INVOICE_OPEN_REMAINDER_SQL/);
  assert.match(accounts, /async function customerPreviousDue/);
  assert.match(core, /function pos_invoice_open_remainder_sql/);
  assert.match(core, /function pos_customer_previous_due/);
  assert.match(core, /function pos_recompute_all_businesses_outstanding/);
  assert.match(core, /function pos_recompute_outstanding_set/);
  assert.match(till, /pos_hydrate_customer_outstanding_rows/);
  assert.match(app, /function applyInvoiceDuesToCustomers/);
  assert.match(app, /function invoiceOpenRemainder/);
  assert.match(app, /function refreshCustomersOutstanding/);
  assert.match(app, /td class="cust-due"/);
  assert.match(css, /#customers-table td\.cust-due/);
  assert.match(index, /id="customers-hero-stats"/);
  assert.match(index, /id="customers-table"/);
  assert.match(readFileSync(path.join(root, "server/index.js"), "utf8"), /recomputeAllBusinessesOutstanding\(\)/);
  assert.match(core, /function pos_apply_invoice_paid_fifo/);
});

test("extra collection above this bill is overflow, not this invoice payment", () => {
  const parts = splitInvoiceCollection(17700, 12980);
  assert.equal(parts.onThis, 12980);
  assert.equal(parts.overflow, 4720);
  assert.equal(parts.paid, 17700);
});

test("open invoice list collapses duplicate ids and order numbers", async () => {
  const { uniqueOpenInvoiceRows } = await import("./accounts.js");
  const php = readFileSync(path.join(root, "pos-accounting.php"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  const rows = uniqueOpenInvoiceRows([
    { id: "a", order_number: "SO-10003", total: 1000, amount_paid: 0 },
    { id: "a", order_number: "SO-10003", total: 1000, amount_paid: 0 },
    { id: "b", order_number: "SO-10003", total: 1000, amount_paid: 0 },
    { id: "c", order_number: "SO-10004", total: 500, amount_paid: 0 },
  ]);
  assert.deepEqual(rows.map((r) => r.id), ["a", "c"]);
  assert.match(php, /function pos_unique_open_invoices/);
  assert.match(php, /pos_unique_open_invoices\(pos_q/);
  assert.match(app, /dueInvoiceFillSeq/);
  assert.match(app, /function uniqueOpenInvoices/);
  assert.match(app, /id="due-invoice-picks"|due-invoice-picks/);
  assert.match(index, /id="due-invoice-picks"/);
  assert.match(index, /id="due-invoice"/);
});

test("stale customer outstanding is cleared when open invoices are paid", async () => {
  const { hydrateCustomerOutstandingRows } = await import("./accounts.js");
  const paid = hydrateCustomerOutstandingRows(
    [{ id: "cust-majhar", name: "majhar", outstanding: 1900 }],
    { "cust-majhar": 0 },
  );
  assert.equal(paid[0].outstanding, 0);
  const untouched = hydrateCustomerOutstandingRows(
    [{ id: "cust-ledger", name: "Opening balance", outstanding: 500 }],
    {},
  );
  assert.equal(untouched[0].outstanding, 500);
});

test("invoice payment is counted once on the receipt balance", async () => {
  const { invoicePaidAfterDelta } = await import("./accounts.js");
  const once = invoicePaidAfterDelta({ previousDue: 0, total: 49560, amountPaid: 0, delta: 48720 });
  assert.equal(once.amountPaid, 48720);
  assert.equal(once.currentDue, 840);
  assert.equal(once.paymentStatus, "partial");
  const partial = invoicePaidAfterDelta({ previousDue: 0, total: 49560, amountPaid: 0, delta: 10000 });
  assert.equal(partial.currentDue, 39560);
  assert.notEqual(partial.currentDue, 29560);
  const settled = invoicePaidAfterDelta({ previousDue: 0, total: 49560, amountPaid: 48720, delta: 840 });
  assert.equal(settled.currentDue, 0);
  assert.equal(settled.paymentStatus, "paid");
});

test("invoice settlement posts sale credit, payment receipt, and customer due", () => {
  const accounts = readFileSync(path.join(root, "server/accounts.js"), "utf8");
  const core = readFileSync(path.join(root, "pos-php-core.php"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const css = readFileSync(path.join(root, "css/pos.css"), "utf8");
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  const invoice = readFileSync(path.join(root, "js/invoice.js"), "utf8");
  assert.match(accounts, /PR-\$\{String\(Number\(n\) \|\| 0\)\.padStart\(5, "0"\)\}/);
  assert.match(accounts, /function listCustomerReceipts/);
  assert.match(core, /function pos_list_customer_receipts/);
  assert.match(core, /function pos_attach_order_payments/);
  assert.match(accounts, /if \(credit\) return 0/);
  assert.match(core, /function pos_invoice_paid_amount/);
  assert.match(core, /if \(\$credit\) return 0/);
  assert.match(core, /PR-%05d/);
  assert.match(core, /\$previousDue \+ \$invoiceTotal - \$paid/);
  assert.match(accounts, /export function splitInvoiceCollection/);
  assert.match(accounts, /amountPaid: onThis/);
  assert.match(core, /function pos_split_invoice_collection/);
  assert.match(core, /"amountPaid" => \$onThis/);
  assert.match(app, /function thisBillPayable/);
  assert.match(app, /Item Description/);
  assert.match(app, /function checkoutAmountPaid/);
  assert.match(app, /function invoiceSettlementHtml/);
  assert.match(app, /function receiptEntryFromInvoice/);
  assert.match(app, /receiptSlipFromInvoice/);
  assert.doesNotMatch(app, /\|\| "PR"/);
  assert.match(accounts, /@pos_paid := GREATEST\(0, COALESCE\(amount_paid, 0\) \+ \?\)/);
  assert.match(accounts, /COALESCE\(total, 0\) - @pos_paid/);
  assert.match(accounts, /\[delta, orderId, bid\(\)\]/);
  assert.doesNotMatch(accounts, /\[delta, delta, delta, delta, orderId, bid\(\)\]/);
  assert.doesNotMatch(accounts, /COALESCE\(total, 0\) - GREATEST\(0, COALESCE\(amount_paid, 0\) \+ \?\)/);
  assert.match(core, /@pos_paid := GREATEST\(0, COALESCE\(amount_paid, 0\) \+ \?\)/);
  assert.match(core, /COALESCE\(total, 0\) - @pos_paid/);
  assert.match(core, /"dss"/);
  assert.doesNotMatch(core, /"ddddss"/);
  assert.doesNotMatch(core, /COALESCE\(total, 0\) - GREATEST\(0, COALESCE\(amount_paid, 0\) \+ \?\)/);
  assert.match(invoice, /function receiptSlipFromInvoice/);
  assert.match(invoice, /function receiptRemainingFromInvoice/);
  assert.match(app, /details class="invoice-settle"/);
  assert.match(css, /min-height: min\(52vh, 420px\)/);
  assert.match(index, /id="pay-amount"/);
  assert.doesNotMatch(index, /id="pay-ref"/);
  assert.doesNotMatch(index, /id="pay-date"/);
  assert.match(index, /id="due-invoice"/);
  assert.match(index, /id="due-date"/);
  assert.match(app, /function showReceiptModal/);
  assert.match(app, /id="rcp-date"/);
  assert.match(app, /Collect due ·/);
  assert.match(invoice, /PAYMENT RECEIPT/);
  assert.match(invoice, /Against Invoice/);
  assert.match(invoice, /function invoiceDueRowsHtml/);
  assert.match(invoice, /Payment Made/);
  assert.match(app, /function attachMissingOrderPayments/);
  assert.match(app, /payments: src\.payments \|\| receiptOrder\.payments/);
});
