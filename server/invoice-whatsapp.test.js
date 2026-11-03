import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { invoiceCustomerMobile, invoiceWhatsAppText } from "./invoice-whatsapp.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (name) => readFileSync(path.join(root, name), "utf8");

test("a named customer mobile is used when the bill has none", () => {
  assert.equal(
    invoiceCustomerMobile({ customer_id: "c1" }, { code: "CUS-014", name: "Mehta", mobile: "98765 43210" }),
    "9876543210",
  );
});

test("the mobile typed on the bill is the one that receives the invoice", () => {
  assert.equal(
    invoiceCustomerMobile(
      { customer_mobile: "9123456780" },
      { code: "CUS-001", name: "Walk-in", mobile: "9999999999" },
    ),
    "9123456780",
  );
});

test("a walk-in bill with no mobile is not sent to the shared counter customer", () => {
  assert.equal(invoiceCustomerMobile({ customer_mobile: "" }, { code: "CUS-001", name: "Walk-in", mobile: "9876543210" }), "");
  assert.equal(invoiceCustomerMobile({}, { name: "Walk-in", mobile: "0000000002" }), "");
  assert.equal(invoiceCustomerMobile({}, null), "");
});

test("the WhatsApp text names the shop, the invoice, the amount, and the bill link", () => {
  const text = invoiceWhatsAppText({
    shopName: "Asha Stores",
    order: { id: "abc", order_number: "SO-12", subtotal: 1299, discount: 0, loyalty_discount: 0, gst: 0, total: 1299 },
    url: "https://pos.atavtelecom.in/invoice.html?id=abc",
  });
  assert.match(text, /Asha Stores/);
  assert.match(text, /Invoice SO-12/);
  assert.match(text, /Subtotal/);
  assert.match(text, /1,299\.00/);
  assert.match(text, /Amount/);
  assert.match(text, /invoice\.html\?id=abc/);
  assert.equal(text.includes("Discount"), false);
  assert.equal(text.includes("Royalty"), false);
  assert.equal(text.includes("Taxable"), false);
});

test("every new sales invoice asks WAMaster to message the customer", () => {
  const checkout = read("server/index.js");
  const php = read("pos-checkout.php");
  const core = read("pos-php-core.php");
  const sender = read("pos-invoice-whatsapp.php");
  assert.match(checkout, /deliverInvoiceWhatsApp\(\{ businessId, order: result \}\)/);
  assert.match(read("server/recurring.js"), /deliverInvoiceWhatsApp\(/);
  assert.match(read("server/quotations.js"), /deliverInvoiceWhatsApp\(/);
  assert.match(read("server/qr-ordering.js"), /deliverInvoiceWhatsApp\(/);
  assert.match(read("server/print.js"), /deliverInvoiceWhatsApp\(/);
  assert.match(read("server/salon.js"), /deliverInvoiceWhatsApp\(/);
  assert.match(php, /pos_deliver_invoice_whatsapp\(\$bid, \$orderRow\)/);
  assert.match(php, /empty\(\$orderRow\["replay"\]\)/);
  assert.match(read("pos-quotations.php"), /pos_deliver_invoice_whatsapp\(/);
  assert.match(read("pos-qr-ordering.php"), /pos_deliver_invoice_whatsapp\(/);
  assert.match(read("pos-print.php"), /pos_deliver_invoice_whatsapp\(/);
  assert.match(core, /pos-invoice-whatsapp\.php/);
  assert.match(sender, /function pos_deliver_invoice_whatsapp/);
  assert.match(sender, /pos_wa_send\(/);
  assert.match(sender, /fastcgi_finish_request/);
  assert.match(read("server/alerts.js"), /wamaster\.atavtelecom\.in\/api\/v1\/send/);
  assert.match(read("pos-alerts.php"), /wamaster\.atavtelecom\.in\/api\/v1\/send/);
});
