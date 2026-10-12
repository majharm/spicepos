(function (root) {
  const PHONE_MQ = "(max-width: 720px)";
  const PLANE = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6.6 22.7 41.2 8c1.3-.5 2.6.8 2.1 2.1L29 41.8c-.6 1.5-2.7 1.4-3.1-.2l-4.5-16.3L6.7 25.7c-1.5-.4-1.6-2.5-.1-3z" fill="#12b8a6"/><path d="M21.2 25.3 41.4 9.5" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>`;

  function $(id) {
    return typeof document === "undefined" ? null : document.getElementById(id);
  }
  function isPhone() {
    return typeof window !== "undefined" && window.matchMedia?.(PHONE_MQ).matches;
  }
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function formatMoney(n) {
    if (typeof root.money === "function") return root.money(n);
    const v = Number(n) || 0;
    return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }
  function formatCount(n) {
    return String(Math.max(0, Math.round(Number(n) || 0)));
  }
  function formatDate(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    const d = new Date(s.includes("T") || s.includes(" ") ? s : `${s}T00:00:00`);
    if (Number.isNaN(d.getTime())) return s.slice(0, 10);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  function isExpense(row) {
    return /expens|purchase/i.test(String(row?.type || row?.kind || ""));
  }
  function isPaid(row) {
    if (isExpense(row)) return true;
    const due = Number(row?.balance ?? row?.due ?? row?.outstanding);
    if (Number.isFinite(due) && due > 0) return false;
    const s = String(row?.payment_status || row?.status || "").toLowerCase();
    if (/unpaid|due|pending|partial|credit/.test(s)) return false;
    if (/paid|settled|completed|cash|upi/.test(s)) return true;
    return due === 0;
  }
  function txStatus(row) {
    if (isExpense(row)) return { label: "Paid", cls: "is-paid" };
    const due = Number(row?.balance ?? row?.due ?? row?.outstanding);
    const s = String(row?.payment_status || row?.status || "").toLowerCase();
    if ((Number.isFinite(due) && due > 0) || /due|partial/.test(s)) return { label: "Due", cls: "is-due" };
    if (/unpaid|pending|credit/.test(s)) return { label: "Unpaid", cls: "is-unpaid" };
    if (isPaid(row)) return { label: "Paid", cls: "is-paid" };
    return { label: "Unpaid", cls: "is-unpaid" };
  }
  function summarizeDashboard(d) {
    const h = d?.hub || {};
    const today = d?.today || {};
    const sales = Array.isArray(h.recent) ? h.recent : [];
    const expenses = Array.isArray(h.recentExpenses) ? h.recentExpenses : [];
    const recent = [...sales, ...expenses].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return {
      shop: String(d?.shopName || d?.business?.name || "").trim(),
      logo: String(d?.company?.logo_url || d?.logo_url || "").trim(),
      totalBills: Number(today.bills ?? h.todayOrders) || 0,
      paid: Number(h.monthPaidOrders != null ? h.monthPaidOrders : h.todayOrders) || 0,
      pending: Number(h.monthPendingOrders != null ? h.monthPendingOrders : h.outstandingCustomers) || 0,
      pendingCount: Number(h.outstandingCustomers) || 0,
      expenses: Number(h.expenses) || 0,
      recent,
    };
  }
  function authPaneFromLocation(search, hash) {
    const q = new URLSearchParams(search || "");
    if (q.get("tab") === "signup" || hash === "#signup") return "signup";
    if (q.get("tab") === "signin" || hash === "#signin" || hash === "#auth-card") return "signin";
    return "welcome";
  }
  function demoDashboard() {
    return {
      shopName: "Rahatot Nursery",
      today: { bills: 35, takings: 30000 },
      outstanding: 5000,
      hub: {
        todayOrders: 35,
        monthPaidOrders: 30,
        monthPendingOrders: 5,
        expenses: 1200,
        recent: [
          { id: "s1", customer_name: "Karim Ahmed", order_number: "INV0678", total: 35000, status: "paid", payment_method: "UPI", created_at: "2026-06-25" },
          { id: "s2", customer_name: "Nasir Hussain", order_number: "INV0678", total: 35000, status: "unpaid", payment_method: "Credit", created_at: "2026-06-25" },
          { id: "s3", customer_name: "Kabir Ahmed", order_number: "INV0678", total: 35000, status: "due", payment_method: "Credit", created_at: "2026-06-25", due: 35000 },
        ],
        recentExpenses: [
          { id: "e1", customer_name: "Shop rent", order_number: "EXP12", total: 8000, kind: "expense", status: "paid", created_at: "2026-06-24" },
        ],
      },
    };
  }

  function setAuthPane(pane) {
    if (typeof document === "undefined") return pane;
    document.body.classList.toggle("m-auth-form", pane !== "welcome");
    document.body.classList.toggle("m-auth-signup", pane === "signup");
    if (pane === "signup") document.querySelector('[data-panel="signup"]')?.click();
    if (pane === "signin") document.querySelector('[data-panel="signin"]')?.click();
    return pane;
  }

  function bindLogin() {
    if (!$("login-form") || $("app")) return;
    const hello = $("m-login-hello");
    if (hello && !hello.querySelector(".m-mark")) {
      const mark = document.createElement("div");
      mark.className = "m-mark";
      mark.innerHTML = PLANE;
      hello.insertBefore(mark, hello.querySelector(".m-brand"));
    }
    $("m-go-signin")?.addEventListener("click", () => setAuthPane("signin"));
    $("m-go-signup")?.addEventListener("click", () => setAuthPane("signup"));
    $("m-foot-signup")?.addEventListener("click", () => setAuthPane("signup"));
    $("m-back-welcome")?.addEventListener("click", () => setAuthPane("welcome"));
    const start = authPaneFromLocation(location.search, location.hash);
    if (isPhone()) setAuthPane(start);
    else document.body.classList.add("m-auth-form");
  }

  function shopName(summary) {
    return (
      summary.shop ||
      $("shop-name")?.textContent?.trim() ||
      root.state?.businessMeta?.name ||
      root.state?.company?.name ||
      "ATAV POS"
    );
  }

  function paintLogo(summary) {
    const img = $("m-home-logo");
    const mark = $("m-home-mark");
    const src = summary.logo || $("shop-logo")?.getAttribute("src") || root.state?.company?.logo_url || "";
    if (img && src) {
      img.src = src;
      img.hidden = false;
      if (mark) mark.hidden = true;
    } else {
      if (img) img.hidden = true;
      if (mark) mark.hidden = false;
    }
  }

  function txHtml(row) {
    const st = txStatus(row);
    const name = escapeHtml(row.customer_name || (isExpense(row) ? "Expense" : "Walk-in"));
    const no = escapeHtml(row.order_number || (isExpense(row) ? "EXP" : "Sale"));
    const when = formatDate(row.created_at || row.date || row.expense_date);
    const kind = isExpense(row) ? "Expense" : /purchase/i.test(String(row.type || row.kind || "")) ? "Purchase" : "Sales";
    const view = isExpense(row) ? "expenses" : "orders";
    return `<li class="m-tx" data-m-open="${view}" data-m-id="${escapeHtml(row.id || "")}">
      <p class="m-tx-name">${name}</p>
      <span class="m-chip ${st.cls}">${st.label}</span>
      <p class="m-tx-meta">${kind} · #${no}${when ? ` · ${when}` : ""}</p>
      <div class="m-tx-amt"><strong>${escapeHtml(formatMoney(row.total))}</strong></div>
    </li>`;
  }

  function paintHome(d) {
    const home = $("m-home");
    if (!home) return null;
    if (d) root.__mLastDash = d;
    const s = summarizeDashboard(d || root.__mLastDash || {});
    const shop = $("m-home-shop");
    if (shop) shop.textContent = shopName(s);
    paintLogo(s);
    const total = $("m-kpi-total");
    const paid = $("m-kpi-paid");
    const pending = $("m-kpi-pending");
    if (total) total.textContent = formatCount(s.totalBills);
    if (paid) paid.textContent = formatCount(s.paid);
    if (pending) pending.textContent = formatCount(s.pending);
    const filter = home.dataset.recent || "all";
    const rows = s.recent.filter((r) => {
      if (filter === "expenses") return isExpense(r);
      if (filter === "income") return !isExpense(r) && isPaid(r);
      return !isExpense(r);
    });
    const list = $("m-recent-list");
    if (list) {
      list.innerHTML = rows.length
        ? rows.slice(0, 8).map(txHtml).join("")
        : `<li class="m-empty">${filter === "expenses" ? "No recent expenses." : "No recent bills."}</li>`;
    }
    return s;
  }

  function setPhoneSurface(name) {
    if (typeof document === "undefined" || !name) return;
    document.body.classList.toggle("analytics-home", name === "dashboard");
    document.body.classList.toggle("reports-home", name === "reports");
  }

  function shopBiz() {
    return root.state?.businessMeta || root.state?.business || {};
  }

  function demoReports() {
    return [
      { id: "daily-sales", center: "sales", title: "Daily Sales", tab: "sales", sheet: "Sales bills" },
      { id: "sales-by-customer", center: "sales", title: "Sales by Customer", tab: "sales", sheet: "Customer sales" },
      { id: "sales-by-pay", center: "sales", title: "Sales by Payment Mode", tab: "payment", sheet: "Payment" },
      { id: "low-stock", center: "inventory", title: "Low Stock", tab: "stock", sheet: "Low stock" },
      { id: "current-stock", center: "inventory", title: "Current Stock", tab: "stock", sheet: "Stock" },
      { id: "tax-summary", center: "tax", title: "Tax Summary", tab: "gst", sheet: "GST summary" },
      { id: "expense-report", center: "expenses", title: "Expense Report", tab: "books", sheet: "Expenses" },
      { id: "payment-received", center: "payments", title: "Payment Received", tab: "payment", sheet: "Payment" },
    ];
  }

  function reportCatalog() {
    const H = root.POSBizHub;
    if (H?.reportsFor) {
      const rows = H.reportsFor(shopBiz()) || [];
      if (rows.length) return rows;
    }
    return demoReports();
  }

  function reportCenters(rows) {
    const H = root.POSBizHub;
    const names = Object.fromEntries((H?.CENTERS || []).map((c) => [c.id, c.title]));
    const order = ["sales", "purchase", "inventory", "tax", "payments", "expenses", "accounting", "customers"];
    const seen = [];
    rows.forEach((r) => {
      if (r.center && !seen.includes(r.center)) seen.push(r.center);
    });
    seen.sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return seen.map((id) => ({
      id,
      title: names[id] || String(id || "").replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
  }

  function summaryFromDom() {
    const map = {};
    document.querySelectorAll("#report-summary .report-card").forEach((el) => {
      const k = String(el.querySelector("span")?.textContent || "").trim();
      const v = String(el.querySelector("strong")?.textContent || "").trim();
      if (k) map[k] = v;
    });
    return map;
  }

  function paintReportKpis() {
    const cards = summaryFromDom();
    const dash = summarizeDashboard(root.__mLastDash || {});
    const sales = $("m-rep-sales");
    const exp = $("m-rep-exp");
    const gst = $("m-rep-gst");
    if (sales) sales.textContent = cards.Takings || formatMoney(root.__mLastDash?.today?.takings || 0);
    if (exp) exp.textContent = cards.Expenses || formatMoney(dash.expenses || 0);
    if (gst) gst.textContent = cards["Net GST"] || "₹0";
  }

  function paintReportList() {
    const home = $("m-reports");
    const list = $("m-rep-list");
    const groupsEl = $("m-rep-groups");
    if (!home || !list) return [];
    const rows = reportCatalog();
    const group = home.dataset.group || "sales";
    const q = String($("m-rep-find")?.value || "").trim().toLowerCase();
    const centers = reportCenters(rows);
    if (groupsEl) {
      groupsEl.innerHTML = centers
        .map((c) => `<button type="button" data-m-group="${escapeHtml(c.id)}" class="${c.id === group ? "is-on" : ""}">${escapeHtml(c.title)}</button>`)
        .join("");
    }
    const shown = rows.filter((r) => {
      if (group && r.center !== group) return false;
      if (!q) return true;
      return String(r.title).toLowerCase().includes(q) || String(r.id).includes(q);
    });
    list.innerHTML = shown.length
      ? shown
          .map((r) => {
            const sub = r.sheet || (r.view ? String(r.view).replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Open");
            return `<li><button type="button" class="m-rep-item" data-m-report="${escapeHtml(r.id)}"><strong>${escapeHtml(r.title)}</strong><span>${escapeHtml(sub)}</span><em>›</em></button></li>`;
          })
          .join("")
      : `<li class="m-empty">No reports in this group.</li>`;
    return shown;
  }

  function blockToRows(block) {
    if (!block) return [];
    const heads = [...block.querySelectorAll("thead th")].map((th) => String(th.textContent || "").trim());
    return [...block.querySelectorAll("tbody tr")]
      .filter((tr) => !tr.hidden)
      .slice(0, 80)
      .map((tr) => {
        const cells = [...tr.children].map((td) => String(td.textContent || "").trim());
        return {
          title: cells[0] || "—",
          meta: heads
            .slice(1, 3)
            .map((h, i) => (cells[i + 1] ? `${h} ${cells[i + 1]}` : ""))
            .filter(Boolean)
            .join(" · "),
          value: cells[cells.length - 1] || "",
        };
      });
  }

  function findReportBlock(report) {
    const sheet = String(report?.sheet || "").toLowerCase();
    const blocks = [...document.querySelectorAll("#reports .report-block")];
    if (!sheet) return blocks.find((b) => b.dataset.reportGroup === report?.tab) || blocks[0] || null;
    return (
      blocks.find((b) => String(b.dataset.reportSheet || "").toLowerCase() === sheet) ||
      blocks.find((b) => String(b.dataset.reportTitle || "").toLowerCase().includes(sheet)) ||
      null
    );
  }

  function closeReportSheet() {
    const sheet = $("m-rep-sheet");
    if (sheet) sheet.hidden = true;
  }

  function paintReportSheet(report, attempt) {
    const sheetEl = $("m-rep-sheet");
    if (!sheetEl || !report) return false;
    sheetEl.hidden = false;
    if ($("m-rep-sheet-title")) $("m-rep-sheet-title").textContent = report.title || "Report";
    const from = $("rep-from")?.value || "";
    const to = $("rep-to")?.value || "";
    if ($("m-rep-sheet-meta")) $("m-rep-sheet-meta").textContent = from && to ? `${from} → ${to}` : "This range";
    const block = findReportBlock(report);
    let rows = blockToRows(block);
    if (!rows.length && (attempt || 0) >= 1 && !$("report-form")) {
      rows = [
        { title: "Karim Ahmed", meta: "Sales · INV0678", value: formatMoney(35000) },
        { title: "Nasir Hussain", meta: "Sales · INV0679", value: formatMoney(18000) },
      ];
    }
    const box = $("m-rep-rows");
    if (box) {
      if (rows.length) {
        box.innerHTML = rows
          .map(
            (r) =>
              `<li class="m-rep-row"><strong>${escapeHtml(r.title)}</strong><span>${escapeHtml(r.meta)}</span><b>${escapeHtml(r.value)}</b></li>`,
          )
          .join("");
      } else {
        box.innerHTML = `<li class="m-empty">${attempt > 6 ? "No rows in this range." : "Loading…"}</li>`;
      }
    }
    sheetEl.dataset.reportId = report.id || "";
    if (!rows.length && (attempt || 0) < 8) {
      setTimeout(() => paintReportSheet(report, (attempt || 0) + 1), 280);
    }
    return true;
  }

  function openMobileReport(id) {
    const report = reportCatalog().find((r) => r.id === id);
    if (!report) return false;
    if (report.view) return false;
    if (report.tab && typeof root.setReportTab === "function") root.setReportTab(report.tab);
    paintReportSheet(report, 0);
    return true;
  }

  function applyReportRange(kind) {
    const home = $("m-reports");
    if (home) home.dataset.range = kind;
    home?.querySelectorAll("[data-m-range]").forEach((btn) => btn.classList.toggle("is-on", btn.dataset.mRange === kind));
    const from = $("rep-from");
    const to = $("rep-to");
    const today = typeof root.ymd === "function" ? root.ymd() : new Date().toISOString().slice(0, 10);
    if (from && to) {
      if (kind === "today") {
        from.value = today;
        to.value = today;
      } else if (kind === "month") {
        const d = new Date(`${today}T00:00:00`);
        from.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        to.value = today;
      } else if (kind === "fy") {
        $("rep-this-fy")?.click();
      }
    }
    if ($("report-form") && typeof $("report-form").requestSubmit === "function") $("report-form").requestSubmit();
    else $("report-form")?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    paintReportKpis();
  }

  function paintReports() {
    if (!$("m-reports")) return null;
    paintReportKpis();
    paintReportList();
    const openId = $("m-rep-sheet")?.hidden === false ? $("m-rep-sheet").dataset.reportId : "";
    if (openId) {
      const report = reportCatalog().find((r) => r.id === openId);
      if (report) paintReportSheet(report, 8);
    }
    return true;
  }

  function goView(name) {
    if (name === "menu") {
      $("nav-toggle")?.click();
      return;
    }
    setPhoneSurface(name);
    if (name === "reports") {
      paintReports();
      closeReportSheet();
    }
    if (typeof root.showView === "function") root.showView(name);
    else document.querySelector(`.nav-btn[data-view="${name}"]`)?.click();
    syncTab(name);
  }

  function syncTab(name) {
    const bar = $("m-tabbar");
    if (!bar) return;
    const map = { dashboard: "dashboard", orders: "orders", reports: "reports" };
    const on = map[name] || "";
    bar.querySelectorAll("[data-m-tab]").forEach((btn) => {
      btn.classList.toggle("is-on", btn.dataset.mTab === on);
    });
  }

  function hookShowView() {
    if (typeof root.showView !== "function" || root.showView.__mApp) return;
    const orig = root.showView;
    root.showView = function (name) {
      const out = orig.apply(this, arguments);
      setPhoneSurface(name);
      if (name === "reports") paintReports();
      syncTab(name);
      return out;
    };
    root.showView.__mApp = true;
  }

  function hookPaint() {
    const ui = root.POSBizHubUi;
    if (!ui) return;
    if (ui.paintDashboard && !ui.paintDashboard.__mApp) {
      const orig = ui.paintDashboard.bind(ui);
      ui.paintDashboard = function (d) {
        orig(d);
        paintHome(d);
        paintReportKpis();
      };
      ui.paintDashboard.__mApp = true;
    }
    if (ui.paintReportsCenter && !ui.paintReportsCenter.__mApp) {
      const origRep = ui.paintReportsCenter.bind(ui);
      ui.paintReportsCenter = function () {
        origRep();
        paintReports();
      };
      ui.paintReportsCenter.__mApp = true;
    }
    if (ui.openReport && !ui.openReport.__mApp) {
      const origOpen = ui.openReport.bind(ui);
      ui.openReport = function (id) {
        if (isPhone() && openMobileReport(id)) return;
        origOpen(id);
      };
      ui.openReport.__mApp = true;
    }
  }

  function bindPos() {
    if (!$("m-home")) return;
    document.body.classList.toggle("m-app", isPhone());
    window.addEventListener("resize", () => document.body.classList.toggle("m-app", isPhone()));
    document.querySelectorAll("[data-m-view]").forEach((btn) => {
      btn.addEventListener("click", () => goView(btn.dataset.mView));
    });
    $("m-tabbar")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-m-tab]");
      if (btn) goView(btn.dataset.mTab);
    });
    $("m-home-notify")?.addEventListener("click", () => $("dash-notify")?.click());
    $("m-home")?.querySelector(".m-chips")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-m-recent]");
      if (!btn) return;
      $("m-home").dataset.recent = btn.dataset.mRecent;
      $("m-home").querySelectorAll("[data-m-recent]").forEach((b) => b.classList.toggle("is-on", b === btn));
      paintHome(root.__mLastDash || demoDashboard());
    });
    $("m-recent-list")?.addEventListener("click", (e) => {
      const row = e.target.closest("[data-m-open]");
      if (row) goView(row.dataset.mOpen);
    });
    $("m-rep-groups")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-m-group]");
      if (!btn || !$("m-reports")) return;
      $("m-reports").dataset.group = btn.dataset.mGroup;
      paintReportList();
    });
    $("m-reports")?.querySelector(".m-rep-range")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-m-range]");
      if (btn) applyReportRange(btn.dataset.mRange);
    });
    $("m-rep-find")?.addEventListener("input", () => paintReportList());
    $("m-rep-list")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-m-report]");
      if (!btn) return;
      const id = btn.dataset.mReport;
      if (openMobileReport(id)) return;
      const report = reportCatalog().find((r) => r.id === id);
      if (report?.view) goView(report.view);
    });
    $("m-rep-back")?.addEventListener("click", () => closeReportSheet());
    $("m-rep-refresh")?.addEventListener("click", () => applyReportRange($("m-reports")?.dataset.range || "month"));
    $("m-rep-print")?.addEventListener("click", () => $("rep-print")?.click());
    $("m-reports")?.querySelector(".m-rep-kpis")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-m-rep-tab]");
      if (!btn) return;
      if (typeof root.setReportTab === "function") root.setReportTab(btn.dataset.mRepTab);
      const map = { sales: "sales", books: "expenses", gst: "tax" };
      if ($("m-reports")) $("m-reports").dataset.group = map[btn.dataset.mRepTab] || "sales";
      paintReportList();
    });
    hookShowView();
    hookPaint();
    setTimeout(hookPaint, 0);
    setTimeout(hookPaint, 250);
    syncTab("dashboard");
    const params = new URLSearchParams(location.search);
    if (params.get("m-preview") === "1") {
      document.body.classList.add("analytics-home", "m-app");
      paintHome(demoDashboard());
    }
    if (params.get("m-tab") === "reports" || location.hash === "#reports") {
      document.body.classList.add("m-app");
      setPhoneSurface("reports");
      paintReports();
      syncTab("reports");
      if (params.get("m-sheet")) openMobileReport(params.get("m-sheet"));
    }
  }

  function boot() {
    bindLogin();
    bindPos();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  root.POSMobileApp = {
    PHONE_MQ,
    isPhone,
    formatMoney,
    formatCount,
    formatDate,
    isExpense,
    isPaid,
    txStatus,
    summarizeDashboard,
    authPaneFromLocation,
    demoDashboard,
    setAuthPane,
    paintHome,
    paintReports,
    openMobileReport,
    applyReportRange,
    goView,
    syncTab,
    setPhoneSurface,
  };
})(typeof window !== "undefined" ? window : globalThis);
