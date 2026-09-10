(function (root, factory) {
  const api = factory();
  root.POSRestaurant = api;
  if (typeof window !== "undefined") window.POSRestaurant = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_SEATS = 12;
  const MIN_SEATS = 4;
  const MAX_SEATS = 40;
  const MAX_FLOORS = 12;
  const PARCEL = "Parcel";
  const GROUND_ID = "ground";
  const GROUND_NAME = "Ground";

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
    if (/^(parcel|takeaway|take away|pickup|pick up)$/i.test(t)) return PARCEL;
    const named = t.match(/^table\s*(\d{1,3})$/i);
    if (named) return String(Number(named[1]));
    if (/^\d{1,3}$/.test(t)) return String(Number(t));
    return t.slice(0, 32);
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

  function parseDiningRaw(raw) {
    if (raw && typeof raw === "object") return raw;
    if (typeof raw === "string" && raw.trim()) {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return null;
  }

  function clipFloorId(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32);
  }

  function floorRecord(row) {
    if (row == null) return null;
    if (typeof row === "string" || typeof row === "number") {
      const name = clipTableNo(row).slice(0, 32);
      if (!name) return null;
      const id = clipFloorId(name);
      if (!id || id === "parcel") return null;
      return { id, name };
    }
    const name = clipTableNo(row.name || row.id).slice(0, 32);
    if (!name) return null;
    let id = clipFloorId(row.id || name);
    if (!id || id === "parcel") return null;
    return { id, name };
  }

  function groundFloor() {
    return { id: GROUND_ID, name: GROUND_NAME };
  }

  function tableRecord(row, fallbackFloor) {
    const floor = clipFloorId(fallbackFloor) || GROUND_ID;
    if (row == null) return null;
    if (typeof row === "string" || typeof row === "number") {
      const id = normalizeTableNo(row);
      if (!id || id === PARCEL) return null;
      return { id, name: displayTable(id), floor };
    }
    const id = normalizeTableNo(row.id || row.name);
    if (!id || id === PARCEL) return null;
    const name = clipTableNo(row.name || displayTable(id)) || displayTable(id);
    const rowFloor = clipFloorId(row.floor) || floor;
    return { id, name, floor: rowFloor === "parcel" ? floor : rowFloor };
  }

  function uniqFloors(list) {
    const out = [];
    const seen = new Set();
    for (const row of list || []) {
      const rec = floorRecord(row);
      if (!rec || seen.has(rec.id)) continue;
      seen.add(rec.id);
      out.push(rec);
    }
    return out.slice(0, MAX_FLOORS);
  }

  function parseDining(raw) {
    const parsed = parseDiningRaw(raw);
    if (!parsed) return null;
    if (Array.isArray(parsed)) {
      return {
        floors: [groundFloor()],
        tables: parsed.map((row) => tableRecord(row, GROUND_ID)).filter(Boolean),
      };
    }
    if (typeof parsed !== "object") return null;
    const floors = uniqFloors(parsed.floors);
    const fallback = floors[0]?.id || GROUND_ID;
    const tables = (Array.isArray(parsed.tables) ? parsed.tables : []).map((row) => tableRecord(row, fallback)).filter(Boolean);
    return { floors: floors.length ? floors : [groundFloor()], tables };
  }

  function diningOf(biz, holds) {
    const parsed = parseDining(biz?.dining_tables_json || biz?.dining_tables_list);
    let floors;
    let list;
    if (parsed) {
      floors = parsed.floors.slice();
      list = parsed.tables.slice();
    } else {
      floors = [groundFloor()];
      list = [];
      const n = seatCount(biz, holds);
      for (let i = 1; i <= n; i += 1) list.push({ id: String(i), name: `Table ${i}`, floor: GROUND_ID });
    }
    const haveFloors = new Set(floors.map((f) => f.id));
    for (const t of list) {
      if (t.floor && !haveFloors.has(t.floor)) {
        floors.push({ id: t.floor, name: displayFloor(t.floor) });
        haveFloors.add(t.floor);
      }
    }
    if (!floors.length) floors.push(groundFloor());
    const have = new Set(list.map((t) => t.id));
    const extra = Array.isArray(holds) ? holds : [];
    for (const row of extra) {
      const id = tableNoFromHold(row);
      if (id && id !== PARCEL && !have.has(id)) {
        list.push({ id, name: displayTable(id), floor: floors[0].id });
        have.add(id);
      }
    }
    return { floors: floors.slice(0, MAX_FLOORS), tables: list.slice(0, MAX_SEATS) };
  }

  function floorsOf(biz, holds) {
    return diningOf(biz, holds).floors;
  }

  function tablesOf(biz, holds) {
    return diningOf(biz, holds).tables;
  }

  function tablesOnFloor(tables, floorId) {
    const want = clipFloorId(floorId) || GROUND_ID;
    return (tables || []).filter((t) => (t.floor || GROUND_ID) === want);
  }

  function displayFloor(floorId, floors) {
    const id = clipFloorId(floorId);
    const named = (floors || []).find((f) => f.id === id);
    if (named?.name) return named.name;
    if (!id || id === GROUND_ID) return GROUND_NAME;
    return id.replace(/[-_]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function nextNumericId(tables) {
    let max = 0;
    for (const t of tables || []) {
      if (/^\d+$/.test(String(t.id))) max = Math.max(max, Number(t.id));
    }
    return String(max + 1);
  }

  function addTable(tables, name, floorId) {
    const current = Array.isArray(tables) ? tables.slice() : [];
    if (current.length >= MAX_SEATS) return { ok: false, error: "Maximum 40 tables" };
    const trimmed = clipTableNo(name).slice(0, 32);
    const id = trimmed ? normalizeTableNo(trimmed) : nextNumericId(current);
    if (!id || id === PARCEL) return { ok: false, error: "Choose a table name" };
    if (current.some((t) => t.id === id)) return { ok: false, error: "That table already exists" };
    const label = trimmed && !/^table\s*\d+$/i.test(trimmed) && !/^\d+$/.test(trimmed) ? trimmed : displayTable(id);
    const floor = clipFloorId(floorId) || current[0]?.floor || GROUND_ID;
    const added = { id, name: label.slice(0, 32), floor: floor === "parcel" ? GROUND_ID : floor };
    return { ok: true, tables: [...current, added], added };
  }

  function removeTable(tables, id) {
    const want = normalizeTableNo(id);
    if (!want || want === PARCEL) return { ok: false, error: "That table cannot be removed" };
    return { ok: true, tables: (tables || []).filter((t) => t.id !== want) };
  }

  function addFloor(floors, name) {
    const current = uniqFloors(floors);
    if (current.length >= MAX_FLOORS) return { ok: false, error: "Maximum 12 floors" };
    const trimmed = clipTableNo(name).slice(0, 32);
    if (!trimmed) return { ok: false, error: "Choose a floor name" };
    if (/^(parcel|takeaway|take away)$/i.test(trimmed)) return { ok: false, error: "Choose a floor name" };
    let id = clipFloorId(trimmed);
    if (!id || id === "parcel") id = `fl-${Math.random().toString(36).slice(2, 8)}`;
    if (current.some((f) => f.id === id || f.name.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, error: "That floor already exists" };
    }
    const added = { id, name: trimmed };
    return { ok: true, floors: [...current, added], added };
  }

  function removeFloor(floors, tables, floorId, busyIds) {
    const want = clipFloorId(floorId);
    if (!want) return { ok: false, error: "That floor cannot be removed" };
    const current = uniqFloors(floors);
    if (current.length <= 1) return { ok: false, error: "Keep at least one floor" };
    if (!current.some((f) => f.id === want)) return { ok: false, error: "Floor not found" };
    const busy = new Set((busyIds || []).map((id) => normalizeTableNo(id)).filter(Boolean));
    const blocked = (tables || []).some((t) => (t.floor || GROUND_ID) === want && busy.has(t.id));
    if (blocked) return { ok: false, error: "Floor has occupied tables — settle or park first" };
    return {
      ok: true,
      floors: current.filter((f) => f.id !== want),
      tables: (tables || []).filter((t) => (t.floor || GROUND_ID) !== want),
    };
  }

  function serializeTables(tables, floors) {
    const list = (tables || []).map((row) => tableRecord(row, row?.floor)).filter(Boolean);
    let floorList = uniqFloors(floors);
    const have = new Set(floorList.map((f) => f.id));
    for (const t of list) {
      if (t.floor && !have.has(t.floor)) {
        floorList.push({ id: t.floor, name: displayFloor(t.floor) });
        have.add(t.floor);
      }
    }
    if (!floorList.length) floorList = [groundFloor()];
    return JSON.stringify({
      floors: floorList.map((f) => ({ id: f.id, name: f.name })),
      tables: list.map((t) => ({ id: t.id, name: t.name, floor: t.floor || floorList[0].id })),
    });
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
    GROUND_ID,
    MAX_FLOORS,
    isRestaurantShop,
    normalizeTableNo,
    displayTable,
    displayFloor,
    holdLabel,
    seatCount,
    seatIds,
    clipFloorId,
    diningOf,
    floorsOf,
    tablesOf,
    tablesOnFloor,
    addTable,
    removeTable,
    addFloor,
    removeFloor,
    serializeTables,
    nextNumericId,
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
