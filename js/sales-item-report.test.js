import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

await import("./discount.js");
await import("./sales-item-report.js");
const R = globalThis.POSSalesItemReport;

const tea = {
  id: "l1",
  order_id: "o1",
  item_id: "tea",
  item_name: "Assam Tea",
  code: "TEA1",
  category: "Grocery",
  brand: "Hill",
  customer_name: "Cafe Nova",
  quantity_gm: 10,
  rate_per_kg: 50,
  discount: 20,
  amount: 480,
  gst_rate: 18,
  order_number: "S-1001",
  sale_date: "2026-11-01",
  branch_id: "br1",
  branch_name: "Main",
  status: "confirmed",
  order_subtotal: 480,
  order_discount: 0,
  order_loyalty: 0,
  order_gst: 86.4,
};

test("a priced line keeps sales quantity and adds GST to the net amount", () => {
  const report = R.buildReport([tea], [], {});
  const line = report.lines[0];
  assert.equal(line.sales_qty, 10);
  assert.equal(line.free_qty, 0);
  assert.equal(line.total_qty, 10);
  assert.equal(line.discount, 20);
  assert.equal(line.net, 480);
  assert.equal(line.gst, 86.4);
  assert.equal(line.total, 566.4);
  assert.equal(report.summary.items, 1);
  assert.equal(report.summary.salesQty, 10);
  assert.equal(report.summary.amount, 566.4);
  assert.equal(report.summary.gst, 86.4);
  assert.equal(report.summary.discount, 20);
});

test("a free line is free quantity and is not billed", () => {
  const report = R.buildReport([{
    ...tea,
    id: "free",
    quantity_gm: 2,
    discount: 100,
    amount: 0,
    order_subtotal: 0,
    order_gst: 0,
  }], [], {});
  const line = report.lines[0];
  assert.equal(line.sales_qty, 0);
  assert.equal(line.free_qty, 2);
  assert.equal(line.total_qty, 2);
  assert.equal(line.gst, 0);
  assert.equal(line.total, 0);
  assert.equal(report.summary.freeQty, 2);
  assert.equal(report.summary.amount, 0);
});

test("cancelled bills, cancelled lines, and duplicate lines are counted once", () => {
  const report = R.buildReport([
    tea,
    { ...tea },
    { ...tea, id: "gone", status: "cancelled", quantity_gm: 99, amount: 999 },
    { ...tea, id: "line-off", cancelled: 1, quantity_gm: 4, amount: 40 },
    { ...tea, id: "held", held: 1, quantity_gm: 3, amount: 30 },
  ], [], {});
  assert.equal(report.lines.length, 1);
  assert.equal(report.summary.amount, 566.4);
});

test("a sales return reduces quantity and the GST-inclusive amount once", () => {
  const report = R.buildReport([tea], [{
    id: "r1",
    item_id: "tea",
    item_name: "Assam Tea",
    item_code: "TEA1",
    quantity_gm: 3,
    amount: 118,
    gst_rate: 18,
    return_number: "SR-1",
    customer_name: "Cafe Nova",
    sale_date: "2026-11-02",
    status: "completed",
  }], {});
  assert.equal(report.summary.salesQty, 7);
  assert.equal(report.summary.amount, 448.4);
  assert.equal(report.summary.gst, 68.4);
  assert.equal(report.lines.filter((line) => line.kind === "return").length, 1);
  const again = R.buildReport([tea], [
    { id: "r1", item_id: "tea", quantity_gm: 3, amount: 118, gst_rate: 18, sale_date: "2026-11-02" },
    { id: "r1", item_id: "tea", quantity_gm: 3, amount: 118, gst_rate: 18, sale_date: "2026-11-02" },
  ], {});
  assert.equal(again.lines.filter((line) => line.kind === "return").length, 1);
});

test("a bill discount is spread onto priced lines and GST is calculated on the net", () => {
  const line = (id) => ({
    ...tea,
    id,
    quantity_gm: 1,
    rate_per_kg: 100,
    discount: 0,
    amount: 100,
    order_subtotal: 200,
    order_discount: 20,
    order_gst: 32.4,
  });
  const report = R.buildReport([line("a"), line("b")], [], {});
  assert.equal(report.lines.length, 2);
  assert.equal(report.lines[0].discount, 10);
  assert.equal(report.lines[0].net, 90);
  assert.equal(report.lines[0].gst, 16.2);
  assert.equal(report.lines[0].total, 106.2);
  assert.equal(report.summary.amount, 212.4);
  assert.equal(report.summary.gst, 32.4);
  assert.equal(report.summary.discount, 20);
});

test("filters, customer analysis, and the sales report section", () => {
  const other = { ...tea, id: "l2", order_id: "o2", item_id: "rice", item_name: "Rice", code: "R1", customer_name: "Other", order_number: "S-2", amount: 320, discount: 0, quantity_gm: 4, rate_per_kg: 80, order_subtotal: 320, order_gst: 0, gst_rate: 0 };
  const report = R.buildReport([tea, other], [], { product: "tea", customer: "cafe" });
  assert.equal(report.lines.length, 1);
  assert.equal(report.lines[0].customer, "Cafe Nova");
  assert.equal(R.byCustomer(report.lines)[0].customer, "Cafe Nova");
  const html = R.sectionHtml({
    ...report,
    branches: [{ id: "br1", name: "Main" }],
    links: {
      excel: "/api/reports/item-sales/excel?from=2026-11-01",
      pdf: "/api/reports/item-sales/pdf?from=2026-11-01",
      csv: "/api/reports/item-sales/csv?from=2026-11-01",
    },
  });
  assert.match(html, /Item-Wise Sales Report/);
  assert.match(html, /Total free quantity/);
  assert.match(html, /data-sir-product="Assam Tea"/);
  assert.match(html, /item-sales\/excel/);
  assert.match(html, /Customer-wise item sales/);
  assert.match(html, />Time</);
  assert.match(html, />Batch ID</);
  const timed = R.buildReport([{
    ...tea,
    id: "timed",
    sale_date: "2026-11-01 14:35:00",
    batch_id: "B-22",
    batch_no: "LOT-1",
  }], [], {});
  assert.equal(timed.lines[0].sale_time, "14:35");
  assert.equal(timed.lines[0].batch_id, "B-22");
  const legacy = R.buildReport([{ ...tea, id: "legacy", batch_no: "LOT-9" }], [], {});
  assert.equal(legacy.lines[0].batch_id, "LOT-9");
  const shown = R.sectionHtml({ ...timed, branches: [], links: report.links || {} });
  assert.match(shown, /B-22/);
  assert.match(shown, /14:35/);
  const csv = R.csvFromReport(timed);
  assert.match(csv, /Time,Batch ID/);
  assert.match(csv, /B-22/);
  const till = fs.readFileSync(new URL("../pos-php-till.php", import.meta.url), "utf8");
  const php = fs.readFileSync(new URL("../pos-sales-item-report.php", import.meta.url), "utf8");
  const hub = fs.readFileSync(new URL("./biz-hub.js", import.meta.url), "utf8");
  assert.match(hub, /id: "item-wise-sales"/);
  assert.match(till, /reports\/item-sales/);
  assert.match(till, /pos_sales_item_report_shop/);
  assert.match(php, /function pos_sales_item_report_shop/);
  assert.match(php, /AS sale_time/);
  assert.match(php, /l\.batch_id/);
  assert.match(php, /sales_return_lines/);
  assert.ok(till.indexOf("reports/item-sales") < till.indexOf('($path === "reports" || $path === "reports/excel")'));
});
