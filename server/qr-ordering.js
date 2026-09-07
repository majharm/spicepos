import crypto from "node:crypto";
import "../js/units.js";
import { query, withTransaction } from "./db.js";
import { bid, branchId, authUser } from "./context.js";
import { requirePerm } from "./auth.js";
import { listOffers, getPromoSettings, POSOffers } from "./offers.js";
import { nextSeq, itemBillName, round2 } from "./crud.js";
import { applySaleStock } from "./advanced.js";
import { recordCreditSale } from "./accounts.js";
import { postSaleJournal } from "./accounting.js";

const POSUnits = globalThis.POSUnits;
const QR_STATUSES = ["pending", "accepted", "preparing", "ready", "completed", "cancelled"];

export async function ensureQrOrderSchema(conn = null) {
  const exec = conn ? (sql, params = []) => conn.query(sql, params) : query;
  await exec(`CREATE TABLE IF NOT EXISTS qr_orders (
    id VARCHAR(255) PRIMARY KEY,
    order_number VARCHAR(32) NOT NULL,
    business_id VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255) NULL,
    customer_name VARCHAR(160) NOT NULL,
    mobile VARCHAR(32) NOT NULL,
    table_no VARCHAR(64) NULL,
    notes TEXT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_qr_order_number (business_id, order_number),
    INDEX idx_qr_orders_business_status (business_id, status, created_at)
  )`);
  try {
    await exec("ALTER TABLE qr_orders ADD COLUMN discount DECIMAL(12,2) NOT NULL DEFAULT 0");
  } catch {
    /* already present */
  }
  try {
    await exec("ALTER TABLE qr_orders ADD COLUMN offer_label VARCHAR(255) NULL");
  } catch {
    /* already present */
  }
  try {
    await exec("ALTER TABLE qr_orders ADD COLUMN sales_order_id VARCHAR(255) NULL");
  } catch {
    /* already present */
  }
  try {
    await exec("ALTER TABLE sales_orders ADD COLUMN qr_order_id VARCHAR(255) NULL");
  } catch {
    /* already present */
  }
  await exec(`CREATE TABLE IF NOT EXISTS qr_order_lines (
    id VARCHAR(255) PRIMARY KEY,
    order_id VARCHAR(255) NOT NULL,
    business_id VARCHAR(255) NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    unit VARCHAR(32) NOT NULL,
    quantity_gm DECIMAL(14,3) NOT NULL,
    rate_per_kg DECIMAL(12,4) NOT NULL,
    gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_qr_order_lines_order (order_id),
    INDEX idx_qr_order_lines_business (business_id)
  )`);
}

function cleanText(value, max) {
  return String(value || "").trim().slice(0, max);
}

export function normalizeQrOrderPayload(raw = {}) {
  const customerName = cleanText(raw.customer_name || raw.customerName, 160);
  const mobile = cleanText(raw.mobile, 32).replace(/[^\d+]/g, "");
  const tableNo = cleanText(raw.table_no || raw.tableNo, 64);
  const notes = cleanText(raw.notes, 1000);
  const source = Array.isArray(raw.lines) ? raw.lines : [];
  const lines = source
    .slice(0, 50)
    .map((line) => ({
      item_id: cleanText(line.item_id || line.itemId, 255),
      quantity: Number(line.quantity),
    }))
    .filter((line) => line.item_id && Number.isFinite(line.quantity) && line.quantity > 0);
  if (!customerName) throw new Error("Customer name is required");
  if (mobile.replace(/\D/g, "").length < 10) throw new Error("Valid mobile number is required");
  if (!lines.length) throw new Error("Add at least one item");
  return { customerName, mobile, tableNo, notes, lines };
}

export function qrQuantityToBase(quantity, unit) {
  const n = Number(quantity);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid item quantity");
  const code = POSUnits.normalize(unit);
  if (code === "GM" || code === "ML") return Math.round(n * 1000 * 1000) / 1000;
  return POSUnits.toBase(n, code);
}

