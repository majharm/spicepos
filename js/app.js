const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

const state = {
  company: {},
  items: [],
  customers: [],
  packs: [],
  cart: [],
  query: "",
  customerId: "",
  lastPack: null,
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

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
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
}

function setHint(msg, kind = "") {
  $("hint").textContent = msg || "";
  $("hint").className = `hint ${kind}`.trim();
}

function filteredItems() {
  const q = state.query.trim().toLowerCase();
  if (!q) return state.items;
  return state.items.filter((i) =>
    [i.name, i.local_name, i.code, i.category].join(" ").toLowerCase().includes(q),
  );
}

function renderCatalog() {
  $("catalog").innerHTML = filteredItems()
    .map((i) => {
      const low = Number(i.stock_gm) <= Number(i.reorder_level_gm);
      return `<button class="card" type="button" data-add="${escapeHtml(i.id)}">
        <div class="sku">${escapeHtml(i.code)} · ${escapeHtml(i.category)}</div>
        <div class="name">${escapeHtml(i.name)} <small>${escapeHtml(i.local_name || "")}</small></div>
        <div class="meta"><span>${escapeHtml(kg(i.stock_gm))}</span><span>${money(rateFor(i))}/kg</span></div>
        <div class="stock ${low ? "low" : "ok"}">GST ${escapeHtml(i.gst_rate)}%</div>
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
  if (!state.cart.length) {
    $("lines").innerHTML = `<p class="hint">Tap a spice (qty 100 g) or add a pack.</p>`;
  } else {
    $("lines").innerHTML = state.cart
      .map((line) => {
        const item = state.items.find((i) => i.id === line.itemId);
        if (!item) return "";
        return `<div class="line">
          <div>
            <div class="who">${escapeHtml(item.name)}</div>
            <div class="pack">${escapeHtml(kg(line.qtyGm))} · ${money(rateFor(item))}/kg</div>
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
}

function renderCustomers() {
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

function renderPacksBar() {
  $("pack-bar").innerHTML = state.packs
    .map(
      (p) =>
        `<button class="btn" type="button" data-pack="${escapeHtml(p.id)}">Add ${escapeHtml(p.name)}</button>`,
    )
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
  state.lastPack = { id: pack.id, count: (state.lastPack?.id === pack.id ? state.lastPack.count : 0) + 1 };
  setHint(`Added ${pack.name}`, "ok");
  renderCart();
}

function renderItemsTable() {
  $("items-table").innerHTML = `<table><thead><tr>
    <th>Code</th><th>Item</th><th>Local</th><th>Retail/kg</th><th>B2B/kg</th><th>Stock</th><th></th>
  </tr></thead><tbody>${state.items
    .map(
      (i) => `<tr>
      <td>${escapeHtml(i.code)}</td>
      <td>${escapeHtml(i.name)}</td>
      <td>${escapeHtml(i.local_name || "")}</td>
      <td>${money(i.retail_rate)}</td>
      <td>${money(i.b2b_rate)}</td>
      <td class="${Number(i.stock_gm) <= Number(i.reorder_level_gm) ? "stock low" : "stock ok"}">${escapeHtml(kg(i.stock_gm))}</td>
      <td><button class="btn" data-recv="${escapeHtml(i.id)}" type="button">+1 kg</button></td>
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
}

function paintHeader() {
  $("shop-name").textContent = state.company.name || "SWAMI MASALE";
  $("shop-place").textContent = state.company.address || "MySQL connected";
}

async function loadBootstrap() {
  const data = await api("/api/bootstrap");
  state.company = data.company;
  state.items = data.items;
  state.customers = data.customers;
  state.packs = data.packs;
  paintHeader();
  renderCustomers();
  renderCatalog();
  renderCart();
  renderPacksBar();
  renderItemsTable();
  renderCustomersTable();
  renderPacksTable();
  renderSettings();
  loadReports();
}

async function loadReports() {
  const data = await api("/api/reports");
  const methodMap = Object.fromEntries((data.methods || []).map((m) => [m.payment_method, m.total]));
  $("today-total").textContent = money(data.today.takings);
  $("today-count").textContent = String(data.today.bills);
  $("reports").innerHTML = [
    ["Bills today", data.today.bills],
    ["Takings", money(data.today.takings)],
    ["GST", money(data.today.gst)],
    ["Cash", money(methodMap.cash)],
    ["UPI", money(methodMap.upi)],
    ["Card", money(methodMap.card)],
    ["Credit", money(methodMap.credit)],
    ["Low stock SKUs", (data.low || []).length],
  ]
    .map(
      ([k, v]) =>
        `<div class="report-card"><span>${k}</span><strong>${v}</strong></div>`,
    )
    .join("");
  if (data.low?.length) {
    $("reports").innerHTML += `<div class="report-card"><span>Below reorder</span><p class="hint">${data.low
      .map((i) => `${escapeHtml(i.name)} (${escapeHtml(kg(i.stock_gm))})`)
      .join(", ")}</p></div>`;
  }
}

let orderCache = [];

async function loadOrders() {
  orderCache = await api("/api/orders");
  $("orders").innerHTML = orderCache
    .map(
      (o) => `<button class="order-item" type="button" data-oid="${escapeHtml(o.id)}">
        <span>${escapeHtml(o.order_number)} · ${escapeHtml(o.customer_name)}<br>
        <small>${escapeHtml(o.payment_method)} · ${escapeHtml(o.status)}</small></span>
        <span>${money(o.total)}</span>
      </button>`,
    )
    .join("");
}

async function loadPurchases() {
  const rows = await api("/api/purchases");
  $("purchases-table").innerHTML = `<table><thead><tr>
    <th>PO</th><th>Supplier</th><th>Date</th><th>Invoice</th><th>Total</th><th>Pay</th>
  </tr></thead><tbody>${rows
    .map(
      (p) => `<tr>
      <td>${escapeHtml(p.purchase_number)}</td>
      <td>${escapeHtml(p.supplier_name)}</td>
      <td>${escapeHtml(p.purchase_date)}</td>
      <td>${escapeHtml(p.supplier_invoice_number || "—")}</td>
      <td>${money(p.total)}</td>
      <td>${escapeHtml(p.payment_status)}</td>
    </tr>`,
    )
    .join("")}</tbody></table>`;
}

async function loadSuppliers() {
  const rows = await api("/api/suppliers");
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

$("items-table").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-recv]");
  if (!btn) return;
  await api(`/api/items/${btn.dataset.recv}/receive`, {
    method: "POST",
    body: JSON.stringify({ quantity_gm: 1000 }),
  });
  await loadBootstrap();
});

$("orders").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-oid]");
  if (!btn) return;
  const o = orderCache.find((row) => row.id === btn.dataset.oid);
  if (!o) return;
  $("order-pane").innerHTML = `<pre class="receipt">${escapeHtml(
    [
      state.company.name,
      o.order_number,
      o.customer_name,
      o.created_at,
      "----------------",
      ...(o.lines || []).map((l) => `${l.item_name} ${l.quantity_gm}g @ ${l.rate_per_kg}/kg = ${money(l.amount)}`),
      "----------------",
      `Subtotal ${money(o.subtotal)}`,
      `GST ${money(o.gst)}`,
      `TOTAL ${money(o.total)}`,
      `${o.payment_method} · ${o.payment_status}`,
    ].join("\n"),
  )}</pre>`;
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
  setHint("Cart cleared");
  renderCart();
});
$("btn-pay").addEventListener("click", async () => {
  try {
    setHint("Saving…");
    const order = await api("/api/checkout", {
      method: "POST",
      body: JSON.stringify({
        customerId: state.customerId,
        paymentMethod: $("pay-method").value,
        packId: state.lastPack?.id || null,
        packCount: state.lastPack?.count || null,
        lines: state.cart.map((l) => ({ itemId: l.itemId, quantity_gm: l.qtyGm })),
      }),
    });
    state.cart = [];
    state.lastPack = null;
    setHint(`Saved ${order.order.order_number} · ${money(order.order.total)}`, "ok");
    $("modal-title").textContent = order.order.order_number;
    $("modal-body").innerHTML = `<pre class="receipt">${escapeHtml(
      `${order.order.order_number}\n${order.order.customer_name}\nTOTAL ${money(order.order.total)}\n${order.order.payment_method}`,
    )}</pre>`;
    $("modal").hidden = false;
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
$("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const data = await api("/api/settings", {
      method: "POST",
      body: JSON.stringify({
        name: $("set-name").value,
        address: $("set-address").value,
        phone: $("set-phone").value,
        email: $("set-email").value,
        gstin: $("set-gstin").value,
      }),
    });
    state.company = data.company;
    paintHeader();
    $("settings-hint").textContent = "Saved to MySQL";
    $("settings-hint").className = "hint ok";
  } catch (err) {
    $("settings-hint").textContent = err.message;
    $("settings-hint").className = "hint error";
  }
});

function tick() {
  $("clock").textContent = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
tick();
setInterval(tick, 15000);

loadBootstrap().catch((err) => {
  $("shop-place").textContent = err.message;
  setHint(`MySQL: ${err.message}`, "error");
});
