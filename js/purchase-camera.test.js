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

test("purchase entry is manual search only and still saves stock", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const scan = read("js/camera-scan.js");
  const css = read("css/pos.css");
  const crud = read("server/crud.js");
  const php = read("pos-crud.php");
  const purchase = index.slice(index.indexOf('id="view-purchases"'), index.indexOf('id="view-suppliers"'));

  assert.match(purchase, /id="po-item-search"/);
  assert.match(purchase, /id="po-search-results"/);
  assert.match(purchase, /id="po-tax"/);
  assert.match(purchase, /Find an item and add it, then set the quantity/);
  assert.doesNotMatch(purchase, /id="po-scan-camera-btn"/);
  assert.doesNotMatch(purchase, /Scan Barcode/);
  assert.doesNotMatch(purchase, /id="po-missing"/);
  assert.doesNotMatch(purchase, /id="po-missing-create"/);
  assert.doesNotMatch(purchase, /id="po-missing-assign"/);
  assert.doesNotMatch(purchase, /id="po-scan-detail"/);
  assert.doesNotMatch(purchase, /scan-camera-btn/);
  assert.doesNotMatch(purchase, /USB scanner/);
  assert.doesNotMatch(purchase, /camera/i);

  assert.match(index, /id="scan-camera-btn"/);
  assert.match(index, /id="bill-scan-camera-btn"/);
  assert.match(index, /id="view-barcodes"/);
  assert.match(scan, /Start Camera/);
  assert.match(scan, /getUserMedia/);
  assert.match(scan, /BarcodeDetector/);

  assert.doesNotMatch(app, /function applyPurchaseBarcodeScan/);
  assert.doesNotMatch(app, /function openPurchaseCamera/);
  assert.doesNotMatch(app, /function initPurchaseCameraScan/);
  assert.doesNotMatch(app, /createProductForBarcode/);
  assert.doesNotMatch(app, /assignPurchaseBarcode/);
  assert.doesNotMatch(app, /purchaseScanLabel/);
  assert.doesNotMatch(app, /data-po-qty-camera/);
  assert.doesNotMatch(app, /data-po-size-bc-camera/);
  assert.match(app, /function purchaseBarcodeOn/);
  assert.match(app, /function purchaseBarcodeEntryOn/);
  assert.match(app, /function itemBarcodeTracked/);
  assert.match(app, /function openPurchaseBarcodeCamera/);
  assert.match(app, /Add Item Barcodes/);
  assert.doesNotMatch(app, /data-po-bc-scan/);
  assert.doesNotMatch(app, /data-po-size-bc-scan/);
  assert.doesNotMatch(app, /Camera on each item qty/);
  assert.match(app, /data-po-gst/);
  assert.match(app, /data-po-discount/);
  assert.match(app, /po-qty-cell/);
  assert.match(app, /po-item-search/);
  assert.match(app, /allow_empty_barcodes: allowEmpty/);
  assert.match(app, /if \(purchaseBarcodeEntryOn\(item\)\)/);
  assert.match(app, /if \(itemBarcodeTracked\(item\) \|\| barcodes\.length\)/);
  assert.match(app, /allowEmpty = false/);
  assert.match(app, /function capturePoDraft/);
  assert.match(app, /function renderPoSearchResults/);
  assert.match(app, /function addPoItemById/);
  assert.match(app, /function addPoStyle/);
  assert.match(app, /data-po-add-item/);
  assert.match(app, /data-po-add-style/);
  assert.match(app, /data-po-remove/);
  assert.match(app, /PO_SEARCH_LIMIT = 8/);
  assert.match(app, /poLineDraft\.clear\(\)/);
  assert.doesNotMatch(app, /const matched = q \? all\.filter/);
  assert.match(app, /\$\("po-item-search"\)\?\.addEventListener\("keydown"/);
  const searchKeys = app.slice(app.indexOf('$("po-item-search")?.addEventListener("keydown"'), app.indexOf('$("purchase-form").addEventListener("input"'));
  assert.match(searchKeys, /preventDefault\(\)/);
  assert.match(searchKeys, /hits\.length !== 1/);
  assert.match(searchKeys, /addPoItemById/);
  const searchInput = app.slice(app.indexOf('$("purchase-form").addEventListener("input"'), app.indexOf('$("purchase-form").addEventListener("change"'));
  assert.match(searchInput, /renderPoSearchResults\(\)/);
  assert.doesNotMatch(searchInput, /renderPoLines\(\)/);
  assert.match(app, /generate_barcodes: false/);
  assert.doesNotMatch(app, /Generate unique barcodes/);
  assert.doesNotMatch(app, /data-po-gen-bc/);
  const classic = app.slice(app.indexOf("function renderClassicPoLines"), app.indexOf("function apparelPoGroupSearch"));
  assert.match(classic, /data-po-qty=/);
  assert.match(classic, /data-po-gst=/);
  assert.match(classic, /data-po-discount=/);
  assert.match(classic, /purchaseBarcodeEntryOn/);
  assert.match(classic, /data-po-barcodes=/);
  assert.doesNotMatch(classic, /scan-camera-btn/);
  assert.doesNotMatch(classic, /data-po-bc-scan/);
  const apparel = app.slice(app.indexOf("function renderApparelPoLines"), app.indexOf("function extraSizeCellHtml"));
  const colorBlock = app.slice(app.indexOf("function apparelPoColorBlockHtml"), app.indexOf("function renderApparelPoLines"));
  assert.match(colorBlock, /data-po-size-qty=/);
  assert.match(apparel, /data-po-gst=/);
  assert.match(apparel, /data-po-discount=/);
  assert.doesNotMatch(apparel, /data-po-gen-bc/);
  assert.doesNotMatch(apparel, /Generate unique barcodes/);
  const apparelSave = app.slice(app.indexOf("function collectApparelPoLines"), app.indexOf("function filterPoLines"));
  assert.match(apparelSave, /generate_barcodes: false/);
  assert.doesNotMatch(apparelSave, /data-po-gen-bc/);
  assert.doesNotMatch(apparel, /scan-camera-btn/);
  assert.doesNotMatch(apparel, /data-po-size-bc-scan/);
  const vis = app.slice(app.indexOf("function applyCameraScannerVisibility"), app.indexOf("function paintTimezonePreview"));
  assert.match(vis, /scan-camera-btn/);
  assert.match(vis, /bill-scan-camera-btn/);
  assert.doesNotMatch(vis, /po-scan-camera-btn/);
  assert.doesNotMatch(vis, /data-po-qty-camera/);
  assert.match(app, /function initCameraScan/);
  assert.match(app, /function applyBarcodeScan/);

  assert.doesNotMatch(css, /\.po-gen-bc/);
  assert.doesNotMatch(css, /\.po-scan-barcode-btn/);
  assert.match(css, /\.po-qty-cell/);
  assert.doesNotMatch(css, /\.po-qty-cell \.scan-camera-btn/);
  assert.doesNotMatch(css, /\.po-missing\[hidden\]/);
  assert.match(css, /\.camera-scan-manual/);
  assert.match(css, /\.camera-scan-actions/);

  assert.match(crud, /purchaseLineFigures/);
  assert.match(crud, /spreadPurchaseDiscount/);
  assert.match(crud, /UPDATE items SET stock_gm = stock_gm \+ \?/);
  assert.match(php, /function pos_purchase_line_figures/);
  assert.match(php, /function pos_spread_purchase_discount/);
  assert.match(php, /stock_gm = stock_gm \+ \?/);
  assert.match(app, /\/api\/purchases/);
});
