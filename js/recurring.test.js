import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import "./recurring.js";

const R = globalThis.POSRecurring;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (name) => readFileSync(path.join(root, name), "utf8");

test("month-end billing day clamps, then returns to the 31st", () => {
  assert.equal(R.daysInMonth(2026, 2), 28);
  assert.equal(R.daysInMonth(2028, 2), 29);
  assert.equal(R.nextInvoiceDate({ frequency: "monthly", billing_day: 31 }, "2026-01-31"), "2026-02-28");
  assert.equal(R.nextInvoiceDate({ frequency: "monthly", billing_day: 31 }, "2026-02-28"), "2026-03-31");
  assert.equal(R.nextInvoiceDate({ frequency: "monthly", billing_day: 31 }, "2028-01-31"), "2028-02-29");
  assert.equal(R.nextInvoiceDate({ frequency: "yearly", billing_day: 31 }, "2026-01-31"), "2027-01-31");
});

test("supported billing frequencies advance the next invoice date", () => {
  const ids = R.FREQUENCIES.map((row) => row.id);
  assert.deepEqual(ids, ["daily", "weekly", "monthly", "bimonthly", "quarterly", "half_yearly", "yearly", "custom"]);
  assert.equal(R.nextInvoiceDate({ frequency: "daily" }, "2026-10-27"), "2026-10-28");
  assert.equal(R.nextInvoiceDate({ frequency: "weekly" }, "2026-10-27"), "2026-11-03");
  assert.equal(R.nextInvoiceDate({ frequency: "bimonthly", billing_day: 15 }, "2026-01-15"), "2026-03-15");
  assert.equal(R.nextInvoiceDate({ frequency: "quarterly", billing_day: 15 }, "2026-01-15"), "2026-04-15");
  assert.equal(R.nextInvoiceDate({ frequency: "half_yearly", billing_day: 15 }, "2026-01-15"), "2026-07-15");
  assert.equal(R.nextInvoiceDate({ frequency: "custom", interval_days: 10 }, "2026-10-27"), "2026-11-06");
  assert.equal(R.frequencyOk("weekly"), true);
  assert.equal(R.frequencyOk("hourly"), false);
});

test("generation plan skips closed schedules and replays a finished period", () => {
  const base = {
    status: "active",
    auto_generate: 1,
    next_invoice_date: "2026-10-27",
    frequency: "monthly",
    billing_day: 27,
    cycles_done: 0,
  };
  assert.equal(R.planGeneration({ ...base, status: "cancelled" }, "2026-10-27").action, "skip");
  assert.equal(R.planGeneration({ ...base, status: "paused" }, "2026-10-27").action, "skip");
  assert.equal(R.planGeneration({ ...base, status: "paused" }, "2026-10-27", null, { manual: true }).action, "create");
  assert.equal(R.planGeneration({ ...base, auto_generate: 0 }, "2026-10-27").reason, "auto off");
  assert.equal(R.planGeneration(base, "2026-10-26").reason, "not due");
  assert.equal(R.planGeneration({ ...base, next_invoice_date: "2026-11-01" }, "2026-10-27", null, { manual: true }).action, "create");
  assert.equal(R.planGeneration({ ...base, end_date: "2026-10-01" }, "2026-10-27").action, "complete");
  assert.equal(R.planGeneration({ ...base, max_cycles: 3, cycles_done: 3 }, "2026-10-27").action, "complete");
  const replay = R.planGeneration(base, "2026-10-27", { sales_order_id: "ord-1", order_number: "SO-9" });
  assert.equal(replay.action, "replay");
  assert.equal(replay.orderNumber, "SO-9");
  const busy = R.planGeneration(base, "2026-10-27", { status: "pending", created_at: new Date().toISOString() });
  assert.equal(busy.action, "busy");
  const retry = R.planGeneration(base, "2026-10-27", { status: "error", created_at: "2020-01-01T00:00:00.000Z" });
  assert.equal(retry.action, "create");
  assert.equal(retry.period, "2026-10-27");
  assert.equal(retry.nextDate, "2026-11-27");
  const last = R.planGeneration({ ...base, max_cycles: 1 }, "2026-10-27");
  assert.equal(last.afterStatus, "completed");
  assert.equal(last.cyclesDone, 1);
});

test("service lines do not deduct stock and goods lines still do", () => {
  assert.equal(R.skipsRecurringStock({ base_unit: "SERVICE" }), true);
  assert.equal(R.skipsRecurringStock({ unit: "service" }), true);
  assert.equal(R.skipsRecurringStock({ kind: "service", base_unit: "PCS" }), true);
  assert.equal(R.skipsRecurringStock({ base_unit: "PCS", kind: "goods" }), false);
  assert.equal(R.flagOn(1), true);
  assert.equal(R.flagOn(0), false);
  assert.equal(R.flagOn("0"), false);
});

