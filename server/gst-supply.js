export function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

export function gstinStateCode(gstin) {
  const g = String(gstin || "")
    .trim()
    .toUpperCase();
  if (g.length >= 2 && /^\d{2}/.test(g)) return g.slice(0, 2);
  return "";
}

export function normalizeState(state) {
  return String(state || "")
    .trim()
    .toLowerCase();
}

export function isInterStateSupply(shop, party) {
  const shopCode = gstinStateCode(shop?.gstin);
  const partyCode = gstinStateCode(party?.gstin);
  if (shopCode && partyCode) return shopCode !== partyCode;

  const shopState = normalizeState(shop?.state);
  const partyState = normalizeState(party?.state);
  if (shopState && partyState) return shopState !== partyState;

  return false;
}

export function splitGstAmount(totalGst, interState) {
  const total = round2(totalGst);
  if (interState) return { cgst: 0, sgst: 0, igst: total };
  const cgst = round2(total / 2);
  return { cgst, sgst: round2(total - cgst), igst: 0 };
}

export function lineGstAmount(amount, gstRate) {
  return round2(((Number(amount) || 0) * (Number(gstRate) || 0)) / 100);
}

export function aggregateGstByRate(rows, shop, partyFields = { gstin: "party_gstin", state: "party_state" }) {
  const map = new Map();
  const billSets = new Map();
  for (const row of rows) {
    const party = {
      gstin: row[partyFields.gstin],
      state: row[partyFields.state],
    };
    const inter = isInterStateSupply(shop, party);
    const rate = Number(row.gst_rate) || 0;
    const taxable = round2(row.amount);
    const gst = Number(row.gst) || lineGstAmount(row.amount, rate);
    const split = splitGstAmount(gst, inter);
    const cur = map.get(rate) || { gst_rate: rate, taxable: 0, gst: 0, cgst: 0, sgst: 0, igst: 0 };
    cur.taxable = round2(cur.taxable + taxable);
    cur.gst = round2(cur.gst + gst);
    cur.cgst = round2(cur.cgst + split.cgst);
    cur.sgst = round2(cur.sgst + split.sgst);
    cur.igst = round2(cur.igst + split.igst);
    map.set(rate, cur);
    const orderId = row.order_id || row.purchase_id;
    if (orderId) {
      if (!billSets.has(rate)) billSets.set(rate, new Set());
      billSets.get(rate).add(orderId);
    }
  }
  return [...map.values()]
    .sort((a, b) => a.gst_rate - b.gst_rate)
    .map((r) => ({ ...r, bills: billSets.get(r.gst_rate)?.size || 0 }));
}

export function sumSplitGst(
  rows,
  shop,
  partyFields = { gstin: "party_gstin", state: "party_state" },
  gstField = "gst",
) {
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  for (const row of rows) {
    const party = {
      gstin: row[partyFields.gstin],
      state: row[partyFields.state],
    };
    const inter = isInterStateSupply(shop, party);
    const gst = Number(row[gstField]) || lineGstAmount(row.amount, row.gst_rate);
    const split = splitGstAmount(gst, inter);
    cgst = round2(cgst + split.cgst);
    sgst = round2(sgst + split.sgst);
    igst = round2(igst + split.igst);
  }
  const total = round2(cgst + sgst + igst);
  return { cgst, sgst, igst, total };
}

export function splitOrderGst(order, shop) {
  const inter = isInterStateSupply(shop, {
    gstin: order.gstin || order.customer_gstin,
    state: order.customer_state,
  });
  return { interState: inter, ...splitGstAmount(order.gst, inter) };
}
