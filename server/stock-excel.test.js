import assert from "node:assert/strict";
import test from "node:test";
import { workbookXml } from "./excel.js";
import {
  stockAlert,
  stockBatchExcelRow,
  stockDisplayQty,
  stockExcelHeaders,
  stockToSheets,
  stockValue,
} from "./stock-excel.js";

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

function col(sheet, header) {
  const i = sheet.headers.indexOf(header);
  assert.ok(i >= 0, `missing header ${header}`);
  return (row) => row[i];
}

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
  const headers = stockExcelHeaders();
  assert.ok(headers.includes("Batch no"));
  assert.ok(headers.includes("Expiry"));
  assert.ok(headers.includes("MRP"));
  const get = col(sheets[0], "Code");
  const unit = col(sheets[0], "Unit");
  const onHand = col(sheets[0], "On hand");
  const alert = col(sheets[0], "Alert");
  const status = col(sheets[0], "Item status");
  assert.equal(get(sheets[0].rows[0]), "SP-001");
  assert.equal(unit(sheets[0].rows[0]), "KG");
  assert.equal(onHand(sheets[0].rows[0]), 5);
  assert.equal(alert(sheets[0].rows[1]), "Low");
  assert.equal(status(sheets[0].rows[2]), "Inactive");
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
      generic_name: "Paracetamol",
      medicine_type: "Tablet",
      manufacturer: "Micro",
      batch_no: "DL650A",
      barcode: "890111",
      expiry_date: "2027-09-30",
      manufactured_date: "2025-10-01",
      remaining_gm: 20,
      qty_gm: 100,
      base_unit: "PCS",
      unit_cost: 10,
      mrp: 20,
      retail_rate: 18,
      hsn: "3004",
      category: "Medical",
      supplier_name: "Cipla Dist",
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
  const headers = pharm[2].headers;
  assert.ok(headers.includes("Expiry"));
  assert.ok(headers.includes("Mfg date"));
  assert.ok(headers.includes("Supplier"));
  assert.ok(headers.includes("Generic / local"));
  const batchNo = headers.indexOf("Batch no");
  const expiry = headers.indexOf("Expiry");
  const onHand = headers.indexOf("On hand");
  const generic = headers.indexOf("Generic / local");
  assert.equal(pharm[2].rows[0][batchNo], "DL650A");
  assert.equal(pharm[2].rows[0][expiry], "2027-09-30");
  assert.equal(pharm[2].rows[0][onHand], 20);
  assert.equal(pharm[2].rows[0][generic], "Paracetamol");
  assert.deepEqual(stockBatchExcelRow(batches[0]).slice(0, 3), ["MED-01", "Dolo 650", "Paracetamol"]);
  const xml = workbookXml(pharm);
  assert.match(xml, /ss:Name="Batches"/);
  assert.match(xml, /DL650A/);
  assert.match(xml, /2027-09-30/);
});
