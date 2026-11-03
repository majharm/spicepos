import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(name) {
  return readFileSync(path.join(root, name), "utf8");
}

test("Purchases page can edit a saved bill", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const crud = read("server/crud.js");
  const accounts = read("server/accounts.js");
  const php = read("pos-crud.php");
  const core = read("pos-php-core.php");

  assert.match(index, /id="po-save"/);
  assert.match(index, /id="po-cancel-edit"/);
  assert.match(app, /data-edit-purchase/);
  assert.match(app, /function beginPurchaseEdit/);
  assert.match(app, /\/api\/purchases\/\$\{encodeURIComponent\(editingId\)\}/);
  assert.match(app, /method: editingId \? "PUT" : "POST"/);
  assert.match(crud, /app\.put\("\/api\/purchases\/:id"/);
  assert.match(crud, /function unwindPurchase/);
  assert.match(crud, /remaining_gm\) \+ 0\.0001 < Number\(row\.qty_gm\)/);
  assert.match(crud, /stock_gm = stock_gm - \?/);
  assert.match(accounts, /function reverseCreditPurchase/);
  assert.match(accounts, /payable_balance = COALESCE\(payable_balance, 0\) - \?/);
  assert.match(php, /purchases\/\(\[A-Za-z0-9-\]\+\)/);
  assert.match(php, /function pos_unwind_purchase/);
  assert.match(core, /function pos_reverse_credit_purchase/);
});
