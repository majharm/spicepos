import crypto from "node:crypto";
import QRCode from "qrcode";
import { BUSINESS_ID, query, withTransaction } from "./db.js";
import { buildPricedLines, insertSalesOrder, lineAmount, nextSeq, round2 } from "./crud.js";

export const QR_STATUSES = ["pending", "accepted", "preparing", "ready", "completed", "cancelled"];

export async function ensureQrOrderSchema(conn = null) {
  const exec = conn
    ? (sql, params = []) => conn.query(sql, params)
    : (sql, params = []) => query(sql, params);
  await exec(`CREATE TABLE IF NOT EXISTS qr_orders (
    id VARCHAR(36) PRIMARY KEY,
    order_number VARCHAR(32) NOT NULL,
    business_id VARCHAR(36) NOT NULL,
    customer_name VARCHAR(160) NOT NULL,
    mobile VARCHAR(32) NOT NULL,
    table_no VARCHAR(64) NULL,
    notes TEXT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    sales_order_id VARCHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_qr_order_number (business_id, order_number),
    INDEX idx_qr_orders_business_status (business_id, status, created_at)
  )`);
  await exec(`CREATE TABLE IF NOT EXISTS qr_order_lines (
    id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL,
    business_id VARCHAR(36) NOT NULL,
    item_id VARCHAR(36) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity_gm DECIMAL(14,3) NOT NULL,
    rate_per_kg DECIMAL(12,4) NOT NULL,
    gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_qr_order_lines_order (order_id),
    INDEX idx_qr_order_lines_business (business_id)
  )`);
}

function cleanText(value, max) {
  return String(value || "").trim().slice(0, max);
}

export function publicOrderUrl(req) {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "127.0.0.1:5173").split(",")[0].trim();
  return `${proto}://${host}/order.html`;
}

export function normalizeQrOrderPayload(raw = {}) {
  const customerName = cleanText(raw.customer_name || raw.customerName, 160);
  const mobile = cleanText(raw.mobile, 32).replace(/[^\d+]/g, "");
  const tableNo = cleanText(raw.table_no || raw.tableNo, 64);
  const notes = cleanText(raw.notes, 1000);
  const source = Array.isArray(raw.lines) ? raw.lines : [];
  const lines = source
    .slice(0, 50)
    .map((line) => {
      const qtyGm = Number(line.quantity_gm ?? line.quantityGm);
      const qtyKg = Number(line.quantity);
      const quantity_gm = Number.isFinite(qtyGm) && qtyGm > 0 ? qtyGm : Number.isFinite(qtyKg) && qtyKg > 0 ? qtyKg * 1000 : 0;
      return {
        item_id: cleanText(line.item_id || line.itemId, 36),
        quantity_gm,
      };
    })
    .filter((line) => line.item_id && line.quantity_gm > 0);
  if (!customerName) throw new Error("Customer name is required");
  if (mobile.replace(/\D/g, "").length < 10) throw new Error("Valid mobile number is required");
  if (!lines.length) throw new Error("Add at least one item");
  return { customerName, mobile, tableNo, notes, lines };
}

