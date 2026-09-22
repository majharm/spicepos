import crypto from "node:crypto";
import { query, withTransaction } from "./db.js";
import { bid, authUser } from "./context.js";
import { requirePerm } from "./auth.js";
import { hashPassword, verifyPassword } from "./password.js";
import { sendMail } from "./mail.js";
import { sendWhatsApp } from "./alerts.js";
import { settleCustomerInvoice } from "./accounts.js";
import "../js/print.js";
import "../js/footwear.js";

const POSPrint = globalThis.POSPrint;

function uuid() {
  return crypto.randomUUID();
}

function clip(v, n) {
  return String(v || "").trim().slice(0, n);
}

function digits(v) {
  return String(v || "").replace(/\D/g, "");
}

function round(n) {
  return POSPrint.round2(n);
}

async function hasTable(table) {
  const rows = await query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return rows.length > 0;
}

export async function ensurePrintSchema() {
  await query(`CREATE TABLE IF NOT EXISTS print_settings (
    business_id VARCHAR(255) PRIMARY KEY,
    settings_json MEDIUMTEXT NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  )`);
  try {
    await query("ALTER TABLE print_settings MODIFY settings_json MEDIUMTEXT NULL");
  } catch {
    /* already wide enough */
  }
  await query(`CREATE TABLE IF NOT EXISTS print_materials (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    name VARCHAR(180) NOT NULL,
    price_model VARCHAR(16) NOT NULL DEFAULT 'sqft',
    rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    pack_qty INT NOT NULL DEFAULT 1,
    gst_rate DECIMAL(8,2) NOT NULL DEFAULT 18,
    min_sqft DECIMAL(12,2) NOT NULL DEFAULT 0,
    active TINYINT NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS print_finishing (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    name VARCHAR(180) NOT NULL,
    rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    unit VARCHAR(16) NOT NULL DEFAULT 'job',
    gst_rate DECIMAL(8,2) NOT NULL DEFAULT 18,
    active TINYINT NOT NULL DEFAULT 1,
    INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS print_orders (
    id VARCHAR(255) PRIMARY KEY,
    order_number VARCHAR(32) NOT NULL,
    business_id VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255) NULL,
    customer_id VARCHAR(255) NOT NULL,
    customer_name VARCHAR(180) NULL,
    customer_mobile VARCHAR(32) NULL,
    customer_email VARCHAR(160) NULL,
    product VARCHAR(80) NOT NULL,
    print_type VARCHAR(16) NOT NULL DEFAULT 'single',
    material_id VARCHAR(255) NULL,
    material_name VARCHAR(180) NULL,
    width DECIMAL(12,4) NOT NULL DEFAULT 0,
    height DECIMAL(12,4) NOT NULL DEFAULT 0,
    unit VARCHAR(16) NOT NULL DEFAULT 'ft',
    dpi INT NULL,
    area_sqft DECIMAL(14,4) NOT NULL DEFAULT 0,
    quantity INT NOT NULL DEFAULT 1,
    rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    price_model VARCHAR(16) NOT NULL DEFAULT 'sqft',
    printing_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    finishing_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    delivery_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    other_charges DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst_rate DECIMAL(8,2) NOT NULL DEFAULT 18,
    estimate_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    quote_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    balance_due DECIMAL(12,2) NOT NULL DEFAULT 0,
    pay_status VARCHAR(16) NOT NULL DEFAULT 'pending',
    status VARCHAR(32) NOT NULL DEFAULT 'pending_review',
    notes TEXT NULL,
    admin_notes TEXT NULL,
    approved_file_id VARCHAR(255) NULL,
    sales_order_id VARCHAR(255) NULL,
    staff_id VARCHAR(255) NULL,
    staff_name VARCHAR(180) NULL,
    urgent TINYINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id), INDEX (customer_id), INDEX (status), INDEX (order_number)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS print_order_finishing (
    id VARCHAR(255) PRIMARY KEY,
    order_id VARCHAR(255) NOT NULL,
    finishing_id VARCHAR(255) NULL,
    name VARCHAR(180) NOT NULL,
    rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    unit VARCHAR(16) NOT NULL DEFAULT 'job',
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    business_id VARCHAR(255) NOT NULL,
    INDEX (order_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS print_files (
    id VARCHAR(255) PRIMARY KEY,
    order_id VARCHAR(255) NULL,
    business_id VARCHAR(255) NOT NULL,
    customer_id VARCHAR(255) NULL,
    version INT NOT NULL DEFAULT 1,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(32) NULL,
    file_size INT NOT NULL DEFAULT 0,
    mime VARCHAR(80) NULL,
    width_px INT NULL,
    height_px INT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'uploaded',
    uploaded_by VARCHAR(24) NOT NULL DEFAULT 'customer',
    content LONGBLOB NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (order_id), INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS print_quotes (
    id VARCHAR(255) PRIMARY KEY,
    order_id VARCHAR(255) NOT NULL,
    business_id VARCHAR(255) NOT NULL,
    quote_json TEXT NULL,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'sent',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (order_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS print_status_history (
    id VARCHAR(255) PRIMARY KEY,
    order_id VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL,
    staff_id VARCHAR(255) NULL,
    staff_name VARCHAR(180) NULL,
    note TEXT NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (order_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS print_payments (
    id VARCHAR(255) PRIMARY KEY,
    order_id VARCHAR(255) NOT NULL,
    customer_id VARCHAR(255) NULL,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    method VARCHAR(32) NOT NULL DEFAULT 'upi',
    kind VARCHAR(24) NOT NULL DEFAULT 'advance',
    status VARCHAR(16) NOT NULL DEFAULT 'paid',
    reference VARCHAR(80) NULL,
    receipt_no VARCHAR(32) NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (order_id), INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS print_otps (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(160) NOT NULL,
    mobile VARCHAR(32) NULL,
    code_hash VARCHAR(255) NOT NULL,
    purpose VARCHAR(24) NOT NULL DEFAULT 'login',
    business_id VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (email), INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS print_sessions (
    id VARCHAR(255) PRIMARY KEY,
    token_hash VARCHAR(64) NOT NULL,
    customer_id VARCHAR(255) NOT NULL,
    business_id VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    INDEX (token_hash)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS print_notifications (
    id VARCHAR(255) PRIMARY KEY,
    kind VARCHAR(32) NOT NULL,
    channel VARCHAR(16) NOT NULL,
    customer_id VARCHAR(255) NULL,
    order_id VARCHAR(255) NULL,
    body TEXT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'queued',
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);
  if (!(await hasTable("customers"))) return;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function bearer(req) {
  const h = String(req.headers.authorization || "");
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return String(req.headers["x-print-token"] || req.query?.token || "").trim();
}

async function loadShop(id) {
  const rows = await query("SELECT * FROM businesses WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
}

export function printShopAllowed(biz) {
  return POSPrint?.isPrintShop?.(biz) || globalThis.POSFootwear?.shopKind?.(biz) === "printing";
}

function clipPortalImage(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(s) && s.length <= 1_200_000) return s;
  if (/^(\.\/assets\/|https?:\/\/)/i.test(s)) return s.slice(0, 500);
  throw new Error("Use a JPG, PNG or WebP under 900 KB for the customer portal image");
}

async function settingsOf(shopId) {
  const rows = await query("SELECT settings_json FROM print_settings WHERE business_id = ?", [shopId]);
  let extra = {};
  try {
    extra = JSON.parse(rows[0]?.settings_json || "{}");
  } catch {
    extra = {};
  }
  return { ...POSPrint.DEFAULT_SETTINGS, ...extra };
}

async function seedCatalog(shopId) {
  const mats = await query("SELECT id FROM print_materials WHERE business_id = ? LIMIT 1", [shopId]);
  if (!mats.length) {
    for (const [i, m] of POSPrint.DEFAULT_MATERIALS.entries()) {
      await query(
        `INSERT INTO print_materials (id, business_id, name, price_model, rate, pack_qty, gst_rate, active, sort_order)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [`${shopId}:${m.id}`, shopId, m.name, m.price_model, m.rate, m.pack_qty || 1, m.gst_rate, 1, i],
      );
    }
  }
  const fin = await query("SELECT id FROM print_finishing WHERE business_id = ? LIMIT 1", [shopId]);
  if (!fin.length) {
    for (const f of POSPrint.DEFAULT_FINISHING) {
      await query(
        `INSERT INTO print_finishing (id, business_id, name, rate, unit, gst_rate, active)
         VALUES (?,?,?,?,?,?,?)`,
        [`${shopId}:${f.id}`, shopId, f.name, f.rate, f.unit, f.gst_rate, 1],
      );
    }
  }
}

