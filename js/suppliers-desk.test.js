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
  const core = read("pos-php-core.php");
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
  assert.match(index, /css\/supplier-master\.css\?v=20261030sup2/);
  assert.match(index, /app\.js\?v=20261031auto3/);
  assert.match(view, /id="sup-contact"/);
  assert.match(view, /Contact person/);
  assert.match(view, /id="sup-city"/);
  assert.match(view, /id="sup-district"/);
  assert.match(view, /id="sup-state"/);
  assert.match(view, /id="sup-type"/);
  assert.match(view, /Maharashtra/);

  assert.match(app, /function findSupplierMatch/);
  assert.match(app, /function renderSuppliersList/);
  assert.match(app, /function supplierPlace/);
  assert.match(app, /supplier_type/);
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
  assert.match(crud, /supplier_type/);
  assert.match(crud, /city/);
  assert.match(php, /function pos_supplier_write_fields/);
  assert.match(php, /supplier_type/);
  assert.match(core, /function pos_ensure_supplier_profile_columns/);
  assert.match(read("scripts/base-schema.sql"), /supplier_type VARCHAR\(32\) NULL/);
  assert.match(php, /suppliers\/\(\[A-Za-z0-9-\]\+\)/);
  assert.match(php, /UPDATE suppliers SET name/);
});
