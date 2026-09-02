import { query } from "./db.js";
import { sendMail } from "./mail.js";
import { getPlatformSettings, setPlatformSetting } from "./settings.js";

export const WA_DEFAULT_URL = "https://wamaster.atavtelecom.in/api/v1/send";
export const WA_DEFAULT_COUNTRY = "91";
export const WA_DEFAULT_KEY = "b99fcac4528c679916dcd461f5d834a098c9f9fa2fd349c67395fb028579cc1b";
export const WA_DEFAULT_PROFILE = "acc_1782484414096";

export const ALERT_KINDS = ["welcome", "credentials", "updates", "closing", "low_stock"];

const ALERT_KEYS = [
  "wa_enabled",
  "wa_api_url",
  "wa_api_key",
  "wa_profile_id",
  "wa_country_code",
  "alert_welcome",
  "alert_credentials",
  "alert_updates",
  "alert_closing",
  "alert_low_stock",
  "alert_closing_hour",
  "tpl_welcome",
  "tpl_credentials",
  "tpl_updates",
  "tpl_closing",
  "tpl_low_stock",
];

export const DEFAULT_TEMPLATES = {
  welcome: `Welcome to ATAV POS.

Hello {{name}}, shop "{{shop}}" is ready.

Sign in: {{signInUrl}}
Keep your login private.

— ATAV Telecom POS`,
  credentials: `ATAV POS login for "{{shop}}"
Role: {{role}}
User ID: {{username}}
Email: {{email}}
Password: {{password}}
Sign in: {{signInUrl}}

Do not share this message.
— ATAV Telecom POS`,
  updates: `ATAV POS update · {{shop}}

{{title}}

{{body}}

— ATAV Telecom POS`,
  closing: `{{shop}} — closing {{day}}
Bills: {{bills}}
Total: {{takings}}
Cash {{cash}} · UPI {{upi}} · Card {{card}} · Credit {{credit}}
GST: {{gst}}
{{lowStock}}

— ATAV Telecom POS`,
  low_stock: `{{shop}} — low stock alert

{{lowStock}}

— ATAV Telecom POS`,
};

export const SAMPLE_PAYLOAD = {
  shopName: "SWAMI MASALE SASWAD",
  ownerName: "Shop owner",
  username: "swami.admin",
  email: "admin@shop.local",
  password: "********",
  role: "business_admin",
  signInUrl: "https://pos.atavtelecom.in/login.html",
  title: "Holiday hours",
  body: "Closed this Sunday.",
  day: "2026-09-01",
  bills: 12,
  takings: 4500,
  cash: 2000,
  upi: 1500,
  card: 800,
  credit: 200,
  gst: 225,
  items: [{ name: "Turmeric powder", qtyLabel: "2 kg" }],
};

export function fillTemplate(tpl, vars = {}) {
  return String(tpl || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    return value == null ? "" : String(value);
  });
}

export function effectiveTemplate(kind, stored) {
  const text = String(stored || "").trim();
  return text || DEFAULT_TEMPLATES[kind] || "";
}

export function alertVars(payload = {}) {
  const items = payload.items || payload.lowStock || [];
  const bullets = items
    .map((item) => {
      const name = item?.name || (typeof item === "string" ? item : "");
      const qty = item?.qtyLabel ? ` (${item.qtyLabel})` : "";
      return name ? `• ${name}${qty}` : "";
    })
    .filter(Boolean)
    .join("\n");
  const money = (key) => {
    const value = payload[key];
    if (value == null || value === "") return "";
    if (typeof value === "string" && value.includes("₹")) return value;
    return formatInr(value);
  };
  return {
    shop: payload.shopName || payload.shop || "",
    name: payload.ownerName || payload.name || "",
    username: payload.username || "",
    email: payload.email || "",
    password: payload.password || "",
    role: String(payload.role || "").replaceAll("_", " "),
    signInUrl: payload.signInUrl || "",
    title: payload.title || "",
    body: payload.body || "",
    day: payload.day || "",
    bills: payload.bills == null || payload.bills === "" ? "" : String(Number(payload.bills) || 0),
    takings: money("takings"),
    cash: money("cash"),
    upi: money("upi"),
    card: money("card"),
    credit: money("credit"),
    gst: money("gst"),
    lowStock: payload.lowStockText || bullets,
  };
}

export function sampleAlertVars() {
  return alertVars(SAMPLE_PAYLOAD);
}

