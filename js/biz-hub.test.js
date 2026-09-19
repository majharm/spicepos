import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
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
  assert.equal(H.DASH_KPIS[0].key, "receivable");
  assert.equal(H.DASH_KPIS[1].key, "payable");
  assert.equal(H.DASH_KPIS[0].featured, true);
});

test("Dashboard uses a Zoho Books-style home shell", () => {
  const index = read("index.html");
  const ui = read("js/biz-hub-ui.js");
  const app = read("js/app.js");
  const css = read("css/pos.css");
  assert.match(index, /zoho-dash-desk/);
  assert.match(index, /Quick Create/);
  assert.match(index, /zoho-widget-link/);
  assert.match(index, /id="open-pos">New</);
  assert.match(index, /biz-hub-ui\.js\?v=20260919salon1/);
  assert.match(ui, /is-featured/);
  assert.match(app, /el\.textContent = "Dashboard"/);
  assert.match(css, /zoho-dash: books home 2026/);
  assert.match(css, /#1a7a6d/);
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
  assert.match(index, /biz-hub\.js\?v=20260919salon1/);
  assert.match(index, /id="rep-pdf"/);
  assert.match(index, /id="rep-pay-mode"/);
  assert.match(app, /POSBizHubUi\?\.paintDashboard/);
  assert.match(app, /globalThis\.state = state/);
  assert.match(app, /Cancelled sales/);
  assert.match(app, /name === "audit"/);
  assert.match(tenant, /buildHubDashboard/);
  assert.match(till, /"hub"/);
});

test("Purchase desk lists all nine documents and opens desks instead of looping", () => {
  const grocery = H.modulesFor({ category: "Grocery" });
  const ids = grocery.filter((m) => m.group === "purchases").map((m) => m.id);
  assert.deepEqual(ids, [
    "purchase-request",
    "purchase-order",
    "grn",
    "purchase-invoice",
    "debit-note",
    "purchase-return",
    "supplier-pay",
    "supplier-due",
    "supplier-ledger",
  ]);
  assert.equal(grocery.find((m) => m.id === "purchase-request").desk, "pr");
  assert.equal(grocery.find((m) => m.id === "purchase-invoice").view, "purchases");
  assert.equal(grocery.find((m) => m.id === "supplier-pay").view, "payments");
  assert.equal(grocery.find((m) => m.id === "supplier-due").acc, "payables");
  assert.equal(grocery.find((m) => m.id === "supplier-ledger").acc, "supplier-ledger");
  assert.ok(H.PURCHASE_DOC_KINDS.pr && H.PURCHASE_DOC_KINDS.po && H.PURCHASE_DOC_KINDS.grn);
  assert.ok(H.PURCHASE_DOC_KINDS.debit && H.PURCHASE_DOC_KINDS.preturn);
  const index = read("index.html");
  const ui = read("js/biz-hub-ui.js");
  const css = read("css/pos.css");
  assert.match(index, /id="hub-purchases-search"/);
  assert.match(index, /id="hub-purchases-work"/);
  assert.match(index, /purchases-desk/);
  assert.match(index, /data-hub-open="purchase-request"/);
  assert.match(index, /data-hub-open="purchase-invoice"/);
  assert.match(index, /data-dash-view="hub-purchases"/);
  assert.match(ui, /function paintPurchaseWork/);
  assert.match(ui, /paintPurchaseWork\(m\.desk\)/);
  assert.match(ui, /PURCHASE_FALLBACK/);
  assert.match(css, /purchases-desk: document types/);
});

test("Purchase Request opens an in-page document form", () => {
  const mem = {};
  const els = {};
  const el = (id, extra = {}) => {
    els[id] = { id, hidden: false, innerHTML: "", value: "", scrollIntoView() {}, ...extra };
    return els[id];
  };
  el("hub-purchases-tiles");
  el("hub-purchases-work", { hidden: true });
  el("hub-purchases-stats");
  el("hub-purchases-search", { value: "" });
  const sandbox = {
    document: {
      getElementById: (id) => els[id] || null,
      addEventListener() {},
      querySelectorAll: () => [],
      querySelector: () => null,
    },
    localStorage: {
      getItem: (k) => mem[k] || null,
      setItem: (k, v) => {
        mem[k] = v;
      },
    },
    state: { session: { business_id: "b1", role: "business_admin" }, suppliers: [] },
    POSBizHub: H,
    console,
    setTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read("js/biz-hub-ui.js"), sandbox);
  sandbox.POSBizHubUi.openModule("purchase-request");
  assert.equal(els["hub-purchases-work"].hidden, false);
  assert.match(els["hub-purchases-work"].innerHTML, /Purchase Request/);
  assert.match(els["hub-purchases-work"].innerHTML, /id="purchase-doc-form"/);
  assert.match(els["hub-purchases-tiles"].innerHTML, /hub-mod-tile is-active/);
});
