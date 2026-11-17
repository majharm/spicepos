import crypto from "node:crypto";
import { query, withTransaction } from "./db.js";
import { bid } from "./context.js";
import { requirePerm, requirePermAny } from "./auth.js";
import { buildStoreLine, normalizeOnlineStore, normalizeSlug } from "./online-store.js";

const OFF = "E-Commerce Store is turned off for this shop";
const CLOSED = "This shop is not open for orders yet.";
const STATUSES = ["pending", "packed", "out", "delivered", "cancelled"];

export function ecommerceFlag(val) {
  return normalizeOnlineStore(val);
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function ecommerceTotals(lines, options = {}) {
  const subtotal = round2((lines || []).reduce((sum, line) => sum + Number(line.amount || 0), 0));
  const gst = round2((lines || []).reduce((sum, line) => sum + Number(line.gst || 0), 0));
  const goods = round2(subtotal + gst);
  const fee = Math.max(0, Number(options.deliveryFee) || 0);
  const freeAbove = Math.max(0, Number(options.freeAbove) || 0);
  const delivery = freeAbove > 0 && goods + 0.001 >= freeAbove ? 0 : round2(fee);
  return { subtotal, gst, delivery, total: round2(goods + delivery) };
}

export function shopUrl(req, slug) {
  const proto = String(req.get?.("x-forwarded-proto") || req.protocol || "https").split(",")[0];
  const host = req.get?.("x-forwarded-host") || req.get?.("host") || "";
  return `${proto}://${host}/shop.html?shop=${encodeURIComponent(slug)}`;
}

function clean(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function moneyNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100000) {
    const err = new Error(label);
    err.status = 400;
    throw err;
  }
  return round2(n);
}

function sendError(res, err) {
  res.status(err.status || 400).json({ error: err.message || "Could not complete that shop action" });
}

export async function ensureEcommerceSchema() {
  await query(`CREATE TABLE IF NOT EXISTS ecommerce_stores (
    business_id VARCHAR(255) PRIMARY KEY,
    slug VARCHAR(40) NOT NULL,
    store_name VARCHAR(160) NOT NULL,
    published TINYINT(1) NOT NULL DEFAULT 0,
    delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
    free_above DECIMAL(12,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(3) NULL,
    UNIQUE KEY uq_ecommerce_slug (slug)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS ecommerce_listings (
    business_id VARCHAR(255) NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    listed TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (business_id, item_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS ecommerce_orders (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    order_number VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    customer_name VARCHAR(160) NOT NULL,
    mobile VARCHAR(32) NOT NULL,
    address VARCHAR(255) NULL,
    payment_method VARCHAR(16) NOT NULL DEFAULT 'cod',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst DECIMAL(12,2) NOT NULL DEFAULT 0,
    delivery DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_ecommerce_orders_biz (business_id, created_at)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS ecommerce_order_lines (
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
    INDEX idx_ecommerce_lines_order (order_id),
    INDEX idx_ecommerce_lines_biz (business_id)
  )`);
  try {
    await query("ALTER TABLE businesses ADD COLUMN ecommerce_store TINYINT(1) NOT NULL DEFAULT 0");
  } catch {
    /* column already present */
  }
}

async function businessById(id) {
  const [row] = await query("SELECT id, name, status, ecommerce_store FROM businesses WHERE id = ? LIMIT 1", [id]);
  return row || null;
}

async function publicBusiness(slug) {
  const [row] = await query(
    `SELECT b.id, b.name, b.status, b.ecommerce_store, s.slug, s.store_name, s.published, s.delivery_fee, s.free_above
     FROM ecommerce_stores s
     JOIN businesses b ON b.id = s.business_id
     WHERE s.slug = ? LIMIT 1`,
    [slug],
  );
  return row || null;
}

function assertModule(biz) {
  if (!biz || !ecommerceFlag(biz.ecommerce_store) || biz.status === "inactive") {
    const err = new Error(OFF);
    err.status = 403;
    throw err;
  }
}

async function loadStore(businessId) {
  const [row] = await query("SELECT * FROM ecommerce_stores WHERE business_id = ? LIMIT 1", [businessId]);
  return row || null;
}

