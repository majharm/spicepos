import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("camera scan module exposes mobile scanner helpers", () => {
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const mod = readFileSync(path.join(root, "js/camera-scan.js"), "utf8");
  const css = readFileSync(path.join(root, "css/pos.css"), "utf8");
  assert.match(index, /id="scan-camera-btn"/);
  assert.match(index, /js\/camera-scan\.js/);
  assert.match(mod, /POSCameraScan/);
  assert.match(mod, /BarcodeDetector/);
  assert.match(mod, /getUserMedia/);
  assert.match(app, /initCameraScan/);
  assert.match(app, /POSCameraScan/);
  assert.match(css, /\.camera-scan-modal/);
  assert.match(css, /\.scan-camera-btn/);
  assert.equal((index.match(/id="scan-form"/g) || []).length, 1);
  assert.equal((index.match(/id="scan-code"/g) || []).length, 1);
  assert.equal((index.match(/id="search-form"/g) || []).length, 1);
});
