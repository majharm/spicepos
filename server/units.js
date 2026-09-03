import { query } from "./db.js";
import { bid } from "./context.js";
import { requireStaff, requirePerm } from "./auth.js";
import crypto from "node:crypto";
import "../js/units.js";

export const DEFAULT_UNIT_MASTERS = [
  { code: "GM", name: "Grams (g)", family: "weight", rate_suffix: "/kg", stock_suffix: "g", step: 1, receive_qty: 1000, display_div: 1, sort_order: 1 },
  { code: "KG", name: "Kilogram (kg)", family: "weight", rate_suffix: "/kg", stock_suffix: "kg", step: 1, receive_qty: 1000, display_div: 1000, sort_order: 2 },
  { code: "ML", name: "Millilitre (ml)", family: "volume", rate_suffix: "/ltr", stock_suffix: "ml", step: 1, receive_qty: 1000, display_div: 1, sort_order: 3 },
  { code: "LTR", name: "Litre (L)", family: "volume", rate_suffix: "/ltr", stock_suffix: "L", step: 1, receive_qty: 1000, display_div: 1000, sort_order: 4 },
  { code: "PCS", name: "Quantity (pcs)", family: "count", rate_suffix: "/pc", stock_suffix: "pcs", step: 1, receive_qty: 1, display_div: 1, sort_order: 5 },
];

