(function () {
  const shopKey = new URLSearchParams(location.search).get("shop") || "";
  const state = { shop: null, items: [], offers: [], offerSettings: { stacking: "product_and_bill" }, cart: new Map(), category: "All", query: "" };
  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(n) || 0);
  const esc = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  function orderUnit(item) {
    const unit = String(item.base_unit || item.unit || "PCS").toUpperCase();
    if (unit === "GM" || unit === "KG") return { label: "kg", step: 0.25 };
    if (unit === "ML" || unit === "LTR") return { label: "L", step: 0.25 };
    return { label: unit === "PCS" ? "pc" : unit.toLowerCase(), step: 1 };
  }

  function lineAmount(item, qty) {
    return Math.round((Number(item.retail_rate) || 0) * qty * 100) / 100;
  }

  function isCountItem(item) {
    const unit = String(item.base_unit || item.unit || "PCS").toUpperCase();
    return !["GM", "KG", "ML", "LTR"].includes(unit);
  }

  function cartLines() {
    const lines = [];
    for (const [id, qty] of state.cart) {
      const item = state.items.find((row) => row.id === id);
      if (!item) continue;
      const amount = lineAmount(item, qty);
      lines.push({
        itemId: id,
        lineId: id,
        qty,
        qtyGm: qty,
        isCount: isCountItem(item),
        gross: amount,
        taxable: amount,
        category: item.category || "",
        item,
      });
    }
    return lines;
  }

  function offerResult() {
    const O = globalThis.POSOffers;
    if (!O) return { applied: [], discount: 0, billDiscount: 0, lineDiscounts: {}, message: "", pending: [] };
    const offers = (state.offers || []).filter((offer) => (offer.live_status || offer.status) === "active");
    return O.evaluateAll(offers, {
      now: new Date(),
      cart: cartLines(),
      items: state.items,
      stacking: state.offerSettings?.stacking || "product_and_bill",
      customer: { bills: 0, lifetime_spend: 0 },
    });
  }

  function totals() {
    const priced = offerResult();
    let subtotal = 0;
    let gst = 0;
    let count = 0;
    const lines = [];
    for (const [id, qty] of state.cart) {
      const item = state.items.find((row) => row.id === id);
      if (!item) continue;
      const gross = lineAmount(item, qty);
      const lineOff = Math.min(Math.max(0, Number(priced.lineDiscounts?.[id] || 0)), gross);
      const amount = Math.round((gross - lineOff) * 100) / 100;
      subtotal += amount;
      gst += amount * (Number(item.gst_rate) || 0) / 100;
      count += 1;
      lines.push({ id, item, qty, gross, amount, lineOff });
    }
    subtotal = Math.round(subtotal * 100) / 100;
    const bill = Math.min(Math.max(0, Number(priced.billDiscount) || 0), subtotal);
    if (bill > 0 && subtotal > 0) {
      let left = bill;
      lines.forEach((line, index) => {
        const share = index === lines.length - 1 ? left : Math.round((bill * line.amount / subtotal) * 100) / 100;
        left = Math.round((left - share) * 100) / 100;
        line.amount = Math.round((line.amount - share) * 100) / 100;
        line.lineOff = Math.round((line.lineOff + share) * 100) / 100;
      });
      subtotal = Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
      gst = lines.reduce((sum, line) => sum + line.amount * (Number(line.item.gst_rate) || 0) / 100, 0);
    }
    gst = Math.round(gst * 100) / 100;
    return {
      count,
      subtotal,
      gst,
      total: Math.round((subtotal + gst) * 100) / 100,
      discount: Math.round((Number(priced.discount) || 0) * 100) / 100,
      message: priced.message || "",
      pending: priced.pending?.[0]?.message || "",
      lines,
    };
  }

  function setQty(id, next) {
    const item = state.items.find((row) => row.id === id);
    if (!item) return;
    const { step } = orderUnit(item);
    const qty = Math.round(Math.max(0, Number(next) || 0) / step) * step;
    if (qty > 0) state.cart.set(id, Math.round(qty * 1000) / 1000);
    else state.cart.delete(id);
    renderMenu();
    renderCart();
  }

  function renderCategories() {
    const cats = ["All", ...new Set(state.items.map((item) => item.category || "Other"))];
    $("category-pills").innerHTML = cats
      .map((cat) => `<button type="button" class="${state.category === cat ? "active" : ""}" data-category="${esc(cat)}">${esc(cat)}</button>`)
      .join("");
  }

  function renderMenu() {
    const query = state.query.toLowerCase();
    const items = state.items.filter((item) => {
      const categoryOk = state.category === "All" || (item.category || "Other") === state.category;
      const searchOk = !query || [item.name, item.category, item.subcategory, item.hsn].join(" ").toLowerCase().includes(query);
      return categoryOk && searchOk;
    });
    $("menu-grid").innerHTML = items.length
      ? items.map((item) => {
          const qty = state.cart.get(item.id) || 0;
          const unit = orderUnit(item);
          const photo = item.image_url
            ? `<img class="item-photo" src="${esc(item.image_url)}" alt="">`
            : `<div class="item-initial">${esc(item.name.charAt(0).toUpperCase())}</div>`;
          return `<article class="menu-card">
            ${photo}
            <div>
              <h3>${esc(item.name)}</h3>
              <p class="item-meta">${esc(item.category || "Menu")} ${item.hsn ? `· HSN ${esc(item.hsn)}` : ""}</p>
              <p class="item-price">${esc(money(item.retail_rate))} / ${esc(unit.label)}</p>
              ${itemOfferLabel(item) ? `<p class="item-offer">${esc(itemOfferLabel(item))}</p>` : ""}
            </div>
            ${qty
              ? `<div class="qty-control"><button type="button" data-minus="${esc(item.id)}" aria-label="Reduce">−</button><span>${qty} ${esc(unit.label)}</span><button type="button" data-plus="${esc(item.id)}" aria-label="Add">+</button></div>`
              : `<button class="add-btn" type="button" data-add="${esc(item.id)}">Add to order</button>`}
          </article>`;
        }).join("")
      : '<p class="empty">No available items match this search.</p>';
  }

  function renderCart() {
    const summary = totals();
    $("cart-open").hidden = summary.count === 0;
    $("cart-count").textContent = String(summary.count);
    $("cart-total").textContent = money(summary.total);
    const rows = (summary.lines || []).map((line) =>
      `<div class="cart-line"><strong>${esc(line.item.name)}</strong><span>${line.qty} ${esc(orderUnit(line.item).label)} × ${esc(money(line.item.retail_rate))}${line.lineOff > 0 ? ` · save ${esc(money(line.lineOff))}` : ""}</span><strong>${esc(money(line.amount))}</strong></div>`,
    );
    $("cart-lines").innerHTML = rows.join("") || '<p class="empty">Your order is empty.</p>';
    const offerRow = summary.discount > 0
      ? `<div class="offer-save"><span>${esc(summary.message || "Offer")}</span><strong>−${esc(money(summary.discount))}</strong></div>`
      : summary.pending
        ? `<div class="offer-wait">${esc(summary.pending)}</div>`
        : "";
    $("cart-totals").innerHTML = `${offerRow}
      <div><span>Subtotal</span><strong>${esc(money(summary.subtotal))}</strong></div>
      <div><span>GST</span><strong>${esc(money(summary.gst))}</strong></div>
      <div class="grand"><span>Total</span><strong>${esc(money(summary.total))}</strong></div>`;
  }

  function itemOfferLabel(item) {
    const offers = (state.offers || []).filter((offer) => (offer.live_status || offer.status) === "active");
    const hit = offers.find((offer) => {
      const ids = offer.conditions?.item_ids || [];
      const cat = String(offer.conditions?.category || offer.category || "").trim();
      if (ids.length) return ids.includes(item.id);
      if (cat) return String(item.category || "").toLowerCase() === cat.toLowerCase();
      return ["min_purchase", "spend", "first_purchase", "time", "day", "festival"].includes(offer.offer_type);
    });
    return hit?.name || "";
  }

  async function loadMenu() {
    if (!shopKey) throw new Error("This QR link is incomplete. Ask the shop for a new QR.");
    const res = await fetch(`/api/qr/menu?shop=${encodeURIComponent(shopKey)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not open this menu");
    state.shop = data.shop;
    state.items = Array.isArray(data.items) ? data.items : [];
    state.offers = Array.isArray(data.offers) ? data.offers : [];
    state.offerSettings = data.offerSettings || { stacking: "product_and_bill" };
    document.title = `Order from ${data.shop.name}`;
    $("shop-name").textContent = data.shop.name;
    $("shop-address").textContent = [data.shop.address, data.shop.phone].filter(Boolean).join(" · ");
    if (data.shop.logo_url) {
      $("shop-logo").src = data.shop.logo_url;
      $("shop-logo").hidden = false;
    }
    renderCategories();
    renderMenu();
    const strip = $("offer-strip");
    if (strip) {
      const names = (state.offers || []).filter((offer) => (offer.live_status || offer.status) === "active").map((offer) => offer.name).filter(Boolean);
      strip.hidden = !names.length;
      strip.textContent = names.length ? `Offers on this menu: ${names.join(" · ")}` : "";
    }
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
    const item = state.items.find((row) => row.id === id);
    const step = orderUnit(item).step;
    setQty(id, (state.cart.get(id) || 0) + (minus ? -step : step));
  });
  $("menu-search").addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    renderMenu();
  });
  $("cart-open").addEventListener("click", () => { $("cart-sheet").hidden = false; });
  $("cart-close").addEventListener("click", () => { $("cart-sheet").hidden = true; });
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
          shop: shopKey,
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