test("dashboard counts active, upcoming, overdue, and paused schedules", () => {
  const rows = [
    { status: "active", next_invoice_date: "2026-10-20" },
    { status: "active", next_invoice_date: "2026-10-30" },
    { status: "paused", next_invoice_date: "2026-10-20" },
    { status: "cancelled", next_invoice_date: "2026-11-01" },
    { status: "completed", next_invoice_date: "2026-09-01" },
  ];
  const stats = R.dashboardStats(rows, 4, "2026-10-27");
  assert.equal(stats.total, 5);
  assert.equal(stats.active, 2);
  assert.equal(stats.generatedThisMonth, 4);
  assert.equal(stats.overdue, 1);
  assert.equal(stats.upcoming, 1);
  assert.equal(stats.pausedOrCancelled, 2);
});

test("create form lists a real customer, products, and the schedule fields", () => {
  const els = {};
  const make = (id) => {
    els[id] = { id, hidden: true, innerHTML: "", value: "", className: "", scrollIntoView() {} };
    return els[id];
  };
  make("recurring-form-wrap");
  make("recurring-lines");
  const sandbox = {
    document: {
      getElementById: (id) => els[id] || null,
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener() {},
    },
    POSRecurring: R,
    state: {
      customers: [
        { id: "c1", name: "Walk-in", code: "CUS-001" },
        { id: "c2", name: "Asha Stores" },
      ],
      items: [{ id: "i1", name: "Monthly service", base_unit: "SERVICE" }],
    },
    console,
    Date,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read("js/recurring-ui.js"), sandbox, { filename: "recurring-ui.js" });
  sandbox.POSRecurringUi.paintForm({
    name: "AMC",
    customer_id: "c2",
    frequency: "monthly",
    billing_day: 31,
    start_date: "2026-01-31",
    next_invoice_date: "2026-02-28",
    payment_terms_days: 7,
    lines: [{ itemId: "i1", quantity_gm: 1, rate: 500, discountValue: 0, gstRate: 18 }],
    auto_generate: 1,
    status: "active",
  });
  const html = els["recurring-form-wrap"].innerHTML;
  assert.equal(els["recurring-form-wrap"].hidden, false);
  assert.match(html, /AMC/);
  assert.match(html, /Asha Stores/);
  assert.doesNotMatch(html, /Walk-in/);
  assert.match(els["recurring-lines"].innerHTML, /Monthly service/);
  assert.match(html, /Billing day/);
  assert.match(html, /Next invoice date/);
  assert.match(html, /Payment terms/);
  assert.match(html, /WhatsApp invoice notification/);
  assert.match(html, /WhatsApp payment reminder/);
  assert.match(html, /Email invoice notification/);
  assert.match(html, /Generate invoices automatically/);
  assert.match(html, />Active</);
  assert.match(html, />Paused</);
  assert.match(els["recurring-lines"].innerHTML, /value="500"/);
  assert.match(els["recurring-lines"].innerHTML, /value="18"/);
});

test("recurring invoices stay behind the business switch and post through sales", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const server = read("server/recurring.js");
  const ui = read("js/recurring-ui.js");
  assert.match(index, /data-view="recurring" hidden/);
  assert.match(index, /id="view-recurring"/);
  assert.match(index, /id="set-recurring-invoices"/);
  assert.doesNotMatch(index, /id="set-recurring-invoices" checked/);
  assert.match(index, /js\/recurring\.js\?v=20261027rec1/);
  assert.match(index, /js\/recurring-ui\.js\?v=20261027rec1/);
  assert.match(app, /view === "recurring"\) btn\.hidden = !recurringInvoicesOn\(\) \|\| !can\("orders"\)/);
  assert.match(app, /POSRecurringUi\?\.load/);
  assert.match(read("js/biz-hub.js"), /view: "recurring"/);
  assert.doesNotMatch(read("js/biz-hub.js"), /desk: "recurring"/);
  assert.match(read("js/biz-hub-ui.js"), /m\.id !== "recurring" \|\| recurringInvoicesOn\(\)/);
  assert.match(server, /ROLLBACK TO SAVEPOINT/);
  assert.match(server, /uniq_recur_period/);
  assert.match(server, /amountPaid: 0/);
  assert.match(server, /"credit", "unpaid"/);
  assert.match(server, /skipsRecurringStock/);
  assert.match(server, /requirePerm\("orders"\)/);
  assert.match(server, /startRecurringScheduler/);
  assert.match(server, /Recurring invoice was marked paid without a payment/);
  assert.match(read("server/index.js"), /startRecurringScheduler\(\)/);
  assert.match(read("server/index.js"), /registerRecurring\(app\)/);
  assert.match(ui, /WhatsApp payment reminder/);
  assert.match(ui, /Email invoice notification/);
  assert.match(ui, /data-recur-generate/);
  assert.match(ui, /data-recur-history/);
  assert.doesNotMatch(server, /payment_status = 'paid'/);
});
