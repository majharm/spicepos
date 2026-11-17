(function (root) {
  const page = document.getElementById("shop-page");
  const params = new URLSearchParams(location.search);
  const shop = String(params.get("shop") || "").trim().toLowerCase();
  let model = null;
  let catalog = [];
  let cart = [];
  let query = "";
  let category = "All";

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function money(n) {
    return `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }
  function totals() {
    const subtotal = round2(cart.reduce((sum, line) => sum + line.rate * line.quantity, 0));
    const gst = round2(cart.reduce((sum, line) => sum + (line.rate * line.quantity * line.gst_rate) / 100, 0));
    const goods = round2(subtotal + gst);
    const freeAbove = Number(model?.free_above) || 0;
    const fee = Number(model?.delivery_fee) || 0;
    const delivery = freeAbove > 0 && goods + 0.001 >= freeAbove ? 0 : round2(fee);
    return { subtotal, gst, delivery, total: round2(goods + delivery) };
  }
  async function api(path, options) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(options?.body ? { "Content-Type": "application/json" } : {}) },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not open this shop");
    return data;
  }
  function visibleItems() {
    const q = query.trim().toLowerCase();
    return catalog.filter((item) => {
      if (category !== "All" && item.category !== category) return false;
      if (!q) return true;
      return `${item.name} ${item.category}`.toLowerCase().includes(q);
    });
  }
  function paintCart() {
    const host = document.getElementById("shop-cart");
    const count = document.getElementById("shop-cart-count");
    if (count) count.textContent = String(cart.reduce((sum, line) => sum + line.quantity, 0));
    if (!host) return;
    const bill = totals();
    host.innerHTML = cart.length
      ? `${cart.map((line) => `<div class="shop-line">
          <div><strong>${esc(line.name)}</strong><p>${money(line.rate)}</p></div>
          <div class="shop-qty">
            <button type="button" data-dec="${esc(line.item_id)}" aria-label="Less">−</button>
            <span>${line.quantity}</span>
            <button type="button" data-inc="${esc(line.item_id)}" aria-label="More">+</button>
          </div>
          <strong>${money(line.rate * line.quantity)}</strong>
        </div>`).join("")}
        <dl class="shop-bill">
          <div><dt>Items</dt><dd>${money(bill.subtotal)}</dd></div>
          <div><dt>GST</dt><dd>${money(bill.gst)}</dd></div>
          <div><dt>Delivery</dt><dd>${bill.delivery ? money(bill.delivery) : "Free"}</dd></div>
          <div><dt>To pay</dt><dd>${money(bill.total)}</dd></div>
        </dl>
        <p class="hint">Cash on delivery.${Number(model?.free_above) > 0 ? ` Delivery is free from ${money(model.free_above)}.` : ""}</p>`
      : `<p class="hint">Your cart is empty. Add something from the shop.</p>`;
    host.querySelectorAll("[data-inc],[data-dec]").forEach((btn) => {
      btn.onclick = () => changeQty(btn.dataset.inc || btn.dataset.dec, btn.dataset.inc ? 1 : -1);
    });
  }
  function changeQty(id, delta) {
    const line = cart.find((row) => row.item_id === id);
    if (!line) return;
    line.quantity += delta;
    if (line.quantity <= 0) cart = cart.filter((row) => row.item_id !== id);
    paintCart();
  }
  function gridHtml() {
    const items = visibleItems();
    return items.length ? items.map((item) => `<article class="shop-card">
            ${item.image_url ? `<img alt="" src="${esc(item.image_url)}" />` : `<div class="shop-photo">${esc(item.name.slice(0, 1))}</div>`}
            <p class="shop-cat">${esc(item.category || "General")}</p>
            <h2>${esc(item.name)}</h2>
            <p class="shop-price">${money(item.retail_rate)} <span>${item.gst_rate ? `+ ${item.gst_rate}% GST` : ""}</span></p>
            <button type="button" data-add="${esc(item.id)}">Add to cart</button>
          </article>`).join("") : `<p class="hint">No products match this search.</p>`;
  }
  function bindAdds() {
    page.querySelectorAll("[data-add]").forEach((btn) => {
      btn.onclick = () => {
        const item = catalog.find((row) => row.id === btn.dataset.add);
        const line = cart.find((row) => row.item_id === item.id);
        if (line) line.quantity += 1;
        else cart.push({ item_id: item.id, name: item.name, quantity: 1, rate: item.retail_rate, gst_rate: item.gst_rate || 0 });
        paintCart();
        document.getElementById("shop-side")?.classList.add("is-open");
      };
    });
  }
  function paint() {
    if (!page) return;
    const cats = ["All", ...new Set(catalog.map((item) => item.category || "General"))];
    page.innerHTML = `<header class="shop-top">
        <div>
          <p class="shop-kicker">E-Commerce Store</p>
          <h1>${esc(model.store_name || "Shop")}</h1>
        </div>
        <button class="shop-cart-btn" type="button" id="shop-open-cart">Cart <span id="shop-cart-count">0</span></button>
      </header>
      <div class="shop-tools">
        <input id="shop-q" type="search" placeholder="Search products" value="${esc(query)}" />
        <div class="shop-cats">${cats.map((name) => `<button type="button" class="${category === name ? "is-on" : ""}" data-cat="${esc(name)}">${esc(name)}</button>`).join("")}</div>
      </div>
      <div class="shop-layout">
        <section class="shop-grid">${gridHtml()}</section>
        <aside class="shop-side" id="shop-side">
          <h2>Your order</h2>
          <div id="shop-cart"></div>
          <form id="shop-checkout">
            <label>Name<input name="name" required maxlength="160" /></label>
            <label>Mobile<input name="mobile" inputmode="numeric" required maxlength="15" /></label>
            <label>Delivery address<textarea name="address" required maxlength="255"></textarea></label>
            <button type="submit">Place order · Cash on delivery</button>
            <p id="shop-msg" class="hint"></p>
          </form>
          <form id="shop-track">
            <h3>Track an order</h3>
            <label>Order number<input name="order_number" placeholder="EC-0001" /></label>
            <label>Mobile<input name="mobile" inputmode="numeric" /></label>
            <button type="submit">Check status</button>
            <p id="shop-track-msg" class="hint"></p>
          </form>
        </aside>
      </div>`;
    document.getElementById("shop-q").oninput = (e) => {
      query = e.target.value;
      const grid = page.querySelector(".shop-grid");
      if (grid) grid.innerHTML = gridHtml();
      bindAdds();
    };
    page.querySelectorAll("[data-cat]").forEach((btn) => {
      btn.onclick = () => {
        category = btn.dataset.cat;
        page.querySelectorAll("[data-cat]").forEach((el) => el.classList.toggle("is-on", el.dataset.cat === category));
        const grid = page.querySelector(".shop-grid");
        if (grid) grid.innerHTML = gridHtml();
        bindAdds();
      };
    });
    bindAdds();
    document.getElementById("shop-open-cart").onclick = () => document.getElementById("shop-side")?.classList.toggle("is-open");
    document.getElementById("shop-checkout").onsubmit = async (e) => {
      e.preventDefault();
      const msg = document.getElementById("shop-msg");
      if (!cart.length) {
        msg.textContent = "Add at least one item.";
        return;
      }
      const fd = Object.fromEntries(new FormData(e.target).entries());
      try {
        const data = await api(`/api/shop/${encodeURIComponent(shop)}/orders`, {
          method: "POST",
          body: JSON.stringify({ ...fd, lines: cart.map((line) => ({ item_id: line.item_id, quantity: line.quantity })) }),
        });
        cart = [];
        msg.textContent = `Order ${data.order?.order_number || ""} placed. Pay ${money(data.order?.total)} in cash on delivery.`;
        paintCart();
      } catch (err) {
        msg.textContent = err.message;
      }
    };
    document.getElementById("shop-track").onsubmit = async (e) => {
      e.preventDefault();
      const msg = document.getElementById("shop-track-msg");
      const fd = Object.fromEntries(new FormData(e.target).entries());
      try {
        const data = await api(`/api/shop/${encodeURIComponent(shop)}/track`, { method: "POST", body: JSON.stringify(fd) });
        const order = data.order || {};
        msg.textContent = `${order.order_number} is ${order.status}. Total ${money(order.total)}.`;
      } catch (err) {
        msg.textContent = err.message;
      }
    };
    paintCart();
    const q = document.getElementById("shop-q");
    if (query && q) {
      q.focus();
      q.setSelectionRange(query.length, query.length);
    }
  }
  async function boot() {
    if (!page) return;
    if (!shop) {
      page.innerHTML = "<p>This shop link is missing a shop name.</p>";
      return;
    }
    try {
      model = await api(`/api/shop/${encodeURIComponent(shop)}`);
      document.title = model.store_name || "E-Commerce Store";
      if (!model.published) {
        page.innerHTML = `<header class="shop-top"><h1>${esc(model.store_name)}</h1></header><p>This shop is not open for orders yet.</p>`;
        return;
      }
      catalog = await api(`/api/shop/${encodeURIComponent(shop)}/catalog`);
      paint();
    } catch (err) {
      page.innerHTML = `<p>${esc(err.message)}</p>`;
    }
  }
  root.POSShop = { totals, boot };
  if (page) boot();
})(typeof window !== "undefined" ? window : globalThis);
