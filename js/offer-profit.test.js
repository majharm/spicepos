import test from "node:test";
import assert from "node:assert/strict";
import "./offer-profit.js";

const P = globalThis.POSOfferProfit;

function line(partial) {
  return {
    order_id: partial.order_id,
    item_name: partial.item_name,
    quantity_gm: partial.qty ?? 1,
    amount: partial.amount,
    discount: partial.discount || 0,
    cost: partial.cost,
    gst_rate: partial.gst_rate || 0,
    category: partial.category || "Grocery",
  };
}

test("profit formulas follow selling price, cost, discounts, royalty, and expenses", () => {
  const row = P.lineProfit({
    sellingPrice: 1000,
    purchaseCost: 600,
    discount: 100,
    loyalty: 50,
    gst: 90,
    expenses: 20,
  });
  assert.equal(row.grossProfit, 400);
  assert.equal(row.netSales, 850);
  assert.equal(row.netProfit, 230);
  assert.equal(row.totalSales, 940);
  assert.equal(row.margin, 27.06);
  assert.equal(P.lineProfit({ sellingPrice: 10, purchaseCost: 10, discount: 10, loyalty: 0 }).margin, 0);
});

test("date presets cover today, yesterday, this week, and this month", () => {
  assert.deepEqual(P.presetRange("today", "2026-11-07"), { preset: "today", from: "2026-11-07", to: "2026-11-07" });
  assert.deepEqual(P.presetRange("yesterday", "2026-11-07"), { preset: "yesterday", from: "2026-11-06", to: "2026-11-06" });
  assert.deepEqual(P.presetRange("this_week", "2026-11-07"), { preset: "week", from: "2026-11-02", to: "2026-11-07" });
  assert.deepEqual(P.presetRange("month", "2026-11-07"), { preset: "month", from: "2026-11-01", to: "2026-11-07" });
  assert.equal(P.presetRange("week", "2026-11-01").from, "2026-10-26");
});

test("offer code prefers a saved code, otherwise a short name code", () => {
  assert.equal(P.offerCode({ name: "Diwali Offer", code: "DIWALI10" }), "DIWALI10");
  assert.equal(P.offerCode({ name: "Buy 1 Get 1" }), "BUY1GET1");
  assert.equal(P.offerCode({ name: "10% Discount", conditions_json: "{\"code\":\"FLAT10\"}" }), "FLAT10");
});

test("dashboard matches offer sales, profit, and discount for one business", () => {
  const biz = "shop-1";
  const report = P.assembleOfferProfit({
    scope: { businessId: biz },
    from: "2026-11-01",
    to: "2026-11-30",
    expenses: 0,
    offers: [
      { id: "diwali", name: "Diwali Offer", code: "DIWALI" },
      { id: "ten", name: "10% Discount", code: "FLAT10" },
      { id: "bogo", name: "Buy 1 Get 1", code: "B1G1" },
    ],
    redemptions: [
      { offer_id: "diwali", order_id: "o1" },
      { offer_id: "ten", order_id: "o2" },
      { offer_id: "bogo", order_id: "o3" },
    ],
    orders: [
      { id: "o1", order_number: "SO-1", business_id: biz, branch_id: "b1", status: "confirmed", created_at: "2026-11-01", subtotal: 50000, discount: 5000, gst: 0, total: 45000 },
      { id: "o2", order_number: "SO-2", business_id: biz, branch_id: "b1", status: "confirmed", created_at: "2026-11-02", subtotal: 29000, discount: 4000, gst: 0, total: 25000 },
      { id: "o3", order_number: "SO-3", business_id: biz, branch_id: "b1", status: "confirmed", created_at: "2026-11-02", subtotal: 18000, discount: 3000, gst: 0, total: 15000 },
      { id: "o4", order_number: "SO-4", business_id: biz, branch_id: "b1", status: "confirmed", created_at: "2026-11-03", subtotal: 165000, discount: 0, gst: 0, total: 165000 },
      { id: "o5", order_number: "SO-5", business_id: "other-shop", status: "confirmed", created_at: "2026-11-03", subtotal: 999, discount: 0, gst: 0, total: 999 },
      { id: "o6", order_number: "SO-6", business_id: biz, status: "cancelled", created_at: "2026-11-03", subtotal: 800, discount: 0, gst: 0, total: 800 },
    ],
    lines: [
      line({ order_id: "o1", item_name: "Sweets", amount: 50000, cost: 33000 }),
      line({ order_id: "o2", item_name: "Rice", amount: 29000, cost: 17500 }),
      line({ order_id: "o3", item_name: "Soap", amount: 18000, cost: 12000 }),
      line({ order_id: "o4", item_name: "Atta", amount: 165000, cost: 122500 }),
      line({ order_id: "o5", item_name: "Other", amount: 999, cost: 1 }),
    ],
  });
  assert.equal(report.dashboard.totalSales, 250000);
  assert.equal(report.dashboard.totalProfit, 65000);
  assert.equal(report.dashboard.offerSales, 85000);
  assert.equal(report.dashboard.totalDiscount, 12000);
  assert.deepEqual(
    report.dashboard.offers.map((row) => [row.name, row.sales, row.profit]),
    [
      ["Diwali Offer", 45000, 12000],
      ["10% Discount", 25000, 7500],
      ["Buy 1 Get 1", 15000, 3000],
    ],
  );
  assert.equal(new Set(report.byDay.map((row) => row.day)).size, 2);
  assert.equal(report.byMonth.length, 3);
  assert.equal(new Set(report.byMonth.map((row) => row.month)).size, 1);
  assert.equal(report.byMonth[0].month, "2026-11");
  assert.equal(report.profitLines.find((row) => row.invoice === "SO-1").grossProfit, 17000);
  const html = P.dashboardHtml(report.dashboard);
  assert.match(html, /Total Sales/);
  assert.match(html, /Total Profit/);
  assert.match(html, /Offer Sales/);
  assert.match(html, /Total Discount/);
  assert.match(html, /₹2,50,000\.00/);
  assert.match(html, /₹65,000\.00/);
  assert.match(html, /₹85,000\.00/);
  assert.match(html, /₹12,000\.00/);
  assert.match(html, /Diwali Offer/);
  const sections = P.reportSectionsHtml(report, { excel: "/excel", pdf: "/pdf" });
  assert.match(sections, /Offer Wise Sales Report/);
  assert.match(sections, /Sales Wise Profit Report/);
  assert.match(sections, /Profit &amp; Loss Summary/);
  assert.match(sections, /DIWALI/);
  assert.match(sections, /data-report-sheet="Sales Wise Profit"/);
  const sheets = P.sheetsFromReport(report);
  assert.deepEqual(sheets.map((s) => s.name), [
    "Profit summary",
    "Offer Wise Sales",
    "Offer by day",
    "Offer by month",
    "Sales Wise Profit",
    "Offer comparison",
  ]);
});

