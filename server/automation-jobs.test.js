import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  collectionSummary,
  deliverMobile,
  expectedCash,
  idempotencyKey,
  inr,
  lowStockDue,
  nextRetryAt,
  overdueStage,
  salesMessage,
  salesSummary,
  shouldSendLowStock,
  shopClockReached,
} from "./automation-jobs.js";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("credit sales and unpaid invoices are not collected cash", () => {
  const col = collectionSummary({
    orders: [
      { id: "c1", customer_id: "cus", total: 500, payment_method: "credit", payment_status: "due", amount_paid: 0 },
      { id: "u1", customer_id: "cus", total: 200, payment_method: "cash", payment_status: "unpaid", amount_paid: 0 },
    ],
    receipts: [],
  });
  assert.equal(col.collected, 0);
  assert.equal(col.cash, 0);
  assert.equal(col.credit, 0);
});

test("a receipt is collected once even when the same bill is also in the sales list", () => {
  const col = collectionSummary({
    receipts: [{ entry_type: "receipt", party_type: "customer", amount: 300, payment_method: "upi", reference_id: "o1" }],
    orders: [{ id: "o1", customer_id: "cus", total: 300, payment_method: "upi", payment_status: "paid", amount_paid: 300 }],
  });
  assert.equal(col.upi, 300);
  assert.equal(col.collected, 300);
});

test("split tenders are summed once and a sale_credit row is ignored", () => {
  const col = collectionSummary({
    receipts: [
      { entry_type: "receipt", party_type: "customer", amount: 100, payment_method: "cash", reference_id: "o2" },
      { entry_type: "receipt", party_type: "customer", amount: 150, payment_method: "card", reference_id: "o2" },
      { entry_type: "sale_credit", party_type: "customer", amount: 250, payment_method: "credit", reference_id: "o2" },
    ],
  });
  assert.equal(col.cash, 100);
  assert.equal(col.card, 150);
  assert.equal(col.collected, 250);
});

test("walk-in cash is collected and an unpaid walk-in is not", () => {
  const col = collectionSummary({
    orders: [
      { id: "w1", total: 80, payment_method: "cash", payment_status: "paid", amount_paid: 80 },
      { id: "w2", total: 40, payment_method: "upi", payment_status: "unpaid", amount_paid: 0 },
      { id: "w3", total: 90, payment_method: "cash", payment_status: "paid", amount_paid: 40, payments: [{ method: "cash", amount: 40 }, { method: "upi", amount: 50 }] },
    ],
  });
  assert.equal(col.cash, 120);
  assert.equal(col.upi, 50);
  assert.equal(col.collected, 170);
});

test("cash refunds reduce cash collected", () => {
  const col = collectionSummary({
    receipts: [{ entry_type: "receipt", party_type: "customer", amount: 200, payment_method: "cash" }],
    refunds: [{ refund_amount: 30, refund_mode: "cash" }],
  });
  assert.equal(col.cash, 170);
  assert.equal(col.refunds, 30);
  assert.equal(col.collected, 170);
});

test("daily sales keep credit as a tender and net sales after returns", () => {
  const sales = salesSummary(
    [
      { total: 1000, discount: 100, payment_method: "credit", status: "confirmed" },
      { total: 400, discount: 0, payment_method: "cash", status: "confirmed" },
      { total: 50, discount: 0, payment_method: "cash", status: "cancelled" },
    ],
    { returns: 25, itemsSold: 6 },
  );
  assert.equal(sales.bills, 2);
  assert.equal(sales.cancelled, 1);
  assert.equal(sales.gross, 1500);
  assert.equal(sales.credit, 1000);
  assert.equal(sales.cash, 400);
  assert.equal(sales.net, 1375);
  assert.equal(sales.items, 6);
  const text = salesMessage("ATAV TELECOM", "2026-10-31", sales, 400);
  assert.match(text, /Credit: ₹1,000\.00/);
  assert.match(text, /Collected: ₹400\.00/);
  assert.match(text, /ATAV TELECOM/);
});

test("one business id cannot share another business idempotency key", () => {
  const a = idempotencyKey("daily_sales", "biz-a", "2026-10-31", "whatsapp");
  const b = idempotencyKey("daily_sales", "biz-b", "2026-10-31", "whatsapp");
  assert.notEqual(a, b);
  assert.match(a, /biz-a/);
});

test("overdue stages fire once per configured day and skip other days", () => {
  assert.equal(overdueStage("2026-10-31", "2026-10-30"), "before");
  assert.equal(overdueStage("2026-10-31", "2026-10-31"), "on");
  assert.equal(overdueStage("2026-10-28", "2026-10-31"), "d3");
  assert.equal(overdueStage("2026-10-24", "2026-10-31"), "d7");
  assert.equal(overdueStage("2026-10-16", "2026-10-31"), "d15");
  assert.equal(overdueStage("2026-10-01", "2026-10-31"), "d30");
  assert.equal(overdueStage("2026-10-29", "2026-10-31"), "");
  assert.equal(overdueStage("2026-10-28", "2026-10-31", ["on"]), "");
});

