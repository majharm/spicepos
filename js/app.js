const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

const state = {
  company: {},
  items: [],
  customers: [],
  packs: [],
  suppliers: [],
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

function kg(gm) {
  return `${(Number(gm) / 1000).toFixed(2)} kg`;
}

function customer() {
  return state.customers.find((c) => c.id === state.customerId) || state.customers[0];
}

function rateFor(item) {
  const type = customer()?.type || "b2c";
  return Number(type === "b2b" ? item.b2b_rate : item.retail_rate);
}

function lineAmt(item, qtyGm) {
  return (Number(qtyGm) / 1000) * rateFor(item);
}

function packLabel() {
  if (!state.lastPack) return "Pack: Loose items (no pack)";
  const pack = state.packs.find((p) => p.id === state.lastPack.id);
  const name = pack?.name || state.lastPack.name || "Pack";
  return `Pack: ${name} × ${state.lastPack.count || 1}`;
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
    [i.name, i.local_name, i.code, i.category, i.subcategory].join(" ").toLowerCase().includes(q),
  );
}

function renderCatalog() {
  $("catalog").innerHTML = filteredItems()
    .map((i) => {
      const low = Number(i.stock_gm) <= Number(i.reorder_level_gm);
      return `<button class="card" type="button" data-add="${escapeHtml(i.id)}">
        <div class="sku">${escapeHtml(i.category)} / ${escapeHtml(i.subcategory || "—")}</div>
        <div class="name">${escapeHtml(i.name)} <small>${escapeHtml(i.local_name || "")}</small></div>
        <div class="meta"><span>${escapeHtml(kg(i.stock_gm))}</span><span>${money(rateFor(i))}/kg</span></div>
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
    $("lines").innerHTML = `<p class="hint">Tap a spice (100 g) or add a pack type.</p>`;
  } else {
    $("lines").innerHTML = state.cart
      .map((line) => {
        const item = state.items.find((i) => i.id === line.itemId);
        if (!item) return "";
        return `<div class="line">
          <div>
            <div class="who">${escapeHtml(item.name)}</div>
            <div class="pack">${escapeHtml(item.category)} / ${escapeHtml(item.subcategory || "—")} · ${escapeHtml(kg(line.qtyGm))}</div>
          </div>
          <div>
            <div class="qty">
              <button type="button" data-chg="${escapeHtml(item.id)}" data-d="-50">−</button>
              <span>${line.qtyGm} g</span>
              <button type="button" data-chg="${escapeHtml(item.id)}" data-d="50">+</button>
            </div>
            <div class="pack" style="text-align:right;margin-top:4px">${money(lineAmt(item, line.qtyGm))}</div>
          </div>
        </div>`;
      })
      .join("");
  }
  const t = cartTotals();
  $("qty-total").textContent = `${t.qty} g`;
  $("taxable").textContent = money(t.taxable);
  $("tax").textContent = money(t.tax);
  $("total").textContent = money(t.taxable + t.tax);
  $("btn-pay").disabled = state.cart.length === 0;
  $("btn-clear").disabled = state.cart.length === 0;
  $("btn-pay").textContent = state.editingOrderId ? "Save" : "Save";
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

function addItem(id, qtyGm = 100) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  const line = state.cart.find((l) => l.itemId === id);
  if (line) line.qtyGm = Math.max(0, line.qtyGm + qtyGm);
  else state.cart.push({ itemId: id, qtyGm });
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
    <th>Code</th><th>Item</th><th>Category</th><th>Subcategory</th><th>Retail</th><th>B2B</th><th>Stock</th><th></th>
  </tr></thead><tbody>${state.items
    .map(
      (i) => `<tr>
      <td>${escapeHtml(i.code)}</td>
      <td>${escapeHtml(i.name)}</td>
      <td>${escapeHtml(i.category)}</td>
      <td>${escapeHtml(i.subcategory || "—")}</td>
      <td>${money(i.retail_rate)}</td>
      <td>${money(i.b2b_rate)}</td>
      <td class="${Number(i.stock_gm) <= Number(i.reorder_level_gm) ? "stock low" : "stock ok"}">${escapeHtml(kg(i.stock_gm))}</td>
      <td><button class="btn" data-edit-item="${escapeHtml(i.id)}" type="button">Edit</button>
          <button class="btn" data-recv="${escapeHtml(i.id)}" type="button">+1 kg</button></td>
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
        <input type="number" min="0" step="50" value="500" data-pack-qty="${escapeHtml(i.id)}" /> g
      </label>`,
    )
    .join("");
}

function renderPoLines() {
  $("po-lines").innerHTML = activeItems()
    .map(
      (i) => `<label>
        <input type="checkbox" data-po-item="${escapeHtml(i.id)}" />
        ${escapeHtml(i.name)}
        <input type="number" min="0" step="50" value="1000" data-po-qty="${escapeHtml(i.id)}" /> g
        <input type="number" step="0.01" value="${escapeHtml(i.purchase_rate)}" data-po-rate="${escapeHtml(i.id)}" /> ₹/kg
      </label>`,
    )
    .join("");
}

function renderPacksTable() {
  $("packs-table").innerHTML = state.packs
    .map(
      (p) => `<div class="report-card" style="margin:0 20px 12px">
        <strong>${escapeHtml(p.name)}</strong>
        <span>${escapeHtml(p.code)} · ${escapeHtml(kg(p.total_quantity_gm))}</span>
        <p class="hint">${(p.items || [])
          .map((i) => `${escapeHtml(i.spice_name)} ${i.quantity_gm}g`)
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
  state.logoDraft = null;
  $("set-logo").value = "";
  showLogo($("logo-preview"), state.company.logo_url);
}

function renderSupport() {
  $("support-cards").innerHTML = [
    ["Shop", state.company.name],
    ["Address", state.company.address || "—"],
    ["Phone", state.company.phone || "—"],
    ["Email", state.company.email || "swami@atavtelecom.in"],
    ["GSTIN", state.company.gstin || "—"],
  ]
    .map(([k, v]) => `<div class="report-card"><span>${k}</span><strong>${escapeHtml(v)}</strong></div>`)
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
  state.items = data.items;
  state.customers = data.customers;
  state.packs = data.packs;
  paintHeader();
  renderCustomersSelect();
  renderCatalog();
  renderCart();
  renderPackChoice();
  fillDatalists();
  renderItemsTable();
  renderCustomersTable();
  renderPackCompose();
  renderPacksTable();
  renderSettings();
  renderPoLines();
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
      reportBlock("Sales bills", "Sales bills", ["Order", "Customer", "Type", "Pack", "Pack count", "Status", "Qty g", "Taxable", "GST", "Total", "Pay", "Pay status", "Date"], (data.sales || []).map((o) => [o.order_number, o.customer_name, o.customer_type, o.pack_name || "Loose items", Number(o.pack_count) || 0, o.status, Number(o.total_quantity_gm) || 0, Number(o.subtotal) || 0, Number(o.gst) || 0, Number(o.total) || 0, o.payment_method, o.payment_status, String(o.created_at)])),
      reportBlock("Item sales", "Item sales", ["Item", "Qty g", "Amount", "GST"], (data.byItem || []).map((r) => [r.item_name, Number(r.quantity_gm) || 0, Number(r.amount) || 0, Number(r.gst) || 0])),
      reportBlock("Customer sales", "Customer sales", ["Customer", "Type", "Bills", "Takings", "GST"], (data.byCustomer || []).map((r) => [r.customer_name, r.customer_type, Number(r.bills) || 0, Number(r.takings) || 0, Number(r.gst) || 0])),
      reportBlock("Pack sales", "Pack sales", ["Pack type", "Pack count", "Bills", "Takings"], (data.byPack || []).map((r) => [r.pack_type, Number(r.pack_count) || 0, Number(r.bills) || 0, Number(r.takings) || 0])),
      reportBlock("Payment", "Payment", ["Method", "Bills", "Takings"], (data.byPay || []).map((r) => [r.payment_method, Number(r.bills) || 0, Number(r.takings) || 0])),
      reportBlock("GST daywise", "GST daywise", ["Day", "Taxable", "GST", "Total"], (data.gst || []).map((r) => [String(r.day), Number(r.taxable) || 0, Number(r.gst) || 0, Number(r.total) || 0])),
      reportBlock("Stock", "Stock", ["Code", "Name", "Local", "Category", "Subcategory", "Stock g", "Reorder g", "Retail", "B2B", "Purchase", "GST %"], (data.stock || []).map((i) => [i.code, i.name, i.local_name, i.category, i.subcategory, Number(i.stock_gm) || 0, Number(i.reorder_level_gm) || 0, Number(i.retail_rate) || 0, Number(i.b2b_rate) || 0, Number(i.purchase_rate) || 0, Number(i.gst_rate) || 0])),
      reportBlock("Low stock", "Low stock", ["Code", "Name", "Stock g", "Reorder g"], (data.low || []).map((i) => [i.code, i.name, Number(i.stock_gm) || 0, Number(i.reorder_level_gm) || 0])),
      reportBlock("Purchases", "Purchases", ["PO", "Supplier", "Invoice", "Date", "Taxable", "GST", "Total", "Pay", "Status"], (data.purchases || []).map((p) => [p.purchase_number, p.supplier_name, p.supplier_invoice_number, p.purchase_date, Number(p.subtotal) || 0, Number(p.gst) || 0, Number(p.total) || 0, p.payment_method, p.payment_status])),
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

function receiptText(o) {
  const pack =
    o.pack_name
      ? `Pack type: ${o.pack_name} × ${o.pack_count || 1}`
      : "Pack type: Loose items (no pack)";
  return [
    state.company.name,
    state.company.address,
    o.order_number,
    o.customer_name,
    pack,
    String(o.created_at || ""),
    "------------------------------",
    ...(o.lines || []).map(
      (l) => `${l.item_name} ${l.quantity_gm}g @ ${l.rate_per_kg}/kg = ${money(l.amount)}`,
    ),
    "------------------------------",
    `Subtotal ${money(o.subtotal)}`,
    `GST ${money(o.gst)}`,
    `TOTAL ${money(o.total)}`,
    `${o.payment_method} · ${o.payment_status}`,
  ]
    .filter((line) => line !== undefined)
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
        <small>${escapeHtml(o.pack_name ? `Pack: ${o.pack_name} × ${o.pack_count || 1}` : "Loose items")} · ${escapeHtml(o.payment_method)}</small></span>
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
    .map((l) => `${l.item_name} ${l.quantity_gm}g @ ${l.rate_per_kg}/kg = ${money(l.amount)}`)
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
    <h1>${escapeHtml(state.company.name || "SWAMI MASALE")}</h1>
    <p>Scan to order spices</p>
    <img class="qr" src="${escapeHtml(src)}" alt="QR">
    <p>${escapeHtml(url)}</p>
    <script>window.onload=()=>{window.print();}</script>
    </body></html>`);
  w.document.close();
}

async function loadPurchases() {
  const rows = await api("/api/purchases");
  $("purchases-table").innerHTML = `<table><thead><tr>
    <th>PO</th><th>Supplier</th><th>Date</th><th>Invoice</th><th>Lines</th><th>Total</th>
  </tr></thead><tbody>${rows
    .map(
      (p) => `<tr>
      <td>${escapeHtml(p.purchase_number)}</td>
      <td>${escapeHtml(p.supplier_name)}</td>
      <td>${escapeHtml(p.purchase_date)}</td>
      <td>${escapeHtml(p.supplier_invoice_number || "—")}</td>
      <td>${(p.lines || []).map((l) => `${escapeHtml(l.item_name)} ${l.quantity_gm}g`).join(", ") || "—"}</td>
      <td>${money(p.total)}</td>
    </tr>`,
    )
    .join("")}</tbody></table>`;
}

async function loadSuppliers() {
  const rows = await api("/api/suppliers");
  state.suppliers = rows;
  $("po-supplier").innerHTML = rows
    .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)
    .join("");
  $("suppliers-table").innerHTML = `<table><thead><tr>
    <th>Code</th><th>Name</th><th>Contact</th><th>Mobile</th><th>GSTIN</th>
  </tr></thead><tbody>${rows
    .map(
      (s) => `<tr>
      <td>${escapeHtml(s.code)}</td>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.contact_name || "—")}</td>
      <td>${escapeHtml(s.mobile || "—")}</td>
      <td>${escapeHtml(s.gstin || "—")}</td>
    </tr>`,
    )
    .join("")}</tbody></table>`;
}

$("catalog").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-add]");
  if (btn) addItem(btn.dataset.add, 100);
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
    await api(`/api/items/${recv.dataset.recv}/receive`, {
      method: "POST",
      body: JSON.stringify({ quantity_gm: 1000 }),
    });
    await loadBootstrap();
    return;
  }
  if (edit) {
    const i = state.items.find((x) => x.id === edit.dataset.editItem);
    if (!i) return;
    $("item-id").value = i.id;
    $("item-name").value = i.name;
    $("item-local").value = i.local_name || "";
    $("item-category").value = i.category || "";
    $("item-subcategory").value = i.subcategory || "";
    $("item-retail").value = i.retail_rate;
    $("item-b2b").value = i.b2b_rate;
    $("item-purchase").value = i.purchase_rate;
    $("item-gst").value = i.gst_rate;
    $("item-stock").value = i.stock_gm;
  }
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
    state.cart = (o.lines || []).map((l) => ({ itemId: l.item_id, qtyGm: Number(l.quantity_gm) }));
    state.lastPack = o.pack_id ? { id: o.pack_id, name: o.pack_name, count: o.pack_count || 1 } : null;
    $("customer").value = state.customerId;
    $("pay-method").value = o.payment_method || "cash";
    $("pack-choice").value = o.pack_id || "";
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
  $("pack-choice").value = "";
  setHint("Cart cleared");
  renderCart();
});

$("btn-pay").addEventListener("click", async () => {
  try {
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
    const order = result.order;
    state.cart = [];
    state.lastPack = null;
    state.editingOrderId = null;
    $("pack-choice").value = "";
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
    local_name: $("item-local").value,
    category: $("item-category").value || "Whole Spices",
    subcategory: $("item-subcategory").value,
    retail_rate: $("item-retail").value,
    b2b_rate: $("item-b2b").value,
    purchase_rate: $("item-purchase").value,
    gst_rate: $("item-gst").value,
    stock_gm: $("item-stock").value,
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
        contact_name: $("sup-contact").value,
        mobile: $("sup-mobile").value,
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

$("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const payload = {
      name: $("set-name").value,
      address: $("set-address").value,
      phone: $("set-phone").value,
      email: $("set-email").value,
      gstin: $("set-gstin").value,
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
