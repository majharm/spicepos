import crypto from "node:crypto";
import { query } from "./db.js";
import { bid } from "./context.js";
import { requireStaff, requirePerm } from "./auth.js";

const NAME_MAX = 128;
const COMPANY_MAX = 160;
const NOTES_MAX = 255;

function clip(value, max) {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, max) : "";
}

function brandKey(name) {
  return clip(name, NAME_MAX).toLowerCase().replace(/\s+/g, " ");
}

export async function ensureBrandSchema() {
  await query(`CREATE TABLE IF NOT EXISTS brands (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    company VARCHAR(160) NULL,
    notes VARCHAR(255) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_brands_biz_name (business_id, name),
    INDEX idx_brands_biz (business_id)
  )`);
  try {
    await query("ALTER TABLE items ADD COLUMN brand_id VARCHAR(255) NULL");
  } catch {
    /* exists */
  }
}

async function exec(conn, sql, params) {
  if (conn?.query) {
    const [rows] = await conn.query(sql, params);
    return rows;
  }
  return query(sql, params);
}

async function one(conn, sql, params) {
  const rows = await exec(conn, sql, params);
  return rows?.[0] || null;
}

export async function upsertBrand(conn, businessId, body = {}) {
  await ensureBrandSchema();
  const name = clip(body.name || body.brand, NAME_MAX);
  const id = String(body.id || body.brand_id || "").trim();
  const company = clip(body.company || body.manufacturer, COMPANY_MAX) || null;
  const notes = clip(body.notes, NOTES_MAX) || null;
  const status = String(body.status || "active") === "inactive" ? "inactive" : "active";
  if (id) {
    const existing = await one(conn, "SELECT * FROM brands WHERE id=? AND business_id=? LIMIT 1", [id, businessId]);
    if (existing) {
      const nextName = name || existing.name;
      await exec(
        conn,
        "UPDATE brands SET name=?, company=COALESCE(?, company), notes=COALESCE(?, notes), status=? WHERE id=? AND business_id=?",
        [nextName, company, notes, body.status ? status : existing.status, id, businessId],
      );
      return one(conn, "SELECT * FROM brands WHERE id=? AND business_id=? LIMIT 1", [id, businessId]);
    }
  }
  if (!name) return null;
  const found = await one(conn, "SELECT * FROM brands WHERE business_id=? AND LOWER(TRIM(name))=?", [businessId, brandKey(name)]);
  if (found) {
    await exec(
      conn,
      "UPDATE brands SET company=COALESCE(?, company), notes=COALESCE(?, notes), status=? WHERE id=? AND business_id=?",
      [company, notes, body.status ? status : found.status, found.id, businessId],
    );
    return one(conn, "SELECT * FROM brands WHERE id=? AND business_id=? LIMIT 1", [found.id, businessId]);
  }
  const created = {
    id: crypto.randomUUID(),
    name,
    company,
    notes,
    status,
    business_id: businessId,
  };
  await exec(
    conn,
    "INSERT INTO brands (id, name, company, notes, status, business_id) VALUES (?,?,?,?,?,?)",
    [created.id, created.name, created.company, created.notes, created.status, created.business_id],
  );
  return created;
}

export async function saveItemBrand(conn, businessId, itemId, body = {}) {
  const hasBrand = Object.prototype.hasOwnProperty.call(body, "brand") || Object.prototype.hasOwnProperty.call(body, "brand_id") || Object.prototype.hasOwnProperty.call(body, "brand_name");
  if (!hasBrand) return null;
  const name = clip(body.brand || body.brand_name, NAME_MAX);
  const id = String(body.brand_id || "").trim();
  let brandPayload = { name, company: body.manufacturer || body.company };
  if (id && name) {
    const existing = await one(conn, "SELECT * FROM brands WHERE id=? AND business_id=? LIMIT 1", [id, businessId]);
    if (existing && brandKey(existing.name) === brandKey(name)) brandPayload.id = id;
  } else if (id) {
    brandPayload.id = id;
  }
  const brand = await upsertBrand(conn, businessId, brandPayload);
  await exec(conn, "UPDATE items SET brand=?, brand_id=? WHERE id=? AND business_id=?", [
    brand?.name || clip(body.brand || body.brand_name, NAME_MAX) || null,
    brand?.id || null,
    itemId,
    businessId,
  ]);
  return brand;
}

export async function listBrands(businessId) {
  await ensureBrandSchema();
  const brands = await query("SELECT * FROM brands WHERE business_id=? ORDER BY name", [businessId]);
  const counts = await query(
    "SELECT brand_id, brand, COUNT(*) n FROM items WHERE business_id=? GROUP BY brand_id, brand",
    [businessId],
  );
  const byId = new Map();
  const byName = new Map();
  for (const row of counts || []) {
    if (row.brand_id) byId.set(row.brand_id, Number(row.n) || 0);
    if (row.brand) byName.set(String(row.brand).toLowerCase(), (byName.get(String(row.brand).toLowerCase()) || 0) + (Number(row.n) || 0));
  }
  let extras = [];
  try {
    extras = await query("SELECT DISTINCT brand FROM bar_products WHERE business_id=? AND brand IS NOT NULL AND brand<>''", [businessId]);
  } catch {
    extras = [];
  }
  const seen = new Set((brands || []).map((b) => brandKey(b.name)));
  const extraRows = (extras || [])
    .filter((r) => r.brand && !seen.has(brandKey(r.brand)))
    .map((r) => ({ id: "", name: clip(r.brand, NAME_MAX), company: "", notes: "", status: "active", item_count: 0, source: "bar" }));
  return [...(brands || []), ...extraRows].map((b) => ({
    ...b,
    item_count: byId.get(b.id) || byName.get(String(b.name || "").toLowerCase()) || 0,
  }));
}

export function registerBrandStaff(app) {
  app.get("/api/brands", requireStaff, requirePerm("items"), async (_req, res) => {
    try {
      res.json({ brands: await listBrands(bid()) });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/brands", requireStaff, requirePerm("items"), async (req, res) => {
    try {
      const name = clip(req.body?.name, NAME_MAX);
      if (!name) {
        res.status(400).json({ error: "Brand name is required" });
        return;
      }
      const brand = await upsertBrand(null, bid(), req.body);
      res.json({ ok: true, brand });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.put("/api/brands/:id", requireStaff, requirePerm("items"), async (req, res) => {
    try {
      const brand = await upsertBrand(null, bid(), { ...req.body, id: req.params.id });
      if (!brand) {
        res.status(404).json({ error: "Brand not found" });
        return;
      }
      await query("UPDATE items SET brand=? WHERE brand_id=? AND business_id=?", [brand.name, brand.id, bid()]);
      res.json({ ok: true, brand });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.delete("/api/brands/:id", requireStaff, requirePerm("items"), async (req, res) => {
    try {
      await ensureBrandSchema();
      const [used] = await query("SELECT COUNT(*) n FROM items WHERE brand_id=? AND business_id=?", [req.params.id, bid()]);
      if (Number(used?.n) > 0) {
        await query("UPDATE brands SET status='inactive' WHERE id=? AND business_id=?", [req.params.id, bid()]);
        res.json({ ok: true, inactive: true });
        return;
      }
      await query("DELETE FROM brands WHERE id=? AND business_id=?", [req.params.id, bid()]);
      res.json({ ok: true, deleted: true });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });
}