export function qrLineAmount(quantityBase, rate, unit) {
  return Math.round(POSUnits.lineAmount(quantityBase, Number(rate) || 0, POSUnits.normalize(unit)) * 100) / 100;
}

function qrRound2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function packMenuId(packId) {
  return `pack:${String(packId || "")}`;
}

export function parsePackMenuId(id) {
  const raw = String(id || "");
  return raw.startsWith("pack:") ? raw.slice(5) : "";
}

export function qrPackAvailable(rows, itemById) {
  let max = Infinity;
  for (const row of rows || []) {
    const item = itemById.get(String(row.item_id || row.itemId || ""));
    const need = Number(row.quantity_gm) || 0;
    if (!item || need <= 0) return 0;
    if (String(item.status || "active") !== "active") return 0;
    max = Math.min(max, Math.floor((Number(item.stock_gm) || 0) / need));
  }
  return Number.isFinite(max) ? Math.max(0, max) : 0;
}

export function qrPackPrice(rows, itemById) {
  let amount = 0;
  let gstAmt = 0;
  for (const row of rows || []) {
    const item = itemById.get(String(row.item_id || row.itemId || ""));
    if (!item) continue;
    const qty = Number(row.quantity_gm) || 0;
    const line = qrLineAmount(qty, item.retail_rate, item.base_unit || item.unit);
    amount += line;
    gstAmt += (line * (Number(item.gst_rate) || 0)) / 100;
  }
  return {
    price: qrRound2(amount),
    gst_rate: amount > 0 ? qrRound2((gstAmt / amount) * 100) : 0,
  };
}

export function toQrPackCards(packs, items) {
  const itemById = new Map((items || []).map((item) => [String(item.id), item]));
  return (packs || [])
    .filter((pack) => String(pack.status || "active") === "active")
    .map((pack) => {
      const rows = pack.items || [];
      if (!rows.length) return null;
      const available = qrPackAvailable(rows, itemById);
      if (available <= 0) return null;
      const priced = qrPackPrice(rows, itemById);
      if (priced.price <= 0) return null;
      return {
        id: packMenuId(pack.id),
        pack_id: pack.id,
        code: pack.code || "",
        name: pack.name,
        category: "Packs",
        base_unit: "PCS",
        unit: "PCS",
        retail_rate: priced.price,
        gst_rate: priced.gst_rate,
        stock_gm: available,
        kind: "pack",
        image_url: "",
        pack_items: rows.map((row) => ({
          item_id: row.item_id,
          name: row.spice_name || row.item_name || row.name || "",
          quantity_gm: Number(row.quantity_gm) || 0,
        })),
      };
    })
    .filter(Boolean);
}

export function expandQrPackLine(line, pack, itemById) {
  const count = Math.round(Number(line.quantity) || 0);
  if (count <= 0) throw new Error("Invalid pack quantity");
  if (!pack || String(pack.status || "active") !== "active") throw new Error("That pack is no longer available");
  const rows = pack.items || [];
  if (!rows.length) throw new Error("That pack has no items");
  return rows.map((row) => {
    const item = itemById.get(String(row.item_id));
    if (!item || String(item.status || "active") !== "active") throw new Error(`${pack.name} is no longer available`);
    const quantityBase = (Number(row.quantity_gm) || 0) * count;
    if (quantityBase <= 0) throw new Error(`${pack.name} is no longer available`);
    if (quantityBase > Number(item.stock_gm || 0)) throw new Error(`${pack.name} does not have enough stock`);
    const unit = POSUnits.normalize(item.base_unit || item.unit);
    const amount = qrLineAmount(quantityBase, item.retail_rate, unit);
    const gstRate = Number(item.gst_rate) || 0;
    return { item, unit, quantityBase, amount, gstRate, gstAmount: qrRound2((amount * gstRate) / 100) };
  });
}

