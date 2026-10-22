/** Garment & Fashion purchase, size stock, and piece-barcode helpers. */

import { purchaseLineTotals, round2 } from "./pharmacy.js";

export const LETTER_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
export const NUMERIC_SIZES = ["28", "30", "32", "34", "36", "38"];
export const BUSINESS_CATEGORIES = [
  { id: "pharmacy", label: "Pharmacy" },
  { id: "restaurant", label: "Restaurant" },
  { id: "garment", label: "Garment & Fashion" },
  { id: "other", label: "Other" },
];

export function isGarmentCategory(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("&", " ")
    .replaceAll(/[^a-z0-9]+/g, " ");
  return text.includes("garment") || text.includes("fashion");
}

export function normalizeSize(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (LETTER_SIZES.includes(upper)) return upper;
  if (/^\d+(\.\d+)?$/.test(raw)) return String(Number(raw) === Number(raw) ? raw.replace(/^0+(?=\d)/, "") : raw);
  return raw;
}

export function normalizeColour(value) {
  return String(value ?? "")
    .trim()
    .replaceAll(/\s+/g, " ");
}

export function parseSizeList(value) {
  if (Array.isArray(value)) return [...new Set(value.map(normalizeSize).filter(Boolean))];
  const text = String(value || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parseSizeList(parsed);
  } catch {
    /* comma / slash list */
  }
  return [...new Set(text.split(/[,|/]+/).map(normalizeSize).filter(Boolean))];
}

export function sizesForChart(chart, custom = []) {
  const kind = String(chart || "letter").toLowerCase();
  const extra = parseSizeList(custom);
  if (kind === "numeric") return uniqueSizes([...NUMERIC_SIZES, ...extra]);
  if (kind === "both") return uniqueSizes([...LETTER_SIZES, ...NUMERIC_SIZES, ...extra]);
  if (kind === "custom") return extra.length ? extra : uniqueSizes([...LETTER_SIZES]);
  return uniqueSizes([...LETTER_SIZES, ...extra]);
}

function uniqueSizes(list) {
  const seen = new Set();
  const out = [];
  for (const size of list) {
    const key = normalizeSize(size);
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    out.push(key);
  }
  return out;
}

export function parseSizeQuantities(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([size, qty]) => [normalizeSize(size), Number(qty) || 0])
        .filter(([size, qty]) => size && qty > 0),
    );
  }
  if (Array.isArray(value)) {
    const map = {};
    for (const row of value) {
      const size = normalizeSize(row.size || row[0]);
      const qty = Number(row.qty ?? row.quantity ?? row[1]) || 0;
      if (size && qty > 0) map[size] = (map[size] || 0) + qty;
    }
    return map;
  }
  const text = String(value).trim();
  if (!text) return {};
  try {
    return parseSizeQuantities(JSON.parse(text));
  } catch {
    const map = {};
    for (const part of text.split(/[,;]+/)) {
      const match = part.match(/^\s*([A-Za-z0-9. +/_-]+)\s*[:=x×]\s*(-?\d+(?:\.\d+)?)\s*$/i);
      if (!match) continue;
      const size = normalizeSize(match[1]);
      const qty = Number(match[2]) || 0;
      if (size && qty > 0) map[size] = (map[size] || 0) + qty;
    }
    return map;
  }
}

export function totalSizeQty(sizeQuantities) {
  return Object.values(parseSizeQuantities(sizeQuantities)).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
}

export function formatSizeQuantities(sizeQuantities) {
  const map = parseSizeQuantities(sizeQuantities);
  return Object.entries(map)
    .map(([size, qty]) => `${size}: ${qty}`)
    .join(", ");
}

export function garmentPurchaseLineTotals(line = {}) {
  const sizes = parseSizeQuantities(line.sizeQuantities ?? line.size_quantities);
  const totalQty = totalSizeQty(sizes) || Number(line.totalQty ?? line.total_qty ?? line.quantity) || 0;
  const rate = Number(line.purchaseRate ?? line.purchase_rate ?? line.rate) || 0;
  const calc = purchaseLineTotals({
    packQty: totalQty,
    unitsPerPack: 1,
    totalQty,
    freeQty: line.freeQty ?? line.free_qty ?? 0,
    purchaseRate: rate,
    discount: line.discount,
    gstRate: line.gstRate ?? line.gst_rate,
    interstate: line.interstate,
  });
  return {
    ...calc,
    sizeQuantities: sizes,
    colour: normalizeColour(line.colour || line.color),
    amount: round2(totalQty * rate),
  };
}

