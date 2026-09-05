import crypto from "node:crypto";
import { query } from "./db.js";
import { bid } from "./context.js";
import "../js/offers.js";

const O = globalThis.POSOffers;

export async function ensurePromoOffers() {
  await query(`CREATE TABLE IF NOT EXISTS promo_offers (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    name VARCHAR(180) NOT NULL,
    offer_type VARCHAR(32) NOT NULL DEFAULT 'product',
    description TEXT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'draft',
    start_date DATE NULL,
    end_date DATE NULL,
    start_time VARCHAR(8) NULL,
    end_time VARCHAR(8) NULL,
    days_of_week VARCHAR(32) NULL,
    min_qty DECIMAL(12,2) NULL,
    max_qty DECIMAL(12,2) NULL,
    min_spend DECIMAL(12,2) NULL,
    discount_type VARCHAR(16) NOT NULL DEFAULT 'pct',
    discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
    offer_price DECIMAL(12,2) NULL,
    usage_limit INT NULL,
    used_count INT NOT NULL DEFAULT 0,
    customer_eligibility VARCHAR(32) NOT NULL DEFAULT 'all',
    branch_id VARCHAR(255) NULL,
    stacking VARCHAR(24) NOT NULL DEFAULT 'stack',
    priority INT NOT NULL DEFAULT 50,
    loyalty_multiplier DECIMAL(6,2) NOT NULL DEFAULT 1,
    conditions_json TEXT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_promo_biz (business_id),
    INDEX idx_promo_status (business_id, status)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS promo_offer_redemptions (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    offer_id VARCHAR(255) NOT NULL,
    order_id VARCHAR(255) NULL,
    customer_id VARCHAR(255) NULL,
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    bill_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_por_offer (offer_id),
    INDEX idx_por_biz (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS promo_settings (
    business_id VARCHAR(255) PRIMARY KEY,
    stacking VARCHAR(24) NOT NULL DEFAULT 'product_and_bill',
    allow_loyalty TINYINT(1) NOT NULL DEFAULT 1,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  )`);
}

function rowFromInput(input, existing = {}) {
  const n = O.normalize({ ...existing, ...input });
  if (!n) {
    const err = new Error("Offer needs a name");
    err.status = 400;
    throw err;
  }
  return n;
}

function publicRow(row) {
  if (!row) return null;
  const cond = O.parseConditions(row);
  return {
    ...row,
    conditions: cond,
    live_status: O.liveStatus(row),
    profit: O.profitPreview(row, []),
  };
}

export async function getPromoSettings(tenant = bid()) {
  await ensurePromoOffers();
  const [row] = await query("SELECT * FROM promo_settings WHERE business_id = ?", [tenant]);
  return row || { business_id: tenant, stacking: "product_and_bill", allow_loyalty: 1 };
}

export async function savePromoSettings(body, tenant = bid()) {
  await ensurePromoOffers();
  const stacking = O.STACKING.some((s) => s.id === body?.stacking) ? body.stacking : "product_and_bill";
  const allow = body?.allow_loyalty === false || body?.allow_loyalty === 0 ? 0 : 1;
  await query(
    `INSERT INTO promo_settings (business_id, stacking, allow_loyalty) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE stacking=VALUES(stacking), allow_loyalty=VALUES(allow_loyalty)`,
    [tenant, stacking, allow],
  );
  return getPromoSettings(tenant);
}

async function legacyCombos(tenant) {
  try {
    const rows = await query(
      "SELECT * FROM combo_offers WHERE business_id = ? AND status = 'active'",
      [tenant],
    );
    return (rows || []).map((c) => O.comboFromLegacy(c)).filter(Boolean);
  } catch {
    return [];
  }
}

export async function listOffers(tenant = bid()) {
  await ensurePromoOffers();
  const rows = await query("SELECT * FROM promo_offers WHERE business_id = ? ORDER BY created_at DESC", [tenant]);
  const live = (rows || []).map((r) => {
    const status = O.liveStatus(r);
    if (status !== r.status && (status === "expired" || status === "active" || status === "scheduled")) {
      query("UPDATE promo_offers SET status = ? WHERE id = ? AND business_id = ?", [status, r.id, tenant]).catch(() => {});
      r.status = status;
    }
    return publicRow(r);
  });
  const combos = await legacyCombos(tenant);
  const have = new Set(live.map((r) => `${r.offer_type}:${(r.conditions?.item_ids || []).join("+")}`));
  combos.forEach((c) => {
    const key = `combo:${O.parseConditions(c).item_ids.join("+")}`;
    if (!have.has(key)) live.push(publicRow({ ...c, business_id: tenant }));
  });
  return live;
}

export async function getOffer(id, tenant = bid()) {
  await ensurePromoOffers();
  const [row] = await query("SELECT * FROM promo_offers WHERE id = ? AND business_id = ?", [id, tenant]);
  if (!row) {
    const err = new Error("Offer not found");
    err.status = 404;
    throw err;
  }
  return publicRow(row);
}

