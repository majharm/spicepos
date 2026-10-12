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
  assert.equal(M.sameBrand("MDH", "mdh"));
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
  assert.match(index, /css\/item-master\.css\?v=20261012brand1/);
  assert.match(index, /Item Master/);
  assert.match(app, /body\.brand/);
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
