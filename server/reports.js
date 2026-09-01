import { query } from "./db.js";
import { bid } from "./context.js";

function range(from, to) {
  const end = to || new Date().toISOString().slice(0, 10);
  const start = from || "2000-01-01";
  return { start, end };
}

export async function buildReports(from, to) {
  const { start, end } = range(from, to);
  const tenant = bid();
  const salesWhere = "business_id = ? AND DATE(created_at) BETWEEN ? AND ?";
  const poWhere = "business_id = ? AND purchase_date BETWEEN ? AND ?";

  const summary = await query(
    `SELECT COUNT(*) AS bills,
            COALESCE(SUM(subtotal),0) AS taxable,
            COALESCE(SUM(gst),0) AS gst,
            COALESCE(SUM(total),0) AS takings
     FROM sales_orders WHERE ${salesWhere}`,
    [tenant, start, end],
  );
  const sales = await query(
    `SELECT order_number, customer_name, customer_type, pack_name, pack_count,
            status, total_quantity_gm, subtotal, gst, total, payment_method,
            payment_status, created_at
     FROM sales_orders WHERE ${salesWhere} ORDER BY created_at`,
    [tenant, start, end],
  );
  const byItem = await query(
    `SELECT l.item_name, SUM(l.quantity_gm) AS quantity_gm, SUM(l.amount) AS amount,
            SUM(l.amount * l.gst_rate / 100) AS gst
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id
     WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ? AND l.cancelled = 0
     GROUP BY l.item_name ORDER BY amount DESC`,
    [tenant, start, end],
  );
  const byCustomer = await query(
    `SELECT customer_name, customer_type, COUNT(*) AS bills,
            COALESCE(SUM(total),0) AS takings, COALESCE(SUM(gst),0) AS gst
     FROM sales_orders WHERE ${salesWhere}
     GROUP BY customer_name, customer_type ORDER BY takings DESC`,
    [tenant, start, end],
  );
  const byPack = await query(
    `SELECT COALESCE(pack_name, 'Loose items') AS pack_type,
            COALESCE(SUM(pack_count),0) AS pack_count,
            COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings
     FROM sales_orders WHERE ${salesWhere}
     GROUP BY COALESCE(pack_name, 'Loose items') ORDER BY takings DESC`,
    [tenant, start, end],
  );
  const byPay = await query(
    `SELECT payment_method, COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings
     FROM sales_orders WHERE ${salesWhere}
     GROUP BY payment_method`,
    [tenant, start, end],
  );
  const payDaywise = await query(
    `SELECT DATE(created_at) AS day,
            COUNT(*) AS bills,
            COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'cash' THEN total ELSE 0 END),0) AS cash,
            COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'upi' THEN total ELSE 0 END),0) AS upi,
            COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'card' THEN total ELSE 0 END),0) AS card,
            COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'credit' THEN total ELSE 0 END),0) AS credit,
            COALESCE(SUM(CASE WHEN LOWER(COALESCE(payment_method,'')) NOT IN ('cash','upi','card','credit') THEN total ELSE 0 END),0) AS other,
            COALESCE(SUM(total),0) AS total
     FROM sales_orders WHERE ${salesWhere}
     GROUP BY DATE(created_at) ORDER BY day`,
    [tenant, start, end],
  );
  const gst = await query(
    `SELECT DATE(created_at) AS day, COALESCE(SUM(subtotal),0) AS taxable,
            COALESCE(SUM(gst),0) AS gst, COALESCE(SUM(total),0) AS total
     FROM sales_orders WHERE ${salesWhere}
     GROUP BY DATE(created_at) ORDER BY day`,
    [tenant, start, end],
  );
  const stock = await query(
    `SELECT code, name, hsn, local_name, category, subcategory, stock_gm, reorder_level_gm,
            retail_rate, b2b_rate, purchase_rate, gst_rate
     FROM items WHERE business_id = ? ORDER BY name`,
    [tenant],
  );
  const low = stock.filter((i) => Number(i.stock_gm) <= Number(i.reorder_level_gm));
  const purchases = await query(
    `SELECT purchase_number, supplier_name, supplier_invoice_number, purchase_date,
            subtotal, gst, total, payment_method, payment_status
     FROM purchases WHERE ${poWhere} ORDER BY purchase_date`,
    [tenant, start, end],
  );
  const expenses = await query(
    `SELECT expense_number, expense_date, category, account_code, amount, gst, payment_method, notes,
            (amount + gst) AS total
     FROM expenses WHERE business_id = ? AND expense_date BETWEEN ? AND ?
     ORDER BY expense_date`,
    [tenant, start, end],
  );
  const expenseSum = await query(
    `SELECT COALESCE(SUM(amount),0) AS amount, COALESCE(SUM(gst),0) AS gst, COUNT(*) AS bills
     FROM expenses WHERE business_id = ? AND expense_date BETWEEN ? AND ?`,
    [tenant, start, end],
  );
  const customers = await query(
    `SELECT code, name, business_name, mobile, type, gstin, credit_limit, outstanding
     FROM customers WHERE business_id = ? ORDER BY name`,
    [tenant],
  );
  const gstByRate = await query(
    `SELECT l.gst_rate,
            SUM(l.amount) AS taxable,
            SUM(l.amount * l.gst_rate / 100) AS gst,
            SUM(l.quantity_gm) AS quantity_gm,
            COUNT(DISTINCT o.id) AS bills
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id
     WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ? AND l.cancelled = 0
     GROUP BY l.gst_rate ORDER BY l.gst_rate`,
    [tenant, start, end],
  );
  const gstInputByRate = await query(
    `SELECT l.gst_rate,
            SUM(l.amount) AS taxable,
            COALESCE(SUM(l.gst_amount), SUM(l.amount * l.gst_rate / 100)) AS gst
     FROM purchase_lines l
     JOIN purchases p ON p.id = l.purchase_id
     WHERE p.business_id = ? AND p.purchase_date BETWEEN ? AND ?
     GROUP BY l.gst_rate ORDER BY l.gst_rate`,
    [tenant, start, end],
  );
  const gstHsn = await query(
    `SELECT COALESCE(NULLIF(TRIM(i.hsn), ''), i.code, '—') AS hsn, l.item_name, l.gst_rate,
            SUM(l.quantity_gm) AS quantity_gm,
            SUM(l.amount) AS taxable,
            SUM(l.amount * l.gst_rate / 100) AS gst
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id
     LEFT JOIN items i ON i.id = l.item_id
     WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ? AND l.cancelled = 0
     GROUP BY COALESCE(i.code, '—'), l.item_name, l.gst_rate
     ORDER BY hsn, l.item_name`,
    [tenant, start, end],
  );
  const gstB2B = await query(
    `SELECT o.order_number, DATE(o.created_at) AS bill_date, o.customer_name, c.gstin,
            o.subtotal AS taxable, o.gst, o.total
     FROM sales_orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ?
       AND c.gstin IS NOT NULL AND TRIM(c.gstin) <> ''
     ORDER BY o.created_at`,
    [tenant, start, end],
  );
  const gstB2C = await query(
    `SELECT o.order_number, DATE(o.created_at) AS bill_date, o.customer_name,
            o.subtotal AS taxable, o.gst, o.total
     FROM sales_orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ?
       AND (c.gstin IS NULL OR TRIM(c.gstin) = '')
     ORDER BY o.created_at`,
    [tenant, start, end],
  );
  const purchaseGst = await query(
    `SELECT COALESCE(SUM(subtotal),0) AS taxable, COALESCE(SUM(gst),0) AS gst, COALESCE(SUM(total),0) AS total
     FROM purchases WHERE ${poWhere}`,
    [tenant, start, end],
  );
  const outputGst = Number(summary[0]?.gst || 0);
  const inputGst = Number(purchaseGst[0]?.gst || 0) + Number(expenseSum[0]?.gst || 0);

  return {
    from: start,
    to: end,
    summary: {
      ...(summary[0] || { bills: 0, taxable: 0, gst: 0, takings: 0 }),
      inputGst,
      netGst: outputGst - inputGst,
      expenses: Number(expenseSum[0]?.amount || 0) + Number(expenseSum[0]?.gst || 0),
      expenseBills: Number(expenseSum[0]?.bills || 0),
    },
    sales,
    byItem,
    byCustomer,
    byPack,
    byPay,
    payDaywise,
    gst,
    gstByRate,
    gstInputByRate,
    gstHsn,
    gstB2B,
    gstB2C,
    stock,
    low,
    purchases,
    expenses,
    customers,
  };
}

