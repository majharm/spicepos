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
  itemImage: "",
  session: null,
  perms: {},
  support: {},
  staff: [],
  plan: null,
  wearerFilter: "",
  sizeFilter: "",
  colorFilter: "",
  billDiscountType: "amt",
  billDiscountValue: 0,
  loyaltyRedeem: 0,
  loyaltyAccount: null,
  loyaltySettings: null,
  stockMode: "simple",
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
  el.innerHTML = POSUnits.optionsHtml(selected || el.value || defaultItemUnit());
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

function isFootwearShop() {
  return Boolean(globalThis.POSFootwear?.isFootwearShop(state.businessMeta));
}

function itemVariantText(item) {
  return globalThis.POSFootwear?.variantLabel(item) || "";
}

function itemBillName(item) {
  return globalThis.POSFootwear?.billName(item) || item?.name || "Item";
}

function defaultItemCategory() {
  return globalThis.POSFootwear?.defaultCategory(state.businessMeta) || "Whole Spices";
}

function defaultItemUnit() {
  return globalThis.POSFootwear?.defaultUnit(state.businessMeta) || "GM";
}

function applyFootwearMode() {
  const on = isFootwearShop();
  document.body.classList.toggle("footwear-mode", on);
  document.querySelectorAll(".footwear-only").forEach((el) => {
    el.hidden = !on;
  });
  const search = $("search");
  if (search) search.placeholder = on ? "Search shoe, colour, or size…" : "Search name or HSN…";
  if ($("item-category-lab")) $("item-category-lab").textContent = on ? "Style" : "Category";
  if ($("item-category")) $("item-category").placeholder = on ? "School / Sports / Sandal" : "Whole Spices";
  if ($("item-subcategory-lab")) $("item-subcategory-lab").textContent = on ? "Brand" : "Subcategory";
  if ($("item-subcategory")) $("item-subcategory").placeholder = on ? "Bata / Local" : "Haldi / Jeera";
  if ($("items-lede")) {
    $("items-lede").textContent = on
      ? "Name, colour, size, girls/boys type, photo, rates, and stock."
      : "Name, photo, HSN code, unit type, rates, and stock.";
  }
  if ($("ticket-sub")) {
    $("ticket-sub").textContent = on ? "Scan or tap a pair · girls or boys" : "Scan, tap, or search";
  }
  VIEW_META.items.subtitle = on
    ? "Colour, size, girls/boys type, rates, and stock"
    : "Photo, HSN, unit type, rates, and stock";
  VIEW_META.counter.subtitle = on ? "Scan or tap a pair — girls, boys, colour, size" : "Scan, tap, or search — then Pay";
  const pack = $("pack-choice");
  if (pack) pack.hidden = on;
  const colors = globalThis.POSFootwear?.COLORS || [];
  const sizes = globalThis.POSFootwear?.SIZES || [];
  if ($("color-list")) $("color-list").innerHTML = colors.map((c) => `<option value="${escapeHtml(c)}">`).join("");
  if ($("size-list")) $("size-list").innerHTML = sizes.map((s) => `<option value="${escapeHtml(s)}">`).join("");
  fillFootwearFilters();
  applyNav();
}

