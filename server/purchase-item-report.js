import { query } from "./db.js";
import { bid } from "./context.js";
import { requireStaff, requirePerm } from "./auth.js";
import { workbookXml } from "./excel.js";
import { formatReportDay } from "./reports.js";
import "../js/purchase-item-report.js";
import "../js/offer-profit.js";

const R = globalThis.POSPurchaseItemReport;

function ymd(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function filtersOf(query) {
  return {
    product: String(query.product || "").trim(),
    category: String(query.category || "").trim(),
    supplier: String(query.supplier || "").trim(),
    brand: String(query.brand || "").trim(),
    invoice: String(query.invoice || "").trim(),
    branch: String(query.branch || "").trim(),
    item: String(query.item || "").trim(),
  };
}

function lineSql(flags) {
  const discount = flags.discount ? "COALESCE(pl.discount,0)" : "0";
  const free = flags.free ? "COALESCE(pl.free_qty,0)" : "0";
  const status = flags.status ? "COALESCE(p.status,'posted')" : "'posted'";
  const brand = flags.brand ? "COALESCE(i.brand,'')" : "''";
  const branchJoin = flags.branch ? "LEFT JOIN branches br ON br.id = p.branch_id" : "";
  const branchName = flags.branch ? "br.name" : "''";
  const statusWhere = flags.status
    ? "AND LOWER(COALESCE(p.status,'posted')) NOT IN ('cancelled','canceled','void','voided')"
    : "";
  return `SELECT pl.id, pl.item_id, pl.item_name, pl.quantity_gm, ${free} AS free_qty, pl.rate_per_kg,
            ${discount} AS discount, pl.gst_amount, pl.amount, pl.total_amount, pl.barcode AS line_barcode,
            p.id AS purchase_id, p.purchase_number, p.supplier_invoice_number, p.supplier_name,
            p.purchase_date, p.branch_id, ${status} AS status,
            i.code, i.barcode AS item_barcode, i.category, ${brand} AS brand, i.name AS catalog_name,
            ${branchName} AS branch_name
     FROM purchase_lines pl
     JOIN purchases p ON p.id = pl.purchase_id AND p.business_id = pl.business_id
     LEFT JOIN items i ON i.id = pl.item_id AND i.business_id = p.business_id
     ${branchJoin}
     WHERE p.business_id = ? AND p.purchase_date >= ? AND p.purchase_date < DATE_ADD(?, INTERVAL 1 DAY)
     ${statusWhere}`;
}

async function selectLines(businessId, from, to) {
  const plans = [
    { discount: 1, free: 1, status: 1, brand: 1, branch: 1 },
    { discount: 1, free: 1, status: 0, brand: 1, branch: 1 },
    { discount: 0, free: 0, status: 0, brand: 1, branch: 1 },
    { discount: 0, free: 0, status: 0, brand: 0, branch: 0 },
  ];
  let last = null;
  for (const flags of plans) {
    try {
      return await query(lineSql(flags), [businessId, from, to]);
    } catch (err) {
      last = err;
    }
  }
  throw last || new Error("Purchase lines did not load");
}

async function selectReturns(businessId, from, to) {
  try {
    return await query(
      `SELECT m.item_id, i.name AS item_name, i.code, i.barcode, i.category, i.brand,
              DATE(m.created_at) AS purchase_date,
              SUM(ABS(m.quantity_gm)) AS qty,
              SUM(ABS(m.quantity_gm) * ABS(COALESCE(m.unit_cost,0))) AS value
       FROM stock_movements m
       LEFT JOIN items i ON i.id = m.item_id AND i.business_id = m.business_id
       WHERE m.business_id = ?
         AND m.created_at >= ? AND m.created_at < DATE_ADD(?, INTERVAL 1 DAY)
         AND (m.ref_type IN ('purchase_return','preturn','debit') OR m.kind IN ('purchase_return','purchase-return','preturn'))
       GROUP BY m.item_id, i.name, i.code, i.barcode, i.category, i.brand, DATE(m.created_at)`,
      [businessId, from, to],
    );
  } catch {
    return [];
  }
}

async function selectBranches(businessId) {
  try {
    return await query("SELECT id, name FROM branches WHERE business_id = ? ORDER BY name", [businessId]);
  } catch {
    return [];
  }
}

function stampDays(rows) {
  return (rows || []).map((row) => ({ ...row, purchase_date: formatReportDay(row.purchase_date) }));
}

export async function buildItemPurchaseReport(businessId, from, to, filters) {
  const [rawLines, rawReturns, branches] = await Promise.all([
    selectLines(businessId, from, to),
    selectReturns(businessId, from, to),
    selectBranches(businessId),
  ]);
  const built = R.buildReport(stampDays(rawLines), stampDays(rawReturns), filters);
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
    suppliers: built.suppliers,
    rates: built.rates,
    links: {
      excel: `/api/reports/item-purchases/excel?${queryText}`,
      pdf: `/api/reports/item-purchases/pdf?${queryText}`,
      csv: `/api/reports/item-purchases/csv?${queryText}`,
    },
  };
}

function rangeOf(query) {
  const from = ymd(query.from);
  const to = ymd(query.to);
  if (!from || !to) {
    const err = new Error("Choose a from and to date");
    err.status = 400;
    throw err;
  }
  return { from, to: from <= to ? to : from };
}

function sendExcel(res, report) {
  const xml = workbookXml(R.sheetsFromReport(report));
  res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="item-wise-purchase-${report.from}-to-${report.to}.xls"`);
  res.send(xml);
}

function sendPdf(res, report) {
  const pdf = globalThis.POSOfferProfit.reportPdfBuffer(R.pdfLines(report));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="item-wise-purchase-${report.from}-to-${report.to}.pdf"`);
  res.send(pdf);
}

function sendCsv(res, report) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="item-wise-purchase-${report.from}-to-${report.to}.csv"`);
  res.send(R.csvFromReport(report));
}

export function registerItemPurchaseReport(app) {
  app.get("/api/reports/item-purchases", requireStaff, requirePerm("reports"), async (req, res) => {
    try {
      const range = rangeOf(req.query);
      res.json(await buildItemPurchaseReport(bid(), range.from, range.to, filtersOf(req.query)));
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || "Item-wise purchase report failed") });
    }
  });
  app.get("/api/reports/item-purchases/excel", requireStaff, requirePerm("reports"), async (req, res) => {
    try {
      const range = rangeOf(req.query);
      sendExcel(res, await buildItemPurchaseReport(bid(), range.from, range.to, filtersOf(req.query)));
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || "Excel failed") });
    }
  });
  app.get("/api/reports/item-purchases/pdf", requireStaff, requirePerm("reports"), async (req, res) => {
    try {
      const range = rangeOf(req.query);
      sendPdf(res, await buildItemPurchaseReport(bid(), range.from, range.to, filtersOf(req.query)));
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || "PDF failed") });
    }
  });
  app.get("/api/reports/item-purchases/csv", requireStaff, requirePerm("reports"), async (req, res) => {
    try {
      const range = rangeOf(req.query);
      sendCsv(res, await buildItemPurchaseReport(bid(), range.from, range.to, filtersOf(req.query)));
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || "CSV failed") });
    }
  });
}
