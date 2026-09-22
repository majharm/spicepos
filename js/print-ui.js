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
  function niceNum(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return String(n ?? "—");
    return String(parseFloat(x.toFixed(4)));
  }
  function fileStatusLabel(s) {
    const id = String(s || "").toLowerCase();
    if (id === "uploaded") return "Uploaded";
    if (id === "approved") return "Approved";
    if (id === "rejected") return "Rejected";
    if (id === "replaced") return "Replaced";
    return s || "File";
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
    const list = Array.isArray(rows) ? rows : Array.isArray(rows?.orders) ? rows.orders : [];
    if (!list.length) {
      el.innerHTML = `<p class="hint">No print orders yet. Customers submit from the print portal.</p>`;
      const emptyDest = $("print-production-table");
      if (emptyDest && emptyDest !== el) emptyDest.innerHTML = el.innerHTML;
      return;
    }
    const meta = (status) => (P()?.statusMeta?.(status) || { label: status || "—" }).label;
    el.innerHTML = `<table><thead><tr><th>Order</th><th>Customer</th><th>Job</th><th>Size</th><th>Sq Ft</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${list
      .map((o) => `<tr>
        <td>${escapeHtml(o.order_number)}</td>
        <td>${escapeHtml(o.customer_name || "")}</td>
        <td>${escapeHtml(o.product)} · ${escapeHtml(o.material_name || "")}</td>
        <td>${escapeHtml(o.width)} × ${escapeHtml(o.height)} ${escapeHtml(o.unit)}</td>
        <td>${escapeHtml(String(o.area_sqft))}</td>
        <td>${money(o.quote_total || o.estimate_total)}</td>
        <td>${escapeHtml(meta(o.status))}</td>
        <td><button type="button" class="btn" data-print-open="${escapeHtml(o.id)}">Open</button></td>
      </tr>`)
      .join("")}</tbody></table>`;
    const dest = $("print-production-table");
    if (dest && dest !== el) dest.innerHTML = el.innerHTML;
  }

  async function loadPrintOrders() {
    const el = $("print-orders-table");
    if (!el) return;
    const tab = $("print-order-tab")?.value || "";
    const q = $("print-order-q")?.value || "";
    try {
      const rows = await api(`/api/print/orders?tab=${encodeURIComponent(tab)}&q=${encodeURIComponent(q)}`);
      paintOrders(rows);
    } catch (err) {
      el.innerHTML = `<p class="hint error">${escapeHtml(err.message || "Could not load print orders")}</p>`;
    }
  }

  function revealOrder(title, html) {
    if (typeof root.showModal === "function" && root.showModal(title, html)) return true;
    const modal = $("modal");
    const body = $("modal-body");
    if (modal && body) {
      if ($("modal-title")) $("modal-title").textContent = title;
      body.innerHTML = html;
      modal.hidden = false;
      return true;
    }
    const el = $("print-orders-table");
    if (el) el.insertAdjacentHTML("afterbegin", `<div class="print-order-detail">${html}</div>`);
    return false;
  }

  async function openOrder(id) {
    const d = await api(`/api/print/orders/${encodeURIComponent(id)}`);
    const o = d.order || d;
    if (!o?.id) throw new Error("Order not found");
    const Print = P();
    const statusId = String(o.status || "");
    const statusLabel = (Print?.statusMeta?.(statusId) || { label: statusId || "—" }).label;
    const files = (o.files || [])
      .map((f) => {
        const href = f.download || `/api/print/files/${encodeURIComponent(f.id)}`;
        return `<article class="pod-file">
          <div class="pod-file-meta">
            <strong>${escapeHtml(f.file_name || "Artwork")}</strong>
            <span>v${escapeHtml(f.version || "1")} · ${escapeHtml(fileStatusLabel(f.status))} · ${escapeHtml(f.uploaded_by || "customer")}</span>
          </div>
          <a class="btn" href="${escapeHtml(href)}" target="_blank" rel="noopener">View / Download</a>
        </article>`;
      })
      .join("");
    const flow = (Print?.PRODUCTION_FLOW || []).map((s) => {
      const on = s === statusId;
      const label = (Print?.statusMeta?.(s) || { label: s }).label;
      return `<button type="button" class="pod-step${on ? " is-on" : ""}" data-print-status="${escapeHtml(s)}" data-id="${escapeHtml(o.id)}" ${on ? "disabled aria-current=\"step\"" : ""}>${escapeHtml(label)}</button>`;
    }).join("");
    const notes = String(o.notes || "").trim();
    const html = `<div class="print-order-desk">
      <header class="pod-head">
        <div>
          <p class="pod-kicker">File review &amp; production</p>
          <h4>${escapeHtml(o.customer_name || "Customer")}</h4>
          <p class="pod-job">${escapeHtml(o.product || "Print")} · ${escapeHtml(o.material_name || "—")} · ${escapeHtml(niceNum(o.width))} × ${escapeHtml(niceNum(o.height))} ${escapeHtml(o.unit || "ft")} · Qty ${escapeHtml(o.quantity || 1)}${o.area_sqft ? ` · ${escapeHtml(niceNum(o.area_sqft))} sq ft` : ""}</p>
        </div>
        <span class="pod-status">${escapeHtml(statusLabel)}</span>
      </header>
      <dl class="pod-kpis">
        <div><dt>Estimate</dt><dd>${money(o.estimate_total)}</dd></div>
        <div><dt>Quote</dt><dd>${money(o.quote_total)}</dd></div>
        <div><dt>Paid</dt><dd>${money(o.paid_amount)}</dd></div>
      </dl>
      ${notes ? `<p class="pod-notes"><strong>Notes</strong> ${escapeHtml(notes)}</p>` : ""}
      <section class="pod-card">
        <h5>Artwork</h5>
        ${files || `<p class="hint">No files uploaded yet.</p>`}
      </section>
      <section class="pod-card">
        <h5>1. File review</h5>
        <p class="hint">Approve the customer file before you send a quote.</p>
        <div class="pod-actions">
          <button type="button" class="btn primary" data-print-review="approve" data-id="${escapeHtml(o.id)}" data-file-id="${escapeHtml((o.files || [])[0]?.id || "")}">Approve file</button>
          <button type="button" class="btn" data-print-review="request_changes" data-id="${escapeHtml(o.id)}">Request changes</button>
          <button type="button" class="btn" data-print-review="request_file" data-id="${escapeHtml(o.id)}">Request new file</button>
          <button type="button" class="btn danger" data-print-review="reject" data-id="${escapeHtml(o.id)}">Reject file</button>
        </div>
      </section>
      <section class="pod-card">
        <h5>2. Final quote</h5>
        <form id="print-quote-form" class="pod-quote">
          <input type="hidden" name="id" value="${escapeHtml(o.id)}" />
          <label>Rate / sq ft<input name="rate" type="number" step="0.01" min="0" value="${escapeHtml(o.rate ?? "")}" /></label>
          <label>Discount<input name="discount" type="number" step="0.01" min="0" value="${escapeHtml(o.discount ?? "0")}" /></label>
          <label>Delivery<input name="delivery_amount" type="number" step="0.01" min="0" value="${escapeHtml(o.delivery_amount ?? "0")}" /></label>
          <label>GST %<input name="gst_rate" type="number" step="0.01" min="0" value="${escapeHtml(o.gst_rate ?? "18")}" /></label>
          <button class="btn primary" type="submit">Send final quote</button>
        </form>
      </section>
      <section class="pod-card pod-bill">
        <div>
          <h5>3. Bill</h5>
          <p class="hint">Creates a sales invoice after the customer has approved the quote.</p>
        </div>
        <button type="button" class="btn primary" data-print-bill="${escapeHtml(o.id)}">Create bill</button>
      </section>
      <section class="pod-card">
        <h5>4. Production</h5>
        <p class="hint">Tap the next stage. The current step stays highlighted.</p>
        <div class="pod-flow">${flow}</div>
      </section>
    </div>`;
    revealOrder(o.order_number || "Print order", html);
    $("print-quote-form")?.addEventListener("submit", saveQuote);
  }

  async function saveQuote(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const id = fd.get("id");
    await api(`/api/print/orders/${id}/quote`, {
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
    if (id) await openOrder(id);
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
      <fieldset class="print-portal-art">
        <legend>Customer portal login image</legend>
        <p class="hint">This is the one side image on the customer print login (same layout as shop admin login). JPG, PNG or WebP, under 900 KB.</p>
        <img id="print-portal-hero-preview" alt="Customer portal preview" src="${escapeHtml(cat.settings?.portal_login_image || "./assets/login-atav-smart-pos.jpg?v=20260919loginp1")}" style="display:block;max-width:min(420px,100%);max-height:180px;object-fit:cover;border-radius:12px;margin:8px 0;border:1px solid #dbe7f3" />
        <input name="portal_login_image" id="print-portal-hero-url" type="hidden" value="${escapeHtml(cat.settings?.portal_login_image || "")}" />
        <label>Upload image
          <input id="print-portal-hero-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" />
        </label>
        <button class="btn" type="button" id="print-portal-hero-reset">Use default ATAV image</button>
      </fieldset>
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
            portal_login_image: fd.get("portal_login_image") || "",
          },
        }),
      });
      loadPrintSettings();
    });
    const preview = $("print-portal-hero-preview");
    const hidden = $("print-portal-hero-url");
    $("print-portal-hero-file")?.addEventListener("change", (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      if (file.size > 900 * 1024) {
        if (root.toast) root.toast("Image must be under 900 KB");
        else alert("Image must be under 900 KB");
        ev.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result || "");
        if (hidden) hidden.value = url;
        if (preview) preview.src = url;
      };
      reader.readAsDataURL(file);
    });
    $("print-portal-hero-reset")?.addEventListener("click", () => {
      if (hidden) hidden.value = "";
      if (preview) preview.src = "./assets/login-atav-smart-pos.jpg?v=20260919loginp1";
      const file = $("print-portal-hero-file");
      if (file) file.value = "";
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
        await api(`/api/print/orders/${review.dataset.id}/review`, {
          method: "POST",
          body: JSON.stringify({ action: review.dataset.printReview, file_id: review.dataset.fileId || undefined }),
        });
        loadPrintOrders();
        await openOrder(review.dataset.id);
      }
      if (bill) {
        const d = await api(`/api/print/orders/${bill.dataset.printBill}/bill`, { method: "POST", body: JSON.stringify({}) });
        if (d.invoice_id) {
          const modal = $("modal");
          if (modal) modal.hidden = true;
          location.hash = "";
        } else {
          await openOrder(bill.dataset.printBill);
        }
        loadPrintOrders();
      }
      if (st) {
        await api(`/api/print/orders/${st.dataset.id}/status`, { method: "POST", body: JSON.stringify({ status: st.dataset.printStatus }) });
        loadPrintOrders();
        await openOrder(st.dataset.id);
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
  $("print-order-toolbar")?.addEventListener("submit", (e) => e.preventDefault());
  $("print-order-tab")?.addEventListener("change", loadPrintOrders);
  $("print-order-q")?.addEventListener("input", loadPrintOrders);

  root.POSPrintUi = { loadPrintBoard, loadPrintOrders, loadPrintSettings };
})(typeof globalThis !== "undefined" ? globalThis : window);
