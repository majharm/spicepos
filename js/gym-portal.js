(function () {
  const G = globalThis.POSGym;
  const shopId = new URLSearchParams(location.search).get("shop") || "";
  const storeKey = `gym-token:${shopId}`;
  let token = localStorage.getItem(storeKey) || "";
  let catalog = { shop: {}, plans: [], trainers: [], services: [], pay: [] };
  let me = null;

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
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api/gym/public/${encodeURIComponent(shopId)}${path}`, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }
  function showPane(name) {
    document.querySelectorAll("[data-gp]").forEach((b) => b.classList.toggle("is-on", b.dataset.gp === name));
    document.querySelectorAll(".sp-pane").forEach((p) => {
      p.hidden = p.getAttribute("data-pane") !== name;
    });
  }
  function fillCatalog() {
    $("gp-shop").textContent = catalog.shop?.name || "Gym";
    $("gp-cat").textContent = catalog.shop?.category || "Gym & Fitness Center";
    $("gp-plans").innerHTML =
      (catalog.plans || [])
        .map(
          (p) => `<article class="sp-card"><h3>${p.name}</h3><p>${p.duration_days} days${p.sessions ? ` · ${p.sessions} sessions` : ""}</p><p>${money(p.price)}${Number(p.admission_fee) ? ` · admission ${money(p.admission_fee)}` : ""}</p><button class="btn primary" type="button" data-renew="${p.id}">Choose plan</button></article>`,
        )
        .join("") || "<p class='hint'>No public plans yet.</p>";
    $("gp-services").innerHTML = (catalog.services || G?.SERVICES || []).map((s) => `<li>${s}</li>`).join("");
    if ($("gp-trainers")) {
      $("gp-trainers").innerHTML = `<option value="">Any</option>${(catalog.trainers || []).map((t) => `<option value="${t.id}">${t.name}${t.specialty ? ` · ${t.specialty}` : ""}</option>`).join("")}`;
    }
    $("gp-pay").innerHTML = (catalog.pay || G?.PAY_MODES || ["upi"]).map((p) => `<option>${p}</option>`).join("");
  }

  async function paintQr(payload) {
    const el = $("gp-qr");
    if (!el) return;
    el.textContent = payload || "";
    const img = $("gp-qr-img");
    if (!img || !payload) return;
    try {
      if (typeof QRCodeLib !== "undefined" && QRCodeLib.toDataURL) {
        img.src = await QRCodeLib.toDataURL(payload, { width: 200, margin: 1, errorCorrectionLevel: "M" });
        img.hidden = false;
      }
    } catch {
      img.hidden = true;
    }
  }

  async function refreshMe() {
    const d = await api("/me");
    me = d;
    $("gp-auth").hidden = true;
    $("gp-app").hidden = false;
    const m = d.member || {};
    const mem = d.membership || m.membership || {};
    $("gp-kpis").innerHTML = [
      ["Member ID", m.member_no || "—"],
      ["Status", G?.statusLabel?.(m.status) || m.status || "—"],
      ["Plan", mem.plan_name || "—"],
      ["Expires", String(mem.end_date || "").slice(0, 10) || "—"],
      ["Due", money(mem.due)],
    ]
      .map(([k, v]) => `<div class="kpi"><span>${k}</span><strong>${v}</strong></div>`)
      .join("");
    await paintQr(m.qr || G?.qrPayload?.(shopId, m.id));
    $("gp-programs").innerHTML =
      (d.programs || []).map((p) => `<article class="sp-card"><strong>${p.title}</strong><p>${p.kind}</p><p>${p.body || ""}</p></article>`).join("") ||
      "<p class='hint'>Your trainer has not assigned a diet or workout yet.</p>";
    $("gp-measures").innerHTML =
      (d.measurements || []).length
        ? `<table><thead><tr><th>Date</th><th>Weight</th><th>BMI</th><th>Waist</th></tr></thead><tbody>${d.measurements
            .map((r) => `<tr><td>${String(r.measured_at).slice(0, 10)}</td><td>${r.weight_kg}</td><td>${r.bmi}</td><td>${r.waist || "—"}</td></tr>`)
            .join("")}</tbody></table>`
        : "<p class='hint'>No body measurements yet.</p>";
    if (d.plans?.length) catalog.plans = d.plans;
    fillCatalog();
  }

  async function boot() {
    if (!shopId) {
      hint("gp-auth-hint", "Open this portal from your gym’s POS (gym.html?shop=…).", true);
      return;
    }
    try {
      catalog = await api("");
      fillCatalog();
    } catch (err) {
      hint("gp-auth-hint", err.message, true);
      return;
    }
    if (token) {
      try {
        await refreshMe();
      } catch {
        token = "";
        localStorage.removeItem(storeKey);
      }
    }
  }

  $("gp-login")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const d = await api("/login", { method: "POST", body: JSON.stringify({ mobile: fd.get("mobile"), password: fd.get("password") }) });
      token = d.token;
      localStorage.setItem(storeKey, token);
      await refreshMe();
    } catch (err) {
      hint("gp-auth-hint", err.message, true);
    }
  });
  $("gp-register")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const d = await api("/register", {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          mobile: fd.get("mobile"),
          email: fd.get("email"),
          password: fd.get("password"),
          gender: fd.get("gender"),
          emergency_name: fd.get("emergency_name"),
          emergency_mobile: fd.get("emergency_mobile"),
          trainer_id: fd.get("trainer_id"),
        }),
      });
      token = d.token;
      localStorage.setItem(storeKey, token);
      await refreshMe();
    } catch (err) {
      hint("gp-auth-hint", err.message, true);
    }
  });
  $("gp-logout")?.addEventListener("click", () => {
    token = "";
    localStorage.removeItem(storeKey);
    $("gp-app").hidden = true;
    $("gp-auth").hidden = false;
  });
  document.querySelectorAll("[data-gp]").forEach((b) => b.addEventListener("click", () => showPane(b.dataset.gp)));
  $("gp-plans")?.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-renew]");
    if (!b) return;
    try {
      const paid = Number($("gp-paid")?.value) || 0;
      const method = $("gp-pay")?.value || "upi";
      const d = await api("/renew", { method: "POST", body: JSON.stringify({ plan_id: b.dataset.renew, paid, method }) });
      hint("gp-renew-hint", `Receipt ${d.receipt_no} · paid ${money(d.paid)} · due ${money(d.due)}`);
      await refreshMe();
      showPane("home");
    } catch (err) {
      hint("gp-renew-hint", err.message, true);
    }
  });
  boot();
})();
