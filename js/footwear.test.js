import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./footwear.js";

const F = globalThis.POSFootwear;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("Footwear shop is detected from category or type", () => {
  assert.equal(F.isFootwearShop({ category: "Footwear" }), true);
  assert.equal(F.isFootwearShop({ business_type: "Footwear" }), true);
  assert.equal(F.isFootwearShop({ category: "Shoes" }), true);
  assert.equal(F.isFootwearShop({ category: "Spices & masala" }), false);
  assert.equal(F.isFootwearShop({ category: "Apparel" }), false);
  assert.equal(F.isFootwearShop({ category: "Garments" }), false);
  assert.equal(F.isFootwearShop({ category: "Kids Fashion" }), false);
});

test("Girls and boys type plus colour and size make a bill name", () => {
  assert.equal(F.normalizeWearer("Girls"), "girls");
  assert.equal(F.normalizeWearer("BOYS"), "boys");
  assert.equal(F.wearerLabel("girls"), "Girls");
  assert.equal(
    F.billName({ name: "School shoe", wearer_type: "girls", color: "Black", size: "5" }),
    "School shoe (Girls · Black · Sz 5)",
  );
  assert.equal(F.billName({ name: "Turmeric" }), "Turmeric");
  assert.equal(F.defaultCategory({ category: "Footwear" }), "Footwear");
  assert.equal(F.defaultUnit({ category: "Footwear" }), "PCS");
  assert.equal(F.defaultUnit({ category: "Spices & masala" }), "GM");
});

