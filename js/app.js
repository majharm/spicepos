import { searchCatalog } from "./catalog.js";
import { formatINR, parseMoneyInput } from "./money.js";
import {
  addToCart,
  cartTotals,
  checkout,
  clearCart,
  holdCart,
  loadState,
  recallHeld,
  saveState,
  setCartQty,
  todaySales,
  verifyPin,
} from "./store.js";

const els = {
  catalog: document.getElementById("catalog"),
  lines: document.getElementById("lines"),
  search: document.getElementById("search"),
  searchForm: document.getElementById("search-form"),
  taxable: document.getElementById("taxable"),
  tax: document.getElementById("tax"),
  total: document.getElementById("total"),
  tender: document.getElementById("tender"),
  hint: document.getElementById("hint"),
  lock: document.getElementById("lock"),
  pinForm: document.getElementById("pin-form"),
  pin: document.getElementById("pin"),
  pinHint: document.getElementById("pin-hint"),
  shopName: document.getElementById("shop-name"),
  shopPlace: document.getElementById("shop-place"),
  todayTotal: document.getElementById("today-total"),
  todayCount: document.getElementById("today-count"),
  clock: document.getElementById("clock"),
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modal-title"),
  modalBody: document.getElementById("modal-body"),
  modalClose: document.getElementById("modal-close"),
};

let state = loadState();
let paying = false;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function persist() {
  saveState(state);
}

function setHint(message, kind = "") {
  els.hint.textContent = message || "";
  els.hint.className = `hint ${kind}`.trim();
}

function stockClass(stock) {
  if (stock <= 0) return "out";
  if (stock <= 8) return "low";
  return "ok";
}

function renderCatalog() {
  const products = searchCatalog(state.products, els.search.value);
  els.catalog.innerHTML = products
    .map((p) => {
      const disabled = p.stock <= 0 ? "disabled" : "";
      return `<button class="card" type="button" data-sku="${escapeHtml(p.sku)}" ${disabled}>
        <div class="sku">${escapeHtml(p.sku)}</div>
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="meta">
          <span>${escapeHtml(p.pack)}</span>
          <span>${escapeHtml(formatINR(p.unitPaise))}</span>
        </div>
        <div class="stock ${stockClass(p.stock)}">${p.stock} in stock</div>
      </button>`;
    })
    .join("");
}

function renderCart() {
  if (state.cart.length === 0) {
    els.lines.innerHTML = `<p class="hint">Tap a spice to add it to the bill.</p>`;
  } else {
    els.lines.innerHTML = state.cart
      .map(
        (line) => `<div class="line" data-sku="${escapeHtml(line.sku)}">
          <div>
            <div class="who">${escapeHtml(line.name)}</div>
            <div class="pack">${escapeHtml(line.pack)} · ${escapeHtml(formatINR(line.unitPaise))}</div>
          </div>
          <div>
            <div class="qty">
              <button type="button" data-act="dec" aria-label="Decrease">−</button>
              <span>${line.qty}</span>
              <button type="button" data-act="inc" aria-label="Increase">+</button>
            </div>
            <div class="pack" style="text-align:right;margin-top:4px">${escapeHtml(
              formatINR(line.unitPaise * line.qty),
            )}</div>
          </div>
        </div>`,
      )
      .join("");
  }
  const totals = cartTotals(state);
  els.taxable.textContent = formatINR(totals.taxable);
  els.tax.textContent = formatINR(totals.tax);
  els.total.textContent = formatINR(totals.total);
}

function renderStats() {
  els.shopName.textContent = state.shop.name;
  els.shopPlace.textContent = `${state.shop.place} · GSTIN ${state.shop.gstin}`;
  const sales = todaySales(state);
  els.todayTotal.textContent = formatINR(sales.total);
  els.todayCount.textContent = String(sales.count);
}

function setPayEnabled(enabled) {
  for (const id of ["pay-cash", "pay-upi", "pay-card", "btn-hold", "btn-clear"]) {
    document.getElementById(id).disabled = !enabled;
  }
}

function renderAll() {
  renderCatalog();
  renderCart();
  renderStats();
  setPayEnabled(state.cart.length > 0 && !state.locked);
  els.lock.hidden = !state.locked;
}

function showModal(title, html) {
  els.modalTitle.textContent = title;
  els.modalBody.innerHTML = html;
  els.modal.hidden = false;
}

function hideModal() {
  els.modal.hidden = true;
  els.modalBody.replaceChildren();
}

function receiptText(order) {
  const lines = [
    state.shop.name,
    state.shop.place,
    `GSTIN ${state.shop.gstin}`,
    `Bill ${order.id}`,
    new Date(order.createdAt).toLocaleString("en-IN"),
    "------------------------------",
    ...order.items.map(
      (i) =>
        `${i.name} ${i.pack} x${i.qty}\n  ${formatINR(i.total)} (GST ${formatINR(i.tax)})`,
    ),
    "------------------------------",
    `Taxable  ${formatINR(order.taxable)}`,
    `GST      ${formatINR(order.tax)}`,
    `TOTAL    ${formatINR(order.total)}`,
    `Paid     ${order.method.toUpperCase()} ${formatINR(order.tendered)}`,
    `Change   ${formatINR(order.change)}`,
    "Thank you. Check the seal on packs.",
  ];
  return lines.join("\n");
}

