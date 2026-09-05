import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { analyzeGrowth, answerGrowthQuestion, pctChange, ymdAdd, growthScore } from "./growth.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const snap = {
  today: { bills: 12, takings: 18000, profit: 3200, discount: 200 },
  yesterday: { bills: 10, takings: 15000, profit: 2800 },
  thisWeek: { bills: 60, takings: 90000, profit: 16000 },
  lastWeek: { bills: 52, takings: 79000, profit: 14000 },
  thisMonth: { bills: 210, takings: 320000, profit: 54000, expenses: 18000, discount: 6000 },
  lastMonth: { bills: 190, takings: 280000, profit: 50000, customers: 40 },
  thisYear: { takings: 1200000 },
  lastYear: { takings: 980000 },
  stockValue: 240000,
  outstanding: 18500,
  damageLoss: 900,
  overdueInvoices: 2,
  newCustomers: 8,
  returningCustomers: 22,
  daywise: [
    { label: "2026-08-20", takings: 9000, bills: 8 },
    { label: "2026-09-01", takings: 11000, bills: 10 },
    { label: "2026-09-04", takings: 18000, bills: 12 },
  ],
  hourwise: [
    { label: "10:00", takings: 2000 },
    { label: "18:00", takings: 7000 },
  ],
  weekday: [
    { label: "Monday", takings: 12000 },
    { label: "Saturday", takings: 22000 },
  ],
  products: [
    { itemId: "tea-1", name: "Tea 250g", amount: 42500, profit: 9800, margin: 23, qtyDay: 18, stock: 42, daysLeft: 2, growth: 31, reorder: 20 },
    { itemId: "bisc-1", name: "Biscuits", amount: 18000, profit: 2200, margin: 6, qtyDay: 8, stock: 80, daysLeft: 10, growth: 12, reorder: 10 },
    { name: "Rice 5kg", amount: 36000, profit: 4100, margin: 11, qtyDay: 6, stock: 12, daysLeft: 2, growth: 8, reorder: 15 },
    { name: "Old mix", amount: 0, profit: 0, margin: 0, qtyDay: 0, stock: 40, daysLeft: 99, growth: -40, reorder: 5 },
  ],
  stock: [
    { name: "Rice 5kg", stock: 12, reorder: 15, daysLeft: 2, qtyDay: 6 },
    { name: "Tea 250g", stock: 42, reorder: 20, daysLeft: 2, qtyDay: 18 },
    { name: "Salt", stock: 0, reorder: 10, daysLeft: 0, qtyDay: 2 },
  ],
  customers: [
    { name: "Ravi", bills: 14, takings: 42000, daysSince: 3, segment: "VIP" },
    { name: "Neha", bills: 2, takings: 2400, daysSince: 52, segment: "Inactive" },
  ],
  categories: [{ name: "Grocery", amount: 90000 }],
  branches: [
    { name: "Pune", takings: 200000 },
    { name: "Branch 2", takings: 120000 },
  ],
};

test("growth percent and dates", () => {
  assert.equal(pctChange(114, 100), 14);
  assert.equal(ymdAdd("2026-09-05", -1), "2026-09-04");
  assert.equal(growthScore({ salesGrowth: 14, profitGrowth: 8, customerGrowth: 10, retention: 40, inventoryHealth: 70, expenseControl: 80 }).score > 50, true);
});

test("AI growth analysis writes a shop summary and actions", () => {
  const out = analyzeGrowth(snap);
  assert.match(out.summary, /14%/);
  assert.match(out.summary, /Grocery|fast-moving|evening|Tea|stock/i);
  assert.equal(out.kpis.todaySales, 18000);
  assert.ok(out.score.score >= 1 && out.score.score <= 100);
  assert.ok(out.actions.some((a) => a.level === "urgent"));
  assert.ok(out.actions.some((a) => a.kind === "combo" && a.action === "Create offer"));
  assert.ok(out.inventory.reorders.some((r) => /Rice|Tea|Salt/.test(r.name)));
  assert.ok(out.recommendations.length >= 3);
  assert.ok(out.promotions.length >= 1);
  assert.match(out.discount.note, /Discount|offer|month/i);
});

test("Ask Business AI answers from the same shop snapshot", () => {
  const out = analyzeGrowth(snap);
  assert.match(answerGrowthQuestion("Which products should I reorder?", out), /Rice|Tea|Salt|stock/i);
  assert.match(answerGrowthQuestion("How can I increase my profit?", out), /margin|profit|price/i);
  assert.match(answerGrowthQuestion("Which customers should I target?", out), /customer|inactive|VIP|high-value/i);
  assert.match(answerGrowthQuestion("What is tomorrow's forecast?", out), /tomorrow|7 days|estimate/i);
});

test("shop UI and PHP wire the AI Growth dashboard", () => {
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const growthUi = readFileSync(path.join(root, "js/growth.js"), "utf8");
  const node = readFileSync(path.join(root, "server/index.js"), "utf8");
  const php = readFileSync(path.join(root, "pos-php-till.php"), "utf8");
  const growthPhp = readFileSync(path.join(root, "pos-growth.php"), "utf8");
  const roles = readFileSync(path.join(root, "server/roles.js"), "utf8");
  assert.match(index, /data-view="dashboard"[\s\S]{0,400}data-view="growth"/);
  assert.match(index, /id="open-growth"/);
  assert.match(index, /id="view-growth"/);
  assert.match(index, /js\/growth\.js/);
  assert.match(app, /loadGrowthDashboard/);
  assert.match(growthUi, /Ask Business AI/);
  assert.match(growthUi, /growth-score/);
  assert.match(node, /buildGrowthDashboard/);
  assert.match(node, /\/api\/growth/);
  assert.match(php, /pos_build_growth/);
  assert.match(growthPhp, /function pos_build_growth/);
  assert.match(growthPhp, /function pos_growth_ask/);
  assert.match(roles, /growth/);
});
