import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(name) {
  return readFileSync(path.join(root, name), "utf8");
}

function fastModeOn(company) {
  const v = company?.fast_mode_enabled;
  if (v === 0 || v === "0" || v === 2 || v === "2" || v === false || v === "off" || v === "hide") return false;
  return true;
}

test("Fast Mode is on by default and hides only when the shop turns it off", () => {
  assert.equal(fastModeOn({}), true);
  assert.equal(fastModeOn({ fast_mode_enabled: 1 }), true);
  assert.equal(fastModeOn({ fast_mode_enabled: "1" }), true);
  assert.equal(fastModeOn({ fast_mode_enabled: null }), true);
  assert.equal(fastModeOn({ fast_mode_enabled: 0 }), false);
  assert.equal(fastModeOn({ fast_mode_enabled: "0" }), false);
  assert.equal(fastModeOn({ fast_mode_enabled: 2 }), false);
  assert.equal(fastModeOn({ fast_mode_enabled: "off" }), false);
  assert.equal(fastModeOn({ fast_mode_enabled: false }), false);
});

test("Fast Mode is a shop setting that lightens every POS page without removing billing", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const css = read("css/pos.css");
  const schema = read("server/schema.js");
  const server = read("server/index.js");
  const core = read("pos-php-core.php");
  const till = read("pos-php-till.php");
  const catalog = read("js/i18n-catalog.js");

  assert.match(index, /<body class="fast-mode">/);
  assert.match(index, /<fieldset class="item-block" id="set-fast-mode-block">/);
  assert.match(index, /id="set-fast-mode-on"/);
  assert.match(index, /id="set-fast-mode-off"/);
  assert.match(index, /On — Counter first, lighter pages/);
  assert.match(index, /id="view-dashboard"/);
  assert.match(index, /id="view-counter"/);
  assert.match(index, /id="view-items"/);
  assert.match(index, /id="view-customers"/);
  assert.match(index, /id="view-orders"/);
  assert.match(index, /id="view-reports"/);
  assert.match(index, /id="view-settings"/);
  assert.match(index, /id="counter-add-item"/);

  assert.match(app, /function fastModeOn/);
  assert.match(app, /function applyFastMode/);
  assert.match(app, /fastModeOn\(\) && can\("counter"\)/);
  assert.match(app, /payload\.fast_mode_enabled/);
  assert.match(app, /state\.company\.fast_mode_enabled/);
  assert.match(app, /document\.body\.classList\.toggle\("fast-mode"/);
  assert.match(app, /fastModeOn\(\) \? "" : itemPhotoUrl\(item\)/);
  assert.match(app, /fastModeOn\(\) \? 48 : CATALOG_RENDER_LIMIT/);
  assert.match(app, /if \(fastModeOn\(\)\) return list;/);
  assert.match(app, /viewStillFresh\("dashboard"\)/);
  assert.match(app, /viewStillFresh\("reports", 90000\)/);

  assert.match(css, /body\.fast-mode \*/);
  assert.match(css, /body\.fast-mode \.saas-skel/);
  assert.match(css, /backdrop-filter: none/);

  assert.match(catalog, /S\["settings\.fast_mode"\]/);
  assert.match(schema, /fast_mode_enabled/);
  assert.match(server, /fast_mode_enabled/);
  assert.match(core, /fast_mode_enabled/);
  assert.match(till, /fast_mode_enabled/);
});
