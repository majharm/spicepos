import { query } from "./db.js";
import { requireMaster } from "./auth.js";
import { publicStatus } from "./subscription.js";
import { createdToday, saleNotVoidSql } from "./sql-time.js";
import { listLiveUsers, masterHealth } from "./master-live.js";
import { masterIpMap } from "./ip-geo.js";
import { masterBizTraffic } from "./biz-traffic.js";
import { masterSyncStatus } from "./sync-status.js";

export const API_V1_BASE = "/api/v1";

export const API_V1_ROUTES = [
  { module: "Overview", method: "GET", path: "/dashboard/overview" },
  { module: "Live Users", method: "GET", path: "/users/live" },
  { module: "Traffic Map", method: "GET", path: "/analytics/traffic-map" },
  { module: "Business Map", method: "GET", path: "/businesses/map" },
  { module: "Offline Sync", method: "GET", path: "/sync/status" },
  { module: "Business", method: "GET", path: "/businesses" },
  { module: "Users", method: "GET", path: "/users" },
  { module: "Subscription", method: "GET", path: "/subscriptions" },
  { module: "Plans", method: "GET", path: "/plans" },
  { module: "Payments", method: "GET", path: "/payments" },
  { module: "Revenue", method: "GET", path: "/analytics/revenue" },
  { module: "Offers", method: "GET", path: "/offers" },
  { module: "Profit", method: "GET", path: "/analytics/profit" },
  { module: "Reports", method: "GET", path: "/reports" },
  { module: "Monitoring", method: "GET", path: "/system/health" },
  { module: "Activity Logs", method: "GET", path: "/logs/activity" },
];

const REPORT_CATALOG = [
  { id: "sales", title: "Sales", path: "/api/reports" },
  { id: "item-sales", title: "Item sales", path: "/api/reports/item-sales" },
  { id: "item-purchases", title: "Item purchases", path: "/api/reports/item-purchases" },
  { id: "item-oversells", title: "Item oversells", path: "/api/reports/item-oversells" },
  { id: "offer-profit", title: "Offer profit", path: "/api/reports/offer-profit" },
  { id: "dsa-sales", title: "DSA sales", path: "/api/master/dsa-sales" },
];

