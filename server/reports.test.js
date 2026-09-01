import assert from "node:assert/strict";
import test from "node:test";
import { formatReportDay, reportsToSheets } from "./reports.js";

const emptyReports = (from, to) => ({
  from,
  to,
  summary: { bills: 0, taxable: 0, gst: 0, inputGst: 0, netGst: 0, takings: 0 },
  sales: [],
  byItem: [],
  byCustomer: [],
  byPack: [],
  byPay: [],
  gst: [],
  gstByRate: [],
  gstInputByRate: [],
  gstHsn: [],
  gstB2B: [],
  gstB2C: [],
  stock: [],
  low: [],
  purchases: [],
  customers: [],
});

test("formatReportDay keeps calendar dates from ISO and Date values", () => {
  assert.equal(formatReportDay("2026-08-30T00:00:00.000Z"), "2026-08-30");
  assert.equal(formatReportDay(new Date("2026-08-01T00:00:00.000Z")), "2026-08-01");
  assert.equal(formatReportDay("2026-08-15"), "2026-08-15");
  assert.equal(formatReportDay(""), "");
});

test("reportsToSheets includes extended GST report sheets", () => {
  const sheets = reportsToSheets(emptyReports("2026-08-01", "2026-08-30"));
  assert.ok(sheets.some((s) => s.name === "GST daywise"));
  assert.ok(sheets.some((s) => s.name === "GST output by rate"));
  assert.ok(sheets.some((s) => s.name === "GST B2B sales"));
  assert.equal(sheets[0].rows[0][2], 0);
});

test("GST daywise sheet uses YYYY-MM-DD not a Date string", () => {
  const sheets = reportsToSheets({
    ...emptyReports("2026-08-01", "2026-08-30"),
    gst: [{ day: new Date("2026-08-21T00:00:00.000Z"), taxable: 10, gst: 0.5, total: 10.5 }],
  });
  const gst = sheets.find((s) => s.name === "GST daywise");
  assert.equal(gst.rows[0][0], "2026-08-21");
});
