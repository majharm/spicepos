import os from "node:os";
import { query } from "./db.js";
import { publicStatus } from "./subscription.js";
import { platformAudit } from "./audit.js";

export const ONLINE_WINDOW_MINUTES = 5;

const ONLINE_SQL = `revoked_at IS NULL AND expires_at > NOW() AND COALESCE(last_seen_at, created_at) >= DATE_SUB(NOW(), INTERVAL ${ONLINE_WINDOW_MINUTES} MINUTE)`;
const SESSION_ONLINE_SQL = `s.revoked_at IS NULL AND s.expires_at > NOW() AND COALESCE(s.last_seen_at, s.created_at) >= DATE_SUB(NOW(), INTERVAL ${ONLINE_WINDOW_MINUTES} MINUTE)`;

const RANGE_SQL = {
  today: {
    label: "Today",
    current: "created_at >= CURDATE() AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)",
    previous: "created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND created_at < CURDATE()",
  },
  yesterday: {
    label: "Yesterday",
    current: "created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND created_at < CURDATE()",
    previous: "created_at >= DATE_SUB(CURDATE(), INTERVAL 2 DAY) AND created_at < DATE_SUB(CURDATE(), INTERVAL 1 DAY)",
  },
  "7": {
    label: "Last 7 days",
    current: "created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)",
    previous: "created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY) AND created_at < DATE_SUB(CURDATE(), INTERVAL 6 DAY)",
  },
  "30": {
    label: "Last 30 days",
    current: "created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)",
    previous: "created_at >= DATE_SUB(CURDATE(), INTERVAL 59 DAY) AND created_at < DATE_SUB(CURDATE(), INTERVAL 29 DAY)",
  },
  month: {
    label: "This month",
    current: "created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)",
    previous: "created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND created_at < DATE_FORMAT(CURDATE(), '%Y-%m-01')",
  },
  prev: {
    label: "Last month",
    current: "created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND created_at < DATE_FORMAT(CURDATE(), '%Y-%m-01')",
    previous: "created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 2 MONTH), '%Y-%m-01') AND created_at < DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')",
  },
};

export function growthPct(current, previous) {
  const now = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) return now === 0 ? 0 : null;
  return Math.round(((now - prev) / prev) * 1000) / 10;
}

export function insightWindow(range) {
  return RANGE_SQL[String(range || "30")] || RANGE_SQL["30"];
}

