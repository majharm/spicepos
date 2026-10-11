(function (root) {
  const R = () => root.POSResort;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const shopId = params.get("shop") || params.get("s") || "";
  const state = { search: null, hold: null, selected: null };

  function money(n) {
    return `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function escapeHtml(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }
  function hint(msg, err) {
    const el = $("book-hint");
    if (!el) return;
    el.textContent = msg || "";
    el.className = err ? "hint error" : "hint";
  }
  async function api(path, opts) {
    if (typeof root.api === "function") return root.api(path, opts);
    const res = await fetch(path, {
      method: opts?.method || "GET",
      headers: { "Content-Type": "application/json" },
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }
  function today() {
    return R()?.ymdInZone?.(new Date()) || new Date().toISOString().slice(0, 10);
  }
  function tomorrow() {
    return R()?.addDays?.(today(), 1) || today();
  }

  async function loadProperty() {
    if (!shopId) {
      hint("This booking page needs a shop link from the resort.", true);
      return;
    }
    try {
      const d = await api(`/api/resort/public/${encodeURIComponent(shopId)}`);
      if ($("book-title")) $("book-title").textContent = d.property?.property_name || d.business?.name || "Resort booking";
      if ($("book-sub")) $("book-sub").textContent = d.property?.address || "Select dates to see live room availability.";
      const inEl = $("book-in");
      const outEl = $("book-out");
      if (inEl && !inEl.value) inEl.value = today();
      if (outEl && !outEl.value) outEl.value = tomorrow();
    } catch (err) {
      hint(err.message, true);
    }
  }

  function renderOffers(search) {
    const box = $("book-rooms");
    if (!box) return;
    if (!search?.categories?.length) {
      box.innerHTML = `<p class="hint">${escapeHtml(search?.message || "No rooms are available for these dates.")}</p>`;
      return;
    }
    box.innerHTML = search.categories
      .map((cat) => {
        const p = cat.price || {};
        return `<article class="resort-room-offer">
          <h3>${escapeHtml(cat.category_label)}</h3>
          <p>${escapeHtml((cat.amenities || []).slice(0, 6).join(" · "))}</p>
          <p>${cat.available_count} room${cat.available_count === 1 ? "" : "s"} · up to ${cat.occupancy?.adults || 2} adults</p>
          <p><strong>${money(p.total)}</strong> for ${p.nights || search.nights} night(s) incl. tax</p>
          <button type="button" class="btn primary" data-cat="${escapeHtml(cat.category)}" ${cat.bookable ? "" : "disabled"}>Select</button>
        </article>`;
      })
      .join("");
    box.querySelectorAll("[data-cat]").forEach((btn) => {
      btn.onclick = () => selectCategory(btn.dataset.cat);
    });
  }

  async function search() {
    if (!shopId) return;
    const checkIn = $("book-in")?.value;
    const checkOut = $("book-out")?.value;
    const adults = Number($("book-adults")?.value || 2);
    const children = Number($("book-children")?.value || 0);
    const rooms = Number($("book-qty")?.value || 1);
    try {
      hint("Checking live availability…");
      const d = await api(
        `/api/resort/public/${encodeURIComponent(shopId)}/search?check_in=${encodeURIComponent(checkIn)}&check_out=${encodeURIComponent(checkOut)}&adults=${adults}&children=${children}&rooms=${rooms}`,
      );
      state.search = d;
      renderOffers(d);
      hint(d.message || `${d.available_rooms?.length || 0} rooms available`);
      $("book-guest")?.setAttribute("hidden", "");
    } catch (err) {
      hint(err.message, true);
    }
  }

  function selectCategory(category) {
    const cat = (state.search?.categories || []).find((c) => c.category === category);
    if (!cat || !cat.rooms?.length) return;
    state.selected = cat.rooms[0];
    $("book-guest")?.removeAttribute("hidden");
    $("book-review").innerHTML = `<p>${escapeHtml(cat.category_label)} · ${escapeHtml(state.search.check_in)} to ${escapeHtml(state.search.check_out)} · ${money(cat.price?.total)}</p>`;
    hint("Enter guest details to hold this room.");
  }

  async function holdAndPay(ev) {
    ev?.preventDefault?.();
    if (!state.selected) return hint("Select a room category first.", true);
    const guest = {
      name: $("guest-name")?.value,
      mobile: $("guest-mobile")?.value,
      email: $("guest-email")?.value,
    };
    if (!guest.name || !guest.mobile) return hint("Guest name and mobile are required.", true);
    try {
      const held = await api(`/api/resort/public/${encodeURIComponent(shopId)}/hold`, {
        method: "POST",
        body: {
          room_id: state.selected.id,
          check_in: state.search.check_in,
          check_out: state.search.check_out,
          adults: state.search.adults,
          children: state.search.children,
          guest,
        },
      });
      state.hold = held.booking;
      const method = $("guest-pay")?.value || "upi";
      const confirm = await api(`/api/resort/public/${encodeURIComponent(shopId)}/confirm`, {
        method: "POST",
        body: {
          hold_id: held.booking.id,
          payment: { status: "paid", method, amount: held.booking.total },
        },
      });
      $("book-done").hidden = false;
      $("book-done").innerHTML = `<h3>Booking confirmed</h3><p>Reference <strong>${escapeHtml(confirm.booking.booking_no)}</strong></p><p>${money(confirm.booking.total)} · ${escapeHtml(confirm.booking.check_in)} to ${escapeHtml(confirm.booking.check_out)}</p>`;
      hint("Confirmation saved. Keep this booking ID.");
    } catch (err) {
      hint(err.message, true);
    }
  }

  async function lookup() {
    const ref = $("lookup-ref")?.value?.trim();
    if (!ref || !shopId) return;
    try {
      const d = await api(`/api/resort/public/${encodeURIComponent(shopId)}/booking/${encodeURIComponent(ref)}`);
      $("lookup-out").innerHTML = `<p><strong>${escapeHtml(d.booking.booking_no)}</strong> · ${escapeHtml(d.booking.status)} · ${escapeHtml(d.booking.payment_status)}</p><p>${escapeHtml(d.booking.check_in)} to ${escapeHtml(d.booking.check_out)} · ${money(d.booking.total)}</p>`;
    } catch (err) {
      $("lookup-out").innerHTML = `<p class="hint error">${escapeHtml(err.message)}</p>`;
    }
  }

  $("book-search")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    search();
  });
  $("book-guest")?.addEventListener("submit", holdAndPay);
  $("lookup-form")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    lookup();
  });
  loadProperty();
})(typeof globalThis !== "undefined" ? globalThis : window);
