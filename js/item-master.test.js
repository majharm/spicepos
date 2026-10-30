import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

globalThis.document = {
  readyState: "complete",
  getElementById: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
};
globalThis.window = globalThis;
vm.runInThisContext(read("js/item-master.js"), { filename: "js/item-master.js" });
const M = globalThis.POSItemMaster;

test("brand keys collapse case and spaces for every shop kind", () => {
  assert.equal(M.normalizeBrandName("  Tata  Salt  "), "Tata  Salt");
  assert.equal(M.brandKey(" Tata  Salt "), "tata salt");
  assert.equal(M.sameBrand("MDH", "mdh"), true);
  assert.equal(M.sameBrand("Bata", "Local"), false);
  assert.equal(M.itemBrandName({ brand: "Cipla" }), "Cipla");
  assert.equal(M.itemBrandName({ name: "Dolo" }), "");
});

test("collectBrands merges item, liquor, and master rows", () => {
  const rows = M.collectBrands({
    brands: [{ id: "b1", name: "Bata", company: "Bata India", status: "active" }],
    items: [
      { brand: "Bata", brand_id: "b1" },
      { brand: "Local" },
      { name: "No brand" },
    ],
    barProducts: [{ brand: "Johnnie Walker" }, { brand: "Bata" }],
  });
  assert.equal(rows.length, 3);
  const bata = rows.find((b) => b.name === "Bata");
  assert.equal(bata.item_count, 2);
  assert.equal(bata.company, "Bata India");
  assert.ok(rows.some((b) => b.name === "Johnnie Walker"));
  assert.equal(M.itemMatchesBrand({ brand: "Bata" }, "bata"), true);
  assert.equal(M.itemMatchesBrand({ brand: "Local" }, "Bata"), false);
  const sum = M.summarizeBrands(rows, [{ brand: "Bata" }, { brand: "" }, { brand: "Local" }]);
  assert.equal(sum.assigned, 2);
});

