import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(name) {
  return readFileSync(path.join(root, name), "utf8");
}

test("PHP fallback routes checkout, holds, and order updates through core", () => {
  const core = read("pos-php-core.php");
  const till = read("pos-php-till.php");
  const crud = read("pos-crud.php");
  const checkout = read("pos-checkout.php");
  const holds = read("pos-holds.php");
  const orders = read("pos-orders.php");

  assert.match(core, /checkout.*POST.*pos_dispatch_checkout/s);
  assert.match(core, /orders\/\[\^\/\]\+.*pos_dispatch_order_route/s);
  assert.match(core, /holds.*pos_dispatch_holds/s);
  assert.match(core, /backup.*pos_dispatch_backup/s);
  assert.match(core, /pos_dispatch_master_backup/);
  assert.match(core, /units.*pos_dispatch_units/s);
  assert.match(core, /function pos_require_backup/);
  assert.match(core, /function pos_require_units/);
  assert.match(core, /function pos_round2/);
  assert.match(core, /function pos_ensure_held_bills_schema/);
  assert.match(till, /pos_dispatch_order_route/);
  assert.match(till, /pos_dispatch_holds/);
  assert.match(crud, /checkout.*POST.*pos_dispatch_checkout/s);
  assert.match(crud, /pos_dispatch_holds/);
  assert.match(checkout, /function pos_checkout_sale/);
  assert.match(holds, /function pos_dispatch_holds/);
  assert.match(holds, /INSERT INTO held_bills/);
  assert.match(orders, /function pos_dispatch_order_route/);
  assert.match(core, /This POS action is not available in PHP fallback yet \(\{\$method\} \{\$path\}\)/);
  assert.match(read("pos-accounting.php"), /\$path === "expenses"/);
  assert.match(read("pos-php-core.php"), /function pos_indian_fy/);
  const ht = read("api/.htaccess");
  assert.match(ht, /DirectorySlash Off/);
  assert.doesNotMatch(ht, /!-d/);
  const apiJs = read("js/pos-api.js");
  assert.match(apiJs, /isPhpUnimplemented/);
  assert.match(apiJs, /orderedSpecs/);
});

test("PHP customer insert bind types match placeholders", () => {
  const crud = read("pos-crud.php");
  const core = read("pos-php-core.php");
  const cust = crud.match(
    /INSERT INTO customers[\s\S]*?VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,0,\?\)",\s*"([sid]+)",\s*\[/,
  );
  assert.ok(cust, "customer INSERT found");
  assert.equal(cust[1].length, 9);
  assert.equal(cust[1], "sssssssds");

  const items = crud.match(
    /INSERT INTO items[\s\S]*?VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?, 'active', \?\)",\s*"([sid]+)",/,
  );
  assert.ok(items, "item INSERT found");
  assert.equal(items[1].length, 15);
  assert.equal(items[1], "sssssssddddsdds");

  assert.match(core, /function pos_line_amount_for_item/);
  assert.match(core, /function pos_item_unit/);
  assert.match(read("pos-checkout.php"), /pos_line_amount_for_item/);
  assert.match(crud, /pos_line_amount_for_item/);
  const index = read("index.html");
  assert.match(index, /js\/units\.js/);
  assert.match(index, /id="item-unit"/);
  assert.match(index, /id="view-units"/);
  assert.match(index, /data-view="units"/);
  assert.match(read("pos-units.php"), /function pos_dispatch_units/);
  assert.match(read("pos-units.php"), /CREATE TABLE IF NOT EXISTS inventory_units/);
  assert.match(read("pos-php-till.php"), /pos_dispatch_units/);
  assert.match(read("api/units/index.php"), /p.*=.*units/);
  const unitInsert = read("pos-units.php").match(
    /VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,'active'\)",\s*"([sid]+)",/,
  );
  assert.ok(unitInsert, "unit seed INSERT found");
  assert.equal(unitInsert[1], "sssssssdddi");
  const unitPost = read("pos-units.php").match(
    /VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?\)",\s*"([sid]+)",/,
  );
  assert.ok(unitPost, "unit POST INSERT found");
  assert.equal(unitPost[1], "sssssssdddis");
  assert.match(read("server/units.js"), /registerUnits/);
  assert.match(read("server/index.js"), /registerUnits\(app\)/);
  assert.match(read("js/app.js"), /applyUnitMaster/);
  assert.match(read("server/crud.js"), /POSUnits\.lineAmount/);
  assert.match(read("js/app.js"), /POSUnits\.lineAmount/);
  assert.match(read("pos-orders.php"), /pos_line_amount_for_item/);
  assert.match(read("pos-reports.php"), /payDaywise/);
  assert.match(read("pos-reports.php"), /Payment daywise/);
  assert.match(read("js/app.js"), /Payment daywise/);
  assert.match(read("server/reports.js"), /payDaywise/);
});
