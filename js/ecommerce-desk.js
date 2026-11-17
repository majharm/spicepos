(function (root) {
  const $ = (id) => document.getElementById(id);
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
  let tab = "store";
  let model = null;
  const statusLabel = { pending: "New", packed: "Packed", out: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled" };

  function shell() {
    const store = model?.store;
    if (store && !store.url && store.slug) store.url = `./shop.html?shop=${encodeURIComponent(store.slug)}`;
    return `<header class="online-store-hero">
      <p class="items-kicker">Business Admin · E-Commerce Store</p>
      <h2>${esc(store?.store_name || model?.business?.name || "E-Commerce Store")}</h2>
      <p>${store?.url ? `Shop URL: <a href="${esc(store.url)}" target="_blank" rel="noopener">${esc(store.url)}</a>` : "Create the shop to get a public web address. Customers can browse without signing in."}</p>
      <div class="store-tabs">
        ${[["store", "Shop settings"], ["catalog", "Products"], ["orders", "Orders"]].map(([id, label]) => `<button class="btn${tab === id ? " is-on" : ""}" type="button" data-ecom-tab="${id}">${label}</button>`).join("")}
      </div>
    </header>
    <div id="ecom-pane"></div>
    <p class="hint" id="ecom-hint"></p>`;
  }

  function storePane() {
    const store = model?.store || {};
    return `<form class="store-card" id="ecom-form">
      <div class="store-grid">
        <label>Shop name<input name="store_name" required maxlength="160" value="${esc(store.store_name || model?.business?.name || "")}" /></label>
        <label>Shop URL name<input name="slug" required maxlength="40" value="${esc(store.slug || "")}" placeholder="cafe-nova" /></label>
        <label>Delivery fee<input name="delivery_fee" type="number" min="0" step="0.01" value="${esc(store.delivery_fee ?? 0)}" /></label>
        <label>Free delivery from<input name="free_above" type="number" min="0" step="0.01" value="${esc(store.free_above ?? 0)}" /></label>
      </div>
      <label class="full"><input type="checkbox" name="published" ${Number(store.published) === 1 ? "checked" : ""} /> Publish shop. Visitors can browse products and place a cash-on-delivery order.</label>
      <button class="btn primary" type="submit">Save shop</button>
    </form>`;
  }

  function catalogPane(rows) {
    return `<div class="store-card">
      <p>Prices and stock stay on the item master. Choose which products appear on the public shop.</p>
      <div class="store-table-wrap"><table class="store-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Show on shop</th></tr></thead><tbody>
      ${(rows || []).map((item) => `<tr>
        <td>${esc(item.name)}</td><td>${esc(item.category)}</td><td>${money(item.retail_rate)}</td><td>${esc(item.stock_gm)}</td>
        <td><input type="checkbox" data-ecom-item="${esc(item.id)}" ${Number(item.listed) === 1 ? "checked" : ""} /></td>
      </tr>`).join("") || `<tr><td colspan="5">No active items yet.</td></tr>`}
      </tbody></table></div></div>`;
  }

  function ordersPane(rows) {
    return `<div class="store-card">${(rows || []).length ? (rows || []).map((order) => `<article class="ecom-order">
      <header><strong>${esc(order.order_number)}</strong><span>${esc(statusLabel[order.status] || order.status)}</span></header>
      <p>${esc(order.customer_name)} · ${esc(order.mobile)}</p>
      <p>${esc(order.address || "")}</p>
      <p>${money(order.total)} · delivery ${money(order.delivery)} · cash on delivery</p>
      <p>${(order.lines || []).map((line) => `${esc(line.item_name)} × ${esc(line.quantity)}`).join(", ")}</p>
      <div class="store-tabs">
        ${["packed", "out", "delivered", "cancelled"].map((status) => `<button class="btn" type="button" data-ecom-status="${status}" data-ecom-order="${esc(order.id)}">${statusLabel[status]}</button>`).join("")}
      </div>
    </article>`).join("") : "<p>No shop orders yet.</p>"}</div>`;
  }

  async function paintPane() {
    const pane = $("ecom-pane");
    const hint = $("ecom-hint");
    if (!pane) return;
    try {
      if (tab === "catalog") pane.innerHTML = catalogPane(await api("/api/ecommerce/catalog"));
      else if (tab === "orders") pane.innerHTML = ordersPane(await api("/api/ecommerce/orders"));
      else pane.innerHTML = storePane();
      if (hint) hint.textContent = "";
    } catch (err) {
      pane.innerHTML = "";
      if (hint) hint.textContent = err.message;
    }
    pane.querySelector("#ecom-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      body.published = fd.get("published") ? 1 : 0;
      try {
        await api("/api/ecommerce", { method: "PUT", body: JSON.stringify(body) });
        if (hint) hint.textContent = "Shop saved.";
        await open();
      } catch (err) {
        if (hint) hint.textContent = err.message;
      }
    });
    pane.querySelectorAll("[data-ecom-item]").forEach((box) => {
      box.onchange = async () => {
        try {
          await api(`/api/ecommerce/items/${box.dataset.ecomItem}`, { method: "PUT", body: JSON.stringify({ listed: box.checked ? 1 : 0 }) });
        } catch (err) {
          box.checked = !box.checked;
          if (hint) hint.textContent = err.message;
        }
      };
    });
    pane.querySelectorAll("[data-ecom-status]").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await api(`/api/ecommerce/orders/${btn.dataset.ecomOrder}`, { method: "PATCH", body: JSON.stringify({ status: btn.dataset.ecomStatus }) });
          await paintPane();
        } catch (err) {
          if (hint) hint.textContent = err.message;
        }
      };
    });
  }

  async function open() {
    const host = $("ecommerce-desk");
    if (!host) return;
    host.innerHTML = `<p class="hint">Opening E-Commerce Store…</p>`;
    try {
      model = await api("/api/ecommerce");
      host.innerHTML = shell();
      host.onclick = (event) => {
        const tabBtn = event.target.closest?.("[data-ecom-tab]");
        if (!tabBtn) return;
        tab = tabBtn.dataset.ecomTab;
        host.innerHTML = shell();
        paintPane();
      };
      await paintPane();
    } catch (err) {
      host.innerHTML = `<p class="hint">${esc(err.message)}</p>`;
    }
  }

  root.POSEcommerce = { open };
})(typeof window !== "undefined" ? window : globalThis);