export async function createOffer(body, tenant = bid()) {
  const n = rowFromInput(body);
  await ensurePromoOffers();
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO promo_offers (
      id, business_id, name, offer_type, description, status, start_date, end_date, start_time, end_time,
      days_of_week, min_qty, max_qty, min_spend, discount_type, discount_value, offer_price, usage_limit,
      used_count, customer_eligibility, branch_id, stacking, priority, loyalty_multiplier, conditions_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, tenant, n.name, n.offer_type, n.description, n.status, n.start_date, n.end_date, n.start_time, n.end_time,
      n.days_of_week, n.min_qty, n.max_qty, n.min_spend, n.discount_type, n.discount_value, n.offer_price, n.usage_limit,
      0, n.customer_eligibility, n.branch_id, n.stacking, n.priority, n.loyalty_multiplier, n.conditions_json,
    ],
  );
  return getOffer(id, tenant);
}

export async function updateOffer(id, body, tenant = bid()) {
  const existing = await getOffer(id, tenant);
  const n = rowFromInput(body, existing);
  await query(
    `UPDATE promo_offers SET
      name=?, offer_type=?, description=?, status=?, start_date=?, end_date=?, start_time=?, end_time=?,
      days_of_week=?, min_qty=?, max_qty=?, min_spend=?, discount_type=?, discount_value=?, offer_price=?,
      usage_limit=?, customer_eligibility=?, branch_id=?, stacking=?, priority=?, loyalty_multiplier=?, conditions_json=?
     WHERE id=? AND business_id=?`,
    [
      n.name, n.offer_type, n.description, n.status, n.start_date, n.end_date, n.start_time, n.end_time,
      n.days_of_week, n.min_qty, n.max_qty, n.min_spend, n.discount_type, n.discount_value, n.offer_price,
      n.usage_limit, n.customer_eligibility, n.branch_id, n.stacking, n.priority, n.loyalty_multiplier, n.conditions_json,
      id, tenant,
    ],
  );
  return getOffer(id, tenant);
}

export async function setOfferStatus(id, status, tenant = bid()) {
  if (!O.STATUSES.includes(status)) {
    const err = new Error("Unknown offer status");
    err.status = 400;
    throw err;
  }
  await ensurePromoOffers();
  await query("UPDATE promo_offers SET status = ? WHERE id = ? AND business_id = ?", [status, id, tenant]);
  return getOffer(id, tenant);
}

export async function duplicateOffer(id, tenant = bid()) {
  const row = await getOffer(id, tenant);
  return createOffer({ ...row, name: `${row.name} copy`, status: "draft", used_count: 0 }, tenant);
}

export async function recordOfferRedemptions({ offerIds, orderId, customerId, discount, total }, tenant = bid()) {
  const ids = [...new Set((offerIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return;
  await ensurePromoOffers();
  for (const offerId of ids) {
    await query(
      "INSERT INTO promo_offer_redemptions (id, business_id, offer_id, order_id, customer_id, discount_amount, bill_total) VALUES (?,?,?,?,?,?,?)",
      [crypto.randomUUID(), tenant, offerId, orderId || null, customerId || null, Number(discount) || 0, Number(total) || 0],
    );
    await query("UPDATE promo_offers SET used_count = used_count + 1 WHERE id = ? AND business_id = ?", [offerId, tenant]);
  }
}

export async function offerStats(tenant = bid()) {
  await ensurePromoOffers();
  const offers = await listOffers(tenant);
  const [agg] = await query(
    `SELECT COUNT(*) AS bills, COALESCE(SUM(discount_amount),0) AS discount, COALESCE(SUM(bill_total),0) AS revenue,
            COUNT(DISTINCT customer_id) AS customers
     FROM promo_offer_redemptions WHERE business_id = ?`,
    [tenant],
  );
  const per = await query(
    `SELECT offer_id, COUNT(*) AS bills, COALESCE(SUM(discount_amount),0) AS discount, COALESCE(SUM(bill_total),0) AS revenue
     FROM promo_offer_redemptions WHERE business_id = ? GROUP BY offer_id`,
    [tenant],
  );
  const byId = Object.fromEntries((per || []).map((r) => [r.offer_id, r]));
  const rows = offers.map((o) => {
    const s = byId[o.id] || { bills: 0, discount: 0, revenue: 0 };
    return {
      ...o,
      stats: s,
      ai: O.resultNarrative({ name: o.name, bills: Number(s.bills) || 0, extraRevenue: Number(s.revenue) || 0, margin: o.profit?.marginAfter }),
    };
  });
  const counts = Object.fromEntries(O.STATUSES.map((st) => [st, offers.filter((o) => (o.live_status || o.status) === st).length]));
  const expiring = offers.filter((o) => {
    if (!o.end_date) return false;
    const days = (new Date(o.end_date) - new Date()) / 86400000;
    return days >= 0 && days <= 7 && (o.live_status || o.status) === "active";
  });
  return { counts, expiring, totals: agg || { bills: 0, discount: 0, revenue: 0, customers: 0 }, offers: rows };
}

export async function suggestOffers(growth, items = []) {
  return O.suggestFromGrowth(growth || {}, items || []);
}

export { O as POSOffers };