async function qrOrdersWithLines(status = "") {
  const params = [BUSINESS_ID];
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

async function findOrCreateCustomer(conn, { name, mobile }) {
  const digits = mobile.replace(/\D/g, "").slice(-10);
  const [rows] = await conn.query(
    `SELECT * FROM customers
     WHERE business_id = ?
       AND RIGHT(REPLACE(REPLACE(REPLACE(mobile, ' ', ''), '-', ''), '+', ''), 10) = ?
     LIMIT 1`,
    [BUSINESS_ID, digits],
  );
  if (rows[0]) return rows[0];
  const n = await nextSeq(conn, "customer", 4);
  const code = `CUS-${String(n).padStart(3, "0")}`;
  const id = crypto.randomUUID();
  await conn.query(
    `INSERT INTO customers (
       id, code, name, business_name, mobile, type, gstin, credit_limit, outstanding, business_id
     ) VALUES (?,?,?,?,?,'b2c',NULL,0,0,?)`,
    [id, code, name, name, mobile, BUSINESS_ID],
  );
  const [created] = await conn.query("SELECT * FROM customers WHERE id = ?", [id]);
  return created[0];
}

export function registerQrOrdering(app) {
  app.get("/api/qr/menu", async (_req, res) => {
    try {
      await ensureQrOrderSchema();
      const [company] = await query(
        "SELECT * FROM company_settings WHERE business_id = ? LIMIT 1",
        [BUSINESS_ID],
      );
      const items = await query(
        `SELECT id, code, name, local_name, category, subcategory, retail_rate, gst_rate, stock_gm, status
         FROM items WHERE business_id = ? AND status <> 'inactive'
         ORDER BY category, subcategory, name`,
        [BUSINESS_ID],
      );
      res.json({
        shop: {
          name: company?.name || "SWAMI MASALE SASWAD",
          address: company?.address || "",
          phone: company?.phone || "",
          logo_url: company?.logo_url || "",
        },
        items,
      });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.get("/api/qr/code.png", async (req, res) => {
    try {
      const png = await QRCode.toBuffer(publicOrderUrl(req), {
        type: "png",
        width: 360,
        margin: 1,
        errorCorrectionLevel: "M",
      });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      res.send(png);
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.get("/api/qr/link", (req, res) => {
    const url = publicOrderUrl(req);
    res.json({ url, path: "/order.html" });
  });

  app.post("/api/qr/orders", async (req, res) => {
    try {
      const input = normalizeQrOrderPayload(req.body || {});
      const result = await withTransaction(async (conn) => {
        await ensureQrOrderSchema(conn);
        const built = [];
        for (const line of input.lines) {
          const [rows] = await conn.query(
            `SELECT id, name, retail_rate, gst_rate, stock_gm, status
             FROM items WHERE id = ? AND business_id = ? LIMIT 1`,
            [line.item_id, BUSINESS_ID],
          );
          const item = rows[0];
          if (!item || item.status === "inactive") throw new Error("One selected item is no longer available");
          const qty = Number(line.quantity_gm);
          if (qty > Number(item.stock_gm || 0)) throw new Error(`${item.name} does not have enough stock`);
          const amount = round2(lineAmount(qty, item.retail_rate));
          const gstRate = Number(item.gst_rate) || 0;
          built.push({
            item,
            qty,
            amount,
            gstRate,
            gstAmount: round2((amount * gstRate) / 100),
          });
        }
        const subtotal = round2(built.reduce((sum, line) => sum + line.amount, 0));
        const gst = round2(built.reduce((sum, line) => sum + line.gstAmount, 0));
        const total = round2(subtotal + gst);
        const id = crypto.randomUUID();
        const n = await nextSeq(conn, "qr_order", 1);
        const number = `QRO-${String(n).padStart(4, "0")}`;
        await conn.query(
          `INSERT INTO qr_orders
           (id, order_number, business_id, customer_name, mobile, table_no, notes, status, subtotal, gst, total)
           VALUES (?,?,?,?,?,?,?,'pending',?,?,?)`,
          [
            id,
            number,
            BUSINESS_ID,
            input.customerName,
            input.mobile,
            input.tableNo || null,
            input.notes || null,
            subtotal,
            gst,
            total,
          ],
        );
        for (const line of built) {
          await conn.query(
            `INSERT INTO qr_order_lines
             (id, order_id, business_id, item_id, item_name, quantity_gm, rate_per_kg, gst_rate, amount, gst_amount)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [
              crypto.randomUUID(),
              id,
              BUSINESS_ID,
              line.item.id,
              line.item.name,
              line.qty,
              Number(line.item.retail_rate) || 0,
              line.gstRate,
              line.amount,
              line.gstAmount,
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

  app.get("/api/qr-orders", async (req, res) => {
    try {
      await ensureQrOrderSchema();
      const status = cleanText(req.query.status, 24).toLowerCase();
      const orders = await qrOrdersWithLines(status);
      const pending = orders.filter((o) => o.status === "pending").length;
      res.json({ orders, pending });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.patch("/api/qr-orders/:id", async (req, res) => {
    try {
      const status = cleanText(req.body?.status, 24).toLowerCase();
      if (!QR_STATUSES.includes(status)) {
        res.status(400).json({ error: "Invalid QR order status" });
        return;
      }
      await ensureQrOrderSchema();
      const result = await query(
        "UPDATE qr_orders SET status = ? WHERE id = ? AND business_id = ? AND status <> 'completed'",
        [status, req.params.id, BUSINESS_ID],
      );
      if (!result.affectedRows) {
        res.status(404).json({ error: "QR order not found or already billed" });
        return;
      }
      const rows = await qrOrdersWithLines();
      res.json({ ok: true, order: rows.find((row) => row.id === req.params.id) });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  app.post("/api/qr-orders/:id/complete", async (req, res) => {
    const method = String(req.body?.paymentMethod || "cash").toLowerCase();
    if (!["cash", "upi", "card", "credit"].includes(method)) {
      res.status(400).json({ error: "Invalid payment method" });
      return;
    }
    try {
      const result = await withTransaction(async (conn) => {
        await ensureQrOrderSchema(conn);
        const [rows] = await conn.query(
          "SELECT * FROM qr_orders WHERE id = ? AND business_id = ? FOR UPDATE",
          [req.params.id, BUSINESS_ID],
        );
        const qr = rows[0];
        if (!qr) throw new Error("QR order not found");
        if (qr.status === "cancelled") throw new Error("Cancelled orders cannot be billed");
        if (qr.status === "completed" && qr.sales_order_id) {
          const [orders] = await conn.query("SELECT * FROM sales_orders WHERE id = ?", [qr.sales_order_id]);
          const [orderLines] = await conn.query("SELECT * FROM sales_order_lines WHERE order_id = ?", [
            qr.sales_order_id,
          ]);
          return { qr, sale: { ...orders[0], lines: orderLines } };
        }
        const [lineRows] = await conn.query("SELECT * FROM qr_order_lines WHERE order_id = ?", [qr.id]);
        if (!lineRows.length) throw new Error("QR order has no lines");
        const customer = await findOrCreateCustomer(conn, { name: qr.customer_name, mobile: qr.mobile });
        const built = await buildPricedLines(
          conn,
          customer,
          lineRows.map((l) => ({ itemId: l.item_id, quantity_gm: l.quantity_gm })),
        );
        const sale = await insertSalesOrder(conn, {
          customer,
          built,
          paymentMethod: method,
        });
        await conn.query(
          "UPDATE qr_orders SET status = 'completed', sales_order_id = ? WHERE id = ?",
          [sale.id, qr.id],
        );
        return { qr: { ...qr, status: "completed", sales_order_id: sale.id }, sale };
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });
}
