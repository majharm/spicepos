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
  payDaywise: [],
  gst: [],
  gstByRate: [],
  gstInputByRate: [],
  gstHsn: [],
  gstB2B: [],
  gstB2C: [],
  stock: [],
  low: [],
  purchases: [],
  expenses: [],
  customers: [],
});

test("formatReportDay keeps calendar dates from ISO and Date values", () => {
  assert.equal(formatReportDay("2026-08-30T00:00:00.000Z"), "2026-08-30");
  assert.equal(formatReportDay(new Date("2026-08-01T00:00:00.000Z")), "2026-08-01");
  assert.equal(formatReportDay("2026-08-15"), "2026-08-15");
  assert.equal(formatReportDay(""), "");
});

test("reportsToSheets includes GST summary and IGST columns", () => {
  const sheets = reportsToSheets(emptyReports("2026-08-01", "2026-08-30"));
  assert.ok(sheets.some((s) => s.name === "GST summary"));
  assert.ok(sheets.some((s) => s.name === "GST daywise"));
  assert.ok(sheets.some((s) => s.name === "GST output by rate"));
  assert.ok(sheets.some((s) => s.name === "GST B2B sales"));
  assert.equal(sheets.find((s) => s.name === "GST output by rate").headers[4], "IGST");
  assert.equal(sheets.find((s) => s.name === "Stock").headers[2], "HSN");
  assert.equal(sheets.find((s) => s.name === "Summary").rows[0][2], 0);
});

test("GST daywise sheet uses YYYY-MM-DD not a Date string", () => {
  const sheets = reportsToSheets({
    ...emptyReports("2026-08-01", "2026-08-30"),
    gst: [{ day: new Date("2026-08-21T00:00:00.000Z"), taxable: 10, gst: 0.5, total: 10.5 }],
  });
  const gst = sheets.find((s) => s.name === "GST daywise");
  assert.equal(gst.rows[0][0], "2026-08-21");
});

test("Payment daywise sheet splits cash UPI card credit by calendar day", () => {
  const sheets = reportsToSheets({
    ...emptyReports("2026-08-01", "2026-08-02"),
    payDaywise: [
      {
        day: new Date("2026-08-01T00:00:00.000Z"),
        cash: 1200,
        upi: 800.5,
        card: 0,
        credit: 250,
        other: 0,
        bills: 4,
        total: 2250.5,
      },
    ],
  });
  const pay = sheets.find((s) => s.name === "Payment daywise");
  assert.ok(pay);
  assert.deepEqual(pay.headers, ["Day", "Cash", "UPI", "Card", "Credit", "Other", "Bills", "Total"]);
  assert.equal(pay.rows[0][0], "2026-08-01");
  assert.equal(pay.rows[0][1], 1200);
  assert.equal(pay.rows[0][2], 800.5);
  assert.equal(pay.rows[0][4], 250);
  assert.equal(pay.rows[0][6], 4);
  assert.equal(pay.rows[0][7], 2250.5);
});
