import assert from "node:assert/strict";
import test from "node:test";
import {
  formatReportDay,
  reportsToSheets,
  summarizeDailySales,
  payModeBucket,
  payStatusBucket,
  assembleDsaSales,
  dsaSalesToSheets,
  DEFAULT_DSA_CODE,
} from "./reports.js";

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

test("apparel item sales and stock sheets include colour and size", () => {
  const data = {
    ...emptyReports("2026-10-01", "2026-10-23"),
    byItem: [{ item_name: "Cotton Kurti", color: "Pink", size: "M", quantity_gm: 2, amount: 1698, gst: 84.9 }],
    stock: [{
      code: "AP-001",
      name: "Cotton Kurti",
      hsn: "6204",
      category: "Kurtis",
      subcategory: "Cotton",
      color: "Pink",
      size: "M",
      stock_gm: 5,
      reorder_level_gm: 1,
      retail_rate: 849,
      b2b_rate: 700,
      purchase_rate: 400,
      gst_rate: 5,
    }],
  };
  const apparel = reportsToSheets(data, { business_type: "Garment & Fashion" });
  const items = apparel.find((s) => s.name === "Item sales");
  assert.deepEqual(items.headers, ["Item", "Colour", "Size", "Qty g", "Amount", "GST"]);
  assert.equal(items.rows[0][0], "Cotton Kurti");
  assert.equal(items.rows[0][1], "Pink");
  assert.equal(items.rows[0][2], "M");
  assert.equal(items.rows[0][3], 2);
  const stock = apparel.find((s) => s.name === "Stock");
  assert.equal(stock.headers[2], "HSN");
  assert.equal(stock.headers[5], "Colour");
  assert.equal(stock.headers[6], "Size");
  assert.equal(stock.rows[0][5], "Pink");
  assert.equal(stock.rows[0][6], "M");
  const pharmacy = reportsToSheets(data, { business_type: "Pharmacy" });
  assert.deepEqual(pharmacy.find((s) => s.name === "Item sales").headers, ["Item", "Qty g", "Amount", "GST"]);
  assert.equal(pharmacy.find((s) => s.name === "Item sales").rows[0][0], "Cotton Kurti");
  assert.equal(pharmacy.find((s) => s.name === "Stock").headers.includes("Colour"), false);
  assert.equal(pharmacy.find((s) => s.name === "Stock").headers[2], "HSN");
  const restaurant = reportsToSheets(emptyReports("2026-10-01", "2026-10-23"), { business_type: "Restaurant" });
  assert.deepEqual(restaurant.find((s) => s.name === "Item sales").headers, ["Item", "Qty g", "Amount", "GST"]);
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

test("assembleDsaSales keeps DSA 0001 and tags invoices by shop", () => {
  assert.equal(DEFAULT_DSA_CODE, "0001");
  const empty = assembleDsaSales([], [], {}, { from: "2026-10-12", to: "2026-10-12" });
  assert.equal(empty.codes.some((c) => c.code === "0001"), true);
  assert.equal(empty.codes.find((c) => c.code === "0001").shops, 0);

  const shops = [
    { id: "a", name: "Alpha", city: "Pune", dsa_code: "0001" },
    { id: "b", name: "Beta", city: "Nashik", dsa_code: "dsa-2" },
  ];
  const sales = [
    {
      id: "1",
      business_id: "a",
      order_number: "INV1",
      customer_name: "Asha",
      payment_method: "cash",
      payment_status: "paid",
      subtotal: 100,
      discount: 0,
      gst: 0,
      total: 100,
      status: "confirmed",
      created_at: "2026-10-12 09:00:00",
    },
    {
      id: "2",
      business_id: "a",
      order_number: "INV2",
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
      id: "3",
      business_id: "b",
      order_number: "INV3",
      customer_name: "Bala",
      payment_method: "upi",
      payment_status: "paid",
      subtotal: 200,
      discount: 0,
      gst: 0,
      total: 200,
      status: "confirmed",
    },
  ];
  const all = assembleDsaSales(shops, sales, { 1: 10 }, { from: "2026-10-12", to: "2026-10-12" });
  assert.equal(all.codes.find((c) => c.code === "0001").shops, 1);
  assert.equal(all.codes.find((c) => c.code === "DSA-2").shops, 1);
  assert.equal(all.invoices.length, 2);

  const filtered = assembleDsaSales(shops, sales, { 1: 10 }, {
    code: "0001",
    from: "2026-10-12",
    to: "2026-10-12",
  });
  assert.equal(filtered.code, "0001");
  assert.equal(filtered.shops.length, 1);
  assert.equal(filtered.invoices.length, 1);
  assert.equal(filtered.invoices[0].shop_name, "Alpha");
  assert.equal(filtered.invoices[0].dsa_code, "0001");
  assert.equal(filtered.invoices[0].net, 90);
  assert.equal(filtered.totals.net, 90);
  assert.equal(filtered.totals.shops, 1);

  const sheets = dsaSalesToSheets(filtered);
  assert.deepEqual(
    sheets.map((s) => s.name),
    ["DSA summary", "DSA shops", "DSA invoices"],
  );
  assert.equal(sheets[0].rows[0][0], "0001");
  assert.equal(sheets[2].rows[0][0], "Alpha");
});
