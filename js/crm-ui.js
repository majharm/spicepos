/** CRM desk for every business category. Customers stay on the existing customer master. */
(function (root) {
  const CRM = () => root.POSCRM;
  let bound = false;
  let tab = "dashboard";
  let boot = null;
  let profileId = "";

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function hint(text, kind) {
    const el = $("crm-hint");
    if (!el) return;
    el.textContent = text || "";
    el.className = kind === "ok" ? "hint ok" : kind === "bad" ? "hint error" : "hint";
  }

  function money(value) {
    return `₹${CRM().inr(value)}`;
  }

  function tabs() {
    return [
      ["dashboard", "Dashboard"],
      ["pipeline", "Pipeline"],
      ["leads", "Leads"],
      ["customers", "Customers"],
      ["followups", "Follow-ups"],
      ["tasks", "Tasks"],
      ["tickets", "Tickets"],
      ["messages", "Messages"],
    ];
  }

  function paintTabs() {
    const nav = $("crm-nav");
    if (!nav) return;
    nav.innerHTML = tabs().map(([key, label]) => `<button class="btn${tab === key ? " primary" : ""}" type="button" data-crm-tab="${key}">${label}</button>`).join("");
  }

  function staffOptions(selected) {
    const rows = boot?.staff || [];
    return `<option value="">Unassigned</option>${rows.map((row) => `<option value="${esc(row.id)}"${row.id === selected ? " selected" : ""}>${esc(row.name || row.role || "Staff")}</option>`).join("")}`;
  }

  function sourceOptions() {
    return `<option value="">Source</option>${(boot?.sources || []).map((row) => `<option value="${esc(row.id)}">${esc(row.name)}</option>`).join("")}`;
  }

  function fieldInputs(prefix) {
    return (boot?.fields || []).map((field) => `<label>${esc(field.label)}<input name="${prefix}${esc(field.key)}" maxlength="180" /></label>`).join("");
  }

  function kpis(data) {
    const rows = [
      ["Total customers", data.customers],
      ["Open leads", data.leads],
      ["Follow-ups", data.followups],
      ["Missed", data.missed],
      ["Open tasks", data.tasks],
      ["Outstanding", money(data.outstanding)],
      ["Conversion", `${data.conversion || 0}%`],
    ];
    return `<div class="crm-kpis">${rows.map(([label, value]) => `<article class="crm-kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`).join("")}</div>`;
  }

  async function paintDashboard() {
    $("crm-body").innerHTML = `${kpis(boot.kpis || {})}<div class="crm-timeline"><article><strong>How this desk works</strong><p class="crm-meta">Leads move from New Lead to Converted. Converting a lead links an existing customer when the mobile, email, or GSTIN already exists. WhatsApp, SMS, and email automations stay off until you enable a template and the customer has consented.</p></article></div>`;
  }

  async function paintPipeline() {
    const data = await root.api("/api/crm/leads");
    const columns = CRM().pipelineColumns(data.leads || []);
    $("crm-body").innerHTML = `<div class="crm-board">${columns.map((column) => `<section class="crm-col"><h4>${esc(column.label)} (${column.leads.length})</h4>${column.leads.map((lead) => `<article class="crm-card"><strong>${esc(lead.name)}</strong><p>${esc(lead.mobile || lead.company_name || "")}</p><div class="crm-actions">${(() => { const next = CRM().STAGES.find((stage) => stage.sort === CRM().stageOf(lead.stage).sort + 1 && !stage.lost); return next ? `<button class="btn" type="button" data-crm-stage="${esc(lead.id)}" data-stage="${esc(next.key)}">${esc(next.label)}</button>` : ""; })()}${lead.stage !== "converted" ? `<button class="btn primary" type="button" data-crm-convert="${esc(lead.id)}">Convert</button>` : ""}</div></article>`).join("") || `<p class="crm-meta">No leads</p>`}</section>`).join("")}</div>`;
  }

  async function paintLeads() {
    const data = await root.api("/api/crm/leads");
    const rows = data.leads || [];
    $("crm-body").innerHTML = `<form class="crm-form" id="crm-lead-form">
      <label>Name<input name="name" required maxlength="180" /></label>
      <label>Mobile<input name="mobile" maxlength="32" /></label>
      <label>Email<input name="email" type="email" maxlength="160" /></label>
      <label>Company<input name="company_name" maxlength="180" /></label>
      <label>Source<select name="source_id">${sourceOptions()}</select></label>
      <label>Priority<select name="priority"><option>normal</option><option>low</option><option>high</option><option>urgent</option></select></label>
      <label>Assign<select name="assigned_to">${staffOptions("")}</select></label>
      <label>Expected value<input name="expected_value" type="number" min="0" step="0.01" /></label>
      ${fieldInputs("custom_")}
      <label class="crm-wide">Notes<textarea name="notes" rows="2" maxlength="1000"></textarea></label>
      <div class="crm-wide"><button class="btn primary" type="submit">Save lead</button></div>
    </form>
    <div class="crm-list">${rows.map((lead) => `<article class="crm-row"><div><strong>${esc(lead.name)}</strong><p class="crm-meta">${esc(lead.mobile || "")} ${esc(lead.company_name || "")}</p></div><div>${esc(CRM().stageOf(lead.stage).label)} · ${esc(lead.priority || "normal")}</div><div class="crm-actions">${lead.stage !== "converted" ? `<button class="btn primary" type="button" data-crm-convert="${esc(lead.id)}">Convert</button>` : `<span class="crm-meta">Linked</span>`}</div></article>`).join("") || `<p class="crm-meta">No leads yet.</p>`}</div>`;
  }

  async function paintCustomers() {
    const data = await root.api("/api/crm/customers");
    const rows = data.customers || [];
    $("crm-body").innerHTML = `<form class="crm-form" id="crm-customer-search"><label class="crm-wide">Search<input name="q" placeholder="Name, mobile, or business" /></label><div><button class="btn" type="submit">Show</button></div></form><div class="crm-list">${rows.map((row) => `<article class="crm-row"><div><strong>${esc(row.name)}</strong><p class="crm-meta">${esc(row.mobile || "")} ${esc(row.business_name || "")}</p></div><div>Due ${esc(money(row.outstanding))}</div><div><button class="btn" type="button" data-crm-open="${esc(row.id)}">360° profile</button></div></article>`).join("") || `<p class="crm-meta">No customers.</p>`}</div>`;
  }

  async function paintProfile(id) {
    profileId = id;
    const data = await root.api(`/api/crm/customers/${encodeURIComponent(id)}`);
    const customer = data.customer || {};
    let custom = data.profile?.custom || {};
    if (!data.profile?.custom && data.profile?.custom_json) {
      try { custom = JSON.parse(data.profile.custom_json) || {}; } catch { custom = {}; }
    }
    const fields = (data.fields || boot?.fields || []).map((field) => `<label>${esc(field.label)}<input name="custom_${esc(field.key)}" value="${esc(custom[field.key] || "")}" maxlength="180" /></label>`).join("");
    const orders = (data.orders || []).map((row) => `<article><strong>${esc(row.order_number || "Invoice")}</strong><p class="crm-meta">${esc(money(row.total))} · ${esc(row.payment_status || "")}</p></article>`).join("");
    const quotes = (data.quotes || []).map((row) => `<article><strong>${esc(row.quotation_number || "Quotation")}</strong><p class="crm-meta">${esc(row.status || "")} · ${esc(money(row.total))}</p></article>`).join("");
    const logs = (data.logs || []).map((row) => `<article><strong>${esc(row.channel)} · ${esc(row.status)}</strong><p class="crm-meta">${esc(row.body || row.error || "")}</p></article>`).join("");
    $("crm-body").innerHTML = `<div class="crm-actions" style="margin:0 24px"><button class="btn" type="button" data-crm-tab="customers">Back to customers</button></div>
      <form class="crm-profile" id="crm-profile-form">
        <div class="crm-wide"><strong>${esc(customer.name)}</strong><p class="crm-meta">${esc(customer.mobile || "")} · ${esc(customer.email || "")} · GSTIN ${esc(customer.gstin || "—")}</p><p class="crm-meta">Lifetime ${esc(money(data.lifetime))} · Credit limit ${esc(money(customer.credit_limit))} · Outstanding ${esc(money(customer.outstanding))}${data.loyalty ? ` · Points ${esc(data.loyalty.points_balance)}` : ""}</p></div>
        <label>Relationship manager<select name="assigned_to">${staffOptions(data.profile?.assigned_to || "")}</select></label>
        <label><input name="whatsapp_consent" type="checkbox"${customer.whatsapp_consent ? " checked" : ""} /> WhatsApp consent</label>
        <label><input name="whatsapp_opt_out" type="checkbox"${customer.whatsapp_opt_out ? " checked" : ""} /> WhatsApp opt-out</label>
        <label><input name="sms_consent" type="checkbox"${data.profile?.sms_consent ? " checked" : ""} /> SMS consent</label>
        <label><input name="email_consent" type="checkbox"${data.profile?.email_consent ? " checked" : ""} /> Email consent</label>
        ${fields}
        <div class="crm-wide"><button class="btn primary" type="submit">Save profile</button></div>
      </form>
      <form class="crm-form" id="crm-note-form"><label class="crm-wide">Note<textarea name="body" rows="2" required></textarea></label><div><button class="btn" type="submit">Add note</button></div></form>
      <form class="crm-form" id="crm-contact-form"><label>Contact name<input name="name" required /></label><label>Role<input name="role_name" /></label><label>Mobile<input name="mobile" /></label><label>Address<input name="address" /></label><div><button class="btn" type="submit">Add contact</button></div></form>
      <div class="crm-timeline"><h4>Invoices</h4>${orders || "<p class='crm-meta'>No invoices yet.</p>"}<h4>Quotations</h4>${quotes || "<p class='crm-meta'>No quotations yet.</p>"}<h4>Messages</h4>${logs || "<p class='crm-meta'>No messages yet.</p>"}</div>`;
  }

  async function paintFollowups() {
    const data = await root.api("/api/crm/followups");
    const rows = data.followups || [];
    $("crm-body").innerHTML = `<form class="crm-form" id="crm-follow-form"><label>Date<input name="due_on" type="date" required /></label><label>Kind<select name="kind"><option>call</option><option>meeting</option><option>whatsapp</option><option>visit</option></select></label><label>Assign<select name="assigned_to">${staffOptions("")}</select></label><label class="crm-wide">Note<input name="note" maxlength="500" /></label><div><button class="btn primary" type="submit">Add follow-up</button></div></form><div class="crm-list">${rows.map((row) => `<article class="crm-row"><div><strong>${esc(row.kind)} · ${esc(row.due_on || "")}</strong><p class="crm-meta">${esc(row.note || "")}</p></div><div>${esc(row.state || row.status)}</div><div>${row.status === "done" ? "" : `<button class="btn" type="button" data-crm-done="follow" data-id="${esc(row.id)}">Done</button>`}</div></article>`).join("") || `<p class="crm-meta">No follow-ups.</p>`}</div>`;
  }

  async function paintTasks() {
    const data = await root.api("/api/crm/tasks");
    const rows = data.tasks || [];
    $("crm-body").innerHTML = `<form class="crm-form" id="crm-task-form"><label>Task<input name="title" required maxlength="180" /></label><label>Due<input name="due_on" type="date" /></label><label>Assign<select name="assigned_to">${staffOptions("")}</select></label><label>Priority<select name="priority"><option>normal</option><option>high</option><option>urgent</option></select></label><div><button class="btn primary" type="submit">Add task</button></div></form><div class="crm-list">${rows.map((row) => `<article class="crm-row"><div><strong>${esc(row.title)}</strong><p class="crm-meta">${esc(row.due_on || "No date")} · ${esc(row.priority || "")}</p></div><div>${esc(row.status)}</div><div>${row.status === "done" ? "" : `<button class="btn" type="button" data-crm-done="task" data-id="${esc(row.id)}">Done</button>`}</div></article>`).join("") || `<p class="crm-meta">No tasks.</p>`}</div>`;
  }

  async function paintTickets() {
    const data = await root.api("/api/crm/tickets");
    const rows = data.tickets || [];
    $("crm-body").innerHTML = `<form class="crm-form" id="crm-ticket-form"><label>Subject<input name="subject" required maxlength="180" /></label><label>Priority<select name="priority"><option>normal</option><option>high</option><option>urgent</option></select></label><label class="crm-wide">Details<textarea name="body" rows="2"></textarea></label><div><button class="btn primary" type="submit">Open ticket</button></div></form><div class="crm-list">${rows.map((row) => `<article class="crm-row"><div><strong>${esc(row.subject)}</strong><p class="crm-meta">${esc(row.body || "")}</p></div><div>${esc(row.status)} · ${esc(row.priority)}</div></article>`).join("") || `<p class="crm-meta">No complaints or service requests.</p>`}</div>`;
  }

  async function paintMessages() {
    const rows = boot?.automations || [];
    $("crm-body").innerHTML = `<form class="crm-form" id="crm-auto-form"><p class="crm-wide crm-meta">Messages send only when the switch is on and the customer has consented. Opt-out stops WhatsApp. SMS stays logged until an SMS provider is connected. Invoice WhatsApp from billing is unchanged.</p>${rows.map((row) => `<label class="crm-wide"><input type="checkbox" name="enabled" data-key="${esc(row.key)}"${Number(row.enabled) === 1 ? " checked" : ""} /> ${esc(CRM().AUTOMATIONS.find((item) => item.key === row.key)?.label || row.key)}</label><label class="crm-wide">Template<textarea name="template" data-key="${esc(row.key)}" rows="2">${esc(row.template || "")}</textarea></label><label>Wait days<input name="days" data-key="${esc(row.key)}" type="number" min="0" max="365" value="${esc(row.wait_days || 0)}" /></label>`).join("")}<div class="crm-wide crm-actions"><button class="btn primary" type="submit">Save templates</button><button class="btn" type="button" id="crm-run">Run due messages</button></div></form>`;
  }

  async function show(next) {
    tab = next || tab;
    profileId = next === "customers" ? "" : profileId;
    paintTabs();
    if (!boot) return;
    if (tab === "dashboard") return paintDashboard();
    if (tab === "pipeline") return paintPipeline();
    if (tab === "leads") return paintLeads();
    if (tab === "customers") return paintCustomers();
    if (tab === "followups") return paintFollowups();
    if (tab === "tasks") return paintTasks();
    if (tab === "tickets") return paintTickets();
    if (tab === "messages") return paintMessages();
  }

  function customFrom(form) {
    const custom = {};
    (boot?.fields || []).forEach((field) => {
      custom[field.key] = form.elements[`custom_${field.key}`]?.value || "";
    });
    return custom;
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener("click", async (event) => {
      const tabBtn = event.target.closest("[data-crm-tab]");
      if (tabBtn && $("crm-desk")?.contains(tabBtn)) {
        hint("");
        await show(tabBtn.dataset.crmTab).catch((err) => hint(err.message, "bad"));
        return;
      }
      const stageBtn = event.target.closest("[data-crm-stage]");
      if (stageBtn) {
        await root.api(`/api/crm/leads/${encodeURIComponent(stageBtn.dataset.crmStage)}/stage`, { method: "POST", body: JSON.stringify({ stage: stageBtn.dataset.stage }) });
        hint("Pipeline updated", "ok");
        await show(tab);
        return;
      }
      const convertBtn = event.target.closest("[data-crm-convert]");
      if (convertBtn) {
        const data = await root.api(`/api/crm/leads/${encodeURIComponent(convertBtn.dataset.crmConvert)}/convert`, { method: "POST", body: "{}" });
        hint(data.linked ? "Linked to the existing customer" : "Customer created and linked", "ok");
        await show(tab);
        return;
      }
      const openBtn = event.target.closest("[data-crm-open]");
      if (openBtn) {
        await paintProfile(openBtn.dataset.crmOpen);
        return;
      }
      const doneBtn = event.target.closest("[data-crm-done]");
      if (doneBtn) {
        const path = doneBtn.dataset.crmDone === "task" ? "tasks" : "followups";
        await root.api(`/api/crm/${path}/${encodeURIComponent(doneBtn.dataset.id)}/done`, { method: "POST", body: "{}" });
        await show(tab);
        return;
      }
      if (event.target.id === "crm-run") {
        const data = await root.api("/api/crm/automations/run", { method: "POST", body: "{}" });
        hint(`Messages sent: ${data.sent || 0}. Skipped: ${data.skipped || 0}.`, "ok");
      }
    });
    document.addEventListener("submit", async (event) => {
      const form = event.target;
      if (!$("crm-desk")?.contains(form)) return;
      event.preventDefault();
      const read = (name) => form.elements[name]?.value || "";
      try {
        if (form.id === "crm-lead-form") {
          await root.api("/api/crm/leads", { method: "POST", body: JSON.stringify({ name: read("name"), mobile: read("mobile"), email: read("email"), company_name: read("company_name"), source_id: read("source_id"), priority: read("priority"), assigned_to: read("assigned_to"), expected_value: read("expected_value"), notes: read("notes"), custom: customFrom(form) }) });
          hint("Lead saved", "ok");
          await show("leads");
        } else if (form.id === "crm-customer-search") {
          const data = await root.api(`/api/crm/customers?q=${encodeURIComponent(read("q"))}`);
          boot = boot || {};
          $("crm-body").querySelector(".crm-list").innerHTML = (data.customers || []).map((row) => `<article class="crm-row"><div><strong>${esc(row.name)}</strong><p class="crm-meta">${esc(row.mobile || "")}</p></div><div>Due ${esc(money(row.outstanding))}</div><div><button class="btn" type="button" data-crm-open="${esc(row.id)}">360° profile</button></div></article>`).join("") || `<p class="crm-meta">No matching customers.</p>`;
        } else if (form.id === "crm-profile-form") {
          await root.api(`/api/crm/customers/${encodeURIComponent(profileId)}`, { method: "POST", body: JSON.stringify({ assigned_to: read("assigned_to"), whatsapp_consent: form.elements.whatsapp_consent.checked, whatsapp_opt_out: form.elements.whatsapp_opt_out.checked, sms_consent: form.elements.sms_consent.checked, email_consent: form.elements.email_consent.checked, custom: customFrom(form) }) });
          hint("Profile saved", "ok");
        } else if (form.id === "crm-note-form") {
          await root.api("/api/crm/notes", { method: "POST", body: JSON.stringify({ customer_id: profileId, body: read("body") }) });
          hint("Note added", "ok");
          await paintProfile(profileId);
        } else if (form.id === "crm-contact-form") {
          await root.api("/api/crm/contacts", { method: "POST", body: JSON.stringify({ customer_id: profileId, name: read("name"), role_name: read("role_name"), mobile: read("mobile"), address: read("address") }) });
          hint("Contact added", "ok");
        } else if (form.id === "crm-follow-form") {
          await root.api("/api/crm/followups", { method: "POST", body: JSON.stringify({ due_on: read("due_on"), kind: read("kind"), assigned_to: read("assigned_to"), note: read("note") }) });
          hint("Follow-up added", "ok");
          await show("followups");
        } else if (form.id === "crm-task-form") {
          await root.api("/api/crm/tasks", { method: "POST", body: JSON.stringify({ title: read("title"), due_on: read("due_on"), assigned_to: read("assigned_to"), priority: read("priority") }) });
          hint("Task added", "ok");
          await show("tasks");
        } else if (form.id === "crm-ticket-form") {
          await root.api("/api/crm/tickets", { method: "POST", body: JSON.stringify({ subject: read("subject"), body: read("body"), priority: read("priority") }) });
          hint("Ticket opened", "ok");
          await show("tickets");
        } else if (form.id === "crm-auto-form") {
          const automations = (boot.automations || []).map((row) => ({
            key: row.key,
            enabled: form.querySelector(`[name="enabled"][data-key="${row.key}"]`)?.checked,
            template: form.querySelector(`[name="template"][data-key="${row.key}"]`)?.value,
            days: form.querySelector(`[name="days"][data-key="${row.key}"]`)?.value,
            channel: row.channel || "whatsapp",
          }));
          await root.api("/api/crm/automations", { method: "POST", body: JSON.stringify({ automations }) });
          hint("Templates saved", "ok");
          boot = await root.api("/api/crm/bootstrap");
        }
      } catch (err) {
        hint(err.message, "bad");
      }
    });
  }

  async function load() {
    bind();
    paintTabs();
    hint("Loading CRM…");
    try {
      boot = await root.api("/api/crm/bootstrap");
      hint("");
      await show(tab);
    } catch (err) {
      hint(err.message, "bad");
      if ($("crm-body")) $("crm-body").innerHTML = "";
    }
  }

  root.POSCRMUi = { load };
})(typeof globalThis !== "undefined" ? globalThis : window);