async function loadQrPacks(businessId, conn = null) {
  const exec = conn ? (sql, params = []) => conn.query(sql, params).then(([rows]) => rows) : query;
  let packs = [];
  try {
    packs = await exec(
      "SELECT * FROM packs WHERE business_id = ? AND (status = 'active' OR status IS NULL OR status = '') ORDER BY name",
      [businessId],
    );
  } catch {
    return [];
  }
  if (!packs.length) return [];
  const ids = packs.map((pack) => pack.id);
  let rows = [];
  try {
    rows = await exec(
      `SELECT pi.*, i.name AS spice_name, i.local_name, i.code AS item_code
       FROM pack_items pi JOIN items i ON i.id = pi.item_id
       WHERE pi.pack_id IN (${ids.map(() => "?").join(",")}) ORDER BY pi.sort_order`,
      ids,
    );
  } catch {
    return [];
  }
  return packs.map((pack) => ({
    ...pack,
    items: rows.filter((row) => row.pack_id === pack.id),
  }));
}

export function qrOfferCart(built) {
  return (built || []).map((line) => {
    const item = line.item || {};
    const unit = POSUnits.normalize(line.unit || item.base_unit || item.unit);
    const isCount = POSUnits.isCount(unit);
    return {
      itemId: item.id,
      lineId: item.id,
      qty: line.quantityBase ?? line.qty,
      qtyGm: line.quantityBase ?? line.qty,
      isCount,
      gross: Number(line.amount) || 0,
      taxable: Number(line.amount) || 0,
      category: item.category || "",
      item,
    };
  });
}

export function applyQrOffers(built, { offers = [], stacking = "product_and_bill", items = [], now } = {}) {
  const O = POSOffers || globalThis.POSOffers;
  const source = Array.isArray(built) ? built.map((line) => ({ ...line })) : [];
  if (!O || !source.length) {
    const subtotal = qrRound2(source.reduce((sum, line) => sum + (Number(line.amount) || 0), 0));
    const gst = qrRound2(source.reduce((sum, line) => sum + (Number(line.gstAmount ?? line.gst) || 0), 0));
    return { built: source, subtotal, gst, total: qrRound2(subtotal + gst), discount: 0, applied: [], message: "" };
  }
  const live = (offers || []).filter((offer) => (offer.live_status || offer.status) === "active");
  const result = O.evaluateAll(live, {
    now: now || new Date(),
    cart: qrOfferCart(source),
    items: items.length ? items : source.map((line) => line.item).filter(Boolean),
    stacking,
    customer: { bills: 0, lifetime_spend: 0 },
  });
  const next = source.map((line) => {
    const id = String(line.item?.id || "");
    const d = Math.min(Math.max(0, Number(result.lineDiscounts?.[id] || 0)), Number(line.amount) || 0);
    const amount = qrRound2((Number(line.amount) || 0) - d);
    const gstRate = Number(line.gstRate ?? line.gst_rate) || 0;
    return { ...line, amount, gstAmount: qrRound2((amount * gstRate) / 100), discount: d };
  });
  let subtotal = qrRound2(next.reduce((sum, line) => sum + (Number(line.amount) || 0), 0));
  const bill = Math.min(Math.max(0, Number(result.billDiscount) || 0), subtotal);
  if (bill > 0 && subtotal > 0) {
    let left = bill;
    next.forEach((line, index) => {
      const share = index === next.length - 1 ? left : qrRound2((bill * (Number(line.amount) || 0)) / subtotal);
      left = qrRound2(left - share);
      line.amount = qrRound2((Number(line.amount) || 0) - share);
      line.discount = qrRound2((Number(line.discount) || 0) + share);
      line.gstAmount = qrRound2((line.amount * (Number(line.gstRate ?? line.gst_rate) || 0)) / 100);
    });
    subtotal = qrRound2(next.reduce((sum, line) => sum + (Number(line.amount) || 0), 0));
  }
  const gst = qrRound2(next.reduce((sum, line) => sum + (Number(line.gstAmount) || 0), 0));
  return {
    built: next,
    subtotal,
    gst,
    total: qrRound2(subtotal + gst),
    discount: qrRound2(result.discount || 0),
    applied: result.applied || [],
    message: result.message || result.applied?.[0]?.name || "",
  };
}

