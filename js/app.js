const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

const state = {
  company: {},
  items: [],
  units: [],
  customers: [],
  packs: [],
  combos: [],
  offers: [],
  offerSettings: { stacking: "product_and_bill" },
  appliedOffers: null,
  offerAuto: true,
  offerBillLocked: false,
  offerPopupSig: "",
  offerPopupDismissed: "",
  suppliers: [],
  cart: [],
  query: "",
  customerId: "",
  lastPack: null,
  held: [],
  editingOrderId: null,
  logoDraft: null,
  payQrDraft: null,
  itemImage: "",
  session: null,
  perms: {},
  support: {},
  staff: [],
  branches: [],
  plan: null,
  wearerFilter: "",
  sizeFilter: "",
  colorFilter: "",
  categoryFilter: "",
  billDiscountType: "amt",
  billDiscountValue: 0,
  loyaltyRedeem: 0,
  loyaltyAccount: null,
  loyaltySettings: null,
  currentView: "dashboard",
  reportTab: "summary",
  stockMode: "simple",
  expiryBatches: [],
  expiryFilter: "all",
  stockRows: [],
  stockLowOnly: false,
  activeQrOrderId: "",
  activeTable: "",
  activeFloor: "",
  kotPrinted: [],
  kotTickets: [],
  kotFilter: "",
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
const saveTableHoldDebounced = debounce(() => {
  void saveActiveTableHold().catch(() => {});
}, 700);

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

function isApparelShop() {
  return Boolean(globalThis.POSFootwear?.isApparelShop(state.businessMeta));
}

function isVariantShop() {
  return Boolean(globalThis.POSFootwear?.isVariantShop(state.businessMeta));
}

function isSpiceShop() {
  return Boolean(globalThis.POSFootwear?.isSpiceShop(state.businessMeta));
}

function isRestaurantShop() {
  return Boolean(globalThis.POSRestaurant?.isRestaurantShop(state.businessMeta) || globalThis.POSFootwear?.isRestaurantShop(state.businessMeta));
}

function isPharmacyShop() {
  return Boolean(globalThis.POSFootwear?.isPharmacyShop?.(state.businessMeta) || globalThis.POSFootwear?.shopKind?.(state.businessMeta) === "pharmacy");
}

function isClassicBillShop() {
  return isPharmacyShop() || isApparelShop();
}

function taxCodeLabel(biz = state.businessMeta) {
  return globalThis.POSFootwear?.taxCodeLabel(biz) || "HSN";
}

function taxCodeFieldLabel(biz = state.businessMeta) {
  return globalThis.POSFootwear?.taxCodeFieldLabel(biz) || "HSN code (goods)";
}

function restaurantApi() {
  return globalThis.POSRestaurant || null;
}

function emptyTicketHint() {
  if (isClassicBillShop()) return "Scan barcode, type item code, or search name";
  return globalThis.POSFootwear?.itemFormCopy(state.businessMeta)?.ticket || "Tap a product or scan";
}

function itemVariantText(item) {
  return globalThis.POSFootwear?.variantLabel(item) || "";
}

function itemBillName(item) {
  return globalThis.POSFootwear?.billName(item) || item?.name || "Item";
}

function defaultItemCategory() {
  return globalThis.POSFootwear?.defaultCategory(state.businessMeta) || "General";
}

function defaultItemUnit() {
  return globalThis.POSFootwear?.defaultUnit(state.businessMeta) || "GM";
}

function applyFootwearMode() {
  const fw = isFootwearShop();
  const ap = isApparelShop();
  const spice = isSpiceShop();
  const on = fw || ap;
  const pharm = isPharmacyShop();
  const copy = globalThis.POSFootwear?.itemFormCopy(state.businessMeta) || {};
  document.body.classList.toggle("footwear-mode", fw);
  document.body.classList.toggle("apparel-mode", ap);
  document.body.classList.toggle("spice-mode", spice);
  document.body.classList.toggle("restaurant-mode", isRestaurantShop());
  document.body.classList.toggle("pharmacy-mode", pharm);
  document.body.classList.toggle("classic-bill-mode", isClassicBillShop());
  document.body.classList.toggle("services-mode", globalThis.POSFootwear?.isServicesShop?.(state.businessMeta));
  document.querySelectorAll(".footwear-only").forEach((el) => {
    el.hidden = !on;
  });
  document.querySelectorAll(".pharmacy-only").forEach((el) => {
    el.hidden = !pharm;
  });
  document.querySelectorAll(".pharmacy-hide").forEach((el) => {
    el.hidden = pharm;
  });
  document.querySelectorAll(".restaurant-only").forEach((el) => {
    el.hidden = !isRestaurantShop();
  });
  fillPaySelects();
  document.querySelectorAll(".classic-bill-only").forEach((el) => {
    if (el.classList.contains("nav-btn")) return;
    el.hidden = !isClassicBillShop();
  });
  const classicHead = $("classic-bill-head");
  if (classicHead) classicHead.hidden = !isClassicBillShop();
  const classicEntry = $("classic-bill-entry");
  if (classicEntry) classicEntry.hidden = !isClassicBillShop();
  const extras = $("bill-extras");
  if (extras && isClassicBillShop()) extras.open = true;
  if (isClassicBillShop()) {
    state.stockMode = "advanced";
    document.getElementById("view-stock")?.classList.add("is-advanced");
    document.querySelectorAll("[data-stock-mode]").forEach((b) => {
      b.classList.toggle("primary", b.dataset.stockMode === "advanced");
    });
    if ($("stock-mode-label")) $("stock-mode-label").textContent = "Adjust stock — advanced";
  }
  const pharmCust = $("pharm-bill-cust");
  if (pharmCust) pharmCust.hidden = true;
  const billTitle = document.querySelector("#bill-panel .ticket-head h2");
  if (billTitle) billTitle.textContent = isClassicBillShop() ? "Sales Bill" : tt("pos.bill", "Bill");
  if (isClassicBillShop()) fillPharmacyBillCustomerFromCustomer(customer());
  const search = $("search");
  if (search) search.placeholder = copy.search || `Search name or ${taxCodeLabel()}…`;
  const scan = $("scan-code");
  if (scan) scan.placeholder = copy.scan || "Scan or search";
  const billScan = $("bill-scan-code");
  if (billScan) billScan.placeholder = copy.scan || "Scan barcode, item code, or name";
  const mobile = $("counter-mobile");
  if (mobile) {
    mobile.placeholder = pharm ? "Mobile No." : "Mobile";
    mobile.setAttribute("aria-label", pharm ? "Mobile No." : "Customer mobile");
  }
  if ($("item-category-lab")) $("item-category-lab").textContent = copy.categoryLab || "Category";
  if ($("item-category")) $("item-category").placeholder = copy.category || "Group / Section";
  if ($("item-subcategory-lab")) $("item-subcategory-lab").textContent = copy.subcategoryLab || "Subcategory";
  if ($("item-subcategory")) $("item-subcategory").placeholder = copy.subcategory || "Type / Brand";
  if ($("item-name")) $("item-name").placeholder = copy.name || "Item name";
  if ($("item-local-lab")) $("item-local-lab").textContent = copy.localNameLab || "Regional name";
  if ($("item-local-name")) $("item-local-name").placeholder = copy.localName || "स्थानीय नाम / Local name";
  if ($("item-hsn")) $("item-hsn").placeholder = copy.hsn || (taxCodeLabel() === "SAC" ? "e.g. 9983" : "e.g. 1234");
  if ($("item-hsn-lab")) $("item-hsn-lab").textContent = copy.taxField || taxCodeFieldLabel();
  if ($("item-size")) $("item-size").placeholder = fw ? "e.g. 6, 7, 8 or 5" : ap ? "S, M, L, XL or 32, 34" : "e.g. 6, 7, 8 or 5";
  if ($("items-lede")) $("items-lede").textContent = copy.lede || `Name, photo, ${taxCodeFieldLabel()}, unit type, rates, and stock.`;
  if ($("item-catalog-search")) {
    $("item-catalog-search").placeholder = copy.catalogSearch || copy.search || `Search name, ${taxCodeLabel()}, barcode…`;
  }
  if ($("pack-item-search")) $("pack-item-search").placeholder = `Search spice or ${taxCodeLabel()}…`;
  if ($("po-item-search")) $("po-item-search").placeholder = `Search item or ${taxCodeLabel()}…`;
  if ($("item-import-copy")) {
    $("item-import-copy").textContent = copy.importCopy
      || "Bulk add from Excel. Download the template, fill one item per row, then upload .xlsx, Excel XML, or CSV.";
  }
  if ($("item-composer-note")) {
    $("item-composer-note").textContent = copy.composerNote
      || "Tap a catalog card to edit. Quantity items can take a typed or scanned barcode.";
  }
  if ($("set-name-lab")) $("set-name-lab").textContent = pharm ? "Pharmacy Name" : "Shop name";
  if ($("set-address-lab")) $("set-address-lab").textContent = pharm ? "Pharmacy Address" : "Address";
  if ($("set-phone-lab")) $("set-phone-lab").textContent = pharm ? "Mobile No." : "Phone";
  if ($("cust-name-lab")) $("cust-name-lab").textContent = pharm ? "Customer Name" : "Name";
  if ($("cust-mobile-lab")) $("cust-mobile-lab").textContent = pharm ? "Mobile No." : "Mobile";
  if ($("cust-form-note")) {
    $("cust-form-note").textContent = pharm
      ? "Customer name, mobile, address, and doctor / prescription no. (optional)."
      : "B2C retail or B2B wholesale. Outstanding grows on credit sales.";
  }
  if ($("customers-lede")) {
    $("customers-lede").textContent = pharm
      ? "Customer Name, Mobile No., Address, and Doctor / Prescription No."
      : "Add accounts, collect outstanding dues, and print a receipt.";
  }
  if ($("set-name")) $("set-name").placeholder = pharm ? "e.g. ABC MEDICAL" : "Your shop name";
  if ($("set-shop-legend")) $("set-shop-legend").textContent = pharm ? "Pharmacy" : "Shop";
  if ($("settings-profile-note")) {
    $("settings-profile-note").textContent = pharm
      ? "Pharmacy name, address, GSTIN, and licences print on bills and appear in the left nav."
      : "This name, address, GSTIN, and logo print on invoices and appear in the left nav.";
  }
  if ($("settings-lede")) {
    $("settings-lede").textContent = pharm
      ? "Pharmacy name, address, mobile, GSTIN, drug licence, FSSAI, and NDPS licence."
      : "Company profile, timezone, shop logo, and your login password. Shop backup is under Settings → Backup.";
  }
  if ($("ticket-sub") && !state.cart?.length) $("ticket-sub").textContent = copy.ticket || emptyTicketHint();
  VIEW_META.items.subtitle = copy.itemsSub || `Photo, ${taxCodeLabel()}, unit type, rates, and stock`;
  VIEW_META.counter.subtitle = copy.counterSub || "Scan, tap, or search — then Pay";
  const pack = $("pack-choice");
  if (pack) pack.hidden = !spice;
  fillWearerSelects();
  const colors = globalThis.POSFootwear?.COLORS || [];
  const sizes = globalThis.POSFootwear?.sizesForShop?.(state.businessMeta) || globalThis.POSFootwear?.SIZES || [];
  if ($("color-list")) $("color-list").innerHTML = colors.map((c) => `<option value="${escapeHtml(c)}">`).join("");
  if ($("size-list")) $("size-list").innerHTML = sizes.map((s) => `<option value="${escapeHtml(s)}">`).join("");
  fillFootwearFilters();
  applyNav();
  renderTableBoard();
}

function fillWearerSelects() {
  const wearers = globalThis.POSFootwear?.wearersForShop?.(state.businessMeta) || globalThis.POSFootwear?.WEARERS || [];
  const fw = isFootwearShop();
  const ap = isApparelShop();
  const itemSel = $("item-wearer");
  if (itemSel) {
    const cur = itemSel.value;
    const blank = fw ? "Select girls / boys" : ap ? "Select female / male / kids" : "Select type";
    itemSel.innerHTML =
      `<option value="">${blank}</option>` +
      wearers.map((w) => `<option value="${escapeHtml(w.value)}">${escapeHtml(w.label)}</option>`).join("");
    if (wearers.some((w) => w.value === cur)) itemSel.value = cur;
  }
  const filterSel = $("wearer-filter");
  if (filterSel) {
    const cur = filterSel.value;
    const allLabel = fw || ap ? "All types" : "All";
    filterSel.innerHTML =
      `<option value="">${allLabel}</option>` +
      wearers.map((w) => `<option value="${escapeHtml(w.value)}">${escapeHtml(w.label)}</option>`).join("");
    if (wearers.some((w) => w.value === cur)) filterSel.value = cur;
    filterSel.setAttribute("aria-label", fw ? "Girls or boys" : ap ? "Female, male, or kids" : "Type");
  }
}

function fillFootwearFilters() {
  if (!isVariantShop()) return;
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
  const retailWord = isPharmacyShop() ? "Strip / pack price" : "Retail";
  const purchaseWord = isPharmacyShop() ? "Purchase / strip" : "Purchase";
  if ($("item-retail-lab")) $("item-retail-lab").textContent = POSUnits.rateLabel(retailWord, u);
  if ($("item-b2b-lab")) $("item-b2b-lab").textContent = POSUnits.rateLabel("B2B", u);
  if ($("item-purchase-lab")) $("item-purchase-lab").textContent = POSUnits.rateLabel(purchaseWord, u);
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
  customers: { title: "Customers", subtitle: "Accounts, due collection, and receipts" },
  barcodes: { title: "Barcodes", subtitle: "Quantity (pcs) items only — one code per piece" },
  damage: { title: "Damage stock", subtitle: "Wastage, approval, and estimated loss" },
  ledger: { title: "Stock ledger", subtitle: "Purchase, sale, return, and damage history" },
  loyalty: { title: "Royalty points", subtitle: "Earn, redeem, tiers, birthday and referral" },
  offers: { title: "Offers & promotions", subtitle: "Combos, discounts, happy hours, and AI suggestions" },
  packs: { title: "Packs", subtitle: "Named spice mixes for the Counter" },
  orders: { title: "Invoices", subtitle: "POS slip, official A4, or duplicate copy" },
  returns: { title: "Manage Returns", subtitle: "Pharmacy and garment returns against a sales invoice" },
  "qr-orders": { title: "QR Orders", subtitle: "Incoming customer self-orders" },
  prescriptions: { title: "Prescription Orders", subtitle: "Customer QR uploads for this pharmacy" },
  kot: { title: "Kitchen KOT", subtitle: "Captain fires tickets; kitchen marks preparing and ready" },
  purchases: { title: "Purchases", subtitle: "20 pcs = 20 barcodes you type or scan" },
  suppliers: { title: "Suppliers", subtitle: "Vendor contacts, address, and GSTIN" },
  stock: { title: "Stock", subtitle: "On-hand qty, low-stock alerts, and adjustments" },
  expiry: { title: "Expiry", subtitle: "Dated batches still on hand — expired first" },
  staff: { title: "Staff & roles", subtitle: "Users, roles, and access" },
  branches: { title: "Branches", subtitle: "Locations, active status, and branch login" },
  devices: { title: "POS devices", subtitle: "Registers and terminal codes" },
  support: { title: "Support", subtitle: "Call, WhatsApp, or email platform support" },
  accounts: { title: "Accounts", subtitle: "Receivables, payables, GL, and books" },
  expenses: { title: "Expenses", subtitle: "Rent, power, wages, and other shop costs" },
  reports: { title: "Reports", subtitle: "Sales, GST, payments, and stock for this FY" },
  growth: { title: "AI Growth", subtitle: "What happened, why, what to do next — from this shop's data" },
  settings: { title: "Shop profile", subtitle: "Company profile, timezone, logo, and login password" },
  backup: { title: "Shop backup", subtitle: "Download or restore this shop from Settings → Backup" },
};

function orderStatusClass(status) {
  const s = String(status || "confirmed").toLowerCase();
  if (s === "cancelled") return "cancelled";
  if (s === "delivered") return "delivered";
  return "confirmed";
}

function orderStatusBadge(status) {
  const s = String(status || "confirmed").toLowerCase();
  return `<span class="order-status ${orderStatusClass(s)}">${escapeHtml(orderStatusLabel(s))}</span>`;
}

function payStatusBadge(status) {
  const s = String(status || "paid").toLowerCase();
  return `<span class="pay-status ${escapeHtml(s)}">${escapeHtml(s)}</span>`;
}

function orderStatusLabel(status) {
  const s = String(status || "confirmed").toLowerCase();
  if (s === "cancelled") return "Void";
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
  if (globalThis.POSPay?.label) return globalThis.POSPay.label(method);
  const m = String(method || "cash").toLowerCase();
  if (m === "upi") return "UPI";
  if (m === "credit") return "Credit";
  if (m === "cash") return "Cash";
  if (m === "bank-transfer" || m === "bank") return "Bank Transfer";
  return method || "—";
}

function fillPaySelect(el, opts = {}) {
  if (!el || !globalThis.POSPay?.optionsHtml) return;
  const cur = opts.selected != null ? opts.selected : el.value;
  el.innerHTML = globalThis.POSPay.optionsHtml({
    selected: cur,
    includeCredit: Boolean(opts.includeCredit),
    extra: opts.extra || [],
  });
}

function fillPaySelects() {
  fillPaySelect($("pay-method"), { includeCredit: true });
  fillPaySelect($("due-method"));
  fillPaySelect($("po-pay"), { includeCredit: true });
  fillPaySelect($("exp-pay"));
  fillPaySelect($("returns-mode"), {
    extra: [
      ["credit-note", "Credit note"],
      ["store-credit", "Store credit"],
    ],
  });
}

function canDeletePaymentEntry() {
  return state.session?.role === "business_admin";
}

function canDeleteInvoice() {
  return state.session?.role === "business_admin";
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
  state.billDiscountType = "amt";
  state.billDiscountValue = 0;
  state.loyaltyRedeem = 0;
  state.offerBillLocked = false;
  state.offerAuto = true;
  resetOfferPopup();
  $("pack-choice").value = "";
  if ($("bill-disc-type")) $("bill-disc-type").value = "amt";
  if ($("bill-disc-value")) $("bill-disc-value").value = 0;
  if ($("loyalty-redeem")) $("loyalty-redeem").value = 0;
  resetClassicBillEntry();
  resetClassicCustomerRecord({ focus: true });
  renderEditOrderBanner();
  renderCart();
  setHint("Edit cancelled");
}

function cartLineFromOrderLine(l) {
  const type = String(l.discount_type || "amt").toLowerCase() === "pct" ? "pct" : "amt";
  let value = Number(l.discount_value);
  if (!Number.isFinite(value) || value < 0) value = 0;
  if (value <= 0 && Number(l.discount) > 0) value = Number(l.discount) || 0;
  return {
    itemId: l.item_id,
    qtyGm: Number(l.quantity_gm),
    discountType: type,
    discountValue: value,
    barcode: l.barcode || "",
    notes: String(l.notes || l.special_instruction || "").trim(),
  };
}

function applyOrderDiscountsToCounter(o) {
  const type = String(o.discount_type || "amt").toLowerCase() === "pct" ? "pct" : "amt";
  let value = Number(o.discount_value);
  if (!Number.isFinite(value) || value <= 0) value = Number(o.discount) || 0;
  state.billDiscountType = type;
  state.billDiscountValue = value;
  state.loyaltyRedeem = Number(o.loyalty_points_redeemed) || 0;
  state.offerBillLocked = value > 0;
  state.offerAuto = false;
  if ($("bill-disc-type")) $("bill-disc-type").value = type;
  if ($("bill-disc-value")) $("bill-disc-value").value = value;
  if ($("loyalty-redeem")) $("loyalty-redeem").value = state.loyaltyRedeem;
  if (value > 0 || state.loyaltyRedeem > 0) {
    const extras = $("bill-extras");
    if (extras) extras.open = true;
  }
}

function customer() {
  return state.customers.find((c) => c.id === state.customerId) || state.customers[0];
}

function digitsMobile(raw) {
  const d = String(raw || "").replace(/\D+/g, "");
  if (d.length >= 10) return d.slice(-10);
  return d;
}

function isRealMobile(raw) {
  return /^[6-9]\d{9}$/.test(digitsMobile(raw));
}

function findCustomerByMobile(raw) {
  const d = digitsMobile(raw);
  if (d.length < 10) return null;
  return (state.customers || []).find((c) => digitsMobile(c.mobile) === d) || null;
}

function findCustomersByName(raw) {
  const q = String(raw || "").trim().toLowerCase();
  if (q.length < 2) return [];
  return (state.customers || []).filter((c) => {
    if (isWalkInCustomer(c)) return false;
    const name = String(c.business_name || c.name || "").trim().toLowerCase();
    return name.includes(q);
  }).slice(0, 8);
}

function parseClassicAddress(raw) {
  const text = String(raw || "").trim();
  if (!text) return { address: "", area: "", city: "", pin: "" };
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  let pin = "";
  if (parts.length && /^\d{6}$/.test(parts[parts.length - 1])) pin = parts.pop();
  let city = "";
  let area = "";
  if (parts.length >= 3) {
    city = parts.pop();
    area = parts.pop();
  } else if (parts.length === 2 && pin) {
    city = parts.pop();
    area = parts.pop();
  } else if (parts.length === 1 && pin) {
    city = parts.pop();
  }
  return { address: parts.join(", "), area, city, pin };
}

function setClassicField(id, value, { force = false } = {}) {
  const el = $(id);
  if (!el) return;
  if (!force && document.activeElement === el) return;
  el.value = value == null ? "" : String(value);
}

function customerDue(c) {
  return Number(c?.outstanding) || 0;
}

function isWalkInCustomer(c) {
  if (!c) return true;
  return c.code === "CUS-001" || /^walk-?in$/i.test(String(c.name || "").trim());
}

function walkInCustomer() {
  return (state.customers || []).find((c) => isWalkInCustomer(c)) || null;
}

function classicCustomerRecordDirty() {
  if (!isClassicBillShop()) return false;
  if (!isWalkInCustomer(customer())) return true;
  return [
    "bill-cust-name",
    "bill-cust-mobile",
    "bill-cust-address",
    "bill-cust-area",
    "bill-cust-city",
    "bill-cust-pin",
    "bill-doctor-rx",
    "counter-mobile",
  ].some((id) => String($(id)?.value || "").trim());
}

function resetClassicCustomerRecord({ focus = false } = {}) {
  if (!isClassicBillShop()) return;
  const walk = walkInCustomer();
  state.customerId = walk?.id || "";
  if ($("customer")) $("customer").value = state.customerId;
  if ($("counter-mobile")) $("counter-mobile").value = "";
  [
    "bill-cust-name",
    "bill-cust-mobile",
    "bill-cust-address",
    "bill-cust-area",
    "bill-cust-city",
    "bill-cust-pin",
    "bill-doctor-rx",
    "qc-name",
    "qc-mobile",
    "qc-address",
    "qc-doctor-rx",
  ].forEach((id) => {
    if ($(id)) $(id).value = "";
  });
  const wrap = $("quick-customer-wrap");
  if (wrap) wrap.open = false;
  hideClassicCustHits();
  state.loyaltyAccount = null;
  state.loyaltyRedeem = 0;
  if ($("loyalty-redeem")) $("loyalty-redeem").value = 0;
  paintBillCustomer();
  paintClassicCustomerStatus();
  paintClassicLoyalty();
  if (focus) $("bill-cust-mobile")?.focus();
}

function resetClassicBillEntry() {
  if ($("bill-scan-code")) $("bill-scan-code").value = "";
  if ($("bill-item-search")) $("bill-item-search").value = "";
  if ($("bill-scan-qty")) $("bill-scan-qty").value = "1";
  if ($("bill-scan-status")) $("bill-scan-status").textContent = "";
  $("bill-scan-form")?.classList.remove("is-hit", "is-miss");
  const hits = $("classic-item-hits");
  if (hits) {
    hits.hidden = true;
    hits.innerHTML = "";
  }
  const alert = $("classic-stock-alert");
  if (alert) {
    alert.hidden = true;
    alert.textContent = "";
  }
}

function customerOptionLabel(c) {
  const name = c.business_name || c.name || "Customer";
  const type = c.type || "b2c";
  const due = isWalkInCustomer(c) ? 0 : customerDue(c);
  return due > 0 ? `${name} (${type}) · Due ${money(due)}` : `${name} (${type})`;
}

function paintCounterDue(c) {
  const cust = c === undefined ? customer() : c;
  const walkIn = isWalkInCustomer(cust);
  const due = walkIn ? 0 : customerDue(cust);
  const method = $("pay-method")?.value;
  let bill = 0;
  if (typeof cartTotals === "function") {
    const t = cartTotals();
    bill = Number(t.total != null ? t.total : (t.taxable || 0) + (t.tax || 0)) || 0;
  }
  const creditAfter = !walkIn && method === "credit" && bill > 0;
  const after = due + (creditAfter ? bill : 0);
  let label = "";
  if (creditAfter && due > 0) label = `Due ${money(due)} · after credit ${money(after)}`;
  else if (creditAfter) label = `After credit ${money(after)}`;
  else if (due > 0) label = `Due ${money(due)}`;
  const chip = $("bill-due");
  if (chip) {
    chip.hidden = !label;
    chip.textContent = label;
  }
  const row = $("due-row");
  if (row) row.hidden = !(due > 0);
  if ($("due-total")) $("due-total").textContent = money(due);
  const faceRow = $("face-due-row");
  if (faceRow) faceRow.hidden = !(due > 0);
  if ($("face-due")) $("face-due").textContent = money(due);
  $("customer")?.classList.toggle("has-due", due > 0);
}

function paintBillCustomer() {
  const el = $("bill-customer");
  if (!el) {
    paintCounterDue();
    return;
  }
  const c = customer();
  if (!c) {
    el.textContent = "";
    paintCounterDue(null);
    return;
  }
  const name = String(c.business_name || c.name || "Walk-in").trim() || "Walk-in";
  const mobile = digitsMobile(c.mobile);
  if (isClassicBillShop()) {
    el.textContent = "";
    paintCounterDue(c);
    return;
  }
  el.textContent = isRealMobile(mobile) ? `${name} · ${mobile}` : name;
  paintCounterDue(c);
}

function selectCounterCustomer(cust, { hint = true } = {}) {
  if (!cust?.id) return false;
  state.customerId = cust.id;
  if ($("customer")) $("customer").value = cust.id;
  const mob = $("counter-mobile");
  const shown = digitsMobile(cust.mobile);
  if (mob && document.activeElement !== mob && isRealMobile(shown)) {
    mob.value = shown;
  }
  paintBillCustomer();
  fillPharmacyBillCustomerFromCustomer(cust, { force: true });
  clearClassicLoyalty();
  renderCatalog();
  renderCart();
  paintClassicLoyalty();
  void loadCustomerLoyalty();
  if (hint) {
    const due = isWalkInCustomer(cust) ? 0 : customerDue(cust);
    setHint(due > 0 ? `Customer · ${cust.business_name || cust.name} · Due ${money(due)}` : `Customer · ${cust.business_name || cust.name}`, "ok");
  }
  return true;
}

function applyCounterMobile(raw, { announceMiss = true } = {}) {
  const d = digitsMobile(raw);
  if (d.length < 10) return false;
  const cust = findCustomerByMobile(d);
  if (cust) {
    const wrap = $("quick-customer-wrap");
    if (wrap) wrap.open = false;
    hideClassicCustHits();
    return selectCounterCustomer(cust);
  }
  if (announceMiss) {
    const walk = (state.customers || []).find((c) => c.code === "CUS-001" || /walk-?in/i.test(String(c.name || "")));
    if (walk) {
      state.customerId = walk.id;
      if ($("customer")) $("customer").value = walk.id;
      clearClassicLoyalty();
      paintBillCustomer();
      paintClassicCustomerStatus();
      paintClassicLoyalty();
      renderCatalog();
      renderCart();
    }
    if (isClassicBillShop()) {
      setHint("No customer for this mobile — enter name and tap + Add customer", "error");
      paintClassicCustomerStatus();
      return false;
    }
    setHint("No customer for this mobile — add with + Customer", "error");
    if ($("qc-mobile")) $("qc-mobile").value = d;
    const wrap = $("quick-customer-wrap");
    if (wrap) wrap.open = true;
    $("qc-name")?.focus();
  } else if (isClassicBillShop()) {
    detachClassicUnknownCustomer();
  }
  return false;
}

function rateFor(item) {
  const type = customer()?.type || "b2c";
  const F = globalThis.POSFootwear;
  if (F?.looseSaleRate) return F.looseSaleRate(item, type);
  return Number(type === "b2b" ? item.b2b_rate : item.retail_rate);
}

function lineAmt(item, qtyGm) {
  return POSUnits.lineAmount(qtyGm, rateFor(item), itemUnit(item));
}

function canDiscount() {
  return can("discount") || state.session?.role === "business_admin";
}

function canClassicLineDiscount() {
  return canDiscount() || (isClassicBillShop() && (can("counter") || can("orders")));
}

function clearClassicLoyalty() {
  state.loyaltyAccount = null;
  state.loyaltyRedeem = 0;
  if ($("loyalty-redeem")) $("loyalty-redeem").value = 0;
}

function detachClassicUnknownCustomer() {
  const walk = walkInCustomer();
  state.customerId = walk?.id || "";
  if ($("customer")) $("customer").value = state.customerId;
  clearClassicLoyalty();
  paintBillCustomer();
  paintClassicLoyalty();
  paintClassicCustomerStatus();
}

function lineCalc(item, line) {
  const D = globalThis.POSDiscount;
  const F = globalThis.POSFootwear;
  if (!D) {
    const amount = lineAmt(item, line.qtyGm);
    return { taxable: amount, gst: (amount * Number(item.gst_rate)) / 100, discount: 0, profit: 0, mrp: amount, total: amount, gross: amount };
  }
  return D.computeLine({
    qty: line.qtyGm,
    rate: rateFor(item),
    gstRate: Number(item.gst_rate) || 0,
    mrp: Number(F?.looseMrp?.(item) ?? item.mrp ?? item.retail_rate) || rateFor(item),
    purchase_rate: Number(F?.looseCostRate?.(item) ?? item.purchase_rate) || 0,
    isCount: POSUnits.isCount(itemUnit(item)),
    discountType: line.discountType || "amt",
    discountValue: line.discountValue || 0,
  });
}

function medicinePackLabel(item) {
  return globalThis.POSFootwear?.medicinePackLabel?.(item) || "";
}

function formatExpiryShort(raw) {
  return globalThis.POSFootwear?.formatExpiryShort?.(raw) || String(raw || "").slice(0, 10);
}

function pharmacyBillCustomerName() {
  const typed = String($("bill-cust-name")?.value || "").trim();
  if (typed) return typed;
  const c = customer();
  if (isWalkInCustomer(c)) return "";
  const mob = pharmacyBillCustomerMobile();
  if (isRealMobile(mob) && digitsMobile(c?.mobile) !== mob) return "";
  return String(c?.business_name || c?.name || "").trim();
}

function pharmacyBillCustomerMobile() {
  const typed = digitsMobile($("bill-cust-mobile")?.value || $("counter-mobile")?.value || "");
  if (isRealMobile(typed)) return typed;
  return digitsMobile(customer()?.mobile);
}

function pharmacyBillCustomerAddress() {
  const parts = [
    $("bill-cust-address")?.value,
    $("bill-cust-area")?.value,
    $("bill-cust-city")?.value,
    $("bill-cust-pin")?.value,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(", ").slice(0, 500);
  return String(customer()?.address || "").trim();
}

function pharmacyBillDoctorRx() {
  const typed = String($("bill-doctor-rx")?.value || "").trim();
  if (typed) return typed;
  const c = customer();
  if (isWalkInCustomer(c)) return "";
  const mob = pharmacyBillCustomerMobile();
  if (isRealMobile(mob) && digitsMobile(c?.mobile) !== mob) return "";
  return String(c?.doctor_rx || "").trim();
}

function resolveClassicBillCustomerId() {
  const typedMob = pharmacyBillCustomerMobile();
  const byMob = findCustomerByMobile(typedMob);
  if (byMob?.id && !isWalkInCustomer(byMob)) return byMob.id;
  if (isRealMobile(typedMob) && !byMob) return "";
  const name = pharmacyBillCustomerName();
  if (name) {
    const exact = findCustomersByName(name).filter((c) => String(c.business_name || c.name || "").trim().toLowerCase() === name.toLowerCase());
    if (exact.length === 1) {
      if (!typedMob || digitsMobile(exact[0].mobile) === typedMob) return exact[0].id;
    }
  }
  const current = customer();
  if (current?.id && !isWalkInCustomer(current)) {
    if (!typedMob || digitsMobile(current.mobile) === typedMob) return current.id;
  }
  return "";
}

function fillPharmacyBillCustomerFromCustomer(cust, { force = false } = {}) {
  if (!isClassicBillShop()) return;
  const c = cust === undefined ? customer() : cust;
  const walk = isWalkInCustomer(c);
  if (walk && !force) {
    paintClassicCustomerStatus();
    return;
  }
  const parsed = walk ? { address: "", area: "", city: "", pin: "" } : parseClassicAddress(c?.address);
  setClassicField("bill-cust-name", walk ? "" : String(c?.business_name || c?.name || ""), { force });
  setClassicField("bill-cust-address", parsed.address, { force });
  setClassicField("bill-cust-area", parsed.area, { force });
  setClassicField("bill-cust-city", parsed.city, { force });
  setClassicField("bill-cust-pin", parsed.pin, { force });
  setClassicField("bill-doctor-rx", walk ? "" : String(c?.doctor_rx || ""), { force });
  const shown = digitsMobile(c?.mobile);
  setClassicField("bill-cust-mobile", isRealMobile(shown) ? shown : "", { force });
  paintClassicCustomerStatus();
}

function hideClassicCustHits() {
  const box = $("classic-cust-hits");
  if (box) {
    box.hidden = true;
    box.innerHTML = "";
  }
}

function paintClassicCustHits(hits) {
  const box = $("classic-cust-hits");
  if (!box) return;
  if (!hits?.length) {
    hideClassicCustHits();
    return;
  }
  box.hidden = false;
  box.innerHTML = hits
    .map((c) => {
      const name = escapeHtml(c.business_name || c.name || "Customer");
      const mob = digitsMobile(c.mobile);
      const due = isWalkInCustomer(c) ? 0 : customerDue(c);
      const extra = due > 0 ? ` · Due ${escapeHtml(money(due))}` : "";
      return `<button type="button" class="classic-cust-hit" data-classic-cust="${escapeHtml(c.id)}">${name}${mob ? ` · ${escapeHtml(mob)}` : ""}${extra}</button>`;
    })
    .join("");
}

function paintClassicCustomerStatus() {
  if (!isClassicBillShop()) return;
  const chip = $("classic-cust-chip");
  const addBtn = $("classic-cust-add");
  const typedMobile = digitsMobile($("bill-cust-mobile")?.value || "");
  const c = customer();
  const walk = isWalkInCustomer(c);
  const matched = !walk && typedMobile.length === 10 && digitsMobile(c?.mobile) === typedMobile ? c : findCustomerByMobile(typedMobile);
  const pts = Number(state.loyaltyAccount?.points_balance) || 0;
  if (matched) {
    const due = customerDue(matched);
    const name = String(matched.business_name || matched.name || "Customer").trim();
    const bits = [name];
    if (due > 0) bits.push(`Due ${money(due)}`);
    if (pts > 0 && matched.id === state.customerId) bits.push(`${pts} pts`);
    if (chip) {
      chip.hidden = false;
      chip.className = `classic-cust-chip ${due > 0 ? "is-due" : "is-found"}`;
      chip.textContent = bits.join(" · ");
    }
    if (addBtn) addBtn.hidden = true;
    return;
  }
  if (typedMobile.length === 10) {
    if (chip) {
      chip.hidden = false;
      chip.className = "classic-cust-chip is-miss";
      chip.textContent = "New mobile — add customer";
    }
    if (addBtn) addBtn.hidden = false;
    return;
  }
  if (chip) {
    chip.hidden = false;
    chip.className = "classic-cust-chip is-wait";
    chip.textContent = walk ? "Type mobile to load customer" : String(c?.business_name || c?.name || "Customer");
  }
  if (addBtn) addBtn.hidden = true;
}

async function addClassicBillCustomer() {
  if (!isClassicBillShop()) return;
  const name = pharmacyBillCustomerName();
  const mobile = pharmacyBillCustomerMobile();
  if (!isRealMobile(mobile) && digitsMobile($("bill-cust-mobile")?.value || "").length !== 10) {
    $("bill-cust-mobile")?.focus();
    setHint("Enter a 10-digit mobile first", "error");
    paintClassicCustomerStatus();
    return;
  }
  if (!name) {
    $("bill-cust-name")?.focus();
    setHint("Enter customer name to add", "error");
    return;
  }
  try {
    const created = await saveCustomer({
      name,
      mobile: digitsMobile($("bill-cust-mobile")?.value || mobile),
      address: pharmacyBillCustomerAddress(),
      doctor_rx: pharmacyBillDoctorRx(),
    });
    if (created) selectCounterCustomer(created);
    setHint(`Customer added · ${created?.name || name}`, "ok");
  } catch (err) {
    setHint(err.message || "Could not add customer", "error");
  }
}

function syncPharmacyMobile(fromBill) {
  const top = $("counter-mobile");
  const bill = $("bill-cust-mobile");
  if (!top || !bill) return;
  if (fromBill) top.value = bill.value;
  else if (document.activeElement !== bill) bill.value = top.value;
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

function findItemBySkuOrHsn(code) {
  const q = String(code || "").trim().toLowerCase();
  if (!q) return null;
  const hits = activeItems().filter((i) =>
    [i.code, i.hsn, i.sku].some((v) => String(v || "").trim().toLowerCase() === q),
  );
  return hits.length === 1 ? hits[0] : null;
}

function syncCounterQuery(raw, sourceEl) {
  const q = String(raw || "");
  state.query = q;
  if ($("search") && sourceEl !== $("search")) $("search").value = q;
  if ($("scan-code") && sourceEl !== $("scan-code") && sourceEl !== $("bill-item-search")) $("scan-code").value = q;
  if ($("bill-scan-code") && sourceEl !== $("bill-scan-code") && sourceEl !== $("bill-item-search")) $("bill-scan-code").value = q;
  renderCatalogDebounced();
}

function clearCounterQuery(sourceEl) {
  state.query = "";
  if ($("search")) $("search").value = "";
  if ($("scan-code") && sourceEl !== $("scan-code")) $("scan-code").value = "";
  if ($("bill-scan-code") && sourceEl !== $("bill-scan-code")) $("bill-scan-code").value = "";
  if ($("bill-item-search") && sourceEl !== $("bill-item-search")) $("bill-item-search").value = "";
  if (sourceEl) sourceEl.value = "";
  renderCatalog();
}

function packLabel() {
  if (!state.lastPack) return "";
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
  const table = state.activeTable;
  state.cart = [];
  state.lastPack = null;
  resetOfferPopup();
  state.editingOrderId = null;
  state.activeQrOrderId = "";
  state.activeTable = "";
  state.kotPrinted = [];
  state.billDiscountValue = 0;
  state.loyaltyRedeem = 0;
  state.offerBillLocked = false;
  state.offerAuto = true;
  if ($("bill-disc-value")) $("bill-disc-value").value = 0;
  if ($("loyalty-redeem")) $("loyalty-redeem").value = 0;
  state.query = "";
  if ($("search")) $("search").value = "";
  if ($("scan-code")) $("scan-code").value = "";
  if ($("pack-choice")) $("pack-choice").value = "";
  resetClassicBillEntry();
  resetClassicCustomerRecord();
  renderCatalog();
  renderCart();
  if (table) void dropTableHold(table);
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
  "customer-ledger": "Customer ledger",
  "supplier-ledger": "Supplier ledger",
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
  .report-block[hidden], tr[hidden], .report-grid[hidden] { display: none; }
  .report-block-meta { color: #64748b; font-size: 12px; margin: 2px 0 0; }
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
  let title = ACC_REPORT_TITLES[accTab] || "Accounts";
  const partySel = accTab === "customer-ledger" ? $("acc-customer") : accTab === "supplier-ledger" ? $("acc-supplier") : null;
  const partyName = partySel?.selectedOptions?.[0]?.textContent?.trim();
  if (partyName && partySel?.value) title = `${title} · ${partyName}`;
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
  if (img.id === "pay-qr-preview" && $("pay-qr-clear")) $("pay-qr-clear").hidden = !url;
}

function paintLogoFileName(name = "") {
  const el = $("logo-file-name");
  if (el) el.textContent = name || "PNG, JPG, or SVG";
}

function paintPayQrFileName(name = "") {
  const el = $("pay-qr-file-name");
  if (el) el.textContent = name || "PNG or JPG";
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
    .map((row) => {
      const search = row.map((c) => fmtCell(c)).join(" ").toLowerCase();
      return `<tr data-report-row="${escapeHtml(search)}">${row.map((c) => `<td>${escapeHtml(fmtCell(c))}</td>`).join("")}</tr>`;
    })
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

function reportBlock(title, sheet, headers, rows, group) {
  const n = Array.isArray(rows) ? rows.length : 0;
  return `<section class="report-block" data-report-title="${escapeHtml(title)}" data-report-group="${escapeHtml(group || "")}" data-report-sheet="${escapeHtml(sheet || "")}">
    <div class="report-block-head">
      <div>
        <h3>${escapeHtml(title)}</h3>
        <p class="report-block-meta">${n} ${n === 1 ? "row" : "rows"}</p>
      </div>
      <div class="print-actions">
        <button class="btn" type="button" data-print-report>Print</button>
        <a class="btn" href="${excelHref(sheet)}">Excel</a>
      </div>
    </div>
    ${htmlTable(headers, rows)}
  </section>`;
}

function setReportTab(tab) {
  const next = String(tab || "summary");
  state.reportTab = ["summary", "sales", "gst", "payment", "stock", "books"].includes(next) ? next : "summary";
  applyReportsFilter();
}

function reportsPrintHtml() {
  const sum = $("report-summary")?.cloneNode(true);
  if (sum) sum.hidden = false;
  const list = $("reports")?.cloneNode(true);
  list?.querySelectorAll("[hidden]").forEach((el) => el.removeAttribute("hidden"));
  return (sum?.outerHTML || "") + (list?.innerHTML || "");
}

function applyReportsFilter() {
  const tab = state.reportTab || "summary";
  const q = String($("rep-search")?.value || "").trim().toLowerCase();
  document.querySelectorAll("#reports-tabs [data-report-tab]").forEach((btn) => {
    const on = btn.dataset.reportTab === tab;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  const summary = $("report-summary");
  if (summary) summary.hidden = Boolean(q) || tab !== "summary";
  let shown = 0;
  document.querySelectorAll("#reports .report-block").forEach((block) => {
    const group = block.dataset.reportGroup;
    const sheet = block.dataset.reportSheet;
    const rows = block.querySelectorAll("tbody tr");
    let rowHits = 0;
    rows.forEach((tr) => {
      const hay = tr.getAttribute("data-report-row") || tr.textContent || "";
      const hit = !q || hay.toLowerCase().includes(q);
      tr.hidden = !hit;
      if (hit) rowHits += 1;
    });
    let visible;
    if (q) {
      visible = rowHits > 0 || (!rows.length && String(block.dataset.reportTitle || "").toLowerCase().includes(q));
    } else if (tab === "summary") {
      visible = sheet === "GST summary";
    } else {
      visible = group === tab;
    }
    block.hidden = !visible;
    if (visible) shown += 1;
  });
  const hint = $("reports-filter-hint");
  if (hint) {
    hint.textContent = q ? (shown ? `${shown} matching section${shown === 1 ? "" : "s"}` : "No matching rows in this range") : "";
  }
}

function paintReportsHero(s, data) {
  const el = $("reports-hero-stats");
  if (!el) return;
  const low = (data.low || []).length;
  el.innerHTML = [
    ["Takings", money(s.takings), "sales", false],
    ["Bills", s.bills ?? 0, "sales", false],
    ["Net GST", money(s.netGst), "gst", false],
    ["Expenses", money(s.expenses), "books", false],
    ["Low stock", low, "stock", low > 0],
  ]
    .map(
      ([k, v, tab, warn]) =>
        `<button type="button" class="items-stat${warn ? " is-warn" : ""}" data-report-tab="${tab}"><span>${k}</span><strong>${escapeHtml(String(v))}</strong></button>`,
    )
    .join("");
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

function canManageDiningLayout() {
  return isRestaurantShop() && state.session?.role === "business_admin";
}

function paintStaffRoleOptions() {
  const sel = $("st-role");
  if (!sel) return;
  const cafe = isRestaurantShop();
  const current = sel.value;
  sel.querySelectorAll('option[value="captain"], option[value="kitchen"]').forEach((opt) => {
    const keep = cafe || current === opt.value;
    opt.hidden = !keep;
    opt.disabled = !keep;
  });
  if (!cafe && (sel.value === "captain" || sel.value === "kitchen") && sel.querySelector(`option[value="${sel.value}"]`)?.hidden) {
    sel.value = "cashier";
  }
}

function landingView() {
  const role = state.session?.role;
  if (isRestaurantShop() && role === "kitchen" && can("kot")) return "kot";
  if (isRestaurantShop() && role === "captain" && can("counter")) return "counter";
  if (can("dashboard")) return "dashboard";
  if (can("counter")) return "counter";
  if (can("kot")) return "kot";
  return "support";
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
      returns: "orders",
      "qr-orders": "orders",
      prescriptions: "orders",
      kot: "kot",
      purchases: "purchases",
      suppliers: "suppliers",
      stock: "stock",
      expiry: "stock",
      staff: "staff",
      branches: "branches",
      devices: "devices",
      support: "support",
      accounts: "accounts",
      expenses: "accounts",
      reports: "reports",
      growth: "reports",
      settings: "settings",
      backup: "settings",
      barcodes: "items",
      damage: "stock",
      ledger: "stock",
      loyalty: "customers",
      offers: "discount",
    };
    btn.hidden = map[view] ? !can(map[view]) : false;
    if (view === "growth") btn.hidden = !(can("growth") || can("reports"));
    if (view === "offers") btn.hidden = !(can("discount") || can("items") || can("growth"));
    if (view === "packs" && !isSpiceShop()) btn.hidden = true;
    if (view === "qr-orders" && isPharmacyShop()) btn.hidden = true;
    if (view === "prescriptions") btn.hidden = !isPharmacyShop() || !can("orders");
    if (view === "returns") btn.hidden = !isClassicBillShop() || !can("orders");
    if (view === "kot") btn.hidden = !isRestaurantShop() || !can("kot");
  });
  paintStaffRoleOptions();
  const growthBtn = $("open-growth");
  if (growthBtn) growthBtn.hidden = !(can("growth") || can("reports"));
  const offersBtn = $("open-offers");
  if (offersBtn) offersBtn.hidden = !(can("discount") || can("items") || can("growth"));
  document.querySelectorAll("#dash-shortcuts [data-dash-view]").forEach((btn) => {
    const view = btn.dataset.dashView;
    const module = {
      counter: "counter",
      items: "items",
      stock: "stock",
      orders: "orders",
      customers: "customers",
      purchases: "purchases",
      reports: "reports",
      settings: "settings",
    }[view];
    btn.hidden = module ? !can(module) : false;
  });
}

function tt(key, fallback, vars) {
  if (window.POSI18n) return window.POSI18n.t(key, vars);
  return fallback != null ? fallback : key;
}

function selectedCustomer() {
  return (state.customers || []).find((c) => c.id === state.customerId) || null;
}

function applyUiLocale() {
  const I = window.POSI18n;
  if (!I) return I;
  const shop = state.company?.locale || "";
  const user = state.session?.locale || "";
  const customer = selectedCustomer()?.locale || "";
  const locale = I.resolveLocale({ customer: "", user, shop, platform: "en" });
  I.setLocale(locale);
  I.setInvoiceMode(state.company?.invoice_language || "shop");
  I.applyDocument();
  fillLocaleSelects();
  paintViewHeader(state.currentView || "dashboard");
  return I;
}

function fillLocaleSelects() {
  const I = window.POSI18n;
  if (!I) return;
  const userLoc = I.normalizeLocale(state.session?.locale) || I.normalizeLocale(state.company?.locale) || "en";
  const shopLoc = I.normalizeLocale(state.company?.locale) || "en";
  const setOpts = (el, selected, includeBlank) => {
    if (!el) return;
    const blank = includeBlank ? `<option value="">${tt("settings.invoice_shop", "Shop language")}</option>` : "";
    el.innerHTML = blank + I.optionsHtml(selected);
    if (selected) el.value = selected;
  };
  setOpts($("topbar-locale"), userLoc);
  setOpts($("set-user-locale"), userLoc);
  setOpts($("set-shop-locale"), shopLoc);
  setOpts($("set-email-language"), I.normalizeLocale(state.company?.email_language) || shopLoc);
  setOpts($("set-ai-language"), I.normalizeLocale(state.company?.ai_language) || shopLoc);
  setOpts($("cust-locale"), I.normalizeLocale(selectedCustomer()?.locale) || "", true);
  if ($("set-invoice-language")) $("set-invoice-language").value = state.company?.invoice_language || "shop";
  if ($("set-wa-language")) $("set-wa-language").value = state.company?.whatsapp_language || "customer";
  document.querySelectorAll(".shop-lang-only").forEach((el) => {
    el.hidden = !can("settings");
  });
}

function paintViewHeader(name) {
  const meta = VIEW_META[name] || { title: name, subtitle: "" };
  const titleKeys = {
    dashboard: "nav.dashboard",
    counter: "nav.counter",
    items: "pos.items",
    customers: "nav.customers",
    orders: "nav.invoices",
    returns: "nav.returns",
    "qr-orders": "nav.qr_orders",
    prescriptions: "nav.prescriptions",
    kot: "nav.kot",
    purchases: "nav.purchases",
    suppliers: "nav.suppliers",
    stock: "nav.stock",
    reports: "nav.reports",
    growth: "nav.growth",
    settings: "nav.settings",
    backup: "nav.backup",
    accounts: "nav.accounts",
    expenses: "nav.expenses",
    staff: "nav.staff",
    offers: "nav.offers",
    loyalty: "nav.loyalty",
  };
  const titleEl = $("view-title");
  const subEl = $("view-subtitle");
  if (titleEl) titleEl.textContent = titleKeys[name] ? tt(titleKeys[name], meta.title) : meta.title;
  if (subEl) subEl.textContent = meta.subtitle;
  document.getElementById("view-topbar")?.classList.toggle("is-counter", name === "counter");
}

function showSettingsTab(tab) {
  const name = tab === "backup" || tab === "language" ? tab : "profile";
  if ($("settings-pane-profile")) $("settings-pane-profile").hidden = name !== "profile";
  if ($("settings-pane-language")) $("settings-pane-language").hidden = name !== "language";
  if ($("settings-pane-backup")) $("settings-pane-backup").hidden = name !== "backup";
  document.querySelectorAll("[data-settings-tab]").forEach((btn) => {
    const on = btn.dataset.settingsTab === name;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  paintViewHeader(name === "backup" ? "backup" : "settings");
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === "settings");
  });
  if (name === "backup" && $("btn-backup-download")) $("btn-backup-download").href = posUrl("/api/backup");
}

function showView(name) {
  if (name === "qr-orders" && isPharmacyShop()) name = "prescriptions";
  if (name === "prescriptions" && !isPharmacyShop()) name = can("counter") ? "counter" : landingView();
  if (name === "kot" && (!isRestaurantShop() || !can("kot"))) name = can("counter") ? "counter" : landingView();
  const requested = name;
  state.currentView = name === "backup" || name === "language" ? "settings" : name;
  if (name === "backup") name = "settings";
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
  if (name === "settings") showSettingsTab(requested === "backup" || requested === "language" ? requested : "profile");
  if (name === "reports") loadReports();
  if (name === "growth") loadGrowthDashboard();
  if (name === "accounts") loadAccounts();
  if (name === "expenses") loadExpenses();
  if (name === "orders") loadOrders();
  if (name === "returns") loadReturnsView();
  if (name === "qr-orders") loadQrOrders();
  if (name === "prescriptions") loadPrescriptions();
  if (name === "kot") {
    loadKots();
    startKotWatch();
  }
  if (name === "purchases") loadPurchases();
  if (name === "suppliers") loadSuppliers();
  if (name === "support") renderSupport();
  if (name === "dashboard") loadDashboard();
  paintDeskState(name);
  if (name === "stock") loadStock();
  if (name === "counter") {
    loadHolds();
    queueMicrotask(focusScanLane);
  }
  if (name === "barcodes") loadBarcodesView();
  if (name === "expiry") loadExpiryView();
  if (name === "damage") loadDamageView();
  if (name === "ledger") loadLedgerView();
  if (name === "loyalty") loadLoyaltyView();
  if (name === "offers") {
    bindOffersUi?.();
    loadOffersDesk?.(true);
  }
  if (name === "staff") loadStaff();
  if (name === "customers") {
    renderCustomersTable();
    fillDueCustomerSelect();
  }
  if (name === "branches") loadBranches();
  if (name === "devices") loadDevices();
  paintImpersonationControls();
  if (isMobileLayout()) setNavCollapsed(true);
}

function paintDeskState(name) {
  if (name === "units") renderUnitsTable();
  if (name === "items") {
    fillDatalists();
    renderItemsTable();
    fillItemUnitSelect($("item-unit")?.value || defaultItemUnit());
    refreshItemUnitLabels();
    paintItemImportLink();
  }
  if (name === "packs") {
    fillDatalists();
    renderPackCompose();
    renderPacksTable();
  }
  if (name === "purchases") {
    fillDatalists();
    renderPoLines();
  }
  if (name === "stock") fillDatalists();
  if (name === "counter") {
    renderCatalog();
    renderCart();
    renderPackChoice();
    paintComboBar();
    fillFootwearFilters();
  }
  if (name === "settings") renderSettings();
  if (name === "customers") {
    renderCustomersTable();
    fillDueCustomerSelect();
  }
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
  const R = restaurantApi();
  const all = Array.isArray(state.held) ? state.held : [];
  const list = isRestaurantShop() && R ? all.filter((h) => !R.isTableHold(h)) : all;
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

function tableHoldPayload() {
  return {
    table_no: state.activeTable || "",
    cart: state.cart,
    customerId: state.customerId,
    lastPack: state.lastPack,
    billDiscountType: state.billDiscountType,
    billDiscountValue: state.billDiscountValue,
    loyaltyRedeem: state.loyaltyRedeem,
    kotPrinted: state.kotPrinted || [],
    qrOrderId: state.activeQrOrderId || "",
  };
}

function cartLineFromHold(line) {
  return {
    lineId: line.lineId || newCartLineId(),
    itemId: line.itemId,
    qtyGm: Number(line.qtyGm) || 0,
    discountType: line.discountType || "amt",
    discountValue: Number(line.discountValue) || 0,
    barcode: line.barcode || "",
    offerId: line.offerId || "",
    notes: String(line.notes || "").trim(),
  };
}

function applyHoldToCart(payload, opts = {}) {
  const keep = Boolean(opts.keepHold);
  state.cart = (payload?.cart || []).map(cartLineFromHold).filter((l) => l.itemId && l.qtyGm > 0);
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
  else if ($("pack-choice")) $("pack-choice").value = "";
  state.kotPrinted = Array.isArray(payload.kotPrinted) ? payload.kotPrinted : [];
  if (payload.qrOrderId && keep) state.activeQrOrderId = payload.qrOrderId;
}

function diningCompany() {
  return { ...(state.company || {}), ...(state.businessMeta || {}) };
}

function diningLayout() {
  const R = restaurantApi();
  if (!R?.diningOf && !R?.tablesOf) return { floors: [], tables: [] };
  if (R.diningOf) return R.diningOf(diningCompany(), state.held);
  return { floors: R.floorsOf?.(diningCompany(), state.held) || [], tables: R.tablesOf(diningCompany(), state.held) };
}

function diningTables() {
  return diningLayout().tables;
}

function diningFloors() {
  return diningLayout().floors;
}

function tableIsBusy(tableId) {
  const R = restaurantApi();
  if (!R || !tableId) return false;
  return Boolean(R.findTableHold(state.held, tableId) || (state.activeTable === tableId && state.cart.length));
}

function busyTableIds(tables) {
  return (tables || diningTables()).filter((t) => tableIsBusy(t.id)).map((t) => t.id);
}

function currentFloorId(floors, tables) {
  const list = floors || diningFloors();
  const seats = tables || diningTables();
  const R = restaurantApi();
  const clip = R?.clipFloorId || ((v) => String(v || "").trim().toLowerCase());
  const want = clip(state.activeFloor);
  if (want && list.some((f) => f.id === want)) return want;
  const open = seats.find((t) => t.id === state.activeTable);
  if (open?.floor && list.some((f) => f.id === open.floor)) return open.floor;
  return list[0]?.id || "ground";
}

function syncActiveFloor(tableNo) {
  const R = restaurantApi();
  const layout = diningLayout();
  const id = R?.normalizeTableNo?.(tableNo) || tableNo;
  const row = layout.tables.find((t) => t.id === id);
  if (row?.floor) state.activeFloor = row.floor;
}

async function persistDiningTables(tables, floors) {
  if (!canManageDiningLayout()) throw new Error("Only the business admin can manage tables and floors");
  const R = restaurantApi();
  const json = R?.serializeTables ? R.serializeTables(tables, floors || diningFloors()) : JSON.stringify({ floors: floors || [], tables: tables || [] });
  const data = await api("/api/dining-tables", {
    method: "POST",
    body: JSON.stringify({ dining_tables_json: json }),
  });
  const saved = data.dining_tables_json || json;
  if (data.company) state.company = { ...state.company, ...data.company };
  else state.company = { ...(state.company || {}), dining_tables_json: saved };
  if (state.businessMeta) state.businessMeta = { ...state.businessMeta, dining_tables_json: saved };
  const board = $("table-board");
  board?.querySelector("[data-create-table]")?.setAttribute("hidden", "");
  board?.querySelector("[data-create-floor]")?.setAttribute("hidden", "");
  board?.querySelector("[data-edit-table]")?.setAttribute("hidden", "");
  board?.querySelector("[data-edit-floor]")?.setAttribute("hidden", "");
  renderTableBoard();
  paintQrTableCodes();
}

function renderTableBoard() {
  const el = $("table-board");
  if (!el) return;
  const R = restaurantApi();
  if (!isRestaurantShop() || !R) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  const { floors, tables } = diningLayout();
  const floorId = currentFloorId(floors, tables);
  state.activeFloor = floorId;
  const floorName = R.displayFloor?.(floorId, floors) || "Ground";
  const onFloor = R.tablesOnFloor ? R.tablesOnFloor(tables, floorId) : tables.filter((t) => (t.floor || "ground") === floorId);
  const busyCount = onFloor.filter((t) => tableIsBusy(t.id)).length;
  const creatingTable = Boolean(el.querySelector("[data-create-table]:not([hidden])"));
  const creatingFloor = Boolean(el.querySelector("[data-create-floor]:not([hidden])"));
  const editingTableId = el.querySelector("[data-edit-table]:not([hidden]) #table-edit-id")?.value || "";
  const editingFloorId = el.querySelector("[data-edit-floor]:not([hidden]) #floor-edit-id")?.value || "";
  const editingTableName = editingTableId
    ? ($("table-edit-name")?.value || tables.find((t) => t.id === editingTableId)?.name || "")
    : "";
  const editingFloorName = editingFloorId
    ? ($("floor-edit-name")?.value || floors.find((f) => f.id === editingFloorId)?.name || "")
    : "";
  const manage = canManageDiningLayout();
  const meta = tables.length
    ? `${onFloor.length} tables · ${busyCount} occupied${floors.length > 1 ? ` · ${floors.length} floors` : ""}`
    : manage
      ? "Create tables for this restaurant"
      : "Ask the business admin to add tables";
  const addRow = manage
    ? `<div class="dining-add-row">
        <button class="btn dining-add-btn" type="button" data-add-floor>+ Floor</button>
        <button class="btn dining-add-btn" type="button" data-add-table>+ Table</button>
      </div>`
    : "";
  el.hidden = false;
  el.innerHTML =
    `<div class="table-board-head">
      <div>
        <strong>${escapeHtml(floorName)}</strong>
        <span>${escapeHtml(meta)}</span>
      </div>
      ${addRow}
    </div>
    <div class="floor-chips"${floors.length > 1 || creatingFloor || editingFloorId ? "" : " hidden"}>
      ${floors
        .map((f) => {
          const count = (R.tablesOnFloor ? R.tablesOnFloor(tables, f.id) : tables.filter((t) => (t.floor || "ground") === f.id)).filter((t) => tableIsBusy(t.id)).length;
          const canRemove = manage && floors.length > 1 && !tables.some((t) => (t.floor || "ground") === f.id && tableIsBusy(t.id));
          return `<div class="floor-chip-wrap">
            <button class="floor-chip${f.id === floorId ? " is-on" : ""}" type="button" data-floor="${escapeHtml(f.id)}">
              ${escapeHtml(f.name)}${count ? `<span>${count}</span>` : ""}
            </button>
            ${manage ? `<button class="table-seat-edit floor-chip-edit" type="button" data-edit-floor-btn="${escapeHtml(f.id)}" title="Rename floor" aria-label="Rename ${escapeHtml(f.name)}">✎</button>` : ""}
            ${canRemove ? `<button class="table-seat-x floor-chip-x" type="button" data-remove-floor="${escapeHtml(f.id)}" aria-label="Remove ${escapeHtml(f.name)}">×</button>` : ""}
          </div>`;
        })
        .join("")}
    </div>
    <form class="table-create"${creatingFloor ? "" : " hidden"} data-create-floor>
      <input id="floor-create-name" name="floor-name" maxlength="32" placeholder="First / AC hall" aria-label="New floor name" autocomplete="off" />
      <button class="btn primary" type="submit">Create floor</button>
      <button class="btn" type="button" data-cancel-floor>Cancel</button>
    </form>
    <form class="table-create"${editingFloorId ? "" : " hidden"} data-edit-floor>
      <input type="hidden" id="floor-edit-id" value="${escapeHtml(editingFloorId)}" />
      <input id="floor-edit-name" name="floor-name" maxlength="32" placeholder="Floor name" aria-label="Floor name" autocomplete="off" value="${escapeHtml(editingFloorName)}" />
      <button class="btn primary" type="submit">Save floor</button>
      <button class="btn" type="button" data-cancel-edit-floor>Cancel</button>
    </form>
    <form class="table-create"${creatingTable ? "" : " hidden"} data-create-table>
      <input id="table-create-name" name="table-name" maxlength="32" placeholder="Table ${escapeHtml(R.nextNumericId?.(tables) || String(tables.length + 1))} or AC" aria-label="New table name" autocomplete="off" />
      <button class="btn primary" type="submit">Create table</button>
      <button class="btn" type="button" data-cancel-table>Cancel</button>
    </form>
    <form class="table-create"${editingTableId ? "" : " hidden"} data-edit-table>
      <input type="hidden" id="table-edit-id" value="${escapeHtml(editingTableId)}" />
      <input id="table-edit-name" name="table-name" maxlength="32" placeholder="Table name" aria-label="Table name" autocomplete="off" value="${escapeHtml(editingTableName)}" />
      <button class="btn primary" type="submit">Save table</button>
      <button class="btn" type="button" data-cancel-edit-table>Cancel</button>
    </form>
    <div class="table-seats">${
      onFloor
        .map((t) => {
          const hold = R.findTableHold(state.held, t.id);
          const payload = hold ? R.holdPayload(hold) || {} : {};
          const dishes = (payload.cart || []).length;
          const on = state.activeTable === t.id;
          const busy = Boolean(hold) || (on && state.cart.length);
          const metaLine = busy ? `${dishes || state.cart.length} ${dishes === 1 || (on && state.cart.length === 1) ? "dish" : "dishes"}` : "Free";
          return `<div class="table-seat-wrap">
            <button class="table-seat${on ? " is-on" : ""}${busy ? " is-busy" : ""}" type="button" data-table="${escapeHtml(t.id)}">
              <strong>${escapeHtml(t.name || R.displayTable(t.id))}</strong>
              <span>${escapeHtml(on && state.cart.length ? `${state.cart.length} dishes` : metaLine)}</span>
            </button>
            ${manage ? `<button class="table-seat-edit" type="button" data-edit-table-btn="${escapeHtml(t.id)}" title="Rename table" aria-label="Rename ${escapeHtml(t.name || t.id)}">✎</button>` : ""}
            <button class="table-seat-qr" type="button" data-table-qr="${escapeHtml(t.id)}" title="Print table QR" aria-label="Print QR for ${escapeHtml(t.name || t.id)}">QR</button>
            ${manage && !busy ? `<button class="table-seat-x" type="button" data-remove-table="${escapeHtml(t.id)}" aria-label="Remove ${escapeHtml(t.name || t.id)}">×</button>` : ""}
          </div>`;
        })
        .join("")
    }
      <button class="table-seat table-seat-parcel${state.activeTable === R.PARCEL ? " is-on" : ""}${state.activeTable === R.PARCEL && state.cart.length ? " is-busy" : ""}" type="button" data-table="${escapeHtml(R.PARCEL)}">
        <strong>Parcel</strong>
        <span>${state.activeTable === R.PARCEL && state.cart.length ? `${state.cart.length} dishes` : "Takeaway"}</span>
      </button>
    </div>`;
}

async function saveActiveTableHold() {
  const R = restaurantApi();
  if (!isRestaurantShop() || !R || !state.activeTable || !state.cart.length) return null;
  const data = await api("/api/holds", {
    method: "POST",
    body: JSON.stringify({
      label: R.holdLabel(state.activeTable),
      payload: tableHoldPayload(),
    }),
  });
  await loadHolds();
  return data;
}

async function dropTableHold(tableNo) {
  const R = restaurantApi();
  if (!R || !tableNo) return;
  const hold = R.findTableHold(state.held, tableNo);
  if (!hold?.id) return;
  try {
    await api(`/api/holds/${encodeURIComponent(hold.id)}`, { method: "DELETE" });
  } catch {
    /* already gone */
  }
  await loadHolds();
}

async function selectDiningTable(tableNo) {
  const R = restaurantApi();
  if (!R) return;
  const next = R.normalizeTableNo(tableNo);
  if (!next) return;
  if (state.activeTable === next) return;
  if (state.activeTable && state.cart.length) {
    try {
      await saveActiveTableHold();
    } catch (err) {
      setHint(err.message, "error");
      return;
    }
  }
  const hold = R.findTableHold(state.held, next);
  const payload = hold ? holdPayload(hold) : null;
  if (payload?.cart?.length) applyHoldToCart(payload, { keepHold: true });
  else {
    state.cart = [];
    state.kotPrinted = [];
    state.lastPack = null;
    if ($("pack-choice")) $("pack-choice").value = "";
  }
  state.activeTable = next;
  syncActiveFloor(next);
  renderCart();
  renderTableBoard();
  setHint(`${R.displayTable(next)} open`, "ok");
}

function ensureDiningTable() {
  const R = restaurantApi();
  if (!isRestaurantShop() || !R) return;
  if (!state.activeTable) state.activeTable = R.PARCEL;
}

function kotLinesForPrint(lines) {
  return (lines || []).map((line) => {
    const item = state.items.find((row) => row.id === (line.itemId || line.item_id));
    return {
      itemId: line.itemId || line.item_id,
      qtyGm: Number(line.qtyGm || line.quantity_gm) || 0,
      name: item?.name || line.name || line.item_name || "Item",
      unit: item?.unit || item?.base_unit || line.unit || "PCS",
      notes: String(line.notes || line.special_instruction || line.specialInstruction || "").trim(),
    };
  });
}

function resolveKitchenKot(opts = {}) {
  const R = restaurantApi();
  if (!R) throw new Error("Kitchen KOT is not available");
  const tableNo = R.normalizeTableNo(opts.tableNo || state.activeTable);
  const source = opts.lines || state.cart;
  if (!source.length) throw new Error("Nothing to send to kitchen");
  const pick = opts.full ? { kind: "reprint", lines: R.cartSnapshot(source) } : R.kotKind(source, opts.printed || state.kotPrinted);
  if (!pick.lines.length) throw new Error("Nothing new for kitchen");
  const named = kotLinesForPrint(pick.lines.map((line) => {
    const live = source.find((row) => (row.itemId || row.item_id) === line.itemId) || line;
    return { ...live, ...line };
  }));
  return { R, tableNo, pick, named, notes: opts.notes || "" };
}

function writeKitchenKotWindow(resolved) {
  const w = window.open("", "kitchen-kot", "width=400,height=720");
  if (!w) throw new Error("Allow pop-ups to print kitchen KOT");
  w.document.write(
    resolved.R.kotDocument({
      shop: state.company?.name || "Kitchen",
      tableNo: resolved.tableNo,
      when: formatShopTime(),
      notes: resolved.notes,
      kind: resolved.pick.kind,
      lines: resolved.named,
    }),
  );
  w.document.close();
}

function printKitchenKot(opts = {}) {
  const resolved = resolveKitchenKot(opts);
  writeKitchenKotWindow(resolved);
  return resolved.pick;
}

async function sendKitchenKot() {
  ensureDiningTable();
  const resolved = resolveKitchenKot({ tableNo: state.activeTable, lines: state.cart, printed: state.kotPrinted });
  const data = await api("/api/kots", {
    method: "POST",
    body: JSON.stringify({
      table_no: state.activeTable,
      kind: resolved.pick.kind,
      lines: resolved.named,
    }),
  });
  const ticketId = data?.ticket?.id;
  if (ticketId) {
    if (!kotSeenIds) kotSeenIds = new Set();
    kotSeenIds.add(String(ticketId));
  }
  state.kotPrinted = restaurantApi().cartSnapshot(state.cart);
  let printed = true;
  try {
    writeKitchenKotWindow(resolved);
  } catch {
    printed = false;
  }
  try {
    await saveActiveTableHold();
  } catch {
    /* ticket already saved */
  }
  setHint(
    printed
      ? resolved.pick.kind === "reprint"
        ? "Kitchen KOT reprint"
        : "Kitchen KOT sent"
      : "Kitchen ticket saved. Allow pop-ups to print the slip.",
    "ok",
  );
}

function kotStatusLabel(status) {
  const s = String(status || "new");
  if (s === "preparing") return "Preparing";
  if (s === "ready") return "Ready";
  if (s === "done") return "Done";
  if (s === "reprint") return "Reprint";
  return "New";
}

function nextKotStatus(status) {
  const s = String(status || "new");
  if (s === "new") return "preparing";
  if (s === "preparing") return "ready";
  if (s === "ready") return "done";
  return "";
}

function nextKotStatusLabel(status) {
  const next = nextKotStatus(status);
  if (next === "preparing") return "Start";
  if (next === "ready") return "Ready";
  if (next === "done") return "Done";
  return "";
}

function kotQtyLine(line) {
  const item = state.items.find((row) => row.id === (line.itemId || line.item_id));
  return fmtQty(line.qtyGm || line.quantity_gm, item || { unit: line.unit, base_unit: line.unit });
}

function kotTimerHtml(ticket) {
  const R = restaurantApi();
  const clock = R?.kotTimerState?.(ticket) || { label: "0:00", tone: "ok", frozen: false, started: ticket?.created_at || "", stopped: "" };
  const started = String(clock.started || ticket?.created_at || "");
  const stopped = clock.frozen ? String(clock.stopped || ticket?.updated_at || "") : "";
  return `<time class="kot-timer is-${escapeHtml(clock.tone)}" data-kot-timer datetime="${escapeHtml(started)}" data-started="${escapeHtml(started)}" data-stopped="${escapeHtml(stopped)}" data-status="${escapeHtml(ticket.status || "new")}" aria-label="Order time ${escapeHtml(clock.label)}">${escapeHtml(clock.label)}</time>`;
}

function paintKotTimers(now = Date.now()) {
  const R = restaurantApi();
  if (!R?.formatKotTimer) return;
  document.querySelectorAll("[data-kot-timer]").forEach((el) => {
    const ticket = {
      created_at: el.getAttribute("data-started") || el.getAttribute("datetime"),
      updated_at: el.getAttribute("data-stopped") || "",
      status: el.getAttribute("data-status") || "new",
    };
    const clock = R.kotTimerState(ticket, now);
    el.textContent = clock.label;
    el.setAttribute("aria-label", `Order time ${clock.label}`);
    el.className = `kot-timer is-${clock.tone}`;
    const card = el.closest(".kot-card");
    if (card) {
      card.classList.toggle("is-late", clock.tone === "late");
      card.classList.toggle("is-warn", clock.tone === "warn");
    }
  });
}

function renderKotBoard() {
  const el = $("kot-list");
  if (!el) return;
  const filter = state.kotFilter || "";
  const rows = (state.kotTickets || []).filter((row) => !filter || row.status === filter);
  el.innerHTML = rows.length
    ? rows
        .map((ticket) => {
          const next = nextKotStatus(ticket.status);
          const nextLab = nextKotStatusLabel(ticket.status);
          const R = restaurantApi();
          const table = R?.displayTable?.(ticket.table_no) || ticket.table_no || "—";
          const when = ticket.created_at ? formatShopDateTime(ticket.created_at) : "";
          const kind = ticket.kind === "reprint" ? "Reprint" : "KOT";
          return `<article class="kot-card is-${escapeHtml(ticket.status || "new")}" data-kot="${escapeHtml(ticket.id)}">
            <header class="kot-card-head">
              <div>
                <h3>${escapeHtml(table)}</h3>
                <p class="kot-meta">${escapeHtml(kind)}${when ? ` · ${escapeHtml(when)}` : ""}</p>
              </div>
              <div class="kot-head-right">
                ${kotTimerHtml(ticket)}
                <span class="kot-status">${escapeHtml(kotStatusLabel(ticket.status))}</span>
              </div>
            </header>
            <div class="kot-lines">${(ticket.lines || [])
              .map((line) => {
                const si = String(line.notes || line.special_instruction || "").trim();
                return `<div class="kot-line"><span>${escapeHtml(line.name || "Item")}${si ? `<small class="kot-si">${escapeHtml(si)}</small>` : ""}</span><strong>${escapeHtml(kotQtyLine(line))}</strong></div>`;
              })
              .join("")}</div>
            ${ticket.notes ? `<p class="kot-note">Note: ${escapeHtml(ticket.notes)}</p>` : ""}
            <div class="kot-actions">
              ${next ? `<button class="btn primary" type="button" data-kot-status="${escapeHtml(next)}">${escapeHtml(nextLab)}</button>` : ""}
              <button class="btn" type="button" data-kot-reprint>Reprint</button>
            </div>
          </article>`;
        })
        .join("")
    : `<div class="item-empty-card"><strong>No kitchen tickets</strong><p>Captain or cashier sends Kitchen KOT from Counter. Tickets show here for the kitchen to cook.</p></div>`;
  paintKotTimers();
}

async function loadKots({ announce } = {}) {
  const hint = $("kot-hint");
  if (!can("kot") && !can("counter")) return;
  try {
    const rows = await api("/api/kots");
    applyKotSnapshot(rows, { announce: announce ?? kotSeenIds != null });
  } catch (err) {
    if (hint) {
      hint.textContent = err.message;
      hint.className = "hint error";
    }
  }
}

let kotPollTimer = null;
let kotClockTimer = null;
let kotSeenIds = null;
let kotToastId = "";
let kotToastTimer = 0;

function paintKotBadge() {
  const n = (state.kotTickets || []).filter((row) => String(row.status || "new") === "new").length;
  const badge = $("kot-badge");
  if (badge) {
    badge.textContent = String(n);
    badge.hidden = n === 0;
  }
}

function paintKotSoundToggle() {
  const btn = $("kot-sound-toggle");
  if (!btn) return;
  const on = globalThis.POSQrNotify?.soundOn() !== false;
  btn.textContent = on ? "Sound on" : "Sound off";
  btn.setAttribute("aria-pressed", on ? "true" : "false");
}

function hideKotToast() {
  const toast = $("kot-toast");
  if (toast) toast.hidden = true;
  kotToastId = "";
  if (kotToastTimer) clearTimeout(kotToastTimer);
  kotToastTimer = 0;
}

function showKotToast(ticket, extra = 0) {
  const toast = $("kot-toast");
  if (!toast || !ticket) return;
  const R = restaurantApi();
  kotToastId = ticket.id || "";
  const title = $("kot-toast-title");
  const copy = $("kot-toast-copy");
  if (title) title.textContent = extra > 0 ? `${extra + 1} new kitchen tickets` : "New kitchen KOT";
  if (copy) copy.textContent = R?.kotToastCopy?.(ticket, extra) || R?.displayTable?.(ticket.table_no) || "New ticket";
  toast.hidden = false;
  if (kotToastTimer) clearTimeout(kotToastTimer);
  kotToastTimer = setTimeout(hideKotToast, 14000);
}

function applyKotSnapshot(rows, { announce = false } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const R = restaurantApi();
  const incoming = R?.newKots?.(kotSeenIds, list) || [];
  state.kotTickets = list;
  if (kotSeenIds == null) kotSeenIds = new Set(list.map((row) => String(row.id)).filter(Boolean));
  else {
    list.forEach((row) => {
      if (row?.id) kotSeenIds.add(String(row.id));
    });
  }
  paintKotBadge();
  renderKotBoard();
  if (!announce || !incoming.length) return incoming;
  incoming.forEach((row) => kotSeenIds.add(String(row.id)));
  globalThis.POSQrNotify?.playTone?.({ force: true });
  setTimeout(() => globalThis.POSQrNotify?.playTone?.({ force: true }), 450);
  globalThis.POSQrNotify?.desktopNotify?.(incoming[0], incoming.length - 1, {
    title: "New kitchen KOT",
    body: R?.kotToastCopy?.(incoming[0], incoming.length - 1) || "New ticket",
    tag: `kot-${incoming[0].id || "new"}`,
  });
  showKotToast(incoming[0], incoming.length - 1);
  paintQrSoundArm();
  return incoming;
}

function startKotWatch() {
  if (kotPollTimer || !isRestaurantShop() || !(can("kot") || can("counter"))) return;
  paintKotSoundToggle();
  paintQrSoundArm();
  const kick = () => void loadKots({ announce: false });
  if (typeof requestIdleCallback === "function") requestIdleCallback(kick, { timeout: 2500 });
  else setTimeout(kick, 1200);
  kotPollTimer = setInterval(() => void loadKots({ announce: true }), 4000);
  if (!kotClockTimer) kotClockTimer = setInterval(() => paintKotTimers(), 1000);
  document.addEventListener("pos-qr-sound", () => {
    paintKotSoundToggle();
    paintQrSoundArm();
  });
}

async function setKotStatus(id, status) {
  await api(`/api/kots/${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
  await loadKots();
}

function reprintSavedKot(ticket) {
  printKitchenKot({
    tableNo: ticket.table_no,
    lines: ticket.lines || [],
    printed: [],
    notes: ticket.notes,
    full: true,
  });
}

function printQrKitchenKot(order) {
  const R = restaurantApi();
  if (!R || !order) return;
  const lines = (order.lines || []).map((line) => ({
    itemId: line.item_id,
    qtyGm: Number(line.quantity_gm) || 0,
    name: line.item_name,
    unit: line.unit || "PCS",
    notes: String(line.notes || "").trim(),
  }));
  printKitchenKot({
    tableNo: order.table_no,
    lines,
    printed: [],
    notes: order.notes,
    full: true,
  });
}

async function loadHolds() {
  try {
    const rows = await api("/api/holds");
    state.held = Array.isArray(rows) ? rows : [];
  } catch {
    state.held = [];
  }
  renderHeldBills();
  renderTableBoard();
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
  state.cart = payload.cart.map(cartLineFromHold).filter((l) => l.itemId && l.qtyGm > 0);
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
  const R = restaurantApi();
  const tableNo = R?.tableNoFromHold?.(row) || R?.normalizeTableNo?.(payload.table_no || payload.tableNo) || "";
  if (isRestaurantShop() && R && tableNo) {
    state.activeTable = tableNo;
    syncActiveFloor(tableNo);
  }
  renderCustomersSelect();
  renderCart();
  setHint(`Recalled ${row?.label || "held bill"}`, "ok");
}

function activeItems() {
  return state.items.filter((i) => i.status !== "inactive");
}

function itemStatusOf(raw) {
  return String(raw || "active").toLowerCase() === "inactive" ? "inactive" : "active";
}

function paintItemStatus(status) {
  const next = itemStatusOf(status);
  if ($("item-status")) $("item-status").value = next;
  document.querySelectorAll("#item-form [data-set-item-status]").forEach((btn) => {
    btn.classList.toggle("is-on", btn.dataset.setItemStatus === next);
  });
}

function itemWriteBody(item, extra) {
  const unit = itemUnit(item);
  return {
    name: item.name,
    local_name: item.local_name || "",
    hsn: item.hsn || "",
    category: item.category || defaultItemCategory(),
    subcategory: item.subcategory || "",
    color: item.color || "",
    size: item.size || "",
    wearer_type: item.wearer_type || "",
    base_unit: unit,
    unit,
    retail_rate: item.retail_rate,
    b2b_rate: item.b2b_rate,
    purchase_rate: item.purchase_rate,
    gst_rate: item.gst_rate,
    mrp: item.mrp || "",
    barcode_qty: 0,
    stock_gm: item.stock_gm,
    reorder_level_gm: item.reorder_level_gm,
    status: itemStatusOf(item.status),
    generic_name: item.generic_name || item.local_name || "",
    medicine_type: item.medicine_type || "",
    manufacturer: item.manufacturer || "",
    pack_size: item.pack_size || "",
    pack_unit: item.pack_unit || "",
    units_per_pack: item.units_per_pack || 1,
    batch_no: item.batch_no || "",
    default_expiry: item.default_expiry || "",
    barcode: item.barcode || "",
    ...(extra || {}),
  };
}

function itemCategoryLabel(item) {
  const c = String(item?.category || "").trim();
  return c || "Uncategorised";
}

function catalogCategories() {
  const names = new Set();
  for (const i of activeItems()) names.add(itemCategoryLabel(i));
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function filteredItems() {
  const q = state.query.trim().toLowerCase();
  const classic = isClassicBillShop();
  const wearer = classic ? "" : String(state.wearerFilter || "").toLowerCase();
  const size = classic ? "" : String(state.sizeFilter || "").trim().toLowerCase();
  const color = classic ? "" : String(state.colorFilter || "").trim().toLowerCase();
  const cat = classic || q ? "" : String(state.categoryFilter || "");
  return activeItems().filter((i) => {
    if (cat && itemCategoryLabel(i) !== cat) return false;
    if (wearer && globalThis.POSFootwear?.normalizeWearer(i.wearer_type) !== wearer) return false;
    if (size && String(i.size || "").trim().toLowerCase() !== size) return false;
    if (color && String(i.color || "").trim().toLowerCase() !== color) return false;
    if (!q) return true;
    if (window.POSI18n?.matchesQuery) return window.POSI18n.matchesQuery(i, q);
    return [i.name, i.hsn, i.local_name, i.generic_name, i.manufacturer, i.medicine_type, i.batch_no, i.code, i.barcode, i.category, i.subcategory, i.color, i.size, i.wearer_type]
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

function catalogCardMeta(item) {
  const variant = itemVariantText(item);
  if (variant) return { sku: variant, detail: variant };
  if (isRestaurantShop()) {
    return { sku: String(item.subcategory || "").trim(), detail: "" };
  }
  return {
    sku: `${item.category} / ${item.subcategory || "—"}`,
    detail: item.hsn ? `${taxCodeLabel()} ${item.hsn}` : "",
  };
}

function catalogCardHtml(i) {
  const low = Number(i.stock_gm) <= Number(i.reorder_level_gm);
  const meta = catalogCardMeta(i);
  const restaurant = isRestaurantShop();
  const qty = restaurant ? "" : fmtQty(i.stock_gm, i);
  const stock = restaurant
    ? (Number(i.gst_rate) ? `GST ${escapeHtml(i.gst_rate)}%` : "")
    : `${escapeHtml(i.code)} · GST ${escapeHtml(i.gst_rate)}%`;
  return `<button class="card" type="button" data-add="${escapeHtml(i.id)}">
        ${cardPhotoHtml(i)}
        <div class="card-body">
          ${meta.sku ? `<div class="sku">${escapeHtml(meta.sku)}</div>` : ""}
          <div class="name">${escapeHtml(i.name)}${meta.detail ? ` <small>${escapeHtml(meta.detail)}</small>` : ""}</div>
          <div class="meta"><span class="card-price">${money(rateFor(i))}${escapeHtml(POSUnits.rateSuffix(itemUnit(i)))}</span>${qty ? `<span class="card-qty">${escapeHtml(qty)}</span>` : ""}</div>
          ${stock ? `<div class="stock ${low ? "low" : "ok"}">${stock}</div>` : ""}
        </div>
      </button>`;
}

function renderCatalogCats() {
  const el = $("catalog-cats");
  if (!el) return;
  const cats = catalogCategories();
  if (state.categoryFilter && !cats.includes(state.categoryFilter)) state.categoryFilter = "";
  const current = String(state.categoryFilter || "");
  if (cats.length < 2) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  const counts = new Map();
  for (const i of activeItems()) {
    const key = itemCategoryLabel(i);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const chips = [
    `<button type="button" class="catalog-cat${current ? "" : " is-on"}" data-cat="" role="tab" aria-selected="${current ? "false" : "true"}">All <span>${activeItems().length}</span></button>`,
    ...cats.map(
      (c) =>
        `<button type="button" class="catalog-cat${current === c ? " is-on" : ""}" data-cat="${escapeHtml(c)}" role="tab" aria-selected="${current === c ? "true" : "false"}">${escapeHtml(c)} <span>${counts.get(c) || 0}</span></button>`,
    ),
  ];
  el.hidden = false;
  el.innerHTML = chips.join("");
}

function itemStockInfo(item) {
  const stock = Number(item?.stock_gm) || 0;
  const reorder = Number(item?.reorder_level_gm) || 0;
  const out = stock <= 0;
  const low = !out && reorder > 0 && stock <= reorder;
  return {
    stock,
    label: fmtQty(stock, item),
    out,
    low,
    tone: out ? "out" : low ? "low" : "ok",
  };
}

function itemExpiryInfo(item) {
  const date = String(item?.default_expiry || item?.primary_expiry || item?.expiry_date || "").slice(0, 10);
  const days = date ? expiryDaysLeft({ expiry_date: date }) : null;
  const expired = Number.isFinite(days) && days < 0;
  const soon = Number.isFinite(days) && days >= 0 && days <= 30;
  return {
    date,
    days,
    expired,
    soon,
    tone: expired ? "expired" : soon ? (days <= 7 ? "soon" : "watch") : "none",
    label: Number.isFinite(days) ? expiryDaysLabel(days) : "",
    short: formatExpiryShort(date) || "",
  };
}

function classicItemAlerts(item) {
  const stock = itemStockInfo(item);
  const exp = itemExpiryInfo(item);
  const alerts = [];
  if (exp.expired) alerts.push(`EXPIRED ${exp.short || exp.label}`.trim());
  else if (exp.soon) alerts.push(exp.label);
  if (stock.out) alerts.push("Out of stock");
  else if (stock.low) alerts.push(`Low stock ${stock.label}`);
  return { stock, exp, alerts };
}

function warnClassicItem(item) {
  if (!isClassicBillShop() || !item) return;
  const { alerts } = classicItemAlerts(item);
  if (!alerts.length) return;
  setHint(`${item.name}: ${alerts.join(" · ")}`, "error");
  paintScanLane(false, alerts[0]);
}

function paintClassicStockAlert() {
  const el = $("classic-stock-alert");
  if (!el) return;
  if (!isClassicBillShop() || !state.cart.length) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  const expired = [];
  const soon = [];
  const out = [];
  const low = [];
  for (const line of state.cart) {
    const item = state.items.find((i) => i.id === line.itemId);
    if (!item) continue;
    const { stock, exp } = classicItemAlerts(item);
    if (exp.expired) expired.push(item.name);
    else if (exp.soon) soon.push(item.name);
    if (stock.out) out.push(item.name);
    else if (stock.low) low.push(item.name);
  }
  const bits = [];
  if (expired.length) bits.push(`Expired: ${expired.join(", ")}`);
  if (soon.length) bits.push(`Near expiry: ${soon.join(", ")}`);
  if (out.length) bits.push(`Out of stock: ${out.join(", ")}`);
  if (low.length) bits.push(`Low stock: ${low.join(", ")}`);
  el.hidden = !bits.length;
  el.textContent = bits.join(" · ");
  el.classList.toggle("is-expired", expired.length > 0 || out.length > 0);
}

function paintClassicItemHits() {
  const box = $("classic-item-hits");
  if (!box) return;
  if (!isClassicBillShop()) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const q = String($("bill-item-search")?.value || $("bill-scan-code")?.value || state.query || "").trim();
  if (q.length < 1) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const rows = filteredItems().slice(0, 12);
  if (!rows.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = rows.map((i) => {
    const { stock, exp } = classicItemAlerts(i);
    const extra = isPharmacyShop()
      ? [i.batch_no, exp.short].filter(Boolean).join(" · ")
      : itemVariantText(i);
    const expText = exp.expired ? `EXPIRED ${exp.short}` : exp.soon ? exp.label : (exp.short || "");
    return `<button type="button" class="classic-hit tone-${stock.tone} exp-${exp.tone}" data-add="${escapeHtml(i.id)}">
      <span class="classic-hit-main"><strong>${escapeHtml(i.name)}</strong><em>${escapeHtml([i.code || i.barcode, extra].filter(Boolean).join(" · "))}</em></span>
      <span class="classic-hit-stock">${escapeHtml(stock.label)}</span>
      <span class="classic-hit-exp">${escapeHtml(expText)}</span>
      <span class="classic-hit-rate">${escapeHtml(money(rateFor(i)))}</span>
    </button>`;
  }).join("");
}

function renderCatalog() {
  if (isClassicBillShop()) {
    const root = $("catalog");
    if (root) root.innerHTML = "";
    const cats = $("catalog-cats");
    if (cats) {
      cats.hidden = true;
      cats.innerHTML = "";
    }
    paintClassicItemHits();
    return;
  }
  renderCatalogCats();
  const root = $("catalog");
  if (!root) return;
  const rows = filteredItems();
  if (!rows.length) {
    const q = String(state.query || "").trim();
    root.innerHTML = `<div class="catalog-empty">${
      q ? `No items match “${escapeHtml(q)}”. Try another name, ${taxCodeLabel()}, or SKU.` : "No items in this shop yet."
    }</div>`;
    return;
  }
  const grouped = new Map();
  for (const i of rows) {
    const key = itemCategoryLabel(i);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(i);
  }
  const keys = [...grouped.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  if (isRestaurantShop() && String(state.categoryFilter || "")) {
    root.innerHTML = `<div class="catalog-group-grid">${rows.map(catalogCardHtml).join("")}</div>`;
    return;
  }
  root.innerHTML = keys
    .map((key) => {
      const items = grouped.get(key);
      return `<section class="catalog-group">
      <h3 class="catalog-group-head">${escapeHtml(key)} <span>${items.length}</span></h3>
      <div class="catalog-group-grid">${items.map(catalogCardHtml).join("")}</div>
    </section>`;
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
        discountType: isClassicBillShop() ? "amt" : state.billDiscountType,
        discountValue: isClassicBillShop() ? 0 : state.billDiscountValue,
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

function restaurantLineNoteHtml(line, key) {
  if (!isRestaurantShop()) return "";
  const note = String(line.notes || "");
  const open = Boolean(line.noteOpen) || Boolean(note.trim());
  if (open) {
    return `<label class="line-si"><span>Special Instruction</span><textarea data-line-note="${escapeHtml(key)}" maxlength="240" rows="2" placeholder="No onion, extra cheese">${escapeHtml(note)}</textarea></label>`;
  }
  return `<button class="line-si-btn" type="button" data-note-open="${escapeHtml(key)}">Add Special Instruction</button>`;
}

function classicLineDiscHtml(line, key) {
  if (!canClassicLineDiscount()) return `<span class="line-disc-none">—</span>`;
  const item = state.items.find((i) => i.id === line.itemId);
  const calc = item ? lineCalc(item, line) : null;
  const saved = Number(line.discountValue) || 0;
  const off = Number(calc?.discount) || 0;
  return `<div class="line-disc">
    <select data-line-disc-type="${escapeHtml(key)}" aria-label="Item discount type">
      <option value="amt"${(line.discountType || "amt") === "amt" ? " selected" : ""}>₹</option>
      <option value="pct"${line.discountType === "pct" ? " selected" : ""}>%</option>
    </select>
    <input data-line-disc="${escapeHtml(key)}" type="number" min="0" step="0.01" value="${escapeHtml(saved)}" aria-label="Item discount" />
    ${off > 0 ? `<small>−${escapeHtml(money(off))}</small>` : ""}
  </div>`;
}

function renderCart() {
  applyOffersToCart();
  const packEl = $("chosen-pack");
  const packText = packLabel();
  if (packEl) {
    packEl.textContent = packText;
    packEl.hidden = !packText;
  }
  if ($("ticket-sub")) {
    $("ticket-sub").textContent = state.cart.length
      ? `${state.cart.length} line${state.cart.length === 1 ? "" : "s"}`
      : emptyTicketHint();
  }
  $("lines")?.classList.toggle("is-empty", !state.cart.length);
  if (!state.cart.length) {
    $("lines").innerHTML = `<p class="catalog-empty lines-empty">${escapeHtml(emptyTicketHint())}</p>`;
  } else if (isPharmacyShop()) {
    $("lines").innerHTML = `<div class="pharm-bill-wrap"><table class="pharm-bill-table classic-bill-table">
      <thead><tr>
        <th>#</th>
        <th>Medicine</th>
        <th>Batch / Exp</th>
        <th>Qty</th>
        <th class="pharm-n">Rate</th>
        <th>Disc</th>
        <th class="pharm-n">Amount</th>
        <th></th>
      </tr></thead>
      <tbody>${state.cart.map((line, idx) => {
        const item = state.items.find((i) => i.id === line.itemId);
        if (!item) return "";
        const unitCode = itemUnit(item);
        const step = POSUnits.counterStep(unitCode);
        const F = globalThis.POSFootwear;
        const unit = F?.isStripLooseItem?.(item) ? F.looseUnitLabel(item) : POSUnits.qtySuffix(unitCode);
        const qtyShow = POSUnits.displayQty(line.qtyGm, unitCode);
        const qtyStep = POSUnits.displayQty(step, unitCode) || 1;
        const calc = lineCalc(item, line);
        const key = cartLineKey(line);
        const preview = F?.cartBatchPreview?.(item) || { batchNo: item.batch_no || "—", expiry: formatExpiryShort(item.default_expiry) || "—", pack: medicinePackLabel(item) || "—" };
        const alert = classicItemAlerts(item);
        const packBit = preview.pack && preview.pack !== "—" ? preview.pack : "";
        return `<tr class="tone-${alert.stock.tone} exp-${alert.exp.tone}">
          <td class="pharm-n">${idx + 1}</td>
          <td class="pharm-med">${escapeHtml(item.name)}${packBit ? `<small>${escapeHtml(packBit)} · ${escapeHtml(alert.stock.label)}</small>` : `<small>${escapeHtml(alert.stock.label)}</small>`}</td>
          <td class="exp-cell">${escapeHtml(preview.batchNo || "—")}<small>${escapeHtml(preview.expiry || "—")}${alert.exp.expired ? " · EXP" : alert.exp.soon ? ` · ${escapeHtml(alert.exp.label)}` : ""}</small></td>
          <td>
            <div class="qty">
              <button type="button" data-chg="${escapeHtml(key)}" data-d="${-step}">−</button>
              <input class="qty-input" type="number" inputmode="decimal" min="${POSUnits.displayQty(POSUnits.qtyMin(), unitCode) || 0.001}" max="${POSUnits.qtyMax()}" step="${escapeHtml(qtyStep)}" value="${escapeHtml(qtyShow)}" data-qty="${escapeHtml(key)}" aria-label="Quantity in ${unit}" />
              <button type="button" data-chg="${escapeHtml(key)}" data-d="${step}">+</button>
            </div>
          </td>
          <td class="pharm-n">${escapeHtml(money(rateFor(item)))}<small>${escapeHtml(String(Number(item.gst_rate) || 0))}% GST</small></td>
          <td class="line-disc-cell">${classicLineDiscHtml(line, key)}</td>
          <td class="pharm-n">${escapeHtml(money(calc.taxable + calc.gst))}</td>
          <td><button type="button" class="classic-del" data-del-line="${escapeHtml(key)}" aria-label="Remove ${escapeHtml(item.name)}">×</button></td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>`;
  } else if (isApparelShop()) {
    $("lines").innerHTML = `<div class="pharm-bill-wrap"><table class="pharm-bill-table classic-bill-table">
      <thead><tr>
        <th>S.No.</th>
        <th>Code</th>
        <th>Item Name</th>
        <th>Colour / Size</th>
        <th class="pharm-n">Rate</th>
        <th>Qty</th>
        <th>Disc</th>
        <th class="pharm-n">Stock</th>
        <th class="pharm-n">GST</th>
        <th class="pharm-n">Total</th>
        <th></th>
      </tr></thead>
      <tbody>${state.cart.map((line, idx) => {
        const item = state.items.find((i) => i.id === line.itemId);
        if (!item) return "";
        const unitCode = itemUnit(item);
        const step = POSUnits.counterStep(unitCode);
        const unit = POSUnits.qtySuffix(unitCode);
        const qtyShow = POSUnits.displayQty(line.qtyGm, unitCode);
        const qtyStep = POSUnits.displayQty(step, unitCode) || 1;
        const calc = lineCalc(item, line);
        const key = cartLineKey(line);
        const variant = itemVariantText(item);
        const alert = classicItemAlerts(item);
        return `<tr class="tone-${alert.stock.tone} exp-${alert.exp.tone}">
          <td class="pharm-n">${idx + 1}</td>
          <td>${escapeHtml(item.code || item.hsn || "—")}</td>
          <td class="pharm-med">${escapeHtml(item.name)}</td>
          <td>${escapeHtml(variant || "—")}${alert.exp.expired ? ` · EXPIRED ${escapeHtml(alert.exp.short)}` : ""}</td>
          <td class="pharm-n">${escapeHtml(money(rateFor(item)))}</td>
          <td>
            <div class="qty">
              <button type="button" data-chg="${escapeHtml(key)}" data-d="${-step}">−</button>
              <input class="qty-input" type="number" inputmode="decimal" min="${POSUnits.displayQty(POSUnits.qtyMin(), unitCode) || 0.001}" max="${POSUnits.qtyMax()}" step="${escapeHtml(qtyStep)}" value="${escapeHtml(qtyShow)}" data-qty="${escapeHtml(key)}" aria-label="Quantity in ${unit}" />
              <button type="button" data-chg="${escapeHtml(key)}" data-d="${step}">+</button>
            </div>
          </td>
          <td class="line-disc-cell">${classicLineDiscHtml(line, key)}</td>
          <td class="pharm-n stock-cell">${escapeHtml(alert.stock.label)}</td>
          <td class="pharm-n">${escapeHtml(String(Number(item.gst_rate) || 0))}%</td>
          <td class="pharm-n">${escapeHtml(money(calc.taxable + calc.gst))}</td>
          <td><button type="button" class="classic-del" data-del-line="${escapeHtml(key)}" aria-label="Remove ${escapeHtml(item.name)}">×</button></td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>`;
  } else {
    $("lines").innerHTML = state.cart
      .map((line) => {
        const item = state.items.find((i) => i.id === line.itemId);
        if (!item) return "";
        const unitCode = itemUnit(item);
        const step = POSUnits.counterStep(unitCode);
        const unit = POSUnits.qtySuffix(unitCode);
        const qtyShow = POSUnits.displayQty(line.qtyGm, unitCode);
        const qtyStep = POSUnits.displayQty(step, unitCode) || 1;
        const calc = lineCalc(item, line);
        const bc = String(line.barcode || "").trim();
        const key = cartLineKey(line);
        const wait = (state.appliedOffers?.pending || []).find((o) => !o.itemIds?.length || o.itemIds.includes(String(line.itemId)));
        return `<div class="line">
          <div class="line-main">
            <div class="line-info">
              <div class="who">${escapeHtml(itemVariantText(item) ? `${item.name} · ${itemVariantText(item)}` : item.name)}</div>
              <div class="pack">${escapeHtml(wait?.message || bc || itemVariantText(item) || item.hsn || "")}</div>
            </div>
            <div class="line-ops">
              <div class="qty">
                <button type="button" data-chg="${escapeHtml(key)}" data-d="${-step}">−</button>
                <input class="qty-input" type="number" inputmode="decimal" min="${POSUnits.displayQty(POSUnits.qtyMin(), unitCode) || 0.001}" max="${POSUnits.qtyMax()}" step="${escapeHtml(qtyStep)}" value="${escapeHtml(qtyShow)}" data-qty="${escapeHtml(key)}" aria-label="Quantity in ${unit}" />
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
          ${restaurantLineNoteHtml(line, key)}
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
  if ($("ticket-sub")) {
    const R = restaurantApi();
    if (isRestaurantShop() && R && state.activeTable) {
      const floors = diningFloors();
      const seat = diningTables().find((t) => t.id === state.activeTable);
      const floorBit = floors.length > 1 && seat?.floor ? ` · ${R.displayFloor?.(seat.floor, floors) || seat.floor}` : "";
      $("ticket-sub").textContent = `${R.displayTable(state.activeTable)}${floorBit} · tap a dish`;
    } else if (!state.cart?.length) {
      $("ticket-sub").textContent = globalThis.POSFootwear?.itemFormCopy(state.businessMeta)?.ticket || emptyTicketHint();
    }
  }
  if ($("classic-bill-date")) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    $("classic-bill-date").value = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }
  $("btn-pay").disabled = state.cart.length === 0;
  $("btn-clear").disabled = state.cart.length === 0 && !classicCustomerRecordDirty();
  document.body.classList.toggle("has-cart", state.cart.length > 0);
  paintBillToggleCount();
  paintBillCustomer();
  if ($("btn-hold")) $("btn-hold").disabled = state.cart.length === 0 || Boolean(state.editingOrderId);
  if ($("btn-kot")) $("btn-kot").disabled = !isRestaurantShop() || state.cart.length === 0 || Boolean(state.editingOrderId);
  const payTotal = t.total != null ? t.total : t.taxable + t.tax;
  $("btn-pay").textContent = state.editingOrderId
    ? tt("pos.save_changes", "Save changes")
    : state.cart.length
      ? isClassicBillShop()
        ? `Save Bill ${money(payTotal)}`
        : tt("pos.pay_amount", `Pay ${money(payTotal)}`, { amount: money(payTotal) })
      : isClassicBillShop()
        ? "Save Bill"
        : tt("pos.pay", "Pay");
  const face = $("customer-face");
  if (face) {
    face.hidden = state.cart.length === 0;
    if ($("face-subtotal")) $("face-subtotal").textContent = money(t.taxable);
    if ($("face-discount")) $("face-discount").textContent = money((t.discount || 0) + (t.lineDiscount || 0));
    if ($("face-total")) $("face-total").textContent = money(t.total != null ? t.total : t.taxable + t.tax);
  }
  renderHeldBills();
  renderEditOrderBanner();
  paintComboBanner();
  paintOfferBanner();
  if (!state.cart.length) resetOfferPopup();
  else showBestOfferPopup(pickBestOfferForCart(), false);
  paintClassicLoyalty();
  paintClassicStockAlert();
  renderTableBoard();
  if (isRestaurantShop() && state.activeTable && state.cart.length) saveTableHoldDebounced();
  if (window.DevMode?.isEnabled()) {
    DevMode.updateContext({ cartLines: state.cart.length });
  }
}

function renderCustomersSelect() {
  $("customer").innerHTML = state.customers
    .map(
      (c) =>
        `<option value="${escapeHtml(c.id)}">${escapeHtml(customerOptionLabel(c))}</option>`,
    )
    .join("");
  if (state.customerId) $("customer").value = state.customerId;
  else {
    const walk = state.customers.find((c) => c.code === "CUS-001") || state.customers[0];
    state.customerId = walk?.id || "";
    if (state.customerId) $("customer").value = state.customerId;
    paintBillCustomer();
    const mob = $("counter-mobile");
    const c = customer();
    const shown = digitsMobile(c?.mobile);
    if (mob && document.activeElement !== mob && isRealMobile(shown)) {
      mob.value = shown;
    }
  }
  fillPharmacyBillCustomerFromCustomer(customer());
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
      locale: fields.locale || "",
      address: fields.address || "",
      doctor_rx: fields.doctor_rx || "",
    }),
  });
  const customer = data.customer;
  if (customer?.id) state.customerId = customer.id;
  await loadBootstrap();
  return customer;
}

function paintClassicLoyalty() {
  const extras = $("bill-extras");
  const bal = $("classic-loyalty-balance");
  if (!isClassicBillShop()) {
    if (bal) {
      bal.hidden = true;
      bal.innerHTML = "";
    }
    return;
  }
  if (extras) extras.open = true;
  if (!bal) return;
  const walk = isWalkInCustomer(customer());
  const acc = state.loyaltyAccount;
  const pts = Math.max(0, Number(acc?.points_balance) || 0);
  const earnedLife = Math.max(0, Number(acc?.lifetime_earned) || 0);
  const tier = globalThis.POSLoyalty?.tierLabel?.(acc?.tier) || "";
  const settings = state.loyaltySettings || globalThis.POSLoyalty?.DEFAULTS;
  const total = cartTotals().total;
  const earn = walk || !settings ? 0 : (globalThis.POSLoyalty?.earnPoints?.(total, settings) || 0);
  const redeem = $("loyalty-redeem");
  if (redeem) {
    redeem.max = String(pts);
    if (Number(redeem.value) > pts) {
      redeem.value = String(pts);
      state.loyaltyRedeem = pts;
    }
    redeem.disabled = walk || pts <= 0;
    redeem.placeholder = pts > 0 ? `Max ${pts}` : "0";
  }
  bal.hidden = false;
  if (walk) {
    bal.className = "classic-loyalty-bar is-wait";
    bal.innerHTML = `<span class="classic-loy-pill is-wait">Load customer mobile to use royalty</span>`;
    return;
  }
  if (!acc) {
    bal.className = "classic-loyalty-bar is-wait";
    bal.innerHTML = `<span class="classic-loy-pill is-wait">Loading royalty…</span>`;
    return;
  }
  bal.className = "classic-loyalty-bar";
  const pills = [`<span class="classic-loy-pill">${escapeHtml(`${pts} pts available`)}</span>`];
  if (tier) pills.push(`<span class="classic-loy-pill">${escapeHtml(tier)}</span>`);
  if (earn > 0) pills.push(`<span class="classic-loy-pill is-earn">This bill +${earn}</span>`);
  else if (pts === 0 && earnedLife > 0) pills.push(`<span class="classic-loy-pill">Lifetime ${earnedLife}</span>`);
  else if (pts === 0) pills.push(`<span class="classic-loy-pill is-earn">Earns on this bill</span>`);
  bal.innerHTML = pills.join("");
}

function renderPackChoice() {
  const sel = $("pack-choice");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML =
    `<option value="">Loose items</option>` +
    state.packs
      .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
      .join("");
  if (state.lastPack?.id) sel.value = state.lastPack.id;
  else sel.value = current || "";
  sel.hidden = !isSpiceShop() || !state.packs.length;
  const bar = $("pack-bar");
  if (bar) {
    bar.innerHTML = state.packs
      .map((p) => `<button class="btn" type="button" data-pack="${escapeHtml(p.id)}">${escapeHtml(p.name)}</button>`)
      .join("");
    bar.hidden = true;
  }
}

function classicScanAddQty(item) {
  if (!isClassicBillShop()) return null;
  const n = Number($("bill-scan-qty")?.value);
  if (!(n > 0)) return null;
  const unit = itemUnit(item);
  const base = POSUnits.toBase?.(n, unit);
  return Number.isFinite(base) && base > 0 ? base : n;
}

function focusScanLane() {
  const classic = isClassicBillShop() ? $("bill-scan-code") : null;
  const el = classic || $("scan-code");
  if (!el || !document.body.classList.contains("counter-mode")) return;
  const active = document.activeElement;
  if (active && active !== el && active !== $("search") && active !== $("bill-scan-code") && active !== $("bill-item-search") && (active.tagName === "INPUT" || active.tagName === "SELECT" || active.tagName === "TEXTAREA")) {
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
  const billLane = $("bill-scan-form");
  const billStatus = $("bill-scan-status");
  if (status) status.textContent = label || "";
  if (billStatus) billStatus.textContent = label || "";
  [lane, billLane].forEach((el) => {
    if (!el) return;
    el.classList.toggle("is-hit", Boolean(ok));
    el.classList.toggle("is-miss", ok === false);
  });
  clearTimeout(paintScanLane._t);
  paintScanLane._t = setTimeout(() => {
    lane?.classList.remove("is-hit", "is-miss");
    billLane?.classList.remove("is-hit", "is-miss");
  }, ok ? 600 : 900);
}

async function applyBarcodeScan(raw, sourceEl) {
  const code = globalThis.POSBarcode?.cleanCode ? POSBarcode.cleanCode(raw) : String(raw || "").trim();
  if (!code) return false;
  let item = null;
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
  } catch (err) {
    const msg = String(err.message || "");
    if (/inactive|already sold|already damaged/i.test(msg)) {
      if (sourceEl) sourceEl.value = "";
      paintScanLane(false, "Inactive");
      setHint(msg, "error");
      focusScanLane();
      return false;
    }
    item = findItemByBarcode(code);
  }
  if (!item) item = findItemBySkuOrHsn(code);
  if (item) {
    addItem(item.id, classicScanAddQty(item), findItemByBarcode(code) ? code : "");
    clearCounterQuery(sourceEl);
    const alerts = classicItemAlerts(item).alerts;
    paintScanLane(!alerts.some((a) => /EXPIRED|Out of stock/i.test(a)), item.name);
    setHint(alerts.length ? `Added ${item.name} · ${alerts.join(" · ")}` : `Added ${item.name}`, alerts.length ? "error" : "ok");
    focusScanLane();
    return true;
  }
  if (digitsMobile(code).length === 10 && applyCounterMobile(code, { announceMiss: false })) {
    clearCounterQuery(sourceEl);
    paintScanLane(true, customer()?.name || "Customer");
    focusScanLane();
    return true;
  }
  syncCounterQuery(code, sourceEl);
  const hits = filteredItems();
  if (hits.length === 1) {
    addItem(hits[0].id, classicScanAddQty(hits[0]));
    clearCounterQuery(sourceEl);
    const alerts = classicItemAlerts(hits[0]).alerts;
    paintScanLane(!alerts.some((a) => /EXPIRED|Out of stock/i.test(a)), hits[0].name);
    setHint(alerts.length ? `Added ${hits[0].name} · ${alerts.join(" · ")}` : `Added ${hits[0].name}`, alerts.length ? "error" : "ok");
    focusScanLane();
    return true;
  }
  if (hits.length > 1) {
    paintScanLane(true, `${hits.length} matches`);
    setHint(`Pick one of ${hits.length} matches`, "ok");
    return false;
  }
  paintScanLane(false, "No match");
  setHint(`No item matches “${code}”`, "error");
  if (sourceEl === $("scan-code") || sourceEl === $("search") || sourceEl === $("bill-scan-code") || sourceEl === $("bill-item-search")) sourceEl.select();
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

function pieceBarcodeQty(item) {
  const F = globalThis.POSFootwear;
  if (F?.isStripLooseItem?.(item)) return F.unitsPerPack(item);
  return 1;
}

function addItem(id, qtyGm, lineBarcode) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  ensureDiningTable();
  const add = qtyGm == null ? POSUnits.counterStep(itemUnit(item)) : Number(qtyGm);
  const code = String(lineBarcode || "").trim();
  const count = POSUnits.isCount(itemUnit(item));
  const pharmacyCount = isPharmacyShop() && count;
  const barcodeAdd = pharmacyCount
    ? POSUnits.clampQty((Number.isFinite(add) && add > 0 ? add : 1) * pieceBarcodeQty(item))
    : POSUnits.clampQty(count ? pieceBarcodeQty(item) : add);
  if (code) {
    const existing = state.cart.find((l) => String(l.barcode || "").trim() === code);
    if (existing) {
      if (count && !pharmacyCount) {
        setHint("This piece is already on the bill", "error");
        return;
      }
      existing.qtyGm = POSUnits.clampQty(Number(existing.qtyGm) + (pharmacyCount ? barcodeAdd : add));
      renderCart();
      warnClassicItem(item);
      return;
    }
    state.cart.push({
      lineId: newCartLineId(),
      itemId: id,
      qtyGm: barcodeAdd,
      discountType: "amt",
      discountValue: 0,
      barcode: code,
      notes: "",
    });
    renderCart();
    warnClassicItem(item);
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
      notes: "",
    });
  }
  state.cart = state.cart.filter((l) => l.qtyGm > 0);
  renderCart();
  warnClassicItem(item);
}

function setLineQty(key, qtyGm) {
  const line = findCartLine(key);
  if (!line) return;
  const item = state.items.find((i) => i.id === line.itemId);
  const next = POSUnits.clampQty(qtyGm);
  if (next <= 0) state.cart = state.cart.filter((l) => cartLineKey(l) !== String(key));
  else if (isPieceBarcodeLine(line, item)) line.qtyGm = pieceBarcodeQty(item);
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

function paintComboBar() {
  const bar = $("combo-bar");
  if (!bar) return;
  bar.hidden = true;
  bar.innerHTML = "";
}

function applyComboOffer(id) {
  const combo = (state.combos || []).find((c) => c.id === id) || (state.offers || []).filter((o) => o.offer_type === "combo").map((o) => ({
    id: o.id,
    name: o.name,
    item_a_id: o.conditions?.item_ids?.[0],
    item_b_id: o.conditions?.item_ids?.[1],
    discount_type: o.discount_type,
    discount_value: o.offer_price || o.discount_value,
    status: o.status,
  })).find((c) => c.id === id);
  if (!combo) return;
  const a = state.items.find((i) => i.id === combo.item_a_id);
  const b = state.items.find((i) => i.id === combo.item_b_id);
  if (!a || !b) {
    setHint("Combo items are missing from this shop's catalog", "error");
    return;
  }
  const ids = state.cart.map((l) => l.itemId);
  if (!ids.includes(combo.item_a_id)) addItem(combo.item_a_id);
  if (!ids.includes(combo.item_b_id)) addItem(combo.item_b_id);
  if (isClassicBillShop()) {
    setHint(`Combo ${combo.name}: use Disc on each item (no whole-bill discount)`, "ok");
    renderCart();
    return;
  }
  state.billDiscountType = String(combo.discount_type || "pct") === "amt" ? "amt" : "pct";
  state.billDiscountValue = Number(combo.discount_value) || 0;
  if ($("bill-disc-type")) $("bill-disc-type").value = state.billDiscountType;
  if ($("bill-disc-value")) $("bill-disc-value").value = state.billDiscountValue;
  const extras = $("bill-extras");
  if (extras) extras.open = true;
  setHint(`Combo ${combo.name}: ${state.billDiscountType === "pct" ? `${state.billDiscountValue}%` : money(state.billDiscountValue)} off applied`, "ok");
  renderCart();
}

function offerCartContext() {
  const cust = typeof customer === "function" ? customer() || {} : {};
  const loy = state.loyaltyAccount || {};
  return {
    now: new Date(),
    cart: state.cart.map((line) => {
      const item = state.items.find((i) => i.id === line.itemId);
      const calc = item ? lineCalc(item, { ...line, discountType: "amt", discountValue: 0 }) : { gross: 0, taxable: 0 };
      return {
        itemId: line.itemId,
        lineId: line.lineId,
        qty: line.qtyGm,
        qtyGm: line.qtyGm,
        isCount: item ? POSUnits.isCount(itemUnit(item)) : true,
        gross: calc.gross || calc.taxable,
        taxable: calc.gross || calc.taxable,
        category: item?.category,
        item,
      };
    }),
    customer: {
      id: cust.id,
      type: cust.type,
      bills: Number(loy.lifetime_bills || 0) || (Number(loy.lifetime_spend) > 0 ? 2 : 0),
      lifetime_spend: Number(loy.lifetime_spend || 0),
      isBirthday: globalThis.POSLoyalty?.isBirthdayToday?.(cust.dob),
    },
    items: state.items,
    stacking: state.offerSettings?.stacking || "product_and_bill",
    branchId: state.session?.branch_id || state.session?.branchId,
  };
}

function applyOffersToCart() {
  const O = globalThis.POSOffers;
  if (!O || state.offerAuto === false) {
    state.appliedOffers = null;
    return;
  }
  const offers = (state.offers || []).filter((o) => ["active", "scheduled"].includes(O.liveStatus(o)));
  const result = O.evaluateAll(offers, offerCartContext());
  state.appliedOffers = result;
  state.cart.forEach((line) => {
    if (isClassicBillShop()) return;
    const byLine = result.lineDiscounts?.[line.lineId] ?? result.lineDiscounts?.[String(line.lineId || "")];
    const byItem = result.lineDiscounts?.[line.itemId] ?? result.lineDiscounts?.[String(line.itemId || "")];
    const d = Number(byLine != null ? byLine : byItem || 0);
    const item = state.items.find((i) => i.id === line.itemId);
    const gross = item ? Number(lineCalc(item, { ...line, discountType: "amt", discountValue: 0 }).gross || 0) : 0;
    const capped = Math.min(Math.max(0, d), gross);
    if (capped > 0) {
      line.discountType = "amt";
      line.discountValue = capped;
      line.offerId = true;
    } else if (line.offerId) {
      line.discountType = "amt";
      line.discountValue = 0;
      line.offerId = "";
    }
  });
  if (!state.offerBillLocked) {
    if (isClassicBillShop()) {
      state.billDiscountType = "amt";
      state.billDiscountValue = 0;
      state.offerDroveBill = false;
    } else if (result.billDiscount > 0) {
      state.billDiscountType = "amt";
      state.billDiscountValue = result.billDiscount;
      state.offerDroveBill = true;
    } else if (state.offerDroveBill) {
      state.billDiscountValue = 0;
      state.offerDroveBill = false;
    }
    if ($("bill-disc-type")) $("bill-disc-type").value = state.billDiscountType;
    if ($("bill-disc-value")) $("bill-disc-value").value = state.billDiscountValue;
  }
}

function findLegacyComboOnBill() {
  const ids = state.cart.map((l) => l.itemId);
  return (state.combos || []).find((c) => {
    const a = ids.includes(c.item_a_id);
    const b = ids.includes(c.item_b_id);
    return a && b && String(c.status || "active") === "active";
  });
}

function pickBestOfferForCart() {
  const O = globalThis.POSOffers;
  const best = O?.pickBest?.(state.appliedOffers);
  if (best) return best;
  const match = findLegacyComboOnBill();
  if (!match) return null;
  const pct = String(match.discount_type || "pct") !== "amt";
  const val = Number(match.discount_value) || 0;
  const already =
    state.billDiscountType === (pct ? "pct" : "amt") && Number(state.billDiscountValue) === val;
  const base = Number(cartTotals().taxable || 0);
  const round2 = globalThis.POSDiscount?.round2 || ((n) => Math.round(Number(n) * 100) / 100);
  const save = pct ? round2((base * val) / 100) : round2(val);
  return {
    kind: already ? "applied" : "available",
    offer: { id: match.id, name: match.name, discount: save, message: match.name },
    save,
    legacyCombo: true,
  };
}

function bestOfferSignature(best) {
  if (!best) return "";
  const o = best.offer || {};
  return `${best.kind}:${o.id || o.name}:${best.save || 0}:${o.needQty || 0}`;
}

function hideBestOfferPopup() {
  const el = $("offer-popup");
  if (el) el.hidden = true;
}

function resetOfferPopup() {
  state.offerPopupSig = "";
  state.offerPopupDismissed = "";
  hideBestOfferPopup();
}

function paintBestOfferPopup(best) {
  const title = $("offer-popup-title");
  const saveEl = $("offer-popup-save");
  const copy = $("offer-popup-copy");
  const skip = $("offer-popup-skip");
  const ok = $("offer-popup-ok");
  if (!title || !saveEl || !copy || !skip || !ok) return;
  const name = best.offer?.name || "Offer";
  title.textContent = name;
  if (best.kind === "pending") {
    saveEl.textContent = best.save > 0 ? `You will save ${money(best.save)}` : "";
    copy.textContent = `Offer waiting. ${best.offer?.message || "Add the next item to unlock this offer."}`;
    skip.hidden = true;
    ok.textContent = "OK";
    return;
  }
  skip.hidden = false;
  skip.textContent = "Skip offer";
  if (best.kind === "applied") {
    saveEl.textContent = best.save > 0 ? `You save ${money(best.save)}` : "";
    copy.textContent = "Offer applied. This is the best offer on this bill.";
    ok.textContent = "Keep offer";
    return;
  }
  saveEl.textContent = best.save > 0 ? `You save ${money(best.save)}` : "";
  copy.textContent = "Best offer is ready to apply on this bill.";
  ok.textContent = "Apply offer";
}

function showBestOfferPopup(best, force) {
  const el = $("offer-popup");
  if (!el) return;
  if (!best) {
    hideBestOfferPopup();
    return;
  }
  const sig = bestOfferSignature(best);
  if (!force && (sig === state.offerPopupSig || sig === state.offerPopupDismissed)) return;
  state.offerPopupSig = sig;
  paintBestOfferPopup(best);
  el.hidden = false;
}

function dismissBestOfferPopup(skip) {
  const best = pickBestOfferForCart();
  state.offerPopupDismissed = bestOfferSignature(best) || state.offerPopupSig;
  hideBestOfferPopup();
  if (skip) {
    state.offerAuto = false;
    state.cart.forEach((l) => {
      if (l.offerId) {
        l.discountValue = 0;
        l.offerId = "";
      }
    });
    if (!state.offerBillLocked) {
      state.billDiscountValue = 0;
      if ($("bill-disc-value")) $("bill-disc-value").value = 0;
    }
    renderCart();
    return;
  }
  if (best?.kind === "available") {
    if (best.legacyCombo) {
      applyComboOffer(best.offer.id);
      return;
    }
    state.offerAuto = true;
    state.offerBillLocked = false;
    renderCart();
  }
}

function paintOfferBanner() {
  const el = $("offer-banner");
  if (!el) return;
  const best = pickBestOfferForCart();
  if (!best) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  const save = best.save > 0
    ? best.kind === "pending"
      ? `Will save ${money(best.save)}`
      : `Save ${money(best.save)}`
    : best.kind === "pending"
      ? "Offer waiting"
      : "Offer applied";
  el.innerHTML = `<button class="offer-chip" type="button" data-open-best-offer="1">
    <strong>Best offer</strong>
    <span>${escapeHtml(best.offer?.name || "Offer")} · ${escapeHtml(save)}</span>
  </button>`;
}

function paintComboBanner() {
  const el = $("combo-banner");
  if (!el) return;
  el.hidden = true;
  el.innerHTML = "";
}

function fillDatalists() {
  const suggested = globalThis.POSFootwear?.suggestedItemCategories?.(state.businessMeta) || [];
  const cats = [...new Set([...suggested, ...(state.items || []).map((i) => i.category).filter(Boolean)])];
  const subs = [...new Set((state.items || []).map((i) => i.subcategory).filter(Boolean))];
  if ($("category-list")) $("category-list").innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}">`).join("");
  if ($("subcategory-list")) $("subcategory-list").innerHTML = subs.map((c) => `<option value="${escapeHtml(c)}">`).join("");
}

function itemSearchHay(item) {
  const raw = `${item.name || ""} ${item.local_name || ""} ${item.generic_name || ""} ${item.manufacturer || ""} ${item.medicine_type || ""} ${item.batch_no || ""} ${item.code || ""} ${item.hsn || ""} ${item.barcode || ""} ${item.mfr_barcode || ""} ${item.category || ""} ${item.subcategory || ""} ${item.color || ""} ${item.size || ""} ${item.wearer_type || ""} ${itemStatusOf(item.status)}`;
  const I = window.POSI18n;
  const blob = I ? I.searchBlob(item) : raw.toLowerCase();
  return `${blob} ${itemStatusOf(item.status)}`.trim();
}

function paintItemsHero() {
  const stats = $("items-hero-stats");
  if (!stats) return;
  const items = state.items || [];
  const low = items.filter((i) => Number(i.stock_gm) <= Number(i.reorder_level_gm)).length;
  const inactive = items.filter((i) => itemStatusOf(i.status) === "inactive").length;
  const cats = new Set(items.map((i) => i.category).filter(Boolean)).size;
  stats.innerHTML = `<div class="items-stat"><span>Items</span><strong>${items.length}</strong></div>
    <div class="items-stat${low ? " is-warn" : ""}"><span>Low stock</span><strong>${low}</strong></div>
    <div class="items-stat${inactive ? " is-warn" : ""}"><span>Inactive</span><strong>${inactive}</strong></div>
    <div class="items-stat"><span>Groups</span><strong>${cats}</strong></div>`;
}

function filterItemsCatalog() {
  const q = String($("item-catalog-search")?.value || "").trim().toLowerCase();
  const lowOnly = Boolean($("item-low-only")?.checked);
  const hideInactive = Boolean($("item-hide-inactive")?.checked);
  document.querySelectorAll("#items-table [data-item-card]").forEach((card) => {
    const hay = card.dataset.itemSearch || "";
    const low = card.dataset.itemLow === "1";
    const inactive = card.dataset.itemInactive === "1";
    card.hidden = (Boolean(q) && !hay.includes(q)) || (lowOnly && !low) || (hideInactive && inactive);
  });
}

function paintItemImportLink() {
  const a = $("item-import-template");
  if (a && typeof posUrl === "function") a.href = posUrl("/api/items/import/template");
}

function paintStockExcelLink() {
  const a = $("stock-excel");
  if (a && typeof posUrl === "function") a.href = posUrl("/api/stock/excel");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

async function uploadItemsExcel(file) {
  const hint = $("item-import-hint");
  if (!file) return;
  if (hint) {
    hint.textContent = `Uploading ${file.name}…`;
    hint.className = "hint";
  }
  try {
    const content = await fileToBase64(file);
    const data = await api("/api/items/import", {
      method: "POST",
      body: JSON.stringify({ filename: file.name, content }),
    });
    const created = Number(data.created) || 0;
    const updated = Number(data.updated) || 0;
    const failed = Number(data.failed) || 0;
    const extra = failed && Array.isArray(data.errors) && data.errors[0]
      ? ` First error: row ${data.errors[0].line || "?"} ${data.errors[0].error || ""}`
      : "";
    if (hint) {
      hint.textContent = `Imported ${created} new, updated ${updated}${failed ? `, ${failed} failed.` : "."}${extra}`;
      hint.className = failed && !created && !updated ? "hint error" : "hint ok";
    }
    await loadBootstrap();
  } catch (err) {
    if (hint) {
      hint.textContent = err.message;
      hint.className = "hint error";
    }
  } finally {
    if ($("item-import-file")) $("item-import-file").value = "";
  }
}

function resetItemForm() {
  $("item-form").reset();
  $("item-id").value = "";
  resetItemImage();
  fillItemUnitSelect(defaultItemUnit());
  refreshItemUnitLabels();
  if ($("item-save")) $("item-save").textContent = "Save item";
  if ($("item-mode")) $("item-mode").textContent = "New item";
  $("item-form")?.classList.remove("is-editing");
  document.querySelectorAll("#items-table .is-editing").forEach((el) => el.classList.remove("is-editing"));
  paintItemStatus("active");
  if (isPharmacyShop()) {
    if ($("item-category") && !$("item-category").value) $("item-category").value = defaultItemCategory();
    if ($("item-type")) $("item-type").value = "Tablet";
    if ($("item-pack-unit")) $("item-pack-unit").value = "Strip";
    if ($("item-upp")) $("item-upp").value = "10";
  }
}

function fillItemForm(i) {
  if (!i) return;
  $("item-id").value = i.id;
  $("item-name").value = i.name;
  if ($("item-local-name")) $("item-local-name").value = i.generic_name || i.local_name || "";
  $("item-hsn").value = i.hsn || "";
  $("item-category").value = i.category || "";
  $("item-subcategory").value = i.subcategory || "";
  if ($("item-type")) $("item-type").value = i.medicine_type || "Tablet";
  if ($("item-mfr")) $("item-mfr").value = i.manufacturer || "";
  if ($("item-own-barcode")) $("item-own-barcode").value = i.barcode || "";
  if ($("item-pack-size")) $("item-pack-size").value = i.pack_size || "";
  if ($("item-pack-unit")) $("item-pack-unit").value = i.pack_unit || "Strip";
  if ($("item-upp")) $("item-upp").value = globalThis.POSFootwear?.unitsPerPack?.(i) || i.units_per_pack || 10;
  if ($("item-batch-no")) $("item-batch-no").value = i.primary_batch_no || i.batch_no || "";
  if ($("item-expiry")) $("item-expiry").value = String(i.primary_expiry || i.default_expiry || "").slice(0, 10);
  if ($("item-reorder")) $("item-reorder").value = POSUnits.fromBase(i.reorder_level_gm, itemUnit(i));
  if ($("item-wearer")) $("item-wearer").value = globalThis.POSFootwear?.normalizeWearer(i.wearer_type) || "";
  if ($("item-color")) $("item-color").value = i.color || "";
  if ($("item-size")) $("item-size").value = i.size || "";
  $("item-retail").value = i.retail_rate;
  if ($("item-mrp")) $("item-mrp").value = i.mrp || i.retail_rate || "";
  if ($("item-barcode-qty")) $("item-barcode-qty").value = "";
  $("item-b2b").value = i.b2b_rate;
  $("item-purchase").value = i.purchase_rate;
  $("item-gst").value = i.gst_rate;
  fillItemUnitSelect(itemUnit(i));
  $("item-unit").value = itemUnit(i);
  $("item-stock").value = POSUnits.fromBase(i.stock_gm, itemUnit(i));
  paintItemStatus(i.status);
  refreshItemUnitLabels();
  paintItemImage(itemPhotoUrl(i));
  if ($("item-save")) $("item-save").textContent = "Update item";
  if ($("item-mode")) $("item-mode").textContent = `Editing ${i.code || i.name}`;
  $("item-form")?.classList.add("is-editing");
  $("item-hint").textContent = `Editing ${i.code || i.name}`;
  $("item-hint").className = "hint";
  document.querySelectorAll("#items-table .is-editing").forEach((el) => el.classList.remove("is-editing"));
  document.querySelector(`#items-table [data-edit-item="${CSS.escape(i.id)}"]`)?.classList.add("is-editing");
  $("item-form")?.scrollIntoView({ block: "start" });
  $("item-name")?.focus();
  if (!itemPhotoUrl(i) && i.has_image && i.id) {
    void api(`/api/items/${encodeURIComponent(i.id)}`)
      .then((data) => {
        const img = data.item?.image_url || data.image_url;
        if (!img) return;
        i.image_url = img;
        const row = (state.items || []).find((x) => x.id === i.id);
        if (row) row.image_url = img;
        if ($("item-id")?.value === i.id) paintItemImage(itemPhotoUrl(i));
      })
      .catch(() => {});
  }
}

function renderItemsTable() {
  const el = $("items-table");
  if (!el) return;
  const variant = isVariantShop();
  const footwear = isFootwearShop();
  paintItemsHero();
  const items = state.items || [];
  if (!items.length) {
    el.innerHTML = `<div class="item-empty-card">
      <strong>No items yet</strong>
      <p>${isPharmacyShop()
        ? "Add generic, type, pack, batch, expiry, rates, and stock on the left — or upload the Excel template."
        : "Add a name, unit, and rates on the left. Saved items show here and on Counter."}</p>
      ${isPharmacyShop() ? `<button class="btn primary" type="button" id="item-demo-seed">Add demo medicines</button>` : ""}
    </div>`;
    return;
  }
  if (isPharmacyShop()) {
    el.innerHTML = `<table class="items-pharm-table"><thead><tr>
      <th>Medicine</th><th>Generic</th><th>Type</th><th>Pack</th><th>Batch</th><th>Expiry</th>
      <th class="pharm-n">MRP</th><th class="pharm-n">Rate</th><th>Stock</th><th></th>
    </tr></thead><tbody>${items
      .map((i) => {
        const low = Number(i.stock_gm) <= Number(i.reorder_level_gm);
        const inactive = itemStatusOf(i.status) === "inactive";
        const editing = $("item-id")?.value === i.id;
        const search = itemSearchHay(i);
        const pack = medicinePackLabel(i) || i.pack_size || "—";
        const expiry = formatExpiryShort(i.default_expiry) || "—";
        return `<tr class="${editing ? "is-editing " : ""}${inactive ? "is-inactive " : ""}" data-item-card data-edit-item="${escapeHtml(i.id)}" data-item-search="${escapeHtml(search)}" data-item-low="${low ? "1" : "0"}" data-item-inactive="${inactive ? "1" : "0"}">
        <td class="pharm-med">${escapeHtml(i.name)}${inactive ? ` <span class="item-chip stock low">Inactive</span>` : ""}</td>
        <td>${escapeHtml(i.generic_name || i.local_name || "—")}</td>
        <td>${escapeHtml(i.medicine_type || "—")}</td>
        <td>${escapeHtml(pack)}</td>
        <td>${escapeHtml(i.batch_no || "—")}</td>
        <td>${escapeHtml(expiry)}</td>
        <td class="pharm-n">${money(i.mrp || i.retail_rate)}</td>
        <td class="pharm-n">${money(i.retail_rate)}</td>
        <td><span class="item-chip ${low ? "stock low" : "stock ok"}">${escapeHtml(fmtQty(i.stock_gm, i))}</span></td>
        <td><div class="item-card-actions">
          <button class="btn" data-edit-item="${escapeHtml(i.id)}" type="button">Edit</button>
          <button class="btn" data-toggle-item="${escapeHtml(i.id)}" type="button">${inactive ? "Activate" : "Deactivate"}</button>
          <button class="btn" data-recv="${escapeHtml(i.id)}" type="button">${escapeHtml(POSUnits.receiveLabel(itemUnit(i)))}</button>
        </div></td>
      </tr>`;
      })
      .join("")}</tbody></table>`;
    filterItemsCatalog();
    return;
  }
  el.innerHTML = items
    .map((i) => {
      const src = itemPhotoUrl(i);
      const thumb = src
        ? `<img class="item-thumb" src="${escapeHtml(src)}" alt="">`
        : `<span class="item-thumb-empty" aria-hidden="true">${escapeHtml(itemPhotoLetter(i))}</span>`;
      const low = Number(i.stock_gm) <= Number(i.reorder_level_gm);
      const extra = variant
        ? `${escapeHtml(globalThis.POSFootwear?.wearerLabel(i.wearer_type) || "—")} · ${escapeHtml(i.color || "—")} · Sz ${escapeHtml(i.size || "—")}`
        : isPharmacyShop()
          ? `${escapeHtml(i.generic_name || i.local_name || i.code || "")}${i.medicine_type ? ` · ${escapeHtml(i.medicine_type)}` : ""}${i.batch_no ? ` · ${escapeHtml(i.batch_no)}` : ""}`
          : `${escapeHtml(i.code || "")}${i.hsn ? ` · ${taxCodeLabel()} ${escapeHtml(i.hsn)}` : ""}`;
      const group = footwear
        ? `${escapeHtml(i.category || "Style")} / ${escapeHtml(i.subcategory || "—")}`
        : `${escapeHtml(i.category || "—")} / ${escapeHtml(i.subcategory || "—")}`;
      const suffix = POSUnits.rateSuffix(itemUnit(i));
      const search = itemSearchHay(i);
      const editing = $("item-id")?.value === i.id;
      const inactive = itemStatusOf(i.status) === "inactive";
      return `<article class="report-card item-card${editing ? " is-editing" : ""}${inactive ? " is-inactive" : ""}" data-item-card data-edit-item="${escapeHtml(i.id)}" data-item-search="${escapeHtml(search)}" data-item-low="${low ? "1" : "0"}" data-item-inactive="${inactive ? "1" : "0"}">
        <div class="item-card-head">
          ${thumb}
          <div class="item-card-copy">
            <strong>${escapeHtml(i.name)}</strong>
            <span>${extra}</span>
          </div>
        </div>
        <div class="item-card-meta">
          <span class="item-chip">${escapeHtml(itemUnit(i))}</span>
          <span class="item-chip">${group}</span>
          <span class="item-chip ${low ? "stock low" : "stock ok"}">${escapeHtml(fmtQty(i.stock_gm, i))}</span>
          <span class="item-chip ${inactive ? "stock low" : "stock ok"}">${inactive ? "Inactive" : "Active"}</span>
        </div>
        <div class="item-card-foot">
          <div class="item-card-rates">
            <span>${isPharmacyShop() ? "Selling" : "Retail"} <em>${money(i.retail_rate)}${escapeHtml(suffix)}</em></span>
            <span>B2B <em>${money(i.b2b_rate)}${escapeHtml(suffix)}</em></span>
          </div>
          <div class="item-card-actions">
            <button class="btn" data-edit-item="${escapeHtml(i.id)}" type="button">Edit</button>
            <button class="btn" data-toggle-item="${escapeHtml(i.id)}" type="button">${inactive ? "Activate" : "Deactivate"}</button>
            <button class="btn" data-recv="${escapeHtml(i.id)}" type="button">${escapeHtml(POSUnits.receiveLabel(itemUnit(i)))}</button>
          </div>
        </div>
      </article>`;
    })
    .join("");
  filterItemsCatalog();
}

function dueCustomers() {
  return (state.customers || []).filter((c) => Number(c.outstanding) > 0);
}

function fillDueCustomerSelect(selectedId) {
  const el = $("due-customer");
  if (!el) return;
  const due = dueCustomers();
  const cur = selectedId || el.value;
  el.innerHTML = `<option value="">Select customer with due…</option>${due
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.business_name || c.name)} · ${money(c.outstanding)}</option>`)
    .join("")}`;
  if (cur && due.some((c) => c.id === cur)) el.value = cur;
  paintDueOutstanding();
}

function paintDueOutstanding() {
  const el = $("due-outstanding");
  const id = $("due-customer")?.value;
  const c = (state.customers || []).find((row) => row.id === id);
  const due = Number(c?.outstanding) || 0;
  if (el) el.textContent = c ? `Outstanding: ${money(due)}` : "Outstanding: —";
  if ($("due-amount") && c) {
    $("due-amount").max = String(due);
    if (!$("due-amount").value) $("due-amount").value = String(due);
  }
}

async function collectCustomerDue(customer, amount, method, notes) {
  const data = await api("/api/accounts/receipts", {
    method: "POST",
    body: JSON.stringify({
      customer_id: customer.id,
      amount: Number(amount),
      payment_method: method,
      notes,
    }),
  });
  await loadBootstrap();
  fillDueCustomerSelect();
  renderCustomersTable();
  try {
    await loadAccounts();
  } catch {
    /* accounts view optional */
  }
  const entry = {
    entry_no: data.entryNo,
    entry_type: "receipt",
    party_name: data.customer?.business_name || data.customer?.name || customer.business_name || customer.name,
    party_mobile: data.customer?.mobile || customer.mobile,
    amount: data.amount,
    payment_method: data.method || method,
    notes,
    created_at: new Date().toISOString(),
    previous_due: data.previous_due,
    balance_due: data.balance_due ?? data.customer?.outstanding,
    id: data.ledgerId,
    party_id: customer.id,
  };
  showVoucherResult(entry, { autoPrint: true });
  return data;
}

function renderCustomersTable() {
  const dueTotal = dueCustomers().reduce((s, c) => s + (Number(c.outstanding) || 0), 0);
  const stats = $("customers-hero-stats");
  if (stats) {
    stats.innerHTML = [
      ["Customers", (state.customers || []).length],
      ["With due", dueCustomers().length],
      ["Outstanding", money(dueTotal)],
    ]
      .map(([k, v]) => `<div class="items-stat"><span>${k}</span><strong>${typeof v === "number" ? v : escapeHtml(String(v))}</strong></div>`)
      .join("");
  }
  fillDueCustomerSelect();
  $("customers-table").innerHTML = `<table><thead><tr>
    <th>Code</th><th>${isPharmacyShop() ? "Customer Name" : "Name"}</th>${isPharmacyShop() ? "<th>Address</th><th>Doctor / Rx</th>" : "<th>Type</th>"}<th>${isPharmacyShop() ? "Mobile No." : "Mobile"}</th>${isPharmacyShop() ? "" : "<th>State</th><th>GSTIN</th>"}<th>Outstanding</th><th></th>
  </tr></thead><tbody>${state.customers
    .map(
      (c) => `<tr>
      <td>${escapeHtml(c.code)}</td>
      <td>${escapeHtml(c.business_name || c.name)}</td>
      ${isPharmacyShop()
        ? `<td>${escapeHtml(c.address || "—")}</td><td>${escapeHtml(c.doctor_rx || "—")}</td>`
        : `<td>${escapeHtml(c.type)}</td>`}
      <td>${escapeHtml(c.mobile)}</td>
      ${isPharmacyShop() ? "" : `<td>${escapeHtml(c.state || "—")}</td><td>${escapeHtml(c.gstin || "—")}</td>`}
      <td>${money(c.outstanding)}</td>
      <td>${Number(c.outstanding) > 0 ? `<button class="btn primary" type="button" data-collect-due="${escapeHtml(c.id)}">Collect</button>` : ""}</td>
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

function packUnitLabel(item) {
  return poUnitLabel(item);
}

function snapshotPackForm() {
  const map = new Map();
  document.querySelectorAll("[data-pack-item]").forEach((box) => {
    const qty = document.querySelector(`[data-pack-qty="${box.dataset.packItem}"]`);
    map.set(box.dataset.packItem, { checked: box.checked, qty: qty?.value });
  });
  return map;
}

function packRowAmount(item, qty) {
  return POSUnits.lineAmount(qty, Number(item.retail_rate) || 0, itemUnit(item));
}

function paintPackLive() {
  const el = $("pack-live");
  const rows = readPackFormItems();
  const n = rows.length;
  let weight = 0;
  let count = 0;
  let volume = 0;
  let amount = 0;
  for (const row of rows) {
    const item = state.items.find((x) => x.id === row.item_id);
    if (!item) continue;
    const unit = itemUnit(item);
    const qty = Number(row.quantity_gm) || 0;
    amount += packRowAmount(item, qty);
    if (POSUnits.isCount(unit)) count += qty;
    else if (POSUnits.typeOf(unit).family === "volume") volume += qty;
    else weight += qty;
  }
  const bits = [];
  if (weight) bits.push(kg(weight));
  if (volume) bits.push(`${volume} ml`);
  if (count) bits.push(`${count} pcs`);
  const qtyLabel = bits.length ? bits.join(" + ") : "Empty";
  if (el) {
    el.innerHTML = `<span><strong>${n}</strong> spice${n === 1 ? "" : "s"}</span>
      <span><strong>${escapeHtml(qtyLabel)}</strong></span>
      <span>Est. ${money(amount)}</span>`;
  }
  const amtEls = document.querySelectorAll("[data-pack-amt]");
  amtEls.forEach((cell) => {
    const id = cell.dataset.packAmt;
    const item = state.items.find((x) => x.id === id);
    const box = document.querySelector(`[data-pack-item="${id}"]`);
    const qty = Number(document.querySelector(`[data-pack-qty="${id}"]`)?.value) || 0;
    cell.textContent = box?.checked && item ? money(packRowAmount(item, qty)) : "—";
  });
  document.querySelectorAll("[data-pack-row]").forEach((row) => {
    const box = row.querySelector("[data-pack-item]");
    row.classList.toggle("is-checked", Boolean(box?.checked));
  });
  filterPackCompose();
}

function filterPackCompose() {
  const q = ($("pack-item-search")?.value || "").trim().toLowerCase();
  const selectedOnly = Boolean($("pack-selected-only")?.checked);
  document.querySelectorAll("[data-pack-row]").forEach((row) => {
    const hay = row.dataset.packSearch || "";
    const box = row.querySelector("[data-pack-item]");
    const hideSearch = Boolean(q) && !hay.includes(q);
    const hideSel = selectedOnly && !box?.checked;
    row.hidden = hideSearch || hideSel;
  });
}

function filterPackLibrary() {
  const q = ($("pack-library-search")?.value || "").trim().toLowerCase();
  document.querySelectorAll("#packs-table [data-pack-card]").forEach((card) => {
    const hay = card.dataset.packSearch || "";
    card.hidden = Boolean(q) && !hay.includes(q);
  });
}

function resetPackForm() {
  $("pack-form").reset();
  if ($("pack-id")) $("pack-id").value = "";
  if ($("pack-save")) $("pack-save").textContent = "Save pack";
  if ($("pack-mode")) $("pack-mode").textContent = "New pack";
  $("pack-form")?.classList.remove("is-editing");
  if ($("pack-item-search")) $("pack-item-search").value = "";
  if ($("pack-selected-only")) $("pack-selected-only").checked = false;
  renderPackCompose();
}

function fillPackForm(pack) {
  if (!pack) return;
  $("pack-id").value = pack.id;
  $("pack-name").value = pack.name;
  if ($("pack-save")) $("pack-save").textContent = "Update pack";
  if ($("pack-mode")) $("pack-mode").textContent = `Editing ${pack.code || pack.name}`;
  $("pack-form")?.classList.add("is-editing");
  if ($("pack-item-search")) $("pack-item-search").value = "";
  if ($("pack-selected-only")) $("pack-selected-only").checked = true;
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
  paintPackLive();
  $("pack-form")?.scrollIntoView({ block: "start" });
  $("pack-name")?.focus();
}

function renderPackCompose() {
  const wrap = $("pack-lines");
  if (!wrap) return;
  const prev = snapshotPackForm();
  const items = packComposeItems();
  if (!items.length) {
    wrap.innerHTML = `<p class="pack-empty">Add items first — packs are built from your catalog.</p>`;
    paintPackLive();
    return;
  }
  wrap.innerHTML = `<div class="pack-table-wrap"><table class="pack-table">
    <thead><tr><th class="pack-check"></th><th>Spice</th><th>Group</th><th>Qty</th><th>Unit</th><th class="num">Est.</th></tr></thead>
    <tbody>${items
      .map((i) => {
        const unit = packUnitLabel(i);
        const snap = prev.get(i.id);
        const checked = snap?.checked ? " checked" : "";
        const qty = snap?.qty || (POSUnits.isCount(itemUnit(i)) ? 1 : 500);
        const search = `${i.name} ${i.subcategory || ""} ${i.category || ""} ${i.hsn || ""} ${i.code || ""}`.toLowerCase();
        return `<tr data-pack-row="${escapeHtml(i.id)}" data-pack-search="${escapeHtml(search)}"${snap?.checked ? ' class="is-checked"' : ""}>
          <td class="pack-check"><input type="checkbox" data-pack-item="${escapeHtml(i.id)}"${checked} /></td>
          <td class="pack-name-cell">${escapeHtml(i.name)}</td>
          <td class="pack-group">${escapeHtml(i.subcategory || i.category || "—")}</td>
          <td><input type="number" min="${POSUnits.qtyMin()}" max="${POSUnits.qtyMax()}" step="1" value="${escapeHtml(qty)}" data-pack-qty="${escapeHtml(i.id)}" /></td>
          <td class="pack-unit">${escapeHtml(unit)}</td>
          <td class="num" data-pack-amt="${escapeHtml(i.id)}">—</td>
        </tr>`;
      })
      .join("")}</tbody></table></div>`;
  paintPackLive();
}

function renderPacksTable() {
  const el = $("packs-table");
  if (!el) return;
  const stats = $("packs-hero-stats");
  const n = state.packs.length;
  const lines = state.packs.reduce((s, p) => s + (p.items || []).length, 0);
  if (stats) {
    stats.innerHTML = `<div class="packs-stat"><span>Pack types</span><strong>${n}</strong></div>
      <div class="packs-stat"><span>Recipe lines</span><strong>${lines}</strong></div>`;
  }
  if (!n) {
    el.innerHTML = `<div class="pack-empty-card">
      <strong>No pack types yet</strong>
      <p>Name a pack on the left, tick spices, and save. It will appear here and on Counter.</p>
    </div>`;
    return;
  }
  el.innerHTML = state.packs
    .map((p) => {
      const items = p.items || [];
      const search = `${p.name} ${p.code || ""} ${items.map((i) => i.spice_name || "").join(" ")}`.toLowerCase();
      let amount = 0;
      const chips = items
        .map((i) => {
          const it = state.items.find((x) => x.id === i.item_id);
          if (it) amount += packRowAmount(it, Number(i.quantity_gm) || 0);
          return `<li>${escapeHtml(i.spice_name)} <em>${escapeHtml(fmtQty(i.quantity_gm, it || i))}</em></li>`;
        })
        .join("");
      return `<article class="report-card pack-card" data-pack-card data-edit-pack="${escapeHtml(p.id)}" data-pack-search="${escapeHtml(search)}">
        <div class="pack-card-head">
          <div>
            <strong>${escapeHtml(p.name)}</strong>
            <span>${escapeHtml(p.code || "")} · ${escapeHtml(kg(p.total_quantity_gm))}</span>
          </div>
          <button class="btn" type="button" data-edit-pack="${escapeHtml(p.id)}">Edit</button>
        </div>
        <ul class="pack-chips">${chips || "<li>No spices</li>"}</ul>
        <p class="pack-card-foot">${items.length} spice${items.length === 1 ? "" : "s"} · Est. ${money(amount)}</p>
      </article>`;
    })
    .join("");
  filterPackLibrary();
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
    <th class="po-check"></th><th>Item</th><th>${taxCodeLabel()}</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Expiry</th><th class="num">Amount</th>
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

function renderSettings() {
  $("set-name").value = state.company.name || "";
  $("set-address").value = state.company.address || "";
  $("set-phone").value = state.company.phone || "";
  $("set-email").value = state.company.email || "";
  $("set-gstin").value = state.company.gstin || "";
  if ($("set-drug-licence")) $("set-drug-licence").value = state.company.drug_licence_no || "";
  if ($("set-fssai")) $("set-fssai").value = state.company.fssai_licence_no || "";
  if ($("set-ndps")) $("set-ndps").value = state.company.ndps_licence_no || "";
  if ($("set-city")) $("set-city").value = state.company.city || "";
  if ($("set-state")) $("set-state").value = state.company.state || "";
  if ($("set-pincode")) $("set-pincode").value = state.company.pincode || state.company.pin_code || "";
  if ($("set-invoice-footer")) $("set-invoice-footer").value = state.company.invoice_footer || "";
  if ($("set-invoice-terms")) $("set-invoice-terms").value = state.company.invoice_terms || "";
  if ($("set-payment-upi")) $("set-payment-upi").value = state.company.payment_upi || "";
  if ($("set-timezone")) $("set-timezone").value = shopTimezone();
  paintTimezonePreview();
  state.logoDraft = null;
  state.payQrDraft = null;
  $("set-logo").value = "";
  if ($("set-pay-qr")) $("set-pay-qr").value = "";
  paintLogoFileName();
  paintPayQrFileName();
  showLogo($("logo-preview"), state.company.logo_url);
  showLogo($("pay-qr-preview"), state.company.payment_qr_url);
  if ($("set-shop-id")) $("set-shop-id").value = shopBusinessId();
  const stats = $("settings-hero-stats");
  if (stats) {
    const tz = shopTimezone();
    const tzLabel = SHOP_TIMEZONE_OPTIONS.find((row) => row.id === tz)?.label || tz;
    const login = state.session?.username || state.session?.email || state.session?.name || "—";
    stats.innerHTML = [
      ["Shop", state.company.name || "—"],
      ["Timezone", tzLabel],
      ["Signed in", login],
    ]
      .map(([k, v]) => `<div class="items-stat"><span>${k}</span><strong>${escapeHtml(String(v))}</strong></div>`)
      .join("");
  }
  if ($("btn-backup-download")) $("btn-backup-download").href = posUrl("/api/backup");
  fillLocaleSelects();
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
  let data = await api("/api/bootstrap");
  if (isPharmacyShop() && !(data.items || []).length) {
    try {
      const seeded = await api("/api/items/demo-seed", { method: "POST", body: "{}" });
      if (Number(seeded?.created_count) > 0) data = await api("/api/bootstrap");
    } catch {
      /* shop can add items by hand */
    }
  }
  state.company = data.company;
  state.support = data.support || {};
  state.plan = data.plan || null;
  state.items = data.items;
  applyUnitMaster(data.units || []);
  state.customers = data.customers;
  state.packs = data.packs;
  state.combos = data.combos || [];
  state.offers = data.offers || [];
  state.offerSettings = data.offerSettings || { stacking: "product_and_bill" };
  paintPlatformNotices(data.notes);
  paintHeader();
  paintPlatformSupport();
  renderCustomersSelect();
  applyUiLocale();
  fillExpenseCategories();
  paintDeskState(state.currentView || "dashboard");
  if ($("dash-welcome") && state.session) {
    paintDashWelcome();
  }
  void loadToday();
  void loadCustomerLoyalty();
}

function dashRoleLabel(role) {
  const r = String(role || "").trim();
  if (r === "business_admin") return "Admin";
  return r.replace(/_/g, " ");
}

function ymdDiffDays(fromYmd, toYmd) {
  const parse = (s) => {
    const m = String(s || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  const a = parse(fromYmd);
  const b = parse(toYmd);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86400000);
}

function subscriptionValidity(dashSub) {
  const raw = dashSub?.expires_at || state.businessMeta?.subscription_expires_at || "";
  const ymdVal = String(raw).slice(0, 10);
  let days = dashSub?.days_left;
  if (!Number.isFinite(Number(days)) && ymdVal) days = ymdDiffDays(shopYmd(), ymdVal);
  else if (days != null) days = Number(days);
  else days = null;
  const until = ymdVal ? formatShopDate(ymdVal) : "—";
  let daysLabel = "—";
  let tone = "";
  if (days != null && Number.isFinite(days)) {
    if (days > 1) daysLabel = `${days} days`;
    else if (days === 1) daysLabel = "1 day";
    else if (days === 0) daysLabel = "Last day";
    else if (days === -1) daysLabel = "Expired 1 day ago";
    else daysLabel = `Expired ${Math.abs(days)} days ago`;
    if (days < 0) tone = "is-warn";
    else if (days <= 7) tone = "is-soon";
  }
  return { ymd: ymdVal, days, until, daysLabel, tone };
}

function paintDashWelcome(dashSub) {
  const el = $("dash-welcome");
  if (!el || !state.session) return;
  const name = String(state.session.name || "").trim();
  el.textContent = name ? `Hello, ${name}` : "Your shop today.";
  const meta = $("dash-welcome-meta");
  if (meta) {
    const sub = subscriptionValidity(dashSub);
    const bits = [dashRoleLabel(state.session.role), state.company?.name].filter(Boolean);
    if (sub.ymd) bits.push(`Valid till ${sub.until}`, sub.daysLabel);
    meta.textContent = bits.join(" · ");
  }
}

async function loadDashboard() {
  try {
    const d = await api("/api/dashboard");
    paintDashWelcome(d.subscription);
    paintPlatformNotices(d.notes);
    const sub = subscriptionValidity(d.subscription);
    $("dash-kpis").innerHTML = [
      [tt("dashboard.today_sales", "Today's sales"), money(d.today?.takings), "orders", ""],
      [tt("dashboard.today_bills", "Today's bills"), d.today?.bills, "orders", ""],
      [tt("dashboard.today_purchase", "Today's purchase"), money(d.purchase), "purchases", ""],
      [tt("dashboard.stock_value", "Stock value"), money(d.stockValue), "stock", ""],
      [tt("dashboard.outstanding", "Customer outstanding"), money(d.outstanding), "customers", ""],
      ["Plan", state.plan?.name || state.plan?.code || "—", "settings", ""],
      ["Valid till", sub.until, "settings", sub.tone],
      ["Days left", sub.daysLabel, "settings", sub.tone],
      ["Subscription fee / year", money(state.plan?.fee_monthly), "settings", ""],
    ]
      .map(
        ([k, v, view, tone]) =>
          `<button type="button" class="report-card dash-kpi ${escapeHtml(String(tone || ""))}" data-dash-view="${view}"><span>${escapeHtml(String(k))}</span><strong>${escapeHtml(String(v ?? "—"))}</strong></button>`,
      )
      .join("");
  } catch (err) {
    $("dash-kpis").innerHTML = `<p class="hint error">${escapeHtml(err.message)}</p>`;
  }
}

function stockIsLow(row) {
  return Number(row?.stock_gm) <= Number(row?.reorder_level_gm);
}

function stockIsOut(row) {
  return Number(row?.stock_gm) <= 0;
}

function resolvePickerItem(q, pool) {
  const needle = String(q || "").trim().toLowerCase();
  if (!needle) return null;
  const rows = Array.isArray(pool) ? pool : [];
  const exact = rows.find((i) =>
    String(i.id || "").toLowerCase() === needle
    || String(i.barcode || "").toLowerCase() === needle
    || String(i.mfr_barcode || "").toLowerCase() === needle
    || String(i.code || "").toLowerCase() === needle
    || String(i.name || "").toLowerCase() === needle
  );
  if (exact) return exact;
  const starts = rows.filter((i) => String(i.name || "").toLowerCase().startsWith(needle));
  if (starts.length === 1) return starts[0];
  const contains = rows.filter((i) => {
    const hay = [i.name, i.local_name, i.code, i.barcode, i.mfr_barcode]
      .map((x) => String(x || "").toLowerCase())
      .join(" ");
    return hay.includes(needle);
  });
  return contains.length === 1 ? contains[0] : null;
}

function pickerOptionHtml(item) {
  const label = [item.code, item.barcode].filter(Boolean).join(" · ");
  const opts = [`<option value="${escapeHtml(item.name)}" data-id="${escapeHtml(item.id)}" label="${escapeHtml(label)}"></option>`];
  const extras = [item.barcode, item.code].filter((v, idx, all) => v && String(v) !== item.name && all.indexOf(v) === idx);
  for (const extra of extras) {
    opts.push(`<option value="${escapeHtml(extra)}" data-id="${escapeHtml(item.id)}" label="${escapeHtml(item.name)}"></option>`);
  }
  return opts.join("");
}

function syncStockQtyField(item) {
  const qty = $("stk-qty");
  const unitEl = $("stk-qty-unit");
  const lab = $("stk-qty-lab");
  if (!qty) return;
  if (!item) {
    qty.placeholder = "Qty";
    qty.removeAttribute("step");
    qty.removeAttribute("min");
    if (unitEl) unitEl.textContent = "";
    if (lab) lab.textContent = "Qty";
    return;
  }
  const u = itemUnit(item);
  const t = POSUnits.typeOf(u);
  const suffix = t.stockSuffix || "";
  qty.step = t.displayDiv ? "0.001" : String(t.step || 1);
  qty.placeholder = POSUnits.isCount(u) ? "e.g. 12" : t.displayDiv ? "e.g. 1.5" : "e.g. 500";
  const kind = $("stk-kind")?.value;
  if (kind === "adjustment" || kind === "opening") qty.removeAttribute("min");
  else qty.min = t.displayDiv ? "0.001" : "1";
  if (unitEl) unitEl.textContent = suffix;
  if (lab) lab.textContent = suffix ? `Qty (${suffix})` : "Qty";
}

function paintStockSelected(item) {
  const el = $("stock-selected");
  syncStockQtyField(item);
  if (!el) return;
  if (!item) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  const low = stockIsLow(item);
  const out = stockIsOut(item);
  const pill = out
    ? `<span class="stock-pill is-out">Out</span>`
    : low
      ? `<span class="stock-pill is-low">Low</span>`
      : `<span class="stock-pill is-ok">OK</span>`;
  el.hidden = false;
  el.innerHTML = `<strong>${escapeHtml(item.name)}</strong>
    <span>${escapeHtml(item.code || "")}</span>
    <span>On hand ${escapeHtml(fmtQty(item.stock_gm, item))}</span>
    ${pill}`;
}

function selectStockItem(id) {
  const rows = state.stockRows || [];
  const item = rows.find((r) => r.id === id) || state.items.find((i) => i.id === id);
  if (!item) return;
  if ($("stk-item")) $("stk-item").value = item.id;
  if ($("stk-item-search")) $("stk-item-search").value = item.name;
  paintStockSelected(item);
  document.querySelectorAll("#stock-table [data-stock-item]").forEach((el) => {
    el.classList.toggle("is-editing", el.dataset.stockItem === id);
  });
  $("stk-qty")?.focus();
}

function clearStockForm() {
  if ($("stk-item")) $("stk-item").value = "";
  if ($("stk-item-search")) $("stk-item-search").value = "";
  if ($("stk-qty")) $("stk-qty").value = "";
  if ($("stk-note")) $("stk-note").value = "";
  if ($("stk-kind")) $("stk-kind").value = "adjustment";
  paintStockSelected(null);
  document.querySelectorAll("#stock-table [data-stock-item].is-editing").forEach((el) => el.classList.remove("is-editing"));
  if ($("stock-hint")) {
    $("stock-hint").textContent = "";
    $("stock-hint").className = "hint";
  }
}

function setStockHint(msg, kind) {
  const hint = $("stock-hint");
  if (!hint) return;
  hint.textContent = msg || "";
  hint.className = kind ? `hint ${kind}` : "hint";
}

function paintStockHero(rows) {
  const stats = $("stock-hero-stats");
  if (!stats) return;
  const list = Array.isArray(rows) ? rows : [];
  let value = 0;
  let low = 0;
  for (const r of list) {
    const item = state.items.find((i) => i.id === r.id) || r;
    value += POSUnits.lineAmount(r.stock_gm, r.purchase_rate, itemUnit(item));
    if (stockIsLow(r)) low += 1;
  }
  stats.innerHTML = `<div class="items-stat"><span>SKUs</span><strong>${list.length}</strong></div>
    <div class="items-stat"><span>On-hand value</span><strong>${money(value)}</strong></div>
    <button class="items-stat${low ? " is-warn" : ""}${state.stockLowOnly ? " is-active" : ""}" type="button" data-stock-low>
      <span>Low / out</span><strong>${low}</strong>
    </button>`;
}

function filterStockList() {
  const q = String($("stock-search")?.value || "").trim().toLowerCase();
  const lowOnly = Boolean(state.stockLowOnly || $("stock-low-only")?.checked);
  let shown = 0;
  document.querySelectorAll("#stock-table [data-stock-item]").forEach((card) => {
    const hay = card.dataset.stockSearch || "";
    const low = card.dataset.stockLow === "1";
    const hide = (Boolean(q) && !hay.includes(q)) || (lowOnly && !low);
    card.hidden = hide;
    if (!hide) shown += 1;
  });
  const empty = $("stock-filter-empty");
  if (empty) empty.hidden = shown > 0 || !document.querySelector("#stock-table [data-stock-item]");
}

function paintStockList(rows) {
  const el = $("stock-table");
  if (!el) return;
  const selected = $("stk-item")?.value || "";
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    el.innerHTML = `<div class="item-empty-card">
      <strong>No stock rows</strong>
      <p>Add items first. Their on-hand quantity shows here.</p>
    </div>`;
    return;
  }
  el.innerHTML = `${list
    .map((r) => {
      const item = state.items.find((i) => i.id === r.id) || r;
      const low = stockIsLow(r);
      const out = stockIsOut(r);
      const value = POSUnits.lineAmount(r.stock_gm, r.purchase_rate, itemUnit(item));
      const search = itemSearchHay(item);
      const pill = out
        ? `<span class="stock-pill is-out">Out</span>`
        : low
          ? `<span class="stock-pill is-low">Low</span>`
          : `<span class="stock-pill is-ok">OK</span>`;
      return `<article class="report-card item-card stock-card${selected === r.id ? " is-editing" : ""}${out ? " is-out" : low ? " is-low" : ""}" data-stock-item="${escapeHtml(r.id)}" data-stock-search="${escapeHtml(search)}" data-stock-low="${low ? "1" : "0"}">
        <div class="item-card-head">
          <div class="item-card-copy">
            <strong>${escapeHtml(r.name)}</strong>
            <span>${escapeHtml(r.code || "")}${item.barcode ? ` · ${escapeHtml(item.barcode)}` : ""}</span>
          </div>
          ${pill}
        </div>
        <div class="item-card-meta">
          <span class="item-chip">${escapeHtml(itemUnit(item))}</span>
          <span class="item-chip ${low ? "stock low" : "stock ok"}">On hand ${escapeHtml(fmtQty(r.stock_gm, item))}</span>
          <span class="item-chip">Reorder ${escapeHtml(fmtQty(r.reorder_level_gm, item))}</span>
          <span class="item-chip">${money(value)}</span>
        </div>
      </article>`;
    })
    .join("")}
    <div class="item-empty-card" id="stock-filter-empty" hidden>
      <strong>No matching SKUs</strong>
      <p>Clear search or turn off Low stock to see the rest of the catalog.</p>
    </div>`;
  filterStockList();
}

async function loadStock() {
  fillItemPicker("stk-item-list", "stk-item-search", "stk-item");
  paintStockExcelLink();
  try {
    const rows = await api("/api/stock");
    state.stockRows = Array.isArray(rows) ? rows : [];
    paintStockHero(state.stockRows);
    paintStockList(state.stockRows);
    const selectedId = $("stk-item")?.value;
    if (selectedId) {
      const next = state.stockRows.find((r) => r.id === selectedId);
      if (next) paintStockSelected(next);
    }
  } catch (err) {
    setStockHint(err.message, "error");
    const el = $("stock-table");
    if (el) {
      el.innerHTML = `<div class="item-empty-card">
        <strong>Could not load stock</strong>
        <p>${escapeHtml(err.message)}</p>
      </div>`;
    }
  }
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
  paintStaffRoleOptions();
  $("staff-save").textContent = u ? "Update staff" : "Save";
  if ($("staff-cancel")) $("staff-cancel").hidden = !u;
}

function fillBranchForm(b) {
  const editing = Boolean(b?.id);
  if ($("br-id")) $("br-id").value = b?.id || "";
  if ($("br-name")) $("br-name").value = b?.name || "";
  if ($("br-address")) $("br-address").value = b?.address || "";
  if ($("br-phone")) $("br-phone").value = b?.phone || "";
  if ($("br-status")) $("br-status").value = b?.status === "inactive" ? "inactive" : "active";
  if ($("br-login")) {
    $("br-login").value = b?.login_username || b?.username || "";
    $("br-login").required = !editing;
  }
  if ($("br-pass")) {
    $("br-pass").value = "";
    $("br-pass").required = !editing;
    $("br-pass").placeholder = editing ? "Leave blank to keep current password" : "8+ characters";
  }
  if ($("branch-mode")) $("branch-mode").textContent = editing ? "Edit branch" : "New branch";
  if ($("branch-save")) $("branch-save").textContent = editing ? "Update branch" : "Save branch";
  if ($("branch-cancel")) $("branch-cancel").hidden = !editing;
  $("branch-form")?.classList.toggle("is-editing", editing);
}

function branchSearchHay(b) {
  return [b.name, b.address, b.phone, b.login_username, b.username, b.status].map((v) => String(v || "").toLowerCase()).join(" ");
}

function renderBranches() {
  const rows = state.branches || [];
  const q = String($("branch-search")?.value || "").trim().toLowerCase();
  const hideInactive = Boolean($("branch-hide-inactive")?.checked);
  const active = rows.filter((b) => b.status !== "inactive").length;
  const stats = $("branches-hero-stats");
  if (stats) {
    stats.innerHTML = [
      ["Total", rows.length],
      ["Active", active],
      ["Inactive", rows.length - active],
    ]
      .map(([k, v]) => `<div class="items-stat"><span>${k}</span><strong>${v}</strong></div>`)
      .join("");
  }
  const visible = rows.filter((b) => {
    if (hideInactive && b.status === "inactive") return false;
    if (q && !branchSearchHay(b).includes(q)) return false;
    return true;
  });
  const editingId = $("br-id")?.value || "";
  const el = $("branch-table");
  if (!el) return;
  if (!visible.length) {
    el.innerHTML = `<p class="hint">${rows.length ? "No branches match this filter." : "No branches yet. Add the first shop on the left."}</p>`;
    return;
  }
  el.innerHTML = visible
    .map((b) => {
      const inactive = b.status === "inactive";
      const login = b.login_username || b.username || "";
      return `<article class="report-card item-card branch-card${editingId === b.id ? " is-editing" : ""}${inactive ? " is-inactive" : ""}" data-branch-id="${escapeHtml(b.id)}">
        <div class="item-card-head">
          <span class="item-thumb-empty" aria-hidden="true">${escapeHtml(String(b.name || "?").slice(0, 1).toUpperCase())}</span>
          <div class="item-card-copy">
            <strong>${escapeHtml(b.name || "")}</strong>
            <span>${escapeHtml(b.address || "No address")}</span>
          </div>
        </div>
        <div class="item-card-meta">
          <span class="item-chip ${inactive ? "stock low" : "stock ok"}">${inactive ? "Inactive" : "Active"}</span>
          ${b.phone ? `<span class="item-chip">${escapeHtml(b.phone)}</span>` : ""}
          <span class="item-chip">${login ? `Login ${escapeHtml(login)}` : "No login yet"}</span>
        </div>
        <div class="item-card-foot">
          <div class="item-card-actions">
            <button class="btn" type="button" data-edit-branch="${escapeHtml(b.id)}">Edit</button>
            <button class="btn" type="button" data-toggle-branch="${escapeHtml(b.id)}">${inactive ? "Activate" : "Deactivate"}</button>
          </div>
        </div>
      </article>`;
    })
    .join("");
}

async function loadBranches() {
  const rows = await api("/api/branches");
  state.branches = Array.isArray(rows) ? rows : [];
  renderBranches();
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
    paintReportsHero(s, data);
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
      reportBlock("GST summary (India)", "GST summary", ["Type", "CGST", "SGST", "IGST", "Total GST"], gstSummaryRows(s), "gst"),
      reportBlock("Sales bills", "Sales bills", ["Order", "Customer", "Type", "Pack", "Pack count", "Status", "Qty g", "Taxable", "GST", "Total", "Pay", "Pay status", "Date"], (data.sales || []).map((o) => [o.order_number, o.customer_name, o.customer_type, o.pack_name || "Loose items", Number(o.pack_count) || 0, orderStatusLabel(o.status), Number(o.total_quantity_gm) || 0, Number(o.subtotal) || 0, Number(o.gst) || 0, Number(o.total) || 0, o.payment_method, o.payment_status, formatShopDateTime(o.created_at)]), "sales"),
      reportBlock("Item sales", "Item sales", ["Item", "Qty g", "Amount", "GST"], (data.byItem || []).map((r) => [r.item_name, Number(r.quantity_gm) || 0, Number(r.amount) || 0, Number(r.gst) || 0]), "sales"),
      reportBlock("Customer sales", "Customer sales", ["Customer", "Type", "Bills", "Takings", "GST"], (data.byCustomer || []).map((r) => [r.customer_name, r.customer_type, Number(r.bills) || 0, Number(r.takings) || 0, Number(r.gst) || 0]), "sales"),
      reportBlock("Pack sales", "Pack sales", ["Pack type", "Pack count", "Bills", "Takings"], (data.byPack || []).map((r) => [r.pack_type, Number(r.pack_count) || 0, Number(r.bills) || 0, Number(r.takings) || 0]), "sales"),
      reportBlock("Payment", "Payment", ["Method", "Bills", "Takings"], (data.byPay || []).map((r) => [r.payment_method, Number(r.bills) || 0, Number(r.takings) || 0]), "payment"),
      reportBlock("Payment daywise", "Payment daywise", ["Day", "Cash", "UPI", "Card", "Credit", "Other", "Bills", "Total"], (data.payDaywise || []).map((r) => [reportDay(r.day), Number(r.cash) || 0, Number(r.upi) || 0, Number(r.card) || 0, Number(r.credit) || 0, Number(r.other) || 0, Number(r.bills) || 0, Number(r.total) || 0]), "payment"),
      reportBlock("GST daywise", "GST daywise", ["Day", "Taxable", "GST", "Total"], (data.gst || []).map((r) => [reportDay(r.day), Number(r.taxable) || 0, Number(r.gst) || 0, Number(r.total) || 0]), "gst"),
      reportBlock("GST output by rate", "GST output by rate", ["GST %", "Taxable", "CGST", "SGST", "IGST", "Total GST", "Bills"], gstRateRows(data.gstByRate), "gst"),
      reportBlock("GST input by rate", "GST input by rate", ["GST %", "Taxable", "CGST", "SGST", "IGST", "Total GST"], gstRateRows(data.gstInputByRate, false), "gst"),
      reportBlock(`GST ${taxCodeLabel()} itemwise`, `GST ${taxCodeLabel()} itemwise`, [`${taxCodeLabel()}/SKU`, "Item", "GST %", "Qty g", "Taxable", "GST"], (data.gstHsn || []).map((r) => [r.hsn, r.item_name, Number(r.gst_rate) || 0, Number(r.quantity_gm) || 0, Number(r.taxable) || 0, Number(r.gst) || 0]), "gst"),
      reportBlock("GST B2B sales", "GST B2B sales", ["Bill", "Date", "Customer", "GSTIN", "Taxable", "CGST", "SGST", "IGST", "Total", "Supply"], (data.gstB2B || []).map((r) => [r.order_number, reportDay(r.bill_date), r.customer_name, r.gstin, Number(r.taxable) || 0, Number(r.cgst) || 0, Number(r.sgst) || 0, Number(r.igst) || 0, Number(r.total) || 0, r.interState ? "Inter-state" : "Intra-state"]), "gst"),
      reportBlock("GST B2C sales", "GST B2C sales", ["Bill", "Date", "Customer", "Taxable", "CGST", "SGST", "IGST", "Total", "Supply"], (data.gstB2C || []).map((r) => [r.order_number, reportDay(r.bill_date), r.customer_name, Number(r.taxable) || 0, Number(r.cgst) || 0, Number(r.sgst) || 0, Number(r.igst) || 0, Number(r.total) || 0, r.interState ? "Inter-state" : "Intra-state"]), "gst"),
      reportBlock("Stock", "Stock", ["Code", "Name", taxCodeLabel(), "Category", "Subcategory", "Stock g", "Reorder g", "Retail", "B2B", "Purchase", "GST %"], (data.stock || []).map((i) => [i.code, i.name, i.hsn, i.category, i.subcategory, Number(i.stock_gm) || 0, Number(i.reorder_level_gm) || 0, Number(i.retail_rate) || 0, Number(i.b2b_rate) || 0, Number(i.purchase_rate) || 0, Number(i.gst_rate) || 0]), "stock"),
      reportBlock("Low stock", "Low stock", ["Code", "Name", "Stock g", "Reorder g"], (data.low || []).map((i) => [i.code, i.name, Number(i.stock_gm) || 0, Number(i.reorder_level_gm) || 0]), "stock"),
      reportBlock("Purchases", "Purchases", ["PO", "Supplier", "Invoice", "Date", "Taxable", "GST", "Total", "Pay", "Status"], (data.purchases || []).map((p) => [p.purchase_number, p.supplier_name, p.supplier_invoice_number, p.purchase_date, Number(p.subtotal) || 0, Number(p.gst) || 0, Number(p.total) || 0, p.payment_method, p.payment_status]), "books"),
      reportBlock("Expenses", "Expenses", ["No.", "Date", "Category", "Amount", "GST", "Total", "Pay", "Notes"], (data.expenses || []).map((e) => [e.expense_number, e.expense_date, e.category, Number(e.amount) || 0, Number(e.gst) || 0, Number(e.total) || (Number(e.amount) || 0) + (Number(e.gst) || 0), e.payment_method, e.notes]), "books"),
      reportBlock("Customers", "Customers", ["Code", "Name", "Business", "Mobile", "Type", "State", "GSTIN", "Credit limit", "Outstanding"], (data.customers || []).map((c) => [c.code, c.name, c.business_name, c.mobile, c.type, c.state, c.gstin, Number(c.credit_limit) || 0, Number(c.outstanding) || 0]), "books"),
    ].join("");
    applyReportsFilter();
    $("reports-hint").textContent = "";
    $("reports-hint").className = "hint";
  } catch (err) {
    $("reports-hint").textContent = err.message;
    $("reports-hint").className = "hint error";
  }
}

let orderCache = [];
let lastInvoice = null;
let selectedOrderId = null;
const orderFilter = { q: "", status: "", payment: "" };

function orderCustomerName(o) {
  const stored = String(o?.customer_name || "").trim();
  if (stored) return stored;
  const c = (state.customers || []).find((x) => x.id === o?.customer_id);
  const fromCust = String(c?.business_name || c?.name || "").trim();
  return fromCust || "Walk-in";
}

function filterOrders(rows) {
  const q = orderFilter.q.trim().toLowerCase();
  return rows.filter((o) => {
    if (orderFilter.status && String(o.status || "").toLowerCase() !== orderFilter.status) return false;
    if (orderFilter.payment && String(o.payment_status || "").toLowerCase() !== orderFilter.payment) return false;
    if (!q) return true;
    const hay = [o.order_number, orderCustomerName(o), o.payment_method].join(" ").toLowerCase();
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
  const I = window.POSI18n;
  const shop = state.company?.locale || "";
  const user = state.session?.locale || "";
  const customer = selectedCustomer()?.locale || "";
  const locale = I ? I.resolveLocale({ customer, user, shop, platform: "en" }) : "en";
  const mode = state.company?.invoice_language || "shop";
  return {
    company: state.company,
    businessMeta: state.businessMeta,
    customers: state.customers,
    suppliers: state.suppliers,
    items: state.items,
    formatDateTime: formatShopDateTime,
    formatDate: formatShopDate,
    money,
    escapeHtml,
    locale,
    invoiceMode: mode,
    invoiceLabel: (key) => (I ? I.invoiceLabel(key, locale, mode) : key),
    taxCode: taxCodeLabel(),
    displayItemName: (item) => (I ? I.displayItemName(item, locale, mode) : item?.name || item?.item_name || ""),
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

function orderShare(order) {
  const S = globalThis.POSInvoiceShare;
  if (!S || !order?.id) return null;
  return S.shareActions(order, state.company || {}, location.origin);
}

function invoiceShareButtons(order, { copyId } = {}) {
  const share = orderShare(order);
  if (!share) return "";
  const idAttr = copyId ? ` id="${escapeHtml(copyId)}"` : "";
  return `<a class="btn" href="${escapeHtml(share.whatsapp)}" target="_blank" rel="noopener">Share WhatsApp</a>
      <button class="btn" type="button" data-copy-invoice="${escapeHtml(order.id)}"${idAttr}>Copy link</button>`;
}

async function copyInvoiceLink(order) {
  const share = orderShare(order);
  if (!share) return;
  try {
    await navigator.clipboard.writeText(share.url);
    setHint("Invoice link copied", "ok");
  } catch {
    setHint(share.url, "ok");
  }
}

function findInvoice(id) {
  return orderCache.find((row) => row.id === id) || (lastInvoice?.id === id ? lastInvoice : null);
}

function invoiceModalPrintActions(look, order) {
  return `<div class="print-actions">
      ${invoiceShareButtons(order, { copyId: "modal-copy-invoice" })}
      <button class="btn${look === "pos" ? " primary" : ""}" type="button" id="modal-print-pos">Print POS slip</button>
      <button class="btn${look === "office" ? " primary" : ""}" type="button" id="modal-print-office">Print official bill</button>
      <button class="btn${look === "duplicate" ? " primary" : ""}" type="button" id="modal-print-duplicate">Print duplicate</button>
    </div>`;
}

function bindInvoiceModalPrint(order) {
  const pos = $("modal-print-pos");
  const office = $("modal-print-office");
  const dup = $("modal-print-duplicate");
  const copy = $("modal-copy-invoice");
  if (pos) pos.onclick = () => printOrder(order, "pos");
  if (office) office.onclick = () => printOrder(order, "office");
  if (dup) dup.onclick = () => printOrder(order, "duplicate");
  if (copy) copy.onclick = () => copyInvoiceLink(order);
}

function showInvoicePrintModal(order, { title, message } = {}) {
  if (order?.id) lastInvoice = order;
  const note = message || "Bill saved. POS cleared for the next customer.";
  if (title) $("modal-title").textContent = title;
  const paint = (look) => {
    $("modal-body").innerHTML = `<p class="hint ok">${note}</p>
      ${invoiceLookTabs(look)}
      ${invoicePreviewHtml(order, look)}
      ${invoiceModalPrintActions(look, order)}`;
    bindInvoiceModalPrint(order);
    $("modal-body").querySelectorAll("[data-invoice-look]").forEach((btn) => {
      btn.onclick = () => paint(setInvoiceLook(btn.dataset.invoiceLook));
    });
  };
  paint(getInvoiceLook());
  $("modal").hidden = false;
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

function printVoucher(entry) {
  const w = window.open("", "voucher-print", "width=400,height=640");
  if (!w) {
    setHint("Allow pop-ups to print the receipt", "error");
    return;
  }
  w.document.write(InvoicePrint.voucherDocument(entry, invoiceCtx()));
  w.document.close();
}

function showVoucherResult(entry, opts = {}) {
  const isPayment = entry.entry_type === "payment";
  const label = isPayment ? "Payment" : "Receipt";
  const canAlter = Boolean(entry.id);
  const canDelete = canAlter && canDeletePaymentEntry();
  $("modal-title").textContent = `${label} · ${entry.entry_no}`;
  $("modal-body").innerHTML = `<p class="hint ok">${label} saved · ${escapeHtml(entry.entry_no)}</p>
    <div class="thermal-preview">${InvoicePrint.voucherBody(entry, invoiceCtx())}</div>
    <div class="print-actions">
      <button class="btn primary" type="button" id="modal-print-voucher">Print ${label.toLowerCase()}</button>
      ${canAlter ? `<button class="btn" type="button" id="modal-alter-voucher">Alter amount</button>` : ""}
      ${canDelete ? `<button class="btn danger" type="button" id="modal-delete-voucher">Delete</button>` : ""}
    </div>`;
  $("modal").hidden = false;
  const btn = $("modal-print-voucher");
  if (btn) btn.onclick = () => printVoucher(entry);
  const alter = $("modal-alter-voucher");
  if (alter) alter.onclick = () => showAlterVoucherModal(entry);
  const del = $("modal-delete-voucher");
  if (del) del.onclick = () => deleteVoucherEntry(entry).catch((err) => setHint(err.message, "error"));
  if (opts.autoPrint) printVoucher(entry);
}

function voucherMethodOptions(selected) {
  if (globalThis.POSPay?.optionsHtml) return globalThis.POSPay.optionsHtml({ selected });
  const cur = String(selected || "cash").toLowerCase();
  return ["cash", "upi", "card", "bank-transfer"]
    .map((m) => `<option value="${m}"${m === cur ? " selected" : ""}>${m.toUpperCase()}</option>`)
    .join("");
}

function voucherMaxAmount(entry) {
  const oldAmt = Number(entry.amount) || 0;
  if (entry.entry_type === "payment") {
    const s =
      (state.suppliers || []).find((x) => x.id === entry.party_id) ||
      (state.accPayables || []).find((x) => x.id === entry.party_id);
    return (Number(s?.payable_balance) || 0) + oldAmt;
  }
  const c = (state.customers || []).find((x) => x.id === entry.party_id);
  return (Number(c?.outstanding) || 0) + oldAmt;
}

function voucherRowActions(i) {
  const del = canDeletePaymentEntry()
    ? `<button class="btn danger" type="button" data-voucher-delete="${i}">Delete</button>`
    : "";
  return `<button class="btn" type="button" data-voucher-print="${i}">Print</button>
    <button class="btn" type="button" data-voucher-alter="${i}">Alter</button>
    ${del}`;
}

async function deleteVoucherEntry(entry) {
  if (!entry?.id) return;
  if (!canDeletePaymentEntry()) {
    setHint("Only the business admin can delete payment entries", "error");
    return;
  }
  const isPay = entry.entry_type === "payment";
  const label = isPay ? "payment" : "receipt";
  const restore = isPay ? "supplier payable" : "customer due";
  if (!window.confirm(`Delete ${entry.entry_no}? This ${label} will be removed and the ${restore} restored.`)) return;
  const path = isPay ? `/api/accounts/payments/${entry.id}` : `/api/accounts/receipts/${entry.id}`;
  setHint("Deleting…");
  await api(path, { method: "DELETE" });
  $("modal").hidden = true;
  await loadBootstrap();
  fillDueCustomerSelect();
  renderCustomersTable();
  try {
    await loadAccounts();
  } catch {
    /* optional */
  }
  try {
    await loadSuppliers();
  } catch {
    /* optional */
  }
  setHint(`Deleted ${entry.entry_no}`, "ok");
}

function showAlterVoucherModal(entry) {
  if (!entry?.id) return;
  const isPayment = entry.entry_type === "payment";
  const label = isPayment ? "Payment" : "Receipt";
  const max = voucherMaxAmount(entry);
  $("modal-title").textContent = `Alter ${label.toLowerCase()} · ${entry.entry_no}`;
  $("modal-body").innerHTML = `<form class="settings" id="alter-voucher-form">
    <p class="section-note">Correct a wrong amount or method. The customer due / supplier payable is updated. Reprint after save.</p>
    <label>Amount <input id="alter-amount" type="number" min="0.01" step="0.01"${max > 0 ? ` max="${max}"` : ""} required value="${Number(entry.amount) || ""}" /></label>
    <label>Method <select id="alter-method">${voucherMethodOptions(entry.payment_method)}</select></label>
    <label>Notes <input id="alter-notes" maxlength="200" value="${escapeHtml(entry.notes || "")}" /></label>
    <button class="btn primary" type="submit">Save changes</button>
    <button class="btn" type="button" id="alter-cancel">Cancel</button>
  </form><p class="hint" id="alter-hint"></p>`;
  $("modal").hidden = false;
  $("alter-cancel").onclick = () => {
    $("modal").hidden = true;
  };
  $("alter-voucher-form").onsubmit = async (e) => {
    e.preventDefault();
    const hint = $("alter-hint");
    try {
      if (hint) {
        hint.textContent = "Saving…";
        hint.className = "hint";
      }
      const isPay = entry.entry_type === "payment";
      const path = isPay ? `/api/accounts/payments/${entry.id}` : `/api/accounts/receipts/${entry.id}`;
      const notes = $("alter-notes").value;
      const method = $("alter-method").value;
      const data = await api(path, {
        method: "PUT",
        body: JSON.stringify({
          amount: Number($("alter-amount").value),
          payment_method: method,
          notes,
        }),
      });
      await loadBootstrap();
      fillDueCustomerSelect();
      renderCustomersTable();
      try {
        await loadAccounts();
      } catch {
        /* optional */
      }
      try {
        await loadSuppliers();
      } catch {
        /* optional */
      }
      showVoucherResult({
        ...entry,
        id: data.ledgerId || entry.id,
        amount: data.amount,
        payment_method: data.method || method,
        notes: data.notes != null ? data.notes : notes,
        previous_due: data.previous_due,
        balance_due: data.balance_due,
        party_name:
          data.customer?.business_name || data.customer?.name || data.supplier?.name || entry.party_name,
      });
    } catch (err) {
      if (hint) {
        hint.textContent = err.message;
        hint.className = "hint error";
      }
    }
  };
}

function showOrder(o) {
  selectedOrderId = o.id;
  lastInvoice = o;
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
          <p class="hint">${escapeHtml(orderCustomerName(o))}</p>
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
      ${invoiceShareButtons(o)}
      <button class="btn${look === "pos" ? " primary" : ""}" type="button" data-print="${escapeHtml(o.id)}" data-print-look="pos">Print POS slip</button>
      <button class="btn${look === "office" ? " primary" : ""}" type="button" data-print="${escapeHtml(o.id)}" data-print-look="office">Print official bill</button>
      <button class="btn${look === "duplicate" ? " primary" : ""}" type="button" data-print="${escapeHtml(o.id)}" data-print-look="duplicate">Print duplicate</button>
      <button class="btn" type="button" data-edit-order="${escapeHtml(o.id)}"${cancelled ? " disabled title=\"Restore order status before editing items\"" : ""}>Change items</button>
      ${canDeleteInvoice() ? `<button class="btn danger" type="button" data-delete-order="${escapeHtml(o.id)}">Delete invoice</button>` : ""}
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
        <td>${escapeHtml(orderCustomerName(o))}</td>
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

let qrOrderCache = [];
let qrSeenOrderIds = null;
let qrPollTimer = null;
let qrToastTimer = 0;
let qrToastOrderId = "";
let qrOrderStatus = "";

function shopBusinessId() {
  return state.businessMeta?.id || state.company?.business_id || state.session?.business_id || "";
}

function qrTableKey(tableId) {
  const R = restaurantApi();
  const t = R?.tableQrKey?.(tableId) || R?.normalizeTableNo?.(tableId) || String(tableId || "").trim();
  if (!t || t === "Parcel") return "";
  return t;
}

function qrMenuUrl(tableId) {
  const shop = shopBusinessId();
  let url = `${location.origin}/order.html?shop=${encodeURIComponent(shop)}`;
  const t = qrTableKey(tableId);
  if (t) url += `&table=${encodeURIComponent(t)}`;
  return url;
}

function qrPosterUrl(tableId) {
  const shop = shopBusinessId();
  let url = `${location.origin}/qr.html?shop=${encodeURIComponent(shop)}`;
  const t = qrTableKey(tableId);
  if (t) url += `&table=${encodeURIComponent(t)}`;
  return url;
}

function qrTableLabel(tableId) {
  const key = qrTableKey(tableId);
  if (!key) return "";
  const row = diningTables().find((t) => t.id === key);
  const R = restaurantApi();
  return row?.name || R?.displayTable?.(key) || key;
}

function qrPosterKicker(tableLabel) {
  if (tableLabel) return "Scan to order from this table";
  if (isRestaurantShop()) return "Counter / pickup · scan to order";
  return "Scan to order spices";
}

function qrCodeDataUrl(url, size) {
  const px = Number(size) || 280;
  const remote = `https://api.qrserver.com/v1/create-qr-code/?size=${px}x${px}&margin=8&data=${encodeURIComponent(url)}`;
  if (typeof QRCodeLib !== "undefined" && typeof QRCodeLib.toDataURL === "function") {
    return QRCodeLib.toDataURL(url, { width: px, margin: 1, errorCorrectionLevel: "M" }).catch(() => remote);
  }
  return Promise.resolve(remote);
}

function rxUploadUrl() {
  const shop = shopBusinessId();
  return `${location.origin}/rx.html?shop=${encodeURIComponent(shop)}`;
}

function paintRxQrSetup() {
  const url = rxUploadUrl();
  const shopId = shopBusinessId();
  const input = $("rx-menu-link");
  const open = $("rx-open-page");
  const code = $("rx-menu-code");
  const idEl = $("rx-shop-id");
  if (idEl) idEl.textContent = shopId || "—";
  if (input) input.value = url;
  if (open) open.href = url;
  if (!code) return;
  const remote = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(url)}`;
  if (typeof QRCodeLib !== "undefined" && typeof QRCodeLib.toDataURL === "function") {
    QRCodeLib.toDataURL(url, { width: 220, margin: 1, errorCorrectionLevel: "M" })
      .then((dataUrl) => {
        code.src = dataUrl;
      })
      .catch(() => {
        code.src = remote;
      });
    return;
  }
  code.src = remote;
}

function printRxPoster() {
  const url = $("rx-menu-link")?.value || rxUploadUrl();
  const src = $("rx-menu-code")?.src || "";
  const w = window.open("", "rx-poster", "width=640,height=860");
  if (!w) {
    setHint("Allow pop-ups to print the QR code", "error");
    return;
  }
  const name = escapeHtml(state.company?.name || "Pharmacy");
  w.document.write(`<!doctype html><html><head><title>Prescription QR</title>
    <style>
      body { font-family: Georgia, serif; text-align: center; color: #0f172a; padding: 32px; }
      h1 { margin: 0 0 8px; }
      p { color: #475569; word-break: break-all; }
      img { width: 280px; height: 280px; background: #fff; padding: 12px; }
      .kicker { letter-spacing: .12em; font-size: 12px; font-weight: 800; color: #0f766e; }
    </style></head><body>
    <p class="kicker">PHARMACY → QR CODE → CUSTOMER PRESCRIPTION UPLOAD</p>
    <h1>${name}</h1>
    ${src ? `<img src="${escapeHtml(src)}" alt="Prescription QR" />` : ""}
    <p>${escapeHtml(url)}</p>
    <script>window.onload=function(){window.focus();window.print();};<\/script>
    </body></html>`);
  w.document.close();
}

const RX_STATUS_LABELS = {
  pending: "Pending",
  under_review: "Under Review",
  approved: "Approved",
  order_created: "Order Created",
  completed: "Dispensed",
};
const RX_NEXT = {
  pending: "under_review",
  under_review: "approved",
  approved: "order_created",
  order_created: "completed",
};
const RX_NEXT_LABEL = {
  pending: "Under Review",
  under_review: "Approve",
  approved: "Order Created",
  order_created: "Dispensed",
};

let rxCache = [];
let rxStatusFilter = "";
let rxPollTimer = null;

function paintRxBadge() {
  const n = rxCache.filter((row) => String(row.status || "pending") === "pending").length;
  const badge = $("rx-badge");
  if (badge) {
    badge.textContent = String(n);
    badge.hidden = n === 0;
  }
}

function renderPrescriptions() {
  const body = $("rx-table-body");
  if (!body) return;
  const query = String($("rx-search")?.value || "").trim().toLowerCase();
  const rows = rxCache.filter((row) => {
    if (rxStatusFilter && row.status !== rxStatusFilter) return false;
    const hay = [row.prescription_number, row.customer_name, row.mobile, row.customer_address, row.doctor_name, row.clinic_name, row.notes].join(" ").toLowerCase();
    return !query || hay.includes(query);
  });
  paintRxBadge();
  body.innerHTML = rows.length
    ? rows
        .map((row) => {
          const next = RX_NEXT[row.status] || "";
          const nextLab = RX_NEXT_LABEL[row.status] || "";
          const when = row.created_at ? formatShopDateTime(row.created_at) : "—";
          const doctor = [row.doctor_name, row.clinic_name].filter(Boolean).join(" · ");
          const name = escapeHtml(row.customer_name || "Customer");
          const mobile = escapeHtml(row.mobile || "—");
          const address = escapeHtml(row.customer_address || "—");
          const doctorHtml = escapeHtml(doctor || "—");
          return `<tr data-rx="${escapeHtml(row.id)}">
            <td><strong>${escapeHtml(row.prescription_number || "—")}</strong></td>
            <td>
              <strong>${name}</strong>
              <div class="rx-cust-line">Mobile: ${mobile}</div>
              <div class="rx-cust-line">Address: ${address}</div>
              <div class="rx-cust-line">Doctor: ${doctorHtml}</div>
            </td>
            <td class="rx-detail">${mobile}</td>
            <td class="rx-detail">${address}</td>
            <td class="rx-detail">${doctorHtml}</td>
            <td>${row.has_file ? `<button class="btn" type="button" data-rx-file="${escapeHtml(row.id)}">View</button>` : "—"}</td>
            <td>${escapeHtml(when)}</td>
            <td><span class="rx-status is-${escapeHtml(row.status || "pending")}">${escapeHtml(row.status_label || RX_STATUS_LABELS[row.status] || "Pending")}</span></td>
            <td class="rx-actions">
              ${next ? `<button class="btn primary" type="button" data-rx-status="${escapeHtml(next)}">${escapeHtml(nextLab)}</button>` : ""}
              ${row.status === "approved" || row.status === "order_created" ? `<button class="btn" type="button" data-rx-counter="${escapeHtml(row.id)}">Open in Counter</button>` : ""}
            </td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="9"><p class="item-empty-card"><strong>No prescriptions here</strong><span>Customers scan this pharmacy QR and upload a photo or PDF. New files appear in this list.</span></p></td></tr>`;
}

async function loadPrescriptions() {
  if (!isPharmacyShop() || !can("orders")) return;
  paintRxQrSetup();
  const hint = $("rx-hint");
  if (hint) hint.textContent = "Checking prescriptions…";
  try {
    const rows = await api("/api/prescriptions");
    rxCache = Array.isArray(rows) ? rows : [];
    renderPrescriptions();
    if (hint) hint.textContent = rxCache.length ? `${rxCache.length} prescription${rxCache.length === 1 ? "" : "s"}` : "";
  } catch (err) {
    if (hint) {
      hint.textContent = err.message;
      hint.className = "hint error";
    }
  }
}

function startRxWatch() {
  if (rxPollTimer || !isPharmacyShop() || !can("orders")) return;
  const kick = () => void loadPrescriptions();
  if (typeof requestIdleCallback === "function") requestIdleCallback(kick, { timeout: 2500 });
  else setTimeout(kick, 1200);
  rxPollTimer = setInterval(() => {
    if (state.currentView === "prescriptions") void loadPrescriptions();
    else {
      api("/api/prescriptions")
        .then((rows) => {
          rxCache = Array.isArray(rows) ? rows : [];
          paintRxBadge();
        })
        .catch(() => {});
    }
  }, 8000);
}

async function setPrescriptionStatus(row, status) {
  const data = await api(`/api/prescriptions/${encodeURIComponent(row.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  const updated = data.prescription || { ...row, status };
  const idx = rxCache.findIndex((item) => item.id === row.id);
  if (idx >= 0) rxCache[idx] = { ...rxCache[idx], ...updated };
  renderPrescriptions();
}

function openPrescriptionInCounter(row) {
  if ($("bill-cust-name")) $("bill-cust-name").value = row.customer_name || "";
  if ($("bill-cust-mobile")) $("bill-cust-mobile").value = row.mobile || "";
  const parsedRx = parseClassicAddress(row.customer_address);
  if ($("bill-cust-address")) $("bill-cust-address").value = parsedRx.address || row.customer_address || "";
  if ($("bill-cust-area")) $("bill-cust-area").value = parsedRx.area;
  if ($("bill-cust-city")) $("bill-cust-city").value = parsedRx.city;
  if ($("bill-cust-pin")) $("bill-cust-pin").value = parsedRx.pin;
  if ($("counter-mobile")) $("counter-mobile").value = row.mobile || "";
  applyCounterMobile?.(row.mobile || "", { announceMiss: false });
  paintClassicCustomerStatus();
  if ($("bill-doctor-rx")) {
    const doctorBits = [row.doctor_name, row.clinic_name, row.prescription_number].filter(Boolean);
    $("bill-doctor-rx").value = doctorBits.join(" / ");
  }
  setHint(`Prescription ${row.prescription_number} loaded. Review the file, then bill.`, "ok");
  showView("counter");
  if (row.status === "approved") {
    setPrescriptionStatus(row, "order_created").catch(() => {});
  }
}

function paintQrMenuSetup() {
  const url = qrMenuUrl();
  const poster = qrPosterUrl();
  const shopId = shopBusinessId();
  const input = $("qr-menu-link");
  const open = $("qr-open-menu");
  const posterLink = $("qr-poster-page");
  const code = $("qr-menu-code");
  const idEl = $("qr-shop-id");
  const shopCopy = $("qr-shop-copy");
  if (idEl) idEl.textContent = shopId || "—";
  if (input) input.value = url;
  if (open) open.href = url;
  if (posterLink) posterLink.href = poster;
  if (shopCopy) {
    shopCopy.textContent = isRestaurantShop()
      ? "Use this shop QR at the counter for pickup. For dine-in, print a unique QR for each table below and stick it on that table."
      : "Place it at the counter, table, or storefront. The link opens a public mobile menu—no customer login required.";
  }
  paintQrTableCodes();
  if (!code) return;
  qrCodeDataUrl(url, 220).then((dataUrl) => {
    code.src = dataUrl;
  });
}

function paintQrTableCodes() {
  const wrap = $("qr-table-codes");
  const grid = $("qr-table-grid");
  if (!wrap || !grid) return;
  const restaurant = isRestaurantShop();
  wrap.hidden = !restaurant;
  if (!restaurant) {
    grid.innerHTML = "";
    return;
  }
  const tables = diningTables();
  if (!tables.length) {
    grid.innerHTML = `<p class="qr-table-empty">Add tables on Counter first. Each table then gets its own QR to place on that table.</p>`;
    return;
  }
  const { floors } = diningLayout();
  const R = restaurantApi();
  grid.innerHTML = tables
    .map((t) => {
      const url = qrMenuUrl(t.id);
      const label = escapeHtml(t.name || R?.displayTable?.(t.id) || t.id);
      const floor = floors.length > 1 ? escapeHtml(R?.displayFloor?.(t.floor, floors) || "") : "";
      return `<article class="qr-table-card" data-table-id="${escapeHtml(t.id)}">
        <img alt="QR for ${label}" />
        <strong>${label}</strong>
        ${floor ? `<span>${floor}</span>` : ""}
        <div class="qr-table-card-actions">
          <button class="btn" type="button" data-qr-copy-table="${escapeHtml(t.id)}">Copy link</button>
          <button class="btn" type="button" data-qr-print-table="${escapeHtml(t.id)}">Print</button>
          <a class="btn" href="${escapeHtml(url)}" target="_blank" rel="noopener">Open</a>
        </div>
      </article>`;
    })
    .join("");
  tables.forEach((t) => {
    const card = [...grid.querySelectorAll("[data-table-id]")].find((el) => el.dataset.tableId === t.id);
    const img = card?.querySelector("img");
    if (!img) return;
    qrCodeDataUrl(qrMenuUrl(t.id), 180).then((src) => {
      img.src = src;
    });
  });
}

function qrTableStickerHtml(row) {
  const logo = state.company?.logo_url
    ? `<img class="logo" src="${escapeHtml(state.company.logo_url)}" alt="">`
    : "";
  return `<article class="sticker">
    ${logo}
    <p class="kicker">${escapeHtml(qrPosterKicker(row.label))}</p>
    <h1>${escapeHtml(shopPrintName())}</h1>
    ${row.label ? `<h2>${escapeHtml(row.label)}</h2>` : ""}
    <img class="qr" src="${escapeHtml(row.src)}" alt="${escapeHtml(row.label || "QR")}">
    <p class="hint">Place this code on ${escapeHtml(row.label || "the counter")}. Orders go to the kitchen with this table.</p>
  </article>`;
}

async function printQrTableStickers(tableIds) {
  const ids = (tableIds || []).map((id) => qrTableKey(id)).filter(Boolean);
  const list = ids.length ? ids : diningTables().map((t) => t.id);
  if (!list.length) {
    setHint("Create dining tables on Counter, then print a QR for each table.", "error");
    return;
  }
  const rows = [];
  for (const id of list) {
    const url = qrMenuUrl(id);
    rows.push({
      id,
      label: qrTableLabel(id),
      url,
      src: await qrCodeDataUrl(url, 280),
    });
  }
  const w = window.open("", "qr-table-stickers", "width=900,height=1100");
  if (!w) {
    setHint("Allow pop-ups to print table QR codes", "error");
    return;
  }
  w.document.write(`<!DOCTYPE html><html><head><title>Table QR codes</title>
    <style>
      body { font-family: Georgia, serif; color: #4a1416; margin: 0; background: #fff; }
      .sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 16px; }
      .sticker { break-inside: avoid; page-break-inside: avoid; text-align: center; border: 1px dashed #d6c4b0; padding: 18px 12px 22px; }
      h1 { margin: 0 0 4px; font-size: 22px; }
      h2 { margin: 0 0 10px; font-size: 28px; letter-spacing: -.03em; }
      .kicker { letter-spacing: .12em; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #0f766e; margin: 0 0 6px; }
      img.qr { width: 220px; height: 220px; background: #fff; padding: 8px; }
      img.logo { max-height: 52px; max-width: 140px; display: block; margin: 0 auto 8px; }
      .hint { color: #7a5c48; font-size: 13px; margin: 8px 12px 0; }
      @media print { .sheet { grid-template-columns: 1fr 1fr; } }
      @media (max-width: 700px) { .sheet { grid-template-columns: 1fr; } }
    </style></head><body>
    <div class="sheet">${rows.map(qrTableStickerHtml).join("")}</div>
    <script>window.onload=()=>{window.focus();window.print();}</script>
    </body></html>`);
  w.document.close();
}

function qrOrderQty(line) {
  return fmtQty(Number(line.quantity_gm) || 0, { base_unit: line.unit || "PCS" });
}

function qrOrderAsInvoice(qr, invoice) {
  if (invoice?.id || invoice?.order_number) return invoice;
  const found = qr?.sales_order_id && orderCache.find((row) => row.id === qr.sales_order_id);
  if (found) return found;
  return {
    order_number: qr.invoice_number || qr.order_number,
    customer_name: qr.customer_name,
    customer_id: qr.customer_id,
    notes: qr.notes,
    table_no: qr.table_no || invoice?.table_no || "",
    lines: qr.lines || [],
    subtotal: Number(qr.subtotal) + Number(qr.discount || 0),
    gst: qr.gst,
    total: qr.total,
    discount: qr.discount,
    offer_label: qr.offer_label,
    payment_method: qr.payment_method || "cash",
    payment_status: qr.sales_order_id ? "paid" : "unpaid",
    created_at: qr.created_at,
  };
}

function printQrOrder(qr, invoice) {
  if (!qr && !invoice) return;
  const bill = qrOrderAsInvoice(qr || {}, invoice);
  showInvoicePrintModal(bill, {
    title: `Invoice ${bill.order_number || qr?.order_number || ""}`,
    message: invoice?.order_number || qr?.sales_order_id
      ? `Invoice ${bill.order_number || ""} saved.`
      : "Print this QR order like a Counter bill.",
  });
  printOrder(bill, "pos");
}

function printQrPoster(tableId) {
  const key = qrTableKey(tableId);
  const url = key ? qrMenuUrl(key) : $("qr-menu-link")?.value || qrMenuUrl();
  const label = key ? qrTableLabel(key) : "";
  const w = window.open("", "qr-poster", "width=640,height=860");
  if (!w) {
    setHint("Allow pop-ups to print the QR code", "error");
    return;
  }
  qrCodeDataUrl(url, 280).then((src) => {
    const logo = state.company?.logo_url
      ? `<img src="${escapeHtml(state.company.logo_url)}" alt="" style="max-height:72px;max-width:180px;display:block;margin:0 auto 12px">`
      : "";
    w.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(label || "QR order poster")}</title>
      <style>body{font-family:Georgia,serif;text-align:center;padding:36px;color:#4a1416} img.qr{width:280px;height:280px;background:#fff;padding:12px} p{color:#7a5c48} h2{margin:8px 0 16px;font-size:32px}</style>
      </head><body>
      ${logo}
      <p>${escapeHtml(qrPosterKicker(label))}</p>
      <h1>${escapeHtml(shopPrintName())}</h1>
      ${label ? `<h2>${escapeHtml(label)}</h2>` : ""}
      <img class="qr" src="${escapeHtml(src)}" alt="QR">
      <p>${escapeHtml(url)}</p>
      <script>window.onload=()=>{window.print();}</script>
      </body></html>`);
    w.document.close();
  });
}

function paintQrOrderBadge() {
  const pending = qrOrderCache.filter((order) => order.status === "pending").length;
  const badge = $("qr-order-badge");
  if (badge) {
    badge.textContent = String(pending);
    badge.hidden = pending === 0;
  }
}

function paintQrSoundToggle() {
  const btn = $("qr-sound-toggle");
  if (!btn) return;
  const on = globalThis.POSQrNotify?.soundOn() !== false;
  btn.textContent = on ? "Sound on" : "Sound off";
  btn.setAttribute("aria-pressed", on ? "true" : "false");
}

function paintQrSoundArm() {
  const arm = $("qr-sound-arm");
  if (!arm) return;
  const cafe = isRestaurantShop() && (can("kot") || can("counter"));
  const qr = can("orders") && !isPharmacyShop();
  arm.hidden = globalThis.POSQrNotify?.needsUnlock?.() !== true || (!cafe && !qr);
  const kicker = arm.querySelector(".qr-toast-kicker");
  const strong = arm.querySelector("strong");
  const note = arm.querySelector("p:not(.qr-toast-kicker)");
  if (cafe && qr) {
    if (kicker) kicker.textContent = "KOT & QR SOUND";
    if (strong) strong.textContent = "Tap to hear new tickets";
    if (note) note.textContent = "Tap once and listen. New kitchen KOTs and QR orders ding on this till. If you do not hear a ding, tap again with the speaker on.";
  } else if (cafe) {
    if (kicker) kicker.textContent = "KITCHEN KOT SOUND";
    if (strong) strong.textContent = "Tap to hear new tickets";
    if (note) note.textContent = "Tap once and listen. New KOTs ding on this till. If you do not hear a ding, tap again with the speaker on.";
  }
}

function armQrOrderSound() {
  globalThis.POSQrNotify?.setSoundOn?.(true);
  const played = globalThis.POSQrNotify?.playTone?.({ force: true });
  globalThis.POSQrNotify?.askNotifyPermission?.();
  paintQrSoundToggle();
  paintKotSoundToggle();
  paintQrSoundArm();
  return played !== false;
}

function hideQrOrderToast() {
  const toast = $("qr-order-toast");
  if (toast) toast.hidden = true;
  qrToastOrderId = "";
  if (qrToastTimer) clearTimeout(qrToastTimer);
  qrToastTimer = 0;
}

function showQrOrderToast(order, extra = 0) {
  const toast = $("qr-order-toast");
  if (!toast || !order) return;
  qrToastOrderId = order.id || "";
  const title = $("qr-toast-title");
  const copy = $("qr-toast-copy");
  if (title) title.textContent = extra > 0 ? `${extra + 1} new QR orders` : "New QR order";
  if (copy) copy.textContent = `${globalThis.POSQrNotify?.toastCopy?.(order, extra) || order.order_number} · ${money(order.total)}`;
  toast.hidden = false;
  if (qrToastTimer) clearTimeout(qrToastTimer);
  qrToastTimer = setTimeout(hideQrOrderToast, 14000);
}

function applyQrOrderSnapshot(rows, { announce = false } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const incoming = globalThis.POSQrNotify?.newPending?.(qrSeenOrderIds, list) || [];
  qrOrderCache = list;
  if (qrSeenOrderIds == null) qrSeenOrderIds = new Set(list.map((order) => String(order.id)).filter(Boolean));
  else list.forEach((order) => {
    if (order?.id) qrSeenOrderIds.add(String(order.id));
  });
  paintQrOrderBadge();
  const page = $("view-qr-orders");
  if (page && !page.hidden) renderQrOrders();
  if (!announce || !incoming.length) return incoming;
  incoming.forEach((order) => qrSeenOrderIds.add(String(order.id)));
  globalThis.POSQrNotify?.playTone?.({ force: true });
  setTimeout(() => globalThis.POSQrNotify?.playTone?.({ force: true }), 450);
  globalThis.POSQrNotify?.desktopNotify?.(incoming[0], incoming.length - 1);
  showQrOrderToast(incoming[0], incoming.length - 1);
  paintQrSoundArm();
  return incoming;
}

async function pollQrOrders({ announce = true } = {}) {
  if (!can("orders") || isPharmacyShop()) return;
  try {
    const rows = await api("/api/qr-orders");
    applyQrOrderSnapshot(rows, { announce });
  } catch {
    /* keep last list */
  }
}

function startQrOrderWatch() {
  if (qrPollTimer || !can("orders") || isPharmacyShop()) return;
  paintQrSoundToggle();
  const kick = () => void pollQrOrders({ announce: false });
  if (typeof requestIdleCallback === "function") requestIdleCallback(kick, { timeout: 2500 });
  else setTimeout(kick, 1200);
  qrPollTimer = setInterval(() => void pollQrOrders({ announce: true }), 4000);
  paintQrSoundArm();
  document.addEventListener("pos-qr-sound", () => {
    paintQrSoundToggle();
    paintQrSoundArm();
  });
}

function qrOrderTotalsHtml(order) {
  const save = Math.round((Number(order.discount) || 0) * 100) / 100;
  const items = Math.round(((Number(order.subtotal) || 0) + save) * 100) / 100;
  const label = String(order.offer_label || "Offer").trim();
  const disc = save > 0 || order.offer_label
    ? `<div class="qr-order-total"><span>Items</span><strong>${money(items)}</strong></div>
        <div class="qr-order-total qr-order-discount"><span>Discount${label ? ` · ${escapeHtml(label)}` : ""}</span><strong>−${money(save)}</strong></div>`
    : "";
  return `${disc}<div class="qr-order-total"><span>Total incl. GST</span><strong>${money(order.total)}</strong></div>`;
}

function renderQrOrders() {
  const query = String($("qr-order-search")?.value || "").trim().toLowerCase();
  const rows = qrOrderCache.filter((order) => {
    if (qrOrderStatus && order.status !== qrOrderStatus) return false;
        const hay = [
          order.order_number,
          order.customer_name,
          order.mobile,
          order.table_no,
          order.notes,
          ...(order.lines || []).map((line) => line.notes || line.item_name),
        ].join(" ").toLowerCase();
    return !query || hay.includes(query);
  });
  paintQrOrderBadge();
  $("qr-order-list").innerHTML = rows.length
    ? rows.map((order) => `<article class="qr-order-card${order.status === "pending" ? " is-pending" : ""}" data-qr-order="${escapeHtml(order.id)}">
        <header class="qr-order-head">
          <div><h3>${escapeHtml(order.order_number)}</h3><p class="qr-order-meta">${escapeHtml(formatShopDateTime(order.created_at))}</p></div>
          <span class="qr-order-status">${escapeHtml(order.status)}</span>
        </header>
        <p class="qr-order-meta"><strong>${escapeHtml(order.customer_name)}</strong> · ${escapeHtml(order.mobile)}${order.table_no ? ` · ${escapeHtml(order.table_no)}` : ""}</p>
        <div class="qr-order-lines">${(order.lines || []).map((line) => {
          const si = String(line.notes || "").trim();
          return `<div class="qr-order-line"><span>${escapeHtml(line.item_name)} · ${escapeHtml(qrOrderQty(line))}${si ? `<small class="qr-line-si">${escapeHtml(si)}</small>` : ""}</span><strong>${money(line.amount)}</strong></div>`;
        }).join("")}</div>
        ${qrOrderTotalsHtml(order)}
        ${order.notes ? `<p class="qr-order-note">Note: ${escapeHtml(order.notes)}</p>` : ""}
        <div class="qr-order-actions">
          ${!["completed", "cancelled"].includes(order.status) ? `<button class="btn primary" type="button" data-qr-counter="${escapeHtml(order.id)}">Open in Counter</button>` : ""}
          ${order.status === "pending" ? `<button class="btn" type="button" data-qr-status-next="accepted">Accept</button>` : ""}
          ${isRestaurantShop() && !["completed", "cancelled"].includes(order.status) ? `<button class="btn" type="button" data-qr-kot="${escapeHtml(order.id)}">Kitchen KOT</button>` : ""}
          ${order.status === "accepted" ? `<button class="btn" type="button" data-qr-status-next="preparing">Preparing</button>` : ""}
          ${order.status === "preparing" ? `<button class="btn" type="button" data-qr-status-next="ready">Ready</button>` : ""}
          ${order.status === "ready" ? `<button class="btn" type="button" data-qr-status-next="completed">Complete</button>` : ""}
          ${order.status === "completed" && !order.sales_order_id ? `<button class="btn primary" type="button" data-qr-status-next="completed">Save invoice</button>` : ""}
          <button class="btn" type="button" data-qr-print="${escapeHtml(order.id)}">Print</button>
          ${order.sales_order_id ? `<button class="btn" type="button" data-qr-invoice="${escapeHtml(order.sales_order_id)}">View invoice${order.invoice_number ? ` ${escapeHtml(order.invoice_number)}` : ""}</button>` : ""}
          ${!["completed", "cancelled"].includes(order.status) ? `<button class="btn danger" type="button" data-qr-status-next="cancelled">Cancel</button>` : ""}
        </div>
      </article>`).join("")
    : '<p class="item-empty-card"><strong>No QR orders here</strong><span>New customer orders ding and appear here after they scan your code.</span></p>';
}

async function loadQrOrders() {
  if (isPharmacyShop()) return;
  paintQrMenuSetup();
  paintQrSoundToggle();
  const hint = $("qr-orders-hint");
  if (hint) hint.textContent = "Checking for orders…";
  try {
    const rows = await api("/api/qr-orders");
    applyQrOrderSnapshot(rows, { announce: qrSeenOrderIds != null });
    renderQrOrders();
    if (hint) hint.textContent = qrOrderCache.length ? `${qrOrderCache.length} QR order${qrOrderCache.length === 1 ? "" : "s"}` : "";
  } catch (err) {
    if (hint) {
      hint.textContent = err.message;
      hint.className = "hint error";
    }
  }
}

async function updateQrOrder(order, status) {
  const data = await api(`/api/qr-orders/${encodeURIComponent(order.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  const index = qrOrderCache.findIndex((row) => row.id === order.id);
  if (index >= 0 && data.order) qrOrderCache[index] = data.order;
  renderQrOrders();
  if (status === "accepted" && isRestaurantShop()) {
    try {
      printQrKitchenKot(data.order || order);
    } catch (err) {
      setHint(err.message, "error");
    }
  }
  if (status === "completed") {
    if (data.invoice?.id && !orderCache.some((row) => row.id === data.invoice.id)) {
      orderCache.unshift(data.invoice);
    }
    const hint = $("qr-orders-hint");
    if (hint) {
      hint.textContent = data.invoice?.order_number
        ? `Invoice ${data.invoice.order_number} saved.`
        : "Printing Counter bill.";
      hint.className = "hint ok";
    }
    printQrOrder(data.order || order, data.invoice);
  }
  return data.order || order;
}

async function openInvoiceFromQr(invoice) {
  if (!invoice?.id) return;
  showView("orders");
  try {
    await loadOrders();
  } catch {
    /* still show the invoice we just saved */
  }
  if (!orderCache.some((row) => row.id === invoice.id)) orderCache.unshift(invoice);
  selectedOrderId = invoice.id;
  renderOrdersList();
  showOrder(invoice);
}

async function openQrOrderInCounter(order) {
  const liveLines = (order.lines || []).filter((line) => state.items.some((item) => item.id === line.item_id));
  if (!liveLines.length) throw new Error("This order has no available catalog items");
  if (state.cart.length && !confirm("Replace the current Counter bill with this QR order?")) return;
  if (order.status === "pending") order = await updateQrOrder(order, "accepted");
  state.activeQrOrderId = order.id;
  const R = restaurantApi();
  if (isRestaurantShop() && R) {
    state.activeTable = R.normalizeTableNo(order.table_no) || R.PARCEL;
    syncActiveFloor(state.activeTable);
  }
  state.cart = liveLines.map((line) => ({
    lineId: newCartLineId(),
    itemId: line.item_id,
    qtyGm: Number(line.quantity_gm),
    notes: String(line.notes || "").trim(),
  }));
  const known = state.customers.find((customer) => digitsMobile(customer.mobile) === digitsMobile(order.mobile));
  const walkIn = state.customers.find((customer) => customer.code === "CUS-001") || state.customers[0];
  state.customerId = known?.id || walkIn?.id || "";
  renderCustomersSelect();
  renderCatalog();
  renderCart();
  setHint(`QR order ${order.order_number} loaded. Check payment and tap Pay.`, "ok");
  showView("counter");
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

function fillAccPartySelect(selectId, parties, labelFn) {
  const el = $(selectId);
  if (!el) return "";
  const list = parties || [];
  const cur = el.value;
  el.innerHTML = `<option value="">Select…</option>${list
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(labelFn(p))}</option>`)
    .join("")}`;
  if (cur && list.some((p) => p.id === cur)) el.value = cur;
  else if (list.length === 1) el.value = list[0].id;
  return el.value;
}

function accPartyLabel(party, kind) {
  if (!party) return "—";
  const name = kind === "customer" ? party.business_name || party.name : party.name;
  const due = kind === "customer" ? Number(party.outstanding) || 0 : Number(party.payable_balance) || 0;
  return due ? `${name} · ${money(due)}` : name;
}

function renderPartyLedgerTable(targetId, data, kind) {
  const el = $(targetId);
  if (!el) return;
  const party = data?.party;
  const rows = data?.rows || [];
  const due = kind === "customer" ? Number(party?.outstanding) || 0 : Number(party?.payable_balance) || 0;
  const action = kind === "customer" && due > 0 && party?.id
    ? `<button class="btn primary" type="button" data-rcp="${escapeHtml(party.id)}">Receipt</button>`
    : kind === "supplier" && due > 0 && party?.id
      ? `<button class="btn primary" type="button" data-pay="${escapeHtml(party.id)}">Payment</button>`
      : "";
  const head = `<div class="report-grid">
    <div class="report-card"><span>Opening</span><strong>${money(data?.opening || 0)}</strong></div>
    <div class="report-card"><span>Closing</span><strong>${money(data?.closing || 0)}</strong></div>
    <div class="report-card"><span>${kind === "customer" ? "Outstanding" : "Payable"}</span><strong>${money(due)}</strong></div>
  </div>${action ? `<p class="hint">${action}</p>` : ""}`;
  if (!rows.length) {
    el.innerHTML = `${head}<p class="hint">No ${kind} ledger entries in this period.</p>`;
    return;
  }
  el.innerHTML = `${head}<table><thead><tr>
    <th>Date</th><th>Entry</th><th>Type</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Method</th><th>Notes</th><th></th>
  </tr></thead><tbody>${rows
    .map((r, i) => {
      const printable = r.entry_type === "receipt" || r.entry_type === "payment";
      return `<tr>
      <td>${escapeHtml(formatShopDateTime(r.created_at))}</td>
      <td>${escapeHtml(r.entry_no)}</td>
      <td>${escapeHtml(r.entry_type)}</td>
      <td>${r.debit ? money(r.debit) : "—"}</td>
      <td>${r.credit ? money(r.credit) : "—"}</td>
      <td>${money(r.balance)}</td>
      <td>${escapeHtml(r.payment_method || "—")}</td>
      <td>${escapeHtml(r.notes || "—")}</td>
      <td>${printable ? voucherRowActions(i) : ""}</td>
    </tr>`;
    })
    .join("")}</tbody></table>`;
}

async function loadPartyLedgerTab(kind) {
  const selectId = kind === "customer" ? "acc-customer" : "acc-supplier";
  const tableId = kind === "customer" ? "acc-customer-ledger-table" : "acc-supplier-ledger-table";
  if (kind === "supplier" && !state.suppliers?.length) await loadSuppliers();
  const parties = kind === "customer" ? state.customers || [] : state.suppliers || [];
  const partyId = fillAccPartySelect(selectId, parties, (p) => accPartyLabel(p, kind));
  if (!partyId) {
    $(tableId).innerHTML = `<p class="hint">Select a ${kind} to see the ledger.</p>`;
    state.ledgerRows = [];
    return;
  }
  const { from, to } = accPeriod();
  const data = await api(
    `/api/accounts/party-ledger?party_type=${encodeURIComponent(kind)}&party_id=${encodeURIComponent(partyId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  state.ledgerRows = data.rows || [];
  renderPartyLedgerTable(tableId, data, kind);
}

async function loadAccountsTab(name) {
  const { from, to, asOf } = accPeriod();
  if (name === "customer-ledger") {
    await loadPartyLedgerTab("customer");
    return;
  }
  if (name === "supplier-ledger") {
    await loadPartyLedgerTab("supplier");
    return;
  }
  if (name === "ledger") {
    const rows = await api(`/api/accounts/ledger?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    state.ledgerRows = rows;
    $("acc-ledger-table").innerHTML = `<table><thead><tr>
      <th>Entry</th><th>Type</th><th>Party</th><th>Amount</th><th>Method</th><th>Reference</th><th>Notes</th><th>Date</th><th></th>
    </tr></thead><tbody>${rows.map((r, i) => {
      const printable = r.entry_type === "receipt" || r.entry_type === "payment";
      return `<tr>
      <td>${escapeHtml(r.entry_no)}</td><td>${escapeHtml(r.entry_type)}</td><td>${escapeHtml(r.party_name || "—")}</td>
      <td>${money(Number(r.amount) || 0)}</td><td>${escapeHtml(r.payment_method || "—")}</td>
      <td>${escapeHtml(r.reference_type || "—")}</td><td>${escapeHtml(r.notes || "—")}</td>
      <td>${escapeHtml(formatShopDateTime(r.created_at))}</td>
      <td>${printable ? voucherRowActions(i) : ""}</td></tr>`;
    }).join("")}</tbody></table>`;
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
      <th>No.</th><th>Date</th><th>Category</th><th>Amount</th><th>GST</th><th>Total</th><th>Pay</th><th>Notes</th>${canDeletePaymentEntry() ? "<th></th>" : ""}
    </tr></thead><tbody>${rows
      .map((r) => {
        const total = (Number(r.amount) || 0) + (Number(r.gst) || 0);
        const del = canDeletePaymentEntry()
          ? `<td><button class="btn danger" type="button" data-exp-delete="${escapeHtml(r.id)}">Delete</button></td>`
          : "";
        return `<tr>
        <td>${escapeHtml(r.expense_number)}</td>
        <td>${escapeHtml(formatShopDate(r.expense_date))}</td>
        <td>${escapeHtml(r.category)}</td>
        <td>${money(r.amount)}</td>
        <td>${money(r.gst)}</td>
        <td>${money(total)}</td>
        <td>${escapeHtml(paymentMethodLabel(r.payment_method))}</td>
        <td>${escapeHtml(r.notes || "—")}</td>
        ${del}
      </tr>`;
      })
      .join("")}</tbody></table>`;
  } catch (err) {
    el.innerHTML = `<p class="hint error">${escapeHtml(err.message)}</p>`;
  }
}

function showReceiptModal(customer) {
  const due = Number(customer.outstanding) || 0;
  $("modal-title").textContent = `Collect due · ${customer.business_name || customer.name}`;
  $("modal-body").innerHTML = `<form class="settings" id="receipt-modal-form">
    <p class="section-note">Outstanding: <strong>${money(due)}</strong>${customer.mobile ? ` · ${escapeHtml(customer.mobile)}` : ""}</p>
    <label>Amount <input id="rcp-amount" type="number" min="0.01" step="0.01" max="${due}" required value="${due}" /></label>
    <label>Method <select id="rcp-method">${globalThis.POSPay?.optionsHtml?.({ selected: "cash" }) || `<option value="cash">Cash</option><option value="upi">UPI</option>`}</select></label>
    <label>Reference / UPI ID <input id="rcp-ref" maxlength="80" placeholder="Optional" /></label>
    <label>Notes <input id="rcp-notes" placeholder="Optional" /></label>
    <button class="btn primary" type="submit">Collect &amp; print receipt</button>
  </form><div class="hint" id="rcp-hint"></div>`;
  $("modal").hidden = false;
  $("receipt-modal-form").onsubmit = async (e) => {
    e.preventDefault();
    const ref = String($("rcp-ref")?.value || "").trim();
    const note = String($("rcp-notes").value || "").trim();
    const notes = [ref, note].filter(Boolean).join(" · ");
    const method = $("rcp-method").value;
    try {
      await collectCustomerDue(customer, $("rcp-amount").value, method, notes);
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
    <label>Method <select id="pay-acc-method">${globalThis.POSPay?.optionsHtml?.({ selected: "cash" }) || `<option value="cash">Cash</option><option value="upi">UPI</option>`}</select></label>
    <label>Notes <input id="pay-acc-notes" placeholder="Optional" /></label>
    <button class="btn primary" type="submit">Save payment</button>
  </form><div class="hint" id="pay-acc-hint"></div>`;
  $("modal").hidden = false;
  $("payment-modal-form").onsubmit = async (e) => {
    e.preventDefault();
    const notes = $("pay-acc-notes").value;
    const method = $("pay-acc-method").value;
    try {
      const data = await api("/api/accounts/payments", {
        method: "POST",
        body: JSON.stringify({ supplier_id: supplier.id, amount: Number($("pay-acc-amount").value), payment_method: method, notes }),
      });
      await loadAccounts();
      await loadSuppliers();
      showVoucherResult({
        id: data.ledgerId,
        party_id: supplier.id,
        entry_no: data.entryNo,
        entry_type: "payment",
        party_name: data.supplier?.name || supplier.name,
        amount: data.amount,
        payment_method: data.method || method,
        notes,
        created_at: new Date().toISOString(),
      });
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
$("classic-item-hits")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-add]");
  if (!btn) return;
  const item = state.items.find((i) => i.id === btn.dataset.add);
  addItem(btn.dataset.add, classicScanAddQty(item));
  clearCounterQuery($("bill-scan-code"));
  paintClassicItemHits();
  focusScanLane();
});
$("catalog-cats")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-cat]");
  if (!btn) return;
  state.categoryFilter = btn.getAttribute("data-cat") || "";
  renderCatalog();
  $("catalog")?.scrollTo({ top: 0 });
});
$("lines").addEventListener("click", (e) => {
  const del = e.target.closest("[data-del-line]");
  if (del) {
    state.cart = state.cart.filter((l) => cartLineKey(l) !== del.dataset.delLine);
    renderCart();
    return;
  }
  const openNote = e.target.closest("[data-note-open]");
  if (openNote) {
    const line = findCartLine(openNote.dataset.noteOpen);
    if (line) {
      line.noteOpen = true;
      renderCart();
    }
    return;
  }
  if (e.target.closest("[data-qty]") || e.target.closest("[data-line-note]")) return;
  const btn = e.target.closest("[data-chg]");
  if (!btn) return;
  changeLineQty(btn.dataset.chg, Number(btn.dataset.d));
});
$("lines").addEventListener("input", (e) => {
  const ta = e.target.closest("[data-line-note]");
  if (!ta) return;
  const line = findCartLine(ta.dataset.lineNote);
  if (line) line.notes = String(ta.value || "").slice(0, 240);
});
$("lines").addEventListener("focusin", (e) => {
  const input = e.target.closest("[data-qty]");
  if (input && typeof input.select === "function") input.select();
});
$("lines").addEventListener("change", (e) => {
  const input = e.target.closest("[data-qty]");
  if (input) {
    const line = findCartLine(input.dataset.qty);
    const item = line ? state.items.find((i) => i.id === line.itemId) : null;
    const base = item ? POSUnits.toBase(input.value, itemUnit(item)) : Number(input.value);
    setLineQty(input.dataset.qty, base);
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
  const input = e.target.closest("[data-qty], [data-line-disc]");
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
  const toggle = e.target.closest("[data-toggle-item]");
  const recv = e.target.closest("[data-recv]");
  const edit = e.target.closest("[data-edit-item]");
  if (toggle) {
    e.preventDefault();
    e.stopPropagation();
    const item = state.items.find((x) => x.id === toggle.dataset.toggleItem);
    if (!item) return;
    const next = itemStatusOf(item.status) === "inactive" ? "active" : "inactive";
    toggle.disabled = true;
    try {
      await api(`/api/items/${item.id}`, {
        method: "PUT",
        body: JSON.stringify(itemWriteBody(item, { status: next })),
      });
      if ($("item-hint")) {
        $("item-hint").textContent = next === "active" ? `${item.name} is active on Counter.` : `${item.name} is inactive and hidden on Counter.`;
        $("item-hint").className = "hint ok";
      }
      await loadBootstrap();
      if ($("item-id")?.value === item.id) paintItemStatus(next);
    } catch (err) {
      if ($("item-hint")) {
        $("item-hint").textContent = err.message;
        $("item-hint").className = "hint error";
      }
    } finally {
      toggle.disabled = false;
    }
    return;
  }
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
    if (i) fillItemForm(i);
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
  const copyBtn = e.target.closest("[data-copy-invoice]");
  const editBtn = e.target.closest("[data-edit-order]");
  const deleteBtn = e.target.closest("[data-delete-order]");
  const statusBtn = e.target.closest("[data-set-order-status]");
  if (printBtn) {
    const o = findInvoice(printBtn.dataset.print);
    if (o) printOrder(o, printBtn.dataset.printLook);
  }
  if (copyBtn) {
    const o = findInvoice(copyBtn.dataset.copyInvoice);
    if (o) copyInvoiceLink(o);
  }
  if (editBtn) {
    const o = orderCache.find((row) => row.id === editBtn.dataset.editOrder);
    if (!o) return;
    if (String(o.status || "").toLowerCase() === "cancelled") {
      setHint("Change status from Void before editing items", "error");
      return;
    }
    state.editingOrderId = o.id;
    state.customerId = o.customer_id;
    state.cart = (o.lines || []).map(cartLineFromOrderLine);
    state.lastPack = o.pack_id ? { id: o.pack_id, name: o.pack_name, count: o.pack_count || 1 } : null;
    $("customer").value = state.customerId;
    $("pay-method").value = o.payment_method || "cash";
    $("pack-choice").value = o.pack_id || "";
    if ($("bill-cust-name")) $("bill-cust-name").value = o.customer_name || "";
    if ($("bill-cust-mobile")) $("bill-cust-mobile").value = o.customer_mobile || digitsMobile(customer()?.mobile);
    const parsedBill = parseClassicAddress(o.customer_address);
    if ($("bill-cust-address")) $("bill-cust-address").value = parsedBill.address || o.customer_address || "";
    if ($("bill-cust-area")) $("bill-cust-area").value = parsedBill.area;
    if ($("bill-cust-city")) $("bill-cust-city").value = parsedBill.city;
    if ($("bill-cust-pin")) $("bill-cust-pin").value = parsedBill.pin;
    if ($("bill-doctor-rx")) $("bill-doctor-rx").value = o.doctor_rx || "";
    paintClassicCustomerStatus();
    applyOrderDiscountsToCounter(o);
    showView("counter");
    renderCart();
    setHint(`Changing items for ${o.order_number}`, "ok");
  }
  if (deleteBtn) {
    if (!canDeleteInvoice()) {
      setHint("Only the business admin can delete invoices", "error");
      return;
    }
    const o = orderCache.find((row) => row.id === deleteBtn.dataset.deleteOrder);
    if (!o) return;
    if (!window.confirm(`Delete invoice ${o.order_number}? This cannot be undone. Stock will be restored.`)) return;
    deleteBtn.disabled = true;
    try {
      await api(`/api/orders/${encodeURIComponent(o.id)}`, { method: "DELETE" });
      selectedOrderId = null;
      await loadOrders();
      try {
        await loadBootstrap();
        renderCustomersTable();
        fillDueCustomerSelect();
      } catch {
        /* customers list optional */
      }
      try {
        await loadAccounts();
      } catch {
        /* accounts view optional */
      }
      setHint(`Deleted ${o.order_number}`, "ok");
    } catch (err) {
      setHint(err.message, "error");
    } finally {
      deleteBtn.disabled = false;
    }
    return;
  }
  if (statusBtn) {
    const orderId = statusBtn.dataset.orderId;
    const nextStatus = statusBtn.dataset.setOrderStatus;
    const o = orderCache.find((row) => row.id === orderId);
    if (!o || String(o.status || "").toLowerCase() === nextStatus) return;
    if (nextStatus === "cancelled" && !window.confirm(`Void invoice ${o.order_number}? Stock will be restored.`)) return;
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
  syncCounterQuery($("search").value, $("search"));
});
$("scan-code")?.addEventListener("input", () => {
  syncCounterQuery($("scan-code").value, $("scan-code"));
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
$("bill-scan-code")?.addEventListener("input", () => {
  syncCounterQuery($("bill-scan-code").value, $("bill-scan-code"));
});
$("bill-item-search")?.addEventListener("input", () => {
  syncCounterQuery($("bill-item-search").value, $("bill-item-search"));
});
$("bill-scan-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = String($("bill-scan-code")?.value || "").trim();
  const name = String($("bill-item-search")?.value || "").trim();
  const raw = code || name;
  const source = code ? $("bill-scan-code") : $("bill-item-search");
  await applyBarcodeScan(raw, source);
});
document.addEventListener("keydown", (e) => {
  if (!isClassicBillShop() || !document.body.classList.contains("counter-mode")) return;
  if (e.altKey && !e.ctrlKey && !e.metaKey && String(e.key || "").toLowerCase() === "s") {
    e.preventDefault();
    $("bill-scan-code")?.focus();
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey && String(e.key || "").toLowerCase() === "i") {
    e.preventDefault();
    $("bill-item-search")?.focus();
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey && String(e.key || "").toLowerCase() === "m") {
    e.preventDefault();
    $("bill-cust-mobile")?.focus();
  }
});
function initCameraScan() {
  const scan = globalThis.POSCameraScan;
  if (!scan?.bindButton) return;
  const onScan = async (code) => {
    const el = isClassicBillShop() ? ($("bill-scan-code") || $("scan-code")) : $("scan-code");
    if (el) el.value = code;
    await applyBarcodeScan(code, el);
    focusScanLane();
  };
  const onError = (err) => setHint(err?.message || "Camera scan failed", "error");
  scan.bindButton($("scan-camera-btn"), { onScan, onError });
  scan.bindButton($("bill-scan-camera-btn"), { onScan, onError, alwaysShow: true });
}
initCameraScan();
$("search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = String($("search").value || "").trim();
  if (!code) return;
  const scanned = await applyBarcodeScan(code, $("search"));
  if (!scanned) $("search").focus();
});
$("customer").addEventListener("change", () => {
  state.customerId = $("customer").value;
  const c = customer();
  const mob = $("counter-mobile");
  const shown = digitsMobile(c?.mobile);
  if (mob && isRealMobile(shown)) mob.value = shown;
  else if (mob && document.activeElement !== mob) mob.value = "";
  clearClassicLoyalty();
  paintBillCustomer();
  fillPharmacyBillCustomerFromCustomer(c, { force: true });
  renderCatalog();
  renderCart();
  void loadCustomerLoyalty();
});
$("pay-method")?.addEventListener("change", () => {
  paintCounterDue();
});
$("btn-clear").addEventListener("click", () => {
  if (state.editingOrderId) {
    cancelOrderEdit();
    return;
  }
  const table = state.activeTable;
  state.cart = [];
  state.lastPack = null;
  state.activeQrOrderId = "";
  state.kotPrinted = [];
  state.billDiscountValue = 0;
  state.loyaltyRedeem = 0;
  state.offerAuto = true;
  state.offerBillLocked = false;
  resetOfferPopup();
  if ($("bill-disc-value")) $("bill-disc-value").value = 0;
  if ($("loyalty-redeem")) $("loyalty-redeem").value = 0;
  $("pack-choice").value = "";
  resetClassicBillEntry();
  resetClassicCustomerRecord({ focus: true });
  setHint(isClassicBillShop() ? "Bill and customer record cleared" : "Cart cleared");
  renderCatalog();
  renderCart();
  if (isRestaurantShop() && table) void dropTableHold(table);
});

document.addEventListener("click", (e) => {
  if (e.target.id === "btn-cancel-edit") cancelOrderEdit();
});

$("btn-pay").addEventListener("click", async () => {
  try {
    if (isClassicBillShop()) {
      const billed = resolveClassicBillCustomerId();
      if (billed) state.customerId = billed;
    }
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
      discountType: isClassicBillShop() ? "amt" : state.billDiscountType,
      discountValue: isClassicBillShop() ? 0 : state.billDiscountValue,
      discount: isClassicBillShop() ? 0 : cartTotals().discount,
      loyaltyPoints: state.loyaltyRedeem,
      offerIds: (state.appliedOffers?.applied || []).map((o) => o.id).filter(Boolean),
      offerLoyaltyMultiplier: state.appliedOffers?.loyaltyMultiplier || 1,
      qrOrderId: state.activeQrOrderId || undefined,
      table_no: isRestaurantShop() ? (state.activeTable || undefined) : undefined,
      customer_name: isClassicBillShop() ? pharmacyBillCustomerName() : undefined,
      customer_mobile: isClassicBillShop() ? pharmacyBillCustomerMobile() : undefined,
      customer_address: isClassicBillShop() ? pharmacyBillCustomerAddress() : undefined,
      doctor_rx: isPharmacyShop() ? pharmacyBillDoctorRx() : undefined,
      lines: state.cart.map((l) => ({
        itemId: l.itemId,
        quantity_gm: l.qtyGm,
        discountType: l.discountType || "amt",
        discountValue: l.discountValue || 0,
        barcode: l.barcode || "",
        notes: String(l.notes || "").trim(),
      })),
    };
    const result = state.editingOrderId
      ? await api(`/api/orders/${state.editingOrderId}`, { method: "PUT", body: JSON.stringify(payload) })
      : await api("/api/checkout", { method: "POST", body: JSON.stringify(payload) });
    const order = orderFromResult(result);
    if (!orderSaved(result)) throw new Error("Checkout did not return an order");
    const wasEdit = Boolean(state.editingOrderId);
    const tableNo = payload.table_no || state.activeTable || "";
    const billedName = isClassicBillShop()
      ? (pharmacyBillCustomerName() || customer()?.business_name || customer()?.name || "Walk-in")
      : (customer()?.business_name || customer()?.name || "Walk-in");
    const billedCustomerId = state.customerId;
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
        customer_name: billedName,
        customer_id: billedCustomerId,
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
          const calc = item ? lineCalc(item, l) : null;
          const preview = globalThis.POSFootwear?.cartBatchPreview?.(item) || {};
          return {
            item_id: l.itemId,
            item_name: itemBillName(item),
            quantity_gm: l.qtyGm,
            unit: item ? itemUnit(item) : "PCS",
            rate_per_kg: item ? rateFor(item) : 0,
            amount: calc ? calc.taxable : (item ? lineAmt(item, l.qtyGm) : 0),
            gst_amount: calc ? calc.gst : 0,
            gst_rate: item?.gst_rate || 0,
            mrp: item ? Number(globalThis.POSFootwear?.looseMrp?.(item) ?? item.mrp ?? item.retail_rate) || 0 : 0,
            batch_no: preview.batchNo || item?.batch_no || "",
            expiry_date: item?.default_expiry || "",
            pack_label: preview.pack || medicinePackLabel(item) || "",
          };
        }),
      };
    }
    if (tableNo && !receiptOrder.table_no) receiptOrder.table_no = tableNo;
    showOrder(receiptOrder);
    showInvoicePrintModal(receiptOrder, {
      title: `Invoice ${orderLabel(order, result)}`,
      message: "Bill saved. POS cleared for the next customer.",
    });
    clearCounterAfterSale(order, result);
    showView("counter");
    try {
      await Promise.all([loadBootstrap(), loadToday()]);
    } catch {
      /* order is already saved; keep the success message and cleared cart */
    }
    resetClassicCustomerRecord();
    renderCart();
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
$("acc-customer")?.addEventListener("change", () => {
  if (accTab === "customer-ledger") loadPartyLedgerTab("customer").catch((err) => {
    $("acc-hint").textContent = err.message;
    $("acc-hint").className = "hint error";
  });
});
$("acc-supplier")?.addEventListener("change", () => {
  if (accTab === "supplier-ledger") loadPartyLedgerTab("supplier").catch((err) => {
    $("acc-hint").textContent = err.message;
    $("acc-hint").className = "hint error";
  });
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
    const customer = (state.accReceivables || []).find((c) => c.id === rcp.dataset.rcp)
      || (state.customers || []).find((c) => c.id === rcp.dataset.rcp);
    if (customer) showReceiptModal(customer);
    return;
  }
  const pay = e.target.closest("[data-pay]");
  if (pay) {
    const supplier = (state.accPayables || []).find((s) => s.id === pay.dataset.pay)
      || (state.suppliers || []).find((s) => s.id === pay.dataset.pay);
    if (supplier) showPaymentModal(supplier);
    return;
  }
  const voucher = e.target.closest("[data-voucher-print]");
  if (voucher) {
    const row = (state.ledgerRows || [])[Number(voucher.dataset.voucherPrint)];
    if (row) printVoucher(row);
    return;
  }
  const alter = e.target.closest("[data-voucher-alter]");
  if (alter) {
    const row = (state.ledgerRows || [])[Number(alter.dataset.voucherAlter)];
    if (row) showAlterVoucherModal(row);
    return;
  }
  const del = e.target.closest("[data-voucher-delete]");
  if (del) {
    const row = (state.ledgerRows || [])[Number(del.dataset.voucherDelete)];
    if (row) {
      deleteVoucherEntry(row).catch((err) => setHint(err.message, "error"));
    }
  }
});
$("qr-orders-refresh")?.addEventListener("click", loadQrOrders);
$("rx-refresh")?.addEventListener("click", loadPrescriptions);
$("rx-copy-link")?.addEventListener("click", async () => {
  const url = $("rx-menu-link")?.value || rxUploadUrl();
  try {
    await navigator.clipboard.writeText(url);
    setHint("Prescription upload link copied.", "ok");
  } catch {
    setHint("Copy the link from the field.", "error");
  }
});
$("rx-print-code")?.addEventListener("click", printRxPoster);
$("rx-search")?.addEventListener("input", renderPrescriptions);
$("rx-status-tabs")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-rx-status]");
  if (!button) return;
  rxStatusFilter = button.dataset.rxStatus || "";
  $("rx-status-tabs").querySelectorAll("[data-rx-status]").forEach((row) => row.classList.toggle("active", row === button));
  renderPrescriptions();
});
$("rx-table-body")?.addEventListener("click", async (event) => {
  const tr = event.target.closest("[data-rx]");
  const row = rxCache.find((item) => item.id === tr?.dataset.rx);
  if (!row) return;
  try {
    const fileBtn = event.target.closest("[data-rx-file]");
    const next = event.target.closest("[data-rx-status]");
    const counter = event.target.closest("[data-rx-counter]");
    if (fileBtn) {
      window.open(`/api/prescriptions/${encodeURIComponent(row.id)}/file`, "_blank", "noopener");
    } else if (counter) openPrescriptionInCounter(row);
    else if (next) await setPrescriptionStatus(row, next.dataset.rxStatus);
  } catch (err) {
    const hint = $("rx-hint");
    if (hint) {
      hint.textContent = err.message;
      hint.className = "hint error";
    }
  }
});
$("kot-refresh")?.addEventListener("click", loadKots);
$("kot-status-tabs")?.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-kot-status-filter]");
  if (!btn) return;
  state.kotFilter = btn.getAttribute("data-kot-status-filter") || "";
  $("kot-status-tabs")?.querySelectorAll("button").forEach((el) => {
    el.classList.toggle("active", el === btn);
  });
  renderKotBoard();
});
$("kot-list")?.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-kot]");
  if (!card) return;
  const id = card.getAttribute("data-kot") || "";
  const ticket = (state.kotTickets || []).find((row) => row.id === id);
  try {
    if (event.target.closest("[data-kot-reprint]")) {
      reprintSavedKot(ticket || { table_no: "", lines: [] });
      return;
    }
    const statusBtn = event.target.closest("[data-kot-status]");
    if (statusBtn) {
      await setKotStatus(id, statusBtn.getAttribute("data-kot-status") || "");
    }
  } catch (err) {
    const hint = $("kot-hint");
    if (hint) {
      hint.textContent = err.message;
      hint.className = "hint error";
    }
  }
});
const qrSoundToggle = $("qr-sound-toggle");
if (qrSoundToggle) {
  qrSoundToggle.addEventListener("click", () => {
    const on = globalThis.POSQrNotify?.soundOn() !== false;
    const needs = globalThis.POSQrNotify?.needsUnlock?.() === true;
    if (!on || needs) {
      const ok = armQrOrderSound();
      setHint(ok ? "QR order sound on. You should hear a ding now." : "Tap Enable sound again if you did not hear a ding.", ok ? "ok" : "error");
      return;
    }
    globalThis.POSQrNotify?.setSoundOn?.(false);
    paintQrSoundToggle();
    paintKotSoundToggle();
    paintQrSoundArm();
    setHint("QR order sound off.", "ok");
  });
}
const qrSoundArmBtn = $("qr-sound-arm-btn");
if (qrSoundArmBtn) {
  qrSoundArmBtn.addEventListener("click", () => {
    const ok = armQrOrderSound();
    const cafe = isRestaurantShop() && (can("kot") || can("counter"));
    setHint(
      ok
        ? cafe
          ? "Kitchen KOT sound on. You should hear a ding now."
          : "QR order sound on. You should hear a ding now."
        : "Tap Enable sound again if you did not hear a ding.",
      ok ? "ok" : "error",
    );
  });
}
$("qr-toast-open")?.addEventListener("click", () => {
  hideQrOrderToast();
  showView("qr-orders");
});
$("qr-toast-dismiss")?.addEventListener("click", hideQrOrderToast);
$("kot-sound-toggle")?.addEventListener("click", () => {
  const on = globalThis.POSQrNotify?.soundOn() !== false;
  const needs = globalThis.POSQrNotify?.needsUnlock?.() === true;
  if (!on || needs) {
    const ok = armQrOrderSound();
    setHint(ok ? "Kitchen KOT sound on. You should hear a ding now." : "Tap Enable sound again if you did not hear a ding.", ok ? "ok" : "error");
    return;
  }
  globalThis.POSQrNotify?.setSoundOn?.(false);
  paintQrSoundToggle();
  paintKotSoundToggle();
  paintQrSoundArm();
  setHint("Kitchen KOT sound off.", "ok");
});
$("kot-toast-open")?.addEventListener("click", () => {
  hideKotToast();
  showView("kot");
});
$("kot-toast-dismiss")?.addEventListener("click", hideKotToast);
$("qr-order-search")?.addEventListener("input", renderQrOrders);
$("qr-status-tabs")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-qr-status]");
  if (!button) return;
  qrOrderStatus = button.dataset.qrStatus;
  $("qr-status-tabs").querySelectorAll("[data-qr-status]").forEach((row) => row.classList.toggle("active", row === button));
  renderQrOrders();
});
$("qr-order-list")?.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-qr-order]");
  const order = qrOrderCache.find((row) => row.id === card?.dataset.qrOrder);
  if (!order) return;
  try {
    const counter = event.target.closest("[data-qr-counter]");
    const next = event.target.closest("[data-qr-status-next]");
    const invoiceBtn = event.target.closest("[data-qr-invoice]");
    const printBtn = event.target.closest("[data-qr-print]");
    const kotBtn = event.target.closest("[data-qr-kot]");
    if (counter) await openQrOrderInCounter(order);
    else if (kotBtn) printQrKitchenKot(order);
    else if (printBtn) printQrOrder(order);
    else if (invoiceBtn) {
      const invoiceId = invoiceBtn.dataset.qrInvoice;
      showView("orders");
      try { await loadOrders(); } catch { /* ignore */ }
      const found = orderCache.find((row) => row.id === invoiceId);
      if (found) {
        selectedOrderId = found.id;
        renderOrdersList();
        showOrder(found);
      } else {
        $("qr-orders-hint").textContent = "Invoice saved. Print this QR order, or open Invoices.";
        $("qr-orders-hint").className = "hint ok";
      }
    } else if (next) await updateQrOrder(order, next.dataset.qrStatusNext);
  } catch (err) {
    $("qr-orders-hint").textContent = err.message;
    $("qr-orders-hint").className = "hint error";
  }
});
$("qr-copy-link")?.addEventListener("click", async () => {
  const text = $("qr-menu-link")?.value || qrMenuUrl();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    $("qr-menu-link")?.select();
    document.execCommand("copy");
  }
  $("qr-orders-hint").textContent = "Menu link copied.";
  $("qr-orders-hint").className = "hint ok";
});
$("qr-copy-shop-id")?.addEventListener("click", async () => {
  const text = shopBusinessId();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
  $("qr-orders-hint").textContent = "Shop ID copied.";
  $("qr-orders-hint").className = "hint ok";
});
$("qr-print-code")?.addEventListener("click", () => printQrPoster());
$("qr-print-all-tables")?.addEventListener("click", () => {
  printQrTableStickers();
});
$("qr-table-grid")?.addEventListener("click", async (event) => {
  const printBtn = event.target.closest("[data-qr-print-table]");
  if (printBtn) {
    event.preventDefault();
    await printQrTableStickers([printBtn.getAttribute("data-qr-print-table")]);
    return;
  }
  const copyBtn = event.target.closest("[data-qr-copy-table]");
  if (!copyBtn) return;
  const text = qrMenuUrl(copyBtn.getAttribute("data-qr-copy-table"));
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
  $("qr-orders-hint").textContent = `${qrTableLabel(copyBtn.getAttribute("data-qr-copy-table"))} link copied.`;
  $("qr-orders-hint").className = "hint ok";
});
document.querySelector(".nav").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-view]");
  if (btn) showView(btn.dataset.view);
});

$("item-form").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-set-item-status]");
  if (!btn) return;
  paintItemStatus(btn.dataset.setItemStatus);
});
$("item-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const unit = POSUnits.normalize($("item-unit").value);
  const body = {
    name: $("item-name").value,
    local_name: $("item-local-name")?.value || "",
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
    barcode_qty: POSUnits.isCount(unit) ? Number($("item-barcode-qty")?.value) || 0 : 0,
    barcode: $("item-own-barcode")?.value || "",
    stock_gm: POSUnits.toBase($("item-stock").value, unit),
    status: itemStatusOf($("item-status")?.value),
    image_url: state.itemImage || "",
  };
  if (isPharmacyShop()) {
    body.generic_name = $("item-local-name")?.value || "";
    body.medicine_type = $("item-type")?.value || "";
    body.manufacturer = $("item-mfr")?.value || "";
    body.pack_size = $("item-pack-size")?.value || "";
    body.pack_unit = $("item-pack-unit")?.value || "";
    body.units_per_pack = Number($("item-upp")?.value) || 1;
    body.batch_no = $("item-batch-no")?.value || "";
    body.default_expiry = $("item-expiry")?.value || "";
    body.expiry_date = $("item-expiry")?.value || "";
    body.reorder_level_gm = POSUnits.toBase($("item-reorder")?.value || 0, unit);
  }
  try {
    if ($("item-id").value) {
      await api(`/api/items/${$("item-id").value}`, { method: "PUT", body: JSON.stringify(body) });
      $("item-hint").textContent = "Saved";
    } else {
      const res = await api("/api/items", { method: "POST", body: JSON.stringify(body) });
      const count = res?.created_count || (res?.items ? res.items.length : 1);
      $("item-hint").textContent = count > 1 ? `Created ${count} sizes` : "Saved";
    }
    $("item-hint").className = "hint ok";
    resetItemForm();
    await loadBootstrap();
  } catch (err) {
    $("item-hint").textContent = err.message;
    $("item-hint").className = "hint error";
  }
});
$("item-cancel").addEventListener("click", () => {
  resetItemForm();
});
$("item-unit")?.addEventListener("change", refreshItemUnitLabels);
$("item-catalog-search")?.addEventListener("input", filterItemsCatalog);
$("item-low-only")?.addEventListener("change", filterItemsCatalog);
$("item-hide-inactive")?.addEventListener("change", filterItemsCatalog);
$("items-table")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("#item-demo-seed");
  if (!btn) return;
  btn.disabled = true;
  try {
    const seeded = await api("/api/items/demo-seed", { method: "POST", body: "{}" });
    $("item-hint").textContent = seeded?.created_count
      ? `Added ${seeded.created_count} demo medicines`
      : "Demo medicines already in the catalog";
    $("item-hint").className = "hint ok";
    await loadBootstrap();
  } catch (err) {
    $("item-hint").textContent = err.message;
    $("item-hint").className = "hint error";
    btn.disabled = false;
  }
});
$("item-import-file")?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) uploadItemsExcel(file);
});
$("item-import-template")?.addEventListener("click", () => {
  paintItemImportLink();
});
$("stock-excel")?.addEventListener("click", () => {
  paintStockExcelLink();
});
$("expiry-search")?.addEventListener("input", filterExpiryList);
$("expiry-filters")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-expiry-filter]");
  if (!btn) return;
  setExpiryFilter(btn.dataset.expiryFilter);
});
$("expiry-hero-stats")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-expiry-filter]");
  if (!btn) return;
  setExpiryFilter(btn.dataset.expiryFilter);
});
$("expiry-table")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-expiry-damage]");
  if (!btn) return;
  writeOffExpiryBatch(btn.dataset.expiryDamage);
});
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
      locale: $("cust-locale")?.value || "",
      address: $("cust-address")?.value || "",
      doctor_rx: $("cust-doctor-rx")?.value || "",
    });
    $("cust-hint").textContent = "Saved";
    $("cust-hint").className = "hint ok";
    $("customer-form").reset();
  } catch (err) {
    $("cust-hint").textContent = err.message;
    $("cust-hint").className = "hint error";
  }
});

$("due-customer")?.addEventListener("change", () => {
  const c = (state.customers || []).find((row) => row.id === $("due-customer").value);
  paintDueOutstanding();
  if (c) $("due-amount").value = String(Number(c.outstanding) || 0);
});

$("due-collect-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const hint = $("due-hint");
  const c = (state.customers || []).find((row) => row.id === $("due-customer")?.value);
  try {
    if (!c) throw new Error("Select a customer with outstanding due");
    const ref = String($("due-ref")?.value || "").trim();
    const note = String($("due-notes")?.value || "").trim();
    await collectCustomerDue(c, $("due-amount").value, $("due-method")?.value || "cash", [ref, note].filter(Boolean).join(" · "));
    $("due-collect-form").reset();
    fillDueCustomerSelect();
    if (hint) {
      hint.textContent = "Receipt saved and sent to printer.";
      hint.className = "hint ok";
    }
  } catch (err) {
    if (hint) {
      hint.textContent = err.message;
      hint.className = "hint error";
    }
  }
});

$("customers-table")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-collect-due]");
  if (!btn) return;
  const c = (state.customers || []).find((row) => row.id === btn.dataset.collectDue);
  if (!c) return;
  fillDueCustomerSelect(c.id);
  $("due-amount").value = String(Number(c.outstanding) || 0);
  paintDueOutstanding();
  $("due-collect-form")?.scrollIntoView({ block: "nearest" });
  $("due-amount")?.focus();
});

$("quick-customer-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const hint = $("qc-hint");
  try {
    const customer = await saveCustomer({
      name: $("qc-name").value,
      mobile: $("qc-mobile").value,
      address: $("qc-address")?.value || "",
      doctor_rx: $("qc-doctor-rx")?.value || "",
    });
    $("qc-name").value = "";
    $("qc-mobile").value = "";
    if ($("qc-address")) $("qc-address").value = "";
    if ($("qc-doctor-rx")) $("qc-doctor-rx").value = "";
    if (hint) {
      hint.textContent = `Added ${customer?.name || "customer"}`;
      hint.className = "hint ok";
    }
    setHint(`Customer added · ${customer?.name || ""}`, "ok");
    if (customer) selectCounterCustomer(customer);
  } catch (err) {
    if (hint) {
      hint.textContent = err.message;
      hint.className = "hint error";
    }
    setHint(err.message, "error");
  }
});

$("pack-item-search")?.addEventListener("input", filterPackCompose);
$("pack-selected-only")?.addEventListener("change", filterPackCompose);
$("pack-library-search")?.addEventListener("input", filterPackLibrary);
$("pack-lines")?.addEventListener("input", (e) => {
  if (e.target.matches("[data-pack-qty]")) {
    const id = e.target.dataset.packQty;
    const box = document.querySelector(`[data-pack-item="${id}"]`);
    if (box && Number(e.target.value) > 0) box.checked = true;
  }
  if (e.target.matches("[data-pack-qty], [data-pack-item]")) paintPackLive();
});
$("pack-lines")?.addEventListener("change", (e) => {
  if (e.target.matches("[data-pack-item], [data-pack-qty]")) paintPackLive();
});
$("pack-lines")?.addEventListener("click", (e) => {
  const row = e.target.closest("[data-pack-row]");
  if (!row || e.target.closest("input, button")) return;
  const box = row.querySelector("[data-pack-item]");
  if (!box) return;
  box.checked = !box.checked;
  paintPackLive();
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

$("set-copy-shop-id")?.addEventListener("click", async () => {
  const id = $("set-shop-id")?.value || shopBusinessId();
  const hint = $("settings-hint");
  if (!id) {
    if (hint) {
      hint.textContent = "Shop ID is not available yet.";
      hint.className = "hint error";
    }
    return;
  }
  try {
    await copyText(id);
    if (hint) {
      hint.textContent = "Shop ID copied.";
      hint.className = "hint ok";
    }
  } catch {
    if (hint) {
      hint.textContent = "Could not copy Shop ID.";
      hint.className = "hint error";
    }
  }
});

document.querySelector(".settings-tabs")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-settings-tab]");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  showSettingsTab(btn.dataset.settingsTab);
});

$("btn-backup-download")?.addEventListener("click", () => {
  if ($("btn-backup-download")) $("btn-backup-download").href = posUrl("/api/backup");
});

$("shop-clean-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = $("shop-clean-form");
  const hint = $("shop-clean-hint");
  const fd = new FormData(form);
  const password = String(fd.get("password") || "");
  const confirm = String(fd.get("confirm") || "");
  if (password !== confirm) {
    if (hint) {
      hint.textContent = "Password and confirm password do not match";
      hint.className = "hint error";
    }
    return;
  }
  try {
    if (hint) {
      hint.textContent = "Checking password and cleaning data…";
      hint.className = "hint";
    }
    const data = await api("/api/backup/clean", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    form.reset();
    await loadBootstrap();
    renderSettings();
    const after = $("shop-clean-hint");
    if (after) {
      after.textContent = data.note || "Shop data cleaned. Login and settings were kept.";
      after.className = "hint ok";
    }
  } catch (err) {
    if (hint) {
      hint.textContent = err.message;
      hint.className = "hint error";
    }
  }
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

$("language-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const hint = $("language-hint");
  try {
    const userLocale = $("set-user-locale")?.value || "";
    await api("/api/me/locale", { method: "POST", body: JSON.stringify({ locale: userLocale }) });
    if (state.session) state.session.locale = userLocale;
    if (can("settings")) {
      const payload = {
        name: state.company.name || $("set-name")?.value || "",
        address: state.company.address || "",
        phone: state.company.phone || "",
        email: state.company.email || "",
        gstin: state.company.gstin || "",
        city: state.company.city || "",
        state: state.company.state || "",
        pincode: state.company.pincode || state.company.pin_code || "",
        timezone: state.company.timezone || shopTimezone(),
        locale: $("set-shop-locale")?.value || "en",
        invoice_language: $("set-invoice-language")?.value || "shop",
        whatsapp_language: $("set-wa-language")?.value || "customer",
        email_language: $("set-email-language")?.value || "en",
        ai_language: $("set-ai-language")?.value || "en",
      };
      const data = await api("/api/settings", { method: "POST", body: JSON.stringify(payload) });
      if (data.company) state.company = { ...state.company, ...data.company };
    }
    applyUiLocale();
    if (hint) {
      hint.textContent = tt("settings.saved", "Language settings saved");
      hint.className = "hint ok";
    }
  } catch (err) {
    if (hint) {
      hint.textContent = err.message;
      hint.className = "hint error";
    }
  }
});

if ($("topbar-locale")) {
  $("topbar-locale").addEventListener("change", async () => {
    const locale = $("topbar-locale").value || "";
    try {
      await api("/api/me/locale", { method: "POST", body: JSON.stringify({ locale }) });
      if (state.session) state.session.locale = locale;
      applyUiLocale();
      renderCart();
    } catch (err) {
      const hint = $("language-hint");
      if (hint) {
        hint.textContent = err.message;
        hint.className = "hint error";
      }
    }
  });
}

$("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const payload = {
      name: $("set-name").value,
      address: $("set-address").value,
      phone: $("set-phone").value,
      email: $("set-email").value,
      gstin: $("set-gstin").value,
      drug_licence_no: $("set-drug-licence")?.value || "",
      fssai_licence_no: $("set-fssai")?.value || "",
      ndps_licence_no: $("set-ndps")?.value || "",
      city: $("set-city")?.value || "",
      state: $("set-state")?.value || "",
      pincode: $("set-pincode")?.value || "",
      timezone: $("set-timezone")?.value || shopTimezone(),
      invoice_footer: $("set-invoice-footer")?.value || "",
      invoice_terms: $("set-invoice-terms")?.value || "",
      payment_upi: $("set-payment-upi")?.value || "",
    };
    if (state.logoDraft !== null) payload.logo_url = state.logoDraft;
    if (state.payQrDraft !== null) payload.payment_qr_url = state.payQrDraft;
    const data = await api("/api/settings", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.company = data.company ? { ...state.company, ...data.company } : state.company;
    state.logoDraft = null;
    state.payQrDraft = null;
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

$("set-pay-qr").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const url = await readPayQrFile(file);
    state.payQrDraft = url;
    showLogo($("pay-qr-preview"), url);
    paintPayQrFileName(file.name);
    $("settings-hint").textContent = "Payment QR ready — click Save";
    $("settings-hint").className = "hint";
  } catch (err) {
    $("settings-hint").textContent = err.message;
    $("settings-hint").className = "hint error";
  }
});

$("pay-qr-clear").addEventListener("click", () => {
  state.payQrDraft = "";
  $("set-pay-qr").value = "";
  paintPayQrFileName();
  showLogo($("pay-qr-preview"), "");
  $("settings-hint").textContent = "Payment QR will be removed on Save";
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
$("rep-to")?.addEventListener("change", () => syncFySelectFromDates("rep-fy-year", "rep-from"));
$("rep-search")?.addEventListener("input", () => applyReportsFilter());
$("reports-tabs")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-report-tab]");
  if (!btn) return;
  if ($("rep-search")) $("rep-search").value = "";
  setReportTab(btn.dataset.reportTab);
});
$("reports-hero-stats")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-report-tab]");
  if (!btn) return;
  if ($("rep-search")) $("rep-search").value = "";
  setReportTab(btn.dataset.reportTab);
});
$("rep-print")?.addEventListener("click", () => {
  printFinance({
    title: "Reports",
    html: reportsPrintHtml(),
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
$("expenses-table")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-exp-delete]");
  if (!btn) return;
  if (!canDeletePaymentEntry()) {
    setHint("Only the business admin can delete payment entries", "error");
    return;
  }
  if (!window.confirm("Delete this expense payment entry?")) return;
  try {
    await api(`/api/expenses/${encodeURIComponent(btn.dataset.expDelete)}`, { method: "DELETE" });
    setHint("Expense deleted", "ok");
    await loadExpenses();
    try {
      await loadAccounts();
    } catch {
      /* optional */
    }
  } catch (err) {
    setHint(err.message, "error");
  }
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

function readPayQrFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 8_000_000) {
      reject(new Error("Choose a smaller image"));
      return;
    }
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      const max = 360;
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
      const g = canvas.getContext("2d");
      g.fillStyle = "#fff";
      g.fillRect(0, 0, w, h);
      g.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(blobUrl);
      resolve(canvas.toDataURL("image/png"));
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
$("view-dashboard")?.addEventListener("click", (e) => {
  const jump = e.target.closest("[data-view-jump]");
  if (jump) {
    showView(jump.dataset.viewJump);
    return;
  }
  const tile = e.target.closest("[data-dash-view]");
  if (tile) showView(tile.dataset.dashView);
});
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-apply-combo]");
  if (!btn) return;
  applyComboOffer(btn.dataset.applyCombo);
});
$("open-growth")?.addEventListener("click", () => showView("growth"));
$("open-offers")?.addEventListener("click", () => showView("offers"));
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-best-offer]")) {
    showBestOfferPopup(pickBestOfferForCart(), true);
    return;
  }
  if (e.target.closest("[data-skip-offers]")) {
    state.offerAuto = false;
    state.cart.forEach((l) => {
      if (l.offerId) {
        l.discountValue = 0;
        l.offerId = "";
      }
    });
    if (!state.offerBillLocked) {
      state.billDiscountValue = 0;
      if ($("bill-disc-value")) $("bill-disc-value").value = 0;
    }
    renderCart();
    return;
  }
  if (e.target.closest("[data-use-offers]")) {
    state.offerAuto = true;
    state.offerBillLocked = false;
    renderCart();
  }
});
$("offer-popup")?.addEventListener("click", (e) => {
  if (e.target.id === "offer-popup") {
    dismissBestOfferPopup(false);
    return;
  }
  if (e.target.id === "offer-popup-skip") {
    dismissBestOfferPopup(true);
    return;
  }
  if (e.target.id === "offer-popup-ok") {
    dismissBestOfferPopup(false);
  }
});
$("btn-hold")?.addEventListener("click", async () => {
  try {
    if (state.editingOrderId) throw new Error("Finish or cancel the invoice edit first");
    if (!state.cart.length) throw new Error("Cart is empty");
    if (isRestaurantShop()) {
      ensureDiningTable();
      await saveActiveTableHold();
      setHint(`${restaurantApi().displayTable(state.activeTable)} saved`, "ok");
      state.cart = [];
      state.lastPack = null;
      state.kotPrinted = [];
      if ($("pack-choice")) $("pack-choice").value = "";
      state.activeTable = "";
      renderCart();
      renderTableBoard();
      return;
    }
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
$("btn-kot")?.addEventListener("click", async () => {
  try {
    await sendKitchenKot();
  } catch (err) {
    setHint(err.message, "error");
  }
});
$("table-board")?.addEventListener("click", async (e) => {
  const printTableQr = e.target.closest("[data-table-qr]");
  if (printTableQr) {
    e.preventDefault();
    e.stopPropagation();
    await printQrTableStickers([printTableQr.getAttribute("data-table-qr")]);
    return;
  }
  const addFloor = e.target.closest("[data-add-floor]");
  if (addFloor) {
    e.preventDefault();
    if (!canManageDiningLayout()) return;
    const wrap = e.currentTarget.querySelector("[data-create-floor]");
    const chips = e.currentTarget.querySelector(".floor-chips");
    if (chips) chips.hidden = false;
    if (wrap) wrap.hidden = false;
    const inp = $("floor-create-name");
    if (inp) {
      inp.value = "";
      inp.focus();
    }
    return;
  }
  const cancelFloor = e.target.closest("[data-cancel-floor]");
  if (cancelFloor) {
    e.preventDefault();
    const wrap = e.currentTarget.querySelector("[data-create-floor]");
    if (wrap) wrap.hidden = true;
    if (diningFloors().length <= 1) {
      const chips = e.currentTarget.querySelector(".floor-chips");
      if (chips) chips.hidden = true;
    }
    return;
  }
  const editFloorBtn = e.target.closest("[data-edit-floor-btn]");
  if (editFloorBtn) {
    e.preventDefault();
    if (!canManageDiningLayout()) return;
    const id = editFloorBtn.getAttribute("data-edit-floor-btn") || "";
    const floor = diningFloors().find((f) => f.id === id);
    const wrap = e.currentTarget.querySelector("[data-edit-floor]");
    const chips = e.currentTarget.querySelector(".floor-chips");
    if (chips) chips.hidden = false;
    if (wrap) wrap.hidden = false;
    if ($("floor-edit-id")) $("floor-edit-id").value = id;
    if ($("floor-edit-name")) {
      $("floor-edit-name").value = floor?.name || "";
      $("floor-edit-name").focus();
    }
    return;
  }
  const cancelEditFloor = e.target.closest("[data-cancel-edit-floor]");
  if (cancelEditFloor) {
    e.preventDefault();
    const wrap = e.currentTarget.querySelector("[data-edit-floor]");
    if (wrap) wrap.hidden = true;
    return;
  }
  const rmFloor = e.target.closest("[data-remove-floor]");
  if (rmFloor) {
    e.preventDefault();
    if (!canManageDiningLayout()) return;
    const R = restaurantApi();
    if (!R?.removeFloor) return;
    const id = rmFloor.getAttribute("data-remove-floor") || "";
    const next = R.removeFloor(diningFloors(), diningTables(), id, busyTableIds());
    if (next.error) {
      setHint(next.error, "error");
      return;
    }
    try {
      if (state.activeFloor === R.clipFloorId?.(id)) state.activeFloor = next.floors[0]?.id || "";
      await persistDiningTables(next.tables, next.floors);
      setHint("Floor removed", "ok");
    } catch (err) {
      setHint(err.message, "error");
    }
    return;
  }
  const floorBtn = e.target.closest("[data-floor]");
  if (floorBtn) {
    e.preventDefault();
    const R = restaurantApi();
    const id = R?.clipFloorId?.(floorBtn.getAttribute("data-floor")) || floorBtn.getAttribute("data-floor");
    if (!id) return;
    state.activeFloor = id;
    renderTableBoard();
    return;
  }
  const add = e.target.closest("[data-add-table]");
  if (add) {
    e.preventDefault();
    if (!canManageDiningLayout()) return;
    const wrap = e.currentTarget.querySelector("[data-create-table]");
    if (wrap) wrap.hidden = false;
    const inp = $("table-create-name");
    if (inp) {
      inp.value = "";
      inp.focus();
    }
    return;
  }
  const cancel = e.target.closest("[data-cancel-table]");
  if (cancel) {
    e.preventDefault();
    const wrap = e.currentTarget.querySelector("[data-create-table]");
    if (wrap) wrap.hidden = true;
    return;
  }
  const editTableBtn = e.target.closest("[data-edit-table-btn]");
  if (editTableBtn) {
    e.preventDefault();
    if (!canManageDiningLayout()) return;
    const id = editTableBtn.getAttribute("data-edit-table-btn") || "";
    const rec = diningTables().find((t) => t.id === id);
    const wrap = e.currentTarget.querySelector("[data-edit-table]");
    if (wrap) wrap.hidden = false;
    if ($("table-edit-id")) $("table-edit-id").value = id;
    if ($("table-edit-name")) {
      $("table-edit-name").value = rec?.name || id;
      $("table-edit-name").focus();
    }
    return;
  }
  const cancelEditTable = e.target.closest("[data-cancel-edit-table]");
  if (cancelEditTable) {
    e.preventDefault();
    const wrap = e.currentTarget.querySelector("[data-edit-table]");
    if (wrap) wrap.hidden = true;
    return;
  }
  const rm = e.target.closest("[data-remove-table]");
  if (rm) {
    e.preventDefault();
    if (!canManageDiningLayout()) return;
    const R = restaurantApi();
    if (!R) return;
    const id = rm.getAttribute("data-remove-table") || "";
    const rec = R.normalizeTableNo(id);
    if (tableIsBusy(rec)) {
      setHint("Table is occupied — settle or park first", "error");
      return;
    }
    const next = R.removeTable(diningTables(), rec);
    if (next.error) {
      setHint(next.error, "error");
      return;
    }
    try {
      await persistDiningTables(next.tables, diningFloors());
      if (state.activeTable === rec) state.activeTable = R.PARCEL;
      renderTableBoard();
      renderCart();
      setHint("Table removed", "ok");
    } catch (err) {
      setHint(err.message, "error");
    }
    return;
  }
  const btn = e.target.closest("[data-table]");
  if (!btn) return;
  try {
    await selectDiningTable(btn.dataset.table);
  } catch (err) {
    setHint(err.message, "error");
  }
});
$("table-board")?.addEventListener("submit", async (e) => {
  const floorForm = e.target.closest("[data-create-floor]");
  if (floorForm) {
    e.preventDefault();
    if (!canManageDiningLayout()) return;
    const R = restaurantApi();
    if (!R?.addFloor) return;
    const inp = $("floor-create-name");
    const added = R.addFloor(diningFloors(), inp?.value);
    if (added.error) {
      setHint(added.error, "error");
      return;
    }
    try {
      state.activeFloor = added.added.id;
      await persistDiningTables(diningTables(), added.floors);
      if (inp) inp.value = "";
      setHint(`${added.added.name} floor created`, "ok");
    } catch (err) {
      setHint(err.message, "error");
      floorForm.hidden = false;
      inp?.focus();
    }
    return;
  }
  const editFloorForm = e.target.closest("[data-edit-floor]");
  if (editFloorForm) {
    e.preventDefault();
    if (!canManageDiningLayout()) return;
    const R = restaurantApi();
    if (!R?.renameFloor) return;
    const id = $("floor-edit-id")?.value || "";
    const next = R.renameFloor(diningFloors(), id, $("floor-edit-name")?.value);
    if (next.error) {
      setHint(next.error, "error");
      return;
    }
    try {
      await persistDiningTables(diningTables(), next.floors);
      setHint("Floor updated", "ok");
    } catch (err) {
      setHint(err.message, "error");
      editFloorForm.hidden = false;
    }
    return;
  }
  const editTableForm = e.target.closest("[data-edit-table]");
  if (editTableForm) {
    e.preventDefault();
    if (!canManageDiningLayout()) return;
    const R = restaurantApi();
    if (!R?.renameTable) return;
    const id = $("table-edit-id")?.value || "";
    const next = R.renameTable(diningTables(), id, $("table-edit-name")?.value, { busy: tableIsBusy(id) });
    if (next.error) {
      setHint(next.error, "error");
      return;
    }
    try {
      await persistDiningTables(next.tables, diningFloors());
      if (state.activeTable === next.fromId) state.activeTable = next.renamed?.id || state.activeTable;
      setHint("Table updated", "ok");
    } catch (err) {
      setHint(err.message, "error");
      editTableForm.hidden = false;
    }
    return;
  }
  const form = e.target.closest("[data-create-table]");
  if (!form) return;
  e.preventDefault();
  if (!canManageDiningLayout()) return;
  const R = restaurantApi();
  if (!R) return;
  const inp = $("table-create-name");
  const added = R.addTable(diningTables(), inp?.value, currentFloorId());
  if (added.error) {
    setHint(added.error, "error");
    return;
  }
  try {
    await persistDiningTables(added.tables, diningFloors());
    if (inp) inp.value = "";
    setHint(`${added.added.name} created`, "ok");
  } catch (err) {
    setHint(err.message, "error");
    form.hidden = false;
    inp?.focus();
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
  const hint = $("branch-hint");
  try {
    const id = $("br-id")?.value || "";
    const payload = {
      name: $("br-name").value,
      address: $("br-address").value,
      phone: $("br-phone").value,
      status: $("br-status")?.value || "active",
      username: String($("br-login")?.value || "").trim().toLowerCase(),
    };
    const password = $("br-pass")?.value || "";
    if (password) payload.password = password;
    if (!id && !payload.username) throw new Error("Branch login user ID is required");
    if (!id && !password) throw new Error("Password is required for a new branch login");
    if (password && password.length < 8) throw new Error("Password must be 8+ characters");
    if (id) await api(`/api/branches/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/branches", { method: "POST", body: JSON.stringify(payload) });
    if (hint) {
      hint.textContent = id ? "Branch updated." : "Branch saved. Sign in with the user ID and password on the login page.";
      hint.className = "hint ok";
    }
    $("branch-form").reset();
    fillBranchForm(null);
    loadBranches();
  } catch (err) {
    if (hint) {
      hint.textContent = err.message;
      hint.className = "hint error";
    } else {
      setHint(err.message, "error");
    }
  }
});
$("branch-cancel")?.addEventListener("click", () => {
  $("branch-form")?.reset();
  fillBranchForm(null);
  if ($("branch-hint")) {
    $("branch-hint").textContent = "";
    $("branch-hint").className = "hint";
  }
  renderBranches();
});
$("branch-search")?.addEventListener("input", renderBranches);
$("branch-hide-inactive")?.addEventListener("change", renderBranches);
$("branch-table")?.addEventListener("click", async (e) => {
  const edit = e.target.closest("[data-edit-branch]");
  if (edit) {
    const b = (state.branches || []).find((row) => row.id === edit.dataset.editBranch);
    if (b) {
      fillBranchForm(b);
      $("br-name")?.focus();
      renderBranches();
      $("branch-form")?.scrollIntoView({ block: "nearest" });
    }
    return;
  }
  const toggle = e.target.closest("[data-toggle-branch]");
  if (!toggle) return;
  const b = (state.branches || []).find((row) => row.id === toggle.dataset.toggleBranch);
  if (!b) return;
  const hint = $("branch-hint");
  try {
    toggle.disabled = true;
    const next = b.status === "inactive" ? "active" : "inactive";
    await api(`/api/branches/${b.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: b.name,
        address: b.address,
        phone: b.phone,
        status: next,
        username: b.login_username || b.username || "",
      }),
    });
    if (hint) {
      hint.textContent = next === "active" ? "Branch activated." : "Branch deactivated. Its login cannot sign in until you activate it again.";
      hint.className = "hint ok";
    }
    await loadBranches();
  } catch (err) {
    if (hint) {
      hint.textContent = err.message;
      hint.className = "hint error";
    } else {
      setHint(err.message, "error");
    }
  } finally {
    toggle.disabled = false;
  }
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
  list.innerHTML = items.map((i) => pickerOptionHtml(i)).join("");
  const search = $(searchId);
  const hidden = $(hiddenId);
  if (search) search._posFilter = filterFn;
  if (search && hidden && !search.dataset.bound) {
    search.dataset.bound = "1";
    const sync = () => {
      const pool = activeItems().filter((i) => (search._posFilter ? search._posFilter(i) : true));
      const item = resolvePickerItem(search.value, pool);
      hidden.value = item?.id || "";
      if (hidden.id === "stk-item") paintStockSelected(item);
    };
    search.addEventListener("input", sync);
    search.addEventListener("change", sync);
  }
  if (search && hidden && search.value) {
    const item = resolvePickerItem(search.value, items);
    if (item) hidden.value = item.id;
    if (hidden.id === "stk-item") paintStockSelected(item || state.items.find((i) => i.id === hidden.value) || null);
  }
}

function qtyToBaseFromInput(item, raw) {
  if (!item) return Number(raw) || 0;
  return POSUnits.toBase(raw, itemUnit(item));
}

$("stock-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pool = activeItems();
  const picked = pool.find((i) => i.id === $("stk-item")?.value) || resolvePickerItem($("stk-item-search")?.value, pool);
  if (!picked) {
    setStockHint("Pick an item — type a name, code, or barcode, or tap a card.", "error");
    $("stk-item-search")?.focus();
    return;
  }
  if ($("stk-item")) $("stk-item").value = picked.id;
  if ($("stk-item-search")) $("stk-item-search").value = picked.name;
  paintStockSelected(picked);
  let qty = qtyToBaseFromInput(picked, $("stk-qty")?.value);
  const kind = String($("stk-kind")?.value || "adjustment");
  if (["damaged", "expired", "returned"].includes(kind)) qty = Math.abs(qty);
  if (!qty) {
    setStockHint("Enter a quantity.", "error");
    $("stk-qty")?.focus();
    return;
  }
  const reason = String($("stk-reason")?.value || "").trim();
  const noteRaw = String($("stk-note")?.value || "").trim();
  const note = state.stockMode === "advanced" && reason
    ? (noteRaw ? `${reason}: ${noteRaw}` : reason)
    : noteRaw;
  const postBtn = $("stock-post");
  if (postBtn) postBtn.disabled = true;
  try {
    await api("/api/stock/adjust", {
      method: "POST",
      body: JSON.stringify({
        item_id: picked.id,
        quantity_gm: qty,
        kind,
        reason,
        note,
      }),
    });
    const taken = ["damaged", "expired", "returned"].includes(kind);
    setStockHint(
      taken
        ? `Took ${fmtQty(Math.abs(qty), picked)} off ${picked.name}`
        : `Posted ${qty > 0 ? "+" : ""}${fmtQty(qty, picked)} on ${picked.name}`,
      "ok",
    );
    if ($("stk-qty")) $("stk-qty").value = "";
    if ($("stk-note")) $("stk-note").value = "";
    await loadStock();
    loadBootstrap();
  } catch (err) {
    setStockHint(err.message, "error");
  } finally {
    if (postBtn) postBtn.disabled = false;
  }
});

$("stock-clear")?.addEventListener("click", () => {
  clearStockForm();
});

$("stk-kind")?.addEventListener("change", () => {
  const id = $("stk-item")?.value;
  const item = (state.stockRows || []).find((r) => r.id === id) || state.items.find((i) => i.id === id);
  syncStockQtyField(item || null);
});

$("stock-search")?.addEventListener("input", filterStockList);
$("stock-low-only")?.addEventListener("change", () => {
  state.stockLowOnly = Boolean($("stock-low-only")?.checked);
  paintStockHero(state.stockRows);
  filterStockList();
});
$("stock-hero-stats")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-stock-low]");
  if (!btn) return;
  state.stockLowOnly = !state.stockLowOnly;
  if ($("stock-low-only")) $("stock-low-only").checked = state.stockLowOnly;
  paintStockHero(state.stockRows);
  filterStockList();
});
$("stock-table")?.addEventListener("click", (e) => {
  const card = e.target.closest("[data-stock-item]");
  if (!card) return;
  selectStockItem(card.dataset.stockItem);
});

document.getElementById("stock-mode")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-stock-mode]");
  if (!btn) return;
  state.stockMode = btn.dataset.stockMode;
  document.querySelectorAll("[data-stock-mode]").forEach((b) => b.classList.toggle("primary", b === btn));
  document.getElementById("view-stock")?.classList.toggle("is-advanced", state.stockMode === "advanced");
  if ($("stock-mode-label")) $("stock-mode-label").textContent = state.stockMode === "advanced" ? "Adjust stock — advanced" : "Adjust stock";
});

["bill-disc-type", "bill-disc-value", "loyalty-redeem"].forEach((id) => {
  $(id)?.addEventListener("input", () => {
    state.billDiscountType = $("bill-disc-type")?.value || "amt";
    state.billDiscountValue = Number($("bill-disc-value")?.value) || 0;
    state.loyaltyRedeem = Number($("loyalty-redeem")?.value) || 0;
    if (id !== "loyalty-redeem") state.offerBillLocked = true;
    renderCart();
  });
  $(id)?.addEventListener("change", () => {
    state.billDiscountType = $("bill-disc-type")?.value || "amt";
    state.billDiscountValue = Number($("bill-disc-value")?.value) || 0;
    state.loyaltyRedeem = Number($("loyalty-redeem")?.value) || 0;
    if (id !== "loyalty-redeem") state.offerBillLocked = true;
    renderCart();
  });
});

const applyCounterMobileDebounced = debounce(() => {
  const raw = $("bill-cust-mobile")?.value || $("counter-mobile")?.value || "";
  if (digitsMobile(raw).length === 10) applyCounterMobile(raw);
  else paintClassicCustomerStatus();
}, 160);

const applyClassicCustNameDebounced = debounce(() => {
  if (!isClassicBillShop()) return;
  const q = String($("bill-cust-name")?.value || "").trim();
  if (q.length < 2) {
    hideClassicCustHits();
    paintClassicCustomerStatus();
    return;
  }
  const hits = findCustomersByName(q);
  paintClassicCustHits(hits);
  const exact = hits.filter((c) => String(c.business_name || c.name || "").trim().toLowerCase() === q.toLowerCase());
  if (exact.length === 1) {
    hideClassicCustHits();
    selectCounterCustomer(exact[0]);
  }
}, 180);

$("counter-mobile")?.addEventListener("input", () => {
  syncPharmacyMobile(false);
  applyCounterMobileDebounced();
});
$("counter-mobile")?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  applyCounterMobile($("counter-mobile").value);
});
$("counter-mobile")?.addEventListener("blur", () => {
  const d = digitsMobile($("counter-mobile")?.value);
  if (d.length === 10) applyCounterMobile($("counter-mobile").value, { announceMiss: false });
});
$("bill-cust-mobile")?.addEventListener("input", () => {
  syncPharmacyMobile(true);
  applyCounterMobileDebounced();
});
$("bill-cust-mobile")?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  syncPharmacyMobile(true);
  applyCounterMobile($("bill-cust-mobile").value);
});
$("bill-cust-mobile")?.addEventListener("blur", () => {
  syncPharmacyMobile(true);
  const d = digitsMobile($("bill-cust-mobile")?.value);
  if (d.length === 10) applyCounterMobile($("bill-cust-mobile").value, { announceMiss: false });
  else paintClassicCustomerStatus();
});
$("bill-cust-name")?.addEventListener("input", applyClassicCustNameDebounced);
$("bill-cust-name")?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const hits = findCustomersByName($("bill-cust-name")?.value);
  if (hits.length === 1) {
    hideClassicCustHits();
    selectCounterCustomer(hits[0]);
  }
});
$("classic-cust-hits")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-classic-cust]");
  if (!btn) return;
  const cust = (state.customers || []).find((c) => c.id === btn.dataset.classicCust);
  if (!cust) return;
  hideClassicCustHits();
  selectCounterCustomer(cust);
});
$("classic-cust-add")?.addEventListener("click", () => {
  void addClassicBillCustomer();
});
["bill-cust-address", "bill-cust-area", "bill-cust-city", "bill-cust-pin", "bill-doctor-rx"].forEach((id) => {
  $(id)?.addEventListener("input", () => paintClassicCustomerStatus());
});

let loyaltyLoadSeq = 0;

async function loadCustomerLoyalty() {
  const id = isClassicBillShop() ? (resolveClassicBillCustomerId() || state.customerId) : state.customerId;
  if (id && id !== state.customerId) state.customerId = id;
  const cust = (state.customers || []).find((c) => c.id === id) || customer();
  if (!id || isWalkInCustomer(cust)) {
    state.loyaltyAccount = null;
    state.loyaltyRedeem = 0;
    if ($("loyalty-redeem")) $("loyalty-redeem").value = 0;
    if ($("loyalty-hint")) $("loyalty-hint").textContent = "";
    paintClassicLoyalty();
    paintClassicCustomerStatus();
    renderCart();
    return;
  }
  if (!can("loyalty") && !can("customers") && !can("counter") && state.session?.role !== "business_admin") {
    paintClassicLoyalty();
    return;
  }
  const seq = ++loyaltyLoadSeq;
  try {
    const data = await api(`/api/loyalty/customer/${encodeURIComponent(id)}`);
    if (seq !== loyaltyLoadSeq) return;
    state.loyaltyAccount = data.account || null;
    state.loyaltySettings = data.settings || state.loyaltySettings || globalThis.POSLoyalty?.DEFAULTS || null;
    const pts = Math.max(0, Number(state.loyaltyAccount?.points_balance) || 0);
    const tier = globalThis.POSLoyalty?.tierLabel?.(state.loyaltyAccount?.tier) || state.loyaltyAccount?.tier || "";
    if ($("loyalty-hint")) {
      $("loyalty-hint").textContent = state.loyaltyAccount ? `${pts} pts · ${tier}` : "";
    }
    if ($("loyalty-redeem") && Number($("loyalty-redeem").value) > pts) {
      $("loyalty-redeem").value = String(pts);
      state.loyaltyRedeem = pts;
    }
    paintClassicLoyalty();
    renderCart();
    paintClassicCustomerStatus();
  } catch {
    if (seq !== loyaltyLoadSeq) return;
    state.loyaltyAccount = null;
    paintClassicLoyalty();
    paintClassicCustomerStatus();
    renderCart();
  }
}

async function loadBarcodesView() {
  fillItemPicker("bc-item-list", "bc-item-search", "bc-item", (i) => POSUnits.isCount(itemUnit(i)));
  const hint = $("bc-hint");
  try {
    const all = await api("/api/barcodes");
    const countIds = new Set(state.items.filter((i) => POSUnits.isCount(itemUnit(i))).map((i) => i.id));
    const rows = (Array.isArray(all) ? all : []).filter((r) => {
      const kind = String(r.kind || "").toLowerCase();
      return countIds.has(r.item_id) && kind !== "own" && kind !== "manufacturer";
    });
    $("barcodes-table").innerHTML = `<table><thead><tr>
      <th></th><th>Item</th><th>Kind</th><th>Barcode</th><th>Status</th><th>MRP</th><th>SP</th><th></th>
    </tr></thead><tbody>${(rows || [])
      .map(
        (r) => {
          const st = String(r.status || "active").toLowerCase() || "active";
          const inactive = st !== "active";
          return `<tr class="${inactive ? "is-inactive" : ""}">
          <td>${inactive ? "" : `<input type="checkbox" data-bc-pick="${escapeHtml(r.barcode)}" data-bc-name="${escapeHtml(r.item_name)}" data-bc-mrp="${escapeHtml(r.label_mrp || "")}" data-bc-rate="${escapeHtml(r.retail_rate || "")}" />`}</td>
          <td>${escapeHtml(r.item_name)} <small>${escapeHtml(r.item_code || "")}</small></td>
          <td>${escapeHtml(r.kind)}</td>
          <td>${escapeHtml(r.barcode)}</td>
          <td>${escapeHtml(st)}</td>
          <td>${money(r.label_mrp)}</td>
          <td>${money(r.retail_rate)}</td>
          <td>${inactive ? "" : `<button class="btn" type="button" data-bc-print="${escapeHtml(r.barcode)}" data-bc-name="${escapeHtml(r.item_name)}" data-bc-mrp="${escapeHtml(r.label_mrp || "")}" data-bc-rate="${escapeHtml(r.retail_rate || "")}">Print</button>`}</td>
        </tr>`;
        },
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

function expiryDaysLeft(row) {
  if (row?.days_left != null && row.days_left !== "") {
    const n = Number(row.days_left);
    if (Number.isFinite(n)) return n;
  }
  const s = String(row?.expiry_date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const exp = Date.parse(`${s}T12:00:00`);
  const today = Date.parse(`${ymd()}T12:00:00`);
  if (Number.isNaN(exp) || Number.isNaN(today)) return null;
  return Math.round((exp - today) / 86400000);
}

function expiryMatchesFilter(days, filter) {
  const d = Number(days);
  if (!Number.isFinite(d)) return filter === "all";
  if (filter === "expired") return d < 0;
  if (filter === "7") return d >= 0 && d <= 7;
  if (filter === "30") return d >= 0 && d <= 30;
  if (filter === "90") return d >= 0 && d <= 90;
  return true;
}

function expiryTone(days) {
  const d = Number(days);
  if (!Number.isFinite(d) || d < 0) return "expired";
  if (d <= 7) return "soon";
  if (d <= 30) return "watch";
  return "ok";
}

function expiryDaysLabel(days) {
  const d = Number(days);
  if (!Number.isFinite(d)) return "Dated";
  if (d < 0) {
    const n = Math.abs(d);
    return n === 1 ? "Expired yesterday" : `Expired ${n} days ago`;
  }
  if (d === 0) return "Expires today";
  if (d === 1) return "Expires tomorrow";
  return `Expires in ${d} days`;
}

function paintExpiryHero(rows) {
  const stats = $("expiry-hero-stats");
  if (!stats) return;
  const list = Array.isArray(rows) ? rows : [];
  const expired = list.filter((r) => {
    const d = expiryDaysLeft(r);
    return Number.isFinite(d) && d < 0;
  }).length;
  const week = list.filter((r) => {
    const d = expiryDaysLeft(r);
    return Number.isFinite(d) && d >= 0 && d <= 7;
  }).length;
  const month = list.filter((r) => {
    const d = expiryDaysLeft(r);
    return Number.isFinite(d) && d >= 0 && d <= 30;
  }).length;
  const active = state.expiryFilter || "all";
  stats.innerHTML = `<button class="items-stat${expired ? " is-warn" : ""}${active === "expired" ? " is-active" : ""}" type="button" data-expiry-filter="expired">
      <span>Expired</span><strong>${expired}</strong>
    </button>
    <button class="items-stat${week ? " is-warn" : ""}${active === "7" ? " is-active" : ""}" type="button" data-expiry-filter="7">
      <span>7 days</span><strong>${week}</strong>
    </button>
    <button class="items-stat${active === "30" ? " is-active" : ""}" type="button" data-expiry-filter="30">
      <span>30 days</span><strong>${month}</strong>
    </button>`;
}

function setExpiryFilter(name) {
  state.expiryFilter = name || "all";
  document.querySelectorAll("#expiry-filters [data-expiry-filter]").forEach((btn) => {
    btn.classList.toggle("primary", btn.dataset.expiryFilter === state.expiryFilter);
  });
  paintExpiryHero(state.expiryBatches);
  filterExpiryList();
}

function filterExpiryList() {
  const q = String($("expiry-search")?.value || "").trim().toLowerCase();
  const filter = state.expiryFilter || "all";
  let shown = 0;
  let total = 0;
  document.querySelectorAll("#expiry-table [data-expiry-card]").forEach((card) => {
    total += 1;
    const days = Number(card.dataset.expiryDays);
    const hay = card.dataset.expirySearch || "";
    const hide = (Boolean(q) && !hay.includes(q)) || !expiryMatchesFilter(days, filter);
    card.hidden = hide;
    if (!hide) shown += 1;
  });
  const empty = $("expiry-empty-filter");
  if (empty) empty.hidden = shown > 0 || total === 0;
}

async function loadExpiryView() {
  const el = $("expiry-table");
  if (!el) return;
  if ($("expiry-hint")) {
    $("expiry-hint").textContent = "";
    $("expiry-hint").className = "hint";
  }
  try {
    const rows = await api("/api/batches/expiry");
    state.expiryBatches = Array.isArray(rows) ? rows : [];
    paintExpiryHero(state.expiryBatches);
    if (!state.expiryBatches.length) {
      el.innerHTML = `<div class="item-empty-card" id="expiry-empty">
        <strong>No dated stock on hand</strong>
        <p>Set an expiry date on a purchase line to track batches here.</p>
      </div>`;
      return;
    }
    el.innerHTML = `${state.expiryBatches
      .map((r) => {
        const item = state.items.find((i) => i.id === r.item_id) || r;
        const days = expiryDaysLeft(r);
        const tone = expiryTone(days);
        const qty = fmtQty(r.remaining_gm, item);
        const batch = r.batch_no || r.barcode || "—";
        const search = `${r.item_name || ""} ${r.item_code || ""} ${r.batch_no || ""} ${r.barcode || ""} ${r.supplier_name || ""} ${r.hsn || ""} ${r.category || ""}`.toLowerCase();
        return `<article class="report-card item-card expiry-card is-${tone}" data-expiry-card data-expiry-days="${days ?? ""}" data-expiry-search="${escapeHtml(search)}" data-expiry-id="${escapeHtml(r.id)}">
          <div class="item-card-head">
            <div class="item-card-copy">
              <strong>${escapeHtml(r.item_name || "Item")}</strong>
              <span>${escapeHtml(r.item_code || "")}${r.category ? ` · ${escapeHtml(r.category)}` : ""}</span>
            </div>
            <span class="expiry-badge ${tone}">${escapeHtml(expiryDaysLabel(days))}</span>
          </div>
          <div class="item-card-meta">
            <span class="item-chip">Batch ${escapeHtml(batch)}</span>
            <span class="item-chip">${escapeHtml(formatShopDate(r.expiry_date))}</span>
            <span class="item-chip">${escapeHtml(qty)} left</span>
            ${r.supplier_name ? `<span class="item-chip">${escapeHtml(r.supplier_name)}</span>` : ""}
          </div>
          <div class="item-card-foot">
            <div class="item-card-rates">
              <span>On hand <em>${escapeHtml(qty)}</em></span>
              ${r.barcode ? `<span>Code <em>${escapeHtml(r.barcode)}</em></span>` : ""}
            </div>
            <div class="item-card-actions">
              <button class="btn" type="button" data-expiry-damage="${escapeHtml(r.id)}">Write off</button>
            </div>
          </div>
        </article>`;
      })
      .join("")}<div class="item-empty-card" id="expiry-empty-filter" hidden>
        <strong>No batches in this window</strong>
        <p>Try All dated, or search a different name / batch.</p>
      </div>`;
    filterExpiryList();
  } catch (err) {
    el.innerHTML = "";
    if ($("expiry-hint")) {
      $("expiry-hint").textContent = err.message;
      $("expiry-hint").className = "hint error";
    }
  }
}

async function writeOffExpiryBatch(batchId) {
  const row = state.expiryBatches.find((r) => r.id === batchId);
  if (!row) return;
  const item = state.items.find((i) => i.id === row.item_id) || row;
  const qty = fmtQty(row.remaining_gm, item);
  const when = formatShopDate(row.expiry_date) || "the expiry date";
  if (!window.confirm(`Write off remaining ${qty} of ${row.item_name || "this item"} (expiry ${when}) as damage?`)) return;
  try {
    await api("/api/damage", {
      method: "POST",
      body: JSON.stringify({
        item_id: row.item_id,
        batch_id: row.id,
        barcode: row.barcode || "",
        quantity_gm: Number(row.remaining_gm) || 0,
        reason: "expiry",
        note: `Expired batch ${row.batch_no || row.barcode || row.id}`,
        auto_approve: true,
      }),
    });
    if ($("expiry-hint")) {
      $("expiry-hint").textContent = `Wrote off ${qty} of ${row.item_name || "item"}`;
      $("expiry-hint").className = "hint ok";
    }
    await loadExpiryView();
    loadBootstrap();
  } catch (err) {
    if ($("expiry-hint")) {
      $("expiry-hint").textContent = err.message;
      $("expiry-hint").className = "hint error";
    }
  }
}

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

$("dmg-barcode")?.addEventListener("change", async () => {
  const code = String($("dmg-barcode").value || "").trim();
  if (!code) return;
  try {
    const data = await api(`/api/barcodes/lookup?code=${encodeURIComponent(code)}`);
    const match = data.match || data;
    const id = match.item_id || match.id;
    const item = state.items.find((i) => i.id === id);
    if (item) {
      if ($("dmg-item")) $("dmg-item").value = item.id;
      if ($("dmg-item-search")) $("dmg-item-search").value = item.name;
      if ($("dmg-qty") && POSUnits.isCount(itemUnit(item)) && !$("dmg-qty").value) $("dmg-qty").value = "1";
      if ($("dmg-hint")) {
        $("dmg-hint").textContent = `Piece ${code} · ${item.name}`;
        $("dmg-hint").className = "hint ok";
      }
    }
  } catch (err) {
    if ($("dmg-hint")) {
      $("dmg-hint").textContent = err.message;
      $("dmg-hint").className = "hint error";
    }
  }
});
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

let returnInvoice = null;

function pharmacyReturnReasons() {
  return [
    ["unused", "Unused / unopened"],
    ["wrong-medicine", "Wrong medicine"],
    ["expired", "Expired / near expiry"],
    ["damaged", "Damaged"],
    ["customer-request", "Customer request"],
    ["other", "Other"],
  ];
}

function garmentReturnReasons() {
  return [
    ["size", "Wrong size"],
    ["color", "Wrong colour"],
    ["unused", "Unused with tags"],
    ["damaged", "Damaged"],
    ["used", "Used"],
    ["other", "Other"],
  ];
}

function fillReturnReasons() {
  const sel = $("returns-reason");
  if (!sel) return;
  const rows = isPharmacyShop() ? pharmacyReturnReasons() : garmentReturnReasons();
  sel.innerHTML = rows.map(([v, l]) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join("");
}

function returnLineRefund(line, qty) {
  const sold = Number(line.quantity_gm || line.sold_qty) || 0;
  if (sold <= 0 || qty <= 0) return 0;
  const gst = Number(line.gst_rate) || 0;
  const taxable = Number(line.amount) || 0;
  return Math.round((qty / sold) * taxable * (1 + gst / 100) * 100) / 100;
}

function currentReturnQty(line) {
  const el = document.querySelector(`[data-return-qty="${CSS.escape(line.id)}"]`);
  const n = Number(el?.value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const max = Number(line.returnable_qty) || 0;
  return Math.min(n, max);
}

function paintReturnTotals() {
  if (!returnInvoice) return;
  let refund = 0;
  let any = false;
  let leftover = false;
  for (const line of returnInvoice.lines || []) {
    const qty = currentReturnQty(line);
    if (qty > 0) any = true;
    refund += returnLineRefund(line, qty);
    const left = Math.max(0, Number(line.returnable_qty) - qty);
    if (left > 0.0005) leftover = true;
  }
  if ($("returns-refund")) $("returns-refund").value = money(refund);
  if ($("returns-type")) $("returns-type").value = any && !leftover ? "full" : "partial";
}

function paintReturnInvoice() {
  const box = $("returns-lines");
  const cust = $("returns-customer");
  const form = $("returns-form");
  if (!returnInvoice) {
    if (cust) cust.textContent = "Search an invoice to load customer and sold items.";
    if (box) box.innerHTML = "";
    if (form) form.hidden = true;
    return;
  }
  const o = returnInvoice;
  const staff = state.session?.name || state.session?.username || "";
  const bits = [
    o.order_number,
    o.customer_name,
    o.customer_mobile,
    o.customer_address,
    o.created_at ? `Billed ${formatShopDateTime(o.created_at)}` : "",
    staff ? `Staff ${staff}` : "",
  ].filter(Boolean);
  if (cust) cust.textContent = bits.join(" · ");
  if (form) form.hidden = false;
  const pharm = isPharmacyShop();
  const head = pharm
    ? `<th>Medicine</th><th>Batch No.</th><th>Expiry</th><th>Sold Qty</th><th>Return Qty</th><th>Refund</th>`
    : `<th>Product</th><th>SKU</th><th>Size</th><th>Colour</th><th>Sold Qty</th><th>Return Qty</th><th>Condition</th><th>Refund</th>`;
  const rows = (o.lines || []).map((line) => {
    const item = state.items.find((i) => i.id === line.item_id) || {};
    const max = Number(line.returnable_qty) || 0;
    const sold = Number(line.sold_qty || line.quantity_gm) || 0;
    const disabled = max <= 0;
    const cond = `<select data-return-cond="${escapeHtml(line.id)}" ${disabled ? "disabled" : ""}>
      <option value="new">New</option>
      <option value="damaged">Damaged</option>
      <option value="used">Used</option>
    </select>`;
    const qty = `<input data-return-qty="${escapeHtml(line.id)}" type="number" min="0" max="${escapeHtml(max)}" step="any" value="0" ${disabled ? "disabled" : ""} aria-label="Return quantity" />`;
    const refund = `<span data-return-amt="${escapeHtml(line.id)}">${money(0)}</span>`;
    if (pharm) {
      return `<tr>
        <td>${escapeHtml(line.item_name)}</td>
        <td>${escapeHtml(line.batch_no || "—")}</td>
        <td>${escapeHtml(String(line.expiry_date || "").slice(0, 10) || "—")}</td>
        <td>${escapeHtml(fmtQty(sold, item))}${max < sold ? ` <small>left ${escapeHtml(fmtQty(max, item))}</small>` : ""}</td>
        <td>${qty}</td>
        <td>${refund}</td>
      </tr>`;
    }
    return `<tr>
      <td>${escapeHtml(line.item_name)}</td>
      <td>${escapeHtml(line.sku || line.item_code || item.code || "—")}</td>
      <td>${escapeHtml(line.size || item.size || "—")}</td>
      <td>${escapeHtml(line.color || item.color || "—")}</td>
      <td>${escapeHtml(fmtQty(sold, item))}${max < sold ? ` <small>left ${escapeHtml(fmtQty(max, item))}</small>` : ""}</td>
      <td>${qty}</td>
      <td>${cond}</td>
      <td>${refund}</td>
    </tr>`;
  }).join("");
  if (box) box.innerHTML = `<table class="returns-lines-table"><thead><tr>${head}</tr></thead><tbody>${rows || `<tr><td colspan="8">No returnable lines.</td></tr>`}</tbody></table>`;
  paintReturnTotals();
}

function syncReturnLineAmounts() {
  if (!returnInvoice) return;
  for (const line of returnInvoice.lines || []) {
    const qty = currentReturnQty(line);
    const cell = document.querySelector(`[data-return-amt="${CSS.escape(line.id)}"]`);
    if (cell) cell.textContent = money(returnLineRefund(line, qty));
  }
  paintReturnTotals();
}

async function loadReturnsHistory() {
  const table = $("returns-table");
  if (!table) return;
  try {
    const rows = await api("/api/returns");
    const list = Array.isArray(rows) ? rows : [];
    table.innerHTML = `<table><thead><tr>
      <th>Return No.</th><th>Invoice</th><th>Customer</th><th>Type</th><th>Reason</th><th>Refund</th><th>Mode</th><th>Status</th><th>Staff</th><th>Date &amp; Time</th>
    </tr></thead><tbody>${list.map((r) => `<tr>
      <td>${escapeHtml(r.return_number)}</td>
      <td>${escapeHtml(r.order_number || "")}</td>
      <td>${escapeHtml(r.customer_name || "")}${r.customer_mobile ? `<small>${escapeHtml(r.customer_mobile)}</small>` : ""}</td>
      <td>${escapeHtml(r.return_type || "")}</td>
      <td>${escapeHtml(r.reason || "")}</td>
      <td>${money(r.refund_amount)}</td>
      <td>${escapeHtml(r.refund_mode || "")}</td>
      <td>${escapeHtml(r.status || "")}</td>
      <td>${escapeHtml(r.staff_name || "—")}</td>
      <td>${escapeHtml(formatShopDateTime(r.created_at))}</td>
    </tr>`).join("") || `<tr><td colspan="10">No returns yet.</td></tr>`}</tbody></table>`;
  } catch (err) {
    table.innerHTML = `<p class="hint error">${escapeHtml(err.message)}</p>`;
  }
}

async function loadReturnsView() {
  fillReturnReasons();
  if ($("returns-lede")) {
    $("returns-lede").textContent = isPharmacyShop()
      ? "Pharmacy returns keep Batch No. and Expiry. Returned medicines go to quarantine (not sellable) unless a manager ticks sellable stock."
      : "Garment returns record product, SKU, size, and colour. New items restock; damaged or used items go to quarantine.";
  }
  if ($("returns-sellable-wrap")) $("returns-sellable-wrap").hidden = !isPharmacyShop();
  paintReturnInvoice();
  await loadReturnsHistory();
}

async function saveReturn(e) {
  e.preventDefault();
  const hint = $("returns-hint");
  if (!returnInvoice) {
    if (hint) {
      hint.textContent = "Search an invoice first.";
      hint.className = "hint error";
    }
    return;
  }
  const lines = [];
  for (const line of returnInvoice.lines || []) {
    const qty = currentReturnQty(line);
    if (qty <= 0) continue;
    const max = Number(line.returnable_qty) || 0;
    if (qty - max > 0.0005) {
      if (hint) {
        hint.textContent = `Return qty exceeds sold qty for ${line.item_name}`;
        hint.className = "hint error";
      }
      return;
    }
    const cond = document.querySelector(`[data-return-cond="${CSS.escape(line.id)}"]`)?.value || "";
    lines.push({ orderLineId: line.id, qty, condition: cond });
  }
  if (!lines.length) {
    if (hint) {
      hint.textContent = "Enter a return quantity on at least one item.";
      hint.className = "hint error";
    }
    return;
  }
  try {
    const saved = await api("/api/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: returnInvoice.id,
        reason: $("returns-reason")?.value || "other",
        refundMode: $("returns-mode")?.value || "cash",
        notes: $("returns-notes")?.value || "",
        sellableStock: Boolean($("returns-sellable")?.checked),
        lines,
      }),
    });
    const rec = saved.return || saved;
    if (hint) {
      hint.textContent = `Saved ${rec.return_number || "return"} · ${money(rec.refund_amount)} · ${rec.return_type || ""} · ${rec.status || "completed"}`;
      hint.className = "hint ok";
    }
    if ($("returns-notes")) $("returns-notes").value = "";
    if ($("returns-sellable")) $("returns-sellable").checked = false;
    await searchReturnInvoice(returnInvoice.order_number || "");
    await loadReturnsHistory();
  } catch (err) {
    if (hint) {
      hint.textContent = err.message;
      hint.className = "hint error";
    }
  }
}

$("returns-search-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  searchReturnInvoice($("returns-invoice-q")?.value || "");
});
$("returns-refresh")?.addEventListener("click", () => loadReturnsView());
$("returns-lines")?.addEventListener("input", (e) => {
  if (e.target.closest("[data-return-qty]")) syncReturnLineAmounts();
});
$("returns-form")?.addEventListener("submit", saveReturn);

async function searchReturnInvoice(q) {
  const hint = $("returns-hint");
  try {
    const data = await api(`/api/returns/invoice?q=${encodeURIComponent(q)}`);
    const rows = data.orders || [];
    returnInvoice = rows[0] || null;
    if (hint) {
      hint.textContent = returnInvoice
        ? (rows.length > 1 ? `Loaded ${returnInvoice.order_number} (${rows.length} matches — showing the latest).` : `Loaded ${returnInvoice.order_number}.`)
        : "";
      hint.className = "hint ok";
    }
    paintReturnInvoice();
  } catch (err) {
    returnInvoice = null;
    paintReturnInvoice();
    if (hint) {
      hint.textContent = err.message;
      hint.className = "hint error";
    }
  }
}

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
  const I = window.POSI18n;
  const uiLocale = I?.locale() || "en";
  const shopLocale = I?.normalizeLocale(state.company?.locale) || "en";
  const list = (Array.isArray(notes) ? notes : []).filter((n) => {
    const title = String(n.title || "").trim().toLowerCase();
    const body = String(n.body || "").toLowerCase();
    if (title === "master admin login") return false;
    if (body.includes("opened this shop from master admin")) return false;
    if (body.includes("viewing this shop") || body.includes("is viewing")) return false;
    const noteLoc = I?.normalizeLocale(n.locale) || "";
    if (noteLoc && noteLoc !== uiLocale && noteLoc !== shopLocale && noteLoc !== "en") return false;
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
    applyUiLocale();
    applyNav();
    if (isMobileLayout()) setNavCollapsed(true);
    const landing = landingView();
    if (me.business?.status && me.business.status !== "active" && !me.impersonating) {
      $("expired-banner").hidden = false;
      $("shop-name").textContent = me.business.name || "POS";
      showView("dashboard");
      return;
    }
    showView(landing);
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
    startQrOrderWatch();
    startKotWatch();
    startRxWatch();
    refreshItemUnitLabels();
  } catch {
    location.href = "/login.html";
  }
}

boot();
