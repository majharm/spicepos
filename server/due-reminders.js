import crypto from "node:crypto";
import "../js/due-reminders.js";
import { query } from "./db.js";
import { bid } from "./context.js";
import { requirePerm } from "./auth.js";
import {
  loadAlertSettings,
  sendWhatsApp,
  waProviderMessageId,
  signupWaTemporary,
  logAlertDeliveries,
} from "./alerts.js";

const Due = () => globalThis.POSDueReminders;
const MAX_SENDS = 40;
const MAX_ATTEMPTS = 4;

export const OPEN_REMAINDER_SQL = `GREATEST(0, COALESCE(o.total,0) - CASE
  WHEN COALESCE(o.amount_paid,0) > 0.004 THEN COALESCE(o.amount_paid,0)
  WHEN LOWER(TRIM(COALESCE(o.payment_status,''))) = 'paid' THEN COALESCE(o.total,0)
  WHEN LOWER(TRIM(COALESCE(o.payment_method,''))) = 'credit'
    OR LOWER(TRIM(COALESCE(o.payment_status,''))) IN ('unpaid','due','partial')
    THEN COALESCE(o.amount_paid,0)
  WHEN NULLIF(LOWER(TRIM(COALESCE(o.payment_method,''))), '') IS NOT NULL
    THEN COALESCE(o.total,0)
  ELSE COALESCE(o.amount_paid,0)
END)`;

const DUE_WA_TABLE = `CREATE TABLE IF NOT EXISTS due_whatsapp_reminders (
  id VARCHAR(255) PRIMARY KEY,
  business_id VARCHAR(255) NOT NULL,
  customer_id VARCHAR(255) NOT NULL,
  order_id VARCHAR(255) NOT NULL DEFAULT '',
  invoice_number VARCHAR(255) NOT NULL DEFAULT '',
  recipient VARCHAR(32) NOT NULL DEFAULT '',
  outstanding DECIMAL(12,2) NOT NULL DEFAULT 0,
  message TEXT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  provider_message_id VARCHAR(128) NULL,
  error VARCHAR(255) NULL,
  http_status INT NULL,
  attempts INT NOT NULL DEFAULT 0,
  dedupe_key VARCHAR(191) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  sent_at TIMESTAMP(3) NULL,
  INDEX idx_due_wa_biz (business_id, created_at),
  INDEX idx_due_wa_key (business_id, dedupe_key)
)`;

export async function ensureDueWaTable() {
  await query(DUE_WA_TABLE);
}

function waConfigured(settings) {
  const v = settings?.wa_enabled;
  const off = v === 0 || v === "0" || v === false || v === "off";
  return !off && Boolean(settings?.wa_api_key) && Boolean(settings?.wa_profile_id);
}

function waReady(settings) {
  return {
    wa_enabled: settings?.wa_enabled,
    wa_api_url: settings?.wa_api_url,
    apiKey: settings?.wa_api_key,
    profileId: settings?.wa_profile_id,
    wa_country_code: settings?.wa_country_code,
  };
}

function rowAgeMs(row) {
  const raw = row?.updated_at || row?.created_at;
  const ms = raw instanceof Date ? raw.getTime() : Date.parse(String(raw || ""));
  if (!Number.isFinite(ms)) return Number.POSITIVE_INFINITY;
  return Date.now() - ms;
}

function storedTemporary(row) {
  const status = Number(row?.http_status) || 0;
  if (status === 429 || status >= 500 || status === 0) return true;
  return /timeout|network|econn|fetch failed|rate limit|temporar/i.test(String(row?.error || ""));
}

function mapWaStatus(wa) {
  const json = wa?.results?.[0]?.json || {};
  const raw = String(json.status || wa?.results?.[0]?.delivery || "").toLowerCase();
  if (raw === "delivered" || raw === "read") return "delivered";
  if (raw === "queued" || json.queued === true || wa?.results?.[0]?.queued) return "queued";
  if (wa?.ok) return "sent";
  return "failed";
}

