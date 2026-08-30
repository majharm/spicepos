import assert from "node:assert/strict";
import test from "node:test";
import { emptyReports, formatReportDay, reportsToSheets } from "./report-format.js";

test("formatReportDay keeps calendar dates from ISO and Date values", () => {
  assert.equal(formatReportDay("2026-08-30T00:00:00.000Z"), "2026-08-30");
  assert.equal(formatReportDay(new Date("2026-08-01T00:00:00.000Z")), "2026-08-01");
  assert.equal(formatReportDay("2026-08-15"), "2026-08-15");
  assert.equal(formatReportDay(""), "");
});

test("reportsToSheets includes every report type even when empty", () => {
  const sheets = reportsToSheets(emptyReports("2026-08-01", "2026-08-30"));
  assert.deepEqual(
    sheets.map((s) => s.name),
    [
      "Summary",
      "Sales bills",
      "Item sales",
      "Customer sales",
      "Pack sales",
      "Payment",
      "GST daywise",
      "Stock",
      "Low stock",
      "Purchases",
      "Customers",
    ],
  );
  assert.equal(sheets[0].rows[0][2], 0);
  assert.equal(sheets[0].rows[0][5], 0);
});

test("summary takings falls back to total from PHP stub shape", () => {
  const sheets = reportsToSheets({
    from: "2026-08-01",
    to: "2026-08-30",
    summary: { bills: 2, taxable: 100, gst: 5, total: 105 },
  });
  assert.equal(sheets[0].rows[0][5], 105);
});

test("GST daywise sheet uses YYYY-MM-DD not a Date string", () => {
  const sheets = reportsToSheets({
    ...emptyReports("2026-08-01", "2026-08-30"),
    gst: [{ day: new Date("2026-08-21T00:00:00.000Z"), taxable: 10, gst: 0.5, total: 10.5 }],
  });
  const gst = sheets.find((s) => s.name === "GST daywise");
  assert.equal(gst.rows[0][0], "2026-08-21");
});
