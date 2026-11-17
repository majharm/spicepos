import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./pos-offline.js";

const O = globalThis.POSOffline;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (name) => readFileSync(path.join(root, name), "utf8");

test("a lost network queues the checkout and a server error does not", () => {
  assert.equal(O.shouldQueue(new Error("Could not reach the POS API. Redeploy and Restart the Node.js app in hPanel.")), true);
  assert.equal(O.shouldQueue(new Error("Failed to fetch")), true);
  assert.equal(O.shouldQueue(new Error("Customer not found")), false);
  assert.equal(O.canQueue({ customerId: "c1", idempotencyKey: "k1", lines: [{ itemId: "i1" }] }), true);
  assert.equal(O.canQueue({ customerId: "", idempotencyKey: "k1", lines: [] }), false);
});

test("pending bills reduce this device's stock and a synced bill does not", () => {
  const items = O.applyPendingStock(
    [{ id: "i1", name: "Tea", stock_gm: 5 }],
    [
      { status: "pending", payload: { lines: [{ itemId: "i1", quantity_gm: 2 }] } },
      { status: "synced", payload: { lines: [{ itemId: "i1", quantity_gm: 9 }] } },
    ],
  );
  assert.equal(items[0].stock_gm, 3);
  assert.equal(items[0].name, "Tea");
});

test("an offline bill gets a temporary number and the shop name", () => {
  const local = O.buildLocalOrder(
    { customerId: "c1", paymentMethod: "cash", discount: 5, idempotencyKey: "k", lines: [{ itemId: "i1", quantity_gm: 2 }] },
    "OFF-4",
    { items: [{ id: "i1", name: "Tea", retail_rate: 10 }], customers: [{ id: "c1", name: "Asha" }] },
  );
  assert.equal(local.offline, true);
  assert.equal(local.order.order_number, "OFF-4");
  assert.equal(local.order.customer_name, "Asha");
  assert.equal(local.order.total, 15);
  assert.equal(local.order.status, "pending_sync");
});

test("stock and missing-customer replies stay on the device as conflicts", () => {
  assert.equal(O.classifySyncFailure("Tea: only 0 in stock"), "conflict");
  assert.equal(O.classifySyncFailure("Unknown item"), "conflict");
  assert.equal(O.classifySyncFailure("Customer not found"), "conflict");
  assert.equal(O.classifySyncFailure("Could not reach the POS API"), "offline");
});

test("offline replay is wired on the app, both servers, and the installed shell", () => {
  assert.match(read("index.html"), /pos-offline\.js\?v=20261118off1/);
  assert.match(read("server/index.js"), /if \(!req\.body\?\.offlineSync\) await assertApparelSaleStock/);
  assert.match(read("pos-checkout.php"), /empty\(\$body\["offlineSync"\]\)/);
  assert.match(read("sw.js"), /pos-pwa-2/);
  assert.match(read("sw.js"), /pathname\.startsWith\("\/api\/"\)/);
  assert.match(read("js/pos-offline.js"), /indexedDB\.open/);
});
