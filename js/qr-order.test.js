import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("QR food order collects a special instruction on each cart line", () => {
  const html = read("order.html");
  const js = read("js/qr-order.js");
  assert.doesNotMatch(html, /textarea name="notes"/);
  assert.match(js, /Add Special Instruction/);
  assert.match(js, /data-note-open/);
  assert.match(js, /notes: clipNote\(cartNote\(item_id\)\)/);
});

test("Counter restaurant cart and QR desk show item-wise instructions", () => {
  const app = read("js/app.js");
  assert.match(app, /function restaurantLineNoteHtml/);
  assert.match(app, /Add Special Instruction/);
  assert.match(app, /qr-line-si/);
  assert.match(app, /notes: String\(l\.notes \|\| ""\)\.trim\(\)/);
});