export function clientDevice(ua) {
  const text = String(ua || "");
  const device = /iPad|Tablet/i.test(text) ? "Tablet" : /Mobile|Android|iPhone/i.test(text) ? "Phone" : text ? "Desktop" : "—";
  let browser = "—";
  if (/Edg\//.test(text)) browser = "Edge";
  else if (/Chrome\/|CriOS\//.test(text)) browser = "Chrome";
  else if (/Firefox\//.test(text)) browser = "Firefox";
  else if (/Safari\//.test(text)) browser = "Safari";
  return { device, browser };
}

function likeTerm(value) {
  return `%${String(value).replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

function kpi(value, previous) {
  const current = Number(value) || 0;
  const prev = previous === undefined ? null : Number(previous) || 0;
  return {
    value: current,
    previous: prev,
    growth: prev === null ? null : growthPct(current, prev),
  };
}

async function scalar(sql, params = []) {
  const [row] = await query(sql, params);
  return Number(row?.n || 0);
}

async function salesPair(where) {
  const [row] = await query(
    `SELECT COALESCE(SUM(total), 0) AS sales, COUNT(*) AS bills
     FROM sales_orders
     WHERE ${where} AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'void')`,
  );
  return { sales: Number(row?.sales || 0), bills: Number(row?.bills || 0) };
}

const LIVE_FROM = `
  FROM staff_users u
  LEFT JOIN businesses b ON b.id = u.business_id
  LEFT JOIN subscription_plans p ON p.id = b.plan_id
  LEFT JOIN staff_sessions s ON s.id = (
    SELECT s2.id FROM staff_sessions s2
    WHERE s2.staff_user_id = u.id
    ORDER BY COALESCE(s2.last_seen_at, s2.created_at) DESC
    LIMIT 1
  )
`;

export async function liveUserCounts() {
  const [counts, shops] = await Promise.all([
    query(
      `SELECT
         (SELECT COUNT(*) FROM staff_users) AS registered,
         (SELECT COUNT(*) FROM staff_users WHERE status = 'active') AS active_accounts,
         (SELECT COUNT(*) FROM staff_users WHERE created_at >= CURDATE() AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)) AS new_today,
         (SELECT COUNT(*) FROM staff_sessions WHERE ${ONLINE_SQL}) AS sessions,
         (SELECT COUNT(DISTINCT staff_user_id) FROM staff_sessions WHERE ${ONLINE_SQL}) AS online,
         (SELECT COUNT(DISTINCT staff_user_id) FROM staff_sessions
           WHERE COALESCE(last_seen_at, created_at) >= CURDATE()
             AND COALESCE(last_seen_at, created_at) < DATE_ADD(CURDATE(), INTERVAL 1 DAY)) AS active_today`,
    ),
    query("SELECT status, subscription_expires_at FROM businesses"),
  ]);
  const row = counts[0] || {};
  const registered = Number(row.registered || 0);
  const online = Number(row.online || 0);
  return {
    registered,
    activeAccounts: Number(row.active_accounts || 0),
    online,
    offline: Math.max(0, registered - online),
    activeToday: Number(row.active_today || 0),
    newToday: Number(row.new_today || 0),
    sessions: Number(row.sessions || 0),
    activeBusinesses: shops.filter((shop) => publicStatus(shop) === "active").length,
    onlineWindowSeconds: ONLINE_WINDOW_MINUTES * 60,
  };
}

export async function listLiveUsers(input = {}) {
  const q = String(input.q || "").trim().slice(0, 80);
  const presence = ["online", "offline"].includes(input.presence) ? input.presence : "all";
  const category = String(input.category || "").trim().slice(0, 80);
  const plan = String(input.plan || "").trim().slice(0, 64);
  const sort = input.sort === "name" ? "name" : "activity";
  const pageSize = Math.min(50, Math.max(1, Number(input.pageSize) || 20));
  const page = Math.max(1, Number(input.page) || 1);
  const where = ["1=1"];
  const params = [];
  if (q) {
    where.push("(u.email LIKE ? OR u.mobile LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.username LIKE ? OR b.name LIKE ? OR b.owner_name LIKE ?)");
    const like = likeTerm(q);
    params.push(like, like, like, like, like, like, like);
  }
  if (presence === "online") where.push(SESSION_ONLINE_SQL);
  if (presence === "offline") where.push(`NOT (${SESSION_ONLINE_SQL})`);
  if (category) {
    where.push("(b.business_type = ? OR b.category = ?)");
    params.push(category, category);
  }
  if (plan) {
    where.push("b.plan_id = ?");
    params.push(plan);
  }
  const order = sort === "name" ? "b.name ASC, u.email ASC" : "COALESCE(s.last_seen_at, s.created_at) DESC, u.email ASC";
  const filter = where.join(" AND ");
  const [countRow] = await query(`SELECT COUNT(*) AS n ${LIVE_FROM} WHERE ${filter}`, params);
  const total = Number(countRow?.n || 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const rows = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.mobile, u.username, u.role, u.status AS account_status,
            b.name AS business_name, b.owner_name, b.mobile AS business_mobile, b.category, b.business_type,
            b.status AS business_status, b.subscription_expires_at, b.plan_id, p.name AS plan_name,
            s.id AS session_id, s.created_at AS last_login, s.last_seen_at, s.user_agent, s.revoked_at, s.expires_at,
            CASE WHEN ${SESSION_ONLINE_SQL} THEN 1 ELSE 0 END AS online
     ${LIVE_FROM}
     WHERE ${filter}
     ORDER BY ${order}
     LIMIT ${pageSize} OFFSET ${(safePage - 1) * pageSize}`,
    params,
  );
  const [categories, plans] = await Promise.all([
    query("SELECT business_type, category FROM businesses"),
    query("SELECT id, name FROM subscription_plans ORDER BY name"),
  ]);
  const categorySet = new Set();
  categories.forEach((row) => {
    const label = String(row.business_type || row.category || "").trim();
    if (label) categorySet.add(label);
  });
  return {
    counts: await liveUserCounts(),
    page: safePage,
    pageSize,
    total,
    pages,
    filters: {
      categories: [...categorySet].sort((a, b) => a.localeCompare(b)),
      plans,
    },
    rows: rows.map((row) => {
      const client = clientDevice(row.user_agent);
      const name = `${row.first_name || ""} ${row.last_name || ""}`.trim();
      return {
        id: row.id,
        name: name || row.username || row.email || "Staff",
        businessName: row.business_name || "—",
        ownerName: row.owner_name || "—",
        mobile: row.mobile || row.business_mobile || "",
        email: row.email || "",
        category: row.business_type || row.category || "Other",
        online: Number(row.online) === 1,
        lastLogin: row.last_login || null,
        lastActivity: row.last_seen_at || row.last_login || null,
        device: client.device,
        browser: client.browser,
        plan: row.plan_name || row.plan_id || "—",
        accountStatus: row.account_status || "active",
        businessStatus: publicStatus({
          status: row.business_status,
          subscription_expires_at: row.subscription_expires_at,
        }),
        role: row.role || "",
        sessionId: Number(row.online) === 1 ? row.session_id : null,
      };
    }),
  };
}

export async function liveUserSessions(userId) {
  const id = String(userId || "");
  const [user] = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.mobile, b.name AS business_name
     FROM staff_users u LEFT JOIN businesses b ON b.id = u.business_id
     WHERE u.id = ? LIMIT 1`,
    [id],
  );
  if (!user) return null;
  const rows = await query(
    `SELECT id, created_at, last_seen_at, expires_at, revoked_at, user_agent, ip, branch_id
     FROM staff_sessions WHERE staff_user_id = ? ORDER BY created_at DESC LIMIT 30`,
    [id],
  );
  return {
    user: {
      id: user.id,
      email: user.email || "",
      name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email || "Staff",
      mobile: user.mobile || "",
      businessName: user.business_name || "—",
    },
    sessions: rows.map((row) => {
      const client = clientDevice(row.user_agent);
      const online = !row.revoked_at && new Date(row.expires_at) > new Date() && row.last_seen_at
        && Date.now() - new Date(row.last_seen_at).getTime() <= ONLINE_WINDOW_MINUTES * 60 * 1000;
      return {
        id: row.id,
        started: row.created_at,
        lastActivity: row.last_seen_at || null,
        expires: row.expires_at,
        ended: row.revoked_at || null,
        device: client.device,
        browser: client.browser,
        ip: row.ip || "",
        online: Boolean(online),
      };
    }),
  };
}

export async function revokeLiveSession(sessionId, admin, req) {
  const id = String(sessionId || "");
  const [row] = await query(
    `SELECT s.id, s.staff_user_id, u.email FROM staff_sessions s
     LEFT JOIN staff_users u ON u.id = s.staff_user_id
     WHERE s.id = ? LIMIT 1`,
    [id],
  );
  if (!row) throw new Error("Session not found");
  await query("UPDATE staff_sessions SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL", [id]);
  await platformAudit(admin, "Session ended", { module: "users", target_id: row.staff_user_id, target_name: row.email || id }, req);
  return { ok: true, id };
}

export async function masterInsights(range = "30") {
  const window = insightWindow(range);
  const key = RANGE_SQL[String(range || "30")] ? String(range || "30") : "30";
  const today = RANGE_SQL.today;
  const month = RANGE_SQL.month;
  const [
    shops,
    rangeSales,
    prevSales,
    todaySales,
    yesterdaySales,
    monthSales,
    prevMonthSales,
    newBusinesses,
    prevBusinesses,
    newUsers,
    prevUsers,
    counts,
    series,
    renewals,
    newToday,
  ] = await Promise.all([
    query("SELECT id, name, status, subscription_expires_at, plan_id, fee_monthly, business_type, category, created_at FROM businesses"),
    salesPair(window.current),
    salesPair(window.previous),
    salesPair(today.current),
    salesPair(today.previous),
    salesPair(month.current),
    salesPair(month.previous),
    scalar(`SELECT COUNT(*) AS n FROM businesses WHERE ${window.current}`),
    scalar(`SELECT COUNT(*) AS n FROM businesses WHERE ${window.previous}`),
    scalar(`SELECT COUNT(*) AS n FROM staff_users WHERE ${window.current}`),
    scalar(`SELECT COUNT(*) AS n FROM staff_users WHERE ${window.previous}`),
    liveUserCounts(),
    query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COALESCE(SUM(total), 0) AS sales, COUNT(*) AS bills
       FROM sales_orders
       WHERE ${window.current} AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'void')
       GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
       ORDER BY day
       LIMIT 120`,
    ),
    query(
      `SELECT id, name, subscription_expires_at FROM businesses
       WHERE subscription_expires_at >= CURDATE() AND subscription_expires_at < DATE_ADD(CURDATE(), INTERVAL 14 DAY)
       ORDER BY subscription_expires_at, name
       LIMIT 20`,
    ),
    query(
      `SELECT id, name, created_at FROM businesses
       WHERE created_at >= CURDATE() AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
       ORDER BY created_at DESC LIMIT 10`,
    ),
  ]);
  const buckets = { active: 0, expired: 0, trial: 0, suspended: 0, inactive: 0 };
  const categories = new Map();
  let arr = 0;
  shops.forEach((shop) => {
    const status = publicStatus(shop);
    if (buckets[status] !== undefined) buckets[status] += 1;
    else buckets.inactive += 1;
    if (shop.plan_id === "trial") buckets.trial += 1;
    if (status === "active") arr += Number(shop.fee_monthly || 0);
    const label = String(shop.business_type || shop.category || "Other").trim() || "Other";
    categories.set(label, (categories.get(label) || 0) + 1);
  });
  const notices = [];
  newToday.forEach((shop) => {
    notices.push({ id: `biz-${shop.id}`, kind: "business", title: "New business", body: shop.name, at: shop.created_at });
  });
  renewals.forEach((shop) => {
    notices.push({
      id: `renew-${shop.id}`,
      kind: "renewal",
      title: "Renewal due",
      body: `${shop.name} · ${String(shop.subscription_expires_at).slice(0, 10)}`,
      at: shop.subscription_expires_at,
    });
  });
  shops.filter((shop) => publicStatus(shop) === "expired").slice(0, 8).forEach((shop) => {
    notices.push({ id: `expired-${shop.id}`, kind: "expired", title: "Subscription expired", body: shop.name, at: shop.subscription_expires_at });
  });
  return {
    range: { key, label: window.label },
    onlineWindowSeconds: ONLINE_WINDOW_MINUTES * 60,
    kpis: {
      businesses: { value: shops.length, previous: null, growth: null },
      users: { value: counts.registered, previous: null, growth: null },
      activeUsers: { value: counts.activeAccounts, previous: null, growth: null },
      online: { value: counts.online, previous: null, growth: null },
      offline: { value: counts.offline, previous: null, growth: null },
      activeToday: { value: counts.activeToday, previous: null, growth: null },
      sessions: { value: counts.sessions, previous: null, growth: null },
      newUsers: kpi(newUsers, prevUsers),
      newBusinesses: kpi(newBusinesses, prevBusinesses),
      activeSubscriptions: { value: buckets.active, previous: null, growth: null },
      expiredSubscriptions: { value: buckets.expired, previous: null, growth: null },
      trial: { value: shops.filter((shop) => shop.plan_id === "trial").length, previous: null, growth: null },
      arr: { value: Math.round(arr * 100) / 100, previous: null, growth: null },
      mrr: { value: Math.round((arr / 12) * 100) / 100, previous: null, growth: null },
      todaySales: kpi(todaySales.sales, yesterdaySales.sales),
      rangeSales: kpi(rangeSales.sales, prevSales.sales),
      monthSales: kpi(monthSales.sales, prevMonthSales.sales),
      invoices: kpi(rangeSales.bills, prevSales.bills),
    },
    feeNote: "Plan fees are the yearly amount stored on each active shop. MRR is that yearly fee divided by 12. Card-gateway collections are not stored.",
    series: series.map((row) => ({ day: row.day, sales: Number(row.sales || 0), bills: Number(row.bills || 0) })),
    categories: [...categories.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n),
    subscriptions: buckets,
    renewals: renewals.map((shop) => ({
      id: shop.id,
      name: shop.name,
      expires: String(shop.subscription_expires_at).slice(0, 10),
    })),
    notices,
    failedPayments: null,
    failedPaymentsNote: "No card-gateway failure ledger is stored. Unpaid bills stay on each shop's accounts screen.",
  };
}

