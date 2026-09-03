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
  assert.match(nodeAdv, /"unit"/);
  assert.match(nodeAdv, /async function sqlAll/);
  assert.match(nodeAdv, /\/api\/barcodes\/lookup/);
  assert.match(nodeAdv, /\/api\/barcodes\/generate-qty/);
  assert.match(nodeAdv, /export async function generateQtyBarcodes/);
  assert.match(nodeAdv, /Barcodes are only for Quantity \(pcs\) items/);
  assert.match(nodeAdv, /if \(!isCountItem\(it\)\) continue/);
  assert.match(adv, /function pos_generate_qty_barcodes/);
  assert.match(adv, /barcodes\/generate-qty/);
  assert.match(adv, /Barcodes are only for Quantity \(pcs\) items/);
  assert.match(index, /id="bc-qty-form"/);
  assert.match(index, /Type or scan — not auto generated/);
  assert.match(index, /pcs-barcode-only/);
  assert.match(app, /parsePoBarcodes/);
  assert.match(app, /data-po-barcodes/);
  assert.match(app, /pcs-barcode-only/);
  assert.match(nodeAdv, /export function parseManualBarcodes/);
  assert.match(nodeAdv, /export function resolvePurchaseBarcodes/);
  assert.match(nodeAdv, /Enter \$\{pieces\} barcodes for \$\{pieces\} pcs/);
  assert.match(adv, /function pos_parse_manual_barcodes/);
  assert.match(adv, /function pos_resolve_purchase_barcodes/);
  assert.match(index, /id="item-barcode-qty"/);
  assert.match(index, /pcs-barcode-only/);
  assert.match(app, /barcodes\/generate-qty/);
  assert.match(app, /barcode_qty/);
  assert.match(app, /pcs-barcode-only/);
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

test("resolvePurchaseBarcodes requires one typed code per piece", async () => {
  const { parseManualBarcodes, resolvePurchaseBarcodes } = await import("./advanced.js");
  assert.deepEqual(parseManualBarcodes("P1\nP2\nP3"), ["P1", "P2", "P3"]);
  assert.throws(() => parseManualBarcodes("P1 P1"), /Duplicate barcode P1/);
  const pcs = { base_unit: "PCS", unit: "PCS" };
  assert.deepEqual(resolvePurchaseBarcodes(pcs, 3, { barcodes: ["A1", "A2", "A3"] }), ["A1", "A2", "A3"]);
  assert.throws(() => resolvePurchaseBarcodes(pcs, 20, { barcodes: ["A1"] }), /Enter 20 barcodes for 20 pcs/);
  assert.deepEqual(resolvePurchaseBarcodes({ base_unit: "GM" }, 1000, { barcodes: ["X"] }), []);
});

test("item save and checkout persist barcode and line discount fields", () => {
  const nodeCrud = read("server/crud.js");
  const nodeIndex = read("server/index.js");
  assert.match(nodeCrud, /onItemSaved/);
  assert.match(nodeCrud, /onPurchaseLineSaved/);
  assert.match(nodeCrud, /barcode_count/);
  assert.match(nodeIndex, /computeSaleLine/);
  assert.match(nodeIndex, /applyLoyaltyOnSale/);
  assert.match(nodeIndex, /discount_type/);
});
