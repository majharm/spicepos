import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(name) {
  return readFileSync(path.join(root, name), "utf8");
}

test("PHP fallback routes checkout and order updates through core", () => {
  const core = read("pos-php-core.php");
  const till = read("pos-php-till.php");
  const crud = read("pos-crud.php");
  const checkout = read("pos-checkout.php");
  const orders = read("pos-orders.php");

  assert.match(core, /checkout.*POST.*pos_dispatch_checkout/s);
  assert.match(core, /orders\/\[\^\/\]\+.*pos_dispatch_order_route/s);
  assert.match(till, /pos_dispatch_order_route/);
  assert.match(crud, /checkout.*POST.*pos_dispatch_checkout/s);
  assert.match(checkout, /function pos_checkout_sale/);
  assert.match(orders, /function pos_dispatch_order_route/);
  assert.match(orders, /function pos_patch_order/);
});
