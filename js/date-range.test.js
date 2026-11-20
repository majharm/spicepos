import assert from "node:assert/strict";
import test from "node:test";
import "./date-range.js";

const R = globalThis.POSDateRange;

test("shop today follows Asia/Kolkata, not UTC", () => {
  const eveningUtc = new Date("2026-11-19T19:00:00.000Z");
  assert.equal(R.shopToday(eveningUtc, "Asia/Kolkata"), "2026-11-20");
  assert.equal(R.shopToday(eveningUtc, "UTC"), "2026-11-19");
});

test("date presets cover the accounts and reports chips", () => {
  assert.deepEqual(R.presetRange("today", "2026-03-15"), { preset: "today", from: "2026-03-15", to: "2026-03-15" });
  assert.deepEqual(R.presetRange("yesterday", "2026-03-15"), { preset: "yesterday", from: "2026-03-14", to: "2026-03-14" });
  assert.deepEqual(R.presetRange("last 7 days", "2026-03-15"), { preset: "last_7", from: "2026-03-09", to: "2026-03-15" });
  assert.deepEqual(R.presetRange("last_30", "2026-03-15"), { preset: "last_30", from: "2026-02-14", to: "2026-03-15" });
  assert.deepEqual(R.presetRange("this month", "2026-03-15"), { preset: "month", from: "2026-03-01", to: "2026-03-15" });
  assert.deepEqual(R.presetRange("last_month", "2026-03-15"), { preset: "last_month", from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(R.presetRange("last_month", "2026-01-10"), { preset: "last_month", from: "2025-12-01", to: "2025-12-31" });
  assert.equal(R.presetRange("custom", "2026-03-15").preset, "custom");
});

test("a reversed custom range is swapped and a blank range is today", () => {
  assert.deepEqual(R.normalizeRange("2026-03-20", "2026-03-01", "2026-03-15"), { from: "2026-03-01", to: "2026-03-20" });
  assert.deepEqual(R.normalizeRange("", "", "2026-03-15"), { from: "2026-03-15", to: "2026-03-15" });
  assert.equal(R.matchingPreset("2026-03-09", "2026-03-15", "2026-03-15"), "last_7");
  assert.equal(R.matchingPreset("2026-03-02", "2026-03-15", "2026-03-15"), "custom");
});
