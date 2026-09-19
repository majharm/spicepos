import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("Cafe Counter shell is menu-style and skipped for pharmacy and garment", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const css = read("css/pos.css");

  assert.match(index, /id="cafe-cats-wrap"/);
  assert.match(index, /Choose Category/);
  assert.match(index, /id="cafe-menu-bar"/);
  assert.match(index, /id="cafe-menu-title"/);
  assert.match(index, /id="cafe-pay-methods"/);
  assert.match(index, /id="ticket-title"/);
  assert.match(index, /pos\.css\?v=20260919cafe1/);
  assert.match(index, /app\.js\?v=20260919cafe1/);

  assert.match(app, /function isCafeCounterShop\(\)/);
  assert.match(app, /return !isClassicBillShop\(\)/);
  assert.match(app, /classList\.toggle\("cafe-counter-mode", isCafeCounterShop\(\)\)/);
  assert.match(app, /isClassicBillShop\(\) \? "Sales Bill" : isCafeCounterShop\(\) \? "Bills"/);
  assert.match(app, /Add to Billing/);
  assert.match(app, /function catalogCategoryGlyph/);
  assert.match(app, /function paintCafePayMethods/);
  assert.match(app, /data-cafe-pay/);
  assert.match(app, /Payment Method/);
  assert.match(app, /Search menu/);
  assert.match(app, /isPharmacyShop\(\) \|\| isApparelShop\(\)/);

  assert.match(css, /cafe-counter: menu POS 2026/);
  assert.match(css, /body\.cafe-counter-mode\.counter-mode/);
  assert.match(css, /body\.classic-bill-mode \.cafe-pay-methods/);
  assert.match(css, /#ff4f87/);
  assert.doesNotMatch(app, /function isCafeCounterShop\(\) \{\s*return isRestaurantShop/);
});