export function assertNoDuplicateBarcodes(codes = []) {
  const seen = new Map();
  for (const raw of codes) {
    const code = String(raw || "").trim();
    if (!code) continue;
    const key = code.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate barcode ${code}`);
    seen.set(key, code);
  }
  return [...seen.values()];
}

export function normalizeBarcode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replaceAll(/\s+/g, "");
}

export function generatePieceBarcode({ itemCode, size, colour, sequence, purchaseNumber, lineId } = {}) {
  const parts = [
    "G",
    compactToken(purchaseNumber || "PO"),
    compactToken(lineId || itemCode || "SKU"),
    compactToken(size || "SZ"),
    compactToken(colour || "CLR"),
    String(Math.max(1, Number(sequence) || 1)).padStart(4, "0"),
  ];
  return parts.join("-");
}

function compactToken(value) {
  return String(value || "")
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/g, "")
    .slice(0, 10) || "X";
}

export function expandPieceBarcodes({
  itemCode,
  colour,
  sizeQuantities,
  purchaseNumber,
  lineId,
  generate = false,
  assigned = [],
} = {}) {
  const sizes = parseSizeQuantities(sizeQuantities);
  const total = totalSizeQty(sizes);
  const given = assertNoDuplicateBarcodes((assigned || []).map(normalizeBarcode).filter(Boolean));
  if (!generate && !given.length) return [];
  if (given.length && given.length !== total) {
    throw new Error(`Need ${total} unique barcodes for this product, got ${given.length}`);
  }
  const out = [];
  let seq = 1;
  let assignedIndex = 0;
  for (const [size, qty] of Object.entries(sizes)) {
    for (let i = 0; i < qty; i += 1) {
      const barcode = given[assignedIndex] || generatePieceBarcode({
        itemCode,
        size,
        colour,
        sequence: seq,
        purchaseNumber,
        lineId,
      });
      assignedIndex += 1;
      seq += 1;
      out.push({ barcode, size, colour: colour || "", sequence: seq - 1 });
    }
  }
  assertNoDuplicateBarcodes(out.map((row) => row.barcode));
  return out;
}

export function variantKey(itemId, colour, size) {
  return `${itemId || ""}|${normalizeColour(colour).toLowerCase()}|${normalizeSize(size).toLowerCase()}`;
}

export function sizeStockVariants(rows = [], itemId) {
  return (rows || [])
    .filter((row) => (row.item_id || row.itemId) === itemId && (Number(row.qty ?? row.quantity) || 0) > 0)
    .map((row) => ({
      colour: normalizeColour(row.colour),
      size: normalizeSize(row.size),
      qty: Number(row.qty ?? row.quantity) || 0,
    }))
    .filter((row) => row.size);
}

export function allocateSizePlan(rows = [], itemId, qty) {
  let need = Number(qty) || 0;
  const parts = [];
  if (need <= 0) return { ok: false, parts };
  for (const row of sizeStockVariants(rows, itemId)) {
    if (need <= 0) break;
    const take = Math.min(row.qty, need);
    if (take <= 0) continue;
    parts.push({ ...row, qty: take });
    need -= take;
  }
  return { ok: need <= 0, parts, remaining: need };
}

export function stockByVariant(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = variantKey(row.item_id || row.itemId, row.colour, row.size);
    map.set(key, (map.get(key) || 0) + (Number(row.qty ?? row.quantity) || 0));
  }
  return map;
}

export function sizeStockForItem(rows = [], itemId, colour) {
  const map = {};
  for (const row of rows) {
    if ((row.item_id || row.itemId) !== itemId) continue;
    if (colour && normalizeColour(row.colour).toLowerCase() !== normalizeColour(colour).toLowerCase()) continue;
    const size = normalizeSize(row.size);
    if (!size) continue;
    map[size] = (map[size] || 0) + (Number(row.qty ?? row.quantity) || 0);
  }
  return map;
}

export function formatSizeStock(map) {
  const entries = Object.entries(parseSizeQuantities(map)).filter(([, qty]) => qty !== 0);
  return entries.length ? entries.map(([size, qty]) => `${size}: ${qty}`).join(" · ") : "No size stock";
}
