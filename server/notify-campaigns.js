/** Shared rules for Master Admin notification campaigns. WhatsApp sends stay on the existing WAMaster client. */

export const NOTIFY_CHANNELS = ["in_app", "push", "whatsapp"];

export const NOTIFY_AUDIENCES = [
  "all",
  "selected",
  "one",
  "restaurant",
  "retail",
  "garment",
  "pharmacy",
  "cafe",
  "salon",
  "active",
  "expired",
  "category",
];

export const NOTIFY_TEMPLATES = {
  feature:
    "Hello {{owner_name}},\n\nGreetings from ATAV POS!\n\nWe have introduced exciting new features to improve your business operations.\n\nLogin to your ATAV POS account and explore the latest updates.\n\nThank you,\nTeam ATAV Telecom.",
  renewal:
    "Hello {{owner_name}},\n\nYour ATAV POS plan {{subscription_plan}} for {{business_name}} is due on {{expiry_date}}.\n\nRenew from your account so billing stays uninterrupted.\n\nThank you,\nTeam ATAV Telecom.",
};

const OPT_OUT_LINE = "Reply STOP to opt out of ATAV POS WhatsApp updates.";

export function normalizeOwnerMobile(raw) {
  let digits = String(raw || "").replace(/\D+/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("91") && digits.length >= 12) digits = digits.slice(-10);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  else if (digits.length > 10) digits = digits.slice(-10);
  return /^\d{10}$/.test(digits) ? digits : "";
}

export function intlOwnerMobile(raw, country = "91") {
  const local = normalizeOwnerMobile(raw);
  const cc = String(country || "91").replace(/\D+/g, "") || "91";
  return local ? `${cc}${local}` : "";
}

