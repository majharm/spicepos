const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

const state = {
  company: {},
  items: [],
  units: [],
  customers: [],
  packs: [],
  suppliers: [],
  cart: [],
  query: "",
  customerId: "",
  lastPack: null,
  held: [],
  editingOrderId: null,
  logoDraft: null,
  session: null,
  perms: {},
  support: {},
  plan: null,
};

function debounce(fn, wait = 120) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

const renderCatalogDebounced = debounce(() => renderCatalog(), 100);
const renderOrdersListDebounced = debounce(() => renderOrdersList(), 100);

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function money(n) {
  return inr.format(Number(n) || 0);
}

function kg(gm) {
  return `${(Number(gm) / 1000).toFixed(2)} kg`;
}

function itemUnit(item) {
  return POSUnits.itemUnit(item);
}

function fmtQty(qty, item) {
  return POSUnits.formatQty(qty, itemUnit(item));
}

function fillItemUnitSelect(selected) {
  const el = $("item-unit");
  if (!el) return;
  el.innerHTML = POSUnits.optionsHtml(selected || el.value || "GM");
}

function applyUnitMaster(rows) {
  state.units = Array.isArray(rows) ? rows : [];
  POSUnits.hydrate(state.units.filter((u) => u.status !== "inactive"));
  fillItemUnitSelect();
}

function renderUnitsTable() {
  const el = $("units-table");
  if (!el) return;
  const rows = state.units || [];
  el.innerHTML = `<table><thead><tr>
    <th>Code</th><th>Name</th><th>Kind</th><th>Rate</th><th>Stock</th><th></th>
  </tr></thead><tbody>${rows
    .map(
      (u) => `<tr>
      <td>${escapeHtml(u.code)}</td>
      <td>${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.family)}</td>
      <td>₹${escapeHtml(u.rate_suffix)}</td>
      <td>${escapeHtml(u.stock_suffix)}</td>
      <td><button class="btn" data-edit-unit="${escapeHtml(u.id)}" type="button">Edit</button>
          <button class="btn" data-del-unit="${escapeHtml(u.id)}" type="button">Delete</button></td>
    </tr>`,
    )
    .join("")}</tbody></table>`;
}

function paintUnitFamilyDefaults() {
  const family = $("unit-family")?.value || "count";
  const d = POSUnits.familyDefaults(family);
  if ($("unit-rate-suffix") && !$("unit-id").value) $("unit-rate-suffix").value = d.rateSuffix;
  if ($("unit-stock-suffix") && !$("unit-id").value) $("unit-stock-suffix").value = d.stockSuffix;
}

function refreshItemUnitLabels() {
  const u = POSUnits.normalize($("item-unit")?.value);
  if ($("item-retail-lab")) $("item-retail-lab").textContent = POSUnits.rateLabel("Retail", u);
  if ($("item-b2b-lab")) $("item-b2b-lab").textContent = POSUnits.rateLabel("B2B", u);
  if ($("item-purchase-lab")) $("item-purchase-lab").textContent = POSUnits.rateLabel("Purchase", u);
  if ($("item-stock-lab")) $("item-stock-lab").textContent = POSUnits.stockLabel(u);
}

const ORDER_STATUSES = ["confirmed", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["paid", "partial", "unpaid"];

const VIEW_META = {
  dashboard: { title: "Dashboard", subtitle: "Your shop today" },
  counter: { title: "Counter", subtitle: "POS checkout — tap items to add" },
  items: { title: "Items", subtitle: "HSN, unit type, rates, and stock" },
  units: { title: "Unit master", subtitle: "Units used on items — qty, kg, litre, and custom" },
  customers: { title: "Customers", subtitle: "B2C retail and B2B wholesale accounts" },
  packs: { title: "Packs", subtitle: "Pre-defined spice packs and compositions" },
  orders: { title: "Invoices", subtitle: "Tax invoices — search, print, update status" },
  purchases: { title: "Purchases", subtitle: "Supplier bills with GST and thermal print" },
  suppliers: { title: "Suppliers", subtitle: "Vendor contacts, address, and GSTIN" },
  stock: { title: "Stock", subtitle: "Adjustments, transfers, and low-stock alerts" },
  staff: { title: "Staff & roles", subtitle: "Users, roles, and access" },
  branches: { title: "Branches", subtitle: "Shop locations and contact details" },
  devices: { title: "POS devices", subtitle: "Registers and terminal codes" },
  support: { title: "Support", subtitle: "Platform helpline and shop details" },
  accounts: { title: "Accounts", subtitle: "Receivables, payables, GL, and books" },
  expenses: { title: "Expenses", subtitle: "Rent, power, wages, and other shop costs" },
  reports: { title: "Reports", subtitle: "Indian FY 1 Apr–31 Mar — sales, GST, expenses" },
  settings: { title: "Settings", subtitle: "Company profile and branding" },
  backup: { title: "Backup", subtitle: "Download or restore this shop" },
};

function orderStatusClass(status) {
  const s = String(status || "confirmed").toLowerCase();
  if (s === "cancelled") return "cancelled";
  if (s === "delivered") return "delivered";
  return "confirmed";
}

function orderStatusBadge(status) {
  const s = String(status || "confirmed").toLowerCase();
  return `<span class="order-status ${orderStatusClass(s)}">${escapeHtml(s)}</span>`;
}

function payStatusBadge(status) {
  const s = String(status || "paid").toLowerCase();
  return `<span class="pay-status ${escapeHtml(s)}">${escapeHtml(s)}</span>`;
}

function orderStatusLabel(status) {
  const s = String(status || "confirmed").toLowerCase();
  if (s === "cancelled") return "Cancelled";
  if (s === "delivered") return "Delivered";
  return "Confirmed";
}

function paymentStatusLabel(status) {
  const s = String(status || "paid").toLowerCase();
  if (s === "partial") return "Partial";
  if (s === "unpaid") return "Unpaid";
  return "Paid";
}

async function updateOrderStatus(order, patch) {
  const body = {};
  if (patch.status != null) body.status = patch.status;
  if (patch.payment_status != null) body.payment_status = patch.payment_status;
  const data = await api(`/api/orders/${encodeURIComponent(order.id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  const updated = data.order || { ...order, ...body };
  const idx = orderCache.findIndex((row) => row.id === order.id);
  if (idx >= 0) orderCache[idx] = { ...orderCache[idx], ...updated };
  return updated;
}

function renderOrderStatusControls(o) {
  const currentStatus = String(o.status || "confirmed").toLowerCase();
  const currentPay = String(o.payment_status || "paid").toLowerCase();
  const statusBtns = ORDER_STATUSES.map(
    (s) => `<button class="btn order-status-btn ${orderStatusClass(s)}${currentStatus === s ? " is-active" : ""}" type="button" data-set-order-status="${escapeHtml(s)}" data-order-id="${escapeHtml(o.id)}">${escapeHtml(orderStatusLabel(s))}</button>`,
  ).join("");
  const payOpts = PAYMENT_STATUSES.map(
    (s) => `<option value="${s}"${currentPay === s ? " selected" : ""}>${escapeHtml(paymentStatusLabel(s))}</option>`,
  ).join("");
  return `<div class="order-status-controls">
      <div class="order-status-row">
        <span class="order-status-label">Order status</span>
        <div class="order-status-actions">${statusBtns}</div>
      </div>
      <label class="order-pay-status">
        Payment status
        <select id="order-pay-status-select" data-order-id="${escapeHtml(o.id)}">${payOpts}</select>
      </label>
    </div>`;
}

function paymentMethodLabel(method) {
  const m = String(method || "cash").toLowerCase();
  if (m === "upi") return "UPI";
  if (m === "credit") return "Credit";
  if (m === "cash") return "Cash";
  return method || "—";
}

function renderEditOrderBanner() {
  const el = $("edit-order-banner");
  if (!el) return;
  if (!state.editingOrderId) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  const o = orderCache.find((row) => row.id === state.editingOrderId);
  const label = o?.order_number || state.editingOrderId;
  el.hidden = false;
  el.innerHTML = `Editing sales order <strong>${escapeHtml(label)}</strong>
    <button class="btn" type="button" id="btn-cancel-edit">Cancel edit</button>`;
}

function cancelOrderEdit() {
  state.editingOrderId = null;
  state.cart = [];
  state.lastPack = null;
  $("pack-choice").value = "";
  renderEditOrderBanner();
  renderCart();
  setHint("Edit cancelled");
}

function customer() {
  return state.customers.find((c) => c.id === state.customerId) || state.customers[0];
}

function rateFor(item) {
  const type = customer()?.type || "b2c";
  return Number(type === "b2b" ? item.b2b_rate : item.retail_rate);
}

function lineAmt(item, qtyGm) {
  return POSUnits.lineAmount(qtyGm, rateFor(item), itemUnit(item));
}

function packLabel() {
  if (!state.lastPack) return "Pack: Loose items (no pack)";
  const pack = state.packs.find((p) => p.id === state.lastPack.id);
  const name = pack?.name || state.lastPack.name || "Pack";
  return `Pack: ${name} × ${state.lastPack.count || 1}`;
}

async function api(path, options) {
  const { res, data } = await posRequest(path, options);
  if (!res.ok) {
    if (res.status === 401) location.href = "/login.html";
    throw new Error(data.error || res.statusText);
  }
  return data;
}

function orderFromResult(result) {
  if (!result || typeof result !== "object") return null;
  if (result.order && typeof result.order === "object") return result.order;
  if (result.data?.order && typeof result.data.order === "object") return result.data.order;
  if (result.order_number) return result;
  return null;
}

function orderSaved(result) {
  if (!result || typeof result !== "object") return false;
  const order = orderFromResult(result);
  return Boolean(order?.order_number || result.order_number || result.ok === true);
}

function userHintMessage(err) {
  const msg = String(err?.message || err || "Something went wrong");
  if (/cannot read propert|reading 'order_number'|is not defined/i.test(msg)) {
    return "Bill saved. POS cleared — refresh only if totals look wrong.";
  }
  return msg;
}

function orderLabel(order, result) {
  return order?.order_number || result?.order_number || "Saved";
}

function soSortKey(orderNumber) {
  const m = String(orderNumber || "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function sortOrders(rows) {
  return [...rows].sort((a, b) => {
    const diff = soSortKey(b.order_number) - soSortKey(a.order_number);
    if (diff !== 0) return diff;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
}

function orderTotal(order, result) {
  const raw = order?.total ?? result?.total ?? 0;
  return Number(raw) || 0;
}

function clearCounterAfterSale(order, result) {
  state.cart = [];
  state.lastPack = null;
  state.editingOrderId = null;
  state.query = "";
  $("search").value = "";
  $("pack-choice").value = "";
  renderCatalog();
  renderCart();
  setHint(`Order accepted · ${orderLabel(order, result)} · ${money(orderTotal(order, result))}`, "ok");
}

const SHOP_TIMEZONE_OPTIONS = [
  { id: "Asia/Kolkata", label: "India (IST, UTC+5:30)" },
  { id: "Asia/Dubai", label: "UAE (UTC+4)" },
  { id: "Asia/Singapore", label: "Singapore (UTC+8)" },
  { id: "Asia/Colombo", label: "Sri Lanka (UTC+5:30)" },
  { id: "Asia/Kathmandu", label: "Nepal (UTC+5:45)" },
  { id: "UTC", label: "UTC" },
];

function shopTimezone() {
  const tz = state.company?.timezone;
  if (tz && SHOP_TIMEZONE_OPTIONS.some((row) => row.id === tz)) return tz;
  return "Asia/Kolkata";
}

function shopYmd(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: shopTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${day}`;
}

function formatShopDateTime(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-IN", {
    timeZone: shopTimezone(),
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShopDate(value) {
  if (!value) return "";
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(`${s.slice(0, 10)}T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", {
        timeZone: shopTimezone(),
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
  }
  return formatShopDateTime(value);
}

function formatShopTime(d = new Date()) {
  return d.toLocaleTimeString("en-IN", {
    timeZone: shopTimezone(),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function ymd(d = new Date()) {
  return shopYmd(d);
}

const EXPENSE_CATEGORIES = [
  { code: "5102", name: "Rent" },
  { code: "5103", name: "Electricity" },
  { code: "5104", name: "Salaries & wages" },
  { code: "5105", name: "Transport & freight" },
  { code: "5106", name: "Packaging" },
  { code: "5107", name: "Telephone & internet" },
  { code: "5108", name: "Repairs & maintenance" },
  { code: "5199", name: "Miscellaneous" },
];

function indianFinancialYear(ymdStr) {
  const s = String(ymdStr || ymd()).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const year = m ? Number(m[1]) : new Date().getFullYear();
  const month = m ? Number(m[2]) : new Date().getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  return {
    startYear,
    from: `${startYear}-04-01`,
    to: `${endYear}-03-31`,
    label: `FY ${startYear}–${String(endYear).slice(-2)}`,
  };
}

function fyRangeForToday() {
  const today = ymd();
  const fy = indianFinancialYear(today);
  const asOf = today < fy.from ? fy.from : today > fy.to ? fy.to : today;
  return {
    ...fy,
    from: fy.from,
    to: fy.to,
    asOf,
  };
}

function paintFyChip(id, fy) {
  const el = $(id);
  if (el) el.textContent = fy.label;
}

function applyFyRange(fromId, toId, extraId) {
  const range = fyRangeForToday();
  if ($(fromId)) $(fromId).value = range.from;
  if ($(toId)) $(toId).value = range.to;
  if (extraId && $(extraId)) $(extraId).value = range.asOf || ymd();
  return range;
}

function showLogo(img, url) {
  if (!img) return;
  if (url) {
    img.src = url;
    img.hidden = false;
  } else {
    img.removeAttribute("src");
    img.hidden = true;
  }
  if (img.id === "logo-preview" && $("logo-clear")) $("logo-clear").hidden = !url;
}

function paintLogoFileName(name = "") {
  const el = $("logo-file-name");
  if (el) el.textContent = name || "PNG, JPG, or SVG";
}

function excelHref(sheet) {
  const from = $("rep-from")?.value || ymd();
  const to = $("rep-to")?.value || from;
  const q = posUrl(`/api/reports/excel?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  return sheet ? `${q}&sheet=${encodeURIComponent(sheet)}` : q;
}

function fmtCell(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : Number(v).toFixed(2);
  return String(v);
}

function reportDay(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v ?? "");
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

function htmlTable(headers, rows) {
  if (!rows.length) return `<p class="report-empty">No rows in this range</p>`;
  return `<div class="table-wrap"><table><thead><tr>${headers
    .map((h) => `<th>${escapeHtml(h)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr>${row.map((c) => `<td>${escapeHtml(fmtCell(c))}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table></div>`;
}

function gstRateRows(rows, withBills = true) {
  return (rows || []).map((r) => {
    const gst = Number(r.gst) || 0;
    const half = gst / 2;
    const row = [Number(r.gst_rate) || 0, Number(r.taxable) || 0, half, half, gst];
    if (withBills) row.push(Number(r.bills) || 0);
    return row;
  });
}

function reportBlock(title, sheet, headers, rows) {
  return `<section class="report-block">
    <div class="report-block-head">
      <h3>${escapeHtml(title)}</h3>
      <a class="btn" href="${excelHref(sheet)}">Excel</a>
    </div>
    ${htmlTable(headers, rows)}
  </section>`;
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 980px)").matches;
}

function setNavCollapsed(collapsed) {
  const app = document.getElementById("app");
  const btn = $("nav-toggle");
  if (!app) return;
  app.classList.toggle("nav-collapsed", collapsed);
  btn?.setAttribute("aria-expanded", collapsed ? "false" : "true");
  const scrim = $("nav-scrim");
  if (scrim) scrim.hidden = collapsed || !isMobileLayout();
}

function can(module) {
  if (state.session?.role === "business_admin") return true;
  return state.perms?.[module] === true;
}

function applyNav() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    const view = btn.dataset.view;
    const map = {
      dashboard: "dashboard",
      counter: "counter",
      items: "items",
      units: "items",
      customers: "customers",
      packs: "items",
      orders: "orders",
      purchases: "purchases",
      suppliers: "suppliers",
      stock: "stock",
      staff: "staff",
      branches: "branches",
      devices: "devices",
      support: "support",
      accounts: "accounts",
      expenses: "accounts",
      reports: "reports",
      settings: "settings",
      backup: "settings",
    };
    btn.hidden = map[view] ? !can(map[view]) : false;
  });
}

function paintViewHeader(name) {
  const meta = VIEW_META[name] || { title: name, subtitle: "" };
  const titleEl = $("view-title");
  const subEl = $("view-subtitle");
  if (titleEl) titleEl.textContent = meta.title;
  if (subEl) subEl.textContent = meta.subtitle;
  document.getElementById("view-topbar")?.classList.toggle("is-counter", name === "counter");
}

function showView(name) {
  document.querySelectorAll(".view").forEach((el) => {
    el.hidden = el.id !== `view-${name}`;
  });
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === name);
  });
  document.body.classList.toggle("counter-mode", name === "counter");
  document.querySelector(".stage")?.classList.toggle("is-counter", name === "counter");
  paintViewHeader(name);
  if (name === "reports") loadReports();
  if (name === "accounts") loadAccounts();
  if (name === "expenses") loadExpenses();
  if (name === "orders") loadOrders();
  if (name === "purchases") loadPurchases();
  if (name === "suppliers") loadSuppliers();
  if (name === "support") renderSupport();
  if (name === "dashboard") loadDashboard();
  if (name === "counter") loadHolds();
  paintImpersonationControls();
  if (name === "units") renderUnitsTable();
  if (name === "items") {
    fillItemUnitSelect($("item-unit")?.value || "GM");
    refreshItemUnitLabels();
  }
  if (name === "stock") loadStock();
  if (name === "staff") loadStaff();
  if (name === "branches") loadBranches();
  if (name === "devices") loadDevices();
  if (isMobileLayout()) setNavCollapsed(true);
}

