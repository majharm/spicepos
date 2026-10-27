import crypto from "node:crypto";
import "../js/recurring.js";
import "../js/discount.js";
import "../js/units.js";
import "../js/footwear.js";
import { query, withTransaction } from "./db.js";
import { bid, branchId, authUser, runTenant } from "./context.js";
import { requireStaff, requirePerm } from "./auth.js";
import { clipInvoiceText } from "./i18n.js";
import { applySaleStock, assertApparelSaleStock, computeSaleLine, pharmacyLineSnapshot, persistSaleLineNote, stampSaleLineVariant } from "./advanced.js";
import { itemBillName } from "./crud.js";
import { settleCustomerInvoice } from "./accounts.js";
import { postSaleJournal } from "./accounting.js";
import { audit } from "./audit.js";
import { getPlatformSettings } from "./settings.js";
import { sendWhatsApp, waCfg } from "./alerts.js";

const R = globalThis.POSRecurring;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

let schemaReady = false;

async function ensureColumn(table, column, def) {
  const tables = await query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
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

export async function ensureRecurringSchema() {
  if (schemaReady) return;
  await ensureColumn("company_settings", "recurring_invoices_enabled", "TINYINT(1) NOT NULL DEFAULT 0");
  await ensureColumn("sales_orders", "due_date", "DATE NULL");
  await ensureColumn("sales_orders", "recurring_schedule_id", "VARCHAR(36) NULL");
  await query(`CREATE TABLE IF NOT EXISTS recurring_schedules (
    id VARCHAR(36) PRIMARY KEY,
    business_id VARCHAR(36) NOT NULL,
    name VARCHAR(180) NOT NULL,
    customer_id VARCHAR(36) NOT NULL,
    customer_name VARCHAR(180) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    frequency VARCHAR(16) NOT NULL,
    interval_days INT NULL,
    billing_day INT NULL,
    start_date DATE NOT NULL,
    end_date DATE NULL,
    max_cycles INT NULL,
    cycles_done INT NOT NULL DEFAULT 0,
    next_invoice_date DATE NOT NULL,
    payment_terms_days INT NOT NULL DEFAULT 0,
    auto_generate TINYINT(1) NOT NULL DEFAULT 1,
    whatsapp_invoice TINYINT(1) NOT NULL DEFAULT 0,
    whatsapp_reminder TINYINT(1) NOT NULL DEFAULT 0,
    email_invoice TINYINT(1) NOT NULL DEFAULT 0,
    discount_type VARCHAR(8) NULL,
    discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
    lines_json MEDIUMTEXT NOT NULL,
    last_order_id VARCHAR(36) NULL,
    last_order_number VARCHAR(32) NULL,
    last_error VARCHAR(255) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id),
    INDEX (business_id, status, next_invoice_date)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS recurring_runs (
    id VARCHAR(36) PRIMARY KEY,
    business_id VARCHAR(36) NOT NULL,
    schedule_id VARCHAR(36) NOT NULL,
    period_key VARCHAR(16) NOT NULL,
    sales_order_id VARCHAR(36) NULL,
    order_number VARCHAR(32) NULL,
    status VARCHAR(16) NOT NULL,
    notify_log TEXT NULL,
    error VARCHAR(255) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uniq_recur_period (business_id, schedule_id, period_key),
    INDEX (schedule_id)
  )`);
  schemaReady = true;
}

function shopToday(tz) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }
}

