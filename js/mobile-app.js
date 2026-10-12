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

  function goView(name) {
    if (name === "menu") {
      $("nav-toggle")?.click();
      return;
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
      syncTab(name);
      return out;
    };
    root.showView.__mApp = true;
  }

  function hookPaint() {
    const ui = root.POSBizHubUi;
    if (!ui?.paintDashboard || ui.paintDashboard.__mApp) return;
    const orig = ui.paintDashboard.bind(ui);
    ui.paintDashboard = function (d) {
      orig(d);
      paintHome(d);
    };
    ui.paintDashboard.__mApp = true;
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
    hookShowView();
    hookPaint();
    setTimeout(hookPaint, 0);
    setTimeout(hookPaint, 250);
    syncTab("dashboard");
    if (new URLSearchParams(location.search).get("m-preview") === "1") {
      document.body.classList.add("analytics-home", "m-app");
      paintHome(demoDashboard());
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
    goView,
    syncTab,
  };
})(typeof window !== "undefined" ? window : globalThis);