function setHint(msg, kind = "") {
  $("hint").textContent = msg || "";
  $("hint").className = `hint ${kind}`.trim();
}

function holdPayload(row) {
  if (row?.payload && typeof row.payload === "object" && !Array.isArray(row.payload)) return row.payload;
  if (row?.payload && Array.isArray(row.payload.cart)) return row.payload;
  const raw = row?.payload_json;
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function renderHeldBills() {
  const el = $("held-bills");
  if (!el) return;
  const list = Array.isArray(state.held) ? state.held : [];
  if (!list.length) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  el.innerHTML =
    `<div class="held-bills-title">Held bills (${list.length})</div>` +
    list
      .map((h) => {
        const payload = holdPayload(h) || {};
        const qty = (payload.cart || []).reduce((n, line) => n + (Number(line.qtyGm) || 0), 0);
        const when = h.created_at ? new Date(h.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "";
        return `<button class="held-item" type="button" data-recall-hold="${escapeHtml(h.id)}">
          <span>${escapeHtml(h.label || "Held bill")}${qty ? ` · ${qty} g` : ""}</span>
          <span class="pack">${escapeHtml(when)}</span>
        </button>`;
      })
      .join("");
}

async function loadHolds() {
  try {
    const rows = await api("/api/holds");
    state.held = Array.isArray(rows) ? rows : [];
  } catch {
    state.held = [];
  }
  renderHeldBills();
}

async function recallHeldBill(id) {
  if (state.editingOrderId) throw new Error("Finish or cancel the invoice edit first");
  if (state.cart.length) throw new Error("Clear or hold the current cart first");
  let row = (state.held || []).find((h) => h.id === id);
  let payload = holdPayload(row);
  if (!payload?.cart) {
    const fresh = await api(`/api/holds/${encodeURIComponent(id)}`);
    payload = holdPayload(fresh);
    row = fresh;
  }
  if (!payload?.cart?.length) throw new Error("Held bill is empty");
  state.cart = payload.cart.map((line) => ({ itemId: line.itemId, qtyGm: Number(line.qtyGm) || 0 })).filter((l) => l.itemId && l.qtyGm > 0);
  if (payload.customerId) state.customerId = payload.customerId;
  state.lastPack = payload.lastPack || null;
  if (payload.customerId) $("customer").value = payload.customerId;
  if (payload.lastPack?.id) $("pack-choice").value = payload.lastPack.id;
  else $("pack-choice").value = "";
  try {
    await api(`/api/holds/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    /* keep the recalled cart even if delete fails */
  }
  state.held = (state.held || []).filter((h) => h.id !== id);
  renderCustomersSelect();
  renderCart();
  setHint(`Recalled ${row?.label || "held bill"}`, "ok");
}

function activeItems() {
  return state.items.filter((i) => i.status !== "inactive");
}

function filteredItems() {
  const q = state.query.trim().toLowerCase();
  const list = activeItems();
  if (!q) return list;
  return list.filter((i) =>
    [i.name, i.hsn, i.local_name, i.code, i.category, i.subcategory].join(" ").toLowerCase().includes(q),
  );
}

function renderCatalog() {
  $("catalog").innerHTML = filteredItems()
    .map((i) => {
      const low = Number(i.stock_gm) <= Number(i.reorder_level_gm);
      return `<button class="card" type="button" data-add="${escapeHtml(i.id)}">
        <div class="sku">${escapeHtml(i.category)} / ${escapeHtml(i.subcategory || "—")}</div>
        <div class="name">${escapeHtml(i.name)} <small>${escapeHtml(i.hsn ? `HSN ${i.hsn}` : "")}</small></div>
        <div class="meta"><span>${escapeHtml(fmtQty(i.stock_gm, i))}</span><span>${money(rateFor(i))}${escapeHtml(POSUnits.rateSuffix(itemUnit(i)))}</span></div>
        <div class="stock ${low ? "low" : "ok"}">${escapeHtml(i.code)} · GST ${escapeHtml(i.gst_rate)}%</div>
      </button>`;
    })
    .join("");
}

function cartTotals() {
  return state.cart.reduce(
    (acc, line) => {
      const item = state.items.find((i) => i.id === line.itemId);
      if (!item) return acc;
      const amount = lineAmt(item, line.qtyGm);
      acc.qty += line.qtyGm;
      acc.taxable += amount;
      acc.tax += (amount * Number(item.gst_rate)) / 100;
      return acc;
    },
    { qty: 0, taxable: 0, tax: 0 },
  );
}

function renderCart() {
  $("chosen-pack").textContent = packLabel();
  if (!state.cart.length) {
    $("lines").innerHTML = `<p class="hint">Tap an item to add it, or choose a pack type.</p>`;
  } else {
    $("lines").innerHTML = state.cart
      .map((line) => {
        const item = state.items.find((i) => i.id === line.itemId);
        if (!item) return "";
        const step = POSUnits.step(itemUnit(item));
        return `<div class="line">
          <div>
            <div class="who">${escapeHtml(item.name)}</div>
            <div class="pack">${escapeHtml(item.category)} / ${escapeHtml(item.subcategory || "—")} · ${escapeHtml(fmtQty(line.qtyGm, item))}</div>
          </div>
          <div>
            <div class="qty">
              <button type="button" data-chg="${escapeHtml(item.id)}" data-d="${-step}">−</button>
              <span>${escapeHtml(fmtQty(line.qtyGm, item))}</span>
              <button type="button" data-chg="${escapeHtml(item.id)}" data-d="${step}">+</button>
            </div>
            <div class="pack" style="text-align:right;margin-top:4px">${money(lineAmt(item, line.qtyGm))}</div>
          </div>
        </div>`;
      })
      .join("");
  }
  const t = cartTotals();
  const families = [...new Set(state.cart.map((l) => POSUnits.typeOf(itemUnit(state.items.find((i) => i.id === l.itemId))).family))];
  $("qty-total").textContent = families.length <= 1 && state.cart.length
    ? fmtQty(t.qty, state.items.find((i) => i.id === state.cart[0].itemId))
    : families.length > 1
      ? `${state.cart.length} lines`
      : "0";
  $("taxable").textContent = money(t.taxable);
  $("tax").textContent = money(t.tax);
  $("total").textContent = money(t.taxable + t.tax);
  $("btn-pay").disabled = state.cart.length === 0;
  $("btn-clear").disabled = state.cart.length === 0;
  if ($("btn-hold")) $("btn-hold").disabled = state.cart.length === 0 || Boolean(state.editingOrderId);
  $("btn-pay").textContent = state.editingOrderId ? "Save changes" : "Save";
  renderHeldBills();
  renderEditOrderBanner();
  if (window.DevMode?.isEnabled()) {
    DevMode.updateContext({ cartLines: state.cart.length });
  }
}

function renderCustomersSelect() {
  $("customer").innerHTML = state.customers
    .map(
      (c) =>
        `<option value="${escapeHtml(c.id)}">${escapeHtml(c.business_name || c.name)} (${escapeHtml(c.type)})</option>`,
    )
    .join("");
  if (state.customerId) $("customer").value = state.customerId;
  else {
    const walk = state.customers.find((c) => c.code === "CUS-001") || state.customers[0];
    state.customerId = walk?.id || "";
    if (state.customerId) $("customer").value = state.customerId;
  }
}

async function saveCustomer(fields) {
  const name = String(fields.name || "").trim();
  const mobile = String(fields.mobile || "").replace(/\s+/g, "").trim();
  if (!name || !mobile) throw new Error("Name and mobile are required");
  const data = await api("/api/customers", {
    method: "POST",
    body: JSON.stringify({
      name,
      mobile,
      business_name: fields.business_name || "",
      type: fields.type === "b2b" ? "b2b" : "b2c",
      gstin: fields.gstin || "",
    }),
  });
  const customer = data.customer;
  if (customer?.id) state.customerId = customer.id;
  await loadBootstrap();
  return customer;
}

function renderPackChoice() {
  const current = $("pack-choice").value;
  $("pack-choice").innerHTML =
    `<option value="">Loose items (no pack)</option>` +
    state.packs
      .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
      .join("");
  if (state.lastPack?.id) $("pack-choice").value = state.lastPack.id;
  else $("pack-choice").value = current || "";
  $("pack-bar").innerHTML = state.packs
    .map((p) => `<button class="btn" type="button" data-pack="${escapeHtml(p.id)}">${escapeHtml(p.name)}</button>`)
    .join("");
}

function addItem(id, qtyGm) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  const add = qtyGm == null ? POSUnits.step(itemUnit(item)) : Number(qtyGm);
  const line = state.cart.find((l) => l.itemId === id);
  if (line) line.qtyGm = Math.max(0, line.qtyGm + add);
  else state.cart.push({ itemId: id, qtyGm: add });
  state.cart = state.cart.filter((l) => l.qtyGm > 0);
  renderCart();
}

function addPack(packId) {
  const pack = state.packs.find((p) => p.id === packId);
  if (!pack) return;
  for (const row of pack.items || []) {
    addItem(row.item_id, Number(row.quantity_gm));
  }
  state.lastPack = {
    id: pack.id,
    name: pack.name,
    count: state.lastPack?.id === pack.id ? (state.lastPack.count || 0) + 1 : 1,
  };
  $("pack-choice").value = pack.id;
  setHint(`Pack type: ${pack.name}`, "ok");
  renderCart();
}

function fillDatalists() {
  const cats = [...new Set(state.items.map((i) => i.category).filter(Boolean))];
  const subs = [...new Set(state.items.map((i) => i.subcategory).filter(Boolean))];
  $("category-list").innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}">`).join("");
  $("subcategory-list").innerHTML = subs.map((c) => `<option value="${escapeHtml(c)}">`).join("");
}

function renderItemsTable() {
  $("items-table").innerHTML = `<table><thead><tr>
      <th>Code</th><th>Item</th><th>HSN</th><th>Unit</th><th>Category</th><th>Subcategory</th><th>Retail</th><th>B2B</th><th>Stock</th><th></th>
  </tr></thead><tbody>${state.items
    .map(
      (i) => `<tr>
      <td>${escapeHtml(i.code)}</td>
      <td>${escapeHtml(i.name)}</td>
      <td>${escapeHtml(i.hsn || "—")}</td>
      <td>${escapeHtml(itemUnit(i))}</td>
      <td>${escapeHtml(i.category)}</td>
      <td>${escapeHtml(i.subcategory || "—")}</td>
      <td>${money(i.retail_rate)}${escapeHtml(POSUnits.rateSuffix(itemUnit(i)))}</td>
      <td>${money(i.b2b_rate)}${escapeHtml(POSUnits.rateSuffix(itemUnit(i)))}</td>
      <td class="${Number(i.stock_gm) <= Number(i.reorder_level_gm) ? "stock low" : "stock ok"}">${escapeHtml(fmtQty(i.stock_gm, i))}</td>
      <td><button class="btn" data-edit-item="${escapeHtml(i.id)}" type="button">Edit</button>
          <button class="btn" data-recv="${escapeHtml(i.id)}" type="button">${escapeHtml(POSUnits.receiveLabel(itemUnit(i)))}</button></td>
    </tr>`,
    )
    .join("")}</tbody></table>`;
}

function renderCustomersTable() {
  $("customers-table").innerHTML = `<table><thead><tr>
    <th>Code</th><th>Name</th><th>Type</th><th>Mobile</th><th>GSTIN</th><th>Outstanding</th>
  </tr></thead><tbody>${state.customers
    .map(
      (c) => `<tr>
      <td>${escapeHtml(c.code)}</td>
      <td>${escapeHtml(c.business_name || c.name)}</td>
      <td>${escapeHtml(c.type)}</td>
      <td>${escapeHtml(c.mobile)}</td>
      <td>${escapeHtml(c.gstin || "—")}</td>
      <td>${money(c.outstanding)}</td>
    </tr>`,
    )
    .join("")}</tbody></table>`;
}

function renderPackCompose() {
  $("pack-lines").innerHTML = activeItems()
    .map(
      (i) => `<label>
        <input type="checkbox" data-pack-item="${escapeHtml(i.id)}" />
        ${escapeHtml(i.name)} (${escapeHtml(i.subcategory || i.category)})
        <input type="number" min="0" step="${POSUnits.step(itemUnit(i))}" value="${POSUnits.isCount(itemUnit(i)) ? 1 : 500}" data-pack-qty="${escapeHtml(i.id)}" /> ${escapeHtml(POSUnits.isCount(itemUnit(i)) ? "pcs" : POSUnits.typeOf(itemUnit(i)).family === "volume" ? "ml" : "g")}
      </label>`,
    )
    .join("");
}

function poUnitLabel(item) {
  const unit = itemUnit(item);
  if (POSUnits.isCount(unit)) return "pcs";
  if (POSUnits.typeOf(unit).family === "volume") return "ml";
  return "g";
}

function renderPoLines() {
  const el = $("po-lines");
  if (!el) return;
  if ($("po-date") && !$("po-date").value) $("po-date").value = ymd();
  const items = activeItems();
  if (!items.length) {
    el.innerHTML = '<p class="hint">No items in the catalog yet.</p>';
    paintPoTotals();
    return;
  }
  el.innerHTML = `<div class="po-table-wrap"><table class="po-table"><thead><tr>
    <th class="po-check"></th><th>Item</th><th>HSN</th><th>Qty</th><th>Unit</th><th>Rate</th><th class="num">Amount</th>
  </tr></thead><tbody>${items
    .map((i) => {
      const unit = itemUnit(i);
      const qty = POSUnits.isCount(unit) ? 1 : 1000;
      const search = [i.name, i.hsn, i.code, i.category, i.subcategory].join(" ").toLowerCase();
      return `<tr data-po-row="${escapeHtml(i.id)}" data-po-search="${escapeHtml(search)}" data-po-unit="${escapeHtml(unit)}">
        <td class="po-check"><input type="checkbox" data-po-item="${escapeHtml(i.id)}" /></td>
        <td class="po-name">${escapeHtml(i.name)}</td>
        <td class="po-hsn">${escapeHtml(i.hsn || "—")}</td>
        <td><input type="number" min="0" step="${POSUnits.step(unit)}" value="${qty}" data-po-qty="${escapeHtml(i.id)}" /></td>
        <td class="po-unit">${escapeHtml(poUnitLabel(i))}</td>
        <td><div class="po-rate-cell"><input type="number" min="0" step="0.01" value="${escapeHtml(i.purchase_rate)}" data-po-rate="${escapeHtml(i.id)}" /><span class="po-suffix">₹${escapeHtml(POSUnits.rateSuffix(unit))}</span></div></td>
        <td class="num" data-po-amt="${escapeHtml(i.id)}">${money(POSUnits.lineAmount(qty, i.purchase_rate, unit))}</td>
      </tr>`;
    })
    .join("")}</tbody></table></div>`;
  filterPoLines();
  paintPoTotals();
}

function filterPoLines() {
  const q = ($("po-item-search")?.value || "").trim().toLowerCase();
  document.querySelectorAll("#po-lines tbody tr").forEach((tr) => {
    const hay = tr.dataset.poSearch || "";
    tr.hidden = Boolean(q) && !hay.includes(q);
  });
}

function paintPoLineAmount(itemId) {
  const qty = Number(document.querySelector(`[data-po-qty="${itemId}"]`)?.value) || 0;
  const rate = Number(document.querySelector(`[data-po-rate="${itemId}"]`)?.value) || 0;
  const unit = document.querySelector(`[data-po-row="${itemId}"]`)?.dataset.poUnit || "GM";
  const cell = document.querySelector(`[data-po-amt="${itemId}"]`);
  if (cell) cell.textContent = money(POSUnits.lineAmount(qty, rate, unit));
}

function paintPoTotals() {
  const checked = [...document.querySelectorAll("[data-po-item]:checked")];
  let total = 0;
  checked.forEach((box) => {
    const id = box.dataset.poItem;
    const qty = Number(document.querySelector(`[data-po-qty="${id}"]`)?.value) || 0;
    const rate = Number(document.querySelector(`[data-po-rate="${id}"]`)?.value) || 0;
    const unit = document.querySelector(`[data-po-row="${id}"]`)?.dataset.poUnit || "GM";
    total += POSUnits.lineAmount(qty, rate, unit);
    box.closest("tr")?.classList.add("is-checked");
  });
  document.querySelectorAll("#po-lines tbody tr").forEach((tr) => {
    if (!tr.querySelector("[data-po-item]:checked")) tr.classList.remove("is-checked");
  });
  if ($("po-selected-meta")) $("po-selected-meta").textContent = `${checked.length} selected`;
  if ($("po-total")) $("po-total").textContent = money(total);
}

function renderPacksTable() {
  $("packs-table").innerHTML = state.packs
    .map(
      (p) => `<div class="report-card" style="margin:0 20px 12px">
        <strong>${escapeHtml(p.name)}</strong>
        <span>${escapeHtml(p.code)} · ${escapeHtml(kg(p.total_quantity_gm))}</span>
        <p class="hint">${(p.items || [])
          .map((i) => {
            const it = state.items.find((x) => x.id === i.item_id);
            return `${escapeHtml(i.spice_name)} ${escapeHtml(fmtQty(i.quantity_gm, it || i))}`;
          })
          .join(" · ")}</p>
      </div>`,
    )
    .join("");
}

function renderSettings() {
  $("set-name").value = state.company.name || "";
  $("set-address").value = state.company.address || "";
  $("set-phone").value = state.company.phone || "";
  $("set-email").value = state.company.email || "";
  $("set-gstin").value = state.company.gstin || "";
  if ($("set-timezone")) $("set-timezone").value = shopTimezone();
  paintTimezonePreview();
  state.logoDraft = null;
  $("set-logo").value = "";
  paintLogoFileName();
  showLogo($("logo-preview"), state.company.logo_url);
  if ($("btn-backup-download")) $("btn-backup-download").href = posUrl("/api/backup");
  if (window.DevMode) {
    const section = $("dev-settings-section");
    if (section) section.hidden = !DevMode.canUse(state.session);
    DevMode.updateContext({
      session: state.session,
      business: state.businessMeta,
      plan: state.plan,
      timezone: shopTimezone(),
      cartLines: state.cart.length,
    });
  }
}

function paintTimezonePreview() {
  const el = $("timezone-preview");
  if (!el) return;
  const tz = $("set-timezone")?.value || shopTimezone();
  const now = new Date();
  const label = SHOP_TIMEZONE_OPTIONS.find((row) => row.id === tz)?.label || tz;
  const time = now.toLocaleString("en-IN", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  el.textContent = `${label} · now ${time}`;
}

function telHref(phone) {
  return `tel:${String(phone || "").replaceAll(/[^\d+]/g, "")}`;
}

function paintPlatformSupport() {
  const phone = state.support?.support_phone;
  const el = $("session-support");
  if (!el) return;
  if (phone) {
    el.hidden = false;
    el.innerHTML = `Support <a href="${telHref(phone)}">${escapeHtml(phone)}</a>`;
  } else {
    el.hidden = true;
    el.textContent = "";
  }
}

function renderSupport() {
  const phone = state.support?.support_phone;
  const email = state.support?.support_email;
  const cards = [
    [
      "Platform support",
      phone
        ? `<a href="${telHref(phone)}">${escapeHtml(phone)}</a>`
        : "Not set yet by Master Admin",
    ],
    ["Support email", email || "—"],
    ["Shop", escapeHtml(state.company.name)],
    ["Address", escapeHtml(state.company.address || "—")],
    ["Shop phone", escapeHtml(state.company.phone || "—")],
    ["Shop email", escapeHtml(state.company.email || "—")],
    ["GSTIN", escapeHtml(state.company.gstin || "—")],
  ];
  $("support-cards").innerHTML = cards
    .map(([k, v]) => `<div class="report-card"><span>${k}</span><strong>${v}</strong></div>`)
    .join("");
}

function paintHeader() {
  $("shop-name").textContent = state.company.name || "SWAMI MASALE";
  $("shop-place").textContent = state.company.address || "";
  showLogo($("shop-logo"), state.company.logo_url);
  const mark = $("brand-mark");
  if (mark) mark.hidden = Boolean(state.company.logo_url);
}

async function loadBootstrap() {
  const data = await api("/api/bootstrap");
  state.company = data.company;
  state.support = data.support || {};
  state.plan = data.plan || null;
  state.items = data.items;
  applyUnitMaster(data.units || []);
  state.customers = data.customers;
  state.packs = data.packs;
  paintPlatformNotices(data.notes);
  paintHeader();
  paintPlatformSupport();
  renderCustomersSelect();
  renderCatalog();
  renderCart();
  renderPackChoice();
  fillDatalists();
  renderItemsTable();
  renderUnitsTable();
  renderCustomersTable();
  renderPackCompose();
  renderPacksTable();
  renderSettings();
  renderPoLines();
  fillExpenseCategories();
  void Promise.all([loadToday(), loadDashboard(), loadSuppliers().catch(() => {}), loadHolds().catch(() => {})]);
}

async function loadDashboard() {
  try {
    const d = await api("/api/dashboard");
    $("dash-welcome").textContent = `${state.session?.name || ""} · ${state.session?.role || ""} · ${state.company.name || ""}`;
    paintPlatformNotices(d.notes);
    $("dash-kpis").innerHTML = [
      ["Today's sales", money(d.today?.takings)],
      ["Today's bills", d.today?.bills],
      ["Today's purchase", money(d.purchase)],
      ["Stock value", money(d.stockValue)],
      ["Customer outstanding", money(d.outstanding)],
      ["Plan", state.plan?.name || state.plan?.code || "—"],
      ["Subscription fee / month", money(state.plan?.fee_monthly)],
    ]
      .map(([k, v]) => `<div class="report-card"><span>${k}</span><strong>${v}</strong></div>`)
      .join("");
  } catch (err) {
    $("dash-kpis").innerHTML = `<p class="hint error">${escapeHtml(err.message)}</p>`;
  }
}

async function loadStock() {
  const rows = await api("/api/stock");
  $("stock-table").innerHTML = `<table><thead><tr><th>Code</th><th>Item</th><th>Unit</th><th>Stock</th><th>Reorder</th><th>Value</th></tr></thead><tbody>${rows
    .map((r) => {
      const item = state.items.find((i) => i.id === r.id) || r;
      return `<tr><td>${escapeHtml(r.code)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(itemUnit(item))}</td><td>${escapeHtml(fmtQty(r.stock_gm, item))}</td><td>${escapeHtml(fmtQty(r.reorder_level_gm, item))}</td><td>${money(POSUnits.lineAmount(r.stock_gm, r.purchase_rate, itemUnit(item)))}</td></tr>`;
    })
    .join("")}</tbody></table>`;
}

async function loadStaff() {
  const rows = await api("/api/staff");
  $("staff-table").innerHTML = `<table><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th></tr></thead><tbody>${rows
    .map((u) => `<tr><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.first_name)} ${escapeHtml(u.last_name)}</td><td>${escapeHtml(u.role)}</td><td>${escapeHtml(u.status)}</td></tr>`)
    .join("")}</tbody></table>`;
}

async function loadBranches() {
  const rows = await api("/api/branches");
  $("branch-table").innerHTML = `<table><thead><tr><th>Name</th><th>Address</th><th>Status</th></tr></thead><tbody>${rows
    .map((b) => `<tr><td>${escapeHtml(b.name)}</td><td>${escapeHtml(b.address)}</td><td>${escapeHtml(b.status)}</td></tr>`)
    .join("")}</tbody></table>`;
}

async function loadDevices() {
  const rows = await api("/api/devices");
  $("device-table").innerHTML = `<table><thead><tr><th>Name</th><th>Code</th><th>Branch</th><th>Status</th></tr></thead><tbody>${rows
    .map((d) => `<tr><td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.code)}</td><td>${escapeHtml(d.branch_name)}</td><td>${escapeHtml(d.status)}</td></tr>`)
    .join("")}</tbody></table>`;
}

