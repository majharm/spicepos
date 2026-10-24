/** Outstanding payments desk: filters, preview, and WhatsApp reminders. */
(function (root) {
  const D = () => root.POSDueReminders;
  let lastRows = [];

  function $(id) {
    return document.getElementById(id);
  }

  function filters() {
    return {
      customer: $("dues-customer")?.value || "",
      from: $("dues-from")?.value || "",
      to: $("dues-to")?.value || "",
      status: $("dues-status")?.value || "",
      min: $("dues-min")?.value || "",
      max: $("dues-max")?.value || "",
    };
  }

  function hint(text, kind) {
    const el = $("dues-hint");
    if (!el) return;
    el.textContent = text || "";
    el.className = kind === "ok" ? "hint ok" : kind === "bad" ? "hint dues-bad" : "hint";
  }

  function paint(data) {
    const summary = data?.summary || D().duesSummary(lastRows);
    const stats = $("dues-hero-stats");
    if (stats) {
      const cells = [
        ["Invoices", summary.invoices],
        ["Customers", summary.customers],
        ["Outstanding", D().moneyLabel(summary.outstanding)],
      ];
      stats.innerHTML = cells
        .map(([label, value]) => `<div class="items-stat"><span>${D().escapeHtml(label)}</span><strong>${D().escapeHtml(String(value))}</strong></div>`)
        .join("");
    }
    const table = $("dues-table");
    if (table) table.innerHTML = D().duesTableHtml(lastRows);
  }

  async function load() {
    const page = $("view-dues");
    if (!page || page.hidden) return;
    const q = new URLSearchParams();
    const current = filters();
    Object.entries(current).forEach(([key, value]) => {
      if (value) q.set(key, value);
    });
    if (current.status === "overdue") q.set("overdue", "1");
    try {
      const { res, data } = await root.posRequest(`/api/customers/outstanding?${q.toString()}`);
      if (!res.ok) throw new Error(data?.error || "Could not load outstanding payments");
      lastRows = Array.isArray(data?.rows) ? data.rows : [];
      paint(data);
      hint("");
    } catch (err) {
      hint(err.message || "Could not load outstanding payments", "bad");
    }
  }

  function refreshIfOpen() {
    const page = $("view-dues");
    if (page && !page.hidden) return load();
    return Promise.resolve();
  }

  function selectedSends(scope) {
    const boxes = [...document.querySelectorAll("#dues-table [data-due-check]:checked")];
    if (scope === "customer") {
      return [...new Set(boxes.map((box) => box.dataset.customer).filter(Boolean))].map((customerId) => ({
        customerId,
        scope: "customer",
      }));
    }
    return boxes.map((box) => ({
      customerId: box.dataset.customer,
      orderId: box.value,
      scope: "invoice",
    }));
  }

  function previewHtml(messages, data) {
    const blocks = messages.map((item, index) => {
      if (!item.ok) {
        return `<p class="hint dues-bad">${D().escapeHtml(item.invoiceNumber || item.customerName || "Invoice")} has no balance due.</p>`;
      }
      const mobileNote = item.mobileOk ? "" : `<p class="hint dues-bad">Add a 10-digit mobile before this reminder can send.</p>`;
      return `<label class="dues-preview">
        <span>${D().escapeHtml(item.customerName || "Customer")} · ${D().escapeHtml(item.invoiceNumber || "Total due")} · ${D().escapeHtml(D().moneyLabel(item.outstanding))}</span>
        ${mobileNote}
        <textarea data-due-msg="${index}" rows="${messages.length > 1 ? 6 : 14}">${D().escapeHtml(item.message || "")}</textarea>
      </label>`;
    }).join("");
    const note = data?.waOff
      ? `<p class="hint">WhatsApp API is off. Send opens WhatsApp with this message.</p>`
      : `<p class="hint">Sending a reminder does not mark the invoice paid.</p>`;
    return `${note}${blocks}
      <label class="dues-resend"><input type="checkbox" id="due-wa-resend" /> Send again if this reminder was already sent today</label>
      <div class="dues-preview-actions"><button class="btn primary" type="button" data-due-confirm>Send WhatsApp</button></div>`;
  }

  function closeModal() {
    const modal = $("modal");
    if (modal) modal.hidden = true;
  }

  async function openPreview(sends) {
    if (!sends.length) {
      hint("Select a customer or invoice first.", "bad");
      return;
    }
    const { res, data } = await root.posRequest("/api/customers/due-reminders", {
      method: "POST",
      body: JSON.stringify({ preview: true, sends }),
    });
    if (!res.ok) throw new Error(data?.error || "Could not prepare the reminder");
    const messages = Array.isArray(data?.messages) ? data.messages : [];
    if (!root.showModal || !root.showModal("WhatsApp reminder", previewHtml(messages, data))) return;
    $("modal-body")?.querySelector("[data-due-confirm]")?.addEventListener("click", () => {
      confirmSend(messages, Boolean(data?.waOff)).catch((err) => hint(err.message || "WhatsApp reminder failed", "bad"));
    });
  }

  function resultLine(row) {
    const who = row.invoiceNumber || row.customerName || "Reminder";
    if (row.duplicate) return `${who}: already sent`;
    if (row.ok) return `${who}: ${D().statusLabel(row.status) || "Sent"}`;
    if (row.reason === "bad-mobile") return `${who}: mobile number is missing`;
    return `${who}: ${row.error || "not sent"}`;
  }

  async function confirmSend(messages, waOff) {
    const sends = [];
    messages.forEach((item, index) => {
      if (!item.ok || !item.mobileOk) return;
      const text = document.querySelector(`[data-due-msg="${index}"]`)?.value || item.message;
      sends.push({
        customerId: item.customerId,
        orderId: item.scope === "customer" ? "" : item.orderId,
        scope: item.scope,
        message: text,
        mobile: item.mobile,
      });
    });
    if (!sends.length) {
      hint("No reminder has a valid mobile number.", "bad");
      return;
    }
    const button = document.querySelector("[data-due-confirm]");
    if (button) button.disabled = true;
    if (waOff) {
      const links = sends.map((send) => {
        const url = D().whatsappUrl(send.mobile, send.message);
        return `<a class="btn" href="${D().escapeHtml(url)}" target="_blank" rel="noopener">Open WhatsApp · ${D().escapeHtml(send.mobile)}</a>`;
      });
      const body = $("modal-body");
      if (body) body.innerHTML = `<p class="hint">WhatsApp API is off. Open a chat for each customer. The invoice stays unpaid.</p><div class="dues-preview-actions">${links.join("")}</div>`;
      if (sends.length === 1) window.open(D().whatsappUrl(sends[0].mobile, sends[0].message), "_blank", "noopener");
      hint("Opened WhatsApp with the reminder. The invoice is still unpaid.", "ok");
      return;
    }
    const resend = Boolean($("due-wa-resend")?.checked);
    const { res, data } = await root.posRequest("/api/customers/due-reminders", {
      method: "POST",
      body: JSON.stringify({
        resend,
        sends: sends.map(({ mobile, ...send }) => send),
      }),
    });
    if (!res.ok) throw new Error(data?.error || "WhatsApp reminder failed");
    const results = Array.isArray(data?.results) ? data.results : [];
    const fallback = results.find((row) => row.fallbackUrl);
    if (fallback && results.every((row) => row.reason === "wa-off" || row.fallbackUrl)) {
      if (results.length === 1) window.open(fallback.fallbackUrl, "_blank", "noopener");
    }
    closeModal();
    hint(results.map(resultLine).join(" · "), results.some((row) => row.ok) ? "ok" : "bad");
    await load();
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-due-wa]");
    if (button && button.closest("#view-dues")) {
      const sends = button.dataset.dueWa === "customer"
        ? [{ customerId: button.dataset.customer, scope: "customer" }]
        : [{ customerId: button.dataset.customer, orderId: button.dataset.order, scope: "invoice" }];
      openPreview(sends).catch((err) => hint(err.message || "Could not prepare the reminder", "bad"));
      return;
    }
    if (event.target.closest("#dues-send-selected")) {
      openPreview(selectedSends("invoice")).catch((err) => hint(err.message || "Could not prepare the reminder", "bad"));
      return;
    }
    if (event.target.closest("#dues-send-totals")) {
      openPreview(selectedSends("customer")).catch((err) => hint(err.message || "Could not prepare the reminder", "bad"));
    }
  });

  document.addEventListener("change", (event) => {
    if (!event.target.matches("[data-due-all]")) return;
    document.querySelectorAll("#dues-table [data-due-check]").forEach((box) => {
      box.checked = event.target.checked;
    });
  });

  document.addEventListener("submit", (event) => {
    if (event.target?.id !== "dues-filters") return;
    event.preventDefault();
    load();
  });

  root.POSDueRemindersUi = { load, refreshIfOpen };
})(typeof globalThis !== "undefined" ? globalThis : window);
