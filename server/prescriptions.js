import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, withTransaction } from "./db.js";
import { bid } from "./context.js";
import { requirePerm } from "./auth.js";
import "../js/footwear.js";

const POSFootwear = globalThis.POSFootwear;
const RX_STATUSES = ["pending", "under_review", "approved", "order_created", "completed"];
const MAX_BYTES = 8 * 1024 * 1024;
const MIME_EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const uploadRoot = path.join(root, "uploads", "prescriptions");

function cleanText(value, max) {
  return String(value || "").trim().slice(0, max);
}

export function rxOrderingAllowed(biz) {
  return POSFootwear?.isPharmacyShop?.(biz) === true;
}

export function rxStatusLabel(status) {
  const s = String(status || "pending").toLowerCase();
  if (s === "under_review") return "Under Review";
  if (s === "approved") return "Approved";
  if (s === "order_created") return "Order Created";
  if (s === "completed") return "Dispensed";
  return "Pending";
}

export function rxNextStatus(status) {
  const s = String(status || "pending").toLowerCase();
  const i = RX_STATUSES.indexOf(s);
  if (i < 0 || i >= RX_STATUSES.length - 1) return "";
  return RX_STATUSES[i + 1];
}

export function normalizeRxPayload(raw = {}) {
  const customerName = cleanText(raw.customer_name || raw.customerName, 160);
  const mobile = cleanText(raw.mobile, 32).replace(/[^\d+]/g, "");
  const notes = cleanText(raw.notes || raw.message, 1000);
  const fileName = cleanText(raw.file_name || raw.fileName || "prescription", 180);
  let mime = cleanText(raw.mime || raw.mime_type || raw.mimeType, 80).toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  const data = String(raw.file_base64 || raw.fileBase64 || raw.file || "").replace(/^data:[^;]+;base64,/, "");
  if (!customerName) throw new Error("Customer name is required");
  if (mobile.replace(/\D/g, "").length < 10) throw new Error("Valid mobile number is required");
  if (!MIME_EXT[mime]) throw new Error("Upload a camera photo, gallery image, or PDF");
  if (!data) throw new Error("Upload a prescription photo or PDF");
  return { customerName, mobile, notes, fileName, mime, data };
}

export function decodeRxFile(data, mime) {
  let buf;
  try {
    buf = Buffer.from(String(data || ""), "base64");
  } catch {
    throw new Error("Could not read the uploaded file");
  }
  if (!buf.length) throw new Error("Upload a prescription photo or PDF");
  if (buf.length > MAX_BYTES) throw new Error("File is too large (max 8 MB)");
  if (mime === "application/pdf" && buf.slice(0, 4).toString() !== "%PDF") throw new Error("That PDF could not be read");
  if (mime.startsWith("image/") && buf[0] !== 0xff && buf[0] !== 0x89 && buf[0] !== 0x52) {
    /* jpeg / png / webp — still save if decode succeeded */
  }
  return buf;
}

function safeDir(id) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

export function rxUploadDir(businessId) {
  return path.join(uploadRoot, safeDir(businessId) || "shop");
}

export function writeRxFile(businessId, id, mime, buf) {
  const dir = rxUploadDir(businessId);
  fs.mkdirSync(dir, { recursive: true });
  const ext = MIME_EXT[mime] || "bin";
  const file = `${id}.${ext}`;
  const abs = path.join(dir, file);
  fs.writeFileSync(abs, buf);
  return path.posix.join("uploads/prescriptions", safeDir(businessId) || "shop", file);
}

export function resolveRxFile(rel) {
  const raw = String(rel || "").replace(/\\/g, "/");
  if (!raw.startsWith("uploads/prescriptions/")) return "";
  const abs = path.join(root, raw);
  const resolved = path.resolve(abs);
  const base = path.resolve(uploadRoot);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return "";
  return fs.existsSync(resolved) ? resolved : "";
}

export async function ensureRxSchema(conn = null) {
  const exec = conn ? (sql, params = []) => conn.query(sql, params) : query;
  await exec(`CREATE TABLE IF NOT EXISTS prescription_orders (
    id VARCHAR(255) PRIMARY KEY,
    prescription_number VARCHAR(32) NOT NULL,
    business_id VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255) NULL,
    customer_name VARCHAR(160) NOT NULL,
    mobile VARCHAR(32) NOT NULL,
    notes TEXT NULL,
    file_name VARCHAR(180) NULL,
    mime_type VARCHAR(80) NULL,
    file_path VARCHAR(500) NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_rx_number (business_id, prescription_number),
    INDEX idx_rx_business_status (business_id, status, created_at)
  )`);
}

async function nextRxNumber(conn, businessId) {
  const [rows] = await conn.query(
    "SELECT next_value FROM number_sequences WHERE name = 'prescription' AND business_id = ? FOR UPDATE",
    [businessId],
  );
  const next = rows[0] ? Number(rows[0].next_value) : 1001;
  if (rows[0]) {
    await conn.query(
      "UPDATE number_sequences SET next_value = ? WHERE name = ? AND business_id = ?",
      [next + 1, "prescription", businessId],
    );
  } else {
    await conn.query(
      "INSERT INTO number_sequences (name, next_value, business_id) VALUES (?,?,?)",
      ["prescription", next + 1, businessId],
    );
  }
  return `PR-${next}`;
}

