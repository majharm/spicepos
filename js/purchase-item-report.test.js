import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

await import("./purchase-item-report.js");
const R = globalThis.POSPurchaseItemReport;

const tea = {
  id: "l1",
  item_id: "tea",
  item_name: "Assam Tea",
  code: "TEA1",
  category: "Grocery",
  brand: "Hill",
  supplier_name: "Acme Traders",
  quantity_gm: 10,
  free_qty: 2,
  rate_per_kg: 50,
  discount: 20,
  amount: 480,
  gst_amount: 86.4,
  total_amount: 566.4,
  purchase_date: "2026-11-01",
  purchase_number: "PO-1001",
  supplier_invoice_number: "INV-9",
  branch_id: "br1",
  branch_name: "Main",
  status: "posted",
};

test("total quantity adds free quantity and final amount keeps the stored net plus GST", () => {
  const report = R.buildReport([tea], [], {});
  const line = report.lines[0];
  assert.equal(line.purchase_qty, 10);
  assert.equal(line.free_qty, 2);
  assert.equal(line.total_qty, 12);
  assert.equal(line.discount, 20);
  assert.equal(line.net, 480);
  assert.equal(line.gst, 86.4);
  assert.equal(line.total, 566.4);
  assert.equal(report.summary.items, 1);
  assert.equal(report.summary.purchaseQty, 10);
  assert.equal(report.summary.freeQty, 2);
  assert.equal(report.summary.amount, 566.4);
  assert.equal(report.summary.gst, 86.4);
  assert.equal(report.summary.discount, 20);
});

test("cancelled bills and duplicate lines are counted once", () => {
  const report = R.buildReport([
    tea,
    { ...tea },
    { ...tea, id: "l2", status: "cancelled", quantity_gm: 99, total_amount: 999 },
    { ...tea, id: "l3", status: "void", quantity_gm: 4, total_amount: 40 },
  ], [], {});
  assert.equal(report.lines.length, 1);
  assert.equal(report.summary.amount, 566.4);
  assert.equal(report.summary.purchaseQty, 10);
});

test("a purchase return reduces quantity once and is skipped when the bill is already negative", () => {
  const withReturn = R.buildReport([tea], [{
    item_id: "tea",
    item_name: "Assam Tea",
    code: "TEA1",
    qty: 3,
    value: 150,
    purchase_date: "2026-11-02",
  }], {});
  assert.equal(withReturn.summary.purchaseQty, 7);
  assert.equal(withReturn.summary.amount, 416.4);
  assert.equal(withReturn.lines.filter((line) => line.kind === "return").length, 1);

  const negative = R.buildReport([
    tea,
    { ...tea, id: "ret", quantity_gm: -3, amount: -150, gst_amount: 0, total_amount: -150, discount: 0, free_qty: 0 },
  ], [{ item_id: "tea", qty: 3, value: 150, purchase_date: "2026-11-02" }], {});
  assert.equal(negative.lines.filter((line) => line.kind === "return").length, 0);
  assert.equal(negative.summary.purchaseQty, 7);
});

test("filters and rate comparison use the posted purchase lines", () => {
  const other = { ...tea, id: "l2", item_id: "rice", item_name: "Rice", code: "R1", supplier_name: "Other", rate_per_kg: 80, quantity_gm: 4, free_qty: 0, discount: 0, amount: 320, gst_amount: 0, total_amount: 320, purchase_number: "PO-2", supplier_invoice_number: "INV-2" };
  const second = { ...tea, id: "l3", rate_per_kg: 70, quantity_gm: 10, free_qty: 0, discount: 0, amount: 700, gst_amount: 0, total_amount: 700, purchase_number: "PO-3", purchase_date: "2026-11-04" };
  const report = R.buildReport([tea, other, second], [], { product: "tea", supplier: "acme" });
  assert.deepEqual(report.lines.map((line) => line.id), ["l1", "l3"]);
  const rates = R.byRate(report.lines);
  assert.equal(rates.length, 1);
  assert.equal(rates[0].min, 50);
  assert.equal(rates[0].max, 70);
  assert.equal(rates[0].avg, 60);
  assert.equal(rates[0].bills, 2);
  const invoice = R.buildReport([tea, other], [], { invoice: "INV-9" });
  assert.equal(invoice.lines.length, 1);
  assert.equal(invoice.lines[0].invoice, "INV-9");
  const history = R.buildReport([tea, other], [], { item: "tea" });
  assert.equal(history.lines.length, 1);
  assert.equal(R.bySupplier(history.lines)[0].supplier, "Acme Traders");
});

test("the report section exposes the purchase columns, summary, and export links", () => {
  const built = R.buildReport([tea], [], {});
  const html = R.sectionHtml({
    ...built,
    from: "2026-11-01",
    to: "2026-11-16",
    branches: [{ id: "br1", name: "Main" }],
    links: {
      excel: "/api/reports/item-purchases/excel?from=2026-11-01&to=2026-11-16",
      pdf: "/api/reports/item-purchases/pdf?from=2026-11-01&to=2026-11-16",
      csv: "/api/reports/item-purchases/csv?from=2026-11-01&to=2026-11-16",
    },
  });
  for (const label of ["Product Name", "Product Code", "Free Qty", "Total Qty", "Purchase Rate", "Discount", "GST", "Total Amount", "Purchase Date"]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /Total items purchased/);
  assert.match(html, /Total free quantity/);
  assert.match(html, /Assam Tea/);
  assert.match(html, /item-purchases\/excel/);
  assert.match(html, /item-purchases\/pdf/);
  assert.match(html, /item-purchases\/csv/);
  assert.match(html, /data-pir-product="Assam Tea"/);
  const csv = R.csvFromReport(built);
  assert.match(csv, /Assam Tea/);
  assert.match(csv, /566\.4/);
});

test("purchase entry stores free quantity once and adds it to stock", () => {
  const crud = fs.readFileSync(new URL("../server/crud.js", import.meta.url), "utf8");
  const php = fs.readFileSync(new URL("../pos-crud.php", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("./app.js", import.meta.url), "utf8");
  const hub = fs.readFileSync(new URL("./biz-hub.js", import.meta.url), "utf8");
  assert.match(hub, /id: "item-wise-purchase"/);
  assert.match(crud, /discount, free_qty, business_id, size, color/);
  assert.match(crud, /line\.qty \+ storedFree/);
  assert.match(crud, /placePurchaseFreeQty/);
  assert.match(php, /discount, free_qty, business_id, size, color/);
  assert.match(php, /pos_place_purchase_free_qty/);
  assert.match(app, /data-po-free=/);
  assert.match(app, /free_qty: POSUnits\.toBase/);
  assert.match(app, /Item-Wise Purchase Report|sectionHtml/);
});
