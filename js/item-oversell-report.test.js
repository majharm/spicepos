import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

await import("./item-oversell-report.js");
const R = globalThis.POSItemOversellReport;

const tea = {
  id: "tea",
  name: "Assam Tea",
  code: "TEA1",
  category: "Grocery",
  brand: "Hill",
  stock_gm: -3,
};

function sale(extra) {
  return {
    id: "s1",
    item_id: "tea",
    item_name: "Assam Tea",
    code: "TEA1",
    category: "Grocery",
    brand: "Hill",
    customer_name: "Cafe Nova",
    quantity_gm: 12,
    rate_per_kg: 50,
    amount: 600,
    gst_rate: 0,
    order_number: "S-1",
    sale_date: "2026-11-02",
    branch_id: "br1",
    branch_name: "Main",
    status: "confirmed",
    ...extra,
  };
}

test("a sale past the stock on hand records only the short quantity", () => {
  const report = R.buildReport({
    items: [tea],
    purchases: [{ id: "p1", item_id: "tea", quantity_gm: 10, free_qty: 0, sale_date: "2026-11-01", status: "posted" }],
    sales: [sale()],
  }, { from: "2026-11-01", to: "2026-11-16" });
  assert.equal(report.lines.length, 1);
  assert.equal(report.lines[0].sold_qty, 12);
  assert.equal(report.lines[0].stock_before, 9);
  assert.equal(report.lines[0].oversold_qty, 3);
  assert.equal(report.lines[0].amount, 150);
  assert.equal(report.lines[0].stock_now, -3);
  assert.equal(report.summary.items, 1);
  assert.equal(report.summary.oversoldQty, 3);
  assert.equal(report.summary.amount, 150);
  assert.equal(report.summary.bills, 1);
});

test("a later purchase does not erase the oversold sale", () => {
  const report = R.buildReport({
    items: [{ ...tea, stock_gm: 5 }],
    purchases: [{ id: "p2", item_id: "tea", quantity_gm: 10, sale_date: "2026-11-02", status: "posted" }],
    sales: [sale({ quantity_gm: 8, amount: 400, sale_date: "2026-11-01" })],
  }, { from: "2026-11-01", to: "2026-11-16" });
  assert.equal(report.lines.length, 1);
  assert.equal(report.lines[0].oversold_qty, 5);
  assert.equal(report.lines[0].stock_before, 3);
});

test("cancelled bills, held bills, and duplicate lines are left out", () => {
  const report = R.buildReport({
    items: [tea],
    purchases: [{ id: "p1", item_id: "tea", quantity_gm: 10, sale_date: "2026-11-01", status: "posted" }],
    sales: [
      sale(),
      sale(),
      sale({ id: "gone", status: "cancelled", quantity_gm: 40, amount: 2000, order_number: "S-X" }),
      sale({ id: "held", held: 1, quantity_gm: 30, amount: 1500, order_number: "S-H" }),
      sale({ id: "off", cancelled: 1, quantity_gm: 20, amount: 1000, order_number: "S-C" }),
    ],
  }, { from: "2026-11-01", to: "2026-11-16" });
  assert.equal(report.lines.length, 1);
  assert.equal(report.summary.oversoldQty, 3);
});

test("a return puts stock back before the next sale", () => {
  const report = R.buildReport({
    items: [{ ...tea, stock_gm: 1 }],
    sales: [
      sale({ id: "a", quantity_gm: 5, amount: 250, sale_date: "2026-11-01", order_number: "S-A" }),
      sale({ id: "b", quantity_gm: 2, amount: 100, sale_date: "2026-11-03", order_number: "S-B" }),
    ],
    returns: [{ id: "r1", item_id: "tea", quantity_gm: 4, sale_date: "2026-11-02", status: "completed", stock_disposition: "sellable" }],
  }, { from: "2026-11-01", to: "2026-11-16" });
  assert.equal(report.lines.length, 1);
  assert.equal(report.lines[0].invoice, "S-A");
  assert.equal(report.lines[0].oversold_qty, 1);
});

test("GST is charged only on the oversold share and negatives stay visible", () => {
  const report = R.buildReport({
    items: [tea, { id: "soap", name: "Soap", code: "S", category: "Grocery", stock_gm: -2 }],
    purchases: [{ id: "p1", item_id: "tea", quantity_gm: 10, sale_date: "2026-11-01", status: "posted" }],
    sales: [sale({ amount: 600, gst_rate: 18 })],
  }, { from: "2026-11-01", to: "2026-11-16" });
  assert.equal(report.lines[0].net, 150);
  assert.equal(report.lines[0].gst, 27);
  assert.equal(report.lines[0].amount, 177);
  assert.equal(report.summary.negative, 2);
  assert.equal(report.negatives[0].product_name, "Assam Tea");
  const outside = R.buildReport({
    items: [tea],
    purchases: [{ id: "p1", item_id: "tea", quantity_gm: 10, sale_date: "2026-11-01", status: "posted" }],
    sales: [sale({ sale_date: "2026-10-01" })],
  }, { from: "2026-11-01", to: "2026-11-16" });
  assert.equal(outside.lines.length, 0);
  assert.equal(outside.summary.negative, 1);
});

test("filters and the overselling section", () => {
  const report = R.buildReport({
    items: [tea],
    purchases: [{ id: "p1", item_id: "tea", quantity_gm: 10, sale_date: "2026-11-01", status: "posted" }],
    sales: [sale(), sale({ id: "rice", item_id: "rice", item_name: "Rice", code: "R1", customer_name: "Other", quantity_gm: 4, amount: 80, order_number: "S-2" })],
  }, { from: "2026-11-01", to: "2026-11-16", product: "tea", customer: "cafe" });
  assert.equal(report.lines.length, 1);
  const html = R.sectionHtml({
    ...report,
    branches: [{ id: "br1", name: "Main" }],
    links: {
      excel: "/api/reports/item-oversells/excel?from=2026-11-01",
      pdf: "/api/reports/item-oversells/pdf?from=2026-11-01",
      csv: "/api/reports/item-oversells/csv?from=2026-11-01",
    },
  });
  assert.match(html, /Item-Wise Overselling Report/);
  assert.match(html, /Oversold quantity/);
  assert.match(html, /data-ior-product="Assam Tea"/);
  assert.match(html, /item-oversells\/excel/);
  assert.match(html, /Items still below zero/);
  const till = fs.readFileSync(new URL("../pos-php-till.php", import.meta.url), "utf8");
  const php = fs.readFileSync(new URL("../pos-item-oversell.php", import.meta.url), "utf8");
  const hub = fs.readFileSync(new URL("./biz-hub.js", import.meta.url), "utf8");
  assert.match(hub, /id: "item-wise-oversell"/);
  assert.match(till, /reports\/item-oversells/);
  assert.match(till, /pos_item_oversell_shop/);
  assert.match(php, /function pos_item_oversell_shop/);
  assert.ok(till.indexOf("reports/item-oversells") < till.indexOf('($path === "reports" || $path === "reports/excel")'));
});