function orderNumber() {
  return `QRO-${Date.now().toString(36).slice(-5).toUpperCase()}${crypto.randomInt(0, 36).toString(36).toUpperCase()}`;
}

async function businessForPublic(shop) {
  const key = cleanText(shop, 255);
  if (!key) return null;
  const rows = await query(
    `SELECT b.*, c.name AS company_name, c.address AS company_address, c.phone AS company_phone,
            c.logo_url AS company_logo
     FROM businesses b
     LEFT JOIN company_settings c ON c.business_id = b.id
     WHERE (b.id = ? OR b.code = ?) AND b.status = 'active' LIMIT 1`,
    [key, key],
  );
  return rows[0] || null;
}

async function qrOrdersWithLines(businessId, status = "") {
  const params = [businessId];
  let statusSql = "";
  if (status && QR_STATUSES.includes(status)) {
    statusSql = " AND status = ?";
    params.push(status);
  }
  const orders = await query(
    `SELECT q.*, s.order_number AS invoice_number
     FROM qr_orders q
     LEFT JOIN sales_orders s ON s.id = q.sales_order_id AND s.business_id = q.business_id
     WHERE q.business_id = ?${statusSql}
     ORDER BY CASE q.status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 WHEN 'preparing' THEN 2
       WHEN 'ready' THEN 3 ELSE 4 END, q.created_at DESC LIMIT 100`,
    params,
  );
  if (!orders.length) return [];
  const ids = orders.map((row) => row.id);
  const lines = await query(
    `SELECT * FROM qr_order_lines WHERE order_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at`,
    ids,
  );
  return orders.map((order) => ({ ...order, lines: lines.filter((line) => line.order_id === order.id) }));
}

export function qrMobileDigits(raw) {
  return String(raw || "").replace(/\D/g, "").slice(-10);
}

function qrPayMethod(raw) {
  const method = String(raw || "cash").toLowerCase();
  return ["cash", "upi", "card", "credit"].includes(method) ? method : "cash";
}

async function findOrCreateQrCustomer(conn, order, businessId) {
  const digits = qrMobileDigits(order.mobile);
  const [all] = await conn.query("SELECT * FROM customers WHERE business_id = ?", [businessId]);
  const found = (all || []).find((row) => qrMobileDigits(row.mobile) === digits && digits.length >= 10);
  if (found) return found;
  const n = await nextSeq(conn, "customer", 4);
  const code = `CUS-${String(n).padStart(3, "0")}`;
  const id = crypto.randomUUID();
  await conn.query(
    `INSERT INTO customers (id, code, name, business_name, mobile, type, gstin, state, credit_limit, outstanding, business_id)
     VALUES (?,?,?,?,?,?,?,?,?,0,?)`,
    [
      id,
      code,
      String(order.customer_name || "Customer").trim().slice(0, 160),
      null,
      String(order.mobile || "").trim().slice(0, 32),
      "b2c",
      null,
      null,
      0,
      businessId,
    ],
  );
  const [rows] = await conn.query("SELECT * FROM customers WHERE id = ?", [id]);
  return rows[0];
}

async function loadSaleWithLines(conn, saleId, businessId) {
  const [orders] = await conn.query("SELECT * FROM sales_orders WHERE id = ? AND business_id = ?", [saleId, businessId]);
  if (!orders[0]) return null;
  const [lines] = await conn.query("SELECT * FROM sales_order_lines WHERE order_id = ?", [saleId]);
  return { ...orders[0], lines };
}

