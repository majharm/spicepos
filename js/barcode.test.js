import test from "node:test";
import assert from "node:assert/strict";
import "./barcode.js";

const B = globalThis.POSBarcode;

test("EAN-13 checksum and in-store generator", () => {
  assert.equal(B.ean13Checksum("400638133393"), 1);
  assert.equal(B.isValidEan13("4006381333931"), true);
  assert.equal(B.isValidEan13("4006381333930"), false);
  const code = B.generateEan13(17, "12345");
  assert.equal(code.length, 13);
  assert.equal(code[0], "2");
  assert.equal(B.isValidEan13(code), true);
});

test("manual barcode list keeps typed codes and rejects duplicates", () => {
  assert.deepEqual(B.parseManualCodes("A1\nB2\nC3"), ["A1", "B2", "C3"]);
  assert.deepEqual(B.parseManualCodes(["  X-1 ", "X-2"]), ["X-1", "X-2"]);
  assert.equal(B.parseManualCodes("").length, 0);
  assert.throws(() => B.parseManualCodes("A1\nA1"), /Duplicate barcode A1/);
});

test("19-digit garment barcodes stay exact strings after trim and scanner junk", () => {
  const code = "1777178973885357718";
  assert.equal(code.length, 19);
  assert.ok(Number(code) !== Number(code) || String(Number(code)) !== code, "JS Number cannot hold this barcode");
  assert.equal(B.asBarcodeString(code), code);
  assert.equal(B.cleanCode(`  ${code} \r\n`), code);
  assert.equal(B.cleanCode(`]C1${code}`), code);
  assert.equal(B.cleanCode(`${code}\u001d`), code);
  assert.equal(B.barcodesEqual(` ${code} `, code), true);
  assert.equal(B.barcodesEqual(code, "1777178973885357800"), false);
  assert.equal(B.isBarcodeLike(code), true);
  assert.equal(B.itemHasBarcode({ barcode: code, size: "M", color: "Black" }, ` ${code} `), true);
  assert.equal(B.itemHasBarcode({ barcode: "8901", barcodes: [{ barcode: code }] }, code), true);
  assert.equal(B.itemHasBarcode({ barcode: "8901" }, code), false);
  assert.equal(B.isReusableProductKind("own"), true);
  assert.equal(B.isReusableProductKind("manufacturer"), true);
  assert.equal(B.shouldConsumePieceBarcode({ kind: "own" }), false);
  assert.equal(B.shouldConsumePieceBarcode({ kind: "unit" }), true);
});

test("desk profiles follow the shop and piece codes stay unique", () => {
  const apparel = B.deskProfile("apparel");
  assert.equal(apparel.size, true);
  assert.equal(apparel.batch, false);
  assert.equal(apparel.kinds.includes("unit"), true);
  const pharmacy = B.deskProfile("pharmacy");
  assert.equal(pharmacy.batch, true);
  assert.equal(pharmacy.expiry, true);
  assert.equal(pharmacy.size, false);
  const electronics = B.deskProfile("electronics");
  assert.equal(electronics.serial, true);
  assert.equal(B.deskProfile("unknown-shop").shopKind, "general");
  assert.match(B.deskLead("apparel"), /size and colour/);
  assert.equal(B.isReusableProductKind("variant"), true);
  assert.equal(B.isReusableProductKind("batch"), true);
  assert.equal(B.isReusableProductKind("serial"), false);
  assert.equal(B.isPieceKind("piece"), true);
  assert.equal(B.isPieceKind("own"), false);
  assert.equal(B.normalizeBarcodeKind("product"), "own");
  assert.equal(B.kindLabel("unit"), "Piece");
});

test("EAN-13 bars use a valid check digit and labels keep variant text", () => {
  const bits = B.encodeEan13("4006381333931");
  assert.ok(bits.startsWith("101"));
  assert.equal(B.encodeEan13("4006381333930"), "");
  const svg = B.ean13Svg("4006381333931");
  assert.match(svg, /<svg /);
  assert.match(svg, /4006381333931/);
  const html = B.labelsDocument([{
    name: "Shirt",
    barcode: "4006381333931",
    format: "ean13",
    mrp: 999,
    rate: 799,
    size: "M",
    color: "Navy",
    batch_no: "B1",
    expiry: "2027-01-01",
    serial_no: "SN1",
    shop: "ATAV",
    sku: "SH1",
  }], { layout: "a4", widthMm: 48, heightMm: 30 });
  assert.match(html, /Size M/);
  assert.match(html, /Batch B1/);
  assert.match(html, /Exp 2027-01-01/);
  assert.match(html, /SN1/);
  assert.match(html, /ATAV/);
  const csv = B.labelsCsv([{ barcode: "BC1", kind: "unit", status: "active", item_name: "Shirt", size: "M" }]);
  assert.match(csv, /Shirt/);
  assert.match(csv, /barcode,kind,status/);
});

test("CODE128 encodes digits and prints label copies", () => {
  const bits = B.encodeCode128("8901234567893");
  assert.ok(bits.startsWith("0000000000"));
  assert.ok(bits.includes("1"));
  const svg = B.code128Svg("ABC-01");
  assert.match(svg, /<svg /);
  assert.match(svg, /ABC-01/);
  const rows = B.expandCopies([{ name: "Sugar", barcode: "8901234567893", mrp: 55, rate: 48 }], 3);
  assert.equal(rows.length, 3);
  const html = B.labelsDocument(rows);
  assert.match(html, /Sugar/);
  assert.match(html, /MRP/);
});
