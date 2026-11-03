import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./units.js";
import "./stock-desk.js";

const U = globalThis.POSUnits;
const S = globalThis.POSStockDesk;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const today = "2026-11-03";

function read(name) {
  return readFileSync(path.join(root, name), "utf8");
}

function lineAmount(qty, rate, unit) {
  return U.lineAmount(qty, rate, unit);
}

const spice = {
  id: "item-1",
  name: "Turmeric",
  code: "TUR-1",
  barcode: "8901",
  category: "Spices",
  base_unit: "GM",
  unit: "KG",
  stock_gm: 2000,
  reorder_level_gm: 500,
  purchase_rate: 100,
  retail_rate: 180,
  default_expiry: "2027-06-01",
  batches: [
    { id: "b-old", item_id: "item-1", batch_no: "A1", remaining_gm: 500, unit_cost: 90, expiry_date: "2026-10-01" },
    { id: "b-soon", item_id: "item-1", batch_no: "A2", remaining_gm: 1500, unit_cost: 110, expiry_date: "2026-11-20" },
  ],
};

const safeItem = {
  id: "item-2",
  name: "Salt",
  code: "SLT",
  barcode: "",
  category: "Spices",
  base_unit: "PCS",
  stock_gm: 8,
  reorder_level_gm: 2,
  purchase_rate: 20,
  retail_rate: 30,
};

const plain = {
  id: "item-3",
  name: "Box",
  code: "BOX",
  category: "Packing",
  base_unit: "PCS",
  stock_gm: 1,
  reorder_level_gm: 4,
  purchase_rate: 15,
  retail_rate: 25,
  default_expiry: "2026-12-20",
};

test("expiry tones use 30 and 60 day windows", () => {
  assert.equal(S.stockExpiryTone(-1), "expired");
  assert.equal(S.stockExpiryTone(0), "soon");
  assert.equal(S.stockExpiryTone(30), "soon");
  assert.equal(S.stockExpiryTone(31), "watch");
  assert.equal(S.stockExpiryTone(60), "watch");
  assert.equal(S.stockExpiryTone(61), "ok");
  assert.equal(S.stockExpiryTone(null), "none");
  assert.equal(S.stockExpiryBucket("soon"), "soon");
  assert.equal(S.stockExpiryBucket("watch"), "soon");
  assert.equal(S.stockExpiryBucket("ok"), "safe");
  assert.equal(S.stockExpiryBucket("none"), "safe");
  assert.equal(S.daysUntilExpiry("2026-12-03", today), 30);
  assert.equal(S.expiryLabel(null, "none"), "N/A");
});

test("batch lines do not duplicate the product row or the stock valuation", () => {
  const lines = S.buildStockLines([spice, safeItem], { today, lineAmount });
  assert.equal(lines.filter((line) => line.itemId === "item-1").length, 2);
  assert.equal(lines.filter((line) => line.itemId === "item-2").length, 1);
  assert.equal(lines.find((line) => line.batchNo === "A1").expiryBucket, "expired");
  assert.equal(lines.find((line) => line.batchNo === "A2").expiryTone, "soon");
  assert.equal(lines.find((line) => line.itemId === "item-2").expiryYmd, "");
  assert.equal(lines.find((line) => line.itemId === "item-2").expiryBucket, "safe");
  const summary = S.summarizeStock([spice, safeItem], lines, {
    today,
    lineAmount,
    displayQty: (qty, unit) => U.displayQty(qty, unit),
    qtySuffix: (unit) => U.qtySuffix(unit),
  });
  assert.equal(summary.products, 2);
  assert.equal(summary.expired, 1);
  assert.equal(summary.expiringSoon, 0);
  assert.equal(summary.valuation, U.lineAmount(2000, 100, "GM") + U.lineAmount(8, 20, "PCS"));
  assert.equal(summary.valuation, 360);
  assert.notEqual(summary.valuation, U.lineAmount(500, 90, "GM") + U.lineAmount(1500, 110, "GM") + 160);
  assert.equal(summary.quantity, 2000 + 8);
  assert.equal(summary.quantityMixed, true);
  assert.equal(summary.low, 0);
});

