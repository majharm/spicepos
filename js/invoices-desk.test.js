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
  assert.match(index, /id="invoices-pay-chips"/);
  assert.match(index, /data-view-jump="counter"/);
  assert.match(index, /id="orders-toolbar"/);
  assert.match(index, /id="orders-search"/);
  assert.match(index, /id="order-pane"/);
  assert.match(index, /pos\.css\?v=20260920scale5/);
  assert.match(index, /app\.js\?v=20260920scale5/);

  assert.match(app, /function paintInvoicesHero/);
  assert.match(app, /function invoicesEmptyHtml/);
  assert.match(app, /function paintInvoicePayChips/);
  assert.match(app, /invoices-table-wrap/);
  assert.match(app, /New bill/);
  assert.match(app, /paymentStatusLabel\(s\)/);

  assert.match(css, /invoices-desk: sales invoices 2026/);
  assert.match(css, /\.invoices-chip\.is-on/);
  assert.match(css, /\.invoices-empty-title/);
});