async function catalog(shopId) {
  await seedCatalog(shopId);
  const materials = await query("SELECT * FROM print_materials WHERE business_id = ? ORDER BY sort_order, name", [shopId]);
  const finishing = await query("SELECT * FROM print_finishing WHERE business_id = ? ORDER BY name", [shopId]);
  const settings = await settingsOf(shopId);
  return { materials, finishing, settings, products: POSPrint.PRODUCTS, units: POSPrint.UNITS, sides: POSPrint.PRINT_SIDES, dpis: POSPrint.DPIS };
}

async function customerFromToken(req, shopId) {
  const token = bearer(req);
  if (!token) return null;
  const rows = await query(
    `SELECT s.customer_id FROM print_sessions s WHERE s.token_hash = ? AND s.business_id = ? AND s.expires_at > NOW() LIMIT 1`,
    [hashToken(token), shopId],
  );
  if (!rows[0]) return null;
  const cust = await query("SELECT * FROM customers WHERE id = ? AND business_id = ?", [rows[0].customer_id, shopId]);
  return cust[0] || null;
}

async function requirePortal(req, res, shopId) {
  const c = await customerFromToken(req, shopId);
  if (!c) {
    res.status(401).json({ error: "Sign in required" });
    return null;
  }
  return c;
}

async function issueSession(customerId, businessId) {
  const token = crypto.randomBytes(24).toString("hex");
  await query(
    `INSERT INTO print_sessions (id, token_hash, customer_id, business_id, expires_at)
     VALUES (?,?,?,?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
    [uuid(), hashToken(token), customerId, businessId],
  );
  return token;
}

function noticeCopy(kind, ctx) {
  const n = ctx?.order_number || "your order";
  const map = {
    file_received: `We received print files for ${n}.`,
    file_approved: `File approved for ${n}.`,
    file_rejected: `File rejected for ${n}. Please upload a new file.`,
    quote_created: `Quote ready for ${n}. Please review and approve.`,
    quote_updated: `Quote updated for ${n}.`,
    approval_required: `Your approval is required for ${n}.`,
    payment_received: `Payment received for ${n}.`,
    production_started: `Production started for ${n}.`,
    printing_completed: `Printing completed for ${n}.`,
    order_ready: `${n} is ready for pickup/delivery.`,
    dispatched: `${n} has been dispatched.`,
    delivered: `${n} has been delivered.`,
  };
  return map[kind] || `Update on ${n}.`;
}

async function notify(businessId, { kind, customerId, orderId, email, mobile, ctx }) {
  const body = noticeCopy(kind, ctx || {});
  for (const channel of ["email", "sms", "whatsapp", "in_app"]) {
    await query(
      `INSERT INTO print_notifications (id, kind, channel, customer_id, order_id, body, status, business_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [uuid(), kind, channel, customerId || null, orderId || null, body, "queued", businessId],
    );
  }
  try {
    if (email) await sendMail({ to: email, subject: "ATAV Print Shop", text: body });
  } catch {
    /* optional */
  }
  try {
    const cfg = await getPlatformSettings();
    if (mobile) await sendWhatsApp(cfg, [mobile], body);
  } catch {
    /* optional */
  }
}

