import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("Customer prescription page uses camera, gallery, and PDF pickers", () => {
  const html = read("rx.html");
  assert.match(html, /capture="environment"/);
  assert.match(html, /accept="application\/pdf"/);
  assert.match(html, /Add Note \/ Message/);
  assert.doesNotMatch(html, /textarea name="notes".*Less spicy/);
});
