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
  assert.match(php, /wearer_type/);
  assert.match(readFileSync(path.join(root, "pos-php-core.php"), "utf8"), /function pos_item_bill_name/);
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
  assert.match(app, /function focusScanLane/);
  assert.match(app, /Pay \$\{money\(payTotal\)\}/);
  assert.match(css, /\.scan-lane/);
});