test("a bill with two offers is listed twice and counted once in offer sales", () => {
  const report = P.assembleOfferProfit({
    scope: { businessId: "shop-1" },
    offers: [
      { id: "a", name: "Festival", code: "FEST" },
      { id: "b", name: "Happy hour", code: "HAPPY" },
    ],
    redemptions: [
      { offer_id: "a", order_id: "o1" },
      { offer_id: "a", order_id: "o1" },
      { offer_id: "b", order_id: "o1" },
    ],
    orders: [
      { id: "o1", order_number: "SO-9", business_id: "shop-1", status: "paid", created_at: "2026-11-04", subtotal: 1000, discount: 100, gst: 0, total: 900 },
    ],
    lines: [line({ order_id: "o1", item_name: "Tea", amount: 1000, cost: 400 })],
  });
  assert.equal(report.offers.length, 2);
  assert.equal(report.offers[0].totalSales, 900);
  assert.equal(report.offers[1].totalSales, 900);
  assert.equal(report.dashboard.offerSales, 900);
  assert.equal(report.offers[0].bills, 1);
});

test("product, category, and offer filters narrow lines without leaving the business", () => {
  const report = P.assembleOfferProfit({
    scope: { businessId: "shop-1", branchId: "b2" },
    filters: { product: "Tea", category: "Grocery", offer: "fest" },
    offers: [{ id: "fest", name: "Festival", code: "FEST" }],
    redemptions: [{ offer_id: "fest", order_id: "o1" }],
    orders: [
      { id: "o1", order_number: "SO-1", business_id: "shop-1", branch_id: "b2", status: "confirmed", created_at: "2026-11-04", subtotal: 300, discount: 0, gst: 30, total: 330 },
      { id: "o2", order_number: "SO-2", business_id: "shop-1", branch_id: "b1", status: "confirmed", created_at: "2026-11-04", subtotal: 500, discount: 0, gst: 0, total: 500 },
    ],
    lines: [
      line({ order_id: "o1", item_name: "Tea", category: "Grocery", amount: 100, cost: 40, gst_rate: 5, qty: 2 }),
      line({ order_id: "o1", item_name: "Milk", category: "Grocery", amount: 200, cost: 100, gst_rate: 5, qty: 1 }),
      line({ order_id: "o2", item_name: "Tea", category: "Grocery", amount: 500, cost: 10, qty: 4 }),
    ],
  });
  assert.equal(report.profitLines.length, 1);
  assert.equal(report.profitLines[0].product, "Tea");
  assert.equal(report.profitLines[0].qty, 2);
  assert.equal(report.profitLines[0].branchId, "b2");
  assert.ok(report.profitLines[0].gst > 0);
});

