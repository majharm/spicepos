import crypto from "node:crypto";
import "../js/units.js";
import { query, withTransaction } from "./db.js";
import { bid, branchId } from "./context.js";
import { requirePerm } from "./auth.js";

const POSUnits = globalThis.POSUnits;
const QR_STATUSES = ["pending", "accepted", "preparing", "ready", "completed", "cancelled"];

export async function ensureQrOrderSchema(conn = null) {
  const exec = conn ? (sql, params = []) => conn.query(sql, params) : query;
  await exec(`CREATE TABLE IF NOT EXISTS qr_orders (
    id VARCHAR(255) PRIMARY KEY,
    order_number VARCHAR(32) NOT NULL,
    business_id VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255) NULL,
    customer_name VARCHAR(160) NOT NULL,
    mobile VARCHAR(32) NOT NULL,
    table_no VARCHAR(64) NULL,
    notes TEXT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_qr_order_number (business_id, order_number),
    INDEX idx_qr_orders_business_status (business_id, status, created_at)
  )`);
  await exec(`CREATE TABLE IF NOT EXISTS qr_order_lines (
    id VARCHAR(255) PRIMARY KEY,
    order_id VARCHAR(255) NOT NULL,
    business_id VARCHAR(255) NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    unit VARCHAR(32) NOT NULL,
    quantity_gm DECIMAL(14,3) NOT NULL,
    rate_per_kg DECIMAL(12,4) NOT NULL,
    gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_qr_order_lines_order (order_id),
    INDEX idx_qr_order_lines_business (business_id)
  )`);
}

function cleanText(value, max) {
  return String(value || "").trim().slice(0, max);
}

export function normalizeQrOrderPayload(raw = {}) {
  const customerName = cleanText(raw.customer_name || raw.customerName, 160);
  const mobile = cleanText(raw.mobile, 32).replace(/[^\d+]/g, "");
  const tableNo = cleanText(raw.table_no || raw.tableNo, 64);
  const notes = cleanText(raw.notes, 1000);
  const source = Array.isArray(raw.lines) ? raw.lines : [];
  const lines = source
    .slice(0, 50)
    .map((line) => ({
      item_id: cleanText(line.item_id || line.itemId, 255),
      quantity: Number(line.quantity),
    }))
    .filter((line) => line.item_id && Number.isFinite(line.quantity) && line.quantity > 0);
  if (!customerName) throw new Error("Customer name is required");
  if (mobile.replace(/\D/g, "").length < 10) throw new Error("Valid mobile number is required");
  if (!lines.length) throw new Error("Add at least one item");
  return { customerName, mobile, tableNo, notes, lines };
}

export function qrQuantityToBase(quantity, unit) {
  const n = Number(quantity);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid item quantity");
  const code = POSUnits.normalize(unit);
  if (code === "GM" || code === "ML") return Math.round(n * 1000 * 1000) / 1000;
  return POSUnits.toBase(n, code);
}

export function qrLineAmount(quantityBase, rate, unit) {
  return Math.round(POSUnits.lineAmount(quantityBase, Number(rate) || 0, POSUnits.normalize(unit)) * 100) / 100;
}

