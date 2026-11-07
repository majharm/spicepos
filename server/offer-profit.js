import { query } from "./db.js";
import { bid, branchId, authUser } from "./context.js";
import { createdBetween, saleNotVoidSql } from "./sql-time.js";
import { shopTodayYmd } from "./subscription.js";
import { requireStaff, requirePerm } from "./auth.js";
import { workbookXml } from "./excel.js";
import "../js/offer-profit.js";

const P = globalThis.POSOfferProfit;

function staffActor() {
  const user = authUser() || {};
  return {
    master: false,
    businessId: bid(),
    branchId: user.branch_id || branchId() || "",
    role: user.role || "",
  };
}

async function safeQuery(sql, params) {
  try {
    return await query(sql, params);
  } catch {
    return null;
  }
}

function orderWhere(scope, from, to) {
  const parts = [];
  const params = [];
  if (scope.businessId) {
    parts.push("o.business_id = ?");
    params.push(scope.businessId);
  }
  if (scope.branchId) {
    parts.push("o.branch_id = ?");
    params.push(scope.branchId);
  }
  parts.push(saleNotVoidSql("o"));
  parts.push(createdBetween("o"));
  params.push(from, to);
  return { sql: parts.join(" AND "), params };
}

export async function loadOfferProfitSource(scope, from, to) {
  const where = orderWhere(scope, from, to);
  let orders = await safeQuery(
    `SELECT o.id, o.order_number, o.business_id, o.branch_id, o.status, o.created_at,
            o.subtotal, o.discount, o.loyalty_discount, o.gst, o.total, o.extra_charges,
            b.name AS business_name, br.name AS branch_name
     FROM sales_orders o
     LEFT JOIN businesses b ON b.id = o.business_id
     LEFT JOIN branches br ON br.id = o.branch_id
     WHERE ${where.sql}
     ORDER BY o.created_at`,
    where.params,
  );
  if (!orders) {
    orders = await query(
      `SELECT o.id, o.order_number, o.business_id, o.branch_id, o.status, o.created_at,
              o.subtotal, o.discount, o.gst, o.total, b.name AS business_name
       FROM sales_orders o
       LEFT JOIN businesses b ON b.id = o.business_id
       WHERE ${where.sql}
       ORDER BY o.created_at`,
      where.params,
    );
  }
  let lines = await safeQuery(
    `SELECT l.order_id, l.item_name, l.quantity_gm, l.amount, l.discount, l.cost, l.gst_rate, l.cancelled,
            COALESCE(NULLIF(TRIM(i.category), ''), 'Uncategorised') AS category, i.purchase_rate
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id
     LEFT JOIN items i ON i.id = l.item_id AND i.business_id = o.business_id
     WHERE ${where.sql} AND COALESCE(l.cancelled, 0) = 0`,
    where.params,
  );
  if (!lines) {
    lines = await query(
      `SELECT l.order_id, l.item_name, l.quantity_gm, l.amount, l.discount, l.gst_rate, l.cancelled
       FROM sales_order_lines l
       JOIN sales_orders o ON o.id = l.order_id
       WHERE ${where.sql} AND COALESCE(l.cancelled, 0) = 0`,
      where.params,
    );
  }
  const redemptions = [];
  const ids = (orders || []).map((row) => row.id).filter(Boolean);
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const got = await safeQuery(
      `SELECT offer_id, order_id, business_id, discount_amount
       FROM promo_offer_redemptions
       WHERE order_id IN (${chunk.map(() => "?").join(",")})`,
      chunk,
    );
    if (got) redemptions.push(...got);
  }
  const offerParams = [];
  let offerSql = "SELECT id, business_id, name, conditions_json FROM promo_offers";
  if (scope.businessId) {
    offerSql += " WHERE business_id = ?";
    offerParams.push(scope.businessId);
  }
  const offers = (await safeQuery(offerSql, offerParams)) || [];
  const expParts = [];
  const expParams = [];
  if (scope.businessId) {
    expParts.push("business_id = ?");
    expParams.push(scope.businessId);
  }
  expParts.push("expense_date >= ? AND expense_date < DATE_ADD(?, INTERVAL 1 DAY)");
  expParams.push(from, to);
  const expRows = await safeQuery(
    `SELECT COALESCE(SUM(amount),0) AS amount FROM expenses WHERE ${expParts.join(" AND ")}`,
    expParams,
  );
  let branches = [];
  if (scope.businessId) {
    branches = (await safeQuery(
      "SELECT id, name, business_id FROM branches WHERE business_id = ? ORDER BY name",
      [scope.businessId],
    )) || [];
  } else if (scope.master) {
    branches = (await safeQuery(
      `SELECT br.id, br.name, br.business_id, b.name AS business_name
       FROM branches br
       LEFT JOIN businesses b ON b.id = br.business_id
       ORDER BY b.name, br.name`,
      [],
    )) || [];
  }
  const businesses = scope.master
    ? (await safeQuery("SELECT id, name FROM businesses ORDER BY name", [])) || []
    : [];
  return {
    orders: orders || [],
    lines: lines || [],
    redemptions,
    offers,
    expenses: Number(expRows?.[0]?.amount) || 0,
    branches,
    businesses,
  };
}

