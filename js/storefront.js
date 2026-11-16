(function () {
  const page = document.getElementById("store-page");
  const params = new URLSearchParams(location.search);
  const shop = String(params.get("shop") || "").trim().toLowerCase();
  let state = { customer: null, banner: { desktop: "", mobile: "" }, store_name: "Online Store", published: 0 };
  let cart = [];

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
  async function api(path, options) {
    const res = await fetch(path, { credentials: "same-origin", headers: { Accept: "application/json", ...(options?.body ? { "Content-Type": "application/json" } : {}) }, ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not open this store");
    return data;
  }
  function bannerHtml() {
    const mobile = window.matchMedia("(max-width: 720px)").matches;
    const src = mobile ? state.banner.mobile || state.banner.desktop : state.banner.desktop || state.banner.mobile;
    if (!src) {
      return `<div class="store-banner-default"><div><strong>${esc(state.store_name)}</strong><p>Order online</p></div></div>`;
    }
    return `<img class="store-banner" alt="${esc(state.store_name)} banner" src="${esc(src)}" />`;
  }
  function paintAuth() {
    page.innerHTML = `${bannerHtml()}
      <section class="store-auth">
        <h1>${esc(state.store_name)}</h1>
        <p class="hint" id="store-msg">${state.published ? "Sign in to shop this store." : "This store is not open yet."}</p>
        ${state.published ? `<form id="store-login" class="store-card">
          <h2>Sign in</h2>
          <label>Mobile<input name="mobile" inputmode="numeric" required /></label>
          <label>Password<input name="password" type="password" required minlength="8" /></label>
          <button type="submit">Sign in</button>
        </form>
        <form id="store-register" class="store-card">
          <h2>Create account</h2>
          <label>Name<input name="name" required /></label>
          <label>Mobile<input name="mobile" inputmode="numeric" required /></label>
          <label>Email<input name="email" type="email" /></label>
          <label>Password<input name="password" type="password" required minlength="8" /></label>
          <button type="submit">Create account</button>
        </form>` : ""}
      </section>`;
    page.querySelector("#store-login")?.addEventListener("submit", (e) => submitAuth(e, "login"));
    page.querySelector("#store-register")?.addEventListener("submit", (e) => submitAuth(e, "register"));
  }
  async function submitAuth(e, kind) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    try {
      const data = await api(`/api/store/${encodeURIComponent(shop)}/${kind}`, { method: "POST", body: JSON.stringify(fd) });
      state.customer = data.customer;
      await paintShop();
    } catch (err) {
      const msg = document.getElementById("store-msg");
      if (msg) msg.textContent = err.message;
    }
  }
  async function paintShop() {
    const items = await api(`/api/store/${encodeURIComponent(shop)}/catalog`);
    const groups = new Map();
    items.forEach((item) => {
      const key = item.category || "General";
      groups.set(key, [...(groups.get(key) || []), item]);
    });
    page.innerHTML = `${bannerHtml()}
      <section class="store-shop">
        <div class="store-card"><strong>${esc(state.store_name)}</strong><p>Signed in as ${esc(state.customer?.name || "")}</p><button type="button" id="store-logout">Sign out</button></div>
        ${[...groups.entries()].map(([category, rows]) => `<section><h2>${esc(category)}</h2><div class="store-items">${rows.map((item) => `<article class="store-item"><strong>${esc(item.name)}</strong><p>${money(item.retail_rate)} · stock ${esc(item.stock_gm)}</p><button type="button" data-add="${esc(item.id)}">Add</button></article>`).join("")}</div></section>`).join("")}
        <form class="store-card" id="store-checkout">
          <h2>Your order</h2>
          <div id="store-cart"></div>
          <label>Delivery address<textarea name="address" required maxlength="255"></textarea></label>
          <button type="submit">Place order</button>
          <p id="store-msg"></p>
        </form>
      </section>`;
    page.querySelectorAll("[data-add]").forEach((btn) => {
      btn.onclick = () => {
        const item = items.find((row) => row.id === btn.dataset.add);
        const line = cart.find((row) => row.item_id === item.id);
        if (line) line.quantity += 1;
        else cart.push({ item_id: item.id, name: item.name, quantity: 1, rate: item.retail_rate });
        paintCart();
      };
    });
    page.querySelector("#store-logout").onclick = async () => {
      await api(`/api/store/${encodeURIComponent(shop)}/logout`, { method: "POST", body: "{}" });
      state.customer = null;
      cart = [];
      paintAuth();
    };
    page.querySelector("#store-checkout").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const order = await api(`/api/store/${encodeURIComponent(shop)}/orders`, {
          method: "POST",
          body: JSON.stringify({ address: new FormData(e.target).get("address"), lines: cart.map((line) => ({ item_id: line.item_id, quantity: line.quantity })) }),
        });
        cart = [];
        document.getElementById("store-msg").textContent = `Order ${order.order?.order_number || ""} placed. Stock is updated in the shop POS.`;
        paintCart();
      } catch (err) {
        document.getElementById("store-msg").textContent = err.message;
      }
    };
    paintCart();
  }
  function paintCart() {
    const el = document.getElementById("store-cart");
    if (!el) return;
    el.innerHTML = cart.length ? cart.map((line) => `<p>${esc(line.name)} × ${line.quantity} · ${money(line.rate * line.quantity)}</p>`).join("") : "<p>Cart is empty.</p>";
  }
  async function boot() {
    if (!shop) {
      page.innerHTML = "<p>This store link is missing a shop name.</p>";
      return;
    }
    try {
      const data = await api(`/api/store/${encodeURIComponent(shop)}`);
      state = { ...state, ...data, banner: data.banner || { desktop: "", mobile: "" } };
      document.title = state.store_name;
      if (state.customer && state.published) await paintShop();
      else paintAuth();
    } catch (err) {
      page.innerHTML = `<p>${esc(err.message)}</p>`;
    }
  }
  boot();
})();
