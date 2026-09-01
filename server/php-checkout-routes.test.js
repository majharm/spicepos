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
  assert.match(orders, /function pos_patch_order/);
});
