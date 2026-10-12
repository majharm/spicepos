import { query, withTransaction } from "./db.js";
import { clipIdempotencyKey, ensureIdempotencyTable, findIdempotent, saveIdempotent, parseIdempotentPayload } from "./idempotency.js";
import { bid, authUser } from "./context.js";
import { requirePerm } from "./auth.js";
import "../js/bar.js";

const B = () => globalThis.POSBar;

function clip(v, n) {
  return String(v ?? "").trim().slice(0, n);
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function flag(v) {
  return B().flagOn(v) ? 1 : 0;
}

async function loadBiz() {
  const rows = await query("SELECT * FROM businesses WHERE id=? LIMIT 1", [bid()]);
  return rows[0] || null;
}

function assertBar(biz) {
  if (!B().isBarShop(biz)) {
    const err = new Error("Bar model is not enabled for this shop");
    err.status = 403;
    throw err;
  }
}

function roleOf() {
  return String(authUser()?.role || "");
}

function permsOf() {
  return authUser()?.permissions || {};
}

export async function ensureBarSchema() {
  await query(`CREATE TABLE IF NOT EXISTS bar_products (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    brand VARCHAR(120) NULL,
    category VARCHAR(64) NOT NULL DEFAULT 'Whisky',
    pack_type VARCHAR(32) NOT NULL DEFAULT 'bottle',
    bottle_ml DECIMAL(12,2) NOT NULL DEFAULT 750,
    barcode VARCHAR(64) NULL,
    price_peg30 DECIMAL(12,2) NOT NULL DEFAULT 0,
    price_peg60 DECIMAL(12,2) NOT NULL DEFAULT 0,
    price_quarter DECIMAL(12,2) NOT NULL DEFAULT 0,
    price_half DECIMAL(12,2) NOT NULL DEFAULT 0,
    price_bottle DECIMAL(12,2) NOT NULL DEFAULT 0,
    cost_bottle DECIMAL(12,2) NOT NULL DEFAULT 0,
    on_hand_ml DECIMAL(14,2) NOT NULL DEFAULT 0,
    low_stock_ml DECIMAL(14,2) NOT NULL DEFAULT 0,
    batch_no VARCHAR(64) NULL,
    expiry_date DATE NULL,
    gst_rate DECIMAL(8,2) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id),
    INDEX (category),
    INDEX (barcode)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS bar_movements (
    id VARCHAR(255) PRIMARY KEY,
    product_id VARCHAR(255) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    qty_ml DECIMAL(14,2) NOT NULL DEFAULT 0,
    note VARCHAR(255) NULL,
    ref_id VARCHAR(255) NULL,
    user_id VARCHAR(255) NULL,
    user_name VARCHAR(180) NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id),
    INDEX (product_id),
    INDEX (kind)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS bar_tables (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    seats INT NOT NULL DEFAULT 4,
    floor VARCHAR(64) NULL,
    service_type VARCHAR(32) NOT NULL DEFAULT 'dine-in',
    status VARCHAR(16) NOT NULL DEFAULT 'free',
    hold_json MEDIUMTEXT NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS bar_sales (
    id VARCHAR(255) PRIMARY KEY,
    bill_no VARCHAR(32) NOT NULL,
    table_id VARCHAR(255) NULL,
    table_name VARCHAR(80) NULL,
    service_type VARCHAR(32) NOT NULL DEFAULT 'dine-in',
    method VARCHAR(32) NOT NULL DEFAULT 'cash',
    item_gross DECIMAL(12,2) NOT NULL DEFAULT 0,
    item_discount DECIMAL(12,2) NOT NULL DEFAULT 0,
    bill_discount DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    cogs DECIMAL(12,2) NOT NULL DEFAULT 0,
    profit DECIMAL(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'paid',
    void_reason VARCHAR(255) NULL,
    cashier_id VARCHAR(255) NULL,
    cashier_name VARCHAR(180) NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id),
    INDEX (created_at),
    INDEX (status)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS bar_sale_lines (
    id VARCHAR(255) PRIMARY KEY,
    sale_id VARCHAR(255) NOT NULL,
    product_id VARCHAR(255) NULL,
    name VARCHAR(180) NOT NULL,
    brand VARCHAR(120) NULL,
    category VARCHAR(64) NULL,
    serve VARCHAR(16) NOT NULL,
    qty DECIMAL(10,2) NOT NULL DEFAULT 1,
    serve_ml DECIMAL(12,2) NOT NULL DEFAULT 0,
    unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    cogs DECIMAL(12,2) NOT NULL DEFAULT 0,
    business_id VARCHAR(255) NOT NULL,
    INDEX (sale_id),
    INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS bar_settings (
    business_id VARCHAR(255) PRIMARY KEY,
    settings_json MEDIUMTEXT NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS bar_audit (
    id VARCHAR(255) PRIMARY KEY,
    action VARCHAR(64) NOT NULL,
    detail VARCHAR(500) NULL,
    user_id VARCHAR(255) NULL,
    user_name VARCHAR(180) NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);
}

async function audit(action, detail) {
  const user = authUser() || {};
  await query(
    `INSERT INTO bar_audit (id, action, detail, user_id, user_name, business_id) VALUES (?,?,?,?,?,?)`,
    [crypto.randomUUID(), clip(action, 64), clip(detail, 500), user.id || null, clip(user.first_name || user.name || user.email || "", 180), bid()],
  );
}

async function settingsOf(shopId) {
  const rows = await query("SELECT settings_json FROM bar_settings WHERE business_id=?", [shopId]);
  let parsed = {};
  try {
    parsed = rows[0]?.settings_json ? JSON.parse(rows[0].settings_json) : {};
  } catch {
    parsed = {};
  }
  return { ...B().defaultSettings(), ...parsed };
}

async function saveSettings(shopId, patch) {
  const cur = await settingsOf(shopId);
  const next = {
    ...cur,
    license_no: clip(patch.license_no ?? cur.license_no, 80),
    license_state: clip(patch.license_state ?? cur.license_state, 64),
    license_expires: clip(patch.license_expires ?? cur.license_expires, 10),
    open_hour: clip(patch.open_hour ?? cur.open_hour, 8) || "11:00",
    close_hour: clip(patch.close_hour ?? cur.close_hour, 8) || "23:30",
    peg30_ml: num(patch.peg30_ml, cur.peg30_ml),
    peg60_ml: num(patch.peg60_ml, cur.peg60_ml),
    allow_peg: flag(patch.allow_peg ?? cur.allow_peg),
    allow_quarter: flag(patch.allow_quarter ?? cur.allow_quarter),
    allow_half: flag(patch.allow_half ?? cur.allow_half),
    allow_bottle: flag(patch.allow_bottle ?? cur.allow_bottle),
    tax_rate: num(patch.tax_rate, cur.tax_rate),
    invoice_title: clip(patch.invoice_title ?? cur.invoice_title, 80) || "Bar Invoice",
    min_age: num(patch.min_age, cur.min_age),
    regulated: flag(patch.regulated ?? cur.regulated),
    allow_after_hours: flag(patch.allow_after_hours ?? cur.allow_after_hours),
  };
  await query(
    `INSERT INTO bar_settings (business_id, settings_json) VALUES (?,?)
     ON DUPLICATE KEY UPDATE settings_json=VALUES(settings_json)`,
    [shopId, JSON.stringify(next)],
  );
  return next;
}

function productPayload(body) {
  return {
    name: clip(body.name, 180) || "Bar item",
    brand: clip(body.brand, 120),
    category: clip(body.category, 64) || "Whisky",
    pack_type: clip(body.pack_type, 32) || "bottle",
    bottle_ml: num(body.bottle_ml, 750),
    barcode: clip(body.barcode, 64),
    price_peg30: num(body.price_peg30),
    price_peg60: num(body.price_peg60),
    price_quarter: num(body.price_quarter),
    price_half: num(body.price_half),
    price_bottle: num(body.price_bottle),
    cost_bottle: num(body.cost_bottle),
    on_hand_ml: num(body.on_hand_ml),
    low_stock_ml: num(body.low_stock_ml),
    batch_no: clip(body.batch_no, 64),
    expiry_date: clip(body.expiry_date, 10) || null,
    gst_rate: num(body.gst_rate),
    status: clip(body.status, 16) || "active",
  };
}

async function seedIfEmpty(shopId) {
  const existing = await query("SELECT id FROM bar_products WHERE business_id=? LIMIT 1", [shopId]);
  if (!existing.length) {
    for (const p of B().defaultProducts()) {
      await query(
        `INSERT INTO bar_products (id, name, brand, category, pack_type, bottle_ml, barcode, price_peg30, price_peg60, price_quarter, price_half, price_bottle, cost_bottle, on_hand_ml, low_stock_ml, gst_rate, business_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), p.name, p.brand, p.category, p.pack_type, p.bottle_ml, p.barcode, p.price_peg30 || 0, p.price_peg60 || 0, p.price_quarter || 0, p.price_half || 0, p.price_bottle || 0, p.cost_bottle || 0, p.on_hand_ml || 0, p.low_stock_ml || 0, 0, shopId],
      );
    }
  }
  const tables = await query("SELECT id FROM bar_tables WHERE business_id=? LIMIT 1", [shopId]);
  if (!tables.length) {
    for (const t of B().defaultTables()) {
      await query(
        `INSERT INTO bar_tables (id, name, seats, floor, service_type, business_id) VALUES (?,?,?,?,?,?)`,
        [crypto.randomUUID(), t.name, t.seats || 0, t.floor || "Bar", t.service_type || "dine-in", shopId],
      );
    }
  }
}

