/** CRM desk for every business category. Customers stay on the existing customer master. */
(function (root) {
  const CRM = () => root.POSCRM;
  let bound = false;
  let tab = "dashboard";
  let boot = null;
  let profileId = "";
  let leadRows = [];
  let editingLead = null;

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

  function sourceOptions(selected) {
    return `<option value="">Source</option>${(boot?.sources || []).map((row) => `<option value="${esc(row.id)}"${row.id === selected ? " selected" : ""}>${esc(row.name)}</option>`).join("")}`;
  }

  function leadFields() {
    if (Array.isArray(boot?.fields) && boot.fields.length) return boot.fields;
    return CRM().fieldsFor(boot?.category || "");
  }

  function fieldInputs(prefix, values = {}) {
    return leadFields().map((field) => `<label>${esc(field.label)}<input name="${prefix}${esc(field.key)}" value="${esc(values[field.key] || "")}" maxlength="180" /></label>`).join("");
  }

  function stageOptions(selected) {
    const key = CRM().stageOf(selected).key;
    return CRM().STAGES.map((stage) => `<option value="${esc(stage.key)}"${stage.key === key ? " selected" : ""}>${esc(stage.label)}</option>`).join("");
  }

  function priorityOptions(selected) {
    const key = CRM().priorityOf(selected);
    return CRM().PRIORITIES.map((item) => `<option value="${esc(item)}"${item === key ? " selected" : ""}>${esc(item)}</option>`).join("");
  }

  function dateValue(value) {
    const match = String(value || "").match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : "";
  }

  function leadCustom(lead) {
    if (lead?.custom && typeof lead.custom === "object") return lead.custom;
    if (!lead?.custom_json) return {};
    try { return JSON.parse(lead.custom_json) || {}; } catch { return {}; }
  }

  function pill(text, kind) {
    return `<span class="crm-pill${kind ? ` is-${kind}` : ""}">${esc(text)}</span>`;
  }

  function empty(text) {
    return `<p class="crm-empty">${esc(text)}</p>`;
  }

  function tone(value) {
    const key = String(value || "").toLowerCase();
    if (key === "missed" || key === "urgent" || key === "lost" || key === "high") return "alert";
    if (key === "done" || key === "converted" || key === "paid") return "ok";
    return "";
  }

  function kpis(data) {
    const missed = Number(data.missed) || 0;
    const rows = [
      ["Total customers", data.customers || 0],
      ["Open leads", data.leads || 0],
      ["Follow-ups", data.followups || 0],
      ["Missed", missed, missed ? "alert" : ""],
      ["Open tasks", data.tasks || 0],
      ["Outstanding", money(data.outstanding)],
      ["Conversion", `${data.conversion || 0}%`],
    ];
    return `<div class="crm-kpis">${rows.map(([label, value, kind]) => `<article class="crm-kpi${kind ? " is-alert" : ""}"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`).join("")}</div>`;
  }

  function paintBrief(data) {
    const brief = CRM().crmBrief(data || {});
    const cards = [
      ["01", "What happened", brief.happened],
      ["02", "Why it happened", brief.why],
      ["03", "What may happen next", brief.next],
      ["04", "What you should do", brief.action],
    ];
    return `<section class="crm-ai"><p class="crm-ai-kicker">Advanced AI</p><div class="crm-story">${cards.map(([step, title, text]) => `<article class="crm-story-card"><span>${step}</span><h3>${esc(title)}</h3><p>${esc(text)}</p></article>`).join("")}</div></section>`;
  }

  async function paintDashboard() {
    const data = boot.kpis || {};
    $("crm-body").innerHTML = `${kpis(data)}${paintBrief(data)}<p class="crm-note">Converting a lead links the customer when the mobile, email, or GSTIN already exists. Messages stay off until a template is enabled and the customer has consented.</p>`;
  }

  async function paintPipeline() {
    const data = await root.api("/api/crm/leads");
    const columns = CRM().pipelineColumns(data.leads || []);
    leadRows = data.leads || [];
    $("crm-body").innerHTML = `<div class="crm-board">${columns.map((column) => `<section class="crm-col"><header><h4>${esc(column.label)}</h4><span>${column.leads.length}</span></header>${column.leads.map((lead) => `<article class="crm-card"><strong>${esc(lead.name)}</strong><p>${esc(lead.mobile || lead.company_name || "No mobile")}</p><div class="crm-actions"><button class="btn" type="button" data-crm-edit="${esc(lead.id)}">Edit</button>${(() => { const next = CRM().STAGES.find((stage) => stage.sort === CRM().stageOf(lead.stage).sort + 1 && !stage.lost); return next ? `<button class="btn" type="button" data-crm-stage="${esc(lead.id)}" data-stage="${esc(next.key)}">${esc(next.label)}</button>` : ""; })()}${lead.stage !== "converted" ? `<button class="btn primary" type="button" data-crm-convert="${esc(lead.id)}">Convert</button>` : ""}</div></article>`).join("") || `<p class="crm-empty">No leads</p>`}</section>`).join("")}</div>`;
  }

  function leadForm(lead) {
    const custom = leadCustom(lead);
    const editing = Boolean(lead?.id);
    return `<form class="crm-form" id="crm-lead-form">
      <div class="crm-form-head"><h4 class="crm-panel-title" id="crm-lead-title">${editing ? "Update lead" : "New lead"}</h4><button class="btn" type="button" id="crm-lead-cancel"${editing ? "" : " hidden"}>Clear</button></div>
      <input type="hidden" name="lead_id" value="${esc(lead?.id || "")}" />
      <label>Name<input name="name" required maxlength="180" value="${esc(lead?.name || "")}" /></label>
      <label>Mobile<input name="mobile" inputmode="tel" maxlength="32" value="${esc(lead?.mobile || "")}" /></label>
      <label>Email<input name="email" type="email" maxlength="160" value="${esc(lead?.email || "")}" /></label>
      <label>Company<input name="company_name" maxlength="180" value="${esc(lead?.company_name || "")}" /></label>
      <label>GSTIN<input name="gstin" maxlength="32" value="${esc(lead?.gstin || "")}" /></label>
      <label>Source<select name="source_id">${sourceOptions(lead?.source_id || "")}</select></label>
      <label>Stage<select name="stage">${stageOptions(lead?.stage || "new")}</select></label>
      <label>Priority<select name="priority">${priorityOptions(lead?.priority || "normal")}</select></label>
      <label>Assign<select name="assigned_to">${staffOptions(lead?.assigned_to || "")}</select></label>
      <label>Expected value (₹)<input name="expected_value" type="number" min="0" step="0.01" value="${esc(lead?.expected_value || "")}" /></label>
      <label>Next follow-up<input name="next_followup" type="date" value="${esc(dateValue(lead?.next_followup))}" /></label>
      ${fieldInputs("custom_", custom)}
      <label class="crm-wide">Notes<textarea name="notes" rows="2" maxlength="1000">${esc(lead?.notes || "")}</textarea></label>
      <div class="crm-wide crm-actions"><button class="btn primary" type="submit" id="crm-lead-save">${editing ? "Update lead" : "Save lead"}</button></div>
    </form>`;
  }

  function leadMeta(lead) {
    const bits = [lead.mobile, lead.company_name].filter(Boolean);
    if (Number(lead.expected_value)) bits.push(money(lead.expected_value));
    const follow = dateValue(lead.next_followup);
    if (follow) bits.push(`Follow-up ${follow}`);
    return bits.join(" · ");
  }

  async function paintLeads() {
    const data = await root.api("/api/crm/leads");
    leadRows = data.leads || [];
    const editing = editingLead;
    editingLead = null;
    $("crm-body").innerHTML = `${leadForm(editing)}<div class="crm-list">${leadRows.map((lead) => `<article class="crm-row"><div class="crm-row-main"><strong>${esc(lead.name)}</strong><p class="crm-meta">${esc(leadMeta(lead))}</p></div><div class="crm-row-mid">${pill(CRM().stageOf(lead.stage).label, tone(lead.stage))} ${pill(lead.priority || "normal", tone(lead.priority))}</div><div class="crm-actions"><button class="btn" type="button" data-crm-edit="${esc(lead.id)}">Edit</button>${lead.stage !== "converted" ? `<button class="btn primary" type="button" data-crm-convert="${esc(lead.id)}">Convert</button>` : pill("Linked", "ok")}</div></article>`).join("") || empty("No leads yet.")}</div>`;
    if (editing?.id) $("crm-lead-form")?.scrollIntoView({ block: "nearest" });
  }

  async function paintCustomers() {
    const data = await root.api("/api/crm/customers");
    const rows = data.customers || [];
    $("crm-body").innerHTML = `<form class="crm-search" id="crm-customer-search"><input name="q" placeholder="Name, mobile, or business" maxlength="80" /><button class="btn" type="submit">Show</button></form><div class="crm-list">${rows.map(customerRow).join("") || empty("No customers.")}</div>`;
  }

  function customerRow(row) {
    const due = Number(row.outstanding) || 0;
    return `<article class="crm-row"><div class="crm-row-main"><strong>${esc(row.name)}</strong><p class="crm-meta">${esc([row.mobile, row.business_name].filter(Boolean).join(" · "))}</p></div><div class="crm-row-mid">${due > 0 ? pill(`Due ${money(due)}`, "alert") : pill("Clear", "ok")}</div><div class="crm-actions"><button class="btn" type="button" data-crm-open="${esc(row.id)}">360° profile</button></div></article>`;
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
    $("crm-body").innerHTML = `<div class="crm-actions"><button class="btn" type="button" data-crm-tab="customers">Back to customers</button></div>
      <article class="crm-summary"><div><strong>${esc(customer.name)}</strong><p class="crm-meta">${esc(customer.mobile || "No mobile")} · ${esc(customer.email || "No email")} · GSTIN ${esc(customer.gstin || "—")}</p></div><div class="crm-summary-stats"><span>Lifetime<strong>${esc(money(data.lifetime))}</strong></span><span>Credit limit<strong>${esc(money(customer.credit_limit))}</strong></span><span>Outstanding<strong>${esc(money(customer.outstanding))}</strong></span>${data.loyalty ? `<span>Points<strong>${esc(data.loyalty.points_balance)}</strong></span>` : ""}</div></article>
      <form class="crm-profile" id="crm-profile-form">
        <h4 class="crm-panel-title">Profile</h4>
        <label>Relationship manager<select name="assigned_to">${staffOptions(data.profile?.assigned_to || "")}</select></label>
        <label><input name="whatsapp_consent" type="checkbox"${customer.whatsapp_consent ? " checked" : ""} /> WhatsApp consent</label>
        <label><input name="whatsapp_opt_out" type="checkbox"${customer.whatsapp_opt_out ? " checked" : ""} /> WhatsApp opt-out</label>
        <label><input name="sms_consent" type="checkbox"${data.profile?.sms_consent ? " checked" : ""} /> SMS consent</label>
        <label><input name="email_consent" type="checkbox"${data.profile?.email_consent ? " checked" : ""} /> Email consent</label>
        ${fields}
        <div class="crm-wide"><button class="btn primary" type="submit">Save profile</button></div>
      </form>
      <form class="crm-form" id="crm-note-form"><h4 class="crm-panel-title">Note</h4><label class="crm-wide">Note<textarea name="body" rows="2" required></textarea></label><div><button class="btn" type="submit">Add note</button></div></form>
      <form class="crm-form" id="crm-contact-form"><h4 class="crm-panel-title">Contact</h4><label>Contact name<input name="name" required /></label><label>Role<input name="role_name" /></label><label>Mobile<input name="mobile" /></label><label>Address<input name="address" /></label><div><button class="btn" type="submit">Add contact</button></div></form>
      <div class="crm-timeline"><h4>Invoices</h4>${orders || empty("No invoices yet.")}<h4>Quotations</h4>${quotes || empty("No quotations yet.")}<h4>Messages</h4>${logs || empty("No messages yet.")}</div>`;
  }

  async function paintFollowups() {
    const data = await root.api("/api/crm/followups");
    const rows = data.followups || [];
    $("crm-body").innerHTML = `<form class="crm-form" id="crm-follow-form"><h4 class="crm-panel-title">New follow-up</h4><label>Date<input name="due_on" type="date" required /></label><label>Kind<select name="kind"><option>call</option><option>meeting</option><option>whatsapp</option><option>visit</option></select></label><label>Assign<select name="assigned_to">${staffOptions("")}</select></label><label class="crm-wide">Note<input name="note" maxlength="500" /></label><div><button class="btn primary" type="submit">Add follow-up</button></div></form><div class="crm-list">${rows.map((row) => { const state = row.state || row.status; return `<article class="crm-row"><div class="crm-row-main"><strong>${esc(row.kind)} · ${esc(row.due_on || "")}</strong><p class="crm-meta">${esc(row.note || "")}</p></div><div class="crm-row-mid">${pill(state, tone(state))}</div><div class="crm-actions">${row.status === "done" ? "" : `<button class="btn" type="button" data-crm-done="follow" data-id="${esc(row.id)}">Done</button>`}</div></article>`; }).join("") || empty("No follow-ups.")}</div>`;
  }

  async function paintTasks() {
    const data = await root.api("/api/crm/tasks");
    const rows = data.tasks || [];
    $("crm-body").innerHTML = `<form class="crm-form" id="crm-task-form"><h4 class="crm-panel-title">New task</h4><label>Task<input name="title" required maxlength="180" /></label><label>Due<input name="due_on" type="date" /></label><label>Assign<select name="assigned_to">${staffOptions("")}</select></label><label>Priority<select name="priority"><option>normal</option><option>high</option><option>urgent</option></select></label><div><button class="btn primary" type="submit">Add task</button></div></form><div class="crm-list">${rows.map((row) => `<article class="crm-row"><div class="crm-row-main"><strong>${esc(row.title)}</strong><p class="crm-meta">${esc(row.due_on || "No date")}</p></div><div class="crm-row-mid">${pill(row.status, tone(row.status))} ${pill(row.priority || "normal", tone(row.priority))}</div><div class="crm-actions">${row.status === "done" ? "" : `<button class="btn" type="button" data-crm-done="task" data-id="${esc(row.id)}">Done</button>`}</div></article>`).join("") || empty("No tasks.")}</div>`;
  }

  async function paintTickets() {
    const data = await root.api("/api/crm/tickets");
    const rows = data.tickets || [];
    $("crm-body").innerHTML = `<form class="crm-form" id="crm-ticket-form"><h4 class="crm-panel-title">New ticket</h4><label>Subject<input name="subject" required maxlength="180" /></label><label>Priority<select name="priority"><option>normal</option><option>high</option><option>urgent</option></select></label><label class="crm-wide">Details<textarea name="body" rows="2"></textarea></label><div><button class="btn primary" type="submit">Open ticket</button></div></form><div class="crm-list">${rows.map((row) => `<article class="crm-row"><div class="crm-row-main"><strong>${esc(row.subject)}</strong><p class="crm-meta">${esc(row.body || "")}</p></div><div class="crm-row-mid">${pill(row.status, tone(row.status))} ${pill(row.priority, tone(row.priority))}</div></article>`).join("") || empty("No complaints or service requests.")}</div>`;
  }

  async function paintMessages() {
    const rows = boot?.automations || [];
    $("crm-body").innerHTML = `<form class="crm-autos" id="crm-auto-form"><p class="crm-note">Messages send only when the switch is on and the customer has consented. Opt-out stops WhatsApp. SMS stays logged until an SMS provider is connected. Invoice WhatsApp from billing is unchanged.</p>${rows.map((row) => { const meta = CRM().AUTOMATIONS.find((item) => item.key === row.key); return `<article class="crm-auto"><label class="crm-auto-on"><input type="checkbox" name="enabled" data-key="${esc(row.key)}"${Number(row.enabled) === 1 ? " checked" : ""} /><span><strong>${esc(meta?.label || row.key)}</strong><em>${esc(meta?.trigger || "")}</em></span></label><label>Template<textarea name="template" data-key="${esc(row.key)}" rows="2">${esc(row.template || "")}</textarea></label><label>Wait days<input name="days" data-key="${esc(row.key)}" type="number" min="0" max="365" value="${esc(row.wait_days || 0)}" /></label></article>`; }).join("")}<div class="crm-actions"><button class="btn primary" type="submit">Save templates</button><button class="btn" type="button" id="crm-run">Run due messages</button></div></form>`;
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
    leadFields().forEach((field) => {
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
      const editBtn = event.target.closest("[data-crm-edit]");
      if (editBtn && $("crm-desk")?.contains(editBtn)) {
        const id = editBtn.dataset.crmEdit;
        let lead = leadRows.find((row) => row.id === id);
        if (!lead) {
          const data = await root.api("/api/crm/leads");
          lead = (data.leads || []).find((row) => row.id === id);
        }
        if (!lead) {
          hint("Lead not found", "bad");
          return;
        }
        editingLead = lead;
        if (tab !== "leads") await show("leads");
        else await paintLeads();
        return;
      }
      if (event.target.id === "crm-lead-cancel") {
        editingLead = null;
        await paintLeads();
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
          const leadId = read("lead_id");
          const payload = { name: read("name"), mobile: read("mobile"), email: read("email"), company_name: read("company_name"), gstin: read("gstin"), source_id: read("source_id"), stage: read("stage"), priority: read("priority"), assigned_to: read("assigned_to"), expected_value: read("expected_value"), next_followup: read("next_followup"), notes: read("notes"), custom: customFrom(form) };
          await root.api(leadId ? `/api/crm/leads/${encodeURIComponent(leadId)}` : "/api/crm/leads", { method: "POST", body: JSON.stringify(payload) });
          editingLead = null;
          hint(leadId ? "Lead updated" : "Lead saved", "ok");
          await show("leads");
        } else if (form.id === "crm-customer-search") {
          const data = await root.api(`/api/crm/customers?q=${encodeURIComponent(read("q"))}`);
          boot = boot || {};
          $("crm-body").querySelector(".crm-list").innerHTML = (data.customers || []).map(customerRow).join("") || empty("No matching customers.");
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
