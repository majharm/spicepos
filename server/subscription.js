import crypto from "node:crypto";
import { query } from "./db.js";

export const SUBSCRIPTION_EXPIRED_TITLE = "Subscription Expired!";
export const SUBSCRIPTION_EXPIRED_MESSAGE =
  "Your business subscription has expired. Please renew your subscription to continue using ATAV POS.";

const BLOCKS = {
  expired: {
    code: "subscription_expired",
    title: SUBSCRIPTION_EXPIRED_TITLE,
    error: SUBSCRIPTION_EXPIRED_MESSAGE,
  },
  suspended: {
    code: "subscription_suspended",
    title: "Account suspended",
    error: "This business account is suspended. Contact support to restore access.",
  },
  inactive: {
    code: "subscription_inactive",
    title: "Account inactive",
    error: "This business account is inactive. Contact support to restore access.",
  },
};

export function calendarYmd(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const match = String(value).match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

export function shopTodayYmd(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function publicStatus(business, today = shopTodayYmd()) {
  if (!business) return "inactive";
  if (business.status === "suspended" || business.status === "inactive") return business.status;
  const exp = calendarYmd(business.subscription_expires_at);
  if (exp && exp < today) return "expired";
  return business.status || "active";
}

export function subscriptionBlock(status) {
  return BLOCKS[status] || null;
}

export function subscriptionDenial(business, status, plan = null) {
  const block = subscriptionBlock(status);
  if (!block) return null;
  const brief = plan
    ? {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        fee_monthly: plan.fee_monthly,
      }
    : null;
  return {
    ok: false,
    code: block.code,
    title: block.title,
    error: block.error,
    status,
    business: {
      id: business?.id ?? null,
      name: business?.name ?? null,
      subscription_expires_at: calendarYmd(business?.subscription_expires_at) || null,
    },
    plan: brief,
  };
}

export function addYearsYmd(ymd, years = 1) {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  return calendarYmd(new Date(Date.UTC(y + years, m - 1, d)));
}

export function extendExpiryYmd(current, today = shopTodayYmd(), years = 1) {
  const cur = calendarYmd(current);
  const base = cur && cur > today ? cur : today;
  return addYearsYmd(base, years);
}

export function isRenewalApiPath(method, path) {
  const p = String(path || "").split("?")[0];
  return String(method || "GET").toUpperCase() === "GET" && (p === "/api/billing/renewal" || p === "billing/renewal");
}

let historyReady = null;

export function ensureSubscriptionHistory() {
  if (!historyReady) {
    historyReady = query(`CREATE TABLE IF NOT EXISTS business_subscription_events (
      id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      action VARCHAR(32) NOT NULL,
      status VARCHAR(32) NULL,
      plan_id VARCHAR(255) NULL,
      expires_at DATE NULL,
      note VARCHAR(255) NULL,
      actor_email VARCHAR(255) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_bse_biz (business_id, created_at)
    )`).catch((err) => {
      historyReady = null;
      throw err;
    });
  }
  return historyReady;
}

export async function recordSubscriptionEvent(businessId, fields = {}) {
  if (!businessId) return;
  try {
    await ensureSubscriptionHistory();
    await query(
      `INSERT INTO business_subscription_events
        (id, business_id, action, status, plan_id, expires_at, note, actor_email)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        businessId,
        String(fields.action || "edit").slice(0, 32),
        fields.status || null,
        fields.planId || null,
        calendarYmd(fields.expiresAt) || null,
        fields.note ? String(fields.note).slice(0, 255) : null,
        fields.actorEmail || null,
      ],
    );
  } catch (err) {
    console.error("subscription history:", err.message);
  }
}
