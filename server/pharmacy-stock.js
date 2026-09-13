import { BUSINESS_ID, query } from "./db.js";
import { allocateFefo, expiryStatus } from "../js/pharmacy.js";

export async function syncItemStock(conn, itemId) {
  const [sumRows] = await conn.query(
    "SELECT COUNT(*) AS n, COALESCE(SUM(qty),0) AS qty FROM item_batches WHERE item_id = ? AND business_id = ?",
    [itemId, BUSINESS_ID],
  );
  if (!Number(sumRows[0]?.n)) return Number.NaN;
  const qty = Number(sumRows[0]?.qty) || 0;
  await conn.query("UPDATE items SET stock_gm = ? WHERE id = ? AND business_id = ?", [
    qty,
    itemId,
    BUSINESS_ID,
  ]);
  return qty;
}

export async function upsertBatch(conn, { itemId, batchNo, expiryDate, qty, mrp, purchaseRate, purchaseId, allowExpired = false }) {
  const no = String(batchNo || "").trim();
  if (!no || no.toUpperCase() === "OPEN") throw new Error("Batch No. is required");
  if (!expiryDate) throw new Error("Expiry Date is required");
  if (!allowExpired && expiryStatus(expiryDate) === "expired") {
    throw new Error(`Batch ${no} is already expired`);
  }
  const addQty = Number(qty);
  if (!Number.isFinite(addQty) || addQty <= 0) throw new Error("Batch quantity must be positive");
  const [rows] = await conn.query(
    `SELECT * FROM item_batches
     WHERE business_id = ? AND item_id = ? AND batch_no = ? FOR UPDATE`,
    [BUSINESS_ID, itemId, no],
  );
  if (rows[0]) {
    await conn.query(
      `UPDATE item_batches
       SET qty = qty + ?, expiry_date = ?, mrp = ?, purchase_rate = ?, purchase_id = COALESCE(?, purchase_id)
       WHERE id = ?`,
      [addQty, expiryDate, Number(mrp) || 0, Number(purchaseRate) || 0, purchaseId || null, rows[0].id],
    );
    await syncItemStock(conn, itemId);
    return rows[0].id;
  }
  const id = crypto.randomUUID();
  await conn.query(
    `INSERT INTO item_batches (
       id, business_id, item_id, batch_no, expiry_date, qty, mrp, purchase_rate, purchase_id
     ) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, BUSINESS_ID, itemId, no, expiryDate, addQty, Number(mrp) || 0, Number(purchaseRate) || 0, purchaseId || null],
  );
  await syncItemStock(conn, itemId);
  return id;
}

export async function liveBatches(conn, itemId, { includeExpired = false } = {}) {
  const extra = includeExpired ? "" : " AND (expiry_date IS NULL OR expiry_date >= CURDATE())";
  const [rows] = await conn.query(
    `SELECT * FROM item_batches
     WHERE business_id = ? AND item_id = ? AND qty > 0${extra}
     ORDER BY expiry_date IS NULL, expiry_date`,
    [BUSINESS_ID, itemId],
  );
  return rows;
}

export async function deductBatches(conn, itemId, qty, preferredBatchId) {
  const [countRows] = await conn.query(
    "SELECT COUNT(*) AS n FROM item_batches WHERE item_id = ? AND business_id = ?",
    [itemId, BUSINESS_ID],
  );
  const hasBatches = Number(countRows[0]?.n) > 0;
  const batches = await liveBatches(conn, itemId);
  if (!batches.length) {
    if (hasBatches) throw new Error("Not enough in-date batch stock");
    const [items] = await conn.query(
      "SELECT stock_gm, mrp FROM items WHERE id = ? AND business_id = ? FOR UPDATE",
      [itemId, BUSINESS_ID],
    );
    const item = items[0];
    if (!item || qty > Number(item.stock_gm || 0)) throw new Error("Not enough in-date batch stock");
    await conn.query("UPDATE items SET stock_gm = stock_gm - ? WHERE id = ? AND business_id = ?", [
      qty,
      itemId,
      BUSINESS_ID,
    ]);
    return [{ id: null, batch_no: "OPEN", expiry_date: null, mrp: item.mrp, take: qty }];
  }
  if (preferredBatchId && !batches.some((b) => b.id === preferredBatchId)) {
    throw new Error("Selected batch is not available");
  }
  const plan = allocateFefo(batches, qty, { preferredId: preferredBatchId || undefined });
  if (!plan.ok) throw new Error("Not enough in-date batch stock");
  const taken = [];
  for (const part of plan.allocations) {
    const [upd] = await conn.query(
      "UPDATE item_batches SET qty = qty - ? WHERE id = ? AND qty >= ?",
      [part.take, part.id, part.take],
    );
    if (!upd.affectedRows) throw new Error("Batch stock changed, retry the bill");
    taken.push(part);
  }
  await syncItemStock(conn, itemId);
  return taken;
}

export async function restoreBatchQty(conn, { batchId, itemId, qty, batchNo, expiryDate, mrp }) {
  const addQty = Number(qty);
  if (!Number.isFinite(addQty) || addQty <= 0) return;
  if (batchId) {
    const [upd] = await conn.query("UPDATE item_batches SET qty = qty + ? WHERE id = ? AND business_id = ?", [
      addQty,
      batchId,
      BUSINESS_ID,
    ]);
    if (upd.affectedRows) {
      await syncItemStock(conn, itemId);
      return;
    }
  }
  const no = String(batchNo || "").trim();
  if (no && no.toUpperCase() !== "OPEN") {
    await upsertBatch(conn, {
      itemId,
      batchNo: no,
      expiryDate: expiryDate || "2099-12-31",
      qty: addQty,
      mrp: mrp || 0,
      purchaseRate: 0,
      allowExpired: true,
    });
    return;
  }
  await conn.query("UPDATE items SET stock_gm = stock_gm + ? WHERE id = ? AND business_id = ?", [
    addQty,
    itemId,
    BUSINESS_ID,
  ]);
}

export async function listAllBatches() {
  return query(
    `SELECT b.*, i.name AS item_name, i.code AS item_code, i.generic_name, i.pack_unit
     FROM item_batches b
     JOIN items i ON i.id = b.item_id
     WHERE b.business_id = ?
     ORDER BY b.expiry_date IS NULL, b.expiry_date, i.name`,
    [BUSINESS_ID],
  );
}