export function renderAlert(kind, payload = {}, settings = {}) {
  return fillTemplate(effectiveTemplate(kind, settings[`tpl_${kind}`]), alertVars(payload)).trim();
}

export function normalizeInMobile(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("91") && d.length >= 12) d = d.slice(-10);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  return /^\d{10}$/.test(d) ? d : "";
}

export function flagOn(value, fallback = true) {
  if (value == null || value === "") return fallback;
  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
}

export function maskSecret(value) {
  const s = String(value || "");
  if (!s) return "";
  if (s.length <= 4) return "••••";
  return `••••${s.slice(-4)}`;
}

export function looksMaskedSecret(value) {
  return !value || /^•+$/.test(String(value)) || String(value).startsWith("••••");
}

export function formatInr(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildWaUrl(cfg, numbers, message, media) {
  const url = new URL(cfg.apiUrl || WA_DEFAULT_URL);
  url.searchParams.set("api_key", cfg.apiKey || "");
  url.searchParams.set("profile_id", cfg.profileId || "");
  url.searchParams.set("numbers", (numbers || []).join(","));
  url.searchParams.set("message", String(message || ""));
  url.searchParams.set("country_code", cfg.countryCode || WA_DEFAULT_COUNTRY);
  if (media && /^https:\/\//i.test(media)) {
    url.searchParams.set("media", media);
    url.searchParams.set("media_url", media);
  }
  return url.toString();
}

export function welcomeText(payload = {}, settings = {}) {
  return renderAlert(
    "welcome",
    {
      ...payload,
      shopName: payload.shopName || "your shop",
      ownerName: payload.ownerName || "there",
    },
    settings,
  );
}

export function credentialsText(payload = {}, settings = {}) {
  return renderAlert(
    "credentials",
    {
      ...payload,
      shopName: payload.shopName || "your shop",
      password: payload.password || "the one you set. Keep it private.",
    },
    settings,
  );
}

export function updateText(payload = {}, settings = {}) {
  return renderAlert("updates", { ...payload, title: payload.title || "Update" }, settings);
}

export function closingText(payload = {}, settings = {}) {
  return renderAlert("closing", { shopName: "Shop", ...payload, shopName: payload.shopName || "Shop" }, settings);
}

export function lowStockText(payload = {}, settings = {}) {
  const items = payload.items?.length ? payload.items : [{ name: "One or more items are at or below reorder level." }];
  return renderAlert("low_stock", { ...payload, shopName: payload.shopName || "Shop", items }, settings);
}

export function noticeHtml({ title, body, image }) {
  let img = "";
  if (image && /^https:\/\//i.test(image)) {
    img = `<p><img src="${escapeHtml(image)}" alt="" style="max-width:100%;border-radius:8px" /></p>`;
  } else if (image && String(image).startsWith("data:image/")) {
    img = `<p><img src="cid:notice-image" alt="" style="max-width:100%;border-radius:8px" /></p>`;
  }
  return `<p><strong>${escapeHtml(title || "Update")}</strong></p>${
    body ? `<p>${escapeHtml(String(body)).replaceAll("\n", "<br>")}</p>` : ""
  }${img}<p>— ATAV Telecom POS</p>`;
}

export function sanitizeNoticeImage(raw) {
  const img = String(raw || "").trim();
  if (!img) return "";
  if (img.startsWith("data:image/")) {
    if (img.length > 6_000_000) throw new Error("Notification image is too large");
    return img;
  }
  if (/^https:\/\//i.test(img) && img.length < 2048) return img;
  throw new Error("Notification image must be an uploaded image");
}

export async function ensureAlertSettings() {
  const rows = await query("SELECT setting_key, setting_value FROM platform_settings");
  const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value ?? ""]));
  const defaults = {
    wa_enabled: "1",
    wa_api_url: WA_DEFAULT_URL,
    wa_api_key: WA_DEFAULT_KEY,
    wa_profile_id: WA_DEFAULT_PROFILE,
    wa_country_code: WA_DEFAULT_COUNTRY,
    alert_welcome: "1",
    alert_credentials: "1",
    alert_updates: "1",
    alert_closing: "1",
    alert_low_stock: "1",
    alert_closing_hour: "22",
  };
  for (const [key, value] of Object.entries(defaults)) {
    const cur = map[key];
    if (cur == null) await setPlatformSetting(key, value);
    else if (cur === "" && ["wa_api_key", "wa_profile_id", "wa_api_url"].includes(key)) {
      await setPlatformSetting(key, value);
    }
  }
}

