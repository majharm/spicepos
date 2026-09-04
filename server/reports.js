import { BUSINESS_ID, query } from "./db.js";

function range(from, to) {
  const end = to || new Date().toISOString().slice(0, 10);
  const start = from || "2000-01-01";
  return { start, end };
}

export async function buildReports(from, to) {
  const { start, end } = range(from, to);
  const bid = BUSINESS_ID;
  const salesWhere = "business_id = ? AND DATE(created_at) BETWEEN ? AND ?";
  const poWhere = "business_id = ? AND purchase_date BETWEEN ? AND ?";

  const summary = await query(
    `SELECT COUNT(*) AS bills,
            COALESCE(SUM(subtotal),0) AS taxable,
            COALESCE(SUM(gst),0) AS gst,
            COALESCE(SUM(total),0) AS takings
     FROM sales_orders WHERE ${salesWhere}`,
    [bid, start, end],
  );
  const sales = await query(
    `SELECT order_number, customer_name, customer_type, pack_name, pack_count,
            status, total_quantity_gm, subtotal, gst, total, payment_method,
            payment_status, created_at
     FROM sales_orders WHERE ${salesWhere} ORDER BY created_at`,
    [bid, start, end],
  );
  const byItem = await query(
    `SELECT l.item_name, SUM(l.quantity_gm) AS quantity_gm, SUM(l.amount) AS amount,
            SUM(l.amount * l.gst_rate / 100) AS gst
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id
     WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ? AND l.cancelled = 0
     GROUP BY l.item_name ORDER BY amount DESC`,
    [bid, start, end],
  );
  const byCustomer = await query(
    `SELECT customer_name, customer_type, COUNT(*) AS bills,
            COALESCE(SUM(total),0) AS takings, COALESCE(SUM(gst),0) AS gst
     FROM sales_orders WHERE ${salesWhere}
     GROUP BY customer_name, customer_type ORDER BY takings DESC`,
    [bid, start, end],
  );
  const byPack = await query(
    `SELECT COALESCE(pack_name, 'Loose items') AS pack_type,
            COALESCE(SUM(pack_count),0) AS pack_count,
            COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings
     FROM sales_orders WHERE ${salesWhere}
     GROUP BY COALESCE(pack_name, 'Loose items') ORDER BY takings DESC`,
    [bid, start, end],
  );
  const byPay = await query(
    `SELECT payment_method, COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings
     FROM sales_orders WHERE ${salesWhere}
     GROUP BY payment_method`,
    [bid, start, end],
  );
  const gst = await query(
    `SELECT DATE(created_at) AS day, COALESCE(SUM(subtotal),0) AS taxable,
            COALESCE(SUM(gst),0) AS gst, COALESCE(SUM(total),0) AS total
     FROM sales_orders WHERE ${salesWhere}
     GROUP BY DATE(created_at) ORDER BY day`,
    [bid, start, end],
  );
  const stock = await query(
    `SELECT code, name, local_name, category, subcategory, stock_gm, reorder_level_gm,
            retail_rate, b2b_rate, purchase_rate, gst_rate
     FROM items WHERE business_id = ? ORDER BY name`,
    [bid],
  );
  const low = stock.filter((i) => Number(i.stock_gm) <= Number(i.reorder_level_gm));
  const purchases = await query(
    `SELECT purchase_number, supplier_name, supplier_invoice_number, purchase_date,
            subtotal, gst, total, payment_method, payment_status
     FROM purchases WHERE ${poWhere} ORDER BY purchase_date`,
    [bid, start, end],
  );
  const customers = await query(
    `SELECT code, name, business_name, mobile, type, gstin, credit_limit, outstanding
     FROM customers WHERE business_id = ? ORDER BY name`,
    [bid],
  );

  return {
    from: start,
    to: end,
    summary: summary[0] || { bills: 0, taxable: 0, gst: 0, takings: 0 },
    sales,
    byItem,
    byCustomer,
    byPack,
    byPay,
    gst,
    stock,
    low,
    purchases,
    customers,
  };
}

export function reportsToSheets(data) {
  const num = (v) => Number(v) || 0;
  return [
    {
      name: "Summary",
      headers: ["From", "To", "Bills", "Taxable", "GST", "Takings"],
      rows: [[data.from, data.to, num(data.summary.bills), num(data.summary.taxable), num(data.summary.gst), num(data.summary.takings)]],
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
      name: "GST daywise",
      headers: ["Day", "Taxable", "GST", "Total"],
      rows: data.gst.map((r) => [String(r.day), num(r.taxable), num(r.gst), num(r.total)]),
    },
    {
      name: "Stock",
      headers: ["Code", "Name", "Local", "Category", "Subcategory", "Stock g", "Reorder g", "Retail", "B2B", "Purchase", "GST %"],
      rows: data.stock.map((i) => [
        i.code, i.name, i.local_name, i.category, i.subcategory,
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
      name: "Customers",
      headers: ["Code", "Name", "Business", "Mobile", "Type", "GSTIN", "Credit limit", "Outstanding"],
      rows: data.customers.map((c) => [
        c.code, c.name, c.business_name, c.mobile, c.type, c.gstin,
        num(c.credit_limit), num(c.outstanding),
      ]),
    },
  ];
}
