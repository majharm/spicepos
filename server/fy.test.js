import assert from "node:assert/strict";
import test from "node:test";
import { fyRangeForToday, indianFinancialYear } from "./fy.js";

test("Indian financial year runs 1 April to 31 March", () => {
  const inFy = indianFinancialYear("2026-09-01");
  assert.equal(inFy.from, "2026-04-01");
  assert.equal(inFy.to, "2027-03-31");
  assert.equal(inFy.label, "FY 2026–27");
  const beforeApril = indianFinancialYear("2026-03-31");
  assert.equal(beforeApril.from, "2025-04-01");
  assert.equal(beforeApril.to, "2026-03-31");
});

test("FY range for today is 1 April to 31 March", () => {
  const range = fyRangeForToday("2026-09-01");
  assert.equal(range.from, "2026-04-01");
  assert.equal(range.to, "2027-03-31");
  assert.equal(range.asOf, "2026-09-01");
  const afterEnd = fyRangeForToday("2027-04-15");
  assert.equal(afterEnd.from, "2027-04-01");
  assert.equal(afterEnd.to, "2028-03-31");
  assert.equal(afterEnd.asOf, "2027-04-15");
});
