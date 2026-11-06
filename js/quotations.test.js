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
  assert.equal(priced.taxable, 180);
  assert.equal(priced.gst, 32.4);
  assert.equal(priced.discount, 10);
  assert.equal(priced.extraCharges, 5);
  assert.equal(priced.roundOff, -0.2);
  assert.equal(priced.cgst, 16.2);
  assert.equal(priced.sgst, 16.2);
  assert.equal(priced.igst, 0);
  assert.equal(priced.total, 217.2);
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
  assert.equal(Q.canEdit({ status: "sent" }, today), true);
  assert.equal(Q.canEdit({ status: "accepted", valid_until: "2026-11-01" }, today), true);
  assert.equal(Q.canEdit({ status: "rejected" }, today), true);
  assert.equal(Q.canEdit({ status: "expired" }, today), true);
  assert.equal(Q.canEdit({ status: "sent", order_id: "so-1" }, today), false);
  assert.equal(Q.canEdit({ status: "converted" }, today), false);
  assert.equal(Q.canEdit({ status: "cancelled" }, today), false);
  assert.equal(Q.emailSubject("QT-00001", "Spice Shop"), "Quotation QT-00001 – Spice Shop");
  const mailQuote = {
    id: "11111111-1111-1111-1111-111111111111",
    quotation_number: "QT-00001",
    quotation_date: "2026-11-05",
    valid_until: "2026-11-20",
    customer_name: "QTECH ISP CONSULTANCY",
    customer_phone: "9876543210",
    customer_email: "accounts@qtech.example",
    billing_address: "Kolkata",
    terms: "100% advance before delivery",
    notes: "SMS route as discussed",
    lines: [{ name: "BULK SMS", quantity: 700000, unit: "NOS", rate: 0.135, taxable: 94500, gst: 17010, gstRate: 18, total: 111510 }],
    subtotal: 94500,
    taxable: 94500,
    gst: 17010,
    cgst: 8505,
    sgst: 8505,
    total: 111510,
  };
  const mailLinks = {
    viewUrl: "https://pos.atavtelecom.in/quotation.html?id=11111111-1111-1111-1111-111111111111",
    pdfUrl: "https://pos.atavtelecom.in/api/quotations/public/11111111-1111-1111-1111-111111111111/pdf",
  };
  const mailCompany = {
    name: "ATAV TELECOM",
    address: "Kolkata",
    phone: "9000000000",
    email: "accounts@atavtelecom.in",
    gstin: "19AAAAA0000A1Z5",
    logo_url: "https://pos.atavtelecom.in/favicon.svg",
  };
  const mailHtml = Q.emailHtml(mailQuote, mailCompany, mailLinks);
  const mailText = Q.emailText(mailQuote, mailCompany, mailLinks);
  assert.match(mailHtml, /role="presentation"/);
  assert.match(mailHtml, /style="/);
  assert.doesNotMatch(mailHtml, /<style/);
  assert.doesNotMatch(mailHtml, /display:\s*flex|display:\s*grid/);
  assert.match(mailHtml, /QT-00001/);
  assert.match(mailHtml, /QTECH ISP CONSULTANCY/);
  assert.match(mailHtml, /05 Nov 2026/);
  assert.match(mailHtml, /20 Nov 2026/);
  assert.match(mailHtml, /₹0\.135/);
  assert.doesNotMatch(mailHtml, /₹0\.14/);
  assert.match(mailHtml, /GST/);
  assert.match(mailHtml, /GRAND TOTAL/);
  assert.match(mailHtml, /₹1,11,510\.00/);
  assert.match(mailHtml, /100% advance before delivery/);
  assert.match(mailHtml, /VALIDITY AND PAYMENT TERMS/);
  assert.match(mailHtml, /View Quotation/);
  assert.match(mailHtml, /Download PDF/);
  assert.match(mailHtml, /https:\/\/pos\.atavtelecom\.in\/quotation\.html\?id=/);
  assert.match(mailHtml, /favicon\.svg/);
  assert.match(mailHtml, /accounts@atavtelecom\.in/);
  assert.doesNotMatch(Q.emailHtml(mailQuote, { ...mailCompany, logo_url: "javascript:alert(1)" }, { viewUrl: "javascript:alert(1)", pdfUrl: "javascript:alert(1)" }), /javascript:/);
  assert.match(mailText, /View quotation: https:\/\/pos\.atavtelecom\.in\/quotation\.html/);
  assert.match(mailText, /Download PDF: https:\/\/pos\.atavtelecom\.in\/api\/quotations\/public\//);
  assert.match(mailText, /Grand total/);
  const safeView = Q.customerView({ ...mailQuote, lines_json: "secret", business_id: "biz", created_by: "staff" });
  assert.equal(safeView.business_id, undefined);
  assert.equal(safeView.created_by, undefined);
  assert.equal(safeView.lines[0].name, "BULK SMS");
  const html = Q.printHtml(
    { quotation_number: "QT-00001", quotation_date: today, valid_until: "2026-11-11", customer_name: "Asha", lines: priced.lines, subtotal: priced.subtotal, discount: priced.discount, gst: priced.gst, cgst: priced.cgst, sgst: priced.sgst, total: priced.total, terms: "Pay on acceptance" },
    { name: "Spice Shop", gstin: "27AAAAA0000A1Z5" },
  );
  assert.match(html, /QUOTATION — NOT A TAX INVOICE/);
  assert.match(html, /class="office-invoice"/);
  assert.match(html, /Bill To/);
  assert.match(html, /Item &amp; Description/);
  assert.match(html, /Quoted total/);
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
  const pdf = quotationPdfBuffer(
    { name: "Spice Shop", address: "Pune", phone: "9876543210", gstin: "27AAAAA0000A1Z5" },
    { quotation_number: "QT-00001", quotation_date: today, valid_until: "2026-11-11", customer_name: "Asha", lines: priced.lines, subtotal: priced.subtotal, discount: priced.discount, gst: priced.gst, taxable: priced.taxable, total: priced.total, terms: "Pay on acceptance" },
  );
  const pdfText = pdf.toString("latin1");
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.match(pdfText, /QUOTATION - NOT A TAX INVOICE/);
  assert.match(pdfText, /Helvetica-Bold/);
  assert.match(pdfText, /0\.102 0\.478 0\.427/);
  assert.match(pdfText, /Bill To|BILL TO/);
  assert.match(pdfText, /Item & Description/);
  assert.match(pdfText, /Quoted total/);
  assert.match(pdfText, /QT-00001/);
  assert.match(pdfText, /Masala/);
  assert.match(pdfText, /Amount in words/);
  const xrefAt = Number(pdfText.match(/startxref\n(\d+)/)[1]);
  assert.equal(pdfText.slice(xrefAt, xrefAt + 4), "xref");
  assert.match(pdfText, /\/Count 1/);
  const manyLines = Array.from({ length: 28 }, (_, index) => ({ name: `Spice ${index + 1}`, quantity: 1, unit: "PCS", rate: 10, total: 11.8, taxable: 10, gst: 1.8, gstRate: 18 }));
  const many = quotationPdfBuffer({ name: "Spice Shop" }, { quotation_number: "QT-00002", lines: manyLines, subtotal: 280, gst: 50.4, total: 330.4 });
  const manyText = many.toString("latin1");
  assert.match(manyText, /\/Count 2/);
  assert.match(manyText, /Page 2/);
  const sms = quotationPdfBuffer(
    { name: "ATAV TELECOM" },
    { quotation_number: "QT-00001", lines: [{ name: "BULK SMS", quantity: 700000, unit: "NOS", rate: 0.135, taxable: 94500, total: 94500, gstRate: 18 }], subtotal: 94500, total: 94500 },
  );
  const smsText = sms.toString("latin1");
  assert.match(smsText, /Rs 0\.135/);
  assert.doesNotMatch(smsText, /Rs 0\.14/);
  assert.match(smsText, /Rs 94,500\.00/);
  assert.equal(manyText.slice(Number(manyText.match(/startxref\n(\d+)/)[1]), Number(manyText.match(/startxref\n(\d+)/)[1]) + 4), "xref");
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
  assert.match(index, /js\/quotations\.js\?v=20261105mail1/);
  assert.match(index, /js\/quotations-ui\.js\?v=20261105edit1/);
  assert.match(index, /css\/quotations\.css\?v=20261105edit1/);
  assert.match(index, /app\.js\?v=20261107profit1/);
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
  assert.match(node.slice(emailAt, convertAt), /emailHtml/);
  assert.match(node.slice(emailAt, convertAt), /Quotation-\$\{quote\.quotation_number\}\.pdf|filename: `Quotation-/);
  assert.match(node, /\/api\/quotations\/public\/:id\/pdf/);
  assert.match(read("server/index.js"), /\/api\/quotations\/public/);
  assert.match(php, /function pos_quote_email_html/);
  assert.match(php, /View Quotation/);
  assert.match(php, /Download PDF/);
  assert.match(php, /role=\\"presentation\\"|role="presentation"/);
  assert.match(php, /GRAND TOTAL/);
  assert.match(php, /VALIDITY AND PAYMENT TERMS/);
  assert.match(php, /function pos_quote_public_send/);
  assert.match(core, /quotations\/public/);
  assert.match(read("quotation.html"), /quotation-page\.js/);
  assert.match(read("js/quotation-page.js"), /credentials: "omit"/);
  assert.match(node.slice(convertAt), /applySaleStock\(/);
  assert.match(node.slice(convertAt), /amountPaid: 0/);
  assert.match(node.slice(convertAt), /order_id IS NULL AND status = 'accepted'/);
  const phpConvert = php.indexOf("function pos_quote_convert");
  assert.equal(php.slice(0, phpConvert).includes("stock_gm"), false);
  assert.match(php.slice(phpConvert), /stock_gm/);
  assert.match(php.slice(phpConvert), /pos_settle_customer_invoice/);
  assert.match(php.slice(phpConvert), /order_id IS NULL AND status = 'accepted'/);
  assert.match(php, /function pos_quotations_dispatch/);
  assert.match(node, /COALESCE\(NULLIF\(TRIM\(s\.phone\), ''\), b\.mobile\) AS phone/);
  assert.match(php, /COALESCE\(NULLIF\(TRIM\(s\.phone\), ''\), b\.mobile\) AS phone/);
  assert.doesNotMatch(node, /b\.phone/);
  assert.doesNotMatch(php, /b\.phone/);
  assert.match(php, /QUOTATION - NOT A TAX INVOICE/);
  assert.match(php, /Helvetica-Bold/);
  assert.match(php, /Quoted total/);
  assert.match(php, /function pos_quote_rate_inr/);
  assert.match(php, /Item & Description/);
  assert.doesNotMatch(php, /pos_checkout_sale/);
  assert.match(read("js/quotations-ui.js"), /does not mark this quotation accepted|was not marked accepted/);
  assert.match(read("js/quotations-ui.js"), /data-quote-edit/);
  assert.match(read("js/quotations-ui.js"), /Edit quotation /);
  assert.match(node, /status IN \('draft','sent','accepted','rejected','expired'\)/);
  assert.match(php, /function pos_quote_can_edit/);
  assert.match(php, /status IN \('draft','sent','accepted','rejected','expired'\)/);
  assert.doesNotMatch(node.slice(editAt, emailAt), /applySaleStock\(/);
  assert.match(read("css/quotations.css"), /quotations-desk: quotations 2026/);
});
