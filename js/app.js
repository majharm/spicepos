const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 8 });

const state = {
  company: {},
  items: [],
  brands: [],
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
  extraCharges: 0,
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
  shiftFromTable: "",
  openTableOrderId: "",
  kotPrinted: [],
  kotTickets: [],
  kotFilter: "",
  fastModePreview: null,
};
globalThis.state = state;

function debounce(fn, wait = 120) {
  let timer;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
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

function ledgerBalanceText(n) {
  const v = Number(n) || 0;
  if (v < 0) return `${money(Math.abs(v))} Cr`;
  if (v > 0) return `${money(v)} Dr`;
  return money(v);
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
  ["item-unit", "ci-unit"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.innerHTML = POSUnits.optionsHtml(selected || el.value || defaultItemUnit());
  });
}

function applyUnitMaster(rows) {
  state.units = Array.isArray(rows) ? rows : [];
  POSUnits.hydrate(state.units.filter((u) => u.status !== "inactive"));
  fillItemUnitSelect();
}

function renderUnitsTable() {
  const el = $("units-table");
  if (!el) return;
  const rows = [...(state.units || [])].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.code).localeCompare(String(b.code)));
  let last = "";
  el.innerHTML = `<table><thead><tr>
    <th>Group</th><th>Unit</th><th>Code</th><th>Kind</th><th>Rate</th><th>Stock</th><th></th>
  </tr></thead><tbody>${rows
    .map((u) => {
      const group = globalThis.POSUnits?.groupOf?.(u.code) || u.family || "";
      const show = group !== last;
      last = group;
      return `<tr>
      <td>${show ? escapeHtml(group) : ""}</td>
      <td>${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.code)}</td>
      <td>${escapeHtml(u.family)}</td>
      <td>₹${escapeHtml(u.rate_suffix)}</td>
      <td>${escapeHtml(u.stock_suffix)}</td>
      <td><button class="btn" data-edit-unit="${escapeHtml(u.id)}" type="button">Edit</button>
          <button class="btn" data-del-unit="${escapeHtml(u.id)}" type="button">Delete</button></td>
    </tr>`;
    })
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

function isWeightShop() {
  return Boolean(globalThis.POSFootwear?.isWeightShop?.(state.businessMeta));
}

function isRestaurantShop() {
  return Boolean(globalThis.POSRestaurant?.isRestaurantShop(state.businessMeta) || globalThis.POSFootwear?.isRestaurantShop(state.businessMeta));
}

function isPharmacyShop() {
  return Boolean(globalThis.POSFootwear?.isPharmacyShop?.(state.businessMeta) || globalThis.POSFootwear?.shopKind?.(state.businessMeta) === "pharmacy");
}

function isServicesShop() {
  return Boolean(globalThis.POSSalon?.isSalonShop?.(state.businessMeta) || globalThis.POSFootwear?.isServicesShop?.(state.businessMeta));
}

function isPrintShop() {
  return Boolean(globalThis.POSPrint?.isPrintShop?.(state.businessMeta) || globalThis.POSFootwear?.isPrintShop?.(state.businessMeta) || globalThis.POSFootwear?.shopKind?.(state.businessMeta) === "printing");
}

function printApi() {
  return globalThis.POSPrint || null;
}

function isPrintAreaItem(item) {
  const P = printApi();
  if (!P?.isAreaBillItem) return false;
  return Boolean(P.isAreaBillItem(item, state.businessMeta));
}

function canChangeRate() {
  return state.session?.role === "business_admin" || can("items") || can("settings") || can("counter");
}

function parseCartLineRate(raw) {
  return POSUnits.roundRate8?.(raw) ?? Math.round((Number(raw) || 0) * 1e8) / 1e8;
}

function lineRateFieldHtml(item, line, key) {
  const rate = rateFor(item, line);
  if (!canChangeRate()) return `<span class="line-rate-ro">${escapeHtml(money(rate))}</span>`;
  const shown = POSUnits.rateInputValue?.(rate) ?? String(rate);
  return `<input class="line-rate-input" type="number" min="0" step="0.00000001" inputmode="decimal" value="${escapeHtml(shown)}" data-line-rate="${escapeHtml(key)}" aria-label="Item rate" />`;
}

function applyCartLineRate(key, raw) {
  if (!canChangeRate()) return;
  const line = findCartLine(key);
  if (!line) return;
  line.rate = parseCartLineRate(raw);
  refreshCartLineLive(key);
}

function refreshCartLineLive(key) {
  const line = findCartLine(key);
  const item = line ? state.items.find((i) => i.id === line.itemId) : null;
  if (!line || !item) return;
  if (isPrintAreaItem(item)) {
    refreshPrintLineLive(key);
    return;
  }
  const calc = lineCalc(item, line);
  const amtEl = document.querySelector(`[data-line-amt="${CSS.escape(String(key))}"]`);
  if (amtEl) amtEl.textContent = money(calc.taxable + calc.gst);
  paintBillFigures();
}

function printBillUnit(item) {
  const P = printApi();
  const custom = String(item?.custom_unit || "").trim();
  if (custom && P?.billUnitCode) return "CUSTOM";
  return P?.billUnitCode?.(itemUnit(item)) || "SQFT";
}

function printLineQuote(item, line) {
  const P = printApi();
  if (!P?.counterQuote || !item) return null;
  const dim = line?.printDimUnit || P.defaultDimUnit?.(printBillUnit(item)) || "ft";
  return P.counterQuote({
    width: Number(line?.printWidth) || 0,
    height: Number(line?.printHeight) || 0,
    dimUnit: dim,
    billUnit: printBillUnit(item),
    copies: Math.max(1, Number(line?.printCopies) || 1),
    minQty: Number(item.min_billing_qty) || 0,
    customUnit: item.custom_unit || line?.printCustomUnit || "",
    rate: rateFor(item, line),
    discountType: line?.discountType || "amt",
    discountValue: line?.discountValue || 0,
    gstRate: Number(item.gst_rate) || 0,
  });
}

function isAutoPrintSpecNote(notes) {
  const s = String(notes || "").trim();
  if (!s) return true;
  return /^\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s+\S+/i.test(s);
}

function syncPrintLineQty(line, item) {
  if (!line || !isPrintAreaItem(item)) return line;
  const q = printLineQuote(item, line);
  if (!q) return line;
  line.qtyGm = q.billedArea;
  line.printDimUnit = q.dimUnit;
  line.printCopies = q.copies;
  const sized = Number(line.printWidth) > 0 && Number(line.printHeight) > 0 && Number(q.billedArea) > 0;
  const next = sized
    ? printApi()?.printLineCaption?.({
        width: line.printWidth,
        height: line.printHeight,
        dimUnit: line.printDimUnit,
        billUnit: printBillUnit(item),
        copies: line.printCopies,
        customUnit: item.custom_unit || line.printCustomUnit,
        fileName: line.printFileName,
        minQty: Number(item.min_billing_qty) || 0,
      }) || ""
    : "";
  if (isAutoPrintSpecNote(line.notes)) line.notes = next;
  return line;
}

function printLineCaptionText(item, line) {
  const P = printApi();
  const q = printLineQuote(item, line);
  if (!q || !P) return "";
  const rate = rateFor(item, line);
  const area = P.printAreaLabel?.(q.billedArea, q.billUnit, item.custom_unit) || `${q.billedArea}`;
  const size = P.printSizeLabel?.(line.printWidth, line.printHeight, q.dimUnit, item.custom_unit) || "";
  const copies = q.copies > 1 ? ` × ${q.copies}` : "";
  const file = String(line.printFileName || "").trim();
  return `${size}${copies} · ${area} @ ${money(rate)}/${q.billLabel}${file ? ` · ${file}` : ""}`;
}

function printDimOptionsHtml(selected) {
  const units = printApi()?.COUNTER_DIM_UNITS || [
    { id: "ft", label: "ft" },
    { id: "in", label: "in" },
    { id: "m", label: "m" },
    { id: "cm", label: "cm" },
    { id: "mm", label: "mm" },
    { id: "custom", label: "custom" },
  ];
  const cur = String(selected || "ft");
  return units
    .map((u) => `<option value="${escapeHtml(u.id)}"${u.id === cur ? " selected" : ""}>${escapeHtml(u.label)}</option>`)
    .join("");
}

function printLineNeedsSize(line) {
  return !(Number(line?.printWidth) > 0 && Number(line?.printHeight) > 0);
}

function printAreaChipText(item, line) {
  const P = printApi();
  const q = printLineQuote(item, line);
  if (!q || printLineNeedsSize(line)) return "Area";
  return P?.printAreaLabel?.(q.billedArea, q.billUnit, item.custom_unit) || String(q.billedArea);
}

function focusPrintLineWidth(line) {
  const key = cartLineKey(line);
  queueMicrotask(() => {
    const el = document.querySelector(`[data-print-w="${CSS.escape(key)}"]`);
    if (el && typeof el.focus === "function") {
      el.closest(".print-line")?.scrollIntoView({ block: "nearest" });
      el.focus();
      if (typeof el.select === "function") el.select();
    }
  });
}

function printAreaLineHtml(item, line, key, calc) {
  const P = printApi();
  const dim = line.printDimUnit || P?.defaultDimUnit?.(printBillUnit(item)) || "ft";
  const copies = Math.max(1, Number(line.printCopies) || 1);
  const need = printLineNeedsSize(line);
  const cap = need ? "Enter width × height" : printLineCaptionText(item, line);
  const billLab = P?.billUnitLabel?.(printBillUnit(item), item.custom_unit) || "sqft";
  const rateVal = rateFor(item, line);
  const rateShown = POSUnits.rateInputValue?.(rateVal) ?? String(rateVal);
  const rateField = canChangeRate()
    ? `<label class="print-dim print-dim-rate">₹/${escapeHtml(billLab)}
        <input data-print-rate="${escapeHtml(key)}" data-line-rate="${escapeHtml(key)}" type="number" min="0" step="0.00000001" inputmode="decimal" value="${escapeHtml(rateShown)}" aria-label="Rate per unit" />
      </label>`
    : `<span class="print-rate-ro">${escapeHtml(money(rateVal))}/${escapeHtml(billLab)}</span>`;
  const fileBit = line.printFileName
    ? `<span class="print-file-name">${escapeHtml(line.printFileName)}</span>
       <button type="button" class="btn print-file-clear" data-print-file-clear="${escapeHtml(key)}">Remove</button>`
    : `<label class="print-file-pick">File
        <input class="logo-file-input" data-print-file="${escapeHtml(key)}" type="file" accept=".pdf,.jpg,.jpeg,.png,.svg,.ai,.eps,.cdr,image/*,application/pdf" />
      </label>`;
  return `<div class="line print-line${need ? " is-need-size" : ""}">
    <div class="line-main">
      <div class="line-info">
        <div class="who">${escapeHtml(item.name)}</div>
        <div class="pack print-line-summary">${escapeHtml(cap)}</div>
      </div>
      <div class="line-ops">
        <div class="line-amt" data-line-amt="${escapeHtml(key)}">${need ? "—" : money(calc.taxable + calc.gst)}</div>
        <button type="button" class="classic-del" data-del-line="${escapeHtml(key)}" aria-label="Remove ${escapeHtml(item.name)}">×</button>
      </div>
    </div>
    <div class="print-job">
      <div class="print-size-row">
        <label class="print-dim">W
          <input data-print-w="${escapeHtml(key)}" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(line.printWidth || "")}" placeholder="0" aria-label="Width" />
        </label>
        <span class="print-size-x" aria-hidden="true">×</span>
        <label class="print-dim">H
          <input data-print-h="${escapeHtml(key)}" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(line.printHeight || "")}" placeholder="0" aria-label="Height" />
        </label>
        <label class="print-dim print-dim-unit">
          <select data-print-dim="${escapeHtml(key)}" aria-label="Dimension unit">${printDimOptionsHtml(dim)}</select>
        </label>
        <span class="print-area-chip" data-print-area="${escapeHtml(key)}">${escapeHtml(printAreaChipText(item, line))}</span>
      </div>
      <div class="print-meta-row">
        <label class="print-dim print-dim-copies">Copies
          <input data-print-copies="${escapeHtml(key)}" type="number" min="1" step="1" inputmode="numeric" value="${escapeHtml(copies)}" aria-label="Copies" />
        </label>
        ${rateField}
        <div class="print-file-row">${fileBit}</div>
      </div>
    </div>
    ${canDiscount() ? `<div class="line-disc">
        <select data-line-disc-type="${escapeHtml(key)}" aria-label="Line discount type">
          <option value="amt"${(line.discountType || "amt") === "amt" ? " selected" : ""}>₹</option>
          <option value="pct"${line.discountType === "pct" ? " selected" : ""}>%</option>
        </select>
        <input data-line-disc="${escapeHtml(key)}" type="number" min="0" step="0.01" value="${escapeHtml(line.discountValue || 0)}" aria-label="Line discount" />
      </div>` : ""}
    ${lineDescriptionHtml(line, key)}
  </div>`;
}

function isGymShop() {
  return Boolean(globalThis.POSGym?.isGymShop?.(state.businessMeta) || globalThis.POSFootwear?.isGymShop?.(state.businessMeta) || globalThis.POSFootwear?.shopKind?.(state.businessMeta) === "gym");
}

function isBarShop() {
  return Boolean(globalThis.POSBar?.isBarShop?.(state.businessMeta) || globalThis.POSFootwear?.isBarShop?.(state.businessMeta) || globalThis.POSFootwear?.shopKind?.(state.businessMeta) === "bar" || Number(state.businessMeta?.bar_enabled) === 1);
}

function isResortShop() {
  return Boolean(globalThis.POSResort?.isResortShop?.(state.businessMeta) || globalThis.POSFootwear?.isResortShop?.(state.businessMeta) || Number(state.businessMeta?.resort_enabled) === 1);
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

function restaurantTicketHint() {
  const R = restaurantApi();
  if (isRestaurantShop() && R && state.activeTable) {
    const floors = diningFloors();
    const seat = diningTables().find((t) => t.id === state.activeTable);
    const floorBit = floors.length > 1 && seat?.floor ? ` · ${R.displayFloor?.(seat.floor, floors) || seat.floor}` : "";
    if (isRestaurantMobileLayout()) return "Tap a dish";
    return `${R.displayTable(state.activeTable)}${floorBit} · tap a dish`;
  }
  return emptyTicketHint();
}

function paintBillTable() {
  const el = $("bill-table");
  if (!el) return;
  if (!isRestaurantShop()) {
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("is-open", "is-idle");
    return;
  }
  const R = restaurantApi();
  el.hidden = false;
  if (state.activeTable && R) {
    const floors = diningFloors();
    const seat = diningTables().find((t) => t.id === state.activeTable);
    const floorBit = floors.length > 1 && seat?.floor ? ` · ${R.displayFloor?.(seat.floor, floors) || seat.floor}` : "";
    el.textContent = `${R.displayTable(state.activeTable)}${floorBit}`;
    el.classList.add("is-open");
    el.classList.remove("is-idle");
    return;
  }
  el.textContent = "Select a table";
  el.classList.add("is-idle");
  el.classList.remove("is-open");
}

function cafeBillHeadHtml() {
  return `<thead><tr>
        <th>Item</th>
        <th class="cafe-n">Qty</th>
        <th class="cafe-n">Rate</th>
        <th class="cafe-n">Amt</th>
        <th></th>
      </tr></thead>`;
}

function cafeBillEmptyHtml() {
  return `<div class="cafe-bill-wrap"><table class="cafe-bill-table">
      ${cafeBillHeadHtml()}
      <tbody>
        <tr class="cafe-bill-empty-row"><td colspan="5">${escapeHtml(restaurantTicketHint())}</td></tr>
      </tbody>
    </table></div>`;
}

function cafeBillLineName(item) {
  return itemVariantText(item) ? `${item.name} · ${itemVariantText(item)}` : item.name;
}

function cafeBillLinesHtml() {
  const rows = state.cart
    .map((line) => {
      const item = state.items.find((i) => i.id === line.itemId);
      if (!item) return "";
      const unitCode = itemUnit(item);
      const step = POSUnits.counterStep(unitCode);
      const unit = POSUnits.qtySuffix(unitCode);
      const qtyShow = POSUnits.displayQty(line.qtyGm, unitCode);
      const qtyStep = POSUnits.displayQty(step, unitCode) || 1;
      const calc = lineCalc(item, line);
      const key = cartLineKey(line);
      const disc = canDiscount()
        ? `<div class="line-disc">
              <select data-line-disc-type="${escapeHtml(key)}" aria-label="Line discount type">
                <option value="amt"${(line.discountType || "amt") === "amt" ? " selected" : ""}>₹</option>
                <option value="pct"${line.discountType === "pct" ? " selected" : ""}>%</option>
              </select>
              <input data-line-disc="${escapeHtml(key)}" type="number" min="0" step="0.01" value="${escapeHtml(line.discountValue || 0)}" aria-label="Line discount" />
            </div>`
        : "";
      const note = restaurantLineNoteHtml(line, key);
      return `<tr>
          <td class="cafe-item">
            <div class="who">${escapeHtml(cafeBillLineName(item))}</div>
            ${disc}
          </td>
          <td class="cafe-qty">
            <div class="qty">
              <button type="button" data-chg="${escapeHtml(key)}" data-d="${-step}">−</button>
              <input class="qty-input" type="number" inputmode="decimal" min="${POSUnits.displayQty(POSUnits.qtyMin(), unitCode) || 0.001}" max="${POSUnits.qtyMax()}" step="${escapeHtml(qtyStep)}" value="${escapeHtml(qtyShow)}" data-qty="${escapeHtml(key)}" aria-label="Quantity in ${unit}" />
              <button type="button" data-chg="${escapeHtml(key)}" data-d="${step}">+</button>
            </div>
          </td>
          <td class="cafe-n cafe-rate">${lineRateFieldHtml(item, line, key)}</td>
          <td class="cafe-n cafe-amt" data-line-amt="${escapeHtml(key)}">${escapeHtml(money(calc.taxable + calc.gst))}</td>
          <td class="cafe-del"><button type="button" class="classic-del cafe-del-btn" data-del-line="${escapeHtml(key)}" aria-label="Remove ${escapeHtml(item.name)}">×</button></td>
        </tr>
        ${note ? `<tr class="cafe-note-row"><td colspan="5">${note}</td></tr>` : ""}`;
    })
    .join("");
  return `<div class="cafe-bill-wrap"><table class="cafe-bill-table">
      ${cafeBillHeadHtml()}
      <tbody>${rows}</tbody>
    </table></div>`;
}

function cafeMobileEmptyHtml() {
  return `<div class="cafe-order-empty">${escapeHtml(restaurantTicketHint())}</div>`;
}

function cafeMobileOrderHtml() {
  const cards = state.cart
    .map((line) => {
      const item = state.items.find((i) => i.id === line.itemId);
      if (!item) return "";
      const unitCode = itemUnit(item);
      const step = POSUnits.counterStep(unitCode);
      const unit = POSUnits.qtySuffix(unitCode);
      const qtyShow = POSUnits.displayQty(line.qtyGm, unitCode);
      const qtyStep = POSUnits.displayQty(step, unitCode) || 1;
      const calc = lineCalc(item, line);
      const key = cartLineKey(line);
      return `<article class="cafe-order-card">
        <div class="cafe-order-top">
          <div class="who">${escapeHtml(cafeBillLineName(item))}</div>
          <button type="button" class="classic-del cafe-del-btn" data-del-line="${escapeHtml(key)}" aria-label="Remove ${escapeHtml(item.name)}">×</button>
        </div>
        <div class="cafe-order-ops">
          <div class="qty">
            <button type="button" data-chg="${escapeHtml(key)}" data-d="${-step}">−</button>
            <input class="qty-input" type="number" inputmode="decimal" min="${POSUnits.displayQty(POSUnits.qtyMin(), unitCode) || 0.001}" max="${POSUnits.qtyMax()}" step="${escapeHtml(qtyStep)}" value="${escapeHtml(qtyShow)}" data-qty="${escapeHtml(key)}" aria-label="Quantity in ${unit}" />
            <button type="button" data-chg="${escapeHtml(key)}" data-d="${step}">+</button>
          </div>
          <div class="cafe-rate">${lineRateFieldHtml(item, line, key)}</div>
          <div class="cafe-amt" data-line-amt="${escapeHtml(key)}">${escapeHtml(money(calc.taxable + calc.gst))}</div>
        </div>
        ${lineDescriptionHtml(line, key)}
      </article>`;
    })
    .join("");
  return `<div class="cafe-order-list">${cards}</div>`;
}

function itemVariantText(item) {
  return globalThis.POSFootwear?.variantLabel(item) || "";
}

function itemBillName(item) {
  return globalThis.POSFootwear?.billName(item) || item?.name || "Item";
}

function barcodeText(raw) {
  if (globalThis.POSBarcode?.asBarcodeString) return POSBarcode.asBarcodeString(raw);
  return String(raw == null ? "" : raw).trim();
}

function lineBarcodeText(line, item) {
  return barcodeText(line?.barcode) || barcodeText(item?.barcode) || barcodeText(item?.item_barcode) || "";
}

function isReusableCartBarcode(item, code) {
  const B = globalThis.POSBarcode;
  const q = barcodeText(code);
  if (!q || !item) return false;
  if (B?.barcodesEqual) {
    if (B.barcodesEqual(item.barcode, q) || B.barcodesEqual(item.mfr_barcode, q) || B.barcodesEqual(item.item_barcode, q)) {
      return true;
    }
    const extra = Array.isArray(item.barcodes) ? item.barcodes : [];
    return extra.some((row) => {
      const kind = row && typeof row === "object" ? row.kind : "own";
      return B.isReusableProductKind?.(kind) !== false && B.barcodesEqual(B.extraBarcodeValue?.(row) || row?.barcode || row, q);
    });
  }
  return barcodeText(item.barcode) === q || barcodeText(item.mfr_barcode) === q;
}

function clampLoyaltyRedeem() {
  const pts = Math.max(0, Number(state.loyaltyAccount?.points_balance) || 0);
  const walk = isWalkInCustomer(customer());
  let want = Math.max(0, Math.floor(Number($("loyalty-redeem")?.value) || 0));
  if (walk || pts <= 0) want = 0;
  else if (want > pts) want = pts;
  if ($("loyalty-redeem")) $("loyalty-redeem").value = String(want);
  state.loyaltyRedeem = want;
  return want;
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
  document.body.classList.toggle("weight-scale-mode", isScaleEnabled());
  document.body.classList.toggle("restaurant-mode", isRestaurantShop());
  applyRestaurantMobileChrome();
  restoreBillCollapsed();
  document.body.classList.toggle("pharmacy-mode", pharm);
  document.body.classList.toggle("classic-bill-mode", isClassicBillShop());
  document.body.classList.toggle("services-mode", isServicesShop());
  document.body.classList.toggle("printing-mode", isPrintShop());
  document.body.classList.toggle("gym-mode", isGymShop());
  document.body.classList.toggle("bar-mode", isBarShop());
  document.body.classList.toggle("resort-mode", isResortShop());
  document.querySelectorAll(".footwear-only").forEach((el) => {
    el.hidden = !on;
  });
  if ($("item-color-wrap")) $("item-color-wrap").hidden = !fw;
  if ($("item-size-wrap")) $("item-size-wrap").hidden = !fw;
  document.querySelectorAll(".apparel-only").forEach((el) => {
    if (el.id === "counter-low-stock-btn") return;
    el.hidden = !ap;
  });
  document.querySelectorAll(".pharmacy-only").forEach((el) => {
    el.hidden = !pharm;
  });
  document.querySelectorAll(".pharmacy-hide").forEach((el) => {
    el.hidden = pharm;
  });
  document.querySelectorAll(".apparel-hide").forEach((el) => {
    if (ap) el.hidden = true;
  });
  document.querySelectorAll(".restaurant-only").forEach((el) => {
    el.hidden = !isRestaurantShop();
  });
  document.querySelectorAll(".aggregator-only").forEach((el) => {
    el.hidden = !(isRestaurantShop() || isBarShop());
  });
  document.querySelectorAll(".services-only").forEach((el) => {
    if (el.classList.contains("nav-btn")) return;
    el.hidden = !isServicesShop();
  });
  document.querySelectorAll(".printing-only").forEach((el) => {
    if (el.classList.contains("nav-btn")) return;
    el.hidden = !isPrintShop();
  });
  document.querySelectorAll(".gym-only").forEach((el) => {
    if (el.classList.contains("nav-btn")) return;
    el.hidden = !isGymShop();
  });
  document.querySelectorAll(".bar-only").forEach((el) => {
    if (el.classList.contains("nav-btn")) return;
    el.hidden = !isBarShop();
  });
  document.querySelectorAll(".resort-only").forEach((el) => {
    if (el.classList.contains("nav-btn")) return;
    el.hidden = !isResortShop();
  });
  fillPaySelects();
  document.querySelectorAll(".classic-bill-only").forEach((el) => {
    if (el.classList.contains("nav-btn")) return;
    el.hidden = !isClassicBillShop();
  });
  paintLowStockBell();
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
  const brandCopy = globalThis.POSItemMaster?.brandCopy?.(globalThis.POSFootwear?.shopKind?.(state.businessMeta) || "general") || {};
  if ($("item-brand-lab")) $("item-brand-lab").textContent = copy.brandLab || brandCopy.brandLab || "Brand";
  if ($("item-brand")) $("item-brand").placeholder = copy.brandHint || brandCopy.brandHint || "Brand / make";
  if ($("items-kicker")) $("items-kicker").textContent = "Item Master";
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
  if ($("stock-search")) {
    $("stock-search").placeholder = pharm
      ? "Search name, batch no, expiry…"
      : "Search name, code, barcode…";
  }
  if ($("pack-item-search")) $("pack-item-search").placeholder = `Search spice or ${taxCodeLabel()}…`;
  if ($("po-items-title")) $("po-items-title").textContent = ap ? "Garments" : "Item list";
  if ($("po-item-search")) {
    $("po-item-search").placeholder = ap
      ? "Search garment, colour, or size…"
      : `Search item or ${taxCodeLabel()}…`;
  }
  if ($("purchases-lede")) {
    $("purchases-lede").textContent = ap
      ? "Buy multiple garments in one invoice. Enter size-wise qty (S, M, L, XL or 28–38) per product — total qty and amount calculate automatically. Scan barcodes per size with the camera, or generate the rest."
      : "Supplier bills. Scan with the camera or a USB scanner. For Quantity (pcs), one unique barcode per piece — 20 pcs needs 20 codes.";
  }
  VIEW_META.purchases.subtitle = ap
    ? "Multi-product, size-wise qty, and size-wise barcode scan"
    : "20 pcs = 20 barcodes you type or scan";
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
  if ($("bill-extras-summary")) $("bill-extras-summary").textContent = isPrintShop() ? "Discount & charges" : "Discount";
  paintPrintUomChips();
  paintBillTable();
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
  paintScaleDock();
  applyNav();
  renderTableBoard();
  applyQuickAddVisibility();
  applyFastMode();
  if ($("item-variant-grid")) {
    if (document.querySelector("#item-variant-grid [data-gv]")) readGarmentVariantCells();
    paintGarmentVariantEditor();
  }
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

function paintPrintUomChips() {
  const wrap = $("item-print-uom");
  if (!wrap) return;
  const P = printApi();
  const custom = String($("item-custom-unit")?.value || "").trim();
  const code = custom ? "CUSTOM" : P?.billUnitCode?.($("item-unit")?.value) || "";
  wrap.querySelectorAll("[data-print-uom]").forEach((btn) => {
    btn.classList.toggle("primary", btn.dataset.printUom === code);
  });
  if ($("item-custom-unit-wrap")) $("item-custom-unit-wrap").hidden = !isPrintShop();
}

function applyPrintUom(code) {
  const id = String(code || "SQFT").toUpperCase();
  if (id === "CUSTOM") {
    if ($("item-unit")) {
      fillItemUnitSelect("UNT");
      $("item-unit").value = "UNT";
    }
    $("item-custom-unit")?.focus();
  } else {
    const map = { SQFT: "SQFT", SQM: "SQM", SQIN: "SQIN" };
    const unit = map[id] || "SQFT";
    fillItemUnitSelect(unit);
    if ($("item-unit")) $("item-unit").value = unit;
    if ($("item-custom-unit") && id !== "CUSTOM") $("item-custom-unit").value = "";
  }
  refreshItemUnitLabels();
  paintPrintUomChips();
}

function refreshItemUnitLabels() {
  const u = POSUnits.normalize($("item-unit")?.value);
  const custom = String($("item-custom-unit")?.value || "").trim();
  const retailWord = isPharmacyShop() ? "Strip / pack price" : "Retail";
  const purchaseWord = isPharmacyShop() ? "Purchase / strip" : "Purchase";
  if ($("item-retail-lab")) {
    $("item-retail-lab").textContent = custom && isPrintShop()
      ? `Retail ₹/${custom}`
      : POSUnits.rateLabel(retailWord, u);
  }
  if ($("item-b2b-lab")) $("item-b2b-lab").textContent = POSUnits.rateLabel("B2B", u);
  if ($("item-purchase-lab")) $("item-purchase-lab").textContent = POSUnits.rateLabel(purchaseWord, u);
  if ($("item-stock-lab")) $("item-stock-lab").textContent = POSUnits.stockLabel(u);
  const pcs = POSUnits.isCount(u);
  document.querySelectorAll(".pcs-barcode-only").forEach((el) => {
    el.hidden = !pcs;
  });
  paintPrintUomChips();
}

const ORDER_STATUSES = ["confirmed", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["paid", "partial", "unpaid"];

const VIEW_META = {
  dashboard: { title: "Dashboard", subtitle: "Your shop today" },
  counter: { title: "Counter", subtitle: "Scan, tap, or search — then Pay" },
  items: { title: "Item Master", subtitle: "Brand, photo, HSN, unit type, rates, and stock" },
  brands: { title: "Brand Management", subtitle: "One brand list for every business type" },
  units: { title: "Unit master", subtitle: "Quantity, weight, length, area, volume, packaging, pharmacy, food, and service units" },
  customers: { title: "Customers", subtitle: "Accounts, due collection, and receipts" },
  barcodes: { title: "Barcodes", subtitle: "Generate unique piece codes and print labels" },
  damage: { title: "Damage stock", subtitle: "Wastage, approval, and estimated loss" },
  ledger: { title: "Stock ledger", subtitle: "Purchase, sale, return, and damage history" },
  loyalty: { title: "Royalty", subtitle: "Earn, redeem, tiers, birthday and referral" },
  offers: { title: "Offers & promotions", subtitle: "Combos, discounts, happy hours, and AI suggestions" },
  packs: { title: "Packs", subtitle: "Named mixes for the Counter" },
  orders: { title: "Invoices", subtitle: "Search, print POS or A4, and update payment" },
  returns: { title: "Manage Returns", subtitle: "Pharmacy and garment returns against a sales invoice" },
  "qr-orders": { title: "QR Orders", subtitle: "Incoming customer self-orders" },
  "online-orders": { title: "Online orders", subtitle: "Zomato and Swiggy kitchen tickets" },
  prescriptions: { title: "Prescription Orders", subtitle: "Customer QR uploads for this pharmacy" },
  kot: { title: "Kitchen KOT", subtitle: "Captain fires tickets; kitchen marks preparing and ready" },
  purchases: { title: "Purchases", subtitle: "20 pcs = 20 barcodes you type or scan" },
  suppliers: { title: "Suppliers", subtitle: "Vendor contacts, address, and GSTIN" },
  stock: { title: "Stock", subtitle: "On-hand qty, low-stock alerts, and adjustments" },
  expiry: { title: "Expiry", subtitle: "Dated batches still on hand — expired first" },
  staff: { title: "Staff & roles", subtitle: "Users, roles, and access" },
  branches: { title: "Branches", subtitle: "Locations, active status, and branch login" },
  devices: { title: "Hardware & devices", subtitle: "Registers, terminals, and weighing scale" },
  support: { title: "Support", subtitle: "Call, WhatsApp, or email your ATAV POS helpline" },
  accounts: { title: "Accounts", subtitle: "Receivables, payables, GL, and books" },
  expenses: { title: "Expenses", subtitle: "Rent, power, wages, and other shop costs" },
  reports: { title: "Reports", subtitle: "Pick a report, then Show, Excel, or Print" },
  growth: { title: "AI Growth", subtitle: "What happened, why, what to do next — from this shop's data" },
  settings: { title: "Shop profile", subtitle: "Company profile, timezone, logo, and login password" },
  backup: { title: "Shop backup", subtitle: "Download or restore this shop from Settings → Backup" },
  "hub-sales": { title: "Sales desk", subtitle: "Invoices, receipts, returns, and sales documents" },
  "hub-purchases": { title: "Purchase desk", subtitle: "Supplier bills, payments, and purchase documents" },
  payments: { title: "Payments", subtitle: "Cash, UPI, card, bank, receipts, and payment reports" },
  audit: { title: "Activity log", subtitle: "Created, edited, and deleted — invoices, payments, stock, and books" },
  "salon-board": { title: "Salon desk", subtitle: "Bookings, advance collection, packages, and staff performance" },
  bookings: { title: "Bookings", subtitle: "Advance appointments, waitlist, reschedule, and no-shows" },
  packages: { title: "Packages", subtitle: "Bridal and beauty packages with sessions and validity" },
  "print-board": { title: "Flex & Printing", subtitle: "Print orders, quotes, production, and sq ft" },
  "print-orders": { title: "Print orders", subtitle: "File review, quotes, and customer approval" },
  "print-production": { title: "Production", subtitle: "Printing, finishing, QC, ready, and delivery" },
  "print-settings": { title: "Print rates", subtitle: "Materials, finishing, GST, file rules, and portal image" },
  "gym-board": { title: "Gym desk", subtitle: "Members, check-ins, collection, renewals, and dues" },
  "gym-members": { title: "Members", subtitle: "Registration, profile, membership ID, QR, and billing" },
  "gym-attendance": { title: "Attendance", subtitle: "QR check-in / check-out, daily attendance, and absents" },
  "gym-trainers": { title: "Trainers", subtitle: "Trainer profiles, members, commission, and attendance" },
  "gym-plans": { title: "Membership plans", subtitle: "Monthly, yearly, couple, family, student, and PT plans" },
  "bar-board": { title: "Bar desk", subtitle: "Bottle and peg sales, stock alerts, tables, and collections" },
  "bar-counter": { title: "Bar Counter", subtitle: "Search, scan, or tap a category — bill pegs and bottles" },
  "bar-products": { title: "Bar products", subtitle: "Brand, bottle size, peg prices, batch, and expiry" },
  "bar-tables": { title: "Bar tables", subtitle: "Assign, transfer, split, or combine open bar orders" },
  "bar-stock": { title: "Bar stock", subtitle: "Opening, purchase, wastage, breakage, and remaining ml" },
  "bar-reports": { title: "Bar reports", subtitle: "Sales, consumption, stock variance, and gross profit" },
  "bar-settings": { title: "Bar settings", subtitle: "License, hours, peg sizes, tax, and regulated sales" },
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

function payStatusBadge(statusOrOrder) {
  const order = statusOrOrder && typeof statusOrOrder === "object" ? statusOrOrder : null;
  let s = String((order ? order.payment_status : statusOrOrder) || "paid").toLowerCase();
  const paid = Number(order?.amount_paid) || 0;
  if (String(order?.payment_method || "").toLowerCase() === "credit" && paid <= 0) s = "unpaid";
  return `<span class="pay-status ${escapeHtml(s)}">${escapeHtml(paymentStatusLabel(s))}</span>`;
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

function checkoutAmountPaid() {
  const el = $("pay-amount");
  if (!el) return undefined;
  const raw = String(el.value ?? "").trim();
  if (raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  if (n === 0 && el.dataset.dirty !== "1" && String($("pay-method")?.value || "") !== "credit") {
    const due = thisBillPayable();
    if (due > 0) return due;
  }
  return n;
}

function thisBillPayable() {
  const t = typeof cartTotals === "function" ? cartTotals() : { total: 0 };
  const total = Number(t.total != null ? t.total : (t.taxable || 0) + (t.tax || 0)) || 0;
  if (!state.editingOrderId) return total;
  const o = (typeof orderCache !== "undefined" ? orderCache : []).find((row) => row.id === state.editingOrderId);
  const due = globalThis.InvoicePrint?.invoiceDueFigures?.(o || { total });
  const already = due ? Number(due.paid) || 0 : Math.min(total, Math.max(0, Number(o?.amount_paid) || 0));
  return Math.max(0, total - already);
}

function invoiceSettlementHtml(o) {
  const due = globalThis.InvoicePrint?.invoiceDueFigures
    ? globalThis.InvoicePrint.invoiceDueFigures(o)
    : null;
  const previous = due ? due.previous : Number(o.previous_due) || 0;
  const paid = due ? due.paid : Number(o.amount_paid) || 0;
  const total = due ? due.total : Number(o.total) || 0;
  const current = due
    ? due.current
    : Math.max(0, total - Math.min(Math.max(0, paid), total));
  const mobile = o.customer_mobile || "";
  const ref = String(o.payment_reference || "").trim();
  const payRaw =
    o.payment_date && !String(o.payment_date).startsWith("0000-00-00")
      ? o.payment_date
      : due?.payments?.[0]?.payment_date && !String(due.payments[0].payment_date).startsWith("0000-00-00")
        ? due.payments[0].payment_date
        : due?.payments?.[0]?.created_at || o.created_at || "";
  const payDate = formatShopDate(payRaw);
  const receiptNo = o.receipt?.entryNo || o.receipt?.entry_no || o.receipt_entry_no || "";
  return `<details class="invoice-settle" open>
    <summary>Total due ${money(current)} · Paid till date ${money(paid)}</summary>
    <p class="hint">Total due is this invoice after payment. Previous due is older unpaid bills.</p>
    <div class="invoice-settle-grid">
      <div><span>Invoice No.</span><strong>${escapeHtml(o.order_number || "—")}</strong></div>
      <div><span>Invoice Date</span><strong>${escapeHtml(formatShopDateTime(o.created_at))}</strong></div>
      <div><span>Customer Name</span><strong>${escapeHtml(orderCustomerName(o))}</strong></div>
      <div><span>Mobile No.</span><strong>${escapeHtml(mobile || "—")}</strong></div>
      <div><span>Previous Due</span><strong>${money(previous)}</strong></div>
      <div><span>Current Invoice Amount</span><strong>${money(Number(o.subtotal) || 0)}</strong></div>
      <div><span>Discount</span><strong>${money(Number(o.discount) || 0)}</strong></div>
      <div><span>Tax/GST</span><strong>${money(Number(o.gst) || 0)}</strong></div>
      <div><span>Total Invoice Amount</span><strong>${money(total)}</strong></div>
      <div><span>Payment Made</span><strong>${money(paid)}</strong></div>
      <div><span>Payment Mode</span><strong>${escapeHtml(paymentMethodLabel(o.payment_method))}</strong></div>
      <div><span>Payment Reference</span><strong>${escapeHtml(ref || "—")}</strong></div>
      <div><span>Payment Date</span><strong>${escapeHtml(payDate || "—")}</strong></div>
      <div><span>Total due</span><strong>${money(current)}</strong></div>
    </div>
    ${Number(paid) > 0 && receiptNo ? `<p class="hint">Payment receipt ${escapeHtml(receiptNo)} is linked to this invoice.</p>` : ""}
  </details>`;
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
  state.extraCharges = 0;
  state.loyaltyRedeem = 0;
  state.offerBillLocked = false;
  state.offerAuto = true;
  resetOfferPopup();
  $("pack-choice").value = "";
  if ($("bill-disc-type")) $("bill-disc-type").value = "amt";
  if ($("bill-disc-value")) $("bill-disc-value").value = 0;
  if ($("print-extra-charges")) $("print-extra-charges").value = 0;
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
  const out = {
    lineId: newCartLineId(),
    itemId: l.item_id,
    qtyGm: Number(l.quantity_gm),
    discountType: type,
    discountValue: value,
    barcode: l.barcode || "",
    notes: String(l.notes || l.description || l.special_instruction || "").trim(),
    printWidth: Number(l.print_width ?? l.printWidth) || 0,
    printHeight: Number(l.print_height ?? l.printHeight) || 0,
    printDimUnit: l.print_dim_unit || l.printDimUnit || "",
    printCopies: Math.max(1, Number(l.print_copies ?? l.printCopies) || 1),
    printFileId: l.print_file_id || l.printFileId || "",
    printFileName: l.print_file_name || l.printFileName || "",
    printCustomUnit: l.print_custom_unit || l.printCustomUnit || "",
    rate: l.rate_per_kg != null && l.rate_per_kg !== "" ? Number(l.rate_per_kg) : undefined,
  };
  if ((!out.printWidth || !out.printHeight) && out.notes) {
    const decoded = printApi()?.decodePrintSpec?.(out.notes);
    if (decoded) {
      out.printWidth = decoded.width;
      out.printHeight = decoded.height;
      out.printDimUnit = decoded.dimUnit;
    }
  }
  return out;
}

function applyOrderDiscountsToCounter(o) {
  const type = String(o.discount_type || "amt").toLowerCase() === "pct" ? "pct" : "amt";
  let value = Number(o.discount_value);
  if (!Number.isFinite(value) || value <= 0) value = Number(o.discount) || 0;
  state.billDiscountType = type;
  state.billDiscountValue = value;
  state.loyaltyRedeem = Number(o.loyalty_points_redeemed) || 0;
  state.extraCharges = Number(o.extra_charges) || 0;
  state.offerBillLocked = value > 0;
  state.offerAuto = false;
  if ($("bill-disc-type")) $("bill-disc-type").value = type;
  if ($("bill-disc-value")) $("bill-disc-value").value = value;
  if ($("print-extra-charges")) $("print-extra-charges").value = state.extraCharges;
  if ($("loyalty-redeem")) $("loyalty-redeem").value = state.loyaltyRedeem;
  if (value > 0 || state.loyaltyRedeem > 0 || state.extraCharges > 0) {
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
    const email = String(c.email || "").trim().toLowerCase();
    return name.includes(q) || (email && email.includes(q));
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
  const n = Number(c?.outstanding ?? c?.current_due ?? c?.due ?? c?.balance_due);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function invoiceOpenRemainder(o) {
  const total = Number(o?.total) || 0;
  const paid = Number(o?.amount_paid ?? o?.amountPaid) || 0;
  if (paid > 0.004) return Math.max(0, total - paid);
  const status = String(o?.payment_status || "").toLowerCase();
  const method = String(o?.payment_method || "").toLowerCase();
  if (status === "paid") return 0;
  if (status === "unpaid" || status === "due" || method === "credit") return Math.max(0, total - paid);
  if (status === "partial") return Math.max(0, total - paid);
  if (method && method !== "credit") return 0;
  return Math.max(0, total - paid);
}

function applyInvoiceDuesToCustomers() {
  const extra = {};
  for (const o of orderCache || []) {
    if (!o?.customer_id) continue;
    if (String(o.status || "confirmed").toLowerCase() === "cancelled") continue;
    const left = invoiceOpenRemainder(o);
    if (left > 0.009) extra[o.customer_id] = (extra[o.customer_id] || 0) + left;
  }
  if (!Object.keys(extra).length) return;
  state.customers = (state.customers || []).map((c) => {
    const have = customerDue(c);
    const inv = extra[c.id] || 0;
    return have > 0.009 ? c : inv > 0.009 ? { ...c, outstanding: inv } : c;
  });
}

async function refreshCustomersOutstanding() {
  try {
    const rows = await api("/api/customers");
    if (Array.isArray(rows) && rows.length) {
      const byId = Object.fromEntries(rows.map((c) => [c.id, c]));
      const seen = new Set();
      state.customers = (state.customers || []).map((c) => {
        seen.add(c.id);
        const fresh = byId[c.id];
        if (!fresh) return c;
        return { ...c, ...fresh, outstanding: customerDue(fresh) };
      });
      for (const c of rows) {
        if (!seen.has(c.id)) state.customers.push(c);
      }
    }
  } catch {
    /* keep bootstrap customers */
  }
  renderCustomersTable();
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
    "bill-cust-email",
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
    "bill-cust-email",
    "bill-cust-address",
    "bill-cust-area",
    "bill-cust-city",
    "bill-cust-pin",
    "bill-doctor-rx",
    "qc-name",
    "qc-mobile",
    "qc-email",
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
  const paidEl = $("pay-amount");
  const typedPaid = paidEl && paidEl.value !== "" ? Number(paidEl.value) : NaN;
  const paid = Number.isFinite(typedPaid)
    ? Math.max(0, typedPaid)
    : method === "credit"
      ? 0
      : bill;
  const after = Math.max(0, due + bill - paid);
  const formula = `Previous due ${money(due)} + invoice ${money(bill)} − paid ${money(paid)} = ${money(after)}`;
  let label = "";
  if (due > 0) {
    label = after === due ? `Due ${money(due)}` : `Due ${money(due)} → ${money(after)}`;
  } else if (bill > 0 && paid + 0.009 < bill) {
    label = `Balance ${money(after)}`;
  }
  const chip = $("bill-due");
  if (chip) {
    chip.hidden = !label;
    chip.textContent = label;
    chip.title = formula;
  }
  const row = $("due-row");
  if (row) row.hidden = !(due > 0);
  if ($("due-total")) $("due-total").textContent = money(due);
  const faceRow = $("face-due-row");
  if (faceRow) faceRow.hidden = !(due > 0);
  if ($("face-due")) $("face-due").textContent = money(due);
  $("customer")?.classList.toggle("has-due", due > 0);
}

function shopDateInputValue(value) {
  const ymd = globalThis.InvoicePrint?.ymdFromValue?.(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd || "")) return ymd;
  const raw = String(value || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function syncPayAmountDefault() {
  const el = $("pay-amount");
  if (!el) return;
  if (!el.dataset.dirty) {
    const dueNow = thisBillPayable();
    const method = $("pay-method")?.value;
    el.value = method === "credit" ? "0" : dueNow.toFixed(2);
  }
}

function receiptEntryFromInvoice(order) {
  const r = order?.receipt;
  const paid = globalThis.InvoicePrint?.invoiceDueFigures
    ? Number(globalThis.InvoicePrint.invoiceDueFigures(order).paid) || 0
    : Number(order?.amount_paid) || 0;
  if (!r && !(paid > 0)) return null;
  return {
    id: r?.ledgerId || r?.ledger_id || r?.id || "",
    entry_no: r?.entryNo || r?.entry_no || "PR",
    entry_type: "receipt",
    party_name: orderCustomerName(order),
    party_mobile: order.customer_mobile,
    party_id: order.customer_id,
    amount: r?.amount ?? paid,
    payment_method: r?.method || order.payment_method,
    invoice_no: r?.invoice_no || order.order_number,
    invoice_amount: r?.invoice_amount ?? order.total,
    previous_due: r?.previous_due ?? order.previous_due,
    remaining_due: r?.remaining_due ?? r?.balance_due ?? order.current_due,
    payment_reference: r?.payment_reference || order.payment_reference,
    payment_date: r?.payment_date || order.payment_date,
    created_at: order.created_at,
  };
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

function rateFor(item, line) {
  if (line && line.rate != null && line.rate !== "" && Number.isFinite(Number(line.rate))) {
    return Number(line.rate);
  }
  const type = customer()?.type || "b2c";
  const F = globalThis.POSFootwear;
  if (F?.looseSaleRate) return F.looseSaleRate(item, type);
  return Number(type === "b2b" ? item.b2b_rate : item.retail_rate);
}

function lineAmt(item, qtyGm, line) {
  return POSUnits.lineAmount(qtyGm, rateFor(item, line), itemUnit(item));
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
  if (isPrintAreaItem(item)) syncPrintLineQty(line, item);
  const rate = rateFor(item, line);
  if (!D) {
    const amount = lineAmt(item, line.qtyGm, line);
    return { taxable: amount, gst: (amount * Number(item.gst_rate)) / 100, discount: 0, profit: 0, mrp: amount, total: amount, gross: amount, rate };
  }
  return D.computeLine({
    qty: line.qtyGm,
    rate,
    gstRate: Number(item.gst_rate) || 0,
    mrp: Number(F?.looseMrp?.(item) ?? item.mrp ?? item.retail_rate) || rate,
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

function classicDateOnly(raw) {
  const s = String(raw || "").trim();
  if (!s || s === "—") return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dmy) return `${String(dmy[1]).padStart(2, "0")}/${String(dmy[2]).padStart(2, "0")}/${dmy[3]}`;
  return s.slice(0, 10);
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
  setClassicField("bill-cust-email", walk ? "" : String(c?.email || ""), { force });
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
  const emailError = globalThis.POSCustomerMaster?.emailError?.($("bill-cust-email")?.value || "");
  if (emailError) {
    $("bill-cust-email")?.focus();
    globalThis.POSCustomerMasterUi?.paintEmailField?.($("bill-cust-email"));
    setHint(emailError, "error");
    return;
  }
  try {
    const created = await saveCustomer({
      name,
      mobile: digitsMobile($("bill-cust-mobile")?.value || mobile),
      email: $("bill-cust-email")?.value || "",
      address: pharmacyBillCustomerAddress(),
      doctor_rx: pharmacyBillDoctorRx(),
    });
    if (created) selectCounterCustomer(created);
    setHint(
      created?._duplicate
        ? `Using existing ${created.name || name}`
        : `Customer added · ${created?.name || name}`,
      "ok",
    );
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
  const q = globalThis.POSBarcode?.cleanCode ? POSBarcode.cleanCode(code) : String(code || "").trim();
  if (!q) return null;
  if (globalThis.POSBarcode?.itemHasBarcode) {
    return activeItems().find((i) => POSBarcode.itemHasBarcode(i, q)) || null;
  }
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

function showModal(title, html) {
  const modal = $("modal");
  const body = $("modal-body");
  if (!modal || !body) return false;
  if ($("modal-title")) $("modal-title").textContent = title || "";
  body.innerHTML = html || "";
  modal.hidden = false;
  return true;
}

globalThis.showModal = showModal;

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
  state.openTableOrderId = "";
  state.activeQrOrderId = "";
  state.activeTable = "";
  state.kotPrinted = [];
  state.billDiscountValue = 0;
  state.extraCharges = 0;
  state.loyaltyRedeem = 0;
  state.offerBillLocked = false;
  state.offerAuto = true;
  if ($("bill-disc-value")) $("bill-disc-value").value = 0;
  if ($("print-extra-charges")) $("print-extra-charges").value = 0;
  if ($("loyalty-redeem")) $("loyalty-redeem").value = 0;
  state.query = "";
  if ($("search")) $("search").value = "";
  if ($("scan-code")) $("scan-code").value = "";
  if ($("pack-choice")) $("pack-choice").value = "";
  if ($("pay-amount")) {
    delete $("pay-amount").dataset.dirty;
    $("pay-amount").value = "";
  }
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
  if (!s || s.startsWith("0000-00-00") || (/^\d{4}/.test(s) && Number(s.slice(0, 4)) < 1990)) return "";
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
  { code: "5109", name: "Travel" },
  { code: "5110", name: "Marketing" },
  { code: "5111", name: "Delivery" },
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

function dailySalesData(data) {
  if (data?.dailySales?.invoices) return data.dailySales;
  const invoices = [];
  const seen = new Set();
  const totals = {
    bills: 0, subtotal: 0, discount: 0, gst: 0, returned: 0, net: 0,
    cash: 0, upi: 0, card: 0, credit: 0, other: 0, paid: 0, unpaid: 0, partial: 0,
  };
  for (const row of data?.sales || []) {
    const st = String(row.status || "").toLowerCase();
    if (st === "cancelled" || st === "void") continue;
    const key = String(row.id || row.order_number || "");
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const mode = String(row.payment_method || "other").toLowerCase();
    const bucket = ["cash", "upi", "card", "credit"].includes(mode) ? mode : "other";
    let pay = String(row.payment_status || "paid").toLowerCase();
    if (pay === "due") pay = "unpaid";
    if (pay === "partially-paid" || pay === "part-paid") pay = "partial";
    if (pay !== "unpaid" && pay !== "partial") pay = "paid";
    const total = Number(row.total) || 0;
    const returned = Math.max(0, Number(row.returned) || 0);
    const net = Math.max(0, total - returned);
    invoices.push({
      id: row.id || "",
      order_number: row.order_number || "",
      created_at: row.created_at,
      customer_name: row.customer_name || "Walk-in",
      payment_method: row.payment_method || "",
      payment_mode: bucket,
      payment_status: pay,
      subtotal: Number(row.subtotal) || 0,
      discount: Number(row.discount) || 0,
      gst: Number(row.gst) || 0,
      total,
      returned,
      net,
    });
    totals.bills += 1;
    totals.subtotal += Number(row.subtotal) || 0;
    totals.discount += Number(row.discount) || 0;
    totals.gst += Number(row.gst) || 0;
    totals.returned += returned;
    totals.net += net;
    totals[bucket] += net;
    totals[pay] += 1;
  }
  return { invoices, totals };
}

function dailySalesKpi(label, value, extra) {
  return `<div class="daily-sales-kpi${extra ? ` ${extra}` : ""}"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
}

function dailySalesBlock(data) {
  const ds = dailySalesData(data);
  const t = ds.totals || {};
  const all = ds.invoices || [];
  const n = all.length;
  const cap = fastModeOn() ? 80 : n;
  const shown = all.slice(0, cap);
  const more = shown.length < n ? `<p class="hint catalog-more">Showing ${shown.length} of ${n} invoices. Excel has the full list.</p>` : "";
  const day = data?.from && data.from === data.to ? data.from : "";
  const rows = shown.length
    ? `<div class="table-wrap"><table class="daily-sales-table">
      <thead><tr>
        <th>Invoice</th><th>Date &amp; Time</th><th>Customer</th><th>Payment Mode</th>
        <th>Status</th><th>Subtotal</th><th>Discount</th><th>GST</th><th>Returned</th><th>Amount</th>
      </tr></thead>
      <tbody>${shown
        .map((o) => {
          const search = [
            o.order_number,
            o.customer_name,
            o.payment_method,
            o.payment_mode,
            o.payment_status,
            formatShopDateTime(o.created_at),
          ]
            .join(" ")
            .toLowerCase();
          const inv = escapeHtml(o.order_number || "—");
          const open = o.id
            ? `<button type="button" class="daily-sales-inv" data-open-invoice="${escapeHtml(o.id)}" data-order-number="${inv}">${inv}</button>`
            : inv;
          return `<tr data-report-row="${escapeHtml(search)}" data-open-invoice="${escapeHtml(o.id || "")}" data-order-number="${inv}">
            <td>${open}</td>
            <td>${escapeHtml(formatShopDateTime(o.created_at))}</td>
            <td>${escapeHtml(o.customer_name || "Walk-in")}</td>
            <td>${escapeHtml(paymentMethodLabel(o.payment_method || o.payment_mode))}</td>
            <td>${payStatusBadge(o.payment_status)}</td>
            <td>${escapeHtml(money(o.subtotal))}</td>
            <td>${escapeHtml(money(o.discount))}</td>
            <td>${escapeHtml(money(o.gst))}</td>
            <td>${Number(o.returned) > 0 ? escapeHtml(money(o.returned)) : "—"}</td>
            <td><strong>${escapeHtml(money(o.net))}</strong></td>
          </tr>`;
        })
        .join("")}</tbody></table></div>`
    : `<p class="report-empty">No invoices in this range</p>`;
  return `<section class="report-block daily-sales-block" data-report-title="Daily Sales" data-report-group="sales" data-report-sheet="Daily Sales">
    <div class="report-block-head">
      <div>
        <h3>Daily Sales</h3>
        <p class="report-block-meta">${n} ${n === 1 ? "invoice" : "invoices"} · invoice totals, not payment entries</p>
      </div>
      <div class="print-actions daily-sales-toolbar">
        <label>Date <input id="daily-sales-day" type="date" value="${escapeHtml(day || data?.from || "")}" /></label>
        <button class="btn" type="button" data-print-report>Print</button>
        <a class="btn" href="${excelHref("Daily Sales")}">Excel</a>
      </div>
    </div>
    <div class="daily-sales-kpis">
      ${dailySalesKpi("Total sales", money(t.net), "is-total")}
      ${dailySalesKpi("Invoices", String(t.bills || 0))}
      ${dailySalesKpi("Cash", money(t.cash))}
      ${dailySalesKpi("UPI", money(t.upi))}
      ${dailySalesKpi("Card", money(t.card))}
      ${dailySalesKpi("Credit", money(t.credit))}
      ${dailySalesKpi("Paid", String(t.paid || 0))}
      ${dailySalesKpi("Unpaid", String(t.unpaid || 0))}
      ${dailySalesKpi("Partial", String(t.partial || 0))}
    </div>
    ${more}${rows}
  </section>`;
}

function reportBlock(title, sheet, headers, rows, group) {
  const all = Array.isArray(rows) ? rows : [];
  const n = all.length;
  const cap = fastModeOn() ? 80 : n;
  const shown = all.slice(0, cap);
  const more = shown.length < n ? `<p class="hint catalog-more">Showing ${shown.length} of ${n} rows. Excel has the full list.</p>` : "";
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
    ${more}${htmlTable(headers, shown)}
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
  const pay = String($("rep-pay-mode")?.value || "").trim().toLowerCase();
  const extra = ["rep-customer", "rep-supplier", "rep-product", "rep-category", "rep-user"]
    .map((id) => String($(id)?.value || "").trim().toLowerCase())
    .filter(Boolean);
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
      const hay = (tr.getAttribute("data-report-row") || tr.textContent || "").toLowerCase();
      const hit = (!q || hay.includes(q)) && extra.every((bit) => hay.includes(bit)) && (!pay || hay.includes(pay));
      tr.hidden = !hit;
      if (hit) rowHits += 1;
    });
    let visible;
    const narrowed = Boolean(q || extra.length || pay);
    if (narrowed) {
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

function isRestaurantMobileLayout() {
  return isRestaurantShop() && isMobileLayout();
}

function isPrintMobileLayout() {
  return isPrintShop() && isMobileLayout();
}

function restaurantTablesCompactPreferred() {
  return isRestaurantMobileLayout() && Boolean(state.activeTable) && !state.shiftFromTable;
}

function scrollActiveTableIntoView() {
  const board = $("table-board");
  if (!board || board.hidden || !isRestaurantMobileLayout() || board.classList.contains("is-compact")) return;
  const on = board.querySelector(".table-seat.is-on");
  on?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
}

function applyRestaurantMobileChrome() {
  const cafe = isRestaurantShop();
  document.body.classList.toggle("has-active-table", cafe && Boolean(state.activeTable));
  const kot = $("btn-kot");
  if (kot) kot.textContent = isRestaurantMobileLayout() ? "KOT" : "Kitchen KOT";
  const board = $("table-board");
  if (!board) return;
  if (!isRestaurantMobileLayout()) {
    board.classList.remove("is-compact");
    return;
  }
  if (state.shiftFromTable) {
    board.classList.remove("is-compact");
    return;
  }
  const user = board.dataset.tablesUser || "";
  if (user === "open") board.classList.remove("is-compact");
  else if (user === "shut" || restaurantTablesCompactPreferred()) board.classList.add("is-compact");
  else board.classList.remove("is-compact");
  const toggle = board.querySelector("[data-tables-toggle]");
  if (toggle) {
    const compact = board.classList.contains("is-compact");
    toggle.setAttribute("aria-expanded", compact ? "false" : "true");
    toggle.setAttribute("aria-label", compact ? "Show tables" : "Hide tables");
  }
  scrollActiveTableIntoView();
}

function setNavCollapsed(collapsed) {
  const app = document.getElementById("app");
  const btn = $("nav-toggle");
  if (!app) return;
  app.classList.toggle("nav-collapsed", collapsed);
  btn?.setAttribute("aria-expanded", collapsed ? "false" : "true");
  const counterBtn = $("counter-nav-toggle");
  if (counterBtn) {
    counterBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    counterBtn.setAttribute("aria-label", collapsed ? "Open menu" : "Close menu");
    counterBtn.title = collapsed ? "Menu" : "Close menu";
  }
  const scrim = $("nav-scrim");
  if (scrim) {
    const overlay = isMobileLayout() || document.body.classList.contains("counter-mode") || document.body.classList.contains("m-app");
    scrim.hidden = collapsed || !overlay;
  }
}

function applyCounterWorkspaceChrome() {
  if (document.body.classList.contains("counter-mode")) setNavCollapsed(true);
  else if (isMobileLayout() || document.body.classList.contains("m-app")) setNavCollapsed(true);
  else setNavCollapsed(false);
  applyQuickAddVisibility();
  applyRestaurantMobileChrome();
}

const BILL_COLLAPSED_KEY = "spicepos-bill-collapsed";

function billToggleGlyph(hide) {
  if (isMobileLayout()) return hide ? "▴" : "▾";
  return hide ? "‹" : "›";
}

function setBillCollapsed(collapsed, { persist = true } = {}) {
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
  if (!persist) return;
  try {
    localStorage.setItem(BILL_COLLAPSED_KEY, hide ? "1" : "0");
  } catch {
    /* private mode / quota */
  }
}

function restoreBillCollapsed() {
  let collapsed;
  try {
    const saved = localStorage.getItem(BILL_COLLAPSED_KEY);
    if (saved === "1") collapsed = true;
    else if (saved === "0") collapsed = false;
  } catch {
    collapsed = undefined;
  }
  if (collapsed == null && (isRestaurantMobileLayout() || isPrintMobileLayout())) collapsed = true;
  setBillCollapsed(Boolean(collapsed), { persist: false });
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

function tableShiftingEnabled() {
  return isRestaurantShop() && Boolean(restaurantApi()?.tableShiftingOn?.(diningCompany()));
}

function hardwareFlagOn(raw) {
  return raw === true || raw === 1 || raw === "1";
}

function cameraScannerEnabled(company = state.company) {
  return hardwareFlagOn(company?.camera_scanner_enabled);
}

function receiptPrinterEnabled(company = state.company) {
  return hardwareFlagOn(company?.receipt_printer_enabled);
}

function cashDrawerEnabled(company = state.company) {
  return hardwareFlagOn(company?.cash_drawer_enabled);
}

function shopScaleEnabled(company = state.company) {
  return hardwareFlagOn(company?.scale_enabled);
}

function hardwareStatusLabel(on, extra = "") {
  if (!on) return extra ? `Disabled — ${extra}` : "Disabled";
  return extra || "Enabled";
}

function validGstin(raw) {
  const v = String(raw || "").trim().toUpperCase();
  if (!v) return true;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v);
}

function quickAddVisible(company = state.company) {
  const v = company?.quick_add_enabled;
  if (v === 0 || v === "0" || v === 2 || v === "2" || v === false || v === "off" || v === "hide") return false;
  return true;
}

function applyQuickAddVisibility() {
  const show = quickAddVisible() && !document.body.classList.contains("counter-mode");
  document.body.classList.toggle("quick-add-hidden", !show);
  for (const id of ["counter-add-item", "classic-add-item"]) {
    const el = $(id);
    if (!el) continue;
    el.hidden = !show;
    el.setAttribute("aria-hidden", show ? "false" : "true");
  }
}

function tableShiftOpts() {
  return {
    tableIds: diningTables().map((t) => t.id),
    activeTable: state.activeTable,
    cartCount: state.cart.length,
  };
}

function paintStaffRoleOptions() {
  const sel = $("st-role");
  if (!sel) return;
  const cafe = isRestaurantShop();
  const bar = isBarShop();
  const resort = isResortShop();
  const current = sel.value;
  sel.querySelectorAll('option[value="captain"], option[value="kitchen"]').forEach((opt) => {
    const keep = cafe || current === opt.value;
    opt.hidden = !keep;
    opt.disabled = !keep;
  });
  sel.querySelectorAll('option[value="bartender"]').forEach((opt) => {
    const keep = bar || current === opt.value;
    opt.hidden = !keep;
    opt.disabled = !keep;
  });
  sel.querySelectorAll('option[value="receptionist"], option[value="reservation_executive"], option[value="housekeeping"], option[value="maintenance"], option[value="property_manager"]').forEach((opt) => {
    const keep = resort || current === opt.value;
    opt.hidden = !keep;
    opt.disabled = !keep;
  });
  if (!cafe && (sel.value === "captain" || sel.value === "kitchen") && sel.querySelector(`option[value="${sel.value}"]`)?.hidden) {
    sel.value = "cashier";
  }
  if (!bar && sel.value === "bartender" && sel.querySelector('option[value="bartender"]')?.hidden) {
    sel.value = "cashier";
  }
}

function landingView() {
  const role = state.session?.role;
  if (isRestaurantShop() && role === "kitchen" && can("kot")) return "kot";
  if (isRestaurantShop() && role === "captain" && can("counter")) return "counter";
  if (isBarShop() && role === "bartender" && can("counter")) return "bar-counter";
  if (isResortShop() && (role === "receptionist" || role === "reservation_executive" || role === "housekeeping") && (can("rooms") || can("dashboard"))) return "resort-desk";
  if (fastModeOn() && can("counter")) return "counter";
  if (can("dashboard")) return "dashboard";
  if (can("counter")) return "counter";
  if (can("kot")) return "kot";
  return "support";
}

function fastModeOn(company = state.company) {
  if (state.fastModePreview === true || state.fastModePreview === false) return state.fastModePreview;
  const v = company?.fast_mode_enabled;
  if (v === 0 || v === "0" || v === 2 || v === "2" || v === false || v === "off" || v === "hide") return false;
  return true;
}

function applyFastMode() {
  document.body.classList.toggle("fast-mode", fastModeOn());
}

const viewFreshAt = Object.create(null);
function markViewFresh(name) {
  viewFreshAt[name] = Date.now();
}
function viewStillFresh(name, ms = 60000) {
  if (!fastModeOn()) return false;
  const t = viewFreshAt[name] || 0;
  return Date.now() - t < ms;
}

function applyNav() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    const view = btn.dataset.view;
    const map = {
      dashboard: "dashboard",
      counter: "counter",
      items: "items",
      brands: "items",
      units: "items",
      customers: "customers",
      packs: "items",
      orders: "orders",
      returns: "orders",
      "qr-orders": "orders",
      "online-orders": "orders",
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
      "hub-sales": "orders",
      "hub-purchases": "purchases",
      payments: "accounts",
      audit: "settings",
      "salon-board": "dashboard",
      bookings: "orders",
      packages: "items",
      "print-board": "dashboard",
      "print-orders": "orders",
      "print-production": "orders",
      "print-settings": "settings",
      "gym-board": "dashboard",
      "gym-members": "customers",
      "gym-attendance": "orders",
      "gym-trainers": "staff",
      "gym-plans": "items",
      "bar-board": "dashboard",
      "bar-counter": "counter",
      "bar-products": "items",
      "bar-tables": "counter",
      "bar-stock": "stock",
      "bar-reports": "reports",
      "bar-settings": "settings",
      "resort-board": "dashboard",
      "resort-rooms": "dashboard",
      "resort-bookings": "dashboard",
      "resort-desk": "dashboard",
      "resort-housekeeping": "dashboard",
      "resort-settings": "settings",
    };
    btn.hidden = map[view] ? !can(map[view]) : false;
    if (view === "growth") btn.hidden = !(can("growth") || can("reports"));
    if (view === "offers") btn.hidden = !(can("discount") || can("items") || can("growth"));
    if (view === "packs" && !isSpiceShop()) btn.hidden = true;
    if (view === "qr-orders" && isPharmacyShop()) btn.hidden = true;
    if (view === "qr-orders" && isPrintShop()) btn.hidden = true;
    if (view === "online-orders") btn.hidden = !aggregatorDeskAllowed() || !can("orders");
    if (view === "prescriptions") btn.hidden = !isPharmacyShop() || !can("orders");
    if (view === "returns") btn.hidden = !isClassicBillShop() || !can("orders");
    if (view === "kot") btn.hidden = !isRestaurantShop() || !can("kot");
    if ((view === "salon-board" || view === "bookings" || view === "packages") && !isServicesShop()) btn.hidden = true;
    if ((view === "print-board" || view === "print-orders" || view === "print-production" || view === "print-settings") && !isPrintShop()) btn.hidden = true;
    if ((view === "gym-board" || view === "gym-members" || view === "gym-attendance" || view === "gym-trainers" || view === "gym-plans") && !isGymShop()) btn.hidden = true;
    if ((view === "bar-board" || view === "bar-counter" || view === "bar-products" || view === "bar-tables" || view === "bar-stock" || view === "bar-reports" || view === "bar-settings") && !isBarShop()) btn.hidden = true;
    if ((view === "resort-board" || view === "resort-rooms" || view === "resort-bookings" || view === "resort-desk" || view === "resort-housekeeping" || view === "resort-settings") && !isResortShop()) btn.hidden = true;
    if (view === "qr-orders" && isGymShop()) btn.hidden = true;
    if (view === "online-orders" && (isGymShop() || isPrintShop() || isPharmacyShop())) btn.hidden = true;
  });
  globalThis.POSBizHubUi?.paintIndustryNav?.();
  paintStaffRoleOptions();
  const growthBtn = $("open-growth");
  if (growthBtn) growthBtn.hidden = !(can("growth") || can("reports"));
  const offersBtn = $("open-offers");
  if (offersBtn) offersBtn.hidden = !(can("discount") || can("items") || can("growth"));
  document.querySelectorAll("#dash-shortcuts [data-dash-view], .an-chrome-nav [data-dash-view]").forEach((btn) => {
    const view = btn.dataset.dashView;
    const module = {
      counter: "counter",
      items: "items",
      stock: "stock",
      orders: "orders",
      customers: "customers",
      purchases: "purchases",
      "hub-purchases": "purchases",
      reports: "reports",
      settings: "settings",
      payments: "accounts",
      audit: "settings",
      bookings: "orders",
      "salon-board": "dashboard",
      "print-board": "dashboard",
      "print-orders": "orders",
      "gym-board": "dashboard",
      "bar-board": "dashboard",
      "bar-counter": "counter",
      growth: "growth",
      staff: "staff",
      branches: "settings",
    }[view];
    btn.hidden = module ? !can(module) : false;
  });
  applyCameraScannerVisibility();
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

const SETTINGS_SECTIONS = [
  "profile",
  "hardware",
  "tables",
  "aggregator",
  "timezone",
  "quick-add",
  "fast-mode",
  "branding",
  "payment",
  "invoice",
  "security",
  "backup",
];

function settingsSectionAllowed(name) {
  if (name === "tables") return isRestaurantShop();
  if (name === "aggregator") return isRestaurantShop() || isBarShop();
  return true;
}

function confirmLeaveSettings() {
  if (!state.settingsDirty) return true;
  return window.confirm("You have unsaved settings. Leave without saving?");
}

function markSettingsDirty() {
  state.settingsDirty = true;
}

function clearSettingsDirty() {
  state.settingsDirty = false;
  state.fastModePreview = null;
}

function showSettingsTab(tab) {
  let name = SETTINGS_SECTIONS.includes(tab) ? tab : "profile";
  if (!settingsSectionAllowed(name)) name = "profile";
  if (state.settingsSection && state.settingsSection !== name && !confirmLeaveSettings()) return false;
  const backup = name === "backup";
  const hardware = name === "hardware";
  const security = name === "security";
  if ($("settings-pane-profile")) $("settings-pane-profile").hidden = backup;
  if ($("settings-pane-hardware")) $("settings-pane-hardware").hidden = !hardware;
  if ($("settings-pane-backup")) $("settings-pane-backup").hidden = !backup;
  document.querySelectorAll("[data-set-section]").forEach((el) => {
    const keys = String(el.dataset.setSection || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!keys.length) return;
    el.hidden = !keys.includes(name);
  });
  if (!isApparelShop()) {
    document.querySelectorAll(".settings-hub .apparel-only").forEach((el) => {
      el.hidden = true;
    });
  }
  const split = document.querySelector(".settings-profile-split");
  if (split) {
    const form = split.querySelector("#settings-form");
    const side = split.querySelector(".settings-side");
    if (form) form.hidden = backup || hardware || security;
    if (side) side.hidden = !security;
  }
  document.querySelectorAll("[data-settings-tab]").forEach((btn) => {
    const on = btn.dataset.settingsTab === name;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  state.settingsSection = name;
  paintViewHeader(backup ? "backup" : hardware ? "devices" : "settings");
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    const view = btn.dataset.view;
    btn.classList.toggle("active", view === "settings" || (hardware && view === "devices"));
  });
  if (backup && $("btn-backup-download")) $("btn-backup-download").href = posUrl("/api/backup");
  if (hardware) loadDevices();
  if (name === "tables") paintTableShiftHistory();
  if (name === "aggregator") void loadAggregatorSettings();
  return true;
}

function showView(name) {
  if (name === "qr-orders" && isPharmacyShop()) name = "prescriptions";
  if (name === "prescriptions" && !isPharmacyShop()) name = can("counter") ? "counter" : landingView();
  if (name === "kot" && (!isRestaurantShop() || !can("kot"))) name = can("counter") ? "counter" : landingView();
  const requested = name;
  state.currentView = name === "backup" || name === "devices" ? (name === "devices" ? "devices" : "settings") : name;
  if (name === "backup" || name === "devices") name = "settings";
  document.querySelectorAll(".view").forEach((el) => {
    el.hidden = el.id !== `view-${name}`;
  });
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === name);
  });
  document.body.classList.toggle("counter-mode", name === "counter");
  document.body.classList.toggle("analytics-home", name === "dashboard");
  document.querySelector(".stage")?.classList.toggle("is-counter", name === "counter");
  const qcWrap = $("quick-customer-wrap");
  if (qcWrap && name === "counter") qcWrap.open = false;
  const page = document.getElementById(`view-${name}`);
  if (page) page.scrollTop = 0;
  paintViewHeader(name);
  if (name === "settings") {
    const tab = requested === "backup" ? "backup" : requested === "devices" ? "hardware" : state.settingsSection || "profile";
    showSettingsTab(tab);
  }
  if (name === "reports") {
    if (!viewStillFresh("reports", 90000)) loadReports();
    else globalThis.POSBizHubUi?.paintReportsCenter?.();
  }
  if (name === "growth") {
    if (!viewStillFresh("growth")) {
      loadGrowthDashboard();
      markViewFresh("growth");
    }
  }
  if (name === "accounts") loadAccounts();
  if (name === "expenses") loadExpenses();
  if (name === "orders") loadOrders();
  if (name === "returns") loadReturnsView();
  if (name === "qr-orders") loadQrOrders();
  if (name === "online-orders") loadAggregatorOrders();
  if (name === "prescriptions") loadPrescriptions();
  if (name === "kot") {
    loadKots();
    startKotWatch();
  }
  if (name === "purchases") loadPurchases();
  if (name === "suppliers") loadSuppliers();
  if (name === "support") renderSupport();
  if (name === "dashboard") {
    if (!viewStillFresh("dashboard")) loadDashboard();
    if (isGymShop()) globalThis.POSGymUi?.loadGymBoard?.();
    if (isBarShop()) globalThis.POSBarUi?.loadBarBoard?.();
    if (isResortShop()) globalThis.POSResortUi?.loadResortBoard?.();
  }
  if (name === "hub-sales") globalThis.POSBizHubUi?.paintModuleDesk?.("hub-sales-tiles", "sales");
  if (name === "hub-purchases") globalThis.POSBizHubUi?.paintModuleDesk?.("hub-purchases-tiles", "purchases");
  if (name === "payments") globalThis.POSBizHubUi?.paintPaymentsDesk?.();
  if (name === "audit") globalThis.POSBizHubUi?.loadAudit?.();
  if (name === "salon-board") {
    const portal = $("salon-portal-link");
    if (portal && state.businessMeta?.id) portal.href = `./salon.html?shop=${encodeURIComponent(state.businessMeta.id)}`;
    globalThis.POSSalonUi?.loadSalonBoard?.();
    const list = $("salon-report-list");
    if (list && globalThis.POSSalon?.REPORTS) {
      list.innerHTML = POSSalon.REPORTS.map((r) => `<button type="button" class="dash-tile" data-salon-report="${escapeHtml(r.id)}"><strong>${escapeHtml(r.title)}</strong></button>`).join("");
    }
  }
  if (name === "bookings") globalThis.POSSalonUi?.loadSalonBookings?.();
  if (name === "packages") globalThis.POSSalonUi?.loadSalonPackages?.();
  if (name === "print-board") {
    const portal = $("print-portal-link");
    if (portal && state.businessMeta?.id) portal.href = `./print.html?shop=${encodeURIComponent(state.businessMeta.id)}`;
    globalThis.POSPrintUi?.loadPrintBoard?.();
    const list = $("print-report-list");
    if (list && globalThis.POSPrint?.REPORTS) {
      list.innerHTML = POSPrint.REPORTS.map((r) => `<button type="button" class="dash-tile" data-print-report="${escapeHtml(r.id)}"><strong>${escapeHtml(r.title)}</strong></button>`).join("");
    }
  }
  if (name === "print-orders") globalThis.POSPrintUi?.loadPrintOrders?.();
  if (name === "print-production") {
    if ($("print-order-tab")) $("print-order-tab").value = "production";
    globalThis.POSPrintUi?.loadPrintOrders?.();
  }
  if (name === "print-settings") globalThis.POSPrintUi?.loadPrintSettings?.();
  if (name === "gym-board") {
    const portal = $("gym-portal-link");
    if (portal && state.businessMeta?.id) portal.href = `./gym.html?shop=${encodeURIComponent(state.businessMeta.id)}`;
    globalThis.POSGymUi?.loadGymBoard?.();
    const list = $("gym-report-list");
    if (list && globalThis.POSGym?.REPORTS) {
      list.innerHTML = POSGym.REPORTS.map((r) => `<button type="button" class="dash-tile" data-gym-report="${escapeHtml(r.id)}"><strong>${escapeHtml(r.title)}</strong></button>`).join("");
    }
  }
  if (name === "gym-members") globalThis.POSGymUi?.loadMembers?.();
  if (name === "gym-attendance") globalThis.POSGymUi?.loadAttendance?.();
  if (name === "gym-trainers") globalThis.POSGymUi?.loadTrainers?.();
  if (name === "gym-plans") globalThis.POSGymUi?.loadPlans?.();
  if (name === "bar-board") {
    globalThis.POSBarUi?.loadBarBoard?.();
    const list = $("bar-report-list");
    if (list && globalThis.POSBar?.REPORTS) {
      list.innerHTML = POSBar.REPORTS.map((r) => `<button type="button" class="dash-tile" data-bar-report="${escapeHtml(r.id)}"><strong>${escapeHtml(r.title)}</strong></button>`).join("");
    }
  }
  if (name === "bar-counter") globalThis.POSBarUi?.loadCounter?.();
  if (name === "bar-products") globalThis.POSBarUi?.loadProducts?.();
  if (name === "bar-tables") globalThis.POSBarUi?.loadTables?.();
  if (name === "bar-stock") globalThis.POSBarUi?.loadStock?.();
  if (name === "bar-reports") globalThis.POSBarUi?.loadBarBoard?.();
  if (name === "bar-settings") globalThis.POSBarUi?.loadSettings?.();
  if (name === "resort-board") globalThis.POSResortUi?.loadResortBoard?.();
  if (name === "resort-rooms") globalThis.POSResortUi?.loadRooms?.();
  if (name === "resort-bookings") globalThis.POSResortUi?.loadBookings?.();
  if (name === "resort-desk") globalThis.POSResortUi?.loadDesk?.();
  if (name === "resort-housekeeping") globalThis.POSResortUi?.loadHousekeeping?.();
  if (name === "resort-settings") globalThis.POSResortUi?.loadSettings?.();
  if (name === "counter" && isResortShop()) globalThis.POSResortUi?.loadInhouseFolio?.();
  paintDeskState(name);
  if (name === "stock") loadStock();
  if (name === "counter") {
    loadHolds();
    queueMicrotask(focusScanLane);
    maybeShowCounterLowStockAlert();
  } else {
    counterLowStockPrompted = false;
    closeLowStockModal();
  }
  if (name === "barcodes") {
    loadBarcodesView();
    queueMicrotask(() => $("bc-search")?.focus());
  }
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
    void refreshCustomersOutstanding();
  }
  if (name === "branches") loadBranches();
  if (name === "settings" && requested === "devices") loadDevices();
  paintImpersonationControls();
  applyCounterWorkspaceChrome();
}

function paintDeskState(name) {
  if (name === "units") renderUnitsTable();
  if (name === "items") {
    fillDatalists();
    renderItemsTable();
    fillItemUnitSelect($("item-unit")?.value || defaultItemUnit());
    refreshItemUnitLabels();
    paintItemImportLink();
    globalThis.POSItemMasterUi?.fillBrandLists?.();
  }
  if (name === "brands") {
    globalThis.POSItemMasterUi?.loadBrands?.();
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
    globalThis.POSCustomerMasterUi?.loadDupes?.();
  }
}

function setHint(msg, kind = "") {
  $("hint").textContent = msg || "";
  $("hint").className = `hint ${kind}`.trim();
}

let itemSaveToastTimer = 0;

function hideItemSaveToast() {
  const toast = $("item-save-toast");
  if (toast) toast.hidden = true;
  if (itemSaveToastTimer) {
    clearTimeout(itemSaveToastTimer);
    itemSaveToastTimer = 0;
  }
}

function showItemSaveToast(title, copy = "") {
  const toast = $("item-save-toast");
  if (!toast) return;
  const titleEl = $("item-save-toast-title");
  const copyEl = $("item-save-toast-copy");
  if (titleEl) titleEl.textContent = title || "Item created successfully";
  if (copyEl) {
    copyEl.textContent = copy || "";
    copyEl.hidden = !copy;
  }
  toast.hidden = false;
  if (itemSaveToastTimer) clearTimeout(itemSaveToastTimer);
  itemSaveToastTimer = setTimeout(hideItemSaveToast, 5000);
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
    extraCharges: state.extraCharges || 0,
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
    printWidth: line.printWidth ?? "",
    printHeight: line.printHeight ?? "",
    printDimUnit: line.printDimUnit || "",
    printCopies: Math.max(1, Number(line.printCopies) || 1),
    printFileId: line.printFileId || "",
    printFileName: line.printFileName || "",
    printCustomUnit: line.printCustomUnit || "",
    rate: line.rate != null && line.rate !== "" ? Number(line.rate) : undefined,
  };
}

function applyHoldToCart(payload, opts = {}) {
  const keep = Boolean(opts.keepHold);
  state.cart = (payload?.cart || []).map(cartLineFromHold).filter((l) => l.itemId && l.qtyGm > 0);
  state.billDiscountType = payload.billDiscountType || "amt";
  state.billDiscountValue = Number(payload.billDiscountValue) || 0;
  state.extraCharges = Number(payload.extraCharges) || 0;
  state.loyaltyRedeem = Number(payload.loyaltyRedeem) || 0;
  if ($("bill-disc-type")) $("bill-disc-type").value = state.billDiscountType;
  if ($("bill-disc-value")) $("bill-disc-value").value = state.billDiscountValue;
  if ($("print-extra-charges")) $("print-extra-charges").value = state.extraCharges;
  if ($("loyalty-redeem")) $("loyalty-redeem").value = state.loyaltyRedeem;
  if (payload.customerId) state.customerId = payload.customerId;
  state.lastPack = payload.lastPack || null;
  if (payload.customerId) $("customer").value = payload.customerId;
  if (payload.lastPack?.id) $("pack-choice").value = payload.lastPack.id;
  else if ($("pack-choice")) $("pack-choice").value = "";
  state.kotPrinted = Array.isArray(payload.kotPrinted) ? payload.kotPrinted : [];
  state.activeQrOrderId = payload.qrOrderId || "";
  clampCartToAvailableStock();
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
  return Boolean(
    R.tableOccupied(state.held, qrOrderCache, tableId, {
      activeTable: state.activeTable,
      cartCount: state.cart.length,
    }),
  );
}

function tableLiveLabel(tableId) {
  const R = restaurantApi();
  if (!tableIsBusy(tableId)) return "Available";
  const want = R?.normalizeTableNo?.(tableId) || String(tableId || "");
  const open = (qrOrderCache || []).filter(
    (order) => (R?.qrOrderOpen ? R.qrOrderOpen(order) : true) && R?.normalizeTableNo?.(order.table_no) === want,
  );
  if (open.some((o) => o.status === "ready")) return "Ready";
  if (open.some((o) => o.status === "preparing")) return "Preparing";
  if (open.some((o) => o.status === "kot_sent")) return "Occupied";
  if (open.some((o) => o.status === "accepted")) return "Order Accepted";
  if (open.some((o) => o.status === "pending")) return "Order Received";
  if (R?.findTableHolds?.(state.held, tableId)?.some((row) => R.holdIsActive?.(row) !== false) || (state.activeTable === tableId && state.cart.length)) {
    return state.activeTable === tableId && state.cart.length ? `${state.cart.length} dishes` : "Occupied";
  }
  return "Occupied";
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
  const canShiftActive =
    tableShiftingEnabled() &&
    state.activeTable &&
    state.activeTable !== R.PARCEL &&
    (tableIsBusy(state.activeTable) || state.cart.length > 0);
  const addRow =
    manage || tableShiftingEnabled()
      ? `<div class="dining-add-row">
        ${tableShiftingEnabled() ? `<button class="btn dining-add-btn" type="button" data-shift-active ${canShiftActive ? "" : "disabled"}>Shift Table</button>` : ""}
        ${manage ? `<button class="btn dining-add-btn" type="button" data-add-floor>+ Floor</button>
        <button class="btn dining-add-btn" type="button" data-add-table>+ Table</button>` : ""}
      </div>`
      : "";
  const selectedLabel = state.activeTable && R ? R.displayTable(state.activeTable) : "Select a table";
  const tablesUser = el.dataset.tablesUser || "";
  el.hidden = false;
  el.innerHTML =
    `<div class="table-board-head">
      <div>
        <strong>${escapeHtml(floorName)}</strong>
        <span>${escapeHtml(meta)}</span>
      </div>
      <button class="table-board-toggle" type="button" data-tables-toggle aria-expanded="true">
        <span>
          <strong>${escapeHtml(selectedLabel)}</strong>
          <span>${state.activeTable ? "Tap to change table" : escapeHtml(meta)}</span>
        </span>
      </button>
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
    ${tableShiftingEnabled() && state.shiftFromTable ? paintTableShiftPicker(state.shiftFromTable, tables, R) : ""}
    <div class="table-seats">${
      onFloor
        .map((t) => {
          const hold = R.findTableHold(state.held, t.id);
          const payload = hold ? R.holdPayload(hold) || {} : {};
          const dishes = (payload.cart || []).length;
          const on = state.activeTable === t.id;
          const busy = tableIsBusy(t.id);
          const metaLine = tableLiveLabel(t.id);
          return `<div class="table-seat-wrap">
            <button class="table-seat${on ? " is-on" : ""}${busy ? " is-busy" : ""}" type="button" data-table="${escapeHtml(t.id)}">
              <strong>${escapeHtml(t.name || R.displayTable(t.id))}</strong>
              <span>${escapeHtml(on && state.cart.length ? `${state.cart.length} dishes` : metaLine)}</span>
            </button>
            ${manage ? `<button class="table-seat-edit" type="button" data-edit-table-btn="${escapeHtml(t.id)}" title="Rename table" aria-label="Rename ${escapeHtml(t.name || t.id)}">✎</button>` : ""}
            ${tableShiftingEnabled() && busy && t.id !== R.PARCEL ? `<button class="table-seat-shift" type="button" data-shift-table="${escapeHtml(t.id)}" title="Shift table">Shift</button>` : ""}
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
  if (tablesUser) el.dataset.tablesUser = tablesUser;
  applyRestaurantMobileChrome();
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
  const rows = R.findTableHolds ? R.findTableHolds(state.held, tableNo) : [R.findTableHold(state.held, tableNo)].filter(Boolean);
  for (const hold of rows) {
    if (!hold?.id) continue;
    try {
      await api(`/api/holds/${encodeURIComponent(hold.id)}`, { method: "DELETE" });
    } catch {
      /* already gone */
    }
  }
  try {
    await api("/api/tables/vacate", { method: "POST", body: JSON.stringify({ table_no: tableNo }) });
  } catch {
    /* optional on older servers */
  }
  await loadHolds();
}

function paintTableShiftPicker(fromId, tables, R) {
  const src = R.normalizeTableNo(fromId);
  const fromName = R.displayTable(src);
  const choices = tables
    .map((t) => {
      const id = t.id;
      const busy = tableIsBusy(id);
      const isFrom = id === src;
      const occupied = busy && !isFrom;
      const label = occupied ? "Occupied" : isFrom ? "Current" : "Available";
      return `<button class="table-shift-choice${occupied ? " is-busy" : ""}${isFrom ? " is-from" : ""}" type="button" data-shift-to="${escapeHtml(id)}" ${occupied || isFrom ? "disabled" : ""}>
        <strong>${escapeHtml(t.name || R.displayTable(id))}</strong>
        <span>${escapeHtml(label)}</span>
      </button>`;
    })
    .join("");
  return `<form class="table-shift-picker" data-shift-picker>
    <p><strong>Shift Table</strong> — ${escapeHtml(fromName)} to a free table</p>
    <div class="table-shift-choices">${choices || "<p class='hint'>No other tables on this floor plan.</p>"}</div>
    <button class="btn" type="button" data-cancel-shift>Cancel</button>
  </form>`;
}

function liveQrOrderIdForTable(tableNo) {
  const R = restaurantApi();
  const want = R?.normalizeTableNo?.(tableNo) || "";
  if (!want || want === R?.PARCEL) return "";
  const open = (qrOrderCache || []).find((order) => {
    if (R?.qrOrderOpen) return R.qrOrderOpen(order) && R.normalizeTableNo(order.table_no) === want;
    return !order.sales_order_id && !["cancelled", "rejected", "completed"].includes(String(order.status || "").toLowerCase()) && R.normalizeTableNo(order.table_no) === want;
  });
  return open?.id || "";
}

function bindQrOrderAfterTableShift(tableNo) {
  const R = restaurantApi();
  const hold = R?.findTableHold?.(state.held, tableNo);
  const payload = hold ? holdPayload(hold) : null;
  const fromHold = payload?.qrOrderId || "";
  const live = liveQrOrderIdForTable(tableNo);
  const cached = fromHold && (qrOrderCache || []).find((row) => row.id === fromHold);
  if (cached && !R?.qrOrderOpen?.(cached)) {
    state.activeQrOrderId = live;
    return;
  }
  state.activeQrOrderId = live || (cached ? fromHold : "") || "";
}

let shiftingTable = false;
async function confirmAndShiftTable(fromId, toId) {
  const R = restaurantApi();
  if (!R || shiftingTable) return;
  const check = R.canShiftTable(state.held, qrOrderCache, fromId, toId, tableShiftOpts());
  if (!check.ok) throw new Error(check.error);
  const fromName = R.displayTable(check.from);
  const toName = R.displayTable(check.to);
  if (!window.confirm(`Move the active order from ${fromName} to ${toName}?`)) return;
  shiftingTable = true;
  saveTableHoldDebounced.cancel?.();
  try {
    if (state.activeTable === check.from && state.cart.length) await saveActiveTableHold();
    const key = globalThis.POSPayIntegrity?.newKey?.() || `shift-${Date.now()}`;
    const data = await api("/api/table-shift/", {
      method: "POST",
      body: JSON.stringify({
        from_table: check.from,
        to_table: check.to,
        idempotencyKey: key,
        order_id: state.openTableOrderId || undefined,
      }),
    });
    if (R.applyShiftLocal) {
      const moved = R.applyShiftLocal(state.held, qrOrderCache, state.kotTickets, check.from, check.to);
      state.held = moved.holds;
      qrOrderCache = moved.qrOrders;
      if (Array.isArray(moved.kots)) state.kotTickets = moved.kots;
    }
    state.shiftFromTable = "";
    if (state.activeTable === check.from) {
      state.activeTable = check.to;
      syncActiveFloor(check.to);
    }
    await Promise.all([
      loadHolds(),
      loadKots().catch((err) => {
        setHint(`Order moved. Kitchen board refresh failed: ${err.message}`, "error");
      }),
      loadQrOrders().catch(() => {}),
    ]);
    bindQrOrderAfterTableShift(check.to);
    renderCart();
    renderTableBoard();
    setHint(`Order moved from ${fromName} to ${toName}`, "ok");
    return data;
  } finally {
    shiftingTable = false;
  }
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
    state.activeQrOrderId = "";
    if ($("pack-choice")) $("pack-choice").value = "";
  }
  state.activeTable = next;
  syncActiveFloor(next);
  bindQrOrderAfterTableShift(next);
  const board = $("table-board");
  if (board && isRestaurantMobileLayout()) board.dataset.tablesUser = "shut";
  if (isRestaurantMobileLayout()) setBillCollapsed(true);
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

function sameKotLine(a, b) {
  const R = restaurantApi();
  const key = R?.kotLineKey;
  if (key) return key(a) === key(b);
  const idA = String(a?.itemId || a?.item_id || "");
  const idB = String(b?.itemId || b?.item_id || "");
  const nA = String(a?.notes || a?.special_instruction || "").trim();
  const nB = String(b?.notes || b?.special_instruction || "").trim();
  return idA === idB && nA === nB;
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
    const live = source.find((row) => sameKotLine(row, line)) || line;
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

let sendingKot = false;
async function sendKitchenKot() {
  if (sendingKot) return;
  sendingKot = true;
  const btn = $("btn-kot");
  if (btn) btn.disabled = true;
  try {
  ensureDiningTable();
  const resolved = resolveKitchenKot({ tableNo: state.activeTable, lines: state.cart, printed: state.kotPrinted });
  if (resolved.pick.kind === "reprint") {
    writeKitchenKotWindow(resolved);
    setHint("Kitchen KOT reprint", "ok");
    return;
  }
  const data = await api("/api/kots", {
    method: "POST",
    body: JSON.stringify({
      table_no: resolved.tableNo,
      kind: resolved.pick.kind,
      lines: resolved.named,
    }),
  });
  const ticketId = data?.ticket?.id;
  if (ticketId) {
    if (!kotSeenIds) kotSeenIds = new Set();
    kotSeenIds.add(String(ticketId));
    try {
      kotChannel()?.postMessage({ type: "kot-new", ticket: data.ticket });
    } catch {
      /* ignore */
    }
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
  } finally {
    sendingKot = false;
    if (btn) btn.disabled = false;
  }
}

function kotStatusLabel(status) {
  const s = String(status || "new");
  if (s === "preparing") return "Preparing";
  if (s === "ready") return "Ready";
  if (s === "done") return "Served";
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
  if (next === "preparing") return "Start Preparing";
  if (next === "ready") return "Mark Ready";
  if (next === "done") return "Served";
  return "";
}

function kotQtyTimes(line) {
  const q = Number(line.qtyGm || line.quantity_gm) || 0;
  const unit = String(line.unit || "PCS").toUpperCase();
  if (unit === "PCS" || unit === "PC") return `× ${q % 1 ? q : q}`;
  return kotQtyLine(line);
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
          const kotNo = String(ticket.kot_number || "").trim();
          const ident = kotNo || table;
          const shortId = !kotNo && ticket.id ? String(ticket.id).replace(/-/g, "").slice(0, 8) : "";
          const meta = [kotNo ? table : kind, shortId, when].filter(Boolean).join(" · ");
          return `<article class="kot-card is-${escapeHtml(ticket.status || "new")}${String(ticket.status || "new") === "new" && kotAckIds && !kotAckIds.has(String(ticket.id)) ? " is-flash" : ""}" data-kot="${escapeHtml(ticket.id)}">
            <header class="kot-card-head">
              <div>
                <h3>${escapeHtml(ident)}</h3>
                <p class="kot-meta">${escapeHtml(meta)}</p>
              </div>
              <div class="kot-head-right">
                ${kotTimerHtml(ticket)}
                <span class="kot-status is-${escapeHtml(ticket.status || "new")}">${escapeHtml(kotStatusLabel(ticket.status))}</span>
              </div>
            </header>
            <div class="kot-lines">${(ticket.lines || [])
              .map((line) => {
                const si = String(line.notes || line.special_instruction || "").trim();
                return `<div class="kot-line"><span>${escapeHtml(line.name || "Item")}${si ? `<small class="kot-si">${escapeHtml(si)}</small>` : ""}</span><strong>${escapeHtml(kotQtyTimes(line))}</strong></div>`;
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
    : `<div class="item-empty-card"><strong>No kitchen tickets</strong><p>QR table orders and Counter Kitchen KOT land here. Keep this page open on kitchen terminals for the ding.</p></div>`;
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
let kotAckIds = null;
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
  const R = restaurantApi();
  const list = R?.uniqueKotTickets?.(rows) || (Array.isArray(rows) ? rows : []).filter((row, i, all) => {
    const id = String(row?.id || "");
    return id && all.findIndex((r) => String(r?.id || "") === id) === i;
  });
  if (kotAckIds == null) {
    kotAckIds = new Set(list.filter((row) => String(row.status || "new") === "new").map((row) => String(row.id)).filter(Boolean));
  }
  const incoming = list.filter(
    (row) => row?.id && String(row.status || "new") === "new" && !kotAckIds.has(String(row.id)),
  );
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
  let kotTick = 0;
  kotPollTimer = setInterval(() => {
    kotTick += 1;
    const hot = state.currentView === "kot" || state.currentView === "counter";
    if (!hot && kotTick % (fastModeOn() ? 8 : 4) !== 0) return;
    void loadKots({ announce: true });
  }, 2500);
  $("view-kot")?.addEventListener("pointerdown", () => {
    if (globalThis.POSQrNotify?.needsUnlock?.()) armQrOrderSound();
  });
  try {
    kotChannel()?.addEventListener("message", (ev) => {
      if (ev.data?.type === "kot-new" && ev.data.ticket) {
        const incoming = ev.data.ticket;
        const id = String(incoming?.id || "");
        if (!id) return;
        const list = [incoming, ...(state.kotTickets || []).filter((row) => String(row.id) !== id)];
        applyKotSnapshot(list, { announce: true });
      }
    });
  } catch {
    /* BroadcastChannel optional */
  }
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
  return sendQrKitchenKot(order);
}

async function sendQrKitchenKot(order) {
  if (sendingKot) return;
  sendingKot = true;
  try {
  const R = restaurantApi();
  if (!R || !order) return;
  const lines = (order.lines || []).map((line) => ({
    itemId: line.item_id,
    qtyGm: Number(line.quantity_gm) || 0,
    name: line.item_name,
    unit: line.unit || "PCS",
    notes: String(line.notes || "").trim(),
  }));
  if (!lines.length) throw new Error("Nothing to send to kitchen");
  const data = await api("/api/kots", {
    method: "POST",
    body: JSON.stringify({
      table_no: restaurantApi()?.normalizeTableNo?.(order.table_no) || order.table_no,
      kind: "new",
      lines,
      notes: order.notes || "",
      qr_order_id: order.id,
    }),
  });
  const ticketId = data?.ticket?.id;
  if (ticketId) {
    if (!kotSeenIds) kotSeenIds = new Set();
    kotSeenIds.add(String(ticketId));
    try {
      kotChannel()?.postMessage({ type: "kot-new", ticket: data.ticket });
    } catch {
      /* ignore */
    }
  }
  if (order.status === "accepted") order.status = "kot_sent";
  try {
    printKitchenKot({
      tableNo: order.table_no,
      lines,
      printed: [],
      notes: order.notes,
      full: true,
    });
  } catch {
    /* ticket is already on the kitchen board */
  }
  setHint("Kitchen KOT sent. Kitchen board and ding update on kitchen terminals.", "ok");
  return data?.ticket;
  } finally {
    sendingKot = false;
  }
}

function kotChannel() {
  try {
    if (!globalThis.BroadcastChannel) return null;
    if (!globalThis.__atavKotCh) globalThis.__atavKotCh = new BroadcastChannel("atav-kot");
    return globalThis.__atavKotCh;
  } catch {
    return null;
  }
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
  clampCartToAvailableStock();
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
  const exact = q ? findItemByBarcode(state.query) : null;
  if (exact) return [exact];
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

const CATALOG_RENDER_LIMIT = 96;
const ITEMS_PAGE_LIMIT = 200;
const STOCK_PAGE_LIMIT = 200;

function listRenderHint(shown, total, extra) {
  if (!(shown < total)) return "";
  return `<p class="hint catalog-more">Showing ${shown} of ${total}${extra || ". Search to find the rest."}</p>`;
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
  const src = fastModeOn() ? "" : itemPhotoUrl(item);
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
  const print = isPrintShop();
  const qty = restaurant || print ? "" : fmtQty(i.stock_gm, i);
  const stock = restaurant || print
    ? (Number(i.gst_rate) ? `GST ${escapeHtml(i.gst_rate)}%` : "")
    : `${escapeHtml(i.code)} · GST ${escapeHtml(i.gst_rate)}%`;
  return `<button class="card" type="button" data-add="${escapeHtml(i.id)}">
        ${cardPhotoHtml(i)}
        <div class="card-body">
          ${meta.sku ? `<div class="sku">${escapeHtml(meta.sku)}</div>` : ""}
          <div class="name">${escapeHtml(i.name)}${meta.detail ? ` <small>${escapeHtml(meta.detail)}</small>` : ""}</div>
          <div class="meta"><span class="card-price">${money(rateFor(i))}${restaurant && isRestaurantMobileLayout() ? "" : escapeHtml(POSUnits.rateSuffix(itemUnit(i)))}</span>${qty ? `<span class="card-qty">${escapeHtml(qty)}</span>` : ""}</div>
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

function lowStockThreshold(company = state.company) {
  const raw = company?.low_stock_threshold;
  if (raw == null || raw === "") return 5;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(9999, Math.round(n)));
}

function itemStockInfo(item) {
  const stock = Number(item?.stock_gm) || 0;
  const out = stock <= 0;
  let low = false;
  if (!out) {
    if (isApparelShop()) {
      const reorder = Number(item?.reorder_level_gm) || 0;
      low = reorder > 0 ? stock <= reorder : stock <= lowStockThreshold();
    } else {
      const reorder = Number(item?.reorder_level_gm) || 0;
      low = reorder > 0 && stock <= reorder;
    }
  }
  return {
    stock,
    label: fmtQty(stock, item),
    out,
    low,
    tone: out ? "out" : low ? "low" : "ok",
  };
}

function shouldCapBillStock(item) {
  return isApparelShop() && Boolean(item);
}

function itemOnHandBase(item) {
  return Math.max(0, Number(item?.stock_gm) || 0);
}

function cartQtyForItem(itemId, exceptKey) {
  const skip = exceptKey == null ? "" : String(exceptKey);
  return (state.cart || []).reduce((sum, line) => {
    if (String(line.itemId) !== String(itemId)) return sum;
    if (skip && cartLineKey(line) === skip) return sum;
    return sum + (Number(line.qtyGm) || 0);
  }, 0);
}

function maxBillQtyForItem(item, exceptKey) {
  if (!item || !shouldCapBillStock(item)) return POSUnits.qtyMax();
  return Math.max(0, itemOnHandBase(item) - cartQtyForItem(item.id, exceptKey));
}

function stockCapHint(item) {
  const unit = POSUnits.qtySuffix(itemUnit(item));
  const have = POSUnits.displayQty(itemOnHandBase(item), itemUnit(item));
  if (itemOnHandBase(item) <= 0) return `${item?.name || "Item"}: out of stock`;
  return `Only ${have} ${unit} available. Maximum quantity is ${have}.`;
}

function lowStockScanHint(item) {
  const unit = POSUnits.qtySuffix(itemUnit(item));
  const have = POSUnits.displayQty(itemOnHandBase(item), itemUnit(item));
  if (itemOnHandBase(item) <= 0) return `${item?.name || "Item"}: out of stock`;
  return `⚠️ Only ${have} ${unit} remaining.`;
}

function garmentStockAlertRows() {
  const items = (state.items || []).filter((i) => i && i.status !== "inactive");
  const low = [];
  const out = [];
  for (const item of items) {
    const info = itemStockInfo(item);
    const row = {
      id: item.id,
      name: item.name || "Item",
      barcode: barcodeText(item.barcode) || barcodeText(item.item_barcode) || "",
      variant: itemVariantText(item),
      stock: info.stock,
      label: info.label,
      out: info.out,
      low: info.low,
    };
    if (info.out) out.push(row);
    else if (info.low) low.push(row);
  }
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" });
  low.sort(byName);
  out.sort(byName);
  return { low, out, total: low.length + out.length };
}

function lowStockTableHtml(rows, kind) {
  if (!rows.length) return "";
  const body = rows.map((r) => `<tr class="is-${kind}">
    <td>${escapeHtml(r.name)}</td>
    <td class="classic-barcode">${escapeHtml(r.barcode || "—")}</td>
    <td>${escapeHtml(r.variant || "—")}</td>
    <td class="low-stock-qty">${escapeHtml(kind === "out" ? "Out of Stock" : r.label)}</td>
  </tr>`).join("");
  return `<table class="low-stock-table">
    <thead><tr><th>Item</th><th>Barcode</th><th>Colour / Size</th><th>Stock</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function paintLowStockBell() {
  const btn = $("counter-low-stock-btn");
  const countEl = $("counter-low-stock-count");
  if (!btn) return;
  if (!isApparelShop() || !document.body.classList.contains("counter-mode")) {
    btn.hidden = true;
    return;
  }
  const { total, out } = garmentStockAlertRows();
  btn.hidden = false;
  btn.classList.toggle("is-alert", total > 0);
  btn.title = total ? `Low stock (${total})` : "Low stock";
  btn.setAttribute("aria-label", btn.title);
  if (countEl) {
    countEl.hidden = total <= 0;
    countEl.textContent = total > 99 ? "99+" : String(total);
  }
  btn.classList.toggle("is-out", out.length > 0);
}

function closeLowStockModal() {
  const modal = $("low-stock-modal");
  if (modal) modal.hidden = true;
}

function openLowStockModal() {
  if (!isApparelShop()) return;
  const body = $("low-stock-body");
  const modal = $("low-stock-modal");
  if (!body || !modal) return;
  const { low, out } = garmentStockAlertRows();
  if (!low.length && !out.length) {
    body.innerHTML = `<p class="low-stock-empty">All active garments are above the low-stock threshold.</p>`;
  } else {
    const parts = [];
    if (low.length) parts.push(`<section class="low-stock-section"><h4>Low Stock</h4>${lowStockTableHtml(low, "low")}</section>`);
    if (out.length) parts.push(`<section class="low-stock-section"><h4>Out of Stock</h4>${lowStockTableHtml(out, "out")}</section>`);
    body.innerHTML = parts.join("");
  }
  modal.hidden = false;
  paintLowStockBell();
}

let counterLowStockPrompted = false;

function maybeShowCounterLowStockAlert({ force = false } = {}) {
  if (!isApparelShop()) {
    paintLowStockBell();
    return;
  }
  paintLowStockBell();
  const { total } = garmentStockAlertRows();
  if (!total) {
    if (force) openLowStockModal();
    return;
  }
  if (!force && counterLowStockPrompted) return;
  counterLowStockPrompted = true;
  openLowStockModal();
}

async function refreshCatalogStock() {
  const data = await api("/api/bootstrap");
  if (Array.isArray(data?.items)) state.items = data.items;
  if (data?.company) state.company = { ...state.company, ...data.company };
}

function clampBillQty(item, want, exceptKey) {
  if (isPrintAreaItem(item)) {
    const next = printApi()?.clampArea?.(want) ?? (Number(want) || 0);
    if (!shouldCapBillStock(item)) return next;
    return Math.min(next, printApi()?.clampArea?.(maxBillQtyForItem(item, exceptKey)) ?? next);
  }
  const next = POSUnits.clampQty(want);
  if (!shouldCapBillStock(item)) return next;
  return Math.min(next, POSUnits.clampQty(maxBillQtyForItem(item, exceptKey)));
}

function assertCartWithinStock() {
  if (!isApparelShop()) return;
  const want = new Map();
  for (const line of state.cart || []) {
    const id = String(line.itemId || "");
    if (!id) continue;
    want.set(id, (want.get(id) || 0) + (Number(line.qtyGm) || 0));
  }
  for (const [id, qty] of want) {
    const item = (state.items || []).find((i) => String(i.id) === id);
    if (!item) continue;
    const stock = itemOnHandBase(item);
    if (qty > stock + 1e-9) throw new Error(stockCapHint(item));
  }
}

function clampCartToAvailableStock() {
  if (!isApparelShop()) return false;
  let changed = false;
  for (const line of state.cart || []) {
    const item = (state.items || []).find((i) => i.id === line.itemId);
    if (!item) continue;
    const next = clampBillQty(item, line.qtyGm, cartLineKey(line));
    if (next < Number(line.qtyGm)) {
      line.qtyGm = next;
      changed = true;
      setHint(stockCapHint(item), "error");
    }
  }
  const before = (state.cart || []).length;
  state.cart = (state.cart || []).filter((l) => Number(l.qtyGm) > 0);
  return changed || state.cart.length !== before;
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
    if (shouldCapBillStock(item) && cartQtyForItem(item.id) > itemOnHandBase(item) + 1e-9) out.push(item.name);
    else if (stock.out) out.push(item.name);
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
  const rawHits = filteredItems();
  const rows = isApparelShop() && garmentCounterApi()
    ? garmentCounterApi().collapseCatalog(rawHits, activeItems(), q).slice(0, 12)
    : rawHits.slice(0, 12).map((item) => ({ kind: "item", item }));
  if (!rows.length) {
    if (!quickAddVisible()) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.innerHTML = `<button type="button" class="classic-hit classic-hit-add" data-counter-add-item="${escapeHtml(q)}">
      <span class="classic-hit-main"><strong>Add “${escapeHtml(q)}” as a new item</strong><em>Save to catalog and put it on this bill</em></span>
    </button>`;
    return;
  }
  box.hidden = false;
  box.innerHTML = rows.map((row) => {
    if (row.kind === "picker") {
      const item = row.item;
      const sizes = (row.sizes || []).join(" ");
      const colors = (row.colors || []).join(", ");
      const price = row.priceMin === row.priceMax ? money(row.priceMin) : `${money(row.priceMin)}+`;
      return `<button type="button" class="classic-hit" data-size-pick="${escapeHtml(item.id)}" data-size-color="${escapeHtml(row.preferredId ? item.color || "" : "")}" data-size="${escapeHtml(row.preferredId ? item.size || "" : "")}">
      <span class="classic-hit-main"><strong>${escapeHtml(item.name)}</strong><em>${escapeHtml([colors, sizes].filter(Boolean).join(" · "))}</em></span>
      <span class="classic-hit-stock">${escapeHtml(String(row.stock ?? ""))}</span>
      <span class="classic-hit-exp">Size</span>
      <span class="classic-hit-rate">${escapeHtml(price)}</span>
    </button>`;
    }
    const i = row.item || row;
    const { stock, exp } = classicItemAlerts(i);
    const extra = isPharmacyShop()
      ? [i.batch_no, classicDateOnly(exp.date) || exp.short].filter(Boolean).join(" · ")
      : itemVariantText(i);
    const expText = classicDateOnly(exp.date) || "";
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
  const allRows = filteredItems();
  if (!allRows.length) {
    const q = String(state.query || "").trim();
    const addBtn = quickAddVisible()
      ? ` <button class="btn primary" type="button" data-counter-add-item="${escapeHtml(q)}">Add item</button>`
      : "";
    root.innerHTML = `<div class="catalog-empty">${
      q ? `No items match “${escapeHtml(q)}”.` : "No items in this shop yet."
    }${addBtn}</div>`;
    return;
  }
  const limit = String(state.categoryFilter || "").trim() || String(state.query || "").trim()
    ? (fastModeOn() ? 80 : 160)
    : (fastModeOn() ? 48 : CATALOG_RENDER_LIMIT);
  const rows = allRows.slice(0, limit);
  const moreHint = listRenderHint(rows.length, allRows.length, ". Search or pick a category to narrow.");
  const grouped = new Map();
  for (const i of rows) {
    const key = itemCategoryLabel(i);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(i);
  }
  const keys = [...grouped.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  if (isRestaurantShop() && String(state.categoryFilter || "")) {
    root.innerHTML = `${moreHint}<div class="catalog-group-grid">${rows.map(catalogCardHtml).join("")}</div>`;
    return;
  }
  root.innerHTML = `${moreHint}${keys
    .map((key) => {
      const items = grouped.get(key);
      return `<section class="catalog-group">
      <h3 class="catalog-group-head">${escapeHtml(key)} <span>${items.length}</span></h3>
      <div class="catalog-group-grid">${items.map(catalogCardHtml).join("")}</div>
    </section>`;
    })
    .join("")}`;
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
        discountType: state.billDiscountType || "amt",
        discountValue: state.billDiscountValue,
      })
    : { subtotal: lines.reduce((s, l) => s + l.taxable, 0), gst: lines.reduce((s, l) => s + l.gst, 0), billDiscount: 0, total: 0, profit: 0 };
  let loyaltyDiscount = 0;
  if (L && state.loyaltySettings && state.loyaltyRedeem > 0) {
    const check = L.canRedeem(state.loyaltyAccount?.points_balance || 0, state.loyaltyRedeem, state.loyaltySettings);
    if (check.ok) loyaltyDiscount = Math.min(bill.total, check.rupees);
  }
  const extra = isPrintShop() ? round2safe(Number(state.extraCharges) || 0) : 0;
  const total = D.round2(Math.max(0, bill.total - loyaltyDiscount + extra));
  const qty = state.cart.reduce((s, l) => s + (Number(l.qtyGm) || 0), 0);
  return {
    qty,
    taxable: bill.subtotal,
    tax: bill.gst,
    discount: bill.billDiscount,
    extra,
    lineDiscount: lines.reduce((s, l) => s + (l.discount || 0), 0),
    loyalty: loyaltyDiscount,
    profit: D.round2((bill.profit || 0) - loyaltyDiscount),
    total,
  };
}

function round2safe(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function restaurantLineNoteHtml(line, key) {
  return lineDescriptionHtml(line, key, isRestaurantShop() ? "Special Instruction" : "Item Description");
}

function lineDescriptionHtml(line, key, label) {
  const note = String(line.notes || "");
  const open = Boolean(line.noteOpen) || Boolean(note.trim());
  const title = label || (isRestaurantShop() ? "Special Instruction" : "Item Description");
  const ph = isRestaurantShop() ? "No onion, extra cheese" : "Package, service, or other details";
  if (open) {
    return `<label class="line-si line-desc"><span>${escapeHtml(title)}</span><textarea data-line-note="${escapeHtml(key)}" maxlength="500" rows="2" placeholder="${escapeHtml(ph)}">${escapeHtml(note)}</textarea></label>`;
  }
  return `<button class="line-si-btn" type="button" data-note-open="${escapeHtml(key)}">Add ${escapeHtml(title)}</button>`;
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
  const hadCart = document.body.classList.contains("has-cart");
  applyOffersToCart();
  const packEl = $("chosen-pack");
  const packText = packLabel();
  if (packEl) {
    packEl.textContent = packText;
    packEl.hidden = !packText;
  }
  if ($("ticket-sub")) {
    $("ticket-sub").textContent = state.cart.length
      ? isRestaurantMobileLayout()
        ? `${state.cart.length} item${state.cart.length === 1 ? "" : "s"}`
        : `${state.cart.length} line${state.cart.length === 1 ? "" : "s"}`
      : isRestaurantShop()
        ? restaurantTicketHint()
        : emptyTicketHint();
  }
  $("lines")?.classList.toggle("is-empty", !state.cart.length);
  if (!state.cart.length) {
    $("lines").innerHTML = isRestaurantShop()
      ? isRestaurantMobileLayout()
        ? cafeMobileEmptyHtml()
        : cafeBillEmptyHtml()
      : `<p class="catalog-empty lines-empty">${escapeHtml(emptyTicketHint())}</p>`;
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
          <td class="pharm-med">${escapeHtml(item.name)}${packBit ? `<small>${escapeHtml(packBit)} · ${escapeHtml(alert.stock.label)}</small>` : `<small>${escapeHtml(alert.stock.label)}</small>`}${lineDescriptionHtml(line, key)}</td>
          <td class="exp-cell">${escapeHtml(preview.batchNo || "—")}<small>${escapeHtml(preview.expiry || "—")}${alert.exp.expired ? " · EXP" : alert.exp.soon ? ` · ${escapeHtml(alert.exp.label)}` : ""}</small></td>
          <td>
            <div class="qty">
              <button type="button" data-chg="${escapeHtml(key)}" data-d="${-step}">−</button>
              <input class="qty-input" type="number" inputmode="decimal" min="${POSUnits.displayQty(POSUnits.qtyMin(), unitCode) || 0.001}" max="${POSUnits.qtyMax()}" step="${escapeHtml(qtyStep)}" value="${escapeHtml(qtyShow)}" data-qty="${escapeHtml(key)}" aria-label="Quantity in ${unit}" />
              <button type="button" data-chg="${escapeHtml(key)}" data-d="${step}">+</button>
              ${isScaleEnabled() && isWeightItem(item) ? `<button type="button" class="scale-line-btn" data-scale-line="${escapeHtml(key)}" title="Read scale">⚖</button>` : ""}
            </div>
          </td>
          <td class="pharm-n pharm-rate">${lineRateFieldHtml(item, line, key)}</td>
          <td class="line-disc-cell">${classicLineDiscHtml(line, key)}</td>
          <td class="pharm-n" data-line-amt="${escapeHtml(key)}">${escapeHtml(money(calc.taxable + calc.gst))}</td>
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
        <th>Barcode</th>
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
        const barcode = lineBarcodeText(line, item);
        const stockMax = maxBillQtyForItem(item, key);
        const qtyMaxShow = POSUnits.displayQty(stockMax, unitCode);
        const atStockMax = shouldCapBillStock(item) && Number(line.qtyGm) >= stockMax;
        return `<tr class="tone-${alert.stock.tone} exp-${alert.exp.tone}">
          <td class="pharm-n">${idx + 1}</td>
          <td>${escapeHtml(item.code || item.hsn || "—")}</td>
          <td class="pharm-med">${escapeHtml(item.name)}${garmentCartCaptionHtml(item)}${lineDescriptionHtml(line, key)}</td>
          <td class="classic-barcode">${barcode ? escapeHtml(barcode) : "—"}</td>
          <td>${garmentSwatchHtml(item.color, item.color_image)}${escapeHtml(variant || "—")}${alert.exp.expired ? ` · EXPIRED ${escapeHtml(classicDateOnly(alert.exp.date) || alert.exp.short)}` : ""}</td>
          <td class="pharm-n pharm-rate">${lineRateFieldHtml(item, line, key)}</td>
          <td>
            <div class="qty">
              <button type="button" data-chg="${escapeHtml(key)}" data-d="${-step}">−</button>
              <input class="qty-input" type="number" inputmode="decimal" min="${POSUnits.displayQty(POSUnits.qtyMin(), unitCode) || 0.001}" max="${escapeHtml(qtyMaxShow)}" step="${escapeHtml(qtyStep)}" value="${escapeHtml(qtyShow)}" data-qty="${escapeHtml(key)}" aria-label="Quantity in ${unit}" />
              <button type="button" data-chg="${escapeHtml(key)}" data-d="${step}"${atStockMax ? " disabled" : ""}>+</button>
              ${isScaleEnabled() && isWeightItem(item) ? `<button type="button" class="scale-line-btn" data-scale-line="${escapeHtml(key)}" title="Read scale">⚖</button>` : ""}
            </div>
          </td>
          <td class="line-disc-cell">${classicLineDiscHtml(line, key)}</td>
          <td class="pharm-n stock-cell">${escapeHtml(alert.stock.label)}</td>
          <td class="pharm-n">${escapeHtml(String(Number(item.gst_rate) || 0))}%</td>
          <td class="pharm-n" data-line-amt="${escapeHtml(key)}">${escapeHtml(money(calc.taxable + calc.gst))}</td>
          <td><button type="button" class="classic-del" data-del-line="${escapeHtml(key)}" aria-label="Remove ${escapeHtml(item.name)}">×</button></td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>`;
  } else if (isRestaurantShop()) {
    $("lines").innerHTML = isRestaurantMobileLayout() ? cafeMobileOrderHtml() : cafeBillLinesHtml();
  } else {
    $("lines").innerHTML = state.cart
      .map((line) => {
        const item = state.items.find((i) => i.id === line.itemId);
        if (!item) return "";
        const calc = lineCalc(item, line);
        const key = cartLineKey(line);
        if (isPrintAreaItem(item)) return printAreaLineHtml(item, line, key, calc);
        const unitCode = itemUnit(item);
        const step = POSUnits.counterStep(unitCode);
        const unit = POSUnits.qtySuffix(unitCode);
        const qtyShow = POSUnits.displayQty(line.qtyGm, unitCode);
        const qtyStep = POSUnits.displayQty(step, unitCode) || 1;
        const bc = String(line.barcode || "").trim();
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
                ${POSUnits.isCount(unitCode) || !isScaleEnabled() ? "" : `<button type="button" class="scale-line-btn" data-scale-line="${escapeHtml(key)}" title="Read scale">⚖</button>`}
              </div>
              <div class="line-rate">${lineRateFieldHtml(item, line, key)}</div>
              <div class="line-amt" data-line-amt="${escapeHtml(key)}">${money(calc.taxable + calc.gst)}</div>
            </div>
          </div>
          ${canDiscount() ? `<div class="line-disc">
              <select data-line-disc-type="${escapeHtml(key)}" aria-label="Line discount type">
                <option value="amt"${(line.discountType || "amt") === "amt" ? " selected" : ""}>₹</option>
                <option value="pct"${line.discountType === "pct" ? " selected" : ""}>%</option>
              </select>
              <input data-line-disc="${escapeHtml(key)}" type="number" min="0" step="0.01" value="${escapeHtml(line.discountValue || 0)}" aria-label="Line discount" />
            </div>` : ""}
          ${lineDescriptionHtml(line, key)}
        </div>`;
      })
      .join("");
  }
  const t = cartTotals();
  const families = [...new Set(state.cart.map((l) => POSUnits.typeOf(itemUnit(state.items.find((i) => i.id === l.itemId))).family))];
  if ($("qty-lab")) $("qty-lab").textContent = isPrintShop() ? "Area" : "Qty";
  $("qty-total").textContent = families.length <= 1 && state.cart.length
    ? fmtQty(t.qty, state.items.find((i) => i.id === state.cart[0].itemId))
    : families.length > 1
      ? `${state.cart.length} lines`
      : "0";
  $("taxable").textContent = money(t.taxable);
  $("tax").textContent = money(t.tax);
  if ($("disc-total")) $("disc-total").textContent = money((t.discount || 0) + (t.lineDiscount || 0));
  if ($("extra-total")) $("extra-total").textContent = money(t.extra || 0);
  if ($("loyalty-total")) $("loyalty-total").textContent = money(t.loyalty || 0);
  if ($("profit-total")) $("profit-total").textContent = money(t.profit || 0);
  if ($("disc-row")) $("disc-row").hidden = !(((t.discount || 0) + (t.lineDiscount || 0)) > 0);
  if ($("extra-row")) $("extra-row").hidden = !(Number(t.extra) > 0);
  if ($("loyalty-row")) $("loyalty-row").hidden = !(Number(t.loyalty) > 0);
  if ($("taxable-row")) $("taxable-row").hidden = !(Number(t.taxable) > 0);
  if ($("gst-row")) $("gst-row").hidden = !(Number(t.tax) > 0);
  $("total").textContent = money(t.total != null ? t.total : t.taxable + t.tax);
  if ($("ticket-sub")) {
    if (isRestaurantShop() && !state.cart?.length) {
      $("ticket-sub").textContent = restaurantTicketHint();
    } else if (!state.cart?.length) {
      $("ticket-sub").textContent = globalThis.POSFootwear?.itemFormCopy(state.businessMeta)?.ticket || emptyTicketHint();
    }
  }
  paintBillTable();
  if ($("classic-bill-date")) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    $("classic-bill-date").value = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  }
  $("btn-pay").disabled = state.cart.length === 0;
  $("btn-clear").disabled = state.cart.length === 0 && !classicCustomerRecordDirty();
  document.body.classList.toggle("has-cart", state.cart.length > 0);
  if (isRestaurantMobileLayout()) {
    if (!hadCart && state.cart.length) setBillCollapsed(false);
    else if (hadCart && !state.cart.length) setBillCollapsed(true);
  } else if (isPrintMobileLayout()) {
    if (!hadCart && state.cart.length) setBillCollapsed(true);
    else if (hadCart && !state.cart.length) setBillCollapsed(true);
  }
  applyRestaurantMobileChrome();
  paintBillToggleCount();
  paintBillCustomer();
  if ($("btn-hold")) $("btn-hold").disabled = state.cart.length === 0 || Boolean(state.editingOrderId);
  if ($("btn-kot")) $("btn-kot").disabled = !isRestaurantShop() || state.cart.length === 0 || Boolean(state.editingOrderId);
  if ($("btn-shift-table")) {
    const R = restaurantApi();
    const show = tableShiftingEnabled();
    const can =
      show &&
      state.activeTable &&
      state.activeTable !== R?.PARCEL &&
      (tableIsBusy(state.activeTable) || state.cart.length > 0);
    $("btn-shift-table").hidden = !show;
    $("btn-shift-table").disabled = !can;
  }
  paintPayAction();
  const face = $("customer-face");
  if (face) {
    face.hidden = true;
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
  const emailRaw = String(fields.email || "").trim();
  const emailError = globalThis.POSCustomerMaster?.emailError?.(emailRaw) || "";
  if (emailError) throw new Error(emailError);
  const email = globalThis.POSCustomerMaster?.normalizeEmail?.(emailRaw) || emailRaw.toLowerCase();
  const id = String(fields.id || "").trim();
  const payload = {
    name,
    mobile,
    email,
    business_name: fields.business_name || "",
    type: fields.type === "b2b" ? "b2b" : "b2c",
    gstin: fields.gstin || "",
    state: fields.state || "",
    dob: fields.dob || "",
    referred_by: fields.referred_by || "",
    locale: fields.locale || "",
    address: fields.address || "",
    doctor_rx: fields.doctor_rx || "",
  };
  const adoptExisting = (customer, warning) => {
    if ($("cust-match-hint")) {
      $("cust-match-hint").textContent = warning;
      $("cust-match-hint").className = "hint error";
    }
    if (customer?.id) state.customerId = customer.id;
    if (fields.reuseExisting === false) throw new Error(warning);
    return Object.assign({}, customer, { _duplicate: true, _warning: warning });
  };
  const match = globalThis.POSCustomerMaster?.findMatch(state.customers || [], payload, id);
  if (match && !fields.force) {
    return adoptExisting(match, globalThis.POSCustomerMaster.warningCopy(match, payload));
  }
  const { res, data } = await posRequest(id ? `/api/customers/${encodeURIComponent(id)}` : "/api/customers", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload),
  });
  if (res.status === 409 && data?.customer) {
    const warning = data.error || globalThis.POSCustomerMaster?.warningCopy(data.customer, payload) || "A customer with these details already exists";
    return adoptExisting(data.customer, warning);
  }
  if (!res.ok) throw new Error(data?.error || res.statusText);
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
    redeem.disabled = walk || pts <= 0;
    redeem.placeholder = pts > 0 ? `Max ${pts}` : "0";
    clampLoyaltyRedeem();
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

function hydrateItemFromBarcodeMatch(match, code) {
  if (!match || typeof match !== "object") return null;
  const id = match.item_id || (match.source === "item" && match.id) || "";
  if (!id) return null;
  const existing = (state.items || []).find((i) => i.id === id);
  if (existing) return existing;
  const row = {
    id,
    name: match.item_name || match.name || "Item",
    code: match.item_code || match.code || "",
    barcode: String(match.barcode || match.catalog_barcode || code || ""),
    retail_rate: match.retail_rate,
    b2b_rate: match.b2b_rate || match.retail_rate,
    purchase_rate: match.purchase_rate,
    mrp: match.item_mrp ?? match.mrp,
    gst_rate: match.gst_rate,
    stock_gm: match.stock_gm,
    base_unit: match.base_unit || match.unit,
    unit: match.unit || match.base_unit,
    size: match.size || "",
    color: match.color || "",
    wearer_type: match.wearer_type || "",
    status: match.item_status || "active",
  };
  state.items = [...(state.items || []), row];
  return row;
}

async function applyBarcodeScan(raw, sourceEl) {
  const code = globalThis.POSBarcode?.cleanCode ? POSBarcode.cleanCode(raw) : String(raw || "").trim();
  if (!code) return false;
  if (applyBarcodeScan._pending === code) return true;
  if (applyBarcodeScan._last === code && Date.now() - (applyBarcodeScan._at || 0) < 350) return true;
  applyBarcodeScan._pending = code;
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
    if (!item) item = hydrateItemFromBarcodeMatch(match, code);
  } catch (err) {
    const msg = String(err.message || "");
    if (/inactive|already sold|already damaged/i.test(msg)) {
      applyBarcodeScan._pending = "";
      if (sourceEl) sourceEl.value = "";
      paintScanLane(false, "Inactive");
      setHint(msg, "error");
      focusScanLane();
      return false;
    }
    item = findItemByBarcode(code);
  }
  if (!item) item = findItemByBarcode(code);
  if (!item) item = findItemBySkuOrHsn(code);
  if (item) {
    applyBarcodeScan._last = code;
    applyBarcodeScan._at = Date.now();
    applyBarcodeScan._pending = "";
    if (garmentScanGate(item, { barcodeMapped: true, query: code })) {
      clearCounterQuery(sourceEl);
      paintScanLane(true, item.name);
      setHint(`Choose a size for ${item.name}`, "ok");
      return true;
    }
    const piece = findItemByBarcode(code) || (globalThis.POSBarcode?.itemHasBarcode?.(item, code) ? item : null);
    const added = addWeighableItem(item.id, classicScanAddQty(item), (piece || isClassicBillShop()) ? code : "");
    clearCounterQuery(sourceEl);
    const alerts = classicItemAlerts(item).alerts;
    paintScanLane(!alerts.some((a) => /EXPIRED|Out of stock/i.test(a)), item.name);
    if (added !== false) {
      if (shouldCapBillStock(item) && itemStockInfo(item).low) setHint(lowStockScanHint(item), "error");
      else setHint(alerts.length ? `Added ${item.name} · ${alerts.join(" · ")}` : `Added ${item.name}`, alerts.length ? "error" : "ok");
    }
    focusScanLane();
    return true;
  }
  if (digitsMobile(code).length === 10 && applyCounterMobile(code, { announceMiss: false })) {
    applyBarcodeScan._pending = "";
    clearCounterQuery(sourceEl);
    paintScanLane(true, customer()?.name || "Customer");
    focusScanLane();
    return true;
  }
  syncCounterQuery(code, sourceEl);
  const hits = filteredItems();
  if (isApparelShop() && garmentCounterApi() && hits.length) {
    const decision = garmentCounterApi().searchDecision(hits, state.items, code);
    if (decision.action === "popup") {
      applyBarcodeScan._pending = "";
      openGarmentSizePicker(decision.itemId, decision);
      clearCounterQuery(sourceEl);
      paintScanLane(true, "Choose size");
      return true;
    }
    if (decision.action === "add" && hits.length !== 1) {
      applyBarcodeScan._pending = "";
      const picked = state.items.find((i) => i.id === decision.itemId) || hits[0];
      addWeighableItem(picked.id, classicScanAddQty(picked), garmentCounterApi().identityMatch(picked, code) ? code : "");
      clearCounterQuery(sourceEl);
      paintScanLane(true, picked.name);
      setHint(`Added ${picked.name}`, "ok");
      focusScanLane();
      return true;
    }
  }
  if (hits.length === 1) {
    applyBarcodeScan._pending = "";
    addWeighableItem(
      hits[0].id,
      classicScanAddQty(hits[0]),
      (globalThis.POSBarcode?.itemHasBarcode?.(hits[0], code) || isClassicBillShop()) ? code : "",
    );
    clearCounterQuery(sourceEl);
    const alerts = classicItemAlerts(hits[0]).alerts;
    paintScanLane(!alerts.some((a) => /EXPIRED|Out of stock/i.test(a)), hits[0].name);
    if (shouldCapBillStock(hits[0]) && itemStockInfo(hits[0]).low) setHint(lowStockScanHint(hits[0]), "error");
    else setHint(alerts.length ? `Added ${hits[0].name} · ${alerts.join(" · ")}` : `Added ${hits[0].name}`, alerts.length ? "error" : "ok");
    focusScanLane();
    return true;
  }
  if (hits.length > 1) {
    applyBarcodeScan._pending = "";
    paintScanLane(true, `${hits.length} matches`);
    setHint(`Pick one of ${hits.length} matches`, "ok");
    return false;
  }
  applyBarcodeScan._pending = "";
  paintScanLane(false, "No match");
  setHint(
    quickAddVisible()
      ? `No item matches “${code}”. Use + Item to add it.`
      : `No item matches “${code}”.`,
    "error",
  );
  if (sourceEl === $("scan-code") || sourceEl === $("search") || sourceEl === $("bill-scan-code") || sourceEl === $("bill-item-search")) sourceEl.select();
  return false;
}

function looksLikeItemCode(q) {
  const s = String(q || "").trim();
  return s.length >= 4 && !/\s/.test(s) && /^[A-Za-z0-9._/-]+$/.test(s);
}

function closeCounterAddItem() {
  const modal = $("counter-item-modal");
  if (modal) modal.hidden = true;
}

function openCounterAddItem(prefill = {}) {
  const modal = $("counter-item-modal");
  if (!modal) return;
  const raw = String(prefill.name || prefill.barcode || prefill.q || "").trim();
  const asCode = Boolean(prefill.barcode) || (!prefill.name && looksLikeItemCode(raw));
  if ($("ci-name")) $("ci-name").value = asCode ? String(prefill.name || "").trim() : raw;
  if ($("ci-barcode")) $("ci-barcode").value = asCode ? (prefill.barcode || raw) : String(prefill.barcode || "").trim();
  if ($("ci-retail")) $("ci-retail").value = prefill.retail || "";
  if ($("ci-gst")) $("ci-gst").value = prefill.gst != null ? prefill.gst : "5";
  if ($("ci-qty")) $("ci-qty").value = prefill.qty || "1";
  if ($("ci-mfr")) $("ci-mfr").value = prefill.mfr || "";
  if ($("ci-hint")) {
    $("ci-hint").textContent = "";
    $("ci-hint").className = "hint";
  }
  fillItemUnitSelect(defaultItemUnit());
  modal.hidden = false;
  ($("ci-name")?.value ? $("ci-retail") : $("ci-name"))?.focus();
}

async function saveCounterAddItem(e) {
  e?.preventDefault?.();
  const saveBtn = $("ci-save");
  if (saveBtn?.disabled) return;
  if (saveBtn) saveBtn.disabled = true;
  const hint = $("ci-hint");
  const name = String($("ci-name")?.value || "").trim();
  const retail = Number($("ci-retail")?.value);
  if (!name) {
    if (hint) {
      hint.textContent = "Name is required.";
      hint.className = "hint error";
    }
    if (saveBtn) saveBtn.disabled = false;
    return;
  }
  if (!Number.isFinite(retail) || retail < 0) {
    if (hint) {
      hint.textContent = "Enter a retail rate.";
      hint.className = "hint error";
    }
    if (saveBtn) saveBtn.disabled = false;
    return;
  }
  const unit = POSUnits.normalize($("ci-unit")?.value || defaultItemUnit());
  const qty = Number($("ci-qty")?.value) || 1;
  const body = {
    name,
    category: defaultItemCategory(),
    unit,
    base_unit: unit,
    retail_rate: POSUnits.roundRate8?.(retail) ?? retail,
    b2b_rate: POSUnits.roundRate8?.(retail) ?? retail,
    purchase_rate: 0,
    gst_rate: Number($("ci-gst")?.value) || (isPrintShop() ? 18 : 5),
    min_billing_qty: Number($("ci-min-billing")?.value) || 0,
    barcode: globalThis.POSBarcode?.cleanCode ? POSBarcode.cleanCode($("ci-barcode")?.value) : String($("ci-barcode")?.value || "").trim(),
    status: "active",
    stock_gm: 0,
  };
  if (isPharmacyShop()) {
    body.manufacturer = String($("ci-mfr")?.value || "").trim();
    body.generic_name = name;
  }
  if (hint) {
    hint.textContent = "Saving…";
    hint.className = "hint";
  }
  try {
    const res = await api("/api/items", { method: "POST", body: JSON.stringify(body) });
    await loadBootstrap();
    const item = res.item || res.items?.[0] || state.items.find((i) => i.id === res.item?.id);
    const id = item?.id || res.item?.id;
    if (id) addItem(id, POSUnits.toBase(qty, unit), body.barcode || "");
    closeCounterAddItem();
    setHint(`Item created successfully · ${name} added to catalog and bill`, "ok");
    showItemSaveToast("Item created successfully", name);
    clearCounterQuery($("bill-item-search") || $("scan-code"));
    paintClassicItemHits();
    focusScanLane();
  } catch (err) {
    if (hint) {
      hint.textContent = err.message || "Could not save item";
      hint.className = "hint error";
    }
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
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

function garmentCounterApi() {
  return globalThis.POSGarmentCounter || null;
}

function garmentSwatchHtml(color, image) {
  const css = globalThis.POSGarmentPurchase?.swatchCss?.(color, image);
  if (!css || !String(color || image || "").trim()) return "";
  return `<i class="garment-swatch" style="${css}" aria-hidden="true"></i>`;
}

function garmentCartCaptionHtml(item) {
  const caption = garmentCounterApi()?.cartCaption?.(item) || "";
  const name = String(item?.name || "");
  const extra = caption.startsWith(name) ? caption.slice(name.length).replace(/^\s*[–-]\s*/, "") : "";
  return extra ? `<small>${escapeHtml(extra)}</small>` : "";
}

function resetGarmentVariantDraft() {
  state.garmentVariants = { colorsText: "", colors: [], colorImages: {}, sizes: [], cells: {} };
  if ($("item-variant-custom-color")) $("item-variant-custom-color").value = "";
  paintGarmentVariantEditor();
}

function readGarmentVariantCells() {
  if (!state.garmentVariants) state.garmentVariants = { colorsText: "", colors: [], colorImages: {}, sizes: [], cells: {} };
  const colors = state.garmentVariants.colors || [];
  state.garmentVariants.colorsText = colors.join(", ");
  if (!state.garmentVariants.colorImages) state.garmentVariants.colorImages = {};
  document.querySelectorAll("[data-gv-color-image]").forEach((el) => {
    const key = el.dataset.gvColorImage;
    if (key) state.garmentVariants.colorImages[key] = el.value || "";
  });
  document.querySelectorAll("#item-variant-grid [data-gv]").forEach((el) => {
    const key = el.dataset.gvKey;
    if (!key) return;
    const cell = state.garmentVariants.cells[key] || {};
    if (el.dataset.gvId) cell.id = el.dataset.gvId;
    if (el.dataset.gv === "stock_gm") cell.stock_gm = el.value;
    else if (el.dataset.gv === "retail_rate") cell.retail_rate = el.value;
    else cell[el.dataset.gv] = el.value;
    state.garmentVariants.cells[key] = cell;
  });
}

function paintGarmentVariantEditor() {
  const box = $("item-variant-sizes");
  const grid = $("item-variant-grid");
  if (!box || !grid) return;
  if (!isApparelShop()) {
    box.innerHTML = "";
    grid.innerHTML = "";
    return;
  }
  const C = garmentCounterApi();
  const G = globalThis.POSGarmentPurchase;
  const draft = state.garmentVariants || { colorsText: "", colors: [], colorImages: {}, sizes: [], cells: {} };
  if (!draft.colors) draft.colors = C?.parseColors?.(draft.colorsText) || [];
  if (!draft.colorImages) draft.colorImages = {};
  state.garmentVariants = draft;
  const catalog = []
    .concat(G?.LETTER_SIZES || ["XS", "S", "M", "L", "XL", "XXL", "XXXL"])
    .concat(G?.NUMERIC_SIZES || ["28", "30", "32", "34", "36", "38"])
    .concat(draft.sizes || []);
  const sizes = [];
  for (const raw of catalog) {
    const size = G?.normalizeSize?.(raw) || String(raw || "").trim().toUpperCase();
    if (!size || sizes.some((s) => (G?.sizesEqual ? G.sizesEqual(s, size) : s === size))) continue;
    sizes.push(size);
  }
  box.innerHTML = sizes.map((size) => {
    const on = (draft.sizes || []).some((s) => (G?.sizesEqual ? G.sizesEqual(s, size) : s === size));
    return `<button type="button" class="garment-size-chip${on ? " is-on" : ""}" data-gv-size="${escapeHtml(size)}" aria-pressed="${on ? "true" : "false"}">${escapeHtml(size)}</button>`;
  }).join("");
  const palette = []
    .concat(G?.STANDARD_COLORS?.map((row) => row.name) || [])
    .concat(draft.colors || []);
  const paletteColors = [];
  for (const raw of palette) {
    const color = G?.normalizeColor?.(raw) || String(raw || "").trim();
    if (!color || paletteColors.some((row) => (G?.colorsEqual ? G.colorsEqual(row, color) : row === color))) continue;
    paletteColors.push(color);
  }
  const picks = $("item-variant-colors");
  if (picks) {
    picks.innerHTML = paletteColors.map((color) => {
      const on = (draft.colors || []).some((row) => (G?.colorsEqual ? G.colorsEqual(row, color) : row === color));
      const css = G?.swatchCss?.(color, draft.colorImages?.[G?.colorKey?.(color) || color.toLowerCase()]) || "";
      return `<button type="button" class="garment-color-btn${on ? " is-on" : ""}" data-gv-color="${escapeHtml(color)}" aria-pressed="${on ? "true" : "false"}"><i class="garment-swatch" style="${css}"></i>${escapeHtml(color)}</button>`;
    }).join("");
  }
  const imageBox = $("item-variant-color-images");
  if (imageBox) {
    const chosenColors = draft.colors || [];
    imageBox.innerHTML = chosenColors.length
      ? chosenColors.map((color) => {
          const key = G?.colorKey?.(color) || String(color).toLowerCase();
          const css = G?.swatchCss?.(color, draft.colorImages?.[key]) || "";
          return `<label class="garment-color-image"><i class="garment-swatch" style="${css}"></i><span>${escapeHtml(color)} image or swatch URL</span><input data-gv-color-image="${escapeHtml(key)}" value="${escapeHtml(draft.colorImages?.[key] || "")}" placeholder="#ec4899 or https://" maxlength="500" /></label>`;
        }).join("")
      : "";
  }
  const colors = draft.colors || [];
  const colorList = colors.length ? colors : [""];
  const chosen = draft.sizes || [];
  if (!chosen.length) {
    grid.innerHTML = `<p class="hint">Select the sizes this garment is sold in. Leave selling price blank to use the retail rate.</p>`;
    return;
  }
  const body = [];
  for (const color of colorList) {
    for (const size of chosen) {
      const key = C?.cellKey?.(color, size) || `${String(color).toLowerCase()}|${size}`;
      const cell = draft.cells[key] || {};
      body.push(`<tr>
        <td>${escapeHtml(color || "—")}</td>
        <td>${escapeHtml(size)}</td>
        <td><input data-gv="code" data-gv-key="${escapeHtml(key)}" data-gv-id="${escapeHtml(cell.id || "")}" value="${escapeHtml(cell.code || "")}" maxlength="64" aria-label="SKU ${escapeHtml(color)} ${escapeHtml(size)}" /></td>
        <td><input data-gv="barcode" data-gv-key="${escapeHtml(key)}" data-gv-id="${escapeHtml(cell.id || "")}" value="${escapeHtml(cell.barcode || "")}" maxlength="64" aria-label="Barcode ${escapeHtml(color)} ${escapeHtml(size)}" /></td>
        <td><input data-gv="stock_gm" data-gv-key="${escapeHtml(key)}" data-gv-id="${escapeHtml(cell.id || "")}" type="number" min="0" step="1" value="${escapeHtml(cell.stock_gm ?? "")}" aria-label="Opening stock ${escapeHtml(size)}" /></td>
        <td><input data-gv="retail_rate" data-gv-key="${escapeHtml(key)}" data-gv-id="${escapeHtml(cell.id || "")}" type="number" min="0" step="0.01" value="${escapeHtml(cell.retail_rate ?? "")}" placeholder="Retail" aria-label="Selling price ${escapeHtml(size)}" /></td>
      </tr>`);
    }
  }
  grid.innerHTML = `<table class="garment-variant-table"><thead><tr><th>Colour</th><th>Size</th><th>SKU</th><th>Barcode</th><th>Opening stock</th><th>Selling price</th></tr></thead><tbody>${body.join("")}</tbody></table>`;
}

let garmentPicker = null;

function closeGarmentSizePicker() {
  const modal = $("garment-size-modal");
  if (modal) modal.hidden = true;
  garmentPicker = null;
}

function openGarmentSizePicker(itemId, opts = {}) {
  const item = state.items.find((i) => i.id === itemId);
  const C = garmentCounterApi();
  if (!isApparelShop() || !item || !C) return false;
  const family = C.activeFamily(item, state.items);
  if (!opts.force && !C.needsSizePopup(item, family)) return false;
  garmentPicker = C.createPicker(family, { color: opts.color || "", size: opts.size || "" });
  paintGarmentSizePicker();
  const modal = $("garment-size-modal");
  if (modal) modal.hidden = false;
  const qty = $("garment-size-qty");
  const preset = Number(opts.qty);
  if (qty && preset > 0) qty.value = String(Math.round(preset));
  qty?.focus();
  qty?.select();
  return true;
}

function paintGarmentSizePicker() {
  const C = garmentCounterApi();
  const picker = garmentPicker;
  if (!C || !picker) return;
  if ($("garment-size-title")) $("garment-size-title").textContent = picker.name || "Select size";
  const wear = globalThis.POSFootwear?.wearerLabel?.(picker.wearer) || "";
  if ($("garment-size-meta")) $("garment-size-meta").textContent = wear || "Choose colour and size";
  const photo = $("garment-size-photo");
  if (photo) {
    const src = itemPhotoUrl({ image_url: picker.image, name: picker.name });
    photo.innerHTML = src
      ? `<img src="${escapeHtml(src)}" alt="">`
      : `<span>${escapeHtml(itemPhotoLetter({ name: picker.name }))}</span>`;
  }
  const colors = (picker.colors || []).filter((c) => String(c || "").trim());
  const colorBox = $("garment-size-colors");
  if (colorBox) {
    colorBox.hidden = !colors.length;
    colorBox.innerHTML = colors.map((color) => {
      const on = String(picker.color || "").trim().toLowerCase() === String(color).trim().toLowerCase();
      const image = picker.colorImages?.[String(color).trim().toLowerCase()] || "";
      const css = globalThis.POSGarmentPurchase?.swatchCss?.(color, image) || "";
      return `<button type="button" class="garment-color-btn${on ? " is-on" : ""}" data-gs-color="${escapeHtml(color)}"><i class="garment-swatch" style="${css}"></i>${escapeHtml(color)}</button>`;
    }).join("");
  }
  const sizes = C.pickerSizes(picker);
  const sizeBox = $("garment-size-sizes");
  if (sizeBox) {
    sizeBox.innerHTML = sizes.length
      ? sizes.map((row) => {
          const on = row.size === picker.size;
          return `<button type="button" class="garment-size-btn${on ? " is-on" : ""}${row.out ? " is-out" : ""}" data-gs-size="${escapeHtml(row.size)}" ${row.out ? "disabled" : ""} role="option" aria-selected="${on ? "true" : "false"}"><strong>${escapeHtml(row.size)}</strong><em>${row.out ? "Out" : escapeHtml(String(row.stock))}</em></button>`;
        }).join("")
      : `<p class="hint">No sizes are configured for this colour.</p>`;
  }
  const selected = C.selectedVariant(picker);
  const item = selected ? state.items.find((i) => i.id === selected.id) : null;
  const cartQty = item ? cartQtyForItem(item.id) : 0;
  const max = item ? Math.max(0, Math.round(itemOnHandBase(item) - cartQty)) : 0;
  if ($("garment-size-stock")) $("garment-size-stock").textContent = !selected ? "—" : selected.out ? "Out of stock" : String(selected.stock);
  if ($("garment-size-price")) $("garment-size-price").textContent = item ? money(rateFor(item)) : "—";
  const qty = $("garment-size-qty");
  if (qty) {
    qty.max = String(Math.max(0, max));
    const current = Math.max(1, Math.round(Number(qty.value) || 1));
    if (max > 0) qty.value = String(Math.min(current, max));
  }
  const hint = $("garment-size-hint");
  if (hint) {
    hint.className = "hint";
    if (!selected || selected.out || max <= 0) {
      hint.textContent = `${picker.name}: out of stock`;
      hint.className = "hint error";
    } else {
      hint.textContent = `${max} in stock for ${selected.size}. ← → size, ↑ ↓ colour, Enter adds.`;
    }
  }
  const add = $("garment-size-add");
  if (add) add.disabled = !selected || selected.out || max <= 0;
}

function confirmGarmentSize() {
  const C = garmentCounterApi();
  const selected = C?.selectedVariant?.(garmentPicker);
  const item = selected ? state.items.find((i) => i.id === selected.id) : null;
  if (!selected || !item || selected.out) {
    setHint("Choose a size that is in stock", "error");
    return;
  }
  const want = Math.max(1, Math.round(Number($("garment-size-qty")?.value) || 1));
  const next = C.clampSaleQty(itemOnHandBase(item), cartQtyForItem(item.id), want);
  if (next <= 0) {
    setHint(stockCapHint(item), "error");
    paintGarmentSizePicker();
    return;
  }
  if (next < want) setHint(stockCapHint(item), "error");
  closeGarmentSizePicker();
  const added = addItem(item.id, next);
  if (added !== false) setHint(`Added ${C.cartCaption(item)} · Qty ${next}`, next < want ? "error" : "ok");
}

function garmentScanGate(item, opts = {}) {
  if (!isApparelShop() || !item) return false;
  const C = garmentCounterApi();
  if (!C) return false;
  const decision = C.scanAction(item, state.items, opts);
  if (decision.action !== "popup") return false;
  return openGarmentSizePicker(decision.itemId, { ...decision, force: true, qty: classicScanAddQty(item) });
}

function addItem(id, qtyGm, lineBarcode) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  ensureDiningTable();
  if (isPrintAreaItem(item) && !barcodeText(lineBarcode)) {
    const P = printApi();
    const dim = P?.defaultDimUnit?.(printBillUnit(item)) || "ft";
    const line = {
      lineId: newCartLineId(),
      itemId: id,
      qtyGm: 0,
      discountType: "amt",
      discountValue: 0,
      barcode: "",
      notes: "",
      printWidth: "",
      printHeight: "",
      printDimUnit: dim,
      printCopies: 1,
      printFileId: "",
      printFileName: "",
      printCustomUnit: item.custom_unit || "",
    };
    syncPrintLineQty(line, item);
    state.cart.push(line);
    if (isPrintMobileLayout()) setBillCollapsed(true);
    renderCart();
    focusPrintLineWidth(line);
    warnClassicItem(item);
    return true;
  }
  const add = qtyGm == null ? POSUnits.counterStep(itemUnit(item)) : Number(qtyGm);
  const code = barcodeText(lineBarcode);
  const count = POSUnits.isCount(itemUnit(item));
  const pharmacyCount = isPharmacyShop() && count;
  const barcodeAdd = pharmacyCount
    ? POSUnits.clampQty((Number.isFinite(add) && add > 0 ? add : 1) * pieceBarcodeQty(item))
    : POSUnits.clampQty(count ? pieceBarcodeQty(item) : add);
  if (code) {
    const existing = state.cart.find((l) => {
      const B = globalThis.POSBarcode;
      return B?.barcodesEqual ? B.barcodesEqual(l.barcode, code) : barcodeText(l.barcode) === code;
    });
    if (existing) {
      if (count && !pharmacyCount && !isReusableCartBarcode(item, code)) {
        setHint("This piece is already on the bill", "error");
        return;
      }
      const want = Number(existing.qtyGm) + (pharmacyCount ? barcodeAdd : add);
      const next = clampBillQty(item, want, cartLineKey(existing));
      if (shouldCapBillStock(item) && next < POSUnits.clampQty(want)) setHint(stockCapHint(item), "error");
      if (next <= 0) {
        if (shouldCapBillStock(item)) setHint(stockCapHint(item), "error");
        return false;
      }
      existing.qtyGm = next;
      renderCart();
      if (shouldCapBillStock(item) && next < POSUnits.clampQty(want)) return false;
      if (shouldCapBillStock(item) && itemStockInfo(item).low) setHint(lowStockScanHint(item), "error");
      else warnClassicItem(item);
      return true;
    }
    const first = clampBillQty(item, barcodeAdd);
    if (shouldCapBillStock(item) && first < POSUnits.clampQty(barcodeAdd)) setHint(stockCapHint(item), "error");
    if (first <= 0) {
      if (shouldCapBillStock(item)) setHint(itemOnHandBase(item) <= 0 ? `${item.name}: out of stock` : stockCapHint(item), "error");
      return false;
    }
    state.cart.push({
      lineId: newCartLineId(),
      itemId: id,
      qtyGm: first,
      discountType: "amt",
      discountValue: 0,
      barcode: code,
      notes: "",
    });
    renderCart();
    if (shouldCapBillStock(item) && first < POSUnits.clampQty(barcodeAdd)) return false;
    if (shouldCapBillStock(item) && itemStockInfo(item).low) setHint(lowStockScanHint(item), "error");
    else warnClassicItem(item);
    return true;
  }
  const line = state.cart.find((l) => l.itemId === id && !String(l.barcode || "").trim());
  if (line) {
    const want = Number(line.qtyGm) + add;
    const next = clampBillQty(item, want, cartLineKey(line));
    if (shouldCapBillStock(item) && next < POSUnits.clampQty(want)) setHint(stockCapHint(item), "error");
    line.qtyGm = next;
    if (next <= 0) {
      state.cart = state.cart.filter((l) => l !== line);
      renderCart();
      return false;
    }
  } else {
    const first = clampBillQty(item, add);
    if (shouldCapBillStock(item) && first < POSUnits.clampQty(add)) setHint(stockCapHint(item), "error");
    if (first <= 0) {
      if (shouldCapBillStock(item)) setHint(itemOnHandBase(item) <= 0 ? `${item.name}: out of stock` : stockCapHint(item), "error");
      return false;
    }
    state.cart.push({
      lineId: newCartLineId(),
      itemId: id,
      qtyGm: first,
      discountType: "amt",
      discountValue: 0,
      barcode: "",
      notes: "",
    });
  }
  state.cart = state.cart.filter((l) => l.qtyGm > 0);
  renderCart();
  if (shouldCapBillStock(item) && itemStockInfo(item).low) setHint(lowStockScanHint(item), "error");
  else warnClassicItem(item);
}

function setLineQty(key, qtyGm) {
  const line = findCartLine(key);
  if (!line) return;
  const item = state.items.find((i) => i.id === line.itemId);
  const want = POSUnits.clampQty(qtyGm);
  const next = clampBillQty(item, want, key);
  if (shouldCapBillStock(item) && next < want) setHint(stockCapHint(item), "error");
  const prev = Number(line.qtyGm) || 0;
  if (next <= 0) state.cart = state.cart.filter((l) => cartLineKey(l) !== String(key));
  else if (isPieceBarcodeLine(line, item) && !isReusableCartBarcode(item, line.barcode)) line.qtyGm = pieceBarcodeQty(item);
  else {
    if (!state._scaleApply && Number(line.scaleGrams) > 0 && next !== prev) {
      line.weightSource = "manual";
      logScaleWeight({
        kind: "manual-override",
        item: item?.name,
        from_g: line.scaleGrams,
        to_g: next,
      });
    }
    line.qtyGm = next;
  }
  renderCart();
}

function changeLineQty(key, delta) {
  const line = findCartLine(key);
  if (!line) return;
  const item = state.items.find((i) => i.id === line.itemId);
  if (isPieceBarcodeLine(line, item) && !isReusableCartBarcode(item, line.barcode)) {
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
  globalThis.POSItemMasterUi?.fillBrandLists?.();
}

function itemSearchHay(item) {
  const raw = `${item.name || ""} ${item.local_name || ""} ${item.generic_name || ""} ${item.manufacturer || ""} ${item.brand || ""} ${item.medicine_type || ""} ${item.batch_no || ""} ${item.code || ""} ${item.hsn || ""} ${item.barcode || ""} ${item.mfr_barcode || ""} ${item.category || ""} ${item.subcategory || ""} ${item.color || ""} ${item.size || ""} ${item.wearer_type || ""} ${itemStatusOf(item.status)}`;
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
    <div class="items-stat"><span>Groups</span><strong>${cats}</strong></div>
    <div class="items-stat"><span>Brands</span><strong>${new Set(items.map((i) => i.brand).filter(Boolean)).size}</strong></div>`;
}

function filterItemsCatalog() {
  renderItemsTable();
}

function matchingItemsForTable() {
  const q = String($("item-catalog-search")?.value || "").trim().toLowerCase();
  const lowOnly = Boolean($("item-low-only")?.checked);
  const hideInactive = Boolean($("item-hide-inactive")?.checked);
  const brand = $("item-brand-filter")?.value || "";
  return (state.items || []).filter((i) => {
    const hay = itemSearchHay(i);
    const low = Number(i.stock_gm) <= Number(i.reorder_level_gm);
    const inactive = itemStatusOf(i.status) === "inactive";
    if (q && !hay.includes(q)) return false;
    if (brand && !globalThis.POSItemMaster?.itemMatchesBrand(i, brand)) return false;
    if (lowOnly && !low) return false;
    if (hideInactive && inactive) return false;
    return true;
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

function fillSalonServiceSelects() {
  const staffEl = $("item-staff");
  if (staffEl) {
    const cur = staffEl.value;
    staffEl.innerHTML = `<option value="">Any</option>${(state.staff || [])
      .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name || s.email || s.username || "")}</option>`)
      .join("")}`;
    if (cur) staffEl.value = cur;
  }
  const br = $("item-branch");
  if (br) {
    const cur = br.value;
    br.innerHTML = `<option value="">All branches</option>${(state.branches || [])
      .map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name || "")}</option>`)
      .join("")}`;
    if (cur) br.value = cur;
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
  fillSalonServiceSelects();
  if ($("item-duration")) $("item-duration").value = "30";
  if ($("item-svc-disc")) $("item-svc-disc").value = "0";
  if ($("item-gender")) $("item-gender").value = "unisex";
  if ($("item-online")) $("item-online").checked = true;
  if (isPharmacyShop()) {
    if ($("item-category") && !$("item-category").value) $("item-category").value = defaultItemCategory();
    if ($("item-type")) $("item-type").value = "Tablet";
    if ($("item-pack-unit")) $("item-pack-unit").value = "Strip";
    if ($("item-upp")) $("item-upp").value = "10";
  }
  if ($("item-brand")) $("item-brand").value = "";
  if ($("item-brand-id")) $("item-brand-id").value = "";
  if ($("item-min-billing")) $("item-min-billing").value = "";
  if ($("item-custom-unit")) $("item-custom-unit").value = "";
  if (isPrintShop() && $("item-gst") && !$("item-gst").value) $("item-gst").value = "18";
  if (isPrintShop() && $("item-gst") && Number($("item-gst").value) === 5) $("item-gst").value = "18";
  paintPrintUomChips();
  resetGarmentVariantDraft();
}

function fillItemForm(i) {
  if (!i) return;
  $("item-id").value = i.id;
  $("item-name").value = i.name;
  if ($("item-local-name")) $("item-local-name").value = i.generic_name || i.local_name || "";
  $("item-hsn").value = i.hsn || "";
  $("item-category").value = i.category || "";
  $("item-subcategory").value = i.subcategory || "";
  if ($("item-brand")) $("item-brand").value = i.brand || "";
  if ($("item-brand-id")) $("item-brand-id").value = i.brand_id || "";
  if ($("item-type")) $("item-type").value = i.medicine_type || "Tablet";
  if ($("item-mfr")) $("item-mfr").value = i.manufacturer || "";
  if ($("item-own-barcode")) $("item-own-barcode").value = i.barcode != null ? String(i.barcode) : "";
  if ($("item-pack-size")) $("item-pack-size").value = i.pack_size || "";
  if ($("item-pack-unit")) $("item-pack-unit").value = i.pack_unit || "Strip";
  if ($("item-upp")) $("item-upp").value = globalThis.POSFootwear?.unitsPerPack?.(i) || i.units_per_pack || 10;
  if ($("item-batch-no")) $("item-batch-no").value = i.primary_batch_no || i.batch_no || "";
  if ($("item-expiry")) $("item-expiry").value = String(i.primary_expiry || i.default_expiry || "").slice(0, 10);
  if ($("item-reorder")) $("item-reorder").value = POSUnits.fromBase(i.reorder_level_gm, itemUnit(i));
  if ($("item-wearer")) $("item-wearer").value = globalThis.POSFootwear?.normalizeWearer(i.wearer_type) || "";
  if ($("item-color")) $("item-color").value = i.color || "";
  if ($("item-size")) $("item-size").value = i.size || "";
  if (isApparelShop()) {
    state.garmentVariants = garmentCounterApi()?.draftFromItems?.(state.items, i) || { colorsText: "", colors: [], colorImages: {}, sizes: [], cells: {} };
    paintGarmentVariantEditor();
  }
  $("item-retail").value = POSUnits.rateInputValue?.(i.retail_rate) ?? i.retail_rate;
  if ($("item-mrp")) $("item-mrp").value = POSUnits.rateInputValue?.(i.mrp || i.retail_rate || 0) ?? (i.mrp || i.retail_rate || "");
  if ($("item-barcode-qty")) $("item-barcode-qty").value = "";
  $("item-b2b").value = POSUnits.rateInputValue?.(i.b2b_rate) ?? i.b2b_rate;
  $("item-purchase").value = POSUnits.rateInputValue?.(i.purchase_rate) ?? i.purchase_rate;
  $("item-gst").value = i.gst_rate;
  fillItemUnitSelect(itemUnit(i));
  $("item-unit").value = itemUnit(i);
  $("item-stock").value = POSUnits.fromBase(i.stock_gm, itemUnit(i));
  if ($("item-min-billing")) $("item-min-billing").value = Number(i.min_billing_qty) > 0 ? i.min_billing_qty : "";
  if ($("item-custom-unit")) $("item-custom-unit").value = i.custom_unit || "";
  paintItemStatus(i.status);
  refreshItemUnitLabels();
  paintItemImage(itemPhotoUrl(i));
  if ($("item-save")) $("item-save").textContent = "Update item";
  if ($("item-mode")) $("item-mode").textContent = `Editing ${i.code || i.name}`;
  $("item-form")?.classList.add("is-editing");
  $("item-hint").textContent = `Editing ${i.code || i.name}`;
  $("item-hint").className = "hint";
  fillSalonServiceSelects();
  if (isServicesShop() && i.id) {
    api(`/api/salon/services/${i.id}`)
      .then((m) => {
        if ($("item-duration")) $("item-duration").value = m.duration_min || 30;
        if ($("item-svc-disc")) $("item-svc-disc").value = m.discount_pct || 0;
        if ($("item-gender")) $("item-gender").value = m.gender || "unisex";
        if ($("item-online")) $("item-online").checked = Number(m.online_booking) !== 0;
        if ($("item-staff") && m.staff_ids) {
          try {
            const ids = JSON.parse(m.staff_ids);
            if (Array.isArray(ids) && ids[0]) $("item-staff").value = ids[0];
          } catch {
            $("item-staff").value = m.staff_ids;
          }
        }
        if ($("item-branch")) $("item-branch").value = m.branch_id || "";
      })
      .catch(() => {});
  }
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
  const allItems = state.items || [];
  if (!allItems.length) {
    el.innerHTML = `<div class="item-empty-card">
      <strong>No items yet</strong>
      <p>${isPharmacyShop()
        ? "Add generic, type, pack, batch, expiry, rates, and stock on the left — or upload the Excel template."
        : "Add a name, unit, and rates on the left. Saved items show here and on Counter."}</p>
      ${isPharmacyShop() ? `<button class="btn primary" type="button" id="item-demo-seed">Add demo medicines</button>` : ""}
    </div>`;
    return;
  }
  const matched = matchingItemsForTable();
  const items = matched.slice(0, fastModeOn() ? 80 : ITEMS_PAGE_LIMIT);
  const moreHint = listRenderHint(items.length, matched.length);
  if (!items.length) {
    el.innerHTML = `<div class="item-empty-card">
      <strong>No matching items</strong>
      <p>Clear search or turn off filters to see the rest of the catalog.</p>
    </div>`;
    return;
  }
  if (isPharmacyShop()) {
    el.innerHTML = `${moreHint}<table class="items-pharm-table"><thead><tr>
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
        <td class="pharm-med">${escapeHtml(i.name)}${i.brand ? ` <span class="item-chip is-brand">${escapeHtml(i.brand)}</span>` : ""}${inactive ? ` <span class="item-chip stock low">Inactive</span>` : ""}</td>
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
    return;
  }
  el.innerHTML = `${moreHint}${items
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
      const brandChip = i.brand ? `<span class="item-chip is-brand">${escapeHtml(i.brand)}</span>` : "";
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
          ${brandChip}
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
    .join("")}`;
}

function dueCustomers() {
  return (state.customers || []).filter((c) => customerDue(c) > 0);
}

function fillDueCustomerSelect(selectedId) {
  const el = $("due-customer");
  if (!el) return;
  const due = dueCustomers();
  const cur = selectedId || el.value;
  el.innerHTML = `<option value="">Select customer with due…</option>${due
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.business_name || c.name)} · ${money(customerDue(c))}</option>`)
    .join("")}`;
  if (cur && due.some((c) => c.id === cur)) el.value = cur;
  paintDueOutstanding();
}

function paintDueOutstanding() {
  const el = $("due-outstanding");
  const id = $("due-customer")?.value;
  const c = (state.customers || []).find((row) => row.id === id);
  const due = customerDue(c);
  if (el) el.textContent = c ? `Outstanding: ${money(due)}` : "Outstanding: —";
  if ($("due-amount") && c) {
    $("due-amount").max = String(due);
    if (!$("due-amount").value) $("due-amount").value = String(due);
  }
  void fillDueInvoiceSelect(id, due);
  if ($("due-date") && !$("due-date").value) $("due-date").value = shopDateInputValue();
}

async function fillDueInvoiceSelect(customerId, due) {
  const sel = $("due-invoice");
  if (!sel) return;
  sel.innerHTML = `<option value="">Unallocated (customer due)</option>`;
  if (!customerId || !(Number(due) > 0)) return;
  try {
    const rows = await api(`/api/accounts/open-invoices?customer_id=${encodeURIComponent(customerId)}`);
    (Array.isArray(rows) ? rows : []).forEach((o) => {
      const left = Math.max(0, Number(o.total || 0) - Number(o.amount_paid || 0));
      sel.insertAdjacentHTML(
        "beforeend",
        `<option value="${escapeHtml(o.id)}">${escapeHtml(o.order_number || o.id)} · due ${money(left || o.current_due || 0)}</option>`,
      );
    });
  } catch {
    /* optional */
  }
}

async function collectCustomerDue(customer, amount, method, notes, extras = {}) {
  const paymentDate = extras.payment_date != null ? extras.payment_date : ($("due-date")?.value || undefined);
  const paymentReference = extras.payment_reference != null ? extras.payment_reference : ($("due-ref")?.value || undefined);
  const orderId = extras.order_id != null ? extras.order_id : ($("due-invoice")?.value || undefined);
  const data = await api("/api/accounts/receipts", {
    method: "POST",
    body: JSON.stringify({
      customer_id: customer.id,
      amount: Number(amount),
      payment_method: method,
      notes,
      order_id: orderId || undefined,
      payment_reference: paymentReference || undefined,
      payment_date: paymentDate || undefined,
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
    remaining_due: data.remaining_due ?? data.balance_due ?? data.customer?.outstanding,
    balance_due: data.balance_due ?? data.customer?.outstanding,
    invoice_no: data.invoice_no,
    invoice_amount: data.invoice_amount,
    payment_reference: data.payment_reference || paymentReference,
    payment_date: data.payment_date || paymentDate,
    id: data.ledgerId,
    party_id: customer.id,
  };
  showVoucherResult(entry, { autoPrint: true });
  try {
    await loadOrders();
  } catch {
    /* invoices optional */
  }
  return data;
}

function customerRecord(row) {
  if (!row?.id) return row || null;
  const saved = (state.customers || []).find((c) => c.id === row.id);
  if (!saved) return row;
  return { ...saved, ...row, email: row.email || saved.email || "" };
}

function customerReminderLinks(row, outstanding) {
  const c = customerRecord(row) || row;
  const due = Number(outstanding);
  if (!(due > 0)) return { email: "", whatsapp: "" };
  const M = globalThis.POSCustomerMaster;
  const S = globalThis.POSInvoiceShare;
  const note = M?.dueReminder?.({
    shopName: state.company?.name,
    customerName: c?.business_name || c?.name,
    outstanding: due,
  }) || { subject: "Payment reminder", body: "" };
  const email = String(c?.email || "").trim();
  return {
    email: email && !M?.emailError?.(email) ? M.mailtoUrl(email, note.subject, note.body) : "",
    whatsapp: S?.whatsappShareUrl ? S.whatsappShareUrl(c?.mobile, note.body || "") : "",
  };
}

function customerRemindButtons(row, outstanding) {
  const links = customerReminderLinks(row, outstanding);
  return `${links.email ? `<a class="btn" href="${escapeHtml(links.email)}">Email reminder</a>` : ""}${links.whatsapp ? `<a class="btn" href="${escapeHtml(links.whatsapp)}" target="_blank" rel="noopener">WhatsApp reminder</a>` : ""}`;
}

function resetCustomerForm() {
  $("customer-form")?.reset();
  if ($("cust-id")) $("cust-id").value = "";
  if ($("cust-form-mode")) $("cust-form-mode").textContent = "Customer";
  if ($("cust-save")) $("cust-save").textContent = "Save customer";
  if ($("cust-email")) $("cust-email").setCustomValidity("");
  const emailHint = $("cust-email-hint");
  if (emailHint) {
    emailHint.textContent = "";
    emailHint.className = "hint";
  }
  const matchHint = $("cust-match-hint");
  if (matchHint) {
    matchHint.textContent = "";
    matchHint.className = "hint";
  }
}

function fillCustomerForm(c) {
  if (!c) return;
  if ($("cust-id")) $("cust-id").value = c.id || "";
  if ($("cust-name")) $("cust-name").value = c.name || "";
  if ($("cust-biz")) $("cust-biz").value = c.business_name || "";
  if ($("cust-mobile")) $("cust-mobile").value = c.mobile || "";
  if ($("cust-email")) $("cust-email").value = c.email || "";
  if ($("cust-address")) $("cust-address").value = c.address || "";
  if ($("cust-doctor-rx")) $("cust-doctor-rx").value = c.doctor_rx || "";
  if ($("cust-type")) $("cust-type").value = c.type === "b2b" ? "b2b" : "b2c";
  if ($("cust-gstin")) $("cust-gstin").value = c.gstin || "";
  if ($("cust-state")) $("cust-state").value = c.state || "";
  if ($("cust-dob")) $("cust-dob").value = String(c.dob || "").slice(0, 10);
  if ($("cust-ref")) $("cust-ref").value = c.referred_by || "";
  if ($("cust-locale")) $("cust-locale").value = c.locale || "";
  if ($("cust-form-mode")) $("cust-form-mode").textContent = "Edit customer";
  if ($("cust-save")) $("cust-save").textContent = "Update customer";
  globalThis.POSCustomerMasterUi?.paintEmailField?.($("cust-email"));
}

function paintCustomerDetails(c) {
  const el = $("customer-details");
  if (!el) return;
  if (!c) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  const due = customerDue(c);
  const rows = [
    ["Code", c.code || "—"],
    ["Name", c.business_name || c.name || "—"],
    ["Mobile", c.mobile || "—"],
    ["Email ID", c.email || "—"],
    ["Type", c.type || "—"],
    ["State", c.state || "—"],
    ["GSTIN", c.gstin || "—"],
    ["Address", c.address || "—"],
    ["Outstanding", money(due)],
  ];
  el.hidden = false;
  el.innerHTML = `<h4>Customer details</h4><dl>${rows
    .map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>`)
    .join("")}</dl><div class="cust-actions">${due > 0 ? `<button class="btn primary" type="button" data-collect-due="${escapeHtml(c.id)}">Collect</button>` : ""}${customerRemindButtons(c, due)}<button class="btn" type="button" data-cust-edit="${escapeHtml(c.id)}">Edit</button></div>`;
}

function renderCustomersTable() {
  applyInvoiceDuesToCustomers();
  const list = Array.isArray(state.customers) ? state.customers : [];
  const dueTotal = dueCustomers().reduce((s, c) => s + customerDue(c), 0);
  const stats = $("customers-hero-stats");
  if (stats) {
    stats.innerHTML = [
      ["Customers", list.length],
      ["With due", dueCustomers().length],
      ["Outstanding", money(dueTotal)],
    ]
      .map(([k, v]) => `<div class="items-stat${k === "Outstanding" && dueTotal > 0 ? " is-warn" : ""}"><span>${escapeHtml(k)}</span><strong>${typeof v === "number" ? v : escapeHtml(String(v))}</strong></div>`)
      .join("");
  }
  fillDueCustomerSelect();
  const el = $("customers-table");
  if (!el) return;
  const q = String($("customers-search")?.value || "").trim().toLowerCase();
  const filtered = !q
    ? list
    : list.filter((c) => [c.code, c.name, c.business_name, c.mobile, c.email, c.gstin, c.state].join(" ").toLowerCase().includes(q));
  if (q && !filtered.length) {
    el.innerHTML = `<p class="hint">No customers match this search.</p>`;
    return;
  }
  const cap = fastModeOn() ? 80 : filtered.length;
  const rows = filtered.slice(0, cap);
  const moreHint = listRenderHint(rows.length, filtered.length);
  el.innerHTML = `${moreHint}<table><thead><tr>
    <th>Code</th><th>${isPharmacyShop() ? "Customer Name" : "Name"}</th>${isPharmacyShop() ? "<th>Address</th><th>Doctor / Rx</th>" : "<th>Type</th>"}<th>${isPharmacyShop() ? "Mobile No." : "Mobile"}</th><th>Email ID</th>${isPharmacyShop() ? "" : "<th>State</th><th>GSTIN</th>"}<th>Outstanding</th><th></th>
  </tr></thead><tbody>${rows
    .map((c) => {
      const due = customerDue(c);
      return `<tr>
      <td>${escapeHtml(c.code)}</td>
      <td>${escapeHtml(c.business_name || c.name)}</td>
      ${isPharmacyShop()
        ? `<td>${escapeHtml(c.address || "—")}</td><td>${escapeHtml(c.doctor_rx || "—")}</td>`
        : `<td>${escapeHtml(c.type)}</td>`}
      <td>${escapeHtml(c.mobile)}</td>
      <td>${escapeHtml(c.email || "—")}</td>
      ${isPharmacyShop() ? "" : `<td>${escapeHtml(c.state || "—")}</td><td>${escapeHtml(c.gstin || "—")}</td>`}
      <td class="cust-due">${money(due)}</td>
      <td><div class="cust-actions">
        <button class="btn" type="button" data-cust-details="${escapeHtml(c.id)}">Details</button>
        <button class="btn" type="button" data-cust-edit="${escapeHtml(c.id)}">Edit</button>
        ${due > 0 ? `<button class="btn primary" type="button" data-collect-due="${escapeHtml(c.id)}">Collect</button>` : ""}
        ${customerRemindButtons(c, due)}
      </div></td>
    </tr>`;
    })
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
    stats.innerHTML = `<div class="items-stat packs-stat"><span>Pack types</span><strong>${n}</strong></div>
      <div class="items-stat packs-stat"><span>Recipe lines</span><strong>${lines}</strong></div>`;
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

const PO_CAMERA_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M9.5 4.5v2H7.8c-.5 0-.9.2-1.2.5L4.7 9.5H3.5c-.8 0-1.5.7-1.5 1.5v7c0 .8.7 1.5 1.5 1.5h17c.8 0 1.5-.7 1.5-1.5v-7c0-.8-.7-1.5-1.5-1.5h-1.2l-1.9-2.5c-.3-.3-.7-.5-1.2-.5h-1.7v-2c0-.8-.7-1.5-1.5-1.5h-3c-.8 0-1.5.7-1.5 1.5zm3 11.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>`;

function poCameraButtonHtml(attrs) {
  return `<button type="button" class="scan-camera-btn po-scan-camera-btn" ${attrs} aria-label="Scan barcode with camera" title="Camera scan" hidden>${PO_CAMERA_ICON}</button>`;
}

function setPoHint(msg, kind) {
  const el = $("po-hint");
  if (!el) return;
  el.textContent = msg || "";
  el.className = kind ? `hint ${kind}` : "hint";
}

function renderPoLines() {
  const el = $("po-lines");
  if (!el) return;
  if ($("po-date") && !$("po-date").value) $("po-date").value = ymd();
  const q = ($("po-item-search")?.value || "").trim().toLowerCase();
  let items = activeItems();
  if (q) {
    items = items.filter((i) => [i.name, i.hsn, i.code, i.category, i.subcategory, i.color, i.size, i.wearer_type].join(" ").toLowerCase().includes(q));
  }
  const cap = fastModeOn() ? 80 : items.length;
  const shown = items.slice(0, cap);
  const moreHint = listRenderHint(shown.length, items.length, ". Search to find the rest.");
  if (!shown.length) {
    el.innerHTML = q ? '<p class="hint">No matching items.</p>' : '<p class="hint">No items in the catalog yet.</p>';
    paintPoTotals();
    return;
  }
  if (isApparelShop()) {
    renderApparelPoLines(el, shown, moreHint);
    return;
  }
  renderClassicPoLines(el, shown, moreHint);
}

function renderClassicPoLines(el, shown, moreHint) {
  const rows = [];
  const panels = [];
  for (const i of shown) {
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
          <div class="po-bc-scan-row">
            <input class="po-bc-scan" data-po-bc-scan="${escapeHtml(i.id)}" maxlength="64" placeholder="Scan or type one barcode, then Enter" autocomplete="off" />
            ${poCameraButtonHtml(`data-po-bc-camera="${escapeHtml(i.id)}"`)}
          </div>
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
        <td><div class="po-rate-cell"><input type="number" min="0" step="0.00000001" inputmode="decimal" value="${escapeHtml(POSUnits.rateInputValue?.(i.purchase_rate) ?? i.purchase_rate)}" data-po-rate="${escapeHtml(i.id)}" /><span class="po-suffix">₹${escapeHtml(POSUnits.rateSuffix(unit))}</span></div></td>
        <td><input type="date" data-po-expiry="${escapeHtml(i.id)}" /></td>
        <td class="num" data-po-amt="${escapeHtml(i.id)}">${money(POSUnits.lineAmount(qty, i.purchase_rate, unit))}</td>
      </tr>`);
  }
  el.innerHTML = `${moreHint}<div class="po-table-wrap"><table class="po-table"><thead><tr>
    <th class="po-check"></th><th>Item</th><th>${taxCodeLabel()}</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Expiry</th><th class="num">Amount</th>
  </tr></thead><tbody>${rows.join("")}</tbody></table></div>
    <div id="po-barcode-panels">${panels.join("")}</div>`;
  if (!fastModeOn()) filterPoLines();
  paintPoTotals();
  refreshPoBarcodeRows();
  applyCameraScannerVisibility();
}

function apparelPoGroupSearch(group) {
  return [
    group.name,
    group.color,
    group.wearer_type,
    group.hsn,
    group.category,
    ...(group.variants || []).flatMap((v) => [v.code, v.size, v.barcode]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function apparelPoColorBlockHtml(color, sizes, variants) {
  const G = globalThis.POSGarmentPurchase;
  const label = color || "No colour";
  const swatch = G?.swatchCss?.(color, (variants || []).find((v) => G?.colorsEqual?.(v.color, color))?.color_image) || "";
  const cells = sizes
    .map((sz) => {
      const variant = (variants || []).find((v) => (G?.colorsEqual ? G.colorsEqual(v.color, color) : String(v.color || "") === color) && (G?.sizesEqual?.(v.size, sz) || String(v.size || "").toUpperCase() === sz));
      const have = variant ? fmtQty(variant.stock_gm, variant) : "";
      return `<label class="po-size-cell${variant ? " has-sku" : ""}">
        <span>${escapeHtml(sz)}</span>
        <input type="number" min="0" max="${POSUnits.qtyMax()}" step="1" inputmode="numeric" value="" placeholder="0" data-po-color="${escapeHtml(color)}" data-po-size-qty="${escapeHtml(sz)}" aria-label="${escapeHtml(label)} ${escapeHtml(sz)} quantity" />
        ${have ? `<em>stock ${escapeHtml(have)}</em>` : `<em>new</em>`}
      </label>`;
    })
    .join("");
  return `<section class="po-color-block" data-po-color-block="${escapeHtml(color)}">
    <header class="po-color-head"><i class="garment-swatch" style="${swatch}"></i><strong>${escapeHtml(label)}</strong></header>
    <div class="po-size-matrix">${cells}</div>
  </section>`;
}

function renderApparelPoLines(el, shown, moreHint) {
  const G = globalThis.POSGarmentPurchase;
  const groups = G?.styleGroups?.(shown) || G?.groupItems?.(shown) || shown.map((item) => ({
    key: item.id,
    name: item.name,
    color: item.color || "",
    colors: item.color ? [item.color] : [],
    wearer_type: item.wearer_type || "",
    hsn: item.hsn || "",
    purchase_rate: item.purchase_rate,
    unit: itemUnit(item),
    anchor: item,
    variants: [item],
    sizes: item.size ? [item.size] : [],
  }));
  const cards = groups.map((g) => {
    const key = escapeHtml(g.key);
    const unit = itemUnit(g.anchor || g.variants[0] || {});
    const sizes = G?.sizeColumns?.(g) || ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "28", "30", "32", "34", "36", "38"];
    const colors = (g.colors && g.colors.length ? g.colors : [g.color || ""]).filter((color, idx, all) => all.indexOf(color) === idx);
    const blocks = (colors.length ? colors : [""]).map((color) => apparelPoColorBlockHtml(color, sizes, g.variants)).join("");
    const wear = globalThis.POSFootwear?.wearerLabel?.(g.wearer_type) || g.wearer_type || "";
    const search = apparelPoGroupSearch({ ...g, color: (g.colors || []).join(" ") });
    const variantIds = escapeHtml((g.variants || []).map((v) => v.id).filter(Boolean).join(" "));
    return `<article class="po-product" data-po-product-row="${key}" data-po-anchor="${escapeHtml(g.anchor?.id || "")}" data-po-variant-ids="${variantIds}" data-po-sizes="${escapeHtml(sizes.join(" "))}" data-po-search="${escapeHtml(search)}" data-po-unit="${escapeHtml(unit)}">
      <header class="po-product-head">
        <label class="po-check"><input type="checkbox" data-po-product="${key}" /></label>
        <div class="po-product-copy">
          <strong>${escapeHtml(g.name)}</strong>
          <span>${escapeHtml(wear || "Garment")}${g.hsn ? ` · ${escapeHtml(taxCodeLabel())} ${escapeHtml(g.hsn)}` : ""} · colour and size</span>
        </div>
        <div class="po-product-totals">
          <span data-po-qty-total="${key}">0 pcs</span>
          <span class="num" data-po-amt="${key}">${money(0)}</span>
        </div>
      </header>
      <div class="po-color-blocks" data-po-color-blocks="${key}">${blocks}</div>
      <div class="po-color-add">
        <input data-po-custom-color list="garment-color-list" maxlength="40" placeholder="Add colour" aria-label="Add colour for ${escapeHtml(g.name)}" />
        <button class="btn" type="button" data-po-add-color="${key}">Add colour</button>
      </div>
      <div class="po-extra-sizes" data-po-extra-wrap="${key}"></div>
      <div class="po-product-meta">
        <label>Rate
          <span class="po-rate-cell">
            <input type="number" min="0" step="0.00000001" inputmode="decimal" value="${escapeHtml(POSUnits.rateInputValue?.(g.purchase_rate) ?? g.purchase_rate)}" data-po-rate="${key}" />
            <span class="po-suffix">₹${escapeHtml(POSUnits.rateSuffix(unit))}</span>
          </span>
        </label>
        <button class="btn" type="button" data-po-add-size="${key}">Add size</button>
        <label class="po-gen-bc"><input type="checkbox" data-po-gen-bc="${key}" checked /> Generate unique barcodes</label>
      </div>
      <div class="po-bc-panel" data-po-bc-product="${key}" hidden>
        <div class="po-bc-box">
          <div class="po-bc-head">
            <strong>Barcodes for ${escapeHtml(g.name)}</strong>
            <span class="hint" data-po-bc-count="${key}">Scan each colour and size, or leave empty to generate</span>
          </div>
          <div class="po-size-bc-list" data-po-size-bc="${key}"></div>
        </div>
      </div>
    </article>`;
  });
  el.innerHTML = `${moreHint}<div class="po-product-list">${cards.join("")}</div>`;
  if (!fastModeOn()) filterPoLines();
  paintPoTotals();
  applyCameraScannerVisibility();
}

function extraSizeCellHtml(color = "") {
  return `<label class="po-size-cell is-custom" data-po-extra-size data-po-color="${escapeHtml(color)}">
    <input data-po-extra-name maxlength="16" placeholder="Size" aria-label="Custom size" />
    <input type="number" min="0" max="${POSUnits.qtyMax()}" step="1" inputmode="numeric" value="" placeholder="Qty" data-po-color="${escapeHtml(color)}" data-po-extra-qty aria-label="Custom size quantity" />
  </label>`;
}

function apparelSizeBarcodeCount(raw) {
  try {
    return parsePoBarcodes(raw).length;
  } catch {
    return 0;
  }
}

function apparelVariantBcKey(color, size) {
  const G = globalThis.POSGarmentPurchase;
  return G?.variantKey?.(color, size) || `${String(color || "").trim().toLowerCase()}|${size}`;
}

function apparelSizeBarcodeBlockHtml(key, label, n, saved, gen) {
  const typed = apparelSizeBarcodeCount(saved);
  const caption = `${label} · ${typed} / ${n} pcs`;
  return `<div class="po-size-bc" data-po-size-bc-row="${escapeHtml(key)}">
    <div class="po-size-bc-head">
      <span data-po-size-bc-label="${escapeHtml(key)}">${escapeHtml(caption)}</span>
      <span class="hint${typed === n && n > 0 ? " ok" : ""}">${gen && typed < n ? "rest generated" : ""}</span>
    </div>
    <div class="po-bc-scan-row">
      <input class="po-bc-scan" data-po-size-bc-scan="${escapeHtml(key)}" maxlength="64" placeholder="Scan ${escapeHtml(label)} barcode, then Enter" autocomplete="off" aria-label="Scan ${escapeHtml(label)} barcode" />
      ${poCameraButtonHtml(`data-po-size-bc-camera="${escapeHtml(key)}"`)}
    </div>
    <textarea class="po-bc-list" data-po-size-barcodes="${escapeHtml(key)}" rows="${Math.min(6, Math.max(2, n))}" placeholder="${gen ? "Optional — leftover codes are generated" : `${n} barcodes, one per line`}">${escapeHtml(saved)}</textarea>
  </div>`;
}

function apparelColorSizeQtysFromCard(card) {
  const G = globalThis.POSGarmentPurchase;
  const matrix = {};
  const add = (color, size, qty) => {
    const sz = G?.normalizeSize?.(size) || String(size || "").trim();
    const n = Math.max(0, Math.round(Number(qty) || 0));
    if (!sz || !n) return;
    const name = G?.normalizeColor?.(color) || String(color || "").trim();
    if (!matrix[name]) matrix[name] = {};
    matrix[name][sz] = (matrix[name][sz] || 0) + n;
  };
  card.querySelectorAll("[data-po-size-qty]").forEach((inp) => add(inp.dataset.poColor || "", inp.dataset.poSizeQty, inp.value));
  card.querySelectorAll("[data-po-extra-size]").forEach((wrap) => {
    add(wrap.dataset.poColor || wrap.querySelector("[data-po-extra-qty]")?.dataset.poColor || "", wrap.querySelector("[data-po-extra-name]")?.value, wrap.querySelector("[data-po-extra-qty]")?.value);
  });
  return matrix;
}

function apparelSizeQtysFromCard(card) {
  const flat = {};
  for (const sizes of Object.values(apparelColorSizeQtysFromCard(card))) {
    for (const [sz, n] of Object.entries(sizes)) flat[sz] = (flat[sz] || 0) + n;
  }
  return flat;
}

function refreshApparelPoCard(card) {
  if (!card) return;
  const key = card.dataset.poProductRow;
  const matrix = apparelColorSizeQtysFromCard(card);
  const pairs = [];
  for (const [color, sizes] of Object.entries(matrix)) {
    for (const [sz, n] of Object.entries(sizes)) pairs.push({ color, size: sz, qty: n, key: apparelVariantBcKey(color, sz) });
  }
  const total = pairs.reduce((sum, row) => sum + row.qty, 0);
  const rate = Number(card.querySelector("[data-po-rate]")?.value) || 0;
  const unit = card.dataset.poUnit || "PCS";
  const amt = POSUnits.lineAmount(total, rate, unit);
  const box = card.querySelector("[data-po-product]");
  if (box && total > 0) box.checked = true;
  if (box && total <= 0 && box.checked && !box.dataset.poManual) box.checked = false;
  card.classList.toggle("is-checked", Boolean(box?.checked));
  const qtyEl = card.querySelector(`[data-po-qty-total="${key}"]`);
  if (qtyEl) qtyEl.textContent = `${total} pcs`;
  const amtEl = card.querySelector(`[data-po-amt="${key}"]`);
  if (amtEl) amtEl.textContent = money(amt);
  const gen = card.querySelector("[data-po-gen-bc]")?.checked !== false;
  const bcPanel = card.querySelector("[data-po-bc-product]");
  if (bcPanel) bcPanel.hidden = !box?.checked || total <= 0;
  const list = card.querySelector("[data-po-size-bc]");
  if (list) {
    const sizeKey = pairs.map((row) => row.key).join("|");
    if (list.dataset.poSizeKey !== sizeKey) {
      const existing = new Map();
      list.querySelectorAll("[data-po-size-barcodes]").forEach((ta) => existing.set(ta.dataset.poSizeBarcodes, ta.value));
      list.dataset.poSizeKey = sizeKey;
      list.innerHTML = pairs.map((row) => {
        const label = [row.color, row.size].filter(Boolean).join(" · ");
        return apparelSizeBarcodeBlockHtml(row.key, label, row.qty, existing.get(row.key) || "", gen);
      }).join("");
      applyCameraScannerVisibility();
    } else {
      pairs.forEach((row) => {
        const ta = list.querySelector(`[data-po-size-barcodes="${CSS.escape(row.key)}"]`);
        if (!ta) return;
        const typed = apparelSizeBarcodeCount(ta.value);
        const lab = list.querySelector(`[data-po-size-bc-label="${CSS.escape(row.key)}"]`);
        const label = [row.color, row.size].filter(Boolean).join(" · ");
        if (lab) lab.textContent = `${label} · ${typed} / ${row.qty} pcs`;
        const rest = lab?.parentElement?.querySelector(".hint");
        if (rest) {
          rest.textContent = gen && typed < row.qty ? "rest generated" : "";
          rest.className = typed === row.qty && row.qty > 0 ? "hint ok" : "hint";
        }
        ta.rows = Math.min(6, Math.max(2, row.qty));
        ta.placeholder = gen ? "Optional — leftover codes are generated" : `${row.qty} barcodes, one per line`;
      });
    }
  }
  const countEl = card.querySelector(`[data-po-bc-count="${key}"]`);
  if (countEl) {
    let typed = 0;
    card.querySelectorAll("[data-po-size-barcodes]").forEach((ta) => {
      try {
        typed += parsePoBarcodes(ta.value).length;
      } catch {
        /* ignore until submit */
      }
    });
    countEl.textContent = gen
      ? `${typed} typed / ${total} pcs — rest generated if generate is on`
      : `${typed} / ${total} typed barcodes`;
    countEl.className = (!gen && typed === total && total > 0) || (gen && typed <= total) ? "hint ok" : "hint";
  }
}

function collectApparelPoLines() {
  const G = globalThis.POSGarmentPurchase;
  const lines = [];
  const allCodes = [];
  document.querySelectorAll("[data-po-product-row]").forEach((card) => {
    const box = card.querySelector("[data-po-product]");
    if (!box?.checked) return;
    const name = card.querySelector(".po-product-copy strong")?.textContent || "Item";
    const matrix = apparelColorSizeQtysFromCard(card);
    const total = Object.values(matrix).reduce((sum, sizes) => sum + (G?.totalQty?.(sizes) || 0), 0);
    if (!total) throw new Error(`${name}: enter colour and size quantity`);
    const generate = card.querySelector("[data-po-gen-bc]")?.checked !== false;
    const barcodesByVariant = {};
    card.querySelectorAll("[data-po-size-barcodes]").forEach((ta) => {
      const codes = parsePoBarcodes(ta.value);
      barcodesByVariant[ta.dataset.poSizeBarcodes] = codes;
      allCodes.push(codes);
    });
    for (const [color, qtys] of Object.entries(matrix)) {
      G?.planSizeLines?.(qtys, {
        generate_barcodes: generate,
        barcodes_by_size: G?.barcodesForColor?.(barcodesByVariant, color) || {},
        allow_empty_barcodes: true,
      });
    }
    const only = Object.keys(matrix);
    lines.push({
      item_id: card.dataset.poAnchor,
      color_size_qtys: matrix,
      size_qtys: only.length === 1 ? matrix[only[0]] : undefined,
      rate_per_kg: POSUnits.roundRate8?.(card.querySelector("[data-po-rate]")?.value) ?? Number(card.querySelector("[data-po-rate]")?.value),
      generate_barcodes: generate,
      barcodes_by_variant: barcodesByVariant,
      allow_empty_barcodes: true,
    });
  });
  G?.collectDuplicateBarcodes?.(allCodes);
  return lines;
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
  document.querySelectorAll("#po-lines [data-po-product-row]").forEach((card) => {
    const hay = card.dataset.poSearch || "";
    card.hidden = Boolean(q) && !hay.includes(q);
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

function cleanPoBarcode(raw) {
  return globalThis.POSBarcode?.cleanCode ? POSBarcode.cleanCode(raw) : String(raw || "").trim();
}

function listedPurchaseBarcodes() {
  const out = [];
  document.querySelectorAll("[data-po-barcodes], [data-po-size-barcodes]").forEach((ta) => {
    try {
      out.push(...parsePoBarcodes(ta.value));
    } catch {
      /* ignore invalid draft until submit */
    }
  });
  return out;
}

function appendCodesToPoList(ta, code) {
  if (!ta) throw new Error("Pick a purchase line first");
  const cleaned = cleanPoBarcode(code);
  if (!cleaned) return false;
  let existing = [];
  try {
    existing = parsePoBarcodes(ta.value);
  } catch (err) {
    throw err;
  }
  if (existing.includes(cleaned) || listedPurchaseBarcodes().includes(cleaned)) {
    throw new Error(`Duplicate barcode ${cleaned}`);
  }
  existing.push(cleaned);
  ta.value = existing.join("\n");
  return true;
}

function findApparelPoCard(item) {
  if (!item) return null;
  const id = String(item.id || "");
  return [...document.querySelectorAll("[data-po-product-row]")].find((card) => {
    if (card.dataset.poAnchor === id) return true;
    return String(card.dataset.poVariantIds || "").split(/\s+/).includes(id);
  }) || null;
}

function revealPurchaseCatalogItem(item) {
  if (!item) return;
  const visible = document.querySelector(`[data-po-row="${item.id}"]`) || findApparelPoCard(item);
  if (visible) return;
  const search = $("po-item-search");
  if (!search) return;
  search.value = String(item.name || item.code || item.barcode || "").trim();
  renderPoLines();
}

function bumpClassicPoQty(item) {
  const box = document.querySelector(`[data-po-item="${item.id}"]`);
  const qtyEl = document.querySelector(`[data-po-qty="${item.id}"]`);
  const unit = itemUnit(item);
  if (!box) return false;
  if (!box.checked) {
    box.checked = true;
  } else if (POSUnits.isCount(unit) && qtyEl) {
    qtyEl.value = String(Math.max(0, Math.round(Number(qtyEl.value) || 0)) + 1);
  }
  const row = document.querySelector(`[data-po-row="${item.id}"]`);
  row?.scrollIntoView({ block: "nearest" });
  paintPoLineAmount(item.id);
  paintPoTotals();
  return true;
}

function apparelSizeQtyInput(card, size, color) {
  const G = globalThis.POSGarmentPurchase;
  const sz = G?.normalizeSize?.(size) || String(size || "").trim();
  const wantColor = color == null ? null : (G?.normalizeColor?.(color) || String(color || "").trim());
  if (!card || !sz) return null;
  const sameColor = (value) => wantColor == null || (G?.colorsEqual ? G.colorsEqual(value, wantColor) : String(value || "") === wantColor);
  const preset = [...card.querySelectorAll("[data-po-size-qty]")].find((inp) =>
    sameColor(inp.dataset.poColor) && (G?.sizesEqual?.(inp.dataset.poSizeQty, sz) || String(inp.dataset.poSizeQty || "") === sz),
  );
  if (preset) return preset;
  const extras = [...card.querySelectorAll("[data-po-extra-size]")];
  const match = extras.find((wrap) => {
    const name = wrap.querySelector("[data-po-extra-name]")?.value;
    return sameColor(wrap.dataset.poColor) && (G?.sizesEqual?.(name, sz) || String(name || "").trim() === sz);
  });
  if (match) return match.querySelector("[data-po-extra-qty]");
  const block = wantColor == null
    ? card.querySelector("[data-po-color-block]")
    : [...card.querySelectorAll("[data-po-color-block]")].find((row) => sameColor(row.dataset.poColorBlock));
  const matrix = block?.querySelector(".po-size-matrix");
  if (!matrix) return null;
  matrix.insertAdjacentHTML("beforeend", extraSizeCellHtml(wantColor || block.dataset.poColorBlock || ""));
  const cell = matrix.querySelector("[data-po-extra-size]:last-child");
  const nameEl = cell?.querySelector("[data-po-extra-name]");
  if (nameEl) nameEl.value = sz;
  return cell?.querySelector("[data-po-extra-qty]") || null;
}

function setApparelSizeQty(card, size, qty, color) {
  const input = apparelSizeQtyInput(card, size, color);
  if (!input) return false;
  input.value = String(Math.max(0, Math.round(Number(qty) || 0)));
  const box = card.querySelector("[data-po-product]");
  if (box && Number(input.value) > 0) box.checked = true;
  card.scrollIntoView({ block: "nearest" });
  paintPoTotals();
  return true;
}

function bumpApparelPoSize(card, size, color) {
  const G = globalThis.POSGarmentPurchase;
  const sz = G?.normalizeSize?.(size) || String(size || "").trim();
  const want = color == null ? "" : (G?.normalizeColor?.(color) || String(color || "").trim());
  const matrix = apparelColorSizeQtysFromCard(card);
  const bucket = want ? matrix[want] || {} : Object.values(matrix)[0] || {};
  return setApparelSizeQty(card, sz, (bucket[sz] || 0) + 1, want || Object.keys(matrix)[0] || "");
}

function selectPurchaseCatalogItem(item) {
  revealPurchaseCatalogItem(item);
  if (isApparelShop()) {
    const card = findApparelPoCard(item);
    if (!card) return false;
    if (item.size) return bumpApparelPoSize(card, item.size, item.color || "");
    const box = card.querySelector("[data-po-product]");
    if (box) box.checked = true;
    card.scrollIntoView({ block: "nearest" });
    paintPoTotals();
    return true;
  }
  return bumpClassicPoQty(item);
}

function apparelPieceSizeTarget(card, item, sizeHint) {
  const G = globalThis.POSGarmentPurchase;
  const color = G?.normalizeColor?.(item?.color) || String(item?.color || "").trim();
  const hinted = sizeHint && !String(sizeHint).includes("|")
    ? (G?.normalizeSize?.(sizeHint) || String(sizeHint).trim())
    : "";
  if (hinted) return { color, size: hinted, key: apparelVariantBcKey(color, hinted) };
  if (sizeHint && String(sizeHint).includes("|")) {
    const [rawColor, ...rest] = String(sizeHint).split("|");
    const size = G?.normalizeSize?.(rest.join("|")) || rest.join("|");
    const parsed = G?.normalizeColor?.(rawColor) || rawColor;
    return { color: parsed || color, size, key: sizeHint };
  }
  if (item?.size) {
    const size = G?.normalizeSize?.(item.size) || String(item.size).trim();
    return { color, size, key: apparelVariantBcKey(color, size) };
  }
  const active = document.activeElement;
  const sizeScan = active?.closest?.("[data-po-size-bc-scan]");
  if (sizeScan && card.contains(sizeScan)) return { key: sizeScan.dataset.poSizeBcScan, size: sizeScan.dataset.poSizeBcScan, color };
  const focused = active?.closest?.("[data-po-size-barcodes]");
  if (focused && card.contains(focused)) return { key: focused.dataset.poSizeBarcodes, size: focused.dataset.poSizeBarcodes, color };
  const pairs = [];
  for (const [rowColor, sizes] of Object.entries(apparelColorSizeQtysFromCard(card))) {
    for (const sz of Object.keys(sizes)) pairs.push({ color: rowColor, size: sz, key: apparelVariantBcKey(rowColor, sz) });
  }
  if (!pairs.length) return { color, size: "", key: "" };
  if (pairs.length === 1) return pairs[0];
  for (const row of pairs) {
    const ta = card.querySelector(`[data-po-size-barcodes="${CSS.escape(row.key)}"]`);
    let n = 0;
    try {
      n = parsePoBarcodes(ta?.value || "").length;
    } catch {
      n = 0;
    }
    const qty = apparelColorSizeQtysFromCard(card)[row.color]?.[row.size] || 0;
    if (n < qty) return row;
  }
  return pairs[0];
}

function addPurchasePieceBarcode(code, source) {
  const cleaned = cleanPoBarcode(code);
  if (!cleaned) return false;
  if (source?.kind === "classic") {
    const ta = document.querySelector(`[data-po-barcodes="${source.id}"]`);
    appendCodesToPoList(ta, cleaned);
    const box = document.querySelector(`[data-po-item="${source.id}"]`);
    if (box) box.checked = true;
    const qtyEl = document.querySelector(`[data-po-qty="${source.id}"]`);
    const lineCodes = parsePoBarcodes(ta?.value || "");
    if (qtyEl && POSUnits.isCount(document.querySelector(`[data-po-row="${source.id}"]`)?.dataset.poUnit || "PCS")) {
      const qty = Math.max(0, Math.round(Number(qtyEl.value) || 0));
      if (lineCodes.length > qty) qtyEl.value = String(lineCodes.length);
    }
    refreshPoBarcodeRows();
    paintPoTotals();
    const scan = document.querySelector(`[data-po-bc-scan="${source.id}"]`);
    if (scan) scan.value = "";
    return true;
  }
  const card = source?.card || document.querySelector(`[data-po-product-row="${source?.id || ""}"]`);
  if (!card) throw new Error("Select a garment, then scan piece barcodes");
  const target = apparelPieceSizeTarget(card, source?.item, source?.size);
  if (!target?.key && !target?.size) throw new Error("Enter a colour and size quantity first, then scan that variant");
  const color = target.color || "";
  const size = target.size || "";
  const key = target.key || apparelVariantBcKey(color, size);
  const current = apparelColorSizeQtysFromCard(card)[color]?.[size] || 0;
  if (!(current > 0) && size) setApparelSizeQty(card, size, 1, color);
  const ta = card.querySelector(`[data-po-size-barcodes="${CSS.escape(key)}"]`);
  appendCodesToPoList(ta, cleaned);
  const n = parsePoBarcodes(ta?.value || "").length;
  const qtyNow = apparelColorSizeQtysFromCard(card)[color]?.[size] || 0;
  if (n > qtyNow && size) setApparelSizeQty(card, size, n, color);
  const scan = card.querySelector(`[data-po-size-bc-scan="${CSS.escape(key)}"]`) || card.querySelector("[data-po-product-bc-scan]");
  if (scan) scan.value = "";
  paintPoTotals();
  const label = [color, size].filter(Boolean).join(" · ") || size;
  return { size: label, n, qty: apparelColorSizeQtysFromCard(card)[color]?.[size] || n };
}

function selectedPurchasePieceSource() {
  if (isApparelShop()) {
    const cards = [...document.querySelectorAll("[data-po-product-row]")].filter((card) => card.querySelector("[data-po-product]:checked"));
    if (cards.length === 1) return { kind: "apparel", id: cards[0].dataset.poProductRow, card: cards[0] };
    return null;
  }
  const checked = [...document.querySelectorAll("[data-po-item]:checked")];
  if (checked.length === 1) return { kind: "classic", id: checked[0].dataset.poItem };
  return null;
}

async function lookupPurchaseScanItem(code) {
  let item = findItemByBarcode(code) || findItemBySkuOrHsn(code);
  if (item) return { item, match: null };
  try {
    const data = await api(`/api/barcodes/lookup?code=${encodeURIComponent(code)}`);
    const match = data.match || data;
    const id = match.item_id || match.id;
    item = (state.items || []).find((i) => i.id === id) || hydrateItemFromBarcodeMatch(match, code);
    return { item, match };
  } catch (err) {
    const msg = String(err.message || "");
    if (/inactive|already sold|already damaged|duplicate/i.test(msg)) throw err;
    return { item: findItemByBarcode(code) || findItemBySkuOrHsn(code), match: null };
  }
}

function isCatalogPurchaseBarcode(item, match, code) {
  if (globalThis.POSBarcode?.isReusableProductKind?.(match?.kind)) return true;
  if (match?.kind && !globalThis.POSBarcode?.isReusableProductKind(match.kind) && match?.source !== "item") return false;
  return Boolean(item && globalThis.POSBarcode?.itemHasBarcode?.(item, code));
}

async function applyPurchaseBarcodeScan(raw, source) {
  const code = cleanPoBarcode(raw);
  if (!code) return false;
  try {
    if (source?.kind === "classic" || source?.kind === "apparel") {
      const added = addPurchasePieceBarcode(code, source);
      if (added && added.size) {
        const done = added.qty > 0 && added.n >= added.qty;
        setPoHint(
          done
            ? `${added.size}: ${added.n} / ${added.qty} pcs complete`
            : `Added ${code} to ${added.size} (${added.n} / ${added.qty})`,
          "ok",
        );
      } else {
        setPoHint(`Added barcode ${code}`, "ok");
      }
      return true;
    }
    const found = await lookupPurchaseScanItem(code);
    const item = found.item;
    const catalog = item && isCatalogPurchaseBarcode(item, found.match, code);
    if (found.match && !catalog) {
      throw new Error(`Barcode ${code} is already in stock`);
    }
    if (catalog) {
      if (!selectPurchaseCatalogItem(item)) {
        setPoHint(`Found ${item.name}, but it is not on this purchase list.`, "error");
        return false;
      }
      const sizeBit = item.size ? ` · size ${item.size}` : "";
      setPoHint(`Selected ${item.name}${sizeBit}`, "ok");
      return true;
    }
    const selected = selectedPurchasePieceSource();
    if (selected) {
      if (item) selected.item = item;
      const added = addPurchasePieceBarcode(code, selected);
      if (added && added.size) {
        setPoHint(`Added ${code} to ${added.size} (${added.n} / ${added.qty})`, "ok");
      } else {
        setPoHint(`Added barcode ${code}`, "ok");
      }
      return true;
    }
    setPoHint(`No item matches “${code}”. Select a product, then scan piece barcodes.`, "error");
    return false;
  } catch (err) {
    setPoHint(err?.message || "Could not use that barcode", "error");
    return false;
  }
}

function openPurchaseCamera(source) {
  const scan = globalThis.POSCameraScan;
  if (!scan?.open) return;
  if (!cameraScannerEnabled()) {
    setPoHint("Enable camera barcode scanning in Settings → Other till devices.", "error");
    return;
  }
  const piece = source?.kind === "classic" || source?.kind === "apparel";
  const title = source?.title
    || (source?.size ? `Scan ${source.size} barcodes` : piece ? "Scan purchase barcodes" : "Scan to add purchase items");
  void scan.open({
    keepOpen: true,
    title,
    onScan: (code) => {
      void applyPurchaseBarcodeScan(code, source);
    },
    onError: (err) => setPoHint(err?.message || "Camera scan failed", "error"),
  });
}

function initPurchaseCameraScan() {
  $("view-purchases")?.addEventListener("click", (e) => {
    const catalogBtn = e.target.closest("#po-scan-camera-btn");
    if (catalogBtn) {
      e.preventDefault();
      openPurchaseCamera({ kind: "search" });
      return;
    }
    const classicBtn = e.target.closest("[data-po-bc-camera]");
    if (classicBtn) {
      e.preventDefault();
      openPurchaseCamera({ kind: "classic", id: classicBtn.dataset.poBcCamera });
      return;
    }
    const sizeBtn = e.target.closest("[data-po-size-bc-camera]");
    if (sizeBtn) {
      e.preventDefault();
      const card = sizeBtn.closest("[data-po-product-row]");
      const sz = sizeBtn.dataset.poSizeBcCamera;
      openPurchaseCamera({
        kind: "apparel",
        id: card?.dataset.poProductRow,
        card,
        size: sz,
        title: `Scan ${sz} barcodes`,
      });
      return;
    }
    const apparelBtn = e.target.closest("[data-po-product-bc-camera]");
    if (apparelBtn) {
      e.preventDefault();
      const card = apparelBtn.closest("[data-po-product-row]");
      openPurchaseCamera({ kind: "apparel", id: apparelBtn.dataset.poProductBcCamera, card });
    }
  });
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
  const card = document.querySelector(`[data-po-product-row="${itemId}"]`);
  if (card) {
    refreshApparelPoCard(card);
    return;
  }
  const qty = Number(document.querySelector(`[data-po-qty="${itemId}"]`)?.value) || 0;
  const rate = Number(document.querySelector(`[data-po-rate="${itemId}"]`)?.value) || 0;
  const unit = document.querySelector(`[data-po-row="${itemId}"]`)?.dataset.poUnit || "GM";
  const cell = document.querySelector(`[data-po-amt="${itemId}"]`);
  if (cell) cell.textContent = money(POSUnits.lineAmount(qty, rate, unit));
  refreshPoBarcodeRows();
}

function paintPoTotals() {
  if (isApparelShop() && document.querySelector("[data-po-product-row]")) {
    let total = 0;
    let n = 0;
    document.querySelectorAll("[data-po-product-row]").forEach((card) => {
      refreshApparelPoCard(card);
      const box = card.querySelector("[data-po-product]");
      if (!box?.checked) return;
      n += 1;
      const qtys = apparelSizeQtysFromCard(card);
      const qty = globalThis.POSGarmentPurchase?.totalQty?.(qtys) || 0;
      const rate = Number(card.querySelector("[data-po-rate]")?.value) || 0;
      total += POSUnits.lineAmount(qty, rate, card.dataset.poUnit || "PCS");
    });
    if ($("po-selected-meta")) $("po-selected-meta").textContent = `${n} selected`;
    if ($("po-total")) $("po-total").textContent = money(total);
    return;
  }
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
  if ($("set-table-shifting")) $("set-table-shifting").checked = tableShiftingEnabled();
  if ($("table-shift-status")) $("table-shift-status").textContent = `Table shifting: ${tableShiftingEnabled() ? "Enabled" : "Disabled"}`;
  if ($("set-camera-scanner")) $("set-camera-scanner").checked = cameraScannerEnabled();
  if ($("set-receipt-printer")) $("set-receipt-printer").checked = receiptPrinterEnabled();
  if ($("set-cash-drawer")) $("set-cash-drawer").checked = cashDrawerEnabled();
  if ($("camera-scanner-status")) $("camera-scanner-status").textContent = `Camera scanner: ${cameraScannerEnabled() ? "Enabled" : "Disabled"}`;
  if ($("receipt-printer-status")) $("receipt-printer-status").textContent = `Receipt printer: ${receiptPrinterEnabled() ? "Enabled" : "Disabled"}`;
  if ($("cash-drawer-status")) $("cash-drawer-status").textContent = `Cash drawer: ${cashDrawerEnabled() ? "Enabled" : "Disabled"}`;
  applyCameraScannerVisibility();
  void loadAggregatorSettings();
  const showQuickAdd = quickAddVisible();
  if ($("set-quick-add-show")) $("set-quick-add-show").checked = showQuickAdd;
  if ($("set-quick-add-hide")) $("set-quick-add-hide").checked = !showQuickAdd;
  state.fastModePreview = null;
  const showFast = fastModeOn();
  if ($("set-fast-mode-on")) $("set-fast-mode-on").checked = showFast;
  if ($("set-fast-mode-off")) $("set-fast-mode-off").checked = !showFast;
  if ($("set-low-stock-threshold")) $("set-low-stock-threshold").value = String(lowStockThreshold());
  applyQuickAddVisibility();
  applyFastMode();
  paintTableShiftHistory();
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
  clearSettingsDirty();
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

async function paintTableShiftHistory() {
  const el = $("table-shift-history");
  if (!el) return;
  if (!isRestaurantShop()) {
    el.innerHTML = "";
    if ($("table-shift-pager")) $("table-shift-pager").hidden = true;
    return;
  }
  try {
    const data = await api("/api/table-shifts/");
    const rows = data.shifts || [];
    let list = Array.isArray(rows) ? rows : [];
    const q = String($("table-shift-search")?.value || "").trim().toLowerCase();
    const from = String($("table-shift-from")?.value || "");
    const to = String($("table-shift-to")?.value || "");
    if (q) {
      list = list.filter((row) =>
        [row.order_number, row.old_table, row.new_table, row.shifted_by]
          .map((v) => String(v || "").toLowerCase())
          .some((v) => v.includes(q)),
      );
    }
    if (from) list = list.filter((row) => String(row.created_at || "").slice(0, 10) >= from);
    if (to) list = list.filter((row) => String(row.created_at || "").slice(0, 10) <= to);
    const pageSize = 10;
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    state.tableShiftPage = Math.min(Math.max(1, Number(state.tableShiftPage) || 1), pages);
    const start = (state.tableShiftPage - 1) * pageSize;
    const pageRows = list.slice(start, start + pageSize);
    const pager = $("table-shift-pager");
    if (pager) {
      pager.hidden = list.length <= pageSize;
      if ($("table-shift-page-label")) $("table-shift-page-label").textContent = `Page ${state.tableShiftPage} of ${pages}`;
      if ($("table-shift-prev")) $("table-shift-prev").disabled = state.tableShiftPage <= 1;
      if ($("table-shift-next")) $("table-shift-next").disabled = state.tableShiftPage >= pages;
    }
    if (!list.length) {
      el.innerHTML = tableShiftingEnabled()
        ? "<p class='hint'>No table shifts yet.</p>"
        : "<p class='hint'>Table shifting is off. Past shifts stay listed here after you turn it on and records exist.</p>";
      return;
    }
    const R = restaurantApi();
    el.innerHTML = `<table><thead><tr><th>Order</th><th>From</th><th>To</th><th>By</th><th>When</th></tr></thead><tbody>${pageRows
      .map((row) => {
        const when = row.created_at ? String(row.created_at).replace("T", " ").slice(0, 19) : "";
        return `<tr>
          <td>${escapeHtml(row.order_number || "—")}</td>
          <td>${escapeHtml(R?.displayTable?.(row.old_table) || row.old_table || "")}</td>
          <td>${escapeHtml(R?.displayTable?.(row.new_table) || row.new_table || "")}</td>
          <td>${escapeHtml(row.shifted_by || "")}</td>
          <td>${escapeHtml(when)}</td>
        </tr>`;
      })
      .join("")}</tbody></table>`;
  } catch {
    el.innerHTML = "<p class='hint'>Shift history unavailable.</p>";
  }
}

async function saveHardwareFlags(extra = {}) {
  const payload = {
    name: state.company?.name || $("set-name")?.value || "Shop",
    address: state.company?.address || "",
    phone: state.company?.phone || "",
    email: state.company?.email || "",
    gstin: state.company?.gstin || "",
    camera_scanner_enabled: $("set-camera-scanner")?.checked ? 1 : 0,
    receipt_printer_enabled: $("set-receipt-printer")?.checked ? 1 : 0,
    cash_drawer_enabled: $("set-cash-drawer")?.checked ? 1 : 0,
    ...extra,
  };
  const data = await api("/api/settings", { method: "POST", body: JSON.stringify(payload) });
  if (data.company) state.company = { ...state.company, ...data.company };
  applyCameraScannerVisibility();
  return data;
}

function applyCameraScannerVisibility() {
  const on = cameraScannerEnabled();
  ["scan-camera-btn", "bill-scan-camera-btn", "po-scan-camera-btn"].forEach((id) => {
    const el = $(id);
    if (el) el.hidden = !on;
  });
  document.querySelectorAll("[data-po-bc-camera], [data-po-product-bc-camera], [data-po-size-bc-camera]").forEach((el) => {
    el.hidden = !on;
  });
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
  root.querySelectorAll("[data-copy-phone], [data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const value = btn.getAttribute("data-copy-phone") || btn.getAttribute("data-copy") || "";
      if (!btn.getAttribute("data-idle-html")) btn.setAttribute("data-idle-html", btn.innerHTML);
      const idle = btn.getAttribute("data-idle-html");
      const mark = (text) => {
        const strong = btn.querySelector("strong");
        if (strong) strong.textContent = text;
        else btn.textContent = text;
      };
      try {
        await copyText(value);
        mark("Copied");
      } catch {
        mark("Copy failed");
      }
      setTimeout(() => {
        btn.innerHTML = idle;
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
  const fy = $("dash-fy");
  if (fy) {
    const d = new Date();
    const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    fy.textContent = `FY ${y}–${String(y + 1).slice(-2)}`;
  }
}

function applyColorScheme(next) {
  const scheme = next || localStorage.getItem("pos_color_scheme") || "light";
  document.documentElement.dataset.scheme = scheme === "dark" ? "dark" : "light";
  localStorage.setItem("pos_color_scheme", document.documentElement.dataset.scheme);
}

function paintDashChrome(d) {
  const sel = $("dash-branch");
  if (sel) {
    const rows = Array.isArray(d?.branches) ? d.branches : [];
    const cur = sel.value;
    sel.innerHTML = `<option value="">All branches</option>${rows
      .map((b) => `<option value="${escapeHtml(b.id || b.name)}">${escapeHtml(b.name || "Branch")}</option>`)
      .join("")}`;
    if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
    sel.hidden = rows.length < 1;
  }
}

applyColorScheme();

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
  state.brands = data.brands || [];
  applyUnitMaster(data.units || []);
  state.customers = data.customers;
  state.packs = data.packs;
  state.combos = data.combos || [];
  state.offers = data.offers || [];
  state.offerSettings = data.offerSettings || { stacking: "product_and_bill" };
  paintPlatformNotices(data.notes);
  paintHeader();
  applyQuickAddVisibility();
  applyFastMode();
  paintPlatformSupport();
  renderCustomersSelect();
  applyUiLocale();
  fillExpenseCategories();
  paintDeskState(state.currentView || "dashboard");
  if ($("dash-welcome") && state.session) {
    paintDashWelcome();
  }
  void loadToday();
  if (fastModeOn()) {
    const later = () => void loadCustomerLoyalty();
    if (typeof requestIdleCallback === "function") requestIdleCallback(later, { timeout: 8000 });
    else setTimeout(later, 2500);
  } else {
    void loadCustomerLoyalty();
  }
  if (state.currentView === "counter") maybeShowCounterLowStockAlert();
}
globalThis.loadBootstrap = loadBootstrap;

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
  el.textContent = "Dashboard";
  const meta = $("dash-welcome-meta");
  if (meta) {
    const name = String(state.session.name || "").trim();
    const sub = subscriptionValidity(dashSub);
    const bits = [name ? `Hello, ${name}` : "", dashRoleLabel(state.session.role), state.company?.name].filter(Boolean);
    if (sub.ymd) bits.push(`Valid till ${sub.until}`, sub.daysLabel);
    meta.textContent = bits.join(" · ");
  }
}

async function loadDashboard() {
  try {
    const d = await api("/api/dashboard");
    paintDashWelcome(d.subscription);
    paintPlatformNotices(d.notes);
    paintDashChrome(d);
    const sub = subscriptionValidity(d.subscription);
    if (globalThis.POSBizHubUi?.paintDashboard) {
      globalThis.POSBizHubUi.paintDashboard(d);
    } else {
      $("dash-kpis").innerHTML = "";
    }
    const extra = [
      ["Plan", state.plan?.name || state.plan?.code || "—", "settings", ""],
      ["Valid till", sub.until, "settings", sub.tone],
      ["Days left", sub.daysLabel, "settings", sub.tone],
      ["Subscription fee / year", money(state.plan?.fee_monthly), "settings", ""],
    ]
      .map(
        ([k, v, view, tone]) =>
          `<button type="button" class="report-card dash-kpi dash-kpi-plan ${escapeHtml(String(tone || ""))}" data-dash-view="${view}"><span>${escapeHtml(String(k))}</span><strong>${escapeHtml(String(v ?? "—"))}</strong></button>`,
      )
      .join("");
    if ($("dash-plan-kpis") && extra) $("dash-plan-kpis").innerHTML = extra;
    if ($("dash-kpis") && extra && !$("dash-plan-kpis")) $("dash-kpis").insertAdjacentHTML("beforeend", extra);
    if (!fastModeOn()) {
      if (isServicesShop()) globalThis.POSSalonUi?.loadSalonBoard?.();
      if (isPrintShop()) globalThis.POSPrintUi?.loadPrintBoard?.();
    }
    markViewFresh("dashboard");
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
  const variant = isApparelShop() ? itemVariantText(item) : "";
  el.innerHTML = `<strong>${escapeHtml(item.name)}</strong>
    <span>${escapeHtml([item.code || "", variant].filter(Boolean).join(" · "))}</span>
    <span>On hand ${escapeHtml(fmtQty(item.stock_gm, item))}</span>
    ${pill}`;
}

function selectStockItem(id, barcode) {
  const rows = state.stockRows || [];
  const item = rows.find((r) => r.id === id) || state.items.find((i) => i.id === id);
  if (!item) return;
  state.stockBarcode = barcode || "";
  if ($("stk-item")) $("stk-item").value = item.id;
  if ($("stk-item-search")) $("stk-item-search").value = item.name;
  paintStockSelected(item);
  document.querySelectorAll("#stock-table [data-stock-item]").forEach((el) => {
    const on = el.dataset.stockItem === id;
    el.classList.toggle("is-editing", on);
    if (!on) return;
    const style = el.closest(".garment-stock-style");
    const body = style?.querySelector(".garment-stock-colours");
    const toggle = style?.querySelector("[data-stock-toggle]");
    if (body) body.hidden = false;
    if (toggle) {
      toggle.setAttribute("aria-expanded", "true");
      if (!(state.stockOpenStyles instanceof Set)) state.stockOpenStyles = new Set();
      if (toggle.dataset.stockToggle) state.stockOpenStyles.add(toggle.dataset.stockToggle);
    }
  });
  void paintStockHistory(id);
  $("stk-qty")?.focus();
}

function formatStockWhen(raw) {
  return String(raw || "").replace("T", " ").slice(0, 16);
}

async function paintStockHistory(itemId) {
  const box = $("stock-history");
  if (!box) return;
  if (!isApparelShop() || !itemId) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = `<p class="hint">Loading adjustment history…</p>`;
  try {
    const rows = await api(`/api/stock/movements?item_id=${encodeURIComponent(itemId)}`);
    const list = Array.isArray(rows) ? rows.slice(0, 8) : [];
    if (!list.length) {
      box.innerHTML = `<p class="hint">No adjustments yet for this variant.</p>`;
      return;
    }
    box.innerHTML = `<h4>Adjustment history</h4><ul>${list.map((row) => {
      const qty = Number(row.quantity_gm) || 0;
      const who = String(row.staff_name || "").trim() || "Staff";
      const why = [row.reason, row.note].filter(Boolean).join(" · ");
      const variant = [row.item_color, row.item_size].filter(Boolean).join(" · ");
      return `<li><strong>${qty > 0 ? "+" : ""}${escapeHtml(String(qty))} · ${escapeHtml(row.kind || "adjustment")}</strong><span>${escapeHtml(formatStockWhen(row.created_at))} · ${escapeHtml(who)}${variant ? ` · ${escapeHtml(variant)}` : ""}</span>${why ? `<em>${escapeHtml(why)}</em>` : ""}</li>`;
    }).join("")}</ul>`;
  } catch (err) {
    box.innerHTML = `<p class="hint error">${escapeHtml(err.message)}</p>`;
  }
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
  const batchCount = isPharmacyShop()
    ? (Array.isArray(state.stockBatches) ? state.stockBatches : []).filter((b) => (Number(b.remaining_gm) || 0) > 0).length
    : 0;
  let expired = 0;
  if (isPharmacyShop()) {
    for (const b of Array.isArray(state.stockBatches) ? state.stockBatches : []) {
      if ((Number(b.remaining_gm) || 0) <= 0) continue;
      const days = expiryDaysLeft({ expiry_date: stockExpiryYmd(b, list.find((r) => r.id === b.item_id)) });
      if (Number.isFinite(days) && days < 0) expired += 1;
    }
  }
  const skuLabel = isPharmacyShop() ? "Medicines" : isApparelShop() ? "Variants" : "SKUs";
  stats.innerHTML = `<div class="items-stat"><span>${skuLabel}</span><strong>${list.length}</strong></div>
    ${isPharmacyShop() ? `<div class="items-stat"><span>Batches</span><strong>${batchCount}</strong></div>` : ""}
    ${isPharmacyShop() ? `<div class="items-stat${expired ? " is-warn" : ""}"><span>Expired</span><strong>${expired}</strong></div>` : ""}
    <div class="items-stat"><span>On-hand value</span><strong>${money(value)}</strong></div>
    <button class="items-stat${low ? " is-warn" : ""}${state.stockLowOnly ? " is-active" : ""}" type="button" data-stock-low>
      <span>Low / out</span><strong>${low}</strong>
    </button>`;
}

function stockListFilters() {
  const status = String($("stock-filter-status")?.value || "");
  const lowOnly = Boolean(state.stockLowOnly || $("stock-low-only")?.checked);
  return {
    q: String($("stock-search")?.value || "").trim().toLowerCase(),
    category: String($("stock-filter-category")?.value || ""),
    color: String($("stock-filter-color")?.value || "").toLowerCase(),
    size: String($("stock-filter-size")?.value || "").toUpperCase(),
    supplier: String($("stock-filter-supplier")?.value || "").toLowerCase(),
    status: lowOnly && !status ? "low" : status,
  };
}

function stockStatusMatches(have, want) {
  if (!want) return true;
  if (want === "low") return have === "low" || have === "out";
  if (want === "out") return have === "out";
  return have === want;
}

function filterStockList() {
  const f = stockListFilters();
  let shown = 0;
  document.querySelectorAll("#stock-table .garment-stock-style, #stock-table .garment-barcode-row, #stock-table .stock-card, #stock-table .stock-batch-row, #stock-table .garment-stock-card").forEach((card) => {
    const hay = card.dataset.stockSearch || "";
    const colors = String(card.dataset.stockColors || "").toLowerCase().split("|").filter(Boolean);
    const sizes = String(card.dataset.stockSizes || "").toUpperCase().split("|").filter(Boolean);
    const suppliers = String(card.dataset.stockSupplier || "").toLowerCase();
    const hide = (Boolean(f.q) && !hay.includes(f.q))
      || (f.category && (card.dataset.stockCategory || "") !== f.category)
      || (f.color && !colors.includes(f.color) && String(card.dataset.stockColor || "").toLowerCase() !== f.color)
      || (f.size && !sizes.includes(f.size) && String(card.dataset.stockSize || "").toUpperCase() !== f.size)
      || (f.supplier && !suppliers.includes(f.supplier))
      || !stockStatusMatches(card.dataset.stockStatus || (card.dataset.stockLow === "1" ? "low" : "ok"), f.status);
    card.hidden = hide;
    if (!hide) shown += 1;
    if (!hide && card.classList.contains("garment-stock-style")) {
      card.querySelectorAll("[data-stock-color-block]").forEach((block) => {
        const color = String(block.dataset.stockColorBlock || "").toLowerCase();
        const sizeHit = !f.size || [...block.querySelectorAll("[data-stock-size]")].some((row) => String(row.dataset.stockSize || "").toUpperCase() === f.size);
        block.hidden = (f.color && color !== f.color) || !sizeHit;
      });
      card.querySelectorAll("[data-stock-size]").forEach((row) => {
        row.hidden = Boolean(f.size) && String(row.dataset.stockSize || "").toUpperCase() !== f.size;
      });
    }
  });
  const empty = $("stock-filter-empty");
  if (empty) empty.hidden = shown > 0 || !document.querySelector("#stock-table .stock-card, #stock-table .stock-batch-row, #stock-table .garment-stock-style, #stock-table .garment-barcode-row, #stock-table .garment-stock-card");
}

function stockExpiryYmd(batch, sku) {
  const raw = batch?.expiry_date || sku?.primary_expiry || sku?.default_expiry || sku?.item_default_expiry || batch?.item_default_expiry || "";
  const s = String(raw || "").trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return "";
}

function paintStockExpiryCell(ymdStr) {
  if (!ymdStr) {
    return `<span class="stock-exp is-none"><strong>—</strong><small>No expiry date</small></span>`;
  }
  const days = expiryDaysLeft({ expiry_date: ymdStr });
  const tone = Number.isFinite(days) ? expiryTone(days) : "ok";
  const long = formatShopDate(ymdStr) || ymdStr;
  const short = formatExpiryShort(ymdStr);
  const label = Number.isFinite(days) ? expiryDaysLabel(days) : "";
  return `<span class="stock-exp is-${tone}">
    <strong>${escapeHtml(long)}</strong>
    <small>${escapeHtml([short, label].filter(Boolean).join(" · "))}</small>
  </span>`;
}

function pharmacyStockCards(skuRows, batchRows) {
  const skus = Array.isArray(skuRows) ? skuRows : [];
  const byId = new Map(skus.map((r) => [r.id, r]));
  const batches = (Array.isArray(batchRows) ? batchRows : [])
    .filter((b) => (Number(b.remaining_gm) || 0) > 0)
    .slice()
    .sort((a, b) => {
      const na = String(a.item_name || byId.get(a.item_id)?.name || "").toLowerCase();
      const nb = String(b.item_name || byId.get(b.item_id)?.name || "").toLowerCase();
      if (na !== nb) return na.localeCompare(nb);
      const ea = String(a.expiry_date || "9999-99-99");
      const eb = String(b.expiry_date || "9999-99-99");
      if (ea !== eb) return ea.localeCompare(eb);
      return String(a.batch_no || "").localeCompare(String(b.batch_no || ""));
    });
  const covered = new Set();
  const out = [];
  for (const batch of batches) {
    covered.add(batch.item_id);
    const sku = byId.get(batch.item_id) || {
      id: batch.item_id,
      name: batch.item_name,
      code: batch.item_code,
      stock_gm: batch.stock_gm,
      purchase_rate: batch.purchase_rate,
      reorder_level_gm: batch.reorder_level_gm,
      barcode: batch.item_barcode,
      base_unit: batch.base_unit,
      unit: batch.unit,
    };
    out.push({ sku, batch });
  }
  for (const sku of skus) {
    if (covered.has(sku.id)) continue;
    out.push({ sku, batch: null });
  }
  return out;
}

function garmentStockSource(rows) {
  const byId = new Map((state.items || []).map((item) => [item.id, item]));
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const item = byId.get(row.id) || {};
    const status = String(row.status || item.status || "active").toLowerCase();
    return {
      ...item,
      ...row,
      color: row.color || item.color || "",
      size: row.size || item.size || "",
      wearer_type: row.wearer_type || item.wearer_type || "",
      category: row.category || item.category || "",
      subcategory: row.subcategory || item.subcategory || "",
      barcode: row.barcode || item.barcode || "",
      code: row.code || item.code || "",
      name: row.name || item.name || "",
      barcodes: row.barcodes || item.barcodes || [],
      supplier_name: row.supplier_name || item.supplier_name || "",
      status,
    };
  }).filter((row) => row.status !== "inactive" || Number(row.stock_gm) > 0);
}

function fillGarmentStockFilters(board) {
  const fill = (id, values, label) => {
    const el = $(id);
    if (!el) return;
    const current = el.value;
    const options = [`<option value="">${label}</option>`].concat(
      values.map((value) => `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(value)}</option>`),
    );
    el.innerHTML = options.join("");
  };
  const categories = [];
  const colors = [];
  const sizes = [];
  const suppliers = [];
  for (const style of board?.styles || []) {
    if (style.category && !categories.includes(style.category)) categories.push(style.category);
    for (const color of style.colors || []) {
      if (color.color && !colors.includes(color.color)) colors.push(color.color);
      for (const size of color.sizes || []) {
        if (size.size && size.size !== "—" && !sizes.includes(size.size)) sizes.push(size.size);
        if (size.supplier && !suppliers.includes(size.supplier)) suppliers.push(size.supplier);
      }
    }
  }
  fill("stock-filter-category", categories, "All categories");
  fill("stock-filter-color", colors, "All colours");
  fill("stock-filter-size", sizes, "All sizes");
  fill("stock-filter-supplier", suppliers, "All suppliers");
}

function garmentStockPill(status) {
  if (status === "out") return `<span class="stock-pill is-out">Out</span>`;
  if (status === "low") return `<span class="stock-pill is-low">Low</span>`;
  return `<span class="stock-pill is-ok">OK</span>`;
}

function paintGarmentStockList(el, all, selected) {
  const G = globalThis.POSGarmentPurchase;
  const source = garmentStockSource(all);
  const board = G?.stockBoard?.(source) || { styles: [], barcodeRows: [] };
  fillGarmentStockFilters(board);
  const searchBox = $("stock-search");
  if (searchBox && !searchBox.dataset.garmentPh) {
    searchBox.placeholder = "Search item, barcode, SKU, colour, size";
    searchBox.dataset.garmentPh = "1";
  }
  const view = state.stockView === "barcode" ? "barcode" : "item";
  document.querySelectorAll("#stock-garment-view [data-stock-view]").forEach((btn) => {
    btn.classList.toggle("primary", btn.dataset.stockView === view);
  });
  if (view === "barcode") {
    const rows = board.barcodeRows.slice(0, fastModeOn() ? 120 : STOCK_PAGE_LIMIT);
    if (!rows.length) {
      el.innerHTML = `<div class="item-empty-card"><strong>No barcodes</strong><p>Purchase or assign a barcode. Each piece or variant code is listed here.</p></div>`;
      return;
    }
    el.innerHTML = `${listRenderHint(rows.length, board.barcodeRows.length)}<div class="garment-bc-list">${rows.map((row) => {
      const search = [row.barcode, row.name, row.color, row.size, row.code, row.category, row.supplier, row.wearer].join(" ").toLowerCase();
      const tone = row.status === "out" ? " is-out" : row.status === "low" ? " is-low" : "";
      const variant = [row.color, row.size, row.code].filter(Boolean).join(" · ");
      return `<article class="garment-bc-card garment-barcode-row${tone}${selected === row.itemId ? " is-editing" : ""}" data-stock-item="${escapeHtml(row.itemId)}" data-stock-barcode="${escapeHtml(row.barcode)}" data-stock-search="${escapeHtml(search)}" data-stock-status="${escapeHtml(row.status)}" data-stock-low="${row.status === "ok" ? "0" : "1"}" data-stock-category="${escapeHtml(row.category || "")}" data-stock-color="${escapeHtml(row.color || "")}" data-stock-size="${escapeHtml(row.size || "")}" data-stock-supplier="${escapeHtml(row.supplier || "")}">
        <strong class="garment-bc-code">${escapeHtml(row.barcode || "No barcode")}</strong>
        <span class="garment-bc-meta"><strong>${escapeHtml(row.name)}</strong><small>${garmentSwatchHtml(row.color)}${escapeHtml(variant || "—")}</small></span>
        <span class="garment-bc-qty"><em>${escapeHtml(String(row.onHand))}</em>${garmentStockPill(row.status)}</span>
      </article>`;
    }).join("")}</div>
    <div class="item-empty-card" id="stock-filter-empty" hidden><strong>No matching barcodes</strong><p>Clear search or filters to see the rest.</p></div>`;
    filterStockList();
    return;
  }
  const styles = board.styles.slice(0, fastModeOn() ? 60 : STOCK_PAGE_LIMIT);
  if (!styles.length) {
    el.innerHTML = `<div class="item-empty-card"><strong>No stock rows</strong><p>Add garments first. Colour and size on-hand quantity shows here.</p></div>`;
    return;
  }
  const open = state.stockOpenStyles instanceof Set ? state.stockOpenStyles : new Set();
  state.stockOpenStyles = open;
  el.innerHTML = `${listRenderHint(styles.length, board.styles.length)}${styles.map((style) => {
    const wear = globalThis.POSFootwear?.wearerLabel?.(style.wearer_type) || style.wearer_type || "";
    const expanded = open.has(style.key) || style.status !== "ok";
    if (expanded) open.add(style.key);
    const colors = (style.colors || []).map((color) => {
      const chips = (color.sizes || []).map((size) => {
        const on = selected === size.item?.id;
        const tone = size.status === "out" ? " is-out" : size.status === "low" ? " is-low" : "";
        return `<button type="button" class="garment-size-chip${tone}${on ? " is-editing" : ""}" data-stock-item="${escapeHtml(size.item?.id || "")}" data-stock-size="${escapeHtml(size.size)}">
          <strong>${escapeHtml(size.size)}</strong>
          <em>${escapeHtml(fmtQty(size.stock, size.item))}</em>
        </button>`;
      }).join("");
      const details = (color.sizes || []).map((size) => {
        const on = selected === size.item?.id;
        const codes = (size.barcodes || []).map((code) => `<li class="garment-barcode-line" data-stock-item="${escapeHtml(size.item?.id || "")}" data-stock-barcode="${escapeHtml(code.barcode)}"><span>${escapeHtml(code.barcode || "No barcode")}</span><em>${code.piece ? (code.onHand > 0 ? "On hand 1" : "Sold") : `On hand ${escapeHtml(String(size.stock))}`}</em></li>`).join("");
        return `<div class="garment-stock-detail${on ? " is-editing" : ""}" data-stock-item="${escapeHtml(size.item?.id || "")}" data-stock-size="${escapeHtml(size.size)}">
          <div class="garment-stock-detail-top">
            <span><strong>${escapeHtml(size.code || "No SKU")}</strong>${size.supplier ? ` · ${escapeHtml(size.supplier)}` : ""}</span>
            <label>Reorder <input type="number" min="0" step="1" value="${escapeHtml(String(size.reorder || 0))}" data-stock-reorder="${escapeHtml(size.item?.id || "")}" aria-label="Reorder ${escapeHtml(style.name)} ${escapeHtml(color.color)} ${escapeHtml(size.size)}" /></label>
          </div>
          <ul class="garment-stock-barcodes">${codes || `<li class="garment-barcode-line"><span>No barcode on this size</span></li>`}</ul>
        </div>`;
      }).join("");
      return `<section class="garment-stock-color" data-stock-color-block="${escapeHtml(color.color)}">
        <header>${garmentSwatchHtml(color.color, color.sizes?.[0]?.item?.color_image)}<strong>${escapeHtml(color.color || "No colour")}</strong><em>${escapeHtml(fmtQty(color.stock, color.sizes?.[0]?.item))}</em>${garmentStockPill(color.status)}</header>
        <div class="garment-stock-sizes">${chips}</div>
        ${details}
      </section>`;
    }).join("");
    const search = [
      style.name, style.category, style.wearer_type, ...(style.suppliers || []),
      ...(style.colors || []).flatMap((color) => [color.color, ...(color.sizes || []).flatMap((size) => [size.size, size.code, size.supplier, ...(size.barcodes || []).map((code) => code.barcode)])]),
    ].join(" ").toLowerCase();
    return `<article class="garment-stock-style${style.status === "out" ? " is-out" : style.status === "low" ? " is-low" : ""}" data-stock-style="${escapeHtml(style.key)}" data-stock-search="${escapeHtml(search)}" data-stock-status="${escapeHtml(style.status)}" data-stock-low="${style.status === "ok" ? "0" : "1"}" data-stock-category="${escapeHtml(style.category || "")}" data-stock-colors="${escapeHtml((style.colors || []).map((color) => color.color).join("|"))}" data-stock-sizes="${escapeHtml((style.colors || []).flatMap((color) => color.sizes.map((size) => size.size)).join("|"))}" data-stock-supplier="${escapeHtml((style.suppliers || []).join("|"))}">
      <button type="button" class="garment-stock-style-head" data-stock-toggle="${escapeHtml(style.key)}" aria-expanded="${expanded ? "true" : "false"}">
        <span><strong>${escapeHtml(style.name)}</strong><small>${escapeHtml([wear, `${(style.colors || []).length} colour${(style.colors || []).length === 1 ? "" : "s"}`, `On hand ${fmtQty(style.totalStock, style.anchor)}`].filter(Boolean).join(" · "))}</small></span>
        ${garmentStockPill(style.status)}
        <em>${money(style.value)}</em>
        <i class="garment-stock-caret" aria-hidden="true"></i>
      </button>
      <div class="garment-stock-colours"${expanded ? "" : " hidden"}>${colors}</div>
    </article>`;
  }).join("")}
  <div class="item-empty-card" id="stock-filter-empty" hidden><strong>No matching garments</strong><p>Clear search or filters to see the rest of the catalog.</p></div>`;
  filterStockList();
}

function paintStockList(rows) {
  const el = $("stock-table");
  if (!el) return;
  const selected = $("stk-item")?.value || "";
  const all = Array.isArray(rows) ? rows : [];
  if (!all.length) {
    el.innerHTML = `<div class="item-empty-card">
      <strong>No stock rows</strong>
      <p>Add items first. Their on-hand quantity shows here.</p>
    </div>`;
    return;
  }
  if (isPharmacyShop()) {
    const allCards = pharmacyStockCards(all, state.stockBatches);
    const cards = allCards.slice(0, fastModeOn() ? 80 : STOCK_PAGE_LIMIT);
    el.innerHTML = `${listRenderHint(cards.length, allCards.length)}<table class="stock-batch-table"><thead><tr>
      <th>Medicine</th><th>Batch No.</th><th>Expiry Date</th>
      <th class="pharm-n">On hand</th><th class="pharm-n">Value</th><th>Status</th>
    </tr></thead><tbody>${cards
      .map(({ sku, batch }) => {
        const item = state.items.find((i) => i.id === sku.id) || sku;
        const low = stockIsLow(sku);
        const out = stockIsOut(sku);
        const qtySrc = batch ? batch.remaining_gm : sku.stock_gm;
        const rate = Number(batch?.unit_cost ?? sku.purchase_rate) || 0;
        const value = POSUnits.lineAmount(qtySrc, rate, itemUnit(item));
        const batchNo = batch ? batch.batch_no || batch.barcode || "—" : sku.batch_no || "—";
        const expYmd = stockExpiryYmd(batch, { ...item, ...sku, item_default_expiry: batch?.item_default_expiry });
        const days = expYmd ? expiryDaysLeft({ expiry_date: expYmd }) : null;
        const expTone = Number.isFinite(days) ? expiryTone(days) : "";
        const search = `${itemSearchHay(item)} ${batchNo} ${expYmd} ${batch?.barcode || ""} ${formatShopDate(expYmd)}`.toLowerCase();
        const pill = out
          ? `<span class="stock-pill is-out">Out</span>`
          : low
            ? `<span class="stock-pill is-low">Low</span>`
            : `<span class="stock-pill is-ok">OK</span>`;
        return `<tr class="stock-batch-row${selected === sku.id ? " is-editing" : ""}${out ? " is-out" : low ? " is-low" : ""}${expTone ? ` is-exp-${expTone}` : ""}" data-stock-item="${escapeHtml(sku.id)}" data-stock-batch="${escapeHtml(batch?.id || "")}" data-stock-search="${escapeHtml(search)}" data-stock-low="${low ? "1" : "0"}">
          <td class="pharm-med">${escapeHtml(sku.name || item.name || "Medicine")}<small>${escapeHtml(sku.code || item.code || "")}${item.barcode ? ` · ${escapeHtml(item.barcode)}` : ""}</small></td>
          <td class="stock-batch-no">${escapeHtml(batchNo)}</td>
          <td class="stock-exp-cell">${paintStockExpiryCell(expYmd)}</td>
          <td class="pharm-n"><span class="item-chip ${low ? "stock low" : "stock ok"}">${escapeHtml(fmtQty(qtySrc, item))}</span></td>
          <td class="pharm-n">${money(value)}</td>
          <td>${pill}</td>
        </tr>`;
      })
      .join("")}</tbody></table>
      <div class="item-empty-card" id="stock-filter-empty" hidden>
        <strong>No matching batches</strong>
        <p>Clear search or turn off Low stock to see the rest of the catalog.</p>
      </div>`;
    filterStockList();
    return;
  }
  if (isApparelShop()) {
    paintGarmentStockList(el, all, selected);
    return;
  }
  const list = all.slice(0, fastModeOn() ? 80 : STOCK_PAGE_LIMIT);
  el.innerHTML = `${listRenderHint(list.length, all.length)}${list
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
    state.stockBatches = [];
    if (isPharmacyShop()) {
      try {
        const batches = await api("/api/batches?on_hand=1");
        state.stockBatches = Array.isArray(batches) ? batches : [];
      } catch (batchErr) {
        setStockHint(batchErr.message, "error");
      }
    }
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
  const list = Array.isArray(rows) ? rows : [];
  $("device-table").innerHTML = `<table><thead><tr><th>Name</th><th>Code</th><th>Branch</th><th>Status</th><th></th></tr></thead><tbody>${
    list.length
      ? list
          .map((d) => {
            const on = String(d.status || "") === "active";
            const code = String(d.code || "").trim();
            const status = on ? "Connected" : code ? "Disabled" : "Not Configured";
            return `<tr>
              <td>${escapeHtml(d.name)}</td>
              <td>${escapeHtml(d.code || "")}</td>
              <td>${escapeHtml(d.branch_name || "")}</td>
              <td>${status}</td>
              <td><button class="btn" type="button" data-device-toggle="${escapeHtml(d.id)}" data-next-status="${on ? "inactive" : "active"}">${on ? "Disable" : "Activate"}</button></td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="5">No registers yet. Add one above — it stays disabled until you activate it.</td></tr>`
  }</tbody></table>`;
  paintScaleSetup();
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
    globalThis.__mLastReports = data;
    $("reports").innerHTML = [
      dailySalesBlock(data),
      reportBlock("GST summary (India)", "GST summary", ["Type", "CGST", "SGST", "IGST", "Total GST"], gstSummaryRows(s), "gst"),
      reportBlock("Sales bills", "Sales bills", ["Order", "Customer", "Type", "Pack", "Pack count", "Status", "Qty g", "Taxable", "GST", "Total", "Pay", "Pay status", "Date"], (data.sales || []).map((o) => [o.order_number, o.customer_name, o.customer_type, o.pack_name || "Loose items", Number(o.pack_count) || 0, orderStatusLabel(o.status), Number(o.total_quantity_gm) || 0, Number(o.subtotal) || 0, Number(o.gst) || 0, Number(o.total) || 0, o.payment_method, o.payment_status, formatShopDateTime(o.created_at)]), "sales"),
      reportBlock("Item sales", "Item sales", isApparelShop() ? ["Item", "Colour", "Size", "Qty g", "Amount", "GST"] : ["Item", "Qty g", "Amount", "GST"], (data.byItem || []).map((r) => (
        isApparelShop()
          ? [r.item_name, r.color || "—", r.size || "—", Number(r.quantity_gm) || 0, Number(r.amount) || 0, Number(r.gst) || 0]
          : [r.item_name, Number(r.quantity_gm) || 0, Number(r.amount) || 0, Number(r.gst) || 0]
      )), "sales"),
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
      reportBlock("Stock", "Stock", isApparelShop() ? ["Code", "Name", taxCodeLabel(), "Category", "Subcategory", "Colour", "Size", "Stock g", "Reorder g", "Retail", "B2B", "Purchase", "GST %"] : ["Code", "Name", taxCodeLabel(), "Category", "Subcategory", "Stock g", "Reorder g", "Retail", "B2B", "Purchase", "GST %"], (data.stock || []).map((i) => (
        isApparelShop()
          ? [i.code, i.name, i.hsn, i.category, i.subcategory, i.color || "—", i.size || "—", Number(i.stock_gm) || 0, Number(i.reorder_level_gm) || 0, Number(i.retail_rate) || 0, Number(i.b2b_rate) || 0, Number(i.purchase_rate) || 0, Number(i.gst_rate) || 0]
          : [i.code, i.name, i.hsn, i.category, i.subcategory, Number(i.stock_gm) || 0, Number(i.reorder_level_gm) || 0, Number(i.retail_rate) || 0, Number(i.b2b_rate) || 0, Number(i.purchase_rate) || 0, Number(i.gst_rate) || 0]
      )), "stock"),
      reportBlock("Low stock", "Low stock", isApparelShop() ? ["Code", "Name", "Colour", "Size", "Stock g", "Reorder g"] : ["Code", "Name", "Stock g", "Reorder g"], (data.low || []).map((i) => (
        isApparelShop()
          ? [i.code, i.name, i.color || "—", i.size || "—", Number(i.stock_gm) || 0, Number(i.reorder_level_gm) || 0]
          : [i.code, i.name, Number(i.stock_gm) || 0, Number(i.reorder_level_gm) || 0]
      )), "stock"),
      reportBlock("Purchases", "Purchases", ["PO", "Supplier", "Invoice", "Date", "Taxable", "GST", "Total", "Pay", "Status"], (data.purchases || []).map((p) => [p.purchase_number, p.supplier_name, p.supplier_invoice_number, p.purchase_date, Number(p.subtotal) || 0, Number(p.gst) || 0, Number(p.total) || 0, p.payment_method, p.payment_status]), "books"),
      ...(isApparelShop() ? [reportBlock("Purchase lines", "Purchase lines", ["PO", "Date", "Supplier", "Item", "Colour", "Size", "Qty g", "Amount"], (data.purchaseLines || []).map((r) => [r.purchase_number, r.purchase_date, r.supplier_name, r.item_name, r.color || "—", r.size || "—", Number(r.quantity_gm) || 0, Number(r.amount) || 0]), "books")] : []),
      reportBlock("Expenses", "Expenses", ["No.", "Date", "Category", "Amount", "GST", "Total", "Pay", "Notes"], (data.expenses || []).map((e) => [e.expense_number, e.expense_date, e.category, Number(e.amount) || 0, Number(e.gst) || 0, Number(e.total) || (Number(e.amount) || 0) + (Number(e.gst) || 0), e.payment_method, e.notes]), "books"),
      reportBlock("Customers", "Customers", ["Code", "Name", "Business", "Mobile", "Email", "Type", "State", "GSTIN", "Credit limit", "Outstanding"], (data.customers || []).map((c) => [c.code, c.name, c.business_name, c.mobile, c.email || "", c.type, c.state, c.gstin, Number(c.credit_limit) || 0, Number(c.outstanding) || 0]), "books"),
      reportBlock("Cancelled sales", "Cancelled sales", ["Order", "Customer", "Total", "Pay", "Date"], (data.sales || []).filter((o) => String(o.status || "").toLowerCase() === "cancelled").map((o) => [o.order_number, o.customer_name, Number(o.total) || 0, o.payment_method, formatShopDateTime(o.created_at)]), "sales"),
    ].join("");
    applyReportsFilter();
    globalThis.POSBizHubUi?.paintReportsCenter?.();
    $("reports-hint").textContent = "";
    $("reports-hint").className = "hint";
    markViewFresh("reports");
  } catch (err) {
    $("reports-hint").textContent = err.message;
    $("reports-hint").className = "hint error";
    globalThis.POSBizHubUi?.paintReportsCenter?.();
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
  const q = String(orderFilter.q || "").trim().toLowerCase();
  return (rows || []).filter((o) => {
    if (orderFilter.status && String(o.status || "").toLowerCase() !== orderFilter.status) return false;
    if (orderFilter.payment && String(o.payment_status || "").toLowerCase() !== orderFilter.payment) return false;
    if (!q) return true;
    const hay = [o.order_number, orderCustomerName(o), o.payment_method, o.customer_mobile].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function invoicesHeroFigures(rows) {
  const list = rows || [];
  let paid = 0;
  let due = 0;
  let billed = 0;
  for (const o of list) {
    billed += Number(o.total) || 0;
    const st = String(o.payment_status || "paid").toLowerCase();
    const creditUnpaid = String(o.payment_method || "").toLowerCase() === "credit" && !(Number(o.amount_paid) > 0);
    if (st === "unpaid" || st === "partial" || creditUnpaid) due += 1;
    else paid += 1;
  }
  return { n: list.length, paid, due, billed };
}

function paintInvoicesHero(rows) {
  const el = $("invoices-hero-stats");
  if (!el) return;
  const fig = invoicesHeroFigures(rows);
  el.innerHTML = `<div class="items-stat"><span>Invoices</span><strong>${fig.n}</strong></div>
    <div class="items-stat"><span>Paid</span><strong>${fig.paid}</strong></div>
    <div class="items-stat${fig.due ? " is-warn" : ""}"><span>Due</span><strong>${fig.due}</strong></div>
    <div class="items-stat"><span>Billed</span><strong>${escapeHtml(money(fig.billed))}</strong></div>`;
}

function paintInvoicePayChips() {
  const cur = String($("orders-pay-filter")?.value || orderFilter.payment || "");
  document.querySelectorAll("#invoices-pay-chips [data-orders-pay]").forEach((btn) => {
    const on = String(btn.dataset.ordersPay || "") === cur;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
}

function invoicesEmptyHtml(kind) {
  if (kind === "none") {
    return `<div class="invoices-empty">
      <p class="invoices-empty-title">No invoices yet</p>
      <p>Save a bill from the Counter and it will show here with its SO number.</p>
      <button class="btn primary" type="button" data-view-jump="counter">New bill</button>
    </div>`;
  }
  if (kind === "filter") {
    return `<div class="invoices-empty">
      <p class="invoices-empty-title">No matching invoices</p>
      <p>Clear search or change the order and payment filters.</p>
    </div>`;
  }
  return `<div class="invoices-empty">
    <p class="invoices-empty-title">Select an invoice</p>
    <p>Choose a bill from the list to preview, print, or edit.</p>
  </div>`;
}

function renderOrdersSummary(filteredCount, totalCount) {
  const el = $("orders-summary");
  paintInvoicesHero(orderCache);
  paintInvoicePayChips();
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
      : `Showing ${filteredCount} of ${totalCount} invoice${totalCount === 1 ? "" : "s"}`;
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
  const cust = (state.customers || []).find((c) => c.id === order.customer_id);
  const enriched = { ...order, customer_email: order.customer_email || cust?.email || "" };
  return S.shareActions(enriched, state.company || {}, location.origin);
}

function invoiceShareButtons(order, { copyId } = {}) {
  const share = orderShare(order);
  if (!share) return "";
  const idAttr = copyId ? ` id="${escapeHtml(copyId)}"` : "";
  const email = share.email ? `<a class="btn" href="${escapeHtml(share.email)}">Email invoice</a>` : "";
  return `${email}<a class="btn" href="${escapeHtml(share.whatsapp)}" target="_blank" rel="noopener">Share WhatsApp</a>
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
      ${Number(order?.amount_paid) > 0 || order?.receipt ? `<button class="btn" type="button" id="modal-print-receipt">Print Receipt</button>` : ""}
      <button class="btn primary" type="button" id="modal-print-close">Close</button>
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
  const rcp = $("modal-print-receipt");
  if (rcp) {
    rcp.onclick = () => {
      const entry = receiptEntryFromInvoice(order);
      if (entry) showVoucherResult(entry);
    };
  }
  const closeBtn = $("modal-print-close");
  if (closeBtn) closeBtn.onclick = () => {
    const modal = $("modal");
    if (modal) modal.hidden = true;
  };
}

function showInvoicePrintModal(order, { title, message } = {}) {
  if (order?.id) lastInvoice = order;
  const note = message || "Bill saved. POS cleared for the next customer.";
  if (title) $("modal-title").textContent = title;
  const paint = (look) => {
    $("modal-body").innerHTML = `<p class="hint ok">${note}</p>
      ${invoiceLookTabs(look)}
      ${invoiceModalPrintActions(look, order)}
      ${invoicePreviewHtml(order, look)}`;
    bindInvoiceModalPrint(order);
    $("modal-body").querySelectorAll("[data-invoice-look]").forEach((btn) => {
      btn.onclick = () => paint(setInvoiceLook(btn.dataset.invoiceLook));
    });
  };
  paint(getInvoiceLook());
  $("modal").hidden = false;
}
globalThis.showInvoicePrintModal = showInvoicePrintModal;

function invoiceLookTabs(look) {
  return `<div class="invoice-look-tabs" role="tablist">
      <button class="btn${look === "pos" ? " primary" : ""}" type="button" data-invoice-look="pos" role="tab" aria-selected="${look === "pos"}">POS slip</button>
      <button class="btn${look === "office" ? " primary" : ""}" type="button" data-invoice-look="office" role="tab" aria-selected="${look === "office"}">Official bill</button>
      <button class="btn${look === "duplicate" ? " primary" : ""}" type="button" data-invoice-look="duplicate" role="tab" aria-selected="${look === "duplicate"}">Duplicate</button>
    </div>`;
}

function withOrderPayments(order) {
  if (!order) return order;
  if (Array.isArray(order.payments) && order.payments.length) return order;
  const cid = String(order.customer_id || "");
  const bundled = [];
  const seen = new Set();
  const take = (row) => {
    if (!row) return;
    const key = String(row.id || row.ledgerId || row.entry_no || row.entryNo || "");
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    bundled.push(row);
  };
  if (cid) {
    for (const o of orderCache || []) {
      if (String(o.customer_id || "") !== cid) continue;
      (o.payments || []).forEach(take);
    }
    (state.ledgerRows || [])
      .filter((r) => String(r.entry_type || "").toLowerCase() === "receipt" && String(r.party_id || "") === cid)
      .forEach(take);
  }
  if (order.receipt) take(order.receipt);
  return bundled.length ? { ...order, payments: bundled } : order;
}

async function attachMissingOrderPayments(orders) {
  const list = orders || [];
  if (fastModeOn()) return list;
  const missing = list.filter((o) => o.customer_id && !(Array.isArray(o.payments) && o.payments.length));
  if (!missing.length) return list;
  try {
    const to = shopDateInputValue();
    const rows = await api(`/api/accounts/ledger?from=2015-01-01&to=${encodeURIComponent(to)}`);
    const receipts = (Array.isArray(rows) ? rows : []).filter(
      (r) => String(r.entry_type || "").toLowerCase() === "receipt",
    );
    const by = new Map();
    for (const r of receipts) {
      const id = String(r.party_id || "");
      if (!id) continue;
      if (!by.has(id)) by.set(id, []);
      by.get(id).push(r);
    }
    for (const o of list) {
      if (Array.isArray(o.payments) && o.payments.length) continue;
      const found = by.get(String(o.customer_id || ""));
      if (found?.length) o.payments = found;
    }
  } catch {
    /* ledger optional */
  }
  return list;
}

function invoicePreviewHtml(o, look) {
  try {
    const order = withOrderPayments(o);
    if (look === "office" || look === "duplicate") {
      return `<div class="office-preview">${InvoicePrint.officeInvoiceBody(order, invoiceCtx(), { copy: look === "duplicate" ? "duplicate" : "original" })}</div>`;
    }
    return `<div class="thermal-preview">${InvoicePrint.invoiceBody(order, invoiceCtx())}</div>`;
  } catch (err) {
    return `<p class="hint error">Invoice preview failed: ${escapeHtml(err.message || err)}</p>`;
  }
}

function printOrder(o, look) {
  const order = withOrderPayments(o);
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
      ? InvoicePrint.officeInvoiceDocument(order, invoiceCtx(), { copy })
      : InvoicePrint.thermalInvoiceDocument(order, invoiceCtx()),
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

function downloadVoucher(entry) {
  const html = InvoicePrint.voucherDocument(entry, invoiceCtx());
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${entry.entry_no || "payment-receipt"}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

function whatsappVoucher(entry) {
  const Share = globalThis.POSInvoiceShare;
  const text = [
    state.company?.name || "Shop",
    `Payment Receipt ${entry.entry_no || ""}`.trim(),
    entry.invoice_no ? `Against Invoice: ${entry.invoice_no}` : "",
    entry.previous_due != null ? `Previous Due: ${money(entry.previous_due)}` : "",
    entry.invoice_amount != null ? `Invoice Amount: ${money(entry.invoice_amount)}` : "",
    `Payment Received: ${money(entry.amount)}`,
    `Payment Mode: ${paymentMethodLabel(entry.payment_method)}`,
    entry.payment_reference ? `Reference No.: ${entry.payment_reference}` : "",
    `Remaining Due: ${money(entry.remaining_due ?? entry.balance_due ?? 0)}`,
  ]
    .filter(Boolean)
    .join("\n");
  const url = Share?.whatsappShareUrl
    ? Share.whatsappShareUrl(entry.party_mobile, text)
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener");
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
      <button class="btn primary" type="button" id="modal-print-voucher">Print Receipt</button>
      <button class="btn" type="button" id="modal-download-voucher">Download PDF</button>
      <button class="btn" type="button" id="modal-whatsapp-voucher">WhatsApp</button>
      ${canAlter ? `<button class="btn" type="button" id="modal-alter-voucher">Edit Payment</button>` : ""}
      ${canDelete ? `<button class="btn danger" type="button" id="modal-delete-voucher">Delete Payment</button>` : ""}
    </div>`;
  $("modal").hidden = false;
  const btn = $("modal-print-voucher");
  if (btn) btn.onclick = () => printVoucher(entry);
  const dl = $("modal-download-voucher");
  if (dl) dl.onclick = () => downloadVoucher(entry);
  const wa = $("modal-whatsapp-voucher");
  if (wa) wa.onclick = () => whatsappVoucher(entry);
  const alter = $("modal-alter-voucher");
  if (alter) alter.onclick = () => showAlterVoucherModal(entry);
  const del = $("modal-delete-voucher");
  if (del) del.onclick = () => deleteVoucherEntry(entry).catch((err) => setHint(err.message, "error"));
  if (opts.autoPrint && receiptPrinterEnabled()) printVoucher(entry);
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
  return `<button class="btn" type="button" data-voucher-print="${i}">Print Receipt</button>
    <button class="btn" type="button" data-voucher-alter="${i}">Edit Payment</button>
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
    await loadOrders();
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
  const currentDate = shopDateInputValue(entry.payment_date || entry.created_at);
  $("modal-title").textContent = `Alter ${label.toLowerCase()} · ${entry.entry_no}`;
  $("modal-body").innerHTML = `<form class="settings" id="alter-voucher-form">
    <p class="section-note">Correct a wrong amount, method, or payment date. The customer due / supplier payable is updated. Reprint after save.</p>
    <label>Amount <input id="alter-amount" type="number" min="0.01" step="0.01"${max > 0 ? ` max="${max}"` : ""} required value="${Number(entry.amount) || ""}" /></label>
    <label>Method <select id="alter-method">${voucherMethodOptions(entry.payment_method)}</select></label>
    <label>Notes <input id="alter-notes" maxlength="200" value="${escapeHtml(entry.notes || "")}" /></label>
    <label>Reference / UTR <input id="alter-ref" maxlength="80" value="${escapeHtml(entry.payment_reference || "")}" /></label>
    <label>Payment date <input id="alter-date" type="date" required value="${escapeHtml(currentDate)}" /></label>
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
      const paymentDate = shopDateInputValue($("alter-date")?.value || entry.payment_date || entry.created_at);
      const paymentReference = String($("alter-ref")?.value || "").trim();
      const data = await api(path, {
        method: "PUT",
        body: JSON.stringify({
          amount: Number($("alter-amount").value),
          payment_method: method,
          notes,
          payment_reference: paymentReference,
          payment_date: paymentDate,
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
      try {
        await loadOrders();
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
        remaining_due: data.remaining_due ?? data.balance_due,
        balance_due: data.balance_due,
        payment_reference: data.payment_reference || paymentReference,
        payment_date: data.payment_date || paymentDate,
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
          <div class="order-badges">${orderStatusBadge(o.status)} ${payStatusBadge(o)}</div>
          <span class="pay-method-chip">${escapeHtml(paymentMethodLabel(o.payment_method))}</span>
        </div>
      </div>
      ${invoiceSettlementHtml(withOrderPayments(o))}
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
      ${Number(o.amount_paid) > 0 ? `<button class="btn" type="button" data-print-receipt="${escapeHtml(o.id)}">Print Receipt</button>` : ""}
      <button class="btn" type="button" data-edit-order="${escapeHtml(o.id)}"${cancelled ? " disabled title=\"Restore order status before editing items\"" : ""}>Change items</button>
      ${canDeleteInvoice() ? `<button class="btn danger" type="button" data-delete-order="${escapeHtml(o.id)}">Delete invoice</button>` : ""}
    </div>`;
}

function renderOrdersList() {
  const filtered = filterOrders(orderCache);
  renderOrdersSummary(filtered.length, orderCache.length);
  if (!orderCache.length) {
    $("orders").innerHTML = invoicesEmptyHtml("none");
    selectedOrderId = null;
    $("order-pane").innerHTML = invoicesEmptyHtml("pick");
    return;
  }
  if (!filtered.length) {
    $("orders").innerHTML = invoicesEmptyHtml("filter");
    $("order-pane").innerHTML = invoicesEmptyHtml("pick");
    return;
  }
  if (!filtered.some((o) => o.id === selectedOrderId)) selectedOrderId = filtered[0].id;
  $("orders").innerHTML = `<div class="table-wrap invoices-table-wrap"><table class="orders-table">
    <thead>
      <tr>
        <th>Invoice</th>
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
        <td>${payStatusBadge(o)}</td>
        <td>${escapeHtml(paymentMethodLabel(o.payment_method))}</td>
        <td class="num">${money(o.total)}</td>
      </tr>`,
      )
      .join("")}</tbody>
  </table></div>`;
  const current = filtered.find((o) => o.id === selectedOrderId) || filtered[0];
  try {
    showOrder(current);
  } catch (err) {
    $("order-pane").innerHTML = `<p class="hint error">${escapeHtml(err.message || "Could not open invoice")}</p>`;
  }
}

async function loadOrders() {
  try {
    orderCache = sortOrders(await api("/api/orders"));
    await attachMissingOrderPayments(orderCache);
    renderOrdersList();
  } catch (err) {
    orderCache = [];
    $("orders").innerHTML = `<p class="hint error">${escapeHtml(err.message || "Could not load invoices")}</p>`;
    $("order-pane").innerHTML = invoicesEmptyHtml("pick");
  }
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
  if (receiptPrinterEnabled()) printOrder(bill, "pos");
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

let qrReadySeen = null;

function applyQrOrderSnapshot(rows, { announce = false } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const incoming = globalThis.POSQrNotify?.newPending?.(qrSeenOrderIds, list) || [];
  const readyIncoming = qrReadySeen
    ? list.filter((order) => order?.id && order.status === "ready" && !qrReadySeen.has(String(order.id)))
    : [];
  qrOrderCache = list;
  if (qrSeenOrderIds == null) qrSeenOrderIds = new Set(list.map((order) => String(order.id)).filter(Boolean));
  else list.forEach((order) => {
    if (order?.id) qrSeenOrderIds.add(String(order.id));
  });
  if (qrReadySeen == null) qrReadySeen = new Set(list.filter((o) => o.status === "ready").map((o) => String(o.id)));
  else list.filter((o) => o.status === "ready").forEach((o) => qrReadySeen.add(String(o.id)));
  paintQrOrderBadge();
  const page = $("view-qr-orders");
  if (page && !page.hidden) renderQrOrders();
  if ($("table-board") && !$("table-board").hidden) renderTableBoard();
  if (announce && readyIncoming.length) {
    const order = readyIncoming[0];
    const table = restaurantApi()?.displayTable?.(order.table_no) || order.table_no || "Table";
    setHint(`${table} – Order ${order.order_number} Ready`, "ok");
    globalThis.POSQrNotify?.playTone?.({ force: true });
    showQrOrderToast(order, readyIncoming.length - 1);
  }
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
  let qrTick = 0;
  qrPollTimer = setInterval(() => {
    qrTick += 1;
    const hot = state.currentView === "qr-orders" || state.currentView === "online-orders" || state.currentView === "counter";
    if (!hot && qrTick % (fastModeOn() ? 8 : 4) !== 0) return;
    void pollQrOrders({ announce: true });
    if (aggregatorDeskAllowed()) void loadAggregatorOrders({ announce: true });
  }, 2500);
  paintQrSoundArm();
  document.addEventListener("pos-qr-sound", () => {
    paintQrSoundToggle();
    paintQrSoundArm();
  });
}

let aggOrderCache = [];
let aggSourceFilter = "";
let aggStatusFilter = "";
let aggSeenIds = null;

function aggregatorApi() {
  return globalThis.POSAggregator;
}

function aggregatorSettings() {
  const A = aggregatorApi();
  const saved = state.aggregatorSettings || {};
  const biz = state.businessMeta || {};
  const company = state.company || {};
  return {
    zomato_allowed: A?.flagOn?.(saved.zomato_allowed ?? biz.zomato_allowed),
    swiggy_allowed: A?.flagOn?.(saved.swiggy_allowed ?? biz.swiggy_allowed),
    zomato_enabled: A?.flagOn?.(saved.zomato_enabled ?? company.zomato_enabled),
    swiggy_enabled: A?.flagOn?.(saved.swiggy_enabled ?? company.swiggy_enabled),
    zomato_live: A?.isLive?.("zomato", { ...saved, zomato_allowed: saved.zomato_allowed ?? biz.zomato_allowed, zomato_enabled: saved.zomato_enabled ?? company.zomato_enabled }),
    swiggy_live: A?.isLive?.("swiggy", { ...saved, swiggy_allowed: saved.swiggy_allowed ?? biz.swiggy_allowed, swiggy_enabled: saved.swiggy_enabled ?? company.swiggy_enabled }),
  };
}

function aggregatorDeskAllowed() {
  if (!(isRestaurantShop() || isBarShop())) return false;
  const s = aggregatorSettings();
  return Boolean(s.zomato_allowed || s.swiggy_allowed);
}

function aggregatorStatusCopy(source, settings) {
  const A = aggregatorApi();
  const label = A?.sourceLabel?.(source) || source;
  if (!A?.isAuthorized?.(source, settings)) return `${label}: Disabled — Master Admin has not allowed this shop`;
  if (!A?.isLive?.(source, settings)) return `${label}: Disabled — Business Admin has not activated it`;
  return `${label}: Enabled`;
}

async function loadAggregatorSettings() {
  const A = aggregatorApi();
  if (!A || !(isRestaurantShop() || isBarShop()) || !can("settings")) return;
  try {
    const data = await api("/api/aggregator/settings");
    const s = data.settings || {};
    state.aggregatorSettings = s;
    if (state.businessMeta) {
      state.businessMeta.zomato_allowed = s.zomato_allowed ? 1 : 0;
      state.businessMeta.swiggy_allowed = s.swiggy_allowed ? 1 : 0;
    }
    if ($("set-zomato-enabled")) {
      $("set-zomato-enabled").checked = aggregatorApi()?.flagOn?.(s.zomato_enabled) === true;
      $("set-zomato-enabled").disabled = !aggregatorApi()?.flagOn?.(s.zomato_allowed);
    }
    if ($("set-swiggy-enabled")) {
      $("set-swiggy-enabled").checked = aggregatorApi()?.flagOn?.(s.swiggy_enabled) === true;
      $("set-swiggy-enabled").disabled = !aggregatorApi()?.flagOn?.(s.swiggy_allowed);
    }
    if ($("set-agg-auto-accept")) $("set-agg-auto-accept").checked = Boolean(s.aggregator_auto_accept);
    if ($("set-agg-prep")) $("set-agg-prep").value = String(s.aggregator_prep_minutes || 20);
    if ($("set-zomato-rid")) $("set-zomato-rid").value = s.zomato_restaurant_id || "";
    if ($("set-zomato-key")) $("set-zomato-key").value = s.zomato_api_key || "";
    if ($("set-zomato-secret")) $("set-zomato-secret").value = s.zomato_webhook_secret || "";
    if ($("set-zomato-base")) $("set-zomato-base").value = s.zomato_api_base || "https://api.zomato.com";
    if ($("set-swiggy-oid")) $("set-swiggy-oid").value = s.swiggy_outlet_id || "";
    if ($("set-swiggy-key")) $("set-swiggy-key").value = s.swiggy_api_key || "";
    if ($("set-swiggy-secret")) $("set-swiggy-secret").value = s.swiggy_webhook_secret || "";
    if ($("set-swiggy-base")) $("set-swiggy-base").value = s.swiggy_api_base || "https://partner.swiggy.com";
    const origin = location.origin;
    if ($("set-zomato-hook")) $("set-zomato-hook").textContent = origin + (data.webhooks?.zomato || A.webhookPath("zomato", shopBusinessId()));
    if ($("set-swiggy-hook")) $("set-swiggy-hook").textContent = origin + (data.webhooks?.swiggy || A.webhookPath("swiggy", shopBusinessId()));
    if ($("agg-zomato-status")) $("agg-zomato-status").textContent = aggregatorStatusCopy("zomato", s);
    if ($("agg-swiggy-status")) $("agg-swiggy-status").textContent = aggregatorStatusCopy("swiggy", s);
    paintAggregatorSetupCard();
    applyNav();
  } catch {
    /* optional on older servers */
  }
}

async function saveAggregatorSettings() {
  if (!$("set-zomato-enabled")) return;
  const hint = $("agg-settings-hint");
  const prev = state.aggregatorSettings || {};
  const zOn = $("set-zomato-enabled").checked;
  const sOn = Boolean($("set-swiggy-enabled")?.checked);
  if ((prev.zomato_live && !zOn) || (prev.swiggy_live && !sOn) || (prev.zomato_enabled && !zOn) || (prev.swiggy_enabled && !sOn)) {
    if (!window.confirm("Disable this integration? New platform orders will stop. In-progress tickets stay. Keys and history are kept.")) return;
  }
  const data = await api("/api/aggregator/settings", {
    method: "PUT",
    body: JSON.stringify({
      zomato_enabled: $("set-zomato-enabled").checked ? 1 : 0,
      swiggy_enabled: $("set-swiggy-enabled")?.checked ? 1 : 0,
      aggregator_auto_accept: $("set-agg-auto-accept")?.checked ? 1 : 0,
      aggregator_prep_minutes: Number($("set-agg-prep")?.value) || 20,
      zomato_restaurant_id: $("set-zomato-rid")?.value || "",
      zomato_api_key: $("set-zomato-key")?.value || "",
      zomato_webhook_secret: $("set-zomato-secret")?.value || "",
      zomato_api_base: $("set-zomato-base")?.value || "",
      swiggy_outlet_id: $("set-swiggy-oid")?.value || "",
      swiggy_api_key: $("set-swiggy-key")?.value || "",
      swiggy_webhook_secret: $("set-swiggy-secret")?.value || "",
      swiggy_api_base: $("set-swiggy-base")?.value || "",
    }),
  });
  state.aggregatorSettings = data.settings || state.aggregatorSettings;
  if (hint) {
    hint.textContent = "Saved. Zomato and Swiggy stay off until you activate them and Master Admin allows them.";
    hint.className = "hint ok";
  }
  await loadAggregatorSettings();
}

function paintAggregatorBadge() {
  const n = (aggOrderCache || []).filter((row) => String(row.status || "") === "pending").length;
  const badge = $("agg-order-badge");
  if (badge) {
    badge.textContent = String(n);
    badge.hidden = n === 0;
  }
}

function paintAggregatorLanes() {
  const A = aggregatorApi();
  const el = $("agg-lane-stats");
  if (!el || !A) return;
  const lanes = A.laneCounts(aggOrderCache);
  el.innerHTML = [
    ["New", lanes.pending],
    ["Kitchen", lanes.kitchen],
    ["Ready", lanes.ready],
    ["Rider", lanes.out],
  ].map(([label, value]) => `<div class="items-stat"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function paintAggregatorSoundToggle() {
  const btn = $("agg-sound-toggle");
  if (!btn) return;
  const on = globalThis.POSQrNotify?.soundOn?.() !== false;
  btn.textContent = on ? "Sound on" : "Sound off";
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.classList.toggle("is-sounding", on);
}

function hideAggregatorToast() {
  const toast = $("agg-order-toast");
  if (toast) toast.hidden = true;
}

function showAggregatorToast(order, extra = 0) {
  const A = aggregatorApi();
  const toast = $("agg-order-toast");
  if (!toast || !order) return;
  if ($("agg-toast-kicker")) $("agg-toast-kicker").textContent = `NEW ${String(A?.sourceLabel(order.source) || "ONLINE").toUpperCase()}`;
  if ($("agg-toast-title")) $("agg-toast-title").textContent = `${A?.sourceLabel(order.source) || "Online"} ${order.order_number || ""}`.trim();
  if ($("agg-toast-copy")) {
    const guest = order.customer_name || "Guest";
    const more = extra > 0 ? ` · +${extra} more` : "";
    $("agg-toast-copy").textContent = `${guest}${order.fulfillment === "pickup" ? " · Pickup" : " · Delivery"}${more}`;
  }
  toast.hidden = false;
}

function paintAggregatorSetupCard() {
  const s = aggregatorSettings();
  const zHook = $("set-zomato-hook")?.textContent || "/api/webhooks/zomato?shop=";
  const sHook = $("set-swiggy-hook")?.textContent || "/api/webhooks/swiggy?shop=";
  if ($("agg-zomato-hook")) $("agg-zomato-hook").textContent = zHook;
  if ($("agg-swiggy-hook")) $("agg-swiggy-hook").textContent = sHook;
  if ($("agg-zomato-state")) $("agg-zomato-state").textContent = aggregatorStatusCopy("zomato", state.aggregatorSettings || s);
  if ($("agg-swiggy-state")) $("agg-swiggy-state").textContent = aggregatorStatusCopy("swiggy", state.aggregatorSettings || s);
  $("agg-zomato-hook")?.closest(".agg-hook")?.classList.toggle("is-on", Boolean(s.zomato_live));
  $("agg-swiggy-hook")?.closest(".agg-hook")?.classList.toggle("is-on", Boolean(s.swiggy_live));
  if ($("agg-sandbox-zomato")) $("agg-sandbox-zomato").hidden = !s.zomato_live;
  if ($("agg-sandbox-swiggy")) $("agg-sandbox-swiggy").hidden = !s.swiggy_live;
}

function aggregatorTotalsHtml(order) {
  const save = Math.round((Number(order.discount) || 0) * 100) / 100;
  const tax = Math.round((Number(order.tax) || 0) * 100) / 100;
  const disc = save > 0
    ? `<div class="qr-order-total qr-order-discount"><span>Platform discount</span><strong>−${money(save)}</strong></div>`
    : "";
  const gst = tax > 0 ? `<div class="qr-order-total"><span>GST / tax</span><strong>${money(tax)}</strong></div>` : "";
  return `${disc}${gst}<div class="qr-order-total"><span>Ticket total</span><strong>${money(order.total)}</strong></div>`;
}

function renderAggregatorOrders() {
  const A = aggregatorApi();
  const el = $("agg-order-list");
  if (!el || !A) return;
  const query = String($("agg-order-search")?.value || "").trim().toLowerCase();
  const rows = (aggOrderCache || []).filter((row) => {
    if (aggSourceFilter && row.source !== aggSourceFilter) return false;
    if (!aggStatusFilter) {
      if (!A.isOpen(row.status)) return false;
    } else if (aggStatusFilter === "kitchen") {
      if (!["accepted", "preparing"].includes(row.status)) return false;
    } else if (row.status !== aggStatusFilter) return false;
    const hay = [
      row.order_number,
      row.customer_name,
      row.mobile,
      row.address,
      row.notes,
      ...(row.lines || []).map((line) => `${line.name || ""} ${line.notes || ""}`),
    ].join(" ").toLowerCase();
    return !query || hay.includes(query);
  });
  el.innerHTML = rows.length
    ? rows
        .map((order) => {
          const source = A.normalizeSource(order.source) || "zomato";
          const closed = ["delivered", "cancelled", "rejected"].includes(order.status);
          const actions = A.nextActions(order.status)
            .map((st) => `<button class="btn ${st === "accepted" ? "primary" : st === "rejected" || st === "cancelled" ? "danger" : st === "ready" || st === "delivered" ? "primary" : ""}" type="button" data-agg-status-next="${escapeHtml(st)}">${escapeHtml(A.actionLabel(st))}</button>`)
            .join("");
          const seat = order.fulfillment === "pickup" ? "Parcel / pickup" : `${A.sourceLabel(source)} delivery`;
          const prep = order.prep_minutes ? ` · ${escapeHtml(String(order.prep_minutes))} min prep` : "";
          return `<article class="qr-order-card agg-ticket is-${escapeHtml(order.status || "pending")} is-${escapeHtml(source)}${order.status === "pending" ? " is-pending" : ""}" data-agg-order="${escapeHtml(order.id)}">
            <header class="qr-order-head">
              <div>
                <span class="agg-brand is-${escapeHtml(source)}">${escapeHtml(A.sourceLabel(source))}</span>
                <h3>${escapeHtml(order.order_number)}</h3>
                <p class="qr-order-meta">${escapeHtml(formatShopDateTime(order.created_at))}${prep}</p>
              </div>
              <span class="qr-order-status is-${escapeHtml(order.status || "pending")}">${escapeHtml(A.statusLabel(order.status))}</span>
            </header>
            <p class="qr-order-meta"><strong>${escapeHtml(order.customer_name || "Guest")}</strong>${order.mobile ? ` · ${escapeHtml(order.mobile)}` : ""} · ${escapeHtml(seat)}</p>
            ${order.address ? `<p class="qr-order-note">${escapeHtml(order.address)}</p>` : ""}
            <div class="qr-order-lines">${(order.lines || []).map((line) => {
              const si = String(line.notes || "").trim();
              return `<div class="qr-order-line"><span>${escapeHtml(line.name)} · ${escapeHtml(String(line.qty))}${si ? `<small class="qr-line-si">${escapeHtml(si)}</small>` : ""}</span><strong>${money(line.amount)}</strong></div>`;
            }).join("")}</div>
            ${aggregatorTotalsHtml(order)}
            ${order.notes ? `<p class="qr-order-note">Note: ${escapeHtml(order.notes)}</p>` : ""}
            <div class="qr-order-actions">
              ${actions}
              ${!closed && order.status !== "pending" ? `<button class="btn" type="button" data-agg-kot>Kitchen KOT</button>` : ""}
              ${!closed ? `<button class="btn" type="button" data-agg-counter>Open in Counter</button>` : ""}
            </div>
          </article>`;
        })
        .join("")
    : `<p class="item-empty-card"><strong>No online tickets here</strong><span>New Zomato and Swiggy orders ding and appear as kitchen tickets. Use Test Zomato or Test Swiggy to try the desk.</span></p>`;
  paintAggregatorBadge();
  paintAggregatorLanes();
  paintAggregatorSetupCard();
  paintAggregatorSoundToggle();
  const hint = $("agg-orders-hint");
  if (hint && !hint.classList.contains("error")) {
    hint.textContent = rows.length ? `${rows.length} ticket${rows.length === 1 ? "" : "s"}` : "";
    hint.className = "hint";
  }
}

async function loadAggregatorOrders({ announce = false } = {}) {
  if (!aggregatorDeskAllowed() || !can("orders")) return;
  try {
    const rows = await api("/api/aggregator/orders");
    const list = Array.isArray(rows) ? rows : rows?.orders || [];
    const incoming = list.filter((row) => row?.id && row.status === "pending" && aggSeenIds && !aggSeenIds.has(String(row.id)));
    aggOrderCache = list;
    if (aggSeenIds == null) aggSeenIds = new Set(list.map((row) => String(row.id)).filter(Boolean));
    else list.forEach((row) => row?.id && aggSeenIds.add(String(row.id)));
    renderAggregatorOrders();
    if (announce && incoming.length) {
      globalThis.POSQrNotify?.playTone?.({ force: true });
      showAggregatorToast(incoming[0], incoming.length - 1);
      setHint(`${incoming.length} new ${aggregatorApi()?.sourceLabel(incoming[0].source) || "online"} order${incoming.length === 1 ? "" : "s"}`, "ok");
    }
  } catch (err) {
    if ($("agg-orders-hint")) {
      $("agg-orders-hint").textContent = err.message;
      $("agg-orders-hint").className = "hint error";
    }
  }
}

async function updateAggregatorOrder(order, status) {
  const data = await api(`/api/aggregator/orders/${encodeURIComponent(order.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (status === "accepted") {
    setHint("Order accepted · sending kitchen KOT", "ok");
    try {
      await sendAggregatorKot(data.order || order);
      return data.order || order;
    } catch (err) {
      setHint(`Accepted. Kitchen KOT failed: ${err.message}`, "error");
    }
  }
  await loadAggregatorOrders();
  return data.order || order;
}

async function sendAggregatorKot(order) {
  const data = await api(`/api/aggregator/orders/${encodeURIComponent(order.id)}/kot`, { method: "POST", body: "{}" });
  const A = aggregatorApi();
  try {
    printKitchenKot({
      tableNo: A?.kotTable?.(order.source, order.fulfillment, { parcel: isBarShop() }) || "Parcel",
      lines: (order.lines || []).map((line) => ({ itemId: line.external_item_id || line.name, qtyGm: Number(line.qty) || 1, name: line.name, notes: line.notes })),
      printed: [],
      notes: `${A?.sourceLabel(order.source) || ""} ${order.order_number}`,
      full: true,
    });
  } catch {
    /* ticket already saved */
  }
  await loadAggregatorOrders();
  void loadKots({ announce: false });
  setHint(data?.kot_ticket_id ? "Kitchen KOT sent" : "Kitchen ticket saved", "ok");
}

async function openAggregatorInCounter(order) {
  const A = aggregatorApi();
  const matchItem = (line) =>
    state.items.find((item) => item.id === line.item_id) ||
    state.items.find((item) => String(item.name || "").toLowerCase() === String(line.name || "").toLowerCase());
  const liveLines = (order.lines || []).map((line) => ({ line, item: matchItem(line) })).filter((row) => row.item);
  if (!liveLines.length) throw new Error("Map these platform items to your menu, then open in Counter");
  if (state.cart.length && !confirm("Replace the current Counter bill with this platform order?")) return;
  const R = restaurantApi();
  state.activeTable = A?.kotTable?.(order.source, order.fulfillment, { parcel: isBarShop() }) || R?.PARCEL || "Parcel";
  if (isRestaurantShop() && R) syncActiveFloor(state.activeTable);
  state.cart = liveLines.map(({ line, item }) => ({
    lineId: newCartLineId(),
    itemId: item.id,
    qtyGm: Number(line.qty) || 1,
    notes: String(line.notes || "").trim(),
  }));
  const walkIn = state.customers.find((customer) => customer.code === "CUS-001") || state.customers[0];
  state.customerId = walkIn?.id || "";
  renderCustomersSelect();
  renderCatalog();
  renderCart();
  showView("counter");
  setHint(`${A?.sourceLabel(order.source) || "Online"} ${order.order_number} opened in Counter`, "ok");
}

async function sandboxAggregatorOrder(source) {
  const A = aggregatorApi();
  const block = A?.activationBlock?.(source, state.aggregatorSettings || aggregatorSettings());
  if (block) throw new Error(block);
  await api("/api/aggregator/sandbox", { method: "POST", body: JSON.stringify({ source }) });
  await loadAggregatorOrders({ announce: true });
  setHint(`Test ${A?.sourceLabel(source) || source} order added`, "ok");
}

function qrStatusLabel(status) {
  const s = String(status || "pending");
  if (s === "pending") return "New";
  if (s === "accepted") return "Accepted";
  if (s === "kot_sent") return "KOT sent";
  if (s === "preparing") return "Preparing";
  if (s === "ready") return "Ready";
  if (s === "completed") return "Served";
  if (s === "rejected") return "Rejected";
  if (s === "cancelled") return "Cancelled";
  return s;
}

function qrPayLabel(order) {
  const paid = String(order.payment_status || order.invoice_payment_status || "").toLowerCase() === "paid" || Boolean(order.sales_order_id);
  return paid ? "Paid" : "Unpaid";
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
    ? rows.map((order) => `<article class="qr-order-card is-${escapeHtml(order.status || "pending")}${order.status === "pending" ? " is-pending" : ""}" data-qr-order="${escapeHtml(order.id)}">
        <header class="qr-order-head">
          <div><h3>${escapeHtml(order.order_number)}</h3><p class="qr-order-meta">${escapeHtml(formatShopDateTime(order.created_at))}${order.kot_number ? ` · ${escapeHtml(order.kot_number)}` : ""}</p></div>
          <span class="qr-order-status is-${escapeHtml(order.status || "pending")}">${escapeHtml(qrStatusLabel(order.status))}</span>
        </header>
        <p class="qr-order-meta"><strong>${escapeHtml(order.customer_name)}</strong> · ${escapeHtml(order.mobile)}${order.table_no ? ` · ${escapeHtml(order.table_no)}` : ""} · ${escapeHtml(qrPayLabel(order))}</p>
        <div class="qr-order-lines">${(order.lines || []).map((line) => {
          const si = String(line.notes || "").trim();
          return `<div class="qr-order-line"><span>${escapeHtml(line.item_name)} · ${escapeHtml(qrOrderQty(line))}${si ? `<small class="qr-line-si">${escapeHtml(si)}</small>` : ""}</span><strong>${money(line.amount)}</strong></div>`;
        }).join("")}</div>
        ${qrOrderTotalsHtml(order)}
        ${order.notes ? `<p class="qr-order-note">Note: ${escapeHtml(order.notes)}</p>` : ""}
        <div class="qr-order-actions">
          ${!["completed", "cancelled", "rejected"].includes(order.status) ? `<button class="btn primary" type="button" data-qr-counter="${escapeHtml(order.id)}">Open in Counter</button>` : ""}
          ${order.status === "pending" ? `<button class="btn primary" type="button" data-qr-status-next="accepted">Accept Order</button>` : ""}
          ${order.status === "pending" ? `<button class="btn danger" type="button" data-qr-status-next="rejected">Reject Order</button>` : ""}
          ${isRestaurantShop() && !["pending", "completed", "cancelled", "rejected"].includes(order.status) ? `<button class="btn" type="button" data-qr-kot="${escapeHtml(order.id)}">Kitchen KOT</button>` : ""}
          ${order.status === "ready" ? `<button class="btn" type="button" data-qr-status-next="completed">Served</button>` : ""}
          ${order.status === "completed" && !order.sales_order_id ? `<button class="btn primary" type="button" data-qr-status-next="completed">Save invoice</button>` : ""}
          <button class="btn" type="button" data-qr-print="${escapeHtml(order.id)}">Print</button>
          ${order.sales_order_id ? `<button class="btn" type="button" data-qr-invoice="${escapeHtml(order.sales_order_id)}">View invoice${order.invoice_number ? ` ${escapeHtml(order.invoice_number)}` : ""}</button>` : ""}
          ${!["completed", "cancelled", "rejected"].includes(order.status) ? `<button class="btn danger" type="button" data-qr-status-next="cancelled">Cancel</button>` : ""}
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
    const ticket = data.ticket;
    setHint(
      ticket?.kot_number ? `Order Accepted ✓ · ${ticket.kot_number} Generated` : "Order Accepted ✓",
      "ok",
    );
    try {
      if (ticket?.id) {
        if (!kotSeenIds) kotSeenIds = new Set();
        kotSeenIds.add(String(ticket.id));
        try {
          kotChannel()?.postMessage({ type: "kot-new", ticket });
        } catch {
          /* ignore */
        }
        const accepted = data.order || order;
        try {
          printKitchenKot({
            tableNo: accepted.table_no,
            lines: (accepted.lines || []).map((line) => ({
              itemId: line.item_id,
              qtyGm: Number(line.quantity_gm) || 0,
              name: line.item_name,
              unit: line.unit || "PCS",
              notes: String(line.notes || "").trim(),
            })),
            printed: [],
            notes: accepted.notes,
            full: true,
          });
        } catch {
          /* ticket is already on the kitchen board */
        }
      } else {
        await sendQrKitchenKot(data.order || order);
      }
    } catch (err) {
      setHint(err.message, "error");
    }
    void loadKots({ announce: true });
  }
  if (status === "rejected") setHint("Order rejected", "ok");
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
globalThis.setAccountsTab = setAccTab;
globalThis.setReportTab = setReportTab;

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
    <div class="report-card"><span>Closing</span><strong>${ledgerBalanceText(data?.closing || 0)}</strong></div>
    <div class="report-card"><span>${kind === "customer" ? "Outstanding" : "Payable"}</span><strong>${money(due)}</strong></div>
  </div>${action ? `<p class="hint">${action}</p>` : ""}`;
  const opening = Number(data?.opening || 0);
  const typeLabel = (t) => {
    const s = String(t || "").toLowerCase();
    if (s === "sale_credit") return "Sale";
    if (s === "receipt") return "Payment";
    if (s === "payment") return "Payment";
    if (s === "purchase_credit") return "Purchase";
    return t || "—";
  };
  const invoiceOf = (r) => r.invoice_no || (r.entry_type === "sale_credit" || r.entry_type === "purchase_credit" ? r.notes : "") || "—";
  const invoices = data?.invoices || [];
  const invTable = invoices.length
    ? `<h3 class="acc-inv-head">Invoices</h3><table><thead><tr>
        <th>Invoice</th><th>Billed</th><th>Paid</th><th>Due</th>
      </tr></thead><tbody>${invoices.map((inv) => `<tr>
        <td>${escapeHtml(inv.invoice_no)}</td>
        <td>${money(inv.billed)}</td>
        <td>${money(inv.paid)}</td>
        <td>${ledgerBalanceText(inv.due)}</td>
      </tr>`).join("")}</tbody></table>`
    : "";
  if (!rows.length) {
    el.innerHTML = `${head}<p class="hint">No ${kind} ledger entries in this period.</p>${invTable}`;
    return;
  }
  el.innerHTML = `${head}<table><thead><tr>
    <th>Date</th><th>Type</th><th>Invoice</th><th>Debit</th><th>Credit</th><th>Balance</th><th></th>
  </tr></thead><tbody>
    <tr>
      <td>${escapeHtml(formatShopDate(data?.from) || data?.from || "")}</td>
      <td>Opening Due</td>
      <td>—</td>
      <td>${opening > 0 ? money(opening) : "—"}</td>
      <td>${opening < 0 ? money(Math.abs(opening)) : "—"}</td>
      <td>${ledgerBalanceText(opening)}</td>
      <td></td>
    </tr>
    ${rows
    .map((r, i) => {
      const printable = r.entry_type === "receipt" || r.entry_type === "payment";
      return `<tr>
      <td>${escapeHtml(formatShopDate(r.payment_date || r.created_at))}</td>
      <td>${escapeHtml(typeLabel(r.entry_type))}</td>
      <td>${escapeHtml(invoiceOf(r))}</td>
      <td>${r.debit ? money(r.debit) : "—"}</td>
      <td>${r.credit ? money(r.credit) : "—"}</td>
      <td>${ledgerBalanceText(r.balance)}</td>
      <td>${printable ? voucherRowActions(i) : ""}</td>
    </tr>`;
    })
    .join("")}</tbody></table>${invTable}`;
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
      <td>${escapeHtml(formatShopDate(r.payment_date || r.created_at))}</td>
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
  const row = customerRecord(customer);
  const due = Number(row.outstanding) || 0;
  $("modal-title").textContent = `Collect due · ${row.business_name || row.name}`;
  $("modal-body").innerHTML = `<form class="settings" id="receipt-modal-form">
    <p class="section-note">Outstanding: <strong>${money(due)}</strong>${row.mobile ? ` · ${escapeHtml(row.mobile)}` : ""}${row.email ? ` · ${escapeHtml(row.email)}` : ""}</p>
    <div class="cust-actions">${customerRemindButtons(row, due)}</div>
    <label>Amount <input id="rcp-amount" type="number" min="0.01" step="0.01" max="${due}" required value="${due}" /></label>
    <label>Payment date <input id="rcp-date" type="date" required value="${escapeHtml(shopDateInputValue())}" /></label>
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
    const method = $("rcp-method").value;
    try {
      await collectCustomerDue(row, $("rcp-amount").value, method, note, {
        payment_date: $("rcp-date")?.value || shopDateInputValue(),
        payment_reference: ref,
        order_id: "",
      });
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
      ? `<table><thead><tr><th>Code</th><th>Name</th><th>Business</th><th>Mobile</th><th>Email ID</th><th>Credit limit</th><th>Outstanding</th><th></th></tr></thead><tbody>${receivables
        .map((c) => {
          const due = Number(c.outstanding) || 0;
          return `<tr><td>${escapeHtml(c.code)}</td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.business_name || "—")}</td><td>${escapeHtml(c.mobile || "—")}</td><td>${escapeHtml(c.email || "—")}</td><td>${money(Number(c.credit_limit) || 0)}</td><td>${money(due)}</td><td><div class="cust-actions"><button class="btn primary" type="button" data-rcp="${escapeHtml(c.id)}">Receipt</button>${customerRemindButtons(c, due)}</div></td></tr>`;
        })
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
  const create = e.target.closest("[data-counter-add-item]");
  if (create) {
    openCounterAddItem({ q: create.dataset.counterAddItem });
    return;
  }
  const btn = e.target.closest("[data-add]");
  if (btn) {
    const item = state.items.find((i) => i.id === btn.dataset.add);
    if (item && garmentScanGate(item, {})) {
      focusScanLane();
      return;
    }
    addWeighableItem(btn.dataset.add);
    focusScanLane();
  }
});
$("classic-item-hits")?.addEventListener("click", (e) => {
  const create = e.target.closest("[data-counter-add-item]");
  if (create) {
    const q = create.dataset.counterAddItem || "";
    const fromCode = $("bill-scan-code")?.value?.trim() === q;
    openCounterAddItem(fromCode ? { barcode: q } : { name: q });
    return;
  }
  const pick = e.target.closest("[data-size-pick]");
  if (pick) {
    openGarmentSizePicker(pick.dataset.sizePick, {
      color: pick.dataset.sizeColor || "",
      size: pick.dataset.size || "",
      force: true,
      qty: classicScanAddQty(state.items.find((i) => i.id === pick.dataset.sizePick)),
    });
    clearCounterQuery($("bill-scan-code"));
    paintClassicItemHits();
    return;
  }
  const btn = e.target.closest("[data-add]");
  if (!btn) return;
  const item = state.items.find((i) => i.id === btn.dataset.add);
  if (item && garmentScanGate(item, {})) {
    clearCounterQuery($("bill-scan-code"));
    paintClassicItemHits();
    return;
  }
  addWeighableItem(btn.dataset.add, classicScanAddQty(item));
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
function paintPayAction() {
  const payTotal = thisBillPayable();
  const btn = $("btn-pay");
  if (btn) {
    btn.textContent = state.editingOrderId
      ? tt("pos.save_changes", "Save changes")
      : state.cart.length
        ? isClassicBillShop()
          ? `Save Bill ${money(payTotal)}`
          : tt("pos.pay_amount", `Pay ${money(payTotal)}`, { amount: money(payTotal) })
        : isClassicBillShop()
          ? "Save Bill"
          : tt("pos.pay", "Pay");
  }
  syncPayAmountDefault();
  paintCounterDue();
}

function paintBillFigures() {
  const t = cartTotals();
  const families = [...new Set(state.cart.map((l) => POSUnits.typeOf(itemUnit(state.items.find((i) => i.id === l.itemId))).family))];
  if ($("qty-lab")) $("qty-lab").textContent = isPrintShop() ? "Area" : "Qty";
  if ($("qty-total")) {
    $("qty-total").textContent = families.length <= 1 && state.cart.length
      ? fmtQty(t.qty, state.items.find((i) => i.id === state.cart[0].itemId))
      : families.length > 1
        ? `${state.cart.length} lines`
        : "0";
  }
  if ($("taxable")) $("taxable").textContent = money(t.taxable);
  if ($("tax")) $("tax").textContent = money(t.tax);
  if ($("disc-total")) $("disc-total").textContent = money((t.discount || 0) + (t.lineDiscount || 0));
  if ($("extra-total")) $("extra-total").textContent = money(t.extra || 0);
  if ($("loyalty-total")) $("loyalty-total").textContent = money(t.loyalty || 0);
  if ($("profit-total")) $("profit-total").textContent = money(t.profit || 0);
  if ($("disc-row")) $("disc-row").hidden = !(((t.discount || 0) + (t.lineDiscount || 0)) > 0);
  if ($("extra-row")) $("extra-row").hidden = !(Number(t.extra) > 0);
  if ($("loyalty-row")) $("loyalty-row").hidden = !(Number(t.loyalty) > 0);
  if ($("taxable-row")) $("taxable-row").hidden = !(Number(t.taxable) > 0);
  if ($("gst-row")) $("gst-row").hidden = !(Number(t.tax) > 0);
  if ($("total")) $("total").textContent = money(t.total != null ? t.total : t.taxable + t.tax);
  paintPayAction();
}

function refreshPrintLineLive(key) {
  const line = findCartLine(key);
  const item = line ? state.items.find((i) => i.id === line.itemId) : null;
  if (!line || !item) return;
  syncPrintLineQty(line, item);
  const sel = (attr) => document.querySelector(`[${attr}="${CSS.escape(String(key))}"]`);
  const root = sel("data-print-w")?.closest(".print-line");
  if (root) {
    const calc = lineCalc(item, line);
    const need = printLineNeedsSize(line);
    const summary = root.querySelector(".print-line-summary");
    const amt = root.querySelector(".line-amt");
    const chip = root.querySelector("[data-print-area]");
    root.classList.toggle("is-need-size", need);
    if (summary) summary.textContent = need ? "Enter width × height" : printLineCaptionText(item, line);
    if (amt) amt.textContent = need ? "—" : money(calc.taxable + calc.gst);
    if (chip) chip.textContent = printAreaChipText(item, line);
    const ta = root.querySelector("[data-line-note]");
    if (ta && isAutoPrintSpecNote(ta.value)) ta.value = line.notes || "";
  }
  paintBillFigures();
}

async function attachPrintCounterFile(key, file) {
  const line = findCartLine(key);
  if (!line || !file) return;
  const P = printApi();
  if (P?.allowedFile && !P.allowedFile(file.name, file.type, P.DEFAULT_SETTINGS)) {
    setHint("This file type is not allowed", "error");
    return;
  }
  setHint("Uploading print file…");
  const content = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
  const res = await api("/api/print/counter-file", {
    method: "POST",
    body: JSON.stringify({
      file_name: file.name,
      content,
      customerId: state.customerId || "",
    }),
  });
  line.printFileId = res.file?.id || res.id || "";
  line.printFileName = res.file?.file_name || file.name;
  const item = state.items.find((i) => i.id === line.itemId);
  syncPrintLineQty(line, item);
  renderCart();
  setHint(`Attached ${line.printFileName}`, "ok");
}

$("lines").addEventListener("click", (e) => {
  const clearFile = e.target.closest("[data-print-file-clear]");
  if (clearFile) {
    const line = findCartLine(clearFile.dataset.printFileClear);
    if (line) {
      line.printFileId = "";
      line.printFileName = "";
      const item = state.items.find((i) => i.id === line.itemId);
      syncPrintLineQty(line, item);
      renderCart();
    }
    return;
  }
  const scaleLine = e.target.closest("[data-scale-line]");
  if (scaleLine) {
    applyScaleWeight(scaleLine.dataset.scaleLine);
    return;
  }
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
  if (e.target.closest("[data-qty]") || e.target.closest("[data-line-rate]") || e.target.closest("[data-print-rate]") || e.target.closest("[data-line-note]") || e.target.closest(".print-dims") || e.target.closest(".print-job") || e.target.closest(".print-file-row") || e.target.closest(".print-extra-bar")) return;
  const btn = e.target.closest("[data-chg]");
  if (!btn) return;
  changeLineQty(btn.dataset.chg, Number(btn.dataset.d));
});
$("lines").addEventListener("input", (e) => {
  const ta = e.target.closest("[data-line-note]");
  if (ta) {
    const line = findCartLine(ta.dataset.lineNote);
    if (line) line.notes = String(ta.value || "").slice(0, 500);
    return;
  }
  const lineRate = e.target.closest("[data-line-rate], [data-print-rate]");
  if (lineRate && !e.target.closest("[data-print-w], [data-print-h], [data-print-copies], [data-print-dim]")) {
    const rateKey = lineRate.dataset.lineRate || lineRate.dataset.printRate;
    applyCartLineRate(rateKey, lineRate.value);
    return;
  }
  const w = e.target.closest("[data-print-w]");
  const h = e.target.closest("[data-print-h]");
  const copies = e.target.closest("[data-print-copies]");
  const dim = e.target.closest("[data-print-dim]");
  const key = w?.dataset.printW || h?.dataset.printH || copies?.dataset.printCopies || dim?.dataset.printDim;
  if (!key) return;
  const line = findCartLine(key);
  if (!line) return;
  if (w) line.printWidth = w.value;
  if (h) line.printHeight = h.value;
  if (copies) line.printCopies = Math.max(1, Number(copies.value) || 1);
  if (dim) line.printDimUnit = dim.value;
  refreshPrintLineLive(key);
});
$("lines").addEventListener("focusin", (e) => {
  const input = e.target.closest("[data-qty], [data-line-rate], [data-print-rate]");
  if (input && typeof input.select === "function") input.select();
});
$("lines").addEventListener("change", (e) => {
  const file = e.target.closest("[data-print-file]");
  if (file) {
    const picked = file.files?.[0];
    if (picked) attachPrintCounterFile(file.dataset.printFile, picked).catch((err) => setHint(err.message, "error"));
    file.value = "";
    return;
  }
  const dim = e.target.closest("[data-print-dim]");
  if (dim) {
    const line = findCartLine(dim.dataset.printDim);
    if (line) {
      line.printDimUnit = dim.value;
      refreshPrintLineLive(dim.dataset.printDim);
    }
    return;
  }
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
  const input = e.target.closest("[data-qty], [data-line-disc], [data-line-rate], [data-print-rate]");
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
  paintInvoicePayChips();
  renderOrdersList();
});
$("invoices-pay-chips")?.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-orders-pay]");
  if (!chip) return;
  const val = chip.dataset.ordersPay || "";
  if ($("orders-pay-filter")) $("orders-pay-filter").value = val;
  orderFilter.payment = val;
  paintInvoicePayChips();
  renderOrdersList();
});
$("orders-refresh")?.addEventListener("click", () => {
  loadOrders().catch((err) => setHint(err.message, "error"));
});

function toggleAppNav() {
  const app = document.getElementById("app");
  if (!app) return;
  setNavCollapsed(!app.classList.contains("nav-collapsed"));
}
$("nav-toggle")?.addEventListener("click", toggleAppNav);
$("counter-nav-toggle")?.addEventListener("click", toggleAppNav);
$("counter-low-stock-btn")?.addEventListener("click", () => maybeShowCounterLowStockAlert({ force: true }));
$("low-stock-close")?.addEventListener("click", closeLowStockModal);
$("low-stock-view")?.addEventListener("click", () => {
  closeLowStockModal();
  showView("stock");
});
$("low-stock-modal")?.addEventListener("click", (e) => {
  if (e.target === $("low-stock-modal")) closeLowStockModal();
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
  const printReceiptBtn = e.target.closest("[data-print-receipt]");
  if (printReceiptBtn) {
    const o = findInvoice(printReceiptBtn.dataset.printReceipt);
    const entry = o ? receiptEntryFromInvoice(o) : null;
    if (entry) showVoucherResult(entry);
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
    if ($("pay-amount")) delete $("pay-amount").dataset.dirty;
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
function scheduleBarcodeAutoSearch(el) {
  clearTimeout(scheduleBarcodeAutoSearch._t);
  if (!el) return;
  const code = globalThis.POSBarcode?.cleanCode ? POSBarcode.cleanCode(el.value) : String(el.value || "").trim();
  const like = globalThis.POSBarcode?.isBarcodeLike ? POSBarcode.isBarcodeLike(code) : (code.length >= 8 && !/\s/.test(code));
  if (!like || code.length < 8) return;
  scheduleBarcodeAutoSearch._t = setTimeout(() => {
    const live = globalThis.POSBarcode?.cleanCode ? POSBarcode.cleanCode(el.value) : String(el.value || "").trim();
    if (live === code) void applyBarcodeScan(code, el);
  }, 140);
}

$("scan-code")?.addEventListener("input", () => {
  syncCounterQuery($("scan-code").value, $("scan-code"));
  scheduleBarcodeAutoSearch($("scan-code"));
});
$("scan-code")?.addEventListener("search", () => {
  const raw = $("scan-code")?.value;
  if (raw) void applyBarcodeScan(raw, $("scan-code"));
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
  const raw = $("scan-code")?.value;
  if (applyTypedScale(raw, $("scan-code"))) return;
  await applyBarcodeScan(raw, $("scan-code"));
});
$("counter-add-item")?.addEventListener("click", () => {
  const q = String($("scan-code")?.value || $("search")?.value || "").trim();
  openCounterAddItem(looksLikeItemCode(q) ? { barcode: q } : { name: q });
});
$("classic-add-item")?.addEventListener("click", () => {
  const code = String($("bill-scan-code")?.value || "").trim();
  const name = String($("bill-item-search")?.value || "").trim();
  const qty = String($("bill-scan-qty")?.value || "").trim();
  openCounterAddItem(code && !name ? { barcode: code, qty } : { name: name || code, barcode: code, qty });
});
$("counter-item-form")?.addEventListener("submit", (e) => void saveCounterAddItem(e));
$("ci-cancel")?.addEventListener("click", () => closeCounterAddItem());
$("counter-item-modal")?.addEventListener("click", (e) => {
  if (e.target === $("counter-item-modal")) closeCounterAddItem();
});
$("garment-size-close")?.addEventListener("click", () => closeGarmentSizePicker());
$("garment-size-add")?.addEventListener("click", () => confirmGarmentSize());
$("garment-size-modal")?.addEventListener("click", (e) => {
  if (e.target === $("garment-size-modal")) closeGarmentSizePicker();
  const color = e.target.closest("[data-gs-color]");
  if (color && garmentPicker) {
    garmentCounterApi()?.selectColor?.(garmentPicker, color.dataset.gsColor);
    paintGarmentSizePicker();
    return;
  }
  const size = e.target.closest("[data-gs-size]");
  if (size && garmentPicker) {
    garmentCounterApi()?.selectSize?.(garmentPicker, size.dataset.gsSize);
    paintGarmentSizePicker();
    return;
  }
  const step = e.target.closest("[data-gs-qty]");
  if (step) {
    const qty = $("garment-size-qty");
    if (!qty) return;
    const max = Number(qty.max);
    const next = Math.max(1, Math.round(Number(qty.value) || 1) + Number(step.dataset.gsQty || 0));
    qty.value = String(Number.isFinite(max) && max > 0 ? Math.min(next, max) : next);
    paintGarmentSizePicker();
  }
});
$("garment-size-modal")?.addEventListener("keydown", (e) => {
  if ($("garment-size-modal")?.hidden) return;
  if (e.key === "Escape") {
    e.preventDefault();
    closeGarmentSizePicker();
    focusScanLane();
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    confirmGarmentSize();
    return;
  }
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    if (e.target?.id === "garment-size-qty") return;
    e.preventDefault();
    garmentCounterApi()?.moveSelection?.(garmentPicker, e.key === "ArrowLeft" ? "size-prev" : "size-next");
    paintGarmentSizePicker();
    return;
  }
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    if (e.target?.id === "garment-size-qty") return;
    e.preventDefault();
    garmentCounterApi()?.moveSelection?.(garmentPicker, e.key === "ArrowUp" ? "color-prev" : "color-next");
    paintGarmentSizePicker();
  }
});
$("item-variant-sizes")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-gv-size]");
  if (!btn) return;
  e.preventDefault();
  readGarmentVariantCells();
  const G = globalThis.POSGarmentPurchase;
  const size = btn.dataset.gvSize;
  const list = state.garmentVariants?.sizes || [];
  const idx = list.findIndex((s) => (G?.sizesEqual ? G.sizesEqual(s, size) : s === size));
  if (idx >= 0) list.splice(idx, 1);
  else list.push(size);
  state.garmentVariants.sizes = list;
  paintGarmentVariantEditor();
});
$("item-variant-colors")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-gv-color]");
  if (!btn) return;
  e.preventDefault();
  readGarmentVariantCells();
  const G = globalThis.POSGarmentPurchase;
  const color = G?.normalizeColor?.(btn.dataset.gvColor) || btn.dataset.gvColor;
  const list = state.garmentVariants.colors || [];
  const idx = list.findIndex((row) => (G?.colorsEqual ? G.colorsEqual(row, color) : row === color));
  if (idx >= 0) list.splice(idx, 1);
  else list.push(color);
  state.garmentVariants.colors = list;
  state.garmentVariants.colorsText = list.join(", ");
  paintGarmentVariantEditor();
});
$("item-variant-add-color")?.addEventListener("click", () => {
  const raw = $("item-variant-custom-color")?.value || "";
  const color = globalThis.POSGarmentPurchase?.normalizeColor?.(raw) || String(raw).trim();
  if (!color) return;
  readGarmentVariantCells();
  const list = state.garmentVariants.colors || [];
  if (!list.some((row) => globalThis.POSGarmentPurchase?.colorsEqual?.(row, color) || row === color)) list.push(color);
  state.garmentVariants.colors = list;
  state.garmentVariants.colorsText = list.join(", ");
  if ($("item-variant-custom-color")) $("item-variant-custom-color").value = "";
  paintGarmentVariantEditor();
});
$("item-variant-color-images")?.addEventListener("input", () => readGarmentVariantCells());
$("item-variant-add-size")?.addEventListener("click", () => {
  const raw = $("item-variant-custom-size")?.value || "";
  const size = globalThis.POSGarmentPurchase?.normalizeSize?.(raw) || String(raw).trim().toUpperCase().replace(/\s+/g, "");
  if (!size) return;
  readGarmentVariantCells();
  const list = state.garmentVariants?.sizes || [];
  if (!list.some((s) => globalThis.POSGarmentPurchase?.sizesEqual?.(s, size) || s === size)) list.push(size);
  state.garmentVariants.sizes = list;
  if ($("item-variant-custom-size")) $("item-variant-custom-size").value = "";
  paintGarmentVariantEditor();
});
$("item-variant-grid")?.addEventListener("input", () => readGarmentVariantCells());
$("bill-scan-code")?.addEventListener("input", () => {
  syncCounterQuery($("bill-scan-code").value, $("bill-scan-code"));
  scheduleBarcodeAutoSearch($("bill-scan-code"));
});
$("bill-scan-code")?.addEventListener("search", () => {
  const raw = $("bill-scan-code")?.value;
  if (raw) void applyBarcodeScan(raw, $("bill-scan-code"));
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
  if (applyTypedScale(raw, source)) return;
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
    if (applyTypedScale(code, el)) {
      focusScanLane();
      return;
    }
    await applyBarcodeScan(code, el);
    focusScanLane();
  };
  const onError = (err) => setHint(err?.message || "Camera scan failed", "error");
  scan.bindButton($("scan-camera-btn"), { onScan, onError });
  scan.bindButton($("bill-scan-camera-btn"), { onScan, onError, alwaysShow: true });
}
initCameraScan();
initPurchaseCameraScan();
function scaleBizKey() {
  return String(state.session?.business_id || state.businessMeta?.id || state.company?.id || "local");
}
function scaleSettings() {
  const local = globalThis.POSScale?.loadSettings?.(scaleBizKey()) || { baud: 9600, unit: "kg", autoApply: true, enabled: false, precision: 3, allowManual: true };
  return { ...local, enabled: shopScaleEnabled() };
}
function isScaleEnabled() {
  return shopScaleEnabled() && scaleSettings().enabled === true;
}
function canOverrideScaleWeight() {
  if (state.session?.role === "business_admin") return true;
  if (scaleSettings().allowManual === false) return can("settings");
  return can("counter") || can("settings");
}
function scalePrecision() {
  const n = Number(scaleSettings().precision);
  return Number.isFinite(n) && n >= 0 && n <= 4 ? n : 3;
}
function formatScaleKg(grams) {
  const g = Number(grams) || 0;
  return (g / 1000).toFixed(scalePrecision());
}
function logScaleWeight(row) {
  globalThis.POSScale?.appendLog?.(scaleBizKey(), row);
  paintScaleLog();
}
function scaleLineNote(line) {
  const g = Number(line?.scaleGrams) || 0;
  const rest = String(line?.notes || line?.special_instruction || "").replace(/Scale [\d.]+ kg \([^)]+\)\.?\s*/gi, "").trim();
  if (!(g > 0)) return rest;
  const bit = `Scale ${formatScaleKg(g)} kg (${line.weightSource || "scale"})`;
  return rest ? `${bit}. ${rest}` : bit;
}
function isWeightItem(item) {
  return Boolean(item) && !POSUnits.isCount(itemUnit(item));
}
function lastWeightLine() {
  for (let i = state.cart.length - 1; i >= 0; i--) {
    const line = state.cart[i];
    const item = state.items.find((x) => x.id === line.itemId);
    if (isWeightItem(item) && !isPieceBarcodeLine(line, item)) return line;
  }
  return null;
}
function paintScaleDock(hit) {
  const S = globalThis.POSScale;
  const dock = $("scale-dock");
  const reading = hit || S?.current?.();
  const kgEl = $("scale-weight");
  const amtEl = $("scale-live-amt");
  const statusEl = $("scale-status");
  const connect = $("scale-connect");
  const ble = $("scale-ble");
  const on = Boolean(S?.connected?.());
  const kind = S?.connectionKind?.() || "";
  const g = Number(reading?.grams) || 0;
  const live = g > 0 && Date.now() - Number(reading?.at || 0) < 8000;
  const enabled = isScaleEnabled();
  if (dock) {
    dock.hidden = !enabled;
    dock.classList.toggle("is-live", live);
    dock.classList.toggle("is-on", on);
    dock.classList.toggle("is-off", enabled && !on);
  }
  document.body.classList.toggle("weight-scale-mode", enabled);
  if (kgEl) kgEl.textContent = g > 0 ? formatScaleKg(g) : (0).toFixed(scalePrecision());
  if (amtEl) {
    const line = lastWeightLine();
    const item = line ? state.items.find((i) => i.id === line.itemId) : null;
    amtEl.textContent = item && g > 0 ? `${item.name} · ${money(POSUnits.lineAmount(g, rateFor(item), itemUnit(item)))}` : "";
  }
  if (statusEl) {
    if (!enabled) statusEl.textContent = "Weighing scale is off — enable it under Hardware";
    else if (on && live) statusEl.textContent = kind === "bluetooth" ? "Bluetooth · live kg" : "USB scale · live kg";
    else if (on) statusEl.textContent = "Connected — place item on the pan";
    else statusEl.textContent = "Disconnected — USB, Bluetooth, network, or type kg";
  }
  if (connect) {
    connect.hidden = Boolean(S && !S.hasSerial?.() && !on);
    connect.textContent = on && kind !== "bluetooth" ? "Disconnect" : "USB scale";
  }
  if (ble) {
    ble.hidden = Boolean(S && !S.hasBluetooth?.() && kind !== "bluetooth");
    ble.textContent = on && kind === "bluetooth" ? "Disconnect" : "Bluetooth";
  }
  const qty = $("bill-scan-qty");
  if (qty && g > 0 && document.activeElement !== qty) {
    const item = lastWeightLine() ? state.items.find((i) => i.id === lastWeightLine().itemId) : null;
    const unit = item ? itemUnit(item) : "KG";
    qty.value = String(POSUnits.displayQty(g, unit) || g / 1000);
  }
  paintScaleSetupStatus();
}
function applyScaleWeight(lineKey) {
  if (!isScaleEnabled()) {
    setHint("Turn on Weighing Scale under Hardware & devices", "error");
    return false;
  }
  const S = globalThis.POSScale;
  const prefer = scaleSettings().unit;
  const typed = String($("scale-manual")?.value || "").trim();
  if (typed && !canOverrideScaleWeight()) {
    setHint("Manual kg needs a manager login", "error");
    return false;
  }
  const hit = (typed && S?.parseWeight?.(typed, prefer)) || S?.current?.() || null;
  const grams = Number(hit?.grams) || 0;
  if (grams <= 0) {
    setHint("Scale disconnected or no weight. Connect the scale or type kg.", "error");
    $("scale-manual")?.focus();
    return false;
  }
  const line = lineKey ? findCartLine(lineKey) : lastWeightLine();
  const source = typed ? "manual" : "scale";
  if (line) {
    const item = state.items.find((i) => i.id === line.itemId);
    if (!isWeightItem(item)) {
      setHint("Pick a kg / g / litre item, then use the scale", "error");
      return false;
    }
    state._scaleApply = true;
    setLineQty(cartLineKey(line), grams);
    state._scaleApply = false;
    line.scaleGrams = grams;
    line.weightSource = source;
    const amt = POSUnits.lineAmount(grams, rateFor(item), itemUnit(item));
    logScaleWeight({ kind: source, item: item.name, grams, amount: amt });
    setHint(`${item.name} · ${formatScaleKg(grams)} kg · ${money(amt)}`, "ok");
    paintScaleDock(hit);
    if ($("scale-manual")) $("scale-manual").value = "";
    return true;
  }
  if ($("bill-scan-qty")) {
    $("bill-scan-qty").value = String(formatScaleKg(grams));
    setHint(`Scale ${formatScaleKg(grams)} kg — add the item`, "ok");
    paintScaleDock(hit);
    return true;
  }
  setHint("Add a kg item, then tap Use kg", "error");
  return false;
}
function applyTypedScale(raw, sourceEl) {
  const S = globalThis.POSScale;
  if (!S?.looksLikeWeight?.(raw)) return false;
  if (!isScaleEnabled()) return false;
  if (!canOverrideScaleWeight()) {
    setHint("Manual kg needs a manager login", "error");
    return false;
  }
  const hit = S.ingest?.(raw, scaleSettings().unit) || S.parseWeight?.(raw, scaleSettings().unit);
  if (!hit?.grams) return false;
  if (sourceEl) sourceEl.value = "";
  paintScaleDock(hit);
  applyScaleWeight();
  return true;
}
function addWeighableItem(id, qtyGm, barcode) {
  const item = state.items.find((i) => i.id === id);
  const live = isScaleEnabled() && isWeightItem(item) ? Number(globalThis.POSScale?.currentGrams?.() || 0) : 0;
  if (live > 0) {
    const existing = state.cart.find((l) => l.itemId === id && !String(l.barcode || "").trim());
    if (existing && !barcode) {
      state._scaleApply = true;
      setLineQty(cartLineKey(existing), live);
      state._scaleApply = false;
      existing.scaleGrams = live;
      existing.weightSource = "scale";
    } else {
      addItem(id, live, barcode);
      const added = lastWeightLine();
      if (added) {
        added.scaleGrams = live;
        added.weightSource = "scale";
      }
    }
    return;
  }
  return addItem(id, qtyGm, barcode);
}
async function connectWeighingScale(kind) {
  const S = globalThis.POSScale;
  if (!S) return;
  if (S.connected()) {
    await S.disconnect();
    paintScaleDock();
    setHint("Scale disconnected", "ok");
    return;
  }
  const cfg = scaleSettings();
  try {
    if (kind === "network") {
      await S.connectNetwork?.({ url: cfg.host, unit: cfg.unit });
      setHint("Network scale weight received", "ok");
    } else if (kind === "bluetooth") await S.connectBluetooth({ unit: cfg.unit });
    else if (S.hasSerial?.()) await S.connectSerial({ baud: cfg.baud, unit: cfg.unit });
    else if (S.hasBluetooth?.()) await S.connectBluetooth({ unit: cfg.unit });
    else {
    setHint("Type kg, or connect a USB / Bluetooth scale.", "ok");
      $("scale-manual")?.focus();
      paintScaleDock();
      return;
    }
    paintScaleDock();
    if (kind !== "network") setHint("Scale connected. Weigh the item, then tap Use kg.", "ok");
  } catch (err) {
    setHint(err.message || "Could not open the scale", "error");
    paintScaleDock();
  }
}
function paintScaleSetupStatus() {
  const el = $("scale-hw-status");
  if (!el) return;
  const S = globalThis.POSScale;
  const on = Boolean(S?.connected?.());
  const kind = S?.connectionKind?.() || "";
  const cfg = scaleSettings();
  const src = String(cfg.source || "serial");
  const configured =
    src === "wedge" ||
    (src === "network" && String(cfg.host || "").trim()) ||
    (src === "serial" && (String(cfg.port || "").trim() || on)) ||
    src === "bluetooth";
  let label = "● Disabled";
  let cls = "is-off";
  if (!isScaleEnabled()) {
    label = "● Disabled";
  } else if (!configured) {
    label = "● Not Configured";
  } else if (on) {
    label = `● Connected${kind ? ` · ${kind}` : ""}`;
    cls = "is-on";
  } else {
    label = "● Disconnected";
  }
  el.className = `scale-hw-status ${cls}`;
  el.textContent = label;
}
function paintScaleLog() {
  const el = $("scale-log");
  if (!el) return;
  const rows = globalThis.POSScale?.loadLog?.(scaleBizKey()) || [];
  if (!rows.length) {
    el.innerHTML = `<p class="hint">No weighings yet on this till.</p>`;
    return;
  }
  el.innerHTML = `<table><thead><tr><th>When</th><th>Item</th><th>Weight</th><th>How</th></tr></thead><tbody>${rows
    .slice(0, 16)
    .map((r) => {
      const when = String(r.at || "").replace("T", " ").slice(0, 19);
      const g = Number(r.grams || r.to_g) || 0;
      return `<tr><td>${escapeHtml(when)}</td><td>${escapeHtml(r.item || "—")}</td><td>${g ? `${formatScaleKg(g)} kg` : "—"}</td><td>${escapeHtml(r.kind || "")}</td></tr>`;
    })
    .join("")}</tbody></table>`;
}
function paintScaleSetup() {
  const cfg = scaleSettings();
  if ($("scale-enabled")) $("scale-enabled").checked = isScaleEnabled();
  if ($("scale-name")) $("scale-name").value = cfg.name || "Weighing scale";
  if ($("scale-source")) $("scale-source").value = cfg.source || "serial";
  if ($("scale-baud")) $("scale-baud").value = String(cfg.baud || 9600);
  if ($("scale-port")) $("scale-port").value = cfg.port || "";
  if ($("scale-host")) $("scale-host").value = cfg.host || "";
  if ($("scale-unit")) $("scale-unit").value = cfg.unit === "g" ? "g" : "kg";
  if ($("scale-precision")) $("scale-precision").value = String(scalePrecision());
  if ($("scale-auto")) $("scale-auto").checked = cfg.autoApply !== false;
  if ($("scale-allow-manual")) $("scale-allow-manual").checked = cfg.allowManual !== false;
  paintScaleSetupStatus();
  paintScaleLog();
}
function saveScaleSetup() {
  const wantOn = Boolean($("scale-enabled")?.checked);
  if (wantOn && !canActivateScale()) {
    if ($("scale-enabled")) $("scale-enabled").checked = false;
    if ($("scale-setup-hint")) {
      $("scale-setup-hint").textContent = "Test the connection before activating the weighing scale.";
      $("scale-setup-hint").className = "hint error";
    }
    return;
  }
  globalThis.POSScale?.saveSettings?.(scaleBizKey(), {
    enabled: wantOn,
    name: String($("scale-name")?.value || "Weighing scale").trim() || "Weighing scale",
    source: String($("scale-source")?.value || "serial"),
    baud: Number($("scale-baud")?.value) || 9600,
    port: String($("scale-port")?.value || "").trim(),
    host: String($("scale-host")?.value || "").trim(),
    unit: $("scale-unit")?.value === "g" ? "g" : "kg",
    precision: Number($("scale-precision")?.value) || 3,
    autoApply: Boolean($("scale-auto")?.checked),
    allowManual: Boolean($("scale-allow-manual")?.checked),
  });
  if (state.company) state.company.scale_enabled = wantOn ? 1 : 0;
  void saveHardwareFlags({ scale_enabled: wantOn ? 1 : 0 }).catch((err) => {
    if ($("scale-setup-hint")) {
      $("scale-setup-hint").textContent = err.message;
      $("scale-setup-hint").className = "hint error";
    }
  });
  paintScaleDock();
  paintScaleSetup();
  if ($("scale-setup-hint")) {
    $("scale-setup-hint").textContent = wantOn
      ? "Saved. The scale stays off on other tills until each one tests and connects."
      : "Weighing scale is off for this shop. Counter will hide the kg dock.";
    $("scale-setup-hint").className = "hint ok";
  }
}
function canActivateScale() {
  const S = globalThis.POSScale;
  const src = String($("scale-source")?.value || scaleSettings().source || "serial");
  if (src === "wedge") return true;
  if (S?.connected?.()) return true;
  if (src === "network" && String($("scale-host")?.value || "").trim()) return Boolean(state.scaleTested);
  return Boolean(state.scaleTested);
}
function initWeighingScale() {
  const S = globalThis.POSScale;
  if (!S) return;
  paintScaleSetup();
  paintScaleDock();
  let applyT = 0;
  S.onWeight?.((hit) => {
    paintScaleDock(hit);
    if (!isScaleEnabled() || scaleSettings().autoApply === false || !(Number(hit?.grams) > 0) || !lastWeightLine()) return;
    clearTimeout(applyT);
    applyT = setTimeout(() => applyScaleWeight(), 180);
  });
  $("scale-connect")?.addEventListener("click", () => void connectWeighingScale("serial"));
  $("scale-ble")?.addEventListener("click", () => void connectWeighingScale("bluetooth"));
  $("scale-capture")?.addEventListener("click", () => applyScaleWeight());
  $("classic-scale-capture")?.addEventListener("click", () => applyScaleWeight());
  $("scale-manual")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyTypedScale($("scale-manual").value, $("scale-manual"));
    }
  });
  $("scale-save")?.addEventListener("click", () => saveScaleSetup());
  $("scale-test")?.addEventListener("click", () => void testWeighingScale());
  $("scale-reconnect")?.addEventListener("click", () => void reconnectWeighingScale());
  ["scale-enabled", "scale-name", "scale-source", "scale-baud", "scale-port", "scale-host", "scale-unit", "scale-precision", "scale-auto", "scale-allow-manual"].forEach((id) => {
    $(id)?.addEventListener("change", saveScaleSetup);
  });
  document.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.target.isContentEditable)) return;
    if (!document.body.classList.contains("counter-mode") || !isScaleEnabled()) return;
    S.ingestWedgeKey?.(e, scaleSettings().unit);
  });
}
async function testWeighingScale() {
  saveScaleSetup();
  const S = globalThis.POSScale;
  const cfg = scaleSettings();
  const hint = $("scale-setup-hint");
  try {
    if (cfg.source === "network") await S.connectNetwork?.({ url: cfg.host, unit: cfg.unit });
    else if (!S.connected()) {
      if (cfg.source === "bluetooth") await S.connectBluetooth({ unit: cfg.unit });
      else if (S.hasSerial?.()) await S.connectSerial({ baud: cfg.baud, unit: cfg.unit });
      else throw new Error("Connect USB or Bluetooth, or set a network URL");
    }
    const hit = S.current?.();
    const g = Number(hit?.grams) || 0;
    state.scaleTested = true;
    if (hint) {
      hint.textContent = g > 0 ? `Test ok — ${formatScaleKg(g)} kg` : "Connected. Place an item on the pan.";
      hint.className = "hint ok";
    }
    paintScaleDock(hit);
  } catch (err) {
    if (hint) {
      hint.textContent = err.message || "Scale test failed";
      hint.className = "hint error";
    }
    paintScaleDock();
  }
}
async function reconnectWeighingScale() {
  if (!isScaleEnabled()) {
    if ($("scale-setup-hint")) {
      $("scale-setup-hint").textContent = "Enable the weighing scale before reconnecting.";
      $("scale-setup-hint").className = "hint error";
    }
    return;
  }
  const S = globalThis.POSScale;
  if (S?.connected?.()) await S.disconnect();
  const src = scaleSettings().source || "serial";
  await connectWeighingScale(src === "bluetooth" ? "bluetooth" : src === "network" ? "network" : "serial");
}
initWeighingScale();
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
  if ($("pay-amount")) delete $("pay-amount").dataset.dirty;
  syncPayAmountDefault();
  paintCounterDue();
});
$("pay-amount")?.addEventListener("input", () => {
  if ($("pay-amount")) $("pay-amount").dataset.dirty = "1";
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
  state.extraCharges = 0;
  state.loyaltyRedeem = 0;
  state.offerAuto = true;
  state.offerBillLocked = false;
  resetOfferPopup();
  if ($("bill-disc-value")) $("bill-disc-value").value = 0;
  if ($("print-extra-charges")) $("print-extra-charges").value = 0;
  if ($("loyalty-redeem")) $("loyalty-redeem").value = 0;
  $("pack-choice").value = "";
  if ($("pay-amount")) {
    delete $("pay-amount").dataset.dirty;
    $("pay-amount").value = "";
  }
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

let payingBill = false;
let payIdempotencyKey = "";
$("btn-pay").addEventListener("click", async () => {
  if (payingBill) return;
  payingBill = true;
  const payBtn = $("btn-pay");
  if (payBtn) payBtn.disabled = true;
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
    const printMissing = state.cart.find((l) => {
      const item = state.items.find((i) => i.id === l.itemId);
      return isPrintAreaItem(item) && !(Number(l.printWidth) > 0 && Number(l.printHeight) > 0 && Number(l.qtyGm) > 0);
    });
    if (printMissing) throw new Error("Enter width and height for each print item");
    if (isApparelShop()) {
      await refreshCatalogStock();
      clampCartToAvailableStock();
      renderCart();
    }
    assertCartWithinStock();
    setHint("Saving…");
    const Pay = globalThis.POSPayIntegrity;
    if (!payIdempotencyKey) payIdempotencyKey = Pay?.newKey?.() || `pay-${Date.now()}`;
    const cartSnapshot = state.cart.map((l) => ({ ...l }));
    const amountPaid = checkoutAmountPaid();
    const payload = {
      customerId: state.customerId,
      paymentMethod: $("pay-method").value,
      packId: state.lastPack?.id || null,
      packCount: state.lastPack?.count || null,
      discountType: state.billDiscountType || "amt",
      discountValue: state.billDiscountValue,
      discount: cartTotals().discount,
      loyaltyPoints: state.loyaltyRedeem,
      offerIds: (state.appliedOffers?.applied || []).map((o) => o.id).filter(Boolean),
      offerLoyaltyMultiplier: state.appliedOffers?.loyaltyMultiplier || 1,
      qrOrderId: (() => {
        const id = state.activeQrOrderId || "";
        if (!id) return undefined;
        const qr = (qrOrderCache || []).find((row) => row.id === id);
        if (qr?.sales_order_id) return undefined;
        if (qr && ["cancelled", "rejected"].includes(String(qr.status || "").toLowerCase())) return undefined;
        return id;
      })(),
      table_no: isRestaurantShop() ? (state.activeTable || undefined) : undefined,
      amountPaid,
      idempotencyKey: payIdempotencyKey,
      customer_name: isClassicBillShop() ? pharmacyBillCustomerName() : undefined,
      customer_mobile: isClassicBillShop() ? pharmacyBillCustomerMobile() : undefined,
      customer_address: isClassicBillShop() ? pharmacyBillCustomerAddress() : undefined,
      doctor_rx: isPharmacyShop() ? pharmacyBillDoctorRx() : undefined,
      extraCharges: isPrintShop() ? Number(state.extraCharges) || 0 : 0,
      lines: state.cart.map((l) => {
        const item = state.items.find((i) => i.id === l.itemId);
        const print = isPrintAreaItem(item);
        return {
          itemId: l.itemId,
          quantity_gm: l.qtyGm,
          discountType: l.discountType || "amt",
          discountValue: l.discountValue || 0,
          barcode: l.barcode || "",
          notes: print ? (String(l.notes || "").trim() || printLineCaptionText(item, l) || scaleLineNote(l)) : scaleLineNote(l),
          scale_grams: Number(l.scaleGrams) || undefined,
          weight_source: l.weightSource || undefined,
          rate: canChangeRate() && l.rate != null && l.rate !== "" ? parseCartLineRate(l.rate) : undefined,
          print_width: print ? Number(l.printWidth) || 0 : undefined,
          print_height: print ? Number(l.printHeight) || 0 : undefined,
          print_dim_unit: print ? (l.printDimUnit || "") : undefined,
          print_copies: print ? Math.max(1, Number(l.printCopies) || 1) : undefined,
          print_file_id: print ? (l.printFileId || "") : undefined,
          print_file_name: print ? (l.printFileName || "") : undefined,
          print_area: print ? Number(l.qtyGm) || 0 : undefined,
          print_custom_unit: print ? (item.custom_unit || l.printCustomUnit || "") : undefined,
        };
      }),
    };
    let result;
    if (state.openTableOrderId && !state.editingOrderId) {
      result = await api(`/api/orders/${encodeURIComponent(state.openTableOrderId)}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: amountPaid,
          payment_method: payload.paymentMethod,
          idempotencyKey: payIdempotencyKey,
        }),
      });
    } else if (state.editingOrderId) {
      result = await api(`/api/orders/${state.editingOrderId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      result = await api("/api/checkout", { method: "POST", body: JSON.stringify(payload) });
    }
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
          const batch = String(preview.batchNo || item?.batch_no || "").trim();
          const expRaw = String(item?.primary_expiry || item?.default_expiry || "").slice(0, 10);
          const expiry =
            expRaw && !expRaw.startsWith("0000-00-00") && Number(expRaw.slice(0, 4)) >= 1990 ? expRaw : "";
          const pack = isPharmacyShop() ? String(preview.pack || medicinePackLabel(item) || "").trim() : "";
          return {
            item_id: l.itemId,
            item_name: itemBillName(item),
            quantity_gm: l.qtyGm,
            unit: item ? itemUnit(item) : "PCS",
            rate_per_kg: item ? rateFor(item, l) : 0,
            amount: calc ? calc.taxable : (item ? lineAmt(item, l.qtyGm, l) : 0),
            notes: l.notes || "",
            print_width: l.printWidth,
            print_height: l.printHeight,
            print_dim_unit: l.printDimUnit,
            print_copies: l.printCopies,
            print_file_name: l.printFileName,
            gst_amount: calc ? calc.gst : 0,
            gst_rate: item?.gst_rate || 0,
            mrp: item ? Number(globalThis.POSFootwear?.looseMrp?.(item) ?? item.mrp ?? item.retail_rate) || 0 : 0,
            batch_no: batch && batch !== "—" ? batch : "",
            expiry_date: expiry,
            pack_label: pack && pack !== "—" ? pack : "",
          };
        }),
      };
    }
    if (tableNo && !receiptOrder.table_no) receiptOrder.table_no = tableNo;
    const src = result?.order || result || {};
    receiptOrder = {
      ...receiptOrder,
      previous_due: src.previous_due ?? receiptOrder.previous_due,
      amount_paid: src.amount_paid ?? receiptOrder.amount_paid,
      current_due: src.current_due ?? receiptOrder.current_due,
      payment_reference: src.payment_reference ?? receiptOrder.payment_reference,
      payment_date: src.payment_date ?? receiptOrder.payment_date,
      payment_status: src.payment_status || receiptOrder.payment_status,
      receipt: src.receipt || receiptOrder.receipt,
      payments: src.payments || receiptOrder.payments,
    };
    showOrder(receiptOrder);
    const remaining = Number(receiptOrder.current_due ?? src.remaining ?? 0);
    const keepTable =
      isRestaurantShop() &&
      tableNo &&
      (globalThis.POSPayIntegrity?.keepTableAfterPayment?.(receiptOrder.payment_status, remaining) ??
        String(receiptOrder.payment_status || "").toLowerCase() === "partial");
    showInvoicePrintModal(receiptOrder, {
      title: `Invoice ${orderLabel(order, result)}`,
      message: keepTable
        ? `Partial payment saved. Outstanding ${money(remaining)}.`
        : "Bill saved. POS cleared for the next customer.",
    });
    payIdempotencyKey = "";
    if (keepTable) {
      state.openTableOrderId = receiptOrder.id || src.id || state.openTableOrderId;
      if ($("pay-amount")) {
        $("pay-amount").value = "";
        delete $("pay-amount").dataset.dirty;
      }
      saveTableHoldDebounced.cancel?.();
      await saveActiveTableHold().catch(() => {});
      setHint(`Partial payment saved. Outstanding ${money(remaining)}`, "ok");
    } else {
      clearCounterAfterSale(order, result);
    }
    showView("counter");
    try {
      await Promise.all([loadBootstrap(), loadToday()]);
    } catch {
      /* order is already saved; keep the success message and cleared cart */
    }
    if (!keepTable) resetClassicCustomerRecord();
    renderCart();
    renderTableBoard();
  } catch (err) {
    setHint(userHintMessage(err), "error");
  } finally {
    payingBill = false;
    if (payBtn) payBtn.disabled = false;
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
    if (row) showVoucherResult(row);
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
  if (kotAckIds) kotAckIds.add(id);
  card.classList.remove("is-flash");
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
$("kot-test-sound")?.addEventListener("click", () => {
  const ok = armQrOrderSound();
  setHint(ok ? "Test kitchen sound played." : "Tap Test Kitchen Sound again with the speaker on.", ok ? "ok" : "error");
});
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
$("item-save-toast-dismiss")?.addEventListener("click", hideItemSaveToast);
$("agg-sound-toggle")?.addEventListener("click", () => {
  const on = globalThis.POSQrNotify?.soundOn?.() !== false;
  if (!on) {
    const ok = globalThis.POSQrNotify?.setSoundOn?.(true);
    globalThis.POSQrNotify?.playTone?.({ force: true });
    paintAggregatorSoundToggle();
    setHint(ok === false ? "Tap Sound on again if you did not hear a ding." : "Online order sound on.", "ok");
    return;
  }
  globalThis.POSQrNotify?.setSoundOn?.(false);
  paintAggregatorSoundToggle();
  setHint("Online order sound off.", "ok");
});
$("agg-order-search")?.addEventListener("input", renderAggregatorOrders);
$("agg-toast-open")?.addEventListener("click", () => {
  hideAggregatorToast();
  showView("online-orders");
});
$("agg-toast-dismiss")?.addEventListener("click", hideAggregatorToast);
$("agg-copy-zomato")?.addEventListener("click", async () => {
  const text = $("agg-zomato-hook")?.textContent || "";
  try { await navigator.clipboard.writeText(text); setHint("Zomato webhook copied", "ok"); } catch { setHint(text, "ok"); }
});
$("agg-copy-swiggy")?.addEventListener("click", async () => {
  const text = $("agg-swiggy-hook")?.textContent || "";
  try { await navigator.clipboard.writeText(text); setHint("Swiggy webhook copied", "ok"); } catch { setHint(text, "ok"); }
});
$("agg-settings-save")?.addEventListener("click", async () => {
  const hint = $("agg-settings-hint");
  try {
    if (hint) {
      hint.textContent = "Saving…";
      hint.className = "hint";
    }
    await saveAggregatorSettings();
  } catch (err) {
    if (hint) {
      hint.textContent = err.message;
      hint.className = "hint error";
    } else setHint(err.message, "error");
  }
});
$("agg-refresh")?.addEventListener("click", () => void loadAggregatorOrders());
$("agg-sandbox-zomato")?.addEventListener("click", () => void sandboxAggregatorOrder("zomato").catch((err) => setHint(err.message, "error")));
$("agg-sandbox-swiggy")?.addEventListener("click", () => void sandboxAggregatorOrder("swiggy").catch((err) => setHint(err.message, "error")));
$("agg-source-tabs")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-agg-source]");
  if (!button) return;
  aggSourceFilter = button.dataset.aggSource || "";
  $("agg-source-tabs").querySelectorAll("[data-agg-source]").forEach((row) => row.classList.toggle("active", row === button));
  renderAggregatorOrders();
});
$("agg-status-tabs")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-agg-status]");
  if (!button) return;
  aggStatusFilter = button.dataset.aggStatus || "";
  $("agg-status-tabs").querySelectorAll("[data-agg-status]").forEach((row) => row.classList.toggle("active", row === button));
  renderAggregatorOrders();
});
$("agg-order-list")?.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-agg-order]");
  const order = aggOrderCache.find((row) => row.id === card?.dataset.aggOrder);
  if (!order) return;
  try {
    const next = event.target.closest("[data-agg-status-next]");
    if (next) await updateAggregatorOrder(order, next.dataset.aggStatusNext);
    else if (event.target.closest("[data-agg-kot]")) await sendAggregatorKot(order);
    else if (event.target.closest("[data-agg-counter]")) await openAggregatorInCounter(order);
  } catch (err) {
    setHint(err.message, "error");
  }
});
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
    else if (kotBtn) await sendQrKitchenKot(order);
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
let itemFormBusy = false;
$("item-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (itemFormBusy) return;
  itemFormBusy = true;
  const saveBtn = $("item-save");
  if (saveBtn) saveBtn.disabled = true;
  if ($("item-hint")) {
    $("item-hint").textContent = "Saving…";
    $("item-hint").className = "hint";
  }
  const unit = POSUnits.normalize($("item-unit").value);
  const body = {
    name: $("item-name").value,
    local_name: $("item-local-name")?.value || "",
    hsn: $("item-hsn").value,
    category: $("item-category").value || defaultItemCategory(),
    subcategory: $("item-subcategory").value,
    brand: $("item-brand")?.value || "",
    brand_id: $("item-brand-id")?.value || "",
    color: $("item-color")?.value || "",
    size: $("item-size")?.value || "",
    wearer_type: $("item-wearer")?.value || "",
    base_unit: unit,
    unit,
    retail_rate: POSUnits.roundRate8?.($("item-retail").value) ?? $("item-retail").value,
    b2b_rate: POSUnits.roundRate8?.($("item-b2b").value) ?? $("item-b2b").value,
    purchase_rate: POSUnits.roundRate8?.($("item-purchase").value) ?? $("item-purchase").value,
    gst_rate: $("item-gst").value,
    min_billing_qty: Number($("item-min-billing")?.value) || 0,
    custom_unit: String($("item-custom-unit")?.value || "").trim(),
    mrp: POSUnits.roundRate8?.($("item-mrp")?.value) ?? ($("item-mrp")?.value || ""),
    barcode_qty: POSUnits.isCount(unit) ? Number($("item-barcode-qty")?.value) || 0 : 0,
    barcode: globalThis.POSBarcode?.cleanCode ? POSBarcode.cleanCode($("item-own-barcode")?.value) : String($("item-own-barcode")?.value || "").trim(),
    stock_gm: POSUnits.toBase($("item-stock").value, unit),
    status: itemStatusOf($("item-status")?.value),
    image_url: state.itemImage || "",
  };
  if (isApparelShop()) {
    readGarmentVariantCells();
    const rows = garmentCounterApi()?.rowsFromDraft?.(state.garmentVariants) || [];
    if (rows.length) {
      try {
        body.variants = garmentCounterApi().normalizeVariants(rows);
        body.barcode = "";
        body.color = body.variants[0].color || "";
        body.size = body.variants.length === 1 ? body.variants[0].size : "";
      } catch (err) {
        $("item-hint").textContent = err.message;
        $("item-hint").className = "hint error";
        itemFormBusy = false;
        if (saveBtn) saveBtn.disabled = false;
        return;
      }
    }
  }
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
    let savedId = $("item-id").value;
    const wasNew = !savedId;
    const itemName = String(body.name || "").trim();
    let createdCount = 1;
    if (savedId) {
      await api(`/api/items/${savedId}`, { method: "PUT", body: JSON.stringify(body) });
    } else {
      const res = await api("/api/items", { method: "POST", body: JSON.stringify(body) });
      createdCount = res?.created_count || (res?.items ? res.items.length : 1);
      savedId = res?.item?.id || res?.items?.[0]?.id || "";
    }
    if (isServicesShop() && savedId) {
      await api(`/api/salon/services/${savedId}`, {
        method: "POST",
        body: JSON.stringify({
          duration_min: Number($("item-duration")?.value) || 30,
          discount_pct: Number($("item-svc-disc")?.value) || 0,
          gender: $("item-gender")?.value || "unisex",
          online_booking: $("item-online")?.checked !== false,
          staff_ids: $("item-staff")?.value ? [$("item-staff").value] : [],
          branch_id: $("item-branch")?.value || "",
        }),
      });
    }
    resetItemForm();
    await loadBootstrap();
    const msg = wasNew
      ? (createdCount > 1 ? `Item created successfully · ${createdCount} sizes` : "Item created successfully")
      : "Item saved successfully";
    if ($("item-hint")) {
      $("item-hint").textContent = msg;
      $("item-hint").className = "hint ok";
    }
    showItemSaveToast(wasNew ? "Item created successfully" : "Item saved successfully", itemName);
  } catch (err) {
    $("item-hint").textContent = err.message;
    $("item-hint").className = "hint error";
  } finally {
    itemFormBusy = false;
    if (saveBtn) saveBtn.disabled = false;
  }
});
$("item-cancel").addEventListener("click", () => {
  resetItemForm();
});
$("item-unit")?.addEventListener("change", refreshItemUnitLabels);
$("item-custom-unit")?.addEventListener("input", refreshItemUnitLabels);
$("item-print-uom")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-print-uom]");
  if (btn) applyPrintUom(btn.dataset.printUom);
});
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
  fillSalonServiceSelects();
  if (isServicesShop() && i.id) {
    api(`/api/salon/services/${i.id}`)
      .then((m) => {
        if ($("item-duration")) $("item-duration").value = m.duration_min || 30;
        if ($("item-svc-disc")) $("item-svc-disc").value = m.discount_pct || 0;
        if ($("item-gender")) $("item-gender").value = m.gender || "unisex";
        if ($("item-online")) $("item-online").checked = Number(m.online_booking) !== 0;
        if ($("item-staff") && m.staff_ids) {
          try {
            const ids = JSON.parse(m.staff_ids);
            if (Array.isArray(ids) && ids[0]) $("item-staff").value = ids[0];
          } catch {
            $("item-staff").value = m.staff_ids;
          }
        }
        if ($("item-branch")) $("item-branch").value = m.branch_id || "";
      })
      .catch(() => {});
  }
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
  const editing = Boolean($("cust-id")?.value);
  try {
    globalThis.POSCustomerMasterUi?.paintEmailField?.($("cust-email"));
    await saveCustomer({
      id: $("cust-id")?.value || "",
      name: $("cust-name").value,
      business_name: $("cust-biz").value,
      mobile: $("cust-mobile").value,
      email: $("cust-email")?.value || "",
      type: $("cust-type").value,
      gstin: $("cust-gstin").value,
      state: $("cust-state")?.value || "",
      dob: $("cust-dob")?.value || "",
      referred_by: $("cust-ref")?.value || "",
      locale: $("cust-locale")?.value || "",
      address: $("cust-address")?.value || "",
      doctor_rx: $("cust-doctor-rx")?.value || "",
      reuseExisting: false,
    });
    $("cust-hint").textContent = editing ? "Customer updated" : "Saved";
    $("cust-hint").className = "hint ok";
    resetCustomerForm();
    paintCustomerDetails(null);
  } catch (err) {
    $("cust-hint").textContent = err.message;
    $("cust-hint").className = "hint error";
  }
});
$("cust-clear")?.addEventListener("click", () => {
  resetCustomerForm();
  if ($("cust-hint")) {
    $("cust-hint").textContent = "";
    $("cust-hint").className = "hint";
  }
});

$("due-customer")?.addEventListener("change", () => {
  const c = (state.customers || []).find((row) => row.id === $("due-customer").value);
  paintDueOutstanding();
  if (c) $("due-amount").value = String(customerDue(c));
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

function onCustomerRowClick(e) {
  const details = e.target.closest("[data-cust-details]");
  const edit = e.target.closest("[data-cust-edit]");
  const collect = e.target.closest("[data-collect-due]");
  const id = details?.dataset.custDetails || edit?.dataset.custEdit || collect?.dataset.collectDue;
  if (!id) return;
  const c = (state.customers || []).find((row) => row.id === id);
  if (!c) return;
  if (details) {
    paintCustomerDetails(c);
    $("customer-details")?.scrollIntoView({ block: "nearest" });
    return;
  }
  if (edit) {
    fillCustomerForm(c);
    $("customer-form")?.scrollIntoView({ block: "nearest" });
    $("cust-name")?.focus();
    return;
  }
  fillDueCustomerSelect(c.id);
  $("due-amount").value = String(customerDue(c));
  paintDueOutstanding();
  $("due-collect-form")?.scrollIntoView({ block: "nearest" });
  $("due-amount")?.focus();
}
$("customers-table")?.addEventListener("click", onCustomerRowClick);
$("customer-details")?.addEventListener("click", onCustomerRowClick);
$("customers-search")?.addEventListener("input", () => renderCustomersTable());

$("quick-customer-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const hint = $("qc-hint");
  try {
    globalThis.POSCustomerMasterUi?.paintEmailField?.($("qc-email"));
    const customer = await saveCustomer({
      name: $("qc-name").value,
      mobile: $("qc-mobile").value,
      email: $("qc-email")?.value || "",
      address: $("qc-address")?.value || "",
      doctor_rx: $("qc-doctor-rx")?.value || "",
    });
    $("qc-name").value = "";
    $("qc-mobile").value = "";
    if ($("qc-email")) {
      $("qc-email").value = "";
      $("qc-email").setCustomValidity("");
    }
    if ($("qc-email-hint")) {
      $("qc-email-hint").textContent = "";
      $("qc-email-hint").className = "hint";
    }
    if ($("qc-address")) $("qc-address").value = "";
    if ($("qc-doctor-rx")) $("qc-doctor-rx").value = "";
    if (hint) {
      hint.textContent = customer?._duplicate
        ? `Using existing ${customer.name || "customer"}`
        : `Added ${customer?.name || "customer"}`;
      hint.className = "hint ok";
    }
    setHint(
      customer?._duplicate
        ? `Using existing ${customer.name || ""}`
        : `Customer added · ${customer?.name || ""}`,
      "ok",
    );
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
    if (fastModeOn()) renderPoLines();
    else filterPoLines();
    return;
  }
  if (e.target.matches("[data-po-size-qty],[data-po-extra-qty],[data-po-extra-name],[data-po-rate],[data-po-qty],[data-po-barcodes],[data-po-size-barcodes]")) {
    const card = e.target.closest("[data-po-product-row]");
    if (card) {
      paintPoLineAmount(card.dataset.poProductRow);
      paintPoTotals();
      return;
    }
    const id = e.target.dataset.poQty || e.target.dataset.poRate || e.target.dataset.poBarcodes;
    if (id && (e.target.dataset.poQty || e.target.dataset.poRate)) paintPoLineAmount(id);
    paintPoTotals();
  }
});
$("po-lines")?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const classic = e.target.closest("[data-po-bc-scan]");
  const sizeScan = e.target.closest("[data-po-size-bc-scan]");
  const apparel = e.target.closest("[data-po-product-bc-scan]");
  if (!classic && !sizeScan && !apparel) return;
  e.preventDefault();
  const card = (sizeScan || apparel)?.closest("[data-po-product-row]");
  const source = classic
    ? { kind: "classic", id: classic.dataset.poBcScan }
    : sizeScan
      ? { kind: "apparel", id: card?.dataset.poProductRow, card, size: sizeScan.dataset.poSizeBcScan }
      : { kind: "apparel", id: apparel.dataset.poProductBcScan, card };
  void applyPurchaseBarcodeScan(classic?.value || sizeScan?.value || apparel?.value, source);
});
$("purchase-form").addEventListener("change", (e) => {
  if (e.target.matches("[data-po-item],[data-po-product],[data-po-gen-bc]")) paintPoTotals();
});
$("po-lines")?.addEventListener("click", (e) => {
  const addColor = e.target.closest("[data-po-add-color]");
  if (addColor) {
    const card = addColor.closest("[data-po-product-row]");
    const input = card?.querySelector("[data-po-custom-color]");
    const G = globalThis.POSGarmentPurchase;
    const color = G?.normalizeColor?.(input?.value) || String(input?.value || "").trim();
    if (!card || !color) return;
    const exists = [...card.querySelectorAll("[data-po-color-block]")].some((row) => G?.colorsEqual?.(row.dataset.poColorBlock, color) || row.dataset.poColorBlock === color);
    if (exists) {
      if (input) input.value = "";
      return;
    }
    const sizes = String(card.dataset.poSizes || "").split(/\s+/).filter(Boolean);
    const host = card.querySelector("[data-po-color-blocks]");
    const sample = host?.querySelector("[data-po-color-block]");
    const extraCount = sample ? sample.querySelectorAll("[data-po-extra-size]").length : 0;
    host?.insertAdjacentHTML("beforeend", apparelPoColorBlockHtml(color, sizes, []));
    const block = host?.lastElementChild;
    for (let i = 0; i < extraCount; i += 1) {
      block?.querySelector(".po-size-matrix")?.insertAdjacentHTML("beforeend", extraSizeCellHtml(color));
    }
    if (input) input.value = "";
    return;
  }
  const addSize = e.target.closest("[data-po-add-size]");
  if (addSize) {
    const card = addSize.closest("[data-po-product-row]");
    const blocks = [...(card?.querySelectorAll("[data-po-color-block]") || [])];
    blocks.forEach((block) => {
      block.querySelector(".po-size-matrix")?.insertAdjacentHTML("beforeend", extraSizeCellHtml(block.dataset.poColorBlock || ""));
    });
    blocks[0]?.querySelector("[data-po-extra-size]:last-child [data-po-extra-name]")?.focus();
    return;
  }
  const product = e.target.closest("[data-po-product-row]");
  if (product && !e.target.closest("input, textarea, button, label, select, .po-size-bc, .po-bc-panel")) {
    const box = product.querySelector("[data-po-product]");
    if (box) {
      box.checked = !box.checked;
      paintPoTotals();
    }
    return;
  }
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
    if (isApparelShop() && document.querySelector("[data-po-product-row]")) {
      lines.push(...collectApparelPoLines());
    } else for (const box of document.querySelectorAll("[data-po-item]:checked")) {
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
        rate_per_kg: POSUnits.roundRate8?.(document.querySelector(`[data-po-rate="${box.dataset.poItem}"]`)?.value) ?? Number(document.querySelector(`[data-po-rate="${box.dataset.poItem}"]`)?.value),
        expiry_date: document.querySelector(`[data-po-expiry="${box.dataset.poItem}"]`)?.value || "",
        barcodes,
      });
    }
    if (!lines.length) {
      throw new Error(isApparelShop() ? "Select a garment and enter size-wise quantity" : "Select at least one item");
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
    renderPoLines();
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

document.querySelector(".settings-hub-nav")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-settings-tab]");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  showSettingsTab(btn.dataset.settingsTab);
});
$("settings-form")?.addEventListener("input", markSettingsDirty);
$("settings-form")?.addEventListener("change", markSettingsDirty);
$("settings-cancel")?.addEventListener("click", () => {
  renderSettings();
  $("settings-hint").textContent = "Changes discarded.";
  $("settings-hint").className = "hint";
});
document.querySelectorAll("[data-secret-toggle]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = $(btn.dataset.secretToggle);
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "Hide" : "Show";
    btn.setAttribute("aria-label", show ? "Hide secret" : "Show secret");
  });
});
window.addEventListener("beforeunload", (e) => {
  if (!state.settingsDirty) return;
  e.preventDefault();
  e.returnValue = "";
});
["table-shift-search", "table-shift-from", "table-shift-to"].forEach((id) => {
  $(id)?.addEventListener("input", () => {
    state.tableShiftPage = 1;
    paintTableShiftHistory();
  });
  $(id)?.addEventListener("change", () => {
    state.tableShiftPage = 1;
    paintTableShiftHistory();
  });
});
$("table-shift-prev")?.addEventListener("click", () => {
  state.tableShiftPage = Math.max(1, (Number(state.tableShiftPage) || 1) - 1);
  paintTableShiftHistory();
});
$("table-shift-next")?.addEventListener("click", () => {
  state.tableShiftPage = (Number(state.tableShiftPage) || 1) + 1;
  paintTableShiftHistory();
});
$("hardware-extras-save")?.addEventListener("click", async () => {
  const hint = $("hardware-extras-hint");
  try {
    await saveHardwareFlags();
    if ($("camera-scanner-status")) $("camera-scanner-status").textContent = `Camera scanner: ${cameraScannerEnabled() ? "Enabled" : "Disabled"}`;
    if ($("receipt-printer-status")) $("receipt-printer-status").textContent = `Receipt printer: ${receiptPrinterEnabled() ? "Enabled" : "Disabled"}`;
    if ($("cash-drawer-status")) $("cash-drawer-status").textContent = `Cash drawer: ${cashDrawerEnabled() ? "Enabled" : "Disabled"}`;
    if (hint) {
      hint.textContent = "Saved. Disabled devices stay off after login and restart.";
      hint.className = "hint ok";
    }
  } catch (err) {
    if (hint) {
      hint.textContent = err.message;
      hint.className = "hint error";
    }
  }
});
async function copySettingText(id, label) {
  const text = $(id)?.textContent || "";
  try {
    await copyText(text);
    setHint(`${label} copied`, "ok");
  } catch {
    setHint(text, "ok");
  }
}
$("set-copy-zomato-hook")?.addEventListener("click", () => void copySettingText("set-zomato-hook", "Zomato webhook"));
$("set-copy-swiggy-hook")?.addEventListener("click", () => void copySettingText("set-swiggy-hook", "Swiggy webhook"));

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
    if (!validGstin(payload.gstin)) throw new Error("Enter a valid 15-character GSTIN or leave it blank.");
    const upi = String(payload.payment_upi || "").trim();
    if (upi && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upi)) throw new Error("Enter a valid UPI ID such as shop@upi.");
    if (isRestaurantShop() && $("set-table-shifting")) {
      payload.table_shifting_enabled = $("set-table-shifting").checked ? 1 : 0;
    }
    payload.camera_scanner_enabled = $("set-camera-scanner")?.checked ? 1 : 0;
    payload.receipt_printer_enabled = $("set-receipt-printer")?.checked ? 1 : 0;
    payload.cash_drawer_enabled = $("set-cash-drawer")?.checked ? 1 : 0;
    if ($("set-quick-add-hide") || $("set-quick-add-show")) {
      payload.quick_add_enabled = $("set-quick-add-hide")?.checked ? 0 : 1;
    }
    if ($("set-fast-mode-off") || $("set-fast-mode-on")) {
      payload.fast_mode_enabled = $("set-fast-mode-off")?.checked ? 0 : 1;
    }
    if ($("set-low-stock-threshold")) {
      payload.low_stock_threshold = lowStockThreshold({ low_stock_threshold: $("set-low-stock-threshold").value });
    }
    if (state.logoDraft !== null) payload.logo_url = state.logoDraft;
    if (state.payQrDraft !== null) payload.payment_qr_url = state.payQrDraft;
    const data = await api("/api/settings", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.company = data.company ? { ...state.company, ...data.company } : state.company;
    if (Object.prototype.hasOwnProperty.call(payload, "fast_mode_enabled")) {
      state.company.fast_mode_enabled = payload.fast_mode_enabled;
    }
    state.fastModePreview = null;
    state.logoDraft = null;
    state.payQrDraft = null;
    paintHeader();
    applyQuickAddVisibility();
    applyFastMode();
    renderCatalog();
    renderSettings();
    tick();
    renderTableBoard();
    if (state.settingsSection === "fast-mode") {
      $("settings-hint").textContent = fastModeOn()
        ? "Saved. Fast Mode is on — Counter opens when you sign in, with lighter pages."
        : "Saved. Fast Mode is off — Dashboard and product photos are on.";
    } else {
      $("settings-hint").textContent = "Saved";
    }
    $("settings-hint").className = "hint ok";
    clearSettingsDirty();
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

$("set-quick-add-block")?.addEventListener("change", () => {
  if (!state.company) state.company = {};
  state.company.quick_add_enabled = $("set-quick-add-hide")?.checked ? 0 : 1;
  applyQuickAddVisibility();
  renderCatalog();
});

$("set-fast-mode-block")?.addEventListener("change", () => {
  state.fastModePreview = !$("set-fast-mode-off")?.checked;
  applyFastMode();
  renderCatalog();
  if (state.currentView === "customers") renderCustomersTable();
  if (state.currentView === "purchases") renderPoLines();
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
["rep-customer", "rep-supplier", "rep-product", "rep-category", "rep-user", "rep-pay-mode", "rep-branch"].forEach((id) => {
  $(id)?.addEventListener("input", () => applyReportsFilter());
  $(id)?.addEventListener("change", () => applyReportsFilter());
});
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
$("rep-pdf")?.addEventListener("click", () => {
  printFinance({
    title: "Reports",
    html: reportsPrintHtml(),
    from: $("rep-from")?.value,
    to: $("rep-to")?.value,
  });
});
async function openInvoiceFromReport(id, orderNumber) {
  const wantedId = String(id || "").trim();
  const wantedNo = String(orderNumber || "").trim();
  if (!wantedId && !wantedNo) return;
  orderFilter.q = wantedNo;
  if ($("orders-search")) $("orders-search").value = wantedNo;
  showView("orders");
  const match = (rows) =>
    (rows || []).find((x) => (wantedId && x.id === wantedId) || (wantedNo && x.order_number === wantedNo));
  let found = match(orderCache);
  if (!found) {
    await loadOrders();
    found = match(orderCache);
  }
  if (found) {
    showOrder(found);
    return;
  }
  setHint(`Invoice ${wantedNo || wantedId} is not in the recent invoice list.`, "");
}

$("reports")?.addEventListener("click", (e) => {
  const inv = e.target.closest("[data-open-invoice]");
  if (inv?.dataset.openInvoice || inv?.dataset.orderNumber) {
    e.preventDefault();
    openInvoiceFromReport(inv.dataset.openInvoice, inv.dataset.orderNumber);
    return;
  }
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
$("reports")?.addEventListener("change", (e) => {
  const day = e.target?.closest?.("#daily-sales-day");
  if (!day || !day.value) return;
  if ($("rep-from")) $("rep-from").value = day.value;
  if ($("rep-to")) $("rep-to").value = day.value;
  $("report-form")?.requestSubmit();
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
  if (document.body.classList.contains("counter-mode")) {
    const app = document.getElementById("app");
    setNavCollapsed(app ? app.classList.contains("nav-collapsed") : true);
    applyQuickAddVisibility();
  } else if (isMobileLayout() || document.body.classList.contains("m-app")) {
    applyCounterWorkspaceChrome();
  } else {
    setNavCollapsed(false);
    const wrap = $("quick-customer-wrap");
    if (wrap) wrap.open = false;
  }
  if ($("bill-toggle")) setBillCollapsed(document.body.classList.contains("bill-collapsed"));
  applyRestaurantMobileChrome();
});

document.addEventListener("click", async (e) => {
  const logout = e.target.closest("[data-logout]");
  if (!logout) return;
  e.preventDefault();
  await posRequest("/api/auth/logout", { method: "POST" });
  location.href = "/login.html";
});
document.addEventListener("click", (e) => {
  const jump = e.target.closest("[data-view-jump]");
  if (!jump) return;
  if (jump.closest("#view-dashboard")) return;
  showView(jump.dataset.viewJump);
  if (jump.dataset.accJump) setTimeout(() => setAccTab(jump.dataset.accJump), 0);
});
$("view-dashboard")?.addEventListener("click", (e) => {
  const jump = e.target.closest("[data-view-jump]");
  if (jump) {
    showView(jump.dataset.viewJump);
    return;
  }
  const tile = e.target.closest("[data-dash-view]");
  if (tile) {
    if (tile.dataset.dashStock === "low" || tile.dataset.dashStock === "out") {
      state.stockLowOnly = tile.dataset.dashStock === "low";
      state.stockStatusFilter = tile.dataset.dashStock;
    }
    showView(tile.dataset.dashView);
    if (tile.dataset.dashStock && $("stock-filter-status")) {
      $("stock-filter-status").value = tile.dataset.dashStock;
      if ($("stock-low-only")) $("stock-low-only").checked = tile.dataset.dashStock === "low";
      filterStockList();
    }
  }
});
function toggleDashWidgets(forceHidden) {
  const drawer = $("dash-widget-drawer");
  if (!drawer) return;
  if (forceHidden === true) drawer.hidden = true;
  else if (forceHidden === false) drawer.hidden = false;
  else drawer.hidden = !drawer.hidden;
}
$("dash-customize")?.addEventListener("click", () => toggleDashWidgets());
$("dash-customize-close")?.addEventListener("click", () => toggleDashWidgets(true));
$("dash-range")?.addEventListener("change", () => {
  localStorage.setItem("pos_dash_range", $("dash-range").value);
  void loadDashboard();
});
$("dash-theme")?.addEventListener("click", () => {
  applyColorScheme(document.documentElement.dataset.scheme === "dark" ? "light" : "dark");
});
$("dash-notify")?.addEventListener("click", () => {
  const onPhone = document.body.classList.contains("m-app");
  const notes = onPhone
    ? document.getElementById("m-home-notes") || document.getElementById("dash-notes")
    : document.getElementById("dash-notes") || document.getElementById("platform-notices");
  notes?.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
$("dash-search")?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const q = String($("dash-search").value || "").trim();
  if (!q) return;
  if (/^so-|^inv|#/i.test(q)) {
    showView("orders");
    if ($("orders-search")) $("orders-search").value = q;
    return;
  }
  showView("items");
  if ($("item-catalog-search")) $("item-catalog-search").value = q;
});
$("view-dashboard")?.addEventListener("click", (e) => {
  const seg = e.target.closest("#dash-range-seg button");
  if (!seg) return;
  document.querySelectorAll("#dash-range-seg button").forEach((b) => b.classList.toggle("is-on", b === seg));
  const range = $("dash-range");
  if (range) range.value = seg.dataset.range || range.value;
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
          extraCharges: state.extraCharges || 0,
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
$("btn-shift-table")?.addEventListener("click", async () => {
  try {
    if (!tableShiftingEnabled()) throw new Error("Table shifting is turned off in Settings");
    const from = restaurantApi()?.normalizeTableNo?.(state.activeTable) || "";
    if (!from || from === restaurantApi()?.PARCEL) throw new Error("Open a dining table first");
    state.shiftFromTable = from;
    renderTableBoard();
    $("table-board")?.scrollIntoView({ block: "nearest" });
  } catch (err) {
    setHint(err.message, "error");
  }
});
$("table-board")?.addEventListener("click", async (e) => {
  const tablesToggle = e.target.closest("[data-tables-toggle]");
  if (tablesToggle) {
    e.preventDefault();
    e.stopPropagation();
    const board = $("table-board");
    if (!board) return;
    board.dataset.tablesUser = board.classList.contains("is-compact") ? "open" : "shut";
    applyRestaurantMobileChrome();
    return;
  }
  const shiftActive = e.target.closest("[data-shift-active]");
  if (shiftActive) {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (!tableShiftingEnabled()) throw new Error("Table shifting is turned off in Settings");
      const from = restaurantApi()?.normalizeTableNo?.(state.activeTable) || "";
      if (!from || from === restaurantApi()?.PARCEL) throw new Error("Open a dining table first");
      if (!tableIsBusy(from) && !state.cart.length) throw new Error("No active order on that table");
      state.shiftFromTable = from;
      renderTableBoard();
    } catch (err) {
      setHint(err.message, "error");
    }
    return;
  }
  const printTableQr = e.target.closest("[data-table-qr]");
  if (printTableQr) {
    e.preventDefault();
    e.stopPropagation();
    await printQrTableStickers([printTableQr.getAttribute("data-table-qr")]);
    return;
  }
  const shiftBtn = e.target.closest("[data-shift-table]");
  if (shiftBtn) {
    e.preventDefault();
    e.stopPropagation();
    if (!tableShiftingEnabled()) return;
    state.shiftFromTable = restaurantApi()?.normalizeTableNo?.(shiftBtn.getAttribute("data-shift-table")) || "";
    renderTableBoard();
    return;
  }
  const cancelShift = e.target.closest("[data-cancel-shift]");
  if (cancelShift) {
    e.preventDefault();
    state.shiftFromTable = "";
    renderTableBoard();
    return;
  }
  const shiftTo = e.target.closest("[data-shift-to]");
  if (shiftTo) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await confirmAndShiftTable(state.shiftFromTable, shiftTo.getAttribute("data-shift-to"));
    } catch (err) {
      setHint(err.message, "error");
    }
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
    body: JSON.stringify({
      name: $("dev-name").value,
      code: $("dev-code").value,
      status: $("dev-activate")?.checked ? "active" : "inactive",
    }),
  });
  $("device-form").reset();
  loadDevices();
});
$("device-table")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-device-toggle]");
  if (!btn) return;
  const next = btn.dataset.nextStatus || "inactive";
  if (next === "inactive" && !window.confirm("Disable this register in ATAV POS? The physical till stays as it is.")) return;
  btn.disabled = true;
  try {
    await api(`/api/devices/${encodeURIComponent(btn.dataset.deviceToggle)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
    });
    await loadDevices();
  } catch (err) {
    setHint(err.message, "error");
  } finally {
    btn.disabled = false;
  }
});
function fillItemPicker(datalistId, searchId, hiddenId, filterFn) {
  const list = $(datalistId);
  if (!list) return;
  const items = activeItems().filter((i) => (filterFn ? filterFn(i) : true));
  list.innerHTML = items.slice(0, 200).map((i) => pickerOptionHtml(i)).join("");
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
        barcode: state.stockBarcode || "",
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
["stock-filter-category", "stock-filter-color", "stock-filter-size", "stock-filter-supplier", "stock-filter-status"].forEach((id) => {
  $(id)?.addEventListener("change", () => {
    if (id === "stock-filter-status") {
      state.stockLowOnly = $("stock-filter-status")?.value === "low";
      if ($("stock-low-only")) $("stock-low-only").checked = state.stockLowOnly;
    }
    filterStockList();
    paintStockHero(state.stockRows);
  });
});
$("stock-garment-view")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-stock-view]");
  if (!btn) return;
  state.stockView = btn.dataset.stockView === "barcode" ? "barcode" : "item";
  document.querySelectorAll("[data-stock-view]").forEach((el) => el.classList.toggle("primary", el === btn));
  paintStockList(state.stockRows);
});
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
  const toggle = e.target.closest("[data-stock-toggle]");
  if (toggle) {
    const key = toggle.dataset.stockToggle;
    if (!(state.stockOpenStyles instanceof Set)) state.stockOpenStyles = new Set();
    const body = toggle.closest(".garment-stock-style")?.querySelector(".garment-stock-colours");
    const open = body ? body.hidden : state.stockOpenStyles.has(key);
    if (open) state.stockOpenStyles.add(key);
    else state.stockOpenStyles.delete(key);
    if (body) body.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    return;
  }
  if (e.target.closest("input, select, textarea")) return;
  const card = e.target.closest("[data-stock-item]");
  if (!card || !card.dataset.stockItem) return;
  selectStockItem(card.dataset.stockItem, card.dataset.stockBarcode || "");
});
$("stock-table")?.addEventListener("change", async (e) => {
  const input = e.target.closest("[data-stock-reorder]");
  if (!input) return;
  const itemId = input.dataset.stockReorder;
  const reorder = Math.max(0, Math.round(Number(input.value) || 0));
  input.value = String(reorder);
  try {
    await api("/api/stock/reorder", {
      method: "POST",
      body: JSON.stringify({ item_id: itemId, reorder_level_gm: reorder }),
    });
    const row = (state.stockRows || []).find((item) => item.id === itemId);
    const catalog = (state.items || []).find((item) => item.id === itemId);
    if (row) row.reorder_level_gm = reorder;
    if (catalog) catalog.reorder_level_gm = reorder;
    setStockHint(`Reorder level set to ${reorder}`, "ok");
    paintStockHero(state.stockRows);
    paintStockList(state.stockRows);
  } catch (err) {
    setStockHint(err.message, "error");
  }
});

document.getElementById("stock-mode")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-stock-mode]");
  if (!btn) return;
  state.stockMode = btn.dataset.stockMode;
  document.querySelectorAll("[data-stock-mode]").forEach((b) => b.classList.toggle("primary", b === btn));
  document.getElementById("view-stock")?.classList.toggle("is-advanced", state.stockMode === "advanced");
  if ($("stock-mode-label")) $("stock-mode-label").textContent = state.stockMode === "advanced" ? "Adjust stock — advanced" : "Adjust stock";
});

["bill-disc-type", "bill-disc-value", "loyalty-redeem", "print-extra-charges"].forEach((id) => {
  $(id)?.addEventListener("input", () => {
    state.billDiscountType = $("bill-disc-type")?.value || "amt";
    state.billDiscountValue = Number($("bill-disc-value")?.value) || 0;
    state.extraCharges = Number($("print-extra-charges")?.value) || 0;
    clampLoyaltyRedeem();
    if (id !== "loyalty-redeem") state.offerBillLocked = true;
    renderCart();
  });
  $(id)?.addEventListener("change", () => {
    state.billDiscountType = $("bill-disc-type")?.value || "amt";
    state.billDiscountValue = Number($("bill-disc-value")?.value) || 0;
    state.extraCharges = Number($("print-extra-charges")?.value) || 0;
    clampLoyaltyRedeem();
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

let barcodeDeskPage = 1;
let barcodeDeskRows = [];
let barcodeDeskTotal = 0;
let barcodeDeskTimer = 0;
let barcodeDeskProfileKey = "";

function isPieceBarcodeRow(kind) {
  return kind !== "own" && kind !== "manufacturer";
}

function barcodeHint(message, tone) {
  const hint = $("bc-hint");
  if (!hint) return;
  hint.textContent = message || "";
  hint.classList.toggle("ok", tone === "ok");
  hint.classList.toggle("error", tone === "error");
}

function barcodeWhen(value) {
  const s = String(value || "");
  if (!s) return "—";
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return s.slice(0, 16);
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
}

function barcodeDeskProfile() {
  const key = globalThis.POSFootwear?.shopKind?.(state.businessMeta) || "general";
  return globalThis.POSBarcode?.deskProfile?.(key) || {
    size: true, color: true, sku: true, price: true, batch: true, expiry: true, serial: true,
    kinds: ["own", "manufacturer", "variant", "batch", "unit", "serial"],
    shopKind: key,
  };
}

function applyBarcodeDeskProfile() {
  const profile = barcodeDeskProfile();
  document.querySelectorAll("[data-bc-field]").forEach((el) => {
    el.hidden = profile[el.dataset.bcField] === false;
  });
  const select = $("bc-kind");
  if (select && barcodeDeskProfileKey !== profile.shopKind) {
    const current = select.value;
    const labels = { own: "Product", manufacturer: "Manufacturer", variant: "Variant", batch: "Batch", unit: "Piece", serial: "Serial" };
    select.innerHTML = (profile.kinds || []).map((kind) => `<option value="${kind}">${labels[kind] || kind}</option>`).join("");
    if ([...select.options].some((opt) => opt.value === current)) select.value = current;
    barcodeDeskProfileKey = profile.shopKind;
  }
  const lede = $("bc-lede");
  if (lede) {
    const lead = globalThis.POSBarcode?.deskLead?.(profile.shopKind) || "";
    lede.textContent = `${lead} Quantity (pcs) piece and serial codes stay unique. Sold or damaged codes go inactive and cannot be scanned again.`.replace(/\s+/g, " ").trim();
  }
  syncBarcodeQtyLock();
}

function syncBarcodeQtyLock() {
  const kind = $("bc-kind")?.value || "own";
  const piece = globalThis.POSBarcode?.isPieceKind?.(kind) || kind === "unit" || kind === "serial";
  const qty = $("bc-qty");
  const editing = Boolean($("bc-edit-id")?.value);
  if (qty) {
    qty.disabled = editing || !piece;
    if (!piece) qty.value = "1";
  }
}

function restoreBarcodeLabelSettings() {
  if (restoreBarcodeLabelSettings.done) return;
  restoreBarcodeLabelSettings.done = true;
  try {
    const saved = JSON.parse(localStorage.getItem("atav-bc-label") || "{}") || {};
    if (saved.layout && $("bc-layout")) $("bc-layout").value = saved.layout;
    if (saved.width && $("bc-label-w")) $("bc-label-w").value = saved.width;
    if (saved.height && $("bc-label-h")) $("bc-label-h").value = saved.height;
  } catch { /* private mode */ }
}

function saveBarcodeLabelSettings() {
  try {
    localStorage.setItem("atav-bc-label", JSON.stringify({
      layout: $("bc-layout")?.value || "thermal",
      width: $("bc-label-w")?.value || "",
      height: $("bc-label-h")?.value || "",
    }));
  } catch { /* private mode */ }
}

function barcodePrintOpts() {
  return {
    layout: $("bc-layout")?.value === "a4" ? "a4" : "thermal",
    widthMm: Number($("bc-label-w")?.value) || 0,
    heightMm: Number($("bc-label-h")?.value) || 0,
  };
}

function barcodeLabelFromRow(row) {
  const profile = barcodeDeskProfile();
  return {
    name: row.item_name || row.name,
    barcode: row.barcode,
    format: row.barcode_format || row.format,
    barcode_format: row.barcode_format || row.format,
    mrp: profile.price === false ? "" : (row.label_mrp || row.mrp),
    rate: profile.price === false ? "" : (row.retail_rate || row.rate),
    size: row.size,
    color: row.color,
    batch_no: row.batch_no,
    expiry: row.item_expiry || row.expiry,
    serial_no: row.serial_no,
    item_code: row.item_code,
    sku: row.item_code,
    shop: shopPrintName(),
    logo: state.company?.logo_url || "",
  };
}

function barcodeFormBody() {
  const body = {
    item_id: $("bc-item")?.value || "",
    kind: $("bc-kind")?.value || "own",
    format: $("bc-format")?.value || "code128",
    barcode: String($("bc-manual")?.value || "").trim(),
    qty: Number($("bc-qty")?.value) || 1,
    size: $("bc-size")?.value || "",
    color: $("bc-color")?.value || "",
    batch_no: $("bc-batch")?.value || "",
    serial_no: $("bc-serial")?.value || "",
    expiry: $("bc-expiry")?.value || "",
    note: $("bc-note")?.value || "",
  };
  document.querySelectorAll("[data-bc-field]").forEach((el) => {
    if (!el.hidden) return;
    const key = el.dataset.bcField;
    if (key === "size") body.size = "";
    if (key === "color") body.color = "";
    if (key === "batch") body.batch_no = "";
    if (key === "serial") body.serial_no = "";
    if (key === "expiry") body.expiry = "";
  });
  return body;
}

function validateBarcodeBody(body, item) {
  const piece = globalThis.POSBarcode?.isPieceKind?.(body.kind) || body.kind === "unit" || body.kind === "serial";
  if (!body.item_id || !item) return "Select a product";
  if (piece && !POSUnits.isCount(itemUnit(item))) return "Barcodes are only for Quantity (pcs) items";
  if (!piece && Number(body.qty) !== 1) return "A shared barcode is one code. Switch to piece or serial to generate many.";
  if (body.barcode && Number(body.qty) > 1) return "Enter one manual barcode, or clear it to generate unique codes.";
  if (body.barcode && body.format === "ean13" && globalThis.POSBarcode?.isValidEan13 && !POSBarcode.isValidEan13(body.barcode)) {
    return "Enter a valid EAN-13 barcode";
  }
  return "";
}

function paintBarcodeCategoryFilter() {
  const sel = $("bc-filter-category");
  if (!sel) return;
  const current = sel.value;
  const cats = [...new Set(activeItems().map((item) => String(item.category || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  sel.innerHTML = `<option value="">All categories</option>${cats.map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join("")}`;
  if ([...sel.options].some((opt) => opt.value === current)) sel.value = current;
}

function paintBarcodeBulkList() {
  const box = $("bc-bulk-list");
  if (!box) return;
  const checked = new Set([...box.querySelectorAll(":checked")].map((el) => el.value));
  const q = String($("bc-item-search")?.value || "").trim().toLowerCase();
  const items = activeItems().filter((item) => {
    if (!q) return true;
    return String(item.name || "").toLowerCase().includes(q) || String(item.code || "").toLowerCase().includes(q);
  }).slice(0, 60);
  box.innerHTML = items.map((item) => `<label><input type="checkbox" data-bc-bulk-item value="${escapeHtml(item.id)}" ${checked.has(item.id) ? "checked" : ""} /> ${escapeHtml(item.name)}</label>`).join("") || "<p>No products</p>";
}

function barcodeVariantText(row) {
  const profile = barcodeDeskProfile();
  const bits = [];
  const kind = globalThis.POSBarcode?.kindLabel?.(row.kind) || row.kind || "";
  if (kind) bits.push(kind);
  if (profile.size && row.size) bits.push(row.size);
  if (profile.color && row.color) bits.push(row.color);
  if (profile.batch && row.batch_no) bits.push(row.batch_no);
  if (profile.expiry && row.item_expiry) bits.push(row.item_expiry);
  if (profile.serial && row.serial_no) bits.push(row.serial_no);
  if (profile.sku && row.item_code) bits.push(row.item_code);
  return bits.join(" · ");
}

function barcodeAssignment(row) {
  const st = String(row.status || "active").toLowerCase() || "active";
  if (st !== "active") return st;
  const kind = String(row.kind || "").toLowerCase();
  if ((kind === "unit" || kind === "serial") && !row.purchase_id && !row.used_at) return "unassigned";
  if (!row.printed_at) return "pending print";
  if (row.purchase_number) return `purchase ${row.purchase_number}`;
  return "assigned";
}

function selectedBarcodeRows() {
  const ids = new Set([...document.querySelectorAll("[data-bc-id]:checked")].map((el) => el.dataset.bcId));
  return barcodeDeskRows.filter((row) => ids.has(String(row.id)));
}

function barcodePrintSource(row, extra = {}) {
  const item = state.items.find((entry) => entry.id === (row.item_id || extra.item_id)) || {};
  return {
    ...extra,
    ...row,
    item_name: row.item_name || extra.item_name || item.name,
    item_code: row.item_code || extra.item_code || item.code,
    label_mrp: row.label_mrp || extra.label_mrp || item.mrp || item.retail_rate,
    retail_rate: row.retail_rate || extra.retail_rate || item.retail_rate,
    item_expiry: row.item_expiry || extra.item_expiry || extra.expiry,
    size: row.size || extra.size,
    color: row.color || extra.color,
    batch_no: row.batch_no || extra.batch_no,
    serial_no: row.serial_no || extra.serial_no,
  };
}

async function printBarcodeRows(rows, reload) {
  if (!rows.length) {
    barcodeHint("Select labels first", "error");
    return;
  }
  if (!globalThis.POSBarcode?.printLabels) {
    barcodeHint("Label printing is unavailable", "error");
    return;
  }
  const copies = Number($("bc-copies")?.value) || 1;
  const ok = POSBarcode.printLabels(rows.map(barcodeLabelFromRow), copies, barcodePrintOpts());
  saveBarcodeLabelSettings();
  if (ok === false) {
    barcodeHint("Allow pop-ups to print labels", "error");
    return;
  }
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (ids.length && can("items")) {
    try {
      await api("/api/barcodes/printed", { method: "POST", body: JSON.stringify({ ids }) });
    } catch { /* the label window already opened */ }
  }
  if (reload) await loadBarcodesView();
}

function cancelBarcodeEdit() {
  if ($("bc-edit-id")) $("bc-edit-id").value = "";
  if ($("bc-manual")) $("bc-manual").value = "";
  if ($("bc-submit")) $("bc-submit").textContent = "Generate barcode";
  if ($("bc-form-title")) $("bc-form-title").textContent = "Generate barcode";
  if ($("bc-cancel-edit")) $("bc-cancel-edit").hidden = true;
  syncBarcodeQtyLock();
}

function editBarcodeRow(row) {
  if (!row) return;
  if ($("bc-edit-id")) $("bc-edit-id").value = row.id || "";
  if ($("bc-item")) $("bc-item").value = row.item_id || "";
  if ($("bc-item-search")) $("bc-item-search").value = row.item_name || "";
  const kind = String(row.kind || "own");
  const sel = $("bc-kind");
  if (sel && ![...sel.options].some((opt) => opt.value === kind)) {
    const extra = document.createElement("option");
    extra.value = kind;
    extra.textContent = globalThis.POSBarcode?.kindLabel?.(kind) || kind;
    sel.appendChild(extra);
  }
  if (sel) sel.value = kind;
  if ($("bc-format")) $("bc-format").value = row.barcode_format === "ean13" || globalThis.POSBarcode?.isValidEan13?.(row.barcode) ? (row.barcode_format || "ean13") : (row.barcode_format || "code128");
  if ($("bc-manual")) $("bc-manual").value = row.barcode || "";
  if ($("bc-qty")) $("bc-qty").value = "1";
  if ($("bc-size")) $("bc-size").value = row.size || "";
  if ($("bc-color")) $("bc-color").value = row.color || "";
  if ($("bc-batch")) $("bc-batch").value = row.batch_no || "";
  if ($("bc-expiry")) $("bc-expiry").value = String(row.item_expiry || row.expiry_date || "").slice(0, 10);
  if ($("bc-serial")) $("bc-serial").value = row.serial_no || "";
  if ($("bc-note")) $("bc-note").value = row.note || "";
  if ($("bc-submit")) $("bc-submit").textContent = "Save barcode";
  if ($("bc-form-title")) $("bc-form-title").textContent = "Edit barcode";
  if ($("bc-cancel-edit")) $("bc-cancel-edit").hidden = false;
  syncBarcodeQtyLock();
  $("bc-qty-form")?.scrollIntoView({ block: "nearest" });
}

async function openBarcodeDetail(id) {
  const data = await api(`/api/barcodes/${encodeURIComponent(id)}`);
  const row = data.barcode || {};
  const box = $("bc-detail");
  if (!box) return;
  const events = Array.isArray(data.events) ? data.events : [];
  box.hidden = false;
  box.innerHTML = `<h4>${escapeHtml(row.item_name || "Barcode")}</h4>
    <p>${escapeHtml(row.barcode || "")} · ${escapeHtml(barcodeAssignment(row))} · ${escapeHtml(barcodeWhen(row.created_at))}</p>
    <p>${escapeHtml(barcodeVariantText(row))}${row.purchase_number ? ` · Purchase ${escapeHtml(row.purchase_number)}` : ""}${data.locked ? " · Linked to history" : ""}</p>
    ${events.length ? `<ul>${events.map((event) => `<li>${escapeHtml(event.action || "")} · ${escapeHtml(event.detail || "")} · ${escapeHtml(barcodeWhen(event.created_at))}</li>`).join("")}</ul>` : "<p>No changes yet.</p>"}
    <button class="btn" type="button" id="bc-detail-close">Close</button>`;
}

async function loadBarcodesView() {
  restoreBarcodeLabelSettings();
  applyBarcodeDeskProfile();
  fillItemPicker("bc-item-list", "bc-item-search", "bc-item", () => true);
  paintBarcodeCategoryFilter();
  paintBarcodeBulkList();
  const form = $("bc-qty-form");
  if (form) form.querySelectorAll("button, input, select").forEach((el) => {
    if (el.id === "bc-search") return;
    if (!can("items") && el.closest("#bc-qty-form")) el.disabled = el.type !== "search";
  });
  const params = new URLSearchParams({ desk: "1", page: String(barcodeDeskPage), limit: "40" });
  const q = String($("bc-search")?.value || "").trim();
  const kind = $("bc-filter-kind")?.value || "";
  const status = $("bc-filter-status")?.value || "";
  const category = $("bc-filter-category")?.value || "";
  if (q) params.set("q", q);
  if (kind) params.set("kind", kind);
  if (status) params.set("status", status);
  if (category) params.set("category", category);
  try {
    const data = await api(`/api/barcodes?${params.toString()}`);
    barcodeDeskRows = Array.isArray(data.rows) ? data.rows : [];
    barcodeDeskTotal = Number(data.total) || barcodeDeskRows.length;
    const summary = data.summary || {};
    const stats = $("barcodes-hero-stats");
    if (stats) {
      const cards = [
        ["", "Total", summary.total],
        ["active", "Active", summary.active],
        ["unassigned", "Unassigned", summary.unassigned],
        ["unprinted", "Pending print", summary.pending_print],
      ];
      stats.innerHTML = cards.map(([key, label, value]) => `<button type="button" class="items-stat" data-bc-stat="${key}"><span>${label}</span><strong>${Number(value) || 0}</strong></button>`).join("");
    }
    const table = $("barcodes-table");
    if (table) {
      const body = barcodeDeskRows.map((row) => {
        const st = String(row.status || "active").toLowerCase() || "active";
        const kindName = String(row.kind || "").toLowerCase();
        const tracked = isPieceBarcodeRow(kindName);
        const svg = globalThis.POSBarcode?.barcodeSvg?.(row, { height: 36, scale: 1.2 }) || "";
        const locked = st === "sold" || st === "damaged";
        return `<tr class="${st === "active" ? "" : "is-inactive"}${tracked ? " is-piece" : ""}">
          <td><input type="checkbox" data-bc-pick="${escapeHtml(row.barcode)}" data-bc-id="${escapeHtml(row.id)}" /></td>
          <td class="bc-preview">${svg}<div class="bc-num">${escapeHtml(row.barcode)}</div></td>
          <td>${escapeHtml(row.item_name || "")}</td>
          <td>${escapeHtml(barcodeVariantText(row))}</td>
          <td>${escapeHtml(barcodeAssignment(row))}</td>
          <td>${escapeHtml(barcodeWhen(row.created_at))}</td>
          <td class="bc-actions">
            <button class="btn" type="button" data-bc-view="${escapeHtml(row.id)}">View</button>
            <button class="btn" type="button" data-bc-edit="${escapeHtml(row.id)}">Edit</button>
            <button class="btn" type="button" data-bc-print="${escapeHtml(row.id)}">Print</button>
            ${locked || st === "inactive" ? "" : `<button class="btn" type="button" data-bc-off="${escapeHtml(row.id)}">Deactivate</button>`}
          </td>
        </tr>`;
      }).join("");
      table.innerHTML = `<table><thead><tr>
        <th><input type="checkbox" id="bc-select-all" aria-label="Select all" /></th>
        <th>Barcode</th><th>Product</th><th>Variant</th><th>Status</th><th>Created</th><th></th>
      </tr></thead><tbody>${body || `<tr><td colspan="7">No barcodes yet.</td></tr>`}</tbody></table>`;
    }
    const pages = Math.max(1, Math.ceil(barcodeDeskTotal / (Number(data.pageSize) || 40)));
    const pager = $("bc-pager");
    if (pager) {
      pager.innerHTML = `<button type="button" class="btn" data-bc-page="${barcodeDeskPage - 1}" ${barcodeDeskPage <= 1 ? "disabled" : ""}>Previous</button>
        <span>Page ${barcodeDeskPage} of ${pages}</span>
        <button type="button" class="btn" data-bc-page="${barcodeDeskPage + 1}" ${barcodeDeskPage >= pages ? "disabled" : ""}>Next</button>`;
    }
  } catch (err) {
    barcodeHint(err.message, "error");
  }
}

$("bc-qty-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!can("items")) {
    barcodeHint("You cannot change barcodes", "error");
    return;
  }
  const body = barcodeFormBody();
  const item = state.items.find((row) => row.id === body.item_id) || resolvePickerItem($("bc-item-search")?.value, activeItems());
  if (item && !body.item_id) body.item_id = item.id;
  const problem = validateBarcodeBody(body, item);
  if (problem) {
    barcodeHint(problem, "error");
    return;
  }
  const editId = $("bc-edit-id")?.value || "";
  try {
    if (editId) {
      const existing = barcodeDeskRows.find((row) => String(row.id) === String(editId));
      const locked = existing && (["sold", "damaged"].includes(String(existing.status || "").toLowerCase()) || existing.used_at);
      const payload = { ...body };
      delete payload.qty;
      if (locked) {
        delete payload.item_id;
        delete payload.barcode;
        delete payload.kind;
      }
      await api(`/api/barcodes/${encodeURIComponent(editId)}`, { method: "POST", body: JSON.stringify(payload) });
      barcodeHint("Barcode updated", "ok");
      cancelBarcodeEdit();
    } else {
      const piece = globalThis.POSBarcode?.isPieceKind?.(body.kind);
      const plainPiece = piece && body.kind === "unit" && body.format === "ean13" && !body.barcode && !body.size && !body.color && !body.batch_no && !body.serial_no && !body.expiry && !body.note;
      const data = plainPiece
        ? await api("/api/barcodes/generate-qty", { method: "POST", body: JSON.stringify({ item_id: body.item_id, qty: body.qty }) })
        : await api("/api/barcodes", { method: "POST", body: JSON.stringify(body) });
      const rows = data.barcodes || [];
      barcodeHint(`Generated ${data.generated || rows.length} unique barcodes`, "ok");
      if ($("bc-qty-print")?.checked && rows.length) {
        await printBarcodeRows(rows.map((row) => barcodePrintSource(row, { ...body, item_name: item.name, item_code: item.code, label_mrp: item.mrp || item.retail_rate, retail_rate: item.retail_rate })));
      }
      if ($("bc-manual")) $("bc-manual").value = "";
    }
    await loadBootstrap();
    barcodeDeskPage = 1;
    await loadBarcodesView();
  } catch (err) {
    barcodeHint(err.message, "error");
  }
});
$("bc-bulk")?.addEventListener("click", async () => {
  if (!can("items")) {
    barcodeHint("You cannot change barcodes", "error");
    return;
  }
  const body = barcodeFormBody();
  const ids = [...document.querySelectorAll("[data-bc-bulk-item]:checked")].map((el) => el.value);
  if (!ids.length && body.item_id) ids.push(body.item_id);
  if (!ids.length) {
    barcodeHint("Select at least one product", "error");
    return;
  }
  const piece = globalThis.POSBarcode?.isPieceKind?.(body.kind);
  if (piece && ids.some((id) => {
    const item = state.items.find((row) => row.id === id);
    return item && !POSUnits.isCount(itemUnit(item));
  })) {
    barcodeHint("Barcodes are only for Quantity (pcs) items", "error");
    return;
  }
  if (!window.confirm(`Generate barcodes for ${ids.length} products?`)) return;
  try {
    const data = await api("/api/barcodes/bulk", {
      method: "POST",
      body: JSON.stringify({ ...body, barcode: "", item_ids: ids }),
    });
    barcodeHint(`Generated ${data.generated || 0} unique barcodes`, "ok");
    if ($("bc-qty-print")?.checked && data.barcodes?.length) {
      await printBarcodeRows(data.barcodes.map((row) => barcodePrintSource(row, body)));
    }
    await loadBootstrap();
    barcodeDeskPage = 1;
    await loadBarcodesView();
  } catch (err) {
    barcodeHint(err.message, "error");
  }
});
$("bc-generate-missing")?.addEventListener("click", async () => {
  if (!can("items")) {
    barcodeHint("You cannot change barcodes", "error");
    return;
  }
  try {
    const data = await api("/api/barcodes/generate-missing", { method: "POST", body: "{}" });
    barcodeHint(`Generated ${data.generated || 0}`, "ok");
    await loadBootstrap();
    loadBarcodesView();
  } catch (err) {
    barcodeHint(err.message, "error");
  }
});
$("bc-cancel-edit")?.addEventListener("click", () => cancelBarcodeEdit());
$("bc-kind")?.addEventListener("change", syncBarcodeQtyLock);
$("bc-layout")?.addEventListener("change", saveBarcodeLabelSettings);
$("bc-label-w")?.addEventListener("change", saveBarcodeLabelSettings);
$("bc-label-h")?.addEventListener("change", saveBarcodeLabelSettings);
$("bc-print-selected")?.addEventListener("click", async () => {
  const rows = selectedBarcodeRows();
  if (rows.length > 1 && !window.confirm(`Print ${rows.length} labels?`)) return;
  await printBarcodeRows(rows, true);
});
$("bc-export")?.addEventListener("click", () => {
  const picked = selectedBarcodeRows();
  const rows = picked.length ? picked : barcodeDeskRows;
  const csv = globalThis.POSBarcode?.labelsCsv?.(rows) || "";
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "barcodes.csv";
  link.click();
  URL.revokeObjectURL(link.href);
});
$("bc-deactivate-selected")?.addEventListener("click", async () => {
  if (!can("items")) {
    barcodeHint("You cannot change barcodes", "error");
    return;
  }
  const rows = selectedBarcodeRows().filter((row) => !["sold", "damaged", "inactive"].includes(String(row.status || "active").toLowerCase()));
  if (!rows.length) {
    barcodeHint("This barcode is on a completed transaction and stays on file.", "error");
    return;
  }
  if (!window.confirm(`Deactivate ${rows.length} barcodes? Historical sales stay on file.`)) return;
  try {
    for (const row of rows) {
      await api(`/api/barcodes/${encodeURIComponent(row.id)}`, { method: "DELETE" });
    }
    barcodeHint(`Deactivated ${rows.length}`, "ok");
    await loadBarcodesView();
  } catch (err) {
    barcodeHint(err.message, "error");
  }
});
$("barcodes-hero-stats")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-bc-stat]");
  if (!btn || !$("bc-filter-status")) return;
  $("bc-filter-status").value = btn.dataset.bcStat || "";
  barcodeDeskPage = 1;
  loadBarcodesView();
});
$("barcodes-table")?.addEventListener("click", async (e) => {
  const view = e.target.closest("[data-bc-view]");
  const edit = e.target.closest("[data-bc-edit]");
  const print = e.target.closest("[data-bc-print]");
  const off = e.target.closest("[data-bc-off]");
  try {
    if (view) await openBarcodeDetail(view.dataset.bcView);
    if (edit) {
      if (!can("items")) {
        barcodeHint("You cannot change barcodes", "error");
        return;
      }
      editBarcodeRow(barcodeDeskRows.find((row) => String(row.id) === edit.dataset.bcEdit));
    }
    if (print) await printBarcodeRows(barcodeDeskRows.filter((row) => String(row.id) === print.dataset.bcPrint), true);
    if (off) {
      if (!can("items")) {
        barcodeHint("You cannot change barcodes", "error");
        return;
      }
      const row = barcodeDeskRows.find((item) => String(item.id) === off.dataset.bcOff);
      if (!window.confirm(`Deactivate ${row?.barcode || "this barcode"}? Historical sales stay on file.`)) return;
      await api(`/api/barcodes/${encodeURIComponent(off.dataset.bcOff)}`, { method: "DELETE" });
      barcodeHint("Barcode deactivated", "ok");
      await loadBarcodesView();
    }
  } catch (err) {
    barcodeHint(err.message, "error");
  }
});
$("barcodes-table")?.addEventListener("change", (e) => {
  if (e.target?.id !== "bc-select-all") return;
  document.querySelectorAll("[data-bc-pick]").forEach((el) => { el.checked = e.target.checked; });
});
$("bc-pager")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-bc-page]");
  if (!btn || btn.disabled) return;
  const next = Number(btn.dataset.bcPage);
  if (!Number.isFinite(next) || next < 1) return;
  barcodeDeskPage = next;
  loadBarcodesView();
});
$("bc-detail")?.addEventListener("click", (e) => {
  if (e.target?.id === "bc-detail-close" && $("bc-detail")) $("bc-detail").hidden = true;
});
function scheduleBarcodeDesk() {
  window.clearTimeout(barcodeDeskTimer);
  barcodeDeskTimer = window.setTimeout(() => {
    barcodeDeskPage = 1;
    loadBarcodesView();
  }, 250);
}
$("bc-search")?.addEventListener("input", scheduleBarcodeDesk);
$("bc-search")?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  window.clearTimeout(barcodeDeskTimer);
  barcodeDeskPage = 1;
  loadBarcodesView();
});
$("bc-filter-kind")?.addEventListener("change", () => { barcodeDeskPage = 1; loadBarcodesView(); });
$("bc-filter-status")?.addEventListener("change", () => { barcodeDeskPage = 1; loadBarcodesView(); });
$("bc-filter-category")?.addEventListener("change", () => { barcodeDeskPage = 1; loadBarcodesView(); });
$("bc-item-search")?.addEventListener("input", paintBarcodeBulkList);

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
    const withPts = rows.filter((r) => Number(r.account?.points_balance) > 0).length;
    const stats = $("loyalty-hero-stats");
    if (stats) {
      stats.innerHTML = `<button type="button" class="items-stat"><span>Customers</span><strong>${rows.length}</strong></button>
        <button type="button" class="items-stat"><span>With points</span><strong>${withPts}</strong></button>
        <button type="button" class="items-stat"><span>Program</span><strong>${settings.enabled === false || settings.enabled === 0 ? "Off" : "On"}</strong></button>`;
    }
    filterLoyaltyTable();
  } catch (err) {
    if ($("loy-hint")) $("loy-hint").textContent = err.message;
  }
}

function filterLoyaltyTable() {
  const q = String($("loy-search")?.value || "").trim().toLowerCase();
  $("loyalty-table")?.querySelectorAll("tbody tr").forEach((tr) => {
    tr.hidden = Boolean(q) && !String(tr.textContent || "").toLowerCase().includes(q);
  });
}

$("loy-search")?.addEventListener("input", filterLoyaltyTable);
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

function noticeCardHtml(n) {
  const when = formatShopDateTime(n.created_at);
  const body = String(n.body || "").trim();
  return `<article class="platform-notice dash-notice-card">
    <strong>${escapeHtml(n.title || "Notice")}</strong>
    ${body ? `<p class="notice-body">${escapeHtml(body)}</p>` : ""}
    ${n.image_url ? `<img class="notice-thumb" src="${escapeHtml(n.image_url)}" alt="" />` : ""}
    ${when ? `<time class="notice-when" datetime="${escapeHtml(String(n.created_at || ""))}">${escapeHtml(when)}</time>` : ""}
  </article>`;
}

function paintPlatformNotices(notes) {
  const list = (Array.isArray(notes) ? notes : []).filter((n) => {
    const title = String(n.title || "").trim().toLowerCase();
    const body = String(n.body || "").toLowerCase();
    if (title === "master admin login") return false;
    if (body.includes("opened this shop from master admin")) return false;
    if (body.includes("viewing this shop") || body.includes("is viewing")) return false;
    return true;
  });
  const html = list.map(noticeCardHtml).join("");
  const paint = (el, hideWhenEmpty) => {
    if (!el) return;
    el.innerHTML = html;
    if (hideWhenEmpty) {
      el.hidden = !list.length;
      if (list.length) el.removeAttribute("hidden");
    }
  };
  paint($("platform-notices"), true);
  paint($("dash-notes"), false);
  paint($("m-home-notes"), true);
  const badge = $("dash-notify-count");
  if (badge) {
    badge.hidden = list.length < 1;
    badge.textContent = list.length > 9 ? "9+" : String(list.length);
  }
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
    if (res.status === 403 && String(me?.code || "").startsWith("subscription_")) {
      try {
        sessionStorage.setItem("pos_subscription_notice", JSON.stringify(me));
      } catch {
        /* display handoff only — the server remains the check */
      }
      location.href = "/login.html";
      return;
    }
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
    if (isMobileLayout() || document.body.classList.contains("m-app")) setNavCollapsed(true);
    try {
      await loadBootstrap();
    } catch (err) {
      setHint(err.message || "Could not load shop data", "error");
    }
    applyFastMode();
    if (me.business?.status && me.business.status !== "active" && !me.impersonating) {
      $("expired-banner").hidden = false;
      $("shop-name").textContent = me.business.name || "POS";
      showView("dashboard");
      return;
    }
    showView(landingView());
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