export function formatReportDay(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value ?? "");
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

export function reportsToSheets(data) {
  const num = (v) => Number(v) || 0;
  const half = (v) => num(v) / 2;
  const gstRateRows = (data.gstByRate || []).map((r) => {
    const gst = num(r.gst);
    return [num(r.gst_rate), num(r.taxable), half(gst), half(gst), gst, num(r.bills)];
  });
  const gstInputRows = (data.gstInputByRate || []).map((r) => {
    const gst = num(r.gst);
    return [num(r.gst_rate), num(r.taxable), half(gst), half(gst), gst];
  });
  return [
    {
      name: "Summary",
      headers: ["From", "To", "Bills", "Taxable", "Output GST", "Input GST", "Net GST", "Takings"],
      rows: [[
        data.from,
        data.to,
        num(data.summary.bills),
        num(data.summary.taxable),
        num(data.summary.gst),
        num(data.summary.inputGst),
        num(data.summary.netGst),
        num(data.summary.takings),
      ]],
    },
    {
      name: "Sales bills",
      headers: ["Order", "Customer", "Type", "Pack", "Pack count", "Status", "Qty g", "Taxable", "GST", "Total", "Pay", "Pay status", "Date"],
      rows: data.sales.map((o) => [
        o.order_number,
        o.customer_name,
        o.customer_type,
        o.pack_name || "Loose items",
        num(o.pack_count),
        o.status,
        num(o.total_quantity_gm),
        num(o.subtotal),
        num(o.gst),
        num(o.total),
        o.payment_method,
        o.payment_status,
        String(o.created_at),
      ]),
    },
    {
      name: "Item sales",
      headers: ["Item", "Qty g", "Amount", "GST"],
      rows: data.byItem.map((r) => [r.item_name, num(r.quantity_gm), num(r.amount), num(r.gst)]),
    },
    {
      name: "Customer sales",
      headers: ["Customer", "Type", "Bills", "Takings", "GST"],
      rows: data.byCustomer.map((r) => [r.customer_name, r.customer_type, num(r.bills), num(r.takings), num(r.gst)]),
    },
    {
      name: "Pack sales",
      headers: ["Pack type", "Pack count", "Bills", "Takings"],
      rows: data.byPack.map((r) => [r.pack_type, num(r.pack_count), num(r.bills), num(r.takings)]),
    },
    {
      name: "Payment",
      headers: ["Method", "Bills", "Takings"],
      rows: data.byPay.map((r) => [r.payment_method, num(r.bills), num(r.takings)]),
    },
    {
      name: "Payment daywise",
      headers: ["Day", "Cash", "UPI", "Card", "Credit", "Other", "Bills", "Total"],
      rows: (data.payDaywise || []).map((r) => [
        formatReportDay(r.day),
        num(r.cash),
        num(r.upi),
        num(r.card),
        num(r.credit),
        num(r.other),
        num(r.bills),
        num(r.total),
      ]),
    },
    {
      name: "GST daywise",
      headers: ["Day", "Taxable", "GST", "Total"],
      rows: data.gst.map((r) => [formatReportDay(r.day), num(r.taxable), num(r.gst), num(r.total)]),
    },
    {
      name: "GST output by rate",
      headers: ["GST %", "Taxable", "CGST", "SGST", "Total GST", "Bills"],
      rows: gstRateRows,
    },
    {
      name: "GST input by rate",
      headers: ["GST %", "Taxable", "CGST", "SGST", "Total GST"],
      rows: gstInputRows,
    },
    {
      name: "GST HSN itemwise",
      headers: ["HSN/SKU", "Item", "GST %", "Qty g", "Taxable", "GST"],
      rows: (data.gstHsn || []).map((r) => [
        r.hsn, r.item_name, num(r.gst_rate), num(r.quantity_gm), num(r.taxable), num(r.gst),
      ]),
    },
    {
      name: "GST B2B sales",
      headers: ["Bill", "Date", "Customer", "GSTIN", "Taxable", "GST", "Total"],
      rows: (data.gstB2B || []).map((r) => [
        r.order_number, formatReportDay(r.bill_date), r.customer_name, r.gstin, num(r.taxable), num(r.gst), num(r.total),
      ]),
    },
    {
      name: "GST B2C sales",
      headers: ["Bill", "Date", "Customer", "Taxable", "GST", "Total"],
      rows: (data.gstB2C || []).map((r) => [
        r.order_number, formatReportDay(r.bill_date), r.customer_name, num(r.taxable), num(r.gst), num(r.total),
      ]),
    },
    {
      name: "Stock",
      headers: ["Code", "Name", "HSN", "Category", "Subcategory", "Stock g", "Reorder g", "Retail", "B2B", "Purchase", "GST %"],
      rows: data.stock.map((i) => [
        i.code, i.name, i.hsn, i.category, i.subcategory,
        num(i.stock_gm), num(i.reorder_level_gm), num(i.retail_rate), num(i.b2b_rate),
        num(i.purchase_rate), num(i.gst_rate),
      ]),
    },
    {
      name: "Low stock",
      headers: ["Code", "Name", "Stock g", "Reorder g"],
      rows: data.low.map((i) => [i.code, i.name, num(i.stock_gm), num(i.reorder_level_gm)]),
    },
    {
      name: "Purchases",
      headers: ["PO", "Supplier", "Invoice", "Date", "Taxable", "GST", "Total", "Pay", "Status"],
      rows: data.purchases.map((p) => [
        p.purchase_number, p.supplier_name, p.supplier_invoice_number, p.purchase_date,
        num(p.subtotal), num(p.gst), num(p.total), p.payment_method, p.payment_status,
      ]),
    },
    {
      name: "Expenses",
      headers: ["No.", "Date", "Category", "Amount", "GST", "Total", "Pay", "Notes"],
      rows: (data.expenses || []).map((e) => [
        e.expense_number, e.expense_date, e.category, num(e.amount), num(e.gst),
        num(e.total || Number(e.amount) + Number(e.gst)), e.payment_method, e.notes,
      ]),
    },
    {
      name: "Customers",
      headers: ["Code", "Name", "Business", "Mobile", "Type", "GSTIN", "Credit limit", "Outstanding"],
      rows: data.customers.map((c) => [
        c.code, c.name, c.business_name, c.mobile, c.type, c.gstin,
        num(c.credit_limit), num(c.outstanding),
      ]),
    },
  ];
}
