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
  const fwJs = readFileSync(path.join(root, "js/footwear.js"), "utf8");
  assert.match(app, /function isApparelShop/);
  assert.match(app, /apparel-mode/);
  assert.match(fwJs, /Shirt \/ Kurti \/ Jeans/);
  assert.match(fwJs, /Cotton \/ Silk \/ Denim/);
  assert.match(app, /Select female \/ male \/ kids/);
  assert.match(fwJs, /कुर्ती \/ कुर्ता \/ Kurti/);
  assert.match(css, /body:not\(\.footwear-mode\):not\(\.apparel-mode\) \.footwear-only/);
  assert.match(css, /body\.footwear-mode #pack-choice/);
  assert.match(css, /body\.apparel-mode #pack-choice/);
  assert.match(css, /\.nav-btn\[hidden\]/);
  assert.match(php, /function pos_is_apparel_shop/);
  assert.match(php, /function pos_is_variant_shop/);
  assert.match(php, /kids.*return "kids"/);
  assert.match(crud, /isVariantShop/);
  assert.match(crud, /seedPharmacyDemoItems/);
  assert.match(phpCrud, /items\/demo-seed/);
  assert.match(crud, /itemPrefix/);
  assert.match(phpCrud, /pos_is_variant_shop/);
  assert.match(phpCrud, /pos_item_code_prefix/);
});

