import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import "./pay-integrity.js";
import "./restaurant.js";

const P = globalThis.POSPayIntegrity;
const R = globalThis.POSRestaurant;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("partial payments accumulate without duplicating the same key", () => {
  const bill = 1000;
  const first = P.validatePaymentAttempt({ billTotal: bill, alreadyPaid: 0, amount: 400, idempotencyKey: "p1" });
  assert.equal(first.ok, true);
  assert.equal(first.remaining, 600);
  const second = P.validatePaymentAttempt({ billTotal: bill, alreadyPaid: 400, amount: 300, idempotencyKey: "p2" });
  assert.equal(second.remaining, 300);
  const third = P.validatePaymentAttempt({ billTotal: bill, alreadyPaid: 700, amount: 300, idempotencyKey: "p3" });
  assert.equal(third.remaining, 0);
  const dup = P.validatePaymentAttempt({
    billTotal: bill,
    alreadyPaid: 400,
    amount: 400,
    idempotencyKey: "p1",
    existingKeys: ["p1"],
  });
  assert.equal(dup.replay, true);
  assert.equal(dup.collected, 0);
});

test("split cash + UPI + card stay within outstanding and skip failed rows", () => {
  const split = P.splitPayments(
    [
      { method: "cash", amount: 400, idempotencyKey: "a" },
      { method: "upi", amount: 300, idempotencyKey: "b" },
      { method: "card", amount: 300, idempotencyKey: "c" },
    ],
    1000,
    0,
  );
  assert.equal(split.ok, true);
  assert.equal(split.paid, 1000);
  assert.equal(split.remaining, 0);
  assert.equal(split.payments.length, 3);
  const over = P.splitPayments([{ method: "cash", amount: 500 }, { method: "upi", amount: 600 }], 1000, 0);
  assert.equal(over.ok, false);
  const failed = P.validatePaymentAttempt({ billTotal: 1000, alreadyPaid: 0, amount: 100, status: "failed" });
  assert.equal(failed.ok, false);
  const pending = P.validatePaymentAttempt({
    billTotal: 1000,
    alreadyPaid: 0,
    amount: 500,
    idempotencyKey: "upi-1",
    pendingKeys: ["upi-1"],
  });
  assert.equal(pending.pending, true);
});

test("empty holds and completed QR orders do not occupy a table; shift moves the active hold", () => {
  const empty = [{ id: "h0", label: "Table 2", payload: { table_no: "2", cart: [] } }];
  assert.equal(R.tableOccupied(empty, [], "2"), false);
  const holds = [{ id: "h1", label: "Table 5", payload: { table_no: "5", cart: [{ itemId: "dosa", qtyGm: 1 }] } }];
  const qrs = [{ table_no: "5", status: "preparing", id: "q1" }];
  const kots = [
    { id: "k1", table_no: "5", status: "new" },
    { id: "k2", table_no: "5", status: "done" },
    { id: "k3", table_no: "5", status: "preparing" },
  ];
  const moved = R.applyShiftLocal(holds, qrs, kots, "5", "8");
  assert.equal(R.tableNoFromHold(moved.holds[0]), "8");
  assert.equal(moved.qrOrders[0].table_no, "8");
  assert.equal(moved.kots.find((k) => k.id === "k1").table_no, "8");
  assert.equal(moved.kots.find((k) => k.id === "k3").table_no, "8");
  assert.equal(moved.kots.find((k) => k.id === "k2").table_no, "5");
  assert.equal(R.kotTicketOpen({ status: "done" }), false);
  assert.equal(R.kotTicketOpen({ status: "ready" }), true);
  assert.equal(R.tableOccupied(moved.holds, moved.qrOrders, "5"), false);
  assert.equal(R.tableOccupied(moved.holds, moved.qrOrders, "8"), true);
  assert.equal(P.sourceVacantAfterShift({ sourceHoldCount: 0, sourceOpenQr: 0 }), true);
  assert.equal(P.keepTableAfterPayment("partial", 300), true);
  assert.equal(P.keepTableAfterPayment("paid", 0), false);
});

test("Cafe, restaurant, and bar share shift and payment wiring", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const tenant = read("server/tenant.js");
  const php = read("pos-table-shift.php");
  const holds = read("pos-holds.php");
  const bar = read("server/bar.js");
  const barPhp = read("pos-bar.php");
  const barUi = read("js/bar-ui.js");
  assert.match(index, /js\/pay-integrity\.js\?v=20261012table1/);
  assert.match(index, /js\/app\.js\?v=20261027rec1/);
  assert.match(index, /js\/restaurant\.js\?v=20261012set4/);
  assert.match(index, /js\/bar-ui\.js\?v=20261012table1/);
  assert.match(app, /idempotencyKey/);
  assert.match(app, /saveTableHoldDebounced\.cancel/);
  assert.match(app, /openTableOrderId/);
  assert.match(app, /\/api\/orders\/.*payments/);
  assert.match(tenant, /withTransaction/);
  assert.match(tenant, /ensureIdempotencyTable/);
  assert.match(tenant, /\/api\/tables\/vacate/);
  assert.match(tenant, /\/api\/tables\/reconcile/);
  assert.match(php, /pos_with_transaction/);
  assert.match(php, /pos-idempotency\.php/);
  assert.match(read("pos-idempotency.php"), /pos_idempotency/);
  assert.match(holds, /pos_normalize_table_no/);
  assert.match(bar, /Destination table is occupied/);
  assert.match(bar, /idempotency/);
  assert.match(barPhp, /Destination table is occupied/);
  assert.match(barUi, /idempotencyKey/);
  assert.match(read("server/index.js"), /idempotencyKey/);
  assert.match(read("pos-checkout.php"), /idempotency/);
  assert.match(read("pos-orders.php"), /payments/);
  const accounts = read("server/accounts.js");
  assert.match(accounts, /export async function collectOrderPayment/);
  assert.match(accounts, /findIdempotent\(conn, bid\(\), key\)/);
  assert.match(accounts, /replay: true/);
  assert.match(read("server/crud.js"), /\/api\/orders\/:id\/payments/);
  assert.match(read("server/bar.js"), /saveIdempotent\(conn, bid\(\), idemKey/);
  assert.match(tenant, /ensureKitchenTicketTable/);
  assert.match(tenant, /\["new", "preparing", "ready"\]/);
  assert.match(php, /pos_ensure_kitchen_tickets_schema/);
  assert.match(php, /new.*preparing.*ready/s);
});
