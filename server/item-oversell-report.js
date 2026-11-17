import { query } from "./db.js";
import { bid } from "./context.js";
import { requireStaff, requirePerm } from "./auth.js";
import { workbookXml } from "./excel.js";
import { saleNotVoidSql } from "./sql-time.js";
import "../js/item-oversell-report.js";
import "../js/offer-profit.js";

const R = globalThis.POSItemOversellReport;

function ymd(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function filtersOf(source) {
  return {
    from: ymd(source.from),
    to: ymd(source.to),
    product: String(source.product || "").trim(),
    category: String(source.category || "").trim(),
    customer: String(source.customer || "").trim(),
    brand: String(source.brand || "").trim(),
    invoice: String(source.invoice || "").trim(),
    branch: String(source.branch || "").trim(),
    item: String(source.item || "").trim(),
  };
}

async function selectTry(plans, params) {
  let last = null;
  for (const sql of plans) {
    try {
      return await query(sql, params);
    } catch (err) {
      last = err;
    }
  }
  if (last) throw last;
  return [];
}

async function selectOptional(plans, params) {
  for (const sql of plans) {
    try {
      return await query(sql, params);
    } catch {
      /* narrower select or a missing table */
    }
  }
  return [];
}

function saleSql(flags) {
  const brand = flags.brand ? "COALESCE(i.brand,'')" : "''";
  const branchJoin = flags.branch ? "LEFT JOIN branches br ON br.id = o.branch_id" : "";
  const branchName = flags.branch ? "br.name" : "''";
  const held = flags.held ? "AND COALESCE(o.held,0) = 0" : "";
  return `SELECT l.id, l.item_id, l.item_name, l.quantity_gm, l.rate_per_kg, l.amount, l.gst_rate,
            COALESCE(l.cancelled,0) AS cancelled, l.barcode AS line_barcode,
            o.order_number, o.customer_name, o.status, o.branch_id, o.created_at AS sale_date,
            i.code, i.barcode AS item_barcode, i.category, ${brand} AS brand, ${branchName} AS branch_name
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id AND o.business_id = l.business_id
     LEFT JOIN items i ON i.id = l.item_id AND i.business_id = o.business_id
     ${branchJoin}
     WHERE o.business_id = ? AND ${saleNotVoidSql("o")} AND COALESCE(l.cancelled,0) = 0
     ${held}`;
}

async function selectSales(businessId) {
  const plans = [
    saleSql({ brand: 1, branch: 1, held: 1 }),
    saleSql({ brand: 1, branch: 0, held: 0 }),
    saleSql({ brand: 0, branch: 0, held: 0 }),
  ];
  return selectTry(plans, [businessId]);
}

async function selectPurchases(businessId) {
  return selectOptional([
    `SELECT l.id, l.item_id, l.quantity_gm, COALESCE(l.free_qty,0) AS free_qty, p.purchase_date AS sale_date, p.status
     FROM purchase_lines l
     JOIN purchases p ON p.id = l.purchase_id AND p.business_id = l.business_id
     WHERE p.business_id = ?`,
    `SELECT l.id, l.item_id, l.quantity_gm, p.purchase_date AS sale_date, p.status
     FROM purchase_lines l
     JOIN purchases p ON p.id = l.purchase_id AND p.business_id = l.business_id
     WHERE p.business_id = ?`,
    `SELECT l.id, l.item_id, l.quantity_gm, p.purchase_date AS sale_date
     FROM purchase_lines l
     JOIN purchases p ON p.id = l.purchase_id
     WHERE p.business_id = ?`,
  ], [businessId]);
}

async function selectReturns(businessId) {
  return selectOptional([
    `SELECT rl.id, rl.item_id, rl.quantity_gm, rl.stock_disposition, r.created_at AS sale_date, r.status
     FROM sales_return_lines rl
     JOIN sales_returns r ON r.id = rl.return_id AND r.business_id = rl.business_id
     WHERE r.business_id = ? AND LOWER(COALESCE(r.status,'')) <> 'cancelled'`,
    `SELECT rl.id, rl.item_id, rl.quantity_gm, r.created_at AS sale_date, r.status
     FROM sales_return_lines rl
     JOIN sales_returns r ON r.id = rl.return_id
     WHERE r.business_id = ? AND LOWER(COALESCE(r.status,'')) <> 'cancelled'`,
  ], [businessId]);
}

async function selectAdjustments(businessId) {
  return selectOptional([
    `SELECT id, item_id, kind, quantity_gm, created_at AS sale_date
     FROM stock_movements
     WHERE business_id = ?
       AND LOWER(COALESCE(kind,'')) NOT IN ('sale','purchase','sale_return','return')`,
  ], [businessId]);
}

async function selectOnline(businessId) {
  return selectOptional([
    `SELECT l.id, l.item_id, l.quantity_base, l.quantity_base AS quantity_gm, o.created_at AS sale_date, o.status
     FROM online_order_lines l
     JOIN online_orders o ON o.id = l.order_id AND o.business_id = l.business_id
     WHERE o.business_id = ? AND LOWER(COALESCE(o.status,'')) <> 'cancelled'`,
  ], [businessId]);
}

async function selectItems(businessId) {
  return selectOptional([
    "SELECT id, name, code, barcode, category, brand, stock_gm FROM items WHERE business_id = ?",
    "SELECT id, name, code, barcode, category, stock_gm FROM items WHERE business_id = ?",
  ], [businessId]);
}

async function selectBranches(businessId) {
  return selectOptional(["SELECT id, name FROM branches WHERE business_id = ? ORDER BY name", ], [businessId]);
}

export async function buildItemOversellReport(businessId, from, to, filters) {
  const [sales, purchases, returns, adjustments, online, items, branches] = await Promise.all([
    selectSales(businessId),
    selectPurchases(businessId),
    selectReturns(businessId),
    selectAdjustments(businessId),
    selectOnline(businessId),
    selectItems(businessId),
    selectBranches(businessId),
  ]);
  const built = R.buildReport({ sales, purchases, returns, adjustments, online, items }, { ...filters, from, to });
  const q = new URLSearchParams({ from, to });
  for (const [key, value] of Object.entries(filters || {})) {
    if (value && key !== "from" && key !== "to") q.set(key, value);
  }
  const queryText = q.toString();
  return {
    from,
    to,
    filters,
    branches: (branches || []).map((row) => ({ id: row.id, name: row.name || "Branch" })),
    summary: built.summary,
    lines: built.lines,
    negatives: built.negatives,
    links: {
      excel: `/api/reports/item-oversells/excel?${queryText}`,
      pdf: `/api/reports/item-oversells/pdf?${queryText}`,
      csv: `/api/reports/item-oversells/csv?${queryText}`,
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
  res.setHeader("Content-Disposition", `attachment; filename="item-wise-overselling-${report.from}-to-${report.to}.xls"`);
  res.send(workbookXml(R.sheetsFromReport(report)));
}

function sendPdf(res, report) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="item-wise-overselling-${report.from}-to-${report.to}.pdf"`);
  res.send(globalThis.POSOfferProfit.reportPdfBuffer(R.pdfLines(report)));
}

function sendCsv(res, report) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="item-wise-overselling-${report.from}-to-${report.to}.csv"`);
  res.send(R.csvFromReport(report));
}

async function answer(req, res, send) {
  try {
    const range = rangeOf(req.query);
    const report = await buildItemOversellReport(bid(), range.from, range.to, filtersOf(req.query));
    if (send) send(res, report);
    else res.json(report);
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || "Item-wise overselling report failed") });
  }
}

export function registerItemOversellReport(app) {
  app.get("/api/reports/item-oversells", requireStaff, requirePerm("reports"), (req, res) => answer(req, res));
  app.get("/api/reports/item-oversells/excel", requireStaff, requirePerm("reports"), (req, res) => answer(req, res, sendExcel));
  app.get("/api/reports/item-oversells/pdf", requireStaff, requirePerm("reports"), (req, res) => answer(req, res, sendPdf));
  app.get("/api/reports/item-oversells/csv", requireStaff, requirePerm("reports"), (req, res) => answer(req, res, sendCsv));
}
