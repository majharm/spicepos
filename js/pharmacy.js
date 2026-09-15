/** Pharmacy POS money and batch helpers. Amounts are rupees rounded to 2 decimals. */

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const GST_STATE_NAMES = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

export function formatGstin(gstin) {
  return String(gstin || "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
}

export function isValidGstin(gstin) {
  const value = formatGstin(gstin);
  return !value || GSTIN_PATTERN.test(value);
}

export function gstinStateCode(gstin) {
  const digits = formatGstin(gstin);
  if (digits.length < 2 || !/^\d{2}/.test(digits)) return "";
  return digits.slice(0, 2);
}

export function normalizeStateCode(stateCode) {
  const digits = String(stateCode || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 1 ? digits.padStart(2, "0") : digits.slice(0, 2);
}

export function partyStateCode(party) {
  if (party == null || party === "") return "";
  if (typeof party === "string") return gstinStateCode(party) || normalizeStateCode(party);
  return gstinStateCode(party.gstin) || normalizeStateCode(party.state_code);
}

export function gstinStateName(code) {
  return GST_STATE_NAMES[normalizeStateCode(code) || gstinStateCode(code)] || "";
}

export function isInterstate(fromParty, toParty) {
  const a = partyStateCode(fromParty);
  const b = partyStateCode(toParty);
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

/** Parse count from pack size text, e.g. "10 Tablets" → 10. */
export function parseUnitsFromPackSize(packSize) {
  const text = String(packSize || "").trim();
  if (!text) return 0;
  const lead = text.match(/^(\d+)/);
  if (lead) return Math.max(1, parseInt(lead[1], 10));
  const embedded = text.match(/(\d+)\s*(tablet|capsule|tab|cap|unit)s?\b/i);
  if (embedded) return Math.max(1, parseInt(embedded[1], 10));
  return 0;
}

export function unitsPerPack(item = {}) {
  const explicit = Number(item.units_per_pack);
  if (Number.isFinite(explicit) && explicit > 1) return Math.floor(explicit);
  const parsed = parseUnitsFromPackSize(item.pack_size);
  if (parsed > 1) return parsed;
  return Number.isFinite(explicit) && explicit > 0 ? Math.floor(explicit) : 1;
}

export function looseUnitLabel(item = {}) {
  const type = String(item.medicine_type || "").trim();
  if (type === "Tablet") return "Tablet";
  if (type === "Capsule") return "Capsule";
  if (type === "Vial") return "Vial";
  if (type === "Ampoule") return "Ampoule";
  const packSize = String(item.pack_size || "").trim();
  const match = packSize.match(/\d+\s*([A-Za-z]+)/);
  if (match) return match[1];
  if (unitsPerPack(item) > 1) return "Unit";
  return item.pack_unit || item.base_unit || "Unit";
}

export function packSaleRate(item = {}, customerType = "b2c") {
  if (customerType === "b2b") {
    return Number(item.b2b_rate || item.selling_price || item.retail_rate) || 0;
  }
  return Number(item.selling_price || item.retail_rate) || 0;
}

/** Selling rate per loose unit (e.g. ₹2/tablet when strip is ₹20 with 10 tablets). */
export function looseSaleRate(item = {}, customerType = "b2c") {
  const packRate = packSaleRate(item, customerType);
  const upp = unitsPerPack(item);
  return upp > 1 ? round2(packRate / upp) : packRate;
}

export function looseMrp(item = {}) {
  const mrp = Number(item.mrp) || 0;
  const upp = unitsPerPack(item);
  return upp > 1 && mrp > 0 ? round2(mrp / upp) : mrp;
}

/** Earliest-expiry batch row for an item (item master edit form). */
export function primaryBatch(batches, itemId) {
  const list = (batches || []).filter((b) => b.item_id === itemId);
  if (!list.length) return null;
  return [...list].sort((a, b) => {
    const ae = a.expiry_date ? String(a.expiry_date) : "9999-12-31";
    const be = b.expiry_date ? String(b.expiry_date) : "9999-12-31";
    return ae.localeCompare(be);
  })[0];
}

/** Convert HTML month input (YYYY-MM) to a DATE string for MySQL. */
export function expiryMonthToDate(monthValue) {
  const raw = String(monthValue || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}

/** Convert stored DATE to HTML month input value (YYYY-MM). */
export function expiryDateToMonth(dateValue) {
  if (!dateValue) return "";
  return String(dateValue).slice(0, 7);
}

function packLabelFor(item = {}) {
  const pack = item.pack_unit || item.base_unit || "Strip";
  const upp = unitsPerPack(item);
  const loose = looseUnitLabel(item);
  if (upp > 1) return `${pack} · ${upp} ${loose}`;
  return pack;
}

function formatExpiry(dateValue) {
  if (!dateValue) return "—";
  const text = String(dateValue).slice(0, 10);
  if (text.length >= 7) return text.slice(0, 7);
  return text;
}

/** FEFO batch preview for the pharmacy bill cart (earliest expiry first). */
export function cartBatchPreview(liveBatches, item, qty, allBatches = []) {
  const pack = packLabelFor(item);
  const need = Number(qty) || 0;
  if (Array.isArray(liveBatches) && liveBatches.length) {
    if (need > 0) {
      const plan = allocateFefo(liveBatches, need);
      if (plan.ok && plan.allocations.length) {
        const batch = plan.allocations[0];
        return {
          batchNo: batch.batch_no || "—",
          expiry: formatExpiry(batch.expiry_date),
          pack,
        };
      }
    }
    const first = liveBatches[0];
    return {
      batchNo: first.batch_no || "—",
      expiry: formatExpiry(first.expiry_date),
      pack,
    };
  }
  const saved = primaryBatch(allBatches, item?.id);
  if (saved) {
    return {
      batchNo: saved.batch_no || "—",
      expiry: formatExpiry(saved.expiry_date),
      pack,
    };
  }
  if (Number(item?.stock_gm) > 0 || item?.default_expiry) {
    return {
      batchNo: "OPEN",
      expiry: formatExpiry(item.default_expiry),
      pack,
    };
  }
  return { batchNo: "—", expiry: "—", pack };
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
