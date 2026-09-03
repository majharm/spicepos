import crypto from "node:crypto";
import "../js/discount.js";
import "../js/loyalty.js";
import "../js/units.js";
import { query, withTransaction } from "./db.js";
import { bid, branchId, authUser } from "./context.js";
import { requireStaff, requirePerm } from "./auth.js";

const POSDiscount = globalThis.POSDiscount;
const POSLoyalty = globalThis.POSLoyalty;
const POSUnits = globalThis.POSUnits;

/** pool.query() already returns rows; conn.query() returns [rows, fields]. */
async function sqlAll(conn, sql, params = []) {
  if (conn) {
    const result = await conn.query(sql, params);
    const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    return Array.isArray(rows) ? rows : [];
  }
  const rows = await query(sql, params);
  return Array.isArray(rows) ? rows : [];
}

async function sqlOne(conn, sql, params = []) {
  const rows = await sqlAll(conn, sql, params);
  return rows[0] || null;
}

async function sqlExec(conn, sql, params = []) {
  if (conn) return conn.query(sql, params);
  return query(sql, params);
}

function itemUnitOf(item) {
  return POSUnits.normalize(item?.base_unit || item?.unit || "GM");
}

function isCountItem(item) {
  return POSUnits.isCount(itemUnitOf(item));
}

