import crypto from "node:crypto";
import { query, withTransaction } from "./db.js";
import { bid } from "./context.js";
import { requirePerm } from "./auth.js";
import { hashPassword, verifyPassword } from "./password.js";
import { setPlatformSetting } from "./settings.js";
import { qrLineAmount, qrQuantityToBase } from "./qr-ordering.js";

const FOR_ALL_KEY = "online_store_for_all";
const STORE_OFF = "Online Store is turned off for this shop";
const BANNER_OFF = "Login banner management is turned off for this shop";
const SESSION_TTL = 60 * 60 * 24 * 14;

export function normalizeOnlineStore(val) {
  return val === true || val === 1 || val === "1" || val === "on" || val === "true" || val === "yes" ? 1 : 0;
}

export function onlineStoreForSignup(raw, forAll) {
  const body = raw || {};
  const has = Object.prototype.hasOwnProperty.call(body, "online_store") || Object.prototype.hasOwnProperty.call(body, "onlineStore");
  if (!has) return normalizeOnlineStore(forAll);
  const val = body.online_store != null && body.online_store !== "" ? body.online_store : body.onlineStore;
  return normalizeOnlineStore(val);
}

export function normalizeSlug(raw) {
  const slug = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) {
    throw new Error("Store URL must be 3–40 letters, numbers, or dashes");
  }
  if (["api", "admin", "store", "login", "master", "pos", "www"].includes(slug)) {
    throw new Error("Choose a different store URL");
  }
  return slug;
}

export function validateBannerDataUrl(dataUrl) {
  const raw = String(dataUrl || "");
  if (!raw) return "";
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(raw)) {
    throw new Error("Banner must be a JPG, PNG, or WebP image");
  }
  const b64 = raw.split(",")[1] || "";
  const bytes = Math.ceil((b64.length * 3) / 4);
  if (bytes < 32) throw new Error("Banner image is empty");
  if (bytes > 1_500_000) throw new Error("Banner must be under 1.5 MB");
  return raw;
}

export function storefrontBanner(row) {
  if (!row || Number(row.banner_enabled) !== 1) return { desktop: "", mobile: "" };
  return {
    desktop: String(row.banner_desktop || ""),
    mobile: String(row.banner_mobile || ""),
  };
}

export function buildStoreLine(item, quantity) {
  const unit = item?.base_unit || item?.unit || "PCS";
  const quantityBase = qrQuantityToBase(quantity, unit);
  const amount = qrLineAmount(quantityBase, item?.retail_rate, unit);
  const gstRate = Number(item?.gst_rate) || 0;
  const gst = Math.round(((amount * gstRate) / 100) * 100) / 100;
  return {
    quantityBase,
    amount,
    gst,
    gstRate,
    rate: Number(item?.retail_rate) || 0,
    unit,
  };
}

export async function ensureOnlineStoreSchema() {
  await query(`CREATE TABLE IF NOT EXISTS online_stores (
    business_id VARCHAR(255) PRIMARY KEY,
    slug VARCHAR(40) NOT NULL,
    store_name VARCHAR(160) NOT NULL,
    published TINYINT(1) NOT NULL DEFAULT 0,
    banner_enabled TINYINT(1) NOT NULL DEFAULT 0,
    banner_desktop MEDIUMTEXT NULL,
    banner_mobile MEDIUMTEXT NULL,
    updated_at TIMESTAMP(3) NULL,
    UNIQUE KEY uq_online_store_slug (slug)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS online_store_listings (
    business_id VARCHAR(255) NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    listed TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (business_id, item_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS online_customers (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    name VARCHAR(160) NOT NULL,
    mobile VARCHAR(32) NOT NULL,
    email VARCHAR(160) NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_online_customer_mobile (business_id, mobile)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS online_customer_sessions (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    customer_id VARCHAR(255) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    UNIQUE KEY uq_store_token (token_hash),
    INDEX idx_store_session (business_id, customer_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS online_orders (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    customer_id VARCHAR(255) NOT NULL,
    order_number VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    customer_name VARCHAR(160) NOT NULL,
    mobile VARCHAR(32) NOT NULL,
    address VARCHAR(255) NULL,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_online_orders_biz (business_id, created_at)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS online_order_lines (
    id VARCHAR(255) PRIMARY KEY,
    order_id VARCHAR(255) NOT NULL,
    business_id VARCHAR(255) NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    item_name VARCHAR(180) NOT NULL,
    quantity DECIMAL(12,3) NOT NULL,
    quantity_base DECIMAL(14,3) NOT NULL,
    rate DECIMAL(12,2) NOT NULL,
    gst_rate DECIMAL(8,2) NOT NULL DEFAULT 0,
    amount DECIMAL(12,2) NOT NULL,
    gst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    INDEX idx_online_lines_order (order_id),
    INDEX idx_online_lines_biz (business_id)
  )`);
  try {
    await query("ALTER TABLE businesses ADD COLUMN online_store TINYINT(1) NOT NULL DEFAULT 0");
  } catch {
    /* column already present */
  }
  try {
    await query("ALTER TABLE businesses ADD COLUMN store_banner_allowed TINYINT(1) NOT NULL DEFAULT 1");
  } catch {
    /* column already present */
  }
}