function publicBase() {
  const env = String(process.env.APP_PUBLIC_URL || process.env.POS_PUBLIC_URL || "https://pos.atavtelecom.in").replace(/\/+$/, "");
  return `${env}${API_V1_BASE}`;
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function dayText(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = String(value).match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

async function optional(sql, params = []) {
  try {
    return await query(sql, params);
  } catch {
    return null;
  }
}

async function overview() {
  const shops = await query(
    `SELECT id, status, subscription_expires_at, plan_id
     FROM businesses
     WHERE COALESCE(status, '') <> 'deleted'`,
  );
  const plans = await query("SELECT id, fee_monthly FROM subscription_plans");
  const fee = new Map(plans.map((plan) => [plan.id, Number(plan.fee_monthly) || 0]));
  const statuses = shops.map((shop) => publicStatus(shop));
  const [users] = await query(
    `SELECT COUNT(*) AS n
     FROM staff_users u
     JOIN businesses b ON b.id = u.business_id
     WHERE u.status <> 'deleted' AND COALESCE(b.status, '') <> 'deleted'`,
  );
  const [sales] = await query(
    `SELECT COALESCE(SUM(total), 0) AS sales, COUNT(*) AS bills
     FROM sales_orders
     WHERE ${createdToday()} AND ${saleNotVoidSql()}`,
  );
  const devices = await optional("SELECT COUNT(*) AS n FROM pos_devices");
  let subscriptionRevenue = 0;
  shops.forEach((shop) => {
    if (publicStatus(shop) === "active") subscriptionRevenue += fee.get(shop.plan_id) || 0;
  });
  return {
    businesses: shops.length,
    active: statuses.filter((status) => status === "active").length,
    inactive: statuses.filter((status) => status === "inactive").length,
    expired: statuses.filter((status) => status === "expired").length,
    suspended: statuses.filter((status) => status === "suspended").length,
    trial: shops.filter((shop) => shop.plan_id === "trial").length,
    users: Number(users?.n) || 0,
    devices: Number(devices?.[0]?.n) || 0,
    today_sales: money(sales?.sales),
    today_bills: Number(sales?.bills) || 0,
    subscription_revenue: money(subscriptionRevenue),
  };
}

async function businesses() {
  const rows = await query(
    `SELECT b.id, b.name, b.owner_name, b.mobile, b.email, b.city, b.state,
            b.business_type, b.category, b.status, b.plan_id, b.subscription_expires_at, b.created_at,
            p.name AS plan_name, p.fee_monthly
     FROM businesses b
     LEFT JOIN subscription_plans p ON p.id = b.plan_id
     WHERE COALESCE(b.status, '') <> 'deleted'
     ORDER BY b.name
     LIMIT 500`,
  );
  return {
    businesses: rows.map((row) => ({
      id: row.id,
      name: row.name,
      owner_name: row.owner_name || "",
      mobile: row.mobile || "",
      email: row.email || "",
      city: row.city || "",
      state: row.state || "",
      business_type: row.business_type || "",
      category: row.category || "",
      status: publicStatus(row),
      plan_id: row.plan_id || "",
      plan_name: row.plan_name || "",
      fee_monthly: money(row.fee_monthly),
      subscription_expires_at: dayText(row.subscription_expires_at),
      created_at: row.created_at || null,
    })),
  };
}

async function users() {
  const rows = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.status, u.business_id, u.mobile, u.username,
            b.name AS business_name
     FROM staff_users u
     LEFT JOIN businesses b ON b.id = u.business_id
     WHERE u.status <> 'deleted' AND COALESCE(b.status, '') <> 'deleted'
     ORDER BY u.email
     LIMIT 500`,
  );
  return { users: rows };
}

async function subscriptions() {
  const { businesses: rows } = await businesses();
  return {
    subscriptions: rows.map((row) => ({
      business_id: row.id,
      business_name: row.name,
      status: row.status,
      plan_id: row.plan_id,
      plan_name: row.plan_name,
      fee_monthly: row.fee_monthly,
      expires_at: row.subscription_expires_at,
    })),
  };
}

async function plans() {
  const rows = await query(
    `SELECT id, code, name, max_branches, max_users, max_devices, max_products, max_invoices, fee_monthly, active
     FROM subscription_plans
     ORDER BY fee_monthly, name`,
  );
  return {
    plans: rows.map((row) => ({ ...row, fee_monthly: money(row.fee_monthly), active: Number(row.active) === 1 })),
  };
}

async function payments() {
  const rows = await optional(
    `SELECT e.id, e.business_id, b.name AS business_name, e.action, e.status, e.plan_id,
            p.name AS plan_name, p.fee_monthly, e.expires_at, e.note, e.actor_email, e.created_at
     FROM business_subscription_events e
     LEFT JOIN businesses b ON b.id = e.business_id
     LEFT JOIN subscription_plans p ON p.id = e.plan_id
     ORDER BY e.created_at DESC
     LIMIT 200`,
  );
  return {
    note: "These are subscription changes recorded by Master Admin. Shop bill receipts stay on each business.",
    payments: (rows || []).map((row) => ({
      id: row.id,
      business_id: row.business_id,
      business_name: row.business_name || "",
      action: row.action,
      status: row.status || "",
      plan_id: row.plan_id || "",
      plan_name: row.plan_name || "",
      fee_monthly: money(row.fee_monthly),
      expires_at: dayText(row.expires_at),
      note: row.note || "",
      actor_email: row.actor_email || "",
      created_at: row.created_at || null,
    })),
  };
}

async function revenue() {
  const days = await query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS bills, COALESCE(SUM(total), 0) AS sales
     FROM sales_orders
     WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       AND ${saleNotVoidSql()}
     GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
     ORDER BY day`,
  );
  const sales = days.reduce((sum, row) => sum + (Number(row.sales) || 0), 0);
  const bills = days.reduce((sum, row) => sum + (Number(row.bills) || 0), 0);
  const head = await overview();
  return {
    range_days: 30,
    sales: money(sales),
    bills,
    subscription_revenue: head.subscription_revenue,
    days: days.map((row) => ({ day: row.day, bills: Number(row.bills) || 0, sales: money(row.sales) })),
  };
}

async function offers() {
  const rows = await optional(
    `SELECT o.id, o.business_id, b.name AS business_name, o.name, o.offer_type, o.status,
            o.discount_type, o.discount_value, o.start_date, o.end_date, o.used_count
     FROM promo_offers o
     LEFT JOIN businesses b ON b.id = o.business_id
     ORDER BY o.updated_at DESC
     LIMIT 200`,
  );
  const list = rows || [];
  const counts = {};
  list.forEach((row) => {
    const key = String(row.status || "draft");
    counts[key] = (counts[key] || 0) + 1;
  });
  return {
    counts,
    offers: list.map((row) => ({
      ...row,
      discount_value: money(row.discount_value),
      used_count: Number(row.used_count) || 0,
      start_date: dayText(row.start_date),
      end_date: dayText(row.end_date),
    })),
  };
}

async function profit() {
  const rows = await optional(
    `SELECT COALESCE(SUM(l.amount), 0) AS sales, COALESCE(SUM(l.cost), 0) AS cost, COALESCE(SUM(l.profit), 0) AS profit
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id
     WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       AND ${saleNotVoidSql("o")}
       AND COALESCE(l.cancelled, 0) = 0`,
  );
  const row = rows?.[0];
  if (!row) {
    const head = await revenue();
    return { range_days: 30, sales: head.sales, cost: null, profit: null, note: "Line cost is not available." };
  }
  return {
    range_days: 30,
    sales: money(row.sales),
    cost: money(row.cost),
    profit: money(row.profit),
  };
}

async function reports() {
  const rows = await query(
    `SELECT b.id AS business_id, b.name AS business_name, COUNT(*) AS bills, COALESCE(SUM(o.total), 0) AS sales
     FROM sales_orders o
     JOIN businesses b ON b.id = o.business_id
     WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       AND ${saleNotVoidSql("o")}
       AND COALESCE(b.status, '') <> 'deleted'
     GROUP BY b.id, b.name
     ORDER BY sales DESC
     LIMIT 50`,
  );
  return {
    range_days: 30,
    businesses: rows.map((row) => ({
      business_id: row.business_id,
      business_name: row.business_name,
      bills: Number(row.bills) || 0,
      sales: money(row.sales),
    })),
    catalog: REPORT_CATALOG,
  };
}

async function activity() {
  const rows = await query(
    `SELECT l.id, l.created_at, l.actor_name, l.module, l.action, l.target_name, l.business_id,
            b.name AS business_name
     FROM staff_audit_logs l
     LEFT JOIN businesses b ON b.id = l.business_id AND l.business_id <> 'platform'
     ORDER BY l.created_at DESC
     LIMIT 200`,
  );
  return { logs: rows };
}

function catalog() {
  const base = publicBase();
  return {
    base: API_V1_BASE,
    public_base: base,
    auth: "Master admin session (pos_master cookie)",
    routes: API_V1_ROUTES.map((route) => ({
      ...route,
      url: `${base}${route.path}`,
    })),
  };
}

const HANDLERS = {
  "/": catalog,
  "/dashboard/overview": overview,
  "/users/live": (req) => listLiveUsers(req.query || {}),
  "/analytics/traffic-map": () => masterIpMap(),
  "/businesses/map": () => masterBizTraffic(),
  "/sync/status": () => masterSyncStatus(),
  "/businesses": businesses,
  "/users": users,
  "/subscriptions": subscriptions,
  "/plans": plans,
  "/payments": payments,
  "/analytics/revenue": revenue,
  "/offers": offers,
  "/analytics/profit": profit,
  "/reports": reports,
  "/system/health": () => masterHealth(),
  "/logs/activity": activity,
};

function routePath(req) {
  let raw = String(req.path || "/");
  if (raw.startsWith(API_V1_BASE)) raw = raw.slice(API_V1_BASE.length) || "/";
  if (raw === "" || raw === "/") return "/";
  return raw.replace(/\/+$/, "");
}

export function registerApiV1(app) {
  app.use(API_V1_BASE, requireMaster, (req, res) => {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, version: "v1", error: "This API is read-only" });
      return;
    }
    const path = routePath(req);
    const route = API_V1_ROUTES.find((item) => item.path === path);
    const handler = HANDLERS[path];
    if (!handler) {
      res.status(404).json({ ok: false, version: "v1", error: "Unknown API path", path });
      return;
    }
    Promise.resolve()
      .then(() => handler(req))
      .then((data) => {
        res.json({
          ok: true,
          version: "v1",
          base: API_V1_BASE,
          module: path === "/" ? "Index" : route.module,
          path,
          generated_at: new Date().toISOString(),
          data,
        });
      })
      .catch((err) => {
        res.status(500).json({ ok: false, version: "v1", error: String(err.message) });
      });
  });
}
