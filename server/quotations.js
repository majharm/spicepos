import crypto from "node:crypto";
import "../js/discount.js";
import "../js/units.js";
import "../js/quotations.js";
import { query, withTransaction } from "./db.js";
import { bid, branchId, authUser } from "./context.js";
import { requireStaff, requirePerm } from "./auth.js";
import { nextSeq, itemBillName } from "./crud.js";
import { applySaleStock, assertApparelSaleStock, computeSaleLine } from "./advanced.js";
import { settleCustomerInvoice } from "./accounts.js";
import { postSaleJournal } from "./accounting.js";
import { loadMailbox, decryptSecret } from "./mail-box.js";
import { sendMail } from "./mail.js";
import { quotationPdfBuffer } from "./invoice-pdf.js";
import { isInterStateSupply } from "./gst-supply.js";

const Q = globalThis.POSQuotations;
let schemaReady = false;

async function ensureColumn(table, column, def) {
  const tables = await query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  if (!tables.length) return;
  const cols = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  if (cols.length) return;
  await query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${def}`);
}

export async function ensureQuotationSchema() {
  if (schemaReady) return;
  await ensureColumn("company_settings", "quotations_enabled", "TINYINT(1) NOT NULL DEFAULT 0");
  await ensureColumn("company_settings", "quotation_valid_days", "INT NOT NULL DEFAULT 15");
  await ensureColumn("company_settings", "quotation_terms", "TEXT NULL");
  await ensureColumn("sales_orders", "quotation_id", "VARCHAR(36) NULL");
  await query(`CREATE TABLE IF NOT EXISTS quotations (
    id VARCHAR(36) PRIMARY KEY,
    business_id VARCHAR(36) NOT NULL,
    quotation_number VARCHAR(32) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'draft',
    customer_id VARCHAR(36) NULL,
    customer_name VARCHAR(180) NULL,
    customer_phone VARCHAR(32) NULL,
    customer_email VARCHAR(160) NULL,
    billing_address VARCHAR(500) NULL,
    shipping_address VARCHAR(500) NULL,
    quotation_date DATE NOT NULL,
    valid_until DATE NULL,
    reference_no VARCHAR(64) NULL,
    salesperson VARCHAR(120) NULL,
    subtotal DECIMAL(14,4) NOT NULL DEFAULT 0,
    discount DECIMAL(14,4) NOT NULL DEFAULT 0,
    discount_type VARCHAR(8) NULL,
    discount_value DECIMAL(14,4) NOT NULL DEFAULT 0,
    extra_charges DECIMAL(14,4) NOT NULL DEFAULT 0,
    gst DECIMAL(14,4) NOT NULL DEFAULT 0,
    cgst DECIMAL(14,4) NOT NULL DEFAULT 0,
    sgst DECIMAL(14,4) NOT NULL DEFAULT 0,
    igst DECIMAL(14,4) NOT NULL DEFAULT 0,
    round_off DECIMAL(14,4) NOT NULL DEFAULT 0,
    total DECIMAL(14,4) NOT NULL DEFAULT 0,
    terms TEXT NULL,
    notes TEXT NULL,
    lines_json MEDIUMTEXT NOT NULL,
    order_id VARCHAR(36) NULL,
    order_number VARCHAR(32) NULL,
    converted_at TIMESTAMP(3) NULL,
    created_by VARCHAR(36) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_quote_no (business_id, quotation_number),
    INDEX (business_id, status),
    INDEX (business_id, quotation_date)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS quotation_events (
    id VARCHAR(36) PRIMARY KEY,
    business_id VARCHAR(36) NOT NULL,
    quotation_id VARCHAR(36) NOT NULL,
    action VARCHAR(32) NOT NULL,
    from_status VARCHAR(24) NULL,
    to_status VARCHAR(24) NULL,
    note VARCHAR(255) NULL,
    created_by VARCHAR(36) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (quotation_id),
    INDEX (business_id, quotation_id)
  )`);
  schemaReady = true;
}

function clip(value, max) {
  return String(value || "").trim().slice(0, max);
}

function flagOn(raw) {
  return raw === true || raw === 1 || raw === "1";
}

async function shopRow(businessId) {
  const rows = await query(
    `SELECT b.name, b.phone, b.email, b.gstin, b.address, b.state, b.category,
            s.quotations_enabled, s.quotation_valid_days, s.quotation_terms, s.invoice_terms, s.timezone, s.gstin AS settings_gstin
     FROM businesses b
     LEFT JOIN company_settings s ON s.business_id = b.id
     WHERE b.id = ? LIMIT 1`,
    [businessId],
  );
  return rows[0] || {};
}

function publicQuote(row, today) {
  if (!row) return null;
  let lines = [];
  try {
    lines = JSON.parse(row.lines_json || "[]");
  } catch {
    lines = [];
  }
  const quote = {
    ...row,
    lines: Array.isArray(lines) ? lines : [],
    status: Q.effectiveStatus(row, today),
    stored_status: Q.statusOf(row.status),
  };
  delete quote.lines_json;
  return quote;
}

async function recordEvent(conn, businessId, quotationId, action, fromStatus, toStatus, note) {
  const user = authUser();
  const sql = `INSERT INTO quotation_events (id, business_id, quotation_id, action, from_status, to_status, note, created_by)
    VALUES (?,?,?,?,?,?,?,?)`;
  const params = [
    crypto.randomUUID(),
    businessId,
    quotationId,
    action,
    fromStatus || null,
    toStatus || null,
    clip(note, 255) || null,
    user?.id || null,
  ];
  if (conn) await conn.query(sql, params);
  else await query(sql, params);
}

async function loadQuote(businessId, id, conn) {
  const sql = "SELECT * FROM quotations WHERE id = ? AND business_id = ? LIMIT 1";
  const rows = conn ? (await conn.query(sql, [id, businessId]))[0] : await query(sql, [id, businessId]);
  return rows[0] || null;
}

async function expireOpen(businessId, today) {
  await query(
    `UPDATE quotations SET status = 'expired'
     WHERE business_id = ? AND valid_until IS NOT NULL AND valid_until < ?
       AND status IN ('draft','sent','accepted') AND order_id IS NULL`,
    [businessId, today],
  );
}

function skipsStock(item) {
  const unit = String(item?.base_unit || item?.unit || "").trim().toUpperCase();
  if (unit === "SERVICE") return true;
  return String(item?.kind || item?.item_kind || "").trim().toLowerCase() === "service";
}

async function assertOwnItems(businessId, lines) {
  for (const line of lines) {
    const rows = await query("SELECT id FROM items WHERE id = ? AND business_id = ? LIMIT 1", [line.itemId, businessId]);
    if (!rows[0]) {
      const err = new Error("Choose a product or service for every line");
      err.status = 400;
      throw err;
    }
  }
}

async function requireOn(businessId) {
  await ensureQuotationSchema();
  const shop = await shopRow(businessId);
  if (!flagOn(shop.quotations_enabled)) {
    const err = new Error("Turn on Enable Quotations in Business Settings before using quotations.");
    err.status = 403;
    throw err;
  }
  return shop;
}

function readInput(body, shop, customer) {
  const date = Q.ymd(body.quotation_date || body.quotationDate) || Q.todayYmd();
  const days = Math.max(0, Math.min(365, Number(shop.quotation_valid_days) || 15));
  const valid = Q.ymd(body.valid_until || body.validUntil) || Q.addDays(date, days);
  const inter = isInterStateSupply(
    { gstin: shop.gstin || shop.settings_gstin, state: shop.state },
    { gstin: customer?.gstin, state: customer?.state },
  );
  const priced = Q.priceQuote({
    lines: body.lines,
    discountType: body.discount_type || body.discountType,
    discountValue: body.discount_value ?? body.discountValue,
    extraCharges: body.extra_charges ?? body.extraCharges,
    roundOff: body.round_off ?? body.roundOff,
    interState: inter,
  });
  if (!priced.lines.length) {
    const err = new Error("Add at least one product or service");
    err.status = 400;
    throw err;
  }
  if (priced.lines.some((line) => !line.itemId)) {
    const err = new Error("Choose a product or service for every line");
    err.status = 400;
    throw err;
  }
  return {
    date,
    valid,
    reference: clip(body.reference_no || body.reference, 64),
    salesperson: clip(body.salesperson, 120),
    shipping: clip(body.shipping_address || body.shippingAddress, 500),
    billing: clip(body.billing_address || body.billingAddress || customer?.address, 500),
    phone: clip(body.customer_phone || body.customerPhone || customer?.mobile, 32),
    email: clip(body.customer_email || body.customerEmail || customer?.email, 160),
    notes: clip(body.notes, 4000),
    terms: clip(body.terms || shop.quotation_terms || shop.invoice_terms, 4000),
    priced,
    name: clip(body.customer_name || customer?.business_name || customer?.name, 180),
  };
}

export function registerQuotations(app) {
  app.get("/api/quotations", requireStaff, requirePerm("orders"), async (req, res) => {
    try {
      await ensureQuotationSchema();
      const businessId = bid();
      const shop = await shopRow(businessId);
      const today = Q.todayYmd();
      if (!flagOn(shop.quotations_enabled)) {
        res.json({
          enabled: false,
          today,
          quotes: [],
          stats: Q.summarize([], today),
          shop,
          settings: {
            valid_days: Number(shop.quotation_valid_days) || 15,
            terms: shop.quotation_terms || "",
          },
        });
        return;
      }
      await expireOpen(businessId, today);
      const rows = await query(
        "SELECT * FROM quotations WHERE business_id = ? ORDER BY quotation_date DESC, quotation_number DESC LIMIT 500",
        [businessId],
      );
      let quotes = rows.map((row) => publicQuote(row, today));
      const q = String(req.query.q || "").trim().toLowerCase();
      const status = Q.statusOf(req.query.status || "");
      const from = Q.ymd(req.query.from);
      const to = Q.ymd(req.query.to);
      const customerId = String(req.query.customer_id || "").trim();
      const salesperson = String(req.query.salesperson || "").trim().toLowerCase();
      if (req.query.status) quotes = quotes.filter((row) => row.status === status);
      if (customerId) quotes = quotes.filter((row) => row.customer_id === customerId);
      if (from) quotes = quotes.filter((row) => String(row.quotation_date).slice(0, 10) >= from);
      if (to) quotes = quotes.filter((row) => String(row.quotation_date).slice(0, 10) <= to);
      if (salesperson) quotes = quotes.filter((row) => String(row.salesperson || "").toLowerCase().includes(salesperson));
      if (q) {
        quotes = quotes.filter((row) =>
          `${row.quotation_number} ${row.customer_name} ${row.reference_no} ${row.salesperson}`.toLowerCase().includes(q),
        );
      }
      const all = rows.map((row) => publicQuote(row, today));
      res.json({
        enabled: true,
        today,
        stats: Q.summarize(all, today),
        quotes,
        settings: {
          valid_days: Number(shop.quotation_valid_days) || 15,
          terms: shop.quotation_terms || "",
        },
      });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.get("/api/quotations/:id", requireStaff, requirePerm("orders"), async (req, res) => {
    try {
      const shop = await requireOn(bid());
      const today = Q.todayYmd();
      await expireOpen(bid(), today);
      const row = await loadQuote(bid(), req.params.id);
      if (!row) {
        res.status(404).json({ error: "Quotation not found" });
        return;
      }
      const events = await query(
        "SELECT action, from_status, to_status, note, created_at FROM quotation_events WHERE quotation_id = ? AND business_id = ? ORDER BY created_at ASC",
        [req.params.id, bid()],
      );
      res.json({ quote: publicQuote(row, today), events, shopName: shop.name || "" });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/quotations/settings", requireStaff, requirePerm("settings"), async (req, res) => {
    try {
      await ensureQuotationSchema();
      const body = req.body || {};
      const days = Math.max(1, Math.min(365, Number(body.valid_days ?? body.quotation_valid_days) || 15));
      const terms = clip(body.terms ?? body.quotation_terms, 4000);
      const enabled = Object.prototype.hasOwnProperty.call(body, "enabled") || Object.prototype.hasOwnProperty.call(body, "quotations_enabled")
        ? (flagOn(body.enabled ?? body.quotations_enabled) ? 1 : 0)
        : null;
      let sql = "UPDATE company_settings SET quotation_valid_days = ?, quotation_terms = ?";
      const params = [days, terms || null];
      if (enabled != null) {
        sql += ", quotations_enabled = ?";
        params.push(enabled);
      }
      sql += " WHERE business_id = ?";
      params.push(bid());
      await query(sql, params);
      res.json({ ok: true, quotations_enabled: enabled, valid_days: days, terms });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/quotations", requireStaff, requirePerm("orders"), async (req, res) => {
    try {
      const shop = await requireOn(bid());
      const body = req.body || {};
      const [customers] = [await query("SELECT * FROM customers WHERE id = ? AND business_id = ? LIMIT 1", [body.customer_id || body.customerId, bid()])];
      const customer = customers[0];
      if (!customer) {
        res.status(400).json({ error: "Choose a customer" });
        return;
      }
      const input = readInput(body, shop, customer);
      await assertOwnItems(bid(), input.priced.lines);
      const id = crypto.randomUUID();
      const number = Q.formatNumber(await withTransaction(async (conn) => nextSeq(conn, "quotation", 1)));
      const status = Q.statusOf(body.status) === "sent" ? "sent" : "draft";
      const priced = input.priced;
      await query(
        `INSERT INTO quotations (
          id, business_id, quotation_number, status, customer_id, customer_name, customer_phone, customer_email,
          billing_address, shipping_address, quotation_date, valid_until, reference_no, salesperson,
          subtotal, discount, discount_type, discount_value, extra_charges, gst, cgst, sgst, igst, round_off, total,
          terms, notes, lines_json, created_by
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id, bid(), number, status, customer.id, input.name, input.phone, input.email,
          input.billing, input.shipping || null, input.date, input.valid || null, input.reference || null, input.salesperson || null,
          priced.subtotal, priced.discount, priced.discountType, priced.discountValue, priced.extraCharges,
          priced.gst, priced.cgst, priced.sgst, priced.igst, priced.roundOff, priced.total,
          input.terms || null, input.notes || null, JSON.stringify(priced.lines), authUser()?.id || null,
        ],
      );
      await recordEvent(null, bid(), id, "created", "", status, number);
      const saved = await loadQuote(bid(), id);
      res.json({ ok: true, quote: publicQuote(saved, Q.todayYmd()) });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/quotations/:id", requireStaff, requirePerm("orders"), async (req, res) => {
    try {
      const shop = await requireOn(bid());
      const today = Q.todayYmd();
      const existing = await loadQuote(bid(), req.params.id);
      if (!existing) {
        res.status(404).json({ error: "Quotation not found" });
        return;
      }
      const current = publicQuote(existing, today);
      if (!Q.canEdit(current, today)) {
        res.status(400).json({ error: "Only a draft quotation can be edited" });
        return;
      }
      const body = req.body || {};
      const customerId = body.customer_id || body.customerId || existing.customer_id;
      const customers = await query("SELECT * FROM customers WHERE id = ? AND business_id = ? LIMIT 1", [customerId, bid()]);
      const customer = customers[0];
      if (!customer) {
        res.status(400).json({ error: "Choose a customer" });
        return;
      }
      const input = readInput({ ...existing, ...body, lines: body.lines || current.lines }, shop, customer);
      await assertOwnItems(bid(), input.priced.lines);
      const priced = input.priced;
      await query(
        `UPDATE quotations SET customer_id=?, customer_name=?, customer_phone=?, customer_email=?, billing_address=?, shipping_address=?,
          quotation_date=?, valid_until=?, reference_no=?, salesperson=?, subtotal=?, discount=?, discount_type=?, discount_value=?,
          extra_charges=?, gst=?, cgst=?, sgst=?, igst=?, round_off=?, total=?, terms=?, notes=?, lines_json=?
         WHERE id=? AND business_id=? AND status='draft'`,
        [
          customer.id, input.name, input.phone, input.email, input.billing, input.shipping || null,
          input.date, input.valid || null, input.reference || null, input.salesperson || null,
          priced.subtotal, priced.discount, priced.discountType, priced.discountValue, priced.extraCharges,
          priced.gst, priced.cgst, priced.sgst, priced.igst, priced.roundOff, priced.total,
          input.terms || null, input.notes || null, JSON.stringify(priced.lines), existing.id, bid(),
        ],
      );
      await recordEvent(null, bid(), existing.id, "updated", "draft", "draft", "");
      res.json({ ok: true, quote: publicQuote(await loadQuote(bid(), existing.id), today) });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/quotations/:id/duplicate", requireStaff, requirePerm("orders"), async (req, res) => {
    try {
      await requireOn(bid());
      const existing = await loadQuote(bid(), req.params.id);
      if (!existing) {
        res.status(404).json({ error: "Quotation not found" });
        return;
      }
      const id = crypto.randomUUID();
      const number = Q.formatNumber(await withTransaction(async (conn) => nextSeq(conn, "quotation", 1)));
      const date = Q.todayYmd();
      const shop = await shopRow(bid());
      const days = Math.max(1, Number(shop.quotation_valid_days) || 15);
      await query(
        `INSERT INTO quotations (
          id, business_id, quotation_number, status, customer_id, customer_name, customer_phone, customer_email,
          billing_address, shipping_address, quotation_date, valid_until, reference_no, salesperson,
          subtotal, discount, discount_type, discount_value, extra_charges, gst, cgst, sgst, igst, round_off, total,
          terms, notes, lines_json, created_by
        ) SELECT ?, business_id, ?, 'draft', customer_id, customer_name, customer_phone, customer_email,
          billing_address, shipping_address, ?, ?, reference_no, salesperson,
          subtotal, discount, discount_type, discount_value, extra_charges, gst, cgst, sgst, igst, round_off, total,
          terms, notes, lines_json, ?
         FROM quotations WHERE id = ? AND business_id = ?`,
        [id, number, date, Q.addDays(date, days), authUser()?.id || null, existing.id, bid()],
      );
      await recordEvent(null, bid(), id, "duplicated", "", "draft", existing.quotation_number);
      res.json({ ok: true, quote: publicQuote(await loadQuote(bid(), id), date) });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/quotations/:id/status", requireStaff, requirePerm("orders"), async (req, res) => {
    try {
      await requireOn(bid());
      const today = Q.todayYmd();
      const existing = await loadQuote(bid(), req.params.id);
      if (!existing) {
        res.status(404).json({ error: "Quotation not found" });
        return;
      }
      const current = Q.effectiveStatus(existing, today);
      const next = Q.statusOf(req.body?.status);
      const allowed = {
        draft: ["sent", "cancelled"],
        sent: ["accepted", "rejected", "cancelled"],
        accepted: ["cancelled"],
      };
      if (!allowed[current]?.includes(next)) {
        res.status(400).json({ error: `Cannot mark a ${Q.statusLabel(current).toLowerCase()} quotation as ${Q.statusLabel(next).toLowerCase()}` });
        return;
      }
      await query("UPDATE quotations SET status = ? WHERE id = ? AND business_id = ? AND order_id IS NULL", [next, existing.id, bid()]);
      await recordEvent(null, bid(), existing.id, next, current, next, clip(req.body?.note, 255));
      res.json({ ok: true, quote: publicQuote(await loadQuote(bid(), existing.id), today) });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/quotations/:id/share", requireStaff, requirePerm("orders"), async (req, res) => {
    try {
      await requireOn(bid());
      const existing = await loadQuote(bid(), req.params.id);
      if (!existing) {
        res.status(404).json({ error: "Quotation not found" });
        return;
      }
      const channel = String(req.body?.channel || "whatsapp").toLowerCase() === "email" ? "email" : "whatsapp";
      let status = Q.statusOf(existing.status);
      if (status === "draft") {
        await query("UPDATE quotations SET status = 'sent' WHERE id = ? AND business_id = ?", [existing.id, bid()]);
        status = "sent";
      }
      await recordEvent(null, bid(), existing.id, channel === "whatsapp" ? "whatsapp" : "shared", existing.status, status, channel);
      res.json({ ok: true, quote: publicQuote(await loadQuote(bid(), existing.id), Q.todayYmd()) });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.get("/api/quotations/:id/pdf", requireStaff, requirePerm("orders"), async (req, res) => {
    try {
      const shop = await requireOn(bid());
      const row = await loadQuote(bid(), req.params.id);
      if (!row) {
        res.status(404).json({ error: "Quotation not found" });
        return;
      }
      const quote = publicQuote(row, Q.todayYmd());
      const pdf = quotationPdfBuffer(
        { name: shop.name, address: shop.address, phone: shop.phone, email: shop.email, gstin: shop.gstin || shop.settings_gstin },
        quote,
      );
      res.json({
        ok: true,
        filename: `Quotation-${quote.quotation_number}.pdf`,
        pdfBase64: pdf.toString("base64"),
      });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/quotations/:id/email", requireStaff, requirePerm("orders"), async (req, res) => {
    try {
      const shop = await requireOn(bid());
      const existing = await loadQuote(bid(), req.params.id);
      if (!existing) {
        res.status(404).json({ error: "Quotation not found" });
        return;
      }
      const quote = publicQuote(existing, Q.todayYmd());
      if (quote.status === "cancelled") {
        res.status(400).json({ error: "A cancelled quotation cannot be emailed" });
        return;
      }
      const to = String(req.body?.to || quote.customer_email || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        res.status(400).json({ error: "Enter the customer email before sending" });
        return;
      }
      const mailbox = await loadMailbox(bid());
      if (!mailbox?.smtp_pass_enc || !mailbox.from_email) {
        res.status(400).json({ error: "Save the mailbox before sending a quotation" });
        return;
      }
      let pass = "";
      try {
        pass = decryptSecret(mailbox.smtp_pass_enc);
      } catch {
        pass = "";
      }
      const subject = Q.emailSubject(quote.quotation_number, shop.name);
      const text = `${subject}\n\nThis quotation is not a tax invoice. Total ${Number(quote.total || 0).toFixed(2)}. Valid until ${quote.valid_until || ""}.`;
      const pdf = quotationPdfBuffer(
        { name: shop.name, address: shop.address, phone: shop.phone, gstin: shop.gstin || shop.settings_gstin },
        quote,
      );
      const sent = await sendMail({
        to,
        subject,
        text,
        html: `<p>${subject}</p><p>This quotation is not a tax invoice.</p>`,
        replyTo: mailbox.reply_to || "",
        smtp: {
          host: mailbox.smtp_host,
          port: Number(mailbox.smtp_port) || 465,
          secure: Number(mailbox.smtp_secure) !== 0 && Number(mailbox.smtp_port || 465) !== 587,
          user: mailbox.smtp_user,
          pass,
          from: mailbox.from_email,
          fromName: mailbox.from_name || shop.name || "Shop",
        },
        attachments: [{ filename: `Quotation-${quote.quotation_number}.pdf`, mimeType: "application/pdf", content: pdf }],
      });
      const next = quote.stored_status === "draft" && sent.ok ? "sent" : quote.stored_status;
      if (next !== quote.stored_status) {
        await query("UPDATE quotations SET status = 'sent' WHERE id = ? AND business_id = ?", [existing.id, bid()]);
      }
      await recordEvent(null, bid(), existing.id, sent.ok ? "emailed" : "email_failed", quote.stored_status, next, sent.ok ? to : clip(sent.error, 180));
      res.json({ ok: Boolean(sent.ok), error: sent.ok ? "" : sent.error || "Email was not sent", to, subject, quote: publicQuote(await loadQuote(bid(), existing.id), Q.todayYmd()) });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/quotations/:id/convert", requireStaff, requirePerm("orders"), async (req, res) => {
    try {
      await requireOn(bid());
      const today = Q.todayYmd();
      const result = await withTransaction(async (conn) => {
        const [rows] = await conn.query("SELECT * FROM quotations WHERE id = ? AND business_id = ? FOR UPDATE", [req.params.id, bid()]);
        const existing = rows[0];
        if (!existing) {
          const err = new Error("Quotation not found");
          err.status = 404;
          throw err;
        }
        if (existing.order_id) {
          return { replay: true, orderId: existing.order_id, orderNumber: existing.order_number, quote: existing };
        }
        const status = Q.effectiveStatus(existing, today);
        if (status !== "accepted") {
          const err = new Error("Accept the quotation before converting it to an invoice");
          err.status = 400;
          throw err;
        }
        const [customers] = await conn.query("SELECT * FROM customers WHERE id = ? AND business_id = ? LIMIT 1", [existing.customer_id, bid()]);
        const customer = customers[0];
        if (!customer) throw new Error("Customer not found");
        const lines = JSON.parse(existing.lines_json || "[]");
        const built = [];
        for (const line of lines) {
          const [items] = await conn.query("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", [line.itemId, bid()]);
          const item = items[0];
          if (!item) throw new Error("A quoted product is no longer on this business");
          const frozen = { ...item, gst_rate: line.gstRate, retail_rate: line.rate, b2b_rate: line.rate };
          built.push(computeSaleLine(frozen, customer, {
            quantity_gm: line.quantity,
            rate: line.rate,
            discountType: line.discountType,
            discountValue: line.discountValue,
            description: line.description,
          }));
        }
        await assertApparelSaleStock(conn, bid(), built.filter((line) => !skipsStock(line.item)));
        const orderNumber = `SO-${await nextSeq(conn, "order", 10001)}`;
        const orderId = crypto.randomUUID();
        const subtotal = Number(existing.subtotal) || 0;
        const discount = Number(existing.discount) || 0;
        const gst = Number(existing.gst) || 0;
        const total = Number(existing.total) || 0;
        const totalQty = built.reduce((sum, line) => sum + Number(line.qty || 0), 0);
        const cashier = authUser();
        await conn.query(
          `INSERT INTO sales_orders (
             id, order_number, customer_id, customer_name, customer_type,
             pack_id, pack_name, pack_count, status, total_quantity_gm,
             subtotal, discount, gst, total, payment_method, payment_status, business_id,
             branch_id, cashier_id
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            orderId, orderNumber, customer.id, existing.customer_name || customer.business_name || customer.name, customer.type || "b2c",
            null, null, null, "confirmed", totalQty,
            subtotal, discount, gst, total, "credit", "unpaid", bid(),
            branchId(), cashier?.id || null,
          ],
        );
        try {
          await conn.query("UPDATE sales_orders SET quotation_id = ? WHERE id = ? AND business_id = ?", [existing.id, orderId, bid()]);
        } catch {
          /* column is added with the quotation schema */
        }
        for (const line of built) {
          const lineId = crypto.randomUUID();
          try {
            await conn.query(
              `INSERT INTO sales_order_lines (
                 id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
                 discount, amount, gst_rate, cancelled, business_id
               ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
              [lineId, orderId, line.item.id, itemBillName(line.item), line.qty, line.rate, line.discount, line.amount, line.gstRate, 0, bid()],
            );
          } catch (err) {
            throw err;
          }
          if (!skipsStock(line.item)) {
            await applySaleStock(conn, {
              businessId: bid(),
              branchId: branchId(),
              userId: cashier?.id || null,
              item: line.item,
              qty: line.qty,
              orderId,
              orderNumber,
              costRate: line.item.purchase_rate,
            });
          }
        }
        await settleCustomerInvoice(conn, {
          customer,
          total,
          orderId,
          orderNumber,
          method: "credit",
          amountPaid: 0,
        });
        const [orders] = await conn.query("SELECT * FROM sales_orders WHERE id = ? AND business_id = ?", [orderId, bid()]);
        const order = orders[0] || { id: orderId, order_number: orderNumber, total, payment_method: "credit" };
        try {
          await postSaleJournal(conn, { ...order, business_id: bid(), payment_method: "credit" });
        } catch {
          /* journal follows the same best-effort rule as other credit invoices */
        }
        const [updated] = await conn.query(
          `UPDATE quotations SET status = 'converted', order_id = ?, order_number = ?, converted_at = CURRENT_TIMESTAMP(3)
           WHERE id = ? AND business_id = ? AND order_id IS NULL AND status = 'accepted'`,
          [orderId, orderNumber, existing.id, bid()],
        );
        if (!updated?.affectedRows) {
          const err = new Error("This quotation was already converted");
          err.status = 409;
          throw err;
        }
        await recordEvent(conn, bid(), existing.id, "converted", "accepted", "converted", orderNumber);
        return { replay: false, orderId, orderNumber, quoteId: existing.id };
      });
      if (result.replay) {
        res.json({ ok: true, replay: true, orderId: result.orderId, orderNumber: result.orderNumber, quote: publicQuote(result.quote, today) });
        return;
      }
      res.json({ ok: true, replay: false, orderId: result.orderId, orderNumber: result.orderNumber, quote: publicQuote(await loadQuote(bid(), result.quoteId), today) });
    } catch (err) {
      res.status(err.status || 400).json({ error: String(err.message) });
    }
  });
}
