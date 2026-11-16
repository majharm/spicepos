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

  function readImage(file, kind) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve("");
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error("Banner must be a JPG, PNG, or WebP image"));
      if (file.size > 1_500_000) return reject(new Error("Banner must be under 1.5 MB"));
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const minW = kind === "mobile" ? 360 : 800;
          const minH = kind === "mobile" ? 140 : 200;
          if (img.width < minW || img.height < minH) {
            reject(new Error(`${kind === "mobile" ? "Mobile" : "Desktop"} banner must be at least ${minW}×${minH} pixels`));
            return;
          }
          if (img.width > 4000 || img.height > 2500) {
            reject(new Error("Banner is too large. Use an image under 4000×2500 pixels"));
            return;
          }
          resolve(String(reader.result || ""));
        };
        img.onerror = () => reject(new Error("Could not read that image"));
        img.src = String(reader.result || "");
      };
      reader.onerror = () => reject(new Error("Could not read that image"));
      reader.readAsDataURL(file);
    });
  }

  function shell() {
    const store = model?.store;
    const bannerAllowed = Number(model?.business?.store_banner_allowed) === 1;
    const tabs = [
      ["store", "Store settings"],
      ["catalog", "Products"],
      ["orders", "Orders"],
      bannerAllowed ? ["banner", "Login page banner"] : null,
    ].filter(Boolean);
    return `<header class="online-store-hero">
      <p class="items-kicker">Business Admin · Online Store</p>
      <h2>${esc(store?.store_name || model?.business?.name || "Online Store")}</h2>
      <p>${store?.url ? `Store URL: <a href="${esc(store.url)}" target="_blank" rel="noopener">${esc(store.url)}</a>` : "Create the store to get a unique web address."}</p>
      <div class="store-tabs">${tabs.map(([id, label]) => `<button class="btn${tab === id ? " is-on" : ""}" type="button" data-store-tab="${id}">${label}</button>`).join("")}</div>
    </header>
    <div id="store-pane"></div>
    <p class="hint" id="store-hint"></p>`;
  }

  function storePane() {
    const store = model?.store || {};
    return `<form class="store-card" id="store-form">
      <div class="store-grid">
        <label>Store name<input name="store_name" required maxlength="160" value="${esc(store.store_name || model?.business?.name || "")}" /></label>
        <label>Store URL name<input name="slug" required maxlength="40" value="${esc(store.slug || "")}" placeholder="cafe-nova" /></label>
      </div>
      <label class="full"><input type="checkbox" name="published" ${Number(store.published) === 1 ? "checked" : ""} /> Publish store. Customers can open the login page and place orders.</label>
      <button class="btn primary" type="submit">Save store</button>
    </form>`;
  }

  function catalogPane(rows) {
    return `<div class="store-card">
      <p>Prices, categories, and stock are the same records used on the POS. Changes here update the counter stock and selling price.</p>
      <div class="store-table-wrap"><table class="store-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Sell online</th><th></th></tr></thead><tbody>
      ${(rows || []).map((item) => `<tr data-item="${esc(item.id)}">
        <td>${esc(item.name)}</td>
        <td><input data-field="category" value="${esc(item.category)}" /></td>
        <td><input data-field="price" type="number" min="0" step="0.01" value="${esc(item.retail_rate)}" /></td>
        <td><input data-field="stock" type="number" min="0" step="0.001" value="${esc(item.stock_gm)}" /></td>
        <td><input data-field="listed" type="checkbox" ${item.listed ? "checked" : ""} /></td>
        <td><button class="btn" type="button" data-save-item="${esc(item.id)}">Save</button></td>
      </tr>`).join("") || `<tr><td colspan="6">No active products yet. Add them in Items.</td></tr>`}
      </tbody></table></div></div>`;
  }

  function ordersPane(rows) {
    return `<div class="store-card store-table-wrap"><table class="store-table"><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>
      ${(rows || []).map((order) => `<tr>
        <td>${esc(order.order_number)}<br><span class="hint">${(order.lines || []).map((line) => `${esc(line.item_name)} × ${esc(line.quantity)}`).join(", ")}</span></td>
        <td>${esc(order.customer_name)}<br>${esc(order.mobile)}<br>${esc(order.address || "")}</td>
        <td>${money(order.total)}</td>
        <td>${esc(order.status)}</td>
        <td>${order.status === "cancelled" ? "" : `<button class="btn" type="button" data-order="${esc(order.id)}" data-status="accepted">Accept</button> <button class="btn" type="button" data-order="${esc(order.id)}" data-status="completed">Complete</button> <button class="btn" type="button" data-order="${esc(order.id)}" data-status="cancelled">Cancel</button>`}</td>
      </tr>`).join("") || `<tr><td colspan="5">No online orders yet.</td></tr>`}
    </tbody></table></div>`;
  }

  function bannerPane() {
    const store = model?.store || {};
    return `<form class="store-card" id="banner-form">
      <p>This banner is shown only on this business's Online Store login page.</p>
      <label class="full"><input type="checkbox" name="banner_enabled" ${Number(store.banner_enabled) === 1 ? "checked" : ""} /> Show the custom banner. Otherwise customers see the default banner with this store's name.</label>
      <div class="store-grid">
        <label>Desktop banner<input name="desktop" type="file" accept="image/jpeg,image/png,image/webp" /><img class="store-banner-preview" id="banner-desktop-preview" alt="" src="${esc(store.banner_desktop || "")}" ${store.banner_desktop ? "" : "hidden"} /></label>
        <label>Mobile banner<input name="mobile" type="file" accept="image/jpeg,image/png,image/webp" /><img class="store-banner-preview" id="banner-mobile-preview" alt="" src="${esc(store.banner_mobile || "")}" ${store.banner_mobile ? "" : "hidden"} /></label>
      </div>
      <button class="btn primary" type="submit">Save banner</button>
      <button class="btn" type="button" id="banner-remove">Remove banner</button>
    </form>`;
  }

  async function paintPane() {
    const pane = $("store-pane");
    if (!pane) return;
    if (tab === "catalog") {
      const rows = await root.api("/api/online-store/catalog");
      pane.innerHTML = catalogPane(rows);
      pane.querySelectorAll("[data-save-item]").forEach((btn) => {
        btn.onclick = async () => {
          const tr = btn.closest("tr");
          try {
            await root.api(`/api/online-store/items/${btn.dataset.saveItem}`, {
              method: "PUT",
              body: JSON.stringify({
                category: tr.querySelector('[data-field="category"]').value,
                retail_rate: tr.querySelector('[data-field="price"]').value,
                stock_gm: tr.querySelector('[data-field="stock"]').value,
                listed: tr.querySelector('[data-field="listed"]').checked ? 1 : 0,
              }),
            });
            $("store-hint").textContent = "Product saved. POS stock and price use the same values.";
          } catch (err) {
            $("store-hint").textContent = err.message;
          }
        };
      });
      return;
    }
    if (tab === "orders") {
      const rows = await root.api("/api/online-store/orders");
      pane.innerHTML = ordersPane(rows);
      pane.querySelectorAll("[data-order]").forEach((btn) => {
        btn.onclick = async () => {
          try {
            await root.api(`/api/online-store/orders/${btn.dataset.order}`, { method: "PATCH", body: JSON.stringify({ status: btn.dataset.status }) });
            await paintPane();
          } catch (err) {
            $("store-hint").textContent = err.message;
          }
        };
      });
      return;
    }
    if (tab === "banner") {
      pane.innerHTML = bannerPane();
      pane.querySelector("#banner-form").onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          const desktop = await readImage(fd.get("desktop"), "desktop");
          const mobile = await readImage(fd.get("mobile"), "mobile");
          const body = { banner_enabled: e.target.banner_enabled.checked ? 1 : 0 };
          if (desktop) body.banner_desktop = desktop;
          if (mobile) body.banner_mobile = mobile;
          await root.api("/api/online-store/banner", { method: "PUT", body: JSON.stringify(body) });
          $("store-hint").textContent = "Login banner published for this store.";
          await open();
        } catch (err) {
          $("store-hint").textContent = err.message;
        }
      };
      ["desktop", "mobile"].forEach((kind) => {
        pane.querySelector(`[name="${kind}"]`)?.addEventListener("change", async (e) => {
          try {
            const url = await readImage(e.target.files[0], kind);
            const img = $(kind === "desktop" ? "banner-desktop-preview" : "banner-mobile-preview");
            if (img && url) {
              img.src = url;
              img.hidden = false;
            }
          } catch (err) {
            e.target.value = "";
            $("store-hint").textContent = err.message;
          }
        });
      });
      $("banner-remove").onclick = async () => {
        await root.api("/api/online-store/banner", { method: "DELETE" });
        $("store-hint").textContent = "Custom banner removed. The default banner will show.";
        await open();
      };
      return;
    }
    pane.innerHTML = storePane();
    $("store-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await root.api("/api/online-store", {
          method: "PUT",
          body: JSON.stringify({
            store_name: fd.get("store_name"),
            slug: fd.get("slug"),
            published: e.target.published.checked ? 1 : 0,
          }),
        });
        $("store-hint").textContent = "Store saved.";
        await open();
      } catch (err) {
        $("store-hint").textContent = err.message;
      }
    };
  }

  async function open() {
    const desk = $("online-store-desk");
    if (!desk) return;
    try {
      model = await root.api("/api/online-store");
      if (tab === "banner" && Number(model?.business?.store_banner_allowed) !== 1) tab = "store";
      desk.innerHTML = shell();
      desk.querySelectorAll("[data-store-tab]").forEach((btn) => {
        btn.onclick = () => {
          tab = btn.dataset.storeTab;
          desk.querySelectorAll("[data-store-tab]").forEach((el) => el.classList.toggle("is-on", el === btn));
          paintPane().catch((err) => { $("store-hint").textContent = err.message; });
        };
      });
      await paintPane();
    } catch (err) {
      desk.innerHTML = `<p class="hint error">${esc(err.message || "Online Store is not available")}</p>`;
    }
  }

  root.POSOnlineStore = { open };
})(window);
