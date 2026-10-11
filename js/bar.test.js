import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import "./footwear.js";
import "./bar.js";

const B = globalThis.POSBar;
const F = globalThis.POSFootwear;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("Bar categories, servings, and default catalog cover spirits through mixers", () => {
  for (const cat of ["Whisky", "Rum", "Vodka", "Beer", "Wine", "Cocktails", "Soft Drinks"]) {
    assert.ok(B.CATEGORIES.includes(cat), cat);
  }
  const ids = B.SERVINGS.map((s) => s.id);
  for (const id of ["peg30", "peg60", "quarter", "half", "bottle"]) assert.ok(ids.includes(id), id);
  assert.equal(B.serveMl({ bottle_ml: 750 }, "peg30"), 30);
  assert.equal(B.serveMl({ bottle_ml: 750 }, "peg60"), 60);
  assert.equal(B.serveMl({ bottle_ml: 750 }, "quarter"), 187.5);
  assert.equal(B.serveMl({ bottle_ml: 750 }, "half"), 375);
  assert.equal(B.serveMl({ bottle_ml: 750 }, "bottle"), 750);
  assert.ok(B.defaultProducts().some((p) => p.category === "Whisky"));
  assert.ok(B.defaultTables().length >= 6);
});

test("Peg and bottle prices and remaining millilitres after a serve", () => {
  const product = { bottle_ml: 750, price_bottle: 1500, price_peg30: 120, on_hand_ml: 750 };
  assert.equal(B.servePrice(product, "peg30"), 120);
  assert.equal(B.servePrice({ bottle_ml: 750, price_bottle: 1500 }, "quarter"), 375);
  const sold = B.applySale(product, "peg30", 2);
  assert.equal(sold.used_ml, 60);
  assert.equal(sold.on_hand_ml, 690);
  assert.equal(B.remainingBottles({ bottle_ml: 750, on_hand_ml: 375 }), 0.5);
  const check = B.canSellQty({ on_hand_ml: 20, bottle_ml: 750 }, "peg30", 1);
  assert.equal(check.ok, false);
});

test("Bar bills support item discount, tax, and estimated profit", () => {
  const product = { bottle_ml: 750, price_peg30: 200, cost_bottle: 750, gst_rate: 10 };
  const line = B.lineTotals(product, "peg30", 2, 40);
  assert.equal(line.gross, 400);
  assert.equal(line.discount, 40);
  assert.equal(line.tax, 36);
  assert.equal(line.total, 396);
  assert.equal(line.serve_ml, 60);
  const bill = B.billTotals([line], 20);
  assert.equal(bill.bill_discount, 20);
  assert.equal(bill.taxable, 340);
  assert.equal(bill.tax, 34);
  assert.equal(bill.total, 374);
  assert.ok(bill.profit !== undefined);
});

test("priceCart deducts remaining ml so two pegs cannot oversell one bottle", () => {
  const product = { id: "w", name: "Whisky", bottle_ml: 750, price_peg30: 100, on_hand_ml: 40 };
  const map = { w: product };
  const over = B.priceCart(map, [
    { product_id: "w", serve: "peg30", qty: 1 },
    { product_id: "w", serve: "peg30", qty: 1 },
  ], 0);
  assert.equal(over.ok, false);
  assert.match(over.reason, /Only 10 ml left/);
  const ok = B.priceCart(map, [{ product_id: "w", serve: "peg30", qty: 1 }], 0);
  assert.equal(ok.ok, true);
  assert.equal(ok.priced[0].remaining_ml, 10);
  assert.equal(ok.priced[0].row.serve_ml, 30);
});

test("Stock movements, split/combine, hours, and license rules", () => {
  const opened = B.applyMovement({ on_hand_ml: 0 }, "opening", 750);
  assert.equal(opened.on_hand_ml, 750);
  const waste = B.applyMovement({ on_hand_ml: 750 }, "wastage", 50);
  assert.equal(waste.on_hand_ml, 700);
  const split = B.splitLines([{ a: 1 }, { b: 2 }, { c: 3 }], [0, 2]);
  assert.equal(split.a.length, 2);
  assert.equal(split.b.length, 1);
  const combined = B.combineHolds({ lines: [1], notes: "A" }, { lines: [2], notes: "B" });
  assert.deepEqual(combined.lines, [1, 2]);
  assert.equal(B.inOperatingHours({ open_hour: "11:00", close_hour: "23:00" }, new Date(2026, 9, 11, 12, 0)), true);
  assert.equal(B.inOperatingHours({ open_hour: "11:00", close_hour: "23:00" }, new Date(2026, 9, 11, 9, 0)), false);
  const expired = B.canOperate({ regulated: true, license_expires: "2026-01-01", open_hour: "11:00", close_hour: "23:30" }, new Date(), "2026-10-11");
  assert.equal(expired.ok, false);
  assert.equal(B.canDiscount("bartender", {}), false);
  assert.equal(B.canVoid("manager", {}), true);
  assert.equal(B.canAdjustStock("bartender", { stock: true }), false);
});