async function businessForPublic(shop) {
  const key = cleanText(shop, 255);
  if (!key) return null;
  const rows = await query(
    `SELECT b.*, c.name AS company_name, c.address AS company_address, c.phone AS company_phone,
            c.logo_url AS company_logo
     FROM businesses b
     LEFT JOIN company_settings c ON c.business_id = b.id
     WHERE (b.id = ? OR b.code = ?) AND b.status = 'active' LIMIT 1`,
    [key, key],
  );
  return rows[0] || null;
}

function shopPayload(business) {
  return {
    id: business.id,
    code: business.code,
    name: business.company_name || business.name,
    address: business.company_address || business.address || "",
    phone: business.company_phone || business.mobile || "",
    logo_url: business.company_logo || business.logo_url || "",
  };
}

function publicRow(row) {
  if (!row) return null;
  const { file_path, ...rest } = row;
  return {
    ...rest,
    status_label: rxStatusLabel(row.status),
    has_file: Boolean(file_path),
  };
}

export function registerRxPublic(app) {
  app.get("/api/rx/shop", async (req, res) => {
    try {
      await ensureRxSchema();
      const business = await businessForPublic(req.query.shop);
      if (!business) return res.status(404).json({ error: "Pharmacy not found" });
      if (!rxOrderingAllowed(business)) return res.status(403).json({ error: "Prescription upload is only for pharmacy shops" });
      res.json({ shop: shopPayload(business) });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/rx/prescriptions", async (req, res) => {
    try {
      const input = normalizeRxPayload(req.body || {});
      const buf = decodeRxFile(input.data, input.mime);
      const business = await businessForPublic(req.body?.shop);
      if (!business) return res.status(404).json({ error: "Pharmacy not found" });
      if (!rxOrderingAllowed(business)) return res.status(403).json({ error: "Prescription upload is only for pharmacy shops" });
      const result = await withTransaction(async (conn) => {
        await ensureRxSchema(conn);
        const id = crypto.randomUUID();
        const number = await nextRxNumber(conn, business.id);
        const filePath = writeRxFile(business.id, id, input.mime, buf);
        await conn.query(
          `INSERT INTO prescription_orders
           (id, prescription_number, business_id, customer_name, mobile, notes, file_name, mime_type, file_path, status)
           VALUES (?,?,?,?,?,?,?,?,?,'pending')`,
          [
            id,
            number,
            business.id,
            input.customerName,
            input.mobile,
            input.notes || null,
            input.fileName,
            input.mime,
            filePath,
          ],
        );
        return { id, prescription_number: number, status: "pending" };
      });
      res.status(201).json({
        ok: true,
        prescription: result,
        message: "Prescription submitted successfully. Pharmacy will review it and contact you.",
      });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });
}

export function registerRxStaff(app) {
  app.get("/api/prescriptions", requirePerm("orders"), async (req, res) => {
    try {
      const bizRows = await query("SELECT name, category, business_type FROM businesses WHERE id=?", [bid()]);
      if (!rxOrderingAllowed(bizRows[0] || {})) return res.status(403).json({ error: "Prescriptions are only for pharmacy shops" });
      await ensureRxSchema();
      const status = cleanText(req.query.status, 24).toLowerCase();
      const params = [bid()];
      let extra = "";
      if (status && RX_STATUSES.includes(status)) {
        extra = " AND status = ?";
        params.push(status);
      }
      const rows = await query(
        `SELECT * FROM prescription_orders WHERE business_id = ?${extra}
         ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'under_review' THEN 1 WHEN 'approved' THEN 2
           WHEN 'order_created' THEN 3 ELSE 4 END, created_at DESC LIMIT 200`,
        params,
      );
      res.json(rows.map(publicRow));
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.patch("/api/prescriptions/:id", requirePerm("orders"), async (req, res) => {
    try {
      const bizRows = await query("SELECT name, category, business_type FROM businesses WHERE id=?", [bid()]);
      if (!rxOrderingAllowed(bizRows[0] || {})) return res.status(403).json({ error: "Prescriptions are only for pharmacy shops" });
      await ensureRxSchema();
      const status = cleanText(req.body?.status, 24).toLowerCase();
      if (!RX_STATUSES.includes(status)) return res.status(400).json({ error: "Invalid prescription status" });
      const id = cleanText(req.params.id, 255);
      const [found] = await query("SELECT * FROM prescription_orders WHERE id = ? AND business_id = ?", [id, bid()]);
      if (!found) return res.status(404).json({ error: "Prescription not found" });
      await query("UPDATE prescription_orders SET status = ? WHERE id = ? AND business_id = ?", [status, id, bid()]);
      const [row] = await query("SELECT * FROM prescription_orders WHERE id = ? AND business_id = ?", [id, bid()]);
      res.json({ ok: true, prescription: publicRow(row) });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.get("/api/prescriptions/:id/file", requirePerm("orders"), async (req, res) => {
    try {
      await ensureRxSchema();
      const id = cleanText(req.params.id, 255);
      const [row] = await query("SELECT * FROM prescription_orders WHERE id = ? AND business_id = ?", [id, bid()]);
      if (!row) return res.status(404).json({ error: "Prescription not found" });
      const abs = resolveRxFile(row.file_path);
      if (!abs) return res.status(404).json({ error: "File not found" });
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", row.mime_type || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${String(row.file_name || "prescription").replace(/"/g, "")}"`);
      res.sendFile(abs);
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });
}