async function catalogRows(businessId, { publicOnly = false } = {}) {
  const rows = await query(
    `SELECT i.id, i.name, i.category, i.retail_rate, i.gst_rate, i.stock_gm, i.status, i.unit, i.base_unit, i.image_url,
            l.listed
     FROM items i
     LEFT JOIN ecommerce_listings l ON l.business_id = i.business_id AND l.item_id = i.id
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

function storePublic(row) {
  return {
    shop: row.slug,
    store_name: row.store_name || row.name,
    published: Number(row.published) === 1 ? 1 : 0,
    delivery_fee: Number(row.delivery_fee) || 0,
    free_above: Number(row.free_above) || 0,
    payment: "Cash on delivery",
  };
}

async function openShop(slug) {
  const row = await publicBusiness(normalizeSlug(slug));
  if (!row || !ecommerceFlag(row.ecommerce_store) || row.status !== "active") {
    const err = new Error("E-Commerce Store is not available");
    err.status = 404;
    throw err;
  }
  return row;
}

async function placeOrder(row, body) {
  if (Number(row.published) !== 1) {
    const err = new Error(CLOSED);
    err.status = 403;
    throw err;
  }
  const name = clean(body?.name || body?.customer_name, 160);
  const mobile = digits(body?.mobile).slice(-10);
  const address = clean(body?.address, 255);
  if (name.length < 2) {
    const err = new Error("Name is required");
    err.status = 400;
    throw err;
  }
  if (mobile.length < 10) {
    const err = new Error("Enter a valid mobile number");
    err.status = 400;
    throw err;
  }
  if (address.length < 5) {
    const err = new Error("Delivery address is required");
    err.status = 400;
    throw err;
  }
  const requested = Array.isArray(body?.lines) ? body.lines : [];
  if (!requested.length) {
    const err = new Error("Add at least one item");
    err.status = 400;
    throw err;
  }
  const wanted = new Map();
  for (const raw of requested) {
    const id = String(raw.item_id || raw.itemId || "");
    wanted.set(id, (wanted.get(id) || 0) + Number(raw.quantity));
  }
  const catalog = await catalogRows(row.id, { publicOnly: true });
  const byId = new Map(catalog.map((item) => [String(item.id), item]));
  const built = [];
  for (const [id, quantity] of wanted) {
    const item = byId.get(id);
    if (!item) {
      const err = new Error("An item in the cart is not available");
      err.status = 400;
      throw err;
    }
    const priced = buildStoreLine(item, quantity);
    if (priced.quantityBase > item.stock_gm + 1e-9) {
      const err = new Error(`${item.name} does not have enough stock`);
      err.status = 400;
      throw err;
    }
    built.push({ item, ...priced, quantity });
  }
  const totals = ecommerceTotals(built, { deliveryFee: row.delivery_fee, freeAbove: row.free_above });
  return withTransaction(async (conn) => {
    for (const line of built) {
      const [fresh] = await conn.query("SELECT stock_gm FROM items WHERE id = ? AND business_id = ? FOR UPDATE", [line.item.id, row.id]);
      const stock = Number(fresh[0]?.stock_gm) || 0;
      if (line.quantityBase > stock + 1e-9) {
        const err = new Error(`${line.item.name} does not have enough stock`);
        err.status = 400;
        throw err;
      }
    }
    const [countRows] = await conn.query("SELECT COUNT(*) AS n FROM ecommerce_orders WHERE business_id = ?", [row.id]);
    const number = `EC-${String(Number(countRows[0]?.n || 0) + 1).padStart(4, "0")}`;
    const id = crypto.randomUUID();
    await conn.query(
      `INSERT INTO ecommerce_orders
         (id, business_id, order_number, status, customer_name, mobile, address, payment_method, subtotal, gst, delivery, total)
       VALUES (?,?,?, 'pending', ?,?,?, 'cod', ?,?,?,?)`,
      [id, row.id, number, name, mobile, address, totals.subtotal, totals.gst, totals.delivery, totals.total],
    );
    for (const line of built) {
      await conn.query("UPDATE items SET stock_gm = stock_gm - ? WHERE id = ? AND business_id = ?", [line.quantityBase, line.item.id, row.id]);
      await conn.query(
        "INSERT INTO stock_movements (id, business_id, item_id, kind, quantity_gm, note) VALUES (?,?,?,?,?,?)",
        [crypto.randomUUID(), row.id, line.item.id, "sale", -line.quantityBase, number],
      );
      await conn.query(
        `INSERT INTO ecommerce_order_lines
           (id, order_id, business_id, item_id, item_name, quantity, quantity_base, rate, gst_rate, amount, gst_amount)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), id, row.id, line.item.id, line.item.name, line.quantity, line.quantityBase, line.rate, line.gstRate, line.amount, line.gst],
      );
    }
    return { id, order_number: number, status: "pending", payment: "Cash on delivery", ...totals };
  });
}

