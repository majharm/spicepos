import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import "./footwear.js";
import "./print.js";

const P = globalThis.POSPrint;
const F = globalThis.POSFootwear;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("10×5 ft flex at ₹18/sqft with eyelets and delivery estimates ₹1,050 before GST", () => {
  const q = P.quoteTotals({
    width: 10,
    height: 5,
    unit: "ft",
    quantity: 1,
    rate: 18,
    gst_rate: 0,
    finishing: [{ name: "Eyelets", rate: 100, unit: "job" }],
    delivery: 50,
  });
  assert.equal(q.area, 50);
  assert.equal(q.printing, 900);
  assert.equal(q.finishing, 100);
  assert.equal(q.delivery, 50);
  assert.equal(q.total, 1050);
});

test("Size conversion and area engine match the print formula", () => {
  assert.equal(P.areaSqFt(10, 5, "ft"), 50);
  assert.equal(P.areaSqFt(120, 60, "in"), 50);
  assert.equal(P.areaSqFt(304.8, 152.4, "cm"), 50);
  const conv = P.convertSize(10, 5, "ft");
  assert.equal(conv.inches.width, 120);
  assert.equal(conv.inches.height, 60);
  assert.equal(conv.sqft, 50);
  const pxArea = P.areaSqFt(3000, 1500, "px", 150);
  assert.ok(pxArea > 1);
});

test("Qty 2 of 50 sq ft bills 100 sq ft of printing", () => {
  const q = P.quoteTotals({ width: 10, height: 5, unit: "ft", quantity: 2, rate: 18, gst_rate: 0 });
  assert.equal(q.totalArea, 100);
  assert.equal(q.printing, 1800);
});

test("Low-resolution warning does not block unless configured", () => {
  const warn = P.qualityWarning({ width_px: 300, height_px: 150 }, { width: 10, height: 5, unit: "ft" }, { warn_dpi: 150, min_dpi: 72, block_low_res: false });
  assert.equal(warn.warn, true);
  assert.equal(warn.block, false);
  const block = P.qualityWarning({ width_px: 300, height_px: 150 }, { width: 10, height: 5, unit: "ft" }, { warn_dpi: 150, min_dpi: 200, block_low_res: true });
  assert.equal(block.block, true);
});

test("Flex & Printing is its own shop kind with portal wiring", () => {
  assert.equal(P.isPrintShop({ business_type: "Printing Business", category: "Flex & Printing" }), true);
  assert.equal(F.shopKind({ business_type: "Printing Business", category: "Flex & Printing" }), "printing");
  assert.equal(F.shopKind({ category: "Flex & Printing" }), "printing");
  assert.equal(F.isPrintShop({ category: "Flex & Printing" }), true);
  assert.equal(F.itemPrefix({ category: "Flex & Printing" }), "FP");
  assert.equal(F.defaultCategory({ category: "Flex & Printing" }), "Flex & Printing");
  const index = read("index.html");
  const app = read("js/app.js");
  const node = read("server/index.js");
  const core = read("pos-php-core.php");
  const login = read("login.html");
  assert.match(login, /Printing Business/);
  assert.match(login, /Flex &amp; Printing/);
  assert.match(index, /id="view-print-board"/);
  assert.match(index, /id="view-print-orders"/);
  assert.match(index, /print\.html/);
  assert.match(index, /js\/print\.js/);
  assert.match(app, /function isPrintShop/);
  assert.match(app, /printing-only/);
  assert.match(node, /registerPrintPublic/);
  assert.match(node, /url\.startsWith\("\/api\/print\/public"\)/);
  assert.match(core, /pos_print_public_dispatch/);
  assert.match(read("print.html"), /New Print Order/);
  assert.match(read("print.html"), /Submit Print Order/);
  assert.match(read("print.html"), /pp-locked/);
  assert.match(read("print.html"), /login-atav-smart-pos\.jpg/);
  assert.match(read("print.html"), /data-auth-tab="signin"/);
  assert.match(read("print.html"), /pp-scene-shots/);
  assert.match(read("css/print.css"), /\.pp-shell/);
  assert.match(read("css/print.css"), /\.pp-scene-shots/);
  assert.match(read("js/print-portal.js"), /showAuthPanel/);
  assert.match(read("js/print-portal.js"), /classList\.remove\("pp-locked"\)/);
  assert.doesNotMatch(read("js/print-portal.js"), /Print portal unavailable/);
  assert.match(read("js/login.js"), /Printing Business/);
  assert.match(read("js/biz-hub.js"), /print-board/);
  assert.match(read("js/master.js"), /Flex & Printing/);
  assert.doesNotMatch(read("master.html"), /data-tab="printcat"/);
  assert.doesNotMatch(read("js/master.js"), /Platform defaults for materials/);
  assert.ok(P.PRODUCTS.includes("Flex") && P.PRODUCTS.includes("Hoarding"));
  assert.equal(P.nextOrderNumber(125, 2026), "FP-2026-00125");
});

