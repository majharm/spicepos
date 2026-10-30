import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
vm.runInThisContext(read("js/tax-master.js"), { filename: "js/tax-master.js" });
const T = globalThis.POSTaxes;

test("GST slabs split into CGST, SGST, and IGST", () => {
  assert.deepEqual(T.splitTax("gst", 5), { tax_type: "gst", rate: 5, cgst_rate: 2.5, sgst_rate: 2.5, igst_rate: 5 });
  assert.deepEqual(T.splitTax("gst", 18), { tax_type: "gst", rate: 18, cgst_rate: 9, sgst_rate: 9, igst_rate: 18 });
  assert.deepEqual(T.splitTax("igst", 12), { tax_type: "igst", rate: 12, cgst_rate: 0, sgst_rate: 0, igst_rate: 12 });
  assert.deepEqual(T.splitTax("exempt", 18), { tax_type: "exempt", rate: 0, cgst_rate: 0, sgst_rate: 0, igst_rate: 0 });
  assert.match(T.splitText({ tax_type: "gst", rate: 28 }), /CGST 14% \+ SGST 14% · IGST 28%/);
  assert.ok(T.DEFAULTS.some((row) => row.code === "GST18" && row.rate === 18));
  assert.ok(T.DEFAULTS.some((row) => row.code === "EXEMPT"));
});

test("Tax master is on the product menu and saves through PHP and Node", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const php = read("pos-taxes.php");
  assert.match(index, /data-view="taxes"/);
  assert.match(index, /id="view-taxes"/);
  assert.match(index, /id="tax-form"/);
  assert.match(index, /id="item-gst"/);
  assert.match(index, /tax-master\.js\?v=20261030tax1/);
  assert.match(index, /tax-master\.css\?v=20261030tax2/);
  assert.match(app, /tab === "taxes"|name === "taxes"/);
  assert.match(app, /\/api\/taxes/);
  assert.match(app, /function fillTaxSelect/);
  assert.match(app, /function loadItemTaxes/);
  assert.match(app, /function itemTaxLabel/);
  assert.match(index, /id="item-tax-note"/);
  assert.match(index, /id="ci-gst"/);
  assert.match(read("js/biz-hub.js"), /view: "taxes"/);
  assert.match(php, /CREATE TABLE IF NOT EXISTS tax_rates/);
  assert.match(php, /function pos_dispatch_taxes/);
  assert.match(read("pos-php-till.php"), /pos_list_taxes/);
  assert.match(read("pos-php-core.php"), /pos_dispatch_taxes/);
  assert.match(read("server/taxes.js"), /app\.post\("\/api\/taxes"/);
  assert.match(read("server/taxes.js"), /app\.delete\("\/api\/taxes\/:id"/);
  assert.match(read("server/index.js"), /registerTaxes\(app\)/);
  assert.match(read("server/index.js"), /ensureTaxRates\(businessId\)/);
  const post = php.slice(php.indexOf('if ($path === "taxes" && $method === "POST")'), php.indexOf("if (preg_match('#^taxes/"));
  assert.match(post, /VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?\)/);
  assert.match(post, /"sssssddddssi"/);
});