export function testText() {
  return "ATAV POS WhatsApp test from Master Admin. Alerts are working.\n\n— ATAV Telecom POS";
}

export async function loadAlertSettings() {
  await ensureAlertSettings();
  const rows = await query("SELECT setting_key, setting_value FROM platform_settings");
  const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value ?? ""]));
  return {
    wa_enabled: flagOn(map.wa_enabled, true) ? "1" : "0",
    wa_api_url: map.wa_api_url || WA_DEFAULT_URL,
    wa_api_key: map.wa_api_key || "",
    wa_profile_id: map.wa_profile_id || "",
    wa_country_code: map.wa_country_code || WA_DEFAULT_COUNTRY,
    alert_welcome: flagOn(map.alert_welcome, true) ? "1" : "0",
    alert_credentials: flagOn(map.alert_credentials, true) ? "1" : "0",
    alert_updates: flagOn(map.alert_updates, true) ? "1" : "0",
    alert_closing: flagOn(map.alert_closing, true) ? "1" : "0",
    alert_low_stock: flagOn(map.alert_low_stock, true) ? "1" : "0",
    alert_closing_hour: String(Math.min(23, Math.max(0, Number(map.alert_closing_hour ?? 22) || 22))),
    tpl_welcome: map.tpl_welcome || "",
    tpl_credentials: map.tpl_credentials || "",
    tpl_updates: map.tpl_updates || "",
    tpl_closing: map.tpl_closing || "",
    tpl_low_stock: map.tpl_low_stock || "",
  };
}

export function publicAlertSettings(cfg) {
  const out = {
    ...cfg,
    wa_api_key: maskSecret(cfg.wa_api_key),
    wa_api_key_set: Boolean(cfg.wa_api_key),
    defaults: { ...DEFAULT_TEMPLATES },
    sample_vars: sampleAlertVars(),
    samples: {},
  };
  for (const kind of ALERT_KINDS) {
    out[`tpl_${kind}`] = effectiveTemplate(kind, cfg[`tpl_${kind}`]);
    out.samples[kind] = renderAlert(kind, SAMPLE_PAYLOAD, cfg);
  }
  return out;
}

export async function saveAlertSettings(body = {}) {
  const current = await loadAlertSettings();
  const next = { ...current };
  for (const key of ALERT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    if (key === "wa_api_key" && looksMaskedSecret(body[key])) continue;
    let value = body[key] == null ? "" : String(body[key]);
    if (key.startsWith("tpl_")) value = value.slice(0, 8000);
    next[key] = key.startsWith("tpl_") ? value.trim() : value.trim();
  }
  if (next.wa_api_url && !/^https:\/\//i.test(next.wa_api_url)) {
    throw new Error("WhatsApp API URL must be https");
  }
  next.wa_enabled = flagOn(next.wa_enabled, true) ? "1" : "0";
  for (const key of ["alert_welcome", "alert_credentials", "alert_updates", "alert_closing", "alert_low_stock"]) {
    next[key] = flagOn(next[key], true) ? "1" : "0";
  }
  next.alert_closing_hour = String(Math.min(23, Math.max(0, Number(next.alert_closing_hour) || 22)));
  next.wa_country_code = (next.wa_country_code || WA_DEFAULT_COUNTRY).replace(/\D/g, "").slice(0, 3) || WA_DEFAULT_COUNTRY;
  for (const key of ALERT_KEYS) await setPlatformSetting(key, next[key]);
  return loadAlertSettings();
}

async function shopContacts(businessId) {
  const [biz] = businessId
    ? await query("SELECT id, name, mobile, email FROM businesses WHERE id = ? LIMIT 1", [businessId])
    : [];
  const [co] = businessId
    ? await query("SELECT phone, email, name, timezone FROM company_settings WHERE business_id = ? LIMIT 1", [businessId])
    : [];
  const phones = [...new Set([normalizeInMobile(biz?.mobile), normalizeInMobile(co?.phone)].filter(Boolean))];
  const emails = [...new Set([biz?.email, co?.email].map((v) => String(v || "").trim().toLowerCase()).filter((v) => v.includes("@")))];
  return {
    businessId: biz?.id || businessId || "",
    shopName: biz?.name || co?.name || "",
    timezone: co?.timezone || "Asia/Kolkata",
    phones,
    emails,
  };
}

