import assert from "node:assert/strict";
import test from "node:test";
import { workbookXml } from "./excel.js";
import { stockAlert, stockBatchExcelRow, stockDisplayQty, stockToSheets, stockValue } from "./stock-excel.js";

const items = [
  {
    code: "SP-001",
    name: "Turmeric powder",
    barcode: "8901",
    hsn: "0910",
    category: "Ground",
    subcategory: "Haldi",
    base_unit: "KG",
    stock_gm: 5000,
    reorder_level_gm: 2000,
    purchase_rate: 180,
    retail_rate: 240,
    b2b_rate: 210,
    gst_rate: 5,
    status: "active",
  },
  {
    code: "SP-002",
    name: "Red chilli",
    base_unit: "GM",
    stock_gm: 800,
    reorder_level_gm: 1000,
    purchase_rate: 220,
    retail_rate: 280,
    b2b_rate: 250,
    gst_rate: 5,
  },
  {
    code: "SP-003",
    name: "Salt 1kg",
    base_unit: "PCS",
    stock_gm: 0,
    reorder_level_gm: 10,
    purchase_rate: 22,
    retail_rate: 28,
    b2b_rate: 24,
    gst_rate: 5,
    status: "inactive",
  },
];

test("stock Excel converts kg on-hand and flags low / out", () => {
  assert.equal(stockDisplayQty(5000, "KG"), 5);
  assert.equal(stockDisplayQty(800, "GM"), 800);
  assert.equal(stockAlert(items[0]), "OK");
  assert.equal(stockAlert(items[1]), "Low");
  assert.equal(stockAlert(items[2]), "Out");
  assert.equal(stockValue(items[0]), 900);
  assert.equal(stockValue(items[2]), 0);
});

test("stockToSheets writes a full list and a Low stock sheet", () => {
  const sheets = stockToSheets(items);
  assert.equal(sheets[0].name, "Stock");
  assert.equal(sheets[1].name, "Low stock");
  assert.equal(sheets[0].rows.length, 3);
  assert.equal(sheets[1].rows.length, 2);
  assert.equal(sheets[0].rows[0][0], "SP-001");
  assert.equal(sheets[0].rows[0][6], "KG");
  assert.equal(sheets[0].rows[0][7], 5);
  assert.equal(sheets[0].rows[1][9], "Low");
  assert.equal(sheets[0].rows[2][15], "Inactive");
  const xml = workbookXml(sheets);
  assert.match(xml, /ss:Name="Stock"/);
  assert.match(xml, /ss:Name="Low stock"/);
  assert.match(xml, /Turmeric powder/);
});

test("pharmacy stock Excel adds a Batches sheet by batch number", () => {
  const batches = [
    {
      item_code: "MED-01",
      item_name: "Dolo 650",
      batch_no: "DL650A",
      expiry_date: "2027-09-30",
      remaining_gm: 20,
      base_unit: "PCS",
      unit_cost: 10,
      mrp: 20,
    },
    {
      item_code: "MED-01",
      item_name: "Dolo 650",
      batch_no: "EMPTY",
      remaining_gm: 0,
      base_unit: "PCS",
    },
  ];
  const spice = stockToSheets(items, { category: "Spices & masala" }, batches);
  assert.equal(spice.length, 2);
  const pharm = stockToSheets(items, { category: "Medical" }, batches);
  assert.equal(pharm.length, 3);
  assert.equal(pharm[2].name, "Batches");
  assert.equal(pharm[2].rows.length, 1);
  assert.equal(pharm[2].rows[0][2], "DL650A");
  assert.equal(pharm[2].rows[0][3], "2027-09-30");
  assert.equal(pharm[2].rows[0][4], 20);
  assert.deepEqual(stockBatchExcelRow(batches[0]).slice(0, 3), ["MED-01", "Dolo 650", "DL650A"]);
  const xml = workbookXml(pharm);
  assert.match(xml, /ss:Name="Batches"/);
  assert.match(xml, /DL650A/);
});
