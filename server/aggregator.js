import crypto from "node:crypto";
import "../js/aggregator.js";
import { query } from "./db.js";
import { bid } from "./context.js";
import { requireStaff, requirePerm, requirePermAny } from "./auth.js";
import { audit } from "./audit.js";

const A = globalThis.POSAggregator;
const SECRET_COLS = ["zomato_api_key", "zomato_webhook_secret", "swiggy_api_key", "swiggy_webhook_secret"];

function send(res, fn, code = 400) {
  return Promise.resolve()
    .then(fn)
    .then((data) => res.json(data))
    .catch((err) => res.status(code).json({ error: String(err.message) }));
}

export async function ensureAggregatorSchema(exec = query) {
  await exec(`CREATE TABLE IF NOT EXISTS aggregator_orders (
    id VARCHAR(36) PRIMARY KEY,
    business_id VARCHAR(36) NOT NULL,
    source VARCHAR(16) NOT NULL,
    external_id VARCHAR(80) NOT NULL,
    order_number VARCHAR(40) NOT NULL,
    restaurant_id VARCHAR(80) NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    fulfillment VARCHAR(16) NOT NULL DEFAULT 'delivery',
    customer_name VARCHAR(160) NULL,
    mobile VARCHAR(32) NULL,
    notes VARCHAR(250) NULL,
    address VARCHAR(400) NULL,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount DECIMAL(12,2) NOT NULL DEFAULT 0,
    packing DECIMAL(12,2) NOT NULL DEFAULT 0,
    delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    prep_minutes INT NULL,
    payment_status VARCHAR(24) NULL,
    kot_ticket_id VARCHAR(64) NULL,
    sales_order_id VARCHAR(64) NULL,
    rider_json MEDIUMTEXT NULL,
    raw_json MEDIUMTEXT NULL,
    accepted_at TIMESTAMP(3) NULL,
    rejected_at TIMESTAMP(3) NULL,
    ready_at TIMESTAMP(3) NULL,
    dispatched_at TIMESTAMP(3) NULL,
    delivered_at TIMESTAMP(3) NULL,
    cancelled_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_agg_ext (business_id, source, external_id),
    INDEX idx_agg_biz (business_id, status, created_at)
  )`);
  await exec(`CREATE TABLE IF NOT EXISTS aggregator_order_lines (
    id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL,
    item_id VARCHAR(64) NULL,
    external_item_id VARCHAR(80) NULL,
    name VARCHAR(160) NOT NULL,
    qty DECIMAL(12,3) NOT NULL DEFAULT 1,
    rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    notes VARCHAR(240) NULL,
    INDEX (order_id)
  )`);
  const cols = {
    zomato_enabled: "TINYINT(1) NOT NULL DEFAULT 0",
    swiggy_enabled: "TINYINT(1) NOT NULL DEFAULT 0",
    aggregator_auto_accept: "TINYINT(1) NOT NULL DEFAULT 0",
    aggregator_prep_minutes: "INT NULL",
    zomato_restaurant_id: "VARCHAR(80) NULL",
    zomato_api_key: "VARCHAR(180) NULL",
    zomato_webhook_secret: "VARCHAR(180) NULL",
    zomato_api_base: "VARCHAR(180) NULL",
    swiggy_outlet_id: "VARCHAR(80) NULL",
    swiggy_api_key: "VARCHAR(180) NULL",
    swiggy_webhook_secret: "VARCHAR(180) NULL",
    swiggy_api_base: "VARCHAR(180) NULL",
  };
  for (const [col, ddl] of Object.entries(cols)) {
    try {
      await exec(`ALTER TABLE company_settings ADD COLUMN ${col} ${ddl}`);
    } catch {
      /* present */
    }
  }
  for (const col of ["zomato_allowed", "swiggy_allowed"]) {
    try {
      await exec(`ALTER TABLE businesses ADD COLUMN ${col} TINYINT(1) NOT NULL DEFAULT 0`);
    } catch {
      /* present */
    }
  }
}

function stampCol(status) {
  if (status === "accepted") return "accepted_at";
  if (status === "rejected") return "rejected_at";
  if (status === "ready") return "ready_at";
  if (status === "dispatched") return "dispatched_at";
  if (status === "delivered") return "delivered_at";
  if (status === "cancelled") return "cancelled_at";
  return "";
}