test("Apparel shops get female/male/kids colour and size, not spice copy", () => {
  assert.equal(F.isApparelShop({ category: "Garments" }), true);
  assert.equal(F.isApparelShop({ category: "Fashion" }), true);
  assert.equal(F.isApparelShop({ category: "Apparel" }), true);
  assert.equal(F.isApparelShop({ category: "Kids Fashion" }), true);
  assert.equal(F.isApparelShop({ category: "Ladies Fashion" }), true);
  assert.equal(F.isApparelShop({ category: "Footwear" }), false);
  assert.equal(F.isApparelShop({ category: "Spices & masala" }), false);
  assert.equal(F.isFootwearShop({ category: "Garments" }), false);
  assert.equal(F.isVariantShop({ category: "Garments" }), true);
  assert.equal(F.isVariantShop({ category: "Footwear" }), true);
  assert.equal(F.isVariantShop({ category: "Spices & masala" }), false);
  assert.equal(F.normalizeWearer("Female"), "female");
  assert.equal(F.normalizeWearer("Male"), "male");
  assert.equal(F.normalizeWearer("Kids"), "kids");
  assert.equal(F.wearerLabel("kids"), "Kids");
  assert.equal(F.defaultCategory({ category: "Garments" }), "Garments");
  assert.equal(F.defaultCategory({ category: "Fashion" }), "Fashion");
  assert.equal(F.defaultUnit({ category: "Garments" }), "PCS");
  assert.equal(F.itemPrefix({ category: "Garments" }), "AP");
  assert.equal(F.itemPrefix({ category: "Footwear" }), "FW");
  assert.equal(F.itemPrefix({ category: "Spices" }), "SP");
  assert.deepEqual(
    F.wearersForShop({ category: "Garments" }).map((w) => w.value),
    ["female", "male", "kids", "unisex"],
  );
  assert.ok(F.sizesForShop({ category: "Garments" }).includes("XL"));
  assert.ok(F.sizesForShop({ category: "Footwear" }).includes("7"));
  assert.equal(
    F.billName({ name: "Kurti", wearer_type: "female", color: "Maroon", size: "M" }),
    "Kurti (Female · Maroon · Sz M)",
  );
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const css = readFileSync(path.join(root, "css/pos.css"), "utf8");
  const php = readFileSync(path.join(root, "pos-php-core.php"), "utf8");
  const crud = readFileSync(path.join(root, "server/crud.js"), "utf8");
  const phpCrud = readFileSync(path.join(root, "pos-crud.php"), "utf8");
  assert.match(app, /function isApparelShop/);
  assert.match(app, /apparel-mode/);
  assert.match(app, /Shirt \/ Kurti \/ Jeans/);
  assert.match(app, /Cotton \/ Silk \/ Denim/);
  assert.match(app, /Select female \/ male \/ kids/);
  assert.match(css, /body:not\(\.footwear-mode\):not\(\.apparel-mode\) \.footwear-only/);
  assert.match(css, /body\.footwear-mode #pack-choice/);
  assert.match(css, /body\.apparel-mode #pack-choice/);
  assert.match(css, /\.nav-btn\[hidden\]/);
  assert.match(php, /function pos_is_apparel_shop/);
  assert.match(php, /function pos_is_variant_shop/);
  assert.match(php, /kids.*return "kids"/);
  assert.match(crud, /isVariantShop/);
  assert.match(crud, /itemPrefix/);
  assert.match(phpCrud, /pos_is_variant_shop/);
  assert.match(phpCrud, /pos_item_code_prefix/);
});

test("Item form and Counter expose colour, size, and girls/boys", () => {
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const login = readFileSync(path.join(root, "login.html"), "utf8");
  const master = readFileSync(path.join(root, "js/master.js"), "utf8");
  assert.match(index, /id="item-wearer"/);
  assert.match(index, /id="item-color"/);
  assert.match(index, /id="item-size"/);
  assert.match(index, /id="wearer-filter"/);
  assert.match(index, /<option value="girls">Girls<\/option>/);
  assert.match(index, /<option value="boys">Boys<\/option>/);
  assert.match(index, /class="footwear-only"/);
  assert.match(login, /<option>Footwear<\/option>/);
  assert.match(master, /"Footwear"/);
  assert.match(app, /looksFootwear && !globalThis.POSFootwear/);
  assert.match(app, /wearer_type/);
  assert.match(app, /fillItemUnitSelect\(\$\("item-unit"\)\?\.value \|\| defaultItemUnit\(\)\)/);
  assert.match(app, /selected \|\| el\.value \|\| defaultItemUnit\(\)/);
  const crud = readFileSync(path.join(root, "server/crud.js"), "utf8");
  assert.match(crud, /wearer_type/);
  assert.match(crud, /POSFootwear\.billName/);
  const php = readFileSync(path.join(root, "pos-crud.php"), "utf8");
  assert.match(crud, /variants\.sizes/);
  assert.match(php, /sizesToCreate/);
  assert.deepEqual(F.parseSizes("6, 7, 8"), ["6", "7", "8"]);
  assert.deepEqual(F.parseSizes(" 5 6 7 "), ["5", "6", "7"]);
  assert.deepEqual(F.parseSizes("7"), ["7"]);
  assert.equal(F.fieldsFromBody({ size: "6,7,8" }).sizes.length, 3);
});

test("Counter has a dedicated scan lane and Pay action", () => {
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const css = readFileSync(path.join(root, "css/pos.css"), "utf8");
  assert.match(index, /id="scan-form"/);
  assert.match(index, /id="scan-code"/);
  assert.match(index, /id="bill-extras"/);
  assert.match(index, />Pay</);
  assert.match(app, /async function applyBarcodeScan/);
  assert.match(app, /function findItemBySkuOrHsn/);
  assert.match(app, /No item matches/);
  assert.match(app, /function focusScanLane/);
  assert.match(index, /class="counter-lane"/);
  assert.match(index, /id="pack-choice"/);
  assert.match(index, /id="pay-method"/);
  assert.match(index, /id="scan-form"[\s\S]*id="pack-choice"[\s\S]*id="pay-method"[\s\S]*id="counter-mobile"[\s\S]*id="customer"/);
  assert.match(css, /counter-row: one line small 2026/);
  assert.doesNotMatch(index, /class="counter-tools"/);
  assert.doesNotMatch(index, /class="customer-picker"/);
  assert.match(index, /id="offer-popup"/);
  assert.match(app, /function showBestOfferPopup/);
  assert.match(css, /\.offer-popup-sheet/);
  assert.match(css, /catalog-empty/);
  assert.match(index, /id="catalog-cats"/);
  assert.match(index, /class="catalog-pane"/);
  assert.match(app, /function renderCatalogCats/);
  assert.match(app, /function itemCategoryLabel/);
  assert.match(css, /counter-cats: category chips/);
  assert.match(app, /Pay \$\{money\(payTotal\)\}/);
  assert.match(css, /\.scan-lane/);
  assert.match(app, /function cartLineKey/);
  assert.match(app, /function isPieceBarcodeLine/);
  assert.match(app, /This piece is already on the bill/);
  assert.match(app, /if \(code\) \{/);
  assert.match(app, /Pay \$\{money\(payTotal\)\}/);
  assert.match(css, /\.scan-lane/);
  assert.match(index, /id="counter-mobile"/);
  assert.match(index, /id="bill-customer"/);
  assert.match(css, /\.ticket-due/);
  assert.match(index, /id="due-row"/);
  assert.match(app, /function paintCounterDue/);
  assert.match(app, /function customerOptionLabel/);
  assert.match(app, /function isWalkInCustomer/);
  assert.match(app, /const due = walkIn \? 0 : customerDue\(cust\);/);
  assert.match(app, /Due \$\{money\(due\)\}/);
  assert.match(app, /function findCustomerByMobile/);
  assert.match(app, /function applyCounterMobile/);
  assert.match(app, /function selectCounterCustomer/);
  assert.match(app, /No customer for this mobile — add with \+ Customer/);
  assert.match(app, /wrap\.open = false/);
  assert.match(index, /id="pack-item-search"/);
  assert.match(index, /class="packs-desk"/);
  assert.match(app, /function paintPackLive/);
  assert.match(css, /packs-desk: composer \+ library/);
});
