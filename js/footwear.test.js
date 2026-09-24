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
    "Services",
    "Salon / spa",
    "Repair",
    "Consultancy",
    "Flex & Printing",
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
    Services: "services",
    "Salon / spa": "services",
    Repair: "services",
    Consultancy: "services",
    "Flex & Printing": "printing",
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
  assert.equal(F.shopKind({ business_type: "Printing Business" }), "printing");
  assert.equal(F.shopKind({ category: "Flex & Printing" }), "printing");
  assert.equal(F.shopKind({ name: "OM Printing Press" }), "printing");
  assert.equal(F.taxCodeLabel({ category: "Spices & masala" }), "HSN");
  assert.equal(F.taxCodeLabel({ category: "Medical" }), "HSN");
  assert.equal(F.taxCodeLabel({ category: "Food & beverage" }), "HSN");
  assert.equal(F.taxCodeLabel({ business_type: "Services" }), "SAC");
  assert.equal(F.taxCodeLabel({ category: "Salon / spa" }), "SAC");
  assert.equal(F.taxCodeFieldLabel({ category: "Kirana / FMCG" }), "HSN code (goods)");
  assert.equal(F.taxCodeFieldLabel({ category: "Consultancy" }), "SAC code (service)");
  assert.match(F.itemFormCopy({ category: "Spices & masala" }).lede, /HSN code \(goods\)/);
  assert.match(F.itemFormCopy({ business_type: "Services" }).lede, /SAC code \(service\)/);
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
  assert.equal(F.defaultUnit({ category: "Flex & Printing" }), "SQFT");
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
  assert.match(xpos, /t === "Footwear"/);
  assert.match(xpos, /t === "Services"/);
  assert.match(master, /Services: \["Services"/);
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
  assert.doesNotMatch(index, /id="bill-pay-more"/);
  assert.doesNotMatch(index, /id="pay-ref"/);
  assert.doesNotMatch(index, /Reference \/ UTR/);
  assert.match(index, />Pay</);
  assert.match(app, /Due \$\{money\(due\)\}/);
  assert.match(app, /async function applyBarcodeScan/);
  assert.match(app, /function findItemBySkuOrHsn/);
  assert.match(app, /No item matches/);
  assert.match(app, /function focusScanLane/);
  assert.match(index, /class="counter-lane"/);
  assert.match(index, /id="counter-add-item"/);
  assert.match(index, /id="classic-add-item"/);
  assert.match(index, /id="set-quick-add-show"/);
  assert.match(app, /function quickAddVisible/);
  assert.match(css, /body\.quick-add-hidden #classic-add-item/);
  assert.match(index, /id="counter-item-modal"/);
  assert.match(index, /Save &amp; add to bill/);
  assert.match(app, /function openCounterAddItem/);
  assert.match(app, /function saveCounterAddItem/);
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
  assert.match(index, /packs-desk/);
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
  assert.match(index, /id="set-drug-licence"/);
  assert.match(index, /id="set-fssai"/);
  assert.match(index, /id="set-ndps"/);
  assert.match(index, /Pharmacy licences/);
  assert.match(index, /FSSAI License \(Food License\) No\./);
  assert.match(index, /NDPS \/ Restricted Drug License No\./);
  assert.match(app, /Pharmacy Name/);
  assert.match(app, /Pharmacy Address/);
  assert.match(app, /Mobile No\./);
  assert.match(app, /drug_licence_no/);
  assert.match(app, /fssai_licence_no/);
  assert.match(app, /ndps_licence_no/);
  assert.match(index, /id="cust-doctor-rx"/);
  assert.match(index, /id="cust-name-lab"/);
  assert.match(index, /id="cust-mobile-lab"/);
  assert.match(app, /Customer Name/);
  assert.match(index, /id="counter-mobile"/);
  assert.doesNotMatch(index, /id="counter-mobile" class="pharmacy-hide"/);
  assert.match(index, /id="bill-cust-mobile"/);
  assert.match(index, /id="bill-cust-address"/);
  assert.match(index, /id="bill-cust-area"/);
  assert.match(index, /id="bill-cust-city"/);
  assert.match(index, /id="bill-cust-pin"/);
  assert.match(index, /id="classic-cust-chip"/);
  assert.match(index, /id="classic-cust-add"/);
  assert.match(index, /id="classic-cust-hits"/);
  assert.match(app, /function parseClassicAddress/);
  assert.match(app, /function findCustomersByName/);
  assert.match(app, /function paintClassicCustomerStatus/);
  assert.match(app, /function resetClassicCustomerRecord/);
  assert.match(app, /function classicCustomerRecordDirty/);
  assert.match(app, /resetClassicCustomerRecord\(\)/);
  assert.match(app, /Bill and customer record cleared/);
  assert.match(app, /function addClassicBillCustomer/);
  assert.match(app, /\$\("bill-cust-mobile"\)\?\.value \|\| \$\("counter-mobile"\)/);
  assert.match(css, /\.classic-cust-toolbar/);
  assert.match(css, /\.classic-cust-chip/);
  assert.match(index, /id="classic-bill-date"/);
  assert.match(index, /classic-bill-date-lab/);
  assert.match(app, /function classicDateOnly/);
  assert.match(css, /garment-counter-2026/);
  assert.doesNotMatch(app, /getFullYear\(\)} \$\{pad\(now\.getHours/);
  assert.match(index, /id="classic-bill-entry"/);
  assert.match(index, /id="classic-item-hits"/);
  assert.match(index, /id="bill-item-search"/);
  assert.match(index, /id="classic-loyalty-balance"/);
  assert.match(css, /body\.classic-bill-mode\.counter-mode \.catalog-pane/);
  assert.match(app, /function paintClassicItemHits/);
  assert.match(app, /function paintClassicLoyalty/);
  assert.match(app, /function resolveClassicBillCustomerId/);
  assert.match(app, /pts available/);
  assert.match(index, /class="classic-disc-row"/);
  assert.match(index, /class="classic-loyalty-bar"/);
  assert.match(index, /classic-bill-whole-disc/);
  assert.match(css, /\.classic-disc-row/);
  assert.match(css, /classic-bill-whole-disc/);
  assert.match(css, /\.classic-barcode/);
  assert.match(index, /classic-bill-whole-disc">Discount/);
  assert.match(index, /loyalty-redeem-wrap">Royalty Points/);
  assert.match(css, /classic-bill-whole-disc \{\s*display: flex !important;/);
  assert.doesNotMatch(css, /classic-bill-whole-disc \{\s*display: none !important;/);
  assert.match(app, /if \(!item\) item = findItemByBarcode\(code\);/);
  assert.match(app, /function classicLineDiscHtml/);
  assert.match(app, /function canClassicLineDiscount/);
  assert.match(app, /function detachClassicUnknownCustomer/);
  assert.match(app, /pharmacyCount/);
  assert.match(app, /isRealMobile\(typedMob\) && !byMob/);
  assert.match(app, /<th>Disc<\/th>/);
  assert.match(app, /<th>Barcode<\/th>/);
  assert.match(app, /class="classic-barcode"/);
  assert.match(app, /function lineBarcodeText/);
  assert.match(app, /function clampLoyaltyRedeem/);
  assert.match(app, /if \(walk \|\| pts <= 0\) want = 0;/);
  assert.match(app, /else if \(want > pts\) want = pts;/);
  assert.match(app, /classic-barcode/);
  assert.match(app, /discountType: state\.billDiscountType \|\| "amt"/);
  assert.match(app, /discountValue: state\.billDiscountValue/);
  assert.match(app, /function itemStockInfo/);
  assert.match(app, /function shouldCapBillStock/);
  assert.match(app, /function clampBillQty/);
  assert.match(app, /function assertCartWithinStock/);
  assert.match(app, /function clampCartToAvailableStock/);
  assert.match(app, /only \$\{have\} \$\{unit\} in stock/);
  assert.match(app, /assertCartWithinStock\(\)/);
  assert.match(app, /function itemExpiryInfo/);
  assert.match(app, /function paintClassicStockAlert/);
  assert.match(index, /id="classic-stock-alert"/);
  assert.match(app, /<th class="pharm-n">Stock<\/th>/);
  assert.match(index, /id="bill-scan-code"/);
  assert.match(index, /id="bill-scan-camera-btn"/);
  assert.match(index, /id="bill-scan-qty"/);
  assert.match(index, /id="bill-doctor-rx"/);
  assert.match(index, /classic-span-3/);
  assert.match(css, /\.combo-banner\[hidden\]/);
  assert.match(app, /classList\.toggle\("is-empty"/);
  assert.match(css, /body\.classic-bill-mode \.lines\.is-empty/);
  assert.match(css, /min-height: 280px/);
  assert.match(app, /data-del-line/);
  assert.match(app, /isClassicBillShop\(\)/);
  assert.match(css, /#pharm-bill-cust,\s*\.pharm-bill-cust \{\s*display: none !important;/);
  assert.match(app, /function classicScanAddQty/);
  assert.match(app, /bill-scan-camera-btn/);
  assert.match(css, /body\.classic-bill-mode/);
  assert.match(index, /data-view="returns"/);
  assert.match(index, /id="view-returns"/);
  assert.match(app, /function saveReturn/);
  assert.match(app, /function loadReturnsView/);
  assert.match(css, /\.returns-desk/);
  assert.match(app, /classic-bill-mode/);
  assert.match(app, /isApparelShop\(\)/);
  assert.match(app, /Save Bill/);
  assert.match(app, /pharmCust\.hidden = true/);
  assert.match(app, /rx-cust-line/);
  assert.doesNotMatch(index, /pharm-bill-cust pharmacy-only/);
  assert.match(index, /Doctor Name \/ Prescription No\./);
  assert.match(app, /pharm-bill-table/);
  assert.match(app, /doctor_rx/);
  assert.equal(F.medicinePackLabel({ pack_size: "10", pack_unit: "Tab" }), "10 Tab");
  assert.equal(F.formatExpiryShort("2027-09-30"), "09/27");
  const dolo = {
    name: "Dolo 650",
    medicine_type: "Tablet",
    pack_unit: "Strip",
    pack_size: "10 Tablets",
    units_per_pack: 10,
    retail_rate: 20,
    mrp: 20,
    purchase_rate: 10,
    unit: "PCS",
  };
  assert.equal(F.isStripLooseItem(dolo), true);
  assert.equal(F.unitsPerPack(dolo), 10);
  assert.equal(F.looseSaleRate(dolo), 2);
  assert.equal(F.looseMrp(dolo), 2);
  assert.equal(F.packStockQty(dolo, 2), 0.2);
  assert.equal(F.scanPackQty(dolo), 10);
  assert.equal(F.medicinePackLabel(dolo), "Strip · 10 Tablet");
  assert.equal(F.unitsPerPack({ pack_unit: "Strip", medicine_type: "Tablet", units_per_pack: 1 }), 10);
  const preview = F.cartBatchPreview({ ...dolo, batch_no: "DLO01", default_expiry: "2027-09-30" });
  assert.equal(preview.batchNo, "DLO01");
  assert.equal(preview.expiry, "09/27");
  assert.match(app, /function rateFor/);
  assert.match(app, /looseSaleRate/);
  assert.match(app, /cartBatchPreview/);
  assert.match(app, /pieceBarcodeQty/);
  assert.match(css, /body:not\(\.pharmacy-mode\) \.pharmacy-only/);
  assert.match(css, /items-pharm-table/);
  assert.match(index, /id="item-import-copy"/);
  assert.match(index, /id="item-composer-note"/);
  assert.match(app, /items-pharm-table/);
  assert.equal(F.itemFormCopy({ category: "Medical" }).lede, "Generic, type, pack, batch, expiry, rates, and stock.");
  assert.match(F.itemFormCopy({ category: "Medical" }).importCopy, /Excel/);
  assert.equal(F.qrOrderingEnabled({ category: "Medical" }), false);
  assert.equal(F.qrOrderingEnabled({ category: "Spices & masala" }), true);
  assert.match(index, /data-view="qr-orders"/);
  assert.match(index, /nav-btn pharmacy-hide[^>]*data-view="qr-orders"/);
  assert.match(index, /data-view="prescriptions"/);
  assert.match(app, /view === "qr-orders" && isPharmacyShop\(\)/);
  assert.match(app, /function loadPrescriptions/);
  assert.match(app, /function pharmacyStockCards/);
  assert.match(app, /function stockExpiryYmd/);
  assert.match(app, /function paintStockExpiryCell/);
  assert.match(app, /\/api\/batches\?on_hand=1/);
  assert.match(app, /stock-batch-table/);
  assert.match(app, /<th>Expiry Date<\/th>/);
  assert.match(index, /On-hand by batch number and expiry date/);
  assert.match(index, /Excel with every field: SKU, batch no, expiry/);
  assert.match(adv, /savePharmacyItemFields/);
  assert.match(adv, /req.query.on_hand/);
  assert.match(adv, /LIMIT 10000/);
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
