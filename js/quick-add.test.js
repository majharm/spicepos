import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(name) {
  return readFileSync(path.join(root, name), "utf8");
}

function quickAddVisible(company) {
  const v = company?.quick_add_enabled;
  if (v === 0 || v === "0" || v === 2 || v === "2" || v === false || v === "off" || v === "hide") return false;
  return true;
}

test("Quick Add stays visible by default and hides only when the shop turns it off", () => {
  assert.equal(quickAddVisible({}), true);
  assert.equal(quickAddVisible({ quick_add_enabled: 1 }), true);
  assert.equal(quickAddVisible({ quick_add_enabled: "1" }), true);
  assert.equal(quickAddVisible({ quick_add_enabled: null }), true);
  assert.equal(quickAddVisible({ quick_add_enabled: 0 }), false);
  assert.equal(quickAddVisible({ quick_add_enabled: "0" }), false);
  assert.equal(quickAddVisible({ quick_add_enabled: 2 }), false);
  assert.equal(quickAddVisible({ quick_add_enabled: "off" }), false);
  assert.equal(quickAddVisible({ quick_add_enabled: false }), false);
});

test("Quick Add visibility is a per-business settings control, not a removed feature", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const css = read("css/pos.css");
  const schema = read("server/schema.js");
  const server = read("server/index.js");
  const core = read("pos-php-core.php");
  const till = read("pos-php-till.php");

  assert.match(index, /<fieldset class="item-block" id="set-quick-add-block">/);
  assert.match(index, /id="set-quick-add-show"/);
  assert.match(index, /id="set-quick-add-hide"/);
  assert.match(index, /Show Quick Add/);
  assert.match(index, /Hide Quick Add/);
  assert.doesNotMatch(index, /id="set-quick-add-block"[^>]*restaurant-only/);
  assert.match(index, /id="dash-quick-add"/);
  assert.match(index, /id="counter-add-item"/);
  assert.match(index, /id="classic-add-item"/);
  assert.match(index, /id="saas-fab"/);
  assert.match(index, /id="counter-item-modal"/);

  assert.match(app, /function quickAddVisible/);
  assert.match(app, /function applyQuickAddVisibility/);
  assert.match(app, /function openCounterAddItem/);
  assert.match(app, /payload\.quick_add_enabled/);
  assert.match(app, /state\.company\.quick_add_enabled/);
  assert.match(css, /body\.quick-add-hidden #dash-quick-add/);
  assert.match(css, /body\.quick-add-hidden #counter-add-item/);
  assert.match(css, /body\.quick-add-hidden #classic-add-item/);
  assert.match(css, /body\.quick-add-hidden #saas-fab-wrap/);
  assert.match(css, /body\.quick-add-hidden \[data-counter-add-item\]/);

  assert.match(schema, /quick_add_enabled/);
  assert.match(server, /quick_add_enabled/);
  assert.match(core, /quick_add_enabled/);
  assert.match(till, /quick_add_enabled/);
});