function ean13Checksum(digits12) {
  const d = String(digits12 || "").replace(/\D/g, "").padStart(12, "0").slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

function newEan13(businessId, seq) {
  const shop = `${String(businessId || "").replace(/\D/g, "")}00000`.slice(0, 5);
  const body = (`2${shop}${String(seq % 1000000).padStart(6, "0")}`).slice(0, 12);
  return body + String(ean13Checksum(body));
}

async function nextBarcodeSeq(conn, businessId) {
  const row = await sqlOne(
    conn,
    "SELECT next_value FROM number_sequences WHERE name = 'barcode' AND business_id = ? FOR UPDATE",
    [businessId],
  );
  const next = row ? Number(row.next_value) : 1;
  if (row) {
    await sqlExec(conn, "UPDATE number_sequences SET next_value = ? WHERE name = 'barcode' AND business_id = ?", [next + 1, businessId]);
  } else {
    await sqlExec(conn, "INSERT INTO number_sequences (name, next_value, business_id) VALUES ('barcode', ?, ?)", [next + 1, businessId]);
  }
  return next;
}

async function barcodeTaken(conn, businessId, code) {
  if (await sqlOne(conn, "SELECT id FROM item_barcodes WHERE business_id = ? AND barcode = ? LIMIT 1", [businessId, code])) return true;
  if (await sqlOne(conn, "SELECT id FROM items WHERE business_id = ? AND barcode = ? LIMIT 1", [businessId, code])) return true;
  return Boolean(await sqlOne(conn, "SELECT id FROM stock_batches WHERE business_id = ? AND barcode = ? LIMIT 1", [businessId, code]));
}

export async function uniqueEan13(conn, businessId) {
  for (let i = 0; i < 8; i++) {
    const seq = await nextBarcodeSeq(conn, businessId);
    const code = newEan13(businessId, seq);
    if (!(await barcodeTaken(conn, businessId, code))) return code;
  }
  return newEan13(businessId, Date.now() % 1000000);
}

export async function ensureAdvancedSchema() {
  await query(`CREATE TABLE IF NOT EXISTS item_barcodes (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    barcode VARCHAR(64) NOT NULL,
    kind VARCHAR(32) NOT NULL DEFAULT 'own',
    is_primary TINYINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uniq_item_barcode (business_id, barcode),
    INDEX (business_id),
    INDEX (item_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS stock_batches (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255) NULL,
    item_id VARCHAR(255) NOT NULL,
    purchase_id VARCHAR(255) NULL,
    purchase_line_id VARCHAR(255) NULL,
    supplier_id VARCHAR(255) NULL,
    batch_no VARCHAR(64) NULL,
    barcode VARCHAR(64) NULL,
    qty_gm DECIMAL(14,3) NOT NULL DEFAULT 0,
    remaining_gm DECIMAL(14,3) NOT NULL DEFAULT 0,
    unit_cost DECIMAL(12,4) NOT NULL DEFAULT 0,
    mrp DECIMAL(12,2) NULL,
    expiry_date DATE NULL,
    manufactured_date DATE NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id),
    INDEX (item_id),
    INDEX (purchase_id),
    INDEX (barcode)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS damage_records (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255) NULL,
    item_id VARCHAR(255) NOT NULL,
    batch_id VARCHAR(255) NULL,
    barcode VARCHAR(64) NULL,
    quantity_gm DECIMAL(14,3) NOT NULL,
    reason VARCHAR(64) NOT NULL DEFAULT 'other',
    note VARCHAR(255) NULL,
    unit_cost DECIMAL(12,4) NOT NULL DEFAULT 0,
    loss_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    recorded_by VARCHAR(255) NULL,
    approved_by VARCHAR(255) NULL,
    approved_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id),
    INDEX (item_id),
    INDEX (status)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS loyalty_settings (
    business_id VARCHAR(255) PRIMARY KEY,
    enabled TINYINT NOT NULL DEFAULT 1,
    earn_per_100 DECIMAL(12,4) NOT NULL DEFAULT 1,
    rupees_per_point DECIMAL(12,4) NOT NULL DEFAULT 1,
    min_redeem INT NOT NULL DEFAULT 10,
    expiry_days INT NOT NULL DEFAULT 365,
    birthday_bonus INT NOT NULL DEFAULT 50,
    referral_points INT NOT NULL DEFAULT 25,
    silver_spend DECIMAL(12,2) NOT NULL DEFAULT 10000,
    gold_spend DECIMAL(12,2) NOT NULL DEFAULT 50000,
    platinum_spend DECIMAL(12,2) NOT NULL DEFAULT 150000,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS loyalty_accounts (
    customer_id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    points_balance INT NOT NULL DEFAULT 0,
    lifetime_earned INT NOT NULL DEFAULT 0,
    lifetime_redeemed INT NOT NULL DEFAULT 0,
    lifetime_spend DECIMAL(12,2) NOT NULL DEFAULT 0,
    tier VARCHAR(16) NOT NULL DEFAULT 'bronze',
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS loyalty_ledger (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    customer_id VARCHAR(255) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    points INT NOT NULL,
    rupees DECIMAL(12,2) NOT NULL DEFAULT 0,
    note VARCHAR(255) NULL,
    order_id VARCHAR(255) NULL,
    created_by VARCHAR(255) NULL,
    expires_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id),
    INDEX (customer_id)
  )`);
}

export async function attachItemBarcode(conn, businessId, itemId, code, kind = "own", primary = false) {
  const exist = await sqlOne(conn, "SELECT * FROM item_barcodes WHERE business_id = ? AND barcode = ? LIMIT 1", [businessId, code]);
  if (exist) {
    if (exist.item_id !== itemId) throw new Error("Barcode already used on another item");
    return exist;
  }
  const id = crypto.randomUUID();
  await sqlExec(
    conn,
    "INSERT INTO item_barcodes (id, business_id, item_id, barcode, kind, is_primary) VALUES (?,?,?,?,?,?)",
    [id, businessId, itemId, code, kind, primary ? 1 : 0],
  );
  if (primary || kind === "own") {
    try {
      await sqlExec(conn, "UPDATE items SET barcode = ? WHERE id = ? AND business_id = ?", [code, itemId, businessId]);
    } catch {
      /* optional */
    }
  }
  return sqlOne(conn, "SELECT * FROM item_barcodes WHERE id = ?", [id]);
}

export function parseManualBarcodes(raw) {
  const parts = Array.isArray(raw) ? raw : String(raw ?? "").split(/[\s,;]+/);
  const out = [];
  const seen = new Set();
  for (const part of parts) {
    const code = String(part || "").trim().replace(/\s+/g, "");
    if (!code) continue;
    if (seen.has(code)) throw new Error(`Duplicate barcode ${code}`);
    seen.add(code);
    out.push(code);
    if (out.length > 500) throw new Error("Max 500 barcodes at once");
  }
  return out;
}

export function resolvePurchaseBarcodes(item, qty, lineIn = {}) {
  if (!isCountItem(item)) return [];
  const pieces = Math.max(0, Math.round(Number(qty) || 0));
  const raw = lineIn.barcodes != null ? lineIn.barcodes : (lineIn.barcode || []);
  const codes = parseManualBarcodes(raw);
  if (pieces < 1) throw new Error("Quantity required");
  if (pieces > 500) throw new Error("Max 500 barcodes at once");
  if (codes.length !== pieces) {
    throw new Error(`Enter ${pieces} barcodes for ${pieces} pcs (you entered ${codes.length})`);
  }
  return codes;
}

export async function onItemSaved(conn, businessId, itemId, body = {}) {
  await ensureAdvancedSchema();
  const item = await sqlOne(conn, "SELECT * FROM items WHERE id = ? AND business_id = ?", [itemId, businessId]);
  if (!isCountItem(item || body)) {
    if (body.mrp != null) {
      try {
        await sqlExec(conn, "UPDATE items SET mrp = ? WHERE id = ? AND business_id = ?", [Number(body.mrp) || 0, itemId, businessId]);
      } catch {
        /* optional */
      }
    }
    return "";
  }
  const own = String(body.barcode || "").trim();
  const mfr = String(body.mfr_barcode || body.manufacturer_barcode || "").trim();
  if (own) await attachItemBarcode(conn, businessId, itemId, own, "own", true);
  if (mfr && mfr !== own) await attachItemBarcode(conn, businessId, itemId, mfr, "manufacturer", false);
  if (body.mrp != null) {
    try {
      await sqlExec(conn, "UPDATE items SET mrp = ? WHERE id = ? AND business_id = ?", [Number(body.mrp) || 0, itemId, businessId]);
    } catch {
      /* optional */
    }
  }
  const extras = parseManualBarcodes(body.barcodes ?? body.barcode_list ?? []);
  for (const code of extras) {
    if (code !== own && code !== mfr) await attachItemBarcode(conn, businessId, itemId, code, "unit", false);
  }
  return own;
}

export function clampBarcodeQty(raw) {
  const n = Math.floor(Number(raw) || 0);
  if (n < 1) throw new Error("Quantity required");
  if (n > 500) throw new Error("Max 500 barcodes at once");
  return n;
}

export async function generateQtyBarcodes(conn, businessId, itemId, qty) {
  await ensureAdvancedSchema();
  const n = clampBarcodeQty(qty);
  const item = await sqlOne(conn, "SELECT * FROM items WHERE id=? AND business_id=?", [itemId, businessId]);
  if (!item) throw new Error("Item not found");
  if (!isCountItem(item)) throw new Error("Barcodes are only for Quantity (pcs) items");
  const out = [];
  for (let i = 0; i < n; i++) {
    const code = await uniqueEan13(conn, businessId);
    out.push(await attachItemBarcode(conn, businessId, itemId, code, "unit", false));
  }
  return out;
}

export async function writeMovement(conn, row) {
  try {
    await sqlExec(
      conn,
      `INSERT INTO stock_movements (id, business_id, branch_id, item_id, kind, quantity_gm, note, created_by, barcode, batch_id, unit_cost, reason, ref_type, ref_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(), row.businessId, row.branchId || null, row.itemId, row.kind, row.qty,
        row.note || null, row.userId || null, row.barcode || null, row.batchId || null,
        Number(row.unitCost) || 0, row.reason || null, row.refType || null, row.refId || null,
      ],
    );
  } catch {
    await sqlExec(
      conn,
      `INSERT INTO stock_movements (id, business_id, branch_id, item_id, kind, quantity_gm, note, created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [crypto.randomUUID(), row.businessId, row.branchId || null, row.itemId, row.kind, row.qty, row.note || null, row.userId || null],
    );
  }
}

async function insertPurchaseBatch(conn, ctx, barcode, batchNo, qty, kind) {
  const id = crypto.randomUUID();
  const mrp = Number(ctx.mrp ?? ctx.item?.mrp ?? ctx.item?.retail_rate) || 0;
  await conn.query(
    `INSERT INTO stock_batches (
       id, business_id, branch_id, item_id, purchase_id, purchase_line_id, supplier_id,
       batch_no, barcode, qty_gm, remaining_gm, unit_cost, mrp, expiry_date
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, ctx.businessId, ctx.branchId || null, ctx.item.id, ctx.purchaseId, ctx.lineId, ctx.supplierId || null,
      batchNo, barcode, qty, qty, ctx.rate, mrp, ctx.expiry || null,
    ],
  );
  if (barcode) {
    try {
      await attachItemBarcode(conn, ctx.businessId, ctx.item.id, barcode, kind, false);
    } catch {
      /* unique */
    }
  }
  await writeMovement(conn, {
    businessId: ctx.businessId,
    branchId: ctx.branchId,
    userId: ctx.userId,
    itemId: ctx.item.id,
    kind: "purchase",
    qty,
    note: batchNo,
    barcode,
    batchId: id,
    unitCost: ctx.rate,
    refType: "purchase",
    refId: ctx.purchaseId,
  });
  return { id, batch_no: batchNo, barcode };
}

export async function onPurchaseLineSaved(conn, ctx) {
  await ensureAdvancedSchema();
  const baseNo = String(ctx.batchNo || `${ctx.purchaseNumber || "PO"}-${ctx.item?.code || "IT"}-${String(ctx.lineId || "").slice(0, 4)}`);
  const codes = resolvePurchaseBarcodes(ctx.item, ctx.qty, ctx);
  if (codes.length) {
    const rows = [];
    for (let i = 0; i < codes.length; i++) {
      const used = await sqlOne(conn, "SELECT id FROM stock_batches WHERE business_id=? AND barcode=? AND remaining_gm > 0 LIMIT 1", [ctx.businessId, codes[i]]);
      if (used) throw new Error(`Barcode ${codes[i]} is already in stock`);
      rows.push(await insertPurchaseBatch(conn, ctx, codes[i], `${baseNo}-${String(i + 1).padStart(3, "0")}`, 1, "unit"));
    }
    try {
      await conn.query("UPDATE purchase_lines SET batch_no=?, barcode=?, expiry_date=?, mrp=? WHERE id=?", [rows[0].batch_no, rows[0].barcode, ctx.expiry || null, Number(ctx.mrp ?? ctx.item?.mrp ?? ctx.item?.retail_rate) || 0, ctx.lineId]);
    } catch {
      /* optional */
    }
    return { id: rows[0].id, batch_no: rows[0].batch_no, barcode: rows[0].barcode, barcodes: rows };
  }
  const row = await insertPurchaseBatch(conn, ctx, "", baseNo, ctx.qty, "batch");
  try {
    await conn.query("UPDATE purchase_lines SET batch_no=?, barcode=?, expiry_date=?, mrp=? WHERE id=?", [row.batch_no, row.barcode, ctx.expiry || null, Number(ctx.mrp ?? ctx.item?.mrp ?? ctx.item?.retail_rate) || 0, ctx.lineId]);
  } catch {
    /* optional */
  }
  return row;
}

export function computeSaleLine(item, customer, lineIn) {
  const qty = Number(lineIn.quantity_gm ?? lineIn.qty);
  const isB2b = customer?.type === "b2b";
  const rate = lineIn.rate != null && lineIn.rate !== "" ? Number(lineIn.rate) : Number(isB2b ? item.b2b_rate : item.retail_rate);
  const calc = POSDiscount.computeLine({
    qty,
    rate,
    gstRate: Number(item.gst_rate) || 0,
    mrp: Number(item.mrp || item.retail_rate) || rate,
    purchase_rate: Number(item.purchase_rate) || 0,
    isCount: isCountItem(item),
    discountType: lineIn.discountType || lineIn.discount_type || "amt",
    discountValue: lineIn.discountValue ?? lineIn.discount_value ?? 0,
  });
  return {
    item,
    qty,
    rate: calc.rate,
    gstRate: calc.gstRate,
    amount: calc.taxable,
    gross: calc.gross,
    discount: calc.discount,
    discountType: calc.discountType,
    discountValue: calc.discountValue,
    gst: calc.gst,
    mrp: calc.mrp,
    cost: calc.cost,
    profit: calc.profit,
    barcode: String(lineIn.barcode || "").trim(),
    batchId: String(lineIn.batchId || lineIn.batch_id || "").trim(),
  };
}

export async function allocateBatches(conn, businessId, itemId, qty, preferBarcode = "", preferBatch = "") {
  let need = Number(qty) || 0;
  const out = [];
  if (need <= 0) return out;
  let preferred = [];
  if (preferBatch) {
    const [rows] = await conn.query("SELECT * FROM stock_batches WHERE id=? AND business_id=? AND remaining_gm > 0 LIMIT 1", [preferBatch, businessId]);
    preferred = rows;
  } else if (preferBarcode) {
    const [rows] = await conn.query("SELECT * FROM stock_batches WHERE business_id=? AND barcode=? AND remaining_gm > 0 LIMIT 1", [businessId, preferBarcode]);
    preferred = rows;
  }
  const [fifo] = await conn.query(
    `SELECT * FROM stock_batches WHERE business_id=? AND item_id=? AND remaining_gm > 0
     ORDER BY (expiry_date IS NULL), expiry_date ASC, created_at ASC`,
    [businessId, itemId],
  );
  const seen = new Set();
  for (const row of [...preferred, ...fifo]) {
    if (seen.has(row.id) || need <= 0) continue;
    seen.add(row.id);
    const take = Math.min(Number(row.remaining_gm), need);
    if (take <= 0) continue;
    await conn.query("UPDATE stock_batches SET remaining_gm = remaining_gm - ? WHERE id=? AND business_id=?", [take, row.id, businessId]);
    out.push({ batch: row, qty: take });
    need -= take;
  }
  return out;
}

export async function restoreBatchesForLines(conn, businessId, lines) {
  for (const line of lines || []) {
    const batchId = line.batch_id;
    const qty = Number(line.quantity_gm) || 0;
    if (batchId && qty > 0) {
      try {
        await conn.query("UPDATE stock_batches SET remaining_gm = remaining_gm + ? WHERE id=? AND business_id=?", [qty, batchId, businessId]);
      } catch {
        /* optional */
      }
    }
  }
}

export async function applySaleStock(conn, ctx) {
  const allocations = await allocateBatches(conn, ctx.businessId, ctx.item.id, ctx.qty, ctx.barcode, ctx.batchId);
  let first = allocations[0] || null;
  await conn.query("UPDATE items SET stock_gm = stock_gm - ? WHERE id=? AND business_id=?", [ctx.qty, ctx.item.id, ctx.businessId]);
  if (!allocations.length) {
    await writeMovement(conn, {
      businessId: ctx.businessId,
      branchId: ctx.branchId,
      userId: ctx.userId,
      itemId: ctx.item.id,
      kind: "sale",
      qty: -ctx.qty,
      note: ctx.orderNumber,
      barcode: ctx.barcode,
      unitCost: ctx.costRate,
      refType: "sale",
      refId: ctx.orderId,
    });
  } else {
    for (const row of allocations) {
      await writeMovement(conn, {
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        userId: ctx.userId,
        itemId: ctx.item.id,
        kind: "sale",
        qty: -row.qty,
        note: ctx.orderNumber,
        barcode: row.batch.barcode,
        batchId: row.batch.id,
        unitCost: row.batch.unit_cost,
        refType: "sale",
        refId: ctx.orderId,
      });
    }
  }
  return first;
}

async function loyaltySettings(businessId, conn = null) {
  const row = await sqlOne(conn, "SELECT * FROM loyalty_settings WHERE business_id = ?", [businessId]);
  if (row) return POSLoyalty.settingsFrom(row);
  await sqlExec(conn, "INSERT INTO loyalty_settings (business_id) VALUES (?) ON DUPLICATE KEY UPDATE business_id = business_id", [businessId]);
  const fresh = await sqlOne(conn, "SELECT * FROM loyalty_settings WHERE business_id = ?", [businessId]);
  return POSLoyalty.settingsFrom(fresh || {});
}

async function recomputeLoyalty(businessId, customerId, conn = null) {
  const settings = await loyaltySettings(businessId, conn);
  const rows = await sqlAll(conn, "SELECT * FROM loyalty_ledger WHERE business_id=? AND customer_id=? ORDER BY created_at", [businessId, customerId]);
  let bal = 0;
  let earned = 0;
  let redeemed = 0;
  const now = Date.now();
  for (const r of rows) {
    const pts = Number(r.points) || 0;
    if (pts > 0 && r.expires_at && new Date(r.expires_at).getTime() < now) continue;
    bal += pts;
    if (pts > 0) earned += pts;
    if (r.kind === "redeem") redeemed += Math.abs(pts);
  }
  const acc = await sqlOne(conn, "SELECT * FROM loyalty_accounts WHERE customer_id=?", [customerId]);
  const spend = Number(acc?.lifetime_spend) || 0;
  const tier = POSLoyalty.tierFromSpend(spend, settings);
  if (acc) {
    await sqlExec(
      conn,
      "UPDATE loyalty_accounts SET points_balance=?, lifetime_earned=?, lifetime_redeemed=?, tier=? WHERE customer_id=?",
      [bal, earned, redeemed, tier, customerId],
    );
  } else {
    await sqlExec(
      conn,
      "INSERT INTO loyalty_accounts (customer_id, business_id, points_balance, lifetime_earned, lifetime_redeemed, lifetime_spend, tier) VALUES (?,?,?,?,?,0,?)",
      [customerId, businessId, bal, earned, redeemed, tier],
    );
  }
  return sqlOne(conn, "SELECT * FROM loyalty_accounts WHERE customer_id=?", [customerId]);
}

async function loyaltyAccount(businessId, customerId, conn = null) {
  const row = await sqlOne(conn, "SELECT * FROM loyalty_accounts WHERE customer_id=? AND business_id=?", [customerId, businessId]);
  if (!row) {
    await sqlExec(
      conn,
      "INSERT INTO loyalty_accounts (customer_id, business_id, points_balance, lifetime_earned, lifetime_redeemed, lifetime_spend, tier) VALUES (?,?,0,0,0,0,'bronze')",
      [customerId, businessId],
    );
  }
  return recomputeLoyalty(businessId, customerId, conn);
}

async function postLoyalty(businessId, customerId, kind, points, rupees, note, orderId, userId, expiresAt, conn = null) {
  await sqlExec(
    conn,
    `INSERT INTO loyalty_ledger (id, business_id, customer_id, kind, points, rupees, note, order_id, created_by, expires_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [crypto.randomUUID(), businessId, customerId, kind, points, rupees, note, orderId, userId, expiresAt],
  );
}

export async function applyLoyaltyOnSale(conn, ctx) {
  await ensureAdvancedSchema();
  const settings = await loyaltySettings(ctx.businessId, conn);
  const acc = await loyaltyAccount(ctx.businessId, ctx.customer.id, conn);
  let redeemPts = 0;
  let redeemRs = 0;
  const want = Math.floor(Number(ctx.wantRedeem) || 0);
  if (settings.enabled && want > 0) {
    const check = POSLoyalty.canRedeem(acc.points_balance, want, settings);
    if (check.ok) {
      redeemRs = Math.min(ctx.total, check.rupees);
      redeemPts = settings.rupees_per_point > 0 ? Math.floor(redeemRs / settings.rupees_per_point) : 0;
      if (redeemPts > 0) {
        await postLoyalty(ctx.businessId, ctx.customer.id, "redeem", -redeemPts, redeemRs, "Bill redeem", ctx.orderId, ctx.userId, null, conn);
      }
    }
  }
  const paid = POSDiscount.round2(Math.max(0, ctx.total - redeemRs));
  let earned = 0;
  if (settings.enabled) {
    earned = POSLoyalty.earnPoints(paid, settings);
    if (earned > 0) {
      const exp = settings.expiry_days > 0 ? new Date(Date.now() + settings.expiry_days * 86400000) : null;
      await postLoyalty(ctx.businessId, ctx.customer.id, "earn", earned, paid, "Sale earn", ctx.orderId, ctx.userId, exp, conn);
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  if (POSLoyalty.isBirthdayToday(ctx.customer.dob, today) && settings.birthday_bonus > 0) {
    const given = await sqlOne(
      conn,
      "SELECT id FROM loyalty_ledger WHERE business_id=? AND customer_id=? AND kind='birthday' AND created_at >= ? LIMIT 1",
      [ctx.businessId, ctx.customer.id, `${today.slice(0, 4)}-01-01`],
    );
    if (!given) {
      await postLoyalty(ctx.businessId, ctx.customer.id, "birthday", settings.birthday_bonus, 0, "Birthday bonus", ctx.orderId, ctx.userId, null, conn);
    }
  }
  if (ctx.customer.referred_by && settings.referral_points > 0) {
    const prior = await sqlOne(conn, "SELECT id FROM sales_orders WHERE customer_id=? AND business_id=? AND id<>? LIMIT 1", [ctx.customer.id, ctx.businessId, ctx.orderId]);
    const already = await sqlOne(conn, "SELECT id FROM loyalty_ledger WHERE business_id=? AND customer_id=? AND kind='referral' AND note LIKE ? LIMIT 1", [ctx.businessId, ctx.customer.referred_by, `%${ctx.customer.id}%`]);
    if (!prior && !already) {
      await loyaltyAccount(ctx.businessId, ctx.customer.referred_by, conn);
      await postLoyalty(ctx.businessId, ctx.customer.referred_by, "referral", settings.referral_points, 0, `Referral ${ctx.customer.id}`, ctx.orderId, ctx.userId, null, conn);
    }
  }
  await sqlExec(conn, "UPDATE loyalty_accounts SET lifetime_spend = lifetime_spend + ? WHERE customer_id=?", [paid, ctx.customer.id]);
  await recomputeLoyalty(ctx.businessId, ctx.customer.id, conn);
  return { points: redeemPts, rupees: redeemRs, earned };
}

async function lookupBarcode(businessId, code) {
  const raw = String(code || "").trim();
  if (!raw) return null;
  const batch = await sqlOne(
    null,
    `SELECT b.*, i.name AS item_name, i.code AS item_code, i.retail_rate, i.mrp AS item_mrp, i.gst_rate, i.base_unit, i.unit, i.purchase_rate, i.stock_gm
     FROM stock_batches b JOIN items i ON i.id = b.item_id
     WHERE b.business_id=? AND b.barcode=? LIMIT 1`,
    [businessId, raw],
  );
  if (batch) return { ...batch, source: "batch" };
  const bc = await sqlOne(
    null,
    `SELECT ib.*, i.name AS item_name, i.code AS item_code, i.retail_rate, i.mrp AS item_mrp, i.gst_rate, i.base_unit, i.unit, i.purchase_rate, i.stock_gm
     FROM item_barcodes ib JOIN items i ON i.id = ib.item_id
     WHERE ib.business_id=? AND ib.barcode=? LIMIT 1`,
    [businessId, raw],
  );
  if (bc) return { ...bc, source: "item" };
  const item = await sqlOne(null, "SELECT * FROM items WHERE business_id=? AND barcode=? LIMIT 1", [businessId, raw]);
  if (item) return { ...item, source: "item", item_id: item.id, item_name: item.name, item_code: item.code };
  return null;
}

async function applyDamageStock(row) {
  const qty = Math.abs(Number(row.quantity_gm) || 0);
  await query("UPDATE items SET stock_gm = stock_gm - ? WHERE id=? AND business_id=?", [qty, row.item_id, row.business_id]);
  if (row.batch_id) {
    await query("UPDATE stock_batches SET remaining_gm = GREATEST(0, remaining_gm - ?) WHERE id=? AND business_id=?", [qty, row.batch_id, row.business_id]);
  }
  await writeMovement(null, {
    businessId: row.business_id,
    branchId: row.branch_id,
    userId: row.approved_by || row.recorded_by,
    itemId: row.item_id,
    kind: "damaged",
    qty: -qty,
    note: row.note || row.reason,
    barcode: row.barcode,
    batchId: row.batch_id,
    unitCost: row.unit_cost,
    reason: row.reason,
    refType: "damage",
    refId: row.id,
  });
}

function send(res, fn) {
  Promise.resolve()
    .then(() => ensureAdvancedSchema())
    .then(fn)
    .then((data) => res.json(data))
    .catch((err) => res.status(err.status || 400).json({ error: String(err.message || err) }));
}

export function registerAdvanced(app) {
  app.get("/api/barcodes/lookup", requireStaff, requirePerm("counter"), (req, res) =>
    send(res, async () => {
      const match = await lookupBarcode(bid(), req.query.code || req.query.barcode);
      if (!match) {
        const err = new Error("Barcode not found");
        err.status = 404;
        throw err;
      }
      return { ok: true, match };
    }),
  );

  app.get("/api/barcodes", requireStaff, requirePerm("items"), (req, res) =>
    send(res, async () => {
      const itemId = String(req.query.item_id || "");
      const purchaseId = String(req.query.purchase_id || "");
      if (purchaseId) {
        return query(
          `SELECT b.*, i.name AS item_name, i.code AS item_code, i.retail_rate, COALESCE(b.mrp, i.mrp, i.retail_rate) AS label_mrp
           FROM stock_batches b JOIN items i ON i.id = b.item_id
           WHERE b.business_id=? AND b.purchase_id=? ORDER BY i.name`,
          [bid(), purchaseId],
        );
      }
      if (itemId) {
        return query(
          `SELECT ib.*, i.name AS item_name, i.code AS item_code, i.retail_rate, COALESCE(i.mrp, i.retail_rate) AS label_mrp
           FROM item_barcodes ib JOIN items i ON i.id = ib.item_id
           WHERE ib.business_id=? AND ib.item_id=? ORDER BY ib.is_primary DESC, ib.created_at`,
          [bid(), itemId],
        );
      }
      return query(
        `SELECT ib.*, i.name AS item_name, i.code AS item_code, i.retail_rate, COALESCE(i.mrp, i.retail_rate) AS label_mrp, i.stock_gm
         FROM item_barcodes ib JOIN items i ON i.id = ib.item_id
         WHERE ib.business_id=? ORDER BY i.name, ib.is_primary DESC`,
        [bid()],
      );
    }),
  );

  app.post("/api/barcodes/generate-missing", requireStaff, requirePerm("items"), (_req, res) =>
    send(res, async () => {
      const items = await query("SELECT id, barcode, base_unit, unit FROM items WHERE business_id=?", [bid()]);
      let generated = 0;
      for (const it of items) {
        if (!isCountItem(it)) continue;
        const has = await sqlOne(null, "SELECT id FROM item_barcodes WHERE business_id=? AND item_id=? LIMIT 1", [bid(), it.id]);
        if (has) continue;
        await onItemSaved(null, bid(), it.id, { barcode: it.barcode || "" });
        generated += 1;
      }
      return { ok: true, generated };
    }),
  );

  app.post("/api/barcodes/generate-qty", requireStaff, requirePerm("items"), (req, res) =>
    send(res, async () => {
      const itemId = String(req.body?.item_id || req.body?.itemId || "");
      const qty = req.body?.qty ?? req.body?.quantity ?? req.body?.barcode_qty;
      const barcodes = await generateQtyBarcodes(null, bid(), itemId, qty);
      return { ok: true, generated: barcodes.length, barcodes };
    }),
  );

  app.post("/api/items/:id/barcodes", requireStaff, requirePerm("items"), (req, res) =>
    send(res, async () => {
      const item = await sqlOne(null, "SELECT * FROM items WHERE id=? AND business_id=?", [req.params.id, bid()]);
      if (!item) throw new Error("Item not found");
      if (!isCountItem(item)) throw new Error("Barcodes are only for Quantity (pcs) items");
      let kind = String(req.body?.kind || "own");
      if (!["own", "manufacturer", "batch", "unit"].includes(kind)) kind = "own";
      const code = String(req.body?.barcode || "").trim() || (await uniqueEan13(null, bid()));
      const row = await attachItemBarcode(null, bid(), req.params.id, code, kind, kind === "own");
      return { ok: true, barcode: row };
    }),
  );

  app.delete("/api/barcodes/:id", requireStaff, requirePerm("items"), (req, res) =>
    send(res, async () => {
      await query("DELETE FROM item_barcodes WHERE id=? AND business_id=?", [req.params.id, bid()]);
      return { ok: true };
    }),
  );

  app.get("/api/batches", requireStaff, requirePerm("stock"), (req, res) =>
    send(res, async () => {
      const itemId = String(req.query.item_id || "");
      const args = [bid()];
      let sql = `SELECT b.*, i.name AS item_name, i.code AS item_code, s.name AS supplier_name
                 FROM stock_batches b JOIN items i ON i.id=b.item_id
                 LEFT JOIN suppliers s ON s.id=b.supplier_id WHERE b.business_id=?`;
      if (itemId) {
        sql += " AND b.item_id=?";
        args.push(itemId);
      }
      sql += " ORDER BY b.created_at DESC LIMIT 300";
      return query(sql, args);
    }),
  );

  const stockLedger = (req, res) =>
    send(res, async () => {
      const kind = String(req.query.kind || "");
      const itemId = String(req.query.item_id || "");
      const args = [bid()];
      let sql = `SELECT m.*, i.name AS item_name, i.code AS item_code
                 FROM stock_movements m JOIN items i ON i.id=m.item_id WHERE m.business_id=?`;
      if (kind) {
        sql += " AND m.kind=?";
        args.push(kind);
      }
      if (itemId) {
        sql += " AND m.item_id=?";
        args.push(itemId);
      }
      sql += " ORDER BY m.created_at DESC LIMIT 400";
      return query(sql, args);
    });
  app.get("/api/stock/ledger", requireStaff, requirePerm("stock"), stockLedger);
  app.get("/api/stock/movements", requireStaff, requirePerm("stock"), stockLedger);

  app.get("/api/damage", requireStaff, requirePerm("stock"), (req, res) =>
    send(res, async () => {
      const status = String(req.query.status || "");
      const args = [bid()];
      let sql = `SELECT d.*, i.name AS item_name, i.code AS item_code, b.batch_no
                 FROM damage_records d JOIN items i ON i.id=d.item_id
                 LEFT JOIN stock_batches b ON b.id=d.batch_id WHERE d.business_id=?`;
      if (status) {
        sql += " AND d.status=?";
        args.push(status);
      }
      sql += " ORDER BY d.created_at DESC LIMIT 300";
      return query(sql, args);
    }),
  );

  app.get("/api/damage/report", requireStaff, requirePerm("stock"), (_req, res) =>
    send(res, async () => {
      const rows = await query(
        `SELECT reason, status, COUNT(*) AS entries, SUM(quantity_gm) AS qty, SUM(loss_amount) AS loss
         FROM damage_records WHERE business_id=? GROUP BY reason, status`,
        [bid()],
      );
      return { ok: true, rows };
    }),
  );

  app.post("/api/damage", requireStaff, requirePerm("stock"), (req, res) =>
    send(res, async () => {
      const b = req.body || {};
      const itemId = String(b.item_id || "");
      const qty = Math.abs(Number(b.quantity_gm) || 0);
      if (!itemId || qty <= 0) throw new Error("Item and quantity required");
      const item = await sqlOne(null, "SELECT * FROM items WHERE id=? AND business_id=?", [itemId, bid()]);
      if (!item) throw new Error("Item not found");
      let batchId = String(b.batch_id || "");
      const barcode = String(b.barcode || "").trim();
      if (barcode && !batchId) {
        const found = await lookupBarcode(bid(), barcode);
        if (found?.source === "batch") batchId = found.id;
      }
      let unitCost = Number(item.purchase_rate) || 0;
      if (batchId) {
        const bt = await sqlOne(null, "SELECT * FROM stock_batches WHERE id=? AND business_id=?", [batchId, bid()]);
        if (bt) unitCost = Number(bt.unit_cost) || unitCost;
      }
      const loss = POSDiscount.round2(isCountItem(item) ? qty * unitCost : (qty / 1000) * unitCost);
      const role = authUser()?.role || "";
      const auto = ["business_admin", "branch_manager", "manager", "stock_manager"].includes(role) || b.auto_approve;
      const status = auto ? "approved" : "pending";
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO damage_records (
           id, business_id, branch_id, item_id, batch_id, barcode, quantity_gm, reason, note,
           unit_cost, loss_amount, status, recorded_by, approved_by, approved_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id, bid(), branchId(), itemId, batchId || null, barcode || item.barcode || null, qty,
          String(b.reason || "other"), b.note || null, unitCost, loss, status,
          authUser()?.id || null, status === "approved" ? authUser()?.id || null : null,
          status === "approved" ? new Date() : null,
        ],
      );
      const row = await sqlOne(null, "SELECT * FROM damage_records WHERE id=?", [id]);
      if (status === "approved") await applyDamageStock(row);
      return { ok: true, damage: row };
    }),
  );

  app.post("/api/damage/:id/approve", requireStaff, requirePerm("stock"), (req, res) =>
    send(res, async () => {
      const rows = await sqlOne(null, "SELECT * FROM damage_records WHERE id=? AND business_id=?", [req.params.id, bid()]);
      if (!rows) throw new Error("Damage record not found");
      if (rows.status !== "pending") throw new Error("Already processed");
      await query("UPDATE damage_records SET status='approved', approved_by=?, approved_at=NOW() WHERE id=?", [authUser()?.id || null, req.params.id]);
      const fresh = await sqlOne(null, "SELECT * FROM damage_records WHERE id=?", [req.params.id]);
      await applyDamageStock(fresh);
      return { ok: true, damage: fresh };
    }),
  );

  app.post("/api/damage/:id/reject", requireStaff, requirePerm("stock"), (req, res) =>
    send(res, async () => {
      const rows = await sqlOne(null, "SELECT * FROM damage_records WHERE id=? AND business_id=?", [req.params.id, bid()]);
      if (!rows) throw new Error("Damage record not found");
      if (rows.status !== "pending") throw new Error("Already processed");
      await query("UPDATE damage_records SET status='rejected', approved_by=?, approved_at=NOW() WHERE id=?", [authUser()?.id || null, req.params.id]);
      const fresh = await sqlOne(null, "SELECT * FROM damage_records WHERE id=?", [req.params.id]);
      return { ok: true, damage: fresh };
    }),
  );

  app.get("/api/loyalty/settings", requireStaff, requirePerm("customers"), (_req, res) =>
    send(res, () => loyaltySettings(bid())),
  );

  app.put("/api/loyalty/settings", requireStaff, requirePerm("settings"), (req, res) =>
    send(res, async () => {
      const cur = await loyaltySettings(bid());
      const next = POSLoyalty.settingsFrom({ ...cur, ...(req.body || {}) });
      await query(
        `UPDATE loyalty_settings SET enabled=?, earn_per_100=?, rupees_per_point=?, min_redeem=?, expiry_days=?,
           birthday_bonus=?, referral_points=?, silver_spend=?, gold_spend=?, platinum_spend=?
         WHERE business_id=?`,
        [
          next.enabled ? 1 : 0, next.earn_per_100, next.rupees_per_point, next.min_redeem, next.expiry_days,
          next.birthday_bonus, next.referral_points, next.silver_spend, next.gold_spend, next.platinum_spend, bid(),
        ],
      );
      return { ok: true, settings: await loyaltySettings(bid()) };
    }),
  );

  app.get("/api/loyalty/customer/:id", requireStaff, requirePerm("customers"), (req, res) =>
    send(res, async () => {
      const account = await loyaltyAccount(bid(), req.params.id);
      const ledger = await query(
        "SELECT * FROM loyalty_ledger WHERE business_id=? AND customer_id=? ORDER BY created_at DESC LIMIT 80",
        [bid(), req.params.id],
      );
      return { ok: true, account, ledger, settings: await loyaltySettings(bid()) };
    }),
  );

  app.post("/api/loyalty/adjust", requireStaff, requirePerm("customers"), (req, res) =>
    send(res, async () => {
      const customerId = String(req.body?.customer_id || "");
      const points = Math.trunc(Number(req.body?.points) || 0);
      if (!customerId || !points) throw new Error("Customer and points required");
      const settings = await loyaltySettings(bid());
      await loyaltyAccount(bid(), customerId);
      const exp = points > 0 && settings.expiry_days > 0 ? new Date(Date.now() + settings.expiry_days * 86400000) : null;
      await postLoyalty(bid(), customerId, "adjust", points, 0, req.body?.note || "Manual adjustment", null, authUser()?.id, exp);
      return { ok: true, account: await recomputeLoyalty(bid(), customerId) };
    }),
  );

  app.post("/api/loyalty/birthday", requireStaff, requirePerm("customers"), (req, res) =>
    send(res, async () => {
      const customerId = String(req.body?.customer_id || "");
      const cust = await sqlOne(null, "SELECT * FROM customers WHERE id=? AND business_id=?", [customerId, bid()]);
      if (!cust) throw new Error("Customer not found");
      const settings = await loyaltySettings(bid());
      if (settings.birthday_bonus <= 0) throw new Error("Birthday bonus is 0");
      await loyaltyAccount(bid(), customerId);
      await postLoyalty(bid(), customerId, "birthday", settings.birthday_bonus, 0, "Birthday bonus", null, authUser()?.id, null);
      return { ok: true, account: await recomputeLoyalty(bid(), customerId) };
    }),
  );
}
