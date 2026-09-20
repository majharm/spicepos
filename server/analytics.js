import crypto from "node:crypto";
import { query } from "./db.js";
import { requireMaster } from "./auth.js";

export const GA4_EVENTS = [
  "page_view",
  "scroll",
  "click",
  "login_click",
  "signup_click",
  "get_started",
  "book_demo",
  "contact_submit",
  "phone_click",
  "email_click",
  "whatsapp_click",
  "pricing_view",
  "pricing_click",
  "feature_view",
  "business_category_view",
  "business_category_select",
  "ai_growth_view",
  "hardware_view",
  "weighing_scale_view",
  "qr_order_view",
  "demo_video_play",
  "faq_open",
  "download_brochure",
];

export const DEFAULT_CONVERSIONS = [
  "get_started",
  "book_demo",
  "contact_submit",
  "phone_click",
  "email_click",
  "whatsapp_click",
];

const PII_KEYS = /^(phone|email|name|full.?name|address|password|mobile|gstin|pan)$/i;
const MID = /^G-[A-Z0-9]{4,20}$/i;

export function isMeasurementId(id) {
  return MID.test(String(id || "").trim());
}

export function sanitizeEventParams(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    if (PII_KEYS.test(k)) continue;
    const s = String(v ?? "").trim().slice(0, 120);
    if (s) out[k] = s;
  }
  return out;
}

export function rangeToSince(range, from, to) {
  const now = Date.now();
  const map = { today: 1, yesterday: 1, "7d": 7, "30d": 30, "90d": 90 };
  if (from && to) return { since: new Date(from), until: new Date(to) };
  if (range === "yesterday") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 1);
    const e = new Date(d);
    e.setDate(e.getDate() + 1);
    return { since: d, until: e };
  }
  const days = map[range] || 30;
  return { since: new Date(now - days * 86400000), until: new Date(now) };
}

export async function ensureAnalyticsSchema() {
  await query(`CREATE TABLE IF NOT EXISTS website_analytics_settings (
    id VARCHAR(16) PRIMARY KEY,
    measurement_id VARCHAR(32) NULL,
    google_tag_id VARCHAR(64) NULL,
    property_id VARCHAR(32) NULL,
    connected TINYINT NOT NULL DEFAULT 0,
    consent_required TINYINT NOT NULL DEFAULT 1,
    conversion_events TEXT NULL,
    data_api_configured TINYINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(3) NULL
  )`);
  await query(`CREATE TABLE IF NOT EXISTS website_analytics_events (
    id VARCHAR(36) PRIMARY KEY,
    occurred_at TIMESTAMP(3) NOT NULL,
    event_name VARCHAR(64) NOT NULL,
    page_path VARCHAR(255) NULL,
    page_title VARCHAR(255) NULL,
    business_category VARCHAR(64) NULL,
    page_type VARCHAR(64) NULL,
    cta_type VARCHAR(64) NULL,
    utm_source VARCHAR(64) NULL,
    utm_medium VARCHAR(64) NULL,
    utm_campaign VARCHAR(64) NULL,
    utm_term VARCHAR(64) NULL,
    utm_content VARCHAR(64) NULL,
    device VARCHAR(32) NULL,
    referrer VARCHAR(255) NULL,
    session_id VARCHAR(64) NULL,
    INDEX (occurred_at),
    INDEX (event_name)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS website_analytics_alerts (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    metric VARCHAR(64) NOT NULL,
    condition_op VARCHAR(16) NOT NULL,
    threshold DECIMAL(12,2) NOT NULL DEFAULT 0,
    frequency VARCHAR(32) NOT NULL DEFAULT 'daily',
    email_on TINYINT NOT NULL DEFAULT 1,
    dashboard_on TINYINT NOT NULL DEFAULT 1,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    last_fired_at TIMESTAMP(3) NULL,
    INDEX (status)
  )`);
  const [row] = await query("SELECT id FROM website_analytics_settings WHERE id = 'platform' LIMIT 1");
  if (!row) {
    await query(
      `INSERT INTO website_analytics_settings (id, conversion_events, consent_required, updated_at)
       VALUES ('platform', ?, 1, CURRENT_TIMESTAMP(3))`,
      [JSON.stringify(DEFAULT_CONVERSIONS)],
    );
  }
}

