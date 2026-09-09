(function (root, factory) {
  const api = factory();
  root.POSRestaurant = api;
  if (typeof window !== "undefined") window.POSRestaurant = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_SEATS = 12;
  const MIN_SEATS = 4;
  const MAX_SEATS = 40;
  const PARCEL = "Parcel";

  function shopKindOf(biz) {
    if (typeof globalThis !== "undefined" && globalThis.POSFootwear?.shopKind) {
      return globalThis.POSFootwear.shopKind(biz);
    }
    const type = String(biz?.business_type || "").toLowerCase().trim();
    if (type === "restaurant" || type === "cafe" || type === "bakery") return "restaurant";
    const t = [biz?.category, biz?.business_type].filter(Boolean).join(" ").toLowerCase();
    if (/(restaurant|cafe|bakery|food)/.test(t)) return "restaurant";
    return "";
  }

  function isRestaurantShop(biz) {
    return shopKindOf(biz) === "restaurant";
  }

  function clipTableNo(raw) {
    return String(raw || "").trim().slice(0, 64);
  }

  function normalizeTableNo(raw) {
    const t = clipTableNo(raw);
    if (!t) return "";
    if (/^(parcel|takeaway|take away|pickup|pick up|parcel)$/i.test(t)) return PARCEL;
    const m = t.match(/(\d{1,3})/);
    if (m) return String(Number(m[1]));
    return t;
  }

  function displayTable(tableNo) {
    const t = normalizeTableNo(tableNo);
    if (!t) return "";
    if (t === PARCEL) return PARCEL;
    if (/^\d+$/.test(t)) return `Table ${t}`;
    return t;
  }

  function holdLabel(tableNo) {
    return displayTable(tableNo) || "Table";
  }

  function seatCount(biz, holds) {
    let n = DEFAULT_SEATS;
    const raw = Number(biz?.dining_tables ?? biz?.table_count);
    if (Number.isFinite(raw) && raw > 0) n = raw;
    n = Math.min(MAX_SEATS, Math.max(MIN_SEATS, Math.round(n)));
    const list = Array.isArray(holds) ? holds : [];
    for (const row of list) {
      const t = tableNoFromHold(row);
      if (/^\d+$/.test(t)) n = Math.max(n, Number(t));
    }
    return Math.min(MAX_SEATS, n);
  }

  function seatIds(count) {
    const n = Math.min(MAX_SEATS, Math.max(MIN_SEATS, Number(count) || DEFAULT_SEATS));
    const ids = [];
    for (let i = 1; i <= n; i += 1) ids.push(String(i));
    ids.push(PARCEL);
    return ids;
  }

  function holdPayload(row) {
    if (row?.payload && typeof row.payload === "object" && !Array.isArray(row.payload)) return row.payload;
    const raw = row?.payload_json;
    if (!raw) return null;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function tableNoFromHold(row) {
    const payload = holdPayload(row) || {};
    const fromPayload = normalizeTableNo(payload.table_no || payload.tableNo);
    if (fromPayload) return fromPayload;
    const label = String(row?.label || "").trim();
    if (/^table\s+\d+$/i.test(label) || /^parcel$/i.test(label)) return normalizeTableNo(label);
    return "";
  }

  function isTableHold(row) {
    return Boolean(tableNoFromHold(row));
  }

  function findTableHold(holds, tableNo) {
    const want = normalizeTableNo(tableNo);
    if (!want) return null;
    const list = Array.isArray(holds) ? holds : [];
    return list.find((row) => tableNoFromHold(row) === want) || null;
  }

  function cartSnapshot(cart) {
    return (Array.isArray(cart) ? cart : [])
      .map((line) => ({
        itemId: line.itemId || line.item_id || "",
        qtyGm: Number(line.qtyGm || line.quantity_gm) || 0,
        name: line.name || line.item_name || "",
      }))
      .filter((line) => line.itemId && line.qtyGm > 0);
  }

  function qtyByItem(lines) {
    const map = new Map();
    for (const line of cartSnapshot(lines)) {
      map.set(line.itemId, (map.get(line.itemId) || 0) + line.qtyGm);
    }
    return map;
  }

  function kotDelta(cart, printed) {
    const now = qtyByItem(cart);
    const done = qtyByItem(printed);
    const out = [];
    for (const [itemId, qty] of now) {
      const add = qty - (done.get(itemId) || 0);
      if (add > 0) out.push({ itemId, qtyGm: add });
    }
    return out;
  }

  function kotKind(cart, printed) {
    const delta = kotDelta(cart, printed);
    if (delta.length) return { kind: "new", lines: delta };
    const all = cartSnapshot(cart).map((line) => ({ itemId: line.itemId, qtyGm: line.qtyGm }));
    return { kind: "reprint", lines: all };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function formatKotQty(qty, unit) {
    const U = typeof globalThis !== "undefined" ? globalThis.POSUnits : null;
    if (U?.formatQty) return U.formatQty(qty, unit || "PCS");
    const n = Number(qty) || 0;
    const u = String(unit || "PCS").toUpperCase();
    if (u === "GM" || u === "G") return n >= 1000 ? `${(n / 1000).toFixed(2)} kg` : `${n} g`;
    return String(n);
  }

  function kotBody(opts) {
    const shop = escapeHtml(opts?.shop || "Kitchen");
    const table = escapeHtml(displayTable(opts?.tableNo) || "—");
    const when = escapeHtml(opts?.when || "");
    const notes = String(opts?.notes || "").trim();
    const kind = opts?.kind === "reprint" ? "REPRINT" : "KOT";
    const lines = Array.isArray(opts?.lines) ? opts.lines : [];
    const rows = lines
      .map((line, i) => {
        const name = escapeHtml(line.name || line.item_name || "Item");
        const qty = escapeHtml(formatKotQty(line.qtyGm || line.quantity_gm, line.unit));
        return `<tr><td class="kot-n">${i + 1}</td><td>${name}</td><td class="kot-q">${qty}</td></tr>`;
      })
      .join("");
    return `<article class="thermal-invoice kot-ticket">
  <header class="inv-head">
    <h1 class="inv-shop">${shop}</h1>
    <p class="inv-title">${kind}</p>
  </header>
  <div class="inv-rule"></div>
  <div class="inv-details">
    <div class="inv-row"><span>Table</span><strong>${table}</strong></div>
    ${when ? `<div class="inv-row"><span>Time</span><span>${when}</span></div>` : ""}
  </div>
  <div class="inv-rule"></div>
  <table class="inv-table kot-table">
    <thead><tr><th>#</th><th>Item</th><th class="inv-num">Qty</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="3" class="inv-empty">No items</td></tr>'}</tbody>
  </table>
  ${notes ? `<div class="inv-rule"></div><p class="inv-footer">Note: ${escapeHtml(notes)}</p>` : ""}
  <div class="inv-rule"></div>
  <p class="inv-powered">Kitchen copy · not a bill</p>
</article>`;
  }

  const KOT_CSS = `
@page { size: 80mm auto; margin: 2mm; }
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 2mm;
  width: 76mm;
  font-family: "Courier New", Courier, ui-monospace, monospace;
  font-size: 12px;
  line-height: 1.35;
  color: #000;
  background: #fff;
}
.kot-ticket { width: 100%; }
.inv-head { text-align: center; }
.inv-shop { font-size: 15px; margin: 0 0 4px; font-weight: 800; }
.inv-title { margin: 8px 0 2px; font-size: 16px; font-weight: 800; letter-spacing: 0.12em; }
.inv-rule { border-top: 1px dashed #000; margin: 6px 0; }
.inv-details .inv-row { display: flex; justify-content: space-between; gap: 6px; margin: 2px 0; }
.inv-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.inv-table th, .inv-table td { padding: 4px 0; vertical-align: top; }
.inv-num, .kot-q { text-align: right; font-weight: 800; }
.kot-n { width: 1.4em; }
.inv-footer { margin: 6px 0; font-size: 12px; }
.inv-powered { text-align: center; margin: 8px 0 0; font-size: 10px; }
`;

  function kotDocument(opts) {
    const title = escapeHtml(`${opts?.kind === "reprint" ? "KOT reprint" : "KOT"} ${displayTable(opts?.tableNo) || ""}`.trim());
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>${KOT_CSS}</style>
</head>
<body>
${kotBody(opts)}
<script>window.onload=function(){window.focus();window.print();};<\/script>
</body>
</html>`;
  }

  return {
    PARCEL,
    DEFAULT_SEATS,
    isRestaurantShop,
    normalizeTableNo,
    displayTable,
    holdLabel,
    seatCount,
    seatIds,
    holdPayload,
    tableNoFromHold,
    isTableHold,
    findTableHold,
    cartSnapshot,
    kotDelta,
    kotKind,
    kotBody,
    kotDocument,
  };
});
