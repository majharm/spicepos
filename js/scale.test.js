import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import "./scale.js";

const S = globalThis.POSScale;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("scale parser reads kg, grams, and common till protocols", () => {
  assert.equal(S.kgToGrams(1.25), 1250);
  assert.equal(S.parseWeight("1.250 kg").grams, 1250);
  assert.equal(S.parseWeight("ST,GS,+  1.250kg").grams, 1250);
  assert.equal(S.parseWeight("ST,+001.250  kg").grams, 1250);
  assert.equal(S.parseWeight("1250 g").grams, 1250);
  assert.equal(S.parseWeight("1,250 kg").grams, 1250);
  assert.equal(S.parseWeight("1.250").grams, 1250);
  assert.equal(S.parseWeight("WT:0.500KG").grams, 500);
  assert.ok(S.looksLikeWeight("1.250 kg"));
  assert.equal(S.looksLikeWeight("8901234567890"), false);
  assert.equal(S.parseWeight("OL"), null);
});

test("Tomato at ₹40/kg uses scale kg as bill grams then amount", () => {
  const hit = S.parseWeight("Scale Weight: 1.250 KG");
  assert.equal(hit.grams, 1250);
  const amount = (hit.grams / 1000) * 40;
  assert.equal(amount, 50);
});

test("POS shell wires a Counter scale dock and USB / Bluetooth helpers", () => {
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const css = readFileSync(path.join(root, "css/pos.css"), "utf8");
  assert.match(index, /id="scale-dock"/);
  assert.match(index, /id="scale-ble"/);
  assert.match(index, /js\/scale\.js\?v=/);
  assert.match(app, /function initWeighingScale/);
  assert.match(app, /POSScale/);
  assert.match(app, /applyScaleWeight/);
  assert.match(css, /scale-dock: live kg 2026/);
  assert.match(S.hasSerial.toString() + S.connectSerial.toString(), /serial/);
  assert.match(S.connectBluetooth.toString(), /bluetooth/);
});
