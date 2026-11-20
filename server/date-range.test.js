import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { cashBookCodes } from "./accounting.js";
import { normalizeRange, presetRange, shopToday } from "./date-range.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("shop presets and reversed ranges stay on the Kolkata calendar", () => {
  assert.equal(shopToday(new Date("2026-11-19T19:00:00.000Z"), "Asia/Kolkata"), "2026-11-20");
  assert.deepEqual(presetRange("last_7", "2026-11-20"), { preset: "last_7", from: "2026-11-14", to: "2026-11-20" });
  assert.deepEqual(normalizeRange("2026-11-20", "2026-11-01"), { from: "2026-11-01", to: "2026-11-20" });
});

test("account statements ignore vouchers outside the selected dates", () => {
  for (const rel of ["server/accounting.js", "pos-accounting.php"]) {
    const src = read(rel);
    assert.match(src, /CASE WHEN j\.id IS NULL THEN 0 ELSE l\.debit END/, rel);
    assert.match(src, /voucher_date >= \? AND j\.voucher_date < DATE_ADD\(\?, INTERVAL 1 DAY\)/, rel);
    assert.match(src, /openingBalance|opening/, rel);
  }
  assert.deepEqual(cashBookCodes("cash"), ["1001"]);
  assert.deepEqual(cashBookCodes("bank"), ["1002", "1003"]);
  assert.deepEqual(cashBookCodes("nope"), ["1001", "1002", "1003"]);
});

test("reports, purchases, and expenses use the same inclusive end date", () => {
  for (const rel of ["server/reports.js", "pos-reports.php", "server/purchase-item-report.js", "pos-item-purchases.php"]) {
    const src = read(rel);
    assert.match(src, /DATE_ADD\(\?, INTERVAL 1 DAY\)/, rel);
    assert.doesNotMatch(src, /purchase_date BETWEEN \? AND \?/, rel);
    assert.doesNotMatch(src, /expense_date BETWEEN \? AND \?/, rel);
  }
});

test("shop and master desks share the date chips", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  for (const label of ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "This Month", "Last Month", "Custom"]) {
    assert.match(index, new RegExp(`data-rep-preset="[^"]*"[^>]*>${label}`));
    assert.match(index, new RegExp(`data-acc-preset="[^"]*"[^>]*>${label}`));
  }
  assert.match(index, /date-range\.js\?v=/);
  assert.match(app, /POSDateRange/);
  assert.match(app, /data-acc-tab="bank-book"|bank-book/);
  assert.match(read("pos-php-core.php"), /function pos_normalize_range/);
  assert.match(read("pos-php-core.php"), /Asia\/Kolkata/);
});
