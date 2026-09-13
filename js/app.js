import * as Pharmacy from "./pharmacy.js";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

const state = {
  company: {},
  items: [],
  customers: [],
  packs: [],
  suppliers: [],
  batches: [],
  cart: [],
  query: "",
  customerId: "",
  lastPack: null,
  editingOrderId: null,
  logoDraft: null,
};

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

function customer() {
  return state.customers.find((c) => c.id === state.customerId) || state.customers[0];
}

function kg(_gm) {
  return String(Number(_gm) || 0);
}

function stockOf(item) {
  return Number(item?.stock_gm) || 0;
}

function genericOf(item) {
  return item.generic_name || item.local_name || "";
}

function rateFor(item) {
  const type = customer()?.type || "b2c";
  if (type === "b2b") return Number(item.b2b_rate || item.selling_price || item.retail_rate);
  return Number(item.selling_price || item.retail_rate);
}

function lineAmt(item, qty) {
  return (Number(qty) || 0) * rateFor(item);
}

function packLabel() {
  const c = customer();
  return c ? `${c.business_name || c.name} · ${c.mobile || ""}` : "Walk-in retail";
}

function batchesFor(itemId) {
  return (state.batches || []).filter((b) => {
    if (b.item_id !== itemId || Number(b.qty) <= 0) return false;
    return Pharmacy.expiryStatus(b.expiry_date) !== "expired";
  });
}

function sellableOf(item) {
  const hasBatch = (state.batches || []).some((b) => b.item_id === item.id);
  if (hasBatch) return batchesFor(item.id).reduce((s, b) => s + (Number(b.qty) || 0), 0);
  return stockOf(item);
}

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function ymd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
}

function excelHref(sheet) {
  const from = $("rep-from")?.value || ymd();
  const to = $("rep-to")?.value || from;
  const q = `/api/reports/excel?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  return sheet ? `${q}&sheet=${encodeURIComponent(sheet)}` : q;
}

function fmtCell(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : Number(v).toFixed(2);
  return String(v);
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

function reportBlock(title, sheet, headers, rows) {
  return `<section class="report-block">
    <div class="report-block-head">
      <h3>${escapeHtml(title)}</h3>
      <a class="btn" href="${excelHref(sheet)}">Excel</a>
    </div>
    ${htmlTable(headers, rows)}
  </section>`;
}

function showView(name) {
  document.querySelectorAll(".view").forEach((el) => {
    el.hidden = el.id !== `view-${name}`;
  });
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === name);
  });
  if (name === "reports") loadReports();
  if (name === "orders") loadOrders();
  if (name === "purchases") loadPurchases();
  if (name === "suppliers") loadSuppliers();
  if (name === "batches") loadBatches();
  if (name === "returns") loadReturns();
  if (name === "support") renderSupport();
  if (name === "qr") {
    showQrPoster();
    loadQrOrders();
  }
}

function setHint(msg, kind = "") {
  $("hint").textContent = msg || "";
  $("hint").className = `hint ${kind}`.trim();
}

function activeItems() {
  return state.items.filter((i) => i.status !== "inactive");
}

function filteredItems() {
  const q = state.query.trim().toLowerCase();
  const list = activeItems();
  if (!q) return list;
  return list.filter((i) =>
    [i.name, i.local_name, i.generic_name, i.code, i.barcode, i.manufacturer, i.category, i.medicine_type].join(" ").toLowerCase().includes(q),
  );
}

function renderCatalog() {
  $("catalog").innerHTML = filteredItems()
    .map((i) => {
      const low = sellableOf(i) <= Number(i.reorder_level_gm);
      const out = sellableOf(i) <= 0;
      return `<button class="card" type="button" data-add="${escapeHtml(i.id)}" ${out ? "disabled" : ""}>
        <div class="sku">${escapeHtml(i.medicine_type || i.category || "Medical")} · ${escapeHtml(i.pack_unit || "Strip")}</div>
        <div class="name">${escapeHtml(i.name)} <small>${escapeHtml(genericOf(i))}</small></div>
        <div class="meta"><span>${sellableOf(i)} ${escapeHtml(i.pack_unit || "pcs")}</span><span>${money(rateFor(i))}</span></div>
        <div class="stock ${out ? "out" : low ? "low" : "ok"}">${escapeHtml(i.code)} · GST ${escapeHtml(i.gst_rate)}%</div>
      </button>`;
    })
    .join("");
}

function cartTotals() {
  const interstate = Pharmacy.isInterstate(state.company.gstin, customer()?.gstin);
  const lines = state.cart.map((line) => {
    const item = state.items.find((i) => i.id === line.itemId);
    if (!item) return null;
    return Pharmacy.saleLineTotals({
      qty: line.qty,
      rate: rateFor(item),
      mrp: item.mrp,
      gstRate: item.gst_rate,
      interstate,
    });
  }).filter(Boolean);
  const billDiscount = Number($("bill-discount")?.value) || 0;
  const method = $("pay-method")?.value;
  const paidRaw = $("bill-paid")?.value;
  const draft = Pharmacy.billTotals({ lines, billDiscount, amountPaid: 0 });
  const amountPaid = paidRaw === "" || paidRaw == null ? (method === "credit" ? 0 : draft.grandTotal) : Number(paidRaw) || 0;
  return { ...Pharmacy.billTotals({ lines, billDiscount, amountPaid }), qty: lines.reduce((s, l) => s + l.qty, 0) };
}

function renderCart() {
  if ($("chosen-pack")) $("chosen-pack").textContent = packLabel();
  if (!state.cart.length) {
    $("lines").innerHTML = `<p class="hint">Tap a medicine to add 1 pack. Batch is picked FEFO (earliest expiry first).</p>`;
  } else {
    $("lines").innerHTML = state.cart
      .map((line) => {
        const item = state.items.find((i) => i.id === line.itemId);
        if (!item) return "";
        const batch = batchesFor(item.id)[0];
        const exp = batch?.expiry_date ? String(batch.expiry_date).slice(0, 10) : "—";
        return `<div class="line">
          <div>
            <div class="who">${escapeHtml(item.name)}</div>
            <div class="pack">${escapeHtml(genericOf(item))} · ${escapeHtml(item.pack_unit || "Strip")} · Batch ${escapeHtml(batch?.batch_no || "OPEN")} · Exp ${escapeHtml(exp)}</div>
          </div>
          <div>
            <div class="qty">
              <button type="button" data-chg="${escapeHtml(item.id)}" data-d="-1">−</button>
              <span>${line.qty}</span>
              <button type="button" data-chg="${escapeHtml(item.id)}" data-d="1">+</button>
            </div>
            <div class="pack" style="text-align:right;margin-top:4px">${money(lineAmt(item, line.qty))}</div>
          </div>
        </div>`;
      })
      .join("");
  }
  const t = cartTotals();
  $("qty-total").textContent = String(t.qty);
  $("taxable").textContent = money(t.subtotal ?? t.taxable);
  if ($("disc-total")) $("disc-total").textContent = money(t.discount);
  if ($("cgst-total")) $("cgst-total").textContent = money(t.cgst);
  if ($("sgst-total")) $("sgst-total").textContent = money(t.igst ? t.igst : t.sgst);
  if ($("round-total")) $("round-total").textContent = money(t.roundOff);
  $("total").textContent = money(t.grandTotal ?? (t.taxable + t.tax));
  if ($("due-total")) $("due-total").textContent = money(t.due);
  $("btn-pay").disabled = state.cart.length === 0;
  $("btn-clear").disabled = state.cart.length === 0;
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

function renderPackChoice() {}

function addItem(id, qty = 1) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  const line = state.cart.find((l) => l.itemId === id);
  const next = (line ? line.qty : 0) + qty;
  if (next > sellableOf(item)) {
    setHint(`Only ${sellableOf(item)} in-date stock for ${item.name}`, "error");
    return;
  }
  if (line) line.qty = Math.max(0, next);
  else state.cart.push({ itemId: id, qty });
  state.cart = state.cart.filter((l) => l.qty > 0);
  renderCart();
}

function addPack(_packId) {}

function fillDatalists() {
  const cats = [...new Set(state.items.map((i) => i.category).filter(Boolean))];
  const subs = [...new Set(state.items.map((i) => i.subcategory).filter(Boolean))];
  $("category-list").innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}">`).join("");
  $("subcategory-list").innerHTML = subs.map((c) => `<option value="${escapeHtml(c)}">`).join("");
}

