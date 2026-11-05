import crypto from "node:crypto";
import "../js/crm.js";
import { query } from "./db.js";
import { bid, branchId, authUser } from "./context.js";
import { requireStaff, requirePerm } from "./auth.js";
import { audit } from "./audit.js";
import { getPlatformSettings } from "./settings.js";
import { normalizeInMobile, sendWhatsApp, waCfg } from "./alerts.js";
import { loadMailbox, decryptSecret } from "./mail-box.js";
import { sendMail } from "./mail.js";

const CRM = globalThis.POSCRM;
let schemaReady = false;

async function ensureColumn(table, column, def) {
  const tables = await query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  if (!tables.length) return;
  const cols = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  if (cols.length) return;
  await query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${def}`);
}

function clip(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function id() {
  return crypto.randomUUID();
}

export async function ensureCrmSchema() {
  if (schemaReady) return;
  await ensureColumn("company_settings", "crm_enabled", "TINYINT(1) NOT NULL DEFAULT 0");
  const tables = [
    `CREATE TABLE IF NOT EXISTS crm_lead_sources (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) NOT NULL,
      name VARCHAR(80) NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_crm_source (business_id, name)
    )`,
    `CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) NOT NULL,
      stage_key VARCHAR(24) NOT NULL,
      label VARCHAR(80) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_won TINYINT(1) NOT NULL DEFAULT 0,
      is_lost TINYINT(1) NOT NULL DEFAULT 0,
      UNIQUE KEY uq_crm_stage (business_id, stage_key)
    )`,
    `CREATE TABLE IF NOT EXISTS crm_customer_segments (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) NOT NULL,
      name VARCHAR(80) NOT NULL,
      rule_json TEXT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_crm_segment (business_id, name)
    )`,
    `CREATE TABLE IF NOT EXISTS crm_customers (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) NOT NULL,
      branch_id VARCHAR(36) NULL,
      customer_id VARCHAR(36) NOT NULL,
      assigned_to VARCHAR(36) NULL,
      segment_id VARCHAR(36) NULL,
      source_id VARCHAR(36) NULL,
      sms_consent TINYINT(1) NOT NULL DEFAULT 0,
      email_consent TINYINT(1) NOT NULL DEFAULT 0,
      custom_json TEXT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_crm_customer (business_id, customer_id),
      INDEX (business_id, assigned_to)
    )`,
    `CREATE TABLE IF NOT EXISTS crm_leads (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) NOT NULL,
      branch_id VARCHAR(36) NULL,
      name VARCHAR(180) NOT NULL,
      mobile VARCHAR(32) NULL,
      email VARCHAR(160) NULL,
      company_name VARCHAR(180) NULL,
      gstin VARCHAR(32) NULL,
      source_id VARCHAR(36) NULL,
      stage VARCHAR(24) NOT NULL DEFAULT 'new',
      priority VARCHAR(16) NOT NULL DEFAULT 'normal',
      assigned_to VARCHAR(36) NULL,
      customer_id VARCHAR(36) NULL,
      expected_value DECIMAL(14,2) NOT NULL DEFAULT 0,
      notes VARCHAR(1000) NULL,
      custom_json TEXT NULL,
      next_followup DATE NULL,
      created_by VARCHAR(36) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX (business_id, stage),
      INDEX (business_id, assigned_to)
    )`,
    `CREATE TABLE IF NOT EXISTS crm_contacts (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) NOT NULL,
      customer_id VARCHAR(36) NULL,
      lead_id VARCHAR(36) NULL,
      name VARCHAR(180) NOT NULL,
      role_name VARCHAR(80) NULL,
      mobile VARCHAR(32) NULL,
      email VARCHAR(160) NULL,
      address VARCHAR(500) NULL,
      is_primary TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX (business_id, customer_id),
      INDEX (business_id, lead_id)
    )`,
    `CREATE TABLE IF NOT EXISTS crm_followups (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) NOT NULL,
      branch_id VARCHAR(36) NULL,
      customer_id VARCHAR(36) NULL,
      lead_id VARCHAR(36) NULL,
      assigned_to VARCHAR(36) NULL,
      kind VARCHAR(24) NOT NULL DEFAULT 'call',
      due_on DATE NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      note VARCHAR(500) NULL,
      completed_at TIMESTAMP(3) NULL,
      created_by VARCHAR(36) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX (business_id, due_on, status)
    )`,
    `CREATE TABLE IF NOT EXISTS crm_tasks (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) NOT NULL,
      branch_id VARCHAR(36) NULL,
      title VARCHAR(180) NOT NULL,
      assigned_to VARCHAR(36) NULL,
      customer_id VARCHAR(36) NULL,
      lead_id VARCHAR(36) NULL,
      due_on DATE NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'open',
      priority VARCHAR(16) NOT NULL DEFAULT 'normal',
      created_by VARCHAR(36) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX (business_id, assigned_to, status)
    )`,
    `CREATE TABLE IF NOT EXISTS crm_activities (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) NOT NULL,
      customer_id VARCHAR(36) NULL,
      lead_id VARCHAR(36) NULL,
      actor_id VARCHAR(36) NULL,
      kind VARCHAR(32) NOT NULL,
      summary VARCHAR(255) NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX (business_id, customer_id, created_at),
      INDEX (business_id, lead_id, created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS crm_notes (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) NOT NULL,
      customer_id VARCHAR(36) NULL,
      lead_id VARCHAR(36) NULL,
      author_id VARCHAR(36) NULL,
      body VARCHAR(2000) NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX (business_id, customer_id)
    )`,
    `CREATE TABLE IF NOT EXISTS crm_quotations (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) NOT NULL,
      customer_id VARCHAR(36) NULL,
      lead_id VARCHAR(36) NULL,
      quotation_id VARCHAR(36) NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_crm_quote (business_id, quotation_id)
    )`,
    `CREATE TABLE IF NOT EXISTS crm_communication_logs (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) NOT NULL,
      customer_id VARCHAR(36) NULL,
      lead_id VARCHAR(36) NULL,
      channel VARCHAR(16) NOT NULL,
      template_key VARCHAR(32) NULL,
      recipient VARCHAR(160) NOT NULL,
      body TEXT NULL,
      status VARCHAR(16) NOT NULL,
      error VARCHAR(255) NULL,
      attempts INT NOT NULL DEFAULT 0,
      dedupe_key VARCHAR(191) NULL,
      provider_message_id VARCHAR(128) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      sent_at TIMESTAMP(3) NULL,
      INDEX (business_id, dedupe_key),
      INDEX (business_id, customer_id, created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS crm_support_tickets (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) NOT NULL,
      branch_id VARCHAR(36) NULL,
      customer_id VARCHAR(36) NULL,
      subject VARCHAR(180) NOT NULL,
      body VARCHAR(2000) NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'open',
      priority VARCHAR(16) NOT NULL DEFAULT 'normal',
      assigned_to VARCHAR(36) NULL,
      created_by VARCHAR(36) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX (business_id, status)
    )`,
    `CREATE TABLE IF NOT EXISTS crm_reminders (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) NOT NULL,
      customer_id VARCHAR(36) NULL,
      assigned_to VARCHAR(36) NULL,
      kind VARCHAR(32) NOT NULL,
      due_on DATE NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      note VARCHAR(500) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX (business_id, due_on, status)
    )`,
    `CREATE TABLE IF NOT EXISTS crm_automations (
      id VARCHAR(36) PRIMARY KEY,
      business_id VARCHAR(36) NOT NULL,
      auto_key VARCHAR(32) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 0,
      channel VARCHAR(16) NOT NULL DEFAULT 'whatsapp',
      template TEXT NULL,
      wait_days INT NOT NULL DEFAULT 0,
      UNIQUE KEY uq_crm_auto (business_id, auto_key)
    )`,
  ];
  for (const sql of tables) await query(sql);
  schemaReady = true;
}

async function shopRow(businessId) {
  const rows = await query(
    `SELECT b.name, b.category, b.mobile, COALESCE(NULLIF(TRIM(s.phone), ''), b.mobile) AS phone, s.crm_enabled, s.timezone
     FROM businesses b LEFT JOIN company_settings s ON s.business_id = b.id WHERE b.id = ? LIMIT 1`,
    [businessId],
  );
  return rows[0] || {};
}

async function requireOn() {
  await ensureCrmSchema();
  const shop = await shopRow(bid());
  if (!CRM.flagOn(shop.crm_enabled)) {
    const err = new Error("Turn on Enable CRM in Business Settings before using CRM.");
    err.status = 403;
    throw err;
  }
  return shop;
}

function actorId() {
  return authUser()?.id || null;
}

function seesAll() {
  const role = String(authUser()?.role || "");
  return ["business_admin", "branch_manager", "manager", "accountant", "resort_owner"].includes(role);
}

async function seedBusiness(businessId) {
  const stages = await query("SELECT id FROM crm_pipeline_stages WHERE business_id = ? LIMIT 1", [businessId]);
  if (!stages.length) {
    for (const stage of CRM.STAGES) {
      await query(
        "INSERT INTO crm_pipeline_stages (id, business_id, stage_key, label, sort_order, is_won, is_lost) VALUES (?,?,?,?,?,?,?)",
        [id(), businessId, stage.key, stage.label, stage.sort, stage.won ? 1 : 0, stage.lost ? 1 : 0],
      );
    }
  }
  const sources = await query("SELECT id FROM crm_lead_sources WHERE business_id = ? LIMIT 1", [businessId]);
  if (!sources.length) {
    for (const name of CRM.SOURCES) {
      await query("INSERT INTO crm_lead_sources (id, business_id, name) VALUES (?,?,?)", [id(), businessId, name]);
    }
  }
  const segments = await query("SELECT id FROM crm_customer_segments WHERE business_id = ? LIMIT 1", [businessId]);
  if (!segments.length) {
    for (const name of ["Retail", "Wholesale", "VIP", "Inactive"]) {
      await query("INSERT INTO crm_customer_segments (id, business_id, name) VALUES (?,?,?)", [id(), businessId, name]);
    }
  }
  const autos = await query("SELECT id FROM crm_automations WHERE business_id = ? LIMIT 1", [businessId]);
  if (!autos.length) {
    for (const auto of CRM.AUTOMATIONS) {
      await query(
        "INSERT INTO crm_automations (id, business_id, auto_key, enabled, channel, template, wait_days) VALUES (?,?,?,0,?,?,?)",
        [id(), businessId, auto.key, auto.channel, auto.template, auto.days],
      );
    }
  }
}

async function activity(businessId, { customerId, leadId, kind, summary }) {
  await query(
    "INSERT INTO crm_activities (id, business_id, customer_id, lead_id, actor_id, kind, summary) VALUES (?,?,?,?,?,?,?)",
    [id(), businessId, customerId || null, leadId || null, actorId(), clip(kind, 32), clip(summary, 255)],
  );
}

async function linkProfile(businessId, customerId) {
  const existing = await query("SELECT id FROM crm_customers WHERE business_id = ? AND customer_id = ? LIMIT 1", [businessId, customerId]);
  if (existing[0]) return existing[0].id;
  const profileId = id();
  await query(
    "INSERT INTO crm_customers (id, business_id, branch_id, customer_id) VALUES (?,?,?,?)",
    [profileId, businessId, branchId(), customerId],
  );
  return profileId;
}

async function alreadySent(businessId, dedupeKey) {
  const rows = await query(
    "SELECT status, error FROM crm_communication_logs WHERE business_id = ? AND dedupe_key = ? ORDER BY created_at DESC LIMIT 1",
    [businessId, dedupeKey],
  );
  const row = rows[0];
  if (!row) return false;
  if (row.status === "sent" || row.status === "queued" || row.status === "skipped") return true;
  const fails = await query(
    "SELECT COUNT(*) AS n FROM crm_communication_logs WHERE business_id = ? AND dedupe_key = ? AND status = 'failed'",
    [businessId, dedupeKey],
  );
  if (Number(fails[0]?.n) >= 3) return true;
  return !/timeout|network|temporar|rate|429|503/i.test(String(row.error || ""));
}

async function deliver(businessId, { customer, channel, templateKey, body, dedupeKey, recipient }) {
  if (await alreadySent(businessId, dedupeKey)) return { ok: true, skipped: true };
  const person = customer || {};
  if (!CRM.allowsMessage({ ...person, sms_consent: person.sms_consent, email_consent: person.email_consent }, channel)) {
    await query(
      `INSERT INTO crm_communication_logs (id, business_id, customer_id, channel, template_key, recipient, body, status, error, attempts, dedupe_key)
       VALUES (?,?,?,?,?,?,?,'skipped','Customer has not consented',1,?)`,
      [id(), businessId, person.id || null, channel, templateKey, clip(recipient || person.mobile || person.email, 160), clip(body, 2000), dedupeKey],
    );
    return { ok: false, skipped: true, reason: "consent" };
  }
  let status = "failed";
  let error = "";
  let provider = "";
  if (channel === "whatsapp") {
    const settings = await getPlatformSettings();
    const sent = await sendWhatsApp(waCfg(settings), [recipient || person.mobile], body);
    status = sent.ok ? "sent" : "failed";
    error = sent.ok ? "" : clip(sent.reason || "WhatsApp was not sent", 255);
    provider = sent.ok ? clip(sent.results?.[0]?.id || sent.results?.[0]?.messageId || "", 128) : "";
  } else if (channel === "email") {
    try {
      const mailbox = await loadMailbox(businessId);
      const smtp = mailbox?.smtp_pass_enc && mailbox.from_email
        ? {
            host: mailbox.smtp_host,
            port: Number(mailbox.smtp_port) || 465,
            secure: Number(mailbox.smtp_secure) !== 0 && Number(mailbox.smtp_port || 465) !== 587,
            user: mailbox.smtp_user,
            pass: decryptSecret(mailbox.smtp_pass_enc),
            from: mailbox.from_email,
            fromName: mailbox.from_name || "Shop",
          }
        : null;
      const sent = await sendMail({ to: recipient || person.email, subject: "Message from your shop", text: body, html: `<p>${escapeHtml(body)}</p>`, smtp: smtp || undefined });
      status = sent.ok ? "sent" : "failed";
      error = sent.ok ? "" : clip(sent.error || "Email was not sent", 255);
    } catch (err) {
      status = "failed";
      error = clip(err.message, 255);
    }
  } else {
    status = "failed";
    error = "SMS provider is not configured";
  }
  const temporary = /timeout|network|temporar|rate|429|503/i.test(error);
  await query(
    `INSERT INTO crm_communication_logs (id, business_id, customer_id, channel, template_key, recipient, body, status, error, attempts, dedupe_key, provider_message_id, sent_at)
     VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?)`,
    [id(), businessId, person.id || null, channel, templateKey, clip(recipient || person.mobile || person.email, 160), clip(body, 4000), temporary && status === "failed" ? "failed" : status, error || null, dedupeKey, provider || null, status === "sent" ? new Date() : null],
  );
  return { ok: status === "sent", status, error };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function noteCrmCustomer(customer) {
  if (!customer?.id || !customer?.business_id) return;
  await ensureCrmSchema();
  await seedBusiness(customer.business_id);
  await linkProfile(customer.business_id, customer.id);
  const shop = await shopRow(customer.business_id);
  if (!CRM.flagOn(shop.crm_enabled)) return;
  const [auto] = await query("SELECT * FROM crm_automations WHERE business_id = ? AND auto_key = 'welcome' LIMIT 1", [customer.business_id]);
  if (!auto || !CRM.flagOn(auto.enabled)) return;
  const body = CRM.renderTemplate(auto.template, { name: customer.name || "Customer", shop: shop.name || "Shop" });
  await deliver(customer.business_id, {
    customer,
    channel: auto.channel || "whatsapp",
    templateKey: "welcome",
    body,
    dedupeKey: `welcome:${customer.id}`,
    recipient: customer.mobile,
  });
}

async function runBusiness(businessId) {
  await seedBusiness(businessId);
  const shop = await shopRow(businessId);
  if (!CRM.flagOn(shop.crm_enabled)) return { sent: 0, skipped: 0 };
  const autos = await query("SELECT * FROM crm_automations WHERE business_id = ? AND enabled = 1", [businessId]);
  const byKey = Object.fromEntries(autos.map((row) => [row.auto_key, row]));
  const today = CRM.todayYmd();
  let sent = 0;
  let skipped = 0;
  const bump = (result) => {
    if (result?.ok) sent += 1;
    else skipped += 1;
  };
  if (byKey.birthday) {
    const rows = await query(
      "SELECT id, name, mobile, email, whatsapp_consent, whatsapp_opt_out, dob FROM customers WHERE business_id = ? AND dob IS NOT NULL AND status <> 'merged' LIMIT 300",
      [businessId],
    );
    for (const row of rows) {
      if (String(row.dob).slice(5, 10) !== today.slice(5, 10)) continue;
      const profile = await query("SELECT sms_consent, email_consent FROM crm_customers WHERE business_id = ? AND customer_id = ? LIMIT 1", [businessId, row.id]);
      bump(await deliver(businessId, {
        customer: { ...row, ...profile[0] },
        channel: byKey.birthday.channel,
        templateKey: "birthday",
        body: CRM.renderTemplate(byKey.birthday.template, { name: row.name, shop: shop.name || "Shop" }),
        dedupeKey: `birthday:${row.id}:${today.slice(0, 4)}`,
        recipient: row.mobile,
      }));
    }
  }
  if (byKey.payment) {
    const rows = await query(
      "SELECT id, name, mobile, email, whatsapp_consent, whatsapp_opt_out, outstanding FROM customers WHERE business_id = ? AND outstanding > 0.5 AND status <> 'merged' LIMIT 80",
      [businessId],
    );
    for (const row of rows) {
      const profile = await query("SELECT sms_consent, email_consent FROM crm_customers WHERE business_id = ? AND customer_id = ? LIMIT 1", [businessId, row.id]);
      bump(await deliver(businessId, {
        customer: { ...row, ...profile[0] },
        channel: byKey.payment.channel,
        templateKey: "payment",
        body: CRM.renderTemplate(byKey.payment.template, { name: row.name, shop: shop.name || "Shop", due: CRM.inr(row.outstanding) }),
        dedupeKey: `payment:${row.id}:${today}`,
        recipient: row.mobile,
      }));
    }
  }
  if (byKey.quotation) {
    const rows = await query(
      `SELECT q.id, q.quotation_number, q.total, q.valid_until, q.customer_id, c.name, c.mobile, c.email, c.whatsapp_consent, c.whatsapp_opt_out
       FROM quotations q JOIN customers c ON c.id = q.customer_id AND c.business_id = q.business_id
       WHERE q.business_id = ? AND q.status = 'sent' AND q.quotation_date <= DATE_SUB(?, INTERVAL ? DAY) LIMIT 40`,
      [businessId, today, Math.max(0, Number(byKey.quotation.wait_days) || 0)],
    );
    for (const row of rows) {
      bump(await deliver(businessId, {
        customer: row.customer_id ? { id: row.customer_id, name: row.name, mobile: row.mobile, email: row.email, whatsapp_consent: row.whatsapp_consent, whatsapp_opt_out: row.whatsapp_opt_out } : null,
        channel: byKey.quotation.channel,
        templateKey: "quotation",
        body: CRM.renderTemplate(byKey.quotation.template, { name: row.name, shop: shop.name || "Shop", number: row.quotation_number, valid: CRM.ymd(row.valid_until) || "the printed date", total: CRM.inr(row.total) }),
        dedupeKey: `quotation:${row.id}`,
        recipient: row.mobile,
      }));
    }
  }
  if (byKey.revisit) {
    const days = Math.max(1, Number(byKey.revisit.wait_days) || 30);
    const rows = await query(
      `SELECT c.id, c.name, c.mobile, c.email, c.whatsapp_consent, c.whatsapp_opt_out, MAX(o.created_at) AS last_sale
       FROM customers c JOIN sales_orders o ON o.customer_id = c.id AND o.business_id = c.business_id
       WHERE c.business_id = ? AND c.status <> 'merged'
       GROUP BY c.id, c.name, c.mobile, c.email, c.whatsapp_consent, c.whatsapp_opt_out
       HAVING MAX(o.created_at) < DATE_SUB(?, INTERVAL ? DAY) LIMIT 40`,
      [businessId, today, days],
    );
    for (const row of rows) {
      bump(await deliver(businessId, {
        customer: row,
        channel: byKey.revisit.channel,
        templateKey: "revisit",
        body: CRM.renderTemplate(byKey.revisit.template, { name: row.name, shop: shop.name || "Shop" }),
        dedupeKey: `revisit:${row.id}:${today.slice(0, 7)}`,
        recipient: row.mobile,
      }));
    }
  }
  if (byKey.daily && shop.mobile) {
    const [sum] = await query(
      "SELECT COUNT(*) AS bills, COALESCE(SUM(total),0) AS total FROM sales_orders WHERE business_id = ? AND DATE(created_at) = ?",
      [businessId, today],
    );
    const owner = { id: "", name: "Owner", mobile: shop.phone || shop.mobile, whatsapp_consent: 1, whatsapp_opt_out: 0 };
    bump(await deliver(businessId, {
      customer: owner,
      channel: "whatsapp",
      templateKey: "daily",
      body: CRM.renderTemplate(byKey.daily.template, { shop: shop.name || "Shop", total: CRM.inr(sum?.total), count: sum?.bills || 0 }),
      dedupeKey: `daily:${businessId}:${today}`,
      recipient: owner.mobile,
    }));
  }
  return { sent, skipped };
}

export async function runCrmAutomations() {
  await ensureCrmSchema();
  const shops = await query(
    "SELECT business_id FROM company_settings WHERE crm_enabled = 1 LIMIT 100",
  );
  let sent = 0;
  let skipped = 0;
  for (const shop of shops) {
    try {
      const result = await runBusiness(shop.business_id);
      sent += result.sent;
      skipped += result.skipped;
    } catch (err) {
      console.error("crm automation:", err.message);
    }
  }
  return { shops: shops.length, sent, skipped };
}

function staffScope(sql, params, column = "assigned_to") {
  if (seesAll()) return { sql, params };
  const me = actorId();
  return { sql: `${sql} AND (${column} = ? OR ${column} IS NULL OR created_by = ?)`, params: [...params, me, me] };
}

export function registerCrm(app) {
  app.get("/api/crm/bootstrap", requireStaff, requirePerm("customers"), async (_req, res) => {
    try {
      const shop = await requireOn();
      await seedBusiness(bid());
      const [sources, stages, segments, automations, staff] = await Promise.all([
        query("SELECT id, name FROM crm_lead_sources WHERE business_id = ? AND active = 1 ORDER BY name", [bid()]),
        query("SELECT stage_key AS `key`, label, sort_order, is_won, is_lost FROM crm_pipeline_stages WHERE business_id = ? ORDER BY sort_order", [bid()]),
        query("SELECT id, name FROM crm_customer_segments WHERE business_id = ? ORDER BY name", [bid()]),
        query("SELECT auto_key AS `key`, enabled, channel, template, wait_days FROM crm_automations WHERE business_id = ? ORDER BY auto_key", [bid()]),
        query("SELECT id, name, role FROM staff_users WHERE business_id = ? ORDER BY name LIMIT 200", [bid()]).catch(() => []),
      ]);
      const customers = await query("SELECT id, outstanding FROM customers WHERE business_id = ? AND COALESCE(status,'') <> 'merged' AND merged_into IS NULL", [bid()]);
      const leads = await query("SELECT stage FROM crm_leads WHERE business_id = ?", [bid()]);
      const followups = await query("SELECT status, due_on FROM crm_followups WHERE business_id = ?", [bid()]);
      const tasks = await query("SELECT status FROM crm_tasks WHERE business_id = ?", [bid()]);
      res.json({
        shop: shop.name || "",
        category: CRM.categoryKey(shop.category),
        fields: CRM.fieldsFor(shop.category),
        sources,
        stages,
        segments,
        automations,
        staff,
        kpis: CRM.summarize({ customers, leads, followups, tasks }),
      });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.get("/api/crm/leads", requireStaff, requirePerm("customers"), async (req, res) => {
    try {
      await requireOn();
      const q = `%${clip(req.query.q, 80)}%`;
      const stage = clip(req.query.stage, 24);
      let sql = "SELECT * FROM crm_leads WHERE business_id = ?";
      const params = [bid()];
      if (stage) {
        sql += " AND stage = ?";
        params.push(stage);
      }
      if (clip(req.query.q, 80)) {
        sql += " AND (name LIKE ? OR mobile LIKE ? OR company_name LIKE ?)";
        params.push(q, q, q);
      }
      const scoped = staffScope(sql, params);
      const rows = await query(`${scoped.sql} ORDER BY updated_at DESC LIMIT 300`, scoped.params);
      res.json({ leads: rows });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/crm/leads", requireStaff, requirePerm("customers"), async (req, res) => {
    try {
      const shop = await requireOn();
      const body = req.body || {};
      const name = clip(body.name, 180);
      if (!name) {
        res.status(400).json({ error: "Enter the lead name" });
        return;
      }
      const leadId = id();
      await query(
        `INSERT INTO crm_leads (id, business_id, branch_id, name, mobile, email, company_name, gstin, source_id, stage, priority, assigned_to, expected_value, notes, custom_json, next_followup, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          leadId, bid(), branchId(), name, clip(body.mobile, 32) || null, clip(body.email, 160) || null, clip(body.company_name, 180) || null,
          clip(body.gstin, 32) || null, clip(body.source_id, 36) || null, CRM.stageOf(body.stage).key, CRM.priorityOf(body.priority),
          clip(body.assigned_to, 36) || null, Number(body.expected_value) || 0, clip(body.notes, 1000) || null,
          JSON.stringify(CRM.customValues(body.custom || {}, shop.category)), CRM.ymd(body.next_followup) || null, actorId(),
        ],
      );
      await activity(bid(), { leadId, kind: "lead", summary: `Lead ${name} created` });
      await audit("CRM Lead Created", { module: "crm", target_id: leadId, target_name: name }, req);
      const [lead] = await query("SELECT * FROM crm_leads WHERE id = ? AND business_id = ?", [leadId, bid()]);
      res.json({ ok: true, lead });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/crm/leads/:id/stage", requireStaff, requirePerm("customers"), async (req, res) => {
    try {
      await requireOn();
      const stage = CRM.stageOf(req.body?.stage).key;
      const result = await query("UPDATE crm_leads SET stage = ? WHERE id = ? AND business_id = ?", [stage, req.params.id, bid()]);
      if (!result.affectedRows) {
        res.status(404).json({ error: "Lead not found" });
        return;
      }
      await activity(bid(), { leadId: req.params.id, kind: "stage", summary: `Moved to ${CRM.stageOf(stage).label}` });
      res.json({ ok: true, stage });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/crm/leads/:id/convert", requireStaff, requirePerm("customers"), async (req, res) => {
    try {
      await requireOn();
      const [lead] = await query("SELECT * FROM crm_leads WHERE id = ? AND business_id = ?", [req.params.id, bid()]);
      if (!lead) {
        res.status(404).json({ error: "Lead not found" });
        return;
      }
      if (lead.customer_id) {
        res.json({ ok: true, customerId: lead.customer_id, linked: true });
        return;
      }
      const customers = await query("SELECT id, name, mobile, mobile_norm, email, email_norm, gstin, gstin_norm FROM customers WHERE business_id = ? AND COALESCE(status,'') <> 'merged'", [bid()]);
      const match = CRM.sameCustomer(customers, lead);
      let customerId = match?.id || "";
      if (!customerId) {
        if (!normalizeInMobile(lead.mobile) && !clip(lead.mobile, 32)) {
          res.status(400).json({ error: "Add a mobile number before converting this lead" });
          return;
        }
        customerId = id();
        const count = await query("SELECT COUNT(*) AS n FROM customers WHERE business_id = ?", [bid()]);
        const code = `CUS-${String((Number(count[0]?.n) || 0) + 1).padStart(3, "0")}`;
        await query(
          `INSERT INTO customers (id, code, name, business_name, mobile, type, gstin, credit_limit, outstanding, business_id)
           VALUES (?,?,?,?,?,'b2c',?,0,0,?)`,
          [customerId, code, lead.name, lead.company_name, clip(lead.mobile, 32), lead.gstin, bid()],
        );
        if (lead.email) {
          await query("UPDATE customers SET email = ? WHERE id = ? AND business_id = ?", [lead.email, customerId, bid()]).catch(() => {});
        }
      }
      await linkProfile(bid(), customerId);
      await query("UPDATE crm_leads SET stage = 'converted', customer_id = ? WHERE id = ? AND business_id = ?", [customerId, lead.id, bid()]);
      await activity(bid(), { customerId, leadId: lead.id, kind: "convert", summary: `Lead ${lead.name} linked to the customer master` });
      await audit("CRM Lead Converted", { module: "crm", target_id: lead.id, target_name: lead.name }, req);
      res.json({ ok: true, customerId, linked: Boolean(match) });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.get("/api/crm/customers", requireStaff, requirePerm("customers"), async (req, res) => {
    try {
      await requireOn();
      const q = `%${clip(req.query.q, 80)}%`;
      let sql = `SELECT c.id, c.code, c.name, c.business_name, c.mobile, c.email, c.gstin, c.outstanding, c.credit_limit, c.dob, c.address,
                        p.assigned_to, p.segment_id, p.sms_consent, p.email_consent, c.whatsapp_consent, c.whatsapp_opt_out, p.custom_json
                 FROM customers c LEFT JOIN crm_customers p ON p.customer_id = c.id AND p.business_id = c.business_id
                 WHERE c.business_id = ? AND COALESCE(c.status,'') <> 'merged' AND c.merged_into IS NULL`;
      const params = [bid()];
      if (clip(req.query.q, 80)) {
        sql += " AND (c.name LIKE ? OR c.mobile LIKE ? OR c.business_name LIKE ?)";
        params.push(q, q, q);
      }
      const rows = await query(`${sql} ORDER BY c.name LIMIT 300`, params);
      res.json({ customers: rows });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.get("/api/crm/customers/:id", requireStaff, requirePerm("customers"), async (req, res) => {
    try {
      const shop = await requireOn();
      const [customer] = await query("SELECT * FROM customers WHERE id = ? AND business_id = ? LIMIT 1", [req.params.id, bid()]);
      if (!customer || customer.merged_into) {
        res.status(404).json({ error: "Customer not found" });
        return;
      }
      await linkProfile(bid(), customer.id);
      const [profile] = await query("SELECT * FROM crm_customers WHERE business_id = ? AND customer_id = ?", [bid(), customer.id]);
      const [orders, quotes, contacts, notes, followups, tickets, logs, lines] = await Promise.all([
        query("SELECT id, order_number, total, amount_paid, payment_status, created_at FROM sales_orders WHERE business_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT 20", [bid(), customer.id]).catch(() => []),
        query("SELECT id, quotation_number, status, total, valid_until, quotation_date FROM quotations WHERE business_id = ? AND customer_id = ? ORDER BY quotation_date DESC LIMIT 20", [bid(), customer.id]).catch(() => []),
        query("SELECT * FROM crm_contacts WHERE business_id = ? AND customer_id = ? ORDER BY is_primary DESC, name", [bid(), customer.id]),
        query("SELECT * FROM crm_notes WHERE business_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT 30", [bid(), customer.id]),
        query("SELECT * FROM crm_followups WHERE business_id = ? AND customer_id = ? ORDER BY due_on DESC LIMIT 30", [bid(), customer.id]),
        query("SELECT * FROM crm_support_tickets WHERE business_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT 20", [bid(), customer.id]),
        query("SELECT channel, template_key, status, error, body, created_at FROM crm_communication_logs WHERE business_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT 30", [bid(), customer.id]),
        query("SELECT l.item_name, l.quantity, l.line_total, o.created_at FROM sales_order_lines l JOIN sales_orders o ON o.id = l.order_id WHERE l.business_id = ? AND o.customer_id = ? ORDER BY o.created_at DESC LIMIT 20", [bid(), customer.id]).catch(() => []),
      ]);
      let loyalty = null;
      try {
        const [row] = await query("SELECT points_balance, tier, lifetime_spend FROM loyalty_accounts WHERE business_id = ? AND customer_id = ? LIMIT 1", [bid(), customer.id]);
        loyalty = row || null;
      } catch {
        loyalty = null;
      }
      const lifetime = orders.reduce((sum, row) => sum + Number(row.total || 0), 0);
      res.json({
        customer,
        profile: { ...profile, custom: safeJson(profile?.custom_json) },
        fields: CRM.fieldsFor(shop.category),
        lifetime: Math.round(lifetime * 100) / 100,
        lastPurchase: orders[0]?.created_at || null,
        orders,
        quotes,
        lines,
        contacts,
        notes,
        followups,
        tickets,
        logs,
        loyalty,
      });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/crm/customers/:id", requireStaff, requirePerm("customers"), async (req, res) => {
    try {
      const shop = await requireOn();
      const [customer] = await query("SELECT id FROM customers WHERE id = ? AND business_id = ?", [req.params.id, bid()]);
      if (!customer) {
        res.status(404).json({ error: "Customer not found" });
        return;
      }
      await linkProfile(bid(), customer.id);
      const body = req.body || {};
      const custom = JSON.stringify(CRM.customValues(body.custom || {}, shop.category));
      await query(
        "UPDATE crm_customers SET assigned_to = ?, segment_id = ?, sms_consent = ?, email_consent = ?, custom_json = ? WHERE business_id = ? AND customer_id = ?",
        [clip(body.assigned_to, 36) || null, clip(body.segment_id, 36) || null, body.sms_consent ? 1 : 0, body.email_consent ? 1 : 0, custom, bid(), customer.id],
      );
      if (Object.prototype.hasOwnProperty.call(body, "whatsapp_consent") || Object.prototype.hasOwnProperty.call(body, "whatsapp_opt_out")) {
        await query(
          "UPDATE customers SET whatsapp_consent = ?, whatsapp_opt_out = ? WHERE id = ? AND business_id = ?",
          [body.whatsapp_consent ? 1 : 0, body.whatsapp_opt_out ? 1 : 0, customer.id, bid()],
        ).catch(() => {});
      }
      await activity(bid(), { customerId: customer.id, kind: "profile", summary: "Customer CRM profile updated" });
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/crm/contacts", requireStaff, requirePerm("customers"), async (req, res) => {
    try {
      await requireOn();
      const body = req.body || {};
      const name = clip(body.name, 180);
      if (!name || (!body.customer_id && !body.lead_id)) {
        res.status(400).json({ error: "Enter a contact name and choose a customer or lead" });
        return;
      }
      const contactId = id();
      await query(
        "INSERT INTO crm_contacts (id, business_id, customer_id, lead_id, name, role_name, mobile, email, address, is_primary) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [contactId, bid(), clip(body.customer_id, 36) || null, clip(body.lead_id, 36) || null, name, clip(body.role_name, 80) || null, clip(body.mobile, 32) || null, clip(body.email, 160) || null, clip(body.address, 500) || null, body.is_primary ? 1 : 0],
      );
      res.json({ ok: true, id: contactId });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.get("/api/crm/followups", requireStaff, requirePerm("customers"), async (_req, res) => {
    try {
      await requireOn();
      const scoped = staffScope("SELECT * FROM crm_followups WHERE business_id = ?", [bid()]);
      const rows = await query(`${scoped.sql} ORDER BY due_on ASC LIMIT 300`, scoped.params);
      res.json({ followups: rows.map((row) => ({ ...row, state: CRM.followupState(row) })) });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/crm/followups", requireStaff, requirePerm("customers"), async (req, res) => {
    try {
      await requireOn();
      const body = req.body || {};
      const due = CRM.ymd(body.due_on);
      if (!due) {
        res.status(400).json({ error: "Choose a follow-up date" });
        return;
      }
      const followId = id();
      await query(
        "INSERT INTO crm_followups (id, business_id, branch_id, customer_id, lead_id, assigned_to, kind, due_on, note, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [followId, bid(), branchId(), clip(body.customer_id, 36) || null, clip(body.lead_id, 36) || null, clip(body.assigned_to, 36) || actorId(), clip(body.kind, 24) || "call", due, clip(body.note, 500) || null, actorId()],
      );
      await query(
        "INSERT INTO crm_reminders (id, business_id, customer_id, assigned_to, kind, due_on, note) VALUES (?,?,?,?,?,?,?)",
        [id(), bid(), clip(body.customer_id, 36) || null, clip(body.assigned_to, 36) || actorId(), clip(body.kind, 24) || "call", due, clip(body.note, 500) || null],
      );
      res.json({ ok: true, id: followId });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/crm/followups/:id/done", requireStaff, requirePerm("customers"), async (req, res) => {
    try {
      await requireOn();
      const result = await query("UPDATE crm_followups SET status = 'done', completed_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND business_id = ?", [req.params.id, bid()]);
      if (!result.affectedRows) {
        res.status(404).json({ error: "Follow-up not found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.get("/api/crm/tasks", requireStaff, requirePerm("customers"), async (_req, res) => {
    try {
      await requireOn();
      const scoped = staffScope("SELECT * FROM crm_tasks WHERE business_id = ?", [bid()]);
      res.json({ tasks: await query(`${scoped.sql} ORDER BY due_on IS NULL, due_on ASC LIMIT 300`, scoped.params) });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/crm/tasks", requireStaff, requirePerm("customers"), async (req, res) => {
    try {
      await requireOn();
      const title = clip(req.body?.title, 180);
      if (!title) {
        res.status(400).json({ error: "Enter a task" });
        return;
      }
      const taskId = id();
      await query(
        "INSERT INTO crm_tasks (id, business_id, branch_id, title, assigned_to, customer_id, lead_id, due_on, priority, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [taskId, bid(), branchId(), title, clip(req.body?.assigned_to, 36) || actorId(), clip(req.body?.customer_id, 36) || null, clip(req.body?.lead_id, 36) || null, CRM.ymd(req.body?.due_on) || null, CRM.priorityOf(req.body?.priority), actorId()],
      );
      res.json({ ok: true, id: taskId });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/crm/tasks/:id/done", requireStaff, requirePerm("customers"), async (req, res) => {
    try {
      await requireOn();
      const result = await query("UPDATE crm_tasks SET status = 'done' WHERE id = ? AND business_id = ?", [req.params.id, bid()]);
      if (!result.affectedRows) {
        res.status(404).json({ error: "Task not found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.get("/api/crm/tickets", requireStaff, requirePerm("customers"), async (_req, res) => {
    try {
      await requireOn();
      res.json({ tickets: await query("SELECT * FROM crm_support_tickets WHERE business_id = ? ORDER BY created_at DESC LIMIT 200", [bid()]) });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/crm/tickets", requireStaff, requirePerm("customers"), async (req, res) => {
    try {
      await requireOn();
      const subject = clip(req.body?.subject, 180);
      if (!subject) {
        res.status(400).json({ error: "Enter the complaint or request" });
        return;
      }
      const ticketId = id();
      await query(
        "INSERT INTO crm_support_tickets (id, business_id, branch_id, customer_id, subject, body, priority, assigned_to, created_by) VALUES (?,?,?,?,?,?,?,?,?)",
        [ticketId, bid(), branchId(), clip(req.body?.customer_id, 36) || null, subject, clip(req.body?.body, 2000) || null, CRM.priorityOf(req.body?.priority), clip(req.body?.assigned_to, 36) || null, actorId()],
      );
      await activity(bid(), { customerId: req.body?.customer_id, kind: "ticket", summary: subject });
      res.json({ ok: true, id: ticketId });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/crm/tickets/:id/status", requireStaff, requirePerm("customers"), async (req, res) => {
    try {
      await requireOn();
      const status = ["open", "pending", "resolved"].includes(req.body?.status) ? req.body.status : "open";
      const result = await query("UPDATE crm_support_tickets SET status = ? WHERE id = ? AND business_id = ?", [status, req.params.id, bid()]);
      if (!result.affectedRows) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }
      res.json({ ok: true, status });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/crm/notes", requireStaff, requirePerm("customers"), async (req, res) => {
    try {
      await requireOn();
      const body = clip(req.body?.body, 2000);
      if (!body) {
        res.status(400).json({ error: "Write a note" });
        return;
      }
      await query(
        "INSERT INTO crm_notes (id, business_id, customer_id, lead_id, author_id, body) VALUES (?,?,?,?,?,?)",
        [id(), bid(), clip(req.body?.customer_id, 36) || null, clip(req.body?.lead_id, 36) || null, actorId(), body],
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/crm/automations", requireStaff, requirePerm("settings"), async (req, res) => {
    try {
      await requireOn();
      await seedBusiness(bid());
      const items = Array.isArray(req.body?.automations) ? req.body.automations : [];
      for (const item of items) {
        const known = CRM.AUTOMATIONS.find((auto) => auto.key === item.key);
        if (!known) continue;
        await query(
          "UPDATE crm_automations SET enabled = ?, channel = ?, template = ?, wait_days = ? WHERE business_id = ? AND auto_key = ?",
          [item.enabled ? 1 : 0, ["whatsapp", "sms", "email"].includes(item.channel) ? item.channel : known.channel, clip(item.template, 1000) || known.template, Math.max(0, Math.min(365, Number(item.days) || known.days)), bid(), known.key],
        );
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/crm/automations/run", requireStaff, requirePerm("settings"), async (_req, res) => {
    try {
      await requireOn();
      res.json({ ok: true, ...(await runBusiness(bid())) });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/crm/message", requireStaff, requirePerm("customers"), async (req, res) => {
    try {
      await requireOn();
      const [customer] = await query("SELECT * FROM customers WHERE id = ? AND business_id = ?", [req.body?.customer_id, bid()]);
      if (!customer) {
        res.status(404).json({ error: "Customer not found" });
        return;
      }
      const [profile] = await query("SELECT sms_consent, email_consent FROM crm_customers WHERE business_id = ? AND customer_id = ?", [bid(), customer.id]);
      const channel = ["whatsapp", "sms", "email"].includes(req.body?.channel) ? req.body.channel : "whatsapp";
      const body = clip(req.body?.body, 1000);
      if (!body) {
        res.status(400).json({ error: "Write the message" });
        return;
      }
      const result = await deliver(bid(), {
        customer: { ...customer, ...profile?.[0] },
        channel,
        templateKey: "manual",
        body,
        dedupeKey: `manual:${customer.id}:${Date.now()}`,
        recipient: channel === "email" ? customer.email : customer.mobile,
      });
      res.json({ ok: Boolean(result.ok), ...result });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });
}

function safeJson(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