test("Every signup category gets its own item copy, not Whole Spices", () => {
  const cats = [
    "Spices & masala",
    "Kirana / FMCG",
    "Supermarket",
    "Apparel",
    "Garments",
    "Clothing",
    "Boutique",
    "Saree Shop",
    "Ladies Fashion",
    "Mens Fashion",
    "Kids Fashion",
    "Footwear",
    "Mobile & electronics",
    "Food & beverage",
    "Hardware",
    "Jewellery",
    "Medical",
    "General trade",
    "Other",
  ];
  const kinds = {
    "Spices & masala": "spice",
    "Kirana / FMCG": "grocery",
    Supermarket: "grocery",
    Apparel: "apparel",
    Garments: "apparel",
    Clothing: "apparel",
    Boutique: "apparel",
    "Saree Shop": "apparel",
    "Ladies Fashion": "apparel",
    "Mens Fashion": "apparel",
    "Kids Fashion": "apparel",
    Footwear: "footwear",
    "Mobile & electronics": "electronics",
    "Food & beverage": "restaurant",
    Hardware: "hardware",
    Jewellery: "jewellery",
    Medical: "pharmacy",
    "General trade": "grocery",
    Other: "general",
  };
  for (const cat of cats) {
    assert.equal(F.shopKind({ category: cat }), kinds[cat], cat);
  }
  assert.equal(F.shopKind({ business_type: "Restaurant" }), "restaurant");
  assert.equal(F.isRestaurantShop({ business_type: "Restaurant" }), true);
  assert.equal(F.isRestaurantShop({ category: "Kirana / FMCG" }), false);
  assert.equal(F.shopKind({ business_type: "Restaurant", category: "Spices & masala" }), "restaurant");
  assert.equal(F.isRestaurantShop({ business_type: "Restaurant", category: "Spices & masala" }), true);
  assert.equal(F.shopKind({ business_type: "Pharmacy" }), "pharmacy");
  assert.equal(F.shopKind({ business_type: "Electronics" }), "electronics");
  assert.equal(F.shopKind({ business_type: "Grocery" }), "grocery");
  assert.equal(F.shopKind({ business_type: "Services" }), "services");
  assert.equal(F.defaultCategory({ category: "Spices & masala" }), "Whole Spices");
  assert.equal(F.defaultCategory({ category: "Kirana / FMCG" }), "Kirana / FMCG");
  assert.equal(F.defaultCategory({ category: "Jewellery" }), "Jewellery");
  assert.equal(F.defaultCategory({ category: "Medical" }), "Medical");
  assert.equal(F.defaultCategory({ category: "Other" }), "General");
  assert.equal(F.defaultCategory({ category: "Food & beverage" }), "Menu");
  assert.equal(F.defaultCategory({ business_type: "Restaurant", category: "Spices & masala" }), "Menu");
  assert.deepEqual(F.suggestedItemCategories({ category: "Food & beverage" }).slice(0, 3), ["South Indian", "North Indian", "Chinese"]);
  assert.equal(F.defaultUnit({ category: "Spices & masala" }), "GM");
  assert.equal(F.defaultUnit({ category: "Kirana / FMCG" }), "GM");
  assert.equal(F.defaultUnit({ category: "Jewellery" }), "PCS");
  assert.equal(F.defaultUnit({ category: "Medical" }), "PCS");
  assert.equal(F.defaultUnit({ category: "Food & beverage" }), "PCS");
  assert.equal(F.itemPrefix({ category: "Kirana / FMCG" }), "GR");
  assert.equal(F.itemPrefix({ category: "Jewellery" }), "JW");
  assert.equal(F.itemPrefix({ category: "Medical" }), "PH");
  assert.equal(F.itemPrefix({ category: "Other" }), "IT");
  assert.equal(F.itemFormCopy({ category: "Kirana / FMCG" }).category, "Staples / Snacks");
  assert.equal(F.itemFormCopy({ category: "Jewellery" }).name, "Gold chain");
  assert.equal(F.itemFormCopy({ category: "Medical" }).name, "Paracetamol 500mg");
  assert.equal(F.itemFormCopy({ category: "Medical" }).localNameLab, "Generic Name");
  assert.equal(F.itemFormCopy({ category: "Medical" }).category, "Medical");
  assert.equal(F.isPharmacyShop({ category: "Medical" }), true);
  assert.equal(F.isPharmacyShop({ category: "ABC MEDICAL" }), true);
  assert.ok(F.suggestedItemCategories({ category: "Medical" }).includes("Medical"));
  assert.equal(F.itemFormCopy({ category: "Spices & masala" }).name, "Turmeric powder");
  assert.notEqual(F.itemFormCopy({ category: "Kirana / FMCG" }).name, "Turmeric powder");
  assert.notEqual(F.itemFormCopy({ category: "Hardware" }).localName, "चावल / तांदूळ / Rice");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const php = readFileSync(path.join(root, "pos-php-core.php"), "utf8");
  assert.match(app, /function isSpiceShop/);
  assert.match(app, /itemFormCopy/);
  assert.match(app, /spice-mode/);
  assert.match(php, /function pos_shop_kind/);
  assert.match(php, /function pos_is_spice_shop/);
  assert.match(php, /\$type === "restaurant"/);
  assert.match(php, /if \(\$kind === "restaurant"\) return "Menu"/);
  assert.match(app, /suggestedItemCategories/);
  const master = readFileSync(path.join(root, "js/master.js"), "utf8");
  const xpos = readFileSync(path.join(root, "js/x-pos-20260830e.js"), "utf8");
  assert.match(master, /BIZ_CATEGORIES_FOR_TYPE/);
  assert.match(master, /function fillCategorySelect/);
  assert.match(xpos, /function fillSignupCategory/);
  assert.match(xpos, /t === "Restaurant" \|\| t === "Cafe" \|\| t === "Bakery"/);
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
  assert.match(app, /POSUnits\.qtySuffix\(unitCode\)/);
  assert.match(app, /POSUnits\.displayQty\(line\.qtyGm, unitCode\)/);
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

test("Medical shops show pharmacy medicine fields on the item form", () => {
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const css = readFileSync(path.join(root, "css/pos.css"), "utf8");
  const adv = readFileSync(path.join(root, "server/advanced.js"), "utf8");
  assert.match(index, /id="item-type"/);
  assert.match(index, /id="item-mfr"/);
  assert.match(index, /id="item-pack-size"/);
  assert.match(index, /id="item-pack-unit"/);
  assert.match(index, /id="item-upp"/);
  assert.match(index, /id="item-batch-no"/);
  assert.match(index, /id="item-expiry"/);
  assert.match(index, /id="item-reorder"/);
  assert.match(index, /id="item-own-barcode"/);
  assert.match(index, /Company \/ Manufacturer/);
  assert.match(index, /Items per Pack\/Strip/);
  assert.match(app, /function isPharmacyShop/);
  assert.match(app, /pharmacy-mode/);
  assert.match(app, /\/api\/items\/demo-seed/);
  assert.match(app, /Add demo medicines/);
  assert.match(css, /body:not\(\.pharmacy-mode\) \.pharmacy-only/);
  assert.match(adv, /savePharmacyItemFields/);
  const demo = F.demoItems({ category: "Medical" });
  assert.equal(demo.length, 8);
  assert.equal(demo[0].name, "Paracetamol 500mg");
  assert.equal(F.demoItems({ category: "Spices & masala" }).length, 0);
});

test("Items catalog has Active and Inactive status buttons", () => {
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const css = readFileSync(path.join(root, "css/pos.css"), "utf8");
  assert.match(index, /data-set-item-status="active"/);
  assert.match(index, /data-set-item-status="inactive"/);
  assert.match(index, /id="item-hide-inactive"/);
  assert.match(app, /function paintItemStatus/);
  assert.match(app, /function itemWriteBody/);
  assert.match(app, /data-toggle-item/);
  assert.match(app, /status: itemStatusOf\(\$\("item-status"\)\?\.value\)/);
  assert.match(css, /item-status: active inactive buttons 2026/);
});
