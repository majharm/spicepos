import { BUSINESS_ID } from "./db.js";
import {
  allocateSizePlan,
  expandPieceBarcodes,
  generatePieceBarcode,
  normalizeBarcode,
  normalizeColour,
  normalizeSize,
  parseSizeQuantities,
  totalSizeQty,
} from "../js/garment.js";
import { syncItemStock } from "./pharmacy-stock.js";

export async function listSizeStock(connOrQuery, itemId) {
  const sql = itemId
    ? `SELECT s.*, i.name AS item_name, i.code AS item_code
       FROM item_size_stock s JOIN items i ON i.id = s.item_id
       WHERE s.business_id = ? AND s.item_id = ? ORDER BY i.name, s.colour, s.size`
    : `SELECT s.*, i.name AS item_name, i.code AS item_code
       FROM item_size_stock s JOIN items i ON i.id = s.item_id
       WHERE s.business_id = ? ORDER BY i.name, s.colour, s.size`;
  const params = itemId ? [BUSINESS_ID, itemId] : [BUSINESS_ID];
  if (typeof connOrQuery === "function") return connOrQuery(sql, params);
  const [rows] = await connOrQuery.query(sql, params);
  return rows;
}

export async function listAllSizeStock() {
  const { query } = await import("./db.js");
  return query(
    `SELECT s.*, i.name AS item_name, i.code AS item_code, i.colour AS item_colour
     FROM item_size_stock s JOIN items i ON i.id = s.item_id
     WHERE s.business_id = ?
     ORDER BY i.name, s.colour, s.size`,
    [BUSINESS_ID],
  );
}

export async function listPieceBarcodes(purchaseId, code) {
  const { query } = await import("./db.js");
  const barcode = normalizeBarcode(code);
  if (barcode) {
    return query(
      `SELECT b.*, i.name AS item_name, i.code AS item_code
       FROM item_piece_barcodes b JOIN items i ON i.id = b.item_id
       WHERE b.business_id = ? AND b.barcode = ?
       LIMIT 1`,
      [BUSINESS_ID, barcode],
    );
  }
  const extra = purchaseId ? " AND b.purchase_id = ?" : "";
  const params = purchaseId ? [BUSINESS_ID, purchaseId] : [BUSINESS_ID];
  return query(
    `SELECT b.*, i.name AS item_name, i.code AS item_code
     FROM item_piece_barcodes b JOIN items i ON i.id = b.item_id
     WHERE b.business_id = ?${extra}
     ORDER BY b.created_at DESC
     LIMIT 400`,
    params,
  );
}

export async function syncGarmentItemStock(conn, itemId) {
  const [sumRows] = await conn.query(
    "SELECT COUNT(*) AS n, COALESCE(SUM(qty),0) AS qty FROM item_size_stock WHERE item_id = ? AND business_id = ?",
    [itemId, BUSINESS_ID],
  );
  if (!Number(sumRows[0]?.n)) {
    const fromBatches = await syncItemStock(conn, itemId);
    return fromBatches;
  }
  const qty = Number(sumRows[0]?.qty) || 0;
  await conn.query("UPDATE items SET stock_gm = ? WHERE id = ? AND business_id = ?", [
    qty,
    itemId,
    BUSINESS_ID,
  ]);
  return qty;
}