function renderItemsTable() {
  $("items-table").innerHTML = `<table><thead><tr>
    <th>Code</th><th>Medicine</th><th>Generic</th><th>Type</th><th>Mfr</th><th>Pack</th><th>MRP</th><th>Sale</th><th>Stock</th><th></th>
  </tr></thead><tbody>${state.items
    .map(
      (i) => `<tr>
      <td>${escapeHtml(i.code)}</td>
      <td>${escapeHtml(i.name)}</td>
      <td>${escapeHtml(genericOf(i) || "—")}</td>
      <td>${escapeHtml(i.medicine_type || "—")}</td>
      <td>${escapeHtml(i.manufacturer || "—")}</td>
      <td>${escapeHtml(i.pack_size || i.pack_unit || "—")}</td>
      <td>${money(i.mrp)}</td>
      <td>${money(i.selling_price || i.retail_rate)}</td>
      <td class="${stockOf(i) <= Number(i.reorder_level_gm) ? "stock low" : "stock ok"}">${stockOf(i)}</td>
      <td><button class="btn" data-edit-item="${escapeHtml(i.id)}" type="button">Edit</button></td>
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

function renderPackCompose() {}

function poLineHtml(i) {
  const id = i?.id || "";
  const options = `<option value="">Select medicine</option>` + activeItems()
    .map((m) => `<option value="${escapeHtml(m.id)}" ${m.id === id ? "selected" : ""}>${escapeHtml(m.name)}</option>`)
    .join("");
  return `<div class="po-line" data-po-row>
    <select data-po-item>${options}</select>
    <input data-po-generic placeholder="Generic" value="${escapeHtml(i?.generic_name || i?.local_name || "")}" />
    <input data-po-mfr placeholder="Manufacturer" value="${escapeHtml(i?.manufacturer || "")}" />
    <input data-po-hsn placeholder="HSN" value="${escapeHtml(i?.hsn || "")}" />
    <input data-po-batch placeholder="Batch No. *" required />
    <input data-po-exp type="date" required />
    <select data-po-pack>
      ${["Strip", "Box", "Bottle", "Tube", "Packet"].map((p) => `<option ${p === (i?.pack_unit || "Strip") ? "selected" : ""}>${p}</option>`).join("")}
    </select>
    <input data-po-qty type="number" min="0" step="1" value="1" placeholder="Pack qty" />
    <input data-po-upp type="number" min="1" value="${escapeHtml(i?.units_per_pack || 1)}" placeholder="Units/pack" />
    <input data-po-free type="number" min="0" value="0" placeholder="Free" />
    <input data-po-rate type="number" step="0.01" value="${escapeHtml(i?.purchase_rate || 0)}" placeholder="Rate" />
    <input data-po-mrp type="number" step="0.01" value="${escapeHtml(i?.mrp || 0)}" placeholder="MRP" />
    <input data-po-disc type="number" step="0.01" value="0" placeholder="Disc" />
    <input data-po-gst type="number" step="0.01" value="${escapeHtml(i?.gst_rate || 12)}" placeholder="GST %" />
    <button class="btn danger" type="button" data-po-remove>×</button>
  </div>`;
}

function renderPoLines() {
  if (!$("po-lines")) return;
  if (!$("po-lines").children.length) {
    $("po-lines").innerHTML = poLineHtml(activeItems()[0]);
  }
}

function renderPacksTable() {}

function renderSettings() {
  $("set-name").value = state.company.name || "";
  $("set-address").value = state.company.address || "";
  $("set-phone").value = state.company.phone || "";
  $("set-email").value = state.company.email || "";
  $("set-gstin").value = state.company.gstin || "";
  if ($("set-state")) $("set-state").value = state.company.state || "";
  if ($("set-scode")) $("set-scode").value = state.company.state_code || "";
  if ($("set-dl")) $("set-dl").value = state.company.drug_licence_no || "";
  if ($("set-dl-type")) $("set-dl-type").value = state.company.drug_licence_type || "";
  if ($("set-fssai")) $("set-fssai").value = state.company.fssai_licence_no || "";
  if ($("set-preg")) $("set-preg").value = state.company.pharmacy_registration_no || "";
  if ($("set-other")) $("set-other").value = state.company.other_licence_no || "";
  if ($("set-lexp")) $("set-lexp").value = String(state.company.licence_expiry || "").slice(0, 10);
  state.logoDraft = null;
  $("set-logo").value = "";
  showLogo($("logo-preview"), state.company.logo_url);
}

function renderSupport() {
  $("support-cards").innerHTML = [
    ["Pharmacy", state.company.name],
    ["Address", state.company.address || "—"],
    ["Phone", state.company.phone || "—"],
    ["Email", state.company.email || "—"],
    ["GSTIN", state.company.gstin || "—"],
    ["Drug Licence", state.company.drug_licence_no || "—"],
    ["Licence type", state.company.drug_licence_type || "—"],
    ["FSSAI", state.company.fssai_licence_no || "—"],
    ["Pharmacy registration", state.company.pharmacy_registration_no || "—"],
    ["Other licence", state.company.other_licence_no || "—"],
    ["Licence expiry", state.company.licence_expiry || "—"],
  ]
    .map(([k, v]) => `<div class="report-card"><span>${k}</span><strong>${escapeHtml(v)}</strong></div>`)
    .join("");
}

function paintHeader() {
  $("shop-name").textContent = state.company.name || "Medical POS";
  $("shop-place").textContent = state.company.address || "";
  showLogo($("shop-logo"), state.company.logo_url);
  const mark = $("brand-mark");
  if (mark) mark.hidden = Boolean(state.company.logo_url);
}

async function loadBootstrap() {
  const data = await api("/api/bootstrap");
  state.company = data.company;
  state.items = data.items;
  state.customers = data.customers;
  state.packs = data.packs;
  state.batches = data.batches || [];
  paintHeader();
  renderCustomersSelect();
  renderCatalog();
  renderCart();
  fillDatalists();
  renderItemsTable();
  renderCustomersTable();
  renderPoLines();
  renderSettings();
  loadToday();
  loadSuppliers();
  loadQrOrders(true);
}

async function loadToday() {
  const data = await api("/api/today");
  $("today-total").textContent = money(data.today.takings);
  $("today-count").textContent = String(data.today.bills);
}

async function loadReports() {
  if (!$("rep-from").value) {
    const now = new Date();
    $("rep-from").value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }
  if (!$("rep-to").value) $("rep-to").value = ymd();
  const from = $("rep-from").value;
  const to = $("rep-to").value;
  $("rep-excel-all").href = excelHref();
  $("reports-hint").textContent = "Loading…";
  try {
    const data = await api(`/api/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    const s = data.summary || {};
    $("report-summary").innerHTML = [
      ["Range", `${data.from} → ${data.to}`],
      ["Bills", s.bills],
      ["Taxable", money(s.taxable)],
      ["GST", money(s.gst)],
      ["Takings", money(s.takings)],
      ["Low stock SKUs", (data.low || []).length],
    ]
      .map(([k, v]) => `<div class="report-card"><span>${k}</span><strong>${v}</strong></div>`)
      .join("");
    $("reports").innerHTML = [
      reportBlock("Sales bills", "Sales bills", ["Order", "Customer", "Type", "Status", "Qty", "Taxable", "GST", "Total", "Pay", "Pay status", "Date"], (data.sales || []).map((o) => [o.order_number, o.customer_name, o.customer_type, o.status, Number(o.total_quantity_gm) || 0, Number(o.subtotal) || 0, Number(o.gst) || 0, Number(o.total) || 0, o.payment_method, o.payment_status, String(o.created_at)])),
      reportBlock("Item sales", "Item sales", ["Medicine", "Qty", "Amount", "GST"], (data.byItem || []).map((r) => [r.item_name, Number(r.quantity_gm) || 0, Number(r.amount) || 0, Number(r.gst) || 0])),
      reportBlock("Customer sales", "Customer sales", ["Customer", "Type", "Bills", "Takings", "GST"], (data.byCustomer || []).map((r) => [r.customer_name, r.customer_type, Number(r.bills) || 0, Number(r.takings) || 0, Number(r.gst) || 0])),
      reportBlock("Pack sales", "Pack sales", ["Pack type", "Pack count", "Bills", "Takings"], (data.byPack || []).map((r) => [r.pack_type, Number(r.pack_count) || 0, Number(r.bills) || 0, Number(r.takings) || 0])),
      reportBlock("Payment", "Payment", ["Method", "Bills", "Takings"], (data.byPay || []).map((r) => [r.payment_method, Number(r.bills) || 0, Number(r.takings) || 0])),
      reportBlock("GST daywise", "GST daywise", ["Day", "Taxable", "GST", "Total"], (data.gst || []).map((r) => [String(r.day), Number(r.taxable) || 0, Number(r.gst) || 0, Number(r.total) || 0])),
      reportBlock("Stock", "Stock", ["Code", "Name", "Generic", "Type", "Mfr", "Pack", "Stock", "Reorder", "MRP", "Sale", "Purchase", "GST %"], (data.stock || []).map((i) => [i.code, i.name, i.generic_name || i.local_name, i.medicine_type, i.manufacturer, i.pack_unit, Number(i.stock_gm) || 0, Number(i.reorder_level_gm) || 0, Number(i.mrp) || 0, Number(i.selling_price || i.retail_rate) || 0, Number(i.purchase_rate) || 0, Number(i.gst_rate) || 0])),
      reportBlock("Low stock", "Low stock", ["Code", "Name", "Stock", "Reorder"], (data.low || []).map((i) => [i.code, i.name, Number(i.stock_gm) || 0, Number(i.reorder_level_gm) || 0])),
      reportBlock("Batches", "Batches", ["Code", "Medicine", "Batch", "Expiry", "Qty", "MRP"], (data.batches || []).map((b) => [b.code, b.name, b.batch_no, b.expiry_date, Number(b.qty) || 0, Number(b.mrp) || 0])),
      reportBlock("Expiry", "Expiry", ["Code", "Medicine", "Batch", "Expiry", "Qty"], (data.expiry || []).map((b) => [b.code, b.name, b.batch_no, b.expiry_date, Number(b.qty) || 0])),
      reportBlock("Purchases", "Purchases", ["PO", "Supplier", "Invoice", "Date", "Taxable", "GST", "Total", "Pay", "Status"], (data.purchases || []).map((p) => [p.purchase_number, p.supplier_name, p.supplier_invoice_number, p.purchase_date, Number(p.subtotal) || 0, Number(p.gst) || 0, Number(p.total) || 0, p.payment_method, p.payment_status])),
      reportBlock("Returns", "Returns", ["Return", "Bill", "Customer", "Reason", "Total", "Date"], (data.returns || []).map((r) => [r.return_number, r.order_number, r.customer_name, r.reason, Number(r.total) || 0, String(r.created_at)])),
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

function licenceBlock() {
  const c = state.company || {};
  return [
    "Licence & Registration Details",
    c.drug_licence_no ? `Drug Licence No. ${c.drug_licence_no}${c.drug_licence_type ? ` (${c.drug_licence_type})` : ""}` : "",
    c.gstin ? `GSTIN ${c.gstin}` : "",
    c.fssai_licence_no ? `FSSAI ${c.fssai_licence_no}` : "",
    c.pharmacy_registration_no ? `Pharmacy Registration ${c.pharmacy_registration_no}` : "",
    c.other_licence_no ? `Other licence ${c.other_licence_no}` : "",
    c.licence_expiry ? `Licence valid until ${String(c.licence_expiry).slice(0, 10)}` : "",
  ].filter(Boolean);
}

function receiptText(o) {
  return [
    state.company.name,
    state.company.address,
    state.company.phone ? `Mobile ${state.company.phone}` : "",
    o.order_number,
    String(o.created_at || new Date().toISOString()),
    o.customer_name,
    o.customer_mobile || "",
    o.customer_address || "",
    o.doctor_name || o.prescription_no ? `Doctor / Rx ${o.doctor_name || ""} ${o.prescription_no || ""}` : "",
    "Medicine | Batch | Exp | Pack | Qty | MRP | Rate | GST | Amt",
    "------------------------------",
    ...(o.lines || []).map((l) => {
      const gst = Number(l.gst_rate) || 0;
      return `${l.item_name} | ${l.batch_no || "—"} | ${l.expiry_date ? String(l.expiry_date).slice(0, 10) : "—"} | ${l.pack_type || "—"} | ${l.quantity_gm} | ${money(l.mrp)} | ${money(l.rate_per_kg)} | ${gst}% | ${money(l.amount)}`;
    }),
    "------------------------------",
    `Subtotal ${money(o.subtotal)}`,
    `Discount ${money(o.discount)}`,
    `CGST ${money(o.cgst)}`,
    `SGST ${money(o.sgst)} / IGST ${money(o.igst)}`,
    `Round off ${money(o.round_off)}`,
    `Grand Total ${money(o.total)}`,
    `${o.payment_method} paid ${money(o.amount_paid)} due ${money(Math.max(0, Number(o.total) - Number(o.amount_paid || 0)))}`,
    ...licenceBlock(),
  ]
    .filter((line) => line !== undefined && line !== "")
    .join("\n");
}

function printOrder(o) {
  const w = window.open("", "print", "width=720,height=900");
  const logo = state.company.logo_url
    ? `<img src="${state.company.logo_url}" alt="" style="max-height:80px;max-width:200px;display:block;margin:0 auto 12px">`
    : "";
  w.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(o.order_number)}</title>
    <style>body{font-family:ui-monospace,monospace;padding:24px;text-align:center} h1{font-size:18px} pre{white-space:pre-wrap;text-align:left}</style>
    </head><body>
    ${logo}
    <h1>${escapeHtml(state.company.name || "")}</h1>
    <pre>${escapeHtml(receiptText(o))}</pre>
    <script>window.onload=()=>{window.print();}</script>
    </body></html>`);
  w.document.close();
}

function showOrder(o) {
  $("order-pane").innerHTML = `<pre class="receipt">${escapeHtml(receiptText(o))}</pre>
    <div class="print-actions">
      <button class="btn primary" type="button" data-print="${escapeHtml(o.id)}">Print</button>
      <button class="btn" type="button" data-edit-order="${escapeHtml(o.id)}">Edit</button>
    </div>`;
}

async function loadOrders() {
  orderCache = await api("/api/orders");
  $("orders").innerHTML = orderCache
    .map(
      (o) => `<button class="order-item" type="button" data-oid="${escapeHtml(o.id)}">
        <span>${escapeHtml(o.order_number)} · ${escapeHtml(o.customer_name)}<br>
        <small>${escapeHtml(o.payment_method)} · ${escapeHtml(String(o.created_at || "").slice(0, 16))}</small></span>
        <span>${money(o.total)}</span>
      </button>`,
    )
    .join("");
}

let qrCache = [];

function paintQrBadge(pending) {
  const badge = $("qr-pending-nav");
  if (!badge) return;
  const n = Number(pending) || 0;
  badge.textContent = String(n);
  badge.hidden = n <= 0;
}

function qrStatusButtons(o) {
  if (o.status === "completed" || o.status === "cancelled") return "";
  const next = [
    ["accepted", "Accept"],
    ["preparing", "Preparing"],
    ["ready", "Ready"],
    ["cancelled", "Cancel"],
  ].filter(([status]) => status !== o.status);
  return next
    .map(
      ([status, label]) =>
        `<button class="btn ${status === "cancelled" ? "danger" : ""}" type="button" data-qr-status="${escapeHtml(o.id)}" data-status="${status}">${label}</button>`,
    )
    .join("");
}

function showQrOrder(o) {
  const lines = (o.lines || [])
    .map((l) => `${l.item_name} ${l.quantity_gm} @ ${money(l.rate_per_kg)} = ${money(l.amount)}`)
    .join("\n");
  $("qr-pane").innerHTML = `<pre class="receipt">${escapeHtml(
    [
      o.order_number,
      o.customer_name,
      o.mobile,
      o.table_no ? `Pickup: ${o.table_no}` : "",
      o.notes ? `Notes: ${o.notes}` : "",
      String(o.created_at || ""),
      "------------------------------",
      lines,
      "------------------------------",
      `Subtotal ${money(o.subtotal)}`,
      `GST ${money(o.gst)}`,
      `TOTAL ${money(o.total)}`,
      `Status: ${o.status}`,
      o.sales_order_id ? "Billed to sales order" : "",
    ]
      .filter(Boolean)
      .join("\n"),
  )}</pre>
    <div class="print-actions">
      ${qrStatusButtons(o)}
      ${
        o.status !== "completed" && o.status !== "cancelled"
          ? `<select id="qr-pay"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="credit">Credit</option></select>
             <button class="btn primary" type="button" data-qr-complete="${escapeHtml(o.id)}">Complete &amp; bill</button>`
          : ""
      }
    </div>`;
}

function orderMenuUrl() {
  return new URL("order.html", location.href).href;
}

function paintLocalQr(img, url) {
  if (!img || typeof QRCodeLib === "undefined" || typeof QRCodeLib.toDataURL !== "function") {
    return Promise.reject(new Error("QR library missing"));
  }
  return QRCodeLib.toDataURL(url, { width: 360, margin: 1, errorCorrectionLevel: "M" }).then((dataUrl) => {
    img.src = dataUrl;
    img.dataset.ready = "1";
    return dataUrl;
  });
}

async function showQrPoster() {
  const img = $("qr-code-img");
  const fallback = orderMenuUrl();
  if ($("qr-open")) $("qr-open").href = "./order.html";
  let url = fallback;
  if ($("qr-link")) {
    $("qr-link").textContent = url;
    $("qr-link").className = "hint";
  }
  if (!img) return;

  try {
    await paintLocalQr(img, url);
  } catch {
    img.src = `/api/qr/code?t=${Date.now()}`;
  }

  try {
    const link = await api("/api/qr/link");
    if (link.url) url = link.url;
    if ($("qr-link")) $("qr-link").textContent = url;
    if (link.dataUrl) {
      img.src = link.dataUrl;
      img.dataset.ready = "1";
    } else {
      await paintLocalQr(img, url);
    }
  } catch {
    /* local QR already drawn */
  }
}

async function loadQrOrders(silent = false) {
  await showQrPoster();
  try {
    const data = await api("/api/qr-orders");
    qrCache = data.orders || [];
    paintQrBadge(data.pending);
    if (!$("qr-orders")) return;
    $("qr-orders").innerHTML = qrCache.length
      ? qrCache
          .map(
            (o) => `<button class="order-item" type="button" data-qid="${escapeHtml(o.id)}">
        <span>${escapeHtml(o.order_number)} · ${escapeHtml(o.customer_name)}<br>
        <small>${escapeHtml(o.table_no || "Shop")} · ${escapeHtml(o.mobile)}</small></span>
        <span><span class="qr-status ${escapeHtml(o.status)}">${escapeHtml(o.status)}</span><br>${money(o.total)}</span>
      </button>`,
          )
          .join("")
      : `<p class="hint">No QR orders yet. Print the poster so customers can scan.</p>`;
  } catch (err) {
    if (!silent && $("qr-orders")) $("qr-orders").innerHTML = `<p class="hint error">${escapeHtml(err.message)}</p>`;
  }
}

function printQrPoster() {
  const url = $("qr-link")?.textContent?.split(" — ")[0] || orderMenuUrl();
  const src = $("qr-code-img")?.src || `/api/qr/code`;
  const w = window.open("", "qr-poster", "width=640,height=860");
  const logo = state.company.logo_url
    ? `<img src="${state.company.logo_url}" alt="" style="max-height:72px;max-width:180px;display:block;margin:0 auto 12px">`
    : "";
  w.document.write(`<!DOCTYPE html><html><head><title>QR order poster</title>
    <style>body{font-family:Georgia,serif;text-align:center;padding:36px;color:#4a1416} img.qr{width:280px;height:280px;background:#fff;padding:12px} p{color:#7a5c48}</style>
    </head><body>
    ${logo}
    <h1>${escapeHtml(state.company.name || "Pharmacy")}</h1>
    <p>Scan to order medicines</p>
    <img class="qr" src="${escapeHtml(src)}" alt="QR">
    <p>${escapeHtml(url)}</p>
    <script>window.onload=()=>{window.print();}</script>
    </body></html>`);
  w.document.close();
}

async function loadPurchases() {
  const rows = await api("/api/purchases");
  $("purchases-table").innerHTML = `<table><thead><tr>
    <th>PO</th><th>Supplier</th><th>Date</th><th>Invoice</th><th>Pay</th><th>Lines</th><th>Total</th>
  </tr></thead><tbody>${rows
    .map(
      (p) => `<tr>
      <td>${escapeHtml(p.purchase_number)}</td>
      <td>${escapeHtml(p.supplier_name)}</td>
      <td>${escapeHtml(String(p.purchase_date || "").slice(0, 10))}</td>
      <td>${escapeHtml(p.supplier_invoice_number || "—")}</td>
      <td>${escapeHtml(p.payment_method || "")}</td>
      <td>${(p.lines || []).map((l) => `${escapeHtml(l.item_name)} ${l.batch_no || ""} × ${l.pack_qty || l.quantity_gm}`).join(", ") || "—"}</td>
      <td>${money(p.total)}</td>
    </tr>`,
    )
    .join("")}</tbody></table>`;
}

async function loadSuppliers() {
  const rows = await api("/api/suppliers");
  state.suppliers = rows;
  if ($("po-supplier")) {
    $("po-supplier").innerHTML = rows
      .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)
      .join("");
  }
  $("suppliers-table").innerHTML = `<table><thead><tr>
    <th>Code</th><th>Name</th><th>Firm</th><th>Mobile</th><th>GSTIN</th><th>DL No.</th><th>City</th>
  </tr></thead><tbody>${rows
    .map(
      (s) => `<tr>
      <td>${escapeHtml(s.code)}</td>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.firm_name || "—")}</td>
      <td>${escapeHtml(s.mobile || "—")}</td>
      <td>${escapeHtml(s.gstin || "—")}</td>
      <td>${escapeHtml(s.drug_licence_no || "—")}</td>
      <td>${escapeHtml(s.city || "—")}</td>
    </tr>`,
    )
    .join("")}</tbody></table>`;
}

