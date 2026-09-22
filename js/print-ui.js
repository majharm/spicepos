(function (root) {
  const $ = (id) => document.getElementById(id);
  const P = () => root.POSPrint;
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

  async function loadPrintBoard() {
    if (!$("print-board-kpis") && !$("print-dash-kpis")) return;
    if (!P()?.isPrintShop?.(root.state?.businessMeta)) return;
    try {
      const d = await api("/api/print/board");
      const html = (d.cards || [])
        .map((c) => `<button type="button" class="report-card dash-kpi" data-print-card="${escapeHtml(c.id)}"><span>${escapeHtml(c.label)}</span><strong>${c.money ? money(c.value) : escapeHtml(String(c.value ?? "—"))}</strong></button>`)
        .join("");
      ["print-board-kpis", "print-dash-kpis"].forEach((id) => {
        if ($(id)) $(id).innerHTML = html;
      });
      paintOrders(d.orders || []);
    } catch (err) {
      ["print-board-kpis", "print-dash-kpis"].forEach((id) => {
        if ($(id)) $(id).innerHTML = `<p class="hint error">${escapeHtml(err.message)}</p>`;
      });
    }
  }

  function paintOrders(rows) {
    const el = $("print-orders-table");
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = `<p class="hint">No print orders yet. Customers submit from the print portal.</p>`;
      return;
    }
    el.innerHTML = `<table><thead><tr><th>Order</th><th>Customer</th><th>Job</th><th>Size</th><th>Sq Ft</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${rows
      .map((o) => `<tr>
        <td>${escapeHtml(o.order_number)}</td>
        <td>${escapeHtml(o.customer_name || "")}</td>
        <td>${escapeHtml(o.product)} · ${escapeHtml(o.material_name || "")}</td>
        <td>${escapeHtml(o.width)} × ${escapeHtml(o.height)} ${escapeHtml(o.unit)}</td>
        <td>${escapeHtml(String(o.area_sqft))}</td>
        <td>${money(o.quote_total || o.estimate_total)}</td>
        <td>${escapeHtml(P().statusMeta(o.status).label)}</td>
        <td><button type="button" class="btn" data-print-open="${escapeHtml(o.id)}">Open</button></td>
      </tr>`)
      .join("")}</tbody></table>`;
  }

  async function loadPrintOrders() {
    if (!$("print-orders-table")) return;
    const tab = $("print-order-tab")?.value || "";
    const q = $("print-order-q")?.value || "";
    const rows = await api(`/api/print/orders?tab=${encodeURIComponent(tab)}&q=${encodeURIComponent(q)}`);
    paintOrders(rows);
  }

  async function openOrder(id) {
    const d = await api(`/api/print/orders/${encodeURIComponent(id)}`);
    const o = d.order;
    const files = (o.files || [])
      .map((f) => `<p>v${f.version} · ${escapeHtml(f.file_name)} · ${escapeHtml(f.status)} · ${escapeHtml(f.uploaded_by)}</p>`)
      .join("");
    const html = `<div class="print-order-detail">
      <p>${escapeHtml(o.customer_name)} · ${escapeHtml(o.order_number)}</p>
      <p>${escapeHtml(o.product)} · ${escapeHtml(o.material_name)} · ${escapeHtml(o.width)} × ${escapeHtml(o.height)} ${escapeHtml(o.unit)} · Qty ${escapeHtml(o.quantity)}</p>
      <p>Notes: ${escapeHtml(o.notes || "—")}</p>
      <div>${files || "<p>No files</p>"}</div>
      <p>Estimate ${money(o.estimate_total)} · Quote ${money(o.quote_total)} · Paid ${money(o.paid_amount)}</p>
      <div class="dash-actions">
        <button class="btn" data-print-review="approve" data-id="${escapeHtml(o.id)}">Approve File</button>
        <button class="btn" data-print-review="reject" data-id="${escapeHtml(o.id)}">Reject File</button>
        <button class="btn" data-print-review="request_file" data-id="${escapeHtml(o.id)}">Request New File</button>
        <button class="btn" data-print-review="request_changes" data-id="${escapeHtml(o.id)}">Request Changes</button>
      </div>
      <form id="print-quote-form">
        <input type="hidden" name="id" value="${escapeHtml(o.id)}" />
        <label>Rate <input name="rate" type="number" step="0.01" value="${escapeHtml(o.rate)}" /></label>
        <label>Discount <input name="discount" type="number" step="0.01" value="${escapeHtml(o.discount)}" /></label>
        <label>Delivery <input name="delivery_amount" type="number" step="0.01" value="${escapeHtml(o.delivery_amount)}" /></label>
        <label>GST % <input name="gst_rate" type="number" step="0.01" value="${escapeHtml(o.gst_rate)}" /></label>
        <button class="btn primary" type="submit">Send final quote</button>
      </form>
      <button class="btn primary" data-print-bill="${escapeHtml(o.id)}">Create Bill</button>
      ${(P().PRODUCTION_FLOW || []).map((s) => `<button class="btn" data-print-status="${escapeHtml(s)}" data-id="${escapeHtml(o.id)}">${escapeHtml(P().statusMeta(s).label)}</button>`).join("")}
    </div>`;
    if (root.showModal) root.showModal(`${o.order_number} · file review`, html);
    $("print-quote-form")?.addEventListener("submit", saveQuote);
  }

  async function saveQuote(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api(`/api/print/orders/${fd.get("id")}/quote`, {
      method: "POST",
      body: JSON.stringify({
        rate: fd.get("rate"),
        discount: fd.get("discount"),
        delivery_amount: fd.get("delivery_amount"),
        gst_rate: fd.get("gst_rate"),
      }),
    });
    loadPrintOrders();
    loadPrintBoard();
  }

  async function loadPrintSettings() {
    const el = $("print-settings-box");
    if (!el) return;
    const cat = await api("/api/print/catalog");
    el.innerHTML = `<form id="print-settings-form" class="settings">
      ${(cat.materials || [])
        .map(
          (m, i) => `<div class="print-mat"><strong>${escapeHtml(m.name)}</strong>
            <input name="mat_id_${i}" type="hidden" value="${escapeHtml(m.id)}" />
            <input name="mat_name_${i}" value="${escapeHtml(m.name)}" />
            <input name="mat_rate_${i}" type="number" step="0.01" value="${escapeHtml(m.rate)}" />
            <select name="mat_model_${i}"><option ${m.price_model === "sqft" ? "selected" : ""}>sqft</option><option ${m.price_model === "piece" ? "selected" : ""}>piece</option><option ${m.price_model === "size" ? "selected" : ""}>size</option><option ${m.price_model === "custom" ? "selected" : ""}>custom</option></select></div>`,
        )
        .join("")}
      <label>Max file MB <input name="max_file_mb" type="number" value="${escapeHtml(cat.settings?.max_file_mb || 25)}" /></label>
      <label>Min DPI <input name="min_dpi" type="number" value="${escapeHtml(cat.settings?.min_dpi || 72)}" /></label>
      <label>Customer approval required <select name="customer_approval_required"><option value="true" ${cat.settings?.customer_approval_required !== false ? "selected" : ""}>Yes</option><option value="false">No</option></select></label>
      <label>GST % <input name="gst_rate" type="number" value="${escapeHtml(cat.settings?.gst_rate || 18)}" /></label>
      <button class="btn primary" type="submit">Save print settings</button>
    </form>`;
    $("print-settings-form")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const materials = [];
      for (let i = 0; i < 40; i++) {
        if (!fd.get(`mat_id_${i}`)) break;
        materials.push({
          id: fd.get(`mat_id_${i}`),
          name: fd.get(`mat_name_${i}`),
          rate: fd.get(`mat_rate_${i}`),
          price_model: fd.get(`mat_model_${i}`),
        });
      }
      await api("/api/print/catalog", {
        method: "POST",
        body: JSON.stringify({
          materials,
          settings: {
            max_file_mb: Number(fd.get("max_file_mb")),
            min_dpi: Number(fd.get("min_dpi")),
            customer_approval_required: fd.get("customer_approval_required") === "true",
            gst_rate: Number(fd.get("gst_rate")),
          },
        }),
      });
      loadPrintSettings();
    });
  }

  document.addEventListener("click", async (e) => {
    const open = e.target.closest("[data-print-open]");
    const review = e.target.closest("[data-print-review]");
    const bill = e.target.closest("[data-print-bill]");
    const st = e.target.closest("[data-print-status]");
    const rep = e.target.closest("[data-print-report]");
    try {
      if (open) await openOrder(open.dataset.printOpen);
      if (review) {
        await api(`/api/print/orders/${review.dataset.id}/review`, { method: "POST", body: JSON.stringify({ action: review.dataset.printReview }) });
        loadPrintOrders();
      }
      if (bill) {
        const d = await api(`/api/print/orders/${bill.dataset.printBill}/bill`, { method: "POST", body: JSON.stringify({}) });
        if (d.invoice_id) location.hash = "";
        loadPrintOrders();
      }
      if (st) {
        await api(`/api/print/orders/${st.dataset.id}/status`, { method: "POST", body: JSON.stringify({ status: st.dataset.printStatus }) });
        loadPrintOrders();
      }
      if (rep) {
        const d = await api(`/api/print/reports/${rep.dataset.printReport}`);
        const out = $("print-report-out");
        if (out) out.innerHTML = `<p>Sq Ft ${d.kpi?.total_sqft} · Orders ${d.kpi?.orders} · Sales ${money(d.kpi?.sales)}</p>`;
      }
    } catch (err) {
      if (root.toast) root.toast(err.message);
      else alert(err.message);
    }
  });
  $("print-order-tab")?.addEventListener("change", loadPrintOrders);
  $("print-order-q")?.addEventListener("input", loadPrintOrders);

  root.POSPrintUi = { loadPrintBoard, loadPrintOrders, loadPrintSettings };
})(typeof globalThis !== "undefined" ? globalThis : window);
