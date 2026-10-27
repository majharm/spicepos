(function (root, factory) {
  const api = factory();
  root.POSRecurring = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FREQUENCIES = [
    { id: "daily", label: "Daily" },
    { id: "weekly", label: "Weekly" },
    { id: "monthly", label: "Monthly" },
    { id: "bimonthly", label: "Every 2 months" },
    { id: "quarterly", label: "Quarterly" },
    { id: "half_yearly", label: "Half-yearly" },
    { id: "yearly", label: "Yearly" },
    { id: "custom", label: "Custom interval" },
  ];
  const MONTHS = { monthly: 1, bimonthly: 2, quarterly: 3, half_yearly: 6, yearly: 12 };
  const STATUSES = ["active", "paused", "completed", "cancelled"];

  function flagOn(raw) {
    return raw === true || raw === 1 || raw === "1";
  }

  function parseYmd(raw) {
    const m = String(raw || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }

  function ymd(y, m, d) {
    return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function clampDay(y, m, day) {
    const dim = daysInMonth(y, m);
    const d = Math.max(1, Math.min(31, Math.round(Number(day) || 1)));
    return Math.min(d, dim);
  }

  function addDays(from, days) {
    const p = parseYmd(from);
    if (!p) return "";
    const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
    dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
    return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  function addMonths(from, months, billingDay) {
    const p = parseYmd(from);
    if (!p) return "";
    const idx = p.m - 1 + Number(months || 0);
    const y = p.y + Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    return ymd(y, m, clampDay(y, m, billingDay || p.d));
  }

  function frequencyOk(id) {
    return FREQUENCIES.some((row) => row.id === id);
  }

  function nextInvoiceDate(schedule, fromYmd) {
    const from = String(fromYmd || schedule?.next_invoice_date || schedule?.start_date || "").slice(0, 10);
    const freq = String(schedule?.frequency || "");
    if (!parseYmd(from)) return "";
    if (freq === "daily") return addDays(from, 1);
    if (freq === "weekly") return addDays(from, 7);
    if (freq === "custom") return addDays(from, Math.max(1, Math.min(366, Number(schedule?.interval_days) || 1)));
    const months = MONTHS[freq];
    if (!months) return "";
    const billingDay = Number(schedule?.billing_day) || parseYmd(from)?.d || 1;
    return addMonths(from, months, billingDay);
  }

  function skipsRecurringStock(item) {
    const unit = String(item?.base_unit || item?.unit || "").trim().toUpperCase();
    if (unit === "SERVICE") return true;
    const kind = String(item?.kind || item?.item_kind || "").trim().toLowerCase();
    return kind === "service";
  }

  function planGeneration(schedule, today, run, opts = {}) {
    const manual = Boolean(opts.manual);
    const status = String(schedule?.status || "").toLowerCase();
    if (status === "cancelled" || status === "completed") return { action: "skip", reason: status };
    if (!manual && status !== "active") return { action: "skip", reason: status || "inactive" };
    if (!manual && !flagOn(schedule?.auto_generate)) return { action: "skip", reason: "auto off" };
    const due = String(schedule?.next_invoice_date || "").slice(0, 10);
    if (!parseYmd(due)) return { action: "skip", reason: "no date" };
    if (!manual && due > String(today || "")) return { action: "skip", reason: "not due" };
    const end = String(schedule?.end_date || "").slice(0, 10);
    if (end && due > end) return { action: "complete", reason: "end date" };
    const max = Number(schedule?.max_cycles) || 0;
    const done = Number(schedule?.cycles_done) || 0;
    if (max > 0 && done >= max) return { action: "complete", reason: "cycles" };
    if (run?.sales_order_id) return { action: "replay", orderId: run.sales_order_id, orderNumber: run.order_number || "" };
    if (String(run?.status || "") === "pending") {
      const age = Date.now() - Date.parse(run.created_at || "");
      if (Number.isFinite(age) && age >= 0 && age < 120000) return { action: "busy" };
    }
    const nextDate = nextInvoiceDate(schedule, due);
    const cyclesDone = done + 1;
    let afterStatus = status === "paused" && manual ? "paused" : "active";
    if ((max > 0 && cyclesDone >= max) || (end && nextDate && nextDate > end)) afterStatus = "completed";
    return { action: "create", period: due, nextDate, afterStatus, cyclesDone };
  }

  function dashboardStats(schedules, generatedThisMonth, todayRaw) {
    const rows = Array.isArray(schedules) ? schedules : [];
    const today = String(todayRaw || "").slice(0, 10);
    const upcomingEnd = today ? addDays(today, 7) : "";
    let active = 0;
    let upcoming = 0;
    let overdue = 0;
    let pausedOrCancelled = 0;
    for (const row of rows) {
      const status = String(row.status || "").toLowerCase();
      const next = String(row.next_invoice_date || "").slice(0, 10);
      if (status === "active") active += 1;
      if (status === "paused" || status === "cancelled") pausedOrCancelled += 1;
      if (status === "active" && today && next && next < today) overdue += 1;
      if (status === "active" && today && next && next >= today && upcomingEnd && next <= upcomingEnd) upcoming += 1;
    }
    return {
      total: rows.length,
      active,
      generatedThisMonth: Number(generatedThisMonth) || 0,
      upcoming,
      overdue,
      pausedOrCancelled,
    };
  }

  return {
    FREQUENCIES,
    STATUSES,
    flagOn,
    parseYmd,
    ymd,
    daysInMonth,
    clampDay,
    addDays,
    addMonths,
    frequencyOk,
    nextInvoiceDate,
    skipsRecurringStock,
    planGeneration,
    dashboardStats,
  };
});
