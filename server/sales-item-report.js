import { query } from "./db.js";
import { bid } from "./context.js";
import { requireStaff, requirePerm } from "./auth.js";
import { workbookXml } from "./excel.js";
import { createdBetween, saleNotVoidSql } from "./sql-time.js";
import "../js/discount.js";
import "../js/sales-item-report.js";
import "../js/offer-profit.js";

const R = globalThis.POSSalesItemReport;

function ymd(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function filtersOf(source) {
  return {
    product: String(source.product || "").trim(),
    category: String(source.category || "").trim(),
    customer: String(source.customer || "").trim(),
    brand: String(source.brand || "").trim(),
    invoice: String(source.invoice || "").trim(),
    branch: String(source.branch || "").trim(),
    item: String(source.item || "").trim(),
  };
}

function lineSql(flags) {
  const brand = flags.brand ? "COALESCE(i.brand,'')" : "''";
  const branchJoin = flags.branch ? "LEFT JOIN branches br ON br.id = o.branch_id" : "";
  const branchName = flags.branch ? "br.name" : "''";
  const held = flags.held ? "AND COALESCE(o.held,0) = 0" : "";
  const loyalty = flags.loyalty ? "o.loyalty_discount" : "0";
  return `SELECT l.id, l.item_id, l.item_name, l.quantity_gm, l.rate_per_kg, COALESCE(l.discount,0) AS discount,
            l.amount, l.gst_rate, COALESCE(l.cancelled,0) AS cancelled, l.barcode AS line_barcode,
            o.id AS order_id, o.order_number, o.customer_name, o.status, o.branch_id, o.created_at AS sale_date,
            o.subtotal AS order_subtotal, o.discount AS order_discount, ${loyalty} AS order_loyalty, o.gst AS order_gst,
            i.code, i.barcode AS item_barcode, i.category, ${brand} AS brand, i.name AS catalog_name,
            ${branchName} AS branch_name
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id AND o.business_id = l.business_id
     LEFT JOIN items i ON i.id = l.item_id AND i.business_id = o.business_id
     ${branchJoin}
     WHERE o.business_id = ? AND ${createdBetween("o")} AND ${saleNotVoidSql("o")}
       AND COALESCE(l.cancelled,0) = 0
       ${held}`;
}

async function selectLines(businessId, from, to) {
  const plans = [
    { brand: 1, branch: 1, held: 1, loyalty: 1 },
    { brand: 1, branch: 1, held: 0, loyalty: 1 },
    { brand: 1, branch: 0, held: 0, loyalty: 0 },
    { brand: 0, branch: 0, held: 0, loyalty: 0 },
  ];
  let last = null;
  for (const flags of plans) {
    try {
      return await query(lineSql(flags), [businessId, from, to]);
    } catch (err) {
      last = err;
    }
  }
  throw last || new Error("Sales lines did not load");
}

async function selectReturns(businessId, from, to) {
  const plans = [
    `SELECT rl.id, rl.item_id, rl.item_name, rl.item_code, rl.quantity_gm, rl.rate_per_kg, rl.amount, rl.gst_rate,
            r.return_number, r.customer_name, r.created_at AS sale_date, r.order_id, r.status, r.branch_id,
            o.order_number, i.category, i.brand, i.code, i.barcode, br.name AS branch_name
     FROM sales_return_lines rl
     JOIN sales_returns r ON r.id = rl.return_id AND r.business_id = rl.business_id
     LEFT JOIN sales_orders o ON o.id = r.order_id
     LEFT JOIN items i ON i.id = rl.item_id AND i.business_id = r.business_id
     LEFT JOIN branches br ON br.id = r.branch_id
     WHERE r.business_id = ? AND r.created_at >= ? AND r.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       AND LOWER(COALESCE(r.status,'')) <> 'cancelled'`,
    `SELECT rl.id, rl.item_id, rl.item_name, rl.quantity_gm, rl.amount, rl.gst_rate,
            r.return_number, r.customer_name, r.created_at AS sale_date, r.order_id, r.status
     FROM sales_return_lines rl
     JOIN sales_returns r ON r.id = rl.return_id
     WHERE r.business_id = ? AND r.created_at >= ? AND r.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       AND LOWER(COALESCE(r.status,'')) <> 'cancelled'`,
  ];
  for (const sql of plans) {
    try {
      return await query(sql, [businessId, from, to]);
    } catch {
      /* try the narrower select */
    }
  }
  return [];
}

async function selectBranches(businessId) {
  try {
    return await query("SELECT id, name FROM branches WHERE business_id = ? ORDER BY name", [businessId]);
  } catch {
    return [];
  }
}

export async function buildItemSalesReport(businessId, from, to, filters) {
  const [rawLines, rawReturns, branches] = await Promise.all([
    selectLines(businessId, from, to),
    selectReturns(businessId, from, to),
    selectBranches(businessId),
  ]);
  const built = R.buildReport(rawLines, rawReturns, filters);
  const q = new URLSearchParams({ from, to });
  for (const [key, value] of Object.entries(filters || {})) {
    if (value) q.set(key, value);
  }
  const queryText = q.toString();
  return {
    from,
    to,
    filters,
    branches: (branches || []).map((row) => ({ id: row.id, name: row.name || "Branch" })),
    summary: built.summary,
    lines: built.lines,
    customers: built.customers,
    rates: built.rates,
    links: {
      excel: `/api/reports/item-sales/excel?${queryText}`,
      pdf: `/api/reports/item-sales/pdf?${queryText}`,
      csv: `/api/reports/item-sales/csv?${queryText}`,
    },
  };
}

function rangeOf(source) {
  const from = ymd(source.from);
  const to = ymd(source.to);
  if (!from || !to) {
    const err = new Error("Choose a from and to date");
    err.status = 400;
    throw err;
  }
  return from <= to ? { from, to } : { from: to, to: from };
}

function sendExcel(res, report) {
  res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="item-wise-sales-${report.from}-to-${report.to}.xls"`);
  res.send(workbookXml(R.sheetsFromReport(report)));
}

function sendPdf(res, report) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="item-wise-sales-${report.from}-to-${report.to}.pdf"`);
  res.send(globalThis.POSOfferProfit.reportPdfBuffer(R.pdfLines(report)));
}

function sendCsv(res, report) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="item-wise-sales-${report.from}-to-${report.to}.csv"`);
  res.send(R.csvFromReport(report));
}

async function answer(req, res, send) {
  try {
    const range = rangeOf(req.query);
    const report = await buildItemSalesReport(bid(), range.from, range.to, filtersOf(req.query));
    if (send) send(res, report);
    else res.json(report);
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || "Item-wise sales report failed") });
  }
}

export function registerItemSalesReport(app) {
  app.get("/api/reports/item-sales", requireStaff, requirePerm("reports"), (req, res) => answer(req, res));
  app.get("/api/reports/item-sales/excel", requireStaff, requirePerm("reports"), (req, res) => answer(req, res, sendExcel));
  app.get("/api/reports/item-sales/pdf", requireStaff, requirePerm("reports"), (req, res) => answer(req, res, sendPdf));
  app.get("/api/reports/item-sales/csv", requireStaff, requirePerm("reports"), (req, res) => answer(req, res, sendCsv));
}