export function prepareDueReminders(payload = {}, options = {}) {
  const api = Due();
  const today = options.today || api.istToday(options.now);
  const shopName = options.shopName || payload.shopName || "ATAV POS";
  const shaped = (options.invoices || [])
    .map((order) => api.shapeInvoice(order, null, today))
    .filter((row) => row.outstanding > 0.004);
  const byCustomer = new Map();
  for (const row of shaped) {
    if (!byCustomer.has(row.customerId)) byCustomer.set(row.customerId, []);
    byCustomer.get(row.customerId).push(row);
  }
  const sends = Array.isArray(payload.sends) ? payload.sends.slice(0, MAX_SENDS) : [];
  const seen = new Set();
  const messages = [];
  for (const send of sends) {
    const customerId = String(send?.customerId || send?.customer_id || "").trim();
    const orderId = String(send?.orderId || send?.order_id || "").trim();
    const scope = send?.scope === "customer" || (!orderId && send?.scope !== "invoice") ? "customer" : "invoice";
    const seenKey = `${customerId}|${scope === "customer" ? "total" : orderId}`;
    if (!customerId || seen.has(seenKey)) continue;
    seen.add(seenKey);
    const list = byCustomer.get(customerId) || [];
    if (scope === "invoice") {
      const row = list.find((item) => item.orderId === orderId);
      if (!row) {
        messages.push({ customerId, orderId, scope, ok: false, reason: "nothing-due", message: "" });
        continue;
      }
      const edited = String(send?.message || "").trim();
      messages.push(messageItem(row, {
        scope,
        orderId,
        outstanding: row.outstanding,
        invoiceNumber: row.invoiceNumber,
        message: (edited || api.invoiceMessage(row, shopName)).slice(0, 2000),
        dedupeKey: api.dedupeKey(customerId, orderId, row.outstanding, today),
      }));
      continue;
    }
    if (!list.length) {
      messages.push({ customerId, orderId: "", scope, ok: false, reason: "nothing-due", message: "" });
      continue;
    }
    const outstanding = api.round2(list.reduce((sum, row) => sum + row.outstanding, 0));
    const edited = String(send?.message || "").trim();
    messages.push(messageItem(list[0], {
      scope,
      orderId: "",
      outstanding,
      invoiceNumber: list.map((row) => row.invoiceNumber).filter(Boolean).join(", "),
      message: (edited || api.customerMessage(list, shopName)).slice(0, 2000),
      dedupeKey: api.dedupeKey(customerId, "", outstanding, today),
    }));
  }
  return { shopName, today, messages };
}

function messageItem(row, extra) {
  const api = Due();
  return {
    ok: true,
    customerId: row.customerId,
    customerName: row.customerName,
    mobile: row.mobile,
    mobileOk: row.mobileOk,
    recipient: row.mobileOk ? api.normalizeMobile(row.mobile) : "",
    fallbackUrl: "",
    ...extra,
  };
}

function publicResult(item, extra = {}) {
  return {
    ok: Boolean(extra.ok),
    customerId: item.customerId || "",
    orderId: item.orderId || "",
    scope: item.scope || "",
    customerName: item.customerName || "",
    recipient: extra.recipient || item.recipient || "",
    outstanding: item.outstanding || 0,
    invoiceNumber: item.invoiceNumber || "",
    status: extra.status || "",
    duplicate: Boolean(extra.duplicate),
    reason: extra.reason || item.reason || "",
    error: extra.error || "",
    providerMessageId: extra.providerMessageId || "",
    fallbackUrl: extra.fallbackUrl || "",
    attempts: extra.attempts || 0,
  };
}

async function remember(ctx, item, wa, attempts) {
  const status = mapWaStatus(wa);
  const providerMessageId = waProviderMessageId(wa);
  const error = wa?.ok ? "" : String(wa?.reason || wa?.error || wa?.results?.[0]?.error || "WhatsApp failed").slice(0, 255);
  const http = Number(wa?.results?.[0]?.status || wa?.status) || 0;
  await ctx.store.update(ctx.rowId, {
    status,
    provider_message_id: providerMessageId,
    error,
    http_status: http || null,
    attempts,
  });
  if (ctx.log) {
    await logAlertDeliveries({
      kind: "due-reminder",
      businessId: ctx.businessId,
      shopName: ctx.shopName,
      subject: "Outstanding payment reminder",
      text: item.message,
      wa,
    });
  }
  return publicResult(item, {
    ok: Boolean(wa?.ok),
    status,
    recipient: item.recipient,
    error,
    providerMessageId,
    attempts,
    reason: wa?.ok ? "" : wa?.reason || "wa-failed",
  });
}