function orderNumber() {
  return `QRO-${Date.now().toString(36).slice(-5).toUpperCase()}${crypto.randomInt(0, 36).toString(36).toUpperCase()}`;
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

async function qrOrdersWithLines(businessId, status = "") {
  const params = [businessId];
  let statusSql = "";
  if (status && QR_STATUSES.includes(status)) {
    statusSql = " AND status = ?";
    params.push(status);
  }
  const orders = await query(
    `SELECT * FROM qr_orders WHERE business_id = ?${statusSql}
     ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 WHEN 'preparing' THEN 2
       WHEN 'ready' THEN 3 ELSE 4 END, created_at DESC LIMIT 100`,
    params,
  );
  if (!orders.length) return [];
  const ids = orders.map((row) => row.id);
  const lines = await query(
    `SELECT * FROM qr_order_lines WHERE order_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at`,
    ids,
  );
  return orders.map((order) => ({ ...order, lines: lines.filter((line) => line.order_id === order.id) }));
}

export function registerQrPublic(app) {
  app.get("/api/qr/menu", async (req, res) => {
    try {
      await ensureQrOrderSchema();
      const business = await businessForPublic(req.query.shop);
      if (!business) return res.status(404).json({ error: "Shop not found" });
      const items = await query(
        `SELECT id, code, name, category, subcategory, base_unit, unit, retail_rate, gst_rate,
                hsn, image_url, stock_gm
         FROM items WHERE business_id = ? AND status = 'active' AND stock_gm > 0
         ORDER BY category, subcategory, name`,
        [business.id],
      );
      res.json({
        shop: {
          id: business.id,
          code: business.code,
          name: business.company_name || business.name,
          address: business.company_address || business.address || "",
          phone: business.company_phone || business.mobile || "",
          logo_url: business.company_logo || business.logo_url || "",
        },
        items,
      });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/qr/orders", async (req, res) => {
    try {
      const input = normalizeQrOrderPayload(req.body || {});
      const business = await businessForPublic(req.body?.shop);
      if (!business) return res.status(404).json({ error: "Shop not found" });
      const result = await withTransaction(async (conn) => {
        await ensureQrOrderSchema(conn);
        const built = [];
        for (const line of input.lines) {
          const [rows] = await conn.query(
            `SELECT id, name, base_unit, unit, retail_rate, gst_rate, stock_gm
             FROM items WHERE id = ? AND business_id = ? AND status = 'active' LIMIT 1`,
            [line.item_id, business.id],
          );
          const item = rows[0];
          if (!item) throw new Error("One selected item is no longer available");
          const unit = POSUnits.normalize(item.base_unit || item.unit);
          const quantityBase = qrQuantityToBase(line.quantity, unit);
          if (quantityBase > Number(item.stock_gm || 0)) throw new Error(`${item.name} does not have enough stock`);
          const amount = qrLineAmount(quantityBase, item.retail_rate, unit);
          const gstRate = Number(item.gst_rate) || 0;
          built.push({ item, unit, quantityBase, amount, gstRate, gstAmount: Math.round(amount * gstRate) / 100 });
        }
        const subtotal = Math.round(built.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
        const gst = Math.round(built.reduce((sum, line) => sum + line.gstAmount, 0) * 100) / 100;
        const total = Math.round((subtotal + gst) * 100) / 100;
        const id = crypto.randomUUID();
        const number = orderNumber();
        await conn.query(
          `INSERT INTO qr_orders
           (id, order_number, business_id, customer_name, mobile, table_no, notes, status, subtotal, gst, total)
           VALUES (?,?,?,?,?,?,?,'pending',?,?,?)`,
          [id, number, business.id, input.customerName, input.mobile, input.tableNo || null, input.notes || null, subtotal, gst, total],
        );
        for (const line of built) {
          await conn.query(
            `INSERT INTO qr_order_lines
             (id, order_id, business_id, item_id, item_name, unit, quantity_gm, rate_per_kg, gst_rate, amount, gst_amount)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [
              crypto.randomUUID(), id, business.id, line.item.id, line.item.name, line.unit,
              line.quantityBase, Number(line.item.retail_rate) || 0, line.gstRate, line.amount, line.gstAmount,
            ],
          );
        }
        return { id, order_number: number, status: "pending", subtotal, gst, total };
      });
      res.status(201).json({ ok: true, order: result });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });
}

export function registerQrStaff(app) {
  app.get("/api/qr-orders", requirePerm("orders"), async (req, res) => {
    try {
      await ensureQrOrderSchema();
      res.json(await qrOrdersWithLines(bid(), cleanText(req.query.status, 24).toLowerCase()));
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.patch("/api/qr-orders/:id", requirePerm("orders"), async (req, res) => {
    try {
      const status = cleanText(req.body?.status, 24).toLowerCase();
      if (!QR_STATUSES.includes(status)) return res.status(400).json({ error: "Invalid QR order status" });
      await ensureQrOrderSchema();
      const result = await query(
        "UPDATE qr_orders SET status = ?, branch_id = COALESCE(branch_id, ?) WHERE id = ? AND business_id = ?",
        [status, branchId(), req.params.id, bid()],
      );
      if (!result.affectedRows) return res.status(404).json({ error: "QR order not found" });
      const rows = await qrOrdersWithLines(bid());
      res.json({ ok: true, order: rows.find((row) => row.id === req.params.id) });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });
}