test("Bar is a shop kind; restaurants stay restaurant unless Master enables Bar", () => {
  assert.equal(F.shopKind({ business_type: "Bar" }), "bar");
  assert.equal(F.shopKind({ business_type: "Bar & Lounge" }), "restaurant");
  assert.equal(F.shopKind({ category: "Bar & Lounge" }), "restaurant");
  assert.equal(F.shopKind({ name: "The Oak Pub" }), "bar");
  assert.equal(F.shopKind({ name: "Juice Bar Express" }), "general");
  assert.equal(F.shopKind({ business_type: "Restaurant" }), "restaurant");
  assert.equal(F.shopKind({ business_type: "Restaurant", category: "Bar & Lounge" }), "restaurant");
  assert.equal(F.shopKind({ category: "Food & beverage" }), "restaurant");
  assert.equal(F.isRestaurantShop({ category: "Bar & Lounge" }), true);
  assert.equal(F.isBarShop({ business_type: "Bar" }), true);
  assert.equal(B.isBarShop({ business_type: "Bar" }), true);
  assert.equal(B.isBarShop({ business_type: "Restaurant" }), false);
  assert.equal(B.isBarShop({ business_type: "Restaurant", bar_enabled: 1 }), true);
  assert.equal(B.isBarShop({ business_type: "Restaurant", category: "Bar & Lounge" }), true);
  assert.equal(B.isBarShop({ business_type: "Restaurant", name: "Joe's Bar" }), false);
  assert.equal(F.isRestaurantShop({ business_type: "Restaurant", bar_enabled: 1 }), true);
  assert.equal(F.qrOrderingEnabled({ business_type: "Bar" }), true);
  assert.ok(F.suggestedItemCategories({ business_type: "Bar" }).includes("Whisky"));
  assert.equal(F.defaultUnit({ business_type: "Bar" }), "ML");
  assert.match(F.itemFormCopy({ business_type: "Bar" }).lede, /Bar Counter/);
});

test("Bar POS, PHP, signup, Master Admin toggle, and hub are wired", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const node = read("server/index.js");
  const core = read("pos-php-core.php");
  assert.match(index, /id="view-bar-board"/);
  assert.match(index, /id="view-bar-counter"/);
  assert.match(index, /id="view-bar-products"/);
  assert.match(index, /id="view-bar-tables"/);
  assert.match(index, /id="view-bar-stock"/);
  assert.match(index, /id="bar-settings-box"/);
  assert.match(index, /js\/bar\.js\?v=20261011lounge1/);
  assert.match(index, /js\/bar-ui\.js\?v=20261011bar2/);
  assert.match(index, /css\/bar\.css\?v=20261011bar2/);
  const ui = read("js/bar-ui.js");
  assert.match(ui, /payBtn\.onclick = checkout/);
  assert.match(ui, /\|\| paying\) return/);
  assert.match(ui, /bar_enabled/);
  const php = read("pos-bar.php");
  assert.match(php, /NULLIF\(\?, ''\)/);
  assert.match(php, /function pos_bar_can_operate/);
  assert.match(php, /remaining_ml/);
  assert.match(php, /"total" => \$tot\["total"\]/);
  assert.match(read("server/bar.js"), /priceCart/);
  assert.match(index, /bartender/);
  assert.match(app, /function isBarShop/);
  assert.match(app, /bar-mode/);
  assert.match(node, /registerBarStaff/);
  assert.match(node, /ensureBarSchema/);
  assert.match(core, /pos_bar_staff_dispatch/);
  assert.match(core, /function pos_is_bar_shop/);
  assert.match(core, /bar_enabled/);
  assert.match(read("js/login.js"), /Restaurant"\) return \["Food & beverage", "Bar & Lounge"\]/);
  assert.match(read("js/x-pos-20260830e.js"), /Restaurant"\) return \["Food & beverage", "Bar & Lounge"\]/);
  assert.match(read("js/master.js"), /Restaurant: \["Food & beverage", "Bar & Lounge"\]/);
  assert.match(read("login.html"), />Bar</);
  assert.match(read("login.html"), /Bar &amp; Lounge/);
  assert.match(read("js/biz-hub.js"), /bar-board/);
  assert.match(read("js/master.js"), /"Bar"/);
  assert.match(read("js/master.js"), /barEnabled/);
  assert.match(read("js/master.js"), /Enable Bar Business Model/);
  assert.match(read("home.html"), /Bar &amp; Lounge/);
  assert.match(read("server/bar.js"), /on_hand_ml/);
  assert.match(read("server/bar.js"), /peg30/);
  assert.match(read("server/onboard.js"), /bar_enabled/);
  assert.match(read("pos-bar.php"), /function pos_bar_staff_dispatch/);
  assert.match(read("pos-bar.php"), /Only .* ml left/);
  assert.match(read("server/roles.js"), /bartender/);
  assert.match(read("package.json"), /js\/bar\.test\.js/);
  assert.equal(B.REPORTS.length, 13);
  assert.ok(B.PAY_MODES.includes("upi"));
  assert.equal(B.ROLES.some((r) => r.id === "bartender"), true);
});