export async function onlineStoreForAll() {
  const [row] = await query("SELECT setting_value FROM platform_settings WHERE setting_key = ? LIMIT 1", [FOR_ALL_KEY]);
  return normalizeOnlineStore(row?.setting_value);
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function readCookie(req, name) {
  const raw = String(req.headers.cookie || "");
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function setStoreCookie(res, value, maxAgeSec, req) {
  const proto = String(req?.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const secure = process.env.COOKIE_SECURE === "1" || proto === "https";
  const flags = ["HttpOnly", "SameSite=Lax", secure ? "Secure" : ""].filter(Boolean).join("; ");
  res.append("Set-Cookie", `store_sid=${encodeURIComponent(value)}; Path=/; ${flags}; Max-Age=${maxAgeSec}`);
}

async function businessById(id) {
  const [row] = await query(
    "SELECT id, name, status, online_store, store_banner_allowed FROM businesses WHERE id = ? LIMIT 1",
    [id],
  );
  return row || null;
}

async function publicBusiness(slug) {
  const [row] = await query(
    `SELECT b.id, b.name, b.status, b.online_store, b.store_banner_allowed,
            s.slug, s.store_name, s.published, s.banner_enabled, s.banner_desktop, s.banner_mobile
     FROM online_stores s
     JOIN businesses b ON b.id = s.business_id
     WHERE s.slug = ? LIMIT 1`,
    [slug],
  );
  return row || null;
}

function storeUrl(req, slug) {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  return `${proto}://${host}/store.html?shop=${encodeURIComponent(slug)}`;
}

function assertModule(biz) {
  if (!biz || Number(biz.online_store) !== 1 || biz.status === "inactive") {
    const err = new Error(STORE_OFF);
    err.status = 403;
    throw err;
  }
}

async function loadStore(businessId) {
  const [row] = await query("SELECT * FROM online_stores WHERE business_id = ? LIMIT 1", [businessId]);
  return row || null;
}

async function catalogRows(businessId, { publicOnly = false } = {}) {
  const rows = await query(
    `SELECT i.id, i.name, i.category, i.retail_rate, i.gst_rate, i.stock_gm, i.status, i.unit, i.base_unit, i.image_url,
            l.listed
     FROM items i
     LEFT JOIN online_store_listings l ON l.business_id = i.business_id AND l.item_id = i.id
     WHERE i.business_id = ? AND i.status = 'active'
     ORDER BY i.category, i.name`,
    [businessId],
  );
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category || "General",
      retail_rate: Number(row.retail_rate) || 0,
      gst_rate: Number(row.gst_rate) || 0,
      stock_gm: Number(row.stock_gm) || 0,
      unit: row.base_unit || row.unit || "PCS",
      image_url: row.image_url || "",
      listed: row.listed == null ? 1 : Number(row.listed) === 1 ? 1 : 0,
    }))
    .filter((row) => (publicOnly ? row.listed === 1 && row.stock_gm > 0 : true));
}