export function normalizeUnitCode(raw) {
  const key = String(raw || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const alias = {
    G: "GM", GRAM: "GM", GRAMS: "GM", GM: "GM",
    KG: "KG", KILO: "KG", KILOGRAM: "KG",
    ML: "ML", MILLILITRE: "ML", MILLILITER: "ML",
    L: "LTR", LTR: "LTR", LITRE: "LTR", LITER: "LTR",
    PCS: "PCS", PC: "PCS", QTY: "PCS", NOS: "PCS", NO: "PCS",
    COUNT: "PCS", UNIT: "PCS", UNITS: "PCS",
  };
  if (alias[key]) return alias[key];
  return key || "GM";
}

export async function ensureInventoryUnits(businessId) {
  await query(`CREATE TABLE IF NOT EXISTS inventory_units (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(128) NOT NULL,
    family VARCHAR(16) NOT NULL DEFAULT 'count',
    rate_suffix VARCHAR(16) NOT NULL DEFAULT '/pc',
    stock_suffix VARCHAR(16) NOT NULL DEFAULT 'pcs',
    step DECIMAL(14,3) NOT NULL DEFAULT 1,
    receive_qty DECIMAL(14,3) NOT NULL DEFAULT 1,
    display_div DECIMAL(14,3) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    UNIQUE KEY uniq_unit_biz_code (business_id, code),
    INDEX (business_id)
  )`);
  await query(
    "UPDATE inventory_units SET step = 1 WHERE family IN ('weight', 'volume') AND step > 1",
  );
  if (!businessId) return [];
  const existing = await query("SELECT COUNT(*) AS c FROM inventory_units WHERE business_id = ?", [businessId]);
  if (Number(existing[0]?.c) > 0) {
    const rows = await query("SELECT * FROM inventory_units WHERE business_id = ? ORDER BY sort_order, code", [businessId]);
    globalThis.POSUnits?.hydrate(rows.filter((u) => u.status !== "inactive"));
    return rows;
  }
  for (const row of DEFAULT_UNIT_MASTERS) {
    await query(
      `INSERT INTO inventory_units (
         id, business_id, code, name, family, rate_suffix, stock_suffix, step, receive_qty, display_div, sort_order, status
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,'active')`,
      [
        crypto.randomUUID(),
        businessId,
        row.code,
        row.name,
        row.family,
        row.rate_suffix,
        row.stock_suffix,
        row.step,
        row.receive_qty,
        row.display_div,
        row.sort_order,
      ],
    );
  }
  const rows = await query("SELECT * FROM inventory_units WHERE business_id = ? ORDER BY sort_order, code", [businessId]);
  globalThis.POSUnits?.hydrate(rows.filter((u) => u.status !== "inactive"));
  return rows;
}

function unitFields(body) {
  const code = normalizeUnitCode(body.code);
  if (!code) throw new Error("Unit code is required");
  const family = ["weight", "volume", "count"].includes(String(body.family || "").toLowerCase())
    ? String(body.family).toLowerCase()
    : "count";
  const name = String(body.name || code).trim() || code;
  const rate_suffix = String(body.rate_suffix || (family === "volume" ? "/ltr" : family === "weight" ? "/kg" : "/pc"));
  const stock_suffix = String(body.stock_suffix || (family === "volume" ? "ml" : family === "weight" ? "g" : "pcs"));
  const step = Number(body.step) > 0 ? Number(body.step) : 1;
  const receive_qty = Number(body.receive_qty) > 0 ? Number(body.receive_qty) : family === "count" ? 1 : 1000;
  const display_div = Number(body.display_div) > 0 ? Number(body.display_div) : code === "KG" || code === "LTR" ? 1000 : 1;
  const status = body.status === "inactive" ? "inactive" : "active";
  return { code, name, family, rate_suffix, stock_suffix, step, receive_qty, display_div, status };
}

export function registerUnits(app) {
  app.get("/api/units", requireStaff, requirePerm("items"), async (_req, res) => {
    try {
      res.json(await ensureInventoryUnits(bid()));
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/units", requireStaff, requirePerm("items"), async (req, res) => {
    try {
      await ensureInventoryUnits(bid());
      const f = unitFields(req.body || {});
      const dup = await query("SELECT id FROM inventory_units WHERE business_id = ? AND code = ? LIMIT 1", [bid(), f.code]);
      if (dup.length) {
        res.status(400).json({ error: "Unit code already exists" });
        return;
      }
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO inventory_units (
           id, business_id, code, name, family, rate_suffix, stock_suffix, step, receive_qty, display_div, sort_order, status
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, bid(), f.code, f.name, f.family, f.rate_suffix, f.stock_suffix, f.step, f.receive_qty, f.display_div, Number(req.body?.sort_order) || 99, f.status],
      );
      const [unit] = await query("SELECT * FROM inventory_units WHERE id = ?", [id]);
      res.json({ ok: true, unit });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  app.put("/api/units/:id", requireStaff, requirePerm("items"), async (req, res) => {
    try {
      await ensureInventoryUnits(bid());
      const f = unitFields(req.body || {});
      const dup = await query(
        "SELECT id FROM inventory_units WHERE business_id = ? AND code = ? AND id <> ? LIMIT 1",
        [bid(), f.code, req.params.id],
      );
      if (dup.length) {
        res.status(400).json({ error: "Unit code already exists" });
        return;
      }
      await query(
        `UPDATE inventory_units SET code=?, name=?, family=?, rate_suffix=?, stock_suffix=?, step=?, receive_qty=?, display_div=?, status=?
         WHERE id=? AND business_id=?`,
        [f.code, f.name, f.family, f.rate_suffix, f.stock_suffix, f.step, f.receive_qty, f.display_div, f.status, req.params.id, bid()],
      );
      const [unit] = await query("SELECT * FROM inventory_units WHERE id = ?", [req.params.id]);
      res.json({ ok: true, unit });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  app.delete("/api/units/:id", requireStaff, requirePerm("items"), async (req, res) => {
    try {
      const [row] = await query("SELECT * FROM inventory_units WHERE id = ? AND business_id = ?", [req.params.id, bid()]);
      if (!row) {
        res.status(404).json({ error: "Unit not found" });
        return;
      }
      const used = await query(
        "SELECT COUNT(*) AS c FROM items WHERE business_id = ? AND (base_unit = ? OR unit = ?)",
        [bid(), row.code, row.code],
      );
      if (Number(used[0]?.c) > 0) {
        res.status(400).json({ error: "Unit is used on items" });
        return;
      }
      await query("DELETE FROM inventory_units WHERE id = ? AND business_id = ?", [req.params.id, bid()]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });
}
