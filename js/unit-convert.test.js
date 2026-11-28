import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import "./unit-convert.js";
import "./footwear.js";

const C = globalThis.POSUnitConvert;
const F = globalThis.POSFootwear;
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

const boxItem = {
  name: "XYZ",
  base_unit: "PCS",
  unit: "PCS",
  pack_unit: "Box",
  units_per_pack: 20,
  barcode: "123456789",
  retail_rate: 10,
  purchase_rate: 8,
};

test("10 boxes of 20 pieces become 200 pieces of stock", () => {
  const row = C.resolvePurchase({ purchase_qty: 10, purchase_unit: "BOX", conversion: 20, free_qty: 0 });
  assert.equal(row.stockQty, 200);
  assert.equal(row.billQty, 10);
  assert.equal(C.saleDeduction(1, "BOX", boxItem), 20);
});

test("2 boxes plus 10 pieces become 50 pieces", () => {
  const boxes = C.resolvePurchase({ purchase_qty: 2, purchase_unit: "BOX", conversion: 20, free_qty: 0 });
  const pieces = C.resolvePurchase({ purchase_qty: 10, purchase_unit: "PCS", conversion: 1, free_qty: 0 });
  assert.equal(boxes.stockQty + pieces.stockQty, 50);
  assert.equal(C.toBase(2, 20) + C.toBase(10, 1), 50);
});

test("box stock stays in pieces while a pharmacy strip still converts loose tablets", () => {
  assert.equal(C.storesBasePieces(boxItem), true);
  assert.equal(F.packStockQty(boxItem, 20), 20);
  assert.equal(F.looseSaleRate(boxItem), 10);
  const strip = { pack_unit: "Strip", medicine_type: "Tablet", units_per_pack: 10, retail_rate: 20 };
  assert.equal(C.storesBasePieces(strip), false);
  assert.equal(F.packStockQty(strip, 2), 0.2);
  assert.equal(F.looseSaleRate(strip), 2);
});

test("the same product barcode can sit on more than one batch", () => {
  assert.equal(C.isSharedProductBarcode(boxItem, "123456789"), true);
  assert.equal(C.isSharedProductBarcode(boxItem, "999"), false);
  const node = read("server/advanced.js");
  const php = read("pos-advanced.php");
  assert.match(node, /product_barcode \|\| ctx\.productBarcode/);
  assert.match(php, /product_barcode/);
  assert.match(read("server/crud.js"), /resolvePurchase/);
  assert.match(read("pos-crud.php"), /pos_resolve_purchase_line/);
  assert.match(read("pos-advanced.php"), /pos_stores_base_pieces/);
});

test("purchase and billing expose box and piece units", () => {
  const app = read("js/app.js");
  const index = read("index.html");
  assert.match(app, /data-po-conv/);
  assert.match(app, /data-po-add-unit/);
  assert.match(app, /data-sale-unit/);
  assert.match(app, /purchase_qty/);
  assert.match(index, /id="item-unit-convert"/);
  assert.match(index, /unit-convert\.js\?v=20261118unit1/);
  assert.equal(C.saleUnits(boxItem)[0].code, "BOX");
  assert.equal(C.saleUnits(boxItem)[0].factor, 20);
});