test("Item Master and Purchases keep eight-decimal prices like ₹0.00000001", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const units = read("js/units.js");
  const schema = read("server/schema.js");
  const sql = read("scripts/base-schema.sql");
  const core = read("pos-php-core.php");
  const crud = read("server/crud.js");
  const phpCrud = read("pos-crud.php");
  const disc = read("js/discount.js");
  assert.match(index, /id="item-purchase"[^>]*step="0.00000001"/);
  assert.match(index, /id="item-retail"[^>]*step="0.00000001"/);
  assert.match(index, /id="item-b2b"[^>]*step="0.00000001"/);
  assert.match(index, /id="ci-retail"[^>]*step="0.00000001"/);
  assert.match(index, /placeholder="0.00000000"/);
  assert.match(app, /step="0.00000001"[^>]*data-po-rate/);
  assert.match(app, /POSUnits\.roundRate8\?\.\(\$\("item-purchase"\)\.value\)/);
  assert.match(app, /POSUnits\.roundRate8\?\.\(\$\("item-retail"\)\.value\)/);
  assert.match(units, /function roundRate8/);
  assert.match(units, /maximumFractionDigits: 8/);
  assert.match(sql, /purchase_rate DECIMAL\(20,8\)/);
  assert.match(sql, /retail_rate DECIMAL\(20,8\)/);
  assert.match(schema, /widenDecimal\("items", "purchase_rate"/);
  assert.match(schema, /widenDecimal\("sales_order_lines", "rate_per_kg"/);
  assert.match(schema, /scale >= 8/);
  assert.match(core, /function pos_round8/);
  assert.match(core, /function pos_ensure_rate_precision/);
  assert.match(core, /DECIMAL\(20,8\)/);
  assert.match(crud, /const rate = rate4\(line.rate_per_kg/);
  assert.match(phpCrud, /pos_round8\(\$body\["purchase_rate"\]/);
  assert.match(phpCrud, /pos_round8\(\$line\["rate_per_kg"\]/);
  assert.match(disc, /\* 1e8/);
});

test("Item Master shows a created-successfully notice after save", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const css = read("css/pos.css");
  assert.match(index, /id="item-save-toast"/);
  assert.match(index, /Item created successfully/);
  assert.match(index, /id="item-save-toast-dismiss"/);
  assert.match(app, /function showItemSaveToast/);
  assert.match(app, /Item created successfully/);
  assert.match(app, /showItemSaveToast\(wasNew \? "Item created successfully"/);
  assert.match(app, /showItemSaveToast\("Item created successfully", name\)/);
  assert.match(css, /#item-save-toast\[hidden\]/);
});

test("Item Master save ignores a second click while the first POST is in flight", () => {
  const app = read("js/app.js");
  const php = read("pos-api.php");
  const apiJs = read("js/pos-api.js");
  assert.match(app, /let itemFormBusy = false/);
  assert.match(app, /if \(itemFormBusy\) return/);
  assert.match(app, /itemFormBusy = true/);
  assert.match(app, /\$\("item-save"\)/);
  assert.match(app, /saveBtn\.disabled = true/);
  assert.match(app, /Saving…/);
  assert.match(app, /itemFormBusy = false/);
  assert.match(app, /if \(saveBtn\?\.disabled\) return/);
  assert.match(php, /function pos_is_mutating/);
  assert.match(php, /skipped mutating/);
  assert.match(php, /\$mutating && \$dispatched/);
  assert.match(php, /Refresh the catalog before saving again/);
  assert.match(apiJs, /mutating && res\.status >= 200 && res\.status < 300/);
  assert.match(apiJs, /refresh the catalog before saving again/i);
});

test("Item Master and Brand Management are wired for all shop types", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const fw = read("js/footwear.js");
  const hub = read("js/biz-hub.js");
  const crud = read("server/crud.js");
  const adv = read("server/advanced.js");
  const php = read("pos-brands.php");
  const core = read("pos-php-core.php");
  const till = read("pos-php-till.php");
  const node = read("server/brands.js");
  const imp = read("server/item-import.js");

  assert.match(index, /id="view-brands"/);
  assert.match(index, /id="item-brand"/);
  assert.match(index, /id="item-brand-filter"/);
  assert.match(index, /data-view="brands"/);
  assert.match(index, /js\/item-master\.js\?v=20261012brand1/);
  assert.match(index, /css\/item-master\.css\?v=20261027items2/);
  assert.match(index, /Item Master/);
  assert.match(app, /brand: \$\("item-brand"\)/);
  assert.match(app, /item\.brand/);
  assert.match(fw, /brandLab/);
  assert.match(hub, /view: "brands"/);
  assert.match(adv, /saveItemBrand/);
  assert.match(crud, /saveItemBrand|onItemSaved/);
  assert.match(node, /registerBrandStaff/);
  assert.match(php, /function pos_save_item_brand/);
  assert.match(php, /function pos_brands_dispatch/);
  assert.match(core, /pos_brands_dispatch/);
  assert.match(till, /pos_list_brands|brands/);
  assert.match(imp, /"Brand"/);
  assert.match(read("scripts/base-schema.sql"), /CREATE TABLE IF NOT EXISTS brands/);
  assert.doesNotMatch(php, /password_hash/);
});

test("Item Master desk keeps search and save inside scrolling panes", () => {
  const css = read("css/item-master.css");
  const app = read("js/app.js");
  const index = read("index.html");
  assert.match(css, /items-desk: item master 2026/);
  assert.match(css, /#view-items:not\(\[hidden\]\)/);
  assert.match(css, /#view-items \.items-library-head/);
  assert.match(css, /position:\s*sticky/);
  assert.match(css, /#view-items \.items-library \{ order: -1; \}/);
  assert.match(css, /items-desk: phone tablet scroll 2026/);
  assert.match(css, /max-height:\s*none/);
  assert.match(index, /css\/item-master\.css\?v=20261027items2/);
  assert.match(index, /app\.js\?v=20261031notice1/);
  assert.match(app, /form\.scrollTop = 0/);
  assert.match(app, /preventScroll:\s*true/);
  assert.match(index, /css\/pos\.css\?v=20261027invui7/);
});