test("manual discounts become an offer row and royalty points reduce net profit", () => {
  const report = P.assembleOfferProfit({
    scope: { businessId: "shop-1" },
    orders: [
      {
        id: "o1",
        order_number: "SO-8",
        business_id: "shop-1",
        status: "confirmed",
        created_at: "2026-11-05",
        subtotal: 200,
        discount: 20,
        loyalty_discount: 30,
        gst: 15,
        total: 165,
      },
    ],
    lines: [line({ order_id: "o1", item_name: "Oil", amount: 200, discount: 10, cost: 80, gst_rate: 5 })],
  });
  assert.equal(report.offers[0].name, "Manual discount");
  assert.equal(report.offers[0].code, "MANUAL");
  const row = report.profitLines[0];
  assert.equal(row.loyalty, 30);
  assert.equal(row.discount, 30);
  assert.equal(row.grossProfit, P.round2(210 - 80));
  assert.equal(row.netProfit, P.round2(210 - 80 - 30 - 30));
});

test("operating expenses reduce net profit, and a branch filter leaves them off", () => {
  const base = {
    orders: [
      { id: "o1", order_number: "SO-1", business_id: "shop-1", branch_id: "b1", status: "confirmed", created_at: "2026-11-01", subtotal: 100, discount: 0, gst: 0, total: 100 },
    ],
    lines: [line({ order_id: "o1", item_name: "Item", amount: 100, cost: 40 })],
    expenses: 25,
  };
  const all = P.assembleOfferProfit({ ...base, scope: { businessId: "shop-1" } });
  assert.equal(all.summary.netProfit, 35);
  assert.equal(all.summary.expenses, 25);
  const branch = P.assembleOfferProfit({ ...base, scope: { businessId: "shop-1", branchId: "b1" } });
  assert.equal(branch.summary.expenses, 0);
  assert.equal(branch.summary.expensesOmitted, true);
  assert.equal(branch.summary.netProfit, 60);
});

test("owners cannot cross businesses; master admin can consolidate and filter", () => {
  assert.throws(
    () => P.resolveReportScope({ businessId: "shop-1", role: "business_admin" }, { business: "shop-2" }),
    /own business/,
  );
  assert.throws(() => P.resolveReportScope({ role: "business_admin" }, {}), /own business/);
  const owner = P.resolveReportScope({ businessId: "shop-1", role: "business_admin", branchId: "b1" }, { branch: "b9" });
  assert.equal(owner.businessId, "shop-1");
  assert.equal(owner.branchId, "b9");
  assert.equal(owner.locked, false);
  const manager = P.resolveReportScope({ businessId: "shop-1", role: "branch_manager", branchId: "b1" }, { branch: "b9" });
  assert.equal(manager.branchId, "b1");
  assert.equal(manager.locked, true);
  const master = P.resolveReportScope({ master: true, role: "master_admin" }, {});
  assert.equal(master.allBusinesses, true);
  assert.equal(master.businessId, null);
  const one = P.resolveReportScope({ master: true }, { business: "shop-2", branch: "b3" });
  assert.equal(one.businessId, "shop-2");
  assert.equal(one.branchId, "b3");
  assert.equal(one.allBusinesses, false);
});

test("master consolidation keeps every business and the report html says so", () => {
  const report = P.assembleOfferProfit({
    scope: { master: true, allBusinesses: true },
    orders: [
      { id: "a", order_number: "A-1", business_id: "shop-1", business_name: "Alpha", status: "confirmed", created_at: "2026-11-01", subtotal: 100, discount: 0, gst: 0, total: 100 },
      { id: "b", order_number: "B-1", business_id: "shop-2", business_name: "Beta", status: "confirmed", created_at: "2026-11-01", subtotal: 40, discount: 10, gst: 0, total: 30 },
    ],
    lines: [
      line({ order_id: "a", item_name: "A", amount: 100, cost: 20 }),
      line({ order_id: "b", item_name: "B", amount: 40, cost: 10 }),
    ],
    businesses: [{ id: "shop-1", name: "Alpha" }, { id: "shop-2", name: "Beta" }],
  });
  assert.equal(report.dashboard.totalSales, 130);
  assert.equal(report.byBusiness.length, 2);
  const html = P.masterPageHtml(report, { excel: "/e", pdf: "/p" });
  assert.match(html, /Consolidated report of all businesses/);
  assert.match(html, /Alpha/);
  assert.match(html, /Beta/);
  assert.match(html, /id="op-business"/);
});