async function loadBatches() {
  const rows = await api("/api/batches").catch(() => state.batches || []);
  state.batches = rows;
  const P = Pharmacy;
  const expired = rows.filter((b) => P && P.expiryStatus(b.expiry_date) === "expired");
  const near = rows.filter((b) => P && P.expiryStatus(b.expiry_date) === "near");
  $("batch-summary").innerHTML = [
    ["Batches", rows.length],
    ["Near expiry", near.length],
    ["Expired", expired.length],
  ]
    .map(([k, v]) => `<div class="report-card"><span>${k}</span><strong>${v}</strong></div>`)
    .join("");
  $("batches-table").innerHTML = `<table><thead><tr>
    <th>Medicine</th><th>Generic</th><th>Batch</th><th>Expiry</th><th>Qty</th><th>MRP</th><th>Status</th>
  </tr></thead><tbody>${rows
    .map((b) => {
      const st = P ? P.expiryStatus(b.expiry_date) : "";
      return `<tr class="exp-${st}">
      <td>${escapeHtml(b.item_name)}</td>
      <td>${escapeHtml(b.generic_name || "—")}</td>
      <td>${escapeHtml(b.batch_no)}</td>
      <td>${escapeHtml(String(b.expiry_date || "").slice(0, 10))}</td>
      <td>${Number(b.qty) || 0}</td>
      <td>${money(b.mrp)}</td>
      <td class="stock ${st === "expired" ? "out" : st === "near" ? "low" : "ok"}">${st || "—"}</td>
    </tr>`;
    })
    .join("")}</tbody></table>`;
}

