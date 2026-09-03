import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(name) {
  return readFileSync(path.join(root, name), "utf8");
}

test("PHP and Node wire barcode, damage, loyalty, and ledger modules", () => {
  const core = read("pos-php-core.php");
  const adv = read("pos-advanced.php");
  const checkout = read("pos-checkout.php");
  const crud = read("pos-crud.php");
  const nodeAdv = read("server/advanced.js");
  const index = read("index.html");
  const app = read("js/app.js");

  assert.match(core, /function pos_is_advanced_path/);
  assert.match(core, /function pos_require_advanced/);
  assert.match(core, /pos_dispatch_advanced/);
  assert.match(adv, /function pos_ensure_advanced_schema/);
  assert.match(adv, /CREATE TABLE IF NOT EXISTS item_barcodes/);
  assert.match(adv, /CREATE TABLE IF NOT EXISTS stock_batches/);
  assert.match(adv, /CREATE TABLE IF NOT EXISTS damage_records/);
  assert.match(adv, /CREATE TABLE IF NOT EXISTS loyalty_settings/);
  assert.match(adv, /function pos_compute_sale_line/);
  assert.match(adv, /function pos_loyalty_apply_sale/);
  assert.match(checkout, /pos_compute_sale_line/);
  assert.match(checkout, /loyaltyPoints/);
  assert.match(crud, /pos_assign_item_barcodes/);
  assert.match(crud, /pos_create_purchase_batch/);
  assert.match(crud, /damaged.*expired.*returned/);
  assert.match(nodeAdv, /export function registerAdvanced/);
  assert.match(nodeAdv, /async function sqlAll/);
  assert.match(nodeAdv, /\/api\/barcodes\/lookup/);
  assert.match(nodeAdv, /\/api\/damage/);
  assert.match(nodeAdv, /\/api\/loyalty\/settings/);
  assert.match(nodeAdv, /\/api\/stock\/ledger/);
  assert.match(index, /id="view-barcodes"/);
  assert.match(index, /id="view-damage"/);
  assert.match(index, /id="view-ledger"/);
  assert.match(index, /id="view-loyalty"/);
  assert.match(index, /id="bill-disc-type"/);
  assert.match(index, /id="item-barcode"/);
  assert.match(index, /js\/barcode\.js/);
  assert.match(app, /POSDiscount/);
  assert.match(app, /barcodes\/lookup/);
  assert.match(app, /loyaltyPoints/);
  assert.match(app, /data-print-po-barcodes/);
});

test("item save and checkout persist barcode and line discount fields", () => {
  const nodeCrud = read("server/crud.js");
  const nodeIndex = read("server/index.js");
  assert.match(nodeCrud, /onItemSaved/);
  assert.match(nodeCrud, /onPurchaseLineSaved/);
  assert.match(nodeIndex, /computeSaleLine/);
  assert.match(nodeIndex, /applyLoyaltyOnSale/);
  assert.match(nodeIndex, /discount_type/);
});