function rowOut(row, lines = []) {
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
    external_id: row.external_id,
    order_number: row.order_number,
    restaurant_id: row.restaurant_id,
    status: row.status,
    fulfillment: row.fulfillment,
    customer_name: row.customer_name,
    mobile: row.mobile,
    notes: row.notes,
    address: row.address,
    subtotal: Number(row.subtotal || 0),
    tax: Number(row.tax || 0),
    discount: Number(row.discount || 0),
    packing: Number(row.packing || 0),
    delivery_fee: Number(row.delivery_fee || 0),
    total: Number(row.total || 0),
    prep_minutes: row.prep_minutes,
    payment_status: row.payment_status,
    kot_ticket_id: row.kot_ticket_id,
    sales_order_id: row.sales_order_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    lines,
  };
}

async function linesOf(orderId) {
  return query("SELECT * FROM aggregator_order_lines WHERE order_id = ? ORDER BY name", [orderId]).catch(() => []);
}

async function loadOrder(businessId, id) {
  const [row] = await query("SELECT * FROM aggregator_orders WHERE id = ? AND business_id = ? LIMIT 1", [id, businessId]);
  if (!row) return null;
  return rowOut(row, await linesOf(row.id));
}

async function settingsOf(businessId) {
  await ensureAggregatorSchema();
  const [row] = await query("SELECT * FROM company_settings WHERE business_id = ? LIMIT 1", [businessId]).catch(() => []);
  const [biz] = await query("SELECT zomato_allowed, swiggy_allowed FROM businesses WHERE id = ? LIMIT 1", [businessId]).catch(() => []);
  return {
    ...(row || {}),
    zomato_allowed: biz?.zomato_allowed ?? 0,
    swiggy_allowed: biz?.swiggy_allowed ?? 0,
  };
}

function publicSettings(row = {}) {
  const packed = {
    zomato_allowed: A.flagOn(row.zomato_allowed),
    swiggy_allowed: A.flagOn(row.swiggy_allowed),
    zomato_enabled: A.flagOn(row.zomato_enabled),
    swiggy_enabled: A.flagOn(row.swiggy_enabled),
    aggregator_auto_accept: A.flagOn(row.aggregator_auto_accept),
    aggregator_prep_minutes: Number(row.aggregator_prep_minutes) || 20,
    zomato_restaurant_id: row.zomato_restaurant_id || "",
    swiggy_outlet_id: row.swiggy_outlet_id || "",
    zomato_api_base: row.zomato_api_base || "https://api.zomato.com",
    swiggy_api_base: row.swiggy_api_base || "https://partner.swiggy.com",
    zomato_api_key: A.maskSecret(row.zomato_api_key),
    zomato_webhook_secret: A.maskSecret(row.zomato_webhook_secret),
    swiggy_api_key: A.maskSecret(row.swiggy_api_key),
    swiggy_webhook_secret: A.maskSecret(row.swiggy_webhook_secret),
  };
  packed.zomato_live = A.isLive("zomato", packed);
  packed.swiggy_live = A.isLive("swiggy", packed);
  return packed;
}

