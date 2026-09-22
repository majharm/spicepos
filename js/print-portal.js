(function () {
  const P = globalThis.POSPrint;
  const shopId = new URLSearchParams(location.search).get("shop") || "";
  const storeKey = `print-token:${shopId}`;
  let token = localStorage.getItem(storeKey) || "";
  let catalog = { materials: [], finishing: [], settings: {}, shop: {} };
  let me = null;
  let pendingFile = null;

  const $ = (id) => document.getElementById(id);
  function money(n) {
    return `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function hint(id, msg, err) {
    const el = $(id);
    if (!el) return;
    el.textContent = msg || "";
    el.className = err ? "hint error" : "hint";
  }
  async function api(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (!(opts.body instanceof FormData) && opts.body && typeof opts.body === "object") {
      headers["Content-Type"] = "application/json";
      opts = { ...opts, body: JSON.stringify(opts.body) };
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api/print/public/${encodeURIComponent(shopId)}${path}`, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  function showPane(name) {
    document.querySelectorAll("[data-pp]").forEach((b) => b.classList.toggle("is-on", b.dataset.pp === name));
    document.querySelectorAll(".pp-pane").forEach((p) => {
      p.hidden = p.getAttribute("data-pane") !== name;
    });
  }

  function fillCatalog() {
    const shopName = catalog.shop?.name || "Flex & Printing";
    $("pp-shop").textContent = shopName;
    if ($("pp-scene-shop")) $("pp-scene-shop").textContent = shopName;
    $("pp-cat").textContent = catalog.shop?.category || "Banners, vinyl, hoardings and print jobs";
    $("pp-product").innerHTML = (P.PRODUCTS || []).map((p) => `<option>${p}</option>`).join("");
    $("pp-side").innerHTML = (catalog.sides || P.PRINT_SIDES).map((s) => `<option value="${s.id}">${s.label}</option>`).join("");
    $("pp-material").innerHTML = (catalog.materials || [])
      .filter((m) => Number(m.active) !== 0)
      .map((m) => `<option value="${m.id}">${m.name} · ₹${m.rate}/${m.price_model === "piece" ? "pack" : "sq ft"}</option>`)
      .join("");
    $("pp-unit").innerHTML = (catalog.units || P.UNITS).map((u) => `<option value="${u.id}">${u.label}</option>`).join("");
    $("pp-unit").value = "ft";
    $("pp-dpi").innerHTML = (catalog.dpis || P.DPIS).map((d) => `<option>${d}</option>`).join("");
    $("pp-dpi").value = "150";
    $("pp-finish").innerHTML = (catalog.finishing || [])
      .filter((f) => Number(f.active) !== 0)
      .map((f) => `<label><input type="checkbox" name="fin" value="${f.id}" /> ${f.name} · ₹${f.rate}</label>`)
      .join("");
    estimate();
  }

  function selectedMaterial() {
    return (catalog.materials || []).find((m) => m.id === $("pp-material").value) || catalog.materials[0];
  }

  function selectedFinishing() {
    return [...document.querySelectorAll('#pp-finish input:checked')].map((el) => (catalog.finishing || []).find((f) => f.id === el.value)).filter(Boolean);
  }

  function sizeInput() {
    return {
      width: Number($("pp-width").value) || 0,
      height: Number($("pp-height").value) || 0,
      unit: $("pp-unit").value,
      quantity: Number($("pp-qty").value) || 1,
      dpi: Number($("pp-dpi").value) || 150,
      print_type: $("pp-side").value,
      material: selectedMaterial(),
      rate: Number(selectedMaterial()?.rate) || 0,
      price_model: selectedMaterial()?.price_model,
      gst_rate: Number(catalog.settings?.gst_rate) || 18,
      finishing: selectedFinishing(),
    };
  }

  function estimate() {
    const input = sizeInput();
    const area = P.areaSqFt(input.width, input.height, input.unit, input.dpi);
    const conv = P.convertSize(input.width, input.height, input.unit);
    $("pp-area").textContent = `Area = ${area} Sq Ft · Total area ${P.round2(area * input.quantity)} Sq Ft`;
    $("pp-conv").textContent = `${conv.feet.width} × ${conv.feet.height} ft  =  ${conv.inches.width} × ${conv.inches.height} in  =  ${conv.cm.width} × ${conv.cm.height} cm  =  ${conv.sqft} Sq Ft`;
    const q = P.quoteTotals(input);
    $("pp-estimate").innerHTML = `<strong>Estimated Price ${money(q.total)}</strong><span>Printing ${money(q.printing)} · Finishing ${money(q.finishing)} · GST ${money(q.gst)}. Estimate is not the final invoice until the shop approves.</span>`;
    if (pendingFile) {
      const w = P.qualityWarning(pendingFile, input, catalog.settings);
      $("pp-warn").hidden = !w.warn;
      $("pp-warn").textContent = w.message;
    }
  }

  function orderCard(o) {
    const steps = (o.timeline || P.customerTimeline(o.status))
      .map((s) => `<li class="${s.done ? "is-done" : ""} ${s.current ? "is-current" : ""}">${s.label}</li>`)
      .join("");
    const actions = [
      o.status === "quote_sent" ? `<button class="btn primary" data-approve="${o.id}">Approve &amp; Pay</button><button class="btn" data-changes="${o.id}">Request Changes</button><button class="btn" data-reject="${o.id}">Reject</button>` : "",
      Number(o.balance_due) > 0 && ["customer_approved", "payment_pending", "paid"].includes(o.status) ? `<button class="btn primary" data-pay="${o.id}" data-amt="${o.balance_due}">Pay ${money(o.balance_due)}</button>` : "",
      o.sales_order_id ? `<a class="btn" href="./invoice.html?id=${encodeURIComponent(o.sales_order_id)}" target="_blank" rel="noopener">Invoice</a>` : "",
    ].join("");
    return `<article class="pp-card pp-order" data-oid="${o.id}">
      <h3>${o.order_number} <span class="pp-status">${o.status_label || o.status}</span></h3>
      <p class="pp-order-meta">${o.product} · ${o.material_name || ""} · ${o.width} × ${o.height} ${o.unit} · Qty ${o.quantity}</p>
      <p class="pp-order-meta">${money(o.quote_total || o.estimate_total)}</p>
      <ol class="pp-steps">${steps}</ol>
      ${actions ? `<div class="pp-actions">${actions}</div>` : ""}
    </article>`;
  }

  function showAuthPanel(name) {
    const tab = name === "otp" ? "signin" : name;
    document.querySelectorAll("[data-auth-tab]").forEach((b) => {
      if (b.closest(".pp-auth-tabs")) {
        const on = b.dataset.authTab === tab;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      }
    });
    document.querySelectorAll("[data-auth-panel]").forEach((p) => {
      p.hidden = p.getAttribute("data-auth-panel") !== name;
    });
  }

  async function refreshMe() {
    me = await api("/me");
    document.body.classList.remove("pp-locked");
    $("pp-auth").hidden = true;
    $("pp-app").hidden = false;
    $("pp-nav").hidden = false;
    if ($("pp-signout")) $("pp-signout").hidden = false;
    const orders = me.orders || [];
    $("pp-kpis").innerHTML = [
      ["My Orders", orders.length],
      ["Pending approval", orders.filter((o) => o.status === "quote_sent").length],
      ["In production", orders.filter((o) => ["printing", "finishing", "quality_check", "production_pending"].includes(o.status)).length],
      ["Due", money(orders.reduce((s, o) => s + (Number(o.balance_due) || 0), 0))],
    ]
      .map(([k, v]) => `<div class="kpi"><span>${k}</span><strong>${v}</strong></div>`)
      .join("");
    document.querySelector('[data-pane="home"]').innerHTML = `<div class="pp-card"><h2>Dashboard</h2><p class="hint">Recent print jobs for this shop.</p><p><button class="btn primary" type="button" data-pp="new">+ New Print Order</button></p></div>${orders.slice(0, 5).map(orderCard).join("") || "<p class='hint'>No orders yet. Start a new print order.</p>"}`;
    $("pp-orders").innerHTML = orders.map(orderCard).join("") || "<p class='hint'>No orders yet.</p>";
    $("pp-quotes").innerHTML = orders.filter((o) => ["quote_sent", "customer_approved"].includes(o.status)).map(orderCard).join("") || "<p class='hint'>No quotes.</p>";
    $("pp-approvals").innerHTML = orders.filter((o) => o.status === "quote_sent").map(orderCard).join("") || "<p class='hint'>Nothing waiting for your approval.</p>";
    $("pp-invoices").innerHTML = orders
      .filter((o) => o.sales_order_id)
      .map((o) => `<p><a href="./invoice.html?id=${encodeURIComponent(o.sales_order_id)}" target="_blank" rel="noopener">${o.order_number}</a> · ${money(o.quote_total)}</p>`)
      .join("") || "<p class='hint'>No invoices yet.</p>";
    $("pp-pays").innerHTML = (me.payments || []).map((p) => `<p>${p.receipt_no || ""} · ${money(p.amount)} · ${p.method} · ${p.status}</p>`).join("") || "<p class='hint'>No payments.</p>";
    $("pp-track").innerHTML = orders.map(orderCard).join("") || "<p class='hint'>No orders to track.</p>";
    $("pp-files").innerHTML = (me.files || []).map((f) => `<p>v${f.version} · ${f.file_name} · ${(f.file_size / 1024).toFixed(1)} KB · ${f.status}</p>`).join("") || "<p class='hint'>Upload files from a print order.</p>";
    $("pp-downloads").innerHTML = (me.files || []).map((f) => `<p>${f.file_name} · v${f.version}</p>`).join("") || "<p class='hint'>Approved files appear here after review.</p>";
    if (me.customer) {
      $("pp-profile").name.value = me.customer.name || "";
      $("pp-profile").mobile.value = me.customer.mobile || "";
    }
  }

  function signed(data) {
    token = data.token;
    localStorage.setItem(storeKey, token);
    return refreshMe();
  }

  async function fileToPayload(file) {
    const content = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    let width_px = 0;
    let height_px = 0;
    if (String(file.type).startsWith("image/")) {
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          width_px = img.naturalWidth;
          height_px = img.naturalHeight;
          resolve();
        };
        img.onerror = resolve;
        img.src = content;
      });
    }
    return { file_name: file.name, content, width_px, height_px, file_size: file.size, mime: file.type };
  }

  $("pp-nav")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pp]");
    if (b) showPane(b.dataset.pp);
  });
  document.querySelector("[data-pane=home]")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pp]");
    if (b) showPane(b.dataset.pp);
  });
  document.querySelectorAll("[data-auth-tab]").forEach((b) => {
    b.addEventListener("click", () => showAuthPanel(b.dataset.authTab));
  });
  document.querySelectorAll("[data-toggle-pass]").forEach((b) => {
    b.addEventListener("click", () => {
      const form = $(b.dataset.togglePass);
      const input = form?.querySelector('input[name="password"]');
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      b.textContent = show ? "Hide" : "Show";
    });
  });
  $("pp-signout")?.addEventListener("click", () => {
    token = "";
    localStorage.removeItem(storeKey);
    location.reload();
  });
  ["pp-width", "pp-height", "pp-unit", "pp-qty", "pp-dpi", "pp-material", "pp-side"].forEach((id) => {
    $(id)?.addEventListener("input", estimate);
    $(id)?.addEventListener("change", estimate);
  });
  $("pp-finish")?.addEventListener("change", estimate);
  $("pp-file")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    pendingFile = await fileToPayload(file);
    $("pp-file-meta").textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB · ${file.type || "file"} · ${new Date().toLocaleString()}`;
    estimate();
  });

  $("pp-login")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await signed(await api("/login", { method: "POST", body: { identifier: fd.get("identifier"), password: fd.get("password") } }));
    } catch (err) {
      hint("pp-auth-hint", err.message, true);
    }
  });
  $("pp-register")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await signed(await api("/register", { method: "POST", body: Object.fromEntries(fd) }));
    } catch (err) {
      hint("pp-auth-hint", err.message, true);
    }
  });
  $("pp-otp-send")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api("/otp/send", { method: "POST", body: { email: fd.get("email") } });
      $("pp-otp-verify").hidden = false;
      hint("pp-auth-hint", "OTP sent to your email.");
    } catch (err) {
      hint("pp-auth-hint", err.message, true);
    }
  });
  $("pp-otp-verify")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = $("pp-otp-send").email.value;
    try {
      await signed(await api("/otp/verify", { method: "POST", body: { email, otp: fd.get("otp"), password: fd.get("password") } }));
    } catch (err) {
      hint("pp-auth-hint", err.message, true);
    }
  });
  $("pp-profile")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api("/profile", { method: "POST", body: { name: fd.get("name"), mobile: fd.get("mobile") } });
      hint("pp-profile-hint", "Saved.");
    } catch (err) {
      hint("pp-profile-hint", err.message, true);
    }
  });
  $("pp-order")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    hint("pp-order-hint", "Submitting…");
    try {
      const created = await api("/orders", {
        method: "POST",
        body: {
          product: fd.get("product"),
          print_type: fd.get("print_type"),
          material_id: fd.get("material_id"),
          width: fd.get("width"),
          height: fd.get("height"),
          unit: fd.get("unit"),
          dpi: fd.get("dpi"),
          quantity: fd.get("quantity"),
          notes: fd.get("notes"),
          finishing_ids: selectedFinishing().map((f) => f.id),
        },
      });
      if (pendingFile && created.order?.id) {
        await api(`/orders/${created.order.id}/files`, { method: "POST", body: pendingFile });
      }
      hint("pp-order-hint", `${created.order?.order_number || ""} ${created.message || ""}`);
      pendingFile = null;
      await refreshMe();
      showPane("orders");
    } catch (err) {
      hint("pp-order-hint", err.message, true);
    }
  });
  document.addEventListener("click", async (e) => {
    const approve = e.target.closest("[data-approve]");
    const changes = e.target.closest("[data-changes]");
    const reject = e.target.closest("[data-reject]");
    const pay = e.target.closest("[data-pay]");
    try {
      if (approve) await api(`/orders/${approve.dataset.approve}/approve`, { method: "POST", body: {} });
      if (changes) await api(`/orders/${changes.dataset.changes}/changes`, { method: "POST", body: { notes: prompt("What should we change?") || "" } });
      if (reject) await api(`/orders/${reject.dataset.reject}/reject`, { method: "POST", body: {} });
      if (pay) await api(`/orders/${pay.dataset.pay}/pay`, { method: "POST", body: { amount: pay.dataset.amt, method: "upi" } });
      if (approve || changes || reject || pay) await refreshMe();
    } catch (err) {
      alert(err.message);
    }
  });

  fetch(`/api/print/public/${encodeURIComponent(shopId)}`)
    .then(async (r) => {
      const data = await r.json().catch(() => null);
      if (!data || typeof data !== "object") throw new Error("Could not load this print shop. Check the link.");
      if (!r.ok) throw new Error(data.error || "Print shop not found");
      return data;
    })
    .then((d) => {
      catalog = d;
      fillCatalog();
      if (token) refreshMe().catch(() => localStorage.removeItem(storeKey));
    })
    .catch((err) => {
      const msg = String(err.message || "");
      hint("pp-auth-hint", /JSON|DOCTYPE|Unexpected token/i.test(msg) ? "Could not load this print shop. Check the link." : msg, true);
    });
  if (!shopId) hint("pp-auth-hint", "Open this page from your print shop link.", true);
})();
