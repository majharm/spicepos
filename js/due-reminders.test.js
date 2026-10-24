import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
vm.runInThisContext(read("js/due-reminders.js"), { filename: "js/due-reminders.js" });
const D = globalThis.POSDueReminders;

const today = "2026-10-24";

function invoice(extra = {}) {
  return {
    id: "ord-1",
    order_number: "INV-11",
    created_at: "2026-10-20 11:00:00",
    total: 1000,
    amount_paid: 400,
    payment_method: "credit",
    payment_status: "partial",
    customer_id: "cus-1",
    business_name: "Riya Stores",
    name: "Riya",
    mobile: "+91 98765 43210",
    ...extra,
  };
}

test("due reminder uses the outstanding template and a partial balance", () => {
  const row = D.shapeInvoice(invoice(), null, today);
  assert.equal(row.outstanding, 600);
  assert.equal(row.paymentStatus, "partial");
  assert.equal(row.mobileOk, true);
  assert.equal(row.invoiceDateLabel, "20 Oct 2026");
  assert.equal(row.overdue, true);
  const text = D.invoiceMessage(row, "ATAV Fashion");
  assert.match(text, /Dear \*Riya Stores\*,/);
  assert.match(text, /Greetings from \*ATAV Fashion\*!/);
  assert.match(text, /Invoice No\.: INV-11/);
  assert.match(text, /Invoice Date: 20 Oct 2026/);
  assert.match(text, /Invoice Amount: ₹1,000\.00/);
  assert.match(text, /Amount Paid: ₹400\.00/);
  assert.match(text, /\*Balance Due: ₹600\.00\*/);
  assert.match(text, /Due Date: 20 Oct 2026/);
  assert.match(text, /Powered by ATAV POS/);
  assert.match(D.dueReminderMessage({}), /Email|Name|Invoice No\.: —/);
});

test("fully paid invoices drop out and a later payment reduces the due", () => {
  const paid = D.shapeInvoice(invoice({ amount_paid: 1000, payment_status: "paid", payment_method: "upi" }), null, today);
  assert.equal(paid.outstanding, 0);
  assert.equal(paid.paymentStatus, "paid");
  const cash = D.shapeInvoice(invoice({ amount_paid: 0, payment_status: "paid", payment_method: "cash", total: 250 }), null, today);
  assert.equal(cash.outstanding, 0);
  const open = D.shapeInvoice(invoice({ amount_paid: 0, payment_status: "unpaid", total: 250 }), null, today);
  assert.equal(open.outstanding, 250);
  const afterPay = D.shapeInvoice(invoice({ amount_paid: 1000 }), null, today);
  assert.equal(afterPay.outstanding, 0);
  const rows = D.filterOutstanding([paid, open], {}, today);
  assert.deepEqual(rows.map((row) => row.orderId), ["ord-1"]);
});

test("customer total adds every open invoice and filters the list", () => {
  const first = D.shapeInvoice(invoice(), null, today);
  const second = D.shapeInvoice(invoice({
    id: "ord-2",
    order_number: "INV-12",
    created_at: "2026-10-24 09:00:00",
    total: 500,
    amount_paid: 0,
    payment_status: "unpaid",
  }), null, today);
  assert.equal(second.overdue, false);
  assert.equal(second.paymentStatus, "due");
  const text = D.customerMessage([first, second], "ATAV Fashion");
  assert.match(text, /INV-11, INV-12/);
  assert.match(text, /Invoice Amount: ₹1,500\.00/);
  assert.match(text, /Amount Paid: ₹400\.00/);
  assert.match(text, /Balance Due: ₹1,100\.00/);
  const filtered = D.filterOutstanding([first, second], { customer: "riya", status: "partial", min: 500, max: 700, from: "2026-10-01", to: "2026-10-23" }, today);
  assert.deepEqual(filtered.map((row) => row.invoiceNumber), ["INV-11"]);
  const overdue = D.filterOutstanding([first, second], { status: "overdue" }, today);
  assert.deepEqual(overdue.map((row) => row.invoiceNumber), ["INV-11"]);
  assert.equal(D.normalizeMobile("123"), "");
  assert.equal(D.dedupeKey("cus-1", "ord-1", 600, today), "cus-1|ord-1|600.00|2026-10-24");
  assert.equal(D.dedupeKey("cus-1", "", 1100, today), "cus-1|total|1100.00|2026-10-24");
});

test("outstanding table shows the reminder columns and WhatsApp action", () => {
  const row = D.shapeInvoice(invoice(), { status: "sent", provider_message_id: "wamid.1" }, today);
  row.totalWhatsappStatus = "queued";
  const html = D.duesTableHtml([row]);
  for (const heading of ["Customer Name", "Mobile Number", "Invoice Number", "Invoice Date", "Total Invoice Amount", "Amount Paid", "Outstanding Balance", "Due Date", "Payment Status", "WhatsApp Action"]) {
    assert.match(html, new RegExp(heading));
  }
  assert.match(html, /Send WhatsApp/);
  assert.match(html, /Customer total/);
  assert.match(html, /Partial/);
  assert.match(html, /Overdue/);
  assert.match(html, />Sent</);
  assert.match(html, /Total Pending/);
  assert.match(html, /₹600\.00/);
  const index = read("index.html");
  const app = read("js/app.js");
  const server = read("server/due-reminders.js");
  const php = read("pos-due-reminders.php");
  assert.match(index, /id="view-dues"/);
  assert.match(index, /id="dues-send-selected"/);
  assert.match(index, /Send total due for selected customers/);
  assert.match(app, /POSDueRemindersUi\?\.load/);
  assert.match(app, /POSDueRemindersUi\?\.refreshIfOpen/);
  assert.match(server, /\/api\/customers\/outstanding/);
  assert.match(server, /\/api\/customers\/due-reminders/);
  assert.doesNotMatch(server, /UPDATE\s+sales_orders/i);
  assert.doesNotMatch(server, /UPDATE\s+customers/i);
  assert.match(php, /function pos_due_reminders_dispatch/);
  assert.match(php, /acc_1792638026073/);
  assert.match(php, /pos_wa_send\(/);
  assert.match(php, /pos_alert_settings\(/);
  assert.match(server, /dueWaCfg\(/);
  assert.match(server, /loadAlertSettings\(/);
  assert.match(read("server/alerts.js"), /export const WA_DEFAULT_PROFILE = "acc_1782484414096"/);
  assert.match(read("server/alerts.js"), /export const DUE_WA_PROFILE = "acc_1792638026073"/);
  assert.match(php, /Powered by ATAV POS/);
  assert.doesNotMatch(php, /UPDATE\s+sales_orders/i);
  assert.match(read("pos-php-core.php"), /pos_due_reminders_dispatch/);
});