export async function sendWhatsApp(cfg, numbers, message, fetchImpl = fetch, media = "") {
  if (typeof fetchImpl === "string") {
    media = fetchImpl;
    fetchImpl = fetch;
  }
  const list = [...new Set((numbers || []).map(normalizeInMobile).filter(Boolean))];
  if (!list.length || !message) return { ok: false, skipped: true, reason: "no-number" };
  if (!flagOn(cfg.wa_enabled, true) || !cfg.apiKey || !cfg.profileId) {
    return { ok: false, skipped: true, reason: "wa-off" };
  }
  const httpsMedia = media && /^https:\/\//i.test(media) ? media : "";
  const dataMedia = media && String(media).startsWith("data:image/") ? String(media) : "";
  const endpoint = String(cfg.wa_api_url || WA_DEFAULT_URL).split("?")[0];
  try {
    if (dataMedia) {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          api_key: cfg.apiKey,
          profile_id: cfg.profileId || cfg.wa_profile_id,
          numbers: list.join(","),
          message: String(message || ""),
          country_code: cfg.wa_country_code || WA_DEFAULT_COUNTRY,
          media: dataMedia,
          type: "media",
        }),
        signal: AbortSignal.timeout(20000),
      });
      const text = await res.text();
      if (!res.ok) {
        return sendWhatsApp(cfg, list, message, fetchImpl, "");
      }
      return { ok: true, status: res.status, body: String(text).slice(0, 240) };
    }
    const url = buildWaUrl(
      {
        apiUrl: cfg.wa_api_url,
        apiKey: cfg.api_key || cfg.apiKey,
        profileId: cfg.wa_profile_id || cfg.profileId,
        countryCode: cfg.wa_country_code,
      },
      list,
      message,
      httpsMedia,
    );
    const res = await fetchImpl(url, { method: "GET", signal: AbortSignal.timeout(8000) });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `WhatsApp HTTP ${res.status}`, status: res.status };
    return { ok: true, status: res.status, body: String(text).slice(0, 240) };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

function waCfg(settings) {
  return {
    wa_enabled: settings.wa_enabled,
    wa_api_url: settings.wa_api_url,
    apiKey: settings.wa_api_key,
    wa_api_key: settings.wa_api_key,
    profileId: settings.wa_profile_id,
    wa_profile_id: settings.wa_profile_id,
    wa_country_code: settings.wa_country_code,
  };
}

