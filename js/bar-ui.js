(function (root) {
  const $ = (id) => document.getElementById(id);
  const B = () => root.POSBar;
  function money(n) {
    if (typeof root.money === "function") return root.money(n);
    return `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }
  function api(path, opts) {
    return root.api(path, opts);
  }
  function isBar() {
    const meta = root.state?.businessMeta;
    return Boolean(
      B()?.isBarShop?.(meta) ||
        root.POSFootwear?.isBarShop?.(meta) ||
        root.POSFootwear?.shopKind?.(meta) === "bar" ||
        Number(meta?.bar_enabled) === 1,
    );
  }
  function hint(el, msg, err) {
    if (!el) return;
    el.textContent = msg || "";
    el.className = err ? "hint error" : "hint";
  }
  function tableHtml(rows, keys) {
    if (!rows?.length) return `<p class="hint">No rows yet.</p>`;
    const cols = keys || Object.keys(rows[0]).filter((k) => !/json|_id$|password/.test(k)).slice(0, 9);
    return `<table><thead><tr>${cols.map((k) => `<th>${escapeHtml(k)}</th>`).join("")}</tr></thead><tbody>${rows
      .slice(0, 250)
      .map((r) => `<tr>${cols.map((k) => `<td>${escapeHtml(r[k])}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
  }

  async function loadBarBoard() {
    if (!$("bar-board-kpis") || !isBar()) return;
    try {
      const d = await api("/api/bar/board");
      $("bar-board-kpis").innerHTML = (d.cards || [])
        .map((c) => `<button type="button" class="report-card dash-kpi" data-bar-card="${escapeHtml(c.id)}"><span>${escapeHtml(c.label)}</span><strong>${c.money ? money(c.value) : escapeHtml(String(c.value ?? "—"))}</strong></button>`)
        .join("");
      const alerts = $("bar-stock-alerts");
      if (alerts) {
        const low = d.lowStock || [];
        const exp = d.expiring || [];
        alerts.innerHTML = !low.length && !exp.length
          ? `<p class="hint">No low-stock or expiry alerts.</p>`
          : `<table><thead><tr><th>Alert</th><th>Product</th><th>Brand</th><th>Left</th></tr></thead><tbody>${[
              ...low.map((p) => `<tr><td><span class="bar-badge warn">Low</span></td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.brand || "")}</td><td>${escapeHtml(p.on_hand_ml)} ml</td></tr>`),
              ...exp.map((p) => `<tr><td><span class="bar-badge warn">Expiry</span></td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.brand || "")}</td><td>${escapeHtml(String(p.expiry_date || "").slice(0, 10))}</td></tr>`),
            ].join("")}</tbody></table>`;
      }
      const list = $("bar-report-list");
      if (list) {
        const reports = d.reports || B()?.REPORTS || [];
        list.innerHTML = reports.map((r) => `<button type="button" class="dash-tile" data-bar-report="${escapeHtml(r.id)}"><strong>${escapeHtml(r.title)}</strong></button>`).join("");
      }
    } catch (err) {
      $("bar-board-kpis").innerHTML = `<p class="hint error">${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadBarReport(id) {
    const el = $("bar-report-out");
    if (!el) return;
    const d = await api(`/api/bar/reports/${encodeURIComponent(id)}`);
    el.innerHTML = tableHtml(d.rows || []);
  }

  function productFormHtml(p) {
    p = p || {};
    const cats = B()?.CATEGORIES || [];
    const packs = B()?.PACK_TYPES || [];
    return `<form id="bar-product-form" class="settings item-composer">
      <input type="hidden" name="id" value="${escapeHtml(p.id || "")}" />
      <label>Name <input name="name" required value="${escapeHtml(p.name || "")}" /></label>
      <label>Brand <input name="brand" value="${escapeHtml(p.brand || "")}" /></label>
      <label>Category <select name="category">${cats.map((c) => `<option ${c === (p.category || "") ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}</select></label>
      <label>Pack <select name="pack_type">${packs.map((c) => `<option value="${escapeHtml(c.id)}" ${c.id === (p.pack_type || "bottle") ? "selected" : ""}>${escapeHtml(c.label)}</option>`).join("")}</select></label>
      <label>Bottle size (ml) <input name="bottle_ml" type="number" min="1" step="1" value="${escapeHtml(p.bottle_ml || 750)}" /></label>
      <label>Barcode <input name="barcode" value="${escapeHtml(p.barcode || "")}" /></label>
      <label>Peg 30 ₹ <input name="price_peg30" type="number" min="0" step="0.01" value="${escapeHtml(p.price_peg30 || 0)}" /></label>
      <label>Peg 60 ₹ <input name="price_peg60" type="number" min="0" step="0.01" value="${escapeHtml(p.price_peg60 || 0)}" /></label>
      <label>Quarter ₹ <input name="price_quarter" type="number" min="0" step="0.01" value="${escapeHtml(p.price_quarter || 0)}" /></label>
      <label>Half ₹ <input name="price_half" type="number" min="0" step="0.01" value="${escapeHtml(p.price_half || 0)}" /></label>
      <label>Bottle ₹ <input name="price_bottle" type="number" min="0" step="0.01" value="${escapeHtml(p.price_bottle || 0)}" /></label>
      <label>Purchase cost ₹ <input name="cost_bottle" type="number" min="0" step="0.01" value="${escapeHtml(p.cost_bottle || 0)}" /></label>
      <label>On hand (ml) <input name="on_hand_ml" type="number" min="0" step="1" value="${escapeHtml(p.on_hand_ml || 0)}" /></label>
      <label>Low stock (ml) <input name="low_stock_ml" type="number" min="0" step="1" value="${escapeHtml(p.low_stock_ml || 0)}" /></label>
      <label>Batch <input name="batch_no" value="${escapeHtml(p.batch_no || "")}" /></label>
      <label>Expiry <input name="expiry_date" type="date" value="${escapeHtml(String(p.expiry_date || "").slice(0, 10))}" /></label>
      <label>GST % <input name="gst_rate" type="number" min="0" step="0.01" value="${escapeHtml(p.gst_rate || 0)}" /></label>
      <button class="btn primary" type="submit">Save product</button>
    </form>`;
  }

  async function loadProducts() {
    const el = $("bar-products-table");
    if (!el) return;
    const q = $("bar-product-q")?.value || "";
    const cat = $("bar-product-cat")?.value || "";
    const rows = await api(`/api/bar/products?q=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}`);
    root.state = root.state || {};
    root.state.barProducts = rows;
    if (!rows.length) {
      el.innerHTML = `<p class="hint">No bar products yet. Add whisky, rum, beer, or a mixer to start billing.</p>`;
      return;
    }
    el.innerHTML = `<table><thead><tr><th>Product</th><th>Brand</th><th>Cat</th><th>Size</th><th>Stock</th><th>Bottle ₹</th><th></th></tr></thead><tbody>${rows
      .map((p) => `<tr>
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.brand || "")}</td>
        <td>${escapeHtml(p.category || "")}</td>
        <td>${escapeHtml(p.bottle_ml)} ml</td>
        <td>${escapeHtml(p.on_hand_ml)} ml${B()?.isLowStock?.(p) ? ' <span class="bar-badge warn">low</span>' : ""}</td>
        <td>${money(p.price_bottle)}</td>
        <td><button class="btn" type="button" data-bar-edit="${escapeHtml(p.id)}">Edit</button></td>
      </tr>`)
      .join("")}</tbody></table>`;
  }

  async function openProduct(id) {
    const p = (root.state?.barProducts || []).find((x) => x.id === id) || {};
    if (root.showModal) root.showModal(id ? "Edit bar product" : "New bar product", productFormHtml(p));
    $("bar-product-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await api("/api/bar/products", { method: "POST", body: JSON.stringify(Object.fromEntries(fd.entries())) });
      if (root.hideModal) root.hideModal();
      await loadProducts();
      if (root.setHint) root.setHint("Bar product saved", "ok");
    });
  }

  function ticketState() {
    root.state = root.state || {};
    if (!root.state.barTicket) {
      root.state.barTicket = { lines: [], serve: "peg30", pay: "cash", discount: 0, table_id: "", service_type: "dine-in", q: "", category: "" };
    }
    return root.state.barTicket;
  }

  function paintTicket() {
    const box = $("bar-ticket");
    if (!box) return;
    const t = ticketState();
    const settings = root.state?.barSettings || B()?.defaultSettings?.() || {};
    const lines = (t.lines || []).map((l) => B().lineTotals(l.product, l.serve, l.qty, l.discount, settings));
    const tot = B().billTotals(lines, t.discount, settings);
    const pays = B()?.PAY_MODES || [];
    box.innerHTML = `
      <h3>Bar ticket</h3>
      <p class="hint">${t.table_name ? `Table ${escapeHtml(t.table_name)}` : "Walk-in"} · ${escapeHtml(t.service_type || "dine-in")}</p>
      ${t.lines.length ? `<table><thead><tr><th>Item</th><th>Serve</th><th>₹</th><th></th></tr></thead><tbody>${t.lines
        .map((l, i) => {
          const row = B().lineTotals(l.product, l.serve, l.qty, l.discount, settings);
          return `<tr><td>${escapeHtml(l.product.name)} × ${l.qty}</td><td>${escapeHtml(row.serve_label)}</td><td>${money(row.total)}</td><td><button type="button" data-bar-drop="${i}">✕</button></td></tr>`;
        })
        .join("")}</tbody></table>` : `<p class="hint">Tap a product, choose peg or bottle, then Pay.</p>`}
      <div class="bar-tot"><span>Item discount / bill discount</span><span></span></div>
      <label>Bill discount <input id="bar-bill-disc" type="number" min="0" step="0.01" value="${escapeHtml(t.discount || 0)}" /></label>
      <div class="bar-tot"><span>Tax</span><strong>${money(tot.tax)}</strong></div>
      <div class="bar-tot"><span>Total</span><strong>${money(tot.total)}</strong></div>
      <div class="bar-pay">${pays.map((p) => `<button type="button" data-bar-pay="${escapeHtml(p)}" class="${t.pay === p ? "is-on" : ""}">${escapeHtml(p)}</button>`).join("")}</div>
      <button class="btn primary" type="button" id="bar-pay-now" ${t.lines.length ? "" : "disabled"}>Pay ${money(tot.total)}</button>
      <button class="btn" type="button" id="bar-hold-table">Save to table</button>
    `;
    $("bar-bill-disc")?.addEventListener("change", (e) => {
      ticketState().discount = Number(e.target.value) || 0;
      paintTicket();
    });
    box.querySelectorAll("[data-bar-drop]").forEach((btn) => {
      btn.onclick = () => {
        ticketState().lines.splice(Number(btn.dataset.barDrop), 1);
        paintTicket();
      };
    });
    box.querySelectorAll("[data-bar-pay]").forEach((btn) => {
      btn.onclick = () => {
        ticketState().pay = btn.dataset.barPay;
        paintTicket();
      };
    });
    const payBtn = $("bar-pay-now");
    if (payBtn) payBtn.onclick = checkout;
    const holdBtn = $("bar-hold-table");
    if (holdBtn) holdBtn.onclick = holdToTable;
  }

  async function loadCounter() {
    if (!$("bar-counter-grid") || !isBar()) return;
    const t = ticketState();
    const q = $("bar-counter-q")?.value || t.q || "";
    const cat = t.category || "";
    const [rows, settings] = await Promise.all([
      api(`/api/bar/products?q=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}`),
      root.state.barSettings ? Promise.resolve(root.state.barSettings) : api("/api/bar/settings").catch(() => B().defaultSettings()),
    ]);
    root.state.barSettings = settings;
    root.state.barProducts = rows;
    const cats = ["", ...(B()?.CATEGORIES || [])];
    $("bar-counter-cats").innerHTML = cats
      .map((c) => `<button type="button" class="bar-cat ${c === cat ? "is-on" : ""}" data-bar-cat="${escapeHtml(c)}">${escapeHtml(c || "All")}</button>`)
      .join("");
    $("bar-counter-grid").innerHTML = rows
      .map((p) => `<button type="button" class="bar-sku ${B().isLowStock(p) ? "is-low" : ""}" data-bar-sku="${escapeHtml(p.id)}">
        <strong>${escapeHtml(p.name)}</strong>
        <span>${escapeHtml(p.brand || "")} · ${escapeHtml(p.category || "")}</span>
        <span>${escapeHtml(B().remainingLabel(p, settings))}</span>
        <em>${money(p.price_bottle || p.price_peg30 || 0)}</em>
      </button>`)
      .join("") || `<p class="hint">No matching bar products.</p>`;
    paintTicket();
  }

  function openServe(product) {
    const settings = root.state?.barSettings || {};
    const serves = B().allowedServings(product, settings);
    const t = ticketState();
    const html = `<div class="bar-serves">${serves
      .map((s) => `<button type="button" data-bar-serve="${escapeHtml(s.id)}">${escapeHtml(s.label)} · ${money(B().servePrice(product, s.id, settings))}</button>`)
      .join("")}</div>
      <label>Qty <input id="bar-serve-qty" type="number" min="1" step="1" value="1" /></label>
      <label>Item discount <input id="bar-serve-disc" type="number" min="0" step="0.01" value="0" /></label>`;
    if (root.showModal) root.showModal(product.name, html);
    document.querySelectorAll("[data-bar-serve]").forEach((btn) => {
      btn.onclick = () => {
        const qty = Number($("bar-serve-qty")?.value) || 1;
        const discount = Number($("bar-serve-disc")?.value) || 0;
        const check = B().canSellQty(product, btn.dataset.barServe, qty, settings);
        if (!check.ok) {
          if (root.setHint) root.setHint(check.reason, "error");
          return;
        }
        t.lines.push({ product, serve: btn.dataset.barServe, qty, discount });
        if (root.hideModal) root.hideModal();
        paintTicket();
      };
    });
  }

  let paying = false;
  async function checkout() {
    const t = ticketState();
    if (!t.lines.length || paying) return;
    paying = true;
    const payBtn = $("bar-pay-now");
    if (payBtn) payBtn.disabled = true;
    try {
      const billed = await api("/api/bar/checkout", {
        method: "POST",
        body: JSON.stringify({
          lines: t.lines.map((l) => ({ product_id: l.product.id, serve: l.serve, qty: l.qty, discount: l.discount })),
          bill_discount: t.discount,
          method: t.pay,
          table_id: t.table_id,
          service_type: t.service_type,
          idempotencyKey: globalThis.POSPayIntegrity?.newKey?.() || `bar-${Date.now()}`,
        }),
      });
      t.lines = [];
      t.discount = 0;
      paintTicket();
      if (root.setHint) root.setHint(`Bar bill ${billed.bill_no || ""} · ${money(billed.total)}`, "ok");
      await loadCounter();
      if (billed.receipt_html && root.showModal) root.showModal("Bar receipt", billed.receipt_html);
    } catch (err) {
      if (root.setHint) root.setHint(err.message, "error");
      if (payBtn) payBtn.disabled = false;
    } finally {
      paying = false;
    }
  }

  async function holdToTable() {
    const t = ticketState();
    if (!t.table_id) {
      if (root.setHint) root.setHint("Pick a bar table first", "error");
      return loadTables();
    }
    await api(`/api/bar/tables/${encodeURIComponent(t.table_id)}/hold`, {
      method: "POST",
      body: JSON.stringify({
        lines: t.lines.map((l) => ({ product_id: l.product.id, serve: l.serve, qty: l.qty, discount: l.discount })),
        service_type: t.service_type,
      }),
    });
    if (root.setHint) root.setHint(`Saved to ${t.table_name || "table"}`, "ok");
    t.lines = [];
    paintTicket();
    await loadTables();
  }

  async function loadTables() {
    const el = $("bar-tables-grid");
    if (!el) return;
    const rows = await api("/api/bar/tables");
    root.state = root.state || {};
    root.state.barTables = rows;
    const t = ticketState();
    el.innerHTML = rows
      .map((tbl) => `<button type="button" class="bar-table ${tbl.status === "busy" ? "is-busy" : ""} ${t.table_id === tbl.id ? "is-on" : ""}" data-bar-table="${escapeHtml(tbl.id)}">
        <strong>${escapeHtml(tbl.name)}</strong>
        <span>${escapeHtml(tbl.floor || "Bar")} · ${escapeHtml(String(tbl.seats || 0))} seats</span>
        <span>${tbl.status === "busy" ? `Open ${money(tbl.pending || 0)}` : "Free"}</span>
      </button>`)
      .join("") || `<p class="hint">No bar tables yet.</p>`;
    const work = $("bar-tables-work");
    if (work) {
      work.innerHTML = `<form id="bar-table-form" class="report-toolbar">
        <label>Name <input name="name" required placeholder="Bar 9" /></label>
        <label>Seats <input name="seats" type="number" min="0" value="4" /></label>
        <label>Floor <input name="floor" value="Bar" /></label>
        <button class="btn" type="submit">Add table</button>
      </form>
      <p class="dash-actions">
        <button class="btn" type="button" id="bar-transfer">Transfer order</button>
        <button class="btn" type="button" id="bar-split">Split bill</button>
        <button class="btn" type="button" id="bar-combine">Combine bills</button>
      </p>`;
      $("bar-table-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await api("/api/bar/tables", { method: "POST", body: JSON.stringify(Object.fromEntries(fd.entries())) });
        await loadTables();
      });
      $("bar-transfer")?.addEventListener("click", transferOrder);
      $("bar-split")?.addEventListener("click", splitBill);
      $("bar-combine")?.addEventListener("click", combineBills);
    }
  }

  function pickTable(exceptId) {
    const rows = (root.state?.barTables || []).filter((t) => t.id !== exceptId);
    return rows[0]?.id || "";
  }

  async function transferOrder() {
    const t = ticketState();
    if (!t.table_id) return;
    const to = window.prompt("Transfer to table id", pickTable(t.table_id));
    if (!to) return;
    await api("/api/bar/tables/transfer", {
      method: "POST",
      body: JSON.stringify({
        from_id: t.table_id,
        to_id: to,
        idempotencyKey: globalThis.POSPayIntegrity?.newKey?.() || `bar-shift-${Date.now()}`,
      }),
    });
    t.table_id = to;
    await loadTables();
  }

  async function splitBill() {
    const t = ticketState();
    if (!t.table_id) return;
    const raw = window.prompt("Comma-separated line indexes to split off (0,1,2)", "0");
    const indexes = String(raw || "").split(",").map((n) => Number(n.trim())).filter((n) => Number.isFinite(n));
    await api(`/api/bar/tables/${encodeURIComponent(t.table_id)}/split`, { method: "POST", body: JSON.stringify({ indexes }) });
    await loadTables();
  }

  async function combineBills() {
    const t = ticketState();
    const other = window.prompt("Combine with table id", pickTable(t.table_id));
    if (!t.table_id || !other) return;
    await api("/api/bar/tables/combine", { method: "POST", body: JSON.stringify({ a_id: t.table_id, b_id: other }) });
    await loadTables();
  }

  async function loadStock() {
    const el = $("bar-stock-table");
    if (!el) return;
    const d = await api("/api/bar/stock");
    el.innerHTML = tableHtml(d.products || [], ["name", "brand", "category", "on_hand_ml", "low_stock_ml", "batch_no", "expiry_date", "cost_bottle"]);
    const move = $("bar-stock-move");
    if (move) {
      const kinds = (B()?.MOVEMENT_KINDS || []).filter((k) => k.id !== "sale");
      move.innerHTML = `<form id="bar-move-form" class="report-toolbar">
        <label>Product <select name="product_id">${(d.products || []).map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("")}</select></label>
        <label>Type <select name="kind">${kinds.map((k) => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.label)}</option>`).join("")}</select></label>
        <label>Qty ml <input name="qty_ml" type="number" step="1" required /></label>
        <label>Note <input name="note" /></label>
        <button class="btn primary" type="submit">Post movement</button>
      </form>
      <div class="table-wrap">${tableHtml(d.movements || [], ["created_at", "kind", "product_name", "qty_ml", "note", "user_name"])}</div>`;
      $("bar-move-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await api("/api/bar/movements", { method: "POST", body: JSON.stringify(Object.fromEntries(fd.entries())) });
        await loadStock();
      });
    }
  }

  async function loadSettings() {
    const el = $("bar-settings-box");
    if (!el) return;
    const s = await api("/api/bar/settings");
    root.state.barSettings = s;
    el.innerHTML = `<form id="bar-settings-form" class="settings item-composer">
      <label>License no. <input name="license_no" value="${escapeHtml(s.license_no || "")}" /></label>
      <label>License state <input name="license_state" value="${escapeHtml(s.license_state || "")}" /></label>
      <label>License expires <input name="license_expires" type="date" value="${escapeHtml(String(s.license_expires || "").slice(0, 10))}" /></label>
      <label>Opens <input name="open_hour" value="${escapeHtml(s.open_hour || "11:00")}" /></label>
      <label>Closes <input name="close_hour" value="${escapeHtml(s.close_hour || "23:30")}" /></label>
      <label>Peg 30 ml <input name="peg30_ml" type="number" value="${escapeHtml(s.peg30_ml || 30)}" /></label>
      <label>Peg 60 ml <input name="peg60_ml" type="number" value="${escapeHtml(s.peg60_ml || 60)}" /></label>
      <label>Tax % <input name="tax_rate" type="number" step="0.01" value="${escapeHtml(s.tax_rate || 18)}" /></label>
      <label>Invoice title <input name="invoice_title" value="${escapeHtml(s.invoice_title || "Bar Invoice")}" /></label>
      <label>Minimum age <input name="min_age" type="number" value="${escapeHtml(s.min_age || 21)}" /></label>
      <label class="full"><input type="checkbox" name="allow_peg" ${s.allow_peg ? "checked" : ""} /> Allow peg sales</label>
      <label class="full"><input type="checkbox" name="allow_quarter" ${s.allow_quarter ? "checked" : ""} /> Allow quarter bottles</label>
      <label class="full"><input type="checkbox" name="allow_half" ${s.allow_half ? "checked" : ""} /> Allow half bottles</label>
      <label class="full"><input type="checkbox" name="allow_bottle" ${s.allow_bottle ? "checked" : ""} /> Allow full bottles</label>
      <label class="full"><input type="checkbox" name="regulated" ${s.regulated ? "checked" : ""} /> Enforce license / hours</label>
      <label class="full"><input type="checkbox" name="allow_after_hours" ${s.allow_after_hours ? "checked" : ""} /> Allow after-hours (manager override)</label>
      <button class="btn primary" type="submit">Save bar settings</button>
    </form>`;
    $("bar-settings-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      ["allow_peg", "allow_quarter", "allow_half", "allow_bottle", "regulated", "allow_after_hours"].forEach((k) => {
        body[k] = fd.get(k) ? 1 : 0;
      });
      root.state.barSettings = await api("/api/bar/settings", { method: "POST", body: JSON.stringify(body) });
      if (root.setHint) root.setHint("Bar settings saved", "ok");
    });
  }

  function bind() {
    if (bind.done) return;
    bind.done = true;
    $("bar-product-new")?.addEventListener("click", () => openProduct(""));
    $("bar-product-q")?.addEventListener("input", () => loadProducts());
    $("bar-product-cat")?.addEventListener("change", () => loadProducts());
    $("bar-products-table")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-bar-edit]");
      if (btn) openProduct(btn.dataset.barEdit);
    });
    $("bar-counter-q")?.addEventListener("input", () => {
      ticketState().q = $("bar-counter-q").value;
      loadCounter();
    });
    $("bar-counter-cats")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-bar-cat]");
      if (!btn) return;
      ticketState().category = btn.dataset.barCat;
      loadCounter();
    });
    $("bar-counter-grid")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-bar-sku]");
      if (!btn) return;
      const p = (root.state?.barProducts || []).find((x) => x.id === btn.dataset.barSku);
      if (p) openServe(p);
    });
    $("bar-tables-grid")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-bar-table]");
      if (!btn) return;
      const tbl = (root.state?.barTables || []).find((x) => x.id === btn.dataset.barTable);
      const t = ticketState();
      t.table_id = tbl?.id || "";
      t.table_name = tbl?.name || "";
      t.service_type = tbl?.service_type || "dine-in";
      if (tbl?.hold?.lines?.length && !t.lines.length) {
        const products = root.state.barProducts || (await api("/api/bar/products"));
        root.state.barProducts = products;
        t.lines = tbl.hold.lines.map((l) => ({
          product: products.find((p) => p.id === l.product_id) || { id: l.product_id, name: l.name, ...l },
          serve: l.serve,
          qty: l.qty,
          discount: l.discount,
        }));
      }
      paintTicket();
      loadTables();
      if (root.showView) root.showView("bar-counter");
    });
    $("bar-report-list")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-bar-report]");
      if (b) loadBarReport(b.dataset.barReport);
    });
  }

  root.POSBarUi = {
    loadBarBoard,
    loadProducts,
    loadCounter,
    loadTables,
    loadStock,
    loadSettings,
    loadBarReport,
    bind,
  };
  document.addEventListener("DOMContentLoaded", bind);
})(typeof globalThis !== "undefined" ? globalThis : window);
