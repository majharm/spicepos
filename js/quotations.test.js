import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "../js/discount.js";
import "../js/quotations.js";
import { quotationPdfBuffer } from "../server/invoice-pdf.js";

const Q = globalThis.POSQuotations;
const read = (path) => fs.readFileSync(path, "utf8");

test("quotation numbers, totals, expiry, and print label", () => {
  assert.equal(Q.formatNumber(1), "QT-00001");
  assert.equal(Q.formatNumber(12), "QT-00012");
  const priced = Q.priceQuote({
    lines: [{ itemId: "item-1", name: "Masala", quantity: 2, rate: 100, gstRate: 18, unit: "PCS", isCount: true, discountValue: 10 }],
    discountType: "amt",
    discountValue: 10,
    extraCharges: 5,
    roundOff: -0.2,
  });
  assert.equal(priced.lines.length, 1);
  assert.equal(priced.subtotal, 190);
  assert.equal(priced.gst, 34.2);
  assert.equal(priced.discount, 10);
  assert.equal(priced.extraCharges, 5);
  assert.equal(priced.roundOff, -0.2);
  assert.equal(priced.cgst, 17.1);
  assert.equal(priced.sgst, 17.1);
  assert.equal(priced.igst, 0);
  assert.equal(priced.total, 219);
  const weight = Q.priceQuote({
    lines: [{ itemId: "item-2", name: "Rice", quantity: 500, rate: 200, unit: "GM", isCount: false, gstRate: 0 }],
  });
  assert.equal(weight.subtotal, 100);
  assert.equal(weight.total, 100);
  const inter = Q.priceQuote({
    lines: [{ itemId: "item-1", quantity: 1, rate: 100, gstRate: 18, isCount: true }],
    interState: true,
  });
  assert.equal(inter.igst, inter.gst);
  assert.equal(inter.cgst, 0);
  const today = "2026-10-27";
  assert.equal(Q.effectiveStatus({ status: "accepted", valid_until: "2026-10-26" }, today), "expired");
  assert.equal(Q.effectiveStatus({ status: "converted", valid_until: "2026-10-01" }, today), "converted");
  assert.equal(Q.effectiveStatus({ status: "cancelled", valid_until: "2026-10-01" }, today), "cancelled");
  assert.equal(Q.canConvert({ status: "accepted", valid_until: "2026-11-01" }, today), true);
  assert.equal(Q.canConvert({ status: "accepted", valid_until: "2026-10-26" }, today), false);
  assert.equal(Q.canConvert({ status: "accepted", valid_until: "2026-11-01", order_id: "so-1" }, today), false);
  assert.equal(Q.canEdit({ status: "draft" }, today), true);
  assert.equal(Q.canEdit({ status: "sent" }, today), false);
  assert.equal(Q.emailSubject("QT-00001", "Spice Shop"), "Quotation QT-00001 – Spice Shop");
  const html = Q.printHtml(
    { quotation_number: "QT-00001", quotation_date: today, valid_until: "2026-11-11", customer_name: "Asha", lines: priced.lines, subtotal: priced.subtotal, discount: priced.discount, gst: priced.gst, cgst: priced.cgst, sgst: priced.sgst, total: priced.total, terms: "Pay on acceptance" },
    { name: "Spice Shop", gstin: "27AAAAA0000A1Z5" },
  );
  assert.match(html, /QUOTATION — NOT A TAX INVOICE/);
  assert.match(html, /Customer acceptance/);
  assert.match(html, /Page 1/);
  assert.match(html, /Amount in words/);
  const stats = Q.summarize([
    { status: "draft", total: 10, valid_until: "2026-12-01" },
    { status: "accepted", total: 20, valid_until: "2026-12-01" },
    { status: "accepted", total: 5, valid_until: "2026-10-01" },
    { status: "converted", total: 30, valid_until: "2026-10-01" },
  ], today);
  assert.equal(stats.total, 4);
  assert.equal(stats.draft, 1);
  assert.equal(stats.accepted, 1);
  assert.equal(stats.expired, 1);
  assert.equal(stats.converted, 1);
  assert.equal(stats.acceptedValue, 50);
  const pdf = quotationPdfBuffer({ name: "Spice Shop" }, { quotation_number: "QT-00001", lines: [], total: 219 });
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.match(pdf.toString("latin1"), /NOT A TAX INVOICE/);
});