export async function masterHealth() {
  const started = Date.now();
  await query("SELECT 1 AS ok");
  const load = typeof os.loadavg === "function" ? os.loadavg()[0] : null;
  return {
    ok: true,
    database: "connected",
    dbMs: Date.now() - started,
    uptimeSeconds: Math.round(process.uptime()),
    memoryRss: process.memoryUsage().rss,
    loadAvg: load,
    note: "Memory and load describe this Node process. Host credentials, paths, and environment values are not included.",
  };
}

export function businessesCsv(rows) {
  const header = ["id", "name", "owner", "mobile", "email", "type", "category", "status", "plan", "yearly_fee", "expires", "city", "state", "created"];
  const lines = [header.join(",")];
  rows.forEach((row) => {
    const cells = [
      row.id,
      row.name,
      row.owner_name,
      row.mobile,
      row.email,
      row.business_type,
      row.category,
      row.computed_status || row.status,
      row.plan_name || row.plan_id,
      row.fee_monthly,
      row.subscription_expires_at ? String(row.subscription_expires_at).slice(0, 10) : "",
      row.city,
      row.state,
      row.created_at ? String(row.created_at).slice(0, 19) : "",
    ].map((value) => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    });
    lines.push(cells.join(","));
  });
  return `\uFEFF${lines.join("\n")}\n`;
}

