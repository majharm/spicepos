import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./footwear.js";
import "./biz-hub.js";

const H = globalThis.POSBizHub;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(name) {
  return readFileSync(path.join(root, name), "utf8");
}

test("Reports Center lists common reports plus pharmacy extras only for pharmacies", () => {
  const grocery = H.reportsFor({ category: "Grocery" });
  const pharm = H.reportsFor({ category: "Medical / Pharmacy" });
  assert.ok(grocery.some((r) => r.id === "daily-sales"));
  assert.ok(grocery.some((r) => r.id === "tax-summary"));
  assert.ok(grocery.some((r) => r.id === "expiry-report"));
  assert.ok(!H.reportsFor({ category: "Garments" }).some((r) => r.id === "expiry-report"));
  assert.ok(pharm.some((r) => r.id === "expiry-report"));
  assert.ok(pharm.some((r) => r.id === "batch-report"));
  assert.equal(H.reportsByCenter({ category: "Grocery" }).length > 6, true);
});

test("Industry modules stay off grocery shops", () => {
  const grocery = H.modulesFor({ category: "Grocery" });
  const resto = H.modulesFor({ category: "Restaurant" });
  assert.ok(!grocery.some((m) => m.id === "resto-kot"));
  assert.ok(resto.some((m) => m.id === "resto-kot"));
  assert.ok(grocery.some((m) => m.id === "counter"));
  assert.ok(H.PAY_MODES.includes("upi") && H.PAY_MODES.includes("neft"));
  assert.ok(H.DASH_KPIS.some((k) => k.key === "todaySales"));
  assert.ok(H.DASH_KPIS.some((k) => k.key === "cashBalance"));
});

test("POS shell wires Reports Center, payments, audit, and hub scripts", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const till = read("pos-php-till.php");
  const tenant = read("server/tenant.js");
  assert.match(index, /id="reports-center"/);
  assert.match(index, /id="view-payments"/);
  assert.match(index, /id="view-audit"/);
  assert.match(index, /id="view-hub-sales"/);
  assert.match(index, /id="dash-sales-graph"/);
  assert.match(index, /biz-hub\.js\?v=20260919hub1/);
  assert.match(index, /id="rep-pdf"/);
  assert.match(index, /id="rep-pay-mode"/);
  assert.match(app, /POSBizHubUi\?\.paintDashboard/);
  assert.match(app, /Cancelled sales/);
  assert.match(app, /name === "audit"/);
  assert.match(tenant, /buildHubDashboard/);
  assert.match(till, /"hub"/);
});