async function nextNumber(shopId) {
  const y = new Date().getFullYear();
  const rows = await query(
    `SELECT COUNT(*) n FROM print_orders WHERE business_id = ? AND order_number LIKE ?`,
    [shopId, `FP-${y}-%`],
  );
  return POSPrint.nextOrderNumber(Number(rows[0]?.n || 0) + 1, y);
}

function decodeDataUrl(raw) {
  const s = String(raw || "");
  const m = s.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { mime: m[1], buf: Buffer.from(m[2], "base64") };
  if (/^[A-Za-z0-9+/=\s]+$/.test(s) && s.length > 80) return { mime: "application/octet-stream", buf: Buffer.from(s.replace(/\s/g, ""), "base64") };
  return null;
}

function publicOrder(row, files = [], finishing = [], history = []) {
  const quote = POSPrint.quoteTotals({
    width: row.width,
    height: row.height,
    unit: row.unit,
    quantity: row.quantity,
    rate: row.rate,
    price_model: row.price_model,
    gst_rate: row.gst_rate,
    finishing,
    delivery: row.delivery_amount,
    discount: row.discount,
    other_charges: row.other_charges,
    paid: row.paid_amount,
  });
  return {
    ...row,
    files: files.map(publicFile),
    finishing,
    history,
    quote,
    conversions: POSPrint.convertSize(row.width, row.height, row.unit),
    timeline: POSPrint.customerTimeline(row.status),
    status_label: POSPrint.statusMeta(row.status).label,
  };
}

function publicFile(f) {
  if (!f) return null;
  return {
    id: f.id,
    order_id: f.order_id,
    version: f.version,
    file_name: f.file_name,
    file_type: f.file_type,
    file_size: f.file_size,
    mime: f.mime,
    width_px: f.width_px,
    height_px: f.height_px,
    status: f.status,
    uploaded_by: f.uploaded_by,
    created_at: f.created_at,
    preview: String(f.mime || "").startsWith("image/") ? `/api/print/public/file/${f.id}` : "",
  };
}

async function orderBundle(id, shopId) {
  const [row] = await query("SELECT * FROM print_orders WHERE id = ? AND business_id = ?", [id, shopId]);
  if (!row) return null;
  const files = await query(
    "SELECT id, order_id, business_id, customer_id, version, file_name, file_type, file_size, mime, width_px, height_px, status, uploaded_by, created_at FROM print_files WHERE order_id = ? ORDER BY version DESC",
    [id],
  );
  const finishing = await query("SELECT * FROM print_order_finishing WHERE order_id = ?", [id]);
  const history = await query("SELECT * FROM print_status_history WHERE order_id = ? ORDER BY created_at", [id]);
  const payments = await query("SELECT * FROM print_payments WHERE order_id = ? ORDER BY created_at", [id]);
  return { ...publicOrder(row, files, finishing, history), payments };
}

async function saveHistory(orderId, status, shopId, staff, note) {
  await query(
    `INSERT INTO print_status_history (id, order_id, status, staff_id, staff_name, note, business_id) VALUES (?,?,?,?,?,?,?)`,
    [uuid(), orderId, status, staff?.id || null, staffName(staff), clip(note, 500), shopId],
  );
}

function staffName(staff) {
  if (!staff) return "";
  return clip([staff.first_name, staff.last_name, staff.name, staff.username].filter(Boolean).join(" "), 180);
}

async function applyTotals(orderId, extra = {}) {
  const [row] = await query("SELECT * FROM print_orders WHERE id = ?", [orderId]);
  const finishing = await query("SELECT * FROM print_order_finishing WHERE order_id = ?", [orderId]);
  const q = POSPrint.quoteTotals({
    width: extra.width ?? row.width,
    height: extra.height ?? row.height,
    unit: extra.unit ?? row.unit,
    quantity: extra.quantity ?? row.quantity,
    rate: extra.rate ?? row.rate,
    price_model: extra.price_model ?? row.price_model,
    gst_rate: extra.gst_rate ?? row.gst_rate,
    finishing,
    delivery: extra.delivery_amount ?? row.delivery_amount,
    discount: extra.discount ?? row.discount,
    other_charges: extra.other_charges ?? row.other_charges,
    paid: extra.paid_amount ?? row.paid_amount,
  });
  await query(
    `UPDATE print_orders SET area_sqft=?, printing_amount=?, finishing_amount=?, estimate_total=?, quote_total=?,
     gst=?, paid_amount=?, balance_due=?, pay_status=? WHERE id=?`,
    [q.area, q.printing, q.finishing, q.total, q.total, q.gst, q.paid, q.balance, q.pay_status, orderId],
  );
  return q;
}

