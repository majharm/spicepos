import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("Invoices page is a sales desk with search, chips, and preview split", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const css = read("css/pos.css");

  assert.match(index, /id="view-orders"/);
  assert.match(index, /invoices-desk/);
  assert.match(index, /id="invoices-hero-stats"/);
  assert.match(index, /class="inv-stat-row"/);
  assert.match(index, /id="invoices-pay-chips"/);
  assert.match(index, /data-view-jump="counter"/);
  assert.match(index, /id="orders-toolbar"/);
  assert.match(index, /id="orders-search"/);
  assert.match(index, /id="order-pane"/);
  assert.match(index, /pos\.css\?v=20261027invui6/);
  assert.match(index, /app\.js\?v=20261027invui6/);

  assert.match(app, /function paintInvoicesHero/);
  assert.match(app, /function invoicesEmptyHtml/);
  assert.match(app, /function paintInvoicePayChips/);
  assert.match(app, /class="inv-stat/);
  assert.match(app, /invoices-table-wrap/);
  assert.match(app, /class="order-row inv-card/);
  assert.match(app, /New bill/);
  assert.match(app, /paymentStatusLabel\(s\)/);
  assert.match(app, /function revealInvoiceDetail/);
  assert.match(app, /class="invoice-desk-tools"/);
  assert.match(app, /invoice-desk-tools[\s\S]*invoicePreviewHtml/);

  assert.match(css, /invoices-desk: sales invoices 2026/);
  assert.match(css, /\.invoices-chip\.is-on/);
  assert.match(css, /\.invoices-empty-title/);
  assert.match(css, /\.inv-stat-row/);
  assert.match(css, /button\.inv-card/);
  assert.match(css, /\.office-invoice \{ min-width: 680px/);
  assert.match(css, /\.invoices-desk \{[^}]*font-size: 13px/s);
  assert.match(css, /\.invoices-desk \.invoice-total \{ font-size: 14px/);
  assert.match(css, /\.invoices-desk \.office-preview \{[^}]*font-size: 10px/s);
  assert.match(css, /\.inv-stat::before/);
  assert.match(css, /button\.inv-card\.is-selected::before/);
  assert.match(css, /\.invoices-desk \.invoice-desk-tools/);
});

test("invoice totals keep digits past four decimal places", () => {
  const app = read("js/app.js");
  const start = app.indexOf("const inr = ");
  const end = app.indexOf("function ledgerBalanceText");
  const money = new Function(`${app.slice(start, end)}\nreturn money;`)();
  const precise = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
  assert.equal(money(12980.000472), precise.format(12980.000472));
  assert.match(money(12980.000472), /12,980\.000472/);
  assert.equal(money(49560), precise.format(49560));
  assert.match(money(12.125), /12\.125/);
});