export function registerEcommerceMaster(app) {
  app.get("/api/master/ecommerce", async (_req, res) => {
    try {
      await ensureEcommerceSchema();
      const businesses = await query(
        `SELECT b.id, b.name, b.city, b.business_type, b.category, b.status, b.ecommerce_store,
                s.slug, s.published, s.store_name
         FROM businesses b
         LEFT JOIN ecommerce_stores s ON s.business_id = b.id
         ORDER BY b.name`,
      );
      res.json({
        businesses: businesses.map((b) => ({
          ...b,
          ecommerce_store: ecommerceFlag(b.ecommerce_store),
          status_label: ecommerceFlag(b.ecommerce_store) ? "Enabled" : "Disabled",
        })),
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.put("/api/master/ecommerce/businesses/:id", async (req, res) => {
    try {
      await ensureEcommerceSchema();
      const biz = await businessById(req.params.id);
      if (!biz) return res.status(404).json({ error: "Business not found" });
      const on = Object.prototype.hasOwnProperty.call(req.body || {}, "ecommerce_store")
        ? ecommerceFlag(req.body.ecommerce_store)
        : ecommerceFlag(biz.ecommerce_store);
      await query("UPDATE businesses SET ecommerce_store = ? WHERE id = ?", [on, biz.id]);
      res.json({ ok: true, id: biz.id, ecommerce_store: on, status_label: on ? "Enabled" : "Disabled" });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post("/api/master/ecommerce/enable-all", async (_req, res) => {
    try {
      await ensureEcommerceSchema();
      await query("UPDATE businesses SET ecommerce_store = 1");
      res.json({ ok: true, ecommerce_store: 1 });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post("/api/master/ecommerce/disable-all", async (_req, res) => {
    try {
      await ensureEcommerceSchema();
      await query("UPDATE businesses SET ecommerce_store = 0");
      res.json({ ok: true, ecommerce_store: 0 });
    } catch (err) {
      sendError(res, err);
    }
  });
}

export function registerEcommerceStaff(app) {
  app.get("/api/ecommerce", requirePermAny("settings", "items", "orders"), async (req, res) => {
    try {
      await ensureEcommerceSchema();
      const biz = await businessById(bid());
      assertModule(biz);
      const store = await loadStore(biz.id);
      res.json({
        business: { id: biz.id, name: biz.name },
        store: store
          ? {
              ...store,
              published: Number(store.published) === 1 ? 1 : 0,
              delivery_fee: Number(store.delivery_fee) || 0,
              free_above: Number(store.free_above) || 0,
              url: shopUrl(req, store.slug),
            }
          : null,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.put("/api/ecommerce", requirePerm("settings"), async (req, res) => {
    try {
      await ensureEcommerceSchema();
      const biz = await businessById(bid());
      assertModule(biz);
      const slug = normalizeSlug(req.body?.slug);
      const name = clean(req.body?.store_name || req.body?.storeName || biz.name, 160);
      if (name.length < 2) return res.status(400).json({ error: "Store name is required" });
      const published = ecommerceFlag(req.body?.published);
      const delivery = moneyNumber(req.body?.delivery_fee ?? req.body?.deliveryFee ?? 0, "Enter a valid delivery fee");
      const freeAbove = moneyNumber(req.body?.free_above ?? req.body?.freeAbove ?? 0, "Enter a valid free-delivery amount");
      const [taken] = await query("SELECT business_id FROM ecommerce_stores WHERE slug = ? AND business_id <> ? LIMIT 1", [slug, biz.id]);
      if (taken) return res.status(400).json({ error: "That store URL is already used" });
      const existing = await loadStore(biz.id);
      if (existing) {
        await query(
          "UPDATE ecommerce_stores SET slug = ?, store_name = ?, published = ?, delivery_fee = ?, free_above = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE business_id = ?",
          [slug, name, published, delivery, freeAbove, biz.id],
        );
      } else {
        await query(
          "INSERT INTO ecommerce_stores (business_id, slug, store_name, published, delivery_fee, free_above, updated_at) VALUES (?,?,?,?,?,?, CURRENT_TIMESTAMP(3))",
          [biz.id, slug, name, published, delivery, freeAbove],
        );
      }
      res.json({ ok: true, slug, url: shopUrl(req, slug), published, delivery_fee: delivery, free_above: freeAbove });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/ecommerce/catalog", requirePerm("items"), async (_req, res) => {
    try {
      await ensureEcommerceSchema();
      const biz = await businessById(bid());
      assertModule(biz);
      res.json(await catalogRows(biz.id));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.put("/api/ecommerce/items/:id", requirePerm("items"), async (req, res) => {
    try {
      await ensureEcommerceSchema();
      const biz = await businessById(bid());
      assertModule(biz);
      const [item] = await query("SELECT id FROM items WHERE id = ? AND business_id = ? LIMIT 1", [req.params.id, biz.id]);
      if (!item) return res.status(404).json({ error: "Item not found" });
      const listed = ecommerceFlag(req.body?.listed);
      await query(
        `INSERT INTO ecommerce_listings (business_id, item_id, listed) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE listed = VALUES(listed)`,
        [biz.id, item.id, listed],
      );
      res.json({ ok: true, listed });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/ecommerce/orders", requirePerm("orders"), async (_req, res) => {
    try {
      await ensureEcommerceSchema();
      const biz = await businessById(bid());
      assertModule(biz);
      const orders = await query(
        `SELECT id, order_number, status, customer_name, mobile, address, payment_method, subtotal, gst, delivery, total, created_at
         FROM ecommerce_orders WHERE business_id = ? ORDER BY created_at DESC LIMIT 200`,
        [biz.id],
      );
      const lines = orders.length
        ? await query(
            `SELECT order_id, item_name, quantity, rate, amount FROM ecommerce_order_lines WHERE business_id = ? AND order_id IN (${orders.map(() => "?").join(",")})`,
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

  app.patch("/api/ecommerce/orders/:id", requirePerm("orders"), async (req, res) => {
    try {
      await ensureEcommerceSchema();
      const biz = await businessById(bid());
      assertModule(biz);
      const status = clean(req.body?.status, 16).toLowerCase();
      if (!STATUSES.includes(status)) return res.status(400).json({ error: "Invalid order status" });
      const [order] = await query("SELECT * FROM ecommerce_orders WHERE id = ? AND business_id = ? LIMIT 1", [req.params.id, biz.id]);
      if (!order) return res.status(404).json({ error: "Order not found" });
      if (order.status === "cancelled") return res.json({ ok: true, status: "cancelled" });
      if (status === "cancelled") {
        const lines = await query("SELECT item_id, quantity_base FROM ecommerce_order_lines WHERE order_id = ? AND business_id = ?", [order.id, biz.id]);
        await withTransaction(async (conn) => {
          for (const line of lines) {
            await conn.query("UPDATE items SET stock_gm = stock_gm + ? WHERE id = ? AND business_id = ?", [line.quantity_base, line.item_id, biz.id]);
            await conn.query(
              "INSERT INTO stock_movements (id, business_id, item_id, kind, quantity_gm, note) VALUES (?,?,?,?,?,?)",
              [crypto.randomUUID(), biz.id, line.item_id, "return", line.quantity_base, order.order_number],
            );
          }
          await conn.query("UPDATE ecommerce_orders SET status = 'cancelled' WHERE id = ? AND business_id = ?", [order.id, biz.id]);
        });
      } else {
        await query("UPDATE ecommerce_orders SET status = ? WHERE id = ? AND business_id = ?", [status, order.id, biz.id]);
      }
      res.json({ ok: true, status });
    } catch (err) {
      sendError(res, err);
    }
  });
}

export function registerEcommercePublic(app) {
  app.get("/api/shop/:slug", async (req, res) => {
    try {
      await ensureEcommerceSchema();
      const row = await openShop(req.params.slug);
      res.json(storePublic(row));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get("/api/shop/:slug/catalog", async (req, res) => {
    try {
      await ensureEcommerceSchema();
      const row = await openShop(req.params.slug);
      if (Number(row.published) !== 1) return res.status(403).json({ error: CLOSED });
      res.json(await catalogRows(row.id, { publicOnly: true }));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post("/api/shop/:slug/orders", async (req, res) => {
    try {
      await ensureEcommerceSchema();
      const row = await openShop(req.params.slug);
      const order = await placeOrder(row, req.body || {});
      res.status(201).json({ ok: true, order });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post("/api/shop/:slug/track", async (req, res) => {
    try {
      await ensureEcommerceSchema();
      const row = await openShop(req.params.slug);
      const number = clean(req.body?.order_number || req.body?.orderNumber, 32).toUpperCase();
      const mobile = digits(req.body?.mobile).slice(-10);
      if (!number || mobile.length < 10) return res.status(400).json({ error: "Enter the order number and mobile" });
      const [order] = await query(
        `SELECT id, order_number, status, customer_name, payment_method, subtotal, gst, delivery, total, created_at
         FROM ecommerce_orders WHERE business_id = ? AND order_number = ? AND mobile = ? LIMIT 1`,
        [row.id, number, mobile],
      );
      if (!order) return res.status(404).json({ error: "No order matches that number and mobile" });
      const lines = await query("SELECT item_name, quantity, amount FROM ecommerce_order_lines WHERE order_id = ? AND business_id = ?", [order.id, row.id]);
      const { id, ...publicOrder } = order;
      res.json({ order: { ...publicOrder, lines } });
    } catch (err) {
      sendError(res, err);
    }
  });
}