export function registerPrintPublic(app) {
  app.get("/api/print/public/:shopId", async (req, res) => {
    try {
      const shop = await loadShop(req.params.shopId);
      if (!shop || !printShopAllowed(shop)) return res.status(404).json({ error: "Print shop not found" });
      const cat = await catalog(req.params.shopId);
      res.json({
        shop: { id: shop.id, name: shop.name, category: shop.category, phone: shop.mobile, address: shop.address },
        ...cat,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/print/public/:shopId/register", async (req, res) => {
    try {
      const shop = await loadShop(req.params.shopId);
      if (!shop) throw new Error("Shop not found");
      const email = clip(req.body.email, 160).toLowerCase();
      const name = clip(req.body.name, 180);
      const mobile = digits(req.body.mobile).slice(0, 15);
      const password = String(req.body.password || "");
      if (!email || !name || password.length < 6) throw new Error("Name, email, and a 6+ character password are required");
      const dup = await query("SELECT id FROM customers WHERE business_id = ? AND email = ? LIMIT 1", [req.params.shopId, email]);
      if (dup[0]) throw new Error("This email is already registered");
      const id = uuid();
      const hash = await hashPassword(password);
      await query(
        `INSERT INTO customers (id, name, mobile, email, password_hash, type, business_id) VALUES (?,?,?,?,?,'b2c',?)`,
        [id, name, mobile, email, hash, req.params.shopId],
      );
      const token = await issueSession(id, req.params.shopId);
      res.json({ token, customer: { id, name, email, mobile } });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/print/public/:shopId/login", async (req, res) => {
    try {
      const ident = clip(req.body.email || req.body.mobile || req.body.identifier, 160).toLowerCase();
      const password = String(req.body.password || "");
      if (!ident || !password) throw new Error("Email/mobile and password required");
      const rows = await query(
        `SELECT * FROM customers WHERE business_id = ? AND (LOWER(email) = ? OR mobile = ?) LIMIT 1`,
        [req.params.shopId, ident, digits(ident)],
      );
      const c = rows[0];
      if (!c?.password_hash || !(await verifyPassword(password, c.password_hash))) throw new Error("Invalid login");
      const token = await issueSession(c.id, req.params.shopId);
      res.json({ token, customer: { id: c.id, name: c.name, email: c.email, mobile: c.mobile } });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/print/public/:shopId/otp/send", async (req, res) => {
    try {
      const email = clip(req.body.email, 160).toLowerCase();
      const mobile = digits(req.body.mobile).slice(0, 15);
      if (!email && !mobile) throw new Error("Email or mobile required");
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await query(
        `INSERT INTO print_otps (id, email, mobile, code_hash, purpose, business_id, expires_at)
         VALUES (?,?,?,?, 'login', ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
        [uuid(), email || `${mobile}@otp.local`, mobile, await hashPassword(code), req.params.shopId],
      );
      try {
        if (email) await sendMail({ to: email, subject: "Print portal OTP", text: `Your OTP is ${code}` });
      } catch {
        /* optional */
      }
      res.json({ ok: true, demo_otp: process.env.NODE_ENV === "test" ? code : undefined });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/print/public/:shopId/otp/verify", async (req, res) => {
    try {
      const email = clip(req.body.email, 160).toLowerCase();
      const code = String(req.body.otp || "");
      const rows = await query(
        `SELECT * FROM print_otps WHERE business_id = ? AND email = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
        [req.params.shopId, email],
      );
      const otp = rows[0];
      if (!otp || !(await verifyPassword(code, otp.code_hash))) throw new Error("Invalid OTP");
      let [c] = await query("SELECT * FROM customers WHERE business_id = ? AND email = ? LIMIT 1", [req.params.shopId, email]);
      if (!c) {
        const id = uuid();
        await query(`INSERT INTO customers (id, name, email, type, business_id) VALUES (?,?,?,'b2c',?)`, [id, email.split("@")[0], email, req.params.shopId]);
        [c] = await query("SELECT * FROM customers WHERE id = ?", [id]);
      }
      if (req.body.password) {
        await query("UPDATE customers SET password_hash = ? WHERE id = ?", [await hashPassword(String(req.body.password)), c.id]);
      }
      const token = await issueSession(c.id, req.params.shopId);
      res.json({ token, customer: { id: c.id, name: c.name, email: c.email, mobile: c.mobile } });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/print/public/:shopId/me", async (req, res) => {
    try {
      const c = await requirePortal(req, res, req.params.shopId);
      if (!c) return;
      const orders = await query(
        `SELECT * FROM print_orders WHERE customer_id = ? AND business_id = ? ORDER BY created_at DESC LIMIT 200`,
        [c.id, req.params.shopId],
      );
      const payments = await query(
        `SELECT * FROM print_payments WHERE customer_id = ? AND business_id = ? ORDER BY created_at DESC LIMIT 200`,
        [c.id, req.params.shopId],
      );
      const files = await query(
        `SELECT id, order_id, version, file_name, file_type, file_size, mime, width_px, height_px, status, uploaded_by, created_at
         FROM print_files WHERE customer_id = ? AND business_id = ? ORDER BY created_at DESC LIMIT 200`,
        [c.id, req.params.shopId],
      );
      res.json({
        customer: { id: c.id, name: c.name, email: c.email, mobile: c.mobile },
        orders: orders.map((o) => publicOrder(o)),
        payments,
        files: files.map(publicFile),
        inbox: await query(
          `SELECT id, kind, body, created_at FROM print_notifications WHERE customer_id = ? AND channel = 'in_app' ORDER BY created_at DESC LIMIT 40`,
          [c.id],
        ),
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/print/public/:shopId/profile", async (req, res) => {
    try {
      const c = await requirePortal(req, res, req.params.shopId);
      if (!c) return;
      await query("UPDATE customers SET name = ?, mobile = ? WHERE id = ?", [clip(req.body.name, 180) || c.name, digits(req.body.mobile).slice(0, 15), c.id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/print/public/:shopId/orders", async (req, res) => {
    try {
      const c = await requirePortal(req, res, req.params.shopId);
      if (!c) return;
      const cat = await catalog(req.params.shopId);
      const body = req.body || {};
      const material = (cat.materials || []).find((m) => m.id === body.material_id) || cat.materials[0];
      if (!material) throw new Error("Select a material");
      const finishIds = Array.isArray(body.finishing_ids) ? body.finishing_ids : [];
      const finishing = (cat.finishing || []).filter((f) => finishIds.includes(f.id) && Number(f.active) !== 0);
      const q = POSPrint.quoteTotals({
        width: body.width,
        height: body.height,
        unit: body.unit,
        quantity: body.quantity,
        dpi: body.dpi,
        rate: material.rate,
        price_model: material.price_model,
        material,
        gst_rate: cat.settings.gst_rate,
        finishing,
        delivery: finishing.find((f) => /delivery/i.test(f.name)) ? 0 : Number(body.delivery) || 0,
        min_billing_sqft: material.min_sqft,
        min_order_amount: cat.settings.min_order_amount,
      });
      const id = uuid();
      const number = await nextNumber(req.params.shopId);
      await query(
        `INSERT INTO print_orders (
           id, order_number, business_id, customer_id, customer_name, customer_mobile, customer_email,
           product, print_type, material_id, material_name, width, height, unit, dpi, area_sqft, quantity,
           rate, price_model, printing_amount, finishing_amount, delivery_amount, gst, gst_rate,
           estimate_total, quote_total, paid_amount, balance_due, pay_status, status, notes, urgent
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          number,
          req.params.shopId,
          c.id,
          c.name,
          c.mobile,
          c.email,
          clip(body.product, 80) || "Flex",
          clip(body.print_type, 16) || "single",
          material.id,
          material.name,
          Number(body.width) || 0,
          Number(body.height) || 0,
          clip(body.unit, 16) || "ft",
          body.dpi ? Number(body.dpi) : null,
          q.area,
          q.qty,
          material.rate,
          material.price_model,
          q.printing,
          q.finishing,
          q.delivery,
          q.gst,
          q.gst_rate,
          q.total,
          q.total,
          0,
          q.total,
          "pending",
          "pending_review",
          clip(body.notes, 2000),
          body.urgent ? 1 : 0,
        ],
      );
      for (const f of finishing) {
        await query(
          `INSERT INTO print_order_finishing (id, order_id, finishing_id, name, rate, unit, amount, business_id) VALUES (?,?,?,?,?,?,?,?)`,
          [uuid(), id, f.id, f.name, f.rate, f.unit, POSPrint.finishingAmount(f, q.area, q.qty), req.params.shopId],
        );
      }
      await saveHistory(id, "pending_review", req.params.shopId, null, "Submitted by customer");
      await notify(req.params.shopId, {
        kind: "file_received",
        customerId: c.id,
        orderId: id,
        email: c.email,
        mobile: c.mobile,
        ctx: { order_number: number },
      });
      res.json({
        order: await orderBundle(id, req.params.shopId),
        message: "Your print order has been submitted. Our team will review your file and confirm the final price.",
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/print/public/:shopId/orders/:id", async (req, res) => {
    try {
      const c = await requirePortal(req, res, req.params.shopId);
      if (!c) return;
      const [row] = await query("SELECT id FROM print_orders WHERE id = ? AND customer_id = ?", [req.params.id, c.id]);
      if (!row) return res.status(404).json({ error: "Order not found" });
      res.json({ order: await orderBundle(req.params.id, req.params.shopId) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/print/public/:shopId/orders/:id/files", async (req, res) => {
    try {
      const c = await requirePortal(req, res, req.params.shopId);
      if (!c) return;
      const [order] = await query("SELECT * FROM print_orders WHERE id = ? AND customer_id = ?", [req.params.id, c.id]);
      if (!order) throw new Error("Order not found");
      if (["printing", "finishing", "quality_check", "ready", "dispatched", "delivered"].includes(order.status)) {
        throw new Error("Files are locked after production starts");
      }
      const settings = await settingsOf(req.params.shopId);
      const decoded = decodeDataUrl(req.body.content);
      if (!decoded) throw new Error("Upload a print file");
      const name = clip(req.body.file_name, 255) || "design.bin";
      if (!POSPrint.allowedFile(name, decoded.mime, settings)) throw new Error("This file type is not allowed");
      const max = (Number(settings.max_file_mb) || 25) * 1024 * 1024;
      if (decoded.buf.length > max) throw new Error(`File exceeds ${settings.max_file_mb} MB`);
      const verRows = await query("SELECT COALESCE(MAX(version),0) v FROM print_files WHERE order_id = ?", [order.id]);
      const version = Number(verRows[0]?.v || 0) + 1;
      const id = uuid();
      await query(
        `INSERT INTO print_files (id, order_id, business_id, customer_id, version, file_name, file_type, file_size, mime, width_px, height_px, status, uploaded_by, content)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'customer', ?)`,
        [
          id,
          order.id,
          req.params.shopId,
          c.id,
          version,
          name,
          (name.split(".").pop() || "").toLowerCase(),
          decoded.buf.length,
          decoded.mime,
          Number(req.body.width_px) || null,
          Number(req.body.height_px) || null,
          "uploaded",
          decoded.buf,
        ],
      );
      res.json({ file: publicFile({ id, order_id: order.id, version, file_name: name, file_size: decoded.buf.length, mime: decoded.mime, status: "uploaded", uploaded_by: "customer", created_at: new Date().toISOString(), width_px: req.body.width_px, height_px: req.body.height_px }) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/print/public/:shopId/orders/:id/approve", async (req, res) => {
    try {
      const c = await requirePortal(req, res, req.params.shopId);
      if (!c) return;
      const [order] = await query("SELECT * FROM print_orders WHERE id = ? AND customer_id = ?", [req.params.id, c.id]);
      if (!order) throw new Error("Order not found");
      if (order.status !== "quote_sent") throw new Error("Quote is not waiting for approval");
      await query("UPDATE print_orders SET status = 'customer_approved' WHERE id = ?", [order.id]);
      await saveHistory(order.id, "customer_approved", req.params.shopId, null, "Customer approved quote");
      res.json({ order: await orderBundle(order.id, req.params.shopId) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/print/public/:shopId/orders/:id/changes", async (req, res) => {
    try {
      const c = await requirePortal(req, res, req.params.shopId);
      if (!c) return;
      await query("UPDATE print_orders SET status = 'changes_requested', notes = CONCAT(IFNULL(notes,''), '\n', ?) WHERE id = ? AND customer_id = ?", [
        clip(req.body.notes, 1000),
        req.params.id,
        c.id,
      ]);
      await saveHistory(req.params.id, "changes_requested", req.params.shopId, null, clip(req.body.notes, 500));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/print/public/:shopId/orders/:id/reject", async (req, res) => {
    try {
      const c = await requirePortal(req, res, req.params.shopId);
      if (!c) return;
      await query("UPDATE print_orders SET status = 'cancelled' WHERE id = ? AND customer_id = ?", [req.params.id, c.id]);
      await saveHistory(req.params.id, "cancelled", req.params.shopId, null, "Rejected by customer");
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/print/public/:shopId/orders/:id/pay", async (req, res) => {
    try {
      const c = await requirePortal(req, res, req.params.shopId);
      if (!c) return;
      const [order] = await query("SELECT * FROM print_orders WHERE id = ? AND customer_id = ?", [req.params.id, c.id]);
      if (!order) throw new Error("Order not found");
      const amt = round(Number(req.body.amount) || order.balance_due || order.quote_total);
      if (amt <= 0) throw new Error("Enter an amount");
      const paid = round(Number(order.paid_amount) + amt);
      const total = Number(order.quote_total) || 0;
      const pay_status = POSPrint.payStatus(paid, total);
      const status = pay_status === "paid" ? "paid" : "payment_pending";
      await query(
        `INSERT INTO print_payments (id, order_id, customer_id, amount, method, kind, status, reference, receipt_no, business_id)
         VALUES (?,?,?,?,?,?, 'paid', ?, ?, ?)`,
        [uuid(), order.id, c.id, amt, clip(req.body.method, 32) || "upi", paid >= total ? "full" : "advance", clip(req.body.reference, 80), `FPAY-${Date.now().toString().slice(-8)}`, req.params.shopId],
      );
      await query("UPDATE print_orders SET paid_amount=?, balance_due=?, pay_status=?, status=? WHERE id=?", [
        paid,
        round(Math.max(0, total - paid)),
        pay_status,
        status,
        order.id,
      ]);
      await saveHistory(order.id, status, req.params.shopId, null, `Payment ${amt}`);
      await notify(req.params.shopId, { kind: "payment_received", customerId: c.id, orderId: order.id, email: c.email, mobile: c.mobile, ctx: { order_number: order.order_number } });
      res.json({ order: await orderBundle(order.id, req.params.shopId) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/print/public/file/:id", async (req, res) => {
    try {
      const cShop = String(req.query.shop || "");
      const c = cShop ? await customerFromToken(req, cShop) : null;
      const staff = req.auth?.staff || req.auth?.user;
      const [file] = await query("SELECT * FROM print_files WHERE id = ?", [req.params.id]);
      if (!file) return res.status(404).json({ error: "File not found" });
      const ok = (c && c.id === file.customer_id) || (staff && bid() === file.business_id);
      if (!ok) return res.status(403).json({ error: "Not authorised" });
      res.setHeader("Content-Type", file.mime || "application/octet-stream");
      res.setHeader("Content-Disposition", `${req.query.download ? "attachment" : "inline"}; filename="${encodeURIComponent(file.file_name)}"`);
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.setHeader("Cache-Control", "private, no-store");
      res.send(file.content);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
}

export function registerPrintStaff(app) {
  app.get("/api/print/board", requirePerm("dashboard"), async (_req, res) => {
    try {
      await seedCatalog(bid());
      const rows = await query("SELECT * FROM print_orders WHERE business_id = ?", [bid()]);
      const today = new Date().toISOString().slice(0, 10);
      const sqToday = rows.filter((r) => String(r.created_at).slice(0, 10) === today).reduce((s, r) => s + Number(r.area_sqft) * Number(r.quantity || 1), 0);
      const month = today.slice(0, 7);
      const sqMonth = rows.filter((r) => String(r.created_at).slice(0, 7) === month).reduce((s, r) => s + Number(r.area_sqft) * Number(r.quantity || 1), 0);
      const cards = [
        { id: "today", label: "Today's Orders", value: rows.filter((r) => String(r.created_at).slice(0, 10) === today).length },
        { id: "pending", label: "Pending Approval", value: rows.filter((r) => r.status === "pending_review").length },
        { id: "quotes", label: "Quotes Pending", value: rows.filter((r) => r.status === "quote_sent").length },
        { id: "pay", label: "Payments Pending", value: rows.filter((r) => ["payment_pending", "customer_approved"].includes(r.status)).length, money: false },
        { id: "printing", label: "Printing Today", value: rows.filter((r) => r.status === "printing").length },
        { id: "sqft", label: "Sq Ft Printed (today)", value: round(sqToday) },
        { id: "prod", label: "Production Orders", value: rows.filter((r) => ["production_pending", "printing", "finishing", "quality_check"].includes(r.status)).length },
        { id: "ready", label: "Ready Orders", value: rows.filter((r) => r.status === "ready").length },
        { id: "delivery", label: "Pending Delivery", value: rows.filter((r) => ["ready", "dispatched"].includes(r.status)).length },
        { id: "sales", label: "Today's Sales", value: rows.filter((r) => String(r.created_at).slice(0, 10) === today).reduce((s, r) => s + Number(r.quote_total || 0), 0), money: true },
        { id: "msales", label: "Monthly Sales", value: rows.filter((r) => String(r.created_at).slice(0, 7) === month).reduce((s, r) => s + Number(r.quote_total || 0), 0), money: true },
        { id: "msqft", label: "Sq Ft this month", value: round(sqMonth) },
      ];
      res.json({ cards, orders: rows.slice(0, 80), tabs: POSPrint.ORDER_TABS });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/print/orders", requirePerm("orders"), async (req, res) => {
    try {
      const tab = String(req.query.tab || "");
      const q = String(req.query.q || "").toLowerCase();
      let sql = "SELECT * FROM print_orders WHERE business_id = ?";
      const args = [bid()];
      const meta = POSPrint.ORDER_TABS.find((t) => t.id === tab);
      if (meta) {
        sql += ` AND status IN (${meta.statuses.map(() => "?").join(",")})`;
        args.push(...meta.statuses);
      }
      const rows = await query(`${sql} ORDER BY created_at DESC LIMIT 400`, args);
      const filtered = q
        ? rows.filter((r) => `${r.order_number} ${r.customer_name} ${r.material_name} ${r.product}`.toLowerCase().includes(q))
        : rows;
      res.json(filtered);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/print/orders/:id", requirePerm("orders"), async (req, res) => {
    try {
      const order = await orderBundle(req.params.id, bid());
      if (!order) return res.status(404).json({ error: "Not found" });
      res.json({ order });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/print/orders/:id/review", requirePerm("orders"), async (req, res) => {
    try {
      const action = String(req.body.action || "");
      const map = {
        approve: "file_approved",
        reject: "file_rejected",
        request_file: "changes_requested",
        request_changes: "changes_requested",
      };
      const status = map[action];
      if (!status) throw new Error("Unknown review action");
      const [order] = await query("SELECT * FROM print_orders WHERE id = ? AND business_id = ?", [req.params.id, bid()]);
      if (!order) throw new Error("Order not found");
      if (action === "approve") {
        let fileId = String(req.body.file_id || "");
        if (!fileId) {
          const latest = await query("SELECT id FROM print_files WHERE order_id = ? ORDER BY version DESC LIMIT 1", [order.id]);
          fileId = latest[0]?.id || "";
        }
        if (fileId) {
          await query("UPDATE print_files SET status = 'approved' WHERE id = ? AND order_id = ?", [fileId, order.id]);
          await query("UPDATE print_orders SET approved_file_id = ? WHERE id = ?", [fileId, order.id]);
        }
      }
      await query("UPDATE print_orders SET status = ?, admin_notes = ? WHERE id = ?", [status, clip(req.body.notes, 2000), order.id]);
      await saveHistory(order.id, status, bid(), authUser(), clip(req.body.notes, 500));
      const kind = action === "approve" ? "file_approved" : action === "reject" ? "file_rejected" : "quote_updated";
      await notify(bid(), { kind, customerId: order.customer_id, orderId: order.id, email: order.customer_email, mobile: order.customer_mobile, ctx: { order_number: order.order_number } });
      res.json({ order: await orderBundle(order.id, bid()) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/print/orders/:id/quote", requirePerm("orders"), async (req, res) => {
    try {
      const [order] = await query("SELECT * FROM print_orders WHERE id = ? AND business_id = ?", [req.params.id, bid()]);
      if (!order) throw new Error("Order not found");
      const body = req.body || {};
      const fields = ["width", "height", "unit", "quantity", "rate", "price_model", "delivery_amount", "discount", "other_charges", "gst_rate", "material_name"];
      const sets = [];
      const args = [];
      for (const f of fields) {
        if (body[f] != null) {
          sets.push(`${f} = ?`);
          args.push(body[f]);
        }
      }
      if (sets.length) {
        args.push(order.id);
        await query(`UPDATE print_orders SET ${sets.join(", ")} WHERE id = ?`, args);
      }
      if (Array.isArray(body.finishing)) {
        await query("DELETE FROM print_order_finishing WHERE order_id = ?", [order.id]);
        for (const f of body.finishing) {
          await query(
            `INSERT INTO print_order_finishing (id, order_id, finishing_id, name, rate, unit, amount, business_id) VALUES (?,?,?,?,?,?,?,?)`,
            [uuid(), order.id, f.id || null, clip(f.name, 180), Number(f.rate) || 0, clip(f.unit, 16) || "job", Number(f.amount) || 0, bid()],
          );
        }
      }
      const q = await applyTotals(order.id, body);
      const settings = await settingsOf(bid());
      const next = settings.customer_approval_required ? "quote_sent" : "customer_approved";
      await query("UPDATE print_orders SET status = ? WHERE id = ?", [next, order.id]);
      await query(`INSERT INTO print_quotes (id, order_id, business_id, quote_json, total, status) VALUES (?,?,?,?,?,?)`, [
        uuid(),
        order.id,
        bid(),
        JSON.stringify(q),
        q.total,
        "sent",
      ]);
      await saveHistory(order.id, next, bid(), authUser(), "Final quote");
      await notify(bid(), { kind: "quote_created", customerId: order.customer_id, orderId: order.id, email: order.customer_email, mobile: order.customer_mobile, ctx: { order_number: order.order_number } });
      res.json({ order: await orderBundle(order.id, bid()), quote: q });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/print/orders/:id/bill", requirePerm("orders"), async (req, res) => {
    try {
      const order = await orderBundle(req.params.id, bid());
      if (!order) throw new Error("Order not found");
      const invoiceId = uuid();
      const q = order.quote;
      await query(
        `INSERT INTO sales_orders (
           id, order_number, customer_id, customer_name, customer_type,
           pack_id, pack_name, pack_count, status, total_quantity_gm,
           subtotal, discount, gst, total, payment_method, payment_status, business_id,
           branch_id, cashier_id
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          invoiceId,
          order.order_number,
          order.customer_id,
          order.customer_name,
          "b2c",
          null,
          null,
          null,
          "confirmed",
          q.qty,
          q.taxable,
          q.discount,
          q.gst,
          q.total,
          "upi",
          order.pay_status === "paid" ? "paid" : "unpaid",
          bid(),
          null,
          authUser()?.id || null,
        ],
      );
        try {
          await query(
            `INSERT INTO sales_order_lines (
               id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
               discount, amount, gst_rate, cancelled, business_id
             ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [
              uuid(),
              invoiceId,
              null,
              `${order.product} ${order.width}×${order.height} ${order.unit} · ${order.material_name}`,
              q.totalArea,
              q.rate,
              q.discount,
              q.printing,
              q.gst_rate,
              0,
              bid(),
            ],
          );
        } catch {
          /* line shape varies by schema */
        }
      await query("UPDATE print_orders SET sales_order_id = ? WHERE id = ?", [invoiceId, order.id]);
      try {
        const paid = round(Number(order.paid_amount) || 0);
        await withTransaction(async (conn) => {
          const [custRows] = await conn.query("SELECT * FROM customers WHERE id = ? AND business_id = ?", [
            order.customer_id,
            bid(),
          ]);
          const customer = custRows[0];
          if (!customer) return;
          await settleCustomerInvoice(conn, {
            customer,
            total: q.total,
            method: paid > 0.009 ? "upi" : "credit",
            orderId: invoiceId,
            orderNumber: order.order_number,
            amountPaid: paid,
          });
        });
      } catch {
        /* settlement optional */
      }
      if (!["paid", "production_pending", "printing"].includes(order.status)) {
        await query("UPDATE print_orders SET status = 'payment_pending' WHERE id = ?", [order.id]);
      }
      res.json({ invoice_id: invoiceId, order: await orderBundle(order.id, bid()) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/print/orders/:id/status", requirePerm("orders"), async (req, res) => {
    try {
      const status = clip(req.body.status, 32);
      if (!POSPrint.STATUSES.some((s) => s.id === status)) throw new Error("Unknown status");
      const [order] = await query("SELECT * FROM print_orders WHERE id = ? AND business_id = ?", [req.params.id, bid()]);
      if (!order) throw new Error("Order not found");
      await query("UPDATE print_orders SET status = ?, staff_id = ?, staff_name = ? WHERE id = ?", [status, authUser()?.id || null, staffName(authUser()), order.id]);
      await saveHistory(order.id, status, bid(), authUser(), clip(req.body.note, 500));
      const kind =
        status === "printing" ? "production_started" : status === "ready" ? "order_ready" : status === "dispatched" ? "dispatched" : status === "delivered" ? "delivered" : "quote_updated";
      await notify(bid(), { kind, customerId: order.customer_id, orderId: order.id, email: order.customer_email, mobile: order.customer_mobile, ctx: { order_number: order.order_number } });
      res.json({ order: await orderBundle(order.id, bid()) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/print/catalog", requirePerm("items"), async (_req, res) => {
    try {
      res.json(await catalog(bid()));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/print/catalog", requirePerm("items"), async (req, res) => {
    try {
      const body = req.body || {};
      if (Array.isArray(body.materials)) {
        for (const m of body.materials) {
          const id = m.id || uuid();
          await query(
            `INSERT INTO print_materials (id, business_id, name, price_model, rate, pack_qty, gst_rate, min_sqft, active, sort_order)
             VALUES (?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE name=VALUES(name), price_model=VALUES(price_model), rate=VALUES(rate), pack_qty=VALUES(pack_qty),
               gst_rate=VALUES(gst_rate), min_sqft=VALUES(min_sqft), active=VALUES(active)`,
            [id, bid(), clip(m.name, 180), clip(m.price_model, 16) || "sqft", Number(m.rate) || 0, Number(m.pack_qty) || 1, Number(m.gst_rate) || 18, Number(m.min_sqft) || 0, m.active === 0 ? 0 : 1, Number(m.sort_order) || 0],
          );
        }
      }
      if (Array.isArray(body.finishing)) {
        for (const f of body.finishing) {
          const id = f.id || uuid();
          await query(
            `INSERT INTO print_finishing (id, business_id, name, rate, unit, gst_rate, active)
             VALUES (?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE name=VALUES(name), rate=VALUES(rate), unit=VALUES(unit), gst_rate=VALUES(gst_rate), active=VALUES(active)`,
            [id, bid(), clip(f.name, 180), Number(f.rate) || 0, clip(f.unit, 16) || "job", Number(f.gst_rate) || 18, f.active === 0 ? 0 : 1],
          );
        }
      }
      if (body.settings && typeof body.settings === "object") {
        const next = { ...(await settingsOf(bid())), ...body.settings };
        if (Object.prototype.hasOwnProperty.call(body.settings, "portal_login_image")) {
          next.portal_login_image = clipPortalImage(body.settings.portal_login_image);
        }
        await query(
          `INSERT INTO print_settings (business_id, settings_json) VALUES (?,?)
           ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json)`,
          [bid(), JSON.stringify(next)],
        );
      }
      res.json(await catalog(bid()));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/print/reports/:id", requirePerm("reports"), async (req, res) => {
    try {
      const rows = await query("SELECT * FROM print_orders WHERE business_id = ? ORDER BY created_at DESC LIMIT 1000", [bid()]);
      const id = req.params.id;
      let out = rows;
      if (id === "print-quotes") out = rows.filter((r) => r.status === "quote_sent");
      if (id === "print-dues") out = rows.filter((r) => Number(r.balance_due) > 0);
      if (id === "print-production") out = rows.filter((r) => ["production_pending", "printing", "finishing", "quality_check"].includes(r.status));
      if (id === "print-delivery") out = rows.filter((r) => ["ready", "dispatched", "delivered"].includes(r.status));
      const sqft = round(rows.reduce((s, r) => s + Number(r.area_sqft) * Number(r.quantity || 1), 0));
      res.json({ rows: out, kpi: { total_sqft: sqft, orders: rows.length, sales: round(rows.reduce((s, r) => s + Number(r.quote_total || 0), 0)) } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/print/files/:id", requirePerm("orders"), async (req, res) => {
    try {
      const [file] = await query("SELECT * FROM print_files WHERE id = ? AND business_id = ?", [req.params.id, bid()]);
      if (!file) return res.status(404).json({ error: "File not found" });
      res.setHeader("Content-Type", file.mime || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.file_name)}"`);
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.setHeader("Cache-Control", "private, no-store");
      res.send(file.content);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
}