async function getSettings() {
  await ensureAnalyticsSchema();
  const [row] = await query("SELECT * FROM website_analytics_settings WHERE id = 'platform' LIMIT 1");
  let conversions = DEFAULT_CONVERSIONS;
  try {
    const parsed = JSON.parse(row?.conversion_events || "[]");
    if (Array.isArray(parsed) && parsed.length) conversions = parsed;
  } catch {
    /* keep default */
  }
  const measurementId = String(row?.measurement_id || "").trim();
  return {
    measurement_id: measurementId,
    google_tag_id: String(row?.google_tag_id || measurementId).trim(),
    property_id: String(row?.property_id || "").trim(),
    connected: Boolean(row?.connected) && isMeasurementId(measurementId),
    consent_required: row?.consent_required !== 0,
    conversion_events: conversions,
    data_api_configured: Boolean(process.env.GA4_CREDENTIALS_JSON) || Boolean(row?.data_api_configured),
    source: "website_events",
  };
}

async function saveSettings(body) {
  const measurementId = String(body?.measurement_id || "").trim().toUpperCase();
  if (measurementId && !isMeasurementId(measurementId)) throw new Error("Enter a GA4 Measurement ID like G-XXXXXXXXXX");
  const googleTagId = String(body?.google_tag_id || measurementId).trim();
  const propertyId = String(body?.property_id || "").replace(/\D/g, "").slice(0, 16);
  const connected = Boolean(body?.connected) && isMeasurementId(measurementId);
  const consent = body?.consent_required === false || body?.consent_required === 0 ? 0 : 1;
  let conversions = DEFAULT_CONVERSIONS;
  if (Array.isArray(body?.conversion_events)) {
    conversions = body.conversion_events.filter((n) => GA4_EVENTS.includes(String(n)));
  }
  await query(
    `INSERT INTO website_analytics_settings
       (id, measurement_id, google_tag_id, property_id, connected, consent_required, conversion_events, updated_at)
     VALUES ('platform', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       measurement_id = VALUES(measurement_id),
       google_tag_id = VALUES(google_tag_id),
       property_id = VALUES(property_id),
       connected = VALUES(connected),
       consent_required = VALUES(consent_required),
       conversion_events = VALUES(conversion_events),
       updated_at = CURRENT_TIMESTAMP(3)`,
    [measurementId, googleTagId, propertyId, connected ? 1 : 0, consent, JSON.stringify(conversions)],
  );
  return getSettings();
}

