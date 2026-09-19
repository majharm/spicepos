(function (root) {
  const $ = (id) => document.getElementById(id);
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function money(n) {
    if (typeof root.money === "function") return root.money(n);
    const v = Number(n) || 0;
    return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function hub() {
    return root.POSBizHub;
  }
  function biz() {
    return root.state?.businessMeta || root.state?.company || {};
  }

  function spark(rows, key) {
    const vals = (rows || []).map((r) => Number(r[key]) || 0);
    const max = Math.max(1, ...vals);
    if (!vals.length) return `<p class="hint">No data in the last 14 days.</p>`;
    return `<div class="hub-spark">${vals
      .map((v, i) => {
        const h = Math.max(4, Math.round((v / max) * 72));
        const label = String(rows[i].day || rows[i].label || "").slice(5);
        return `<span class="hub-bar" title="${escapeHtml(label)} · ${escapeHtml(String(v))}" style="height:${h}px"></span>`;
      })
      .join("")}</div>`;
  }

  function paintDashboard(d) {
    const H = hub();
    if (!H || !$("dash-kpis")) return;
    const h = d.hub || {};
    const map = {
      todaySales: d.today?.takings,
      todayPurchases: d.purchase,
      todayReceipts: h.todayReceipts,
      todayPayments: h.todayPayments,
      receivable: d.outstanding,
      payable: h.payable,
      cashBalance: h.cashBalance,
      bankBalance: h.bankBalance,
      grossProfit: h.grossProfit,
      netProfit: h.netProfit,
      expenses: h.expenses,
      stockValue: d.stockValue,
      lowStock: h.lowStock,
      outstandingCustomers: h.outstandingCustomers,
      outstandingSuppliers: h.outstandingSuppliers,
    };
    $("dash-kpis").innerHTML = H.DASH_KPIS.map((k) => {
      const raw = map[k.key];
      const val = k.money ? money(raw) : raw == null ? "—" : String(raw);
      return `<button type="button" class="report-card dash-kpi" data-dash-view="${escapeHtml(k.view)}"><span>${escapeHtml(k.label)}</span><strong>${escapeHtml(val)}</strong></button>`;
    }).join("");
    if ($("dash-sales-graph")) $("dash-sales-graph").innerHTML = spark(h.salesGraph, "sales");
    if ($("dash-pay-graph")) $("dash-pay-graph").innerHTML = spark(h.payGraph, "collected");
    if ($("dash-top-items")) {
      const rows = h.topItems || [];
      $("dash-top-items").innerHTML = rows.length
        ? `<table><thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody>${rows
            .map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${money(r.amount)}</td></tr>`)
            .join("")}</tbody></table>`
        : `<p class="hint">No sales yet today.</p>`;
    }
    if ($("dash-recent")) {
      const rows = h.recent || [];
      $("dash-recent").innerHTML = rows.length
        ? `<table><thead><tr><th>Bill</th><th>Customer</th><th>Total</th><th>Pay</th></tr></thead><tbody>${rows
            .map(
              (r) =>
                `<tr><td>${escapeHtml(r.order_number)}</td><td>${escapeHtml(r.customer_name || "Walk-in")}</td><td>${money(r.total)}</td><td>${escapeHtml(r.payment_method || "")}</td></tr>`,
            )
            .join("")}</tbody></table>`
        : `<p class="hint">No recent bills.</p>`;
    }
  }

  function paintReportsCenter() {
    const H = hub();
    const el = $("reports-center");
    if (!H || !el) return;
    const q = String($("rep-center-search")?.value || "").trim().toLowerCase();
    const on = String($("rep-center-cat")?.value || "");
    const groups = H.reportsByCenter(biz());
    el.innerHTML = groups
      .filter((g) => !on || g.id === on)
      .map((g) => {
        const rows = g.reports.filter((r) => !q || r.title.toLowerCase().includes(q) || r.id.includes(q));
        if (!rows.length) return "";
        return `<section class="hub-center-group" data-center="${escapeHtml(g.id)}">
          <h4>${escapeHtml(g.title)}</h4>
          <div class="hub-tile-grid">${rows
            .map(
              (r) =>
                `<button type="button" class="dash-tile hub-report-tile" data-hub-report="${escapeHtml(r.id)}"><strong>${escapeHtml(r.title)}</strong><span>${r.kinds ? "This business type" : "Every shop"}</span></button>`,
            )
            .join("")}</div>
        </section>`;
      })
      .join("") || `<p class="hint">No reports match.</p>`;
  }

  let purchaseDeskKind = "";

  const PURCHASE_FALLBACK = [
    { id: "purchase-request", title: "Purchase Request", desk: "pr", blurb: "Ask for stock before you order" },
    { id: "purchase-order", title: "Purchase Order", desk: "po", blurb: "Confirm what to buy from a supplier" },
    { id: "grn", title: "Goods Receipt", desk: "grn", blurb: "Record goods received at the shop" },
    { id: "purchase-invoice", title: "Purchase Invoice", view: "purchases", open: "purchase-new", blurb: "Supplier bill — this posts stock" },
    { id: "debit-note", title: "Debit Note", desk: "debit", blurb: "Claim against a supplier bill" },
    { id: "purchase-return", title: "Purchase Return", desk: "preturn", blurb: "Send goods back to the supplier" },
    { id: "supplier-pay", title: "Supplier Payment", view: "payments", highlight: "supplier-pay", blurb: "Pay a supplier from payables" },
    { id: "supplier-due", title: "Supplier Due", view: "accounts", acc: "payables", blurb: "What we still owe suppliers" },
    { id: "supplier-ledger", title: "Supplier Ledger", view: "accounts", acc: "supplier-ledger", blurb: "Supplier account history" },
  ];

  function purchaseModules() {
    const H = hub();
    if (H?.modulesFor) return H.modulesFor(biz()).filter((m) => m.group === "purchases");
    return PURCHASE_FALLBACK;
  }

  function findModule(id) {
    const H = hub();
    return H?.MODULES?.find((x) => x.id === id) || PURCHASE_FALLBACK.find((x) => x.id === id);
  }

  function docMeta(kind) {
    return hub()?.PURCHASE_DOC_KINDS?.[kind] || {
      title: kind,
      prefix: String(kind || "DOC").toUpperCase(),
      save: "Save",
      hint: "",
      statuses: ["Draft"],
    };
  }

  function bizKey() {
    const s = root.state?.session || {};
    return String(s.business_id || s.businessId || root.state?.company?.id || "local");
  }

  function docsStore() {
    const key = `pos-purchase-docs:${bizKey()}`;
    let all = {};
    try {
      all = JSON.parse(root.localStorage?.getItem(key) || "{}") || {};
    } catch {
      all = {};
    }
    return {
      key,
      all,
      list(kind) {
        return Array.isArray(all[kind]) ? all[kind] : [];
      },
      save(kind, rows) {
        all[kind] = rows;
        try {
          root.localStorage?.setItem(key, JSON.stringify(all));
        } catch {
          /* ignore quota */
        }
      },
    };
  }

  function nextDocNumber(kind, rows) {
    const prefix = docMeta(kind).prefix;
    let max = 0;
    rows.forEach((r) => {
      const m = String(r.number || "").match(/(\d+)\s*$/);
      if (m) max = Math.max(max, Number(m[1]) || 0);
    });
    return `${prefix}-${String(max + 1).padStart(4, "0")}`;
  }

  function todayYmd() {
    if (typeof root.ymd === "function") return root.ymd();
    return new Date().toISOString().slice(0, 10);
  }

  function tileHtml(m) {
    const kind = m.desk ? "Document desk" : "Open";
    const on = m.desk && m.desk === purchaseDeskKind ? " is-active" : "";
    return `<button type="button" class="dash-tile hub-mod-tile${on}" data-hub-open="${escapeHtml(m.id)}">
      <em class="hub-mod-kind">${escapeHtml(kind)}</em>
      <strong>${escapeHtml(m.title)}</strong>
      <span>${escapeHtml(m.blurb || kind)}</span>
    </button>`;
  }

  function paintModuleDesk(viewId, group) {
    const el = $(viewId);
    if (!el) return;
    const H = hub();
    const mods = H?.modulesFor
      ? H.modulesFor(biz()).filter((m) => m.group === group)
      : group === "purchases"
        ? PURCHASE_FALLBACK
        : [];
    const q = String($("hub-purchases-search")?.value || "").trim().toLowerCase();
    const filtered =
      viewId === "hub-purchases-tiles" && q
        ? mods.filter(
            (m) =>
              m.title.toLowerCase().includes(q) ||
              m.id.includes(q) ||
              String(m.blurb || "").toLowerCase().includes(q) ||
              (m.desk ? "document desk" : "open").includes(q),
          )
        : mods;
    el.innerHTML = `<div class="hub-tile-grid">${filtered.map((m) => tileHtml(m)).join("")}</div>`;
    if (viewId === "hub-purchases-tiles") paintPurchaseStats(mods);
  }

  function paintPurchaseStats(mods) {
    const el = $("hub-purchases-stats");
    if (!el) return;
    const store = docsStore();
    const deskMods = (mods || purchaseModules()).filter((m) => m.desk);
    const n = deskMods.reduce((sum, m) => sum + store.list(m.desk).length, 0);
    el.innerHTML = `<div class="items-stat"><span>Documents</span><strong>${n}</strong></div>
      <div class="items-stat"><span>Types</span><strong>9</strong></div>`;
  }

  function supplierNames() {
    return (root.state?.suppliers || []).map((s) => s.name).filter(Boolean);
  }

  function paintPurchaseWork(kind) {
    const wrap = $("hub-purchases-work");
    if (!wrap) return;
    purchaseDeskKind = kind || "";
    if (!kind) {
      wrap.hidden = true;
      wrap.innerHTML = "";
      paintModuleDesk("hub-purchases-tiles", "purchases");
      return;
    }
    const meta = docMeta(kind);
    const store = docsStore();
    const rows = store.list(kind).slice().reverse();
    const names = supplierNames();
    wrap.hidden = false;
    wrap.innerHTML = `
      <div class="purchase-doc-head">
        <div>
          <p class="items-kicker">${escapeHtml(meta.prefix)}</p>
          <h3>${escapeHtml(meta.title)}</h3>
          <p class="lede">${escapeHtml(meta.hint)}</p>
        </div>
        <button type="button" class="btn" data-purchase-close>Back to all types</button>
      </div>
      <div class="purchase-doc-split">
        <form class="settings item-composer" id="purchase-doc-form" autocomplete="off">
          <p class="item-mode">New ${escapeHtml(meta.title.toLowerCase())}</p>
          <label>Number <input name="number" required maxlength="40" value="${escapeHtml(nextDocNumber(kind, store.list(kind)))}" /></label>
          <label>Date <input name="date" type="date" required value="${escapeHtml(todayYmd())}" /></label>
          <label>Supplier
            <input name="supplier" list="purchase-doc-suppliers" maxlength="180" placeholder="Supplier name" />
          </label>
          <datalist id="purchase-doc-suppliers">${names.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("")}</datalist>
          <label>Amount ₹ <input name="amount" type="number" min="0" step="0.01" value="0" /></label>
          <label>Status
            <select name="status">${meta.statuses.map((s) => `<option>${escapeHtml(s)}</option>`).join("")}</select>
          </label>
          <label class="full">Notes <textarea name="notes" rows="2" maxlength="400" placeholder="Items, qty, or reason"></textarea></label>
          <div class="purchase-doc-actions">
            <button class="btn primary" type="submit">${escapeHtml(meta.save)}</button>
            ${kind === "pr" ? `<button class="btn" type="button" data-doc-convert="po">Save as purchase order</button>` : ""}
            ${kind === "po" ? `<button class="btn" type="button" data-doc-convert="grn">Save as goods receipt</button>` : ""}
            <button class="btn" type="button" data-hub-open="purchase-invoice">Purchase Invoice</button>
          </div>
        </form>
        <div class="items-library">
          <div class="items-library-head">
            <h4>Saved ${escapeHtml(meta.title.toLowerCase())}s</h4>
            <span class="hint">${rows.length} on this shop</span>
          </div>
          ${
            rows.length
              ? `<div class="table-wrap"><table><thead><tr><th>No.</th><th>Date</th><th>Supplier</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>${rows
                  .map(
                    (r) => `<tr>
                    <td>${escapeHtml(r.number)}</td>
                    <td>${escapeHtml(r.date || "")}</td>
                    <td>${escapeHtml(r.supplier || "—")}</td>
                    <td>${money(r.amount)}</td>
                    <td>${escapeHtml(r.status || "")}</td>
                    <td><button class="btn" type="button" data-doc-del="${escapeHtml(r.id)}">Remove</button></td>
                  </tr>`,
                  )
                  .join("")}</tbody></table></div>`
              : `<p class="hint">None yet. Save the first ${escapeHtml(meta.title.toLowerCase())} on the left.</p>`
          }
        </div>
      </div>`;
    paintModuleDesk("hub-purchases-tiles", "purchases");
    wrap.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function readDocForm() {
    const form = $("purchase-doc-form");
    if (!form) return null;
    const fd = new FormData(form);
    return {
      id: `d${Date.now()}`,
      number: String(fd.get("number") || "").trim(),
      date: String(fd.get("date") || todayYmd()),
      supplier: String(fd.get("supplier") || "").trim(),
      amount: Number(fd.get("amount")) || 0,
      status: String(fd.get("status") || "Draft"),
      notes: String(fd.get("notes") || "").trim(),
    };
  }

  function saveDoc(kind, extra = {}) {
    const row = readDocForm();
    if (!row || !row.number) return;
    const store = docsStore();
    const rows = store.list(kind);
    store.save(kind, rows.concat([{ ...row, ...extra, kind }]));
    paintPurchaseWork(kind);
  }

  function paintPaymentsDesk() {
    const H = hub();
    const modes = $("pay-modes-list");
    if (H && modes) {
      modes.innerHTML = H.PAY_MODES.map((m) => `<span class="hub-chip">${escapeHtml(m.replace(/-/g, " "))}</span>`).join("");
    }
    paintModuleDesk("payments-report-tiles", "payments");
    const extra = $("payments-report-tiles");
    if (extra && H) {
      const reps = H.reportsFor(biz()).filter((r) => r.center === "payments");
      extra.innerHTML = `<div class="hub-tile-grid">${reps
        .map(
          (r) =>
            `<button type="button" class="dash-tile" data-hub-report="${escapeHtml(r.id)}"><strong>${escapeHtml(r.title)}</strong><span>Open report</span></button>`,
        )
        .join("")}</div>`;
    }
  }

  function paintIndustryNav() {
    const kind = hub()?.shopKind(biz()) || "general";
    document.querySelectorAll("[data-hub-kind]").forEach((el) => {
      const kinds = String(el.dataset.hubKind || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      el.hidden = kinds.length ? !kinds.includes(kind) : false;
    });
    const group = $("nav-industry-group");
    if (group) {
      const any = [...group.querySelectorAll(".nav-btn")].some((b) => !b.hidden);
      group.hidden = !any;
    }
    const label = $("nav-industry-label");
    if (label) {
      const names = {
        pharmacy: "Pharmacy",
        apparel: "Garment",
        footwear: "Footwear",
        restaurant: "Restaurant",
        grocery: "Grocery",
        spice: "Grocery",
        electronics: "Electronics",
        services: "Services",
      };
      label.textContent = names[kind] || "Business type";
    }
  }

  function openReport(id) {
    const H = hub();
    const r = H?.REPORTS.find((x) => x.id === id);
    if (!r) return;
    if (r.view && typeof root.showView === "function") {
      root.showView(r.view);
      if (r.acc && typeof root.setAccountsTab === "function") {
        setTimeout(() => root.setAccountsTab(r.acc), 0);
      }
      return;
    }
    if (typeof root.showView === "function") root.showView("reports");
    if (r.tab && typeof root.setReportTab === "function") {
      setTimeout(() => {
        root.setReportTab(r.tab);
        const sheet = String(r.sheet || "").toLowerCase();
        if (!sheet) return;
        document.querySelectorAll("#reports .report-block").forEach((block) => {
          const title = String(block.dataset.reportTitle || block.dataset.reportSheet || "").toLowerCase();
          if (title === sheet || title.includes(sheet)) {
            block.scrollIntoView({ block: "start", behavior: "smooth" });
          }
        });
      }, 250);
    }
  }

  function openModule(id) {
    const m = findModule(id);
    if (!m) return;
    if (m.report) return openReport(m.report);
    if (m.desk) {
      if (typeof root.showView === "function") root.showView("hub-purchases");
      paintPurchaseWork(m.desk);
      return;
    }
    if (typeof root.showView === "function") root.showView(m.view || "hub-purchases");
    if (m.open === "purchase-new") {
      const details = $("purchase-new");
      if (details) details.open = true;
    }
    if (m.highlight === "supplier-pay") {
      setTimeout(() => {
        const tile = document.querySelector('#view-payments [data-view-jump="accounts"]');
        tile?.classList.add("is-active");
        tile?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 50);
    }
    if (m.acc && typeof root.setAccountsTab === "function") {
      setTimeout(() => root.setAccountsTab(m.acc), 0);
    }
    if (m.query === "cancelled") {
      const sel = $("order-status-filter");
      if (sel) {
        sel.value = "cancelled";
        sel.dispatchEvent(new Event("change"));
      }
    }
  }

  async function loadAudit() {
    const el = $("audit-table");
    if (!el) return;
    el.innerHTML = `<p class="hint">Loading…</p>`;
    try {
      const api = root.api;
      const rows = await api("/api/audit");
      const list = Array.isArray(rows) ? rows : rows.logs || [];
      if (!list.length) {
        el.innerHTML = `<p class="hint">No activity yet for this shop.</p>`;
        return;
      }
      el.innerHTML = `<div class="table-wrap"><table><thead><tr>
        <th>When</th><th>Actor</th><th>Action</th><th>Module</th><th>Target</th><th>Details</th>
      </tr></thead><tbody>${list
        .map((r) => {
          let details = r.details;
          try {
            const obj = typeof details === "string" ? JSON.parse(details) : details;
            details = obj && typeof obj === "object" ? JSON.stringify(obj) : details;
          } catch {
            /* keep */
          }
          return `<tr>
            <td>${escapeHtml(r.created_at || "")}</td>
            <td>${escapeHtml(r.actor_name || "")}</td>
            <td>${escapeHtml(r.action || "")}</td>
            <td>${escapeHtml(r.module || "")}</td>
            <td>${escapeHtml(r.target_name || r.target_id || "")}</td>
            <td class="audit-details">${escapeHtml(String(details || "").slice(0, 240))}</td>
          </tr>`;
        })
        .join("")}</tbody></table></div>`;
    } catch (err) {
      el.innerHTML = `<p class="hint error">${escapeHtml(err.message || "Could not load audit log")}</p>`;
    }
  }

  document.addEventListener("click", (e) => {
    const report = e.target.closest("[data-hub-report]");
    if (report) {
      openReport(report.dataset.hubReport);
      return;
    }
    if (e.target.closest("[data-purchase-close]")) {
      paintPurchaseWork("");
      return;
    }
    const convert = e.target.closest("[data-doc-convert]");
    if (convert && purchaseDeskKind) {
      e.preventDefault();
      const row = readDocForm();
      if (row?.number) {
        const store = docsStore();
        store.save(purchaseDeskKind, store.list(purchaseDeskKind).concat([{ ...row, kind: purchaseDeskKind }]));
        const to = convert.dataset.docConvert;
        const meta = docMeta(to);
        store.save(
          to,
          store.list(to).concat([
            { ...row, id: `d${Date.now()}`, kind: to, number: nextDocNumber(to, store.list(to)), status: meta.statuses[0] },
          ]),
        );
        paintPurchaseWork(to);
      }
      return;
    }
    const del = e.target.closest("[data-doc-del]");
    if (del && purchaseDeskKind) {
      const store = docsStore();
      store.save(
        purchaseDeskKind,
        store.list(purchaseDeskKind).filter((r) => r.id !== del.dataset.docDel),
      );
      paintPurchaseWork(purchaseDeskKind);
      return;
    }
    const mod = e.target.closest("[data-hub-open]");
    if (mod) openModule(mod.dataset.hubOpen);
  });
  document.addEventListener("submit", (e) => {
    if (e.target?.id !== "purchase-doc-form") return;
    e.preventDefault();
    if (purchaseDeskKind) saveDoc(purchaseDeskKind);
  });
  document.addEventListener("input", (e) => {
    if (e.target?.id === "rep-center-search") paintReportsCenter();
    if (e.target?.id === "hub-purchases-search") paintModuleDesk("hub-purchases-tiles", "purchases");
  });
  document.addEventListener("change", (e) => {
    if (e.target?.id === "rep-center-cat") paintReportsCenter();
  });

  root.POSBizHubUi = {
    paintDashboard,
    paintReportsCenter,
    paintModuleDesk,
    paintPurchaseWork,
    paintPaymentsDesk,
    paintIndustryNav,
    openReport,
    openModule,
    loadAudit,
  };
})(typeof window !== "undefined" ? window : globalThis);