function fillFootwearFilters() {
  if (!isFootwearShop()) return;
  const items = activeItems();
  const sizes = [...new Set(items.map((i) => String(i.size || "").trim()).filter(Boolean))].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  const colors = [...new Set(items.map((i) => String(i.color || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const sizeEl = $("size-filter");
  const colorEl = $("color-filter");
  if (sizeEl) {
    const cur = sizeEl.value;
    sizeEl.innerHTML = `<option value="">All sizes</option>${sizes.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}`;
    if (sizes.includes(cur)) sizeEl.value = cur;
  }
  if (colorEl) {
    const cur = colorEl.value;
    colorEl.innerHTML = `<option value="">All colours</option>${colors.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}`;
    if (colors.includes(cur)) colorEl.value = cur;
  }
}

function refreshItemUnitLabels() {
  const u = POSUnits.normalize($("item-unit")?.value);
  if ($("item-retail-lab")) $("item-retail-lab").textContent = POSUnits.rateLabel("Retail", u);
  if ($("item-b2b-lab")) $("item-b2b-lab").textContent = POSUnits.rateLabel("B2B", u);
  if ($("item-purchase-lab")) $("item-purchase-lab").textContent = POSUnits.rateLabel("Purchase", u);
  if ($("item-stock-lab")) $("item-stock-lab").textContent = POSUnits.stockLabel(u);
  const pcs = POSUnits.isCount(u);
  document.querySelectorAll(".pcs-barcode-only").forEach((el) => {
    el.hidden = !pcs;
  });
}

const ORDER_STATUSES = ["confirmed", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["paid", "partial", "unpaid"];

const VIEW_META = {
  dashboard: { title: "Dashboard", subtitle: "Your shop today" },
  counter: { title: "Counter", subtitle: "Scan, tap, or search — then Pay" },
  items: { title: "Items", subtitle: "Photo, HSN, unit type, rates, and stock" },
  units: { title: "Unit master", subtitle: "Units used on items — qty, kg, litre, and custom" },
  customers: { title: "Customers", subtitle: "B2C retail and B2B wholesale accounts" },
  barcodes: { title: "Barcodes", subtitle: "Quantity (pcs) items only — one code per piece" },
  damage: { title: "Damage stock", subtitle: "Wastage, approval, and estimated loss" },
  ledger: { title: "Stock ledger", subtitle: "Purchase, sale, return, and damage history" },
  loyalty: { title: "Royalty points", subtitle: "Earn, redeem, tiers, birthday and referral" },
  packs: { title: "Packs", subtitle: "Pre-defined spice packs and compositions" },
  orders: { title: "Invoices", subtitle: "POS slip, official A4, or duplicate copy" },
  purchases: { title: "Purchases", subtitle: "20 pcs = 20 barcodes you type or scan" },
  suppliers: { title: "Suppliers", subtitle: "Vendor contacts, address, and GSTIN" },
  stock: { title: "Stock", subtitle: "Adjustments, transfers, and low-stock alerts" },
  staff: { title: "Staff & roles", subtitle: "Users, roles, and access" },
  branches: { title: "Branches", subtitle: "Shop locations and contact details" },
  devices: { title: "POS devices", subtitle: "Registers and terminal codes" },
  support: { title: "Support", subtitle: "Call, WhatsApp, or email platform support" },
  accounts: { title: "Accounts", subtitle: "Receivables, payables, GL, and books" },
  expenses: { title: "Expenses", subtitle: "Rent, power, wages, and other shop costs" },
  reports: { title: "Reports", subtitle: "Indian FY 1 Apr–31 Mar — sales, GST, expenses" },
  settings: { title: "Settings", subtitle: "Company profile, branding, and login password" },
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

function canDiscount() {
  return can("discount") || state.session?.role === "business_admin";
}

function lineCalc(item, line) {
  const D = globalThis.POSDiscount;
  if (!D) {
    const amount = lineAmt(item, line.qtyGm);
    return { taxable: amount, gst: (amount * Number(item.gst_rate)) / 100, discount: 0, profit: 0, mrp: amount, total: amount, gross: amount };
  }
  return D.computeLine({
    qty: line.qtyGm,
    rate: rateFor(item),
    gstRate: Number(item.gst_rate) || 0,
    mrp: Number(item.mrp || item.retail_rate) || rateFor(item),
    purchase_rate: Number(item.purchase_rate) || 0,
    isCount: POSUnits.isCount(itemUnit(item)),
    discountType: line.discountType || "amt",
    discountValue: line.discountValue || 0,
  });
}

function findItemByBarcode(code) {
  const q = String(code || "").trim();
  if (!q) return null;
  return activeItems().find((i) => {
    if (String(i.barcode || "").trim() === q) return i;
    const extra = Array.isArray(i.barcodes) ? i.barcodes : [];
    return extra.some((b) => String(b.barcode || b).trim() === q);
  }) || null;
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
  state.billDiscountValue = 0;
  state.loyaltyRedeem = 0;
  if ($("bill-disc-value")) $("bill-disc-value").value = 0;
  if ($("loyalty-redeem")) $("loyalty-redeem").value = 0;
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

function fyYearList(todayYmd, past = 10, future = 1) {
  const current = indianFinancialYear(todayYmd || ymd()).startYear;
  const out = [];
  for (let y = current + future; y >= current - past; y -= 1) {
    out.push(indianFinancialYear(`${y}-04-01`));
  }
  return out;
}

function fillFyYearSelect(selectId, startYear) {
  const el = $(selectId);
  if (!el) return;
  const years = fyYearList();
  const want = String(startYear ?? indianFinancialYear(ymd()).startYear);
  el.innerHTML = years
    .map((fy) => `<option value="${fy.startYear}">${escapeHtml(`${fy.label} · 1 Apr ${fy.startYear} – 31 Mar ${fy.startYear + 1}`)}</option>`)
    .join("");
  if ([...el.options].some((opt) => opt.value === want)) el.value = want;
}

function applyFyYear(startYear, fromId, toId, extraId) {
  const fy = indianFinancialYear(`${Number(startYear) || indianFinancialYear(ymd()).startYear}-04-01`);
  if ($(fromId)) $(fromId).value = fy.from;
  if ($(toId)) $(toId).value = fy.to;
  if (extraId && $(extraId)) {
    const today = ymd();
    $(extraId).value = today < fy.from ? fy.from : today > fy.to ? fy.to : today;
  }
  return fy;
}

function applyFyRange(fromId, toId, extraId, selectId) {
  const range = fyRangeForToday();
  if ($(fromId)) $(fromId).value = range.from;
  if ($(toId)) $(toId).value = range.to;
  if (extraId && $(extraId)) $(extraId).value = range.asOf || ymd();
  if (selectId) fillFyYearSelect(selectId, range.startYear);
  return range;
}

function syncFySelectFromDates(selectId, fromId) {
  fillFyYearSelect(selectId, indianFinancialYear($(fromId)?.value || ymd()).startYear);
}

const ACC_REPORT_TITLES = {
  receivables: "Receivables",
  payables: "Payables",
  ledger: "Day book",
  coa: "Chart of accounts",
  journal: "Journal",
  "trial-balance": "Trial balance",
  "profit-loss": "Profit & loss",
  "balance-sheet": "Balance sheet",
  "cash-book": "Cash book",
};

function shopPrintName() {
  return state.company?.name || $("shop-name")?.textContent?.trim() || "ATAV POS";
}

function sanitizePrintHtml(html) {
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  wrap.querySelectorAll(".print-actions, button, a.btn").forEach((el) => el.remove());
  return wrap.innerHTML;
}

function printFinance({ title, html, from, to, asOf }) {
  const fy = indianFinancialYear(from || asOf || ymd());
  const range = asOf ? `As of ${asOf}` : `${from || fy.from} to ${to || fy.to}`;
  const w = window.open("", "finance-print", "width=960,height=720");
  if (!w) {
    setHint("Allow pop-ups to print reports", "error");
    return;
  }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(title)} · ${escapeHtml(shopPrintName())}</title>
<style>
  body { font: 13px/1.45 ui-sans-serif, system-ui, sans-serif; color: #111; margin: 18px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #475569; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 16px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; font-size: 12px; }
  th { background: #f1f5f9; }
  .report-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-bottom: 16px; }
  .report-card { border: 1px solid #cbd5e1; padding: 8px 10px; border-radius: 8px; }
  .report-card span { display: block; color: #64748b; font-size: 11px; }
  .report-block { margin-bottom: 22px; page-break-inside: avoid; }
  .hint { color: #475569; }
  @media print { body { margin: 12px; } }
</style></head><body>
  <h1>${escapeHtml(shopPrintName())}</h1>
  <div class="meta">${escapeHtml(title)} · ${escapeHtml(fy.label)} · 1 April–31 March · ${escapeHtml(range)}</div>
  ${sanitizePrintHtml(html)}
</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

function printAccountsReport() {
  const { from, to, asOf } = accPeriod();
  const title = ACC_REPORT_TITLES[accTab] || "Accounts";
  const pane = $(`acc-pane-${accTab}`);
  const summary = ["receivables", "payables"].includes(accTab) ? $("acc-summary")?.outerHTML || "" : "";
  printFinance({
    title: `Accounts · ${title}`,
    html: summary + (pane?.innerHTML || ""),
    from,
    to,
    asOf: accTab === "balance-sheet" ? asOf : "",
  });
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
    const row = [
      Number(r.gst_rate) || 0,
      Number(r.taxable) || 0,
      Number(r.cgst) || 0,
      Number(r.sgst) || 0,
      Number(r.igst) || 0,
      Number(r.gst) || 0,
    ];
    if (withBills) row.push(Number(r.bills) || 0);
    return row;
  });
}

function gstSummaryRows(summary) {
  const s = summary?.gstSummary || {};
  const out = s.output || {};
  const inp = s.input || {};
  const net = s.net || {};
  return [
    ["Output", Number(out.cgst) || 0, Number(out.sgst) || 0, Number(out.igst) || 0, Number(out.total) || 0],
    ["Input", Number(inp.cgst) || 0, Number(inp.sgst) || 0, Number(inp.igst) || 0, Number(inp.total) || 0],
    ["Net payable", Number(net.cgst) || 0, Number(net.sgst) || 0, Number(net.igst) || 0, Number(net.total) || 0],
  ];
}

function reportBlock(title, sheet, headers, rows) {
  return `<section class="report-block" data-report-title="${escapeHtml(title)}">
    <div class="report-block-head">
      <h3>${escapeHtml(title)}</h3>
      <div class="print-actions">
        <button class="btn" type="button" data-print-report>Print</button>
        <a class="btn" href="${excelHref(sheet)}">Excel</a>
      </div>
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

const BILL_COLLAPSED_KEY = "spicepos-bill-collapsed";

function billToggleGlyph(hide) {
  if (isMobileLayout()) return hide ? "▴" : "▾";
  return hide ? "‹" : "›";
}

function setBillCollapsed(collapsed) {
  const hide = Boolean(collapsed);
  document.body.classList.toggle("bill-collapsed", hide);
  document.querySelector(".workspace")?.classList.toggle("bill-collapsed", hide);
  const btn = $("bill-toggle");
  if (btn) {
    btn.setAttribute("aria-expanded", hide ? "false" : "true");
    btn.setAttribute("aria-label", hide ? "Show bill" : "Hide bill");
    btn.title = hide ? "Show bill" : "Hide bill";
    btn.textContent = billToggleGlyph(hide);
  }
  try {
    localStorage.setItem(BILL_COLLAPSED_KEY, hide ? "1" : "0");
  } catch {
    /* private mode / quota */
  }
}

function restoreBillCollapsed() {
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(BILL_COLLAPSED_KEY) === "1";
  } catch {
    collapsed = false;
  }
  setBillCollapsed(collapsed);
}

function paintBillToggleCount() {
  const btn = $("bill-toggle");
  if (btn) btn.dataset.count = String(state.cart.length);
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
      barcodes: "items",
      damage: "stock",
      ledger: "stock",
      loyalty: "customers",
    };
    btn.hidden = map[view] ? !can(map[view]) : false;
    if (view === "packs" && isFootwearShop()) btn.hidden = true;
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
  const qcWrap = $("quick-customer-wrap");
  if (qcWrap && name === "counter") qcWrap.open = false;
  const page = document.getElementById(`view-${name}`);
  if (page) page.scrollTop = 0;
  paintViewHeader(name);
  if (name === "reports") loadReports();
  if (name === "accounts") loadAccounts();
  if (name === "expenses") loadExpenses();
  if (name === "orders") loadOrders();
  if (name === "purchases") loadPurchases();
  if (name === "suppliers") loadSuppliers();
  if (name === "support") renderSupport();
  if (name === "dashboard") loadDashboard();
  if (name === "counter") {
    loadHolds();
    queueMicrotask(focusScanLane);
  }
  paintImpersonationControls();
  if (name === "units") renderUnitsTable();
  if (name === "items") {
    fillItemUnitSelect($("item-unit")?.value || defaultItemUnit());
    refreshItemUnitLabels();
  }
  if (name === "stock") loadStock();
  if (name === "barcodes") loadBarcodesView();
  if (name === "damage") loadDamageView();
  if (name === "ledger") loadLedgerView();
  if (name === "loyalty") loadLoyaltyView();
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
  state.cart = payload.cart.map((line) => ({
    itemId: line.itemId,
    qtyGm: Number(line.qtyGm) || 0,
    discountType: line.discountType || "amt",
    discountValue: Number(line.discountValue) || 0,
    barcode: line.barcode || "",
  })).filter((l) => l.itemId && l.qtyGm > 0);
  state.billDiscountType = payload.billDiscountType || "amt";
  state.billDiscountValue = Number(payload.billDiscountValue) || 0;
  state.loyaltyRedeem = Number(payload.loyaltyRedeem) || 0;
  if ($("bill-disc-type")) $("bill-disc-type").value = state.billDiscountType;
  if ($("bill-disc-value")) $("bill-disc-value").value = state.billDiscountValue;
  if ($("loyalty-redeem")) $("loyalty-redeem").value = state.loyaltyRedeem;
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
  const wearer = String(state.wearerFilter || "").toLowerCase();
  const size = String(state.sizeFilter || "").trim().toLowerCase();
  const color = String(state.colorFilter || "").trim().toLowerCase();
  return activeItems().filter((i) => {
    if (wearer && globalThis.POSFootwear?.normalizeWearer(i.wearer_type) !== wearer) return false;
    if (size && String(i.size || "").trim().toLowerCase() !== size) return false;
    if (color && String(i.color || "").trim().toLowerCase() !== color) return false;
    if (!q) return true;
    return [i.name, i.hsn, i.local_name, i.code, i.barcode, i.category, i.subcategory, i.color, i.size, i.wearer_type]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
}

function itemPhotoUrl(item) {
  const s = String(item?.image_url || "");
  return s.startsWith("data:image/") ? s : "";
}

function itemPhotoLetter(item) {
  const ch = String(item?.name || "?").trim().charAt(0).toUpperCase();
  return ch || "?";
}

function cardPhotoHtml(item) {
  const src = itemPhotoUrl(item);
  if (src) {
    return `<div class="card-photo"><img src="${escapeHtml(src)}" alt="" draggable="false"></div>`;
  }
  return `<div class="card-photo card-photo-empty" aria-hidden="true">${escapeHtml(itemPhotoLetter(item))}</div>`;
}

function paintItemImage(url = "", fileName = "") {
  state.itemImage = url || "";
  showLogo($("item-image-preview"), state.itemImage);
  if ($("item-image-clear")) $("item-image-clear").hidden = !state.itemImage;
  if ($("item-image-name")) $("item-image-name").textContent = fileName || (state.itemImage ? "Photo attached" : "PNG or JPG");
}

function resetItemImage() {
  if ($("item-image")) $("item-image").value = "";
  paintItemImage("");
}

function renderCatalog() {
  $("catalog").innerHTML = filteredItems()
    .map((i) => {
      const low = Number(i.stock_gm) <= Number(i.reorder_level_gm);
      return `<button class="card" type="button" data-add="${escapeHtml(i.id)}">
        ${cardPhotoHtml(i)}
        <div class="card-body">
          <div class="sku">${escapeHtml(itemVariantText(i) || `${i.category} / ${i.subcategory || "—"}`)}</div>
          <div class="name">${escapeHtml(i.name)} <small>${escapeHtml(itemVariantText(i) || (i.hsn ? `HSN ${i.hsn}` : ""))}</small></div>
          <div class="meta"><span class="card-price">${money(rateFor(i))}${escapeHtml(POSUnits.rateSuffix(itemUnit(i)))}</span><span class="card-qty">${escapeHtml(fmtQty(i.stock_gm, i))}</span></div>
          <div class="stock ${low ? "low" : "ok"}">${escapeHtml(i.code)} · GST ${escapeHtml(i.gst_rate)}%</div>
        </div>
      </button>`;
    })
    .join("");
}

function cartTotals() {
  const lines = state.cart.map((line) => {
    const item = state.items.find((i) => i.id === line.itemId);
    return item ? lineCalc(item, line) : null;
  }).filter(Boolean);
  const D = globalThis.POSDiscount;
  const L = globalThis.POSLoyalty;
  const bill = D
    ? D.computeBill(lines, {
        discountType: state.billDiscountType,
        discountValue: state.billDiscountValue,
      })
    : { subtotal: lines.reduce((s, l) => s + l.taxable, 0), gst: lines.reduce((s, l) => s + l.gst, 0), billDiscount: 0, total: 0, profit: 0 };
  let loyaltyDiscount = 0;
  if (L && state.loyaltySettings && state.loyaltyRedeem > 0) {
    const check = L.canRedeem(state.loyaltyAccount?.points_balance || 0, state.loyaltyRedeem, state.loyaltySettings);
    if (check.ok) loyaltyDiscount = Math.min(bill.total, check.rupees);
  }
  const total = D.round2(Math.max(0, bill.total - loyaltyDiscount));
  const qty = state.cart.reduce((s, l) => s + (Number(l.qtyGm) || 0), 0);
  return {
    qty,
    taxable: bill.subtotal,
    tax: bill.gst,
    discount: bill.billDiscount,
    lineDiscount: lines.reduce((s, l) => s + (l.discount || 0), 0),
    loyalty: loyaltyDiscount,
    profit: D.round2((bill.profit || 0) - loyaltyDiscount),
    total,
  };
}

function renderCart() {
  $("chosen-pack").textContent = packLabel();
  if (!state.cart.length) {
    $("lines").innerHTML = `<p class="hint">Scan a barcode or tap an item.</p>`;
  } else {
    $("lines").innerHTML = state.cart
      .map((line) => {
        const item = state.items.find((i) => i.id === line.itemId);
        if (!item) return "";
        const step = POSUnits.counterStep(itemUnit(item));
        const unit = POSUnits.isCount(itemUnit(item)) ? "pcs" : POSUnits.typeOf(itemUnit(item)).family === "volume" ? "ml" : "g";
        const calc = lineCalc(item, line);
        const bc = String(line.barcode || "").trim();
        const key = cartLineKey(line);
        return `<div class="line">
          <div class="line-main">
            <div class="line-info">
              <div class="who">${escapeHtml(itemVariantText(item) ? `${item.name} · ${itemVariantText(item)}` : item.name)}</div>
              <div class="pack">${escapeHtml(bc || itemVariantText(item) || item.hsn || "")}</div>
            </div>
            <div class="line-ops">
              <div class="qty">
                <button type="button" data-chg="${escapeHtml(key)}" data-d="${-step}">−</button>
                <input class="qty-input" type="number" inputmode="numeric" min="${POSUnits.qtyMin()}" max="${POSUnits.qtyMax()}" step="1" value="${escapeHtml(line.qtyGm)}" data-qty="${escapeHtml(key)}" aria-label="Quantity in ${unit}" />
                <span class="qty-unit">${escapeHtml(unit)}</span>
                <button type="button" data-chg="${escapeHtml(key)}" data-d="${step}">+</button>
              </div>
              <div class="line-amt">${money(calc.taxable + calc.gst)}</div>
            </div>
          </div>
          ${canDiscount() ? `<div class="line-disc">
              <select data-line-disc-type="${escapeHtml(key)}" aria-label="Line discount type">
                <option value="amt"${(line.discountType || "amt") === "amt" ? " selected" : ""}>₹</option>
                <option value="pct"${line.discountType === "pct" ? " selected" : ""}>%</option>
              </select>
              <input data-line-disc="${escapeHtml(key)}" type="number" min="0" step="0.01" value="${escapeHtml(line.discountValue || 0)}" aria-label="Line discount" />
            </div>` : ""}
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
  if ($("disc-total")) $("disc-total").textContent = money((t.discount || 0) + (t.lineDiscount || 0));
  if ($("loyalty-total")) $("loyalty-total").textContent = money(t.loyalty || 0);
  if ($("profit-total")) $("profit-total").textContent = money(t.profit || 0);
  $("total").textContent = money(t.total != null ? t.total : t.taxable + t.tax);
  $("btn-pay").disabled = state.cart.length === 0;
  $("btn-clear").disabled = state.cart.length === 0;
  document.body.classList.toggle("has-cart", state.cart.length > 0);
  paintBillToggleCount();
  if ($("btn-hold")) $("btn-hold").disabled = state.cart.length === 0 || Boolean(state.editingOrderId);
  const payTotal = t.total != null ? t.total : t.taxable + t.tax;
  $("btn-pay").textContent = state.editingOrderId
    ? "Save changes"
    : state.cart.length
      ? `Pay ${money(payTotal)}`
      : "Pay";
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
      dob: fields.dob || "",
      referred_by: fields.referred_by || "",
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

function focusScanLane() {
  const el = $("scan-code");
  if (!el || !document.body.classList.contains("counter-mode")) return;
  const active = document.activeElement;
  if (active && active !== el && active !== $("search") && (active.tagName === "INPUT" || active.tagName === "SELECT" || active.tagName === "TEXTAREA")) {
    return;
  }
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

function paintScanLane(ok, label) {
  const lane = $("scan-form");
  const status = $("scan-status");
  if (status) status.textContent = label || "";
  if (!lane) return;
  lane.classList.toggle("is-hit", Boolean(ok));
  lane.classList.toggle("is-miss", ok === false);
  clearTimeout(paintScanLane._t);
  paintScanLane._t = setTimeout(() => {
    lane.classList.remove("is-hit", "is-miss");
  }, ok ? 600 : 900);
}

async function applyBarcodeScan(raw, sourceEl) {
  const code = globalThis.POSBarcode?.cleanCode ? POSBarcode.cleanCode(raw) : String(raw || "").trim();
  if (!code) return false;
  let item = findItemByBarcode(code);
  if (!item) {
    try {
      const data = await api(`/api/barcodes/lookup?code=${encodeURIComponent(code)}`);
      const match = data.match || data;
      const id = match.item_id || match.id;
      item = state.items.find((i) => i.id === id);
      if (!item && id) {
        try {
          await loadBootstrap();
        } catch {
          /* keep looking */
        }
        item = state.items.find((i) => i.id === id);
      }
    } catch {
      item = null;
    }
  }
  if (item) {
    addItem(item.id, null, code);
    if (sourceEl) sourceEl.value = "";
    if (sourceEl === $("search")) {
      state.query = "";
      renderCatalog();
    }
    paintScanLane(true, item.name);
    setHint(`Added ${item.name}`, "ok");
    focusScanLane();
    return true;
  }
  paintScanLane(false, "Not found");
  setHint(`Barcode not found: ${code}`, "error");
  if (sourceEl === $("scan-code")) sourceEl.select();
  return false;
}

function newCartLineId() {
  return `ln-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function cartLineKey(line) {
  return String(line?.lineId || line?.barcode || line?.itemId || "");
}

function findCartLine(key) {
  const k = String(key || "");
  return state.cart.find((l) => cartLineKey(l) === k) || null;
}

function isPieceBarcodeLine(line, item) {
  return Boolean(String(line?.barcode || "").trim()) && POSUnits.isCount(itemUnit(item || {}));
}

function addItem(id, qtyGm, lineBarcode) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  const add = qtyGm == null ? POSUnits.counterStep(itemUnit(item)) : Number(qtyGm);
  const code = String(lineBarcode || "").trim();
  const count = POSUnits.isCount(itemUnit(item));
  if (code) {
    const existing = state.cart.find((l) => String(l.barcode || "").trim() === code);
    if (existing) {
      if (count) {
        setHint("This piece is already on the bill", "error");
        return;
      }
      existing.qtyGm = POSUnits.clampQty(Number(existing.qtyGm) + add);
      renderCart();
      return;
    }
    state.cart.push({
      lineId: newCartLineId(),
      itemId: id,
      qtyGm: POSUnits.clampQty(count ? 1 : add),
      discountType: "amt",
      discountValue: 0,
      barcode: code,
    });
    renderCart();
    return;
  }
  const line = state.cart.find((l) => l.itemId === id && !String(l.barcode || "").trim());
  if (line) line.qtyGm = POSUnits.clampQty(Number(line.qtyGm) + add);
  else {
    state.cart.push({
      lineId: newCartLineId(),
      itemId: id,
      qtyGm: POSUnits.clampQty(add),
      discountType: "amt",
      discountValue: 0,
      barcode: "",
    });
  }
  state.cart = state.cart.filter((l) => l.qtyGm > 0);
  renderCart();
}

function setLineQty(key, qtyGm) {
  const line = findCartLine(key);
  if (!line) return;
  const item = state.items.find((i) => i.id === line.itemId);
  const next = POSUnits.clampQty(qtyGm);
  if (next <= 0) state.cart = state.cart.filter((l) => cartLineKey(l) !== String(key));
  else if (isPieceBarcodeLine(line, item)) line.qtyGm = 1;
  else line.qtyGm = next;
  renderCart();
}

function changeLineQty(key, delta) {
  const line = findCartLine(key);
  if (!line) return;
  const item = state.items.find((i) => i.id === line.itemId);
  if (isPieceBarcodeLine(line, item)) {
    if (Number(delta) < 0) setLineQty(key, 0);
    else setHint("Scan the next piece barcode", "ok");
    return;
  }
  setLineQty(key, Number(line.qtyGm) + Number(delta));
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
  const footwear = isFootwearShop();
  $("items-table").innerHTML = `<table><thead><tr>
      <th>Code</th><th>Item</th><th>Barcode</th>${footwear ? "<th>Type</th><th>Colour</th><th>Size</th>" : "<th>HSN</th>"}<th>Unit</th><th>${footwear ? "Style" : "Category"}</th><th>${footwear ? "Brand" : "Subcategory"}</th><th>Retail</th><th>B2B</th><th>Stock</th><th></th>
  </tr></thead><tbody>${state.items
    .map((i) => {
      const src = itemPhotoUrl(i);
      const thumb = src
        ? `<img class="item-thumb" src="${escapeHtml(src)}" alt="">`
        : `<span class="item-thumb-empty" aria-hidden="true">${escapeHtml(itemPhotoLetter(i))}</span>`;
      const extra = footwear
        ? `<td>${escapeHtml(globalThis.POSFootwear?.wearerLabel(i.wearer_type) || "—")}</td>
      <td>${escapeHtml(i.color || "—")}</td>
      <td>${escapeHtml(i.size || "—")}</td>`
        : `<td>${escapeHtml(i.hsn || "—")}</td>`;
      return `<tr>
      <td>${escapeHtml(i.code)}</td>
      <td class="item-name-cell">${thumb}${escapeHtml(i.name)}</td>
      <td>${escapeHtml(i.barcode || "—")}</td>
      ${extra}
      <td>${escapeHtml(itemUnit(i))}</td>
      <td>${escapeHtml(i.category)}</td>
      <td>${escapeHtml(i.subcategory || "—")}</td>
      <td>${money(i.retail_rate)}${escapeHtml(POSUnits.rateSuffix(itemUnit(i)))}</td>
      <td>${money(i.b2b_rate)}${escapeHtml(POSUnits.rateSuffix(itemUnit(i)))}</td>
      <td class="${Number(i.stock_gm) <= Number(i.reorder_level_gm) ? "stock low" : "stock ok"}">${escapeHtml(fmtQty(i.stock_gm, i))}</td>
      <td><button class="btn" data-edit-item="${escapeHtml(i.id)}" type="button">Edit</button>
          <button class="btn" data-recv="${escapeHtml(i.id)}" type="button">${escapeHtml(POSUnits.receiveLabel(itemUnit(i)))}</button></td>
    </tr>`;
    })
    .join("")}</tbody></table>`;
}

function renderCustomersTable() {
  $("customers-table").innerHTML = `<table><thead><tr>
    <th>Code</th><th>Name</th><th>Type</th><th>Mobile</th><th>State</th><th>GSTIN</th><th>Outstanding</th>
  </tr></thead><tbody>${state.customers
    .map(
      (c) => `<tr>
      <td>${escapeHtml(c.code)}</td>
      <td>${escapeHtml(c.business_name || c.name)}</td>
      <td>${escapeHtml(c.type)}</td>
      <td>${escapeHtml(c.mobile)}</td>
      <td>${escapeHtml(c.state || "—")}</td>
      <td>${escapeHtml(c.gstin || "—")}</td>
      <td>${money(c.outstanding)}</td>
    </tr>`,
    )
    .join("")}</tbody></table>`;
}

function packComposeItems() {
  const seen = new Set();
  const list = [];
  for (const item of activeItems()) {
    seen.add(item.id);
    list.push(item);
  }
  const editing = state.packs.find((p) => p.id === $("pack-id")?.value);
  for (const row of editing?.items || []) {
    if (seen.has(row.item_id)) continue;
    const item = state.items.find((x) => x.id === row.item_id);
    if (item) {
      seen.add(item.id);
      list.push(item);
    }
  }
  return list;
}

function readPackFormItems() {
  return [...document.querySelectorAll("[data-pack-item]:checked")]
    .map((box) => ({
      item_id: box.dataset.packItem,
      quantity_gm: POSUnits.clampQty(document.querySelector(`[data-pack-qty="${box.dataset.packItem}"]`)?.value),
    }))
    .filter((row) => row.quantity_gm > 0);
}

function resetPackForm() {
  $("pack-form").reset();
  if ($("pack-id")) $("pack-id").value = "";
  if ($("pack-save")) $("pack-save").textContent = "Save pack";
  renderPackCompose();
}

function fillPackForm(pack) {
  if (!pack) return;
  $("pack-id").value = pack.id;
  $("pack-name").value = pack.name;
  if ($("pack-save")) $("pack-save").textContent = "Update pack";
  renderPackCompose();
  const byItem = new Map((pack.items || []).map((row) => [row.item_id, row]));
  document.querySelectorAll("[data-pack-item]").forEach((box) => {
    const row = byItem.get(box.dataset.packItem);
    box.checked = Boolean(row);
    const qty = document.querySelector(`[data-pack-qty="${box.dataset.packItem}"]`);
    if (row && qty) qty.value = Number(row.quantity_gm) || qty.value;
  });
  $("pack-hint").textContent = `Editing ${pack.code || pack.name}`;
  $("pack-hint").className = "hint";
  $("pack-form")?.scrollIntoView({ block: "start" });
  $("pack-name")?.focus();
}

function renderPackCompose() {
  $("pack-lines").innerHTML = packComposeItems()
    .map(
      (i) => `<label>
        <input type="checkbox" data-pack-item="${escapeHtml(i.id)}" />
        ${escapeHtml(i.name)} (${escapeHtml(i.subcategory || i.category)})
        <input type="number" min="${POSUnits.qtyMin()}" max="${POSUnits.qtyMax()}" step="1" value="${POSUnits.isCount(itemUnit(i)) ? 1 : 500}" data-pack-qty="${escapeHtml(i.id)}" /> ${escapeHtml(POSUnits.isCount(itemUnit(i)) ? "pcs" : POSUnits.typeOf(itemUnit(i)).family === "volume" ? "ml" : "g")}
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
  const rows = [];
  const panels = [];
  for (const i of items) {
    const unit = itemUnit(i);
    const qty = POSUnits.isCount(unit) ? 1 : 1000;
    const search = [i.name, i.hsn, i.code, i.category, i.subcategory].join(" ").toLowerCase();
    if (POSUnits.isCount(unit)) {
      panels.push(`<div class="po-bc-panel" data-po-bc-row="${escapeHtml(i.id)}" hidden>
        <div class="po-bc-box">
          <div class="po-bc-head">
            <strong>Barcodes for ${escapeHtml(i.name)}</strong>
            <span class="hint" data-po-bc-count="${escapeHtml(i.id)}">0 / ${qty} — type or scan, one per piece</span>
          </div>
          <input class="po-bc-scan" data-po-bc-scan="${escapeHtml(i.id)}" maxlength="64" placeholder="Scan or type one barcode, then Enter" autocomplete="off" />
          <textarea class="po-bc-list" data-po-barcodes="${escapeHtml(i.id)}" rows="4" placeholder="One barcode per line — ${qty} pcs needs ${qty} codes"></textarea>
        </div>
      </div>`);
    }
    rows.push(`<tr data-po-row="${escapeHtml(i.id)}" data-po-search="${escapeHtml(search)}" data-po-unit="${escapeHtml(unit)}">
        <td class="po-check"><input type="checkbox" data-po-item="${escapeHtml(i.id)}" /></td>
        <td class="po-name">${escapeHtml(i.name)}</td>
        <td class="po-hsn">${escapeHtml(i.hsn || "—")}</td>
        <td><input type="number" min="${POSUnits.qtyMin()}" max="${POSUnits.qtyMax()}" step="1" value="${qty}" data-po-qty="${escapeHtml(i.id)}" /></td>
        <td class="po-unit">${escapeHtml(poUnitLabel(i))}</td>
        <td><div class="po-rate-cell"><input type="number" min="0" step="0.01" value="${escapeHtml(i.purchase_rate)}" data-po-rate="${escapeHtml(i.id)}" /><span class="po-suffix">₹${escapeHtml(POSUnits.rateSuffix(unit))}</span></div></td>
        <td><input type="date" data-po-expiry="${escapeHtml(i.id)}" /></td>
        <td class="num" data-po-amt="${escapeHtml(i.id)}">${money(POSUnits.lineAmount(qty, i.purchase_rate, unit))}</td>
      </tr>`);
  }
  el.innerHTML = `<div class="po-table-wrap"><table class="po-table"><thead><tr>
    <th class="po-check"></th><th>Item</th><th>HSN</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Expiry</th><th class="num">Amount</th>
  </tr></thead><tbody>${rows.join("")}</tbody></table></div>
    <div id="po-barcode-panels">${panels.join("")}</div>`;
  filterPoLines();
  paintPoTotals();
  refreshPoBarcodeRows();
}

function filterPoLines() {
  const q = ($("po-item-search")?.value || "").trim().toLowerCase();
  document.querySelectorAll("#po-lines tbody tr[data-po-row]").forEach((tr) => {
    const hay = tr.dataset.poSearch || "";
    const hide = Boolean(q) && !hay.includes(q);
    tr.hidden = hide;
    const bc = document.querySelector(`[data-po-bc-row="${tr.dataset.poRow}"]`);
    if (bc && hide) bc.hidden = true;
  });
  if (!q) refreshPoBarcodeRows();
}

function parsePoBarcodes(raw) {
  if (globalThis.POSBarcode?.parseManualCodes) return POSBarcode.parseManualCodes(raw);
  return String(raw || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function refreshPoBarcodeRows() {
  document.querySelectorAll("[data-po-bc-row]").forEach((row) => {
    const id = row.dataset.poBcRow;
    const box = document.querySelector(`[data-po-item="${id}"]`);
    const qty = Math.max(0, Math.round(Number(document.querySelector(`[data-po-qty="${id}"]`)?.value) || 0));
    row.hidden = !box?.checked;
    const ta = document.querySelector(`[data-po-barcodes="${id}"]`);
    let n = 0;
    try {
      n = parsePoBarcodes(ta?.value).length;
    } catch {
      n = 0;
    }
    const countEl = document.querySelector(`[data-po-bc-count="${id}"]`);
    if (countEl) {
      countEl.textContent = `${n} / ${qty} — type or scan, one barcode per piece`;
      countEl.className = n === qty && qty > 0 ? "hint ok" : "hint";
    }
    if (ta) {
      ta.placeholder = `${qty} barcode${qty === 1 ? "" : "s"}, one per line`;
      ta.rows = Math.min(8, Math.max(3, qty));
    }
  });
}

function paintPoLineAmount(itemId) {
  const qty = Number(document.querySelector(`[data-po-qty="${itemId}"]`)?.value) || 0;
  const rate = Number(document.querySelector(`[data-po-rate="${itemId}"]`)?.value) || 0;
  const unit = document.querySelector(`[data-po-row="${itemId}"]`)?.dataset.poUnit || "GM";
  const cell = document.querySelector(`[data-po-amt="${itemId}"]`);
  if (cell) cell.textContent = money(POSUnits.lineAmount(qty, rate, unit));
  refreshPoBarcodeRows();
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
  refreshPoBarcodeRows();
}

function renderPacksTable() {
  if (!state.packs.length) {
    $("packs-table").innerHTML = `<p class="hint">No pack types yet. Save one above.</p>`;
    return;
  }
  $("packs-table").innerHTML = state.packs
    .map(
      (p) => `<div class="report-card pack-card">
        <div class="pack-card-head">
          <div>
            <strong>${escapeHtml(p.name)}</strong>
            <span>${escapeHtml(p.code)} · ${escapeHtml(kg(p.total_quantity_gm))}</span>
          </div>
          <button class="btn" type="button" data-edit-pack="${escapeHtml(p.id)}">Edit</button>
        </div>
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
  if ($("set-city")) $("set-city").value = state.company.city || "";
  if ($("set-state")) $("set-state").value = state.company.state || "";
  if ($("set-pincode")) $("set-pincode").value = state.company.pincode || state.company.pin_code || "";
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

function paintPlatformSupport() {
  const phone = state.support?.support_phone;
  const el = $("session-support");
  if (!el) return;
  const tel = window.SupportPage?.telHref(phone) || "";
  if (phone && tel) {
    el.hidden = false;
    el.innerHTML = `<a href="${tel}">Support ${escapeHtml(phone)}</a>`;
  } else {
    el.hidden = true;
    el.textContent = "";
  }
}

function copyText(text) {
  const value = String(text || "");
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value).catch(() => copyTextFallback(value));
  }
  return copyTextFallback(value);
}

function copyTextFallback(text) {
  return new Promise((resolve, reject) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (ok) resolve();
    else reject(new Error("copy failed"));
  });
}

function bindSupportCopy(root) {
  root.querySelectorAll("[data-copy-phone]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const phone = btn.getAttribute("data-copy-phone") || "";
      const label = btn.getAttribute("data-idle-label") || btn.textContent;
      btn.setAttribute("data-idle-label", label);
      try {
        await copyText(phone);
        btn.textContent = "Copied";
      } catch {
        btn.textContent = "Copy failed";
      }
      setTimeout(() => {
        btn.textContent = label;
      }, 1400);
    });
  });
}

function renderSupport() {
  const root = $("support-page");
  if (!root || !window.SupportPage?.pageHtml) return;
  root.innerHTML = SupportPage.pageHtml(state.support, state.company);
  bindSupportCopy(root);
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
  fillFootwearFilters();
  renderItemsTable();
  renderUnitsTable();
  renderCustomersTable();
  renderPackCompose();
  renderPacksTable();
  renderSettings();
  renderPoLines();
  fillExpenseCategories();
  void Promise.all([loadToday(), loadDashboard(), loadSuppliers().catch(() => {}), loadHolds().catch(() => {})]);
  void loadCustomerLoyalty();
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
  fillItemPicker("stk-item-list", "stk-item-search", "stk-item");
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
  state.staff = rows;
  $("staff-table").innerHTML = `<table><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${rows
    .map(
      (u) => `<tr>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.first_name)} ${escapeHtml(u.last_name)}</td>
      <td>${escapeHtml(u.role)}</td>
      <td>${escapeHtml(u.status)}</td>
      <td><button class="btn" type="button" data-edit-staff="${escapeHtml(u.id)}">Edit</button></td>
    </tr>`,
    )
    .join("")}</tbody></table>`;
}

function fillStaffForm(u) {
  $("st-id").value = u?.id || "";
  $("st-first").value = u?.first_name || "";
  $("st-email").value = u?.email || "";
  $("st-pass").value = "";
  $("st-pass").required = !u;
  $("st-pass").placeholder = u ? "Leave blank to keep current password" : "";
  $("st-role").value = u?.role || "cashier";
  $("staff-save").textContent = u ? "Update staff" : "Save";
  if ($("staff-cancel")) $("staff-cancel").hidden = !u;
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
  if (!$("rep-from").value || !$("rep-to").value) applyFyRange("rep-from", "rep-to", null, "rep-fy-year");
  else fillFyYearSelect("rep-fy-year", indianFinancialYear($("rep-from").value || ymd()).startYear);
  const from = $("rep-from").value;
  const to = $("rep-to").value;
  $("rep-excel-all").href = excelHref();
  $("reports-hint").textContent = "Loading…";
  try {
    const data = await api(`/api/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    const s = data.summary || {};
    const gs = s.gstSummary || {};
    const out = gs.output || {};
    const net = gs.net || {};
    $("report-summary").innerHTML = [
      ["Range", `${data.from} → ${data.to}`],
      ["Financial year", indianFinancialYear(data.from).label],
      ["Bills", s.bills ?? 0],
      ["Taxable", money(s.taxable)],
      ["Output CGST", money(out.cgst)],
      ["Output SGST", money(out.sgst)],
      ["Output IGST", money(out.igst)],
      ["Output GST", money(s.gst)],
      ["Input GST", money(s.inputGst)],
      ["Net GST", money(s.netGst)],
      ["Net CGST", money(net.cgst)],
      ["Net SGST", money(net.sgst)],
      ["Net IGST", money(net.igst)],
      ["Takings", money(s.takings)],
      ["Expenses", money(s.expenses)],
      ["Low stock SKUs", (data.low || []).length],
    ]
      .map(([k, v]) => `<div class="report-card"><span>${k}</span><strong>${v}</strong></div>`)
      .join("");
    $("reports").innerHTML = [
      reportBlock("GST summary (India)", "GST summary", ["Type", "CGST", "SGST", "IGST", "Total GST"], gstSummaryRows(s)),
      reportBlock("Sales bills", "Sales bills", ["Order", "Customer", "Type", "Pack", "Pack count", "Status", "Qty g", "Taxable", "GST", "Total", "Pay", "Pay status", "Date"], (data.sales || []).map((o) => [o.order_number, o.customer_name, o.customer_type, o.pack_name || "Loose items", Number(o.pack_count) || 0, o.status, Number(o.total_quantity_gm) || 0, Number(o.subtotal) || 0, Number(o.gst) || 0, Number(o.total) || 0, o.payment_method, o.payment_status, formatShopDateTime(o.created_at)])),
      reportBlock("Item sales", "Item sales", ["Item", "Qty g", "Amount", "GST"], (data.byItem || []).map((r) => [r.item_name, Number(r.quantity_gm) || 0, Number(r.amount) || 0, Number(r.gst) || 0])),
      reportBlock("Customer sales", "Customer sales", ["Customer", "Type", "Bills", "Takings", "GST"], (data.byCustomer || []).map((r) => [r.customer_name, r.customer_type, Number(r.bills) || 0, Number(r.takings) || 0, Number(r.gst) || 0])),
      reportBlock("Pack sales", "Pack sales", ["Pack type", "Pack count", "Bills", "Takings"], (data.byPack || []).map((r) => [r.pack_type, Number(r.pack_count) || 0, Number(r.bills) || 0, Number(r.takings) || 0])),
      reportBlock("Payment", "Payment", ["Method", "Bills", "Takings"], (data.byPay || []).map((r) => [r.payment_method, Number(r.bills) || 0, Number(r.takings) || 0])),
      reportBlock("Payment daywise", "Payment daywise", ["Day", "Cash", "UPI", "Card", "Credit", "Other", "Bills", "Total"], (data.payDaywise || []).map((r) => [reportDay(r.day), Number(r.cash) || 0, Number(r.upi) || 0, Number(r.card) || 0, Number(r.credit) || 0, Number(r.other) || 0, Number(r.bills) || 0, Number(r.total) || 0])),
      reportBlock("GST daywise", "GST daywise", ["Day", "Taxable", "GST", "Total"], (data.gst || []).map((r) => [reportDay(r.day), Number(r.taxable) || 0, Number(r.gst) || 0, Number(r.total) || 0])),
      reportBlock("GST output by rate", "GST output by rate", ["GST %", "Taxable", "CGST", "SGST", "IGST", "Total GST", "Bills"], gstRateRows(data.gstByRate)),
      reportBlock("GST input by rate", "GST input by rate", ["GST %", "Taxable", "CGST", "SGST", "IGST", "Total GST"], gstRateRows(data.gstInputByRate, false)),
      reportBlock("GST HSN itemwise", "GST HSN itemwise", ["HSN/SKU", "Item", "GST %", "Qty g", "Taxable", "GST"], (data.gstHsn || []).map((r) => [r.hsn, r.item_name, Number(r.gst_rate) || 0, Number(r.quantity_gm) || 0, Number(r.taxable) || 0, Number(r.gst) || 0])),
      reportBlock("GST B2B sales", "GST B2B sales", ["Bill", "Date", "Customer", "GSTIN", "Taxable", "CGST", "SGST", "IGST", "Total", "Supply"], (data.gstB2B || []).map((r) => [r.order_number, reportDay(r.bill_date), r.customer_name, r.gstin, Number(r.taxable) || 0, Number(r.cgst) || 0, Number(r.sgst) || 0, Number(r.igst) || 0, Number(r.total) || 0, r.interState ? "Inter-state" : "Intra-state"])),
      reportBlock("GST B2C sales", "GST B2C sales", ["Bill", "Date", "Customer", "Taxable", "CGST", "SGST", "IGST", "Total", "Supply"], (data.gstB2C || []).map((r) => [r.order_number, reportDay(r.bill_date), r.customer_name, Number(r.taxable) || 0, Number(r.cgst) || 0, Number(r.sgst) || 0, Number(r.igst) || 0, Number(r.total) || 0, r.interState ? "Inter-state" : "Intra-state"])),
      reportBlock("Stock", "Stock", ["Code", "Name", "HSN", "Category", "Subcategory", "Stock g", "Reorder g", "Retail", "B2B", "Purchase", "GST %"], (data.stock || []).map((i) => [i.code, i.name, i.hsn, i.category, i.subcategory, Number(i.stock_gm) || 0, Number(i.reorder_level_gm) || 0, Number(i.retail_rate) || 0, Number(i.b2b_rate) || 0, Number(i.purchase_rate) || 0, Number(i.gst_rate) || 0])),
      reportBlock("Low stock", "Low stock", ["Code", "Name", "Stock g", "Reorder g"], (data.low || []).map((i) => [i.code, i.name, Number(i.stock_gm) || 0, Number(i.reorder_level_gm) || 0])),
      reportBlock("Purchases", "Purchases", ["PO", "Supplier", "Invoice", "Date", "Taxable", "GST", "Total", "Pay", "Status"], (data.purchases || []).map((p) => [p.purchase_number, p.supplier_name, p.supplier_invoice_number, p.purchase_date, Number(p.subtotal) || 0, Number(p.gst) || 0, Number(p.total) || 0, p.payment_method, p.payment_status])),
      reportBlock("Expenses", "Expenses", ["No.", "Date", "Category", "Amount", "GST", "Total", "Pay", "Notes"], (data.expenses || []).map((e) => [e.expense_number, e.expense_date, e.category, Number(e.amount) || 0, Number(e.gst) || 0, Number(e.total) || (Number(e.amount) || 0) + (Number(e.gst) || 0), e.payment_method, e.notes])),
      reportBlock("Customers", "Customers", ["Code", "Name", "Business", "Mobile", "Type", "State", "GSTIN", "Credit limit", "Outstanding"], (data.customers || []).map((c) => [c.code, c.name, c.business_name, c.mobile, c.type, c.state, c.gstin, Number(c.credit_limit) || 0, Number(c.outstanding) || 0])),
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

function getInvoiceLook() {
  try {
    const stored = localStorage.getItem("pos-invoice-look");
    if (stored === "office" || stored === "duplicate") return stored;
    return "pos";
  } catch {
    return "pos";
  }
}

function setInvoiceLook(look) {
  const next = look === "office" || look === "duplicate" ? look : "pos";
  try {
    localStorage.setItem("pos-invoice-look", next);
  } catch {
    /* ignore quota */
  }
  return next;
}

function invoiceModalPrintActions(look) {
  return `<div class="print-actions">
      <button class="btn${look === "pos" ? " primary" : ""}" type="button" id="modal-print-pos">Print POS slip</button>
      <button class="btn${look === "office" ? " primary" : ""}" type="button" id="modal-print-office">Print official bill</button>
      <button class="btn${look === "duplicate" ? " primary" : ""}" type="button" id="modal-print-duplicate">Print duplicate</button>
    </div>`;
}

function bindInvoiceModalPrint(order) {
  const pos = $("modal-print-pos");
  const office = $("modal-print-office");
  const dup = $("modal-print-duplicate");
  if (pos) pos.onclick = () => printOrder(order, "pos");
  if (office) office.onclick = () => printOrder(order, "office");
  if (dup) dup.onclick = () => printOrder(order, "duplicate");
}

function invoiceLookTabs(look) {
  return `<div class="invoice-look-tabs" role="tablist">
      <button class="btn${look === "pos" ? " primary" : ""}" type="button" data-invoice-look="pos" role="tab" aria-selected="${look === "pos"}">POS slip</button>
      <button class="btn${look === "office" ? " primary" : ""}" type="button" data-invoice-look="office" role="tab" aria-selected="${look === "office"}">Official bill</button>
      <button class="btn${look === "duplicate" ? " primary" : ""}" type="button" data-invoice-look="duplicate" role="tab" aria-selected="${look === "duplicate"}">Duplicate</button>
    </div>`;
}

function invoicePreviewHtml(o, look) {
  if (look === "office" || look === "duplicate") {
    return `<div class="office-preview">${InvoicePrint.officeInvoiceBody(o, invoiceCtx(), { copy: look === "duplicate" ? "duplicate" : "original" })}</div>`;
  }
  return `<div class="thermal-preview">${InvoicePrint.invoiceBody(o, invoiceCtx())}</div>`;
}

function printOrder(o, look) {
  const kind = look || getInvoiceLook();
  const office = kind === "office" || kind === "duplicate";
  const copy = kind === "duplicate" ? "duplicate" : "original";
  const name = kind === "duplicate" ? "invoice-print-office-dup" : office ? "invoice-print-office" : "invoice-print";
  const w = window.open("", name, office ? "width=900,height=1100" : "width=400,height=720");
  if (!w) {
    setHint("Allow pop-ups to print invoices", "error");
    return;
  }
  w.document.write(
    office
      ? InvoicePrint.officeInvoiceDocument(o, invoiceCtx(), { copy })
      : InvoicePrint.thermalInvoiceDocument(o, invoiceCtx()),
  );
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
  const look = getInvoiceLook();
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
    ${invoiceLookTabs(look)}
    ${invoicePreviewHtml(o, look)}
    <div class="print-actions">
      <button class="btn${look === "pos" ? " primary" : ""}" type="button" data-print="${escapeHtml(o.id)}" data-print-look="pos">Print POS slip</button>
      <button class="btn${look === "office" ? " primary" : ""}" type="button" data-print="${escapeHtml(o.id)}" data-print-look="office">Print official bill</button>
      <button class="btn${look === "duplicate" ? " primary" : ""}" type="button" data-print="${escapeHtml(o.id)}" data-print-look="duplicate">Print duplicate</button>
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

async function showPurchase(p) {
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
      <button class="btn" type="button" data-print-po-barcodes="${escapeHtml(p.id)}">Print barcodes</button>
    </div>
    <div id="purchase-barcodes"><p class="hint">Loading barcodes…</p></div>`;
  try {
    const rows = await api(`/api/barcodes?purchase_id=${encodeURIComponent(p.id)}`);
    const codes = (Array.isArray(rows) ? rows : []).filter((r) => r.barcode);
    const box = $("purchase-barcodes");
    if (!box) return;
    box.innerHTML = codes.length
      ? `<p class="hint ok">${codes.length} barcode${codes.length === 1 ? "" : "s"} on this purchase</p>
         <ul class="po-bc-saved">${codes
           .map((r) => `<li><code>${escapeHtml(r.barcode)}</code> · ${escapeHtml(r.item_name || "")}</li>`)
           .join("")}</ul>`
      : '<p class="hint">No barcodes on this purchase.</p>';
  } catch {
    const box = $("purchase-barcodes");
    if (box) box.innerHTML = "";
  }
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
  if (!$("acc-from")?.value || !$("acc-to")?.value) applyFyRange("acc-from", "acc-to", "acc-asof", "acc-fy-year");
  else fillFyYearSelect("acc-fy-year", indianFinancialYear($("acc-from").value || ymd()).startYear);
  if (!$("acc-asof")?.value) $("acc-asof").value = $("acc-to").value;
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
  if (!$("exp-from")?.value || !$("exp-to")?.value) applyFyRange("exp-from", "exp-to", null, "exp-fy-year");
  else fillFyYearSelect("exp-fy-year", indianFinancialYear($("exp-from")?.value || ymd()).startYear);
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
  if (btn) {
    addItem(btn.dataset.add);
    focusScanLane();
  }
});
$("lines").addEventListener("click", (e) => {
  if (e.target.closest("[data-qty]")) return;
  const btn = e.target.closest("[data-chg]");
  if (!btn) return;
  changeLineQty(btn.dataset.chg, Number(btn.dataset.d));
});
$("lines").addEventListener("focusin", (e) => {
  const input = e.target.closest("[data-qty]");
  if (input && typeof input.select === "function") input.select();
});
$("lines").addEventListener("change", (e) => {
  const input = e.target.closest("[data-qty]");
  if (input) {
    setLineQty(input.dataset.qty, input.value);
    return;
  }
  const disc = e.target.closest("[data-line-disc]");
  if (disc) {
    const line = findCartLine(disc.dataset.lineDisc);
    if (line) line.discountValue = Number(disc.value) || 0;
    renderCart();
    return;
  }
  const dtype = e.target.closest("[data-line-disc-type]");
  if (dtype) {
    const line = findCartLine(dtype.dataset.lineDiscType);
    if (line) line.discountType = dtype.value === "pct" ? "pct" : "amt";
    renderCart();
  }
});
$("lines").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const input = e.target.closest("[data-qty]");
  if (!input) return;
  e.preventDefault();
  input.blur();
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
    if ($("item-wearer")) $("item-wearer").value = globalThis.POSFootwear?.normalizeWearer(i.wearer_type) || "";
    if ($("item-color")) $("item-color").value = i.color || "";
    if ($("item-size")) $("item-size").value = i.size || "";
    $("item-retail").value = i.retail_rate;
    if ($("item-mrp")) $("item-mrp").value = i.mrp || i.retail_rate || "";
    if ($("item-barcode")) $("item-barcode").value = i.barcode || "";
    if ($("item-mfr-barcode")) $("item-mfr-barcode").value = "";
    if ($("item-barcode-qty")) $("item-barcode-qty").value = "";
    $("item-b2b").value = i.b2b_rate;
    $("item-purchase").value = i.purchase_rate;
    $("item-gst").value = i.gst_rate;
    fillItemUnitSelect(itemUnit(i));
    $("item-unit").value = itemUnit(i);
    $("item-stock").value = POSUnits.fromBase(i.stock_gm, itemUnit(i));
    refreshItemUnitLabels();
    paintItemImage(itemPhotoUrl(i));
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
$("bill-toggle")?.addEventListener("click", () => {
  setBillCollapsed(!document.body.classList.contains("bill-collapsed"));
});
restoreBillCollapsed();

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

$("purchase-pane").addEventListener("click", async (e) => {
  const printBtn = e.target.closest("[data-print-purchase]");
  if (printBtn) {
    const p = purchaseCache.find((row) => row.id === printBtn.dataset.printPurchase);
    if (p) printPurchase(p);
    return;
  }
  const bcBtn = e.target.closest("[data-print-po-barcodes]");
  if (!bcBtn) return;
  try {
    const rows = await api(`/api/barcodes?purchase_id=${encodeURIComponent(bcBtn.dataset.printPoBarcodes)}`);
    const labels = (Array.isArray(rows) ? rows : [])
      .filter((r) => r.barcode)
      .map((r) => ({
        name: r.item_name,
        barcode: r.barcode,
        mrp: r.label_mrp || r.mrp,
        rate: r.retail_rate,
        copies: 1,
      }));
    if (!labels.length) throw new Error("No purchase barcodes yet — save this bill again after the update");
    if (!globalThis.POSBarcode?.printLabels(labels, 1)) setHint("Allow pop-ups to print barcodes", "error");
  } catch (err) {
    setHint(err.message, "error");
  }
});

$("order-pane").addEventListener("click", async (e) => {
  const lookBtn = e.target.closest("[data-invoice-look]");
  if (lookBtn) {
    setInvoiceLook(lookBtn.dataset.invoiceLook);
    const current = orderCache.find((row) => row.id === selectedOrderId);
    if (current) showOrder(current);
    return;
  }
  const printBtn = e.target.closest("[data-print]");
  const editBtn = e.target.closest("[data-edit-order]");
  const statusBtn = e.target.closest("[data-set-order-status]");
  if (printBtn) {
    const o = orderCache.find((row) => row.id === printBtn.dataset.print);
    if (o) printOrder(o, printBtn.dataset.printLook);
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
$("wearer-filter")?.addEventListener("change", () => {
  state.wearerFilter = $("wearer-filter").value;
  renderCatalog();
});
$("size-filter")?.addEventListener("change", () => {
  state.sizeFilter = $("size-filter").value;
  renderCatalog();
});
$("color-filter")?.addEventListener("change", () => {
  state.colorFilter = $("color-filter").value;
  renderCatalog();
});
$("scan-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  await applyBarcodeScan($("scan-code")?.value, $("scan-code"));
});
$("search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = String($("search").value || "").trim();
  if (!code) return;
  const scanned = await applyBarcodeScan(code, $("search"));
  if (!scanned) $("search").focus();
});
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
  state.billDiscountValue = 0;
  state.loyaltyRedeem = 0;
  if ($("bill-disc-value")) $("bill-disc-value").value = 0;
  if ($("loyalty-redeem")) $("loyalty-redeem").value = 0;
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
    const cartSnapshot = state.cart.map((l) => ({ ...l }));
    const payload = {
      customerId: state.customerId,
      paymentMethod: $("pay-method").value,
      packId: state.lastPack?.id || null,
      packCount: state.lastPack?.count || null,
      discountType: state.billDiscountType,
      discountValue: state.billDiscountValue,
      discount: cartTotals().discount,
      loyaltyPoints: state.loyaltyRedeem,
      lines: state.cart.map((l) => ({
        itemId: l.itemId,
        quantity_gm: l.qtyGm,
        discountType: l.discountType || "amt",
        discountValue: l.discountValue || 0,
        barcode: l.barcode || "",
      })),
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
        lines: cartSnapshot.map((l) => {
          const item = state.items.find((i) => i.id === l.itemId);
          return {
            item_id: l.itemId,
            item_name: itemBillName(item),
            quantity_gm: l.qtyGm,
            rate_per_kg: item ? rateFor(item) : 0,
            amount: item ? lineAmt(item, l.qtyGm) : 0,
            gst_rate: item?.gst_rate || 0,
          };
        }),
      };
    }
    showOrder(receiptOrder);
    const look = getInvoiceLook();
    $("modal-title").textContent = `Invoice ${orderLabel(order, result)}`;
    $("modal-body").innerHTML = `<p class="hint ok">Bill saved. POS cleared for the next customer.</p>
      ${invoiceLookTabs(look)}
      ${invoicePreviewHtml(receiptOrder, look)}
      ${invoiceModalPrintActions(look)}`;
    $("modal").hidden = false;
    const bindModalLook = () => {
      $("modal-body").querySelectorAll("[data-invoice-look]").forEach((btn) => {
        btn.onclick = () => {
          const next = setInvoiceLook(btn.dataset.invoiceLook);
          $("modal-body").innerHTML = `<p class="hint ok">Bill saved. POS cleared for the next customer.</p>
            ${invoiceLookTabs(next)}
            ${invoicePreviewHtml(receiptOrder, next)}
            ${invoiceModalPrintActions(next)}`;
          bindInvoiceModalPrint(receiptOrder);
          bindModalLook();
        };
      });
    };
    bindInvoiceModalPrint(receiptOrder);
    bindModalLook();
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
    category: $("item-category").value || defaultItemCategory(),
    subcategory: $("item-subcategory").value,
    color: $("item-color")?.value || "",
    size: $("item-size")?.value || "",
    wearer_type: $("item-wearer")?.value || "",
    base_unit: unit,
    unit,
    retail_rate: $("item-retail").value,
    b2b_rate: $("item-b2b").value,
    purchase_rate: $("item-purchase").value,
    gst_rate: $("item-gst").value,
    mrp: $("item-mrp")?.value || "",
    barcode: POSUnits.isCount(unit) ? ($("item-barcode")?.value || "") : "",
    mfr_barcode: POSUnits.isCount(unit) ? ($("item-mfr-barcode")?.value || "") : "",
    barcode_qty: POSUnits.isCount(unit) ? Number($("item-barcode-qty")?.value) || 0 : 0,
    stock_gm: POSUnits.toBase($("item-stock").value, unit),
    image_url: state.itemImage || "",
  };
  try {
    if ($("item-id").value) await api(`/api/items/${$("item-id").value}`, { method: "PUT", body: JSON.stringify(body) });
    else await api("/api/items", { method: "POST", body: JSON.stringify(body) });
    $("item-hint").textContent = "Saved";
    $("item-hint").className = "hint ok";
    $("item-form").reset();
    $("item-id").value = "";
    resetItemImage();
    fillItemUnitSelect(defaultItemUnit());
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
  resetItemImage();
  fillItemUnitSelect(defaultItemUnit());
  refreshItemUnitLabels();
});
$("item-unit")?.addEventListener("change", refreshItemUnitLabels);
$("item-image")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const url = await readLogoFile(file, 240);
    paintItemImage(url, file.name);
    $("item-hint").textContent = "Photo ready — click Save";
    $("item-hint").className = "hint";
  } catch (err) {
    $("item-hint").textContent = err.message;
    $("item-hint").className = "hint error";
  }
});
$("item-image-clear")?.addEventListener("click", () => {
  if ($("item-image")) $("item-image").value = "";
  paintItemImage("");
  $("item-hint").textContent = "Photo will be removed on Save";
  $("item-hint").className = "hint";
});

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
      state: $("cust-state")?.value || "",
      dob: $("cust-dob")?.value || "",
      referred_by: $("cust-ref")?.value || "",
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
  const items = readPackFormItems();
  const id = $("pack-id")?.value || "";
  try {
    if (id) await api(`/api/packs/${id}`, { method: "PUT", body: JSON.stringify({ name: $("pack-name").value, items }) });
    else await api("/api/packs", { method: "POST", body: JSON.stringify({ name: $("pack-name").value, items }) });
    $("pack-hint").textContent = id ? "Pack updated" : "Pack saved";
    $("pack-hint").className = "hint ok";
    resetPackForm();
    await loadBootstrap();
  } catch (err) {
    $("pack-hint").textContent = err.message;
    $("pack-hint").className = "hint error";
  }
});
$("pack-cancel")?.addEventListener("click", () => {
  resetPackForm();
  $("pack-hint").textContent = "";
  $("pack-hint").className = "hint";
});
$("packs-table")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-edit-pack]");
  if (!btn) return;
  const pack = state.packs.find((p) => p.id === btn.dataset.editPack);
  if (pack) fillPackForm(pack);
});

$("purchase-form").addEventListener("input", (e) => {
  if (e.target.id === "po-item-search") {
    filterPoLines();
    return;
  }
  if (e.target.matches("[data-po-qty],[data-po-rate],[data-po-barcodes]")) {
    const id = e.target.dataset.poQty || e.target.dataset.poRate || e.target.dataset.poBarcodes;
    if (id && (e.target.dataset.poQty || e.target.dataset.poRate)) paintPoLineAmount(id);
    paintPoTotals();
  }
});
$("po-lines")?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const scan = e.target.closest("[data-po-bc-scan]");
  if (!scan) return;
  e.preventDefault();
  const id = scan.dataset.poBcScan;
  const code = globalThis.POSBarcode?.cleanCode ? POSBarcode.cleanCode(scan.value) : String(scan.value || "").trim();
  if (!code) return;
  const ta = document.querySelector(`[data-po-barcodes="${id}"]`);
  if (!ta) return;
  let existing = [];
  try {
    existing = parsePoBarcodes(ta.value);
  } catch (err) {
    $("po-hint").textContent = err.message;
    $("po-hint").className = "hint error";
    return;
  }
  if (existing.includes(code)) {
    $("po-hint").textContent = `Duplicate barcode ${code}`;
    $("po-hint").className = "hint error";
    scan.select();
    return;
  }
  existing.push(code);
  ta.value = existing.join("\n");
  scan.value = "";
  $("po-hint").textContent = "";
  refreshPoBarcodeRows();
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
  const lines = [];
  try {
    for (const box of document.querySelectorAll("[data-po-item]:checked")) {
      const item = state.items.find((i) => i.id === box.dataset.poItem);
      const unit = itemUnit(item || {});
      const qtyInput = Number(document.querySelector(`[data-po-qty="${box.dataset.poItem}"]`)?.value);
      const quantity_gm = POSUnits.toBase(qtyInput, unit);
      let barcodes = [];
      if (POSUnits.isCount(unit)) {
        const pieces = Math.round(quantity_gm);
        barcodes = parsePoBarcodes(document.querySelector(`[data-po-barcodes="${box.dataset.poItem}"]`)?.value);
        if (barcodes.length !== pieces) {
          throw new Error(`${item?.name || "Item"}: enter ${pieces} barcodes for ${pieces} pcs (entered ${barcodes.length})`);
        }
      }
      lines.push({
        item_id: box.dataset.poItem,
        quantity_gm,
        rate_per_kg: Number(document.querySelector(`[data-po-rate="${box.dataset.poItem}"]`)?.value),
        expiry_date: document.querySelector(`[data-po-expiry="${box.dataset.poItem}"]`)?.value || "",
        barcodes,
      });
    }
    const saved = await api("/api/purchases", {
      method: "POST",
      body: JSON.stringify({
        supplier_id: $("po-supplier").value,
        supplier_invoice_number: $("po-invoice").value,
        purchase_date: $("po-date").value,
        payment_method: $("po-pay").value,
        lines,
      }),
    });
    const n = Number(saved?.purchase?.barcode_count || saved?.barcode_count) || 0;
    $("po-hint").textContent = n ? `Saved — ${n} barcodes added` : "Saved";
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

$("password-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const hint = $("password-hint");
  const current = $("pw-current")?.value || "";
  const next = $("pw-next")?.value || "";
  const confirm = $("pw-confirm")?.value || "";
  if (next.length < 8) {
    hint.textContent = "New password must be at least 8 characters";
    hint.className = "hint error";
    return;
  }
  if (next !== confirm) {
    hint.textContent = "New password and confirm password do not match";
    hint.className = "hint error";
    return;
  }
  try {
    hint.className = "hint";
    hint.textContent = "Saving password…";
    await api("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ current, next }),
    });
    $("password-form").reset();
    hint.textContent = "Password saved. Use the new password at the next sign-in.";
    hint.className = "hint ok";
  } catch (err) {
    hint.textContent = err.message;
    hint.className = "hint error";
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
      city: $("set-city")?.value || "",
      state: $("set-state")?.value || "",
      pincode: $("set-pincode")?.value || "",
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
  applyFyRange("rep-from", "rep-to", null, "rep-fy-year");
  await loadReports();
});
$("rep-fy-year")?.addEventListener("change", async () => {
  applyFyYear($("rep-fy-year").value, "rep-from", "rep-to");
  await loadReports();
});
$("rep-from")?.addEventListener("change", () => syncFySelectFromDates("rep-fy-year", "rep-from"));
$("rep-print")?.addEventListener("click", () => {
  printFinance({
    title: "Reports",
    html: ($("report-summary")?.outerHTML || "") + ($("reports")?.innerHTML || ""),
    from: $("rep-from")?.value,
    to: $("rep-to")?.value,
  });
});
$("reports")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-print-report]");
  if (!btn) return;
  const block = btn.closest(".report-block");
  const title = block?.dataset.reportTitle || block?.querySelector("h3")?.textContent || "Report";
  printFinance({
    title,
    html: block?.outerHTML || "",
    from: $("rep-from")?.value,
    to: $("rep-to")?.value,
  });
});
$("acc-this-fy")?.addEventListener("click", async () => {
  applyFyRange("acc-from", "acc-to", "acc-asof", "acc-fy-year");
  try {
    await loadAccountsTab(accTab);
  } catch (err) {
    $("acc-hint").textContent = err.message;
    $("acc-hint").className = "hint error";
  }
});
$("acc-fy-year")?.addEventListener("change", async () => {
  applyFyYear($("acc-fy-year").value, "acc-from", "acc-to", "acc-asof");
  try {
    await loadAccountsTab(accTab);
  } catch (err) {
    $("acc-hint").textContent = err.message;
    $("acc-hint").className = "hint error";
  }
});
$("acc-from")?.addEventListener("change", () => syncFySelectFromDates("acc-fy-year", "acc-from"));
$("acc-print")?.addEventListener("click", () => printAccountsReport());
$("exp-this-fy")?.addEventListener("click", async () => {
  applyFyRange("exp-from", "exp-to", null, "exp-fy-year");
  await loadExpenses();
});
$("exp-fy-year")?.addEventListener("change", async () => {
  applyFyYear($("exp-fy-year").value, "exp-from", "exp-to");
  await loadExpenses();
});
$("exp-from")?.addEventListener("change", () => syncFySelectFromDates("exp-fy-year", "exp-from"));
$("exp-print")?.addEventListener("click", () => {
  printFinance({
    title: "Expenses",
    html: $("expenses-table")?.innerHTML || "",
    from: $("exp-from")?.value,
    to: $("exp-to")?.value,
  });
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

function readLogoFile(file, max = 480) {
  return new Promise((resolve, reject) => {
    if (file.size > 8_000_000) {
      reject(new Error("Choose a smaller image"));
      return;
    }
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
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
    const wrap = $("quick-customer-wrap");
    if (wrap && !isMobileLayout()) wrap.open = false;
  } else if (!$("nav-scrim")?.hidden && document.getElementById("app")?.classList.contains("nav-collapsed")) {
    setNavCollapsed(true);
  }
  if ($("bill-toggle")) setBillCollapsed(document.body.classList.contains("bill-collapsed"));
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
        payload: {
          cart: state.cart,
          customerId: state.customerId,
          lastPack: state.lastPack,
          billDiscountType: state.billDiscountType,
          billDiscountValue: state.billDiscountValue,
          loyaltyRedeem: state.loyaltyRedeem,
        },
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
    const id = $("st-id")?.value || "";
    const payload = {
      first_name: $("st-first").value,
      email: $("st-email").value,
      role: $("st-role").value,
    };
    const password = $("st-pass").value;
    if (password) payload.password = password;
    if (!id && !password) throw new Error("Password is required for a new staff login");
    if (id) await api(`/api/staff/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/staff", { method: "POST", body: JSON.stringify(payload) });
    $("staff-hint").textContent = id && password ? "Staff updated. Login password changed." : "Saved";
    $("staff-hint").className = "hint ok";
    fillStaffForm(null);
    $("staff-form").reset();
    if ($("st-id")) $("st-id").value = "";
    if ($("st-pass")) $("st-pass").required = true;
    loadStaff();
  } catch (err) {
    $("staff-hint").textContent = err.message;
    $("staff-hint").className = "hint error";
  }
});
$("staff-cancel")?.addEventListener("click", () => {
  fillStaffForm(null);
  $("staff-form").reset();
  $("staff-hint").textContent = "";
});
$("staff-table")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-edit-staff]");
  if (!btn) return;
  const u = (state.staff || []).find((row) => row.id === btn.dataset.editStaff);
  if (u) fillStaffForm(u);
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
function fillItemPicker(datalistId, searchId, hiddenId, filterFn) {
  const list = $(datalistId);
  if (!list) return;
  const items = activeItems().filter((i) => (filterFn ? filterFn(i) : true));
  list.innerHTML = items
    .map((i) => `<option value="${escapeHtml(i.name)}" data-id="${escapeHtml(i.id)}" label="${escapeHtml(i.barcode || i.code || "")}"></option>`)
    .join("");
  const search = $(searchId);
  const hidden = $(hiddenId);
  if (search && hidden && !search.dataset.bound) {
    search.dataset.bound = "1";
    search.addEventListener("change", () => {
      const q = String(search.value || "").trim().toLowerCase();
      const pool = activeItems().filter((i) => (filterFn ? filterFn(i) : true));
      const item = pool.find((i) => i.name.toLowerCase() === q || String(i.barcode || "").toLowerCase() === q || String(i.code || "").toLowerCase() === q);
      hidden.value = item?.id || "";
    });
  }
}

function qtyToBaseFromInput(item, raw) {
  if (!item) return Number(raw) || 0;
  return POSUnits.toBase(raw, itemUnit(item));
}

$("stock-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const item = state.items.find((i) => i.id === $("stk-item").value);
  const qty = item ? qtyToBaseFromInput(item, $("stk-qty").value) : Number($("stk-qty").value);
  await api("/api/stock/adjust", {
    method: "POST",
    body: JSON.stringify({
      item_id: $("stk-item").value,
      quantity_gm: qty,
      kind: $("stk-kind").value,
      reason: $("stk-reason")?.value || "",
      note: $("stk-note").value,
    }),
  });
  loadStock();
  loadBootstrap();
});

document.getElementById("stock-mode")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-stock-mode]");
  if (!btn) return;
  state.stockMode = btn.dataset.stockMode;
  document.querySelectorAll("[data-stock-mode]").forEach((b) => b.classList.toggle("primary", b === btn));
  document.getElementById("view-stock")?.classList.toggle("is-advanced", state.stockMode === "advanced");
});

["bill-disc-type", "bill-disc-value", "loyalty-redeem"].forEach((id) => {
  $(id)?.addEventListener("input", () => {
    state.billDiscountType = $("bill-disc-type")?.value || "amt";
    state.billDiscountValue = Number($("bill-disc-value")?.value) || 0;
    state.loyaltyRedeem = Number($("loyalty-redeem")?.value) || 0;
    renderCart();
  });
  $(id)?.addEventListener("change", () => {
    state.billDiscountType = $("bill-disc-type")?.value || "amt";
    state.billDiscountValue = Number($("bill-disc-value")?.value) || 0;
    state.loyaltyRedeem = Number($("loyalty-redeem")?.value) || 0;
    renderCart();
  });
});

$("customer")?.addEventListener("change", () => {
  void loadCustomerLoyalty();
});

async function loadCustomerLoyalty() {
  if (!state.customerId) return;
  if (!can("loyalty") && state.session?.role !== "business_admin") return;
  try {
    const data = await api(`/api/loyalty/customer/${encodeURIComponent(state.customerId)}`);
    state.loyaltyAccount = data.account;
    state.loyaltySettings = data.settings || state.loyaltySettings;
    if ($("loyalty-hint")) {
      $("loyalty-hint").textContent = data.account
        ? `${data.account.points_balance || 0} pts · ${globalThis.POSLoyalty?.tierLabel(data.account.tier) || data.account.tier}`
        : "";
    }
    renderCart();
  } catch {
    state.loyaltyAccount = null;
  }
}

async function loadBarcodesView() {
  fillItemPicker("bc-item-list", "bc-item-search", "bc-item", (i) => POSUnits.isCount(itemUnit(i)));
  const hint = $("bc-hint");
  try {
    const all = await api("/api/barcodes");
    const countIds = new Set(state.items.filter((i) => POSUnits.isCount(itemUnit(i))).map((i) => i.id));
    const rows = (Array.isArray(all) ? all : []).filter((r) => countIds.has(r.item_id));
    $("barcodes-table").innerHTML = `<table><thead><tr>
      <th></th><th>Item</th><th>Kind</th><th>Barcode</th><th>MRP</th><th>SP</th><th></th>
    </tr></thead><tbody>${(rows || [])
      .map(
        (r) => `<tr>
          <td><input type="checkbox" data-bc-pick="${escapeHtml(r.barcode)}" data-bc-name="${escapeHtml(r.item_name)}" data-bc-mrp="${escapeHtml(r.label_mrp || "")}" data-bc-rate="${escapeHtml(r.retail_rate || "")}" /></td>
          <td>${escapeHtml(r.item_name)} <small>${escapeHtml(r.item_code || "")}</small></td>
          <td>${escapeHtml(r.kind)}</td>
          <td>${escapeHtml(r.barcode)}</td>
          <td>${money(r.label_mrp)}</td>
          <td>${money(r.retail_rate)}</td>
          <td><button class="btn" type="button" data-bc-print="${escapeHtml(r.barcode)}" data-bc-name="${escapeHtml(r.item_name)}" data-bc-mrp="${escapeHtml(r.label_mrp || "")}" data-bc-rate="${escapeHtml(r.retail_rate || "")}">Print</button></td>
        </tr>`,
      )
      .join("")}</tbody></table>`;
    if (hint) hint.textContent = `${(rows || []).length} barcodes`;
  } catch (err) {
    if (hint) hint.textContent = err.message;
  }
}

$("bc-qty-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const itemId = $("bc-item")?.value || "";
  const qty = Number($("bc-qty")?.value) || 0;
  const item = state.items.find((i) => i.id === itemId);
  if (!itemId || !item) {
    if ($("bc-hint")) $("bc-hint").textContent = "Select a Quantity (pcs) item";
    return;
  }
  if (!POSUnits.isCount(itemUnit(item))) {
    if ($("bc-hint")) $("bc-hint").textContent = "Barcodes are only for Quantity (pcs) items";
    return;
  }
  try {
    const data = await api("/api/barcodes/generate-qty", {
      method: "POST",
      body: JSON.stringify({ item_id: itemId, qty }),
    });
    const rows = data.barcodes || [];
    if ($("bc-hint")) $("bc-hint").textContent = `Generated ${data.generated || rows.length} unique barcodes`;
    await loadBootstrap();
    await loadBarcodesView();
    if ($("bc-qty-print")?.checked && rows.length && globalThis.POSBarcode?.printLabels) {
      globalThis.POSBarcode.printLabels(
        rows.map((r) => ({
          name: item.name,
          barcode: r.barcode,
          mrp: item.mrp || item.retail_rate,
          rate: item.retail_rate,
        })),
        1,
      );
    }
  } catch (err) {
    if ($("bc-hint")) $("bc-hint").textContent = err.message;
  }
});
$("bc-generate-missing")?.addEventListener("click", async () => {
  try {
    const data = await api("/api/barcodes/generate-missing", { method: "POST", body: "{}" });
    $("bc-hint").textContent = `Generated ${data.generated || 0}`;
    await loadBootstrap();
    loadBarcodesView();
  } catch (err) {
    $("bc-hint").textContent = err.message;
  }
});
$("bc-print-selected")?.addEventListener("click", () => {
  const copies = Number($("bc-copies")?.value) || 1;
  const rows = [...document.querySelectorAll("[data-bc-pick]:checked")].map((el) => ({
    name: el.dataset.bcName,
    barcode: el.dataset.bcPick,
    mrp: el.dataset.bcMrp,
    rate: el.dataset.bcRate,
    copies,
  }));
  if (!rows.length) {
    $("bc-hint").textContent = "Select labels first";
    return;
  }
  globalThis.POSBarcode?.printLabels(rows, copies);
});
$("barcodes-table")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-bc-print]");
  if (!btn) return;
  globalThis.POSBarcode?.printLabels([{ name: btn.dataset.bcName, barcode: btn.dataset.bcPrint, mrp: btn.dataset.bcMrp, rate: btn.dataset.bcRate }], Number($("bc-copies")?.value) || 1);
});

async function loadDamageView() {
  fillItemPicker("dmg-item-list", "dmg-item-search", "dmg-item");
  try {
    const [rows, report] = await Promise.all([api("/api/damage"), api("/api/damage/report")]);
    $("damage-table").innerHTML = `<table><thead><tr>
      <th>When</th><th>Item</th><th>Qty</th><th>Reason</th><th>Loss</th><th>Status</th><th></th>
    </tr></thead><tbody>${(rows || [])
      .map(
        (r) => `<tr>
          <td>${escapeHtml(formatShopDateTime(r.created_at))}</td>
          <td>${escapeHtml(r.item_name)} ${r.barcode ? `<small>${escapeHtml(r.barcode)}</small>` : ""}</td>
          <td>${escapeHtml(fmtQty(r.quantity_gm, state.items.find((i) => i.id === r.item_id) || r))}</td>
          <td>${escapeHtml(r.reason)}</td>
          <td>${money(r.loss_amount)}</td>
          <td>${escapeHtml(r.status)}</td>
          <td>${r.status === "pending" ? `<button class="btn" data-dmg-ok="${escapeHtml(r.id)}" type="button">Approve</button> <button class="btn" data-dmg-no="${escapeHtml(r.id)}" type="button">Reject</button>` : ""}</td>
        </tr>`,
      )
      .join("")}</tbody></table>`;
    $("dmg-report").innerHTML = (report.rows || [])
      .map((r) => `<div class="report-card"><span>${escapeHtml(r.reason)} · ${escapeHtml(r.status)}</span><strong>${money(r.loss)}</strong><small>${escapeHtml(r.entries)} entries</small></div>`)
      .join("");
  } catch (err) {
    if ($("dmg-hint")) $("dmg-hint").textContent = err.message;
  }
}

$("damage-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const item = state.items.find((i) => i.id === $("dmg-item").value);
  try {
    await api("/api/damage", {
      method: "POST",
      body: JSON.stringify({
        item_id: $("dmg-item").value,
        quantity_gm: item ? qtyToBaseFromInput(item, $("dmg-qty").value) : $("dmg-qty").value,
        reason: $("dmg-reason").value,
        barcode: $("dmg-barcode").value,
        note: $("dmg-note").value,
        auto_approve: $("dmg-auto")?.checked,
      }),
    });
    $("damage-form").reset();
    $("dmg-hint").textContent = "Recorded";
    $("dmg-hint").className = "hint ok";
    loadDamageView();
    loadBootstrap();
  } catch (err) {
    $("dmg-hint").textContent = err.message;
    $("dmg-hint").className = "hint error";
  }
});
$("damage-table")?.addEventListener("click", async (e) => {
  const ok = e.target.closest("[data-dmg-ok]");
  const no = e.target.closest("[data-dmg-no]");
  try {
    if (ok) await api(`/api/damage/${ok.dataset.dmgOk}/approve`, { method: "POST", body: "{}" });
    if (no) await api(`/api/damage/${no.dataset.dmgNo}/reject`, { method: "POST", body: "{}" });
    if (ok || no) {
      loadDamageView();
      loadBootstrap();
    }
  } catch (err) {
    $("dmg-hint").textContent = err.message;
  }
});

async function loadLedgerView() {
  const kind = $("ledger-kind")?.value || "";
  const q = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  try {
    const rows = await api(`/api/stock/ledger${q}`);
    $("ledger-table").innerHTML = `<table><thead><tr>
      <th>When</th><th>Kind</th><th>Item</th><th>Qty</th><th>Barcode</th><th>Batch</th><th>Note</th>
    </tr></thead><tbody>${(rows || [])
      .map(
        (r) => `<tr>
          <td>${escapeHtml(formatShopDateTime(r.created_at))}</td>
          <td>${escapeHtml(r.kind)}</td>
          <td>${escapeHtml(r.item_name)}</td>
          <td>${escapeHtml(fmtQty(r.quantity_gm, state.items.find((i) => i.id === r.item_id) || r))}</td>
          <td>${escapeHtml(r.barcode || "—")}</td>
          <td>${escapeHtml((r.batch_id || "").slice(0, 8) || "—")}</td>
          <td>${escapeHtml(r.note || r.reason || "")}</td>
        </tr>`,
      )
      .join("")}</tbody></table>`;
  } catch (err) {
    $("ledger-table").innerHTML = `<p class="hint error">${escapeHtml(err.message)}</p>`;
  }
}
$("ledger-refresh")?.addEventListener("click", () => loadLedgerView());
$("ledger-kind")?.addEventListener("change", () => loadLedgerView());

async function loadLoyaltyView() {
  try {
    const settings = await api("/api/loyalty/settings");
    state.loyaltySettings = settings;
    if ($("loy-earn")) $("loy-earn").value = settings.earn_per_100 ?? 1;
    if ($("loy-rate")) $("loy-rate").value = settings.rupees_per_point ?? 1;
    if ($("loy-min")) $("loy-min").value = settings.min_redeem ?? 10;
    if ($("loy-exp")) $("loy-exp").value = settings.expiry_days ?? 365;
    if ($("loy-bday")) $("loy-bday").value = settings.birthday_bonus ?? 50;
    if ($("loy-ref")) $("loy-ref").value = settings.referral_points ?? 25;
    if ($("loy-on")) $("loy-on").checked = settings.enabled !== false && settings.enabled !== 0;
    if ($("loy-cust")) {
      $("loy-cust").innerHTML = state.customers.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.business_name || c.name)}</option>`).join("");
    }
    const rows = await Promise.all(
      state.customers.slice(0, 40).map(async (c) => {
        try {
          const data = await api(`/api/loyalty/customer/${encodeURIComponent(c.id)}`);
          return { customer: c, account: data.account };
        } catch {
          return { customer: c, account: null };
        }
      }),
    );
    $("loyalty-table").innerHTML = `<table><thead><tr><th>Customer</th><th>Tier</th><th>Points</th><th>Earned</th><th>Redeemed</th><th>Spend</th></tr></thead><tbody>${rows
      .map(
        (r) => `<tr>
          <td>${escapeHtml(r.customer.business_name || r.customer.name)}</td>
          <td>${escapeHtml(globalThis.POSLoyalty?.tierLabel(r.account?.tier) || r.account?.tier || "Bronze")}</td>
          <td>${escapeHtml(r.account?.points_balance ?? 0)}</td>
          <td>${escapeHtml(r.account?.lifetime_earned ?? 0)}</td>
          <td>${escapeHtml(r.account?.lifetime_redeemed ?? 0)}</td>
          <td>${money(r.account?.lifetime_spend)}</td>
        </tr>`,
      )
      .join("")}</tbody></table>`;
  } catch (err) {
    if ($("loy-hint")) $("loy-hint").textContent = err.message;
  }
}

$("loyalty-settings-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/loyalty/settings", {
      method: "PUT",
      body: JSON.stringify({
        enabled: $("loy-on")?.checked,
        earn_per_100: $("loy-earn").value,
        rupees_per_point: $("loy-rate").value,
        min_redeem: $("loy-min").value,
        expiry_days: $("loy-exp").value,
        birthday_bonus: $("loy-bday").value,
        referral_points: $("loy-ref").value,
      }),
    });
    $("loy-hint").textContent = "Royalty settings saved";
    $("loy-hint").className = "hint ok";
    loadLoyaltyView();
  } catch (err) {
    $("loy-hint").textContent = err.message;
    $("loy-hint").className = "hint error";
  }
});
$("loyalty-adjust-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/loyalty/adjust", {
      method: "POST",
      body: JSON.stringify({ customer_id: $("loy-cust").value, points: $("loy-pts").value, note: $("loy-note").value }),
    });
    $("loy-hint").textContent = "Points posted";
    $("loy-hint").className = "hint ok";
    loadLoyaltyView();
  } catch (err) {
    $("loy-hint").textContent = err.message;
    $("loy-hint").className = "hint error";
  }
});
$("loy-birthday")?.addEventListener("click", async () => {
  try {
    await api("/api/loyalty/birthday", { method: "POST", body: JSON.stringify({ customer_id: $("loy-cust").value }) });
    $("loy-hint").textContent = "Birthday bonus posted";
    loadLoyaltyView();
  } catch (err) {
    $("loy-hint").textContent = err.message;
  }
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
        `<div class="platform-notice"><strong>${escapeHtml(n.title || "Notice")}</strong>${escapeHtml(n.body || "")}${
          n.image_url ? `<img class="notice-thumb" src="${escapeHtml(n.image_url)}" alt="" />` : ""
        }</div>`,
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
    const looksFootwear = /(^|[^a-z])(footwear|shoes?)([^a-z]|$)/.test(
      [me.business?.category, me.business?.business_type].filter(Boolean).join(" ").toLowerCase(),
    );
    if (looksFootwear && !globalThis.POSFootwear) {
      const bar = $("expired-banner");
      if (bar && bar.hidden) {
        bar.hidden = false;
        bar.textContent = "Footwear shop detected but js/footwear.js did not load. Hard-refresh, or re-upload that file.";
      }
    }
    applyFootwearMode();
    fillItemUnitSelect(defaultItemUnit());
    refreshItemUnitLabels();
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
