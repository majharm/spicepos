(function () {
  const STEP_GM = 100;
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

  function lineAmount(item, qtyGm) {
    return Math.round(((Number(qtyGm) / 1000) * (Number(item.retail_rate) || 0)) * 100) / 100;
  }

  function totals() {
    let subtotal = 0;
    let gst = 0;
    let count = 0;
    for (const [id, qtyGm] of state.cart) {
      const item = state.items.find((row) => row.id === id);
      if (!item) continue;
      const amount = lineAmount(item, qtyGm);
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
    const qty = Math.round(Math.max(0, Number(nextGm) || 0) / STEP_GM) * STEP_GM;
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
        [item.name, item.local_name, item.code, item.category, item.subcategory]
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
              <p class="item-meta">${esc(item.category || "Spice")} ${item.subcategory ? `· ${esc(item.subcategory)}` : ""}</p>
              <p class="item-price">${esc(money(item.retail_rate))} / kg</p>
            </div>
            ${
              out
                ? `<p class="out">Out of stock</p>`
                : qty
                  ? `<div class="qty-control"><button type="button" data-minus="${esc(item.id)}" aria-label="Reduce">−</button><span>${qty} g</span><button type="button" data-plus="${esc(item.id)}" aria-label="Add">+</button></div>`
                  : `<button class="add-btn" type="button" data-add="${esc(item.id)}">Add 100 g</button>`
            }
          </article>`;
          })
          .join("")
      : '<p class="empty">No spices match this search.</p>';
  }

  function renderCart() {
    const summary = totals();
    $("cart-open").hidden = summary.count === 0;
    $("cart-count").textContent = String(summary.count);
    $("cart-total").textContent = money(summary.total);
    const rows = [];
    for (const [id, qtyGm] of state.cart) {
      const item = state.items.find((row) => row.id === id);
      if (!item) continue;
      rows.push(
        `<div class="cart-line"><strong>${esc(item.name)}</strong><span>${qtyGm} g × ${esc(money(item.retail_rate))}/kg</span><strong>${esc(money(lineAmount(item, qtyGm)))}</strong></div>`,
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
    setQty(id, (state.cart.get(id) || 0) + (minus ? -STEP_GM : STEP_GM));
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
          lines: [...state.cart].map(([item_id, quantity_gm]) => ({ item_id, quantity_gm })),
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
