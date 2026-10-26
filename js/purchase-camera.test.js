import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./units.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const U = globalThis.POSUnits;

function read(name) {
  return readFileSync(path.join(root, name), "utf8");
}

test("purchase line tax and discount keep a zero discount on the item GST", () => {
  const plain = U.purchaseLineFigures(100, 5, {});
  assert.equal(plain.amount, 100);
  assert.equal(plain.gstRate, 5);
  assert.equal(plain.gstAmount, 5);
  assert.equal(plain.total, 105);

  const cut = U.purchaseLineFigures(100, 5, { discount: 10 });
  assert.equal(cut.amount, 90);
  assert.equal(cut.gstAmount, 4.5);
  assert.equal(cut.total, 94.5);

  const clamped = U.purchaseLineFigures(40, 12, { discount: 500, gst_rate: 0 });
  assert.equal(clamped.discount, 40);
  assert.equal(clamped.amount, 0);
  assert.equal(clamped.gstRate, 0);
  assert.equal(clamped.gstAmount, 0);

  const blank = U.purchaseLineFigures(80, 18, { gst_rate: "", discount: -4 });
  assert.equal(blank.gstRate, 18);
  assert.equal(blank.discount, 0);
  assert.equal(blank.amount, 80);
});

test("purchase entry scans with the camera and keeps stock on save", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const scan = read("js/camera-scan.js");
  const css = read("css/pos.css");
  const crud = read("server/crud.js");
  const php = read("pos-crud.php");

  assert.match(index, /id="po-scan-camera-btn"/);
  assert.match(index, /Scan Barcode/);
  assert.match(index, /id="po-missing"/);
  assert.match(index, /Product Not Found/);
  assert.match(index, /id="po-missing-create"/);
  assert.match(index, /id="po-missing-assign"/);
  assert.match(index, /id="po-tax"/);
  assert.doesNotMatch(index, /id="po-scan-camera-btn"[^>]*hidden/);

  assert.match(scan, /Start Camera/);
  assert.match(scan, /Stop Camera/);
  assert.match(scan, /Use barcode/);
  assert.match(scan, /Close/);
  assert.match(scan, /ean_13/);
  assert.match(scan, /ean_8/);
  assert.match(scan, /upc_a/);
  assert.match(scan, /upc_e/);
  assert.match(scan, /code_128/);
  assert.match(scan, /Camera permission denied/);
  assert.match(scan, /scan next or tap/);
  assert.match(scan, /getUserMedia/);
  assert.match(scan, /BarcodeDetector/);

  assert.match(app, /function applyPurchaseBarcodeScan/);
  assert.match(app, /function openPurchaseCamera/);
  assert.match(app, /Product Not Found/);
  assert.match(app, /createProductForBarcode/);
  assert.match(app, /assignPurchaseBarcode/);
  assert.match(app, /\/api\/barcodes/);
  assert.match(app, /data-po-gst/);
  assert.match(app, /data-po-discount/);
  assert.match(app, /purchaseScanLabel/);
  assert.match(app, /deskProfile/);
  assert.match(app, /kind: "search"/);
  assert.match(index, /Map to existing product/);
  assert.match(index, /id="po-scan-detail"/);
  assert.match(scan, /Map to existing product/);
  assert.match(app, /fillPurchaseScanDetail/);
  assert.match(app, /allow_empty_barcodes: allowEmpty/);
  assert.match(app, /generate_barcodes: false/);
  assert.doesNotMatch(app, /data-po-gen-bc="\$\{key\}" checked/);
  const scanFn = app.slice(app.indexOf("async function applyPurchaseBarcodeScan"), app.indexOf("function createProductForBarcode"));
  assert.doesNotMatch(scanFn, /addPurchasePieceBarcode/);
  assert.doesNotMatch(scanFn, /generate_barcodes/);
  assert.doesNotMatch(app, /openPurchaseCamera[\s\S]{0,500}cameraScannerEnabled\(\)/);

  assert.match(css, /\.po-scan-barcode-btn/);
  assert.match(css, /\.po-missing\[hidden\]/);
  assert.match(css, /\.camera-scan-manual/);
  assert.match(css, /\.camera-scan-actions/);

  assert.match(crud, /purchaseLineFigures/);
  assert.match(crud, /spreadPurchaseDiscount/);
  assert.match(crud, /UPDATE items SET stock_gm = stock_gm \+ \?/);
  assert.match(php, /function pos_purchase_line_figures/);
  assert.match(php, /function pos_spread_purchase_discount/);
  assert.match(php, /stock_gm = stock_gm \+ \?/);
  assert.match(app, /\/api\/purchases/);
  assert.doesNotMatch(scanFn, /\/api\/purchases/);
  assert.doesNotMatch(scanFn, /stock_gm/);
});
