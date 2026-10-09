(function (root) {
  const $ = (id) => document.getElementById(id);
  const G = () => root.POSGym;
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
  function today() {
    return G()?.ymdIst?.(new Date()) || G()?.ymdLocal?.(new Date()) || new Date().toISOString().slice(0, 10);
  }
  function hint(el, msg, err) {
    if (!el) return;
    el.textContent = msg || "";
    el.className = err ? "hint error" : "hint";
  }
  function isGym() {
    return Boolean(G()?.isGymShop?.(root.state?.businessMeta) || root.POSFootwear?.shopKind?.(root.state?.businessMeta) === "gym");
  }
  function badge(status) {
    const label = G()?.statusLabel?.(status) || status || "";
    return `<span class="gym-badge status-${escapeHtml(status || "active")}">${escapeHtml(label)}</span>`;
  }
  function tableHtml(rows, keys) {
    if (!rows?.length) return `<p class="hint">No rows yet.</p>`;
    const cols = keys || Object.keys(rows[0]).filter((k) => !/json|_id$|password|photo/.test(k)).slice(0, 8);
    return `<table><thead><tr>${cols.map((k) => `<th>${escapeHtml(k)}</th>`).join("")}</tr></thead><tbody>${rows
      .slice(0, 200)
      .map((r) => `<tr>${cols.map((k) => `<td>${escapeHtml(r[k])}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
  }

  async function loadGymBoard() {
    const kpiIds = ["gym-board-kpis", "gym-dash-kpis"];
    if (!kpiIds.some((id) => $(id)) || !isGym()) return;
    try {
      const d = await api("/api/gym/board");
      const html = (d.cards || [])
        .map((c) => `<button type="button" class="report-card dash-kpi" data-gym-card="${escapeHtml(c.id)}"><span>${escapeHtml(c.label)}</span><strong>${c.money ? money(c.value) : escapeHtml(String(c.value ?? "—"))}</strong></button>`)
        .join("");
      kpiIds.forEach((id) => {
        if ($(id)) $(id).innerHTML = html;
      });
      const exp = $("gym-expiry-preview");
      if (exp) {
        exp.innerHTML = (d.expiring || []).length
          ? `<table><thead><tr><th>Member</th><th>Mobile</th><th>Ends</th><th>Due</th></tr></thead><tbody>${(d.expiring || [])
              .map((r) => `<tr><td>${escapeHtml(r.member_no)} · ${escapeHtml(r.name)}</td><td>${escapeHtml(r.mobile || "")}</td><td>${escapeHtml(String(r.end_date || "").slice(0, 10))}</td><td>${money(r.due)}</td></tr>`)
              .join("")}</tbody></table>`
          : `<p class="hint">No memberships ending in the next 7 days.</p>`;
      }
      const list = $("gym-report-list");
      if (list && (d.reports || G()?.REPORTS)) {
        const reports = d.reports || G().REPORTS;
        list.innerHTML = reports.map((r) => `<button type="button" class="dash-tile" data-gym-report="${escapeHtml(r.id)}"><strong>${escapeHtml(r.title)}</strong></button>`).join("");
      }
    } catch (err) {
      kpiIds.forEach((id) => {
        if ($(id)) $(id).innerHTML = `<p class="hint error">${escapeHtml(err.message)}</p>`;
      });
    }
  }

  async function loadGymReport(id) {
    const el = $("gym-report-out");
    if (!el) return;
    const d = await api(`/api/gym/reports/${encodeURIComponent(id)}`);
    el.innerHTML = tableHtml(d.rows || []);
  }

  async function loadMembers() {
    const el = $("gym-members-table");
    if (!el) return;
    const q = $("gym-member-q")?.value || "";
    const status = $("gym-member-status")?.value || "";
    const rows = await api(`/api/gym/members?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`);
    root.state = root.state || {};
    root.state.gymMembers = rows;
    if (!rows.length) {
      el.innerHTML = `<p class="hint">No members yet. Register a member to issue a membership ID and QR card.</p>`;
      return;
    }
    el.innerHTML = `<table><thead><tr><th>ID</th><th>Member</th><th>Mobile</th><th>Plan</th><th>Ends</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${rows
      .map((m) => {
        const mem = m.membership || {};
        return `<tr>
          <td>${escapeHtml(m.member_no)}</td>
          <td>${escapeHtml(m.name)}</td>
          <td>${escapeHtml(m.mobile || "")}</td>
          <td>${escapeHtml(mem.plan_name || "—")}</td>
          <td>${escapeHtml(String(mem.end_date || "").slice(0, 10) || "—")}</td>
          <td>${money(mem.due)}</td>
          <td>${badge(m.status)}</td>
          <td class="gym-row-actions">
            <button class="btn" type="button" data-gym-edit="${escapeHtml(m.id)}">Edit</button>
            <button class="btn" type="button" data-gym-bill="${escapeHtml(m.id)}">Bill</button>
            <button class="btn" type="button" data-gym-qr="${escapeHtml(m.id)}">QR</button>
            <button class="btn" type="button" data-gym-progress="${escapeHtml(m.id)}">Progress</button>
            ${m.status === "frozen" ? `<button class="btn" type="button" data-gym-status="${escapeHtml(m.id)}" data-to="active">Unfreeze</button>` : `<button class="btn" type="button" data-gym-status="${escapeHtml(m.id)}" data-to="frozen">Freeze</button>`}
          </td>
        </tr>`;
      })
      .join("")}</tbody></table>`;
  }

  function memberFormHtml(m) {
    m = m || {};
    const trainers = root.state?.gymTrainers || [];
    return `<form id="gym-member-form" class="settings item-composer">
      <input type="hidden" name="id" value="${escapeHtml(m.id || "")}" />
      <label>Name <input name="name" required value="${escapeHtml(m.name || "")}" /></label>
      <label>Mobile <input name="mobile" inputmode="tel" required value="${escapeHtml(m.mobile || "")}" /></label>
      <label>Email <input name="email" type="email" value="${escapeHtml(m.email || "")}" /></label>
      <label>Gender <select name="gender"><option value="">—</option>${["male", "female", "other"].map((g) => `<option ${g === (m.gender || "") ? "selected" : ""}>${g}</option>`).join("")}</select></label>
      <label>Date of birth <input name="dob" type="date" value="${escapeHtml(String(m.dob || "").slice(0, 10))}" /></label>
      <label>Photo URL <input name="photo_url" value="${escapeHtml(m.photo_url || "")}" /></label>
      <label>Emergency contact <input name="emergency_name" value="${escapeHtml(m.emergency_name || "")}" /></label>
      <label>Emergency mobile <input name="emergency_mobile" inputmode="tel" value="${escapeHtml(m.emergency_mobile || "")}" /></label>
      <label>Trainer <select name="trainer_id"><option value="">Unassigned</option>${trainers.map((t) => `<option value="${escapeHtml(t.id)}" ${t.id === m.trainer_id ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}</select></label>
      <label class="full">Notes <textarea name="notes">${escapeHtml(m.notes || "")}</textarea></label>
      <button class="btn primary" type="submit">Save member</button>
    </form>`;
  }

  async function ensureTrainers() {
    if (!root.state?.gymTrainers) {
      try {
        root.state = root.state || {};
        root.state.gymTrainers = await api("/api/gym/trainers");
      } catch {
        root.state.gymTrainers = [];
      }
    }
  }

  async function openMemberForm(id) {
    await ensureTrainers();
    const m = (root.state?.gymMembers || []).find((x) => x.id === id) || {};
    if (root.showModal) root.showModal(id ? "Member profile" : "New member", memberFormHtml(m));
    else if ($("gym-member-work")) $("gym-member-work").innerHTML = memberFormHtml(m);
    $("gym-member-form")?.addEventListener("submit", saveMember);
  }

  async function saveMember(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api("/api/gym/members", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(fd.entries())),
    });
    if (root.hideModal) root.hideModal();
    await loadMembers();
  }

  function billFormHtml(m) {
    const plans = root.state?.gymPlans || [];
    const pay = G()?.PAY_MODES || ["upi", "cash", "card"];
    return `<form id="gym-bill-form" class="settings item-composer">
      <p class="item-composer-note">${escapeHtml(m.member_no)} · ${escapeHtml(m.name)}</p>
      <label>Plan <select name="plan_id" required>${plans.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} · ${money(p.price)}</option>`).join("")}</select></label>
      <label>Start <input name="start_date" type="date" value="${today()}" /></label>
      <label>Admission fee <input name="admission_fee" type="number" min="0" step="0.01" value="" placeholder="Plan default" /></label>
      <label>Discount <input name="discount" type="number" min="0" step="0.01" value="0" /></label>
      <label>Coupon <input name="coupon" maxlength="40" /></label>
      <label>Amount paid <input name="paid" type="number" min="0" step="0.01" value="0" /></label>
      <label>Pay mode <select name="method">${pay.map((p) => `<option>${escapeHtml(p)}</option>`).join("")}</select></label>
      <label>Kind <select name="kind"><option value="new">New / admission</option><option value="renew">Renewal</option><option value="pt">Personal training</option></select></label>
      <button class="btn primary" type="submit">Save receipt</button>
    </form>`;
  }

  async function openBill(id) {
    const m = (root.state?.gymMembers || []).find((x) => x.id === id);
    if (!m) return;
    if (!root.state?.gymPlans) root.state.gymPlans = await api("/api/gym/plans");
    if (root.showModal) root.showModal("Membership billing", billFormHtml(m));
    $("gym-bill-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const billed = await api(`/api/gym/members/${encodeURIComponent(id)}/bill`, {
        method: "POST",
        body: JSON.stringify({
          plan_id: fd.get("plan_id"),
          start_date: fd.get("start_date"),
          admission_fee: fd.get("admission_fee") === "" ? undefined : fd.get("admission_fee"),
          discount: fd.get("discount"),
          coupon: fd.get("coupon"),
          paid: fd.get("paid"),
          method: fd.get("method"),
          kind: fd.get("kind"),
        }),
      });
      if (root.hideModal) root.hideModal();
      if (root.setHint) root.setHint(`Receipt ${billed.receipt_no} · total ${money(billed.total)} · due ${money(billed.due)}`, "ok");
      await loadMembers();
      await loadGymBoard();
    });
  }

  async function showQr(id) {
    const m = (root.state?.gymMembers || []).find((x) => x.id === id);
    if (!m) return;
    const payload = m.qr || G()?.qrPayload?.(root.state?.businessMeta?.id, m.id);
    let img = "";
    try {
      if (typeof QRCodeLib !== "undefined" && QRCodeLib.toDataURL) {
        img = await QRCodeLib.toDataURL(payload, { width: 220, margin: 1, errorCorrectionLevel: "M" });
      }
    } catch {
      img = "";
    }
    const html = `<div class="gym-qr-card">
      ${m.photo_url ? `<img src="${escapeHtml(m.photo_url)}" alt="" class="gym-photo" />` : ""}
      <strong>${escapeHtml(m.name)}</strong>
      <span>${escapeHtml(m.member_no)}</span>
      ${img ? `<img alt="Member QR" src="${img}" width="220" height="220" />` : `<code>${escapeHtml(payload)}</code>`}
      <p class="hint">Scan at the gym door for check-in / check-out.</p>
    </div>`;
    if (root.showModal) root.showModal("Member QR card", html);
  }

  function progressFormHtml(m) {
    return `<form id="gym-progress-form" class="settings item-composer">
      <input type="hidden" name="member_id" value="${escapeHtml(m.id)}" />
      <p class="item-composer-note">Weight, BMI, measurements, and before/after photos for ${escapeHtml(m.name)}.</p>
      <label>Date <input name="measured_at" type="date" value="${today()}" /></label>
      <label>Weight (kg) <input name="weight_kg" type="number" min="0" step="0.1" required /></label>
      <label>Height (cm) <input name="height_cm" type="number" min="0" step="0.1" /></label>
      <label>Chest <input name="chest" type="number" min="0" step="0.1" /></label>
      <label>Waist <input name="waist" type="number" min="0" step="0.1" /></label>
      <label>Hip <input name="hip" type="number" min="0" step="0.1" /></label>
      <label>Arms <input name="arms" type="number" min="0" step="0.1" /></label>
      <label class="full">Before photo URL <input name="photo_before" /></label>
      <label class="full">After photo URL <input name="photo_after" /></label>
      <label class="full">Diet / workout title <input name="title" placeholder="Push / pull / legs or diet week 1" /></label>
      <label>Kind <select name="kind"><option value="workout">Workout</option><option value="diet">Diet</option></select></label>
      <label class="full">Plan notes <textarea name="body"></textarea></label>
      <button class="btn primary" type="submit">Save progress</button>
    </form>
    <div id="gym-progress-list"></div>`;
  }

  async function openProgress(id) {
    const m = (root.state?.gymMembers || []).find((x) => x.id === id);
    if (!m) return;
    if (root.showModal) root.showModal("Progress & plans", progressFormHtml(m));
    const measures = await api(`/api/gym/measurements?member_id=${encodeURIComponent(id)}`);
    const programs = await api(`/api/gym/programs?member_id=${encodeURIComponent(id)}`);
    const list = $("gym-progress-list");
    if (list) {
      list.innerHTML = `${tableHtml(measures, ["measured_at", "weight_kg", "height_cm", "bmi", "chest", "waist"])}
        ${programs.length ? `<h4>Diet / workout</h4>${programs.map((p) => `<article class="dash-tile"><strong>${escapeHtml(p.title)}</strong><span>${escapeHtml(p.kind)}</span><p>${escapeHtml(p.body || "")}</p></article>`).join("")}` : ""}`;
    }
    $("gym-progress-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await api("/api/gym/measurements", { method: "POST", body: JSON.stringify(Object.fromEntries(fd.entries())) });
      if (fd.get("title")) {
        await api("/api/gym/programs", {
          method: "POST",
          body: JSON.stringify({ member_id: id, kind: fd.get("kind"), title: fd.get("title"), body: fd.get("body") }),
        });
      }
      if (root.hideModal) root.hideModal();
      if (root.setHint) root.setHint("Progress saved", "ok");
    });
  }

  async function loadAttendance() {
    const el = $("gym-attendance-table");
    if (!el) return;
    const day = $("gym-att-date")?.value || today();
    if ($("gym-att-date") && !$("gym-att-date").value) $("gym-att-date").value = day;
    const report = $("gym-att-report")?.value || "";
    const path = report === "absent" ? `/api/gym/attendance?date=${encodeURIComponent(day)}&report=absent` : `/api/gym/attendance?date=${encodeURIComponent(day)}`;
    const rows = await api(path);
    if (report === "absent") {
      el.innerHTML = rows.length
        ? tableHtml(rows, ["member_no", "name", "status", "date"])
        : `<p class="hint">Every active member checked in today.</p>`;
      return;
    }
    if (!rows.length) {
      el.innerHTML = `<p class="hint">No check-ins for this date. Scan a member QR or pick a member.</p>`;
      return;
    }
    el.innerHTML = `<table><thead><tr><th>Member</th><th>In</th><th>Out</th><th>Source</th></tr></thead><tbody>${rows
      .map((r) => `<tr><td>${escapeHtml(r.member_no)} · ${escapeHtml(r.name)}</td><td>${escapeHtml(r.check_in || "")}</td><td>${escapeHtml(r.check_out || "—")}</td><td>${escapeHtml(r.source || "")}</td></tr>`)
      .join("")}</tbody></table>`;
  }

  async function checkinFromForm(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const qr = String(fd.get("qr") || fd.get("member_id") || "").trim();
    if (!qr) {
      hint($("gym-att-hint"), "Scan a member QR code or type the membership ID.", true);
      return;
    }
    try {
      const d = await api("/api/gym/attendance/checkin", {
        method: "POST",
        body: JSON.stringify({ qr: fd.get("qr"), member_id: fd.get("member_id"), source: fd.get("qr") ? "qr" : "manual" }),
      });
      hint($("gym-att-hint"), `${d.action === "checkout" ? "Checked out" : "Checked in"} ${d.member?.name || ""}`, false);
      e.target.reset();
      await loadAttendance();
      await loadGymBoard();
    } catch (err) {
      hint($("gym-att-hint"), err.message, true);
    }
  }

  async function loadPlans() {
    const el = $("gym-plans-table");
    if (!el) return;
    const rows = await api("/api/gym/plans");
    root.state = root.state || {};
    root.state.gymPlans = rows;
    el.innerHTML = rows.length
      ? `<div class="hub-tile-grid">${rows
          .map(
            (p) => `<article class="dash-tile"><strong>${escapeHtml(p.name)}</strong>
              <span>${escapeHtml(G()?.planKind?.(p.kind).label || p.kind)} · ${p.duration_days} days</span>
              <span>${money(p.price)}${Number(p.admission_fee) ? ` · admission ${money(p.admission_fee)}` : ""}${Number(p.sessions) ? ` · ${p.sessions} sessions` : ""}</span>
              <button class="btn" type="button" data-gym-plan="${escapeHtml(p.id)}">Edit</button></article>`,
          )
          .join("")}</div>`
      : `<p class="hint">Default monthly, quarterly, yearly, couple, family, student, and PT plans are created on first open.</p>`;
    await loadGymSettings();
  }

  async function loadGymSettings() {
    const el = $("gym-settings-box");
    if (!el) return;
    let d = {};
    try {
      d = await api("/api/gym/settings");
    } catch {
      d = {};
    }
    const hero = G()?.DEFAULT_PORTAL_HERO || "./assets/login-atav-smart-pos.jpg?v=20260919loginp1";
    const current = String(d.portal_login_image || "").trim();
    const previewSrc = current ? `${current}${current.includes("?") ? "&" : "?"}t=${Date.now()}` : hero;
    el.innerHTML = `<form id="gym-settings-form" class="settings">
      <fieldset class="gym-portal-art">
        <legend>Member portal login image</legend>
        <p class="hint">This is the one side image on the member gym login (same layout as shop admin login). JPG, PNG or WebP, under 900 KB.</p>
        <img id="gym-portal-hero-preview" alt="Member portal preview" src="${escapeHtml(previewSrc)}" style="display:block;max-width:min(420px,100%);max-height:180px;object-fit:cover;border-radius:12px;margin:8px 0;border:1px solid #dbe7f3" />
        <input name="portal_login_image" id="gym-portal-hero-url" type="hidden" value="${escapeHtml(current)}" />
        <label>Upload image
          <input id="gym-portal-hero-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" />
        </label>
        <button class="btn" type="button" id="gym-portal-hero-reset">Use default ATAV image</button>
      </fieldset>
      <button class="btn primary" type="submit">Save gym settings</button>
    </form>`;
    $("gym-settings-form")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      try {
        await api("/api/gym/settings", {
          method: "POST",
          body: JSON.stringify({ portal_login_image: fd.get("portal_login_image") || "" }),
        });
        if (root.setHint) root.setHint("Gym member login image saved", "ok");
        await loadGymSettings();
      } catch (err) {
        if (root.setHint) root.setHint(err.message, "error");
      }
    });
    const preview = $("gym-portal-hero-preview");
    const hidden = $("gym-portal-hero-url");
    $("gym-portal-hero-file")?.addEventListener("change", (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      if (file.size > 900 * 1024) {
        if (root.toast) root.toast("Image must be under 900 KB");
        else if (root.setHint) root.setHint("Image must be under 900 KB", "error");
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
    $("gym-portal-hero-reset")?.addEventListener("click", () => {
      if (hidden) hidden.value = "";
      if (preview) preview.src = hero;
      const file = $("gym-portal-hero-file");
      if (file) file.value = "";
    });
  }

  function planFormHtml(p) {
    p = p || {};
    return `<form id="gym-plan-form" class="settings item-composer">
      <input type="hidden" name="id" value="${escapeHtml(p.id || "")}" />
      <label>Name <input name="name" required value="${escapeHtml(p.name || "")}" /></label>
      <label>Kind <select name="kind">${(G()?.PLAN_KINDS || []).map((k) => `<option value="${escapeHtml(k.id)}" ${k.id === (p.kind || "") ? "selected" : ""}>${escapeHtml(k.label)}</option>`).join("")}</select></label>
      <label>Duration (days) <input name="duration_days" type="number" min="1" value="${escapeHtml(p.duration_days || 30)}" /></label>
      <label>Price <input name="price" type="number" min="0" step="0.01" value="${escapeHtml(p.price || 0)}" /></label>
      <label>Admission fee <input name="admission_fee" type="number" min="0" step="0.01" value="${escapeHtml(p.admission_fee || 0)}" /></label>
      <label>GST % <input name="gst_rate" type="number" min="0" step="0.01" value="${escapeHtml(p.gst_rate || 0)}" /></label>
      <label>PT sessions <input name="sessions" type="number" min="0" value="${escapeHtml(p.sessions || 0)}" /></label>
      <label>Status <select name="status"><option value="active" ${p.status !== "inactive" ? "selected" : ""}>Active</option><option value="inactive" ${p.status === "inactive" ? "selected" : ""}>Inactive</option></select></label>
      <label class="full">Description <textarea name="description">${escapeHtml(p.description || "")}</textarea></label>
      <button class="btn primary" type="submit">Save plan</button>
    </form>`;
  }

  async function openPlan(id) {
    const p = (root.state?.gymPlans || []).find((x) => x.id === id) || {};
    if (root.showModal) root.showModal(id ? "Edit plan" : "Custom plan", planFormHtml(p));
    $("gym-plan-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await api("/api/gym/plans", { method: "POST", body: JSON.stringify(Object.fromEntries(fd.entries())) });
      if (root.hideModal) root.hideModal();
      await loadPlans();
    });
  }

  async function loadTrainers() {
    const el = $("gym-trainers-table");
    if (!el) return;
    const rows = await api("/api/gym/trainers");
    root.state = root.state || {};
    root.state.gymTrainers = rows;
    el.innerHTML = rows.length
      ? `<table><thead><tr><th>Trainer</th><th>Mobile</th><th>Specialty</th><th>Commission</th><th>Members</th><th>Status</th><th></th></tr></thead><tbody>${rows
          .map(
            (t) => `<tr>
              <td>${escapeHtml(t.name)}</td>
              <td>${escapeHtml(t.mobile || "")}</td>
              <td>${escapeHtml(t.specialty || "")}</td>
              <td>${escapeHtml(String(t.commission_pct || 0))}%</td>
              <td>${escapeHtml(String(t.members || 0))}</td>
              <td>${escapeHtml(t.status || "")}</td>
              <td>
                <button class="btn" type="button" data-gym-trainer="${escapeHtml(t.id)}">Edit</button>
                <button class="btn" type="button" data-gym-tatt="${escapeHtml(t.id)}">Attendance</button>
                <button class="btn" type="button" data-gym-tmembers="${escapeHtml(t.id)}">Members</button>
              </td>
            </tr>`,
          )
          .join("")}</tbody></table>`
      : `<p class="hint">Add trainers to assign members, PT packages, and commission.</p>`;
    const att = $("gym-trainer-att-table");
    if (att) {
      const day = $("gym-trainer-att-date")?.value || today();
      if ($("gym-trainer-att-date") && !$("gym-trainer-att-date").value) $("gym-trainer-att-date").value = day;
      const rowsA = await api(`/api/gym/trainers/attendance?date=${encodeURIComponent(day)}`);
      att.innerHTML = tableHtml(rowsA, ["name", "check_in", "check_out"]);
    }
  }

  function trainerFormHtml(t) {
    t = t || {};
    return `<form id="gym-trainer-form" class="settings item-composer">
      <input type="hidden" name="id" value="${escapeHtml(t.id || "")}" />
      <label>Name <input name="name" required value="${escapeHtml(t.name || "")}" /></label>
      <label>Mobile <input name="mobile" inputmode="tel" value="${escapeHtml(t.mobile || "")}" /></label>
      <label>Email <input name="email" type="email" value="${escapeHtml(t.email || "")}" /></label>
      <label>Specialty <input name="specialty" value="${escapeHtml(t.specialty || "")}" placeholder="PT / Yoga / Zumba" /></label>
      <label>Commission % <input name="commission_pct" type="number" min="0" step="0.01" value="${escapeHtml(t.commission_pct || 0)}" /></label>
      <label>Status <select name="status"><option value="active" ${t.status !== "inactive" ? "selected" : ""}>Active</option><option value="inactive" ${t.status === "inactive" ? "selected" : ""}>Inactive</option></select></label>
      <label class="full">Notes <textarea name="notes">${escapeHtml(t.notes || "")}</textarea></label>
      <button class="btn primary" type="submit">Save trainer</button>
    </form>`;
  }

  async function openTrainer(id) {
    const t = (root.state?.gymTrainers || []).find((x) => x.id === id) || {};
    if (root.showModal) root.showModal(id ? "Trainer profile" : "New trainer", trainerFormHtml(t));
    $("gym-trainer-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await api("/api/gym/trainers", { method: "POST", body: JSON.stringify(Object.fromEntries(fd.entries())) });
      if (root.hideModal) root.hideModal();
      await loadTrainers();
    });
  }

  function bind() {
    $("gym-member-new")?.addEventListener("click", () => openMemberForm(""));
    $("gym-member-q")?.addEventListener("input", () => loadMembers());
    $("gym-member-status")?.addEventListener("change", () => loadMembers());
    $("gym-members-table")?.addEventListener("click", async (e) => {
      const edit = e.target.closest("[data-gym-edit]");
      const bill = e.target.closest("[data-gym-bill]");
      const qr = e.target.closest("[data-gym-qr]");
      const prog = e.target.closest("[data-gym-progress]");
      const st = e.target.closest("[data-gym-status]");
      if (edit) return openMemberForm(edit.dataset.gymEdit);
      if (bill) return openBill(bill.dataset.gymBill);
      if (qr) return showQr(qr.dataset.gymQr);
      if (prog) return openProgress(prog.dataset.gymProgress);
      if (st) {
        await api(`/api/gym/members/${st.dataset.gymStatus}/status`, { method: "POST", body: JSON.stringify({ status: st.dataset.to }) });
        await loadMembers();
      }
    });
    $("gym-att-form")?.addEventListener("submit", checkinFromForm);
    $("gym-att-date")?.addEventListener("change", () => loadAttendance());
    $("gym-att-report")?.addEventListener("change", () => loadAttendance());
    $("gym-plan-new")?.addEventListener("click", () => openPlan(""));
    $("gym-plans-table")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-gym-plan]");
      if (b) openPlan(b.dataset.gymPlan);
    });
    $("gym-trainer-new")?.addEventListener("click", () => openTrainer(""));
    $("gym-trainer-att-date")?.addEventListener("change", () => loadTrainers());
    $("gym-trainers-table")?.addEventListener("click", async (e) => {
      const edit = e.target.closest("[data-gym-trainer]");
      const att = e.target.closest("[data-gym-tatt]");
      const mem = e.target.closest("[data-gym-tmembers]");
      if (edit) return openTrainer(edit.dataset.gymTrainer);
      if (att) {
        const d = await api(`/api/gym/trainers/${att.dataset.gymTatt}/attendance`, { method: "POST", body: JSON.stringify({}) });
        if (root.setHint) root.setHint(`${d.action === "checkout" ? "Trainer checked out" : "Trainer checked in"}`, "ok");
        await loadTrainers();
      }
      if (mem) {
        const rows = await api(`/api/gym/trainers/${mem.dataset.gymTmembers}/members`);
        if (root.showModal) root.showModal("Trainer-wise members", tableHtml(rows, ["member_no", "name", "mobile", "status"]));
      }
    });
    $("gym-remind")?.addEventListener("click", async () => {
      try {
        const d = await api("/api/gym/reminders", { method: "POST", body: JSON.stringify({}) });
        if (root.setHint) root.setHint(`WhatsApp/SMS reminders queued for ${d.queued || 0} members (${d.sent || 0} sent)`, "ok");
      } catch (err) {
        if (root.setHint) root.setHint(err.message, "error");
      }
    });
    $("gym-report-list")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-gym-report]");
      if (b) loadGymReport(b.dataset.gymReport);
    });
    const portal = $("gym-portal-link");
    if (portal && root.state?.businessMeta?.id) {
      portal.href = `./gym.html?shop=${encodeURIComponent(root.state.businessMeta.id)}`;
    }
  }

  root.POSGymUi = {
    loadGymBoard,
    loadMembers,
    loadAttendance,
    loadPlans,
    loadTrainers,
    loadGymSettings,
    bind,
  };
  document.addEventListener("DOMContentLoaded", bind);
})(typeof globalThis !== "undefined" ? globalThis : window);
