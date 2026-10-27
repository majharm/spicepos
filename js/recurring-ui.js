/** Recurring invoice desk: schedules, filters, and generated-invoice history. */
(function (root) {
  const R = () => root.POSRecurring;
  let editingId = "";
  let draftLines = [];
  let bound = false;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hint(text, kind) {
    const el = $("recurring-hint");
    if (!el) return;
    el.textContent = text || "";
    el.className = kind === "ok" ? "hint ok" : kind === "bad" ? "hint error" : "hint";
  }

  function customers() {
    return (root.state?.customers || []).filter((row) => {
      const name = String(row.business_name || row.name || "");
      return row.code !== "CUS-001" && !/^walk-?in$/i.test(name.trim());
    });
  }

  function items() {
    return root.state?.items || [];
  }

  function money(n) {
    const v = Number(n) || 0;
    return `₹${v.toFixed(2)}`;
  }

  function freqLabel(id) {
    return R()?.FREQUENCIES?.find((row) => row.id === id)?.label || id || "";
  }

  function customerOptions(selected) {
    const rows = customers();
    const opts = [`<option value="">Choose customer</option>`].concat(
      rows.map((row) => {
        const name = row.business_name || row.name || "Customer";
        return `<option value="${esc(row.id)}"${row.id === selected ? " selected" : ""}>${esc(name)}</option>`;
      }),
    );
    return opts.join("");
  }

  function itemOptions(selected) {
    const opts = [`<option value="">Product or service</option>`].concat(
      items().map((row) => `<option value="${esc(row.id)}"${row.id === selected ? " selected" : ""}>${esc(row.name || row.code || "Item")}</option>`),
    );
    return opts.join("");
  }

  function filters() {
    return {
      q: $("recur-q")?.value || "",
      customer_id: $("recur-customer")?.value || "",
      status: $("recur-status")?.value || "",
      frequency: $("recur-frequency")?.value || "",
      from: $("recur-from")?.value || "",
      to: $("recur-to")?.value || "",
    };
  }

  function queryString() {
    const params = new URLSearchParams();
    const f = filters();
    Object.entries(f).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const s = params.toString();
    return s ? `?${s}` : "";
  }

  function paintStats(stats) {
    const el = $("recurring-stats");
    if (!el) return;
    const cells = [
      ["Schedules", stats?.total || 0],
      ["Active", stats?.active || 0],
      ["Generated this month", stats?.generatedThisMonth || 0],
      ["Upcoming", stats?.upcoming || 0],
      ["Overdue", stats?.overdue || 0],
      ["Paused or cancelled", stats?.pausedOrCancelled || 0],
    ];
    el.innerHTML = cells
      .map(([label, value]) => `<div class="items-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`)
      .join("");
  }

  function paintFilters(selectedCustomer) {
    const customer = $("recur-customer");
    if (!customer) return;
    const current = selectedCustomer || customer.value || "";
    const rows = customers();
    customer.innerHTML = `<option value="">All customers</option>${rows
      .map((row) => `<option value="${esc(row.id)}">${esc(row.business_name || row.name || "Customer")}</option>`)
      .join("")}`;
    customer.value = current;
    const freq = $("recur-frequency");
    if (freq && freq.options.length < 2) {
      const chosen = freq.value;
      freq.innerHTML = `<option value="">All frequencies</option>${(R()?.FREQUENCIES || [])
        .map((row) => `<option value="${esc(row.id)}">${esc(row.label)}</option>`)
        .join("")}`;
      freq.value = chosen;
    }
  }

  function lineRow(line, index) {
    return `<div class="recurring-line" data-recur-line="${index}">
      <label>Product or service <select data-line="item">${itemOptions(line.itemId)}</select></label>
      <label>Qty <input data-line="qty" type="number" min="0.001" step="any" value="${esc(line.quantity_gm)}" /></label>
      <label>Rate <input data-line="rate" type="number" min="0" step="0.01" value="${line.rate == null ? "" : esc(line.rate)}" placeholder="Catalog" /></label>
      <label>Discount <input data-line="discount" type="number" min="0" step="0.01" value="${esc(line.discountValue || 0)}" /></label>
      <label>Tax % <input data-line="gst" type="number" min="0" step="0.01" value="${line.gstRate == null ? "" : esc(line.gstRate)}" placeholder="Item" /></label>
      <button class="btn" type="button" data-recur-remove="${index}">Remove</button>
    </div>`;
  }

  function readLines() {
    const rows = [];
    document.querySelectorAll("#recurring-lines .recurring-line").forEach((row) => {
      const itemId = row.querySelector("[data-line=item]")?.value || "";
      const qty = Number(row.querySelector("[data-line=qty]")?.value);
      const rateRaw = row.querySelector("[data-line=rate]")?.value;
      const gstRaw = row.querySelector("[data-line=gst]")?.value;
      rows.push({
        itemId,
        quantity_gm: qty,
        rate: rateRaw === "" ? null : Number(rateRaw),
        discountType: "amt",
        discountValue: Number(row.querySelector("[data-line=discount]")?.value) || 0,
        gstRate: gstRaw === "" ? null : Number(gstRaw),
      });
    });
    draftLines = rows.length ? rows : [{ itemId: "", quantity_gm: 1, rate: null, discountValue: 0, gstRate: null }];
    return rows;
  }

  function paintLines() {
    const el = $("recurring-lines");
    if (!el) return;
    if (!draftLines.length) draftLines = [{ itemId: "", quantity_gm: 1, rate: null, discountValue: 0, gstRate: null }];
    el.innerHTML = draftLines.map(lineRow).join("");
  }

  function frequencyFields(schedule) {
    const freq = schedule?.frequency || "monthly";
    const month = ["monthly", "bimonthly", "quarterly", "half_yearly", "yearly"].includes(freq);
    return `<label>Billing frequency
        <select name="frequency" id="recur-form-frequency">
          ${(R()?.FREQUENCIES || []).map((row) => `<option value="${esc(row.id)}"${row.id === freq ? " selected" : ""}>${esc(row.label)}</option>`).join("")}
        </select>
      </label>
      <label id="recur-interval-wrap"${freq === "custom" ? "" : " hidden"}>Custom interval (days)
        <input name="interval_days" type="number" min="1" max="366" value="${esc(schedule?.interval_days || 30)}" />
      </label>
      <label id="recur-day-wrap"${month ? "" : " hidden"}>Billing day
        <input name="billing_day" type="number" min="1" max="31" value="${esc(schedule?.billing_day || "")}" />
      </label>
      <p class="item-composer-note full" id="recur-day-note"${month ? "" : " hidden"}>Day 31 uses the last day of shorter months, then returns to the 31st when that month has one.</p>`;
  }

  function paintForm(schedule) {
    const wrap = $("recurring-form-wrap");
    if (!wrap) return;
    editingId = schedule?.id || "";
    draftLines = Array.isArray(schedule?.lines) && schedule.lines.length
      ? schedule.lines.map((line) => ({
          itemId: line.itemId || line.item_id || "",
          quantity_gm: line.quantity_gm ?? line.quantity ?? 1,
          rate: line.rate ?? null,
          discountValue: line.discountValue ?? line.discount_value ?? 0,
          gstRate: line.gstRate ?? line.gst_rate ?? null,
        }))
      : [{ itemId: "", quantity_gm: 1, rate: null, discountValue: 0, gstRate: null }];
    const status = schedule?.status === "paused" ? "paused" : "active";
    wrap.hidden = false;
    wrap.innerHTML = `<form id="recurring-form" class="settings recurring-form">
      <h3>${editingId ? "Edit future invoices" : "Create recurring invoice"}</h3>
      <p class="item-composer-note full">Changes apply to future invoices only. Invoices already generated stay as they are, including payments and stock.</p>
      <label>Recurring invoice name <input name="name" required maxlength="180" value="${esc(schedule?.name || "")}" /></label>
      <label>Customer <select name="customer_id" required>${customerOptions(schedule?.customer_id || "")}</select></label>
      <div id="recurring-lines" class="recurring-line-grid"></div>
      <button class="btn" type="button" id="recur-add-line">Add product or service</button>
      <label>Bill discount
        <input name="discount_value" type="number" min="0" step="0.01" value="${esc(schedule?.discount_value || 0)}" />
      </label>
      <label>Start date <input name="start_date" type="date" required value="${esc(schedule?.start_date || "")}" /></label>
      <label>End date <input name="end_date" type="date" value="${esc(schedule?.end_date || "")}" /></label>
      <label>Billing cycles <input name="max_cycles" type="number" min="1" max="1000" placeholder="Until cancelled" value="${esc(schedule?.max_cycles || "")}" /></label>
      ${frequencyFields(schedule)}
      <label>Next invoice date <input name="next_invoice_date" type="date" required value="${esc(schedule?.next_invoice_date || schedule?.start_date || "")}" /></label>
      <label>Payment terms (days) <input name="payment_terms_days" type="number" min="0" max="365" value="${esc(schedule?.payment_terms_days || 0)}" /></label>
      <label class="full"><input name="auto_generate" type="checkbox"${schedule && !R().flagOn(schedule.auto_generate) ? "" : " checked"} /> Generate invoices automatically</label>
      <label class="full"><input name="whatsapp_invoice" type="checkbox"${R().flagOn(schedule?.whatsapp_invoice) ? " checked" : ""} /> WhatsApp invoice notification</label>
      <label class="full"><input name="whatsapp_reminder" type="checkbox"${R().flagOn(schedule?.whatsapp_reminder) ? " checked" : ""} /> WhatsApp payment reminder</label>
      <label class="full"><input name="email_invoice" type="checkbox"${R().flagOn(schedule?.email_invoice) ? " checked" : ""} /> Email invoice notification</label>
      <label>Status
        <select name="status">
          <option value="active"${status === "active" ? " selected" : ""}>Active</option>
          <option value="paused"${status === "paused" ? " selected" : ""}>Paused</option>
        </select>
      </label>
      <div class="item-composer-actions">
        <button class="btn primary" type="submit">${editingId ? "Save future invoices" : "Save schedule"}</button>
        <button class="btn" type="button" id="recur-form-cancel">Close</button>
      </div>
    </form>`;
    paintLines();
    wrap.scrollIntoView({ block: "start" });
  }

  function paintTable(rows, today) {
    const el = $("recurring-table");
    if (!el) return;
    if (!rows?.length) {
      el.innerHTML = `<p class="hint">No recurring invoices match these filters.</p>`;
      return;
    }
    const body = rows
      .map((row) => {
        const overdue = row.status === "active" && today && row.next_invoice_date && row.next_invoice_date < today;
        const open = row.status === "active" || row.status === "paused";
        const actions = [
          open ? `<button class="btn" type="button" data-recur-edit="${esc(row.id)}">Edit</button>` : "",
          row.status === "active" ? `<button class="btn" type="button" data-recur-pause="${esc(row.id)}">Pause</button>` : "",
          row.status === "paused" ? `<button class="btn" type="button" data-recur-resume="${esc(row.id)}">Resume</button>` : "",
          open ? `<button class="btn" type="button" data-recur-generate="${esc(row.id)}">Generate invoice</button>` : "",
          `<button class="btn" type="button" data-recur-history="${esc(row.id)}">History</button>`,
          open ? `<button class="btn" type="button" data-recur-cancel="${esc(row.id)}">Cancel</button>` : "",
        ].filter(Boolean).join(" ");
        return `<tr>
          <td>${esc(row.name)}</td>
          <td>${esc(row.customer_name || "")}</td>
          <td>${esc(freqLabel(row.frequency))}</td>
          <td class="${overdue ? "recur-status-overdue" : ""}">${esc(row.next_invoice_date || "")}</td>
          <td class="recur-status recur-status-${esc(row.status)}">${esc(row.status)}</td>
          <td>${esc(row.last_order_number || "—")}</td>
          <td>${esc(row.cycles_done || 0)}${row.max_cycles ? ` / ${esc(row.max_cycles)}` : ""}</td>
          <td>${actions}</td>
        </tr>`;
      })
      .join("");
    el.innerHTML = `<table class="data">
      <thead><tr><th>Name</th><th>Customer</th><th>Frequency</th><th>Next invoice</th><th>Status</th><th>Last invoice</th><th>Cycles</th><th></th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  }

  function paintHistory(payload) {
    const el = $("recurring-history");
    if (!el) return;
    const schedule = payload?.schedule;
    const runs = payload?.runs || [];
    el.hidden = false;
    const rows = runs.length
      ? runs
          .map((run) => `<tr>
            <td>${esc(String(run.period_key || "").slice(0, 10))}</td>
            <td>${esc(run.order_number || "—")}</td>
            <td>${esc(run.status || "")}</td>
            <td>${esc(run.error || "")}</td>
          </tr>`)
          .join("")
      : `<tr><td colspan="4">No invoices generated yet.</td></tr>`;
    el.innerHTML = `<h3>Invoices from ${esc(schedule?.name || "this schedule")}</h3>
      <p class="item-composer-note">Next scheduled date: ${esc(schedule?.next_invoice_date || "—")}. Generated invoices are in Sales Invoice and stay unpaid until a payment is recorded.</p>
      <table class="data"><thead><tr><th>Period</th><th>Invoice</th><th>Run</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table>
      <button class="btn" type="button" id="recur-open-invoices">Open sales invoices</button>`;
  }

  async function load() {
    bind();
    paintFilters();
    hint("Loading schedules…");
    try {
      const data = await root.api(`/api/recurring${queryString()}`);
      if (!data.enabled) {
        paintStats({ total: 0, active: 0, generatedThisMonth: 0, upcoming: 0, overdue: 0, pausedOrCancelled: 0 });
        if ($("recurring-table")) $("recurring-table").innerHTML = "";
        hint("Turn on Enable Recurring Invoices under Business Settings → Invoice & Print Settings.", "bad");
        return;
      }
      paintStats(data.stats);
      paintTable(data.schedules, data.today);
      hint("");
    } catch (err) {
      hint(err.message || "Could not load recurring invoices", "bad");
    }
  }

  function blankForm() {
    const today = new Date();
    const ymd = R().ymd(today.getFullYear(), today.getMonth() + 1, today.getDate());
    paintForm({
      frequency: "monthly",
      billing_day: today.getDate(),
      start_date: ymd,
      next_invoice_date: ymd,
      auto_generate: 1,
      payment_terms_days: 0,
      status: "active",
    });
  }

  async function post(path) {
    hint("Saving…");
    const data = await root.api(path, { method: "POST", body: "{}" });
    hint(data?.schedule ? `${data.schedule.name} is ${data.schedule.status}. Next invoice ${data.schedule.next_invoice_date || ""}.` : "Saved", "ok");
    await load();
  }

  async function onSubmit(event) {
    const form = event.target;
    if (form?.id !== "recurring-form") return;
    event.preventDefault();
    const body = Object.fromEntries(new FormData(form).entries());
    body.lines = readLines().filter((line) => line.itemId && line.quantity_gm > 0);
    body.auto_generate = form.elements.auto_generate?.checked ? 1 : 0;
    body.whatsapp_invoice = form.elements.whatsapp_invoice?.checked ? 1 : 0;
    body.whatsapp_reminder = form.elements.whatsapp_reminder?.checked ? 1 : 0;
    body.email_invoice = form.elements.email_invoice?.checked ? 1 : 0;
    body.discount_type = "amt";
    if (!body.end_date) body.end_date = "";
    if (!body.max_cycles) body.max_cycles = "";
    hint("Saving schedule…");
    try {
      const path = editingId ? `/api/recurring/${editingId}` : "/api/recurring";
      const data = await root.api(path, { method: "POST", body: JSON.stringify(body) });
      $("recurring-form-wrap").hidden = true;
      editingId = "";
      hint(`${data.schedule?.name || "Schedule"} saved. Next invoice ${data.schedule?.next_invoice_date || ""}.`, "ok");
      await load();
    } catch (err) {
      hint(err.message || "Could not save", "bad");
    }
  }

  async function onClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.id === "recur-filter") {
      await load();
      return;
    }
    if (target.id === "recur-new") {
      blankForm();
      return;
    }
    if (target.id === "recur-add-line") {
      readLines();
      draftLines.push({ itemId: "", quantity_gm: 1, rate: null, discountValue: 0, gstRate: null });
      paintLines();
      return;
    }
    if (target.id === "recur-form-cancel") {
      $("recurring-form-wrap").hidden = true;
      editingId = "";
      return;
    }
    if (target.id === "recur-open-invoices" && typeof root.showView === "function") {
      root.showView("orders");
      return;
    }
    const remove = target.getAttribute("data-recur-remove");
    if (remove != null) {
      readLines();
      draftLines.splice(Number(remove), 1);
      paintLines();
      return;
    }
    const edit = target.getAttribute("data-recur-edit");
    if (edit) {
      try {
        const data = await root.api(`/api/recurring/${edit}`);
        paintForm(data.schedule);
      } catch (err) {
        hint(err.message, "bad");
      }
      return;
    }
    const history = target.getAttribute("data-recur-history");
    if (history) {
      try {
        paintHistory(await root.api(`/api/recurring/${history}`));
      } catch (err) {
        hint(err.message, "bad");
      }
      return;
    }
    const pause = target.getAttribute("data-recur-pause");
    if (pause) return post(`/api/recurring/${pause}/pause`).catch((err) => hint(err.message, "bad"));
    const resume = target.getAttribute("data-recur-resume");
    if (resume) return post(`/api/recurring/${resume}/resume`).catch((err) => hint(err.message, "bad"));
    const cancel = target.getAttribute("data-recur-cancel");
    if (cancel) {
      if (!root.confirm?.("Cancel this schedule? Future invoices stop. Invoices already generated stay unchanged.")) return;
      return post(`/api/recurring/${cancel}/cancel`).catch((err) => hint(err.message, "bad"));
    }
    const generate = target.getAttribute("data-recur-generate");
    if (generate) {
      hint("Generating invoice…");
      try {
        const data = await root.api(`/api/recurring/${generate}/generate`, { method: "POST", body: "{}" });
        const row = (data.results || []).find((item) => item.orderNumber) || data.results?.[0];
        if (row?.error) hint(row.error, "bad");
        else if (row?.busy) hint("This period is already being generated.", "bad");
        else hint(row?.orderNumber ? `${row.orderNumber} created and left unpaid.` : "No invoice was due.", "ok");
        await load();
      } catch (err) {
        hint(err.message, "bad");
      }
    }
  }

  function onChange(event) {
    if (event.target?.id !== "recur-form-frequency") return;
    const freq = event.target.value;
    const month = ["monthly", "bimonthly", "quarterly", "half_yearly", "yearly"].includes(freq);
    const interval = $("recur-interval-wrap");
    const day = $("recur-day-wrap");
    const note = $("recur-day-note");
    if (interval) interval.hidden = freq !== "custom";
    if (day) day.hidden = !month;
    if (note) note.hidden = !month;
    if (month) {
      const input = document.querySelector("#recurring-form [name=billing_day]");
      if (input && !input.value) {
        const start = document.querySelector("#recurring-form [name=start_date]")?.value || "";
        const fromStart = Number(start.slice(8, 10));
        input.value = String(fromStart || new Date().getDate() || 1);
      }
    }
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener("click", (event) => {
      void onClick(event);
    });
    document.addEventListener("submit", (event) => {
      void onSubmit(event);
    });
    document.addEventListener("change", onChange);
  }

  root.POSRecurringUi = { load, paintForm, paintTable, paintStats };
})(typeof globalThis !== "undefined" ? globalThis : this);
