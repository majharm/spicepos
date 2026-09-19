(function (root, factory) {
  const api = factory();
  root.POSSalon = api;
  if (typeof window !== "undefined") window.POSSalon = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CATEGORIES = [
    "Salon",
    "Unisex Salon",
    "Ladies Salon",
    "Gents Salon",
    "Beauty Parlour",
    "Spa",
    "Massage",
    "Hair Studio",
    "Nail Studio",
    "Makeup Studio",
  ];

  const STATUSES = [
    { id: "pending", label: "Pending", next: ["confirmed", "cancelled"] },
    { id: "confirmed", label: "Confirmed", next: ["checked_in", "cancelled", "no_show"] },
    { id: "checked_in", label: "Checked-In", next: ["in_service", "cancelled"] },
    { id: "in_service", label: "In Service", next: ["completed"] },
    { id: "completed", label: "Completed", next: [] },
    { id: "cancelled", label: "Cancelled", next: [] },
    { id: "no_show", label: "No Show", next: [] },
    { id: "waitlist", label: "Waiting list", next: ["confirmed", "cancelled"] },
  ];

  const ADVANCE_MODES = [
    { id: "none", label: "No Advance", pct: 0 },
    { id: "fixed", label: "Fixed Advance" },
    { id: "percent", label: "Percentage Advance" },
    { id: "full", label: "Full Payment", pct: 100 },
  ];

  const PAY_MODES = ["cash", "upi", "card", "bank-transfer", "online", "wallet", "advance", "package", "split", "due"];

  const GENDERS = ["unisex", "female", "male"];

  const REPORTS = [
    { id: "salon-bookings", title: "Booking Report" },
    { id: "salon-advance-bookings", title: "Advance Booking Report" },
    { id: "salon-advance-pay", title: "Advance Payment Report" },
    { id: "salon-service-sales", title: "Service Sales Report" },
    { id: "salon-package-sales", title: "Package Sales Report" },
    { id: "salon-package-usage", title: "Package Usage Report" },
    { id: "salon-package-expiry", title: "Package Expiry Report" },
    { id: "salon-customer-sales", title: "Customer-wise Sales" },
    { id: "salon-customer-bookings", title: "Customer-wise Booking" },
    { id: "salon-staff-bookings", title: "Staff-wise Booking" },
    { id: "salon-staff-revenue", title: "Staff-wise Revenue" },
    { id: "salon-service-revenue", title: "Service-wise Revenue" },
    { id: "salon-pay-mode", title: "Payment Mode Report" },
    { id: "salon-outstanding", title: "Outstanding Report" },
    { id: "salon-cancel", title: "Cancellation Report" },
    { id: "salon-noshow", title: "No-show Report" },
    { id: "salon-revenue", title: "Daily/Monthly/Yearly Revenue" },
    { id: "salon-clv", title: "Customer Lifetime Value" },
  ];

  const NOTICE_KINDS = [
    "booking_confirm",
    "advance_paid",
    "reminder",
    "reschedule",
    "cancel",
    "payment_due",
    "package_expiry",
    "package_purchase",
    "service_done",
  ];

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function money(n) {
    return round2(n);
  }

  function isSalonShop(biz) {
    const t = [biz?.category, biz?.business_type, biz?.name].filter(Boolean).join(" ").toLowerCase();
    if (globalThis.POSFootwear?.shopKind?.(biz) === "services") return true;
    return /(salon|spa|parlour|parlor|beauty|massage|nail|makeup|hair studio)/.test(t);
  }

  function salonCategory(biz) {
    const cat = String(biz?.category || "").trim();
    if (CATEGORIES.some((c) => c.toLowerCase() === cat.toLowerCase())) return cat;
    if (/ladies|women/.test(cat.toLowerCase())) return "Ladies Salon";
    if (/gents|men/.test(cat.toLowerCase())) return "Gents Salon";
    if (/unisex/.test(cat.toLowerCase())) return "Unisex Salon";
    if (/parlour|parlor|beauty/.test(cat.toLowerCase())) return "Beauty Parlour";
    if (/massage/.test(cat.toLowerCase())) return "Massage";
    if (/nail/.test(cat.toLowerCase())) return "Nail Studio";
    if (/makeup/.test(cat.toLowerCase())) return "Makeup Studio";
    if (/hair/.test(cat.toLowerCase())) return "Hair Studio";
    if (/spa/.test(cat.toLowerCase())) return "Spa";
    if (/salon/.test(cat.toLowerCase())) return "Salon";
    return "Salon";
  }

  function statusMeta(id) {
    return STATUSES.find((s) => s.id === String(id || "").toLowerCase()) || STATUSES[0];
  }

  function canTransition(from, to) {
    const cur = statusMeta(from);
    return cur.next.includes(String(to || "").toLowerCase());
  }

  function lineAmount(price, qty, discountPct, gstPct) {
    const gross = round2((Number(price) || 0) * (Number(qty) || 1));
    const disc = round2(gross * ((Number(discountPct) || 0) / 100));
    const taxable = round2(gross - disc);
    const gst = round2(taxable * ((Number(gstPct) || 0) / 100));
    return { gross, discount: disc, taxable, gst, total: round2(taxable + gst) };
  }

  function bookingTotals(lines, couponPct) {
    const rows = (lines || []).map((l) => lineAmount(l.price, l.qty || 1, l.discount_pct, l.gst_rate));
    const subtotal = round2(rows.reduce((s, r) => s + r.taxable, 0));
    const gst = round2(rows.reduce((s, r) => s + r.gst, 0));
    const coupon = round2(subtotal * ((Number(couponPct) || 0) / 100));
    const total = round2(subtotal - coupon + gst);
    return { lines: rows, subtotal, gst, coupon, total };
  }

  function advanceDue(total, mode, value) {
    const t = round2(total);
    const m = String(mode || "none");
    let advance = 0;
    if (m === "full") advance = t;
    else if (m === "percent") advance = round2(t * ((Number(value) || 0) / 100));
    else if (m === "fixed") advance = round2(Math.min(t, Number(value) || 0));
    else advance = 0;
    if (advance < 0) advance = 0;
    if (advance > t) advance = t;
    return { total: t, advance, remaining: round2(t - advance) };
  }

  function packageSavings(services, packagePrice) {
    const individual = round2((services || []).reduce((s, x) => s + (Number(x.price) || 0) * (Number(x.qty) || 1), 0));
    const pkg = round2(packagePrice);
    return {
      individualTotal: individual,
      packagePrice: pkg,
      savings: round2(Math.max(0, individual - pkg)),
    };
  }

  function packageUsage(totalSessions, usedSessions) {
    const total = Math.max(0, Number(totalSessions) || 0);
    const used = Math.max(0, Number(usedSessions) || 0);
    const remaining = Math.max(0, total - used);
    return {
      totalSessions: total,
      usedSessions: used,
      remainingSessions: remaining,
      status: remaining <= 0 ? "exhausted" : "active",
    };
  }

  function slotsForDay(ymd, durationMin, occupied, openHour, closeHour, stepMin) {
    const open = Number.isFinite(Number(openHour)) ? Number(openHour) : 10;
    const close = Number.isFinite(Number(closeHour)) ? Number(closeHour) : 19;
    const step = Number(stepMin) > 0 ? Number(stepMin) : 30;
    const dur = Math.max(15, Number(durationMin) || 30);
    const busy = (occupied || []).map((x) => ({ start: String(x.start || x.start_time || ""), mins: Number(x.duration_min || dur) }));
    const out = [];
    for (let h = open; h < close; h++) {
      for (let m = 0; m < 60; m += step) {
        const startMins = h * 60 + m;
        if (startMins + dur > close * 60) continue;
        const hh = String(Math.floor(startMins / 60)).padStart(2, "0");
        const mm = String(startMins % 60).padStart(2, "0");
        const start = `${hh}:${mm}`;
        const clash = busy.some((b) => {
          const [bh, bm] = String(b.start).split(":").map(Number);
          const bs = (Number(bh) || 0) * 60 + (Number(bm) || 0);
          const be = bs + (Number(b.mins) || dur);
          const es = startMins + dur;
          return startMins < be && es > bs;
        });
        out.push({ date: ymd, start, duration_min: dur, available: !clash });
      }
    }
    return out;
  }

  function invoiceFields(booking, pay) {
    const totals = bookingTotals(booking.lines || [], booking.coupon_pct);
    const paid = round2(pay?.amount || booking.paid_amount || 0);
    const previousDue = round2(booking.previous_due || 0);
    const currentDue = round2(Math.max(0, totals.total - paid));
    return {
      customer: booking.customer_name,
      booking_id: booking.booking_number,
      services: booking.lines,
      staff: booking.staff_name,
      date: booking.booking_date,
      time: booking.start_time,
      subtotal: totals.subtotal,
      discount: totals.coupon,
      gst: totals.gst,
      advance_paid: round2(booking.advance_paid || paid),
      previous_due: previousDue,
      current_due: currentDue,
      outstanding: round2(previousDue + currentDue),
      payment: pay || null,
      total: totals.total,
    };
  }

  function noticeCopy(kind, ctx) {
    const c = ctx || {};
    const map = {
      booking_confirm: `Booking ${c.booking_number || ""} confirmed for ${c.date || ""} ${c.time || ""}.`,
      advance_paid: `Advance ${c.amount != null ? `₹${round2(c.amount)}` : ""} received for ${c.booking_number || "booking"}.`,
      reminder: `Reminder: appointment ${c.booking_number || ""} on ${c.date || ""} at ${c.time || ""}.`,
      reschedule: `Booking ${c.booking_number || ""} rescheduled to ${c.date || ""} ${c.time || ""}.`,
      cancel: `Booking ${c.booking_number || ""} was cancelled.`,
      payment_due: `Balance due ${c.amount != null ? `₹${round2(c.amount)}` : ""} on ${c.booking_number || "booking"}.`,
      package_expiry: `Package ${c.package_name || ""} expires on ${c.expires_at || ""}.`,
      package_purchase: `Package ${c.package_name || ""} purchased.`,
      service_done: `Service completed for ${c.booking_number || "booking"}.`,
    };
    return map[kind] || "Salon update";
  }

  function dashboardCards(stats) {
    const s = stats || {};
    return [
      { id: "bookings", label: "Today's Bookings", value: s.todayBookings || 0 },
      { id: "sales", label: "Today's Sales", value: s.todaySales || 0, money: true },
      { id: "advance", label: "Today's Advance Collection", value: s.todayAdvance || 0, money: true },
      { id: "completed", label: "Today's Completed Services", value: s.todayCompleted || 0 },
      { id: "pending_pay", label: "Pending Payments", value: s.pendingPay || 0, money: true },
      { id: "upcoming", label: "Upcoming Appointments", value: s.upcoming || 0 },
      { id: "cancelled", label: "Cancelled Bookings", value: s.cancelled || 0 },
      { id: "noshow", label: "No Shows", value: s.noShows || 0 },
      { id: "pkg_sales", label: "Package Sales", value: s.packageSales || 0, money: true },
      { id: "pkg_expiry", label: "Package Expiry", value: s.packageExpiry || 0 },
      { id: "staff", label: "Staff Performance", value: s.staffTop || "—" },
    ];
  }

  return {
    CATEGORIES,
    STATUSES,
    ADVANCE_MODES,
    PAY_MODES,
    GENDERS,
    REPORTS,
    NOTICE_KINDS,
    isSalonShop,
    salonCategory,
    statusMeta,
    canTransition,
    lineAmount,
    bookingTotals,
    advanceDue,
    packageSavings,
    packageUsage,
    slotsForDay,
    invoiceFields,
    noticeCopy,
    dashboardCards,
    round2,
    money,
  };
});