async function listProducts(shopId, q, category) {
  const params = [shopId];
  let sql = "SELECT * FROM bar_products WHERE business_id=? AND status='active'";
  if (category) {
    sql += " AND category=?";
    params.push(category);
  }
  if (q) {
    sql += " AND (name LIKE ? OR brand LIKE ? OR barcode LIKE ? OR category LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  sql += " ORDER BY category, name";
  return query(sql, params);
}

async function nextBillNo(shopId) {
  const rows = await query("SELECT COUNT(*) n FROM bar_sales WHERE business_id=?", [shopId]);
  return `BAR-${1001 + Number(rows[0]?.n || 0)}`;
}

function receiptHtml(sale, lines, settings) {
  return `<div class="bar-ticket">
    <h3>${clip(settings.invoice_title || "Bar Invoice", 80)}</h3>
    <p>${clip(sale.bill_no, 32)} · ${clip(sale.method, 16)} · ${clip(sale.table_name || "Walk-in", 80)}</p>
    <table><tbody>${lines
      .map((l) => `<tr><td>${clip(l.name, 80)} × ${l.qty} ${clip(l.serve, 16)}</td><td>₹${B().round2(l.total)}</td></tr>`)
      .join("")}</tbody></table>
    <p>Tax ₹${B().round2(sale.tax)} · Total ₹${B().round2(sale.total)}</p>
  </div>`;
}

async function boardStats(shopId) {
  const today = B().ymdIst(new Date());
  const [sales] = await query(
    `SELECT COALESCE(SUM(total),0) sales, COUNT(*) bills, COALESCE(SUM(profit),0) profit
     FROM bar_sales WHERE business_id=? AND status='paid' AND DATE(created_at)=?`,
    [shopId, today],
  );
  const [pegs] = await query(
    `SELECT COALESCE(SUM(l.qty),0) n FROM bar_sale_lines l JOIN bar_sales s ON s.id=l.sale_id
     WHERE l.business_id=? AND s.status='paid' AND DATE(s.created_at)=? AND l.serve IN ('peg30','peg60')`,
    [shopId, today],
  );
  const [bottles] = await query(
    `SELECT COALESCE(SUM(l.qty),0) n FROM bar_sale_lines l JOIN bar_sales s ON s.id=l.sale_id
     WHERE l.business_id=? AND s.status='paid' AND DATE(s.created_at)=? AND l.serve='bottle'`,
    [shopId, today],
  );
  const [open] = await query(`SELECT COUNT(*) n FROM bar_tables WHERE business_id=? AND status='busy'`, [shopId]);
  const products = await query("SELECT * FROM bar_products WHERE business_id=? AND status='active'", [shopId]);
  const settings = await settingsOf(shopId);
  const low = products.filter((p) => B().isLowStock(p));
  const exp = products.filter((p) => B().isExpiring(p, today, 30));
  const pending = await query("SELECT hold_json FROM bar_tables WHERE business_id=? AND status='busy'", [shopId]);
  let pendingPay = 0;
  for (const row of pending) {
    try {
      const hold = JSON.parse(row.hold_json || "{}");
      pendingPay += Number(hold.total) || 0;
    } catch {
      /* ignore */
    }
  }
  return {
    todaySales: Number(sales?.sales || 0),
    todayBills: Number(sales?.bills || 0),
    todayProfit: Number(sales?.profit || 0),
    todayPegs: Number(pegs?.n || 0),
    todayBottles: Number(bottles?.n || 0),
    openTables: Number(open?.n || 0),
    pendingPay: B().round2(pendingPay),
    lowStock: low.length,
    expiryAlerts: exp.length,
    low,
    exp,
    settings,
  };
}

function parseHold(raw) {
  try {
    const hold = typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {};
    return hold && typeof hold === "object" ? hold : {};
  } catch {
    return {};
  }
}

export function registerBarStaff(app) {
  app.use("/api/bar", async (req, res, next) => {
    try {
      await ensureBarSchema();
      const biz = await loadBiz();
      assertBar(biz);
      req.barBiz = biz;
      await seedIfEmpty(bid());
      next();
    } catch (err) {
      res.status(err.status || 400).json({ error: String(err.message) });
    }
  });

  app.get("/api/bar/board", requirePerm("dashboard"), async (_req, res) => {
    try {
      const stats = await boardStats(bid());
      res.json({
        stats,
        cards: B().dashboardCards(stats),
        lowStock: stats.low,
        expiring: stats.exp,
        reports: B().REPORTS,
      });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.get("/api/bar/settings", requirePerm("counter"), async (_req, res) => {
    try {
      res.json(await settingsOf(bid()));
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/bar/settings", requirePerm("settings"), async (req, res) => {
    try {
      const saved = await saveSettings(bid(), req.body || {});
      await audit("settings", "Updated bar settings");
      res.json(saved);
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  app.get("/api/bar/products", requirePerm("counter"), async (req, res) => {
    try {
      res.json(await listProducts(bid(), clip(req.query.q, 80), clip(req.query.category, 64)));
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/bar/products", requirePerm("items"), async (req, res) => {
    try {
      const body = productPayload(req.body || {});
      const id = clip(req.body?.id, 64) || crypto.randomUUID();
      const exists = await query("SELECT id FROM bar_products WHERE id=? AND business_id=?", [id, bid()]);
      if (exists.length) {
        await query(
          `UPDATE bar_products SET name=?, brand=?, category=?, pack_type=?, bottle_ml=?, barcode=?, price_peg30=?, price_peg60=?, price_quarter=?, price_half=?, price_bottle=?, cost_bottle=?, on_hand_ml=?, low_stock_ml=?, batch_no=?, expiry_date=?, gst_rate=?, status=?
           WHERE id=? AND business_id=?`,
          [body.name, body.brand, body.category, body.pack_type, body.bottle_ml, body.barcode, body.price_peg30, body.price_peg60, body.price_quarter, body.price_half, body.price_bottle, body.cost_bottle, body.on_hand_ml, body.low_stock_ml, body.batch_no, body.expiry_date, body.gst_rate, body.status, id, bid()],
        );
      } else {
        await query(
          `INSERT INTO bar_products (id, name, brand, category, pack_type, bottle_ml, barcode, price_peg30, price_peg60, price_quarter, price_half, price_bottle, cost_bottle, on_hand_ml, low_stock_ml, batch_no, expiry_date, gst_rate, status, business_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, body.name, body.brand, body.category, body.pack_type, body.bottle_ml, body.barcode, body.price_peg30, body.price_peg60, body.price_quarter, body.price_half, body.price_bottle, body.cost_bottle, body.on_hand_ml, body.low_stock_ml, body.batch_no, body.expiry_date, body.gst_rate, body.status, bid()],
        );
      }
      await audit("product", `${exists.length ? "Updated" : "Added"} ${body.name}`);
      res.json({ ok: true, id });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  app.get("/api/bar/stock", requirePerm("stock"), async (_req, res) => {
    try {
      const products = await listProducts(bid(), "", "");
      const movements = await query(
        `SELECT m.*, p.name product_name FROM bar_movements m LEFT JOIN bar_products p ON p.id=m.product_id
         WHERE m.business_id=? ORDER BY m.created_at DESC LIMIT 80`,
        [bid()],
      );
      res.json({ products, movements });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/bar/movements", requirePerm("stock"), async (req, res) => {
    try {
      if (!B().canAdjustStock(roleOf(), permsOf())) {
        res.status(403).json({ error: "Stock adjustments need manager or stock permission" });
        return;
      }
      const kind = clip(req.body?.kind, 32);
      const qty = num(req.body?.qty_ml);
      const productId = clip(req.body?.product_id, 64);
      const [product] = await query("SELECT * FROM bar_products WHERE id=? AND business_id=?", [productId, bid()]);
      if (!product) throw new Error("Product not found");
      const next = B().applyMovement(product, kind, qty);
      const user = authUser() || {};
      await withTransaction(async (conn) => {
        await conn.query("UPDATE bar_products SET on_hand_ml=? WHERE id=? AND business_id=?", [next.on_hand_ml, productId, bid()]);
        await conn.query(
          `INSERT INTO bar_movements (id, product_id, kind, qty_ml, note, user_id, user_name, business_id) VALUES (?,?,?,?,?,?,?,?)`,
          [crypto.randomUUID(), productId, kind, next.delta_ml, clip(req.body?.note, 255), user.id || null, clip(user.first_name || user.name || "", 180), bid()],
        );
      });
      await audit("stock", `${kind} ${next.delta_ml} ml on ${product.name}`);
      res.json({ ok: true, on_hand_ml: next.on_hand_ml });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  app.get("/api/bar/tables", requirePerm("counter"), async (_req, res) => {
    try {
      const rows = await query("SELECT * FROM bar_tables WHERE business_id=? ORDER BY floor, name", [bid()]);
      res.json(
        rows.map((t) => {
          const hold = parseHold(t.hold_json);
          return { ...t, hold, pending: Number(hold.total) || 0, status: hold.lines?.length ? "busy" : t.status || "free" };
        }),
      );
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/bar/tables", requirePerm("settings"), async (req, res) => {
    try {
      const id = clip(req.body?.id, 64) || crypto.randomUUID();
      const name = clip(req.body?.name, 80) || "Bar table";
      const seats = Math.max(0, Math.round(num(req.body?.seats, 4)));
      const floor = clip(req.body?.floor, 64) || "Bar";
      const service = clip(req.body?.service_type, 32) || "dine-in";
      const exists = await query("SELECT id FROM bar_tables WHERE id=? AND business_id=?", [id, bid()]);
      if (exists.length) {
        await query("UPDATE bar_tables SET name=?, seats=?, floor=?, service_type=? WHERE id=? AND business_id=?", [name, seats, floor, service, id, bid()]);
      } else {
        await query("INSERT INTO bar_tables (id, name, seats, floor, service_type, business_id) VALUES (?,?,?,?,?,?)", [id, name, seats, floor, service, bid()]);
      }
      res.json({ ok: true, id });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  app.post("/api/bar/tables/:id/hold", requirePerm("counter"), async (req, res) => {
    try {
      const settings = await settingsOf(bid());
      const products = await listProducts(bid(), "", "");
      const map = Object.fromEntries(products.map((p) => [p.id, p]));
      const lines = (req.body?.lines || []).map((l) => {
        const product = map[l.product_id];
        if (!product) throw new Error("Unknown product");
        return { ...B().lineTotals(product, l.serve, l.qty, l.discount, settings), product_id: product.id, name: product.name };
      });
      const tot = B().billTotals(lines, 0, settings);
      const hold = { lines: req.body.lines || [], priced: lines, total: tot.total, service_type: clip(req.body?.service_type, 32) || "dine-in" };
      await query("UPDATE bar_tables SET status='busy', hold_json=? WHERE id=? AND business_id=?", [JSON.stringify(hold), req.params.id, bid()]);
      res.json({ ok: true, hold });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  app.post("/api/bar/tables/transfer", requirePerm("counter"), async (req, res) => {
    try {
      const fromId = clip(req.body?.from_id, 64);
      const toId = clip(req.body?.to_id, 64);
      await ensureIdempotencyTable();
      const key = clipIdempotencyKey(req.body?.idempotencyKey || req.body?.idempotency_key);
      if (key) {
        const prior = await findIdempotent(query, bid(), key);
        if (prior) {
          res.json(parseIdempotentPayload(prior) || { ok: true, replay: true });
          return;
        }
      }
      const out = await withTransaction(async (conn) => {
        const [[from]] = await conn.query("SELECT * FROM bar_tables WHERE id=? AND business_id=? FOR UPDATE", [fromId, bid()]);
        const [[to]] = await conn.query("SELECT * FROM bar_tables WHERE id=? AND business_id=? FOR UPDATE", [toId, bid()]);
        if (!from || !to) throw new Error("Table not found");
        const destHold = parseHold(to.hold_json);
        if (destHold.lines?.length) throw new Error("Destination table is occupied");
        const srcHold = parseHold(from.hold_json);
        if (!srcHold.lines?.length) throw new Error("No active order on that table");
        await conn.query("UPDATE bar_tables SET status='busy', hold_json=? WHERE id=? AND business_id=?", [from.hold_json, toId, bid()]);
        await conn.query("UPDATE bar_tables SET status='free', hold_json=NULL WHERE id=? AND business_id=?", [fromId, bid()]);
        const payload = { ok: true, from_id: fromId, to_id: toId, source_vacant: true, dest_occupied: true };
        if (key) await saveIdempotent(conn, bid(), key, "bar-transfer", `${fromId}->${toId}`, payload);
        return payload;
      });
      await audit("table", `Transferred order`);
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  app.post("/api/bar/tables/:id/split", requirePerm("counter"), async (req, res) => {
    try {
      const [tbl] = await query("SELECT * FROM bar_tables WHERE id=? AND business_id=?", [req.params.id, bid()]);
      if (!tbl) throw new Error("Table not found");
      const hold = parseHold(tbl.hold_json);
      const split = B().splitLines(hold.lines || [], req.body?.indexes || []);
      await query("UPDATE bar_tables SET hold_json=? WHERE id=? AND business_id=?", [JSON.stringify({ ...hold, lines: split.b }), req.params.id, bid()]);
      const name = `${tbl.name} B`;
      await query("INSERT INTO bar_tables (id, name, seats, floor, service_type, status, hold_json, business_id) VALUES (?,?,?,?,?,'busy',?,?)", [
        crypto.randomUUID(),
        name,
        tbl.seats,
        tbl.floor,
        tbl.service_type,
        JSON.stringify({ ...hold, lines: split.a }),
        bid(),
      ]);
      await audit("table", `Split ${tbl.name}`);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  app.post("/api/bar/tables/combine", requirePerm("counter"), async (req, res) => {
    try {
      const [a] = await query("SELECT * FROM bar_tables WHERE id=? AND business_id=?", [clip(req.body?.a_id, 64), bid()]);
      const [b] = await query("SELECT * FROM bar_tables WHERE id=? AND business_id=?", [clip(req.body?.b_id, 64), bid()]);
      if (!a || !b) throw new Error("Table not found");
      const hold = B().combineHolds(parseHold(a.hold_json), parseHold(b.hold_json));
      await query("UPDATE bar_tables SET status='busy', hold_json=? WHERE id=? AND business_id=?", [JSON.stringify(hold), a.id, bid()]);
      await query("UPDATE bar_tables SET status='free', hold_json=NULL WHERE id=? AND business_id=?", [b.id, bid()]);
      await audit("table", `Combined ${b.name} into ${a.name}`);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  app.post("/api/bar/checkout", requirePerm("counter"), async (req, res) => {
    try {
      await ensureIdempotencyTable();
      const idemKey = clipIdempotencyKey(req.body?.idempotencyKey || req.body?.idempotency_key);
      if (idemKey) {
        const prior = await findIdempotent(query, bid(), idemKey);
        if (prior) {
          res.json(parseIdempotentPayload(prior) || { ok: true, replay: true, id: prior.ref_id });
          return;
        }
      }
      const settings = await settingsOf(bid());
      const operate = B().canOperate(settings, new Date(), B().ymdIst(new Date()));
      if (!operate.ok && !B().canVoid(roleOf(), permsOf())) throw new Error(operate.reason || "Bar sales restricted");
      if (num(req.body?.bill_discount) > 0 && !B().canDiscount(roleOf(), permsOf())) {
        throw new Error("Bill discount needs manager authorization");
      }
      const products = await listProducts(bid(), "", "");
      const map = Object.fromEntries(products.map((p) => [p.id, p]));
      const rawLines = req.body?.lines || [];
      if (!rawLines.length) throw new Error("Add at least one serve");
      for (const l of rawLines) {
        if (num(l.discount) > 0 && !B().canDiscount(roleOf(), permsOf())) throw new Error("Item discount needs manager authorization");
      }
      const cart = B().priceCart(map, rawLines, req.body?.bill_discount, settings);
      if (!cart.ok) throw new Error(cart.reason);
      const priced = cart.priced;
      const totals = cart.totals;
      const user = authUser() || {};
      const saleId = crypto.randomUUID();
      const billNo = await nextBillNo(bid());
      const out = await withTransaction(async (conn) => {
        for (const line of priced) {
          await conn.query("UPDATE bar_products SET on_hand_ml=? WHERE id=? AND business_id=?", [line.remaining_ml, line.product.id, bid()]);
          await conn.query(
            `INSERT INTO bar_movements (id, product_id, kind, qty_ml, note, ref_id, user_id, user_name, business_id) VALUES (?,?,?,?,?,?,?,?,?)`,
            [crypto.randomUUID(), line.product.id, "sale", -Math.abs(line.row.serve_ml), billNo, saleId, user.id || null, clip(user.first_name || user.name || "", 180), bid()],
          );
          await conn.query(
            `INSERT INTO bar_sale_lines (id, sale_id, product_id, name, brand, category, serve, qty, serve_ml, unit_price, discount, tax, total, cogs, business_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [crypto.randomUUID(), saleId, line.product.id, line.product.name, line.product.brand, line.product.category, line.row.serve, line.row.qty, line.row.serve_ml, line.row.unit_price, line.row.discount, line.row.tax, line.row.total, line.row.cogs, bid()],
          );
        }
        await conn.query(
          `INSERT INTO bar_sales (id, bill_no, table_id, table_name, service_type, method, item_gross, item_discount, bill_discount, tax, total, cogs, profit, cashier_id, cashier_name, business_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [saleId, billNo, clip(req.body?.table_id, 64) || null, clip(req.body?.table_name, 80), clip(req.body?.service_type, 32) || "dine-in", clip(req.body?.method, 32) || "cash", totals.item_gross, totals.item_discount, totals.bill_discount, totals.tax, totals.total, totals.cogs, totals.profit, user.id || null, clip(user.first_name || user.name || "", 180), bid()],
        );
        if (req.body?.table_id) {
          await conn.query("UPDATE bar_tables SET status='free', hold_json=NULL WHERE id=? AND business_id=?", [req.body.table_id, bid()]);
        }
        const sale = { id: saleId, bill_no: billNo, ...totals, method: req.body?.method || "cash", table_name: req.body?.table_name || "" };
        const billed = { ...sale, receipt_html: receiptHtml(sale, priced.map((p) => ({ ...p.row, name: p.product.name })), settings) };
        if (idemKey) await saveIdempotent(conn, bid(), idemKey, "bar-checkout", saleId, billed);
        return billed;
      });
      await audit("sale", `${billNo} ${totals.total}`);
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  app.post("/api/bar/sales/:id/void", requirePerm("orders"), async (req, res) => {
    try {
      if (!B().canVoid(roleOf(), permsOf())) throw new Error("Voids need manager authorization");
      const [sale] = await query("SELECT * FROM bar_sales WHERE id=? AND business_id=?", [req.params.id, bid()]);
      if (!sale) throw new Error("Bill not found");
      if (sale.status !== "paid") throw new Error("Bill is not open for void");
      const lines = await query("SELECT * FROM bar_sale_lines WHERE sale_id=? AND business_id=?", [sale.id, bid()]);
      await withTransaction(async (conn) => {
        for (const line of lines) {
          await conn.query("UPDATE bar_products SET on_hand_ml = on_hand_ml + ? WHERE id=? AND business_id=?", [line.serve_ml, line.product_id, bid()]);
          await conn.query(
            `INSERT INTO bar_movements (id, product_id, kind, qty_ml, note, ref_id, business_id) VALUES (?,?,?,?,?,?,?)`,
            [crypto.randomUUID(), line.product_id, "return", line.serve_ml, `void ${sale.bill_no}`, sale.id, bid()],
          );
        }
        await conn.query("UPDATE bar_sales SET status='void', void_reason=? WHERE id=? AND business_id=?", [clip(req.body?.reason, 255) || "void", sale.id, bid()]);
      });
      await audit("void", `${sale.bill_no} ${req.body?.reason || ""}`);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  app.post("/api/bar/sales/:id/refund", requirePerm("orders"), async (req, res) => {
    try {
      if (!B().canVoid(roleOf(), permsOf())) throw new Error("Refunds need manager authorization");
      const [sale] = await query("SELECT * FROM bar_sales WHERE id=? AND business_id=?", [req.params.id, bid()]);
      if (!sale) throw new Error("Bill not found");
      if (sale.status !== "paid") throw new Error("Bill is not open for refund");
      const lines = await query("SELECT * FROM bar_sale_lines WHERE sale_id=? AND business_id=?", [sale.id, bid()]);
      await withTransaction(async (conn) => {
        for (const line of lines) {
          await conn.query("UPDATE bar_products SET on_hand_ml = on_hand_ml + ? WHERE id=? AND business_id=?", [line.serve_ml, line.product_id, bid()]);
          await conn.query(
            `INSERT INTO bar_movements (id, product_id, kind, qty_ml, note, ref_id, business_id) VALUES (?,?,?,?,?,?,?)`,
            [crypto.randomUUID(), line.product_id, "return", line.serve_ml, `refund ${sale.bill_no}`, sale.id, bid()],
          );
        }
        await conn.query("UPDATE bar_sales SET status='refunded', void_reason=? WHERE id=? AND business_id=?", [clip(req.body?.reason, 255) || "refund", sale.id, bid()]);
      });
      await audit("refund", `${sale.bill_no}`);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  app.get("/api/bar/reports/:id", requirePerm("reports"), async (req, res) => {
    try {
      const id = clip(req.params.id, 40);
      const shop = bid();
      let rows = [];
      if (id === "bar-sales-daily" || id === "bar-sales-weekly" || id === "bar-sales-monthly") {
        const days = id.endsWith("weekly") ? 7 : id.endsWith("monthly") ? 30 : 1;
        rows = await query(
          `SELECT DATE(created_at) day, COUNT(*) bills, SUM(total) sales, SUM(tax) tax, SUM(cogs) cogs, SUM(profit) profit
           FROM bar_sales WHERE business_id=? AND status='paid' AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
           GROUP BY DATE(created_at) ORDER BY day DESC`,
          [shop, days],
        );
      } else if (id === "bar-sales-product") {
        rows = await query(
          `SELECT l.name, SUM(l.qty) qty, SUM(l.total) sales, SUM(l.serve_ml) ml FROM bar_sale_lines l JOIN bar_sales s ON s.id=l.sale_id
           WHERE l.business_id=? AND s.status='paid' GROUP BY l.name ORDER BY sales DESC LIMIT 80`,
          [shop],
        );
      } else if (id === "bar-sales-brand") {
        rows = await query(
          `SELECT l.brand, SUM(l.qty) qty, SUM(l.total) sales FROM bar_sale_lines l JOIN bar_sales s ON s.id=l.sale_id
           WHERE l.business_id=? AND s.status='paid' GROUP BY l.brand ORDER BY sales DESC`,
          [shop],
        );
      } else if (id === "bar-sales-category") {
        rows = await query(
          `SELECT l.category, SUM(l.qty) qty, SUM(l.total) sales FROM bar_sale_lines l JOIN bar_sales s ON s.id=l.sale_id
           WHERE l.business_id=? AND s.status='paid' GROUP BY l.category ORDER BY sales DESC`,
          [shop],
        );
      } else if (id === "bar-consumption") {
        rows = await query(
          `SELECT l.serve, SUM(l.qty) qty, SUM(l.serve_ml) ml, SUM(l.total) sales FROM bar_sale_lines l JOIN bar_sales s ON s.id=l.sale_id
           WHERE l.business_id=? AND s.status='paid' GROUP BY l.serve ORDER BY ml DESC`,
          [shop],
        );
      } else if (id === "bar-stock") {
        rows = await query("SELECT name, brand, category, on_hand_ml, low_stock_ml, batch_no, expiry_date, cost_bottle FROM bar_products WHERE business_id=? ORDER BY name", [shop]);
      } else if (id === "bar-variance") {
        rows = await query(
          `SELECT kind, SUM(qty_ml) ml, COUNT(*) n FROM bar_movements WHERE business_id=? GROUP BY kind ORDER BY kind`,
          [shop],
        );
      } else if (id === "bar-collection") {
        rows = await query(
          `SELECT cashier_name, method, COUNT(*) bills, SUM(total) collected FROM bar_sales WHERE business_id=? AND status='paid' GROUP BY cashier_name, method`,
          [shop],
        );
      } else if (id === "bar-profit") {
        rows = await query(
          `SELECT DATE(created_at) day, SUM(item_gross) gross, SUM(item_discount+bill_discount) discounts, SUM(tax) tax, SUM(cogs) cogs, SUM(profit) profit
           FROM bar_sales WHERE business_id=? AND status='paid' GROUP BY DATE(created_at) ORDER BY day DESC LIMIT 40`,
          [shop],
        );
      } else if (id === "bar-tables") {
        rows = await query(
          `SELECT table_name, COUNT(*) bills, SUM(total) sales FROM bar_sales WHERE business_id=? AND status='paid' GROUP BY table_name ORDER BY sales DESC`,
          [shop],
        );
      } else if (id === "bar-top") {
        rows = await query(
          `SELECT l.name, l.brand, l.category, SUM(l.qty) qty, SUM(l.total) sales FROM bar_sale_lines l JOIN bar_sales s ON s.id=l.sale_id
           WHERE l.business_id=? AND s.status='paid' GROUP BY l.name, l.brand, l.category ORDER BY qty DESC LIMIT 20`,
          [shop],
        );
      }
      res.json({ id, rows });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.get("/api/bar/audit", requirePerm("settings"), async (_req, res) => {
    try {
      res.json(await query("SELECT * FROM bar_audit WHERE business_id=? ORDER BY created_at DESC LIMIT 120", [bid()]));
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });
}
