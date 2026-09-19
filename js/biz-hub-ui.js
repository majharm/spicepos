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
        const h = Math.max(6, Math.round((v / max) * 88));
        const label = String(rows[i].day || rows[i].label || "").slice(5);
        return `<span class="hub-bar" title="${escapeHtml(label)} · ${escapeHtml(money(v))}" style="height:${h}px"><em>${escapeHtml(label)}</em></span>`;
      })
      .join("")}</div>`;
  }

  function inr(n) {
    return `₹ ${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
  }

  function pctDelta(now, prev) {
    const a = Number(now) || 0;
    const b = Number(prev) || 0;
    if (!(b > 0)) return a > 0 ? "100%" : "0%";
    return `${Math.round(((a - b) / b) * 100)}%`;
  }

  function payLabel(method) {
    const m = String(method || "other").toLowerCase();
    if (m === "upi") return "Upi";
    if (m === "card") return "Credit card";
    if (m === "credit") return "Credit";
    if (m === "cash") return "Cash";
    if (m === "wallet") return "Wallet";
    if (m === "bank-transfer") return "Bank";
    return m.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const CHART_COLORS = ["#2563eb", "#7c3aed", "#22c55e", "#f97316", "#ec4899", "#06b6d4", "#eab308", "#64748b"];

  function donutHtml(rows, title) {
    const list = (rows || []).map((r) => ({
      name: payLabel(r.method || r.name),
      amount: Number(r.amount) || 0,
    })).filter((r) => r.amount > 0);
    const total = list.reduce((s, r) => s + r.amount, 0);
    if (!total) return `<h3>${escapeHtml(title)}</h3><p class="hint">No sales yet today.</p>`;
    let acc = 0;
    const stops = list.map((r, i) => {
      const start = (acc / total) * 360;
      acc += r.amount;
      const end = (acc / total) * 360;
      return `${CHART_COLORS[i % CHART_COLORS.length]} ${start}deg ${end}deg`;
    });
    const top = list[0];
    const topPct = Math.round((top.amount / total) * 100);
    return `<h3>${escapeHtml(title)}</h3>
      <div class="an-donut-wrap">
        <div class="an-donut" style="background: conic-gradient(${stops.join(", ")})"><span>${topPct}%</span></div>
        <ul class="an-legend">${list
          .map(
            (r, i) =>
              `<li><i style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></i>${escapeHtml(r.name)}</li>`,
          )
          .join("")}</ul>
      </div>`;
  }

  function ico(d) {
    return `<span class="an-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${d}"/></svg></span>`;
  }

  function bubblesHtml(rows) {
    const list = (rows || []).map((r) => ({ name: r.name || "Other", amount: Number(r.amount) || 0 })).filter((r) => r.amount > 0);
    const total = list.reduce((s, r) => s + r.amount, 0);
    if (!total) return `<h3>Category</h3><p class="hint">No category sales today.</p>`;
    const sized = list.slice(0, 6).map((r, i) => {
      const pct = Math.round((r.amount / total) * 100);
      const px = Math.max(72, Math.min(150, 56 + pct * 2.2));
      return `<span class="an-bubble" style="width:${px}px;height:${px}px;background:${CHART_COLORS[i % CHART_COLORS.length]}"><b>${pct}%</b><em>${escapeHtml(r.name)}</em></span>`;
    });
    return `<h3>Category</h3>
      <div class="an-cat-split">
        <div class="an-bubbles">${sized.join("")}</div>
        <ul class="an-legend">${list
          .slice(0, 8)
          .map(
            (r, i) =>
              `<li><i style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></i>${escapeHtml(r.name)} · ${inr(r.amount)}</li>`,
          )
          .join("")}</ul>
      </div>`;
  }

  function monthBarsHtml(rows) {
    const map = new Map((rows || []).map((r) => [String(r.month || "").slice(0, 7), Number(r.sales) || 0]));
    const now = new Date();
    const months = [];
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: d.toLocaleString("en-IN", { month: "short" }), sales: map.get(key) || 0 });
    }
    const max = Math.max(1, ...months.map((m) => m.sales));
    return `<header class="an-card-head"><h3>12-Month</h3></header>
      <div class="an-month-bars">${months
        .map((m) => {
          const h = Math.max(8, Math.round((m.sales / max) * 140));
          return `<span class="an-mbar" title="${escapeHtml(m.key)} · ${escapeHtml(inr(m.sales))}"><i style="height:${h}px"></i><em>${escapeHtml(m.label)}</em></span>`;
        })
        .join("")}</div>`;
  }

  function brandBarsHtml(rows) {
    const list = (rows || []).slice(0, 8);
    if (!list.length) return `<h3>Brand</h3><p class="hint">No sales yet today.</p>`;
    const max = Math.max(1, ...list.map((r) => Number(r.amount) || 0));
    return `<h3>Brand</h3><div class="an-brand-bars">${list
      .map((r, i) => {
        const amt = Number(r.amount) || 0;
        const w = Math.max(8, Math.round((amt / max) * 100));
        return `<div class="an-brand-row"><span>${escapeHtml(r.name)}</span><div class="an-brand-track"><i style="width:${w}%;background:${CHART_COLORS[i % CHART_COLORS.length]}"></i></div><strong>${inr(amt)}</strong></div>`;
      })
      .join("")}</div>`;
  }

  function paintDashboard(d) {
    const H = hub();
    if (!H || !$("dash-kpis")) return;
    const h = d.hub || {};
    const today = Number(d.today?.takings) || 0;
    const yest = Number(h.yesterdaySales) || 0;
    const profit = Number(h.grossProfit) || 0;
    const profitPct = today > 0 ? Math.round((profit / today) * 100) : 0;
    const cash = Number(h.todayCash) || 0;
    const nonCash = Math.max(0, today - cash);
    const month = Number(h.monthSales) || 0;
    const prevM = Number(h.prevMonthSales) || 0;
    const mCash = Number(h.monthCash) || 0;
    const mNon = Math.max(0, month - mCash);
    const tPurch = Number(d.purchase) || 0;
    const mPurch = Number(h.monthPurchase) || 0;
    const stock = Number(d.stockValue) || 0;
    const cart = "M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 20 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z";
    const bag = "M16 6V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H2v13c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6h-6zm-6-2h4v2h-4V4z";
    const card = "M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z";
    const screen = "M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v2H8v2h8v-2h-2v-2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z";
    const truck = "M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z";
    const cal = "M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z";
    const box = "M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z";
    $("dash-kpis").innerHTML = `
      <button type="button" class="an-kpi an-sales" data-dash-view="orders"><span class="an-pct">${escapeHtml(pctDelta(today, yest))}</span>${ico(cart)}<strong>${escapeHtml(inr(today))}</strong><em>Today Sales</em></button>
      <button type="button" class="an-kpi an-profit" data-dash-view="reports">${ico(bag)}<span class="an-split"><b>${profitPct}%</b><small>Profit (%)</small></span><span class="an-split"><b>${escapeHtml(inr(profit))}</b><small>Profit Amount</small></span></button>
      <button type="button" class="an-kpi an-cash" data-dash-view="payments">${ico(card)}<span class="an-split"><b>${escapeHtml(inr(cash))}</b><small>Cash</small></span><span class="an-split"><b>${escapeHtml(inr(nonCash))}</b><small>Non Cash</small></span></button>
      <button type="button" class="an-kpi an-msales" data-dash-view="orders"><span class="an-pct">${escapeHtml(pctDelta(month, prevM))}</span>${ico(screen)}<strong>${escapeHtml(inr(month))}</strong><em>Monthly Sales</em></button>
      <button type="button" class="an-kpi an-mcash" data-dash-view="payments">${ico(card)}<span class="an-split"><b>${escapeHtml(inr(mCash))}</b><small>Cash</small></span><span class="an-split"><b>${escapeHtml(inr(mNon))}</b><small>Non Cash</small></span></button>
      <button type="button" class="an-kpi an-tpurch" data-dash-view="purchases">${ico(truck)}<strong>${escapeHtml(inr(tPurch))}</strong><em>Today Purchase</em></button>
      <button type="button" class="an-kpi an-mpurch" data-dash-view="purchases">${ico(cal)}<strong>${escapeHtml(inr(mPurch))}</strong><em>Monthly Purchase</em></button>
      <div class="an-card an-paymode" id="dash-pay-graph">${donutHtml(h.payModes, "Today Sales Paymode wise")}</div>
      <div class="an-card an-category" id="dash-category">${bubblesHtml(h.categories)}</div>
      <button type="button" class="an-kpi an-stock" data-dash-view="stock">${ico(box)}<strong>${escapeHtml(inr(stock))}</strong><em>Stock Value</em></button>
      <div class="an-card an-month" id="dash-sales-graph">${monthBarsHtml(h.monthGraph)}</div>
      <div class="an-card an-brand" id="dash-top-items">${brandBarsHtml(h.topItems)}</div>`;
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
    if (String(id || "").startsWith("salon-")) {
      if (typeof root.showView === "function") root.showView("salon-board");
      setTimeout(() => root.POSSalonUi?.loadSalonReport?.(id), 200);
      return;
    }
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