export async function adjustSizeStock(conn, { itemId, colour, size, qty }) {
  const normSize = normalizeSize(size);
  if (!itemId || !normSize) throw new Error("Product size is required");
  const colourKey = normalizeColour(colour);
  const delta = Number(qty);
  if (!Number.isFinite(delta) || delta === 0) return null;
  const [rows] = await conn.query(
    `SELECT * FROM item_size_stock
     WHERE business_id = ? AND item_id = ? AND LOWER(colour) = LOWER(?) AND size = ? FOR UPDATE`,
    [BUSINESS_ID, itemId, colourKey, normSize],
  );
  if (rows[0]) {
    const next = Number(rows[0].qty) + delta;
    if (next < 0) throw new Error(`Not enough ${normSize} stock`);
    await conn.query("UPDATE item_size_stock SET qty = ? WHERE id = ?", [next, rows[0].id]);
    await syncGarmentItemStock(conn, itemId);
    return rows[0].id;
  }
  if (delta < 0) throw new Error(`Not enough ${normSize} stock`);
  const id = crypto.randomUUID();
  await conn.query(
    `INSERT INTO item_size_stock (id, business_id, item_id, colour, size, qty)
     VALUES (?,?,?,?,?,?)`,
    [id, BUSINESS_ID, itemId, colourKey, normSize, delta],
  );
  await syncGarmentItemStock(conn, itemId);
  return id;
}

export async function hasSizeStock(conn, itemId) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS n FROM item_size_stock WHERE item_id = ? AND business_id = ?",
    [itemId, BUSINESS_ID],
  );
  return Number(rows[0]?.n) > 0;
}

export async function sellableSizeQty(conn, itemId, colour, size) {
  const [rows] = await conn.query(
    `SELECT COALESCE(SUM(qty),0) AS qty FROM item_size_stock
     WHERE business_id = ? AND item_id = ? AND LOWER(colour) = LOWER(?) AND size = ?`,
    [BUSINESS_ID, itemId, normalizeColour(colour), normalizeSize(size)],
  );
  return Number(rows[0]?.qty) || 0;
}

export async function listLiveSizeStock(conn, itemId) {
  const [rows] = await conn.query(
    `SELECT * FROM item_size_stock
     WHERE business_id = ? AND item_id = ? AND qty > 0
     ORDER BY colour, size FOR UPDATE`,
    [BUSINESS_ID, itemId],
  );
  return rows;
}

export async function allocateSizeStock(conn, itemId, qty) {
  const rows = await listLiveSizeStock(conn, itemId);
  return allocateSizePlan(rows, itemId, qty);
}

async function markPieceBarcodes(conn, { itemId, colour, size, qty, status, fromStatus, barcode }) {
  const take = Math.floor(Number(qty) || 0);
  if (take <= 0) return [];
  const code = normalizeBarcode(barcode);
  if (code) {
    const [rows] = await conn.query(
      `SELECT * FROM item_piece_barcodes WHERE business_id = ? AND barcode = ? FOR UPDATE`,
      [BUSINESS_ID, code],
    );
    const piece = rows[0];
    if (!piece) throw new Error(`Unknown barcode ${code}`);
    if (piece.status !== fromStatus) throw new Error(`Barcode ${code} is not ${fromStatus.replaceAll("_", " ")}`);
    if (itemId && piece.item_id !== itemId) throw new Error("Barcode does not match this product");
    if (size && normalizeSize(piece.size) !== normalizeSize(size)) throw new Error("Barcode size does not match");
    if (colour && normalizeColour(piece.colour).toLowerCase() !== normalizeColour(colour).toLowerCase()) {
      throw new Error("Barcode colour does not match");
    }
    if (take !== 1) throw new Error("Scan each piece barcode separately");
    await conn.query("UPDATE item_piece_barcodes SET status = ? WHERE id = ?", [status, piece.id]);
    return [piece];
  }
  const [rows] = await conn.query(
    `SELECT * FROM item_piece_barcodes
     WHERE business_id = ? AND item_id = ? AND LOWER(colour) = LOWER(?) AND size = ? AND status = ?
     ORDER BY created_at
     LIMIT ${take} FOR UPDATE`,
    [BUSINESS_ID, itemId, normalizeColour(colour), normalizeSize(size), fromStatus],
  );
  for (const piece of rows) {
    await conn.query("UPDATE item_piece_barcodes SET status = ? WHERE id = ?", [status, piece.id]);
  }
  return rows;
}