export async function linkQrOrderSale(conn, { businessId, qrOrderId, saleId }) {
  const id = String(qrOrderId || "").trim();
  if (!id || !saleId) return;
  const [rows] = await conn.query(
    "SELECT id, sales_order_id FROM qr_orders WHERE id = ? AND business_id = ? LIMIT 1",
    [id, businessId],
  );
  const qr = rows[0];
  if (!qr) throw new Error("QR order not found");
  if (qr.sales_order_id && qr.sales_order_id !== saleId) throw new Error("This QR order is already invoiced");
  await conn.query(
    "UPDATE qr_orders SET status = 'completed', sales_order_id = ?, branch_id = COALESCE(branch_id, ?) WHERE id = ? AND business_id = ?",
    [saleId, branchId(), id, businessId],
  );
  try {
    await conn.query("UPDATE sales_orders SET qr_order_id = ? WHERE id = ? AND business_id = ?", [id, saleId, businessId]);
  } catch {
    /* column optional until migrate */
  }
}

export async function ensureQrInvoice(qrOrderId, { paymentMethod = "cash" } = {}) {
  const businessId = bid();
  await ensureQrOrderSchema();
  return withTransaction(async (conn) => {
    const [orderRows] = await conn.query(
      "SELECT * FROM qr_orders WHERE id = ? AND business_id = ? LIMIT 1",
      [qrOrderId, businessId],
    );
    const order = orderRows[0];
    if (!order) throw new Error("QR order not found");
    if (String(order.status) === "cancelled") throw new Error("Cancelled QR orders cannot be invoiced");
    if (order.sales_order_id) {
      const existing = await loadSaleWithLines(conn, order.sales_order_id, businessId);
      if (existing) return existing;
    }
    const [qrLines] = await conn.query(
      "SELECT * FROM qr_order_lines WHERE order_id = ? ORDER BY created_at",
      [qrOrderId],
    );
    if (!qrLines.length) throw new Error("This QR order has no items");
    const customer = await findOrCreateQrCustomer(conn, order, businessId);
    const method = qrPayMethod(paymentMethod);
    const payStatus = method === "credit" ? "partial" : "paid";
    const subtotal = round2(order.subtotal);
    const discount = round2(order.discount);
    const gst = round2(order.gst);
    const total = round2(order.total);
    const totalGm = qrLines.reduce((sum, line) => sum + (Number(line.quantity_gm) || 0), 0);
    const next = await nextSeq(conn, "order", 10001);
    const orderNumber = `SO-${next}`;
    const orderId = crypto.randomUUID();
    await conn.query(
      `INSERT INTO sales_orders (
         id, order_number, customer_id, customer_name, customer_type,
         pack_id, pack_name, pack_count, status, total_quantity_gm,
         subtotal, discount, gst, total, payment_method, payment_status, business_id,
         branch_id, cashier_id
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        orderId,
        orderNumber,
        customer.id,
        customer.business_name || customer.name || order.customer_name,
        customer.type || "b2c",
        null,
        null,
        null,
        "confirmed",
        totalGm,
        subtotal,
        discount,
        gst,
        total,
        method,
        payStatus,
        businessId,
        branchId(),
        authUser()?.id || null,
      ],
    );
    try {
      await conn.query("UPDATE sales_orders SET qr_order_id = ?, discount_type = ?, discount_value = ? WHERE id = ? AND business_id = ?", [
        qrOrderId,
        "amt",
        discount,
        orderId,
        businessId,
      ]);
    } catch {
      try {
        await conn.query("UPDATE sales_orders SET qr_order_id = ? WHERE id = ? AND business_id = ?", [qrOrderId, orderId, businessId]);
      } catch {
        /* optional */
      }
    }
    for (const line of qrLines) {
      const [items] = await conn.query("SELECT * FROM items WHERE id = ? AND business_id = ?", [line.item_id, businessId]);
      const item = items[0];
      if (!item) throw new Error("One selected item is no longer available");
      const qty = Number(line.quantity_gm) || 0;
      if (qty <= 0) throw new Error("Invalid quantity");
      if (qty > Number(item.stock_gm || 0)) throw new Error(`${item.name} does not have enough stock`);
      const lineId = crypto.randomUUID();
      const amount = round2(line.amount);
      const gstRate = Number(line.gst_rate) || 0;
      const rate = Number(line.rate_per_kg) || 0;
      const lineDisc = round2(Math.max(0, Number(line.discount) || 0));
      try {
        await conn.query(
          `INSERT INTO sales_order_lines (
             id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
             discount, amount, gst_rate, cancelled, business_id
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [
            lineId,
            orderId,
            item.id,
            line.item_name || itemBillName(item),
            qty,
            rate,
            lineDisc,
            amount,
            gstRate,
            0,
            businessId,
          ],
        );
      } catch {
        await conn.query(
          `INSERT INTO sales_order_lines (
             id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
             discount, amount, gst_rate, cancelled, business_id
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [lineId, orderId, item.id, line.item_name || item.name, qty, rate, lineDisc, amount, gstRate, 0, businessId],
        );
      }
      await applySaleStock(conn, {
        businessId,
        branchId: branchId(),
        userId: authUser()?.id,
        item,
        qty,
        orderId,
        orderNumber,
        costRate: item.purchase_rate,
      });
    }
    const sale = await loadSaleWithLines(conn, orderId, businessId);
    await recordCreditSale(conn, {
      customer,
      total,
      orderId,
      orderNumber,
      method,
    });
    await postSaleJournal(conn, sale);
    await conn.query(
      "UPDATE qr_orders SET status = 'completed', sales_order_id = ?, branch_id = COALESCE(branch_id, ?) WHERE id = ? AND business_id = ?",
      [orderId, branchId(), qrOrderId, businessId],
    );
    return sale;
  });
}

export function registerQrPublic(app) {
  app.get("/api/qr/menu", async (req, res) => {
    try {
      await ensureQrOrderSchema();
      const business = await businessForPublic(req.query.shop);
      if (!business) return res.status(404).json({ error: "Shop not found" });
      const items = await query(
        `SELECT id, code, name, category, subcategory, base_unit, unit, retail_rate, gst_rate,
                hsn, image_url, stock_gm, status
         FROM items WHERE business_id = ? AND status = 'active' AND stock_gm > 0
         ORDER BY category, subcategory, name`,
        [business.id],
      );
      const catalog = await query(
        `SELECT id, name, category, base_unit, unit, retail_rate, gst_rate, stock_gm, status
         FROM items WHERE business_id = ?`,
        [business.id],
      );
      const packs = await loadQrPacks(business.id);
      const packCards = toQrPackCards(packs, catalog);
      const [offers, settings] = await Promise.all([
        listOffers(business.id).catch(() => []),
        getPromoSettings(business.id).catch(() => ({ stacking: "product_and_bill" })),
      ]);
      res.json({
        shop: {
          id: business.id,
          code: business.code,
          name: business.company_name || business.name,
          address: business.company_address || business.address || "",
          phone: business.company_phone || business.mobile || "",
          logo_url: business.company_logo || business.logo_url || "",
        },
        items: [...packCards, ...items],
        packs: packCards,
        offers: (offers || []).filter((offer) => (offer.live_status || offer.status) === "active"),
        offerSettings: { stacking: settings?.stacking || "product_and_bill" },
      });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/qr/orders", async (req, res) => {
    try {
      const input = normalizeQrOrderPayload(req.body || {});
      const business = await businessForPublic(req.body?.shop);
      if (!business) return res.status(404).json({ error: "Shop not found" });
      const result = await withTransaction(async (conn) => {
        await ensureQrOrderSchema(conn);
        const built = [];
        const catalogRows = await conn.query(
          `SELECT id, name, category, base_unit, unit, retail_rate, gst_rate, stock_gm, status
           FROM items WHERE business_id = ?`,
          [business.id],
        ).then(([rows]) => rows);
        const itemById = new Map(catalogRows.map((item) => [String(item.id), item]));
        const packs = await loadQrPacks(business.id, conn);
        const packById = new Map(packs.map((pack) => [String(pack.id), pack]));
        for (const line of input.lines) {
          const packId = parsePackMenuId(line.item_id);
          if (packId) {
            built.push(...expandQrPackLine(line, packById.get(packId), itemById));
            continue;
          }
          const item = itemById.get(String(line.item_id));
          if (!item || String(item.status || "active") !== "active") throw new Error("One selected item is no longer available");
          const unit = POSUnits.normalize(item.base_unit || item.unit);
          const quantityBase = qrQuantityToBase(line.quantity, unit);
          if (quantityBase > Number(item.stock_gm || 0)) throw new Error(`${item.name} does not have enough stock`);
          const amount = qrLineAmount(quantityBase, item.retail_rate, unit);
          const gstRate = Number(item.gst_rate) || 0;
          built.push({ item, unit, quantityBase, amount, gstRate, gstAmount: Math.round(amount * gstRate) / 100 });
        }
        const [offers, settings] = await Promise.all([
          listOffers(business.id).catch(() => []),
          getPromoSettings(business.id).catch(() => ({ stacking: "product_and_bill" })),
        ]);
        const priced = applyQrOffers(built, {
          offers,
          stacking: settings?.stacking || "product_and_bill",
          items: built.map((line) => line.item),
        });
        const { subtotal, gst, total, discount, message } = priced;
        const pricedLines = priced.built;
        const id = crypto.randomUUID();
        const number = orderNumber();
        await conn.query(
          `INSERT INTO qr_orders
           (id, order_number, business_id, customer_name, mobile, table_no, notes, status, subtotal, gst, total, discount, offer_label)
           VALUES (?,?,?,?,?,?,?,'pending',?,?,?,?,?)`,
          [id, number, business.id, input.customerName, input.mobile, input.tableNo || null, input.notes || null, subtotal, gst, total, discount, message || null],
        );
        for (const line of pricedLines) {
          await conn.query(
            `INSERT INTO qr_order_lines
             (id, order_id, business_id, item_id, item_name, unit, quantity_gm, rate_per_kg, gst_rate, amount, gst_amount)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [
              crypto.randomUUID(), id, business.id, line.item.id, line.item.name, line.unit,
              line.quantityBase, Number(line.item.retail_rate) || 0, line.gstRate, line.amount, line.gstAmount,
            ],
          );
        }
        return { id, order_number: number, status: "pending", subtotal, gst, total, discount, offer_label: message || "" };
      });
      res.status(201).json({ ok: true, order: result });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });
}

