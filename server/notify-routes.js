import crypto from "node:crypto";
import { query } from "./db.js";
import {
  loadAlertSettings,
  waCfg,
  sendWhatsAppOne,
  saveDashboardNotification,
  sanitizeNoticeImage,
  logAlertDeliveries,
} from "./alerts.js";
import {
  notifyChannels,
  notifyAudience,
  audienceMatch,
  fillNotifyVars,
  composeWhatsAppBody,
  safeHttpsUrl,
  classifyRecipient,
  waAcceptanceStatus,
  normalizeOwnerMobile,
} from "./notify-campaigns.js";

function istParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
}

function istDay() {
  const p = istParts();
  return `${p.year}-${p.month}-${p.day}`;
}

function istStamp() {
  const p = istParts();
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function asText(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return value == null ? "" : String(value);
}

async function ensureNotifySchema() {
  await query(
    `CREATE TABLE IF NOT EXISTS notify_campaigns (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      title VARCHAR(180) NOT NULL,
      body TEXT NULL,
      template_key VARCHAR(64) NOT NULL DEFAULT '',
      image_url MEDIUMTEXT NULL,
      document_url VARCHAR(500) NOT NULL DEFAULT '',
      link_url VARCHAR(500) NOT NULL DEFAULT '',
      audience VARCHAR(32) NOT NULL,
      audience_json TEXT NULL,
      channels VARCHAR(64) NOT NULL,
      status VARCHAR(24) NOT NULL,
      scheduled_at DATETIME NULL,
      last_error VARCHAR(255) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX (status)
    )`,
  );
  await query(
    `CREATE TABLE IF NOT EXISTS notify_recipients (
      id VARCHAR(64) PRIMARY KEY,
      campaign_id VARCHAR(64) NOT NULL,
      business_id VARCHAR(64) NOT NULL,
      business_name VARCHAR(180) NOT NULL DEFAULT '',
      owner_name VARCHAR(180) NOT NULL DEFAULT '',
      mobile VARCHAR(20) NOT NULL DEFAULT '',
      plan_name VARCHAR(120) NOT NULL DEFAULT '',
      expiry_date VARCHAR(16) NOT NULL DEFAULT '',
      wa_status VARCHAR(16) NOT NULL DEFAULT 'skipped',
      wa_error VARCHAR(255) NOT NULL DEFAULT '',
      app_status VARCHAR(16) NOT NULL DEFAULT 'skipped',
      push_status VARCHAR(16) NOT NULL DEFAULT 'skipped',
      notification_id VARCHAR(64) NOT NULL DEFAULT '',
      dedupe_key VARCHAR(80) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_campaign_dedupe (campaign_id, dedupe_key),
      INDEX (campaign_id),
      INDEX (notification_id)
    )`,
  );
  await query("ALTER TABLE businesses ADD COLUMN whatsapp_consent TINYINT(1) NOT NULL DEFAULT 0").catch(() => {});
  await query("ALTER TABLE businesses ADD COLUMN whatsapp_opt_out TINYINT(1) NOT NULL DEFAULT 0").catch(() => {});
}

async function listBusinesses() {
  await ensureNotifySchema();
  try {
    return await query(
      `SELECT b.id, b.name, b.owner_name, b.mobile, b.category, b.business_type, b.status,
              DATE_FORMAT(b.subscription_expires_at, '%Y-%m-%d') AS subscription_expires_at,
              COALESCE(b.whatsapp_consent,0) AS whatsapp_consent, COALESCE(b.whatsapp_opt_out,0) AS whatsapp_opt_out,
              COALESCE(p.name,'') AS plan_name
       FROM businesses b
       LEFT JOIN subscription_plans p ON p.id = b.plan_id
       ORDER BY b.name
       LIMIT 2000`,
    );
  } catch {
    return query(
      `SELECT id, name, owner_name, mobile, category, business_type, status,
              DATE_FORMAT(subscription_expires_at, '%Y-%m-%d') AS subscription_expires_at,
              0 AS whatsapp_consent, 0 AS whatsapp_opt_out, '' AS plan_name
       FROM businesses ORDER BY name LIMIT 2000`,
    );
  }
}

function idList(raw) {
  const list = Array.isArray(raw) ? raw : String(raw || "").split(",");
  const out = [];
  for (const id of list) {
    const value = String(id || "").trim();
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

function targets(input, businesses) {
  const audience = notifyAudience(input.audience || "all");
  if (!audience) throw new Error("Choose a target audience");
  const channels = notifyChannels(input.channels ?? "all");
  if (!channels.length) throw new Error("Choose at least one channel");
  const ids = idList(input.business_ids ?? input.business_id ?? "");
  if (audience === "one" && ids.length !== 1) throw new Error("Choose one business");
  if (audience === "selected" && !ids.length) throw new Error("Choose at least one business");
  const category = String(input.category || "").trim();
  const today = istDay();
  const seen = new Set();
  const rows = [];
  for (const biz of businesses) {
    if (!audienceMatch(biz, audience, { ids, category, today })) continue;
    const row = {
      id: biz.id,
      name: biz.name || "",
      owner_name: biz.owner_name || "",
      mobile: biz.mobile || "",
      plan_name: biz.plan_name || "",
      subscription_expires_at: String(biz.subscription_expires_at || "").slice(0, 10),
      whatsapp_consent: biz.whatsapp_consent,
      whatsapp_opt_out: biz.whatsapp_opt_out,
      category: biz.category,
      business_type: biz.business_type,
      status: biz.status,
    };
    rows.push({ ...row, class: classifyRecipient(row, { channels, seenMobiles: seen }) });
  }
  return { audience, channels, rows, category };
}

function summary(rows) {
  const sum = { total: rows.length, whatsapp: 0, skipped: 0, missing: 0, invalid: 0, opt_out: 0, no_consent: 0, duplicate: 0 };
  for (const row of rows) {
    const reason = row.class?.waReason || "";
    if (row.class?.wa === "pending") sum.whatsapp += 1;
    else sum.skipped += 1;
    if (reason === "missing-mobile") sum.missing += 1;
    if (reason === "invalid-mobile") sum.invalid += 1;
    if (reason === "opt-out") sum.opt_out += 1;
    if (reason === "no-consent") sum.no_consent += 1;
    if (reason === "duplicate") sum.duplicate += 1;
  }
  return sum;
}

function blankCounts() {
  return { sent: 0, delivered: 0, read: 0, failed: 0, pending: 0, skipped: 0, cancelled: 0 };
}

async function countsFor(campaignId) {
  const rows = await query("SELECT wa_status, app_status, push_status FROM notify_recipients WHERE campaign_id = ?", [campaignId]);
  const out = { total: rows.length, whatsapp: blankCounts(), in_app: blankCounts(), push: blankCounts() };
  for (const row of rows) {
    for (const [col, key] of [["wa_status", "whatsapp"], ["app_status", "in_app"], ["push_status", "push"]]) {
      const st = row[col] || "skipped";
      if (out[key][st] == null) out[key][st] = 0;
      out[key][st] += 1;
    }
  }
  return out;
}

function publicCampaign(row, counts) {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    body: row.body,
    audience: row.audience,
    channels: row.channels,
    status: row.status,
    scheduled_at: asText(row.scheduled_at),
    created_at: asText(row.created_at),
    last_error: row.last_error || "",
    counts,
  };
}

async function refreshStatus(campaignId) {
  const camp = await query(
    "SELECT status, DATE_FORMAT(scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at FROM notify_campaigns WHERE id = ? LIMIT 1",
    [campaignId],
  );
  if (!camp.length) return;
  const cur = camp[0].status;
  if (cur === "cancelled") return;
  const counts = await countsFor(campaignId);
  const open = (counts.whatsapp.pending || 0) + (counts.in_app.pending || 0) + (counts.push.pending || 0);
  const failed = (counts.whatsapp.failed || 0) + (counts.push.failed || 0);
  const sent =
    (counts.whatsapp.sent || 0) +
    (counts.whatsapp.delivered || 0) +
    (counts.whatsapp.read || 0) +
    (counts.in_app.sent || 0) +
    (counts.in_app.read || 0) +
    (counts.push.sent || 0);
  let status = "sent";
  if (cur === "scheduled") status = "scheduled";
  else if (open > 0) status = "sending";
  else if (failed && sent) status = "partial";
  else if (failed && !sent) status = "failed";
  await query("UPDATE notify_campaigns SET status = ? WHERE id = ?", [status, campaignId]);
}

async function loadCampaign(id) {
  const rows = await query(
    `SELECT id, name, title, body, template_key, image_url, document_url, link_url, audience, channels, status, last_error,
            DATE_FORMAT(scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at, created_at
     FROM notify_campaigns WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!rows.length) throw new Error("Campaign not found");
  return rows[0];
}

async function processCampaign(campaignId, limit = 5) {
  await ensureNotifySchema();
  const camp = await loadCampaign(campaignId);
  if (camp.status === "cancelled") return publicCampaign(camp, await countsFor(campaignId));
  if (camp.status === "scheduled") {
    if (camp.scheduled_at && camp.scheduled_at > istStamp()) return publicCampaign(camp, await countsFor(campaignId));
    await query("UPDATE notify_campaigns SET status = 'sending' WHERE id = ?", [campaignId]);
    camp.status = "sending";
  }
  const channels = notifyChannels(camp.channels);
  const settings = await loadAlertSettings();
  const cfg = waCfg(settings);
  const batch = await query(
    `SELECT * FROM notify_recipients
     WHERE campaign_id = ? AND (wa_status = 'pending' OR app_status = 'pending' OR push_status = 'pending')
     ORDER BY created_at LIMIT ${Number(limit) || 5}`,
    [campaignId],
  );
  for (const row of batch) {
    if (row.app_status === "pending" && channels.includes("in_app")) {
      let noteId = crypto.randomUUID();
      const text = fillNotifyVars(camp.body, row);
      try {
        const saved = await saveDashboardNotification({
          businessId: row.business_id,
          title: camp.title,
          body: text,
          image: camp.image_url || "",
        });
        if (saved) noteId = saved;
      } catch {
        /* the in-app card is best-effort; the recipient row still records the attempt */
      }
      await query("UPDATE notify_recipients SET app_status = 'sent', notification_id = ? WHERE id = ?", [noteId, row.id]);
    } else if (row.app_status === "pending") {
      await query("UPDATE notify_recipients SET app_status = 'skipped' WHERE id = ?", [row.id]);
    }
    if (row.push_status === "pending" && !channels.includes("push")) {
      await query("UPDATE notify_recipients SET push_status = 'skipped' WHERE id = ?", [row.id]);
    }
    if (row.wa_status !== "pending") continue;
    const dup = await query(
      `SELECT id FROM notify_recipients
       WHERE mobile = ? AND campaign_id <> ? AND wa_status IN ('sent','delivered','read','pending')
         AND created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE) LIMIT 1`,
      [row.mobile, campaignId],
    );
    if (dup.length) {
      await query("UPDATE notify_recipients SET wa_status = 'skipped', wa_error = 'duplicate' WHERE id = ?", [row.id]);
      continue;
    }
    const message = composeWhatsAppBody(fillNotifyVars(camp.body, row), camp.link_url || "");
    let media = "";
    if (camp.document_url) media = camp.document_url;
    else if (camp.image_url && /^https:\/\//i.test(String(camp.image_url))) media = camp.image_url;
    let sent;
    try {
      sent = await sendWhatsAppOne(cfg, row.mobile, message, globalThis.fetch, media);
    } catch (err) {
      sent = { ok: false, error: String(err.message || err) };
    }
    const status = waAcceptanceStatus(sent);
    const err = status === "failed" ? String(sent.error || "failed").slice(0, 255) : "";
    await query("UPDATE notify_recipients SET wa_status = ?, wa_error = ? WHERE id = ?", [status, err, row.id]);
    await logAlertDeliveries({
      kind: "notify",
      businessId: row.business_id,
      shopName: row.business_name,
      subject: camp.title,
      text: message,
      wa: { ok: Boolean(sent.ok), results: [sent] },
    }).catch(() => {});
  }
  await refreshStatus(campaignId);
  const fresh = await loadCampaign(campaignId);
  return publicCampaign(fresh, await countsFor(campaignId));
}

function parseSchedule(raw) {
  const when = String(raw || "").trim();
  if (!when) return { scheduled: false, sql: "" };
  const match = when.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error("Schedule time is not valid");
  const sql = `${match[1]} ${match[2]}:${match[3] || "00"}`;
  return { scheduled: sql > istStamp(), sql };
}

async function createCampaign(input) {
  await ensureNotifySchema();
  const title = String(input.title || "").trim();
  let name = String(input.name || title).trim();
  const body = String(input.body || "").trim();
  if (!name) name = title;
  if (!title) throw new Error("Message title is required");
  if (!body) throw new Error("WhatsApp message is required");
  if (name.length > 180 || title.length > 180) throw new Error("Title is too long");
  if (body.length > 2000) throw new Error("Message is too long");
  const link = safeHttpsUrl(input.link_url, "Website link");
  const document = safeHttpsUrl(input.document_url, "Document");
  let image = "";
  if (input.image_url) image = sanitizeNoticeImage(input.image_url);
  const pack = targets(input, await listBusinesses());
  const when = parseSchedule(input.scheduled_at);
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO notify_campaigns
     (id, name, title, body, template_key, image_url, document_url, link_url, audience, audience_json, channels, status, scheduled_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULLIF(?, ''))`,
    [
      id,
      name,
      title,
      body,
      String(input.template_key || "").slice(0, 64),
      image,
      document,
      link,
      pack.audience,
      JSON.stringify({ business_ids: idList(input.business_ids ?? input.business_id ?? ""), category: pack.category }),
      pack.channels.join(","),
      when.scheduled ? "scheduled" : "sending",
      when.sql,
    ],
  );
  for (const row of pack.rows) {
    const klass = { ...row.class };
    if (klass.wa === "pending") {
      const dup = await query(
        `SELECT r.id FROM notify_recipients r
         JOIN notify_campaigns c ON c.id = r.campaign_id
         WHERE r.mobile = ? AND r.wa_status IN ('sent','delivered','read','pending')
           AND c.body = ? AND r.created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE) LIMIT 1`,
        [klass.mobile, body],
      );
      if (dup.length) {
        klass.wa = "skipped";
        klass.waReason = "duplicate";
        klass.dedupe = `biz:${row.id}`;
      }
    }
    await query(
      `INSERT INTO notify_recipients
       (id, campaign_id, business_id, business_name, owner_name, mobile, plan_name, expiry_date, wa_status, wa_error, app_status, push_status, dedupe_key)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        id,
        row.id,
        String(row.name).slice(0, 180),
        String(row.owner_name).slice(0, 180),
        klass.mobile,
        String(row.plan_name).slice(0, 120),
        String(row.subscription_expires_at).slice(0, 16),
        klass.wa,
        String(klass.waReason || "").slice(0, 255),
        klass.app,
        klass.push,
        String(klass.dedupe).slice(0, 80),
      ],
    );
  }
  if (!when.scheduled) return processCampaign(id, 5);
  return publicCampaign(await loadCampaign(id), await countsFor(id));
}

async function listCampaigns() {
  await ensureNotifySchema();
  const due = await query(
    `SELECT id, DATE_FORMAT(scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at
     FROM notify_campaigns WHERE status = 'scheduled' ORDER BY scheduled_at LIMIT 5`,
  );
  const now = istStamp();
  for (const row of due) {
    if (String(row.scheduled_at || "") <= now) {
      await processCampaign(row.id, 5);
      break;
    }
  }
  const camps = await query(
    `SELECT id, name, title, body, audience, channels, status, last_error, created_at,
            DATE_FORMAT(scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at
     FROM notify_campaigns ORDER BY created_at DESC LIMIT 50`,
  );
  const campaigns = [];
  for (const row of camps) campaigns.push(publicCampaign(row, await countsFor(row.id)));
  return { ok: true, campaigns };
}

async function contactReport() {
  const rows = [];
  const seen = new Set();
  for (const biz of await listBusinesses()) {
    const mobile = normalizeOwnerMobile(biz.mobile);
    let issue = "";
    if (!String(biz.mobile || "").trim()) issue = "missing";
    else if (!mobile) issue = "invalid";
    else if (seen.has(mobile)) issue = "duplicate";
    if (mobile) seen.add(mobile);
    if (!issue && Number(biz.whatsapp_opt_out) !== 1 && Number(biz.whatsapp_consent) === 1) continue;
    rows.push({
      id: biz.id,
      name: biz.name || "",
      owner_name: biz.owner_name || "",
      mobile: biz.mobile || "",
      normalized: mobile ? `+91${mobile}` : "",
      issue,
      whatsapp_consent: Number(biz.whatsapp_consent) || 0,
      whatsapp_opt_out: Number(biz.whatsapp_opt_out) || 0,
    });
  }
  return { ok: true, rows };
}

export async function ackNotifyCampaigns(businessId, ids, push) {
  await ensureNotifySchema();
  const pushStatus = push === "sent" ? "sent" : "failed";
  let updated = 0;
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = String(raw || "").trim();
    if (!id) continue;
    const rows = await query(
      "SELECT id, campaign_id FROM notify_recipients WHERE notification_id = ? AND business_id = ? LIMIT 1",
      [id, businessId],
    );
    if (!rows.length) continue;
    await query(
      "UPDATE notify_recipients SET push_status = IF(push_status = 'pending', ?, push_status), app_status = IF(app_status = 'sent', 'read', app_status) WHERE id = ?",
      [pushStatus, rows[0].id],
    );
    await refreshStatus(rows[0].campaign_id);
    updated += 1;
  }
  return { ok: true, updated };
}

function sendJson(res, fn) {
  return Promise.resolve()
    .then(fn)
    .then((data) => res.json(data))
    .catch((err) => res.status(400).json({ error: String(err.message || err) }));
}

export function registerNotifyCampaigns(app) {
  app.post("/api/master/notify-campaigns/preview", (req, res) =>
    sendJson(res, async () => {
      const title = String(req.body?.title || "").trim();
      const body = String(req.body?.body || "").trim();
      if (!title && !body) throw new Error("Enter a title or message");
      const link = safeHttpsUrl(req.body?.link_url, "Website link");
      const pack = targets(req.body || {}, await listBusinesses());
      const sample = pack.rows[0] || {
        name: "Sample Shop",
        owner_name: "Owner",
        mobile: "9876543210",
        plan_name: "Growth",
        subscription_expires_at: istDay(),
      };
      const filled = fillNotifyVars(body || title, {
        business_name: sample.name,
        owner_name: sample.owner_name,
        mobile: sample.mobile,
        plan_name: sample.plan_name,
        subscription_expires_at: sample.subscription_expires_at,
      });
      return { ok: true, summary: summary(pack.rows), channels: pack.channels, audience: pack.audience, preview: composeWhatsAppBody(filled, link) };
    }),
  );

  app.get("/api/master/notify-campaigns/contacts", (_req, res) => sendJson(res, () => contactReport()));
  app.get("/api/master/notify-campaigns", (_req, res) => sendJson(res, () => listCampaigns()));
  app.post("/api/master/notify-campaigns", (req, res) =>
    sendJson(res, async () => ({ ok: true, campaign: await createCampaign(req.body || {}) })),
  );
  app.get("/api/master/notify-campaigns/:id/recipients", (req, res) =>
    sendJson(res, async () => ({
      ok: true,
      recipients: await query(
        "SELECT id, business_id, business_name, owner_name, mobile, wa_status, wa_error, app_status, push_status FROM notify_recipients WHERE campaign_id = ? ORDER BY business_name LIMIT 500",
        [req.params.id],
      ),
    })),
  );
  app.post("/api/master/notify-campaigns/:id/continue", (req, res) =>
    sendJson(res, async () => ({ ok: true, campaign: await processCampaign(req.params.id, 5) })),
  );
  app.post("/api/master/notify-campaigns/:id/retry", (req, res) =>
    sendJson(res, async () => {
      await query("UPDATE notify_recipients SET wa_status = 'pending', wa_error = '' WHERE campaign_id = ? AND wa_status = 'failed'", [req.params.id]);
      await query("UPDATE notify_campaigns SET status = 'sending' WHERE id = ? AND status <> 'cancelled'", [req.params.id]);
      return { ok: true, campaign: await processCampaign(req.params.id, 5) };
    }),
  );
  app.post("/api/master/notify-campaigns/:id/cancel", (req, res) =>
    sendJson(res, async () => {
      await query("UPDATE notify_campaigns SET status = 'cancelled' WHERE id = ?", [req.params.id]);
      await query(
        `UPDATE notify_recipients
         SET wa_status = IF(wa_status = 'pending', 'cancelled', wa_status),
             app_status = IF(app_status = 'pending', 'cancelled', app_status),
             push_status = IF(push_status = 'pending', 'cancelled', push_status)
         WHERE campaign_id = ?`,
        [req.params.id],
      );
      return { ok: true, campaign: publicCampaign(await loadCampaign(req.params.id), await countsFor(req.params.id)) };
    }),
  );
  app.get("/api/master/notify-campaigns/:id/export", async (req, res) => {
    try {
      const camp = await loadCampaign(req.params.id);
      const rows = await query("SELECT * FROM notify_recipients WHERE campaign_id = ? ORDER BY business_name", [req.params.id]);
      const lines = ["business,owner,mobile,whatsapp,whatsapp_error,in_app,browser_push"];
      for (const row of rows) {
        const cells = [row.business_name, row.owner_name, row.mobile, row.wa_status, row.wa_error, row.app_status, row.push_status];
        lines.push(cells.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","));
      }
      res.set("Content-Type", "text/csv; charset=utf-8");
      res.set("Content-Disposition", `attachment; filename="campaign-${String(camp.id).slice(0, 8)}.csv"`);
      res.send(lines.join("\n"));
    } catch (err) {
      res.status(400).json({ error: String(err.message || err) });
    }
  });
  app.get("/api/master/notify-campaigns/:id", (req, res) =>
    sendJson(res, async () => ({ ok: true, campaign: publicCampaign(await loadCampaign(req.params.id), await countsFor(req.params.id)) })),
  );
  app.post("/api/master/businesses/:id/whatsapp-contact", (req, res) =>
    sendJson(res, async () => {
      await ensureNotifySchema();
      const mobileRaw = String(req.body?.mobile || "").trim();
      const mobile = mobileRaw ? normalizeOwnerMobile(mobileRaw) : "";
      if (mobileRaw && !mobile) throw new Error("Enter a 10-digit Indian mobile number");
      const owner = String(req.body?.owner_name || "").trim().slice(0, 180);
      let consent = req.body?.whatsapp_consent ? 1 : 0;
      const opt = req.body?.whatsapp_opt_out ? 1 : 0;
      if (opt) consent = 0;
      await query(
        "UPDATE businesses SET mobile = ?, owner_name = IF(? = '', owner_name, ?), whatsapp_consent = ?, whatsapp_opt_out = ? WHERE id = ?",
        [mobile, owner, owner, consent, opt, req.params.id],
      );
      return { ok: true };
    }),
  );
}