async function sendEmailSafe({ to, subject, text, html, image }) {
  const list = [...new Set((Array.isArray(to) ? to : [to]).map((v) => String(v || "").trim()).filter((v) => v.includes("@")))];
  const results = [];
  for (const addr of list) {
    try {
      results.push(await sendMail({ to: addr, subject, text, html: html || `<pre style="font-family:inherit">${escapeHtml(text)}</pre>`, image }));
    } catch (err) {
      results.push({ ok: false, error: String(err.message || err) });
    }
  }
  return results;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function dispatchAlert({ phones = [], emails = [], subject, text, html, image = "", extraPhones = [], extraEmails = [] }) {
  const settings = await loadAlertSettings();
  const nums = [...phones, ...extraPhones];
  const mailTo = [...emails, ...extraEmails];
  const wa = await sendWhatsApp(waCfg(settings), nums, text, fetch, image);
  const mail = await sendEmailSafe({ to: mailTo, subject, text, html, image });
  return { wa, mail };
}

async function markSent(businessId, kind, day, itemId = "") {
  try {
    await query(
      `INSERT INTO alert_sends (id, business_id, kind, item_id, send_day)
       VALUES (?,?,?,?,?)`,
      [crypto.randomUUID(), businessId, kind, itemId || "", day],
    );
    return true;
  } catch (err) {
    if (/duplicate/i.test(String(err.message || err))) return false;
    throw err;
  }
}

async function alreadySent(businessId, kind, day, itemId = "") {
  const rows = await query(
    "SELECT id FROM alert_sends WHERE business_id = ? AND kind = ? AND item_id = ? AND send_day = ? LIMIT 1",
    [businessId, kind, itemId || "", day],
  );
  return Boolean(rows[0]);
}

export async function sendWelcomeAlerts({
  businessId,
  shopName,
  ownerName,
  email,
  username,
  password,
  role,
  mobile,
  signInUrl,
}) {
  const settings = await loadAlertSettings();
  const shop = await shopContacts(businessId);
  const extraPhone = normalizeInMobile(mobile);
  const phones = extraPhone ? [...new Set([...shop.phones, extraPhone])] : shop.phones;
  const emails = email ? [...new Set([...shop.emails, String(email).toLowerCase()])] : shop.emails;
  const name = shopName || shop.shopName;
  const out = { welcome: null, credentials: null };
  if (flagOn(settings.alert_welcome, true)) {
    const text = welcomeText({ shopName: name, ownerName, signInUrl }, settings);
    out.welcome = await sendWhatsApp(waCfg(settings), phones, text);
  }
  if (flagOn(settings.alert_credentials, true) && (username || email || password)) {
    out.credentials = await sendCredentialAlerts({
      businessId,
      shopName: name,
      ownerName,
      email,
      username,
      password,
      role,
      mobile,
      signInUrl,
      phones,
      emails,
      settings,
    });
  }
  return out;
}

export async function sendCredentialAlerts({
  businessId,
  shopName,
  ownerName,
  email,
  username,
  password,
  role,
  mobile,
  signInUrl,
  phones: givenPhones,
  emails: givenEmails,
  settings: givenSettings,
}) {
  const settings = givenSettings || (await loadAlertSettings());
  if (!flagOn(settings.alert_credentials, true)) return { skipped: true };
  if (!(username || email || password)) return { skipped: true };
  const shop = givenPhones && givenEmails ? null : await shopContacts(businessId);
  const extraPhone = normalizeInMobile(mobile);
  const phones = givenPhones || (extraPhone ? [...new Set([...(shop?.phones || []), extraPhone])] : shop?.phones || []);
  const emails = givenEmails || (email ? [...new Set([...(shop?.emails || []), String(email).toLowerCase()])] : shop?.emails || []);
  const name = shopName || shop?.shopName || "";
  const text = credentialsText(
    {
      shopName: name,
      ownerName,
      username,
      email,
      password: password || "the one you set. Keep it private.",
      role,
      signInUrl,
    },
    settings,
  );
  return dispatchAlert({
    phones,
    emails,
    subject: `ATAV POS login · ${name || "shop"}`,
    text,
  });
}

export async function sendUpdateAlerts({ businessId, title, body, image, force = false }) {
  const settings = await loadAlertSettings();
  if (!force && !flagOn(settings.alert_updates, true)) return { skipped: true };
  const ids = businessId
    ? [businessId]
    : (await query("SELECT id FROM businesses WHERE COALESCE(status,'active') = 'active'")).map((r) => r.id);
  const results = [];
  for (const id of ids) {
    const shop = await shopContacts(id);
    const text = updateText({ shopName: shop.shopName, title, body }, settings);
    results.push(
      await dispatchAlert({
        phones: shop.phones,
        emails: shop.emails,
        subject: `ATAV POS update · ${title || shop.shopName}`,
        text,
        html: noticeHtml({ title, body, image }),
        image: image || "",
      }),
    );
  }
  return { ok: true, results };
}

export async function sendLowStockAlerts(businessId, itemIds = []) {
  const settings = await loadAlertSettings();
  if (!flagOn(settings.alert_low_stock, true) || !businessId) return { skipped: true };
  const ids = [...new Set((itemIds || []).filter(Boolean))];
  if (!ids.length) return { skipped: true };
  const ph = ids.map(() => "?").join(",");
  const items = await query(
    `SELECT id, name, stock_gm, reorder_level_gm FROM items
     WHERE business_id = ? AND id IN (${ph}) AND status = 'active'
       AND reorder_level_gm > 0 AND stock_gm <= reorder_level_gm`,
    [businessId, ...ids],
  );
  if (!items.length) return { skipped: true };
  const day = new Date().toISOString().slice(0, 10);
  const fresh = [];
  for (const item of items) {
    if (await alreadySent(businessId, "low_stock", day, item.id)) continue;
    const marked = await markSent(businessId, "low_stock", day, item.id);
    if (marked) fresh.push(item);
  }
  if (!fresh.length) return { skipped: true, reason: "already-sent" };
  const shop = await shopContacts(businessId);
  const text = lowStockText(
    {
      shopName: shop.shopName,
      items: fresh.map((i) => ({ name: i.name, qtyLabel: `${Number(i.stock_gm) || 0}` })),
    },
    settings,
  );
  return dispatchAlert({
    phones: shop.phones,
    emails: shop.emails,
    subject: `Low stock · ${shop.shopName}`,
    text,
  });
}

function ymdInZone(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const pick = (t) => parts.find((p) => p.type === t)?.value;
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function hourInZone(timeZone) {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || "Asia/Kolkata",
    hour: "numeric",
    hourCycle: "h23",
  }).format(new Date());
  return Number(hour);
}

