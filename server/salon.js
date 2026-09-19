import crypto from "node:crypto";
import { query, withTransaction } from "./db.js";
import { bid } from "./context.js";
import { requireStaff, requirePerm } from "./auth.js";
import { hashPassword, verifyPassword } from "./password.js";
import { sendMail } from "./mail.js";
import { sendWhatsApp } from "./alerts.js";
import { getPlatformSettings } from "./settings.js";
import "../js/salon.js";
import "../js/footwear.js";

const POSSalon = globalThis.POSSalon;

function uuid() {
  return crypto.randomUUID();
}

function clip(v, n) {
  return String(v || "").trim().slice(0, n);
}

function digits(v) {
  return String(v || "").replace(/\D/g, "");
}

async function hasTable(table) {
  const rows = await query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return rows.length > 0;
}

async function hasColumn(table, column) {
  const rows = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows.length > 0;
}

async function addColumn(table, column, def) {
  if (!(await hasTable(table))) return;
  if (!(await hasColumn(table, column))) await query(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${def}`);
}

export async function ensureSalonSchema() {
  await addColumn("customers", "email", "VARCHAR(160) NULL");
  await addColumn("customers", "password_hash", "VARCHAR(255) NULL");
  await addColumn("customers", "wallet_balance", "DECIMAL(12,2) NOT NULL DEFAULT 0");
  await addColumn("customers", "favourite_json", "TEXT NULL");
  await addColumn("items", "description", "TEXT NULL");
  await query(`CREATE TABLE IF NOT EXISTS salon_service_meta (
    item_id VARCHAR(255) PRIMARY KEY,
    duration_min INT NOT NULL DEFAULT 30,
    gender VARCHAR(16) NOT NULL DEFAULT 'unisex',
    online_booking TINYINT NOT NULL DEFAULT 1,
    staff_ids TEXT NULL,
    branch_id VARCHAR(255) NULL,
    discount_pct DECIMAL(8,2) NOT NULL DEFAULT 0,
    business_id VARCHAR(255) NOT NULL,
    INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS salon_packages (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    description TEXT NULL,
    category VARCHAR(80) NULL,
    price DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_pct DECIMAL(8,2) NOT NULL DEFAULT 0,
    gst_rate DECIMAL(8,2) NOT NULL DEFAULT 0,
    validity_days INT NOT NULL DEFAULT 90,
    sessions INT NOT NULL DEFAULT 1,
    staff_ids TEXT NULL,
    branch_id VARCHAR(255) NULL,
    gender VARCHAR(16) NOT NULL DEFAULT 'unisex',
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    terms TEXT NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS salon_package_items (
    id VARCHAR(255) PRIMARY KEY,
    package_id VARCHAR(255) NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    qty INT NOT NULL DEFAULT 1,
    price DECIMAL(12,2) NOT NULL DEFAULT 0,
    business_id VARCHAR(255) NOT NULL,
    INDEX (package_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS salon_customer_packages (
    id VARCHAR(255) PRIMARY KEY,
    customer_id VARCHAR(255) NOT NULL,
    package_id VARCHAR(255) NOT NULL,
    package_name VARCHAR(180) NOT NULL,
    total_sessions INT NOT NULL DEFAULT 0,
    used_sessions INT NOT NULL DEFAULT 0,
    remaining_sessions INT NOT NULL DEFAULT 0,
    purchase_date DATE NULL,
    expires_at DATE NULL,
    paid_value DECIMAL(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    order_id VARCHAR(255) NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (customer_id), INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS salon_bookings (
    id VARCHAR(255) PRIMARY KEY,
    booking_number VARCHAR(32) NOT NULL,
    customer_id VARCHAR(255) NOT NULL,
    customer_name VARCHAR(180) NULL,
    staff_id VARCHAR(255) NULL,
    staff_name VARCHAR(180) NULL,
    branch_id VARCHAR(255) NULL,
    booking_date DATE NOT NULL,
    start_time VARCHAR(8) NOT NULL,
    duration_min INT NOT NULL DEFAULT 30,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    coupon_code VARCHAR(40) NULL,
    coupon_pct DECIMAL(8,2) NOT NULL DEFAULT 0,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    advance_mode VARCHAR(16) NOT NULL DEFAULT 'none',
    advance_value DECIMAL(12,2) NOT NULL DEFAULT 0,
    advance_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    balance_due DECIMAL(12,2) NOT NULL DEFAULT 0,
    previous_due DECIMAL(12,2) NOT NULL DEFAULT 0,
    package_id VARCHAR(255) NULL,
    recurring_rule VARCHAR(40) NULL,
    notes TEXT NULL,
    sales_order_id VARCHAR(255) NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id), INDEX (booking_date), INDEX (customer_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS salon_booking_lines (
    id VARCHAR(255) PRIMARY KEY,
    booking_id VARCHAR(255) NOT NULL,
    item_id VARCHAR(255) NULL,
    name VARCHAR(180) NOT NULL,
    qty INT NOT NULL DEFAULT 1,
    duration_min INT NOT NULL DEFAULT 30,
    price DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_pct DECIMAL(8,2) NOT NULL DEFAULT 0,
    gst_rate DECIMAL(8,2) NOT NULL DEFAULT 0,
    staff_id VARCHAR(255) NULL,
    business_id VARCHAR(255) NOT NULL,
    INDEX (booking_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS salon_booking_payments (
    id VARCHAR(255) PRIMARY KEY,
    booking_id VARCHAR(255) NOT NULL,
    customer_id VARCHAR(255) NULL,
    kind VARCHAR(24) NOT NULL DEFAULT 'advance',
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    method VARCHAR(32) NOT NULL DEFAULT 'upi',
    reference VARCHAR(80) NULL,
    receipt_no VARCHAR(32) NULL,
    txn_id VARCHAR(64) NULL,
    ledger_id VARCHAR(255) NULL,
    invoice_id VARCHAR(255) NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (booking_id), INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS salon_otps (
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
  await query(`CREATE TABLE IF NOT EXISTS salon_sessions (
    id VARCHAR(255) PRIMARY KEY,
    token_hash VARCHAR(64) NOT NULL,
    customer_id VARCHAR(255) NOT NULL,
    business_id VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    INDEX (token_hash)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS salon_waitlist (
    id VARCHAR(255) PRIMARY KEY,
    customer_id VARCHAR(255) NOT NULL,
    item_id VARCHAR(255) NULL,
    staff_id VARCHAR(255) NULL,
    booking_date DATE NOT NULL,
    notes TEXT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'open',
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS salon_notifications (
    id VARCHAR(255) PRIMARY KEY,
    kind VARCHAR(32) NOT NULL,
    channel VARCHAR(16) NOT NULL,
    customer_id VARCHAR(255) NULL,
    booking_id VARCHAR(255) NULL,
    body TEXT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'queued',
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);
}

function shopKindRow(biz) {
  return globalThis.POSFootwear?.shopKind?.(biz) || "";
}

export function salonShopAllowed(biz) {
  return POSSalon?.isSalonShop?.(biz) || shopKindRow(biz) === "services";
}

async function loadShop(id) {
  const rows = await query("SELECT * FROM businesses WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
}

function bearer(req) {
  const h = String(req.headers.authorization || "");
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return String(req.headers["x-salon-token"] || "").trim();
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function customerFromToken(req, shopId) {
  const token = bearer(req);
  if (!token) return null;
  const rows = await query(
    `SELECT s.customer_id, s.business_id FROM salon_sessions s
     WHERE s.token_hash = ? AND s.business_id = ? AND s.expires_at > NOW() LIMIT 1`,
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
    `INSERT INTO salon_sessions (id, token_hash, customer_id, business_id, expires_at)
     VALUES (?,?,?,?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
    [uuid(), hashToken(token), customerId, businessId],
  );
  return token;
}

async function notify(businessId, { kind, customerId, bookingId, email, mobile, ctx }) {
  const body = POSSalon.noticeCopy(kind, ctx || {});
  const channels = ["email", "sms", "whatsapp"];
  for (const channel of channels) {
    await query(
      `INSERT INTO salon_notifications (id, kind, channel, customer_id, booking_id, body, status, business_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [uuid(), kind, channel, customerId || null, bookingId || null, body, "queued", businessId],
    );
  }
  try {
    if (email) await sendMail({ to: email, subject: "ATAV Salon", text: body });
  } catch {
    /* mail optional */
  }
  try {
    const cfg = await getPlatformSettings();
    if (mobile) await sendWhatsApp(cfg, [mobile], body);
  } catch {
    /* wa optional */
  }
  return body;
}

async function publicCatalog(shopId) {
  const items = await query(
    `SELECT i.id, i.name, i.category, i.local_name, i.retail_rate AS price, i.gst_rate, i.image_url, i.status,
            (i.image_url IS NOT NULL AND i.image_url <> '') AS has_image,
            COALESCE(m.duration_min, 30) AS duration_min, COALESCE(m.gender,'unisex') AS gender,
            COALESCE(m.online_booking,1) AS online_booking, m.staff_ids, COALESCE(m.discount_pct,0) AS discount_pct
     FROM items i
     LEFT JOIN salon_service_meta m ON m.item_id = i.id
     WHERE i.business_id = ? AND COALESCE(i.status,'active') <> 'inactive'
     ORDER BY i.category, i.name`,
    [shopId],
  );
  const staff = await query(
    `SELECT id, TRIM(CONCAT_WS(' ', first_name, last_name)) AS name, role, username
     FROM staff_users WHERE business_id = ? AND COALESCE(status,'active') <> 'inactive'
     ORDER BY first_name, last_name, username`,
    [shopId],
  );
  const packages = await query(
    `SELECT * FROM salon_packages WHERE business_id = ? AND status = 'active' ORDER BY name`,
    [shopId],
  );
  return { items, staff, packages, categories: POSSalon.CATEGORIES };
}

async function bookingNo(_conn, shopId) {
  const rows = await query(`SELECT COUNT(*) AS n FROM salon_bookings WHERE business_id = ?`, [shopId]);
  return `BK-${10001 + Number(rows[0]?.n || 0)}`;
}

function payReceipt(kind, n) {
  const p = kind === "advance" ? "AR" : kind === "package" ? "PK" : "PR";
  return `${p}-${n}`;
}

async function insertPayment(conn, row) {
  const id = uuid();
  let ledgerId = row.ledger_id || null;
  try {
    if (!ledgerId) {
      ledgerId = uuid();
      const lsql = `INSERT INTO account_ledger (
         id, business_id, entry_no, entry_type, party_type, party_id, party_name,
         amount, payment_method, reference_type, reference_id, notes
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;
      const largs = [
        ledgerId,
        row.business_id,
        row.receipt_no,
        "receipt",
        "customer",
        row.customer_id,
        null,
        row.amount,
        row.method,
        "salon_booking",
        row.booking_id,
        row.kind,
      ];
      if (conn) await conn.query(lsql, largs);
      else await query(lsql, largs);
    }
  } catch {
    ledgerId = null;
  }
  const sql = `INSERT INTO salon_booking_payments
    (id, booking_id, customer_id, kind, amount, method, reference, receipt_no, txn_id, ledger_id, invoice_id, business_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;
  const args = [
    id,
    row.booking_id,
    row.customer_id,
    row.kind,
    row.amount,
    row.method,
    row.reference || null,
    row.receipt_no,
    row.txn_id,
    ledgerId,
    row.invoice_id || null,
    row.business_id,
  ];
  if (conn) await conn.query(sql, args);
  else await query(sql, args);
  return id;
}

export function registerSalonPublic(app) {
  app.get("/api/salon/public/:shopId", async (req, res) => {
    try {
      await ensureSalonSchema();
      const shop = await loadShop(req.params.shopId);
      if (!shop || !salonShopAllowed(shop)) return res.status(404).json({ error: "Salon not found" });
      const catalog = await publicCatalog(shop.id);
      res.json({
        shop: { id: shop.id, name: shop.name, category: POSSalon.salonCategory(shop), address: shop.address, phone: shop.mobile || shop.phone },
        ...catalog,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/salon/public/:shopId/slots", async (req, res) => {
    try {
      await ensureSalonSchema();
      const date = clip(req.query.date, 10);
      const staffId = clip(req.query.staff_id, 64);
      const dur = Number(req.query.duration_min) || 30;
      const busy = await query(
        `SELECT start_time AS start, duration_min FROM salon_bookings
         WHERE business_id = ? AND booking_date = ? AND staff_id <=> ? AND status NOT IN ('cancelled','no_show')`,
        [req.params.shopId, date, staffId || null],
      );
      res.json({ slots: POSSalon.slotsForDay(date, dur, busy) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/salon/public/:shopId/register", async (req, res) => {
    try {
      await ensureSalonSchema();
      const shopId = req.params.shopId;
      const name = clip(req.body.name, 160);
      const email = clip(req.body.email, 160).toLowerCase();
      const mobile = digits(req.body.mobile).slice(-10);
      const password = String(req.body.password || "");
      if (!name || !email || password.length < 6) throw new Error("Name, email, and a 6+ character password are required");
      const exists = await query("SELECT id FROM customers WHERE business_id = ? AND email = ? LIMIT 1", [shopId, email]);
      if (exists[0]) throw new Error("This email is already registered");
      const id = uuid();
      const hash = await hashPassword(password);
      await query(
        `INSERT INTO customers (id, code, name, mobile, email, password_hash, type, outstanding, business_id)
         VALUES (?,?,?,?,?,?, 'b2c', 0, ?)`,
        [id, `CU-${Date.now().toString().slice(-6)}`, name, mobile, email, hash, shopId],
      );
      const token = await issueSession(id, shopId);
      res.json({ token, customer: { id, name, email, mobile, wallet_balance: 0 } });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/salon/public/:shopId/login", async (req, res) => {
    try {
      await ensureSalonSchema();
      const email = clip(req.body.email, 160).toLowerCase();
      const password = String(req.body.password || "");
      const rows = await query("SELECT * FROM customers WHERE business_id = ? AND email = ? LIMIT 1", [req.params.shopId, email]);
      const c = rows[0];
      if (!c?.password_hash || !(await verifyPassword(password, c.password_hash))) throw new Error("Email or password is wrong");
      const token = await issueSession(c.id, req.params.shopId);
      res.json({ token, customer: publicCustomer(c) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/salon/public/:shopId/otp/send", async (req, res) => {
    try {
      await ensureSalonSchema();
      const email = clip(req.body.email, 160).toLowerCase();
      if (!email) throw new Error("Email is required");
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const hash = await hashPassword(code);
      await query(
        `INSERT INTO salon_otps (id, email, mobile, code_hash, purpose, business_id, expires_at)
         VALUES (?,?,?,?,?,?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
        [uuid(), email, clip(req.body.mobile, 15), hash, clip(req.body.purpose, 24) || "login", req.params.shopId],
      );
      try {
        await sendMail({ to: email, subject: "Your salon OTP", text: `OTP: ${code}` });
      } catch {
        /* optional */
      }
      const out = { ok: true };
      if (process.env.NODE_ENV === "test" || req.body.debug) out.otp = code;
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/salon/public/:shopId/otp/verify", async (req, res) => {
    try {
      await ensureSalonSchema();
      const email = clip(req.body.email, 160).toLowerCase();
      const code = String(req.body.otp || req.body.code || "");
      const rows = await query(
        `SELECT * FROM salon_otps WHERE business_id = ? AND email = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 5`,
        [req.params.shopId, email],
      );
      let ok = false;
      for (const row of rows) {
        if (await verifyPassword(code, row.code_hash)) {
          ok = true;
          break;
        }
      }
      if (!ok) throw new Error("OTP is invalid or expired");
      let cust = (await query("SELECT * FROM customers WHERE business_id = ? AND email = ? LIMIT 1", [req.params.shopId, email]))[0];
      if (!cust) {
        const id = uuid();
        await query(
          `INSERT INTO customers (id, code, name, email, type, outstanding, business_id) VALUES (?,?,?,?, 'b2c', 0, ?)`,
          [id, `CU-${Date.now().toString().slice(-6)}`, email.split("@")[0], email, req.params.shopId],
        );
        cust = (await query("SELECT * FROM customers WHERE id = ?", [id]))[0];
      }
      if (clip(req.body.purpose, 24) === "reset" && req.body.password) {
        await query("UPDATE customers SET password_hash = ? WHERE id = ?", [await hashPassword(String(req.body.password)), cust.id]);
      }
      const token = await issueSession(cust.id, req.params.shopId);
      res.json({ token, customer: publicCustomer(cust) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/salon/public/:shopId/me", async (req, res) => {
    try {
      await ensureSalonSchema();
      const c = await requirePortal(req, res, req.params.shopId);
      if (!c) return;
      const bookings = await query(
        `SELECT * FROM salon_bookings WHERE customer_id = ? AND business_id = ? ORDER BY booking_date DESC, start_time DESC LIMIT 80`,
        [c.id, req.params.shopId],
      );
      const payments = await query(
        `SELECT * FROM salon_booking_payments WHERE customer_id = ? AND business_id = ? ORDER BY created_at DESC LIMIT 80`,
        [c.id, req.params.shopId],
      );
      const packages = await query(
        `SELECT * FROM salon_customer_packages WHERE customer_id = ? AND business_id = ? ORDER BY created_at DESC`,
        [c.id, req.params.shopId],
      );
      res.json({
        customer: publicCustomer(c),
        bookings,
        payments,
        packages,
        favourites: parseFav(c.favourite_json),
        wallet: Number(c.wallet_balance) || 0,
        outstanding: Number(c.outstanding) || 0,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/salon/public/:shopId/profile", async (req, res) => {
    try {
      const c = await requirePortal(req, res, req.params.shopId);
      if (!c) return;
      await query("UPDATE customers SET name = ?, mobile = ? WHERE id = ? AND business_id = ?", [
        clip(req.body.name, 160) || c.name,
        digits(req.body.mobile).slice(-10) || c.mobile,
        c.id,
        req.params.shopId,
      ]);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/salon/public/:shopId/favourites", async (req, res) => {
    try {
      const c = await requirePortal(req, res, req.params.shopId);
      if (!c) return;
      const fav = parseFav(c.favourite_json);
      const id = clip(req.body.item_id, 64);
      const next = fav.includes(id) ? fav.filter((x) => x !== id) : [...fav, id];
      await query("UPDATE customers SET favourite_json = ? WHERE id = ?", [JSON.stringify(next), c.id]);
      res.json({ favourites: next });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/salon/public/:shopId/book", async (req, res) => {
    try {
      await ensureSalonSchema();
      const shopId = req.params.shopId;
      const c = await requirePortal(req, res, shopId);
      if (!c) return;
      const body = req.body || {};
      const lines = Array.isArray(body.lines) ? body.lines : [{ item_id: body.item_id, name: body.service_name, price: body.price, qty: 1, gst_rate: body.gst_rate, duration_min: body.duration_min, discount_pct: body.discount_pct }];
      const totals = POSSalon.bookingTotals(lines, body.coupon_pct);
      const due = POSSalon.advanceDue(totals.total, body.advance_mode, body.advance_value);
      const payAmt = round(Number(body.pay_amount != null ? body.pay_amount : due.advance));
      const created = await withTransaction(async (conn) => {
        const number = await bookingNo(conn, shopId);
        const id = uuid();
        const status = payAmt > 0 || due.advance === 0 ? "confirmed" : "pending";
        await conn.query(
          `INSERT INTO salon_bookings (
             id, booking_number, customer_id, customer_name, staff_id, staff_name, branch_id,
             booking_date, start_time, duration_min, status, coupon_code, coupon_pct, subtotal, gst, total,
             advance_mode, advance_value, advance_paid, paid_amount, balance_due, previous_due, package_id,
             recurring_rule, notes, business_id
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            number,
            c.id,
            c.name,
            clip(body.staff_id, 64) || null,
            clip(body.staff_name, 160) || null,
            clip(body.branch_id, 64) || null,
            clip(body.date, 10),
            clip(body.start_time, 8),
            Number(body.duration_min) || lines.reduce((s, l) => s + (Number(l.duration_min) || 30), 0),
            body.waitlist ? "waitlist" : status,
            clip(body.coupon_code, 40) || null,
            Number(body.coupon_pct) || 0,
            totals.subtotal,
            totals.gst,
            totals.total,
            clip(body.advance_mode, 16) || "none",
            Number(body.advance_value) || 0,
            payAmt,
            payAmt,
            round(totals.total - payAmt),
            Number(c.outstanding) || 0,
            clip(body.package_id, 64) || null,
            clip(body.recurring_rule, 40) || null,
            clip(body.notes, 500),
            shopId,
          ],
        );
        for (const line of lines) {
          await conn.query(
            `INSERT INTO salon_booking_lines (id, booking_id, item_id, name, qty, duration_min, price, discount_pct, gst_rate, staff_id, business_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [uuid(), id, line.item_id || null, clip(line.name, 180) || "Service", Number(line.qty) || 1, Number(line.duration_min) || 30, Number(line.price) || 0, Number(line.discount_pct) || 0, Number(line.gst_rate) || 0, line.staff_id || body.staff_id || null, shopId],
          );
        }
        if (payAmt > 0) {
          const n = Date.now().toString().slice(-6);
          await insertPayment(conn, {
            booking_id: id,
            customer_id: c.id,
            kind: "advance",
            amount: payAmt,
            method: clip(body.pay_method, 32) || "upi",
            reference: clip(body.pay_reference, 80),
            receipt_no: payReceipt("advance", n),
            txn_id: `TXN-${n}`,
            business_id: shopId,
          });
          if (clip(body.pay_method, 32) === "wallet") {
            await conn.query("UPDATE customers SET wallet_balance = GREATEST(0, wallet_balance - ?) WHERE id = ?", [payAmt, c.id]);
          }
        }
        if (body.package_use_id) {
          await conn.query(
            `UPDATE salon_customer_packages SET used_sessions = used_sessions + 1, remaining_sessions = GREATEST(0, remaining_sessions - 1),
             status = IF(remaining_sessions - 1 <= 0, 'exhausted', status) WHERE id = ? AND customer_id = ? AND remaining_sessions > 0`,
            [body.package_use_id, c.id],
          );
        }
        let invoiceId = null;
        try {
          invoiceId = uuid();
          const payStatus = payAmt >= totals.total ? "paid" : payAmt > 0 ? "partial" : "unpaid";
          await conn.query(
            `INSERT INTO sales_orders (
               id, order_number, customer_id, customer_name, customer_type,
               pack_id, pack_name, pack_count, status, total_quantity_gm,
               subtotal, discount, gst, total, payment_method, payment_status, business_id,
               branch_id, cashier_id
             ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              invoiceId,
              number,
              c.id,
              c.name,
              c.type || "b2c",
              null,
              null,
              null,
              "confirmed",
              lines.reduce((s, l) => s + (Number(l.qty) || 1), 0),
              totals.subtotal,
              totals.coupon,
              totals.gst,
              totals.total,
              clip(body.pay_method, 32) || "upi",
              payStatus,
              shopId,
              null,
              null,
            ],
          );
          for (const line of lines) {
            const amt = POSSalon.lineAmount(line.price, line.qty || 1, line.discount_pct, line.gst_rate);
            await conn.query(
              `INSERT INTO sales_order_lines (
                 id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
                 discount, amount, gst_rate, cancelled, business_id
               ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
              [uuid(), invoiceId, line.item_id || null, clip(line.name, 180) || "Service", Number(line.qty) || 1, Number(line.price) || 0, amt.discount, amt.total, Number(line.gst_rate) || 0, 0, shopId],
            );
          }
          await conn.query("UPDATE salon_bookings SET sales_order_id=? WHERE id=?", [invoiceId, id]);
        } catch {
          invoiceId = null;
        }
        return { id, number, totals, due, paid: payAmt, status: body.waitlist ? "waitlist" : status, invoice_id: invoiceId };
      });
      await notify(shopId, {
        kind: "booking_confirm",
        customerId: c.id,
        bookingId: created.id,
        email: c.email,
        mobile: c.mobile,
        ctx: { booking_number: created.number, date: body.date, time: body.start_time, amount: payAmt },
      });
      if (payAmt > 0) {
        await notify(shopId, { kind: "advance_paid", customerId: c.id, bookingId: created.id, email: c.email, mobile: c.mobile, ctx: { booking_number: created.number, amount: payAmt } });
      }
      res.json(created);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/salon/public/:shopId/bookings/:id/reschedule", async (req, res) => {
    try {
      const c = await requirePortal(req, res, req.params.shopId);
      if (!c) return;
      await query(
        `UPDATE salon_bookings SET booking_date = ?, start_time = ?, status = 'confirmed' WHERE id = ? AND customer_id = ? AND business_id = ? AND status IN ('pending','confirmed','waitlist')`,
        [clip(req.body.date, 10), clip(req.body.start_time, 8), req.params.id, c.id, req.params.shopId],
      );
      await notify(req.params.shopId, { kind: "reschedule", customerId: c.id, bookingId: req.params.id, email: c.email, mobile: c.mobile, ctx: { date: req.body.date, time: req.body.start_time } });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/salon/public/:shopId/bookings/:id/cancel", async (req, res) => {
    try {
      const c = await requirePortal(req, res, req.params.shopId);
      if (!c) return;
      await query(
        `UPDATE salon_bookings SET status = 'cancelled' WHERE id = ? AND customer_id = ? AND business_id = ? AND status IN ('pending','confirmed','waitlist')`,
        [req.params.id, c.id, req.params.shopId],
      );
      await notify(req.params.shopId, { kind: "cancel", customerId: c.id, bookingId: req.params.id, email: c.email, mobile: c.mobile, ctx: {} });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/salon/public/:shopId/pay", async (req, res) => {
    try {
      const c = await requirePortal(req, res, req.params.shopId);
      if (!c) return;
      const booking = (await query("SELECT * FROM salon_bookings WHERE id = ? AND customer_id = ?", [req.body.booking_id, c.id]))[0];
      if (!booking) throw new Error("Booking not found");
      const amt = round(Number(req.body.amount) || booking.balance_due);
      const n = Date.now().toString().slice(-6);
      await insertPayment(null, {
        booking_id: booking.id,
        customer_id: c.id,
        kind: "balance",
        amount: amt,
        method: clip(req.body.method, 32) || "upi",
        reference: clip(req.body.reference, 80),
        receipt_no: payReceipt("pay", n),
        txn_id: `TXN-${n}`,
        business_id: req.params.shopId,
      });
      const paid = round(Number(booking.paid_amount) + amt);
      await query("UPDATE salon_bookings SET paid_amount = ?, advance_paid = GREATEST(advance_paid, ?), balance_due = GREATEST(0, total - ?) WHERE id = ?", [paid, paid, paid, booking.id]);
      res.json({ ok: true, receipt_no: payReceipt("pay", n), txn_id: `TXN-${n}` });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/salon/public/:shopId/packages/:id/buy", async (req, res) => {
    try {
      const c = await requirePortal(req, res, req.params.shopId);
      if (!c) return;
      const pkg = (await query("SELECT * FROM salon_packages WHERE id = ? AND business_id = ?", [req.params.id, req.params.shopId]))[0];
      if (!pkg) throw new Error("Package not found");
      const items = await query("SELECT * FROM salon_package_items WHERE package_id = ?", [pkg.id]);
      const save = POSSalon.packageSavings(items.map((i) => ({ price: i.price, qty: i.qty })), pkg.price);
      const id = uuid();
      const days = Number(pkg.validity_days) || 90;
      await query(
        `INSERT INTO salon_customer_packages
         (id, customer_id, package_id, package_name, total_sessions, used_sessions, remaining_sessions, purchase_date, expires_at, paid_value, status, business_id)
         VALUES (?,?,?,?,?,?,?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL ? DAY), ?, 'active', ?)`,
        [id, c.id, pkg.id, pkg.name, pkg.sessions, 0, pkg.sessions, days, pkg.price, req.params.shopId],
      );
      const n = Date.now().toString().slice(-6);
      await insertPayment(null, {
        booking_id: id,
        customer_id: c.id,
        kind: "package",
        amount: pkg.price,
        method: clip(req.body.method, 32) || "upi",
        reference: clip(req.body.reference, 80),
        receipt_no: payReceipt("package", n),
        txn_id: `TXN-${n}`,
        business_id: req.params.shopId,
      });
      await notify(req.params.shopId, { kind: "package_purchase", customerId: c.id, email: c.email, mobile: c.mobile, ctx: { package_name: pkg.name } });
      res.json({ id, savings: save, receipt_no: payReceipt("package", n) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
}

function publicCustomer(c) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    mobile: c.mobile,
    wallet_balance: Number(c.wallet_balance) || 0,
    outstanding: Number(c.outstanding) || 0,
    favourites: parseFav(c.favourite_json),
  };
}

function parseFav(raw) {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function round(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function registerSalonStaff(app) {
  app.use("/api/salon", (req, res, next) => {
    if (String(req.originalUrl || req.path || "").includes("/salon/public")) return next();
    return requireStaff(req, res, next);
  });

  app.get("/api/salon/board", requirePerm("dashboard"), async (_req, res) => {
    try {
      await ensureSalonSchema();
      const shopId = bid();
      const today = (await query("SELECT CURDATE() AS d"))[0]?.d;
      const counts = async (sql, args) => Number((await query(sql, args))[0]?.n || 0);
      const stats = {
        todayBookings: await counts(`SELECT COUNT(*) n FROM salon_bookings WHERE business_id=? AND booking_date=?`, [shopId, today]),
        todaySales: Number((await query(`SELECT COALESCE(SUM(total),0) n FROM salon_bookings WHERE business_id=? AND booking_date=? AND status='completed'`, [shopId, today]))[0]?.n || 0),
        todayAdvance: Number((await query(`SELECT COALESCE(SUM(amount),0) n FROM salon_booking_payments p JOIN salon_bookings b ON b.id=p.booking_id WHERE p.business_id=? AND DATE(p.created_at)=? AND p.kind='advance'`, [shopId, today]))[0]?.n || 0),
        todayCompleted: await counts(`SELECT COUNT(*) n FROM salon_bookings WHERE business_id=? AND booking_date=? AND status='completed'`, [shopId, today]),
        pendingPay: Number((await query(`SELECT COALESCE(SUM(balance_due),0) n FROM salon_bookings WHERE business_id=? AND balance_due>0 AND status NOT IN ('cancelled')`, [shopId]))[0]?.n || 0),
        upcoming: await counts(`SELECT COUNT(*) n FROM salon_bookings WHERE business_id=? AND booking_date>=? AND status IN ('pending','confirmed')`, [shopId, today]),
        cancelled: await counts(`SELECT COUNT(*) n FROM salon_bookings WHERE business_id=? AND booking_date=? AND status='cancelled'`, [shopId, today]),
        noShows: await counts(`SELECT COUNT(*) n FROM salon_bookings WHERE business_id=? AND booking_date=? AND status='no_show'`, [shopId, today]),
        packageSales: Number((await query(`SELECT COALESCE(SUM(paid_value),0) n FROM salon_customer_packages WHERE business_id=? AND purchase_date=?`, [shopId, today]))[0]?.n || 0),
        packageExpiry: await counts(`SELECT COUNT(*) n FROM salon_customer_packages WHERE business_id=? AND expires_at<=DATE_ADD(CURDATE(), INTERVAL 7 DAY) AND status='active'`, [shopId]),
      };
      const rows = await query(`SELECT * FROM salon_bookings WHERE business_id=? AND booking_date>=? ORDER BY booking_date, start_time LIMIT 80`, [shopId, today]);
      res.json({ stats, cards: POSSalon.dashboardCards(stats), bookings: rows, reports: POSSalon.REPORTS, categories: POSSalon.CATEGORIES });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/salon/bookings", requirePerm("orders"), async (req, res) => {
    try {
      await ensureSalonSchema();
      const status = clip(req.query.status, 24);
      const q = clip(req.query.q, 80).toLowerCase();
      let rows = await query(`SELECT * FROM salon_bookings WHERE business_id=? ORDER BY booking_date DESC, start_time DESC LIMIT 300`, [bid()]);
      if (status) rows = rows.filter((r) => r.status === status);
      if (q) rows = rows.filter((r) => `${r.booking_number} ${r.customer_name} ${r.staff_name}`.toLowerCase().includes(q));
      res.json(rows);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/salon/bookings/:id", requirePerm("orders"), async (req, res) => {
    try {
      const b = (await query("SELECT * FROM salon_bookings WHERE id=? AND business_id=?", [req.params.id, bid()]))[0];
      if (!b) return res.status(404).json({ error: "Not found" });
      const lines = await query("SELECT * FROM salon_booking_lines WHERE booking_id=?", [b.id]);
      const pays = await query("SELECT * FROM salon_booking_payments WHERE booking_id=?", [b.id]);
      res.json({ ...b, lines, payments: pays, invoice: POSSalon.invoiceFields({ ...b, lines }, pays[0]) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/salon/bookings/:id/status", requirePerm("orders"), async (req, res) => {
    try {
      const b = (await query("SELECT * FROM salon_bookings WHERE id=? AND business_id=?", [req.params.id, bid()]))[0];
      if (!b) throw new Error("Booking not found");
      const to = clip(req.body.status, 24);
      if (!POSSalon.canTransition(b.status, to) && to !== b.status) throw new Error("That status change is not allowed");
      await query("UPDATE salon_bookings SET status=? WHERE id=?", [to, b.id]);
      if (to === "completed") {
        const cust = (await query("SELECT * FROM customers WHERE id=?", [b.customer_id]))[0];
        await notify(bid(), { kind: "service_done", customerId: b.customer_id, bookingId: b.id, email: cust?.email, mobile: cust?.mobile, ctx: { booking_number: b.booking_number } });
      }
      if (to === "no_show") {
        const cust = (await query("SELECT * FROM customers WHERE id=?", [b.customer_id]))[0];
        await notify(bid(), { kind: "cancel", customerId: b.customer_id, bookingId: b.id, email: cust?.email, mobile: cust?.mobile, ctx: { booking_number: b.booking_number } });
      }
      res.json({ ok: true, status: to });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/salon/packages", requirePerm("items"), async (_req, res) => {
    try {
      await ensureSalonSchema();
      const pkgs = await query("SELECT * FROM salon_packages WHERE business_id=? ORDER BY name", [bid()]);
      const items = await query("SELECT * FROM salon_package_items WHERE business_id=?", [bid()]);
      res.json(pkgs.map((p) => ({ ...p, items: items.filter((i) => i.package_id === p.id), savings: POSSalon.packageSavings(items.filter((i) => i.package_id === p.id), p.price) })));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/salon/packages", requirePerm("items"), async (req, res) => {
    try {
      await ensureSalonSchema();
      const id = req.body.id || uuid();
      const b = req.body || {};
      const exists = (await query("SELECT id FROM salon_packages WHERE id=? AND business_id=?", [id, bid()]))[0];
      const fields = [
        clip(b.name, 180),
        clip(b.description, 2000),
        clip(b.category, 80),
        Number(b.price) || 0,
        Number(b.discount_pct) || 0,
        Number(b.gst_rate) || 0,
        Number(b.validity_days) || 90,
        Number(b.sessions) || 1,
        b.staff_ids ? JSON.stringify(b.staff_ids) : null,
        clip(b.branch_id, 64) || null,
        clip(b.gender, 16) || "unisex",
        clip(b.status, 16) || "active",
        clip(b.terms, 4000),
      ];
      if (exists) {
        await query(
          `UPDATE salon_packages SET name=?, description=?, category=?, price=?, discount_pct=?, gst_rate=?, validity_days=?, sessions=?, staff_ids=?, branch_id=?, gender=?, status=?, terms=? WHERE id=? AND business_id=?`,
          [...fields, id, bid()],
        );
        await query("DELETE FROM salon_package_items WHERE package_id=?", [id]);
      } else {
        await query(
          `INSERT INTO salon_packages (id, name, description, category, price, discount_pct, gst_rate, validity_days, sessions, staff_ids, branch_id, gender, status, terms, business_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, ...fields, bid()],
        );
      }
      for (const line of b.items || []) {
        await query(
          `INSERT INTO salon_package_items (id, package_id, item_id, qty, price, business_id) VALUES (?,?,?,?,?,?)`,
          [uuid(), id, line.item_id, Number(line.qty) || 1, Number(line.price) || 0, bid()],
        );
      }
      res.json({ id });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/salon/services/:itemId", requirePerm("items"), async (req, res) => {
    try {
      await ensureSalonSchema();
      const row = (await query("SELECT * FROM salon_service_meta WHERE item_id=? AND business_id=?", [req.params.itemId, bid()]))[0] || {
        item_id: req.params.itemId,
        duration_min: 30,
        gender: "unisex",
        online_booking: 1,
        discount_pct: 0,
      };
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/salon/services/:itemId", requirePerm("items"), async (req, res) => {
    try {
      await ensureSalonSchema();
      const b = req.body || {};
      await query(
        `INSERT INTO salon_service_meta (item_id, duration_min, gender, online_booking, staff_ids, branch_id, discount_pct, business_id)
         VALUES (?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE duration_min=VALUES(duration_min), gender=VALUES(gender), online_booking=VALUES(online_booking),
           staff_ids=VALUES(staff_ids), branch_id=VALUES(branch_id), discount_pct=VALUES(discount_pct)`,
        [req.params.itemId, Number(b.duration_min) || 30, clip(b.gender, 16) || "unisex", b.online_booking === false ? 0 : 1, b.staff_ids ? JSON.stringify(b.staff_ids) : null, clip(b.branch_id, 64) || null, Number(b.discount_pct) || 0, bid()],
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/salon/reports/:id", requirePerm("reports"), async (req, res) => {
    try {
      await ensureSalonSchema();
      const id = req.params.id;
      const shopId = bid();
      if (id === "salon-bookings" || id === "salon-advance-bookings") {
        const rows = await query("SELECT * FROM salon_bookings WHERE business_id=? ORDER BY booking_date DESC", [shopId]);
        return res.json({ id, rows: id === "salon-advance-bookings" ? rows.filter((r) => Number(r.advance_paid) > 0) : rows });
      }
      if (id === "salon-advance-pay" || id === "salon-pay-mode") {
        const rows = await query("SELECT * FROM salon_booking_payments WHERE business_id=? ORDER BY created_at DESC", [shopId]);
        return res.json({ id, rows });
      }
      if (id === "salon-package-sales" || id === "salon-package-usage" || id === "salon-package-expiry") {
        const rows = await query("SELECT * FROM salon_customer_packages WHERE business_id=?", [shopId]);
        const filtered = id === "salon-package-expiry" ? rows.filter((r) => r.status === "active") : rows;
        return res.json({ id, rows: filtered });
      }
      if (id === "salon-cancel") return res.json({ id, rows: await query("SELECT * FROM salon_bookings WHERE business_id=? AND status='cancelled'", [shopId]) });
      if (id === "salon-noshow") return res.json({ id, rows: await query("SELECT * FROM salon_bookings WHERE business_id=? AND status='no_show'", [shopId]) });
      if (id === "salon-outstanding") return res.json({ id, rows: await query("SELECT * FROM salon_bookings WHERE business_id=? AND balance_due>0", [shopId]) });
      const rows = await query("SELECT * FROM salon_bookings WHERE business_id=?", [shopId]);
      res.json({ id, rows });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
}
