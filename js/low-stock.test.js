import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(name) {
  return readFileSync(path.join(root, name), "utf8");
}

function lowStockThreshold(company) {
  const raw = company?.low_stock_threshold;
  if (raw == null || raw === "") return 5;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(9999, Math.round(n)));
}

function classify(stock, threshold = 5) {
  const qty = Number(stock) || 0;
  if (qty <= 0) return "out";
  if (qty <= threshold) return "low";
  return "ok";
}

test("Low stock threshold defaults to 5 pcs and clamps to 1–9999", () => {
  assert.equal(lowStockThreshold({}), 5);
  assert.equal(lowStockThreshold({ low_stock_threshold: null }), 5);
  assert.equal(lowStockThreshold({ low_stock_threshold: 3 }), 3);
  assert.equal(lowStockThreshold({ low_stock_threshold: "8" }), 8);
  assert.equal(lowStockThreshold({ low_stock_threshold: 0 }), 1);
  assert.equal(lowStockThreshold({ low_stock_threshold: 20000 }), 9999);
});

test("Garment stock 0 is out of stock; 1–threshold is low; above is ok", () => {
  assert.equal(classify(0), "out");
  assert.equal(classify(1), "low");
  assert.equal(classify(3), "low");
  assert.equal(classify(5), "low");
  assert.equal(classify(6), "ok");
  assert.equal(classify(2, 1), "ok");
});

test("Counter Low Stock popup, bell, settings, and oversell hints are wired", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const css = read("css/pos.css");
  const schema = read("server/schema.js");
  const server = read("server/index.js");
  const core = read("pos-php-core.php");
  const till = read("pos-php-till.php");

  assert.match(index, /id="set-low-stock-block"/);
  assert.match(index, /id="set-low-stock-threshold"/);
  assert.match(index, /id="low-stock-modal"/);
  assert.match(index, /id="counter-low-stock-btn"/);
  assert.match(index, /id="low-stock-view"/);
  assert.match(index, /id="low-stock-close"/);
  assert.match(index, /Low Stock Alert/);

  assert.match(app, /function lowStockThreshold/);
  assert.match(app, /function garmentStockAlertRows/);
  assert.match(app, /function openLowStockModal/);
  assert.match(app, /function maybeShowCounterLowStockAlert/);
  assert.match(app, /function refreshCatalogStock/);
  assert.match(app, /function lowStockScanHint/);
  assert.match(app, /Only \$\{have\} \$\{unit\} remaining/);
  assert.match(app, /Only \$\{have\} \$\{unit\} available\. Maximum quantity is \$\{have\}\./);
  assert.match(app, /await refreshCatalogStock\(\)/);
  assert.match(app, /maybeShowCounterLowStockAlert\(\)/);
  assert.match(app, /payload\.low_stock_threshold/);
  assert.match(app, /if \(isApparelShop\(\)\) \{\s*low = stock <= lowStockThreshold\(\);/);

  assert.match(css, /#counter-low-stock-btn/);
  assert.match(css, /\.low-stock-modal/);
  assert.match(css, /\.low-stock-table/);

  assert.match(schema, /low_stock_threshold/);
  assert.match(server, /low_stock_threshold/);
  assert.match(core, /low_stock_threshold/);
  assert.match(till, /low_stock_threshold/);
});
