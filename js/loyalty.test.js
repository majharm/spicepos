import test from "node:test";
import assert from "node:assert/strict";
import "./loyalty.js";

const L = globalThis.POSLoyalty;

test("earn one point per ₹100 by default and redeem at ₹1 per point", () => {
  const s = L.settingsFrom({});
  assert.equal(L.earnPoints(450, s), 4);
  assert.equal(L.earnPoints(99, s), 0);
  assert.equal(L.redeemValue(25, s), 25);
  const ok = L.canRedeem(40, 25, s);
  assert.equal(ok.ok, true);
  assert.equal(ok.rupees, 25);
  const low = L.canRedeem(40, 5, s);
  assert.equal(low.ok, false);
});

test("customer tiers follow lifetime spend thresholds", () => {
  const s = L.settingsFrom({});
  assert.equal(L.tierFromSpend(0, s), "bronze");
  assert.equal(L.tierFromSpend(10000, s), "silver");
  assert.equal(L.tierFromSpend(50000, s), "gold");
  assert.equal(L.tierFromSpend(150000, s), "platinum");
  assert.equal(L.tierLabel("gold"), "Gold");
});

test("birthday match uses month and day", () => {
  assert.equal(L.isBirthdayToday("1990-09-03", "2026-09-03"), true);
  assert.equal(L.isBirthdayToday("1990-09-03", "2026-09-04"), false);
  assert.equal(L.isBirthdayToday("", "2026-09-03"), false);
});