export function registerQrStaff(app) {
  app.get("/api/qr-orders", requirePerm("orders"), async (req, res) => {
    try {
      await ensureQrOrderSchema();
      res.json(await qrOrdersWithLines(bid(), cleanText(req.query.status, 24).toLowerCase()));
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.patch("/api/qr-orders/:id", requirePerm("orders"), async (req, res) => {
    try {
      const status = cleanText(req.body?.status, 24).toLowerCase();
      if (!QR_STATUSES.includes(status)) return res.status(400).json({ error: "Invalid QR order status" });
      await ensureQrOrderSchema();
      let invoice = null;
      if (status === "completed") {
        invoice = await ensureQrInvoice(req.params.id, { paymentMethod: req.body?.payment_method || req.body?.paymentMethod });
      } else {
        const result = await query(
          "UPDATE qr_orders SET status = ?, branch_id = COALESCE(branch_id, ?) WHERE id = ? AND business_id = ?",
          [status, branchId(), req.params.id, bid()],
        );
        if (!result.affectedRows) return res.status(404).json({ error: "QR order not found" });
      }
      const rows = await qrOrdersWithLines(bid());
      const order = rows.find((row) => row.id === req.params.id);
      if (!order) return res.status(404).json({ error: "QR order not found" });
      res.json({ ok: true, order, invoice });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });
}
