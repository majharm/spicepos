import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import "./footwear.js";
import "./gym.js";

const G = globalThis.POSGym;
const F = globalThis.POSFootwear;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("Gym plans cover monthly through personal training including couple, family, and student", () => {
  const ids = G.PLAN_KINDS.map((p) => p.id);
  for (const id of ["monthly", "quarterly", "half_yearly", "yearly", "custom", "couple", "family", "student", "personal_training"]) {
    assert.ok(ids.includes(id), id);
  }
  assert.equal(G.planDurationDays("quarterly"), 90);
  assert.equal(G.planDurationDays("custom", 45), 45);
  assert.equal(G.planDurationDays("monthly", 45), 45);
  const win = G.membershipWindow("2026-10-08", "monthly");
  assert.equal(win.start_date, "2026-10-08");
  assert.equal(win.end_date, "2026-11-07");
  const customWin = G.membershipWindow("2026-10-08", "monthly", 45);
  assert.equal(customWin.end_date, "2026-11-22");
});

test("Member status is active, expired, or frozen from end date", () => {
  assert.equal(G.memberStatus({ end_date: "2026-12-01" }, "2026-10-08"), "active");
  assert.equal(G.memberStatus({ end_date: "2026-09-01" }, "2026-10-08"), "expired");
  assert.equal(G.memberStatus({ status: "frozen", end_date: "2026-12-01" }, "2026-10-08"), "frozen");
  assert.equal(G.memberStatus({}, "2026-10-08"), "expired");
  assert.equal(G.ymdLocal(new Date(2026, 9, 8)), "2026-10-08");
  assert.match(G.ymdIst(new Date("2026-10-07T22:00:00.000Z")), /^2026-10-08$/);
});

test("Membership bill supports admission, discount, and partial payment due", () => {
  const t = G.billTotals({ planPrice: 1500, admissionFee: 500, discount: 200, paid: 1000 });
  assert.equal(t.total, 1800);
  assert.equal(t.paid, 1000);
  assert.equal(t.due, 800);
});

test("BMI and member QR payload round-trip", () => {
  assert.equal(G.bmi(80, 180), 24.69);
  const qr = G.qrPayload("shop-1", "mem-9");
  assert.equal(qr, "ATAVGYM:shop-1:mem-9");
  assert.deepEqual(G.parseQr(qr), { shopId: "shop-1", memberId: "mem-9" });
  assert.equal(G.parseQr("junk"), null);
});

test("Gym is a separate shop kind, not salon/services, and uses SAC", () => {
  assert.equal(F.shopKind({ business_type: "Gym & Fitness Center" }), "gym");
  assert.equal(F.shopKind({ category: "Gym & Fitness Center" }), "gym");
  assert.equal(F.shopKind({ name: "Iron Health Club" }), "gym");
  assert.equal(F.isGymShop({ category: "Gym & Fitness Center" }), true);
  assert.equal(F.isServicesShop({ category: "Gym & Fitness Center" }), false);
  assert.equal(G.isGymShop({ category: "Gym & Fitness Center" }), true);
  assert.equal(F.taxCodeLabel({ category: "Gym & Fitness Center" }), "SAC");
  assert.equal(F.qrOrderingEnabled({ category: "Gym & Fitness Center" }), false);
  assert.ok(F.suggestedItemCategories({ category: "Gym & Fitness Center" }).includes("Personal Training"));
  assert.ok(F.suggestedItemCategories({ category: "Gym & Fitness Center" }).includes("Supplements"));
});

test("Gym POS, PHP, portal, signup, and hub are wired", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const node = read("server/index.js");
  const core = read("pos-php-core.php");
  assert.match(index, /id="view-gym-board"/);
  assert.match(index, /id="view-gym-members"/);
  assert.match(index, /id="view-gym-attendance"/);
  assert.match(index, /id="view-gym-trainers"/);
  assert.match(index, /id="view-gym-plans"/);
  assert.match(index, /js\/gym\.js\?v=20261008gym3/);
  assert.match(index, /js\/gym-ui\.js\?v=20261008gym3/);
  assert.match(index, /id="gym-portal-link"/);
  assert.match(index, /gym\.html/);
  assert.match(app, /function isGymShop/);
  assert.match(app, /gym-mode/);
  assert.match(node, /registerGymPublic/);
  assert.match(node, /url\.startsWith\("\/api\/gym\/public"\)/);
  assert.match(core, /pos_gym_public_dispatch/);
  assert.match(core, /pos_gym_staff_dispatch/);
  assert.match(read("gym.html"), /js\/gym\.js\?v=20261008gym3/);
  assert.match(read("gym.html"), /Online membership registration/);
  assert.match(read("gym.html"), /Member QR code card/);
  assert.match(read("js/login.js"), /Gym & Fitness Center/);
  assert.match(read("login.html"), /Gym &amp; Fitness Center/);
  assert.match(read("js/biz-hub.js"), /gym-board/);
  assert.match(read("js/master.js"), /Gym & Fitness Center/);
  assert.match(read("home.html"), /Gym &amp; Fitness/);
  assert.match(read("server/gym.js"), /password_hash=\?, name=\?, email=\?/);
  assert.match(read("server/gym.js"), /password_hash: _hash/);
  assert.match(read("server/gym.js"), /Asia\/Kolkata/);
  assert.match(read("server/gym.js"), /Scan a member QR code/);
  assert.match(read("pos-gym.php"), /This mobile is already registered/);
  assert.match(read("pos-gym.php"), /unset\(\$full\["password_hash"\]\)/);
  assert.match(read("pos-gym.php"), /pos_shop_timezone/);
  assert.match(read("package.json"), /js\/gym\.test\.js/);
  assert.equal(G.REPORTS.length, 11);
  assert.ok(G.SERVICES.includes("Zumba"));
  assert.ok(G.PAY_MODES.includes("upi"));
  assert.match(G.noticeCopy("reminder", { name: "Asha", end_date: "2026-10-15" }), /2026-10-15/);
});
