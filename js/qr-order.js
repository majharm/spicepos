(function () {
  const shopKey = new URLSearchParams(location.search).get("shop") || "";
  const tablePrefill = new URLSearchParams(location.search).get("table") || "";
  const state = { shop: null, items: [], offers: [], offerSettings: { stacking: "product_and_bill" }, cart: new Map(), category: "All", query: "" };
  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(n) || 0);
  const esc = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  function isPack(item) {
    return String(item?.kind || "") === "pack" || String(item?.id || "").startsWith("pack:");
  }

  function packContents(item) {
    if (!isPack(item) || !Array.isArray(item.pack_items)) return "";
    return item.pack_items
      .map((row) => {
        const name = String(row.name || "").trim();
        const qty = Number(row.quantity_gm) || 0;
        if (!name) return "";
        if (qty >= 1000) return `${name} ${(qty / 1000).toFixed(qty % 1000 ? 2 : 0)}kg`;
        if (qty > 0) return `${name} ${qty % 1 ? qty.toFixed(1) : qty}g`;
        return name;
      })
      .filter(Boolean)
      .join(" · ");
  }

  function mergeMenuItems(data) {
    const items = Array.isArray(data?.items) ? data.items.slice() : [];
    const have = new Set(items.map((row) => String(row.id)));
    (Array.isArray(data?.packs) ? data.packs : []).forEach((pack) => {
      if (pack && !have.has(String(pack.id))) {
        have.add(String(pack.id));
        items.unshift(pack);
      }
    });
    return items;
  }

  function orderUnit(item) {
    if (isPack(item)) return { label: "pack", step: 1 };
    const unit = String(item.base_unit || item.unit || "PCS").toUpperCase();
    if (unit === "GM" || unit === "KG") return { label: "kg", step: 0.25 };
    if (unit === "ML" || unit === "LTR") return { label: "L", step: 0.25 };
    return { label: unit === "PCS" ? "pc" : unit.toLowerCase(), step: 1 };
  }

  function lineAmount(item, qty) {
    return Math.round((Number(item.retail_rate) || 0) * qty * 100) / 100;
  }

  function isCountItem(item) {
    if (isPack(item)) return true;
    const unit = String(item.base_unit || item.unit || "PCS").toUpperCase();
    return !["GM", "KG", "ML", "LTR"].includes(unit);
  }

  function findItem(id) {
    return state.items.find((row) => String(row.id) === String(id));
  }

  function activeOffers() {
    const O = globalThis.POSOffers;
    return (state.offers || []).filter((offer) => {
      const st = O?.liveStatus?.(offer) || offer.live_status || offer.status;
      return st === "active";
    });
  }

  function offerCtx(cart) {
    return {
      now: new Date(),
      cart,
      items: state.items,
      stacking: state.offerSettings?.stacking || "product_and_bill",
      customer: { bills: 0, lifetime_spend: 0 },
    };
  }

  function asCartLine(item, qty) {
    const amount = lineAmount(item, qty);
    return {
      itemId: String(item.id),
      lineId: String(item.id),
      qty,
      qtyGm: qty,
      isCount: isCountItem(item),
      gross: amount,
      taxable: amount,
      category: item.category || "",
      item,
    };
  }

  function cartLines() {
    const lines = [];
    for (const [id, qty] of state.cart) {
      const item = findItem(id);
      if (!item) continue;
      lines.push(asCartLine(item, qty));
    }
    return lines;
  }

  function offerResult(cart) {
    const O = globalThis.POSOffers;
    if (!O) return { applied: [], discount: 0, billDiscount: 0, lineDiscounts: {}, message: "", pending: [] };
    return O.evaluateAll(activeOffers(), offerCtx(cart || cartLines()));
  }

  function totals() {
    const priced = offerResult();
    let itemsTotal = 0;
    let subtotal = 0;
    let gst = 0;
    let count = 0;
    const lines = [];
    for (const [id, qty] of state.cart) {
      const item = findItem(id);
      if (!item) continue;
      const gross = lineAmount(item, qty);
      const lineOff = Math.min(Math.max(0, Number(priced.lineDiscounts?.[id] || priced.lineDiscounts?.[String(id)] || 0)), gross);
      const amount = Math.round((gross - lineOff) * 100) / 100;
      itemsTotal += gross;
      subtotal += amount;
      gst += amount * (Number(item.gst_rate) || 0) / 100;
      count += 1;
      lines.push({ id, item, qty, gross, amount, lineOff });
    }
    itemsTotal = Math.round(itemsTotal * 100) / 100;
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
    const discount = Math.round((Number(priced.discount) || lines.reduce((sum, line) => sum + line.lineOff, 0)) * 100) / 100;
    return {
      count,
      itemsTotal,
      subtotal,
      gst,
      total: Math.round((subtotal + gst) * 100) / 100,
      discount,
      message: priced.message || priced.applied?.[0]?.name || "",
      pending: priced.pending?.[0]?.message || "",
      wouldSave: Math.round((Number(priced.pending?.[0]?.wouldSave) || 0) * 100) / 100,
      lines,
    };
  }

  function setQty(id, next) {
    const item = findItem(id);
    if (!item) return;
    const { step } = orderUnit(item);
    let qty = Math.round(Math.max(0, Number(next) || 0) / step) * step;
    if (isPack(item) && Number(item.stock_gm) > 0) qty = Math.min(qty, Number(item.stock_gm));
    if (qty > 0) state.cart.set(id, Math.round(qty * 1000) / 1000);
    else state.cart.delete(id);
    renderMenu();
    renderCart();
  }

  function renderCategories() {
    const found = new Set(state.items.map((item) => item.category || "Other"));
    const rest = [...found].filter((cat) => cat !== "Packs");
    const cats = ["All", ...(found.has("Packs") ? ["Packs"] : []), ...rest];
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
          const info = itemOfferInfo(item);
          const priceHtml = info.save > 0
            ? `<p class="item-price"><s>${esc(money(item.retail_rate))}</s> ${esc(money(Math.max(0, Number(item.retail_rate) - info.save)))} / ${esc(unit.label)}</p>`
            : `<p class="item-price">${esc(money(item.retail_rate))} / ${esc(unit.label)}</p>`;
          const offerHtml = info.name
            ? `<p class="item-offer">${esc(info.name)}${info.save > 0 ? ` · save ${esc(money(info.save))}` : info.wouldSave > 0 ? ` · add more, save ${esc(money(info.wouldSave))}` : ""}</p>`
            : "";
          return `<article class="menu-card">
            ${photo}
            <div>
              <h3>${esc(item.name)}</h3>
              <p class="item-meta">${esc(isPack(item) ? "Pack" : item.category || "Menu")}${!isPack(item) && item.hsn ? ` · HSN ${esc(item.hsn)}` : ""}</p>
              ${isPack(item) && packContents(item) ? `<p class="item-pack">${esc(packContents(item))}</p>` : ""}
              ${priceHtml}
              ${offerHtml}
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
    $("cart-total").textContent = summary.discount > 0
      ? `${money(summary.total)} · save ${money(summary.discount)}`
      : money(summary.total);
    const rows = (summary.lines || []).map((line) =>
      `<div class="cart-line"><strong>${esc(line.item.name)}</strong><span>${line.qty} ${esc(orderUnit(line.item).label)} × ${esc(money(line.item.retail_rate))}${line.lineOff > 0 ? ` · save ${esc(money(line.lineOff))}` : ""}</span><strong>${esc(money(line.amount))}</strong></div>`,
    );
    $("cart-lines").innerHTML = rows.join("") || '<p class="empty">Your order is empty.</p>';
    const pending = summary.pending
      ? `<div class="offer-wait">${esc(summary.pending)}${summary.wouldSave > 0 ? ` · save ${esc(money(summary.wouldSave))}` : ""}</div>`
      : "";
    const discountRow = summary.discount > 0
      ? `<div class="offer-save"><span>Discount${summary.message ? ` · ${esc(summary.message)}` : ""}</span><strong>−${esc(money(summary.discount))}</strong></div>`
      : "";
    $("cart-totals").innerHTML = `
      <div><span>Items</span><strong>${esc(money(summary.itemsTotal || summary.subtotal))}</strong></div>
      ${discountRow}
      ${pending}
      <div><span>GST</span><strong>${esc(money(summary.gst))}</strong></div>
      <div class="grand"><span>Total</span><strong>${esc(money(summary.total))}</strong></div>`;
  }

  function itemOfferInfo(item) {
    const O = globalThis.POSOffers;
    const offers = activeOffers();
    const condOf = (offer) => O?.parseConditions?.(offer) || offer.conditions || {};
    const hit = offers.find((offer) => {
      const cond = condOf(offer);
      const ids = (cond.item_ids || []).map(String);
      const cat = String(cond.category || offer.category || "").trim();
      const type = offer.offer_type || offer.type;
      if (ids.length) return ids.includes(String(item.id)) || String(cond.get_item_id || "") === String(item.id);
      if (cat) return String(item.category || "").toLowerCase() === cat.toLowerCase();
      return ["min_purchase", "spend", "first_purchase", "time", "day", "festival", "combo"].includes(type);
    });
    if (!hit) return { name: "", save: 0, pending: "", wouldSave: 0 };
    const one = offerResult([asCartLine(item, 1)]);
    const cond = condOf(hit);
    const bogoQty = Math.max(2, (Number(cond.buy_qty) || 1) + (Number(cond.get_qty) || 1));
    const more = (hit.offer_type || hit.type) === "bogo" ? offerResult([asCartLine(item, bogoQty)]) : one;
    const save = Math.round((Number(one.lineDiscounts?.[item.id] || one.lineDiscounts?.[String(item.id)] || 0)) * 100) / 100;
    return {
      name: hit.name || "",
      save,
      pending: one.pending?.[0]?.message || "",
      wouldSave: Math.round((Number(more.discount || one.pending?.[0]?.wouldSave) || 0) * 100) / 100,
    };
  }

  async function loadMenu() {
    if (!shopKey) throw new Error("This QR link is incomplete. Ask the shop for a new QR.");
    const res = await fetch(`/api/qr/menu?shop=${encodeURIComponent(shopKey)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not open this menu");
    state.shop = data.shop;
    state.items = mergeMenuItems(data);
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
      const names = activeOffers().map((offer) => offer.name).filter(Boolean);
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
    const item = findItem(id);
    if (!item) return;
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
      const disc = Math.round((Number(data.order?.discount) || 0) * 100) / 100;
      const label = String(data.order?.offer_label || "");
      const saveEl = $("success-save");
      if (saveEl) {
        saveEl.hidden = disc <= 0 && !label;
        saveEl.textContent = disc > 0 ? `Discount · ${label || "Offer"} · you saved ${money(disc)}` : label;
      }
      const totalEl = $("success-total");
      if (totalEl) totalEl.textContent = `Total ${money(data.order?.total)}`;
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

  if (tablePrefill) {
    const input = document.querySelector("#order-form [name=table_no]");
    if (input && !input.value) input.value = tablePrefill;
  }

  loadMenu().catch((err) => {
    $("shop-name").textContent = "Menu unavailable";
    $("menu-grid").innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  });
})();