function headerSecret(req) {
  return String(req.get("x-webhook-secret") || req.get("x-api-key") || req.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

function secretsMatch(have, want) {
  if (!want) return true;
  if (!have) return false;
  const a = Buffer.from(String(have));
  const b = Buffer.from(String(want));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function findBusiness(req, source, parsed) {
  const shop = String(req.query?.shop || req.get("x-shop-id") || "").trim();
  if (shop) {
    const [biz] = await query("SELECT id FROM businesses WHERE (id = ? OR code = ?) AND status = 'active' LIMIT 1", [shop, shop]);
    if (biz) return biz.id;
  }
  const outlet = parsed.restaurant_id;
  if (outlet) {
    const col = source === "swiggy" ? "swiggy_outlet_id" : "zomato_restaurant_id";
    const [row] = await query(`SELECT business_id FROM company_settings WHERE ${col} = ? LIMIT 1`, [outlet]).catch(() => []);
    if (row?.business_id) return row.business_id;
  }
  return "";
}

async function upsertOrder(businessId, parsed, raw) {
  const [exist] = await query(
    "SELECT * FROM aggregator_orders WHERE business_id = ? AND source = ? AND external_id = ? LIMIT 1",
    [businessId, parsed.source, parsed.external_id],
  );
  if (exist && parsed.kind === "status") {
    if (parsed.status && parsed.status !== exist.status) {
      const col = stampCol(parsed.status);
      await query(
        `UPDATE aggregator_orders SET status = ?, ${col ? `${col} = COALESCE(${col}, NOW(3)),` : ""} updated_at = NOW(3) WHERE id = ? AND business_id = ?`,
        [parsed.status, exist.id, businessId],
      );
    }
    return { order: await loadOrder(businessId, exist.id), replay: true };
  }
  if (exist) return { order: await loadOrder(businessId, exist.id), replay: true };
  const id = crypto.randomUUID();
  const number = A.orderNumber(parsed.source, parsed.external_id);
  await query(
    `INSERT INTO aggregator_orders
      (id, business_id, source, external_id, order_number, restaurant_id, status, fulfillment, customer_name, mobile, notes, address,
       subtotal, tax, discount, packing, delivery_fee, total, prep_minutes, payment_status, raw_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      businessId,
      parsed.source,
      parsed.external_id,
      number,
      parsed.restaurant_id || null,
      parsed.status || "pending",
      parsed.fulfillment || "delivery",
      parsed.customer_name,
      parsed.mobile || null,
      parsed.notes || null,
      parsed.address || null,
      parsed.subtotal,
      parsed.tax,
      parsed.discount,
      parsed.packing,
      parsed.delivery_fee,
      parsed.total,
      parsed.prep_minutes,
      parsed.payment_status || "paid",
      JSON.stringify(raw || {}).slice(0, 20000),
    ],
  );
  for (const line of parsed.lines || []) {
    await query(
      "INSERT INTO aggregator_order_lines (id, order_id, external_item_id, name, qty, rate, amount, notes) VALUES (?,?,?,?,?,?,?,?)",
      [crypto.randomUUID(), id, line.external_item_id || null, line.name, line.qty, line.rate, line.amount, line.notes || null],
    );
  }
  return { order: await loadOrder(businessId, id), replay: false };
}

async function pushPlatform(source, status, settings, order, reason) {
  const cfg = {
    api_base: source === "swiggy" ? settings.swiggy_api_base : settings.zomato_api_base,
    restaurant_id: source === "swiggy" ? settings.swiggy_outlet_id : settings.zomato_restaurant_id,
    api_key: source === "swiggy" ? settings.swiggy_api_key : settings.zomato_api_key,
  };
  const spec = A.outboundFor(source, status, cfg, { external_id: order.external_id, restaurant_id: order.restaurant_id || cfg.restaurant_id, reason });
  if (!spec || !cfg.api_key) return { skipped: true };
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${cfg.api_key}`, "X-Api-Key": cfg.api_key };
  const res = await fetch(spec.url, { method: spec.method, headers, body: JSON.stringify(spec.body) }).catch((err) => ({ ok: false, status: 0, error: err.message }));
  if (!res || res.status === 0) return { ok: false, skipped: false, error: res?.error || "Platform unreachable" };
  if (res.status >= 400) {
    const text = await res.text().catch(() => "");
    throw new Error(`${A.sourceLabel(source)} API ${res.status}: ${text.slice(0, 180) || "request failed"}`);
  }
  return { ok: true };
}

async function ingestWebhook(req, source) {
  await ensureAggregatorSchema();
  const parsed = A.parseInbound(req.body || {}, source);
  if (!parsed.ok) throw new Error(parsed.error || "Invalid order payload");
  const businessId = await findBusiness(req, parsed.source, parsed);
  if (!businessId) throw new Error("Unknown restaurant. Add the shop id to the webhook URL or save the outlet id in Settings.");
  const settings = await settingsOf(businessId);
  const block = A.activationBlock(parsed.source, settings);
  if (block) throw new Error(block);
  const want = parsed.source === "swiggy" ? settings.swiggy_webhook_secret : settings.zomato_webhook_secret;
  if (want && !secretsMatch(headerSecret(req), want)) throw new Error("Webhook secret does not match");
  const saved = await upsertOrder(businessId, parsed, req.body);
  if (!saved.replay && Number(settings.aggregator_auto_accept) === 1 && saved.order.status === "pending") {
    return applyStatus(businessId, saved.order.id, "accepted", settings);
  }
  return { ok: true, ...saved };
}

async function applyStatus(businessId, id, next, settings) {
  const order = await loadOrder(businessId, id);
  if (!order) throw new Error("Order not found");
  const status = A.normalizeStatus(next);
  if (!status) throw new Error("Invalid status");
  if (order.status === status) return { ok: true, replay: true, order };
  await pushPlatform(order.source, status, settings || (await settingsOf(businessId)), order, next === "rejected" ? "Rejected by restaurant" : "");
  const col = stampCol(status);
  await query(
    `UPDATE aggregator_orders SET status = ?, ${col ? `${col} = COALESCE(${col}, NOW(3)),` : ""} updated_at = NOW(3) WHERE id = ? AND business_id = ?`,
    [status, id, businessId],
  );
  return { ok: true, order: await loadOrder(businessId, id) };
}

export function registerAggregatorPublic(app) {
  const handle = (source) => (req, res) =>
    send(res, async () => ingestWebhook(req, source), 400);

  app.post(["/api/webhooks/zomato", "/api/webhooks/zomato/"], handle("zomato"));
  app.post(["/api/webhooks/swiggy", "/api/webhooks/swiggy/"], handle("swiggy"));
}

export function registerAggregatorStaff(app) {
  app.get(["/api/aggregator/settings", "/api/aggregator/settings/"], requireStaff, requirePerm("settings"), (_req, res) =>
    send(res, async () => {
      const row = await settingsOf(bid());
      return { ok: true, settings: publicSettings(row), webhooks: { zomato: A.webhookPath("zomato", bid()), swiggy: A.webhookPath("swiggy", bid()) } };
    }),
  );

  app.put(["/api/aggregator/settings", "/api/aggregator/settings/"], requireStaff, requirePerm("settings"), (req, res) =>
    send(res, async () => {
      await ensureAggregatorSchema();
      const b = req.body || {};
      const current = await settingsOf(bid());
      const nextZomatoKey = b.zomato_api_key && !A.isMasked(b.zomato_api_key) ? A.clip(b.zomato_api_key, 180) : current.zomato_api_key;
      const nextSwiggyKey = b.swiggy_api_key && !A.isMasked(b.swiggy_api_key) ? A.clip(b.swiggy_api_key, 180) : current.swiggy_api_key;
      const draft = {
        ...current,
        zomato_restaurant_id: A.clip(b.zomato_restaurant_id, 80) || current.zomato_restaurant_id,
        swiggy_outlet_id: A.clip(b.swiggy_outlet_id, 80) || current.swiggy_outlet_id,
        zomato_api_key: nextZomatoKey,
        swiggy_api_key: nextSwiggyKey,
        zomato_enabled: A.flagOn(b.zomato_enabled) ? 1 : 0,
        swiggy_enabled: A.flagOn(b.swiggy_enabled) ? 1 : 0,
      };
      if (A.flagOn(b.zomato_enabled)) {
        const err = A.activationBlock("zomato", { ...draft, zomato_enabled: 1 }, { wantEnable: true, storedKey: current.zomato_api_key });
        if (err) throw new Error(err);
      }
      if (A.flagOn(b.swiggy_enabled)) {
        const err = A.activationBlock("swiggy", { ...draft, swiggy_enabled: 1 }, { wantEnable: true, storedKey: current.swiggy_api_key });
        if (err) throw new Error(err);
      }
      const sets = [
        ["zomato_enabled", A.flagOn(b.zomato_enabled) ? 1 : 0],
        ["swiggy_enabled", A.flagOn(b.swiggy_enabled) ? 1 : 0],
        ["aggregator_auto_accept", A.flagOn(b.aggregator_auto_accept) ? 1 : 0],
        ["aggregator_prep_minutes", Math.max(5, Math.min(90, Number(b.aggregator_prep_minutes) || 20))],
        ["zomato_restaurant_id", A.clip(b.zomato_restaurant_id, 80) || null],
        ["swiggy_outlet_id", A.clip(b.swiggy_outlet_id, 80) || null],
        ["zomato_api_base", A.clip(b.zomato_api_base, 180) || "https://api.zomato.com"],
        ["swiggy_api_base", A.clip(b.swiggy_api_base, 180) || "https://partner.swiggy.com"],
      ];
      for (const col of SECRET_COLS) {
        if (b[col] != null && String(b[col]) && !A.isMasked(b[col])) sets.push([col, A.clip(b[col], 180)]);
      }
      const sql = sets.map(([col]) => `${col} = ?`).join(", ");
      await query(`UPDATE company_settings SET ${sql} WHERE business_id = ?`, [...sets.map(([, v]) => v), bid()]);
      return { ok: true, settings: publicSettings(await settingsOf(bid())) };
    }),
  );

  app.get(["/api/aggregator/orders", "/api/aggregator/orders/"], requireStaff, requirePerm("orders"), (req, res) =>
    send(res, async () => {
      await ensureAggregatorSchema();
      const source = A.normalizeSource(req.query?.source);
      const status = A.normalizeStatus(req.query?.status);
      const params = [bid()];
      let where = "business_id = ?";
      if (source) {
        where += " AND source = ?";
        params.push(source);
      }
      if (status) {
        where += " AND status = ?";
        params.push(status);
      }
      const rows = await query(`SELECT * FROM aggregator_orders WHERE ${where} ORDER BY created_at DESC LIMIT 80`, params);
      const out = [];
      for (const row of rows || []) out.push(rowOut(row, await linesOf(row.id)));
      return out;
    }),
  );

  app.patch("/api/aggregator/orders/:id", requireStaff, requirePerm("orders"), (req, res) =>
    send(res, async () => {
      const result = await applyStatus(bid(), req.params.id, req.body?.status, await settingsOf(bid()));
      await audit("Online order", {
        module: "orders",
        target_id: result.order?.id,
        target_name: result.order?.order_number,
        status: req.body?.status,
      }).catch(() => {});
      return result;
    }),
  );

  app.post("/api/aggregator/orders/:id/kot", requireStaff, requirePermAny("orders", "kot", "counter"), (req, res) =>
    send(res, async () => {
      const order = await loadOrder(bid(), req.params.id);
      if (!order) throw new Error("Order not found");
      const tableNo = A.kotTable(order.source, order.fulfillment);
      const lines = (order.lines || []).map((line) => ({
        itemId: line.item_id || line.external_item_id || line.name,
        name: line.name,
        qtyGm: Number(line.qty) || 1,
        unit: "PCS",
        notes: line.notes || "",
      }));
      const kotId = crypto.randomUUID();
      try {
        await query(
          `INSERT INTO kitchen_tickets (id, business_id, table_no, kind, status, notes, lines_json, kot_number, created_at, updated_at)
           VALUES (?,?,?,?, 'new', ?, ?, ?, NOW(3), NOW(3))`,
          [kotId, bid(), tableNo, "new", `${A.sourceLabel(order.source)} ${order.order_number}`, JSON.stringify(lines), order.order_number],
        );
      } catch {
        await query(
          `INSERT INTO kitchen_tickets (id, business_id, table_no, kind, status, notes, lines_json, created_at, updated_at)
           VALUES (?,?,?,?, 'new', ?, ?, NOW(3), NOW(3))`,
          [kotId, bid(), tableNo, "new", `${A.sourceLabel(order.source)} ${order.order_number}`, JSON.stringify(lines)],
        );
      }
      await query("UPDATE aggregator_orders SET kot_ticket_id = ?, status = CASE WHEN status = 'accepted' THEN 'preparing' ELSE status END WHERE id = ? AND business_id = ?", [
        kotId,
        order.id,
        bid(),
      ]);
      return { ok: true, kot_ticket_id: kotId, order: await loadOrder(bid(), order.id) };
    }),
  );

  app.post(["/api/aggregator/sandbox", "/api/aggregator/sandbox/"], requireStaff, requirePerm("orders"), (req, res) =>
    send(res, async () => {
      await ensureAggregatorSchema();
      const source = A.normalizeSource(req.body?.source) || "zomato";
      const gate = A.activationBlock(source, await settingsOf(bid()));
      if (gate) throw new Error(gate);
      const sample =
        req.body?.order ||
        (source === "swiggy"
          ? {
              orderId: `SWG-DEMO-${Date.now().toString().slice(-6)}`,
              items: [{ name: "Masala Dosa", quantity: 1, unit_price: 120 }, { name: "Filter coffee", quantity: 2, unit_price: 40 }],
              customer: { name: "Swiggy guest" },
              order_total: 200,
              delivery_mode: "delivery",
            }
          : {
              order_id: `ZMT-DEMO-${Date.now().toString().slice(-6)}`,
              restaurant_id: req.body?.restaurant_id || "demo",
              customer: { name: "Zomato guest", phone: "9999999999" },
              dishes: [{ name: "Paneer Tikka", quantity: 1, unit_cost: 249, instructions: "Less spicy" }],
              net_total: 249,
            });
      const parsed = A.parseInbound(sample, source);
      if (!parsed.ok) throw new Error(parsed.error);
      const saved = await upsertOrder(bid(), parsed, sample);
      return { ok: true, sandbox: true, ...saved };
    }),
  );
}

