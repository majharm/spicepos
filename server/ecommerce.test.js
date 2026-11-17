import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ecommerceTotals } from "./ecommerce.js";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("E-Commerce delivery is free once the order reaches the shop threshold", () => {
  const lines = [{ amount: 400, gst: 72 }, { amount: 28, gst: 0 }];
  assert.deepEqual(ecommerceTotals(lines, { deliveryFee: 40, freeAbove: 500 }), {
    subtotal: 428,
    gst: 72,
    delivery: 0,
    total: 500,
  });
  assert.equal(ecommerceTotals([{ amount: 100, gst: 18 }], { deliveryFee: 40, freeAbove: 500 }).delivery, 40);
  assert.equal(ecommerceTotals([{ amount: 100, gst: 18 }], { deliveryFee: 40, freeAbove: 0 }).total, 158);
});

test("E-Commerce Store is a master permission and a public shop", () => {
  const app = read("js/app.js");
  const master = read("js/master.js");
  const php = read("pos-ecommerce.php");
  const index = read("index.html");
  assert.match(app, /function ecommerceAllowed/);
  assert.match(app, /POSEcommerce\?\.open/);
  assert.match(index, /id="view-ecommerce"/);
  assert.match(index, /id="open-ecommerce"/);
  assert.match(index, /shop\.js\?v=20261117ecom1|ecommerce-desk\.js\?v=20261117ecom1/);
  assert.match(read("shop.html"), /js\/shop\.js\?v=20261117ecom1/);
  assert.match(master, /name="ecommerceStore"/);
  assert.match(master, /Enable E-Commerce for All Businesses/);
  assert.match(php, /function pos_ensure_ecommerce_schema/);
  assert.match(php, /CREATE TABLE IF NOT EXISTS ecommerce_orders/);
  assert.match(php, /function pos_ecommerce_public_dispatch/);
  assert.match(php, /function pos_ecommerce_staff_dispatch/);
  assert.match(read("pos-php-till.php"), /"ecommerce"/);
  assert.match(read("server/schema.js"), /ecommerce_store", "TINYINT\(1\) NOT NULL DEFAULT 0/);
  assert.match(read("server/index.js"), /registerEcommercePublic/);
});
