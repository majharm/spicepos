import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

globalThis.document = {
  readyState: "complete",
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
};
globalThis.window = globalThis;
vm.runInThisContext(read("js/mobile-app.js"), { filename: "js/mobile-app.js" });
const M = globalThis.POSMobileApp;

test("mobile app maps dashboard KPIs and paid/unpaid rows", () => {
  const s = M.summarizeDashboard({
    shopName: "Swami Masale",
    today: { bills: 12, takings: 4500 },
    outstanding: 800,
    hub: {
      todayOrders: 9,
      monthPaidOrders: 30,
      monthPendingOrders: 5,
      outstandingCustomers: 3,
      recent: [{ customer_name: "Asha", order_number: "INV1", total: 200, status: "paid" }],
      recentExpenses: [{ customer_name: "Rent", order_number: "EXP1", total: 800, kind: "expense" }],
    },
  });
  assert.equal(s.shop, "Swami Masale");
  assert.equal(s.totalBills, 12);
  assert.equal(s.paid, 30);
  assert.equal(s.pending, 5);
  assert.equal(s.pendingCount, 3);
  assert.equal(s.recent.length, 2);
  assert.equal(M.isPaid({ status: "paid" }), true);
  assert.equal(M.isPaid({ status: "unpaid" }), false);
  assert.equal(M.isPaid({ due: 40 }), false);
  assert.equal(M.isPaid({ balance: 0, status: "cash" }), true);
  assert.equal(M.txStatus({ status: "due", due: 10 }).label, "Due");
  assert.equal(M.isExpense({ kind: "expense" }), true);
  assert.match(M.formatMoney(35000), /35,000|35000/);
  assert.equal(M.formatCount(5), "5");
});

test("phone login starts on welcome unless signup is requested", () => {
  assert.equal(M.authPaneFromLocation("", ""), "welcome");
  assert.equal(M.authPaneFromLocation("?tab=signup", ""), "signup");
  assert.equal(M.authPaneFromLocation("", "#signup"), "signup");
  assert.equal(M.authPaneFromLocation("?tab=signin", ""), "signin");
  assert.equal(M.PHONE_MQ, "(max-width: 720px)");
});

test("InvoiceJet-style chrome is wired on login and POS without breaking pins", () => {
  const login = read("login.html");
  const index = read("index.html");
  const css = read("css/mobile-app.css");
  const js = read("js/mobile-app.js");

  assert.match(login, /login-atav-navratri-dussehra\.jpg/);
  assert.match(login, /js\/login-page\.js\?v=20261010nav2/);
  assert.match(login, /js\/pos-api\.js\?v=20261006login1/);
  assert.match(login, /css\/login-page\.css\?v=20261008loginfile1/);
  assert.match(login, /x-pos-20260830e\.js\?v=20261011lounge1/);
  assert.match(login, /css\/mobile-app\.css\?v=20261012m3/);
  assert.match(login, /js\/mobile-app\.js\?v=20261012m3/);
  assert.match(login, /id="m-welcome"/);
  assert.match(login, /Hello, Welcome back!/);
  assert.match(login, /id="m-go-signin"/);
  assert.match(login, /id="m-go-signup"/);

  assert.match(index, /app\.js\?v=20261012kot2/);
  assert.match(index, /css\/mobile-app\.css\?v=20261012m3/);
  assert.match(index, /js\/mobile-app\.js\?v=20261012m3/);
  assert.match(index, /id="m-home"/);
  assert.match(index, /id="m-reports"/);
  assert.match(index, /data-m-range="month"/);
  assert.match(index, /Create invoice/);
  assert.match(index, /Items \/ Services/);
  assert.match(index, /Last 24 hours/);
  assert.match(index, /id="m-tabbar"/);
  assert.match(index, /id="m-kpi-total"/);
  assert.match(index, /data-m-tab="dashboard"/);
  assert.match(index, /data-m-tab="orders"/);
  assert.match(index, /data-m-tab="reports"/);
  assert.match(index, /data-m-tab="menu"/);
  assert.match(read("m.html"), /POSMobileApp\.paintHome/);

  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(min-width: 721px\)/);
  assert.match(css, /#m-welcome/);
  assert.match(css, /\.m-tabbar/);
  assert.match(js, /function paintHome/);
  assert.match(js, /function paintReports/);
  assert.match(js, /openMobileReport/);
  assert.match(js, /reports-home/);
  assert.match(js, /replace\(\/\\b\\w\/g/);
  assert.match(read("m.html"), /id="m-reports"/);
  assert.match(js, /POSBizHubUi/);
  assert.match(js, /showView/);
  assert.match(js, /monthPaidOrders/);
  assert.match(js, /recentExpenses/);
  assert.match(read("server/hub.js"), /monthPaidOrders/);
  assert.match(read("pos-php-till.php"), /monthPendingOrders/);
  assert.doesNotMatch(js, /password_hash/);
  assert.equal(M.openMobileReport("not-a-report"), false);
  assert.equal(M.openMobileReport("daily-sales"), true);
});
