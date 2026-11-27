(function (root) {
  const $ = (id) => document.getElementById(id);
  const R = () => root.POSResort;
  function money(n) {
    if (typeof root.money === "function") return root.money(n);
    return `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function escapeHtml(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }
  function api(path, opts) {
    return root.api(path, opts);
  }
  function isResort() {
    const meta = root.state?.businessMeta;
    return Boolean(
      R()?.isResortShop?.(meta) ||
        root.POSFootwear?.isResortShop?.(meta) ||
        Number(meta?.resort_enabled) === 1,
    );
  }
  function hint(id, msg, err) {
    const el = $(id);
    if (!el) return;
    el.textContent = msg || "";
    el.className = err ? "hint error" : "hint";
  }
  function badge(status) {
    const id = R()?.statusId?.(status) || status || "";
    const label = R()?.physicalLabel?.(id) || R()?.categoryLabel?.(id) || id;
    return `<span class="resort-badge status-${escapeHtml(id)}">${escapeHtml(label)}</span>`;
  }
  function readinessLabel(status) {
    const id = R()?.statusId?.(status) || "ready";
    const row = (R()?.HOUSEKEEPING_STATUSES || []).find((item) => item.id === id);
    return row?.label || "Ready";
  }
  function roomCard(room) {
    const category = R()?.categoryLabel?.(room.category) || room.category || "Room";
    const name = String(room.name || "").trim();
    const title = name || category;
    const inactive = Number(room.active) === 0;
    return `<button type="button" class="resort-card room-card${inactive ? " is-off" : ""}" data-room="${escapeHtml(room.id)}">
      <span class="room-no">${escapeHtml(room.number || "—")}</span>
      <span class="room-title">${escapeHtml(title)}</span>
      <span class="room-facts">
        <span class="room-fact"><span>Category</span><strong>${escapeHtml(category)}</strong></span>
        <span class="room-fact"><span>Rate</span><strong>${money(room.rate)}</strong></span>
        <span class="room-fact"><span>Readiness</span><strong>${escapeHtml(readinessLabel(room.hk_status))}</strong></span>
      </span>
      <span class="room-status">${badge(room.physical_status)}${inactive ? `<span class="resort-badge">Inactive</span>` : ""}</span>
    </button>`;
  }
  function tableHtml(rows, keys) {
    if (!rows?.length) return `<p class="hint">No rows yet.</p>`;
    const cols = keys || Object.keys(rows[0]).filter((k) => !/json|password|id_number/.test(k)).slice(0, 8);
    return `<table><thead><tr>${cols.map((k) => `<th>${escapeHtml(k)}</th>`).join("")}</tr></thead><tbody>${rows
      .slice(0, 200)
      .map((r) => `<tr>${cols.map((k) => `<td>${escapeHtml(r[k])}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
  }

  async function loadResortBoard() {
    if (!$("resort-board-kpis") || !isResort()) return;
    try {
      const d = await api("/api/resort/board");
      $("resort-board-kpis").innerHTML = (d.cards || [])
        .map((c) => `<button type="button" class="report-card dash-kpi"><span>${escapeHtml(c.label)}</span><strong>${c.money ? money(c.value) : escapeHtml(String(c.value ?? "—"))}</strong></button>`)
        .join("");
      if ($("resort-arrivals")) $("resort-arrivals").innerHTML = tableHtml(d.arrivals || [], ["booking_no", "guest_name", "room_no", "check_in", "check_out"]);
      if ($("resort-departures")) $("resort-departures").innerHTML = tableHtml(d.departures || [], ["booking_no", "guest_name", "room_no", "check_out", "due"]);
      const list = $("resort-report-list");
      if (list && (d.reports || R()?.REPORTS)) {
        const reports = d.reports || R().REPORTS;
        list.innerHTML = reports.map((r) => `<button type="button" class="dash-tile" data-resort-report="${escapeHtml(r.id)}"><strong>${escapeHtml(r.title)}</strong></button>`).join("");
      }
      const portal = $("resort-portal-link");
      if (portal && root.state?.businessMeta?.id) {
        portal.href = `./resort-book.html?shop=${encodeURIComponent(root.state.businessMeta.id)}`;
      }
    } catch (err) {
      $("resort-board-kpis").innerHTML = `<p class="hint error">${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadRooms() {
    const el = $("resort-rooms-grid");
    if (!el || !isResort()) return;
    const d = await api("/api/resort/rooms");
    const roomSel = $("rb-room");
    if (roomSel) {
      const current = roomSel.value;
      roomSel.innerHTML = `<option value="">Choose a room</option>${(d.rooms || [])
        .map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.number)} · ${escapeHtml(R().categoryLabel(r.category))}${r.name ? ` · ${escapeHtml(r.name)}` : ""}</option>`)
        .join("")}`;
      if (current) roomSel.value = current;
    }
    el.innerHTML = (d.rooms || []).map(roomCard).join("") || `<p class="hint">Add rooms to start taking bookings.</p>`;
    el.querySelectorAll("[data-room]").forEach((btn) => {
      btn.onclick = () => fillRoom(d.rooms.find((r) => r.id === btn.dataset.room));
    });
  }

  function openRoomEditor() {
    const editor = $("resort-room-editor");
    if (editor) editor.open = true;
    editor?.scrollIntoView?.({ block: "nearest" });
  }
  function markRoom(id) {
    document.querySelectorAll("#resort-rooms-grid [data-room]").forEach((btn) => {
      btn.classList.toggle("is-on", btn.dataset.room === id);
    });
  }
  function blankRoom() {
    const form = $("resort-room-form");
    form?.reset();
    if ($("rr-id")) $("rr-id").value = "";
    if ($("rr-adults")) $("rr-adults").value = "2";
    if ($("rr-children")) $("rr-children").value = "1";
    if ($("rr-active")) $("rr-active").checked = true;
    markRoom("");
    hint("resort-room-hint", "");
    openRoomEditor();
    $("rr-number")?.focus();
  }
  function fillRoom(room) {
    if (!room || !$("resort-room-form")) return;
    $("rr-id").value = room.id;
    $("rr-number").value = room.number || "";
    $("rr-name").value = room.name || "";
    $("rr-category").value = room.category || "standard";
    $("rr-rate").value = room.rate || 0;
    $("rr-adults").value = room.max_adults || 2;
    $("rr-children").value = room.max_children || 1;
    $("rr-status").value = room.physical_status || "available";
    $("rr-active").checked = Number(room.active) !== 0;
    markRoom(room.id);
    openRoomEditor();
  }

  async function saveRoom(ev) {
    ev?.preventDefault?.();
    const body = {
      id: $("rr-id")?.value,
      number: $("rr-number")?.value,
      name: $("rr-name")?.value,
      category: $("rr-category")?.value,
      rate: $("rr-rate")?.value,
      max_adults: $("rr-adults")?.value,
      max_children: $("rr-children")?.value,
      physical_status: $("rr-status")?.value,
      active: $("rr-active")?.checked ? 1 : 0,
    };
    try {
      await api("/api/resort/rooms", { method: "POST", body });
      hint("resort-room-hint", "Room saved.");
      $("rr-id").value = "";
      loadRooms();
      loadResortBoard();
    } catch (err) {
      hint("resort-room-hint", err.message, true);
    }
  }

  function bookingLabel(status) {
    const id = R()?.statusId?.(status) || String(status || "");
    const row = (R()?.BOOKING_STATUSES || []).find((item) => item.id === id);
    if (row?.label) return row.label;
    return id.replace(/_/g, " ") || "Booking";
  }

  function stayBadge(status) {
    const id = R()?.statusId?.(status) || status || "";
    return `<span class="resort-badge status-${escapeHtml(id)}">${escapeHtml(bookingLabel(id))}</span>`;
  }

  function payLabel(status) {
    const words = String(status || "pending").replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  function stayCard(booking) {
    const nights = Number(R()?.nightsBetween?.(booking.check_in, booking.check_out) || 0);
    const due = Number(booking.due);
    const nightText = nights > 0 ? ` · ${nights} night${nights === 1 ? "" : "s"}` : "";
    return `<article class="stay-card">
      <div class="stay-card-top">
        <strong>${escapeHtml(booking.guest_name || "Guest")}</strong>
        ${stayBadge(booking.status)}
      </div>
      <span class="stay-meta">${escapeHtml(booking.booking_no || "Walk-in")} · Room ${escapeHtml(booking.room_no || "unassigned")}</span>
      <span class="stay-meta">${escapeHtml(booking.check_in || "")} → ${escapeHtml(booking.check_out || "")}${nightText}</span>
      <span class="stay-meta">${escapeHtml(payLabel(booking.payment_status))} · Due ${money(Number.isFinite(due) ? due : 0)}</span>
    </article>`;
  }

  function seedStayDates() {
    const inn = $("rb-in");
    const out = $("rb-out");
    if (!inn || !out || inn.value) return;
    const today = R()?.ymdInZone?.(new Date(), "Asia/Kolkata") || "";
    if (!today) return;
    inn.value = today;
    out.value = R()?.addDays?.(today, 1) || "";
  }

  function paintBookingFilter(q) {
    document.querySelectorAll("[data-book-filter]").forEach((btn) => {
      btn.classList.toggle("is-on", btn.dataset.bookFilter === q);
    });
  }

  async function loadBookings(filter) {
    const el = $("resort-bookings-table");
    if (!el || !isResort()) return;
    const roomSel = $("rb-room");
    if (roomSel && roomSel.options.length < 2) {
      try {
        await loadRooms();
      } catch {
        /* the stay list can still open */
      }
    }
    seedStayDates();
    const q = filter || $("resort-book-filter")?.value || "all";
    if ($("resort-book-filter")) $("resort-book-filter").value = q;
    paintBookingFilter(q);
    const d = await api(`/api/resort/bookings?filter=${encodeURIComponent(q)}`);
    const rows = d.bookings || [];
    el.innerHTML = rows.length ? rows.map(stayCard).join("") : `<p class="hint">No stays in this list.</p>`;
    paintInhouseSelect(d.in_house || d.bookings || []);
  }

  function paintInhouseSelect(rows) {
    const sel = $("counter-resort-folio");
    if (!sel) return;
    const current = sel.value;
    const inhouse = (rows || []).filter((r) => r.status === "checked_in" || r.status === "confirmed");
    sel.innerHTML = `<option value="">Restaurant bill — table or room folio</option>${inhouse
      .map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.room_no || r.room_id)} · ${escapeHtml(r.guest_name || "Guest")}</option>`)
      .join("")}`;
    if (current) sel.value = current;
  }

  async function saveWalkIn(ev) {
    ev?.preventDefault?.();
    try {
      await api("/api/resort/bookings", {
        method: "POST",
        body: {
          room_id: $("rb-room")?.value,
          check_in: $("rb-in")?.value,
          check_out: $("rb-out")?.value,
          adults: $("rb-adults")?.value,
          children: $("rb-children")?.value,
          guest: { name: $("rb-guest")?.value, mobile: $("rb-mobile")?.value, email: $("rb-email")?.value },
          payment: { status: $("rb-pay")?.value === "pay_on_arrival" ? "pending" : "paid", method: $("rb-pay")?.value, amount: Number($("rb-advance")?.value || 0) },
          source: "walk_in",
        },
      });
      hint("resort-book-hint", "Booking saved.");
      loadBookings();
      loadRooms();
    } catch (err) {
      hint("resort-book-hint", err.message, true);
    }
  }

  async function loadDesk() {
    if (!isResort()) return;
    const d = await api("/api/resort/bookings?filter=desk");
    if ($("resort-desk-arrivals")) $("resort-desk-arrivals").innerHTML = (d.arrivals || [])
      .map((b) => `<button type="button" class="resort-card" data-checkin="${escapeHtml(b.id)}"><span>${escapeHtml(b.booking_no)}</span><strong>${escapeHtml(b.guest_name)}</strong><span>${escapeHtml(b.room_no || "")} · ${escapeHtml(b.check_in)}</span></button>`)
      .join("") || `<p class="hint">No arrivals today.</p>`;
    if ($("resort-desk-house")) $("resort-desk-house").innerHTML = (d.in_house || [])
      .map((b) => `<button type="button" class="resort-card" data-checkout="${escapeHtml(b.id)}"><span>${escapeHtml(b.booking_no)}</span><strong>${escapeHtml(b.guest_name)}</strong><span>Due ${money(b.due)}</span></button>`)
      .join("") || `<p class="hint">No in-house guests.</p>`;
    $("resort-desk-arrivals")?.querySelectorAll("[data-checkin]").forEach((btn) => {
      btn.onclick = () => act("checkin", btn.dataset.checkin);
    });
    $("resort-desk-house")?.querySelectorAll("[data-checkout]").forEach((btn) => {
      btn.onclick = () => act("checkout", btn.dataset.checkout);
    });
    paintInhouseSelect(d.in_house || []);
  }

  async function act(kind, id) {
    try {
      await api(`/api/resort/bookings/${encodeURIComponent(id)}/${kind}`, { method: "POST", body: {} });
      loadDesk();
      loadRooms();
      loadResortBoard();
    } catch (err) {
      hint("resort-desk-hint", err.message, true);
    }
  }

  async function loadHousekeeping() {
    const el = $("resort-hk-grid");
    if (!el || !isResort()) return;
    const d = await api("/api/resort/housekeeping");
    el.innerHTML = (d.rooms || [])
      .map(
        (r) => `<button type="button" class="resort-card" data-hk="${escapeHtml(r.id)}" data-status="${escapeHtml(r.hk_status || "dirty")}">
          <span>${escapeHtml(r.number)}</span>${badge(r.physical_status)}${badge(r.hk_status || "dirty")}
        </button>`,
      )
      .join("");
    el.querySelectorAll("[data-hk]").forEach((btn) => {
      btn.onclick = async () => {
        const next = btn.dataset.status === "ready" ? "dirty" : "ready";
        await api("/api/resort/housekeeping", { method: "POST", body: { room_id: btn.dataset.hk, hk_status: next, physical_status: next === "ready" ? "available" : "cleaning" } });
        loadHousekeeping();
        loadRooms();
      };
    });
  }

  async function loadSettings() {
    const box = $("resort-settings-box");
    if (!box || !isResort()) return;
    const d = await api("/api/resort/settings");
    const s = d.settings || {};
    box.innerHTML = `<form id="resort-settings-form" class="resort-form">
      <label>Property name <input name="property_name" value="${escapeHtml(s.property_name || "")}" /></label>
      <label>Phone <input name="phone" value="${escapeHtml(s.phone || "")}" /></label>
      <label>Email <input name="email" value="${escapeHtml(s.email || "")}" /></label>
      <label class="full">Address <input name="address" value="${escapeHtml(s.address || "")}" /></label>
      <label>Check-in <input name="check_in_time" value="${escapeHtml(s.check_in_time || "14:00")}" /></label>
      <label>Check-out <input name="check_out_time" value="${escapeHtml(s.check_out_time || "11:00")}" /></label>
      <label>Hold minutes <input name="hold_minutes" type="number" value="${escapeHtml(s.hold_minutes || 10)}" /></label>
      <label>Tax % <input name="tax_rate" type="number" value="${escapeHtml(s.tax_rate || 12)}" /></label>
      <label class="full"><input type="checkbox" name="pay_on_arrival" ${s.pay_on_arrival ? "checked" : ""} /> Allow payment on arrival</label>
      <label class="full"><input type="checkbox" name="show_online_orders" ${s.show_online_orders ? "checked" : ""} /> Show Online orders in the menu</label>
      <label class="full">Booking policy <textarea name="booking_policy">${escapeHtml(s.booking_policy || "")}</textarea></label>
      <button class="btn primary" type="submit">Save property settings</button>
    </form>`;
    $("resort-settings-form").onsubmit = async (ev) => {
      ev.preventDefault();
      const form = ev.target;
      await api("/api/resort/settings", {
        method: "POST",
        body: {
          property_name: form.property_name.value,
          phone: form.phone.value,
          email: form.email.value,
          address: form.address.value,
          check_in_time: form.check_in_time.value,
          check_out_time: form.check_out_time.value,
          hold_minutes: form.hold_minutes.value,
          tax_rate: form.tax_rate.value,
          pay_on_arrival: form.pay_on_arrival.checked,
          show_online_orders: form.show_online_orders.checked ? 1 : 0,
          booking_policy: form.booking_policy.value,
        },
      });
      root.state = root.state || {};
      root.state.resortMenu = { show_online_orders: form.show_online_orders.checked ? 1 : 0 };
      root.applyNav?.();
      if (!form.show_online_orders.checked && root.state.currentView === "online-orders") root.showView?.("dashboard");
    };
  }

  async function loadReport(id) {
    const el = $("resort-report-out");
    if (!el) return;
    const d = await api(`/api/resort/reports/${encodeURIComponent(id)}`);
    el.innerHTML = tableHtml(d.rows || []);
  }

  async function loadInhouseFolio() {
    if (!isResort() || !$("counter-resort-folio")) return;
    try {
      const d = await api("/api/resort/bookings?filter=in_house");
      paintInhouseSelect(d.bookings || d.in_house || []);
    } catch {
      /* restaurant still works without folio */
    }
  }

  document.addEventListener("click", (ev) => {
    const report = ev.target.closest("[data-resort-report]");
    if (report) loadReport(report.dataset.resortReport);
  });
  $("resort-room-form")?.addEventListener("submit", saveRoom);
  $("resort-room-new")?.addEventListener("click", blankRoom);
  $("resort-walkin-form")?.addEventListener("submit", saveWalkIn);
  $("resort-book-filter")?.addEventListener("change", () => loadBookings());
  document.addEventListener("click", (ev) => {
    const chip = ev.target.closest?.("[data-book-filter]");
    if (!chip || !$("view-resort-bookings") || $("view-resort-bookings").hidden) return;
    loadBookings(chip.dataset.bookFilter);
  });
  $("counter-resort-folio")?.addEventListener("change", () => {
    root.state = root.state || {};
    root.state.activeResortStay = $("counter-resort-folio")?.value || "";
  });
  document.addEventListener("click", async (ev) => {
    if (ev.target?.id !== "counter-resort-post") return;
    const stayId = $("counter-resort-folio")?.value;
    if (!stayId) return;
    const cart = root.state?.cart || [];
    const total = cart.reduce((sum, line) => sum + (Number(line.total || line.price * line.qty) || 0), 0);
    if (total <= 0) return;
    try {
      await api("/api/resort/folio", { method: "POST", body: { booking_id: stayId, amount: total, kind: "restaurant", note: "Restaurant POS" } });
    } catch {
      /* keep restaurant checkout working */
    }
  });

  root.POSResortUi = {
    loadResortBoard,
    loadRooms,
    loadBookings,
    loadDesk,
    loadHousekeeping,
    loadSettings,
    loadInhouseFolio,
    paintInhouseSelect,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