async function customerFromCookie(req, businessId) {
  const token = readCookie(req, "store_sid");
  if (!token) return null;
  const [row] = await query(
    `SELECT c.id, c.business_id, c.name, c.mobile, c.email
     FROM online_customer_sessions s
     JOIN online_customers c ON c.id = s.customer_id AND c.business_id = s.business_id
     WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP(3) AND s.business_id = ?
     LIMIT 1`,
    [crypto.createHash("sha256").update(token).digest("hex"), businessId],
  );
  return row || null;
}

async function startCustomerSession(res, req, customer) {
  const token = crypto.randomBytes(32).toString("hex");
  await query(
    `INSERT INTO online_customer_sessions (id, business_id, customer_id, token_hash, expires_at)
     VALUES (?,?,?,?, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 14 DAY))`,
    [crypto.randomUUID(), customer.business_id, customer.id, crypto.createHash("sha256").update(token).digest("hex")],
  );
  setStoreCookie(res, token, SESSION_TTL, req);
}

function sendError(res, err) {
  res.status(err.status || 400).json({ error: String(err.message || err) });
}

export function registerOnlineStoreMaster(app) {
  app.get("/api/master/online-store", async (_req, res) => {
    try {
      await ensureOnlineStoreSchema();
      const forAll = await onlineStoreForAll();
      const businesses = await query(
        `SELECT b.id, b.name, b.city, b.business_type, b.category, b.status,
                b.online_store, b.store_banner_allowed, s.slug, s.published, s.store_name
         FROM businesses b
         LEFT JOIN online_stores s ON s.business_id = b.id
         ORDER BY b.name`,
      );
      res.json({
        forAll,
        businesses: businesses.map((b) => ({
          ...b,
          online_store: Number(b.online_store) === 1 ? 1 : 0,
          store_banner_allowed: Number(b.store_banner_allowed) === 1 ? 1 : 0,
          status_label: Number(b.online_store) === 1 ? "Enabled" : "Disabled",
        })),
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.put("/api/master/online-store/for-all", async (req, res) => {
    try {
      await ensureOnlineStoreSchema();
      const enabled = normalizeOnlineStore(req.body?.enabled);
      await setPlatformSetting(FOR_ALL_KEY, String(enabled));
      if (enabled) await query("UPDATE businesses SET online_store = 1");
      res.json({ ok: true, forAll: enabled });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post("/api/master/online-store/enable-all", async (_req, res) => {
    try {
      await ensureOnlineStoreSchema();
      await query("UPDATE businesses SET online_store = 1");
      res.json({ ok: true, online_store: 1 });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post("/api/master/online-store/disable-all", async (_req, res) => {
    try {
      await ensureOnlineStoreSchema();
      await query("UPDATE businesses SET online_store = 0");
      res.json({ ok: true, online_store: 0 });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.put("/api/master/online-store/businesses/:id", async (req, res) => {
    try {
      await ensureOnlineStoreSchema();
      const biz = await businessById(req.params.id);
      if (!biz) return res.status(404).json({ error: "Business not found" });
      const online = Object.prototype.hasOwnProperty.call(req.body || {}, "online_store")
        ? normalizeOnlineStore(req.body.online_store)
        : Number(biz.online_store) === 1 ? 1 : 0;
      const banner = Object.prototype.hasOwnProperty.call(req.body || {}, "store_banner_allowed")
        ? normalizeOnlineStore(req.body.store_banner_allowed)
        : Number(biz.store_banner_allowed) === 1 ? 1 : 0;
      await query("UPDATE businesses SET online_store = ?, store_banner_allowed = ? WHERE id = ?", [online, banner, biz.id]);
      res.json({ ok: true, id: biz.id, online_store: online, store_banner_allowed: banner, status_label: online ? "Enabled" : "Disabled" });
    } catch (err) {
      sendError(res, err);
    }
  });
}

export function registerOnlineStoreStaff(app) {
  app.get("/api/online-store", requirePerm("settings"), async (req, res) => {
    try {
      await ensureOnlineStoreSchema();
      const biz = await businessById(bid());
      assertModule(biz);
      const store = await loadStore(biz.id);
      res.json({
        business: { id: biz.id, name: biz.name, store_banner_allowed: Number(biz.store_banner_allowed) === 1 ? 1 : 0 },
        store: store
          ? {
              store_name: store.store_name,
              slug: store.slug,
              published: Number(store.published) === 1 ? 1 : 0,
              banner_enabled: Number(store.banner_enabled) === 1 ? 1 : 0,
              has_desktop: Boolean(store.banner_desktop),
              has_mobile: Boolean(store.banner_mobile),
              banner_desktop: store.banner_desktop || "",
              banner_mobile: store.banner_mobile || "",
              url: storeUrl(req, store.slug),
            }
          : null,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.put("/api/online-store", requirePerm("settings"), async (req, res) => {
    try {
      await ensureOnlineStoreSchema();
      const biz = await businessById(bid());
      assertModule(biz);
      const name = clean(req.body?.store_name || req.body?.storeName || biz.name, 160);
      if (!name) return res.status(400).json({ error: "Store name is required" });
      const existing = await loadStore(biz.id);
      const slug = normalizeSlug(req.body?.slug || existing?.slug || name);
      const published = normalizeOnlineStore(req.body?.published);
      const [taken] = await query("SELECT business_id FROM online_stores WHERE slug = ? AND business_id <> ? LIMIT 1", [slug, biz.id]);
      if (taken) return res.status(400).json({ error: "That store URL is already used" });
      if (existing) {
        await query(
          "UPDATE online_stores SET slug = ?, store_name = ?, published = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE business_id = ?",
          [slug, name, published, biz.id],
        );
      } else {
        await query(
          "INSERT INTO online_stores (business_id, slug, store_name, published, updated_at) VALUES (?,?,?,?, CURRENT_TIMESTAMP(3))",
          [biz.id, slug, name, published],
        );
      }
      res.json({ ok: true, slug, store_name: name, published, url: storeUrl(req, slug) });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/online-store/catalog", requirePerm("items"), async (_req, res) => {
    try {
      await ensureOnlineStoreSchema();
      const biz = await businessById(bid());
      assertModule(biz);
      res.json(await catalogRows(biz.id));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.put("/api/online-store/items/:id", requirePerm("items"), async (req, res) => {
    try {
      await ensureOnlineStoreSchema();
      const biz = await businessById(bid());
      assertModule(biz);
      const [item] = await query("SELECT id FROM items WHERE id = ? AND business_id = ? LIMIT 1", [req.params.id, biz.id]);
      if (!item) return res.status(404).json({ error: "Item not found" });
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "listed")) {
        const listed = normalizeOnlineStore(req.body.listed);
        await query(
          `INSERT INTO online_store_listings (business_id, item_id, listed) VALUES (?,?,?)
           ON DUPLICATE KEY UPDATE listed = VALUES(listed)`,
          [biz.id, item.id, listed],
        );
      }
      if (req.body?.category != null) {
        await query("UPDATE items SET category = ? WHERE id = ? AND business_id = ?", [clean(req.body.category, 120) || "General", item.id, biz.id]);
      }
      if (req.body?.retail_rate != null || req.body?.price != null) {
        const price = Number(req.body.retail_rate ?? req.body.price);
        if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: "Enter a valid price" });
        await query("UPDATE items SET retail_rate = ? WHERE id = ? AND business_id = ?", [price, item.id, biz.id]);
      }
      if (req.body?.stock_gm != null || req.body?.stock != null) {
        const stock = Number(req.body.stock_gm ?? req.body.stock);
        if (!Number.isFinite(stock) || stock < 0) return res.status(400).json({ error: "Enter a valid stock quantity" });
        await query("UPDATE items SET stock_gm = ? WHERE id = ? AND business_id = ?", [stock, item.id, biz.id]);
        await query(
          "INSERT INTO stock_movements (id, business_id, item_id, kind, quantity_gm, note) VALUES (?,?,?,?,?,?)",
          [crypto.randomUUID(), biz.id, item.id, "adjust", stock, "Online store stock"],
        );
      }
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/online-store/orders", requirePerm("orders"), async (_req, res) => {
    try {
      await ensureOnlineStoreSchema();
      const biz = await businessById(bid());
      assertModule(biz);
      const orders = await query(
        `SELECT id, order_number, status, customer_name, mobile, address, subtotal, gst, total, created_at
         FROM online_orders WHERE business_id = ? ORDER BY created_at DESC LIMIT 200`,
        [biz.id],
      );
      const lines = orders.length
        ? await query(
            `SELECT order_id, item_name, quantity, rate, amount FROM online_order_lines WHERE business_id = ? AND order_id IN (${orders.map(() => "?").join(",")})`,
            [biz.id, ...orders.map((o) => o.id)],
          )
        : [];
      const grouped = new Map();
      lines.forEach((line) => {
        const list = grouped.get(line.order_id) || [];
        list.push(line);
        grouped.set(line.order_id, list);
      });
      res.json(orders.map((order) => ({ ...order, lines: grouped.get(order.id) || [] })));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.patch("/api/online-store/orders/:id", requirePerm("orders"), async (req, res) => {
    try {
      await ensureOnlineStoreSchema();
      const biz = await businessById(bid());
      assertModule(biz);
      const status = clean(req.body?.status, 16).toLowerCase();
      if (!["pending", "accepted", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({ error: "Invalid order status" });
      }
      const [order] = await query("SELECT * FROM online_orders WHERE id = ? AND business_id = ? LIMIT 1", [req.params.id, biz.id]);
      if (!order) return res.status(404).json({ error: "Order not found" });
      if (order.status !== "cancelled" && status === "cancelled") {
        const lines = await query("SELECT item_id, quantity_base FROM online_order_lines WHERE order_id = ? AND business_id = ?", [order.id, biz.id]);
        await withTransaction(async (conn) => {
          for (const line of lines) {
            await conn.query("UPDATE items SET stock_gm = stock_gm + ? WHERE id = ? AND business_id = ?", [line.quantity_base, line.item_id, biz.id]);
            await conn.query(
              "INSERT INTO stock_movements (id, business_id, item_id, kind, quantity_gm, note) VALUES (?,?,?,?,?,?)",
              [crypto.randomUUID(), biz.id, line.item_id, "return", line.quantity_base, order.order_number],
            );
          }
          await conn.query("UPDATE online_orders SET status = 'cancelled' WHERE id = ? AND business_id = ?", [order.id, biz.id]);
        });
      } else if (order.status !== "cancelled") {
        await query("UPDATE online_orders SET status = ? WHERE id = ? AND business_id = ?", [status, order.id, biz.id]);
      }
      res.json({ ok: true, status: order.status === "cancelled" ? "cancelled" : status });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.put("/api/online-store/banner", requirePerm("settings"), async (req, res) => {
    try {
      await ensureOnlineStoreSchema();
      const biz = await businessById(bid());
      assertModule(biz);
      if (Number(biz.store_banner_allowed) !== 1) return res.status(403).json({ error: BANNER_OFF });
      const store = await loadStore(biz.id);
      if (!store) return res.status(400).json({ error: "Create the online store before adding a banner" });
      const desktop = Object.prototype.hasOwnProperty.call(req.body || {}, "banner_desktop")
        ? validateBannerDataUrl(req.body.banner_desktop)
        : store.banner_desktop || "";
      const mobile = Object.prototype.hasOwnProperty.call(req.body || {}, "banner_mobile")
        ? validateBannerDataUrl(req.body.banner_mobile)
        : store.banner_mobile || "";
      const enabled = Object.prototype.hasOwnProperty.call(req.body || {}, "banner_enabled")
        ? normalizeOnlineStore(req.body.banner_enabled)
        : Number(store.banner_enabled) === 1 ? 1 : 0;
      await query(
        "UPDATE online_stores SET banner_desktop = ?, banner_mobile = ?, banner_enabled = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE business_id = ?",
        [desktop || null, mobile || null, enabled && (desktop || mobile) ? 1 : enabled, biz.id],
      );
      res.json({ ok: true, banner_enabled: enabled, has_desktop: Boolean(desktop), has_mobile: Boolean(mobile) });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.delete("/api/online-store/banner", requirePerm("settings"), async (_req, res) => {
    try {
      await ensureOnlineStoreSchema();
      const biz = await businessById(bid());
      assertModule(biz);
      if (Number(biz.store_banner_allowed) !== 1) return res.status(403).json({ error: BANNER_OFF });
      await query(
        "UPDATE online_stores SET banner_desktop = NULL, banner_mobile = NULL, banner_enabled = 0, updated_at = CURRENT_TIMESTAMP(3) WHERE business_id = ?",
        [biz.id],
      );
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });
}

async function placeOrder(business, customer, body) {
  const address = clean(body?.address, 255);
  const requested = Array.isArray(body?.lines) ? body.lines : [];
  if (!requested.length) throw Object.assign(new Error("Add at least one item"), { status: 400 });
  const wanted = new Map();
  for (const raw of requested) {
    const id = String(raw.item_id || raw.itemId || "");
    wanted.set(id, (wanted.get(id) || 0) + Number(raw.quantity));
  }
  const catalog = await catalogRows(business.id, { publicOnly: true });
  const byId = new Map(catalog.map((item) => [String(item.id), item]));
  const built = [];
  for (const [id, quantity] of wanted) {
    const item = byId.get(id);
    if (!item) throw Object.assign(new Error("An item in the cart is not available"), { status: 400 });
    const priced = buildStoreLine(item, quantity);
    if (priced.quantityBase > item.stock_gm + 1e-9) {
      throw Object.assign(new Error(`${item.name} does not have enough stock`), { status: 400 });
    }
    built.push({ item, ...priced, quantity });
  }
  return withTransaction(async (conn) => {
    for (const line of built) {
      const [fresh] = await conn.query("SELECT stock_gm FROM items WHERE id = ? AND business_id = ? FOR UPDATE", [line.item.id, business.id]);
      const stock = Number(fresh[0]?.stock_gm) || 0;
      if (line.quantityBase > stock + 1e-9) throw Object.assign(new Error(`${line.item.name} does not have enough stock`), { status: 400 });
    }
    const [countRows] = await conn.query("SELECT COUNT(*) AS n FROM online_orders WHERE business_id = ?", [business.id]);
    const number = `OS-${String(Number(countRows[0]?.n || 0) + 1).padStart(4, "0")}`;
    const id = crypto.randomUUID();
    const subtotal = Math.round(built.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
    const gst = Math.round(built.reduce((sum, line) => sum + line.gst, 0) * 100) / 100;
    const total = Math.round((subtotal + gst) * 100) / 100;
    await conn.query(
      `INSERT INTO online_orders
         (id, business_id, customer_id, order_number, status, customer_name, mobile, address, subtotal, gst, total)
       VALUES (?,?,?,?, 'pending', ?,?,?,?,?,?)`,
      [id, business.id, customer.id, number, customer.name, customer.mobile, address, subtotal, gst, total],
    );
    for (const line of built) {
      await conn.query("UPDATE items SET stock_gm = stock_gm - ? WHERE id = ? AND business_id = ?", [line.quantityBase, line.item.id, business.id]);
      await conn.query(
        "INSERT INTO stock_movements (id, business_id, item_id, kind, quantity_gm, note) VALUES (?,?,?,?,?,?)",
        [crypto.randomUUID(), business.id, line.item.id, "sale", -line.quantityBase, number],
      );
      await conn.query(
        `INSERT INTO online_order_lines
           (id, order_id, business_id, item_id, item_name, quantity, quantity_base, rate, gst_rate, amount, gst_amount)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), id, business.id, line.item.id, line.item.name, line.quantity, line.quantityBase, line.rate, line.gstRate, line.amount, line.gst],
      );
    }
    return { id, order_number: number, status: "pending", subtotal, gst, total };
  });
}

export function registerOnlineStorePublic(app) {
  app.get("/api/store/:slug", async (req, res) => {
    try {
      await ensureOnlineStoreSchema();
      const slug = normalizeSlug(req.params.slug);
      const row = await publicBusiness(slug);
      if (!row || Number(row.online_store) !== 1 || row.status !== "active") {
        return res.status(404).json({ error: "Online store is not available" });
      }
      const banner = storefrontBanner(row);
      const customer = await customerFromCookie(req, row.id);
      res.json({
        shop: slug,
        store_name: row.store_name || row.name,
        published: Number(row.published) === 1 ? 1 : 0,
        banner,
        customer: customer ? { name: customer.name, mobile: customer.mobile } : null,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post("/api/store/:slug/register", async (req, res) => {
    try {
      await ensureOnlineStoreSchema();
      const row = await publicBusiness(normalizeSlug(req.params.slug));
      if (!row || Number(row.online_store) !== 1 || Number(row.published) !== 1) {
        return res.status(403).json({ error: STORE_OFF });
      }
      const name = clean(req.body?.name, 160);
      const mobile = digits(req.body?.mobile).slice(-10);
      const email = clean(req.body?.email, 160).toLowerCase();
      const password = String(req.body?.password || "");
      if (name.length < 2) return res.status(400).json({ error: "Name is required" });
      if (mobile.length < 10) return res.status(400).json({ error: "Enter a valid mobile number" });
      if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
      const [taken] = await query("SELECT id FROM online_customers WHERE business_id = ? AND mobile = ? LIMIT 1", [row.id, mobile]);
      if (taken) return res.status(400).json({ error: "This mobile is already registered for this store" });
      const customer = { id: crypto.randomUUID(), business_id: row.id, name, mobile, email };
      await query(
        "INSERT INTO online_customers (id, business_id, name, mobile, email, password_hash) VALUES (?,?,?,?,?,?)",
        [customer.id, row.id, name, mobile, email || null, await hashPassword(password)],
      );
      await startCustomerSession(res, req, customer);
      res.status(201).json({ ok: true, customer: { name, mobile } });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post("/api/store/:slug/login", async (req, res) => {
    try {
      await ensureOnlineStoreSchema();
      const row = await publicBusiness(normalizeSlug(req.params.slug));
      if (!row || Number(row.online_store) !== 1 || Number(row.published) !== 1) {
        return res.status(403).json({ error: STORE_OFF });
      }
      const mobile = digits(req.body?.mobile).slice(-10);
      const [customer] = await query(
        "SELECT id, business_id, name, mobile, email, password_hash FROM online_customers WHERE business_id = ? AND mobile = ? LIMIT 1",
        [row.id, mobile],
      );
      if (!customer || !(await verifyPassword(req.body?.password, customer.password_hash))) {
        return res.status(401).json({ error: "Mobile or password is wrong" });
      }
      await startCustomerSession(res, req, customer);
      res.json({ ok: true, customer: { name: customer.name, mobile: customer.mobile } });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post("/api/store/:slug/logout", async (req, res) => {
    const token = readCookie(req, "store_sid");
    if (token) {
      await query("DELETE FROM online_customer_sessions WHERE token_hash = ?", [crypto.createHash("sha256").update(token).digest("hex")]).catch(() => {});
    }
    setStoreCookie(res, "", 0, req);
    res.json({ ok: true });
  });

  app.get("/api/store/:slug/catalog", async (req, res) => {
    try {
      await ensureOnlineStoreSchema();
      const row = await publicBusiness(normalizeSlug(req.params.slug));
      if (!row || Number(row.online_store) !== 1 || Number(row.published) !== 1) {
        return res.status(403).json({ error: STORE_OFF });
      }
      const customer = await customerFromCookie(req, row.id);
      if (!customer) return res.status(401).json({ error: "Sign in to view this store" });
      res.json(await catalogRows(row.id, { publicOnly: true }));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post("/api/store/:slug/orders", async (req, res) => {
    try {
      await ensureOnlineStoreSchema();
      const row = await publicBusiness(normalizeSlug(req.params.slug));
      if (!row || Number(row.online_store) !== 1 || Number(row.published) !== 1) {
        return res.status(403).json({ error: STORE_OFF });
      }
      const customer = await customerFromCookie(req, row.id);
      if (!customer) return res.status(401).json({ error: "Sign in to place an order" });
      const order = await placeOrder(row, customer, req.body || {});
      res.status(201).json({ ok: true, order });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/store/:slug/orders", async (req, res) => {
    try {
      await ensureOnlineStoreSchema();
      const row = await publicBusiness(normalizeSlug(req.params.slug));
      if (!row || Number(row.online_store) !== 1) return res.status(403).json({ error: STORE_OFF });
      const customer = await customerFromCookie(req, row.id);
      if (!customer) return res.status(401).json({ error: "Sign in required" });
      const orders = await query(
        `SELECT id, order_number, status, subtotal, gst, total, created_at
         FROM online_orders WHERE business_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT 50`,
        [row.id, customer.id],
      );
      res.json(orders);
    } catch (err) {
      sendError(res, err);
    }
  });
}