export async function sendClosingAlerts(businessId) {
  const settings = await loadAlertSettings();
  if (!flagOn(settings.alert_closing, true)) return { skipped: true };
  const shop = await shopContacts(businessId);
  if (!shop.businessId) return { skipped: true };
  const hour = hourInZone(shop.timezone);
  const closeHour = Number(settings.alert_closing_hour) || 22;
  if (hour < closeHour) return { skipped: true, reason: "before-close" };
  const day = ymdInZone(shop.timezone);
  if (await alreadySent(shop.businessId, "closing", day, "")) return { skipped: true, reason: "already-sent" };
  if (!(await markSent(shop.businessId, "closing", day, ""))) return { skipped: true, reason: "already-sent" };
  const [sum] = await query(
    `SELECT COUNT(*) AS bills,
            COALESCE(SUM(total),0) AS takings,
            COALESCE(SUM(gst),0) AS gst,
            COALESCE(SUM(CASE WHEN LOWER(payment_method)='cash' THEN total ELSE 0 END),0) AS cash,
            COALESCE(SUM(CASE WHEN LOWER(payment_method)='upi' THEN total ELSE 0 END),0) AS upi,
            COALESCE(SUM(CASE WHEN LOWER(payment_method)='card' THEN total ELSE 0 END),0) AS card,
            COALESCE(SUM(CASE WHEN LOWER(payment_method)='credit' THEN total ELSE 0 END),0) AS credit
     FROM sales_orders
     WHERE business_id = ? AND DATE(created_at) = ? AND COALESCE(status,'') <> 'cancelled'`,
    [shop.businessId, day],
  );
  const low = flagOn(settings.alert_low_stock, true)
    ? await query(
        `SELECT name FROM items
         WHERE business_id = ? AND status = 'active' AND reorder_level_gm > 0 AND stock_gm <= reorder_level_gm
         ORDER BY name LIMIT 12`,
        [shop.businessId],
      )
    : [];
  const text = closingText(
    {
      shopName: shop.shopName,
      day,
      bills: sum?.bills,
      takings: sum?.takings,
      gst: sum?.gst,
      cash: sum?.cash,
      upi: sum?.upi,
      card: sum?.card,
      credit: sum?.credit,
      lowStock: low,
    },
    settings,
  );
  return dispatchAlert({
    phones: shop.phones,
    emails: shop.emails,
    subject: `Closing sales · ${shop.shopName} · ${day}`,
    text,
  });
}

export async function tickShopAlerts(businessId) {
  try {
    return await sendClosingAlerts(businessId);
  } catch (err) {
    console.error("closing alert failed:", err.message);
    return { ok: false, error: String(err.message || err) };
  }
}

export async function tickAllClosingAlerts() {
  const shops = await query("SELECT id FROM businesses WHERE COALESCE(status,'active') = 'active'");
  const results = [];
  for (const row of shops) results.push(await tickShopAlerts(row.id));
  return results;
}

export async function sendTestAlert({ number, businessId } = {}) {
  const settings = await loadAlertSettings();
  const shop = businessId ? await shopContacts(businessId) : { phones: [], emails: [], shopName: "Master Admin" };
  const phone = normalizeInMobile(number) || shop.phones[0];
  if (!phone) throw new Error("Enter a 10-digit mobile number");
  const text = testText();
  const support = await getPlatformSettings();
  const extraEmail = support.support_email && support.support_email.includes("@") ? [support.support_email] : [];
  return dispatchAlert({
    phones: [phone],
    emails: [...shop.emails, ...extraEmail],
    subject: "ATAV POS WhatsApp test",
    text,
  });
}

let ticking = false;
let schedulerStarted = false;
export function startAlertScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const run = async () => {
    if (ticking) return;
    ticking = true;
    try {
      await tickAllClosingAlerts();
    } catch (err) {
      console.error("alert scheduler:", err.message);
    } finally {
      ticking = false;
    }
  };
  setTimeout(run, 15000);
  setInterval(run, 5 * 60 * 1000);
}
