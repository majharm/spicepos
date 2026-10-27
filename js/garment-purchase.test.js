import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./garment-purchase.js";

const G = globalThis.POSGarmentPurchase;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("garment sizes include letter, numeric, XXXL, and custom", () => {
  assert.deepEqual(G.LETTER_SIZES, ["XS", "S", "M", "L", "XL", "XXL", "XXXL"]);
  assert.deepEqual(G.NUMERIC_SIZES, ["28", "30", "32", "34", "36", "38"]);
  assert.equal(G.normalizeSize("3xl"), "XXXL");
  assert.equal(G.normalizeSize("xxxL"), "XXXL");
  assert.equal(G.normalizeSize("  m "), "M");
  assert.equal(G.normalizeSize("32"), "32");
  assert.equal(G.normalizeSize("Free Size"), "FREESIZE");
  assert.equal(G.sizesEqual("3XL", "XXXL"), true);
  assert.equal(G.sizesEqual("S", "M"), false);
});

test("size-wise quantity matrix totals and amounts", () => {
  const qtys = { S: 5, M: 10, L: 15, XL: 10 };
  assert.equal(G.totalQty(qtys), 40);
  assert.equal(G.formatSizeQtySummary(qtys), "S: 5, M: 10, L: 15, XL: 10");
  assert.equal(G.lineAmount(40, 250), 10000);
  const planned = G.planSizeLines(qtys, { rate: 250, generate_barcodes: true });
  assert.equal(planned.length, 4);
  assert.deepEqual(
    planned.map((p) => `${p.size}:${p.qty}`),
    ["S:5", "M:10", "L:15", "XL:10"],
  );
});

