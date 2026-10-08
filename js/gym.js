(function (root, factory) {
  const api = factory();
  root.POSGym = api;
  if (typeof window !== "undefined") window.POSGym = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PLAN_KINDS = [
    { id: "monthly", label: "Monthly", days: 30 },
    { id: "quarterly", label: "Quarterly", days: 90 },
    { id: "half_yearly", label: "Half-Yearly", days: 182 },
    { id: "yearly", label: "Yearly", days: 365 },
    { id: "custom", label: "Custom Plans", days: 30 },
    { id: "couple", label: "Couple Membership", days: 365 },
    { id: "family", label: "Family Membership", days: 365 },
    { id: "student", label: "Student Membership", days: 30 },
    { id: "personal_training", label: "Personal Training Plans", days: 30 },
  ];

  const MEMBER_STATUSES = [
    { id: "active", label: "Active" },
    { id: "expired", label: "Expired" },
    { id: "frozen", label: "Frozen" },
  ];

  const PAY_MODES = ["cash", "upi", "card", "online", "bank-transfer", "wallet"];

  const SERVICES = [
    "Personal Training",
    "Diet Consultation",
    "Zumba",
    "Yoga",
    "CrossFit",
    "Cardio Training",
    "Supplements",
    "Gym Accessories",
    "Merchandise",
  ];

  const REPORTS = [
    { id: "gym-members", title: "Member Report" },
    { id: "gym-attendance", title: "Attendance Report" },
    { id: "gym-collection", title: "Collection Report" },
    { id: "gym-dues", title: "Due Report" },
    { id: "gym-expiry", title: "Membership Expiry Report" },
    { id: "gym-trainers", title: "Trainer Report" },
    { id: "gym-expense", title: "Expense Report" },
    { id: "gym-pl", title: "Profit/Loss" },
    { id: "gym-sales-daily", title: "Daily Sales" },
    { id: "gym-sales-monthly", title: "Monthly Sales" },
    { id: "gym-sales-yearly", title: "Yearly Sales" },
  ];

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function isGymShop(biz) {
    if (globalThis.POSFootwear?.shopKind?.(biz) === "gym") return true;
    const t = [biz?.category, biz?.business_type, biz?.name].filter(Boolean).join(" ").toLowerCase();
    return /(gym|fitness|health club|workout studio)/.test(t);
  }

  function planKind(id) {
    return PLAN_KINDS.find((p) => p.id === String(id || "").toLowerCase()) || PLAN_KINDS[0];
  }

  function planDurationDays(kind, customDays) {
    const k = planKind(kind);
    if (k.id === "custom") return Math.max(1, Number(customDays) || k.days);
    return k.days;
  }

  function ymdLocal(d) {
    const x = d instanceof Date ? d : new Date();
    if (Number.isNaN(x.getTime())) return "";
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function addDays(ymd, days) {
    const d = new Date(`${String(ymd || "").slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + Number(days || 0));
    return ymdLocal(d);
  }

  function membershipWindow(startDate, kind, customDays) {
    const start = String(startDate || "").slice(0, 10);
    const days = planDurationDays(kind, customDays);
    return { start_date: start, end_date: addDays(start, days), duration_days: days };
  }

  function memberStatus(row, today) {
    if (String(row?.frozen || row?.status) === "frozen") return "frozen";
    const end = String(row?.end_date || "").slice(0, 10);
    const day = String(today || ymdLocal(new Date())).slice(0, 10);
    if (!end || end < day) return "expired";
    return "active";
  }

  function statusLabel(id) {
    return (MEMBER_STATUSES.find((s) => s.id === id) || MEMBER_STATUSES[0]).label;
  }

  function bmi(weightKg, heightCm) {
    const w = Number(weightKg) || 0;
    const h = (Number(heightCm) || 0) / 100;
    if (w <= 0 || h <= 0) return 0;
    return round2(w / (h * h));
  }

  function billTotals({ planPrice, admissionFee, discount, paid }) {
    const plan = round2(planPrice);
    const admission = round2(admissionFee);
    const disc = round2(discount);
    const total = round2(Math.max(0, plan + admission - disc));
    const pay = round2(Math.max(0, paid));
    const due = round2(Math.max(0, total - pay));
    return { plan, admission, discount: disc, total, paid: Math.min(pay, total), due };
  }

  function qrPayload(shopId, memberId) {
    return `ATAVGYM:${String(shopId || "")}:${String(memberId || "")}`;
  }

  function parseQr(raw) {
    const m = String(raw || "").trim().match(/^ATAVGYM:([^:]+):([^:]+)$/);
    if (!m) return null;
    return { shopId: m[1], memberId: m[2] };
  }

  function defaultPlans() {
    return [
      { name: "Monthly", kind: "monthly", duration_days: 30, price: 1500, admission_fee: 500 },
      { name: "Quarterly", kind: "quarterly", duration_days: 90, price: 4000, admission_fee: 500 },
      { name: "Half-Yearly", kind: "half_yearly", duration_days: 182, price: 7000, admission_fee: 0 },
      { name: "Yearly", kind: "yearly", duration_days: 365, price: 12000, admission_fee: 0 },
      { name: "Couple Membership", kind: "couple", duration_days: 365, price: 20000, admission_fee: 0 },
      { name: "Family Membership", kind: "family", duration_days: 365, price: 28000, admission_fee: 0 },
      { name: "Student Membership", kind: "student", duration_days: 30, price: 999, admission_fee: 0 },
      { name: "Personal Training", kind: "personal_training", duration_days: 30, price: 5000, admission_fee: 0, sessions: 12 },
    ];
  }

  function noticeCopy(kind, ctx) {
    const c = ctx || {};
    const map = {
      welcome: `Welcome ${c.name || "member"}. Membership ID ${c.member_no || ""}.`,
      renewal: `Hi ${c.name || ""}, renew your gym membership ${c.member_no || ""} before ${c.end_date || ""}.`,
      expiry: `Membership ${c.member_no || ""} expired on ${c.end_date || ""}. Renew to keep training.`,
      reminder: `Reminder: ${c.name || "member"} membership ends on ${c.end_date || ""}.`,
      due: `Pending gym due ₹${round2(c.due || 0)} for ${c.member_no || "member"}.`,
      checkin: `${c.name || "Member"} checked in.`,
    };
    return map[kind] || "Gym update";
  }

  function dashboardCards(stats) {
    const s = stats || {};
    return [
      { id: "members", label: "Total Members", value: s.totalMembers || 0 },
      { id: "active", label: "Active Members", value: s.activeMembers || 0 },
      { id: "expired", label: "Expired Members", value: s.expiredMembers || 0 },
      { id: "checkins", label: "Today's Check-ins", value: s.todayCheckins || 0 },
      { id: "collection", label: "Today's Collection", value: s.todayCollection || 0, money: true },
      { id: "monthly", label: "Monthly Revenue", value: s.monthlyRevenue || 0, money: true },
      { id: "dues", label: "Pending Dues", value: s.pendingDues || 0, money: true },
      { id: "renewals", label: "Membership Renewals", value: s.renewals || 0 },
      { id: "registrations", label: "New Registrations", value: s.newRegistrations || 0 },
    ];
  }

  return {
    PLAN_KINDS,
    MEMBER_STATUSES,
    PAY_MODES,
    SERVICES,
    REPORTS,
    isGymShop,
    planKind,
    planDurationDays,
    membershipWindow,
    memberStatus,
    statusLabel,
    bmi,
    billTotals,
    qrPayload,
    parseQr,
    defaultPlans,
    noticeCopy,
    dashboardCards,
    round2,
    ymdLocal,
  };
});