export function registerMasterLive(app) {
  app.get("/api/master/insights", (req, res) => {
    const range = String(req.query?.range || "30");
    masterInsights(range).then((data) => res.json(data)).catch((err) => res.status(500).json({ error: String(err.message) }));
  });
  app.get("/api/master/health", (_req, res) => {
    masterHealth().then((data) => res.json(data)).catch((err) => res.status(500).json({ error: String(err.message) }));
  });
  app.get("/api/master/live-users", (req, res) => {
    listLiveUsers(req.query || {}).then((data) => res.json(data)).catch((err) => res.status(500).json({ error: String(err.message) }));
  });
  app.get("/api/master/live-users/:id", (req, res) => {
    liveUserSessions(req.params.id).then((data) => {
      if (!data) res.status(404).json({ error: "User not found" });
      else res.json(data);
    }).catch((err) => res.status(500).json({ error: String(err.message) }));
  });
  app.post("/api/master/sessions/:id/revoke", (req, res) => {
    revokeLiveSession(req.params.id, req.auth.admin, req)
      .then((data) => res.json(data))
      .catch((err) => res.status(err.message === "Session not found" ? 404 : 500).json({ error: String(err.message) }));
  });
  app.get("/api/master/businesses/export", async (req, res) => {
    try {
      const rows = await query(
        `SELECT b.*, p.name AS plan_name
         FROM businesses b LEFT JOIN subscription_plans p ON p.id = b.plan_id
         ORDER BY b.name`,
      );
      const shaped = rows.map((row) => ({ ...row, computed_status: publicStatus(row) }));
      await platformAudit(req.auth.admin, "Business export", { module: "businesses", target_name: `${shaped.length} shops` }, req);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=\"atav-businesses.csv\"");
      res.send(businessesCsv(shaped));
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });
}