function ymdOf(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return R.ymd(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function flagBit(raw, fallback = 0) {
  if (raw == null || raw === "") return fallback;
  return R.flagOn(raw) ? 1 : 0;
}

function parseLines(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((line) => ({
      itemId: String(line.itemId || line.item_id || "").trim(),
      quantity_gm: Number(line.quantity_gm ?? line.quantity ?? line.qty),
      rate: line.rate == null || line.rate === "" ? null : Number(line.rate),
      discountType: String(line.discountType || line.discount_type || "amt").slice(0, 8),
      discountValue: Number(line.discountValue ?? line.discount_value ?? line.discount) || 0,
      gstRate: line.gstRate == null && line.gst_rate == null ? null : Number(line.gstRate ?? line.gst_rate),
      name: String(line.name || line.item_name || "").slice(0, 180),
    }))
    .filter((line) => line.itemId && Number.isFinite(line.quantity_gm) && line.quantity_gm > 0);
}

function publicSchedule(row) {
  if (!row) return null;
  let lines = [];
  try {
    lines = JSON.parse(row.lines_json || "[]");
  } catch {
    lines = [];
  }
  return {
    ...row,
    start_date: ymdOf(row.start_date),
    end_date: ymdOf(row.end_date),
    next_invoice_date: ymdOf(row.next_invoice_date),
    lines,
    lines_json: undefined,
  };
}

async function shopEnabled(businessId) {
  const rows = await query(
    "SELECT recurring_invoices_enabled, timezone FROM company_settings WHERE business_id = ? LIMIT 1",
    [businessId],
  );
  return {
    enabled: R.flagOn(rows[0]?.recurring_invoices_enabled),
    timezone: rows[0]?.timezone || "Asia/Kolkata",
  };
}

function cleanInput(body, existing) {
  const name = clipInvoiceText(body.name ?? existing?.name ?? "", 180).trim();
  const customerId = String(body.customer_id ?? body.customerId ?? existing?.customer_id ?? "").trim();
  const frequency = String(body.frequency ?? existing?.frequency ?? "").trim();
  const lines = body.lines != null || body.lines_json != null ? parseLines(body.lines || body.lines_json) : parseLines(JSON.parse(existing?.lines_json || "[]"));
  const start = ymdOf(body.start_date ?? body.startDate ?? existing?.start_date);
  let next = ymdOf(body.next_invoice_date ?? body.nextInvoiceDate ?? existing?.next_invoice_date ?? start);
  const endRaw = body.end_date ?? body.endDate ?? existing?.end_date ?? "";
  const end = endRaw ? ymdOf(endRaw) : "";
  const interval = Math.round(Number(body.interval_days ?? body.intervalDays ?? existing?.interval_days) || 0);
  const billingDay = Math.round(Number(body.billing_day ?? body.billingDay ?? existing?.billing_day) || 0);
  const terms = Math.max(0, Math.min(365, Math.round(Number(body.payment_terms_days ?? body.paymentTermsDays ?? existing?.payment_terms_days) || 0)));
  const maxRaw = body.max_cycles ?? body.maxCycles ?? existing?.max_cycles;
  const maxCycles = maxRaw == null || maxRaw === "" ? null : Math.max(1, Math.min(1000, Math.round(Number(maxRaw) || 0)));
  const status = String(body.status ?? existing?.status ?? "active").toLowerCase();
  if (!name) throw new Error("Enter a recurring invoice name");
  if (!customerId) throw new Error("Choose a customer");
  if (!R.frequencyOk(frequency)) throw new Error("Choose a billing frequency");
  if (!lines.length) throw new Error("Add at least one product or service");
  if (!R.parseYmd(start) || !R.parseYmd(next)) throw new Error("Enter a valid start date and next invoice date");
  if (end && !R.parseYmd(end)) throw new Error("End date is not valid");
  if (end && next > end) throw new Error("Next invoice date is after the end date");
  if (frequency === "custom" && (interval < 1 || interval > 366)) throw new Error("Custom interval must be between 1 and 366 days");
  if (["monthly", "bimonthly", "quarterly", "half_yearly", "yearly"].includes(frequency)) {
    if (billingDay < 1 || billingDay > 31) throw new Error("Choose a billing day from 1 to 31");
  }
  if (frequency === "weekly" && billingDay && (billingDay < 0 || billingDay > 6)) {
    throw new Error("Weekly billing day must be 0 (Sunday) to 6 (Saturday)");
  }
  if (!R.STATUSES.includes(status)) throw new Error("Status must be active, paused, completed, or cancelled");
  if (!existing && status !== "active" && status !== "paused") {
    throw new Error("Start a schedule as active or paused");
  }
  return {
    name,
    customerId,
    frequency,
    lines,
    start,
    next,
    end: end || null,
    interval: frequency === "custom" ? interval : null,
    billingDay: billingDay || null,
    terms,
    maxCycles: maxCycles || null,
    status,
    autoGenerate: flagBit(body.auto_generate ?? body.autoGenerate ?? existing?.auto_generate, 1),
    whatsappInvoice: flagBit(body.whatsapp_invoice ?? body.whatsappInvoice ?? existing?.whatsapp_invoice, 0),
    whatsappReminder: flagBit(body.whatsapp_reminder ?? body.whatsappReminder ?? existing?.whatsapp_reminder, 0),
    emailInvoice: flagBit(body.email_invoice ?? body.emailInvoice ?? existing?.email_invoice, 0),
    discountType: String(body.discount_type ?? body.discountType ?? existing?.discount_type ?? "amt").slice(0, 8) || "amt",
    discountValue: Math.max(0, Number(body.discount_value ?? body.discountValue ?? existing?.discount_value) || 0),
  };
}

async function loadSchedule(businessId, id) {
  const rows = await query("SELECT * FROM recurring_schedules WHERE id = ? AND business_id = ? LIMIT 1", [id, businessId]);
  return rows[0] || null;
}

export async function listRecurring(businessId, filters = {}) {
  await ensureRecurringSchema();
  const shop = await shopEnabled(businessId);
  const today = shopToday(shop.timezone);
  if (!shop.enabled) {
    return { enabled: false, today, stats: R.dashboardStats([], 0, today), schedules: [] };
  }
  const rows = await query(
    "SELECT * FROM recurring_schedules WHERE business_id = ? ORDER BY next_invoice_date, name",
    [businessId],
  );
  const month = today.slice(0, 7);
  const counts = await query(
    "SELECT COUNT(*) AS n FROM recurring_runs WHERE business_id = ? AND status = 'generated' AND created_at >= ?",
    [businessId, `${month}-01`],
  );
  let list = rows.map(publicSchedule);
  const q = String(filters.q || "").trim().toLowerCase();
  const status = String(filters.status || "").trim().toLowerCase();
  const frequency = String(filters.frequency || "").trim();
  const customerId = String(filters.customer_id || filters.customerId || "").trim();
  const from = ymdOf(filters.from);
  const to = ymdOf(filters.to);
  list = list.filter((row) => {
    if (status && row.status !== status) return false;
    if (frequency && row.frequency !== frequency) return false;
    if (customerId && row.customer_id !== customerId) return false;
    if (from && row.next_invoice_date < from) return false;
    if (to && row.next_invoice_date > to) return false;
    if (q) {
      const hay = `${row.name} ${row.customer_name} ${row.frequency} ${row.last_order_number || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return {
    enabled: true,
    today,
    stats: R.dashboardStats(rows.map(publicSchedule), Number(counts[0]?.n) || 0, today),
    schedules: list,
  };
}

async function assertCustomer(conn, businessId, customerId) {
  const [rows] = await conn.query("SELECT * FROM customers WHERE id = ? AND business_id = ? LIMIT 1", [customerId, businessId]);
  const customer = rows[0];
  if (!customer) throw new Error("Customer not found");
  const walkIn = customer.code === "CUS-001" || /^walk-?in$/i.test(String(customer.name || "").trim());
  if (walkIn) throw new Error("Choose a customer account. Walk-in cannot hold a recurring invoice.");
  return customer;
}

async function insertSchedule(businessId, input, customerName) {
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO recurring_schedules (
      id, business_id, name, customer_id, customer_name, status, frequency, interval_days, billing_day,
      start_date, end_date, max_cycles, next_invoice_date, payment_terms_days, auto_generate,
      whatsapp_invoice, whatsapp_reminder, email_invoice, discount_type, discount_value, lines_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, businessId, input.name, input.customerId, customerName, input.status, input.frequency, input.interval,
      input.billingDay, input.start, input.end, input.maxCycles, input.next, input.terms, input.autoGenerate,
      input.whatsappInvoice, input.whatsappReminder, input.emailInvoice, input.discountType, input.discountValue,
      JSON.stringify(input.lines),
    ],
  );
  return loadSchedule(businessId, id);
}

async function nextOrderNumber(conn, businessId) {
  const [seqRows] = await conn.query(
    "SELECT next_value FROM number_sequences WHERE name = 'order' AND business_id = ? FOR UPDATE",
    [businessId],
  );
  const seq = seqRows[0];
  const next = seq ? Number(seq.next_value) : 10001;
  if (seq) {
    await conn.query("UPDATE number_sequences SET next_value = ? WHERE name = 'order' AND business_id = ?", [next + 1, businessId]);
  } else {
    await conn.query("INSERT INTO number_sequences (name, next_value, business_id) VALUES ('order', ?, ?)", [next + 1, businessId]);
  }
  return `SO-${next}`;
}

async function createUnpaidSale(conn, { businessId, schedule, customer, period }) {
  const lines = parseLines(JSON.parse(schedule.lines_json || "[]"));
  const built = [];
  for (const line of lines) {
    const [items] = await conn.query("SELECT * FROM items WHERE id = ? AND business_id = ?", [line.itemId, businessId]);
    const item = items[0];
    if (!item) throw new Error("A saved product is no longer on this business");
    const frozen = {
      ...item,
      gst_rate: line.gstRate == null || Number.isNaN(line.gstRate) ? item.gst_rate : line.gstRate,
      retail_rate: line.rate == null || Number.isNaN(line.rate) ? item.retail_rate : line.rate,
      b2b_rate: line.rate == null || Number.isNaN(line.rate) ? item.b2b_rate : line.rate,
    };
    built.push(computeSaleLine(frozen, customer, {
      quantity_gm: line.quantity_gm,
      rate: line.rate,
      discountType: line.discountType,
      discountValue: line.discountValue,
    }));
  }
  await assertApparelSaleStock(conn, businessId, built.filter((line) => !R.skipsRecurringStock(line.item)));
  const bill = globalThis.POSDiscount.computeBill(built, {
    discountType: schedule.discount_type || "amt",
    discountValue: schedule.discount_value || 0,
  });
  const orderNumber = await nextOrderNumber(conn, businessId);
  const orderId = crypto.randomUUID();
  const totalGm = built.reduce((sum, line) => sum + line.qty, 0);
  const terms = Math.max(0, Number(schedule.payment_terms_days) || 0);
  const dueDate = R.addDays(period, terms);
  const cashier = authUser();
  const cashierId = cashier?.id && cashier.id !== "recurring" ? cashier.id : null;
  await conn.query(
    `INSERT INTO sales_orders (
       id, order_number, customer_id, customer_name, customer_type,
       pack_id, pack_name, pack_count, status, total_quantity_gm,
       subtotal, discount, gst, total, payment_method, payment_status, business_id,
       branch_id, cashier_id
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      orderId, orderNumber, customer.id, customer.business_name || customer.name, customer.type,
      null, null, null, "confirmed", totalGm,
      bill.subtotal, bill.billDiscount, bill.gst, bill.total, "credit", "unpaid", businessId,
      branchId(), cashierId,
    ],
  );
  try {
    await conn.query("UPDATE sales_orders SET discount_type=?, discount_value=? WHERE id=? AND business_id=?", [
      bill.discountType, bill.discountValue, orderId, businessId,
    ]);
  } catch {
    /* optional columns */
  }
  try {
    await conn.query(
      "UPDATE sales_orders SET due_date=?, recurring_schedule_id=?, customer_mobile=?, customer_address=? WHERE id=? AND business_id=?",
      [dueDate || null, schedule.id, customer.mobile || null, customer.address || null, orderId, businessId],
    );
  } catch {
    try {
      await conn.query("UPDATE sales_orders SET due_date=? WHERE id=? AND business_id=?", [dueDate || null, orderId, businessId]);
    } catch {
      /* due date column is optional until schema migrate */
    }
  }
  for (const line of built) {
    const lineId = crypto.randomUUID();
    try {
      await conn.query(
        `INSERT INTO sales_order_lines (
           id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
           discount, amount, gst_rate, cancelled, business_id,
           mrp, discount_type, discount_value, cost, profit
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          lineId, orderId, line.item.id, itemBillName(line.item), line.qty, line.rate,
          line.discount, line.amount, line.gstRate, 0, businessId,
          line.mrp, line.discountType, line.discountValue, line.cost, line.profit,
        ],
      );
    } catch {
      await conn.query(
        `INSERT INTO sales_order_lines (
           id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
           discount, amount, gst_rate, cancelled, business_id
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [lineId, orderId, line.item.id, itemBillName(line.item), line.qty, line.rate, line.discount, line.amount, line.gstRate, 0, businessId],
      );
    }
    let alloc = null;
    if (!R.skipsRecurringStock(line.item)) {
      alloc = await applySaleStock(conn, {
        businessId,
        branchId: branchId(),
        userId: cashierId,
        item: line.item,
        qty: line.qty,
        orderId,
        orderNumber,
        costRate: line.item.purchase_rate,
      });
    }
    const snap = pharmacyLineSnapshot(line.item, alloc?.batch);
    try {
      await conn.query("UPDATE sales_order_lines SET batch_no=?, expiry_date=?, pack_label=? WHERE id=?", [
        snap.batch_no, snap.expiry_date, snap.pack_label, lineId,
      ]);
    } catch {
      /* optional pharmacy columns */
    }
    await persistSaleLineNote(conn, lineId, `${schedule.name} · ${period}`);
    try {
      await stampSaleLineVariant(conn, lineId, line.item);
    } catch {
      /* variant columns optional */
    }
  }
  const dueSnap = await settleCustomerInvoice(conn, {
    customer,
    total: bill.total,
    orderId,
    orderNumber,
    method: "credit",
    amountPaid: 0,
    paymentDate: period,
  });
  const [orders] = await conn.query("SELECT * FROM sales_orders WHERE id = ? AND business_id = ?", [orderId, businessId]);
  const order = orders[0] || { id: orderId, order_number: orderNumber, total: bill.total, customer_id: customer.id, customer_name: customer.business_name || customer.name };
  order.payment_status = dueSnap.paymentStatus;
  order.amount_paid = dueSnap.amountPaid;
  order.current_due = dueSnap.currentDue;
  try {
    await postSaleJournal(conn, { ...order, business_id: businessId, payment_method: "credit" });
  } catch {
    /* journal is best-effort, same as a failed optional post */
  }
  return order;
}

async function claimRun(conn, businessId, scheduleId, period) {
  const [existingRows] = await conn.query(
    "SELECT * FROM recurring_runs WHERE business_id = ? AND schedule_id = ? AND period_key = ? LIMIT 1 FOR UPDATE",
    [businessId, scheduleId, period],
  );
  const existing = existingRows[0];
  if (existing?.sales_order_id) return { replay: existing };
  if (existing && String(existing.status) === "pending") {
    const age = Date.now() - new Date(existing.created_at).getTime();
    if (Number.isFinite(age) && age >= 0 && age < 120000) return { busy: true };
  }
  if (existing) {
    await conn.query("UPDATE recurring_runs SET status = 'pending', error = NULL WHERE id = ?", [existing.id]);
    return { runId: existing.id };
  }
  const runId = crypto.randomUUID();
  await conn.query(
    "INSERT INTO recurring_runs (id, business_id, schedule_id, period_key, status) VALUES (?,?,?,?, 'pending')",
    [runId, businessId, scheduleId, period],
  );
  return { runId };
}

async function notifyGenerated(schedule, order, customer, dueDate) {
  const log = [];
  const total = round2(order.total);
  const dueBit = dueDate ? ` Payment is due by ${dueDate}.` : "";
  const text = `Invoice ${order.order_number} for ${order.customer_name || customer.name} is ₹${total.toFixed(2)}.${dueBit} This invoice is unpaid until a payment is recorded.`;
  const wantWa = R.flagOn(schedule.whatsapp_invoice) || R.flagOn(schedule.whatsapp_reminder);
  if (wantWa) {
    try {
      const settings = await getPlatformSettings();
      const mobile = customer.mobile || customer.phone || "";
      const reminder = R.flagOn(schedule.whatsapp_reminder) ? `${text} Please pay the outstanding amount.` : text;
      const wa = await sendWhatsApp(waCfg(settings), [mobile], reminder);
      log.push({ channel: "whatsapp", status: wa?.ok ? "sent" : "failed", error: wa?.ok ? "" : wa?.reason || "not sent" });
    } catch (err) {
      log.push({ channel: "whatsapp", status: "failed", error: String(err.message || err).slice(0, 180) });
    }
  }
  try {
    const { deliverInvoiceCopy } = await import("./mail-box.js");
    const sent = await deliverInvoiceCopy({
      businessId: schedule.business_id,
      order: { ...order, customer_email: customer.email || order.customer_email || "" },
      to: customer.email || "",
      source: "recurring",
      scheduleOptIn: R.flagOn(schedule.email_invoice),
    });
    if (!sent.skipped) {
      log.push({
        channel: "email",
        status: sent.ok ? "sent" : "failed",
        error: sent.ok ? "" : String(sent.error || "not sent").slice(0, 180),
      });
    }
  } catch (err) {
    log.push({ channel: "email", status: "failed", error: String(err.message || err).slice(0, 180) });
  }
  return log;
}

export async function generateSchedule(businessId, scheduleId, { manual = false, today } = {}) {
  await ensureRecurringSchema();
  const shop = await shopEnabled(businessId);
  if (!shop.enabled) throw new Error("Recurring invoices are off for this business");
  const asOf = today || shopToday(shop.timezone);
  try {
  return await withTransaction(async (conn) => {
    const [locked] = await conn.query(
      "SELECT * FROM recurring_schedules WHERE id = ? AND business_id = ? LIMIT 1 FOR UPDATE",
      [scheduleId, businessId],
    );
    const schedule = locked[0];
    if (!schedule) throw new Error("Schedule not found");
    const customer = await assertCustomer(conn, businessId, schedule.customer_id);
    let current = { ...schedule, next_invoice_date: ymdOf(schedule.next_invoice_date), end_date: ymdOf(schedule.end_date) };
    const produced = [];
    for (let pass = 0; pass < (manual ? 1 : 3); pass += 1) {
      const [runRows] = await conn.query(
        "SELECT * FROM recurring_runs WHERE business_id = ? AND schedule_id = ? AND period_key = ? LIMIT 1",
        [businessId, scheduleId, current.next_invoice_date],
      );
      const plan = R.planGeneration(current, asOf, runRows[0], { manual: manual && pass === 0 });
      if (plan.action === "replay") {
        produced.push({ replay: true, orderId: plan.orderId, orderNumber: plan.orderNumber, period: current.next_invoice_date });
        break;
      }
      if (plan.action === "busy") {
        produced.push({ busy: true, period: current.next_invoice_date });
        break;
      }
      if (plan.action === "complete") {
        await conn.query("UPDATE recurring_schedules SET status = 'completed', last_error = NULL WHERE id = ? AND business_id = ?", [
          scheduleId, businessId,
        ]);
        break;
      }
      if (plan.action !== "create") break;
      const claim = await claimRun(conn, businessId, scheduleId, plan.period);
      if (claim.replay) {
        produced.push({ replay: true, orderId: claim.replay.sales_order_id, orderNumber: claim.replay.order_number, period: plan.period });
        break;
      }
      if (claim.busy) {
        produced.push({ busy: true, period: plan.period });
        break;
      }
      const sp = `recur_p${pass}`;
      await conn.query(`SAVEPOINT ${sp}`);
      try {
        const order = await createUnpaidSale(conn, { businessId, schedule: current, customer, period: plan.period });
        if (String(order.payment_status || "") === "paid" && round2(order.amount_paid) <= 0) {
          throw new Error("Recurring invoice was marked paid without a payment");
        }
        await conn.query(
          "UPDATE recurring_runs SET status = 'generated', sales_order_id = ?, order_number = ?, error = NULL WHERE id = ?",
          [order.id, order.order_number, claim.runId],
        );
        await conn.query(
          `UPDATE recurring_schedules
           SET next_invoice_date = ?, cycles_done = ?, status = ?, last_order_id = ?, last_order_number = ?, last_error = NULL, customer_name = ?
           WHERE id = ? AND business_id = ?`,
          [plan.nextDate, plan.cyclesDone, plan.afterStatus, order.id, order.order_number, customer.business_name || customer.name, scheduleId, businessId],
        );
        await conn.query(`RELEASE SAVEPOINT ${sp}`);
        produced.push({ order, period: plan.period, dueDate: R.addDays(plan.period, Number(current.payment_terms_days) || 0) });
        current = {
          ...current,
          next_invoice_date: plan.nextDate,
          cycles_done: plan.cyclesDone,
          status: plan.afterStatus,
        };
        if (plan.afterStatus !== "active") break;
      } catch (err) {
        const message = String(err.message || err).slice(0, 240);
        try {
          await conn.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        } catch {
          throw err;
        }
        await conn.query("UPDATE recurring_runs SET status = 'error', error = ? WHERE id = ?", [message, claim.runId]);
        await conn.query("UPDATE recurring_schedules SET last_error = ? WHERE id = ? AND business_id = ?", [message, scheduleId, businessId]);
        produced.push({ error: message, period: plan.period });
        break;
      }
    }
    return { customer, produced, schedule: current };
  }).then(async (result) => {
    for (const row of result.produced) {
      if (!row.order) continue;
      try {
        const note = await notifyGenerated(result.schedule, row.order, result.customer, row.dueDate);
        if (note.length) {
          await query("UPDATE recurring_runs SET notify_log = ? WHERE business_id = ? AND schedule_id = ? AND period_key = ?", [
            JSON.stringify(note).slice(0, 4000),
            businessId,
            scheduleId,
            row.period,
          ]);
        }
        await audit("Recurring invoice generated", {
          module: "sales",
          target_id: row.order.id,
          target_name: row.order.order_number,
          schedule_id: scheduleId,
        });
      } catch (err) {
        console.error("recurring notify:", err.message);
      }
    }
    const fresh = await loadSchedule(businessId, scheduleId);
    return { ok: true, schedule: publicSchedule(fresh), results: result.produced.map((row) => ({
      replay: Boolean(row.replay),
      busy: Boolean(row.busy),
      error: row.error || "",
      period: row.period || "",
      orderId: row.order?.id || row.orderId || "",
      orderNumber: row.order?.order_number || row.orderNumber || "",
      paymentStatus: row.order?.payment_status || "",
    })) };
  });
  } catch (err) {
    const message = String(err.message || err).slice(0, 240);
    if (message !== "Schedule not found") {
      try {
        await query("UPDATE recurring_schedules SET last_error = ? WHERE id = ? AND business_id = ?", [message, scheduleId, businessId]);
      } catch {
        /* the schedule row may already be gone */
      }
    }
    throw err;
  }
}

export async function generateDue(businessId, today) {
  await ensureRecurringSchema();
  const shop = await shopEnabled(businessId);
  if (!shop.enabled) return [];
  const asOf = today || shopToday(shop.timezone);
  const due = await query(
    `SELECT id FROM recurring_schedules
     WHERE business_id = ? AND status = 'active' AND auto_generate = 1 AND next_invoice_date <= ?`,
    [businessId, asOf],
  );
  const out = [];
  for (const row of due) {
    try {
      out.push(await generateSchedule(businessId, row.id, { today: asOf }));
    } catch (err) {
      out.push({ ok: false, id: row.id, error: String(err.message || err) });
    }
  }
  return out;
}

let schedulerStarted = false;
let schedulerBusy = false;

export function startRecurringScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const run = async () => {
    if (schedulerBusy) return;
    schedulerBusy = true;
    try {
      await ensureRecurringSchema();
      const shops = await query("SELECT business_id FROM company_settings WHERE recurring_invoices_enabled = 1");
      for (const shop of shops) {
        await runTenant({ businessId: shop.business_id, user: { id: "recurring", role: "business_admin" } }, () =>
          generateDue(shop.business_id),
        );
      }
    } catch (err) {
      console.error("recurring scheduler:", err.message);
    } finally {
      schedulerBusy = false;
    }
  };
  setTimeout(run, 20000);
  setInterval(run, 5 * 60 * 1000);
}

function requireEnabled(shop) {
  if (!shop.enabled) {
    const err = new Error("Turn on Recurring Invoices in Invoice & Print Settings");
    err.status = 403;
    throw err;
  }
}

export function registerRecurring(app) {
  app.get("/api/recurring", requireStaff, requirePerm("orders"), async (req, res) => {
    try {
      res.json(await listRecurring(bid(), req.query || {}));
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) });
    }
  });

  app.get("/api/recurring/:id", requireStaff, requirePerm("orders"), async (req, res) => {
    try {
      await ensureRecurringSchema();
      const shop = await shopEnabled(bid());
      requireEnabled(shop);
      const row = await loadSchedule(bid(), req.params.id);
      if (!row) {
        res.status(404).json({ error: "Schedule not found" });
        return;
      }
      const runs = await query(
        "SELECT * FROM recurring_runs WHERE business_id = ? AND schedule_id = ? ORDER BY period_key DESC",
        [bid(), row.id],
      );
      res.json({ schedule: publicSchedule(row), runs });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) });
    }
  });

  app.post("/api/recurring", requireStaff, requirePerm("orders"), async (req, res) => {
    try {
      await ensureRecurringSchema();
      const shop = await shopEnabled(bid());
      requireEnabled(shop);
      const input = cleanInput(req.body || {}, null);
      const saved = await withTransaction(async (conn) => {
        const customer = await assertCustomer(conn, bid(), input.customerId);
        return { customer };
      });
      const row = await insertSchedule(bid(), input, saved.customer.business_name || saved.customer.name);
      await audit("Recurring schedule created", { module: "sales", target_id: row.id, target_name: row.name }, req);
      res.json({ ok: true, schedule: publicSchedule(row) });
    } catch (err) {
      res.status(err.status || 400).json({ error: String(err.message || err) });
    }
  });

  app.post("/api/recurring/:id", requireStaff, requirePerm("orders"), async (req, res) => {
    try {
      await ensureRecurringSchema();
      const shop = await shopEnabled(bid());
      requireEnabled(shop);
      const existing = await loadSchedule(bid(), req.params.id);
      if (!existing) {
        res.status(404).json({ error: "Schedule not found" });
        return;
      }
      if (["cancelled", "completed"].includes(String(existing.status))) {
        res.status(400).json({ error: "This schedule is closed. Previously generated invoices stay as they are." });
        return;
      }
      const input = cleanInput(req.body || {}, existing);
      if (input.status === "cancelled" || input.status === "completed") {
        res.status(400).json({ error: "Use pause, resume, or cancel for status changes" });
        return;
      }
      const customer = await withTransaction(async (conn) => assertCustomer(conn, bid(), input.customerId));
      await query(
        `UPDATE recurring_schedules SET
          name=?, customer_id=?, customer_name=?, status=?, frequency=?, interval_days=?, billing_day=?,
          start_date=?, end_date=?, max_cycles=?, next_invoice_date=?, payment_terms_days=?, auto_generate=?,
          whatsapp_invoice=?, whatsapp_reminder=?, email_invoice=?, discount_type=?, discount_value=?, lines_json=?, last_error=NULL
         WHERE id=? AND business_id=?`,
        [
          input.name, input.customerId, customer.business_name || customer.name, input.status, input.frequency,
          input.interval, input.billingDay, input.start, input.end, input.maxCycles, input.next, input.terms,
          input.autoGenerate, input.whatsappInvoice, input.whatsappReminder, input.emailInvoice,
          input.discountType, input.discountValue, JSON.stringify(input.lines), existing.id, bid(),
        ],
      );
      const row = await loadSchedule(bid(), existing.id);
      await audit("Recurring schedule updated", { module: "sales", target_id: row.id, target_name: row.name }, req);
      res.json({ ok: true, schedule: publicSchedule(row) });
    } catch (err) {
      res.status(err.status || 400).json({ error: String(err.message || err) });
    }
  });

  async function setStatus(req, res, from, to) {
    try {
      await ensureRecurringSchema();
      const shop = await shopEnabled(bid());
      requireEnabled(shop);
      const row = await loadSchedule(bid(), req.params.id);
      if (!row) {
        res.status(404).json({ error: "Schedule not found" });
        return;
      }
      if (from && !from.includes(String(row.status))) {
        res.status(400).json({ error: `Cannot ${to} a ${row.status} schedule` });
        return;
      }
      await query("UPDATE recurring_schedules SET status = ? WHERE id = ? AND business_id = ?", [to, row.id, bid()]);
      const fresh = await loadSchedule(bid(), row.id);
      res.json({ ok: true, schedule: publicSchedule(fresh) });
    } catch (err) {
      res.status(err.status || 400).json({ error: String(err.message || err) });
    }
  }

  app.post("/api/recurring/:id/pause", requireStaff, requirePerm("orders"), (req, res) => setStatus(req, res, ["active"], "paused"));
  app.post("/api/recurring/:id/resume", requireStaff, requirePerm("orders"), (req, res) => setStatus(req, res, ["paused"], "active"));
  app.post("/api/recurring/:id/cancel", requireStaff, requirePerm("orders"), (req, res) => setStatus(req, res, ["active", "paused"], "cancelled"));

  app.post("/api/recurring/:id/generate", requireStaff, requirePerm("orders"), async (req, res) => {
    try {
      const result = await generateSchedule(bid(), req.params.id, { manual: true });
      res.json(result);
    } catch (err) {
      res.status(err.status || 400).json({ error: String(err.message || err) });
    }
  });
}
