(function () {
  const S = globalThis.POSSalon;
  const shopId = new URLSearchParams(location.search).get("shop") || "";
  const storeKey = `salon-token:${shopId}`;
  let token = localStorage.getItem(storeKey) || "";
  let catalog = { items: [], staff: [], packages: [], shop: {} };
  let me = null;
  let chosenSlot = "";

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
    const res = await fetch(`/api/salon/public/${encodeURIComponent(shopId)}${path}`, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  function showPane(name) {
    document.querySelectorAll("[data-sp]").forEach((b) => b.classList.toggle("is-on", b.dataset.sp === name));
    document.querySelectorAll(".sp-pane").forEach((p) => {
      p.hidden = p.getAttribute("data-pane") !== name;
    });
  }

  function fillCatalog() {
    $("sp-shop").textContent = catalog.shop?.name || "Salon";
    $("sp-cat").textContent = catalog.shop?.category || "";
    const cats = [...new Set((catalog.items || []).map((i) => i.category).filter(Boolean))];
    $("sp-cat-sel").innerHTML = ["All", ...cats].map((c) => `<option>${c}</option>`).join("");
    fillServices();
    $("sp-staff").innerHTML = `<option value="">Any</option>${(catalog.staff || []).map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}`;
    $("sp-pkgs").innerHTML = (catalog.packages || [])
      .map((p) => `<article class="sp-card"><h3>${p.name}</h3><p>${p.description || ""}</p><p>${money(p.price)} · ${p.sessions} sessions · ${p.validity_days} days</p><button class="btn primary" type="button" data-buy="${p.id}">Buy package</button></article>`)
      .join("") || "<p class='hint'>No packages yet.</p>";
  }

  function fillServices() {
    const cat = $("sp-cat-sel").value;
    const rows = (catalog.items || []).filter((i) => Number(i.online_booking) !== 0 && (cat === "All" || i.category === cat));
    $("sp-service").innerHTML = rows.map((i) => `<option value="${i.id}" data-price="${i.price}" data-gst="${i.gst_rate || 0}" data-dur="${i.duration_min || 30}" data-disc="${i.discount_pct || 0}">${i.name} · ${money(i.price)}</option>`).join("");
    if ($("sp-service-2")) {
      $("sp-service-2").innerHTML = `<option value="">None</option>` + rows.map((i) => `<option value="${i.id}">${i.name} · ${money(i.price)}</option>`).join("");
    }
    quote();
  }

  function selectedService() {
    const id = $("sp-service").value;
    return (catalog.items || []).find((i) => i.id === id) || null;
  }

  function bookLines() {
    const svc = selectedService();
    const lines = svc
      ? [{ item_id: svc.id, name: svc.name, price: svc.price, qty: 1, gst_rate: svc.gst_rate, duration_min: svc.duration_min, discount_pct: svc.discount_pct }]
      : [];
    const extraId = $("sp-service-2")?.value;
    if (extraId && extraId !== svc?.id) {
      const extra = (catalog.items || []).find((i) => i.id === extraId);
      if (extra) lines.push({ item_id: extra.id, name: extra.name, price: extra.price, qty: 1, gst_rate: extra.gst_rate, duration_min: extra.duration_min, discount_pct: extra.discount_pct });
    }
    return lines;
  }

  function quote() {
    const lines = bookLines();
    if (!lines.length) {
      $("sp-quote").textContent = "";
      return;
    }
    const totals = S.bookingTotals(lines, Number($("sp-coupon").value) || 0);
    const mode = $("sp-adv").value;
    const val = mode === "fixed" ? 300 : mode === "percent" ? 30 : 0;
    const due = S.advanceDue(totals.total, mode, val);
    $("sp-quote").textContent = `Total ${money(totals.total)} · Advance ${money(due.advance)} · Remaining ${money(due.remaining)}`;
  }

  async function loadSlots() {
    const svc = selectedService();
    const date = $("sp-date").value;
    if (!svc || !date) return;
    const d = await api(`/slots?date=${encodeURIComponent(date)}&staff_id=${encodeURIComponent($("sp-staff").value)}&duration_min=${svc.duration_min || 30}`);
    $("sp-slots").innerHTML = (d.slots || [])
      .map((s) => `<button type="button" ${s.available ? "" : "disabled"} data-slot="${s.start}">${s.start}</button>`)
      .join("");
  }

  async function refreshMe() {
    me = await api("/me");
    $("sp-auth").hidden = true;
    $("sp-app").hidden = false;
    const pkg = (me.packages || []).find((p) => p.status === "active") || {};
    const usage = S.packageUsage(pkg.total_sessions, pkg.used_sessions);
    $("sp-kpis").innerHTML = [
      ["Upcoming", (me.bookings || []).filter((b) => ["pending", "confirmed"].includes(b.status)).length],
      ["Wallet", money(me.wallet)],
      ["Due", money(me.outstanding)],
      ["Remaining sessions", usage.remainingSessions],
    ]
      .map(([k, v]) => `<div class="kpi"><span>${k}</span><strong>${v}</strong></div>`)
      .join("");
    $("sp-upcoming").innerHTML = (me.bookings || [])
      .filter((b) => ["pending", "confirmed"].includes(b.status))
      .map((b) => `<div class="sp-card"><strong>${b.booking_number}</strong> · ${String(b.booking_date).slice(0, 10)} ${b.start_time} · ${b.status}
        <button type="button" data-res="${b.id}">Reschedule</button>
        <button type="button" data-cancel="${b.id}">Cancel</button>
        ${Number(b.balance_due) > 0 ? `<button type="button" data-pay="${b.id}" data-amt="${b.balance_due}">Pay balance ${money(b.balance_due)}</button>` : ""}
      </div>`)
      .join("") || "<p class='hint'>No upcoming bookings.</p>";
    $("sp-active-pkg").innerHTML = (me.packages || [])
      .map((p) => {
        const u = S.packageUsage(p.total_sessions, p.used_sessions);
        return `<div class="sp-card"><strong>${p.package_name}</strong><p>${u.usedSessions} used · ${u.remainingSessions} remaining · expires ${String(p.expires_at || "").slice(0, 10)}</p></div>`;
      })
      .join("") || "<p class='hint'>No active package.</p>";
    $("sp-hist").innerHTML = (me.bookings || []).map((b) => {
      const inv = b.sales_order_id ? `<a href="./invoice.html?id=${encodeURIComponent(b.sales_order_id)}" target="_blank" rel="noopener">Invoice</a>` : "";
      return `<p>${b.booking_number} · ${b.status} · ${money(b.total)} ${inv}</p>`;
    }).join("");
    $("sp-pays").innerHTML = (me.payments || []).map((p) => `<p>${p.receipt_no} · ${p.kind} · ${money(p.amount)} · ${p.method} · ${p.txn_id || ""}</p>`).join("");
    $("sp-favs").innerHTML = (me.favourites || []).map((id) => {
      const it = (catalog.items || []).find((x) => x.id === id);
      return `<p>${it?.name || id}</p>`;
    }).join("") || "<p class='hint'>No favourites.</p>";
    $("sp-use-pkg").innerHTML = `<option value="">No</option>${(me.packages || [])
      .filter((p) => p.status === "active" && Number(p.remaining_sessions) > 0)
      .map((p) => `<option value="${p.id}">${p.package_name} (${p.remaining_sessions} left)</option>`).join("")}`;
    const pf = $("sp-profile");
    if (pf && me.customer) {
      pf.name.value = me.customer.name || "";
      pf.mobile.value = me.customer.mobile || "";
    }
  }

  function signed(data) {
    token = data.token;
    localStorage.setItem(storeKey, token);
    return refreshMe();
  }

  $("sp-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      await signed(await api("/login", { method: "POST", body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }) }));
    } catch (err) {
      hint("sp-auth-hint", err.message, true);
    }
  });
  $("sp-register").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      await signed(await api("/register", { method: "POST", body: JSON.stringify({ name: fd.get("name"), email: fd.get("email"), mobile: fd.get("mobile"), password: fd.get("password") }) }));
    } catch (err) {
      hint("sp-auth-hint", err.message, true);
    }
  });
  $("sp-otp-send").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      await api("/otp/send", { method: "POST", body: JSON.stringify({ email: fd.get("email"), purpose: "login" }) });
      $("sp-otp-verify").hidden = false;
      $("sp-otp-verify").dataset.email = fd.get("email");
      hint("sp-auth-hint", "OTP sent to email (and SMS/WhatsApp when configured).");
    } catch (err) {
      hint("sp-auth-hint", err.message, true);
    }
  });
  $("sp-otp-verify").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      await signed(await api("/otp/verify", { method: "POST", body: JSON.stringify({ email: $("sp-otp-verify").dataset.email, otp: fd.get("otp"), password: fd.get("password"), purpose: fd.get("password") ? "reset" : "login" }) }));
    } catch (err) {
      hint("sp-auth-hint", err.message, true);
    }
  });
  $("sp-profile").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api("/profile", { method: "POST", body: JSON.stringify({ name: fd.get("name"), mobile: fd.get("mobile") }) });
    await refreshMe();
  });
  $("sp-logout").addEventListener("click", () => {
    token = "";
    localStorage.removeItem(storeKey);
    location.reload();
  });
  document.querySelector(".sp-nav").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sp]");
    if (b) showPane(b.dataset.sp);
  });
  $("sp-cat-sel").addEventListener("change", fillServices);
  $("sp-service").addEventListener("change", () => {
    quote();
    loadSlots();
  });
  $("sp-date").addEventListener("change", loadSlots);
  $("sp-staff").addEventListener("change", loadSlots);
  $("sp-coupon").addEventListener("input", quote);
  $("sp-adv").addEventListener("change", quote);
  $("sp-service-2")?.addEventListener("change", quote);
  $("sp-fav")?.addEventListener("click", async () => {
    const svc = selectedService();
    if (!svc) return;
    await api("/favourites", { method: "POST", body: JSON.stringify({ item_id: svc.id }) });
    await refreshMe();
  });
  $("sp-slots").addEventListener("click", (e) => {
    const b = e.target.closest("[data-slot]");
    if (!b) return;
    chosenSlot = b.dataset.slot;
    $("sp-slot").value = chosenSlot;
    $("sp-slots").querySelectorAll("button").forEach((x) => x.classList.toggle("is-on", x === b));
  });
  $("sp-book").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const svc = selectedService();
      if (!svc) throw new Error("Pick a service");
      if (!chosenSlot) throw new Error("Pick a time slot");
      const mode = $("sp-adv").value;
      const val = mode === "fixed" ? 300 : mode === "percent" ? 30 : 0;
      const lines = bookLines();
      const totals = S.bookingTotals(lines, Number($("sp-coupon").value) || 0);
      const due = S.advanceDue(totals.total, mode, val);
      const d = await api("/book", {
        method: "POST",
        body: JSON.stringify({
          lines,
          staff_id: $("sp-staff").value,
          staff_name: $("sp-staff").selectedOptions[0]?.textContent,
          date: $("sp-date").value,
          start_time: chosenSlot,
          duration_min: lines.reduce((s, l) => s + (Number(l.duration_min) || 30), 0),
          coupon_pct: Number($("sp-coupon").value) || 0,
          advance_mode: mode,
          advance_value: val,
          pay_amount: due.advance,
          pay_method: $("sp-pay").value,
          package_use_id: $("sp-use-pkg").value || "",
          waitlist: $("sp-wait").checked,
          recurring_rule: $("sp-recurring").checked ? "weekly" : "",
        }),
      });
      hint("sp-book-hint", `Booked ${d.number}. Advance ${money(d.paid)}. Remaining ${money(d.due.remaining)}.`);
      await refreshMe();
      showPane("home");
    } catch (err) {
      hint("sp-book-hint", err.message, true);
    }
  });
  $("sp-upcoming").addEventListener("click", async (e) => {
    const cancel = e.target.closest("[data-cancel]");
    const pay = e.target.closest("[data-pay]");
    const res = e.target.closest("[data-res]");
    if (cancel) await api(`/bookings/${cancel.dataset.cancel}/cancel`, { method: "POST", body: "{}" });
    if (pay) await api("/pay", { method: "POST", body: JSON.stringify({ booking_id: pay.dataset.pay, amount: pay.dataset.amt, method: "upi" }) });
    if (res) {
      const date = prompt("New date YYYY-MM-DD");
      const time = prompt("New time HH:MM");
      if (date && time) await api(`/bookings/${res.dataset.res}/reschedule`, { method: "POST", body: JSON.stringify({ date, start_time: time }) });
    }
    if (cancel || pay || res) await refreshMe();
  });
  $("sp-pkgs").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-buy]");
    if (!b) return;
    await api(`/packages/${b.dataset.buy}/buy`, { method: "POST", body: JSON.stringify({ method: "upi" }) });
    await refreshMe();
    showPane("home");
  });

  (async function boot() {
    if (!shopId) {
      $("sp-shop").textContent = "Missing shop link";
      return;
    }
    catalog = await api("");
    fillCatalog();
    const today = new Date().toISOString().slice(0, 10);
    $("sp-date").value = today;
    $("sp-date").min = today;
    if (token) {
      try {
        await refreshMe();
      } catch {
        token = "";
        localStorage.removeItem(storeKey);
      }
    }
  })();
})();