function rangeFromQuery(query = {}) {
  const today = String(query.today || shopTodayYmd());
  const preset = String(query.preset || "").toLowerCase();
  let from = String(query.from || "").slice(0, 10);
  let to = String(query.to || "").slice(0, 10);
  if (preset && preset !== "custom") {
    const range = P.presetRange(preset, today);
    if (range.from && range.to) {
      from = range.from;
      to = range.to;
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const range = P.presetRange("month", today);
    from = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : range.from;
    to = /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : range.to;
  }
  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  return { from, to, preset: preset && preset !== "custom" ? P.presetRange(preset, today).preset : "custom" };
}

export async function buildOfferProfitReport(scope, query = {}, opts = {}) {
  const range = rangeFromQuery(query);
  const source = await loadOfferProfitSource(scope, range.from, range.to);
  return P.assembleOfferProfit({
    ...source,
    ...range,
    scope,
    filters: {
      offer: query.offer || "",
      product: query.product || "",
      category: query.category || "",
    },
    lineLimit: opts.lineLimit,
  });
}

function sendExcel(res, report) {
  const xml = workbookXml(P.sheetsFromReport(report));
  res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="offer-profit-${report.from}-to-${report.to}.xls"`);
  res.send(xml);
}

function sendPdf(res, report) {
  const pdf = P.reportPdfBuffer(P.pdfLines(report));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="offer-profit-${report.from}-to-${report.to}.pdf"`);
  res.send(pdf);
}

function filtersOf(query) {
  return {
    offer: query.offer || "",
    product: query.product || "",
    category: query.category || "",
    branch: query.branch || "",
    business: query.business || "",
    preset: query.preset || "",
    from: query.from || "",
    to: query.to || "",
    today: query.today || "",
  };
}

export function registerOfferProfit(app) {
  app.get("/api/reports/offer-profit", requireStaff, requirePerm("reports"), async (req, res) => {
    try {
      const scope = P.resolveReportScope(staffActor(), req.query);
      res.json(await buildOfferProfitReport(scope, filtersOf(req.query)));
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || "Offer profit report failed") });
    }
  });
  app.get("/api/reports/offer-profit/excel", requireStaff, requirePerm("reports"), async (req, res) => {
    try {
      const scope = P.resolveReportScope(staffActor(), req.query);
      sendExcel(res, await buildOfferProfitReport(scope, filtersOf(req.query), { lineLimit: 0 }));
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || "Excel failed") });
    }
  });
  app.get("/api/reports/offer-profit/pdf", requireStaff, requirePerm("reports"), async (req, res) => {
    try {
      const scope = P.resolveReportScope(staffActor(), req.query);
      sendPdf(res, await buildOfferProfitReport(scope, filtersOf(req.query), { lineLimit: 0 }));
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || "PDF failed") });
    }
  });
}

export function registerMasterOfferProfit(app) {
  app.get("/api/master/offer-profit", async (req, res) => {
    try {
      const scope = P.resolveReportScope({ master: true, role: "master_admin" }, req.query);
      res.json(await buildOfferProfitReport(scope, filtersOf(req.query)));
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || "Offer profit report failed") });
    }
  });
  app.get("/api/master/offer-profit/excel", async (req, res) => {
    try {
      const scope = P.resolveReportScope({ master: true, role: "master_admin" }, req.query);
      sendExcel(res, await buildOfferProfitReport(scope, filtersOf(req.query), { lineLimit: 0 }));
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || "Excel failed") });
    }
  });
  app.get("/api/master/offer-profit/pdf", async (req, res) => {
    try {
      const scope = P.resolveReportScope({ master: true, role: "master_admin" }, req.query);
      sendPdf(res, await buildOfferProfitReport(scope, filtersOf(req.query), { lineLimit: 0 }));
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || "PDF failed") });
    }
  });
}

export { P as POSOfferProfit };
