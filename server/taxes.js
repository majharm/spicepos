import crypto from "node:crypto";
import { query } from "./db.js";
import { bid } from "./context.js";
import { requireStaff, requirePerm } from "./auth.js";
import "../js/tax-master.js";

const POSTaxes = globalThis.POSTaxes;

function taxCode(name, raw) {
  const fromRaw = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const fromName = String(name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (fromRaw || fromName).slice(0, 16);
}

function taxPayload(body) {
  const name = String(body?.name || "").trim().slice(0, 80);
  if (!name) throw new Error("Name is required");
  const code = taxCode(name, body?.code);
  if (!code) throw new Error("Name is required");
  const split = POSTaxes.splitTax(body?.tax_type, body?.rate);
  const hsn = String(body?.hsn || "").trim().slice(0, 32);
  const status = body?.status === "inactive" ? "inactive" : "active";
  return { code, name, hsn, status, ...split };
}

export async function ensureTaxRates(businessId) {
  await query(`CREATE TABLE IF NOT EXISTS tax_rates (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    code VARCHAR(16) NOT NULL,
    name VARCHAR(80) NOT NULL,
    tax_type VARCHAR(16) NOT NULL DEFAULT 'gst',
    rate DECIMAL(6,2) NOT NULL DEFAULT 0,
    cgst_rate DECIMAL(6,2) NOT NULL DEFAULT 0,
    sgst_rate DECIMAL(6,2) NOT NULL DEFAULT 0,
    igst_rate DECIMAL(6,2) NOT NULL DEFAULT 0,
    hsn VARCHAR(32) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    sort_order INT NOT NULL DEFAULT 0,
    UNIQUE KEY uniq_tax_biz_code (business_id, code),
    INDEX (business_id)
  )`);
  if (!businessId) return [];
  for (const row of POSTaxes.DEFAULTS) {
    const split = POSTaxes.splitTax(row.tax_type, row.rate);
    await query(
      `INSERT IGNORE INTO tax_rates (
         id, business_id, code, name, tax_type, rate, cgst_rate, sgst_rate, igst_rate, hsn, status, sort_order
       ) VALUES (?,?,?,?,?,?,?,?,?,NULL,'active',?)`,
      [
        crypto.randomUUID(),
        businessId,
        row.code,
        row.name,
        split.tax_type,
        split.rate,
        split.cgst_rate,
        split.sgst_rate,
        split.igst_rate,
        row.sort_order,
      ],
    );
  }
  return query("SELECT * FROM tax_rates WHERE business_id = ? ORDER BY sort_order, name", [businessId]);
}

export function registerTaxes(app) {
  app.get("/api/taxes", requireStaff, requirePerm("items"), async (_req, res) => {
    try {
      res.json(await ensureTaxRates(bid()));
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/taxes", requireStaff, requirePerm("items"), async (req, res) => {
    try {
      await ensureTaxRates(bid());
      const tax = taxPayload(req.body || {});
      const dup = await query(
        "SELECT id FROM tax_rates WHERE business_id = ? AND (code = ? OR LOWER(name) = LOWER(?)) LIMIT 1",
        [bid(), tax.code, tax.name],
      );
      if (dup.length) {
        res.status(400).json({ error: "That tax name is already used" });
        return;
      }
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO tax_rates (
           id, business_id, code, name, tax_type, rate, cgst_rate, sgst_rate, igst_rate, hsn, status, sort_order
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          bid(),
          tax.code,
          tax.name,
          tax.tax_type,
          tax.rate,
          tax.cgst_rate,
          tax.sgst_rate,
          tax.igst_rate,
          tax.hsn || null,
          tax.status,
          Number(req.body?.sort_order) || 90,
        ],
      );
      const [row] = await query("SELECT * FROM tax_rates WHERE id = ? AND business_id = ?", [id, bid()]);
      res.json({ ok: true, tax: row });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  app.put("/api/taxes/:id", requireStaff, requirePerm("items"), async (req, res) => {
    try {
      await ensureTaxRates(bid());
      const tax = taxPayload(req.body || {});
      const dup = await query(
        "SELECT id FROM tax_rates WHERE business_id = ? AND id <> ? AND (code = ? OR LOWER(name) = LOWER(?)) LIMIT 1",
        [bid(), req.params.id, tax.code, tax.name],
      );
      if (dup.length) {
        res.status(400).json({ error: "That tax name is already used" });
        return;
      }
      await query(
        `UPDATE tax_rates
         SET code=?, name=?, tax_type=?, rate=?, cgst_rate=?, sgst_rate=?, igst_rate=?, hsn=?, status=?
         WHERE id=? AND business_id=?`,
        [
          tax.code,
          tax.name,
          tax.tax_type,
          tax.rate,
          tax.cgst_rate,
          tax.sgst_rate,
          tax.igst_rate,
          tax.hsn || null,
          tax.status,
          req.params.id,
          bid(),
        ],
      );
      const [row] = await query("SELECT * FROM tax_rates WHERE id = ? AND business_id = ?", [req.params.id, bid()]);
      if (!row) {
        res.status(404).json({ error: "Tax not found" });
        return;
      }
      res.json({ ok: true, tax: row });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  app.delete("/api/taxes/:id", requireStaff, requirePerm("items"), async (req, res) => {
    try {
      const [row] = await query("SELECT * FROM tax_rates WHERE id = ? AND business_id = ?", [req.params.id, bid()]);
      if (!row) {
        res.status(404).json({ error: "Tax not found" });
        return;
      }
      const [used] = await query(
        "SELECT COUNT(*) AS c FROM items WHERE business_id = ? AND ROUND(gst_rate, 2) = ?",
        [bid(), Number(row.rate)],
      );
      if (Number(used?.c) > 0) {
        res.status(400).json({
          error: `${used.c} items use this rate. Mark the tax inactive, or change those items first.`,
        });
        return;
      }
      await query("DELETE FROM tax_rates WHERE id = ? AND business_id = ?", [req.params.id, bid()]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });
}