export async function recordWebsiteEvent(body, req) {
  const name = String(body?.event_name || "").trim();
  if (!GA4_EVENTS.includes(name)) throw new Error("Unknown analytics event");
  const params = sanitizeEventParams(body?.params);
  const ua = String(req?.headers?.["user-agent"] || "");
  let device = "desktop";
  if (/tablet|ipad/i.test(ua)) device = "tablet";
  else if (/mobile|android|iphone/i.test(ua)) device = "mobile";
  await ensureAnalyticsSchema();
  await query(
    `INSERT INTO website_analytics_events (
       id, occurred_at, event_name, page_path, page_title, business_category, page_type, cta_type,
       utm_source, utm_medium, utm_campaign, utm_term, utm_content, device, referrer, session_id
     ) VALUES (?, CURRENT_TIMESTAMP(3), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      name,
      String(body?.page_path || params.page_path || "").slice(0, 255),
      String(body?.page_title || "").slice(0, 255),
      String(params.business_category || body?.business_category || "").slice(0, 64),
      String(params.page_type || "landing_page").slice(0, 64),
      String(params.cta_type || "").slice(0, 64),
      String(params.utm_source || body?.utm_source || "").slice(0, 64),
      String(params.utm_medium || "").slice(0, 64),
      String(params.utm_campaign || "").slice(0, 64),
      String(params.utm_term || "").slice(0, 64),
      String(params.utm_content || "").slice(0, 64),
      device,
      String(body?.referrer || "").slice(0, 255),
      String(body?.session_id || "").slice(0, 64),
    ],
  );
  return { ok: true };
}

function sqlSince(since, until) {
  return { since: since.toISOString().slice(0, 19).replace("T", " "), until: until.toISOString().slice(0, 19).replace("T", " ") };
}

async function summarize(range, from, to) {
  await ensureAnalyticsSchema();
  const { since, until } = rangeToSince(range, from, to);
  const prevMs = until.getTime() - since.getTime();
  const prevSince = new Date(since.getTime() - prevMs);
  const a = sqlSince(since, until);
  const b = sqlSince(prevSince, since);
  const count = async (where, params) => {
    const [row] = await query(
      `SELECT COUNT(*) AS n FROM website_analytics_events WHERE occurred_at >= ? AND occurred_at < ? ${where}`,
      params,
    );
    return Number(row?.n || 0);
  };
  const pageViews = await count("AND event_name = 'page_view'", [a.since, a.until]);
  const prevPageViews = await count("AND event_name = 'page_view'", [b.since, b.until]);
  const events = await count("", [a.since, a.until]);
  const prevEvents = await count("", [b.since, b.until]);
  const settings = await getSettings();
  const convList = settings.conversion_events;
  const placeholders = convList.map(() => "?").join(",") || "'__none__'";
  const conversions = await count(`AND event_name IN (${placeholders})`, [a.since, a.until, ...convList]);
  const prevConversions = await count(`AND event_name IN (${placeholders})`, [b.since, b.until, ...convList]);
  const sessions = await count("AND event_name = 'page_view'", [a.since, a.until]);
  const users = await query(
    `SELECT COUNT(DISTINCT session_id) AS n FROM website_analytics_events
     WHERE occurred_at >= ? AND occurred_at < ? AND session_id IS NOT NULL AND session_id <> ''`,
    [a.since, a.until],
  );
  const prevUsers = await query(
    `SELECT COUNT(DISTINCT session_id) AS n FROM website_analytics_events
     WHERE occurred_at >= ? AND occurred_at < ? AND session_id IS NOT NULL AND session_id <> ''`,
    [b.since, b.until],
  );
  const leads = await count("AND event_name IN ('contact_submit','book_demo','get_started')", [a.since, a.until]);
  const pct = (cur, prev) => {
    if (!prev) return cur ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 1000) / 10;
  };
  const bySource = await query(
    `SELECT COALESCE(NULLIF(utm_source,''), IF(referrer='', 'direct', 'referral')) AS source, COUNT(*) AS n
     FROM website_analytics_events
     WHERE occurred_at >= ? AND occurred_at < ? AND event_name = 'page_view'
     GROUP BY source ORDER BY n DESC LIMIT 12`,
    [a.since, a.until],
  );
  const byDevice = await query(
    `SELECT COALESCE(device,'desktop') AS device, COUNT(*) AS n
     FROM website_analytics_events WHERE occurred_at >= ? AND occurred_at < ?
     GROUP BY device`,
    [a.since, a.until],
  );
  const byPage = await query(
    `SELECT COALESCE(NULLIF(page_path,''),'/') AS page, COUNT(*) AS users,
            SUM(event_name='page_view') AS sessions,
            SUM(event_name IN (${placeholders})) AS conversions
     FROM website_analytics_events WHERE occurred_at >= ? AND occurred_at < ?
     GROUP BY page ORDER BY users DESC LIMIT 40`,
    [...convList, a.since, a.until],
  );
  const byCategory = await query(
    `SELECT COALESCE(NULLIF(business_category,''),'(none)') AS category, COUNT(DISTINCT session_id) AS visitors,
            SUM(event_name IN ('get_started')) AS get_started,
            SUM(event_name IN ('book_demo')) AS demo_requests,
            SUM(event_name IN ('contact_submit','book_demo','get_started')) AS leads
     FROM website_analytics_events WHERE occurred_at >= ? AND occurred_at < ?
     GROUP BY category ORDER BY visitors DESC LIMIT 30`,
    [a.since, a.until],
  );
  const byCampaign = await query(
    `SELECT COALESCE(NULLIF(utm_campaign,''),'(none)') AS campaign, COUNT(*) AS sessions,
            SUM(event_name IN (${placeholders})) AS conversions
     FROM website_analytics_events WHERE occurred_at >= ? AND occurred_at < ?
     GROUP BY campaign ORDER BY sessions DESC LIMIT 20`,
    [...convList, a.since, a.until],
  );
  const realtime = await query(
    `SELECT event_name, page_path, device, occurred_at
     FROM website_analytics_events
     WHERE occurred_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)
     ORDER BY occurred_at DESC LIMIT 40`,
  );
  const active = await query(
    `SELECT COUNT(DISTINCT session_id) AS n FROM website_analytics_events
     WHERE occurred_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)`,
  );
  const byEvent = await query(
    `SELECT event_name, COUNT(*) AS n FROM website_analytics_events
     WHERE occurred_at >= ? AND occurred_at < ? GROUP BY event_name ORDER BY n DESC`,
    [a.since, a.until],
  );
  const leadRows = await query(
    `SELECT id, occurred_at, event_name,
            COALESCE(NULLIF(utm_source,''), IF(referrer='', 'direct', 'referral')) AS source,
            utm_campaign, page_path, business_category
     FROM website_analytics_events
     WHERE occurred_at >= ? AND occurred_at < ?
       AND event_name IN ('contact_submit','book_demo','get_started')
     ORDER BY occurred_at DESC LIMIT 80`,
    [a.since, a.until],
  );
  const engagedRow = await query(
    `SELECT COUNT(DISTINCT session_id) AS n FROM website_analytics_events
     WHERE occurred_at >= ? AND occurred_at < ? AND event_name IN ('scroll','click')`,
    [a.since, a.until],
  );
  const userN = Number(users[0]?.n || 0);
  const prevUserN = Number(prevUsers[0]?.n || 0);
  const engaged = Number(engagedRow[0]?.n || 0);
  const summaryLines = [];
  if (events === 0) {
    summaryLines.push("No website events are stored for the selected period. Connect a GA4 Measurement ID and wait for traffic, or browse the public site with consent accepted.");
  } else {
    if (pageViews >= prevPageViews) summaryLines.push("Page views are at or above the previous equivalent period.");
    else summaryLines.push("Page views decreased compared with the previous selected period.");
    const topCat = byCategory.find((c) => c.category && c.category !== "(none)");
    if (topCat) summaryLines.push(`${topCat.category} pages received the most recorded visitors in this period.`);
    const topDev = [...byDevice].sort((x, y) => y.n - x.n)[0];
    if (topDev) summaryLines.push(`${topDev.device} accounted for the largest share of recorded events.`);
    if (conversions >= prevConversions) summaryLines.push("Marked conversion events are at or above the previous period.");
    else summaryLines.push("Marked conversion events decreased compared with the previous period.");
  }
  return {
    source: "website_events",
    ga4_data_api: false,
    range: { since: a.since, until: a.until },
    kpis: {
      users: { value: userN, change: pct(userN, prevUserN) },
      new_users: { value: userN, change: pct(userN, prevUserN) },
      sessions: { value: sessions, change: pct(sessions, prevPageViews) },
      engaged_sessions: { value: engaged, change: 0 },
      engagement_rate: { value: sessions ? Math.round((engaged / Math.max(sessions, 1)) * 100) : 0, change: 0 },
      avg_engagement_time: { value: 0, change: 0 },
      page_views: { value: pageViews, change: pct(pageViews, prevPageViews) },
      events: { value: events, change: pct(events, prevEvents) },
      conversions: { value: conversions, change: pct(conversions, prevConversions) },
      leads: { value: leads, change: 0 },
    },
    acquisition: bySource,
    devices: byDevice,
    landing_pages: byPage,
    categories: byCategory,
    campaigns: byCampaign,
    events_by_name: byEvent,
    leads: leadRows,
    realtime: { active_users: Number(active[0]?.n || 0), events: realtime },
    ai_summary: summaryLines,
    note: "Figures are first-party website events stored by ATAV POS. They are not Google Analytics Data API numbers. GA4 Measurement ID only loads gtag.js on the public site. Search Console rankings are not included.",
  };
}

function send(res, fn) {
  return Promise.resolve()
    .then(fn)
    .then((data) => res.json(data))
    .catch((err) => res.status(400).json({ error: String(err.message) }));
}

export function registerAnalyticsPublic(app) {
  app.get("/api/analytics/config", (_req, res) =>
    send(res, async () => {
      const s = await getSettings();
      return {
        measurement_id: s.connected ? s.measurement_id : "",
        google_tag_id: s.connected ? s.google_tag_id : "",
        consent_required: s.consent_required,
        connected: s.connected,
      };
    }),
  );
  app.post("/api/analytics/event", (req, res) => send(res, () => recordWebsiteEvent(req.body || {}, req)));
}

export function registerAnalyticsMaster(app) {
  app.get("/api/master/analytics/settings", requireMaster, (_req, res) => send(res, getSettings));
  app.post("/api/master/analytics/settings", requireMaster, (req, res) => send(res, () => saveSettings(req.body || {})));
  app.post("/api/master/analytics/test", requireMaster, (req, res) =>
    send(res, async () => {
      const id = String(req.body?.measurement_id || (await getSettings()).measurement_id).trim();
      if (!isMeasurementId(id)) throw new Error("Measurement ID is not a valid G-XXXXXXXXXX value");
      return {
        ok: true,
        tagging: true,
        data_api: Boolean(process.env.GA4_CREDENTIALS_JSON),
        message: process.env.GA4_CREDENTIALS_JSON
          ? "Measurement ID is valid. GA4 Data API credentials are present on the server."
          : "Measurement ID is valid for gtag.js. GA4 Data API is not configured (set GA4_CREDENTIALS_JSON server-side to import Google reports).",
      };
    }),
  );
  app.get("/api/master/analytics/overview", requireMaster, (req, res) =>
    send(res, () => summarize(req.query.range || "30d", req.query.from, req.query.to)),
  );
  app.get("/api/master/analytics/alerts", requireMaster, async (_req, res) => {
    await ensureAnalyticsSchema();
    send(res, () => query("SELECT * FROM website_analytics_alerts ORDER BY name"));
  });
  app.post("/api/master/analytics/alerts", requireMaster, (req, res) =>
    send(res, async () => {
      await ensureAnalyticsSchema();
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO website_analytics_alerts (id, name, metric, condition_op, threshold, frequency, email_on, dashboard_on, status)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          id,
          String(req.body?.name || "Alert").slice(0, 128),
          String(req.body?.metric || "page_views").slice(0, 64),
          String(req.body?.condition_op || "lt").slice(0, 16),
          Number(req.body?.threshold || 0),
          String(req.body?.frequency || "daily").slice(0, 32),
          req.body?.email_on === false ? 0 : 1,
          req.body?.dashboard_on === false ? 0 : 1,
          req.body?.status === "inactive" ? "inactive" : "active",
        ],
      );
      return { ok: true, id };
    }),
  );
  app.get("/api/master/analytics/export", requireMaster, (req, res) =>
    send(res, async () => {
      const data = await summarize(req.query.range || "30d", req.query.from, req.query.to);
      return { csv: toCsv(data), note: data.note };
    }),
  );
}

function toCsv(data) {
  const lines = ["metric,value,change_pct"];
  for (const [k, v] of Object.entries(data.kpis || {})) {
    lines.push(`${k},${v.value},${v.change}`);
  }
  return lines.join("\n");
}
