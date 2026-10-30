import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("Suppliers desk is searchable on phone and updates the same vendor", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const css = read("css/supplier-master.css");
  const crud = read("server/crud.js");
  const php = read("pos-crud.php");
  const view = index.slice(index.indexOf('id="view-suppliers"'), index.indexOf('id="view-barcodes"'));

  assert.match(view, /class="items-desk suppliers-desk"/);
  assert.match(view, /id="suppliers-hero-stats"/);
  assert.match(view, /id="suppliers-search"/);
  assert.match(view, /id="suppliers-due-only"/);
  assert.match(view, /id="sup-id"/);
  assert.match(view, /id="sup-clear"/);
  assert.match(view, /id="sup-use-match"/);
  assert.match(view, /data-view-jump="accounts"/);
  assert.match(view, /data-acc-jump="payables"/);
  assert.match(index, /css\/supplier-master\.css\?v=20261030sup1/);
  assert.match(index, /app\.js\?v=20261030sup1/);

  assert.match(app, /function findSupplierMatch/);
  assert.match(app, /function renderSuppliersList/);
  assert.match(app, /data-sup-edit/);
  assert.match(app, /data-sup-pay/);
  assert.match(app, /method: id \? "PUT" : "POST"/);
  assert.match(app, /\/api\/suppliers\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(app, /No suppliers match\./);

  assert.match(css, /\.supplier-card/);
  assert.match(css, /max-width: 980px/);
  assert.match(css, /order: -1/);
  assert.match(css, /position: sticky/);

  assert.match(crud, /function supplierWriteFields/);
  assert.match(crud, /app\.put\("\/api\/suppliers\/:id"/);
  assert.match(crud, /Enter a valid email address/);
  assert.match(php, /function pos_supplier_write_fields/);
  assert.match(php, /suppliers\/\(\[A-Za-z0-9-\]\+\)/);
  assert.match(php, /UPDATE suppliers SET name/);
});
