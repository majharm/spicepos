import { query } from "./db.js";
import { bid } from "./context.js";
import { formatReportDay } from "./report-format.js";

export { emptyReports, formatReportDay, reportsToSheets } from "./report-format.js";

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
  const gst = (await query(
    `SELECT DATE(created_at) AS day, COALESCE(SUM(subtotal),0) AS taxable,
            COALESCE(SUM(gst),0) AS gst, COALESCE(SUM(total),0) AS total
     FROM sales_orders WHERE ${salesWhere}
     GROUP BY DATE(created_at) ORDER BY day`,
    [tenant, start, end],
  )).map((r) => ({ ...r, day: formatReportDay(r.day) }));
  const stock = await query(
    `SELECT code, name, local_name, category, subcategory, stock_gm, reorder_level_gm,
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
  const customers = await query(
    `SELECT code, name, business_name, mobile, type, gstin, credit_limit, outstanding
     FROM customers WHERE business_id = ? ORDER BY name`,
    [tenant],
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