export function notifyChannels(raw) {
  if (raw == null || raw === "" || raw === "all") return [...NOTIFY_CHANNELS];
  const list = Array.isArray(raw) ? raw : String(raw).split(",");
  const out = [];
  for (const item of list) {
    const key = String(item || "").trim().toLowerCase();
    if (key === "all") return [...NOTIFY_CHANNELS];
    if (NOTIFY_CHANNELS.includes(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

export function notifyAudience(raw) {
  const key = String(raw || "all").trim().toLowerCase();
  return NOTIFY_AUDIENCES.includes(key) ? key : "";
}

function bizText(biz) {
  return `${biz?.category || ""} ${biz?.business_type || ""}`.toLowerCase();
}

export function subscriptionActive(biz, today) {
  const day = String(today || "").slice(0, 10);
  const status = String(biz?.status || "active").toLowerCase();
  if (status === "inactive" || status === "suspended" || status === "expired") return false;
  const exp = String(biz?.subscription_expires_at || "").slice(0, 10);
  if (!exp) return true;
  return exp >= day;
}

export function audienceMatch(biz, audience, { ids = [], category = "", today = "" } = {}) {
  const key = notifyAudience(audience);
  if (!key || !biz?.id) return false;
  if (key === "all") return true;
  if (key === "selected" || key === "one") return ids.map(String).includes(String(biz.id));
  if (key === "active") return subscriptionActive(biz, today);
  if (key === "expired") return !subscriptionActive(biz, today);
  if (key === "category") {
    const want = String(category || "").trim().toLowerCase();
    return want !== "" && bizText(biz).includes(want);
  }
  return bizText(biz).includes(key);
}

export function fillNotifyVars(text, row = {}) {
  const mobile = normalizeOwnerMobile(row.mobile);
  const map = {
    "{{business_name}}": row.business_name || row.name || "your business",
    "{{owner_name}}": row.owner_name || "there",
    "{{mobile_number}}": mobile ? `+91${mobile}` : "",
    "{{subscription_plan}}": row.plan_name || "your plan",
    "{{expiry_date}}": String(row.subscription_expires_at || "").slice(0, 10) || "—",
  };
  let out = String(text || "");
  for (const [token, value] of Object.entries(map)) out = out.split(token).join(value);
  return out;
}

export function composeWhatsAppBody(text, link = "") {
  let body = String(text || "").trim();
  const href = String(link || "").trim();
  if (href && !body.includes(href)) body = `${body}\n${href}`.trim();
  if (body && !/opt out/i.test(body)) body = `${body}\n\n${OPT_OUT_LINE}`;
  return body;
}

export function safeHttpsUrl(raw, label) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (!/^https:\/\//i.test(value) || value.length > 500) {
    throw new Error(`${label} must be an https link`);
  }
  return value;
}

/**
 * Decide each channel before any API call.
 * seenMobiles prevents a second WhatsApp to the same number inside one campaign.
 */
export function classifyRecipient(row, { channels, seenMobiles, recentDuplicate = false } = {}) {
  const use = new Set(notifyChannels(channels));
  const mobile = normalizeOwnerMobile(row.mobile);
  const consent = Number(row.whatsapp_consent) === 1;
  const optedOut = Number(row.whatsapp_opt_out) === 1;
  let wa = "skipped";
  let reason = "";
  if (!use.has("whatsapp")) reason = "channel-off";
  else if (!mobile) reason = row.mobile ? "invalid-mobile" : "missing-mobile";
  else if (optedOut) reason = "opt-out";
  else if (!consent) reason = "no-consent";
  else if (seenMobiles?.has(mobile) || recentDuplicate) reason = "duplicate";
  else {
    wa = "pending";
    seenMobiles?.add(mobile);
  }
  return {
    mobile,
    dedupe: wa === "pending" && mobile ? mobile : `biz:${row.id || row.business_id || ""}`,
    wa,
    waReason: reason,
    app: use.has("in_app") ? "pending" : "skipped",
    push: use.has("push") ? "pending" : "skipped",
  };
}

/** API acceptance is sent or still pending. Delivered and read require an explicit provider state. */
export function waAcceptanceStatus(result = {}) {
  if (!result.ok) return "failed";
  const json = result.json && typeof result.json === "object" ? result.json : {};
  const raw = String(json.status || json.delivery || result.delivery || "").toLowerCase();
  if (raw === "read") return "read";
  if (raw === "delivered") return "delivered";
  if (raw === "queued" || result.queued || raw === "pending") return "pending";
  return "sent";
}

export function rollupRecipients(rows = []) {
  const count = (key, status) => rows.filter((row) => row[key] === status).length;
  const waPending = count("wa", "pending") + count("wa_status", "pending");
  const pick = (row, a, b) => row[a] || row[b] || "";
  const tally = (field) => ({
    sent: rows.filter((row) => pick(row, field, `${field}_status`) === "sent").length,
    delivered: rows.filter((row) => pick(row, field, `${field}_status`) === "delivered").length,
    read: rows.filter((row) => pick(row, field, `${field}_status`) === "read").length,
    failed: rows.filter((row) => pick(row, field, `${field}_status`) === "failed").length,
    pending: rows.filter((row) => pick(row, field, `${field}_status`) === "pending").length,
    skipped: rows.filter((row) => pick(row, field, `${field}_status`) === "skipped").length,
  });
  const wa = tally("wa");
  const app = tally("app");
  const push = tally("push");
  return {
    total: rows.length,
    wa,
    app,
    push,
    open: waPending + app.pending + push.pending,
  };
}

export function campaignStatusFromRollup(rollup, { cancelled = false, scheduled = false } = {}) {
  if (cancelled) return "cancelled";
  if (scheduled) return "scheduled";
  if ((rollup?.open || 0) > 0) return "sending";
  const failed = (rollup?.wa?.failed || 0) + (rollup?.push?.failed || 0);
  const sent = (rollup?.wa?.sent || 0) + (rollup?.wa?.delivered || 0) + (rollup?.wa?.read || 0) + (rollup?.app?.sent || 0) + (rollup?.app?.read || 0) + (rollup?.push?.sent || 0);
  if (failed && sent) return "partial";
  if (failed && !sent) return "failed";
  return "sent";
}
