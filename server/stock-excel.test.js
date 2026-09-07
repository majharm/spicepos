import assert from "node:assert/strict";
import test from "node:test";
import { workbookXml } from "./excel.js";
import { stockAlert, stockDisplayQty, stockToSheets, stockValue } from "./stock-excel.js";

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