test("Shop admin can change the Flex & Printing customer portal login image", () => {
  assert.equal(P.DEFAULT_SETTINGS.portal_login_image, "");
  const ui = read("js/print-ui.js");
  const portal = read("js/print-portal.js");
  const php = read("pos-print.php");
  const node = read("server/print.js");
  assert.match(ui, /print-portal-art/);
  assert.match(ui, /Customer portal login image/);
  assert.match(ui, /print-portal-hero-file/);
  assert.match(ui, /portal_login_image: fd\.get\("portal_login_image"\)/);
  assert.match(portal, /pp-portal-hero/);
  assert.match(portal, /catalog\.settings\?\.portal_login_image/);
  assert.match(read("print.html"), /id="pp-portal-hero"/);
  assert.match(read("index.html"), /customer portal login image/);
  assert.match(read("js/app.js"), /portal image/);
  assert.match(node, /function clipPortalImage/);
  assert.match(node, /settings_json MEDIUMTEXT/);
  assert.match(php, /function pos_print_portal_image/);
  assert.match(php, /function pos_print_save_settings/);
  assert.match(php, /function pos_print_catalog_payload/);
  assert.match(php, /\$path === "print\/catalog" && \$method === "POST"/);
  assert.match(php, /ALTER TABLE print_settings MODIFY settings_json MEDIUMTEXT/);
});

test("PHP Hostinger print portal can register and sign in customers", () => {
  const php = read("pos-print.php");
  assert.match(php, /function pos_print_issue_session/);
  assert.match(php, /function pos_print_create_customer/);
  assert.match(php, /\$rest === "register"/);
  assert.match(php, /\$rest === "login"/);
  assert.match(php, /\$rest === "otp\/send"/);
  assert.match(php, /\$rest === "me"/);
  assert.match(php, /\$rest === "orders"/);
  assert.match(read("js/print-portal.js"), /api\("\/register"/);
  assert.match(read("api/.htaccess"), /HTTP_AUTHORIZATION/);
});

test("PHP Hostinger can open a print order, download files, quote, bill, and move production", () => {
  const php = read("pos-print.php");
  const ui = read("js/print-ui.js");
  assert.match(php, /print\/orders\/\(\[\^\/\]\+\)\$/);
  assert.match(php, /print\/files\/\(\[\^\/\]\+\)/);
  assert.match(php, /print\/orders\/\(\[\^\/\]\+\)\/review/);
  assert.match(php, /print\/orders\/\(\[\^\/\]\+\)\/quote/);
  assert.match(php, /print\/orders\/\(\[\^\/\]\+\)\/bill/);
  assert.match(php, /print\/orders\/\(\[\^\/\]\+\)\/status/);
  assert.match(php, /function pos_print_apply_totals/);
  assert.match(php, /pos_send_file/);
  assert.match(ui, /View \/ Download/);
  assert.match(ui, /\/api\/print\/files\//);
  assert.match(read("index.html"), /print-ui\.js\?v=20260922deploy218/);
  assert.match(read("index.html"), /app\.js\?v=20260924ah1/);
});

test("Print orders page opens the shop modal and paints list or wrapped API rows", () => {
  const app = read("js/app.js");
  const ui = read("js/print-ui.js");
  const php = read("pos-print.php");
  assert.match(app, /function showModal\(title, html\)/);
  assert.match(app, /globalThis\.showModal = showModal/);
  assert.match(ui, /function revealOrder/);
  assert.match(ui, /root\.showModal/);
  assert.match(ui, /rows\?\.orders/);
  assert.match(ui, /Could not load print orders/);
  assert.match(ui, /print-order-toolbar[\s\S]*preventDefault/);
  assert.match(ui, /d\.order \|\| d/);
  assert.match(php, /pos_send\(200, array_values\(\$rows\)\)/);
});

test("Print order review modal is a stepped desk with quote grid and production chips", () => {
  const ui = read("js/print-ui.js");
  const css = read("css/pos.css");
  const index = read("index.html");
  assert.match(ui, /print-order-desk/);
  assert.match(ui, /pod-quote/);
  assert.match(ui, /pod-flow/);
  assert.match(ui, /pod-step/);
  assert.match(ui, /Approve file/);
  assert.match(css, /#modal:has\(\.print-order-desk\)/);
  assert.match(css, /\.pod-step\.is-on/);
  assert.match(index, /pos\.css\?v=20260924ah1/);
});

test("PHP print quote, artwork MIME, approve, bill settle, and OTP mail are wired", () => {
  const php = read("pos-print.php");
  const ui = read("js/print-ui.js");
  const node = read("server/print.js");
  const engine = read("js/print.js");
  assert.match(php, /\$body\["delivery_amount"\] \?\? \$body\["delivery"\]/);
  assert.match(php, /ssssissisiiss/);
  assert.match(php, /ssssdi/);
  assert.match(php, /pos_send_mail\(\$email, "Print portal OTP"/);
  assert.match(php, /pos_settle_customer_invoice/);
  assert.match(php, /ORDER BY version DESC LIMIT 1/);
  assert.match(php, /Print route not found/);
  assert.match(ui, /data-file-id/);
  assert.match(node, /settleCustomerInvoice/);
  assert.match(engine, /delivery_amount/);
});

test("Print Create Bill stores a Flex line and backfills empty FP invoices", () => {
  const php = read("pos-print.php");
  const node = read("server/print.js");
  const till = read("pos-php-till.php");
  const core = read("pos-php-core.php");
  const indexJs = read("server/index.js");
  assert.match(php, /function pos_print_insert_sale_line/);
  assert.match(php, /function pos_print_attach_sale_lines/);
  assert.match(php, /pos_print_insert_sale_line\(\$invoiceId, \$order, \$q, \$bid\)/);
  assert.match(php, /UPDATE sales_order_lines SET `unit`/);
  assert.match(node, /insertPrintSaleLine/);
  assert.match(node, /attachPrintInvoiceLines/);
  assert.match(till, /pos_print_attach_sale_lines/);
  assert.match(core, /pos_print_attach_sale_lines/);
  assert.match(indexJs, /attachPrintInvoiceLines/);
  assert.equal(F.isPrintShop({ name: "OM Printing Press" }), true);
});
