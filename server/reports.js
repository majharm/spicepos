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
  let stock;
  try {
    stock = await query(
      `SELECT code, name, local_name, generic_name, medicine_type, manufacturer, category,
              pack_unit, units_per_pack, stock_gm, reorder_level_gm, mrp, selling_price,
              retail_rate, purchase_rate, gst_rate, hsn, barcode
       FROM items WHERE business_id = ? ORDER BY name`,
      [bid],
    );
  } catch {
    stock = await query(
      `SELECT code, name, local_name, category, subcategory, stock_gm, reorder_level_gm,
              retail_rate, b2b_rate, purchase_rate, gst_rate
       FROM items WHERE business_id = ? ORDER BY name`,
      [bid],
    );
  }
  const low = stock.filter((i) => Number(i.stock_gm) <= Number(i.reorder_level_gm));
  let purchases;
  try {
    purchases = await query(
      `SELECT purchase_number, supplier_name, supplier_invoice_number, purchase_date,
              subtotal, gst, cgst, sgst, igst, total, payment_method, payment_status,
              purchase_order_no, eway_bill_no
       FROM purchases WHERE ${poWhere} ORDER BY purchase_date`,
      [bid, start, end],
    );
  } catch {
    purchases = await query(
      `SELECT purchase_number, supplier_name, supplier_invoice_number, purchase_date,
              subtotal, gst, total, payment_method, payment_status
       FROM purchases WHERE ${poWhere} ORDER BY purchase_date`,
      [bid, start, end],
    );
  }
  const batches = await query(
    `SELECT b.batch_no, b.expiry_date, b.qty, b.mrp, i.code, i.name, i.generic_name
     FROM item_batches b JOIN items i ON i.id = b.item_id
     WHERE b.business_id = ? ORDER BY b.expiry_date`,
    [bid],
  ).catch(() => []);
  const expiry = batches.filter((b) => {
    if (!b.expiry_date) return false;
    const d = new Date(b.expiry_date);
    const now = new Date();
    const soon = new Date();
    soon.setDate(soon.getDate() + 90);
    return d < soon;
  });
  const returns = await query(
    `SELECT return_number, order_number, customer_name, reason, subtotal, gst, total, created_at
     FROM sales_returns WHERE business_id = ? AND DATE(created_at) BETWEEN ? AND ?
     ORDER BY created_at`,
    [bid, start, end],
  ).catch(() => []);
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
    batches,
    expiry,
    returns,
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
      headers: ["Order", "Customer", "Type", "Status", "Qty", "Taxable", "GST", "Total", "Pay", "Pay status", "Date"],
      rows: data.sales.map((o) => [
        o.order_number,
        o.customer_name,
        o.customer_type,
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
      headers: ["Medicine", "Qty", "Amount", "GST"],
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
      headers: ["Code", "Name", "Generic", "Type", "Mfr", "Pack", "Stock", "Reorder", "MRP", "Sale", "Purchase", "GST %", "HSN"],
      rows: data.stock.map((i) => [
        i.code, i.name, i.generic_name || i.local_name, i.medicine_type, i.manufacturer, i.pack_unit,
        num(i.stock_gm), num(i.reorder_level_gm), num(i.mrp), num(i.selling_price || i.retail_rate),
        num(i.purchase_rate), num(i.gst_rate), i.hsn,
      ]),
    },
    {
      name: "Low stock",
      headers: ["Code", "Name", "Stock", "Reorder"],
      rows: data.low.map((i) => [i.code, i.name, num(i.stock_gm), num(i.reorder_level_gm)]),
    },
    {
      name: "Batches",
      headers: ["Code", "Medicine", "Generic", "Batch", "Expiry", "Qty", "MRP"],
      rows: (data.batches || []).map((b) => [b.code, b.name, b.generic_name, b.batch_no, String(b.expiry_date || ""), num(b.qty), num(b.mrp)]),
    },
    {
      name: "Expiry",
      headers: ["Code", "Medicine", "Batch", "Expiry", "Qty"],
      rows: (data.expiry || []).map((b) => [b.code, b.name, b.batch_no, String(b.expiry_date || ""), num(b.qty)]),
    },
    {
      name: "Purchases",
      headers: ["PO", "Supplier", "Invoice", "Date", "Taxable", "GST", "Total", "Pay", "Status", "E-Way"],
      rows: data.purchases.map((p) => [
        p.purchase_number, p.supplier_name, p.supplier_invoice_number, p.purchase_date,
        num(p.subtotal), num(p.gst), num(p.total), p.payment_method, p.payment_status, p.eway_bill_no,
      ]),
    },
    {
      name: "Returns",
      headers: ["Return", "Bill", "Customer", "Reason", "Taxable", "GST", "Total", "Date"],
      rows: (data.returns || []).map((r) => [
        r.return_number, r.order_number, r.customer_name, r.reason,
        num(r.subtotal), num(r.gst), num(r.total), String(r.created_at),
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
