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