async function loadToday() {
  const data = await api("/api/today");
  const total = money(data.today.takings);
  const count = String(data.today.bills);
  if ($("topbar-total")) $("topbar-total").textContent = total;
  if ($("topbar-count")) $("topbar-count").textContent = count;
}

async function loadReports() {
  if (!$("rep-from").value || !$("rep-to").value) applyFyRange("rep-from", "rep-to");
  paintFyChip("rep-fy-label", indianFinancialYear($("rep-from").value || ymd()));
  const from = $("rep-from").value;
  const to = $("rep-to").value;
  $("rep-excel-all").href = excelHref();
  $("reports-hint").textContent = "Loading…";
  try {
    const data = await api(`/api/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    const s = data.summary || {};
    $("report-summary").innerHTML = [
      ["Range", `${data.from} → ${data.to}`],
      ["Financial year", indianFinancialYear(data.from).label],
      ["Bills", s.bills ?? 0],
      ["Taxable", money(s.taxable)],
      ["Output GST", money(s.gst)],
      ["Input GST", money(s.inputGst)],
      ["Net GST", money(s.netGst)],
      ["Takings", money(s.takings)],
      ["Expenses", money(s.expenses)],
      ["Low stock SKUs", (data.low || []).length],
    ]
      .map(([k, v]) => `<div class="report-card"><span>${k}</span><strong>${v}</strong></div>`)
      .join("");
    $("reports").innerHTML = [
      reportBlock("Sales bills", "Sales bills", ["Order", "Customer", "Type", "Pack", "Pack count", "Status", "Qty g", "Taxable", "GST", "Total", "Pay", "Pay status", "Date"], (data.sales || []).map((o) => [o.order_number, o.customer_name, o.customer_type, o.pack_name || "Loose items", Number(o.pack_count) || 0, o.status, Number(o.total_quantity_gm) || 0, Number(o.subtotal) || 0, Number(o.gst) || 0, Number(o.total) || 0, o.payment_method, o.payment_status, formatShopDateTime(o.created_at)])),
      reportBlock("Item sales", "Item sales", ["Item", "Qty g", "Amount", "GST"], (data.byItem || []).map((r) => [r.item_name, Number(r.quantity_gm) || 0, Number(r.amount) || 0, Number(r.gst) || 0])),
      reportBlock("Customer sales", "Customer sales", ["Customer", "Type", "Bills", "Takings", "GST"], (data.byCustomer || []).map((r) => [r.customer_name, r.customer_type, Number(r.bills) || 0, Number(r.takings) || 0, Number(r.gst) || 0])),
      reportBlock("Pack sales", "Pack sales", ["Pack type", "Pack count", "Bills", "Takings"], (data.byPack || []).map((r) => [r.pack_type, Number(r.pack_count) || 0, Number(r.bills) || 0, Number(r.takings) || 0])),
      reportBlock("Payment", "Payment", ["Method", "Bills", "Takings"], (data.byPay || []).map((r) => [r.payment_method, Number(r.bills) || 0, Number(r.takings) || 0])),
      reportBlock("Payment daywise", "Payment daywise", ["Day", "Cash", "UPI", "Card", "Credit", "Other", "Bills", "Total"], (data.payDaywise || []).map((r) => [reportDay(r.day), Number(r.cash) || 0, Number(r.upi) || 0, Number(r.card) || 0, Number(r.credit) || 0, Number(r.other) || 0, Number(r.bills) || 0, Number(r.total) || 0])),
      reportBlock("GST daywise", "GST daywise", ["Day", "Taxable", "GST", "Total"], (data.gst || []).map((r) => [reportDay(r.day), Number(r.taxable) || 0, Number(r.gst) || 0, Number(r.total) || 0])),
      reportBlock("GST output by rate", "GST output by rate", ["GST %", "Taxable", "CGST", "SGST", "Total GST", "Bills"], gstRateRows(data.gstByRate)),
      reportBlock("GST input by rate", "GST input by rate", ["GST %", "Taxable", "CGST", "SGST", "Total GST"], gstRateRows(data.gstInputByRate, false)),
      reportBlock("GST HSN itemwise", "GST HSN itemwise", ["HSN/SKU", "Item", "GST %", "Qty g", "Taxable", "GST"], (data.gstHsn || []).map((r) => [r.hsn, r.item_name, Number(r.gst_rate) || 0, Number(r.quantity_gm) || 0, Number(r.taxable) || 0, Number(r.gst) || 0])),
      reportBlock("GST B2B sales", "GST B2B sales", ["Bill", "Date", "Customer", "GSTIN", "Taxable", "GST", "Total"], (data.gstB2B || []).map((r) => [r.order_number, reportDay(r.bill_date), r.customer_name, r.gstin, Number(r.taxable) || 0, Number(r.gst) || 0, Number(r.total) || 0])),
      reportBlock("GST B2C sales", "GST B2C sales", ["Bill", "Date", "Customer", "Taxable", "GST", "Total"], (data.gstB2C || []).map((r) => [r.order_number, reportDay(r.bill_date), r.customer_name, Number(r.taxable) || 0, Number(r.gst) || 0, Number(r.total) || 0])),
      reportBlock("Stock", "Stock", ["Code", "Name", "HSN", "Category", "Subcategory", "Stock g", "Reorder g", "Retail", "B2B", "Purchase", "GST %"], (data.stock || []).map((i) => [i.code, i.name, i.hsn, i.category, i.subcategory, Number(i.stock_gm) || 0, Number(i.reorder_level_gm) || 0, Number(i.retail_rate) || 0, Number(i.b2b_rate) || 0, Number(i.purchase_rate) || 0, Number(i.gst_rate) || 0])),
      reportBlock("Low stock", "Low stock", ["Code", "Name", "Stock g", "Reorder g"], (data.low || []).map((i) => [i.code, i.name, Number(i.stock_gm) || 0, Number(i.reorder_level_gm) || 0])),
      reportBlock("Purchases", "Purchases", ["PO", "Supplier", "Invoice", "Date", "Taxable", "GST", "Total", "Pay", "Status"], (data.purchases || []).map((p) => [p.purchase_number, p.supplier_name, p.supplier_invoice_number, p.purchase_date, Number(p.subtotal) || 0, Number(p.gst) || 0, Number(p.total) || 0, p.payment_method, p.payment_status])),
      reportBlock("Expenses", "Expenses", ["No.", "Date", "Category", "Amount", "GST", "Total", "Pay", "Notes"], (data.expenses || []).map((e) => [e.expense_number, e.expense_date, e.category, Number(e.amount) || 0, Number(e.gst) || 0, Number(e.total) || (Number(e.amount) || 0) + (Number(e.gst) || 0), e.payment_method, e.notes])),
      reportBlock("Customers", "Customers", ["Code", "Name", "Business", "Mobile", "Type", "GSTIN", "Credit limit", "Outstanding"], (data.customers || []).map((c) => [c.code, c.name, c.business_name, c.mobile, c.type, c.gstin, Number(c.credit_limit) || 0, Number(c.outstanding) || 0])),
    ].join("");
    $("reports-hint").textContent = "";
    $("reports-hint").className = "hint";
  } catch (err) {
    $("reports-hint").textContent = err.message;
    $("reports-hint").className = "hint error";
  }
}

let orderCache = [];
let selectedOrderId = null;
const orderFilter = { q: "", status: "", payment: "" };

function filterOrders(rows) {
  const q = orderFilter.q.trim().toLowerCase();
  return rows.filter((o) => {
    if (orderFilter.status && String(o.status || "").toLowerCase() !== orderFilter.status) return false;
    if (orderFilter.payment && String(o.payment_status || "").toLowerCase() !== orderFilter.payment) return false;
    if (!q) return true;
    const hay = [o.order_number, o.customer_name, o.payment_method].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function renderOrdersSummary(filteredCount, totalCount) {
  const el = $("orders-summary");
  if (!el) return;
  if (!totalCount) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent =
    filteredCount === totalCount
      ? `${totalCount} invoice${totalCount === 1 ? "" : "s"}`
      : `${filteredCount} of ${totalCount} invoice${totalCount === 1 ? "" : "s"}`;
}

function invoiceCtx() {
  return {
    company: state.company,
    customers: state.customers,
    suppliers: state.suppliers,
    items: state.items,
    formatDateTime: formatShopDateTime,
    formatDate: formatShopDate,
    money,
    escapeHtml,
  };
}

function printOrder(o) {
  const w = window.open("", "invoice-print", "width=400,height=720");
  if (!w) {
    setHint("Allow pop-ups to print invoices", "error");
    return;
  }
  w.document.write(InvoicePrint.thermalInvoiceDocument(o, invoiceCtx()));
  w.document.close();
}

function printPurchase(p) {
  const w = window.open("", "purchase-print", "width=400,height=720");
  if (!w) {
    setHint("Allow pop-ups to print purchase bills", "error");
    return;
  }
  w.document.write(InvoicePrint.thermalPurchaseDocument(p, invoiceCtx()));
  w.document.close();
}

function showOrder(o) {
  selectedOrderId = o.id;
  document.querySelectorAll("#orders .order-row").forEach((row) => {
    row.classList.toggle("is-selected", row.dataset.oid === o.id);
  });
  const cancelled = String(o.status || "").toLowerCase() === "cancelled";
  const lineCount = (o.lines || []).length;
  $("order-pane").innerHTML = `<div class="invoice-detail-card">
      <div class="invoice-detail-top">
        <div>
          <h3 class="invoice-so">${escapeHtml(o.order_number || "—")}</h3>
          <p class="hint">${escapeHtml(o.customer_name || "Walk-in")}</p>
          <p class="hint">${escapeHtml(formatShopDateTime(o.created_at))}</p>
        </div>
        <div class="invoice-detail-meta">
          <div class="invoice-total">${money(o.total)}</div>
          <div class="order-badges">${orderStatusBadge(o.status)} ${payStatusBadge(o.payment_status)}</div>
          <span class="pay-method-chip">${escapeHtml(paymentMethodLabel(o.payment_method))}</span>
        </div>
      </div>
      ${renderOrderStatusControls(o)}
      ${lineCount ? "" : '<p class="hint error">Line items missing — refresh or re-upload pos-php-till.php</p>'}
    </div>
    <div class="thermal-preview">${InvoicePrint.invoiceBody(o, invoiceCtx())}</div>
    <div class="print-actions">
      <button class="btn primary" type="button" data-print="${escapeHtml(o.id)}">Print invoice</button>
      <button class="btn" type="button" data-edit-order="${escapeHtml(o.id)}"${cancelled ? " disabled title=\"Restore order status before editing items\"" : ""}>Change items</button>
    </div>`;
}

function renderOrdersList() {
  const filtered = filterOrders(orderCache);
  renderOrdersSummary(filtered.length, orderCache.length);
  if (!orderCache.length) {
    $("orders").innerHTML = '<p class="hint">No invoices yet. Save a bill from the Counter.</p>';
    selectedOrderId = null;
    $("order-pane").innerHTML = '<p class="hint">Select an invoice.</p>';
    return;
  }
  if (!filtered.length) {
    $("orders").innerHTML = '<p class="hint">No invoices match your filters. Clear search or change filters.</p>';
    $("order-pane").innerHTML = '<p class="hint">Select an invoice.</p>';
    return;
  }
  if (!filtered.some((o) => o.id === selectedOrderId)) selectedOrderId = filtered[0].id;
  $("orders").innerHTML = `<table class="orders-table">
    <thead>
      <tr>
        <th>SO No</th>
        <th>Date</th>
        <th>Customer</th>
        <th>Status</th>
        <th>Pay</th>
        <th>Method</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>${filtered
      .map(
        (o) => `<tr class="order-row${o.id === selectedOrderId ? " is-selected" : ""}" data-oid="${escapeHtml(o.id)}" tabindex="0" role="button">
        <td class="so-no"><strong>${escapeHtml(o.order_number || "—")}</strong></td>
        <td>${escapeHtml(formatShopDateTime(o.created_at))}</td>
        <td>${escapeHtml(o.customer_name || "—")}</td>
        <td>${orderStatusBadge(o.status)}</td>
        <td>${payStatusBadge(o.payment_status)}</td>
        <td>${escapeHtml(paymentMethodLabel(o.payment_method))}</td>
        <td class="num">${money(o.total)}</td>
      </tr>`,
      )
      .join("")}</tbody>
  </table>`;
  const current = filtered.find((o) => o.id === selectedOrderId) || filtered[0];
  showOrder(current);
}

async function loadOrders() {
  orderCache = sortOrders(await api("/api/orders"));
  renderOrdersList();
}

let purchaseCache = [];
let selectedPurchaseId = null;

function showPurchase(p) {
  selectedPurchaseId = p.id;
  document.querySelectorAll("#purchases-list .order-item").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.pid === p.id);
  });
  const lineCount = (p.lines || []).length;
  $("purchase-pane").innerHTML = `<div class="order-detail-head">
      <div class="order-badges">${payStatusBadge(p.payment_status)}</div>
      <p class="hint">${escapeHtml(p.purchase_number)} · ${escapeHtml(p.supplier_name)} · ${escapeHtml(formatShopDate(p.purchase_date))}</p>
      ${lineCount ? "" : '<p class="hint error">Line items missing — refresh or re-upload pos-php-till.php</p>'}
    </div>
    <div class="thermal-preview">${InvoicePrint.purchaseBody(p, invoiceCtx())}</div>
    <div class="print-actions">
      <button class="btn primary" type="button" data-print-purchase="${escapeHtml(p.id)}">Print purchase bill</button>
    </div>`;
}

async function loadPurchases() {
  if (!state.suppliers?.length) await loadSuppliers();
  purchaseCache = await api("/api/purchases");
  $("purchases-list").innerHTML = purchaseCache.length
    ? purchaseCache
        .map(
          (p) => `<button class="order-item${p.id === selectedPurchaseId ? " is-selected" : ""}" type="button" data-pid="${escapeHtml(p.id)}">
        <span>${escapeHtml(p.purchase_number)} · ${escapeHtml(p.supplier_name)}
        <span class="order-item-badges">${payStatusBadge(p.payment_status)}</span><br>
        <small>${escapeHtml(p.supplier_invoice_number ? `Bill: ${p.supplier_invoice_number}` : "No supplier bill")} · ${escapeHtml(p.payment_method)} · ${escapeHtml(formatShopDate(p.purchase_date))}</small></span>
        <span>${money(p.total)}</span>
      </button>`,
        )
        .join("")
    : '<p class="hint">No purchases yet. Use <strong>New purchase</strong> above.</p>';
  if (purchaseCache.length) {
    const current = purchaseCache.find((p) => p.id === selectedPurchaseId) || purchaseCache[0];
    showPurchase(current);
  } else {
    selectedPurchaseId = null;
    $("purchase-pane").innerHTML = '<p class="hint">Select a purchase bill.</p>';
  }
}

async function loadSuppliers() {
  const rows = await api("/api/suppliers");
  state.suppliers = rows;
  $("po-supplier").innerHTML = rows
    .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)
    .join("");
  $("suppliers-table").innerHTML = `<table class="suppliers-table"><thead><tr>
    <th>Code</th><th>Name</th><th>Contact</th><th>Mobile</th><th>Email</th><th>Address</th><th>GSTIN</th><th>Payable</th>
  </tr></thead><tbody>${rows
    .map(
      (s) => `<tr>
      <td>${escapeHtml(s.code)}</td>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.contact_name || "—")}</td>
      <td>${escapeHtml(s.mobile || "—")}</td>
      <td>${escapeHtml(s.email || "—")}</td>
      <td title="${escapeHtml(s.address || "")}">${escapeHtml(s.address || "—")}</td>
      <td>${escapeHtml(s.gstin || "—")}</td>
      <td>${money(Number(s.payable_balance) || 0)}</td>
    </tr>`,
    )
    .join("")}</tbody></table>`;
}

let accTab = "receivables";

function accPeriod() {
  if (!$("acc-from")?.value || !$("acc-to")?.value) applyFyRange("acc-from", "acc-to", "acc-asof");
  if (!$("acc-asof")?.value) $("acc-asof").value = $("acc-to").value;
  paintFyChip("acc-fy-label", indianFinancialYear($("acc-from").value || ymd()));
  return { from: $("acc-from").value, to: $("acc-to").value, asOf: $("acc-asof").value };
}

function setAccTab(name) {
  accTab = name;
  document.querySelectorAll("[data-acc-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.accTab === name);
  });
  document.querySelectorAll(".acc-pane").forEach((pane) => {
    pane.hidden = pane.id !== `acc-pane-${name}`;
  });
  loadAccountsTab(name);
}

async function loadAccountsTab(name) {
  const { from, to, asOf } = accPeriod();
  if (name === "ledger") {
    const rows = await api(`/api/accounts/ledger?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    $("acc-ledger-table").innerHTML = `<table><thead><tr>
      <th>Entry</th><th>Type</th><th>Party</th><th>Amount</th><th>Method</th><th>Reference</th><th>Notes</th><th>Date</th>
    </tr></thead><tbody>${rows.map((r) => `<tr>
      <td>${escapeHtml(r.entry_no)}</td><td>${escapeHtml(r.entry_type)}</td><td>${escapeHtml(r.party_name || "—")}</td>
      <td>${money(Number(r.amount) || 0)}</td><td>${escapeHtml(r.payment_method || "—")}</td>
      <td>${escapeHtml(r.reference_type || "—")}</td><td>${escapeHtml(r.notes || "—")}</td>
      <td>${escapeHtml(formatShopDateTime(r.created_at))}</td></tr>`).join("")}</tbody></table>`;
  }
  if (name === "coa") {
    const rows = await api("/api/accounts/coa");
    $("acc-coa-table").innerHTML = `<table><thead><tr><th>Code</th><th>Name</th><th>Group</th></tr></thead><tbody>${rows
      .map((r) => `<tr><td>${escapeHtml(r.code)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.account_group)}</td></tr>`)
      .join("")}</tbody></table>`;
  }
  if (name === "journal") {
    const rows = await api(`/api/accounts/journal?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    $("acc-journal-table").innerHTML = `<table><thead><tr><th>Voucher</th><th>Date</th><th>Type</th><th>Narration</th><th>Lines</th></tr></thead><tbody>${rows
      .map((r) => `<tr><td>${escapeHtml(r.voucher_no)}</td><td>${escapeHtml(r.voucher_date)}</td><td>${escapeHtml(r.voucher_type)}</td><td>${escapeHtml(r.narration || "—")}</td><td>${escapeHtml(r.lines || "—")}</td></tr>`)
      .join("")}</tbody></table>`;
  }
  if (name === "trial-balance") {
    const data = await api(`/api/accounts/trial-balance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    $("acc-tb-table").innerHTML = `<table><thead><tr><th>Code</th><th>Account</th><th>Group</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>${data.rows
      .map((r) => `<tr><td>${escapeHtml(r.code)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.account_group)}</td><td>${money(r.debit)}</td><td>${money(r.credit)}</td><td>${money(r.balance)}</td></tr>`)
      .join("")}<tr><td colspan="3"><strong>Totals</strong></td><td><strong>${money(data.totalDebit)}</strong></td><td><strong>${money(data.totalCredit)}</strong></td><td></td></tr></tbody></table>`;
  }
  if (name === "profit-loss") {
    const data = await api(`/api/accounts/profit-loss?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    $("acc-pl-table").innerHTML = `<div class="report-grid">
      <div class="report-card"><span>Income</span><strong>${money(data.income)}</strong></div>
      <div class="report-card"><span>Expense</span><strong>${money(data.expense)}</strong></div>
      <div class="report-card"><span>Net profit</span><strong>${money(data.netProfit)}</strong></div>
    </div><table><thead><tr><th colspan="2">Income</th></tr></thead><tbody>${(data.incomeRows || [])
      .map((r) => `<tr><td>${escapeHtml(r.code)} ${escapeHtml(r.name)}</td><td>${money(r.amount)}</td></tr>`)
      .join("")}</tbody><thead><tr><th colspan="2">Expenses</th></tr></thead><tbody>${(data.expenseRows || [])
      .map((r) => `<tr><td>${escapeHtml(r.code)} ${escapeHtml(r.name)}</td><td>${money(r.amount)}</td></tr>`)
      .join("")}</tbody></table>`;
  }
  if (name === "balance-sheet") {
    const data = await api(`/api/accounts/balance-sheet?asOf=${encodeURIComponent(asOf)}`);
    const groupTable = (title, rows) => `<h3>${title}</h3><table><tbody>${(rows || [])
      .map((r) => `<tr><td>${escapeHtml(r.code)} ${escapeHtml(r.name)}</td><td>${money(r.balance)}</td></tr>`)
      .join("")}</tbody></table>`;
    $("acc-bs-table").innerHTML = `<div class="report-grid">
      <div class="report-card"><span>Assets</span><strong>${money(data.assets)}</strong></div>
      <div class="report-card"><span>Liabilities</span><strong>${money(data.liabilities)}</strong></div>
      <div class="report-card"><span>Equity (+ P&amp;L)</span><strong>${money(data.equity)}</strong></div>
    </div>${groupTable("Assets", data.groups?.asset)}${groupTable("Liabilities", data.groups?.liability)}${groupTable("Equity", data.groups?.equity)}<p class="hint">Retained profit included: ${money(data.netProfit)}</p>`;
  }
  if (name === "cash-book") {
    const data = await api(`/api/accounts/cash-book?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    $("acc-cash-table").innerHTML = `<p class="hint">Closing balance: <strong>${money(data.closingBalance)}</strong></p><table><thead><tr>
      <th>Date</th><th>Voucher</th><th>Type</th><th>Account</th><th>Debit</th><th>Credit</th><th>Balance</th>
    </tr></thead><tbody>${(data.entries || [])
      .map((r) => `<tr><td>${escapeHtml(r.voucher_date)}</td><td>${escapeHtml(r.voucher_no)}</td><td>${escapeHtml(r.voucher_type)}</td><td>${escapeHtml(r.name)}</td><td>${money(r.debit)}</td><td>${money(r.credit)}</td><td>${money(r.balance)}</td></tr>`)
      .join("")}</tbody></table>`;
  }
}

function fillExpenseCategories() {
  const el = $("exp-category");
  if (!el) return;
  const cur = el.value;
  el.innerHTML = EXPENSE_CATEGORIES.map(
    (c) => `<option value="${escapeHtml(c.code)}"${c.code === cur ? " selected" : ""}>${escapeHtml(c.name)}</option>`,
  ).join("");
}

function paintExpensePreview() {
  const amt = Number($("exp-amount")?.value) || 0;
  const gst = Number($("exp-gst")?.value) || 0;
  if ($("exp-total-preview")) $("exp-total-preview").textContent = money(amt + gst);
}

async function loadExpenses() {
  fillExpenseCategories();
  if ($("exp-date") && !$("exp-date").value) $("exp-date").value = ymd();
  if (!$("exp-from")?.value || !$("exp-to")?.value) applyFyRange("exp-from", "exp-to");
  paintFyChip("exp-fy-label", indianFinancialYear($("exp-from")?.value || ymd()));
  paintExpensePreview();
  const from = $("exp-from").value;
  const to = $("exp-to").value;
  const el = $("expenses-table");
  if (!el) return;
  el.innerHTML = '<p class="hint">Loading…</p>';
  try {
    const rows = await api(`/api/expenses?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (!rows.length) {
      el.innerHTML = '<p class="hint">No expenses in this period.</p>';
      return;
    }
    el.innerHTML = `<table><thead><tr>
      <th>No.</th><th>Date</th><th>Category</th><th>Amount</th><th>GST</th><th>Total</th><th>Pay</th><th>Notes</th>
    </tr></thead><tbody>${rows
      .map((r) => {
        const total = (Number(r.amount) || 0) + (Number(r.gst) || 0);
        return `<tr>
        <td>${escapeHtml(r.expense_number)}</td>
        <td>${escapeHtml(formatShopDate(r.expense_date))}</td>
        <td>${escapeHtml(r.category)}</td>
        <td>${money(r.amount)}</td>
        <td>${money(r.gst)}</td>
        <td>${money(total)}</td>
        <td>${escapeHtml(r.payment_method)}</td>
        <td>${escapeHtml(r.notes || "—")}</td>
      </tr>`;
      })
      .join("")}</tbody></table>`;
  } catch (err) {
    el.innerHTML = `<p class="hint error">${escapeHtml(err.message)}</p>`;
  }
}

function showReceiptModal(customer) {
  $("modal-title").textContent = `Receipt · ${customer.business_name || customer.name}`;
  $("modal-body").innerHTML = `<form class="settings" id="receipt-modal-form">
    <p class="section-note">Outstanding: <strong>${money(Number(customer.outstanding) || 0)}</strong></p>
    <label>Amount <input id="rcp-amount" type="number" min="0.01" step="0.01" max="${Number(customer.outstanding) || 0}" required value="${Number(customer.outstanding) || 0}" /></label>
    <label>Method <select id="rcp-method"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option></select></label>
    <label>Notes <input id="rcp-notes" placeholder="Optional" /></label>
    <button class="btn primary" type="submit">Save receipt</button>
  </form><div class="hint" id="rcp-hint"></div>`;
  $("modal").hidden = false;
  $("receipt-modal-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const data = await api("/api/accounts/receipts", {
        method: "POST",
        body: JSON.stringify({ customer_id: customer.id, amount: Number($("rcp-amount").value), payment_method: $("rcp-method").value, notes: $("rcp-notes").value }),
      });
      $("modal").hidden = true;
      await loadAccounts();
      await loadBootstrap();
      setHint(`Receipt saved · ${data.entryNo}`, "ok");
    } catch (err) {
      $("rcp-hint").textContent = err.message;
      $("rcp-hint").className = "hint error";
    }
  };
}

function showPaymentModal(supplier) {
  $("modal-title").textContent = `Payment · ${supplier.name}`;
  $("modal-body").innerHTML = `<form class="settings" id="payment-modal-form">
    <p class="section-note">Payable: <strong>${money(Number(supplier.payable_balance) || 0)}</strong></p>
    <label>Amount <input id="pay-acc-amount" type="number" min="0.01" step="0.01" max="${Number(supplier.payable_balance) || 0}" required value="${Number(supplier.payable_balance) || 0}" /></label>
    <label>Method <select id="pay-acc-method"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option></select></label>
    <label>Notes <input id="pay-acc-notes" placeholder="Optional" /></label>
    <button class="btn primary" type="submit">Save payment</button>
  </form><div class="hint" id="pay-acc-hint"></div>`;
  $("modal").hidden = false;
  $("payment-modal-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const data = await api("/api/accounts/payments", {
        method: "POST",
        body: JSON.stringify({ supplier_id: supplier.id, amount: Number($("pay-acc-amount").value), payment_method: $("pay-acc-method").value, notes: $("pay-acc-notes").value }),
      });
      $("modal").hidden = true;
      await loadAccounts();
      await loadSuppliers();
      setHint(`Payment saved · ${data.entryNo}`, "ok");
    } catch (err) {
      $("pay-acc-hint").textContent = err.message;
      $("pay-acc-hint").className = "hint error";
    }
  };
}

async function loadAccounts() {
  if (!$("acc-summary")) return;
  $("acc-hint").textContent = "Loading…";
  $("acc-hint").className = "hint";
  try {
    accPeriod();
    const [summary, receivables, payables] = await Promise.all([
      api("/api/accounts/summary"),
      api("/api/accounts/receivables"),
      api("/api/accounts/payables"),
    ]);
    $("acc-summary").innerHTML = [
      ["Receivables", money(summary.receivables)],
      ["Payables", money(summary.payables)],
      ["Customers due", summary.customersDue],
      ["Suppliers due", summary.suppliersDue],
    ].map(([k, v]) => `<div class="report-card"><span>${k}</span><strong>${v}</strong></div>`).join("");
    $("acc-receivables-table").innerHTML = receivables.length
      ? `<table><thead><tr><th>Code</th><th>Name</th><th>Business</th><th>Mobile</th><th>Credit limit</th><th>Outstanding</th><th></th></tr></thead><tbody>${receivables
        .map((c) => `<tr><td>${escapeHtml(c.code)}</td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.business_name || "—")}</td><td>${escapeHtml(c.mobile || "—")}</td><td>${money(Number(c.credit_limit) || 0)}</td><td>${money(Number(c.outstanding) || 0)}</td><td><button class="btn primary" type="button" data-rcp="${escapeHtml(c.id)}">Receipt</button></td></tr>`)
        .join("")}</tbody></table>`
      : `<p class="hint">No receivables.</p>`;
    $("acc-payables-table").innerHTML = payables.length
      ? `<table><thead><tr><th>Code</th><th>Name</th><th>Contact</th><th>Mobile</th><th>Payable</th><th></th></tr></thead><tbody>${payables
        .map((s) => `<tr><td>${escapeHtml(s.code)}</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.contact_name || "—")}</td><td>${escapeHtml(s.mobile || "—")}</td><td>${money(Number(s.payable_balance) || 0)}</td><td><button class="btn primary" type="button" data-pay="${escapeHtml(s.id)}">Payment</button></td></tr>`)
        .join("")}</tbody></table>`
      : `<p class="hint">No payables.</p>`;
    state.accReceivables = receivables;
    state.accPayables = payables;
    $("acc-hint").textContent = "";
    if (!["receivables", "payables"].includes(accTab)) await loadAccountsTab(accTab);
  } catch (err) {
    $("acc-hint").textContent = err.message;
    $("acc-hint").className = "hint error";
  }
}

$("catalog").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-add]");
  if (btn) addItem(btn.dataset.add);
});
$("lines").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-chg]");
  if (!btn) return;
  addItem(btn.dataset.chg, Number(btn.dataset.d));
});
$("pack-bar").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-pack]");
  if (btn) addPack(btn.dataset.pack);
});
$("pack-choice").addEventListener("change", () => {
  if (!$("pack-choice").value) {
    state.lastPack = null;
    renderCart();
    return;
  }
  addPack($("pack-choice").value);
});

$("items-table").addEventListener("click", async (e) => {
  const recv = e.target.closest("[data-recv]");
  const edit = e.target.closest("[data-edit-item]");
  if (recv) {
    const item = state.items.find((x) => x.id === recv.dataset.recv);
    const qty = item ? POSUnits.receiveQty(itemUnit(item)) : 1000;
    await api(`/api/items/${recv.dataset.recv}/receive`, {
      method: "POST",
      body: JSON.stringify({ quantity_gm: qty }),
    });
    await loadBootstrap();
    return;
  }
  if (edit) {
    const i = state.items.find((x) => x.id === edit.dataset.editItem);
    if (!i) return;
    $("item-id").value = i.id;
    $("item-name").value = i.name;
    $("item-hsn").value = i.hsn || "";
    $("item-category").value = i.category || "";
    $("item-subcategory").value = i.subcategory || "";
    $("item-retail").value = i.retail_rate;
    $("item-b2b").value = i.b2b_rate;
    $("item-purchase").value = i.purchase_rate;
    $("item-gst").value = i.gst_rate;
    fillItemUnitSelect(itemUnit(i));
    $("item-unit").value = itemUnit(i);
    $("item-stock").value = POSUnits.fromBase(i.stock_gm, itemUnit(i));
    refreshItemUnitLabels();
  }
});

$("orders").addEventListener("click", (e) => {
  const row = e.target.closest("[data-oid]");
  if (!row) return;
  const o = orderCache.find((r) => r.id === row.dataset.oid);
  if (o) showOrder(o);
});

$("orders-toolbar")?.addEventListener("submit", (e) => e.preventDefault());
$("orders-search")?.addEventListener("input", () => {
  orderFilter.q = $("orders-search").value;
  renderOrdersListDebounced();
});
$("orders-status-filter")?.addEventListener("change", () => {
  orderFilter.status = $("orders-status-filter").value;
  renderOrdersList();
});
$("orders-pay-filter")?.addEventListener("change", () => {
  orderFilter.payment = $("orders-pay-filter").value;
  renderOrdersList();
});
$("orders-refresh")?.addEventListener("click", () => {
  loadOrders().catch((err) => setHint(err.message, "error"));
});

$("nav-toggle")?.addEventListener("click", () => {
  const app = document.getElementById("app");
  if (!app) return;
  setNavCollapsed(!app.classList.contains("nav-collapsed"));
});
$("nav-scrim")?.addEventListener("click", () => setNavCollapsed(true));

$("orders").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const row = e.target.closest("[data-oid]");
  if (!row) return;
  e.preventDefault();
  const o = orderCache.find((r) => r.id === row.dataset.oid);
  if (o) showOrder(o);
});

$("purchases-list").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-pid]");
  if (!btn) return;
  const p = purchaseCache.find((row) => row.id === btn.dataset.pid);
  if (p) showPurchase(p);
});

$("purchase-pane").addEventListener("click", (e) => {
  const printBtn = e.target.closest("[data-print-purchase]");
  if (!printBtn) return;
  const p = purchaseCache.find((row) => row.id === printBtn.dataset.printPurchase);
  if (p) printPurchase(p);
});

$("order-pane").addEventListener("click", async (e) => {
  const printBtn = e.target.closest("[data-print]");
  const editBtn = e.target.closest("[data-edit-order]");
  const statusBtn = e.target.closest("[data-set-order-status]");
  if (printBtn) {
    const o = orderCache.find((row) => row.id === printBtn.dataset.print);
    if (o) printOrder(o);
  }
  if (editBtn) {
    const o = orderCache.find((row) => row.id === editBtn.dataset.editOrder);
    if (!o) return;
    if (String(o.status || "").toLowerCase() === "cancelled") {
      setHint("Change order status from cancelled before editing items", "error");
      return;
    }
    state.editingOrderId = o.id;
    state.customerId = o.customer_id;
    state.cart = (o.lines || []).map((l) => ({ itemId: l.item_id, qtyGm: Number(l.quantity_gm) }));
    state.lastPack = o.pack_id ? { id: o.pack_id, name: o.pack_name, count: o.pack_count || 1 } : null;
    $("customer").value = state.customerId;
    $("pay-method").value = o.payment_method || "cash";
    $("pack-choice").value = o.pack_id || "";
    showView("counter");
    renderCart();
    setHint(`Changing items for ${o.order_number}`, "ok");
  }
  if (statusBtn) {
    const orderId = statusBtn.dataset.orderId;
    const nextStatus = statusBtn.dataset.setOrderStatus;
    const o = orderCache.find((row) => row.id === orderId);
    if (!o || String(o.status || "").toLowerCase() === nextStatus) return;
    if (nextStatus === "cancelled" && !window.confirm(`Cancel invoice ${o.order_number}? Stock will be restored.`)) return;
    statusBtn.disabled = true;
    try {
      const updated = await updateOrderStatus(o, { status: nextStatus });
      showOrder(updated);
      renderOrdersList();
      setHint(`${orderStatusLabel(nextStatus)} · ${updated.order_number}`, "ok");
    } catch (err) {
      setHint(err.message, "error");
    } finally {
      statusBtn.disabled = false;
    }
  }
});

$("order-pane").addEventListener("change", async (e) => {
  const select = e.target.closest("#order-pay-status-select");
  if (!select) return;
  const orderId = select.dataset.orderId;
  const o = orderCache.find((row) => row.id === orderId);
  const payment_status = select.value;
  if (!o || String(o.payment_status || "").toLowerCase() === payment_status) return;
  select.disabled = true;
  try {
    const updated = await updateOrderStatus(o, { payment_status });
    showOrder(updated);
    renderOrdersList();
    setHint(`Payment ${paymentStatusLabel(payment_status)} · ${updated.order_number}`, "ok");
  } catch (err) {
    select.value = String(o.payment_status || "paid").toLowerCase();
    setHint(err.message, "error");
  } finally {
    select.disabled = false;
  }
});

$("search").addEventListener("input", () => {
  state.query = $("search").value;
  renderCatalogDebounced();
});
$("search-form").addEventListener("submit", (e) => e.preventDefault());
$("customer").addEventListener("change", () => {
  state.customerId = $("customer").value;
  renderCatalog();
  renderCart();
});
$("btn-clear").addEventListener("click", () => {
  if (state.editingOrderId) {
    cancelOrderEdit();
    return;
  }
  state.cart = [];
  state.lastPack = null;
  $("pack-choice").value = "";
  setHint("Cart cleared");
  renderCart();
});

document.addEventListener("click", (e) => {
  if (e.target.id === "btn-cancel-edit") cancelOrderEdit();
});

$("btn-pay").addEventListener("click", async () => {
  try {
    if (!state.customerId) {
      const walk = state.customers.find((c) => /walk-in/i.test(c.name));
      state.customerId = walk?.id || state.customers[0]?.id || "";
    }
    if (!state.customerId) throw new Error("Add a customer before saving the bill");
    if (!state.cart.length) throw new Error("Cart is empty");
    setHint("Saving…");
    const payload = {
      customerId: state.customerId,
      paymentMethod: $("pay-method").value,
      packId: state.lastPack?.id || null,
      packCount: state.lastPack?.count || null,
      lines: state.cart.map((l) => ({ itemId: l.itemId, quantity_gm: l.qtyGm })),
    };
    const result = state.editingOrderId
      ? await api(`/api/orders/${state.editingOrderId}`, { method: "PUT", body: JSON.stringify(payload) })
      : await api("/api/checkout", { method: "POST", body: JSON.stringify(payload) });
    const order = orderFromResult(result);
    if (!orderSaved(result)) throw new Error("Checkout did not return an order");
    const wasEdit = Boolean(state.editingOrderId);
    clearCounterAfterSale(order, result);
    state.editingOrderId = null;
    renderEditOrderBanner();
    if (wasEdit) {
      try { await loadOrders(); } catch { /* ignore */ }
    }
    let receiptOrder = order;
    if (!receiptOrder) {
      receiptOrder = {
        order_number: orderLabel(order, result),
        total: orderTotal(order, result),
        customer_name: customer()?.name || "Walk-in",
        customer_id: state.customerId,
        payment_method: $("pay-method").value,
        payment_status: "paid",
        lines: [],
        subtotal: 0,
        gst: 0,
        created_at: new Date().toISOString(),
      };
    }
    if (!receiptOrder.lines?.length) {
      receiptOrder = {
        ...receiptOrder,
        lines: state.cart.map((l) => {
          const item = state.items.find((i) => i.id === l.itemId);
          return {
            item_id: l.itemId,
            item_name: item?.name || "Item",
            quantity_gm: l.qtyGm,
            rate_per_kg: item ? rateFor(item) : 0,
            amount: item ? lineAmt(item, l.qtyGm) : 0,
            gst_rate: item?.gst_rate || 0,
          };
        }),
      };
    }
    showOrder(receiptOrder);
    $("modal-title").textContent = `Invoice ${orderLabel(order, result)}`;
    $("modal-body").innerHTML = `<p class="hint ok">Bill saved. POS cleared for the next customer.</p>
      <div class="thermal-preview">${InvoicePrint.invoiceBody(receiptOrder, invoiceCtx())}</div>
      <div class="print-actions"><button class="btn primary" type="button" id="modal-print">Print invoice</button></div>`;
    $("modal").hidden = false;
    $("modal-print").onclick = () => printOrder(receiptOrder);
    showView("counter");
    try {
      await Promise.all([loadBootstrap(), loadToday()]);
    } catch {
      /* order is already saved; keep the success message and cleared cart */
    }
  } catch (err) {
    setHint(userHintMessage(err), "error");
  }
});

$("modal-close").addEventListener("click", () => {
  $("modal").hidden = true;
});
document.querySelector(".accounts-toolbar")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-acc-tab]");
  if (btn) setAccTab(btn.dataset.accTab);
});
$("acc-period-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await loadAccountsTab(accTab);
  } catch (err) {
    $("acc-hint").textContent = err.message;
    $("acc-hint").className = "hint error";
  }
});
$("view-accounts")?.addEventListener("click", (e) => {
  const rcp = e.target.closest("[data-rcp]");
  if (rcp) {
    const customer = (state.accReceivables || []).find((c) => c.id === rcp.dataset.rcp);
    if (customer) showReceiptModal(customer);
    return;
  }
  const pay = e.target.closest("[data-pay]");
  if (pay) {
    const supplier = (state.accPayables || []).find((s) => s.id === pay.dataset.pay);
    if (supplier) showPaymentModal(supplier);
  }
});
document.querySelector(".nav").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-view]");
  if (btn) showView(btn.dataset.view);
});

$("item-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const unit = POSUnits.normalize($("item-unit").value);
  const body = {
    name: $("item-name").value,
    hsn: $("item-hsn").value,
    category: $("item-category").value || "Whole Spices",
    subcategory: $("item-subcategory").value,
    base_unit: unit,
    unit,
    retail_rate: $("item-retail").value,
    b2b_rate: $("item-b2b").value,
    purchase_rate: $("item-purchase").value,
    gst_rate: $("item-gst").value,
    stock_gm: POSUnits.toBase($("item-stock").value, unit),
  };
  try {
    if ($("item-id").value) await api(`/api/items/${$("item-id").value}`, { method: "PUT", body: JSON.stringify(body) });
    else await api("/api/items", { method: "POST", body: JSON.stringify(body) });
    $("item-hint").textContent = "Saved";
    $("item-hint").className = "hint ok";
    $("item-form").reset();
    $("item-id").value = "";
    fillItemUnitSelect("GM");
    refreshItemUnitLabels();
    await loadBootstrap();
  } catch (err) {
    $("item-hint").textContent = err.message;
    $("item-hint").className = "hint error";
  }
});
$("item-cancel").addEventListener("click", () => {
  $("item-form").reset();
  $("item-id").value = "";
  fillItemUnitSelect("GM");
  refreshItemUnitLabels();
});
$("item-unit")?.addEventListener("change", refreshItemUnitLabels);

$("unit-family")?.addEventListener("change", () => {
  const d = POSUnits.familyDefaults($("unit-family").value);
  if ($("unit-rate-suffix")) $("unit-rate-suffix").value = d.rateSuffix;
  if ($("unit-stock-suffix")) $("unit-stock-suffix").value = d.stockSuffix;
});

$("unit-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    code: $("unit-code").value,
    name: $("unit-name").value,
    family: $("unit-family").value,
    rate_suffix: $("unit-rate-suffix").value,
    stock_suffix: $("unit-stock-suffix").value,
  };
  try {
    if ($("unit-id").value) await api(`/api/units/${$("unit-id").value}`, { method: "PUT", body: JSON.stringify(body) });
    else await api("/api/units", { method: "POST", body: JSON.stringify(body) });
    $("unit-hint").textContent = "Saved";
    $("unit-hint").className = "hint ok";
    $("unit-form").reset();
    $("unit-id").value = "";
    await loadBootstrap();
    renderUnitsTable();
  } catch (err) {
    $("unit-hint").textContent = err.message;
    $("unit-hint").className = "hint error";
  }
});
$("unit-cancel")?.addEventListener("click", () => {
  $("unit-form").reset();
  $("unit-id").value = "";
});
$("units-table")?.addEventListener("click", async (e) => {
  const edit = e.target.closest("[data-edit-unit]");
  const del = e.target.closest("[data-del-unit]");
  if (edit) {
    const u = (state.units || []).find((x) => x.id === edit.dataset.editUnit);
    if (!u) return;
    $("unit-id").value = u.id;
    $("unit-code").value = u.code;
    $("unit-name").value = u.name;
    $("unit-family").value = u.family || "count";
    $("unit-rate-suffix").value = u.rate_suffix || "";
    $("unit-stock-suffix").value = u.stock_suffix || "";
    return;
  }
  if (del) {
    const u = (state.units || []).find((x) => x.id === del.dataset.delUnit);
    if (!u) return;
    if (!confirm(`Delete unit ${u.code}?`)) return;
    try {
      await api(`/api/units/${u.id}`, { method: "DELETE" });
      $("unit-hint").textContent = "Deleted";
      $("unit-hint").className = "hint ok";
      await loadBootstrap();
      renderUnitsTable();
    } catch (err) {
      $("unit-hint").textContent = err.message;
      $("unit-hint").className = "hint error";
    }
  }
});

$("customer-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await saveCustomer({
      name: $("cust-name").value,
      business_name: $("cust-biz").value,
      mobile: $("cust-mobile").value,
      type: $("cust-type").value,
      gstin: $("cust-gstin").value,
    });
    $("cust-hint").textContent = "Saved";
    $("cust-hint").className = "hint ok";
    $("customer-form").reset();
  } catch (err) {
    $("cust-hint").textContent = err.message;
    $("cust-hint").className = "hint error";
  }
});

$("quick-customer-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const hint = $("qc-hint");
  try {
    const customer = await saveCustomer({
      name: $("qc-name").value,
      mobile: $("qc-mobile").value,
    });
    $("qc-name").value = "";
    $("qc-mobile").value = "";
    if (hint) {
      hint.textContent = `Added ${customer?.name || "customer"}`;
      hint.className = "hint ok";
    }
    setHint(`Customer added · ${customer?.name || ""}`, "ok");
  } catch (err) {
    if (hint) {
      hint.textContent = err.message;
      hint.className = "hint error";
    }
    setHint(err.message, "error");
  }
});

$("pack-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const items = [...document.querySelectorAll("[data-pack-item]:checked")].map((box) => ({
    item_id: box.dataset.packItem,
    quantity_gm: Number(document.querySelector(`[data-pack-qty="${box.dataset.packItem}"]`).value),
  }));
  try {
    await api("/api/packs", { method: "POST", body: JSON.stringify({ name: $("pack-name").value, items }) });
    $("pack-hint").textContent = "Saved";
    $("pack-hint").className = "hint ok";
    $("pack-form").reset();
    await loadBootstrap();
  } catch (err) {
    $("pack-hint").textContent = err.message;
    $("pack-hint").className = "hint error";
  }
});

$("purchase-form").addEventListener("input", (e) => {
  if (e.target.id === "po-item-search") {
    filterPoLines();
    return;
  }
  if (e.target.matches("[data-po-qty],[data-po-rate]")) {
    const id = e.target.dataset.poQty || e.target.dataset.poRate;
    if (id) paintPoLineAmount(id);
    paintPoTotals();
  }
});
$("purchase-form").addEventListener("change", (e) => {
  if (e.target.matches("[data-po-item]")) paintPoTotals();
});
$("po-lines")?.addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-po-row]");
  if (!tr || e.target.closest("input")) return;
  const box = tr.querySelector("[data-po-item]");
  if (!box) return;
  box.checked = !box.checked;
  paintPoTotals();
});
$("purchase-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const lines = [...document.querySelectorAll("[data-po-item]:checked")].map((box) => ({
    item_id: box.dataset.poItem,
    quantity_gm: Number(document.querySelector(`[data-po-qty="${box.dataset.poItem}"]`).value),
    rate_per_kg: Number(document.querySelector(`[data-po-rate="${box.dataset.poItem}"]`).value),
  }));
  try {
    await api("/api/purchases", {
      method: "POST",
      body: JSON.stringify({
        supplier_id: $("po-supplier").value,
        supplier_invoice_number: $("po-invoice").value,
        purchase_date: $("po-date").value,
        payment_method: $("po-pay").value,
        lines,
      }),
    });
    $("po-hint").textContent = "Saved";
    $("po-hint").className = "hint ok";
    $("purchase-form").reset();
    $("purchase-new").open = false;
    await loadBootstrap();
    await loadPurchases();
    if (purchaseCache.length) showPurchase(purchaseCache[0]);
  } catch (err) {
    $("po-hint").textContent = err.message;
    $("po-hint").className = "hint error";
  }
});

$("supplier-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/suppliers", {
      method: "POST",
      body: JSON.stringify({
        name: $("sup-name").value,
        contact_name: $("sup-contact").value,
        mobile: $("sup-mobile").value,
        email: $("sup-email").value,
        address: $("sup-address").value,
        gstin: $("sup-gstin").value,
      }),
    });
    $("sup-hint").textContent = "Saved";
    $("sup-hint").className = "hint ok";
    $("supplier-form").reset();
    await loadSuppliers();
  } catch (err) {
    $("sup-hint").textContent = err.message;
    $("sup-hint").className = "hint error";
  }
});

$("set-timezone")?.addEventListener("change", paintTimezonePreview);

$("btn-backup-download")?.addEventListener("click", () => {
  if ($("btn-backup-download")) $("btn-backup-download").href = posUrl("/api/backup");
});

$("btn-backup-restore")?.addEventListener("click", async () => {
  const hint = $("backup-hint");
  const input = $("backup-file");
  const file = input?.files?.[0];
  if (!file) {
    if (hint) {
      hint.textContent = "Choose a backup JSON file first";
      hint.className = "hint error";
    }
    return;
  }
  if (!confirm("Restore this backup? It replaces items, stock, customers, invoices, and purchases for this shop.")) {
    return;
  }
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (hint) {
      hint.textContent = "Restoring…";
      hint.className = "hint";
    }
    const data = await api("/api/backup/restore", { method: "POST", body: JSON.stringify(payload) });
    if (hint) {
      hint.textContent = `Restored ${data.tables || 0} tables`;
      hint.className = "hint ok";
    }
    await loadBootstrap();
    renderSettings();
  } catch (err) {
    if (hint) {
      hint.textContent = err.message;
      hint.className = "hint error";
    }
  }
});

$("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const payload = {
      name: $("set-name").value,
      address: $("set-address").value,
      phone: $("set-phone").value,
      email: $("set-email").value,
      gstin: $("set-gstin").value,
      timezone: $("set-timezone")?.value || shopTimezone(),
    };
    if (state.logoDraft !== null) payload.logo_url = state.logoDraft;
    const data = await api("/api/settings", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.company = data.company;
    state.logoDraft = null;
    paintHeader();
    renderSettings();
    tick();
    $("settings-hint").textContent = "Saved";
    $("settings-hint").className = "hint ok";
  } catch (err) {
    $("settings-hint").textContent = err.message;
    $("settings-hint").className = "hint error";
  }
});

$("set-logo").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const url = await readLogoFile(file);
    state.logoDraft = url;
    showLogo($("logo-preview"), url);
    paintLogoFileName(file.name);
    $("settings-hint").textContent = "Logo ready — click Save";
    $("settings-hint").className = "hint";
  } catch (err) {
    $("settings-hint").textContent = err.message;
    $("settings-hint").className = "hint error";
  }
});

$("logo-clear").addEventListener("click", () => {
  state.logoDraft = "";
  $("set-logo").value = "";
  paintLogoFileName();
  showLogo($("logo-preview"), "");
  $("settings-hint").textContent = "Logo will be removed on Save";
  $("settings-hint").className = "hint";
});

$("report-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await loadReports();
});
$("rep-this-fy")?.addEventListener("click", async () => {
  applyFyRange("rep-from", "rep-to");
  await loadReports();
});
$("acc-this-fy")?.addEventListener("click", async () => {
  applyFyRange("acc-from", "acc-to", "acc-asof");
  try {
    await loadAccountsTab(accTab);
  } catch (err) {
    $("acc-hint").textContent = err.message;
    $("acc-hint").className = "hint error";
  }
});
$("exp-this-fy")?.addEventListener("click", async () => {
  applyFyRange("exp-from", "exp-to");
  await loadExpenses();
});
$("exp-filter")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  await loadExpenses();
});
$("expense-form")?.addEventListener("input", paintExpensePreview);
$("expense-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const cat = EXPENSE_CATEGORIES.find((c) => c.code === $("exp-category").value);
  try {
    await api("/api/expenses", {
      method: "POST",
      body: JSON.stringify({
        expense_date: $("exp-date").value,
        account_code: $("exp-category").value,
        category: cat?.name || "",
        amount: Number($("exp-amount").value),
        gst: Number($("exp-gst").value) || 0,
        payment_method: $("exp-pay").value,
        notes: $("exp-notes").value,
      }),
    });
    $("exp-hint").textContent = "Saved";
    $("exp-hint").className = "hint ok";
    $("expense-form").reset();
    if ($("exp-date")) $("exp-date").value = ymd();
    if ($("exp-gst")) $("exp-gst").value = "0";
    fillExpenseCategories();
    paintExpensePreview();
    await loadExpenses();
  } catch (err) {
    $("exp-hint").textContent = err.message;
    $("exp-hint").className = "hint error";
  }
});

function readLogoFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 8_000_000) {
      reject(new Error("Choose a smaller image"));
      return;
    }
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      const max = 480;
      let w = img.width;
      let h = img.height;
      if (w > max || h > max) {
        const scale = max / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(blobUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error("Could not read image"));
    };
    img.src = blobUrl;
  });
}

$("po-date").value = shopYmd();

function tick() {
  const now = new Date();
  const tz = shopTimezone();
  const timeText = formatShopTime(now);
  const topbarTime = $("topbar-time");
  if (!topbarTime || topbarTime.textContent === timeText) return;
  topbarTime.textContent = timeText;
  const topbarClock = $("topbar-clock");
  if (!topbarClock) return;
  const abbr =
    new Intl.DateTimeFormat("en-IN", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value || tz;
  const date = now.toLocaleDateString("en-IN", { timeZone: tz, weekday: "short", day: "numeric", month: "short" });
  topbarClock.setAttribute("title", `${date} · ${abbr} (${tz})`);
}
tick();
setInterval(tick, 1000);
window.addEventListener("resize", () => {
  if (!isMobileLayout()) {
    setNavCollapsed(false);
  } else if (!$("nav-scrim")?.hidden && document.getElementById("app")?.classList.contains("nav-collapsed")) {
    setNavCollapsed(true);
  }
});

document.addEventListener("click", async (e) => {
  const logout = e.target.closest("[data-logout]");
  if (!logout) return;
  e.preventDefault();
  await posRequest("/api/auth/logout", { method: "POST" });
  location.href = "/login.html";
});
$("open-pos")?.addEventListener("click", () => showView("counter"));
$("btn-hold")?.addEventListener("click", async () => {
  try {
    if (state.editingOrderId) throw new Error("Finish or cancel the invoice edit first");
    if (!state.cart.length) throw new Error("Cart is empty");
    await api("/api/holds", {
      method: "POST",
      body: JSON.stringify({
        label: `Hold ${formatShopTime()}`,
        payload: { cart: state.cart, customerId: state.customerId, lastPack: state.lastPack },
      }),
    });
    setHint("Bill held", "ok");
    state.cart = [];
    state.lastPack = null;
    $("pack-choice").value = "";
    renderCart();
    await loadHolds();
  } catch (err) {
    setHint(err.message, "error");
  }
});
$("held-bills")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-recall-hold]");
  if (!btn) return;
  try {
    await recallHeldBill(btn.dataset.recallHold);
  } catch (err) {
    setHint(err.message, "error");
  }
});
$("staff-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/staff", {
      method: "POST",
      body: JSON.stringify({
        first_name: $("st-first").value,
        email: $("st-email").value,
        password: $("st-pass").value,
        role: $("st-role").value,
      }),
    });
    $("staff-hint").textContent = "Saved";
    $("staff-form").reset();
    loadStaff();
  } catch (err) {
    $("staff-hint").textContent = err.message;
  }
});
$("branch-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/api/branches", {
    method: "POST",
    body: JSON.stringify({ name: $("br-name").value, address: $("br-address").value, phone: $("br-phone").value }),
  });
  $("branch-form").reset();
  loadBranches();
});
$("device-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/api/devices", {
    method: "POST",
    body: JSON.stringify({ name: $("dev-name").value, code: $("dev-code").value }),
  });
  $("device-form").reset();
  loadDevices();
});
$("stock-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/api/stock/adjust", {
    method: "POST",
    body: JSON.stringify({
      item_id: $("stk-item").value,
      quantity_gm: $("stk-qty").value,
      kind: $("stk-kind").value,
      note: $("stk-note").value,
    }),
  });
  loadStock();
  loadBootstrap();
});

function paintPlatformNotices(notes) {
  const list = (Array.isArray(notes) ? notes : []).filter((n) => {
    const title = String(n.title || "").trim().toLowerCase();
    const body = String(n.body || "").toLowerCase();
    if (title === "master admin login") return false;
    if (body.includes("opened this shop from master admin")) return false;
    if (body.includes("viewing this shop") || body.includes("is viewing")) return false;
    return true;
  });
  const top = $("platform-notices");
  const dash = $("dash-notes");
  const html = list
    .map(
      (n) =>
        `<div class="platform-notice"><strong>${escapeHtml(n.title || "Notice")}</strong>${escapeHtml(n.body || "")}</div>`,
    )
    .join("");
  if (top) {
    if (list.length) {
      top.innerHTML = html;
      top.hidden = false;
      top.removeAttribute("hidden");
    } else {
      top.innerHTML = "";
      top.hidden = true;
    }
  }
  if (dash) dash.innerHTML = html;
}

function paintImpersonationControls() {
  const exit = $("exit-impersonate");
  if (exit) exit.hidden = !state.impersonating;
  if (state.impersonating) $("expired-banner").hidden = true;
}

$("exit-impersonate")?.addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    await api("/api/auth/exit-impersonate", { method: "POST" });
  } catch {
    /* keep navigation even if API fails */
  }
  location.href = "/master.html";
});

async function boot() {
  try {
    const { res, data: me } = await posRequest("/api/auth/me");
    if (res.status === 401 || !me?.ok) {
      location.href = "/login.html";
      return;
    }
    if (me.type !== "staff") {
      location.href = me.type === "master" ? "/master.html" : "/login.html";
      return;
    }
    state.session = me.user;
    state.perms = me.user.permissions || {};
    state.businessMeta = me.business || null;
    state.impersonating = Boolean(me.impersonating);
    state.impersonator = me.impersonator || null;
    paintImpersonationControls();
    if (window.DevMode) {
      DevMode.init({
        session: state.session,
        business: state.businessMeta,
        plan: me.plan || null,
        devToolsAllowed: me.devToolsAllowed !== false,
      });
    }
    if ($("session-who")) {
      $("session-who").textContent = `${me.user.name || me.user.email} · ${me.user.role || ""} · ${me.business?.name || ""}`;
    }
    applyNav();
    if (isMobileLayout()) setNavCollapsed(true);
    if (me.business?.status && me.business.status !== "active" && !me.impersonating) {
      $("expired-banner").hidden = false;
      $("shop-name").textContent = me.business.name || "POS";
      showView("dashboard");
      return;
    }
    try {
      await loadBootstrap();
    } catch (err) {
      setHint(err.message || "Could not load shop data", "error");
    }
    if (window.DevMode) {
      DevMode.updateContext({
        session: state.session,
        business: state.businessMeta,
        plan: state.plan,
        timezone: shopTimezone(),
        cartLines: state.cart.length,
      });
    }
    showView(can("dashboard") ? "dashboard" : "counter");
    refreshItemUnitLabels();
  } catch {
    location.href = "/login.html";
  }
}

boot();