export async function deductGarmentQty(conn, { itemId, colour, size, qty, barcode }) {
  const take = Number(qty);
  if (!Number.isFinite(take) || take <= 0) throw new Error("Invalid quantity");
  const code = normalizeBarcode(barcode);
  if (code) {
    const marked = await markPieceBarcodes(conn, {
      itemId,
      colour,
      size,
      qty: take,
      status: "sold",
      fromStatus: "in_stock",
      barcode: code,
    });
    const piece = marked[0];
    await adjustSizeStock(conn, {
      itemId: piece.item_id,
      colour: piece.colour,
      size: piece.size,
      qty: -1,
    });
    return {
      size: piece.size,
      colour: piece.colour,
      barcode: piece.barcode,
      take: 1,
    };
  }
  const useSize = normalizeSize(size);
  if (!useSize) throw new Error("Select a garment size");
  const colourKey = normalizeColour(colour);
  await adjustSizeStock(conn, { itemId, colour: colourKey, size: useSize, qty: -take });
  const marked = await markPieceBarcodes(conn, {
    itemId,
    colour: colourKey,
    size: useSize,
    qty: take,
    status: "sold",
    fromStatus: "in_stock",
  });
  return {
    size: useSize,
    colour: colourKey,
    barcode: marked.length === 1 ? marked[0].barcode : null,
    take,
  };
}

export async function restoreGarmentQty(conn, { itemId, colour, size, qty, barcode }) {
  const add = Number(qty);
  if (!Number.isFinite(add) || add <= 0) return;
  const colourKey = normalizeColour(colour);
  if (normalizeSize(size)) {
    await adjustSizeStock(conn, { itemId, colour: colourKey, size, qty: add });
  }
  try {
    await markPieceBarcodes(conn, {
      itemId,
      colour: colourKey,
      size,
      qty: add,
      status: "in_stock",
      fromStatus: "sold",
      barcode,
    });
  } catch (err) {
    if (normalizeBarcode(barcode)) throw err;
  }
}

export async function receiveGarmentPurchase(conn, {
  item,
  purchaseId,
  purchaseLineId,
  purchaseNumber,
  colour,
  sizeQuantities,
  generateBarcodes,
  assignedBarcodes,
}) {
  const sizes = parseSizeQuantities(sizeQuantities);
  if (totalSizeQty(sizes) <= 0) throw new Error(`Size-wise quantity required for ${item.name}`);
  const colourKey = normalizeColour(colour || item.colour);
  for (const [size, qty] of Object.entries(sizes)) {
    await adjustSizeStock(conn, { itemId: item.id, colour: colourKey, size, qty });
  }
  const pieces = expandPieceBarcodes({
    itemCode: item.code,
    colour: colourKey,
    sizeQuantities: sizes,
    purchaseNumber,
    lineId: purchaseLineId,
    generate: Boolean(generateBarcodes),
    assigned: assignedBarcodes || [],
  });
  for (const piece of pieces) {
    const barcode = normalizeBarcode(piece.barcode);
    const [dup] = await conn.query(
      "SELECT id FROM item_piece_barcodes WHERE business_id = ? AND barcode = ?",
      [BUSINESS_ID, barcode],
    );
    if (dup[0]) throw new Error(`Duplicate barcode ${barcode}`);
    let code = barcode;
    if (!code) {
      code = generatePieceBarcode({
        itemCode: item.code,
        size: piece.size,
        colour: colourKey,
        sequence: piece.sequence,
        purchaseNumber,
        lineId: purchaseLineId,
      });
    }
    await conn.query(
      `INSERT INTO item_piece_barcodes (
         id, business_id, barcode, item_id, colour, size, purchase_id, purchase_line_id, status
       ) VALUES (?,?,?,?,?,?,?,?, 'in_stock')`,
      [crypto.randomUUID(), BUSINESS_ID, code, item.id, colourKey, piece.size, purchaseId, purchaseLineId],
    );
  }
  return pieces;
}
