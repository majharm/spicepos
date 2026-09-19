import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import "./footwear.js";
import "./salon.js";

const S = globalThis.POSSalon;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("₹1,000 service with ₹300 fixed advance leaves ₹700 due", () => {
  const due = S.advanceDue(1000, "fixed", 300);
  assert.equal(due.total, 1000);
  assert.equal(due.advance, 300);
  assert.equal(due.remaining, 700);
  assert.equal(S.advanceDue(1000, "percent", 30).advance, 300);
  assert.equal(S.advanceDue(1000, "full").remaining, 0);
  assert.equal(S.advanceDue(1000, "none").advance, 0);
});

test("Bridal package shows individual total, package price, and savings", () => {
  const save = S.packageSavings(
    [
      { name: "Facial", qty: 2, price: 800 },
      { name: "Hair Spa", qty: 2, price: 1200 },
      { name: "Manicure", qty: 1, price: 400 },
      { name: "Pedicure", qty: 1, price: 500 },
      { name: "Makeup", qty: 1, price: 2500 },
    ],
    5000,
  );
  assert.equal(save.individualTotal, 7400);
  assert.equal(save.packagePrice, 5000);
  assert.equal(save.savings, 2400);
});

test("Package usage tracks remaining sessions", () => {
  const u = S.packageUsage(10, 3);
  assert.equal(u.usedSessions, 3);
  assert.equal(u.remainingSessions, 7);
  assert.equal(u.status, "active");
  assert.equal(S.packageUsage(10, 10).status, "exhausted");
});

test("Booking status can move pending to confirmed then no-show, not skip to completed", () => {
  assert.equal(S.canTransition("pending", "confirmed"), true);
  assert.equal(S.canTransition("pending", "cancelled"), true);
  assert.equal(S.canTransition("confirmed", "no_show"), true);
  assert.equal(S.canTransition("pending", "completed"), false);
  assert.equal(S.canTransition("in_service", "completed"), true);
});

test("Same-day slots skip occupied times", () => {
  const slots = S.slotsForDay("2026-09-20", 60, [{ start: "10:00", duration_min: 60 }]);
  assert.ok(slots.some((s) => s.start === "10:00" && !s.available));
  assert.ok(slots.some((s) => s.start === "11:00" && s.available));
});

test("Invoice fields include advance, previous due, and outstanding", () => {
  const inv = S.invoiceFields(
    {
      customer_name: "Asha",
      booking_number: "BK-10001",
      staff_name: "Neha",
      booking_date: "2026-09-20",
      start_time: "11:00",
      coupon_pct: 0,
      previous_due: 200,
      advance_paid: 300,
      lines: [{ price: 1000, qty: 1, gst_rate: 0, discount_pct: 0 }],
    },
    { amount: 300, method: "upi", txn_id: "TXN-1" },
  );
  assert.equal(inv.advance_paid, 300);
  assert.equal(inv.current_due, 700);
  assert.equal(inv.outstanding, 900);
  assert.match(S.noticeCopy("booking_confirm", { booking_number: "BK-10001", date: "2026-09-20", time: "11:00" }), /BK-10001/);
});

test("Salon engine is one services shop with ten categories and POS wiring", () => {
  const cats = S.CATEGORIES;
  assert.ok(cats.includes("Salon") && cats.includes("Unisex Salon") && cats.includes("Ladies Salon"));
  assert.ok(cats.includes("Gents Salon") && cats.includes("Beauty Parlour") && cats.includes("Spa"));
  assert.ok(cats.includes("Massage") && cats.includes("Hair Studio") && cats.includes("Nail Studio") && cats.includes("Makeup Studio"));
  assert.equal(S.isSalonShop({ category: "Ladies Salon" }), true);
  assert.equal(globalThis.POSFootwear.shopKind({ category: "Spa" }), "services");
  const index = read("index.html");
  const app = read("js/app.js");
  const node = read("server/index.js");
  const core = read("pos-php-core.php");
  assert.match(index, /id="view-salon-board"/);
  assert.match(index, /id="view-bookings"/);
  assert.match(index, /id="view-packages"/);
  assert.match(index, /id="item-duration"/);
  assert.match(index, /js\/salon\.js\?v=20260919salon1/);
  assert.match(index, /js\/salon-ui\.js\?v=20260919salon1/);
  assert.match(index, /id="salon-portal-link"/);
  assert.match(index, /salon\.html/);
  assert.match(app, /function isServicesShop/);
  assert.match(app, /\/api\/salon\/services\//);
  assert.match(node, /registerSalonPublic/);
  assert.match(node, /url\.startsWith\("\/api\/salon\/public"\)/);
  assert.match(core, /pos_salon_public_dispatch/);
  assert.match(read("salon.html"), /Email \+ password/);
  assert.match(read("salon.html"), /sp-otp-send/);
  assert.match(read("js/login.js"), /Makeup Studio/);
  assert.match(read("js/biz-hub.js"), /salon-board/);
  assert.equal(S.REPORTS.length, 18);
  assert.equal(S.PAY_MODES.includes("split"), true);
});
