import assert from "node:assert/strict";
import test from "node:test";
import { formatReportDay, reportsToSheets, summarizeDailySales, payModeBucket, payStatusBucket } from "./reports.js";

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
  const sac = reportsToSheets(emptyReports("2026-08-01", "2026-08-30"), { business_type: "Services" });
  assert.equal(sac.find((s) => s.name === "Stock").headers[2], "SAC");
  assert.ok(sac.some((s) => s.name === "GST SAC itemwise"));
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

test("summarizeDailySales is invoice-wise, skips voids, nets returns, and avoids duplicates", () => {
  assert.equal(payModeBucket("credit-card"), "card");
  assert.equal(payModeBucket("UPI"), "upi");
  assert.equal(payStatusBucket("due"), "unpaid");
  assert.equal(payStatusBucket("partially-paid"), "partial");
  const out = summarizeDailySales(
    [
      {
        id: "1",
        order_number: "INV1",
        customer_name: "Asha",
        payment_method: "cash",
        payment_status: "paid",
        subtotal: 100,
        discount: 10,
        gst: 5,
        total: 95,
        status: "confirmed",
      },
      {
        id: "1",
        order_number: "INV1",
        customer_name: "Asha",
        payment_method: "cash",
        payment_status: "paid",
        subtotal: 100,
        discount: 10,
        gst: 5,
        total: 95,
        status: "confirmed",
      },
      {
        id: "2",
        order_number: "INV2",
        customer_name: "Bala",
        payment_method: "upi",
        payment_status: "unpaid",
        subtotal: 200,
        discount: 0,
        gst: 10,
        total: 210,
        status: "confirmed",
      },
      {
        id: "3",
        order_number: "INV3",
        customer_name: "Void",
        payment_method: "cash",
        payment_status: "paid",
        subtotal: 50,
        discount: 0,
        gst: 0,
        total: 50,
        status: "cancelled",
      },
      {
        id: "4",
        order_number: "INV4",
        customer_name: "Cardy",
        payment_method: "card",
        payment_status: "partial",
        subtotal: 300,
        discount: 0,
        gst: 15,
        total: 315,
        status: "confirmed",
      },
      {
        id: "5",
        order_number: "INV5",
        customer_name: "Credit",
        payment_method: "credit",
        payment_status: "due",
        subtotal: 80,
        discount: 0,
        gst: 4,
        total: 84,
        status: "confirmed",
      },
    ],
    { 2: 10 },
  );
  assert.equal(out.invoices.length, 4);
  assert.equal(out.totals.bills, 4);
  assert.equal(out.totals.cash, 95);
  assert.equal(out.totals.upi, 200);
  assert.equal(out.totals.card, 315);
  assert.equal(out.totals.credit, 84);
  assert.equal(out.totals.net, 694);
  assert.equal(out.totals.paid, 1);
  assert.equal(out.totals.unpaid, 2);
  assert.equal(out.totals.partial, 1);
  assert.equal(out.invoices.find((i) => i.id === "2").returned, 10);
  assert.equal(out.invoices.find((i) => i.id === "2").net, 200);
  assert.equal(
    out.totals.cash + out.totals.upi + out.totals.card + out.totals.credit + out.totals.other,
    out.totals.net,
  );
});

test("Daily Sales sheet uses invoice totals not payment entries", () => {
  const sheets = reportsToSheets({
    ...emptyReports("2026-10-12", "2026-10-12"),
    dailySales: summarizeDailySales([
      {
        id: "9",
        order_number: "INV9",
        customer_name: "Neha",
        payment_method: "cash",
        payment_status: "paid",
        subtotal: 500,
        discount: 20,
        gst: 24,
        total: 504,
        created_at: "2026-10-12 09:15:00",
      },
    ]),
  });
  const daily = sheets.find((s) => s.name === "Daily Sales");
  assert.ok(daily);
  assert.equal(daily.headers[0], "Invoice");
  assert.equal(daily.headers[6], "Discount");
  assert.equal(daily.rows[0][0], "INV9");
  assert.equal(daily.rows[0][9], 504);
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
