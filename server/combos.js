import crypto from "node:crypto";
import { query } from "./db.js";
import { bid } from "./context.js";
import { createOffer } from "./offers.js";

export function normalizeComboInput(body = {}) {
  const name = String(body.name || "").trim();
  const itemA = String(body.item_a_id || body.itemA || "").trim();
  const itemB = String(body.item_b_id || body.itemB || "").trim();
  const discountType = String(body.discount_type || body.discountType || "pct").toLowerCase() === "amt" ? "amt" : "pct";
  const raw = Number(body.discount_value ?? body.discountValue ?? 8);
  const discountValue = Number.isFinite(raw) ? Math.max(0, Math.min(discountType === "pct" ? 50 : 100000, raw)) : 8;
  if (!name || !itemA || !itemB || itemA === itemB) return null;
  return { name, item_a_id: itemA, item_b_id: itemB, discount_type: discountType, discount_value: discountValue };
}

export function cartMatchesCombo(cartItemIds, combo) {
  const ids = new Set((cartItemIds || []).map((id) => String(id || "")));
  return Boolean(combo && ids.has(String(combo.item_a_id)) && ids.has(String(combo.item_b_id)));
}

export function findMatchingCombo(cartItemIds, combos) {
  return (combos || []).find((c) => String(c.status || "active") === "active" && cartMatchesCombo(cartItemIds, c)) || null;
}

export async function ensureComboOffersTable() {
  await query(`CREATE TABLE IF NOT EXISTS combo_offers (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    name VARCHAR(180) NOT NULL,
    item_a_id VARCHAR(255) NOT NULL,
    item_b_id VARCHAR(255) NOT NULL,
    discount_type VARCHAR(8) NOT NULL DEFAULT 'pct',
    discount_value DECIMAL(12,2) NOT NULL DEFAULT 8,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_combo_biz (business_id)
  )`);
}

export async function listCombos(tenant = bid()) {
  await ensureComboOffersTable();
  return query(
    `SELECT c.*, a.name AS item_a_name, b.name AS item_b_name
     FROM combo_offers c
     LEFT JOIN items a ON a.id = c.item_a_id
     LEFT JOIN items b ON b.id = c.item_b_id
     WHERE c.business_id = ? AND c.status = 'active'
     ORDER BY c.created_at DESC`,
    [tenant],
  );
}

export async function createCombo(body, tenant = bid()) {
  const input = normalizeComboInput(body);
  if (!input) {
    const err = new Error("Combo needs a name and two different items");
    err.status = 400;
    throw err;
  }
  await ensureComboOffersTable();
  const [a] = await query("SELECT id, name FROM items WHERE id = ? AND business_id = ?", [input.item_a_id, tenant]);
  const [b] = await query("SELECT id, name FROM items WHERE id = ? AND business_id = ?", [input.item_b_id, tenant]);
  if (!a || !b) {
    const err = new Error("Both combo items must be in this shop's catalog");
    err.status = 400;
    throw err;
  }
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO combo_offers (id, business_id, name, item_a_id, item_b_id, discount_type, discount_value, status)
     VALUES (?,?,?,?,?,?,?,'active')`,
    [id, tenant, input.name, input.item_a_id, input.item_b_id, input.discount_type, input.discount_value],
  );
  const [row] = await query(
    `SELECT c.*, a.name AS item_a_name, b.name AS item_b_name
     FROM combo_offers c
     LEFT JOIN items a ON a.id = c.item_a_id
     LEFT JOIN items b ON b.id = c.item_b_id
     WHERE c.id = ?`,
    [id],
  );
  try {
    await createOffer({
      name: input.name,
      type: "combo",
      status: "active",
      item_ids: [input.item_a_id, input.item_b_id],
      discount_type: input.discount_type,
      discount_value: input.discount_value,
    }, tenant);
  } catch {
    /* promo table optional */
  }
  return row;
}
