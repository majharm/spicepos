/** Quotation desk: offers, sharing, and one-way conversion into an unpaid sales invoice. */
(function (root) {
  const Q = () => root.POSQuotations;
  let bound = false;
  let tab = "all";
  let last = null;
  let editingId = "";
  let lineSeq = 1;
  let lines = [];
  let busy = false;

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
    const el = $("quote-hint");
    if (!el) return;
    el.textContent = text || "";
    el.className = kind === "ok" ? "hint ok" : kind === "bad" ? "hint error" : "hint";
  }

  function rupee(n) {
    if (typeof root.money === "function") return root.money(n);
    const v = Number(n) || 0;
    return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
  }

  function customers() {
    return root.state?.customers || [];
  }

  function items() {
    return root.state?.items || [];
  }

  function customerById(id) {
    return customers().find((row) => row.id === id) || null;
  }

  function itemById(id) {
    return items().find((row) => row.id === id) || null;
  }

  function canSettings() {
    return typeof root.can === "function" && root.can("settings");
  }

  function canCustomers() {
    return typeof root.can === "function" && root.can("customers");
  }

  function today() {
    return last?.today || Q()?.todayYmd?.() || "";
  }

  function validDays() {
    return Math.max(1, Math.min(365, Number(last?.settings?.valid_days || root.state?.company?.quotation_valid_days) || 15));
  }

  function customerOptions(selected) {
    return [`<option value="">Choose customer</option>`]
      .concat(customers().map((row) => {
        const name = row.business_name || row.name || "Customer";
        return `<option value="${esc(row.id)}"${row.id === selected ? " selected" : ""}>${esc(name)}</option>`;
      }))
      .join("");
  }

  function itemOptions(selected) {
    return [`<option value="">Product or service</option>`]
      .concat(items().map((row) => `<option value="${esc(row.id)}"${row.id === selected ? " selected" : ""}>${esc(row.name || row.code || "Item")}</option>`))
      .join("");
  }

  function filters() {
    return {
      q: $("quote-q")?.value || "",
      customer_id: $("quote-customer-filter")?.value || "",
      status: $("quote-status")?.value || "",
      from: $("quote-from")?.value || "",
      to: $("quote-to")?.value || "",
      salesperson: $("quote-salesperson-filter")?.value || "",
    };
  }

  function queryString() {
    const params = new URLSearchParams();
    Object.entries(filters()).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const s = params.toString();
    return s ? `?${s}` : "";
  }

  function statusOptions(selected) {
    const rows = Q()?.STATUSES || [];
    return [`<option value="">All statuses</option>`]
      .concat(rows.map((id) => `<option value="${esc(id)}"${id === selected ? " selected" : ""}>${esc(Q().statusLabel(id))}</option>`))
      .join("");
  }

  function paintCustomerFilter() {
    const el = $("quote-customer-filter");
    if (!el) return;
    const current = el.value;
    el.innerHTML = `<option value="">All customers</option>${customers()
      .map((row) => `<option value="${esc(row.id)}">${esc(row.business_name || row.name || "Customer")}</option>`)
      .join("")}`;
    el.value = current;
    const status = $("quote-status");
    if (status && status.options.length < 2) status.innerHTML = statusOptions(status.value);
  }

  function paintStats(stats) {
    const el = $("quote-stats");
    if (!el) return;
    const cells = [
      ["Total quotations", stats?.total || 0, ""],
      ["Draft", stats?.draft || 0, ""],
      ["Sent", stats?.sent || 0, ""],
      ["Accepted", stats?.accepted || 0, ""],
      ["Rejected", stats?.rejected || 0, ""],
      ["Expired", stats?.expired || 0, Number(stats?.expired) > 0 ? " is-warn" : ""],
      ["Converted", stats?.converted || 0, ""],
      ["Quoted value", rupee(stats?.quotedValue || 0), ""],
      ["Accepted value", rupee(stats?.acceptedValue || 0), ""],
    ];
    el.innerHTML = cells
      .map(([label, value, extra]) => `<div class="quote-stat${extra}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`)
      .join("");
  }

  function paintList(quotes) {
    const el = $("quote-list");
    if (!el) return;
    if (!last?.enabled) {
      el.innerHTML = "";
      return;
    }
    if (!quotes?.length) {
      el.innerHTML = `<p class="hint">No quotations match these filters.</p>`;
      return;
    }
    el.innerHTML = quotes.map((row) => `<button type="button" class="quote-card" data-quote-open="${esc(row.id)}">
      <strong>${esc(row.quotation_number)}</strong>
      <span>${esc(row.customer_name || "Customer")}${row.salesperson ? `<span class="sku"> · ${esc(row.salesperson)}</span>` : ""}</span>
      <span class="quote-status is-${esc(row.status)}">${esc(Q().statusLabel(row.status))}</span>
      <span>${esc(rupee(row.total))}</span>
    </button>`).join("");
  }

  function paintReports() {
    const el = $("quote-reports");
    if (!el || tab !== "reports") return;
    const stats = last?.stats || {};
    const rows = [
      ["Draft", stats.draft || 0],
      ["Sent", stats.sent || 0],
      ["Accepted", stats.accepted || 0],
      ["Rejected", stats.rejected || 0],
      ["Expired", stats.expired || 0],
      ["Converted to Invoice", stats.converted || 0],
      ["Cancelled", stats.cancelled || 0],
    ];
    el.innerHTML = `<h3>Quotation reports</h3>
      <p class="hint">Counts cover this business. Total quoted value ${esc(rupee(stats.quotedValue || 0))}. Accepted quotation value ${esc(rupee(stats.acceptedValue || 0))}, including quotations already converted.</p>
      <table class="quote-totals"><tbody>
        ${rows.map(([label, count]) => `<tr><td>${esc(label)}</td><td class="num">${esc(count)}</td></tr>`).join("")}
        <tr><td>Total quotations</td><td>${esc(stats.total || 0)}</td></tr>
      </tbody></table>`;
  }

  function showTab(next) {
    tab = next;
    const enabled = last?.enabled !== false;
    if ($("quote-all")) $("quote-all").hidden = tab !== "all";
    if ($("quote-form-wrap")) $("quote-form-wrap").hidden = tab !== "create";
    if ($("quote-settings")) $("quote-settings").hidden = tab !== "settings";
    if ($("quote-reports")) $("quote-reports").hidden = tab !== "reports";
    if ($("quote-detail")) $("quote-detail").hidden = true;
    document.querySelectorAll("[data-quote-tab]").forEach((btn) => {
      btn.classList.toggle("primary", btn.dataset.quoteTab === tab);
    });
    const createBtn = document.querySelector("[data-quote-tab='create']");
    if (createBtn) createBtn.hidden = !enabled;
    if (tab === "create" && !$("quote-form")) paintForm(null);
    if (tab === "settings") paintSettings();
    if (tab === "reports") paintReports();
  }

  function blankLine() {
    lineSeq += 1;
    return { key: `l${lineSeq}`, itemId: "", description: "", quantity: "", unit: "", rate: "", discountType: "amt", discountValue: "", gstRate: "", sku: "", size: "", color: "", isCount: true };
  }

  function lineFromQuote(line) {
    lineSeq += 1;
    return {
      key: `l${lineSeq}`,
      itemId: line.itemId || "",
      description: line.description || "",
      quantity: line.quantity,
      unit: line.unit || "",
      rate: line.rate,
      discountType: line.discountType || "amt",
      discountValue: line.discountValue || "",
      gstRate: line.gstRate,
      sku: line.sku || "",
      size: line.size || "",
      color: line.color || "",
      isCount: line.isCount !== false,
    };
  }

  function readLines() {
    return [...document.querySelectorAll("[data-quote-line]")].map((row) => ({
      itemId: row.querySelector("[data-f='item']")?.value || "",
      description: row.querySelector("[data-f='description']")?.value || "",
      quantity: row.querySelector("[data-f='qty']")?.value || "",
      unit: row.dataset.unit || "",
      rate: row.querySelector("[data-f='rate']")?.value || "",
      discountType: row.querySelector("[data-f='dtype']")?.value || "amt",
      discountValue: row.querySelector("[data-f='dval']")?.value || "",
      gstRate: row.querySelector("[data-f='gst']")?.value || "",
      sku: row.dataset.sku || "",
      name: row.dataset.name || "",
      size: row.dataset.size || "",
      color: row.dataset.color || "",
      isCount: row.dataset.count !== "0",
    }));
  }

  function currentCustomer() {
    return customerById($("quote-customer")?.value || "");
  }

  function pricedNow() {
    const customer = currentCustomer();
    const inter = root.GstSupply?.isInterStateSupply
      ? root.GstSupply.isInterStateSupply(
          { gstin: root.state?.company?.gstin, state: root.state?.company?.state },
          { gstin: customer?.gstin, state: customer?.state },
        )
      : false;
    return Q().priceQuote({
      lines: readLines(),
      discountType: $("quote-discount-type")?.value || "amt",
      discountValue: $("quote-discount-value")?.value || 0,
      extraCharges: $("quote-charges")?.value || 0,
      roundOff: $("quote-round")?.value || 0,
      interState: inter,
    });
  }

  function paintTotals() {
    if (!$("quote-form")) return;
    const priced = pricedNow();
    document.querySelectorAll("[data-quote-line]").forEach((row) => {
      const one = Q().priceQuote({
        lines: [{
          itemId: row.querySelector("[data-f='item']")?.value || "x",
          quantity: row.querySelector("[data-f='qty']")?.value || "",
          rate: row.querySelector("[data-f='rate']")?.value || "",
          unit: row.dataset.unit || "PCS",
          isCount: row.dataset.count !== "0",
          discountType: row.querySelector("[data-f='dtype']")?.value || "amt",
          discountValue: row.querySelector("[data-f='dval']")?.value || "",
          gstRate: row.querySelector("[data-f='gst']")?.value || "",
        }],
      });
      const slot = row.querySelector("[data-line-total]");
      if (slot) slot.textContent = rupee(one.lines[0]?.total || 0);
    });
    const box = $("quote-totals");
    if (!box) return;
    const tax = [
      Number(priced.cgst) ? `CGST ${rupee(priced.cgst)}` : "",
      Number(priced.sgst) ? `SGST ${rupee(priced.sgst)}` : "",
      Number(priced.igst) ? `IGST ${rupee(priced.igst)}` : "",
    ].filter(Boolean).join(" · ");
    box.innerHTML = `
      <div><span>Subtotal</span><strong>${esc(rupee(priced.subtotal))}</strong></div>
      <div><span>Discount</span><strong>${esc(rupee(priced.discount))}</strong></div>
      <div><span>Additional charges</span><strong>${esc(rupee(priced.extraCharges))}</strong></div>
      <div><span>Tax${tax ? ` (${esc(tax)})` : ""}</span><strong>${esc(rupee(priced.gst))}</strong></div>
      <div><span>Round off</span><strong>${esc(rupee(priced.roundOff))}</strong></div>
      <div><span>Grand total</span><strong>${esc(rupee(priced.total))}</strong></div>`;
  }

  function paintLines() {
    const host = $("quote-lines");
    if (!host) return;
    host.innerHTML = lines.map((line) => {
      const extra = [line.sku, line.size, line.color].filter(Boolean).join(" · ");
      return `<div class="quote-line" data-quote-line="${esc(line.key)}" data-unit="${esc(line.unit)}" data-sku="${esc(line.sku)}" data-size="${esc(line.size)}" data-color="${esc(line.color)}" data-count="${line.isCount === false ? "0" : "1"}" data-name="${esc(line.name || "")}">
        <label>Product or service
          <select data-f="item">${itemOptions(line.itemId)}</select>
          ${extra ? `<span class="sku">${esc(extra)}</span>` : ""}
        </label>
        <label>Description <input data-f="description" value="${esc(line.description)}" maxlength="500" /></label>
        <label>Qty <input data-f="qty" type="number" min="0" step="any" value="${esc(line.quantity)}" /></label>
        <label>Unit <input value="${esc(line.unit || "")}" readonly /></label>
        <label>Rate <input data-f="rate" type="number" min="0" step="any" value="${esc(line.rate)}" /></label>
        <label>Discount
          <select data-f="dtype"><option value="amt"${line.discountType !== "pct" ? " selected" : ""}>Amount</option><option value="pct"${line.discountType === "pct" ? " selected" : ""}>Percent</option></select>
          <input data-f="dval" type="number" min="0" step="any" value="${esc(line.discountValue)}" />
        </label>
        <label>Tax % <input data-f="gst" type="number" min="0" step="any" value="${esc(line.gstRate)}" /></label>
        <strong data-line-total></strong>
        <button class="btn" type="button" data-quote-remove="${esc(line.key)}">Remove</button>
      </div>`;
    }).join("");
    paintTotals();
  }

  function applyItem(row) {
    const item = itemById(row.querySelector("[data-f='item']")?.value || "");
    const customer = currentCustomer();
    if (!item) {
      row.dataset.unit = "";
      row.dataset.sku = "";
      row.dataset.size = "";
      row.dataset.color = "";
      row.dataset.name = "";
      return;
    }
    const b2b = String(customer?.type || "").toLowerCase() === "b2b";
    const unit = item.base_unit || item.unit || "PCS";
    const count = root.POSUnits?.isCount ? root.POSUnits.isCount(unit) : !["GM", "KG", "G"].includes(String(unit).toUpperCase());
    row.dataset.unit = unit;
    row.dataset.sku = item.sku || item.code || item.barcode || "";
    row.dataset.size = item.size || "";
    row.dataset.color = item.color || "";
    row.dataset.count = count ? "1" : "0";
    row.dataset.name = item.name || "";
    const rate = row.querySelector("[data-f='rate']");
    const gst = row.querySelector("[data-f='gst']");
    const unitInput = row.querySelector("input[readonly]");
    if (rate) rate.value = b2b ? (item.b2b_rate ?? item.retail_rate ?? 0) : (item.retail_rate ?? 0);
    if (gst && (gst.value === "" || document.activeElement !== gst)) gst.value = item.gst_rate ?? 0;
    if (unitInput) unitInput.value = unit;
    const sku = row.querySelector(".sku");
    const bits = [row.dataset.sku, row.dataset.size, row.dataset.color].filter(Boolean).join(" · ");
    if (sku) sku.textContent = bits;
    else if (bits) {
      const label = row.querySelector("label");
      if (label) label.insertAdjacentHTML("beforeend", `<span class="sku">${esc(bits)}</span>`);
    }
  }

  function fillCustomerFields() {
    const customer = currentCustomer();
    if (!customer) return;
    const name = $("quote-name");
    const phone = $("quote-phone");
    const email = $("quote-email");
    const billing = $("quote-billing");
    if (name) name.value = customer.business_name || customer.name || "";
    if (phone) phone.value = customer.mobile || customer.phone || "";
    if (email) email.value = customer.email || "";
    if (billing) billing.value = customer.address || "";
  }

  function shopBlurb() {
    const company = root.state?.company || {};
    const bits = [company.name, company.address, company.phone, company.email, company.gstin ? `GSTIN ${company.gstin}` : ""].filter(Boolean);
    return bits.join(" · ");
  }

  function paintForm(quote) {
    editingId = quote?.id || "";
    const date = String(quote?.quotation_date || today()).slice(0, 10);
    const valid = String(quote?.valid_until || Q()?.addDays?.(date, validDays()) || "").slice(0, 10);
    lines = (quote?.lines || []).map(lineFromQuote);
    if (!lines.length) lines = [blankLine()];
    const host = $("quote-form-wrap");
    if (!host) return;
    host.hidden = false;
    host.innerHTML = `<form class="quote-form" id="quote-form">
      <h3>${editingId ? "Edit draft quotation" : "Create quotation"}</h3>
      <p class="quote-shop">${esc(shopBlurb())}</p>
      <p class="quote-banner">QUOTATION — NOT A TAX INVOICE</p>
      <div class="quote-form-grid">
        <label>Customer <select id="quote-customer" required>${customerOptions(quote?.customer_id || "")}</select></label>
        <label>Customer name <input id="quote-name" value="${esc(quote?.customer_name || "")}" maxlength="180" /></label>
        <label>Phone <input id="quote-phone" value="${esc(quote?.customer_phone || "")}" maxlength="32" /></label>
        <label>Email <input id="quote-email" type="email" value="${esc(quote?.customer_email || "")}" maxlength="160" /></label>
        <label class="full">Billing address <textarea id="quote-billing" rows="2" maxlength="500">${esc(quote?.billing_address || "")}</textarea></label>
        <label class="full">Shipping address (optional) <textarea id="quote-shipping" rows="2" maxlength="500">${esc(quote?.shipping_address || "")}</textarea></label>
        ${canCustomers() ? `<div class="full"><button class="btn" type="button" id="quote-add-customer">Add customer</button></div>` : ""}
        <label>Quotation date <input id="quote-date" type="date" value="${esc(date)}" required /></label>
        <label>Valid until <input id="quote-valid" type="date" value="${esc(valid)}" /></label>
        <label>Reference <input id="quote-reference" value="${esc(quote?.reference_no || "")}" maxlength="64" /></label>
        <label>Salesperson <input id="quote-salesperson" value="${esc(quote?.salesperson || "")}" maxlength="120" /></label>
      </div>
      <div id="quote-lines"></div>
      <p><button class="btn" type="button" id="quote-add-line">Add line</button></p>
      <div class="quote-form-grid">
        <label>Overall discount
          <select id="quote-discount-type">
            <option value="amt"${quote?.discount_type === "pct" ? "" : " selected"}>Amount</option>
            <option value="pct"${quote?.discount_type === "pct" ? " selected" : ""}>Percent</option>
          </select>
        </label>
        <label>Discount value <input id="quote-discount-value" type="number" min="0" step="any" value="${esc(quote?.discount_value || 0)}" /></label>
        <label>Additional charges <input id="quote-charges" type="number" min="0" step="any" value="${esc(quote?.extra_charges || 0)}" /></label>
        <label>Round off <input id="quote-round" type="number" step="any" value="${esc(quote?.round_off || 0)}" /></label>
        <label class="full">Customer notes <textarea id="quote-notes" rows="2" maxlength="4000">${esc(quote?.notes || "")}</textarea></label>
        <label class="full">Terms and conditions <textarea id="quote-terms" rows="3" maxlength="4000">${esc(quote?.terms || last?.settings?.terms || root.state?.company?.quotation_terms || root.state?.company?.invoice_terms || "")}</textarea></label>
      </div>
      <div class="quote-totals" id="quote-totals"></div>
      <div class="quote-detail-tools">
        <button class="btn primary" type="submit">Save draft</button>
        <button class="btn" type="button" id="quote-save-sent">Save and mark sent</button>
        <button class="btn" type="button" data-quote-tab="all">Back to all quotations</button>
      </div>
    </form>`;
    tab = "create";
    if ($("quote-all")) $("quote-all").hidden = true;
    if ($("quote-settings")) $("quote-settings").hidden = true;
    if ($("quote-reports")) $("quote-reports").hidden = true;
    if ($("quote-detail")) $("quote-detail").hidden = true;
    paintLines();
    if (!quote) fillCustomerFields();
  }

  function payload(status) {
    return {
      customer_id: $("quote-customer")?.value || "",
      customer_name: $("quote-name")?.value || "",
      customer_phone: $("quote-phone")?.value || "",
      customer_email: $("quote-email")?.value || "",
      billing_address: $("quote-billing")?.value || "",
      shipping_address: $("quote-shipping")?.value || "",
      quotation_date: $("quote-date")?.value || "",
      valid_until: $("quote-valid")?.value || "",
      reference_no: $("quote-reference")?.value || "",
      salesperson: $("quote-salesperson")?.value || "",
      discount_type: $("quote-discount-type")?.value || "amt",
      discount_value: $("quote-discount-value")?.value || 0,
      extra_charges: $("quote-charges")?.value || 0,
      round_off: $("quote-round")?.value || 0,
      notes: $("quote-notes")?.value || "",
      terms: $("quote-terms")?.value || "",
      lines: readLines(),
      status,
    };
  }

  async function saveQuote(status) {
    if (busy) return;
    busy = true;
    try {
      const data = editingId
        ? await root.api(`/api/quotations/${editingId}`, { method: "POST", body: JSON.stringify(payload("draft")) })
        : await root.api("/api/quotations", { method: "POST", body: JSON.stringify(payload(status)) });
      if (editingId && status === "sent") {
        await root.api(`/api/quotations/${editingId}/status`, { method: "POST", body: JSON.stringify({ status: "sent" }) });
      }
      hint(`${data.quote?.quotation_number || "Quotation"} saved. Stock and payments are unchanged.`, "ok");
      editingId = "";
      await load();
      if (data.quote?.id) await openQuote(data.quote.id);
    } catch (err) {
      hint(err.message || "Could not save the quotation", "bad");
    } finally {
      busy = false;
    }
  }

  function actionLabel(action) {
    const map = {
      created: "Created",
      updated: "Edited",
      duplicated: "Duplicated",
      sent: "Marked sent",
      accepted: "Marked accepted",
      rejected: "Marked rejected",
      cancelled: "Cancelled",
      whatsapp: "WhatsApp opened",
      shared: "Shared",
      emailed: "Emailed",
      email_failed: "Email failed",
      converted: "Converted to invoice",
    };
    return map[action] || action || "Updated";
  }

  function paintDetail(data) {
    const quote = data.quote;
    const host = $("quote-detail");
    if (!host || !quote) return;
    const company = { ...(root.state?.company || {}), name: data.shopName || root.state?.company?.name };
    const events = data.events || [];
    const buttons = [];
    if (Q().canEdit(quote, today())) buttons.push(`<button class="btn" type="button" data-quote-edit="${esc(quote.id)}">Edit draft</button>`);
    buttons.push(`<button class="btn" type="button" data-quote-do="duplicate" data-id="${esc(quote.id)}">Duplicate</button>`);
    buttons.push(`<button class="btn" type="button" data-quote-do="print" data-id="${esc(quote.id)}">Print</button>`);
    buttons.push(`<button class="btn" type="button" data-quote-do="pdf" data-id="${esc(quote.id)}">Download PDF</button>`);
    if (quote.status !== "cancelled") {
      buttons.push(`<button class="btn" type="button" data-quote-do="email" data-id="${esc(quote.id)}">Email quotation</button>`);
      buttons.push(`<button class="btn" type="button" data-quote-do="whatsapp" data-id="${esc(quote.id)}">WhatsApp</button>`);
    }
    if (quote.status === "draft") buttons.push(`<button class="btn" type="button" data-quote-do="status" data-status="sent" data-id="${esc(quote.id)}">Mark sent</button>`);
    if (quote.status === "sent") {
      buttons.push(`<button class="btn primary" type="button" data-quote-do="status" data-status="accepted" data-id="${esc(quote.id)}">Mark accepted</button>`);
      buttons.push(`<button class="btn" type="button" data-quote-do="status" data-status="rejected" data-id="${esc(quote.id)}">Mark rejected</button>`);
    }
    if (["draft", "sent", "accepted"].includes(quote.status)) {
      buttons.push(`<button class="btn" type="button" data-quote-do="status" data-status="cancelled" data-id="${esc(quote.id)}">Cancel quotation</button>`);
    }
    if (Q().canConvert(quote, today())) {
      buttons.push(`<button class="btn primary" type="button" data-quote-do="convert" data-id="${esc(quote.id)}">Convert to invoice</button>`);
    }
    if (quote.order_number) buttons.push(`<button class="btn" type="button" data-quote-do="invoice" data-order="${esc(quote.order_number)}">Open ${esc(quote.order_number)}</button>`);
    host.hidden = false;
    if ($("quote-all")) $("quote-all").hidden = true;
    if ($("quote-form-wrap")) $("quote-form-wrap").hidden = true;
    if ($("quote-settings")) $("quote-settings").hidden = true;
    if ($("quote-reports")) $("quote-reports").hidden = true;
    host.innerHTML = `<article class="quote-detail" data-open-quote="${esc(quote.id)}">
      <p class="quote-shop">${esc(shopBlurb() || company.name || "")}</p>
      <h3>${esc(quote.quotation_number)} <span class="quote-status is-${esc(quote.status)}">${esc(Q().statusLabel(quote.status))}</span></h3>
      <p class="quote-banner">QUOTATION — NOT A TAX INVOICE</p>
      <p>${esc(quote.customer_name || "Customer")}<br />${esc([quote.customer_phone, quote.customer_email].filter(Boolean).join(" · "))}<br />${esc(quote.billing_address || "")}</p>
      <p class="hint">Date ${esc(String(quote.quotation_date || "").slice(0, 10))} · Valid until ${esc(String(quote.valid_until || "").slice(0, 10) || "—")}${quote.reference_no ? ` · Ref ${esc(quote.reference_no)}` : ""}${quote.salesperson ? ` · ${esc(quote.salesperson)}` : ""}</p>
      <p><strong>${esc(rupee(quote.total))}</strong></p>
      ${quote.status !== "cancelled" ? `<label>Email to <input id="quote-email-to" type="email" value="${esc(quote.customer_email || "")}" /></label>
        <p class="hint">Subject: ${esc(Q().emailSubject(quote.quotation_number, company.name || root.state?.company?.name))}. Sending does not mark this quotation accepted.</p>` : ""}
      <label>History note <input id="quote-status-note" maxlength="255" /></label>
      <div class="quote-detail-tools">${buttons.join("")}<button class="btn" type="button" data-quote-tab="all">All quotations</button></div>
      <h4>History</h4>
      <ul class="quote-history">${events.map((ev) => `<li>${esc(actionLabel(ev.action))}${ev.note ? ` — ${esc(ev.note)}` : ""} <span class="sku">${esc(ev.created_at || "")}</span></li>`).join("") || "<li>No history yet.</li>"}</ul>
    </article>`;
    host._quote = quote;
    host._company = company;
  }

  async function openQuote(id) {
    const data = await root.api(`/api/quotations/${encodeURIComponent(id)}`);
    paintDetail(data);
  }

  function paintSettings() {
    const el = $("quote-settings");
    if (!el) return;
    const days = validDays();
    const terms = last?.settings?.terms || root.state?.company?.quotation_terms || "";
    const on = last?.enabled !== false && (root.state?.company?.quotations_enabled === 1 || root.state?.company?.quotations_enabled === "1" || root.state?.company?.quotations_enabled === true || last?.enabled === true);
    el.innerHTML = `<form class="quote-settings" id="quote-settings-form">
      <h3>Quotation settings</h3>
      <p class="hint">Enable Quotations lives under Business Settings → Sales Settings. It is off until this business turns it on. Other businesses are unchanged.</p>
      ${canSettings() ? `<label class="full"><input id="quote-enabled" type="checkbox"${on ? " checked" : ""} /> Enable Quotations</label>` : `<p class="hint">A business owner can change these settings.</p>`}
      <label>Valid for (days) <input id="quote-valid-days" type="number" min="1" max="365" value="${esc(days)}" ${canSettings() ? "" : "disabled"} /></label>
      <label class="full">Default terms <textarea id="quote-default-terms" rows="4" maxlength="4000" ${canSettings() ? "" : "disabled"}>${esc(terms)}</textarea></label>
      ${canSettings() ? `<button class="btn primary" type="submit">Save quotation settings</button>` : ""}
    </form>`;
  }

  async function load() {
    bind();
    paintCustomerFilter();
    try {
      const data = await root.api(`/api/quotations${queryString()}`);
      last = data;
      paintStats(data.stats);
      paintList(data.quotes || []);
      paintReports();
      if (!data.enabled) {
        hint("Turn on Enable Quotations under Business Settings → Sales Settings. This business only. A quotation is not created until you enable it.");
        if (tab === "create") tab = "all";
      }
      showTab(tab === "create" && $("quote-form") ? "create" : tab);
    } catch (err) {
      hint(err.message || "Could not load quotations", "bad");
    }
  }

  async function onClick(event) {
    const tabBtn = event.target.closest("[data-quote-tab]");
    if (tabBtn) {
      event.preventDefault();
      if (tabBtn.dataset.quoteTab === "create") {
        editingId = "";
        paintForm(null);
        showTab("create");
        return;
      }
      showTab(tabBtn.dataset.quoteTab);
      return;
    }
    if (event.target.id === "quote-add-line") {
      lines = readLines().map((line, index) => ({ ...lines[index], ...line, key: lines[index]?.key || `n${index}` }));
      lines.push(blankLine());
      paintLines();
      return;
    }
    const remove = event.target.closest("[data-quote-remove]");
    if (remove) {
      const key = remove.dataset.quoteRemove;
      lines = readLines().map((line, index) => ({ ...line, key: lines[index]?.key })).filter((line) => line.key !== key);
      if (!lines.length) lines = [blankLine()];
      paintLines();
      return;
    }
    if (event.target.id === "quote-add-customer") {
      if (typeof root.showView === "function") root.showView("customers");
      return;
    }
    if (event.target.id === "quote-save-sent") {
      event.preventDefault();
      await saveQuote("sent");
      return;
    }
    const open = event.target.closest("[data-quote-open]");
    if (open) {
      try { await openQuote(open.dataset.quoteOpen); } catch (err) { hint(err.message, "bad"); }
      return;
    }
    const edit = event.target.closest("[data-quote-edit]");
    if (edit) {
      const data = await root.api(`/api/quotations/${encodeURIComponent(edit.dataset.quoteEdit)}`);
      paintForm(data.quote);
      return;
    }
    const action = event.target.closest("[data-quote-do]");
    if (!action) return;
    const id = action.dataset.id;
    const kind = action.dataset.quoteDo;
    try {
      if (kind === "print") {
        const data = await root.api(`/api/quotations/${encodeURIComponent(id)}`);
        const html = Q().printHtml(data.quote, { ...(root.state?.company || {}), name: data.shopName || root.state?.company?.name });
        const w = window.open("", "_blank", "noopener");
        if (!w) throw new Error("Allow pop-ups to print the quotation");
        w.document.open();
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
        return;
      }
      if (kind === "pdf") {
        const data = await root.api(`/api/quotations/${encodeURIComponent(id)}/pdf`);
        const bin = atob(data.pdfBase64 || "");
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = data.filename || "quotation.pdf";
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      if (kind === "email") {
        const to = $("quote-email-to")?.value || "";
        const data = await root.api(`/api/quotations/${encodeURIComponent(id)}/email`, { method: "POST", body: JSON.stringify({ to }) });
        hint(data.ok ? `Sent to ${data.to}. The quotation was not marked accepted.` : (data.error || "Email was not sent"), data.ok ? "ok" : "bad");
        await openQuote(id);
        return;
      }
      if (kind === "whatsapp") {
        const data = await root.api(`/api/quotations/${encodeURIComponent(id)}`);
        const text = Q().whatsAppText(data.quote, data.shopName || root.state?.company?.name);
        const url = root.POSInvoiceShare?.whatsappShareUrl
          ? root.POSInvoiceShare.whatsappShareUrl(data.quote.customer_phone, text)
          : `https://wa.me/?text=${encodeURIComponent(text)}`;
        const w = window.open(url, "_blank", "noopener");
        if (!w) throw new Error("Allow pop-ups to share on WhatsApp");
        await root.api(`/api/quotations/${encodeURIComponent(id)}/share`, { method: "POST", body: JSON.stringify({ channel: "whatsapp" }) });
        hint("WhatsApp opened. The quotation was not marked accepted.", "ok");
        await openQuote(id);
        return;
      }
      if (kind === "status") {
        const note = $("quote-status-note")?.value || "";
        await root.api(`/api/quotations/${encodeURIComponent(id)}/status`, { method: "POST", body: JSON.stringify({ status: action.dataset.status, note }) });
        hint("Quotation updated.", "ok");
        await load();
        await openQuote(id);
        return;
      }
      if (kind === "duplicate") {
        const data = await root.api(`/api/quotations/${encodeURIComponent(id)}/duplicate`, { method: "POST", body: "{}" });
        hint(`${data.quote?.quotation_number || "Quotation"} duplicated as a draft.`, "ok");
        paintForm(data.quote);
        return;
      }
      if (kind === "convert") {
        if (!window.confirm("Create one unpaid sales invoice from this accepted quotation? Stock and the customer balance change only when that invoice is posted.")) return;
        const data = await root.api(`/api/quotations/${encodeURIComponent(id)}/convert`, { method: "POST", body: "{}" });
        hint(data.replay ? `Already converted to ${data.orderNumber}.` : `Invoice ${data.orderNumber} created. It stays unpaid until you record a payment.`, "ok");
        await load();
        await openQuote(id);
        return;
      }
      if (kind === "invoice") {
        const search = $("orders-search");
        if (search) search.value = action.dataset.order || "";
        if (typeof root.showView === "function") root.showView("orders");
      }
    } catch (err) {
      hint(err.message || "Could not update the quotation", "bad");
    }
  }

  async function onSubmit(event) {
    if (event.target.id === "quote-filters") {
      event.preventDefault();
      await load();
      return;
    }
    if (event.target.id === "quote-form") {
      event.preventDefault();
      await saveQuote("draft");
      return;
    }
    if (event.target.id === "quote-settings-form") {
      event.preventDefault();
      if (!canSettings()) return;
      try {
        const data = await root.api("/api/quotations/settings", {
          method: "POST",
          body: JSON.stringify({
            enabled: $("quote-enabled")?.checked ? 1 : 0,
            valid_days: $("quote-valid-days")?.value || 15,
            terms: $("quote-default-terms")?.value || "",
          }),
        });
        if (root.state?.company && (data.quotations_enabled === 0 || data.quotations_enabled === 1)) {
          root.state.company.quotations_enabled = data.quotations_enabled;
          root.state.company.quotation_valid_days = data.valid_days;
          root.state.company.quotation_terms = data.terms;
          if (typeof root.applyNav === "function") root.applyNav();
        }
        hint("Quotation settings saved.", "ok");
        await load();
        showTab("settings");
      } catch (err) {
        hint(err.message || "Could not save quotation settings", "bad");
      }
    }
  }

  function onInput(event) {
    if (event.target.closest("#quote-form")) paintTotals();
  }

  function onChange(event) {
    if (event.target.id === "quote-customer") {
      fillCustomerFields();
      paintTotals();
      return;
    }
    const row = event.target.closest("[data-quote-line]");
    if (row && event.target.matches("[data-f='item']")) {
      applyItem(row);
      paintTotals();
    }
  }

  function bind() {
    const page = $("view-quotations");
    if (!page || bound) return;
    bound = true;
    page.addEventListener("click", (event) => { void onClick(event); });
    page.addEventListener("submit", (event) => { void onSubmit(event); });
    page.addEventListener("input", onInput);
    page.addEventListener("change", onChange);
  }

  root.POSQuotationsUi = { load, paintForm };
})(typeof globalThis !== "undefined" ? globalThis : window);