async function deliverOne(item, ctx) {
  const api = Due();
  if (!item.ok) {
    return publicResult(item, { ok: false, status: "failed", reason: item.reason || "nothing-due", error: "This invoice has no balance due" });
  }
  if (!item.mobileOk || !item.message) {
    return publicResult(item, {
      ok: false,
      status: "failed",
      reason: "bad-mobile",
      error: "Enter a 10-digit mobile number before sending WhatsApp",
    });
  }
  const fallbackUrl = api.whatsappUrl(item.mobile, item.message);
  if (!waConfigured(ctx.settings)) {
    return publicResult(item, {
      ok: false,
      status: "failed",
      reason: "wa-off",
      error: "WhatsApp API is not configured",
      fallbackUrl,
    });
  }
  const existing = await ctx.store.recent(ctx.businessId, item.dedupeKey);
  if (existing) {
    const status = String(existing.status || "");
    const age = rowAgeMs(existing);
    if (status === "pending" && age < 60000) {
      return publicResult(item, { ok: true, duplicate: true, status: "pending", reason: "in-flight", attempts: Number(existing.attempts) || 1 });
    }
    if (["sent", "delivered", "queued"].includes(status) && !ctx.resend) {
      return publicResult(item, {
        ok: true,
        duplicate: true,
        status,
        providerMessageId: existing.provider_message_id || "",
        attempts: Number(existing.attempts) || 1,
        recipient: existing.recipient || item.recipient,
      });
    }
    if (status === "failed" && !ctx.resend && storedTemporary(existing) && Number(existing.attempts) < MAX_ATTEMPTS) {
      ctx.rowId = existing.id;
      const attempts = Number(existing.attempts) + 1;
      let wa = await sendWhatsApp(waReady(ctx.settings), [item.recipient], item.message, ctx.fetchImpl);
      if (!wa.ok && signupWaTemporary(wa) && attempts < MAX_ATTEMPTS) {
        wa = await sendWhatsApp(waReady(ctx.settings), [item.recipient], item.message, ctx.fetchImpl);
        return remember(ctx, item, wa, attempts + 1);
      }
      return remember(ctx, item, wa, attempts);
    }
  }
  const id = crypto.randomUUID();
  ctx.rowId = id;
  await ctx.store.insert({
    id,
    business_id: ctx.businessId,
    customer_id: item.customerId,
    order_id: item.orderId || "",
    invoice_number: String(item.invoiceNumber || "").slice(0, 255),
    recipient: item.recipient,
    outstanding: item.outstanding,
    message: item.message,
    status: "pending",
    provider_message_id: "",
    error: "",
    http_status: null,
    attempts: 1,
    dedupe_key: item.dedupeKey,
    created_at: new Date().toISOString(),
  });
  let attempts = 1;
  let wa = await sendWhatsApp(waReady(ctx.settings), [item.recipient], item.message, ctx.fetchImpl);
  if (!wa.ok && signupWaTemporary(wa) && attempts < MAX_ATTEMPTS) {
    attempts += 1;
    wa = await sendWhatsApp(waReady(ctx.settings), [item.recipient], item.message, ctx.fetchImpl);
  }
  return remember(ctx, item, wa, attempts);
}

export async function sendDueReminders(payload = {}, options = {}) {
  const prepared = prepareDueReminders(payload, options);
  if (!prepared.messages.length) {
    return { ok: false, error: "Choose a customer or invoice with a balance due", preview: Boolean(payload.preview), messages: [], results: [] };
  }
  if (payload.preview) {
    const api = Due();
    return {
      ok: prepared.messages.some((item) => item.ok),
      preview: true,
      shopName: prepared.shopName,
      waOff: !waConfigured(options.settings || {}),
      messages: prepared.messages.map((item) => ({
        ...item,
        fallbackUrl: item.message ? api.whatsappUrl(item.mobile, item.message) : "",
      })),
    };
  }
  const ctxBase = {
    settings: options.settings,
    store: options.store,
    fetchImpl: options.fetchImpl || fetch,
    businessId: options.businessId || "",
    shopName: prepared.shopName,
    resend: Boolean(payload.resend),
    log: options.log !== false,
  };
  const results = [];
  for (const item of prepared.messages) {
    results.push(await deliverOne(item, { ...ctxBase }));
  }
  return {
    ok: results.some((row) => row.ok),
    preview: false,
    results,
  };
}

