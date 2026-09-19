import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(name) {
  return readFileSync(path.join(root, name), "utf8");
}

test("Manage Returns is wired for pharmacy quarantine and garment condition", () => {
  const node = read("server/returns.js");
  const php = read("pos-returns.php");
  const core = read("pos-php-core.php");
  const index = read("index.html");
  const app = read("js/app.js");
  const css = read("css/pos.css");
  const boot = read("server/index.js");
  const adv = read("server/advanced.js");
  const phpAdv = read("pos-advanced.php");
  const invoiceApi = read("api/returns/invoice/index.php");
  const listApi = read("api/returns/index.php");

  assert.match(boot, /registerReturns/);
  assert.match(node, /app\.get\("\/api\/returns\/invoice"/);
  assert.match(node, /app\.post\("\/api\/returns"/);
  assert.match(node, /disposition = body\.sellableStock && canRelease \? "sellable" : "quarantine"/);
  assert.match(node, /condition === "damaged" \|\| condition === "used" \? "quarantine" : "sellable"/);
  assert.match(node, /quarantine_gm/);
  assert.match(node, /kind: "sale_return"/);
  assert.match(node, /s\.first_name/);
  assert.match(php, /s\.first_name/);
  assert.doesNotMatch(node, /COALESCE\(s\.name/);
  assert.doesNotMatch(php, /COALESCE\(s\.name/);
  assert.match(php, /function pos_dispatch_returns/);
  assert.match(php, /quarantine_gm/);
  assert.match(php, /pos_pack_stock_qty/);
  assert.match(php, /sssssssssssssdsss/);
  assert.match(php, /sssssssssdddddssssss/);
  assert.match(core, /function pos_is_returns_path/);
  assert.match(core, /pos_dispatch_returns/);
  assert.match(adv, /quarantine_gm DECIMAL/);
  assert.match(phpAdv, /quarantine_gm DECIMAL/);
  assert.match(index, /data-view="returns"/);
  assert.match(index, /id="view-returns"/);
  assert.match(index, /id="returns-search-form"/);
  assert.match(index, /Return Type/);
  assert.match(index, /Refund Mode/);
  assert.match(index, /returns-sellable/);
  assert.match(app, /function loadReturnsView/);
  assert.match(app, /function saveReturn/);
  assert.match(app, /function paintReturnInvoice/);
  assert.match(app, /Batch No\./);
  assert.match(app, /isPharmacyShop\(\) \? pharmacyReturnReasons/);
  assert.match(app, /view === "returns"/);
  assert.match(app, /sellableStock/);
  assert.match(css, /\.returns-desk/);
  assert.match(css, /\.returns-lines-table/);
  assert.match(invoiceApi, /returns\/invoice/);
  assert.match(listApi, /"returns"/);
  assert.match(index, /app\.js\?v=20260919bill1/);
});