function pay(method) {
  if (paying) return;
  paying = true;
  try {
    if (state.cart.length === 0) {
      setHint("Cart is empty", "error");
      return;
    }
    let tenderedPaise = 0;
    if (method === "cash") {
      const parsed = parseMoneyInput(els.tender.value);
      if (!parsed.ok) {
        setHint(parsed.error, "error");
        return;
      }
      tenderedPaise = parsed.paise;
    }
    const result = checkout(state, { method, tenderedPaise });
    if (!result.ok) {
      if (result.shortfall) {
        setHint(`Cash short by ${formatINR(result.shortfall)}`, "error");
      } else {
        setHint(result.error, "error");
      }
      return;
    }
    persist();
    els.tender.value = "";
    setHint(`Paid ${result.order.id} · change ${formatINR(result.order.change)}`, "ok");
    renderAll();
    showModal(
      `Receipt ${result.order.id}`,
      `<pre class="receipt">${escapeHtml(receiptText(result.order))}</pre>`,
    );
  } finally {
    paying = false;
  }
}

els.catalog.addEventListener("click", (event) => {
  const card = event.target.closest("[data-sku]");
  if (!card || state.locked) return;
  const result = addToCart(state, card.dataset.sku, 1);
  if (!result.ok) setHint(result.error, "error");
  else {
    persist();
    setHint("");
    renderAll();
  }
});

els.lines.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-act]");
  const row = event.target.closest(".line");
  if (!btn || !row) return;
  const sku = row.dataset.sku;
  const line = state.cart.find((l) => l.sku === sku);
  if (!line) return;
  const next = btn.dataset.act === "inc" ? line.qty + 1 : line.qty - 1;
  const result = setCartQty(state, sku, next);
  if (!result.ok) setHint(result.error, "error");
  else {
    persist();
    setHint("");
    renderAll();
  }
});

els.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  renderCatalog();
});
els.search.addEventListener("input", () => renderCatalog());

document.getElementById("btn-clear").addEventListener("click", () => {
  clearCart(state);
  persist();
  setHint("Cart cleared");
  renderAll();
});

document.getElementById("btn-hold").addEventListener("click", () => {
  const result = holdCart(state);
  if (!result.ok) setHint(result.error, "error");
  else {
    persist();
    setHint(`Held ${result.id}`, "ok");
    renderAll();
  }
});

document.getElementById("pay-cash").addEventListener("click", () => pay("cash"));
document.getElementById("pay-upi").addEventListener("click", () => pay("upi"));
document.getElementById("pay-card").addEventListener("click", () => pay("card"));

document.getElementById("btn-held").addEventListener("click", () => {
  if (state.held.length === 0) {
    showModal("Held bills", `<p class="hint">No held bills.</p>`);
    return;
  }
  showModal(
    "Held bills",
    `<div class="held-list">${state.held
      .map(
        (h) =>
          `<button class="held-item" type="button" data-hold="${escapeHtml(h.id)}">
            <span>${escapeHtml(h.id)}<br><small>${escapeHtml(
              new Date(h.createdAt).toLocaleString("en-IN"),
            )} · ${h.items.length} lines</small></span>
            <span>Recall</span>
          </button>`,
      )
      .join("")}</div>`,
  );
});

document.getElementById("btn-orders").addEventListener("click", () => {
  if (state.orders.length === 0) {
    showModal("Orders", `<p class="hint">No paid bills yet.</p>`);
    return;
  }
  showModal(
    "Today and earlier",
    `<div class="order-list">${state.orders
      .map(
        (o) =>
          `<button class="order-item" type="button" data-order="${escapeHtml(o.id)}">
            <span>${escapeHtml(o.id)} · ${escapeHtml(o.method.toUpperCase())}<br>
            <small>${escapeHtml(new Date(o.createdAt).toLocaleString("en-IN"))}</small></span>
            <span>${escapeHtml(formatINR(o.total))}</span>
          </button>`,
      )
      .join("")}</div>`,
  );
});

els.modalBody.addEventListener("click", (event) => {
  const holdBtn = event.target.closest("[data-hold]");
  if (holdBtn) {
    const result = recallHeld(state, holdBtn.dataset.hold);
    if (!result.ok) setHint(result.error, "error");
    else {
      persist();
      setHint("Bill recalled", "ok");
      renderAll();
    }
    hideModal();
    return;
  }
  const orderBtn = event.target.closest("[data-order]");
  if (orderBtn) {
    const order = state.orders.find((o) => o.id === orderBtn.dataset.order);
    if (order) {
      showModal(
        `Receipt ${order.id}`,
        `<pre class="receipt">${escapeHtml(receiptText(order))}</pre>`,
      );
    }
  }
});

els.modalClose.addEventListener("click", hideModal);
els.modal.addEventListener("click", (event) => {
  if (event.target === els.modal) hideModal();
});

document.getElementById("btn-lock").addEventListener("click", () => {
  state.locked = true;
  persist();
  renderAll();
  els.pin.focus();
});

els.pinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!verifyPin(els.pin.value)) {
    els.pinHint.textContent = "Wrong PIN";
    els.pinHint.className = "hint error";
    return;
  }
  els.pin.value = "";
  els.pinHint.textContent = "";
  state.locked = false;
  renderAll();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== els.search && document.activeElement !== els.tender && document.activeElement !== els.pin) {
    event.preventDefault();
    els.search.focus();
  }
  if (event.key === "Escape") hideModal();
});

function tickClock() {
  els.clock.textContent = new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
tickClock();
setInterval(tickClock, 15000);
renderAll();