async function loadReturns() {
  const orders = await api("/api/orders");
  orderCache = orders;
  $("ret-order").innerHTML = orders
    .map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.order_number)} · ${escapeHtml(o.customer_name)}</option>`)
    .join("");
  paintReturnLines();
  const rows = await api("/api/returns").catch(() => []);
  $("returns-table").innerHTML = `<table><thead><tr>
    <th>Return</th><th>Bill</th><th>Customer</th><th>Reason</th><th>Total</th>
  </tr></thead><tbody>${rows
    .map(
      (r) => `<tr>
      <td>${escapeHtml(r.return_number)}</td>
      <td>${escapeHtml(r.order_number)}</td>
      <td>${escapeHtml(r.customer_name || "")}</td>
      <td>${escapeHtml(r.reason || "—")}</td>
      <td>${money(r.total)}</td>
    </tr>`,
    )
    .join("")}</tbody></table>`;
}

function paintReturnLines() {
  const o = orderCache.find((row) => row.id === $("ret-order")?.value);
  if (!$("ret-lines")) return;
  $("ret-lines").innerHTML = (o?.lines || [])
    .map(
      (l) => `<label>
        <input type="checkbox" data-ret-line="${escapeHtml(l.id)}" />
        ${escapeHtml(l.item_name)} · ${escapeHtml(l.batch_no || "OPEN")} · billed ${l.quantity_gm}
        <input type="number" min="0" max="${escapeHtml(l.quantity_gm)}" value="${escapeHtml(l.quantity_gm)}" data-ret-qty="${escapeHtml(l.id)}" />
      </label>`,
    )
    .join("") || `<p class="hint">Select a bill.</p>`;
}

$("catalog").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-add]");
  if (btn) addItem(btn.dataset.add, 1);
});
$("lines").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-chg]");
  if (!btn) return;
  addItem(btn.dataset.chg, Number(btn.dataset.d));
});

$("items-table").addEventListener("click", async (e) => {
  const edit = e.target.closest("[data-edit-item]");
  if (!edit) return;
  const i = state.items.find((x) => x.id === edit.dataset.editItem);
  if (!i) return;
  $("item-id").value = i.id;
  $("item-name").value = i.name;
  $("item-local").value = genericOf(i);
  if ($("item-type")) $("item-type").value = i.medicine_type || "Tablet";
  $("item-category").value = i.category || "Medical";
  if ($("item-mfr")) $("item-mfr").value = i.manufacturer || "";
  if ($("item-hsn")) $("item-hsn").value = i.hsn || "";
  if ($("item-pack-size")) $("item-pack-size").value = i.pack_size || "";
  if ($("item-unit")) $("item-unit").value = i.pack_unit || "Strip";
  if ($("item-upp")) $("item-upp").value = i.units_per_pack || 1;
  if ($("item-mrp")) $("item-mrp").value = i.mrp || "";
  $("item-retail").value = i.selling_price || i.retail_rate;
  $("item-purchase").value = i.purchase_rate;
  $("item-gst").value = i.gst_rate;
  if ($("item-barcode")) $("item-barcode").value = i.barcode || "";
  if ($("item-expiry")) $("item-expiry").value = String(i.default_expiry || "").slice(0, 10);
  if ($("item-reorder")) $("item-reorder").value = i.reorder_level_gm || 0;
});

$("orders").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-oid]");
  if (!btn) return;
  const o = orderCache.find((row) => row.id === btn.dataset.oid);
  if (o) showOrder(o);
});

$("qr-orders").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-qid]");
  if (!btn) return;
  const o = qrCache.find((row) => row.id === btn.dataset.qid);
  if (o) showQrOrder(o);
});

$("qr-pane").addEventListener("click", async (e) => {
  const statusBtn = e.target.closest("[data-qr-status]");
  const completeBtn = e.target.closest("[data-qr-complete]");
  try {
    if (statusBtn) {
      await api(`/api/qr-orders/${statusBtn.dataset.qrStatus}`, {
        method: "PATCH",
        body: JSON.stringify({ status: statusBtn.dataset.status }),
      });
      await loadQrOrders();
      const o = qrCache.find((row) => row.id === statusBtn.dataset.qrStatus);
      if (o) showQrOrder(o);
    }
    if (completeBtn) {
      const pay = $("qr-pay")?.value || "cash";
      const data = await api(`/api/qr-orders/${completeBtn.dataset.qrComplete}/complete`, {
        method: "POST",
        body: JSON.stringify({ paymentMethod: pay }),
      });
      await loadQrOrders();
      await loadToday();
      const o = qrCache.find((row) => row.id === completeBtn.dataset.qrComplete);
      if (o) showQrOrder(o);
      setHint(`Billed ${data.sale?.order_number || ""} · ${money(data.sale?.total)}`, "ok");
    }
  } catch (err) {
    $("qr-pane").insertAdjacentHTML("beforeend", `<p class="hint error">${escapeHtml(err.message)}</p>`);
  }
});

$("qr-print").addEventListener("click", printQrPoster);
$("qr-refresh").addEventListener("click", () => loadQrOrders());

$("order-pane").addEventListener("click", (e) => {
  const printBtn = e.target.closest("[data-print]");
  const editBtn = e.target.closest("[data-edit-order]");
  if (printBtn) {
    const o = orderCache.find((row) => row.id === printBtn.dataset.print);
    if (o) printOrder(o);
  }
  if (editBtn) {
    const o = orderCache.find((row) => row.id === editBtn.dataset.editOrder);
    if (!o) return;
    state.editingOrderId = o.id;
    state.customerId = o.customer_id;
    state.cart = Pharmacy.mergeSaleLines(
      (o.lines || []).map((l) => ({ itemId: l.item_id, qty: Number(l.quantity_gm) })),
    ).map((l) => ({ itemId: l.itemId, qty: l.qty }));
    state.lastPack = null;
    $("customer").value = state.customerId;
    $("pay-method").value = o.payment_method || "cash";
    if ($("bill-doctor")) $("bill-doctor").value = o.doctor_name || "";
    if ($("bill-rx")) $("bill-rx").value = o.prescription_no || "";
    showView("counter");
    renderCart();
    setHint(`Editing ${o.order_number}`, "ok");
  }
});

$("search").addEventListener("input", () => {
  state.query = $("search").value;
  renderCatalog();
});
$("search-form").addEventListener("submit", (e) => e.preventDefault());
$("customer").addEventListener("change", () => {
  state.customerId = $("customer").value;
  renderCatalog();
  renderCart();
});
$("btn-clear").addEventListener("click", () => {
  state.cart = [];
  state.lastPack = null;
  state.editingOrderId = null;
  setHint("Cart cleared");
  renderCart();
});

$("btn-pay").addEventListener("click", async () => {
  try {
    setHint("Saving…");
    const payload = {
      customerId: state.customerId,
      paymentMethod: $("pay-method").value,
      doctorName: ($("bill-doctor")?.value || "").trim(),
      prescriptionNo: ($("bill-rx")?.value || "").trim(),
      discount: Number($("bill-discount")?.value) || 0,
      amountPaid: $("bill-paid")?.value === "" ? undefined : Number($("bill-paid")?.value),
      lines: Pharmacy.mergeSaleLines(state.cart.map((l) => ({ itemId: l.itemId, quantity: l.qty }))),
    };
    const result = state.editingOrderId
      ? await api(`/api/orders/${state.editingOrderId}`, { method: "PUT", body: JSON.stringify(payload) })
      : await api("/api/checkout", { method: "POST", body: JSON.stringify(payload) });
    const order = result.order;
    state.cart = [];
    state.lastPack = null;
    state.editingOrderId = null;
    setHint(`Saved ${order.order_number} · ${money(order.total)}`, "ok");
    showOrder(order);
    $("modal-title").textContent = order.order_number;
    $("modal-body").innerHTML = `<pre class="receipt">${escapeHtml(receiptText(order))}</pre>
      <div class="print-actions"><button class="btn primary" type="button" id="modal-print">Print</button></div>`;
    $("modal").hidden = false;
    $("modal-print").onclick = () => printOrder(order);
    await loadBootstrap();
  } catch (err) {
    setHint(err.message, "error");
  }
});

$("modal-close").addEventListener("click", () => {
  $("modal").hidden = true;
});
document.querySelector(".nav").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-view]");
  if (btn) showView(btn.dataset.view);
});

$("item-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    name: $("item-name").value,
    generic_name: $("item-local").value,
    local_name: $("item-local").value,
    medicine_type: $("item-type")?.value,
    category: $("item-category").value || "Medical",
    manufacturer: $("item-mfr")?.value,
    hsn: $("item-hsn")?.value,
    pack_size: $("item-pack-size")?.value,
    pack_unit: $("item-unit")?.value,
    units_per_pack: $("item-upp")?.value,
    mrp: $("item-mrp")?.value,
    selling_price: $("item-retail").value,
    retail_rate: $("item-retail").value,
    purchase_rate: $("item-purchase").value,
    gst_rate: $("item-gst").value,
    barcode: $("item-barcode")?.value,
    default_expiry: $("item-expiry")?.value,
    reorder_level: $("item-reorder")?.value,
  };
  try {
    if ($("item-id").value) await api(`/api/items/${$("item-id").value}`, { method: "PUT", body: JSON.stringify(body) });
    else await api("/api/items", { method: "POST", body: JSON.stringify(body) });
    $("item-hint").textContent = "Saved";
    $("item-hint").className = "hint ok";
    $("item-form").reset();
    $("item-id").value = "";
    await loadBootstrap();
  } catch (err) {
    $("item-hint").textContent = err.message;
    $("item-hint").className = "hint error";
  }
});
$("item-cancel").addEventListener("click", () => {
  $("item-form").reset();
  $("item-id").value = "";
});

$("customer-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/customers", {
      method: "POST",
      body: JSON.stringify({
        name: $("cust-name").value,
        business_name: $("cust-biz").value,
        mobile: $("cust-mobile").value,
        type: $("cust-type").value,
        gstin: $("cust-gstin").value,
        address: $("cust-address")?.value,
      }),
    });
    $("cust-hint").textContent = "Saved";
    $("cust-hint").className = "hint ok";
    $("customer-form").reset();
    await loadBootstrap();
  } catch (err) {
    $("cust-hint").textContent = err.message;
    $("cust-hint").className = "hint error";
  }
});

$("purchase-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const lines = [...document.querySelectorAll("[data-po-row]")].map((row) => ({
    item_id: row.querySelector("[data-po-item]")?.value,
    generic_name: row.querySelector("[data-po-generic]")?.value,
    manufacturer: row.querySelector("[data-po-mfr]")?.value,
    hsn: row.querySelector("[data-po-hsn]")?.value,
    batch_no: row.querySelector("[data-po-batch]")?.value,
    expiry_date: row.querySelector("[data-po-exp]")?.value,
    pack_type: row.querySelector("[data-po-pack]")?.value,
    pack_qty: row.querySelector("[data-po-qty]")?.value,
    units_per_pack: row.querySelector("[data-po-upp]")?.value,
    free_qty: row.querySelector("[data-po-free]")?.value,
    purchase_rate: row.querySelector("[data-po-rate]")?.value,
    mrp: row.querySelector("[data-po-mrp]")?.value,
    discount: row.querySelector("[data-po-disc]")?.value,
    gst_rate: row.querySelector("[data-po-gst]")?.value,
  })).filter((l) => l.item_id);
  try {
    await api("/api/purchases", {
      method: "POST",
      body: JSON.stringify({
        supplier_id: $("po-supplier").value,
        supplier_invoice_number: $("po-invoice").value,
        purchase_date: $("po-date").value,
        payment_method: $("po-pay").value,
        due_date: $("po-due")?.value,
        purchase_order_no: $("po-pono")?.value,
        eway_bill_no: $("po-eway")?.value,
        lines,
      }),
    });
    $("po-hint").textContent = "Saved";
    $("po-hint").className = "hint ok";
    await loadBootstrap();
    await loadPurchases();
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
        firm_name: $("sup-firm")?.value,
        company_name: $("sup-firm")?.value,
        address: $("sup-address")?.value,
        contact_name: $("sup-name").value,
        mobile: $("sup-mobile").value,
        email: $("sup-email")?.value,
        gstin: $("sup-gstin").value,
        drug_licence_no: $("sup-dl")?.value,
        pan: $("sup-pan")?.value,
        fssai_licence_no: $("sup-fssai")?.value,
        licence_expiry: $("sup-lexp")?.value,
        state: $("sup-state")?.value,
        state_code: $("sup-scode")?.value,
        city: $("sup-city")?.value,
        pincode: $("sup-pin")?.value,
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

$("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const payload = {
      name: $("set-name").value,
      address: $("set-address").value,
      phone: $("set-phone").value,
      email: $("set-email").value,
      gstin: $("set-gstin").value,
      state: $("set-state")?.value,
      state_code: $("set-scode")?.value,
      drug_licence_no: $("set-dl")?.value,
      drug_licence_type: $("set-dl-type")?.value,
      fssai_licence_no: $("set-fssai")?.value,
      pharmacy_registration_no: $("set-preg")?.value,
      other_licence_no: $("set-other")?.value,
      licence_expiry: $("set-lexp")?.value,
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
  showLogo($("logo-preview"), "");
  $("settings-hint").textContent = "Logo will be removed on Save";
  $("settings-hint").className = "hint";
});

$("report-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await loadReports();
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

$("po-date").value = new Date().toISOString().slice(0, 10);

$("po-add-line")?.addEventListener("click", () => {
  $("po-lines").insertAdjacentHTML("beforeend", poLineHtml());
});
$("po-lines")?.addEventListener("click", (e) => {
  if (e.target.closest("[data-po-remove]")) e.target.closest("[data-po-row]")?.remove();
});
$("po-lines")?.addEventListener("change", (e) => {
  const sel = e.target.closest("[data-po-item]");
  if (!sel) return;
  const item = state.items.find((i) => i.id === sel.value);
  const row = sel.closest("[data-po-row]");
  if (!item || !row) return;
  row.querySelector("[data-po-generic]").value = genericOf(item);
  row.querySelector("[data-po-mfr]").value = item.manufacturer || "";
  row.querySelector("[data-po-hsn]").value = item.hsn || "";
  row.querySelector("[data-po-pack]").value = item.pack_unit || "Strip";
  row.querySelector("[data-po-upp]").value = item.units_per_pack || 1;
  row.querySelector("[data-po-rate]").value = item.purchase_rate || 0;
  row.querySelector("[data-po-mrp]").value = item.mrp || item.retail_rate || 0;
  row.querySelector("[data-po-gst]").value = item.gst_rate || 12;
});
$("bill-discount")?.addEventListener("input", renderCart);
$("bill-paid")?.addEventListener("input", renderCart);
$("pay-method")?.addEventListener("change", renderCart);
$("ret-order")?.addEventListener("change", paintReturnLines);
$("return-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const lines = [...document.querySelectorAll("[data-ret-line]:checked")].map((box) => ({
    line_id: box.dataset.retLine,
    quantity: Number(document.querySelector(`[data-ret-qty="${box.dataset.retLine}"]`)?.value),
  }));
  try {
    await api("/api/returns", {
      method: "POST",
      body: JSON.stringify({
        order_id: $("ret-order").value,
        reason: $("ret-reason").value,
        lines,
      }),
    });
    $("ret-hint").textContent = "Returned to batch stock";
    $("ret-hint").className = "hint ok";
    await loadBootstrap();
    await loadReturns();
  } catch (err) {
    $("ret-hint").textContent = err.message;
    $("ret-hint").className = "hint error";
  }
});

function tick() {
  $("clock").textContent = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
tick();
setInterval(tick, 15000);
showQrPoster().catch(() => {});
setInterval(() => loadQrOrders(true), 12000);

loadBootstrap().catch((err) => {
  $("shop-place").textContent = err.message;
  setHint(err.message, "error");
  showQrPoster().catch(() => {});
});