test("low stock repeats only when the stock set changes or the reminder interval passes", () => {
  const items = [{ id: "p1", stock: 2 }];
  const now = new Date("2026-10-31T12:00:00+05:30");
  const same = shouldSendLowStock({
    items,
    previousSignature: "p1:2",
    lastSentAt: "2026-10-31T10:00:00+05:30",
    now,
    reminderHours: 24,
  });
  assert.equal(same.send, false);
  const changed = shouldSendLowStock({
    items: [{ id: "p1", stock: 1 }],
    previousSignature: "p1:2",
    lastSentAt: "2026-10-31T10:00:00+05:30",
    now,
    reminderHours: 24,
  });
  assert.equal(changed.send, true);
  assert.equal(changed.reason, "changed");
  assert.equal(lowStockDue("2026-10-31T11:40:00+05:30", now, 30), false);
  assert.equal(lowStockDue("2026-10-31T11:00:00+05:30", now, 30), true);
});

test("schedules use the shop clock, not UTC", () => {
  const utcEvening = new Date("2026-10-31T15:30:00Z");
  assert.equal(shopClockReached(utcEvening, "Asia/Kolkata", "21:00"), true);
  assert.equal(shopClockReached(utcEvening, "Asia/Kolkata", "21:15"), false);
  const utcMorning = new Date("2026-10-31T05:00:00Z");
  assert.equal(shopClockReached(utcMorning, "Asia/Kolkata", "11:00"), false);
});

test("retries back off and stop after four attempts", () => {
  const now = Date.parse("2026-10-31T12:00:00Z");
  assert.equal(nextRetryAt(1, now), new Date(now + 2 * 60 * 1000).toISOString());
  assert.equal(nextRetryAt(2, now), new Date(now + 4 * 60 * 1000).toISOString());
  assert.equal(nextRetryAt(3, now), new Date(now + 8 * 60 * 1000).toISOString());
  assert.equal(nextRetryAt(4, now), null);
});

test("test mode sends only to the approved number and consent is required for customers", () => {
  assert.deepEqual(deliverMobile({ mobile: "9876543210", testMode: true, testNumber: "9123456780" }), {
    mobile: "9123456780",
    test: true,
  });
  assert.equal(deliverMobile({ mobile: "9876543210", testMode: true, testNumber: "" }).reason, "test-number-missing");
  assert.equal(deliverMobile({ mobile: "9876543210", optOut: true, testMode: false }).reason, "opt-out");
  assert.equal(deliverMobile({ mobile: "9876543210", consent: false, testMode: false }).reason, "no-consent");
  assert.equal(deliverMobile({ mobile: "9876543210", testMode: false }).mobile, "9876543210");
});

test("expected closing cash subtracts cash expenses and cash refunds", () => {
  assert.equal(expectedCash({ opening: 1000, cashCollected: 500, cashExpenses: 80, cashRefunds: 20 }), 1400);
});

test("indian currency formatting groups the rupee", () => {
  assert.equal(inr(4999), "4,999.00");
  assert.equal(inr(10004119820), "10,00,41,19,820.00");
});

test("the PHP runner reuses WAMaster, locks the tick, and does not count credit as a receipt", () => {
  const php = read("pos-automation.php");
  const health = read("api/health/index.php");
  const alerts = read("server/alerts.js");
  const core = read("pos-php-core.php");
  assert.match(php, /pos_wa_send_one/);
  assert.match(php, /GET_LOCK/);
  assert.match(php, /Asia\/Kolkata/);
  assert.match(php, /entry_type\)='receipt'/);
  assert.match(php, /whatsapp_consent/);
  assert.doesNotMatch(php, /wamaster\.atavtelecom\.in/);
  assert.doesNotMatch(php, /api_key/);
  assert.match(health, /pos_automation_tick/);
  assert.match(health, /flock/);
  assert.match(core, /pos_automation_master_dispatch/);
  assert.doesNotMatch(alerts, /void tickAllClosingAlerts\(\)/);
  assert.match(alerts, /PHP health and \/api\/cron drive scheduled reports/);
  assert.match(read("pos-alerts.php"), /new DateTimeZone\(\$tzName\)/);
  assert.match(php, /cashRefunds/);
  assert.doesNotMatch(php, /\$col\["cash"\] - \$exp\["cash"\] - \$col\["refunds"\]/);
  assert.match(read("js/app.js"), /name === "automation"/);
  assert.match(read("index.html"), /data-settings-tab="automation"/);
  assert.match(read("index.html"), /id="settings-pane-automation"/);
  assert.match(php, /function pos_auto_release_unwanted/);
  assert.match(php, /\$forceJob === \$key && \$forceShop/);
  assert.doesNotMatch(php, /if \(\$forceJob === \$key\) return true;/);
  assert.match(read("js/master.js"), /Shops that turned this report on/);
  assert.match(read("pos-api.php"), /function pos_is_automation_path/);
  assert.match(read("pos-api.php"), /skipped automation fast-path/);
  assert.match(php, /function pos_auto_arm_jobs_once/);
  assert.match(php, /automation_jobs_armed/);
  assert.match(php, /UPDATE automation_jobs SET enabled = 1/);
  assert.match(read("api/cron/index.php"), /jobsEnabled/);
  assert.match(read("api/cron/index.php"), /shopsOn/);
  assert.match(read("js/app.js"), /Daily sales\|Collections\|Day-end\|Low stock alert\|Payment reminder/);
  assert.match(php, /function pos_auto_probe/);
  assert.match(php, /test-number/);
  assert.match(php, /provider_note, ''\) <> 'forced'/);
  assert.match(read("js/master.js"), /Test WhatsApp sent to the saved test number/);
  assert.match(read("master.html"), /master\.js\?v=20261031auto4/);
  assert.doesNotMatch(read("api/cron/index.php"), /lastError/);
  assert.match(php, /if \(\$testMode\) \{\s*\$mobile = \$testNumber;/);
});