const sqlStore = {
  async recent(businessId, dedupeKey) {
    await ensureDueWaTable();
    const rows = await query(
      `SELECT * FROM due_whatsapp_reminders
       WHERE business_id = ? AND dedupe_key = ?
       ORDER BY created_at DESC LIMIT 1`,
      [businessId, dedupeKey],
    );
    return rows[0] || null;
  },
  async insert(row) {
    await ensureDueWaTable();
    await query(
      `INSERT INTO due_whatsapp_reminders
       (id, business_id, customer_id, order_id, invoice_number, recipient, outstanding, message, status, provider_message_id, error, http_status, attempts, dedupe_key)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        row.id,
        row.business_id,
        row.customer_id,
        row.order_id || "",
        row.invoice_number || "",
        row.recipient || "",
        row.outstanding || 0,
        row.message || "",
        row.status || "pending",
        row.provider_message_id || null,
        row.error || null,
        row.http_status,
        row.attempts || 1,
        row.dedupe_key,
      ],
    );
  },
  async update(id, patch) {
    await query(
      `UPDATE due_whatsapp_reminders
       SET status=?, provider_message_id=?, error=?, http_status=?, attempts=?,
           sent_at=IF(? IN ('sent','queued','delivered'), CURRENT_TIMESTAMP(3), sent_at)
       WHERE id=? AND status NOT IN ('sent','delivered')`,
      [
        patch.status,
        patch.provider_message_id || null,
        patch.error || null,
        patch.http_status,
        patch.attempts || 1,
        patch.status,
        id,
      ],
    );
  },
};

async function shopNameFor(businessId) {
  try {
    const [co] = await query("SELECT name FROM company_settings WHERE business_id = ? LIMIT 1", [businessId]);
    if (co?.name) return String(co.name);
  } catch {
    /* company profile optional */
  }
  try {
    const [biz] = await query("SELECT name FROM businesses WHERE id = ? LIMIT 1", [businessId]);
    if (biz?.name) return String(biz.name);
  } catch {
    /* business name optional */
  }
  return "ATAV POS";
}

export async function loadOpenInvoices(businessId) {
  await ensureDueWaTable();
  try {
    return await query(
      `SELECT o.id, o.order_number, o.created_at, o.total,
              COALESCE(o.amount_paid,0) AS amount_paid,
              o.payment_method, o.payment_status, o.customer_id,
              c.name, c.business_name, c.mobile
       FROM sales_orders o
       JOIN customers c ON c.id = o.customer_id AND c.business_id = o.business_id
       WHERE o.business_id = ?
         AND LOWER(TRIM(COALESCE(o.status,'confirmed'))) <> 'cancelled'
         AND ${OPEN_REMAINDER_SQL} > 0.004
       ORDER BY c.business_name, c.name, o.created_at
       LIMIT 800`,
      [businessId],
    );
  } catch {
    return query(
      `SELECT o.id, o.order_number, o.created_at, o.total,
              o.payment_method, o.payment_status, o.customer_id,
              c.name, c.business_name, c.mobile
       FROM sales_orders o
       JOIN customers c ON c.id = o.customer_id AND c.business_id = o.business_id
       WHERE o.business_id = ?
         AND LOWER(TRIM(COALESCE(o.status,'confirmed'))) <> 'cancelled'
         AND LOWER(TRIM(COALESCE(o.payment_method,''))) = 'credit'
         AND LOWER(TRIM(COALESCE(o.payment_status,'paid'))) <> 'paid'
       ORDER BY c.business_name, c.name, o.created_at
       LIMIT 800`,
      [businessId],
    );
  }
}

async function latestReminders(businessId) {
  await ensureDueWaTable();
  try {
    return await query(
      `SELECT r.customer_id, r.order_id, r.status, r.provider_message_id, r.error, r.sent_at, r.created_at
       FROM due_whatsapp_reminders r
       JOIN (
         SELECT customer_id, order_id, MAX(created_at) AS created_at
         FROM due_whatsapp_reminders
         WHERE business_id = ?
         GROUP BY customer_id, order_id
       ) latest
         ON latest.customer_id = r.customer_id
        AND latest.order_id = r.order_id
        AND latest.created_at = r.created_at
       WHERE r.business_id = ?`,
      [businessId, businessId],
    );
  } catch {
    return [];
  }
}

function filtersFrom(query = {}) {
  return {
    customer: query.customer || "",
    from: query.from || "",
    to: query.to || "",
    status: query.status || "",
    overdue: query.overdue || "",
    min: query.min ?? "",
    max: query.max ?? "",
  };
}

export function registerDueReminders(app) {
  app.get("/api/customers/outstanding", requirePerm("customers"), async (req, res) => {
    try {
      const businessId = bid();
      const today = Due().istToday();
      const orders = await loadOpenInvoices(businessId);
      const reminders = await latestReminders(businessId);
      const byKey = new Map(reminders.map((row) => [`${row.customer_id}|${row.order_id || ""}`, row]));
      const totals = new Map(reminders.filter((row) => !row.order_id).map((row) => [row.customer_id, row]));
      const shaped = orders.map((order) => {
        const row = Due().shapeInvoice(order, byKey.get(`${order.customer_id}|${order.id}`) || null, today);
        row.totalWhatsappStatus = totals.get(order.customer_id)?.status || "";
        return row;
      });
      const rows = Due().filterOutstanding(shaped, filtersFrom(req.query), today);
      res.json({
        ok: true,
        shopName: await shopNameFor(businessId),
        today,
        rows,
        summary: Due().duesSummary(rows),
      });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  app.post("/api/customers/due-reminders", requirePerm("customers"), async (req, res) => {
    try {
      const businessId = bid();
      const body = req.body || {};
      const sends = Array.isArray(body.sends) ? body.sends : [];
      if (!sends.length) {
        res.status(400).json({ error: "Choose a customer or invoice" });
        return;
      }
      const [settings, invoices, shopName] = await Promise.all([
        loadAlertSettings(),
        loadOpenInvoices(businessId),
        shopNameFor(businessId),
      ]);
      const result = await sendDueReminders(body, {
        settings,
        invoices,
        shopName,
        businessId,
        store: sqlStore,
        today: Due().istToday(),
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });
}
