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
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }
  function hint(id, msg, err) {
    const el = $(id);
    if (!el) return;
    el.textContent = msg || "";
    el.className = err === "ok" ? "hint ok" : err ? "hint error" : "hint";
  }
  async function api(path, opts = {}) {
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api/gym/public/${encodeURIComponent(shopId)}${path}`, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }
  function todayYmd() {
    return G?.ymdIst?.(new Date()) || G?.ymdLocal?.(new Date()) || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }
  function daysLeft(end) {
    const e = String(end || "").slice(0, 10);
    if (!e) return null;
    const t0 = new Date(`${todayYmd()}T00:00:00`);
    const t1 = new Date(`${e}T00:00:00`);
    if (Number.isNaN(t0.getTime()) || Number.isNaN(t1.getTime())) return null;
    return Math.round((t1 - t0) / 86400000);
  }
  function bmiLabel(n) {
    const v = Number(n) || 0;
    if (v <= 0) return "";
    if (v < 18.5) return "Underweight";
    if (v < 25) return "Normal";
    if (v < 30) return "Overweight";
    return "Obese";
  }
  function showPane(name) {
    document.querySelectorAll("[data-gp]").forEach((b) => b.classList.toggle("is-on", b.dataset.gp === name));
    document.querySelectorAll(".gp-pane").forEach((p) => {
      p.hidden = p.getAttribute("data-pane") !== name;
    });
  }
  function showAuthPanel(name) {
    document.querySelectorAll("[data-auth-tab]").forEach((b) => {
      if (b.closest(".gp-auth-tabs")) {
        const on = b.dataset.authTab === name;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      }
    });
    document.querySelectorAll("[data-auth-panel]").forEach((p) => {
      p.hidden = p.getAttribute("data-auth-panel") !== name;
    });
  }
  function fillCatalog() {
    const shopName = catalog.shop?.name || "Gym";
    const cat = catalog.shop?.category || "Gym & Fitness Center";
    if ($("gp-shop")) $("gp-shop").textContent = shopName;
    if ($("gp-scene-shop")) $("gp-scene-shop").textContent = shopName;
    if ($("gp-id-shop")) $("gp-id-shop").textContent = shopName;
    if ($("gp-cat")) {
      const bits = [cat, catalog.shop?.address, catalog.shop?.mobile].filter(Boolean);
      $("gp-cat").textContent = bits.join(" · ");
    }
    if ($("gp-plans")) {
      $("gp-plans").innerHTML =
        (catalog.plans || [])
          .map((p) => {
            const kind = G?.planKind?.(p.kind)?.label || p.kind || "Plan";
            const extra = Number(p.sessions) ? ` · ${p.sessions} sessions` : "";
            const adm = Number(p.admission_fee) ? `<span>Admission ${money(p.admission_fee)}</span>` : "";
            return `<article class="gp-plan">
              <span class="gp-badge">${escapeHtml(kind)}</span>
              <h3>${escapeHtml(p.name)}</h3>
              <p class="hint">${escapeHtml(String(p.duration_days || 0))} days${escapeHtml(extra)}</p>
              <p class="gp-price">${money(p.price)}</p>
              ${adm}
              <button class="btn primary" type="button" data-renew="${escapeHtml(p.id)}">Choose plan</button>
            </article>`;
          })
          .join("") || "<p class='hint'>No public plans yet.</p>";
    }
    if ($("gp-services")) {
      $("gp-services").innerHTML = (catalog.services || G?.SERVICES || [])
        .map((s) => `<p class="gp-tile">${escapeHtml(s)}</p>`)
        .join("");
    }
    if ($("gp-trainers")) {
      $("gp-trainers").innerHTML = `<option value="">Any</option>${(catalog.trainers || [])
        .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}${t.specialty ? ` · ${escapeHtml(t.specialty)}` : ""}</option>`)
        .join("")}`;
    }
    if ($("gp-pay")) {
      $("gp-pay").innerHTML = (catalog.pay || G?.PAY_MODES || ["upi"]).map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
    }
  }

  async function paintQr(payload) {
    const el = $("gp-qr");
    if (el) el.textContent = payload || "";
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

  function homeHtml(d) {
    const m = d.member || {};
    const mem = d.membership || m.membership || {};
    const status = G?.statusLabel?.(m.status) || m.status || "—";
    const left = daysLeft(mem.end_date);
    const due = Number(mem.due) || 0;
    const alerts = [];
    if (m.status === "expired") alerts.push(`<p class="gp-alert is-due">Membership expired. Choose a plan to train again.</p>`);
    else if (m.status === "frozen") alerts.push(`<p class="gp-alert">Membership is frozen. Ask the gym desk to unfreeze.</p>`);
    else if (left != null && left <= 7) alerts.push(`<p class="gp-alert">Membership ends in ${left} day${left === 1 ? "" : "s"} (${escapeHtml(String(mem.end_date || "").slice(0, 10))}).</p>`);
    if (due > 0) alerts.push(`<p class="gp-alert is-due">Pending due ${money(due)}. Pay here or at the desk.</p>`);
    const planLine = mem.plan_name
      ? `${escapeHtml(mem.plan_name)} · valid till ${escapeHtml(String(mem.end_date || "").slice(0, 10) || "—")}`
      : "No active plan yet. Pick one under Plans.";
    return `${alerts.join("")}
      <article class="gp-card gp-hero">
        <p class="gp-kicker">Membership</p>
        <h2>Hi, ${escapeHtml(m.name || "member")}</h2>
        <p><span class="gp-badge status-${escapeHtml(m.status || "")}">${escapeHtml(status)}</span></p>
        <p>${planLine}</p>
        <div class="gp-hero-actions">
          <button class="btn primary" type="button" data-gp="card">Show QR card</button>
          <button class="btn" type="button" data-gp="plans">Renew plan</button>
          <button class="btn" type="button" data-gp="progress">Progress</button>
        </div>
      </article>`;
  }

  async function refreshMe() {
    const d = await api("/me");
    me = d;
    document.body.classList.remove("gp-locked");
    $("gp-auth").hidden = true;
    $("gp-app").hidden = false;
    if ($("gp-nav")) $("gp-nav").hidden = false;
    if ($("gp-logout")) $("gp-logout").hidden = false;
    const m = d.member || {};
    const mem = d.membership || m.membership || {};
    const left = daysLeft(mem.end_date);
    $("gp-kpis").innerHTML = [
      ["Member ID", m.member_no || "—"],
      ["Status", G?.statusLabel?.(m.status) || m.status || "—"],
      ["Plan", mem.plan_name || "—"],
      ["Expires", left == null ? String(mem.end_date || "").slice(0, 10) || "—" : left < 0 ? "Ended" : `${left} days`],
      ["Due", money(mem.due)],
    ]
      .map(([k, v]) => `<div class="kpi"><span>${escapeHtml(k)}</span><strong>${escapeHtml(String(v))}</strong></div>`)
      .join("");
    if ($("gp-home")) $("gp-home").innerHTML = homeHtml(d);
    if ($("gp-id-name")) $("gp-id-name").textContent = m.name || "Member";
    if ($("gp-id-no")) $("gp-id-no").textContent = m.member_no || "";
    if ($("gp-id-status")) {
      $("gp-id-status").textContent = G?.statusLabel?.(m.status) || m.status || "";
      $("gp-id-status").className = `gp-badge status-${m.status || ""}`;
    }
    await paintQr(m.qr || G?.qrPayload?.(shopId, m.id));
    if ($("gp-programs")) {
      $("gp-programs").innerHTML =
        (d.programs || [])
          .map(
            (p) =>
              `<article class="gp-card"><span class="gp-badge">${escapeHtml(p.kind)}</span><h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(p.body || "")}</p></article>`,
          )
          .join("") || "<p class='hint'>Your trainer has not assigned a diet or workout yet.</p>";
    }
    if ($("gp-measures")) {
      const rows = d.measurements || [];
      const latest = rows[0];
      const bmi = Number(latest?.bmi) || 0;
      $("gp-measures").innerHTML = rows.length
        ? `${bmi ? `<p class="gp-bmi"><strong>${escapeHtml(String(bmi))}</strong><span>BMI · ${escapeHtml(bmiLabel(bmi))}</span></p>` : ""}
          <table class="gp-table"><thead><tr><th>Date</th><th>Weight</th><th>BMI</th><th>Waist</th></tr></thead><tbody>${rows
            .map(
              (r) =>
                `<tr><td>${escapeHtml(String(r.measured_at).slice(0, 10))}</td><td>${escapeHtml(r.weight_kg)}</td><td>${escapeHtml(r.bmi)}</td><td>${escapeHtml(r.waist || "—")}</td></tr>`,
            )
            .join("")}</tbody></table>`
        : "<p class='hint'>No body measurements yet.</p>";
    }
    if (d.plans?.length) catalog.plans = d.plans;
    fillCatalog();
  }

  function signed(data) {
    token = data.token;
    localStorage.setItem(storeKey, token);
    return refreshMe();
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
  $("gp-nav")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-gp]");
    if (b) showPane(b.dataset.gp);
  });
  $("gp-home")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-gp]");
    if (b) showPane(b.dataset.gp);
  });
  $("gp-login")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await signed(await api("/login", { method: "POST", body: JSON.stringify({ mobile: fd.get("mobile"), password: fd.get("password") }) }));
    } catch (err) {
      hint("gp-auth-hint", err.message, true);
    }
  });
  $("gp-register")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await signed(
        await api("/register", {
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
        }),
      );
    } catch (err) {
      hint("gp-auth-hint", err.message, true);
    }
  });
  $("gp-logout")?.addEventListener("click", () => {
    token = "";
    localStorage.removeItem(storeKey);
    location.reload();
  });
  $("gp-plans")?.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-renew]");
    if (!b) return;
    try {
      const paid = Number($("gp-paid")?.value) || 0;
      const method = $("gp-pay")?.value || "upi";
      const d = await api("/renew", { method: "POST", body: JSON.stringify({ plan_id: b.dataset.renew, paid, method }) });
      hint("gp-renew-hint", `Receipt ${d.receipt_no} · paid ${money(d.paid)} · due ${money(d.due)}`, "ok");
      await refreshMe();
      showPane("home");
    } catch (err) {
      hint("gp-renew-hint", err.message, true);
    }
  });
  boot();
})();