test("quotation module stays off, isolated, and posts stock only on convert", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const php = read("pos-quotations.php");
  const node = read("server/quotations.js");
  const core = read("pos-php-core.php");
  assert.match(index, /data-view="quotations" hidden/);
  assert.match(index, /id="view-quotations"/);
  assert.match(index, /id="set-quotations"/);
  assert.doesNotMatch(index, /id="set-quotations" checked/);
  assert.match(index, /Enable Quotations/);
  assert.match(index, /All Quotations/);
  assert.match(index, /Create Quotation/);
  assert.match(index, /Quotation Settings/);
  assert.match(index, /Quotation Reports/);
  assert.match(index, /js\/quotations\.js\?v=20261027qt1/);
  assert.match(index, /js\/quotations-ui\.js\?v=20261027qt1/);
  assert.match(index, /css\/quotations\.css\?v=20261027qt1/);
  assert.match(index, /app\.js\?v=20261027qt1/);
  assert.match(app, /function quotationsOn/);
  assert.match(app, /view === "quotations"\) btn\.hidden = !can\("orders"\) \|\| !quotationsOn\(\)/);
  assert.match(app, /payload\.quotations_enabled = \$\("set-quotations"\)\.checked \? 1 : 0/);
  assert.match(app, /POSQuotationsUi\?\.load/);
  assert.match(read("server/schema.js"), /quotations_enabled.*DEFAULT 0/);
  assert.match(read("server/index.js"), /ensureQuotationSchema/);
  assert.match(core, /quotations_enabled" => "TINYINT\(1\) NOT NULL DEFAULT 0"/);
  assert.ok(core.indexOf("pos-quotations.php") < core.indexOf("This POS action is not available in PHP fallback yet"));
  const createAt = node.indexOf('app.post("/api/quotations",');
  const editAt = node.indexOf('app.post("/api/quotations/:id",');
  const emailAt = node.indexOf('app.post("/api/quotations/:id/email"');
  const convertAt = node.indexOf('app.post("/api/quotations/:id/convert"');
  assert.doesNotMatch(node.slice(createAt, editAt), /applySaleStock\(/);
  assert.doesNotMatch(node.slice(createAt, editAt), /settleCustomerInvoice/);
  assert.doesNotMatch(node.slice(emailAt, convertAt), /status = 'accepted'/);
  assert.match(node.slice(emailAt, convertAt), /email_failed/);
  assert.match(node.slice(convertAt), /applySaleStock\(/);
  assert.match(node.slice(convertAt), /amountPaid: 0/);
  assert.match(node.slice(convertAt), /order_id IS NULL AND status = 'accepted'/);
  const phpConvert = php.indexOf("function pos_quote_convert");
  assert.equal(php.slice(0, phpConvert).includes("stock_gm"), false);
  assert.match(php.slice(phpConvert), /stock_gm/);
  assert.match(php.slice(phpConvert), /pos_settle_customer_invoice/);
  assert.match(php.slice(phpConvert), /order_id IS NULL AND status = 'accepted'/);
  assert.match(php, /function pos_quotations_dispatch/);
  assert.match(php, /QUOTATION - NOT A TAX INVOICE/);
  assert.doesNotMatch(php, /pos_checkout_sale/);
  assert.match(read("js/quotations-ui.js"), /does not mark this quotation accepted|was not marked accepted/);
  assert.match(read("css/quotations.css"), /quotations-desk: quotations 2026/);
});
