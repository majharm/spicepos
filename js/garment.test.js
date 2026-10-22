import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoDuplicateBarcodes,
  expandPieceBarcodes,
  formatSizeQuantities,
  garmentPurchaseLineTotals,
  generatePieceBarcode,
  isGarmentCategory,
  LETTER_SIZES,
  NUMERIC_SIZES,
  parseSizeQuantities,
  sizesForChart,
  totalSizeQty,
  variantKey,
} from "./garment.js";

test("garment category matches fashion labels", () => {
  assert.equal(isGarmentCategory("Garment & Fashion"), true);
  assert.equal(isGarmentCategory("garment"), true);
  assert.equal(isGarmentCategory("pharmacy"), false);
  assert.equal(isGarmentCategory("restaurant"), false);
});

test("size charts include letter, numeric, and custom sizes", () => {
  assert.deepEqual(sizesForChart("letter"), LETTER_SIZES);
  assert.deepEqual(sizesForChart("numeric"), NUMERIC_SIZES);
  assert.ok(sizesForChart("both").includes("M"));
  assert.ok(sizesForChart("both").includes("32"));
  assert.deepEqual(sizesForChart("custom", "Free size, 40"), ["Free size", "40"]);
});

test("size-wise qty matrix totals pieces and amount", () => {
  const sizes = parseSizeQuantities("S: 5, M: 10, L: 15, XL: 10");
  assert.equal(totalSizeQty(sizes), 40);
  assert.equal(formatSizeQuantities(sizes), "S: 5, M: 10, L: 15, XL: 10");
  const line = garmentPurchaseLineTotals({
    sizeQuantities: sizes,
    purchaseRate: 250,
    gstRate: 5,
  });
  assert.equal(line.totalQty, 40);
  assert.equal(line.taxable, 10000);
  assert.equal(line.gst, 500);
  assert.equal(line.total, 10500);
});

test("piece barcodes are unique per garment unit", () => {
  const pieces = expandPieceBarcodes({
    itemCode: "KURTI",
    colour: "Navy",
    purchaseNumber: "PO-10010",
    generate: true,
    sizeQuantities: { S: 2, M: 1 },
  });
  assert.equal(pieces.length, 3);
  assert.equal(new Set(pieces.map((p) => p.barcode)).size, 3);
  assert.equal(pieces.filter((p) => p.size === "S").length, 2);
  const code = generatePieceBarcode({
    itemCode: "KURTI",
    size: "M",
    colour: "Navy",
    sequence: 1,
    purchaseNumber: "PO-10010",
  });
  assert.match(code, /^G-/);
});

test("assigned barcodes must match piece count and reject duplicates", () => {
  assert.throws(() => assertNoDuplicateBarcodes(["A1", "a1"]), /Duplicate barcode/);
  assert.throws(
    () =>
      expandPieceBarcodes({
        generate: false,
        assigned: ["A1"],
        sizeQuantities: { M: 2 },
      }),
    /Need 2 unique barcodes/,
  );
  const pieces = expandPieceBarcodes({
    assigned: ["A1", "A2"],
    sizeQuantities: { M: 2 },
    colour: "Red",
  });
  assert.deepEqual(
    pieces.map((p) => p.barcode),
    ["A1", "A2"],
  );
});

test("variant keys keep product, colour, and size distinct", () => {
  assert.equal(variantKey("i1", "Navy", "m"), variantKey("i1", "navy", "M"));
  assert.notEqual(variantKey("i1", "Navy", "M"), variantKey("i1", "Navy", "L"));
});
