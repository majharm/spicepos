(function () {
  const STEP = 1;
  const state = { shop: null, items: [], cart: new Map(), category: "All", query: "" };
  const $ = (id) => document.getElementById(id);
  const money = (n) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(n) || 0);
  const esc = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  function parseUnitsFromPackSize(packSize) {
    const text = String(packSize || "").trim();
    if (!text) return 0;
    const lead = text.match(/^(\d+)/);
    if (lead) return Math.max(1, parseInt(lead[1], 10));
    const embedded = text.match(/(\d+)\s*(tablet|capsule|tab|cap|unit)s?\b/i);
    if (embedded) return Math.max(1, parseInt(embedded[1], 10));
    return 0;
  }

  function unitsPerPack(item) {
    const explicit = Number(item.units_per_pack);
    if (Number.isFinite(explicit) && explicit > 1) return Math.floor(explicit);
    const parsed = parseUnitsFromPackSize(item.pack_size);
    if (parsed > 1) return parsed;
    const med = String(item.medicine_type || "").trim().toLowerCase();
    const pack = String(item.pack_unit || item.base_unit || "").trim();
    const nonLoose = new Set(["syrup", "injection", "cream", "ointment", "drops", "inhaler", "powder", "gel", "lotion"]);
    if (pack === "Strip" && (!med || med === "tablet" || med === "capsule" || med === "other" || !nonLoose.has(med))) {
      return 10;
    }
    return Number.isFinite(explicit) && explicit > 0 ? Math.floor(explicit) : 1;
  }

  function looseSaleRate(item) {
    const packRate = Number(item.selling_price || item.retail_rate) || 0;
    const upp = unitsPerPack(item);
    return upp > 1 ? Math.round((packRate / upp) * 100) / 100 : packRate;
  }

  function looseUnitLabel(item) {
    const type = String(item.medicine_type || "").trim();
    if (type === "Tablet") return "Tablet";
    if (type === "Capsule") return "Capsule";
    const packSize = String(item.pack_size || "").trim();
    const match = packSize.match(/\d+\s*([A-Za-z]+)/);
    if (match) return match[1];
    return item.pack_unit || "Unit";
  }

  function lineAmount(item, qty) {
    return Math.round(Number(qty) * looseSaleRate(item) * 100) / 100;
  }

  function totals() {
    let subtotal = 0;
    let gst = 0;
    let count = 0;
    for (const [id, qty] of state.cart) {
      const item = state.items.find((row) => row.id === id);
      if (!item) continue;
      const amount = lineAmount(item, qty);
      subtotal += amount;
      gst += (amount * (Number(item.gst_rate) || 0)) / 100;
      count += 1;
    }
    subtotal = Math.round(subtotal * 100) / 100;
    gst = Math.round(gst * 100) / 100;
    return { count, subtotal, gst, total: Math.round((subtotal + gst) * 100) / 100 };
  }

  function setQty(id, nextGm) {
    const item = state.items.find((row) => row.id === id);
    if (!item) return;
    const max = Math.max(0, Math.floor(Number(item.stock_gm) || 0));
    const qty = Math.min(max, Math.max(0, Math.round(Number(nextGm) || 0)));
    if (qty > 0) state.cart.set(id, qty);
    else state.cart.delete(id);
    renderMenu();
    renderCart();
  }

  function renderCategories() {
    const cats = ["All", ...new Set(state.items.map((item) => item.category || "Other"))];
    $("category-pills").innerHTML = cats
      .map(
        (cat) =>
          `<button type="button" class="${state.category === cat ? "active" : ""}" data-category="${esc(cat)}">${esc(cat)}</button>`,
      )
      .join("");
  }

  function renderMenu() {
    const query = state.query.toLowerCase();
    const items = state.items.filter((item) => {
      const categoryOk = state.category === "All" || (item.category || "Other") === state.category;
      const searchOk =
        !query ||
        [item.name, item.local_name, item.generic_name, item.code, item.barcode, item.category]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return categoryOk && searchOk;
    });
    $("menu-grid").innerHTML = items.length
      ? items
          .map((item) => {
            const qty = state.cart.get(item.id) || 0;
            const out = Number(item.stock_gm) <= 0;
            return `<article class="menu-card">
            <div class="item-initial">${esc((item.name || "?").charAt(0).toUpperCase())}</div>
            <div>
              <h3>${esc(item.name)} <small>${esc(item.local_name || "")}</small></h3>
              <p class="item-meta">${esc(item.medicine_type || item.category || "Medicine")} ${item.generic_name || item.local_name ? `· ${esc(item.generic_name || item.local_name)}` : ""}</p>
              <p class="item-price">${esc(money(looseSaleRate(item)))}/${esc(looseUnitLabel(item))}${unitsPerPack(item) > 1 ? ` · ${esc(money(item.selling_price || item.retail_rate))}/${esc(item.pack_unit || "Pack")}` : ""}</p>
            </div>
            ${
              out
                ? `<p class="out">Out of stock</p>`
                : qty
                  ? `<div class="qty-control"><button type="button" data-minus="${esc(item.id)}" aria-label="Reduce">−</button><span>${qty}</span><button type="button" data-plus="${esc(item.id)}" aria-label="Add">+</button></div>`
                  : `<button class="add-btn" type="button" data-add="${esc(item.id)}">Add</button>`
            }
          </article>`;
          })
          .join("")
      : '<p class="empty">No medicines match this search.</p>';
  }

  function renderCart() {
    const summary = totals();
    $("cart-open").hidden = summary.count === 0;
    $("cart-count").textContent = String(summary.count);
    $("cart-total").textContent = money(summary.total);
    const rows = [];
    for (const [id, qty] of state.cart) {
      const item = state.items.find((row) => row.id === id);
      if (!item) continue;
      rows.push(
        `<div class="cart-line"><strong>${esc(item.name)}</strong><span>${qty} ${esc(looseUnitLabel(item))} × ${esc(money(looseSaleRate(item)))}</span><strong>${esc(money(lineAmount(item, qty)))}</strong></div>`,
      );
    }
    $("cart-lines").innerHTML = rows.join("") || '<p class="empty">Your order is empty.</p>';
    $("cart-totals").innerHTML = `<div><span>Subtotal</span><strong>${esc(money(summary.subtotal))}</strong></div>
      <div><span>GST</span><strong>${esc(money(summary.gst))}</strong></div>
      <div class="grand"><span>Total</span><strong>${esc(money(summary.total))}</strong></div>`;
  }

  async function loadMenu() {
    const res = await fetch("/api/qr/menu", { headers: { Accept: "application/json" }, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not open this menu");
    state.shop = data.shop;
    state.items = Array.isArray(data.items) ? data.items : [];
    document.title = `Order from ${data.shop.name}`;
    $("shop-name").textContent = data.shop.name;
    $("shop-address").textContent = [data.shop.address, data.shop.phone].filter(Boolean).join(" · ");
    if (data.shop.logo_url) {
      $("shop-logo").src = data.shop.logo_url;
      $("shop-logo").hidden = false;
    }
    renderCategories();
    renderMenu();
  }

  $("category-pills").addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    renderCategories();
    renderMenu();
  });
  $("menu-grid").addEventListener("click", (event) => {
    const add = event.target.closest("[data-add]");
    const plus = event.target.closest("[data-plus]");
    const minus = event.target.closest("[data-minus]");
    const id = add?.dataset.add || plus?.dataset.plus || minus?.dataset.minus;
    if (!id) return;
    setQty(id, (state.cart.get(id) || 0) + (minus ? -STEP : STEP));
  });
  $("menu-search").addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    renderMenu();
  });
  $("cart-open").addEventListener("click", () => {
    $("cart-sheet").hidden = false;
  });
  $("cart-close").addEventListener("click", () => {
    $("cart-sheet").hidden = true;
  });
  $("cart-sheet").addEventListener("click", (event) => {
    if (event.target === $("cart-sheet")) $("cart-sheet").hidden = true;
  });
  $("order-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]");
    const hint = $("order-hint");
    button.disabled = true;
    hint.textContent = "Sending order…";
    try {
      const form = new FormData(event.currentTarget);
      const res = await fetch("/api/qr/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          customer_name: form.get("customer_name"),
          mobile: form.get("mobile"),
          table_no: form.get("table_no"),
          notes: form.get("notes"),
          lines: [...state.cart].map(([item_id, quantity]) => ({ item_id, quantity })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not place the order");
      $("cart-sheet").hidden = true;
      $("success-number").textContent = data.order.order_number;
      $("order-success").hidden = false;
      state.cart.clear();
      renderCart();
      event.currentTarget.reset();
      hint.textContent = "";
    } catch (err) {
      hint.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });
  $("new-order").addEventListener("click", () => {
    $("order-success").hidden = true;
    scrollTo({ top: 0, behavior: "smooth" });
  });

  loadMenu().catch((err) => {
    $("shop-name").textContent = "Menu unavailable";
    $("menu-grid").innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  });
})();