test("a product with no on-hand batches keeps one row and its own expiry", () => {
  const lines = S.buildStockLines([plain], { today, lineAmount });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].batchId, "");
  assert.equal(lines[0].expiryTone, "watch");
  assert.equal(lines[0].expiryBucket, "soon");
  assert.equal(lines[0].status, "low");
  assert.equal(lines[0].availableGm, 1);
  const summary = S.summarizeStock([plain], lines, { today, lineAmount, displayQty: (qty, unit) => U.displayQty(qty, unit) });
  assert.equal(summary.expired, 0);
  assert.equal(summary.expiringSoon, 1);
  assert.equal(summary.low, 1);
  assert.equal(summary.valuation, 15);
});

test("external batch list replaces nested batches and ignores zero remaining", () => {
  const lines = S.buildStockLines([spice], {
    today,
    lineAmount,
    batches: [
      { id: "b-zero", item_id: "item-1", batch_no: "Z", remaining_gm: 0, expiry_date: "2026-01-01" },
      { id: "b-safe", item_id: "item-1", batch_no: "S", remaining_gm: 200, expiry_date: "2027-05-01" },
      { id: "b-safe", item_id: "item-1", batch_no: "S", remaining_gm: 200, expiry_date: "2027-05-01" },
    ],
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].batchNo, "S");
  assert.equal(lines[0].expiryBucket, "safe");
});

test("filters, sort, columns and pagination stay on the prepared lines", () => {
  const view = S.prepareStockView([spice, safeItem, plain], {
    today,
    lineAmount,
    displayQty: (qty, unit) => U.displayQty(qty, unit),
    filters: { expiry: "soon", q: "tur" },
    sort: "expiry",
    dir: "asc",
    page: 1,
    pageSize: 25,
  });
  assert.equal(view.page.total, 1);
  assert.equal(view.page.rows[0].batchNo, "A2");
  assert.equal(view.summary.products, 3);
  const dated = S.sortStockLines(S.buildStockLines([safeItem, plain], { today, lineAmount }), "expiry", "desc");
  assert.equal(dated[0].itemId, "item-3");
  assert.equal(dated[1].itemId, "item-2");
  assert.deepEqual(S.visibleColumnIds(["sku", "bogus"]), ["name", "sku", "action"]);
  assert.equal(S.visibleColumnIds(null).length, S.STOCK_COLUMNS.length);
  const page = S.paginateStockLines(Array.from({ length: 60 }, (_, i) => i), 3, 25);
  assert.equal(page.page, 3);
  assert.equal(page.pages, 3);
  assert.equal(page.from, 51);
  assert.equal(page.to, 60);
});

test("stock API attaches on-hand batches for this business and does not insert stock", () => {
  const tenant = read("server/tenant.js");
  const handler = tenant.slice(tenant.indexOf('app.get("/api/stock"'), tenant.indexOf('app.get("/api/stock/excel"'));
  assert.match(handler, /FROM stock_batches b/);
  assert.match(handler, /b\.business_id = \?/);
  assert.match(handler, /b\.remaining_gm > 0/);
  assert.doesNotMatch(handler, /INSERT INTO stock_batches/i);
  assert.match(handler, /batches: byItem\.get\(row\.id\) \|\| \[\]/);
  const html = read("index.html");
  const app = read("js/app.js");
  const css = read("css/pos.css");
  assert.match(html, /id="stock-refresh"/);
  assert.match(html, /id="stock-layout"/);
  assert.match(html, /id="stock-expiry-filters"/);
  assert.match(html, /id="stock-columns"/);
  assert.match(html, /js\/stock-desk\.js/);
  assert.match(app, /function paintStockList/);
  assert.match(app, /function pharmacyStockCards/);
  assert.match(app, /\/api\/batches\?on_hand=1/);
  assert.match(app, /<th>Expiry Date<\/th>/);
  assert.match(app, /stock-batch-table/);
  assert.match(app, /loadStock\(\{ refresh: true \}\)/);
  assert.match(html, /Refresh stock/);
  assert.match(css, /stock-desk: on-hand \+ adjustments/);
  assert.match(css, /\.stock-card\[hidden\]/);
  assert.match(css, /\.stock-exp\.is-expired/);
  assert.match(css, /\.stock-exp\.is-soon/);
  assert.match(css, /\.stock-exp\.is-watch/);
  assert.match(css, /\.stock-exp\.is-ok/);
});