test("one garment style keeps every colour and size together", () => {
  const groups = G.styleGroups([
    { id: "1", name: "Cotton Kurti", color: "Pink", wearer_type: "female", size: "M" },
    { id: "2", name: "Cotton Kurti", color: "Pink", wearer_type: "female", size: "L" },
    { id: "3", name: "Cotton Kurti", color: "black", wearer_type: "female", size: "XL" },
    { id: "4", name: "Cotton Kurti", color: "Pink", wearer_type: "male", size: "M" },
  ]);
  assert.equal(groups.length, 2);
  const female = groups.find((g) => g.wearer_type === "female");
  assert.deepEqual(female.colors, ["Pink", "Black"]);
  assert.equal(female.variants.length, 3);
  assert.equal(G.normalizeColor("pink"), "Pink");
  assert.match(G.swatchCss("Black"), /#111827/);
  assert.match(G.swatchCss("Seafoam"), /hsl\(/);
  assert.deepEqual(G.barcodesForColor({ "pink|M": ["A1"], "black|XL": ["B1"] }, "Pink"), { M: ["A1"] });
});

test("multi-product grouping keeps colour and wearer together", () => {
  const groups = G.groupItems([
    { id: "1", name: "Cotton Kurti", color: "Maroon", wearer_type: "female", size: "S", purchase_rate: 250 },
    { id: "2", name: "Cotton Kurti", color: "Maroon", wearer_type: "female", size: "M", purchase_rate: 250 },
    { id: "3", name: "Cotton Kurti", color: "Blue", wearer_type: "female", size: "S", purchase_rate: 260 },
  ]);
  assert.equal(groups.length, 2);
  const maroon = groups.find((g) => g.color === "Maroon");
  assert.equal(maroon.variants.length, 2);
  assert.ok(maroon.sizes.includes("S"));
  assert.ok(maroon.sizes.includes("M"));
  assert.match(G.productLabel(maroon.anchor), /Cotton Kurti/);
  const cols = G.sizeColumns(maroon, ["42"]);
  assert.ok(cols.includes("S"));
  assert.ok(cols.includes("XXXL"));
  assert.ok(cols.includes("42"));
});

test("planSizeLines accepts assigned barcodes and rejects duplicates", () => {
  const planned = G.planSizeLines(
    { S: 2, M: 1 },
    { barcodes_by_size: { S: ["A1", "A2"], M: ["A3"] }, generate_barcodes: false },
  );
  assert.deepEqual(planned[0].barcodes, ["A1", "A2"]);
  assert.throws(
    () => G.planSizeLines({ S: 2 }, { barcodes_by_size: { S: ["A1"] } }),
    /enter 2 barcodes/,
  );
  assert.throws(
    () => G.collectDuplicateBarcodes([["A1"], ["A1"]]),
    /Duplicate barcode A1/,
  );
});

test("invoice grouping shows size-wise quantities on one product row", () => {
  const groups = G.groupInvoiceLines([
    { product_name: "Cotton Kurti", color: "Maroon", wearer_type: "female", size: "S", quantity_gm: 5, rate_per_kg: 250, amount: 1250, gst_amount: 62.5, gst_rate: 5, unit: "PCS" },
    { product_name: "Cotton Kurti", color: "Maroon", wearer_type: "female", size: "M", quantity_gm: 10, rate_per_kg: 250, amount: 2500, gst_amount: 125, gst_rate: 5, unit: "PCS" },
    { item_name: "Turmeric", quantity_gm: 1000, rate_per_kg: 500, amount: 500, gst_amount: 25, gst_rate: 5, unit: "GM" },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].kind, "garment");
  assert.equal(groups[0].totalQty, 15);
  assert.equal(groups[0].summary, "S: 5, M: 10");
  assert.equal(groups[0].amount, 3750);
  assert.equal(groups[1].kind, "plain");
  assert.equal(groups[1].name, "Turmeric");
});

test("stock board nests product, colour, size, and barcode", () => {
  const board = G.stockBoard([
    {
      id: "p-m",
      name: "Cotton Kurti",
      color: "Pink",
      size: "M",
      wearer_type: "female",
      code: "K-M",
      barcode: "SKU-PINK-M",
      category: "Kurtis",
      supplier_name: "Loom House",
      stock_gm: 2,
      reorder_level_gm: 1,
      purchase_rate: 250,
      barcodes: [
        { barcode: "P1", kind: "unit", status: "active" },
        { barcode: "P2", kind: "unit", status: "sold" },
      ],
    },
    {
      id: "b-l",
      name: "Cotton Kurti",
      color: "Black",
      size: "L",
      wearer_type: "female",
      code: "K-L",
      barcode: "SKU-BLACK-L",
      category: "Kurtis",
      stock_gm: 0,
      reorder_level_gm: 2,
      purchase_rate: 250,
    },
  ]);
  assert.equal(board.styles.length, 1);
  assert.equal(board.styles[0].colors.length, 2);
  const pink = board.styles[0].colors.find((c) => c.color === "Pink");
  assert.equal(pink.sizes[0].stock, 2);
  assert.equal(pink.sizes[0].status, "ok");
  assert.deepEqual(pink.sizes[0].barcodes.map((b) => `${b.barcode}:${b.onHand}`), ["P1:1", "P2:0"]);
  const black = board.styles[0].colors.find((c) => c.color === "Black");
  assert.equal(black.sizes[0].status, "out");
  assert.equal(black.sizes[0].barcodes[0].barcode, "SKU-BLACK-L");
  assert.equal(black.sizes[0].barcodes[0].onHand, 0);
  assert.equal(board.styles[0].status, "out");
  assert.equal(board.barcodeRows.filter((r) => r.color === "Pink").length, 2);
  const attached = G.withBarcodes([{ id: "p-m", stock_gm: 1 }], [{ item_id: "p-m", barcode: "Z9", kind: "unit", status: "active" }]);
  assert.equal(attached[0].barcodes[0].barcode, "Z9");
});

test("inventory groups size-wise stock for one garment", () => {
  const stock = G.stockGroups([
    { name: "Cotton Kurti", color: "Maroon", wearer_type: "female", size: "S", stock_gm: 5, purchase_rate: 250 },
    { name: "Cotton Kurti", color: "Maroon", wearer_type: "female", size: "M", stock_gm: 10, purchase_rate: 250 },
    { name: "Cotton Kurti", color: "Maroon", wearer_type: "female", size: "L", stock_gm: 15, purchase_rate: 250 },
  ]);
  assert.equal(stock.length, 1);
  assert.equal(stock[0].totalStock, 30);
  assert.equal(stock[0].sizeStock.S, 5);
  assert.equal(stock[0].sizeStock.L, 15);
  assert.match(stock[0].summary, /S: 5/);
});

test("purchase form and APIs wire garment size matrix without breaking pharmacy", () => {
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  const crud = readFileSync(path.join(root, "server/crud.js"), "utf8");
  const phpCrud = readFileSync(path.join(root, "pos-crud.php"), "utf8");
  const adv = readFileSync(path.join(root, "server/advanced.js"), "utf8");
  const phpAdv = readFileSync(path.join(root, "pos-advanced.php"), "utf8");
  const invoice = readFileSync(path.join(root, "js/invoice.js"), "utf8");
  const css = readFileSync(path.join(root, "css/pos.css"), "utf8");
  assert.match(index, /js\/garment-purchase\.js/);
  assert.match(app, /function renderApparelPoLines/);
  assert.match(app, /data-po-size-qty/);
  assert.match(app, /size_qtys/);
  assert.match(app, /color_size_qtys/);
  assert.match(app, /data-po-color/);
  assert.match(index, /id="garment-color-list"/);
  assert.match(app, /generate_barcodes/);
  assert.match(crud, /color_size_qtys/);
  assert.match(phpCrud, /color_size_qtys/);
  assert.match(phpCrud, /pos_garment_normalize_color/);
  assert.match(app, /isApparelShop\(\)/);
  assert.match(crud, /expandGarmentPurchaseLines/);
  assert.match(phpCrud, /pos_expand_garment_purchase_lines/);
  assert.match(adv, /resolvePurchasePieceBarcodes/);
  assert.match(phpAdv, /pos_resolve_purchase_piece_barcodes/);
  assert.match(invoice, /groupInvoiceLines/);
  assert.match(css, /po-size-matrix/);
  assert.match(app, /function renderClassicPoLines/);
  assert.match(app, /paintGarmentStockList/);
  assert.match(app, /garment-size-chip/);
  assert.match(app, /garment-stock-detail/);
  assert.match(app, /garment-bc-card garment-barcode-row/);
  assert.match(index, /stock-filter-row/);
  assert.match(index, /class="item-composer-note apparel-only"/);
  assert.match(css, /body\.apparel-mode \.stock-desk \.items-library \{ order: -1; \}/);
  assert.match(css, /\.garment-bc-card/);
  assert.match(index, /id="po-item-search"/);
  assert.doesNotMatch(index, /id="po-scan-camera-btn"/);
  assert.doesNotMatch(app, /data-po-size-bc-camera/);
  assert.doesNotMatch(app, /data-po-size-bc-scan/);
  assert.doesNotMatch(app, /applyPurchaseBarcodeScan/);
  assert.match(app, /data-po-size-barcodes/);
  assert.match(css, /po-size-bc-head/);
});
