import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { cartMatchesCombo, findMatchingCombo, normalizeComboInput } from "./combos.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("combo input needs a name and two different items", () => {
  assert.equal(normalizeComboInput({ name: "Tea + Biscuit" }), null);
  assert.equal(normalizeComboInput({ name: "Tea + Biscuit", item_a_id: "a", item_b_id: "a" }), null);
  const ok = normalizeComboInput({ name: "Tea + Biscuit", itemA: "a", itemB: "b", discountValue: 8 });
  assert.equal(ok.name, "Tea + Biscuit");
  assert.equal(ok.discount_type, "pct");
  assert.equal(ok.discount_value, 8);
});

test("cart matches a combo when both items are on the bill", () => {
  const combo = { item_a_id: "tea", item_b_id: "rice", status: "active" };
  assert.equal(cartMatchesCombo(["tea"], combo), false);
  assert.equal(cartMatchesCombo(["tea", "rice"], combo), true);
  assert.equal(findMatchingCombo(["rice", "tea"], [combo])?.item_a_id, "tea");
});

test("shop UI can create a combo offer from AI Growth", () => {
  const growthUi = readFileSync(path.join(root, "js/growth.js"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const node = readFileSync(path.join(root, "server/index.js"), "utf8");
  const php = readFileSync(path.join(root, "pos-combos.php"), "utf8");
  const till = readFileSync(path.join(root, "pos-php-till.php"), "utf8");
  assert.match(growthUi, /openOffersCreate/);
  assert.match(growthUi, /type: "combo"/);
  assert.match(app, /applyComboOffer/);
  assert.match(node, /createCombo/);
  assert.match(php, /pos_create_combo/);
  assert.match(till, /pos_combos_dispatch/);
});
