(function (root) {
  const $ = (id) => document.getElementById(id);
  const S = () => root.POSSalon;
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

  async function loadSalonBoard() {
    const kpiIds = ["salon-board-kpis", "salon-dash-kpis"];
    if (!kpiIds.some((id) => $(id)) || !S()?.isSalonShop?.(root.state?.businessMeta)) return;
    try {
      const d = await api("/api/salon/board");
      const html = (d.cards || [])
        .map((c) => `<button type="button" class="report-card dash-kpi" data-salon-card="${escapeHtml(c.id)}"><span>${escapeHtml(c.label)}</span><strong>${c.money ? money(c.value) : escapeHtml(String(c.value ?? "—"))}</strong></button>`)
        .join("");
      kpiIds.forEach((id) => {
        if ($(id)) $(id).innerHTML = html;
      });
      paintBookings(d.bookings || []);
      const preview = $("salon-bookings-preview");
      if (preview) preview.innerHTML = $("salon-bookings-table")?.innerHTML || "";
    } catch (err) {
      kpiIds.forEach((id) => {
        if ($(id)) $(id).innerHTML = `<p class="hint error">${escapeHtml(err.message)}</p>`;
      });
    }
  }

  function paintBookings(rows) {
    const el = $("salon-bookings-table");
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = `<p class="hint">No bookings yet. Customers book from the salon portal.</p>`;
      return;
    }
    el.innerHTML = `<table><thead><tr><th>Booking</th><th>Customer</th><th>Date</th><th>Time</th><th>Staff</th><th>Total</th><th>Advance</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${rows
      .map((b) => {
        const st = S().statusMeta(b.status);
        return `<tr>
          <td>${escapeHtml(b.booking_number)}</td>
          <td>${escapeHtml(b.customer_name || "")}</td>
          <td>${escapeHtml(String(b.booking_date || "").slice(0, 10))}</td>
          <td>${escapeHtml(b.start_time || "")}</td>
          <td>${escapeHtml(b.staff_name || "Any")}</td>
          <td>${money(b.total)}</td>
          <td>${money(b.advance_paid)}</td>
          <td>${money(b.balance_due)}</td>
          <td><span class="salon-badge status-${escapeHtml(b.status)}">${escapeHtml(st.label)}</span></td>
          <td>${(st.next || []).map((n) => `<button type="button" class="btn" data-salon-status="${escapeHtml(b.id)}" data-to="${escapeHtml(n)}">${escapeHtml(S().statusMeta(n).label)}</button>`).join("")}</td>
        </tr>`;
      })
      .join("")}</tbody></table>`;
  }

  async function loadSalonBookings() {
    if (!$("salon-bookings-table")) return;
    const q = $("salon-book-q")?.value || "";
    const status = $("salon-book-status")?.value || "";
    const rows = await api(`/api/salon/bookings?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`);
    paintBookings(rows);
  }

  async function loadSalonPackages() {
    const el = $("salon-packages-table");
    if (!el) return;
    const rows = await api("/api/salon/packages");
    el.innerHTML = rows.length
      ? `<div class="hub-tile-grid">${rows
          .map(
            (p) => `<article class="dash-tile"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.category || "")} · ${p.sessions} sessions · ${money(p.price)}</span>
              <span>Individual ${money(p.savings?.individualTotal)} · Save ${money(p.savings?.savings)}</span>
              <button type="button" class="btn" data-pkg-edit="${escapeHtml(p.id)}">Edit</button></article>`,
          )
          .join("")}</div>`
      : `<p class="hint">Create a bridal or beauty package with visits and validity.</p>`;
    root.state = root.state || {};
    root.state.salonPackages = rows;
  }

  function packageFormHtml(p) {
    p = p || {};
    const items = (root.state?.items || []).filter((i) => i.status !== "inactive");
    const lines = p.items || [{ item_id: "", qty: 1, price: 0 }];
    return `<form id="salon-pkg-form" class="settings item-composer">
      <input type="hidden" name="id" value="${escapeHtml(p.id || "")}" />
      <label>Package name <input name="name" required value="${escapeHtml(p.name || "")}" /></label>
      <label>Category <select name="category">${S().CATEGORIES.map((c) => `<option ${c === (p.category || "") ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}</select></label>
      <label>Package price <input name="price" type="number" min="0" step="0.01" value="${escapeHtml(p.price || 0)}" /></label>
      <label>GST % <input name="gst_rate" type="number" min="0" step="0.01" value="${escapeHtml(p.gst_rate || 0)}" /></label>
      <label>Validity (days) <input name="validity_days" type="number" min="1" value="${escapeHtml(p.validity_days || 90)}" /></label>
      <label>Sessions / visits <input name="sessions" type="number" min="1" value="${escapeHtml(p.sessions || 1)}" /></label>
      <label>Gender <select name="gender">${S().GENDERS.map((g) => `<option ${g === (p.gender || "unisex") ? "selected" : ""}>${g}</option>`).join("")}</select></label>
      <label class="full">Description <textarea name="description">${escapeHtml(p.description || "")}</textarea></label>
      <label class="full">Terms <textarea name="terms">${escapeHtml(p.terms || "")}</textarea></label>
      <div class="full" id="salon-pkg-lines">${lines
        .map(
          (l, i) => `<div class="salon-pkg-line"><select name="item_${i}">${items.map((it) => `<option value="${escapeHtml(it.id)}" ${it.id === l.item_id ? "selected" : ""}>${escapeHtml(it.name)}</option>`).join("")}</select>
            <input name="qty_${i}" type="number" min="1" value="${escapeHtml(l.qty || 1)}" />
            <input name="price_${i}" type="number" min="0" step="0.01" value="${escapeHtml(l.price || 0)}" /></div>`,
        )
        .join("")}</div>
      <button class="btn primary" type="submit">Save package</button>
    </form>`;
  }

  async function openPackageForm(id) {
    const p = (root.state?.salonPackages || []).find((x) => x.id === id) || {};
    if (root.showModal) root.showModal("Service package", packageFormHtml(p));
    else if ($("salon-pkg-work")) $("salon-pkg-work").innerHTML = packageFormHtml(p);
    $("salon-pkg-form")?.addEventListener("submit", savePackage);
  }

  async function savePackage(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const items = [];
    for (let i = 0; i < 12; i++) {
      const item_id = fd.get(`item_${i}`);
      if (!item_id) continue;
      items.push({ item_id, qty: Number(fd.get(`qty_${i}`)) || 1, price: Number(fd.get(`price_${i}`)) || 0 });
    }
    await api("/api/salon/packages", {
      method: "POST",
      body: JSON.stringify({
        id: fd.get("id") || undefined,
        name: fd.get("name"),
        category: fd.get("category"),
        price: fd.get("price"),
        gst_rate: fd.get("gst_rate"),
        validity_days: fd.get("validity_days"),
        sessions: fd.get("sessions"),
        gender: fd.get("gender"),
        description: fd.get("description"),
        terms: fd.get("terms"),
        items,
      }),
    });
    if (root.hideModal) root.hideModal();
    await loadSalonPackages();
  }

  async function loadSalonReport(id) {
    const el = $("salon-report-out");
    if (!el) return;
    const d = await api(`/api/salon/reports/${encodeURIComponent(id)}`);
    const rows = d.rows || [];
    if (!rows.length) {
      el.innerHTML = `<p class="hint">No rows for this report.</p>`;
      return;
    }
    const keys = Object.keys(rows[0]).filter((k) => !/json|_id$/.test(k)).slice(0, 8);
    el.innerHTML = `<table><thead><tr>${keys.map((k) => `<th>${escapeHtml(k)}</th>`).join("")}</tr></thead><tbody>${rows
      .slice(0, 200)
      .map((r) => `<tr>${keys.map((k) => `<td>${escapeHtml(r[k])}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
  }

  function bind() {
    $("salon-bookings-table")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-salon-status]");
      if (!btn) return;
      await api(`/api/salon/bookings/${btn.dataset.salonStatus}/status`, { method: "POST", body: JSON.stringify({ status: btn.dataset.to }) });
      await loadSalonBookings();
      await loadSalonBoard();
    });
    $("salon-book-q")?.addEventListener("input", () => loadSalonBookings());
    $("salon-book-status")?.addEventListener("change", () => loadSalonBookings());
    $("salon-pkg-new")?.addEventListener("click", () => openPackageForm(""));
    $("salon-packages-table")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-pkg-edit]");
      if (b) openPackageForm(b.dataset.pkgEdit);
    });
    $("salon-report-list")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-salon-report]");
      if (b) loadSalonReport(b.dataset.salonReport);
    });
    const portal = $("salon-portal-link");
    if (portal && root.state?.businessMeta?.id) {
      portal.href = `./salon.html?shop=${encodeURIComponent(root.state.businessMeta.id)}`;
    }
  }

  root.POSSalonUi = {
    loadSalonBoard,
    loadSalonBookings,
    loadSalonPackages,
    bind,
  };
  document.addEventListener("DOMContentLoaded", bind);
})(typeof globalThis !== "undefined" ? globalThis : window);
