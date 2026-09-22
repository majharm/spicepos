import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEFAULT_COA, expenseJournalLines, saleDiscountAmount, buildPartyLedger } from "./accounting.js";
import { splitGstAmount } from "./gst-supply.js";

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

test("Accounts wires customer and supplier ledgers", () => {
  const accounts = readFileSync(path.join(root, "server/accounts.js"), "utf8");
  const php = readFileSync(path.join(root, "pos-accounting.php"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(accounts, /\/api\/accounts\/party-ledger/);
  assert.match(php, /accounts\/party-ledger/);
  assert.match(php, /function pos_build_party_ledger/);
  assert.match(app, /function loadPartyLedgerTab/);
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
  assert.match(accounts, /export function hydrateCustomerOutstandingRows/);
  assert.match(accounts, /LEFT JOIN sales_orders o ON o.id = l.reference_id/);
  assert.match(accounts, /GREATEST\(0, COALESCE\(total,0\) - COALESCE\(amount_paid,0\)\)/);
  assert.match(core, /function pos_hydrate_customer_outstanding_rows/);
  assert.match(core, /function pos_invoice_open_dues/);
  assert.match(till, /pos_hydrate_customer_outstanding_rows/);
  assert.match(app, /function applyInvoiceDuesToCustomers/);
  assert.match(app, /function refreshCustomersOutstanding/);
  assert.match(app, /td class="cust-due"/);
  assert.match(css, /#customers-table td\.cust-due/);
  assert.match(index, /id="customers-hero-stats"/);
  assert.match(index, /id="customers-table"/);
  assert.match(accounts, /async function applyInvoicePaidFifo/);
  assert.match(core, /function pos_apply_invoice_paid_fifo/);
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
  assert.match(app, /function checkoutAmountPaid/);
  assert.match(app, /function invoiceSettlementHtml/);
  assert.match(app, /function receiptEntryFromInvoice/);
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
