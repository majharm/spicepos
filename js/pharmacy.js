/** Pharmacy POS money and batch helpers. Amounts are rupees rounded to 2 decimals. */

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function gstinStateCode(gstin) {
  const digits = String(gstin || "")
    .trim()
    .toUpperCase();
  if (digits.length < 2 || !/^\d{2}/.test(digits)) return "";
  return digits.slice(0, 2);
}

export function isInterstate(fromGstin, toGstin) {
  const a = gstinStateCode(fromGstin);
  const b = gstinStateCode(toGstin);
  return Boolean(a && b && a !== b);
}

export function splitGst({ taxable, gstRate, interstate = false }) {
  const gst = round2((Number(taxable) * Number(gstRate || 0)) / 100);
  if (interstate) return { gst, cgst: 0, sgst: 0, igst: gst };
  const cgst = round2(gst / 2);
  const sgst = round2(gst - cgst);
  return { gst, cgst, sgst, igst: 0 };
}

export function purchaseLineTotals(line = {}) {
  const packQty = Number(line.packQty ?? line.pack_qty) || 0;
  const unitsPerPack = Number(line.unitsPerPack ?? line.units_per_pack) || 1;
  const totalQty = Number(line.totalQty ?? line.total_qty);
  const resolvedTotal = Number.isFinite(totalQty) && totalQty > 0 ? totalQty : packQty * unitsPerPack;
  const freeQty = Number(line.freeQty ?? line.free_qty) || 0;
  const purchaseRate = Number(line.purchaseRate ?? line.purchase_rate) || 0;
  const discount = Number(line.discount) || 0;
  const gstRate = Number(line.gstRate ?? line.gst_rate) || 0;
  const stockQty = round2(resolvedTotal + freeQty);
  const taxable = round2(Math.max(0, packQty * purchaseRate - discount));
  const tax = splitGst({ taxable, gstRate, interstate: Boolean(line.interstate) });
  return {
    packQty,
    unitsPerPack,
    totalQty: resolvedTotal,
    freeQty,
    stockQty,
    purchaseRate,
    discount,
    gstRate,
    taxable,
    ...tax,
    total: round2(taxable + tax.gst),
  };
}

export function saleLineTotals({ qty, rate, mrp = 0, gstRate = 0, discount = 0, interstate = false } = {}) {
  const quantity = Number(qty) || 0;
  const unitRate = Number(rate) || 0;
  const taxable = round2(Math.max(0, quantity * unitRate - Number(discount || 0)));
  const tax = splitGst({ taxable, gstRate, interstate });
  return {
    qty: quantity,
    rate: unitRate,
    mrp: Number(mrp) || 0,
    taxable,
    ...tax,
    amount: round2(taxable + tax.gst),
  };
}

export function billTotals({ lines = [], billDiscount = 0, amountPaid = 0, roundToRupee = true } = {}) {
  const subtotal = round2(lines.reduce((s, l) => s + Number(l.taxable || 0), 0));
  const rawCgst = round2(lines.reduce((s, l) => s + Number(l.cgst || 0), 0));
  const rawSgst = round2(lines.reduce((s, l) => s + Number(l.sgst || 0), 0));
  const rawIgst = round2(lines.reduce((s, l) => s + Number(l.igst || 0), 0));
  const discount = round2(Math.min(Math.max(0, Number(billDiscount) || 0), subtotal));
  const factor = subtotal > 0 ? (subtotal - discount) / subtotal : 0;
  const cgst = round2(rawCgst * factor);
  const sgst = round2(rawSgst * factor);
  const igst = round2(rawIgst * factor);
  const gst = round2(cgst + sgst + igst);
  const beforeRound = round2(Math.max(0, subtotal - discount + gst));
  const rounded = roundToRupee ? Math.round(beforeRound) : beforeRound;
  const roundOff = round2(rounded - beforeRound);
  const grandTotal = round2(beforeRound + roundOff);
  const paid = round2(amountPaid);
  return {
    subtotal,
    discount,
    cgst,
    sgst,
    igst,
    gst,
    roundOff,
    grandTotal,
    amountPaid: paid,
    due: round2(Math.max(0, grandTotal - paid)),
  };
}

export function allocateFefo(batches, qtyNeeded, { preferredId } = {}) {
  const need = Number(qtyNeeded);
  if (!Number.isFinite(need) || need <= 0) {
    return { ok: false, error: "Quantity must be positive", shortfall: need, allocations: [] };
  }
  const byExpiry = (a, b) => {
    const ae = a.expiry_date ? String(a.expiry_date) : "9999-12-31";
    const be = b.expiry_date ? String(b.expiry_date) : "9999-12-31";
    return ae.localeCompare(be);
  };
  const list = [...(batches || [])];
  let ordered;
  if (preferredId) {
    const preferred = list.find((b) => b.id === preferredId);
    const rest = list.filter((b) => b.id !== preferredId).sort(byExpiry);
    ordered = preferred ? [preferred, ...rest] : rest;
  } else {
    ordered = list.sort(byExpiry);
  }
  const allocations = [];
  let left = need;
  for (const batch of ordered) {
    if (left <= 0) break;
    const available = Number(batch.qty) || 0;
    const take = Math.min(available, left);
    if (take <= 0) continue;
    allocations.push({
      id: batch.id,
      batch_no: batch.batch_no,
      expiry_date: batch.expiry_date,
      mrp: batch.mrp,
      take,
    });
    left = round2(left - take);
  }
  if (left > 0) {
    return { ok: false, error: "Insufficient batch stock", shortfall: left, allocations };
  }
  return { ok: true, shortfall: 0, allocations };
}

export function mergeSaleLines(lines = []) {
  const map = new Map();
  for (const line of lines) {
    const id = line.itemId || line.item_id;
    if (!id) continue;
    const qty = Number(line.quantity ?? line.quantity_gm ?? line.qty) || 0;
    const prev = map.get(id);
    if (prev) {
      prev.quantity = (Number(prev.quantity) || 0) + qty;
      prev.qty = prev.quantity;
      prev.quantity_gm = prev.quantity;
    } else {
      map.set(id, { ...line, itemId: id, item_id: id, quantity: qty, qty, quantity_gm: qty });
    }
  }
  return [...map.values()];
}

export function remainingReturnQty(billed, alreadyReturned) {
  return round2(Math.max(0, Number(billed) - Number(alreadyReturned || 0)));
}

export function expiryStatus(date, today = new Date()) {
  if (!date) return "unknown";
  const exp = new Date(date);
  if (Number.isNaN(exp.getTime())) return "unknown";
  const now = new Date(today);
  now.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  const days = Math.round((exp.getTime() - now.getTime()) / 86400000);
  if (days < 0) return "expired";
  if (days <= 90) return "near";
  return "ok";
}

export const MEDICINE_TYPES = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Injection",
  "Cream",
  "Ointment",
  "Drops",
  "Inhaler",
  "Powder",
  "Gel",
  "Lotion",
  "Other",
];

export const PACK_TYPES = ["Strip", "Bottle", "Box", "Tube", "Packet", "Vial", "Ampoule"];
