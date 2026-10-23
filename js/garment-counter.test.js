import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./garment-purchase.js";
import "./garment-counter.js";
import "./footwear.js";

const C = globalThis.POSGarmentCounter;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function kurti(size, extra = {}) {
  return {
    id: `id-${extra.color || "Pink"}-${size}`,
    name: "Cotton Kurti",
    color: extra.color || "Pink",
    wearer_type: "female",
    size,
    stock_gm: extra.stock ?? 4,
    retail_rate: extra.price ?? 799,
    barcode: extra.barcode || "",
    code: extra.code || `AP-${size}`,
    status: "active",
    image_url: extra.image_url || "",
  };
}

const family = [
  kurti("S", { stock: 2, barcode: "111" }),
  kurti("M", { stock: 5, price: 849, barcode: "222" }),
  kurti("L", { stock: 0, barcode: "333" }),
  kurti("M", { color: "Blue", stock: 3, price: 899, barcode: "444", code: "AP-M-BLU" }),
];

test("searching a multi-size garment opens size selection and lists only configured sizes", () => {
  assert.equal(C.needsSizePopup(family[0], family), true);
  const decision = C.searchDecision(family, family, "Cotton Kurti");
  assert.equal(decision.action, "popup");
  const picker = C.createPicker(family, {});
  const sizes = C.pickerSizes(picker).map((row) => row.size);
  assert.deepEqual(sizes, ["S", "M", "L"]);
  assert.ok(!sizes.includes("XL"));
  assert.ok(!sizes.includes("28"));
  assert.deepEqual(picker.colors.filter(Boolean).sort(), ["Blue", "Pink"]);
});

test("selecting a size resolves that variant, price, and stock", () => {
  const picker = C.createPicker(family, { color: "Pink", size: "M" });
  const chosen = C.selectedVariant(picker);
  assert.equal(chosen.id, "id-Pink-M");
  assert.equal(chosen.price, 849);
  assert.equal(chosen.stock, 5);
  assert.equal(chosen.out, false);
  C.selectColor(picker, "Blue");
  assert.equal(C.selectedVariant(picker).id, "id-Blue-M");
  assert.equal(C.pickerSizes(picker).length, 1);
  const out = C.pickerSizes(C.createPicker(family, { color: "Pink", size: "L" })).find((row) => row.size === "L");
  assert.equal(out.out, true);
  assert.equal(C.clampSaleQty(5, 2, 4), 3);
  assert.equal(C.clampSaleQty(0, 0, 1), 0);
  assert.equal(C.clampSaleQty(2, 2, 1), 0);
});

test("different sizes stay separate cart lines", () => {
  const m = C.cartCaption(family[1]);
  const l = C.cartCaption(family[2]);
  assert.equal(m, "Cotton Kurti – Pink – Size M");
  assert.equal(l, "Cotton Kurti – Pink – Size L");
  assert.notEqual(family[1].id, family[2].id);
  assert.notEqual(m, l);
});

test("a size barcode adds that variant and a product barcode opens the popup", () => {
  const sized = C.scanAction(family[1], family, { barcodeMapped: true, query: "222" });
  assert.equal(sized.action, "add");
  assert.equal(sized.itemId, "id-Pink-M");
  const parent = { ...family[0], id: "parent", size: "", barcode: "KURTI", color: "" };
  const catalog = [parent, ...family];
  const product = C.scanAction(parent, catalog, { barcodeMapped: true, query: "KURTI" });
  assert.equal(product.action, "popup");
  const named = C.searchDecision(family, family, "kurti");
  assert.equal(named.action, "popup");
  const exact = C.searchDecision(family, family, "222");
  assert.equal(exact.action, "add");
  assert.equal(exact.itemId, "id-Pink-M");
});

test("a single-size garment and non-apparel items do not require the popup", () => {
  const only = [kurti("M")];
  assert.equal(C.needsSizePopup(only[0], only), false);
  assert.equal(C.scanAction(only[0], only, { query: "Cotton Kurti" }).action, "add");
  const rice = { id: "rice", name: "Rice", size: "", color: "", stock_gm: 10, status: "active" };
  assert.equal(C.needsSizePopup(rice, [rice]), false);
  assert.equal(C.searchDecision([rice], [rice], "Rice").action, "add");
});

