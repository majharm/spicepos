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
                `<button type="button" class="dash-tile hub-report-tile" data-hub-report="${escapeHtml(r.id)}"><strong>${escapeHtml(r.title)}</strong><span>${r.kinds ? "This business type" : "All businesses"}</span></button>`,
            )
            .join("")}</div>
        </section>`;
      })
      .join("") || `<p class="hint">No reports match.</p>`;
  }

  function paintModuleDesk(viewId, group) {
    const H = hub();
    const el = $(viewId);
    if (!H || !el) return;
    const mods = H.modulesFor(biz()).filter((m) => m.group === group);
    el.innerHTML = `<div class="hub-tile-grid">${mods
      .map(
        (m) =>
          `<button type="button" class="dash-tile" data-hub-open="${escapeHtml(m.id)}"><strong>${escapeHtml(m.title)}</strong><span>${escapeHtml(m.desk ? "Document desk" : "Open")}</span></button>`,
      )
      .join("")}</div>`;
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
    const H = hub();
    const m = H?.MODULES.find((x) => x.id === id);
    if (!m) return;
    if (m.report) return openReport(m.report);
    if (typeof root.showView === "function") root.showView(m.view);
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
    const mod = e.target.closest("[data-hub-open]");
    if (mod) openModule(mod.dataset.hubOpen);
  });
  document.addEventListener("input", (e) => {
    if (e.target?.id === "rep-center-search") paintReportsCenter();
  });
  document.addEventListener("change", (e) => {
    if (e.target?.id === "rep-center-cat") paintReportsCenter();
  });

  root.POSBizHubUi = {
    paintDashboard,
    paintReportsCenter,
    paintModuleDesk,
    paintPaymentsDesk,
    paintIndustryNav,
    openReport,
    openModule,
    loadAudit,
  };
})(typeof window !== "undefined" ? window : globalThis);