test("variant draft keeps barcode, opening stock, and price per size and colour", () => {
  const draft = C.draftFromItems(family, family[0]);
  assert.ok(draft.sizes.includes("S"));
  assert.ok(draft.sizes.includes("L"));
  assert.match(draft.colorsText, /Pink/);
  assert.match(draft.colorsText, /Blue/);
  const rows = C.normalizeVariants(C.rowsFromDraft(draft));
  const pinkM = rows.find((row) => row.color === "Pink" && row.size === "M");
  const blueM = rows.find((row) => row.color === "Blue" && row.size === "M");
  assert.equal(pinkM.barcode, "222");
  assert.equal(pinkM.stock_gm, 5);
  assert.equal(pinkM.retail_rate, 849);
  assert.equal(blueM.stock_gm, 3);
  assert.equal(blueM.retail_rate, 899);
  assert.notEqual(pinkM.id, blueM.id);
  assert.throws(() => C.normalizeVariants([
    { size: "M", color: "Pink", barcode: "1" },
    { size: "M", color: "Pink", barcode: "2" },
  ]), /Duplicate variant/);
  assert.throws(() => C.normalizeVariants([
    { size: "S", color: "Pink", barcode: "SAME" },
    { size: "M", color: "Pink", barcode: "same" },
  ]), /Duplicate barcode/);
});

test("invoice note adds colour and size when the item name does not already include them", () => {
  assert.equal(C.invoiceNote({ item_name: "Cotton Kurti", color: "Pink", size: "M" }), "Pink · Size M");
  assert.equal(C.invoiceNote({ item_name: "Cotton Kurti (Female · Pink · Sz M)", color: "Pink", size: "M" }), "");
  assert.equal(C.invoiceNote({ item_name: "Rice" }), "");
});

test("keyboard movement skips out-of-stock sizes", () => {
  const picker = C.createPicker(family, { color: "Pink", size: "S" });
  C.moveSelection(picker, "size-next");
  assert.equal(picker.size, "M");
  C.moveSelection(picker, "size-next");
  assert.equal(picker.size, "S");
  C.moveSelection(picker, "color-next");
  assert.equal(picker.color, "Blue");
  assert.equal(C.selectedVariant(picker).size, "M");
});

test("counter, product master, invoices, and reports are wired for garments only", () => {
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  const css = readFileSync(path.join(root, "css/pos.css"), "utf8");
  const crud = readFileSync(path.join(root, "server/crud.js"), "utf8");
  const php = readFileSync(path.join(root, "pos-crud.php"), "utf8");
  const invoice = readFileSync(path.join(root, "js/invoice.js"), "utf8");
  const reports = readFileSync(path.join(root, "server/reports.js"), "utf8");
  const checkout = readFileSync(path.join(root, "server/index.js"), "utf8");
  const phpCheckout = readFileSync(path.join(root, "pos-checkout.php"), "utf8");
  const phpOrders = readFileSync(path.join(root, "pos-orders.php"), "utf8");
  assert.match(index, /js\/garment-counter\.js/);
  assert.match(index, /id="garment-size-modal"/);
  assert.match(index, /id="item-variant-block"/);
  assert.match(app, /function openGarmentSizePicker/);
  assert.match(app, /garmentScanGate/);
  assert.match(app, /if \(e\.key === "Enter"\) \{\s*e\.preventDefault\(\);\s*confirmGarmentSize\(\);/);
  assert.match(app, /isApparelShop\(\)/);
  assert.match(app, /POSGarmentCounter/);
  assert.match(css, /\.garment-size-dialog/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(crud, /normalizeVariants/);
  assert.match(crud, /assertApparelSaleStock/);
  assert.match(php, /pos_garment_variant_matrix/);
  assert.match(invoice, /garmentSaleNote/);
  assert.match(reports, /isApparelShop/);
  assert.match(checkout, /stampSaleLineVariant/);
  assert.match(phpCheckout, /pos_stamp_sale_line_variant/);
  assert.match(phpOrders, /pos_assert_apparel_sale_stock/);
});
