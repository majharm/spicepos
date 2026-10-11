(function (root, factory) {
  const api = factory();
  root.POSResort = api;
  if (typeof window !== "undefined") window.POSResort = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ROOM_CATEGORIES = [
    { id: "standard", label: "Standard Room" },
    { id: "deluxe", label: "Deluxe Room" },
    { id: "super_deluxe", label: "Super Deluxe Room" },
    { id: "premium", label: "Premium Room" },
    { id: "suite", label: "Suite Room" },
    { id: "family", label: "Family Room" },
    { id: "cottage", label: "Cottage / Villa" },
    { id: "dormitory", label: "Dormitory or Group Accommodation" },
  ];

  const PHYSICAL_STATUSES = [
    { id: "available", label: "Available" },
    { id: "reserved", label: "Reserved" },
    { id: "occupied", label: "Occupied" },
    { id: "checkout_pending", label: "Check-Out Pending" },
    { id: "cleaning", label: "Cleaning" },
    { id: "maintenance", label: "Maintenance" },
    { id: "blocked", label: "Blocked" },
  ];

  const HOUSEKEEPING_STATUSES = [
    { id: "dirty", label: "Dirty" },
    { id: "cleaning", label: "Cleaning" },
    { id: "inspect", label: "Inspection" },
    { id: "ready", label: "Ready" },
  ];

  const BOOKING_STATUSES = [
    { id: "hold", label: "Temporary hold" },
    { id: "pending", label: "Pending confirmation" },
    { id: "confirmed", label: "Confirmed" },
    { id: "checked_in", label: "Checked in" },
    { id: "checked_out", label: "Checked out" },
    { id: "cancelled", label: "Cancelled" },
    { id: "no_show", label: "No-show" },
    { id: "expired", label: "Expired hold" },
  ];

  const PAY_STATUSES = ["pending", "partial", "paid", "failed", "refunded", "authorized"];
  const PAY_MODES = ["cash", "upi", "card", "online", "bank-transfer", "wallet", "pay_on_arrival"];
  const BOOKING_SOURCES = ["website", "walk_in", "phone", "whatsapp", "ota", "admin"];

  const DEFAULT_AMENITIES = ["AC", "Wi-Fi", "TV", "Attached bathroom", "Balcony", "Hot water", "Room service"];

  const EXTRA_SERVICES = [
    { id: "pool", label: "Swimming pool access" },
    { id: "spa", label: "Spa and wellness" },
    { id: "laundry", label: "Laundry" },
    { id: "room_service", label: "Room service" },
    { id: "transport", label: "Transport and pickup" },
    { id: "banquet", label: "Banquet / conference" },
    { id: "activity", label: "Indoor and outdoor activities" },
    { id: "event", label: "Event package" },
    { id: "breakfast", label: "Breakfast" },
    { id: "lunch", label: "Lunch" },
    { id: "dinner", label: "Dinner" },
    { id: "meal_plan", label: "Meal plan" },
  ];

  const ROLES = [
    { id: "business_admin", label: "Resort Owner" },
    { id: "resort_owner", label: "Resort Owner" },
    { id: "property_manager", label: "Property Manager" },
    { id: "receptionist", label: "Receptionist" },
    { id: "reservation_executive", label: "Reservation Executive" },
    { id: "cashier", label: "Cashier" },
    { id: "restaurant_manager", label: "Restaurant Manager" },
    { id: "restaurant_staff", label: "Restaurant Staff" },
    { id: "housekeeping", label: "Housekeeping Staff" },
    { id: "maintenance", label: "Maintenance Staff" },
  ];

  const REPORTS = [
    { id: "resort-rooms", title: "Room operations" },
    { id: "resort-arrivals", title: "Daily arrivals and departures" },
    { id: "resort-occupancy", title: "Occupancy, ALOS, cancellations" },
    { id: "resort-revenue", title: "Room, restaurant, and service revenue" },
    { id: "resort-adr", title: "ADR and RevPAR" },
    { id: "resort-category", title: "Room category performance" },
    { id: "resort-source", title: "Booking source performance" },
    { id: "resort-payments", title: "Payment-method collections" },
    { id: "resort-property", title: "Property-wise comparison" },
  ];

  const DEFAULT_SETTINGS = {
    property_name: "",
    address: "",
    phone: "",
    email: "",
    logo_url: "",
    images: [],
    amenities: DEFAULT_AMENITIES.slice(),
    check_in_time: "14:00",
    check_out_time: "11:00",
    timezone: "Asia/Kolkata",
    hold_minutes: 10,
    tax_rate: 12,
    service_rate: 0,
    weekend_days: [0, 6],
    extra_adult_rate: 0,
    extra_child_rate: 0,
    extra_bed_rate: 0,
    pay_on_arrival: false,
    min_stay: 1,
    max_stay: 30,
    cancellation_hours: 24,
    booking_policy: "",
    late_checkout_fee: 0,
  };

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function flagOn(v) {
    return v === true || v === 1 || v === "1" || v === "on" || v === "true" || v === "yes";
  }

  function ymd(value) {
    if (!value && value !== 0) return "";
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return "";
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, "0");
      const d = String(value.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const parsed = new Date(s);
    if (Number.isNaN(parsed.getTime())) return "";
    return ymd(parsed);
  }

  function ymdInZone(date, zone) {
    const d = date instanceof Date ? date : new Date(date || Date.now());
    if (Number.isNaN(d.getTime())) return "";
    try {
      return d.toLocaleDateString("en-CA", { timeZone: zone || "Asia/Kolkata" });
    } catch {
      return ymd(d);
    }
  }

  function addDays(date, days) {
    const start = ymd(date);
    if (!start) return "";
    const d = new Date(`${start}T12:00:00`);
    d.setDate(d.getDate() + Number(days || 0));
    return ymd(d);
  }

  function nightsBetween(checkIn, checkOut) {
    const a = ymd(checkIn);
    const b = ymd(checkOut);
    if (!a || !b || b <= a) return 0;
    const start = new Date(`${a}T12:00:00`);
    const end = new Date(`${b}T12:00:00`);
    return Math.round((end - start) / 86400000);
  }

  function eachNight(checkIn, checkOut) {
    const nights = [];
    let cur = ymd(checkIn);
    const end = ymd(checkOut);
    while (cur && end && cur < end) {
      nights.push(cur);
      cur = addDays(cur, 1);
    }
    return nights;
  }

  function datesOverlap(aStart, aEnd, bStart, bEnd) {
    const a0 = ymd(aStart);
    const a1 = ymd(aEnd);
    const b0 = ymd(bStart);
    const b1 = ymd(bEnd);
    if (!a0 || !a1 || !b0 || !b1) return false;
    return a0 < b1 && b0 < a1;
  }

  function statusId(raw) {
    return String(raw || "")
      .toLowerCase()
      .trim()
      .replace(/[\s-]+/g, "_");
  }

  function categoryId(raw) {
    const s = statusId(raw);
    const found = ROOM_CATEGORIES.find((c) => c.id === s || statusId(c.label) === s);
    return found ? found.id : s || "standard";
  }

  function categoryLabel(id) {
    return (ROOM_CATEGORIES.find((c) => c.id === categoryId(id)) || ROOM_CATEGORIES[0]).label;
  }

  function physicalLabel(id) {
    return (PHYSICAL_STATUSES.find((s) => s.id === statusId(id)) || PHYSICAL_STATUSES[0]).label;
  }

  function isStandaloneResortType(biz) {
    const type = String(biz?.business_type || "").toLowerCase().trim();
    return type === "resort" || type === "resort & restaurant" || type === "resort and restaurant";
  }

  function isResortCategory(biz) {
    const cat = String(biz?.category || "").toLowerCase().trim();
    return (
      cat === "resort & restaurant with room booking" ||
      cat === "resort & restaurant" ||
      cat === "resort"
    );
  }

  function isResortShop(biz) {
    if (flagOn(biz?.resort_enabled)) return true;
    if (isStandaloneResortType(biz)) return true;
    if (isResortCategory(biz)) return true;
    return false;
  }

  function normalizeResortEnabled(val, type, category) {
    if (isStandaloneResortType({ business_type: type })) return 1;
    if (isResortCategory({ category })) return 1;
    return flagOn(val) ? 1 : 0;
  }

  function asDate(value) {
    if (value instanceof Date) return value;
    const d = new Date(value || Date.now());
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }

  function isHoldActive(row, now) {
    if (statusId(row?.status) !== "hold") return false;
    const exp = row?.expires_at;
    if (!exp) return false;
    return asDate(exp).getTime() > asDate(now).getTime();
  }

  function bookingBlocksDates(row, now, opts = {}) {
    const s = statusId(row?.status);
    if (s === "cancelled" || s === "no_show" || s === "expired" || s === "checked_out") return false;
    if (s === "hold") return opts.ignoreHolds ? false : isHoldActive(row, now);
    return s === "confirmed" || s === "checked_in" || s === "pending";
  }

  function occupancyCap(room) {
    const adults = Number(room?.max_adults);
    const children = Number(room?.max_children);
    const cap = Number(room?.max_occupancy);
    if (Number.isFinite(cap) && cap > 0) return cap;
    return Math.max(1, (Number.isFinite(adults) ? adults : 2) + (Number.isFinite(children) ? children : 1));
  }

  function roomAvailableOnDates(room, stay, ctx = {}) {
    if (!room) return { ok: false, reason: "inactive" };
    if (room.active === 0 || room.active === false || room.active === "0") {
      return { ok: false, reason: "inactive" };
    }
    const checkIn = ymd(stay?.checkIn || stay?.check_in);
    const checkOut = ymd(stay?.checkOut || stay?.check_out);
    if (!checkIn || !checkOut || checkOut <= checkIn) return { ok: false, reason: "invalid_dates" };
    const adults = Math.max(1, Number(stay?.adults) || 1);
    const children = Math.max(0, Number(stay?.children) || 0);
    const maxAdults = Number(room.max_adults);
    if (Number.isFinite(maxAdults) && maxAdults > 0 && adults > maxAdults) {
      return { ok: false, reason: "occupancy" };
    }
    if (adults + children > occupancyCap(room)) return { ok: false, reason: "occupancy" };

    const now = ctx.now || Date.now();
    const today = ymd(ctx.today) || ymdInZone(now, ctx.timezone || "Asia/Kolkata");
    const phys = statusId(room.physical_status || room.status || "available");

    if (phys === "blocked" && !room.block_end && !room.block_start) {
      return { ok: false, reason: "blocked" };
    }
    if (checkIn === today && (phys === "cleaning" || phys === "checkout_pending")) {
      return { ok: false, reason: "not_ready" };
    }
    if (checkIn === today && phys === "maintenance" && !room.block_end) {
      return { ok: false, reason: "maintenance" };
    }

    const ignore = new Set([ctx.ignoreId, ctx.ignore_id, stay?.ignoreId].filter(Boolean).map(String));
    for (const row of ctx.bookings || []) {
      if (ignore.has(String(row.id)) || ignore.has(String(row.hold_id || ""))) continue;
      if (String(row.room_id) !== String(room.id)) continue;
      if (!bookingBlocksDates(row, now, { ignoreHolds: ctx.ignoreHolds })) continue;
      if (datesOverlap(checkIn, checkOut, row.check_in || row.checkIn, row.check_out || row.checkOut)) {
        return { ok: false, reason: statusId(row.status) === "hold" ? "held" : "booked" };
      }
    }
    for (const blk of ctx.blocks || []) {
      if (String(blk.room_id) !== String(room.id)) continue;
      const kind = statusId(blk.kind || blk.status || "blocked");
      if (kind === "cancelled") continue;
      if (datesOverlap(checkIn, checkOut, blk.start || blk.start_date, blk.end || blk.end_date)) {
        return { ok: false, reason: kind === "maintenance" ? "maintenance" : "blocked" };
      }
    }
    return { ok: true };
  }

  function publicRoomCard(room, stay, settings) {
    const price = stayPrice({
      room,
      checkIn: stay.checkIn || stay.check_in,
      checkOut: stay.checkOut || stay.check_out,
      adults: stay.adults,
      children: stay.children,
      settings,
      extras: stay.extras,
    });
    return {
      id: room.id,
      number: room.number || room.room_no,
      name: room.name || room.room_name || room.number,
      category: room.category,
      category_label: categoryLabel(room.category),
      photos: Array.isArray(room.photos) ? room.photos : [],
      amenities: Array.isArray(room.amenities) ? room.amenities : [],
      max_adults: Number(room.max_adults) || 2,
      max_children: Number(room.max_children) || 1,
      beds: room.beds || room.bed_type,
      description: room.description || "",
      rate: price.nightly[0]?.rate || Number(room.rate) || 0,
      price,
    };
  }

  function searchAvailability(input) {
    const checkIn = ymd(input.checkIn || input.check_in);
    const checkOut = ymd(input.checkOut || input.check_out);
    const adults = Math.max(1, Number(input.adults) || 1);
    const children = Math.max(0, Number(input.children) || 0);
    const needed = Math.max(1, Number(input.roomsNeeded || input.rooms || 1));
    const stay = { checkIn, checkOut, adults, children };
    const ctx = {
      bookings: input.bookings || [],
      blocks: input.blocks || [],
      now: input.now,
      today: input.today,
      timezone: input.settings?.timezone,
    };
    const available = (input.rooms || []).filter((room) => roomAvailableOnDates(room, stay, ctx).ok);
    const byCat = new Map();
    for (const room of available) {
      const key = categoryId(room.category);
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key).push(room);
    }
    const categories = [...byCat.entries()].map(([category, rooms]) => {
      const sample = rooms[0];
      return {
        category,
        category_label: categoryLabel(category),
        available_count: rooms.length,
        bookable: rooms.length >= needed,
        rooms: rooms.map((room) => publicRoomCard(room, stay, input.settings)),
        photos: sample.photos || [],
        amenities: sample.amenities || [],
        occupancy: { adults: sample.max_adults, children: sample.max_children },
        price: stayPrice({
          room: sample,
          checkIn,
          checkOut,
          adults,
          children,
          settings: input.settings,
        }),
      };
    });
    const message = categories.some((c) => c.bookable)
      ? ""
      : "No rooms are available for these dates. Try other dates or another room category.";
    return {
      check_in: checkIn,
      check_out: checkOut,
      nights: nightsBetween(checkIn, checkOut),
      adults,
      children,
      rooms_needed: needed,
      categories,
      available_rooms: available.map((room) => publicRoomCard(room, stay, input.settings)),
      message,
    };
  }

  function holdMinutes(settings) {
    const n = Number(settings?.hold_minutes);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 10;
  }

  function makeId(prefix) {
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand}`;
  }

  function bookingRef(now) {
    const d = asDate(now);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `RSV-${y}${m}${day}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  function expireHolds(bookings, now) {
    return (bookings || []).map((row) => {
      if (statusId(row.status) !== "hold") return row;
      if (isHoldActive(row, now)) return row;
      return { ...row, status: "expired", payment_status: row.payment_status || "failed" };
    });
  }

  function createHold({ room, stay, guest, settings, now, source }) {
    const checkIn = ymd(stay?.checkIn || stay?.check_in);
    const checkOut = ymd(stay?.checkOut || stay?.check_out);
    const created = asDate(now);
    const expires = new Date(created.getTime() + holdMinutes(settings) * 60 * 1000);
    const price = stayPrice({
      room,
      checkIn,
      checkOut,
      adults: stay?.adults,
      children: stay?.children,
      settings,
      extras: stay?.extras,
    });
    return {
      id: makeId("HLD"),
      booking_no: bookingRef(created),
      status: "hold",
      payment_status: "pending",
      room_id: room.id,
      property_id: room.property_id || stay?.property_id || "",
      category: room.category,
      check_in: checkIn,
      check_out: checkOut,
      nights: nightsBetween(checkIn, checkOut),
      adults: Math.max(1, Number(stay?.adults) || 1),
      children: Math.max(0, Number(stay?.children) || 0),
      guest_name: String(guest?.name || "").trim(),
      guest_mobile: String(guest?.mobile || "").trim(),
      guest_email: String(guest?.email || "").trim(),
      source: source || "website",
      hold: true,
      expires_at: expires.toISOString(),
      created_at: created.toISOString(),
      price,
      total: price.total,
      paid: 0,
      due: price.total,
    };
  }

  function paymentAllowsConfirm(payment, settings) {
    const status = statusId(payment?.status);
    if (status === "failed" || status === "refunded") return { ok: false, reason: "payment_failed" };
    if (status === "success" || status === "paid" || status === "authorized") return { ok: true, payment_status: status === "authorized" ? "authorized" : "paid" };
    if (flagOn(settings?.pay_on_arrival) && (status === "pending" || status === "" || payment?.method === "pay_on_arrival")) {
      return { ok: true, payment_status: "pending" };
    }
    if (Number(payment?.amount) > 0 && (status === "partial" || status === "authorized")) {
      return { ok: true, payment_status: "partial" };
    }
    return { ok: false, reason: "payment_required" };
  }

  function confirmHold(hold, ctx = {}) {
    if (!hold) return { ok: false, reason: "missing_hold" };
    if (statusId(hold.status) !== "hold") return { ok: false, reason: "not_a_hold" };
    const now = ctx.now || Date.now();
    if (!isHoldActive(hold, now)) {
      return { ok: false, reason: "expired", booking: { ...hold, status: "expired", payment_status: "failed" } };
    }
    const pay = paymentAllowsConfirm(ctx.payment, ctx.settings);
    if (!pay.ok) {
      return {
        ok: false,
        reason: pay.reason,
        booking: { ...hold, status: "hold", payment_status: pay.reason === "payment_failed" ? "failed" : "pending" },
      };
    }
    const room = ctx.room || (ctx.rooms || []).find((r) => String(r.id) === String(hold.room_id));
    if (!room) return { ok: false, reason: "room_missing" };
    const stay = {
      checkIn: hold.check_in,
      checkOut: hold.check_out,
      adults: hold.adults,
      children: hold.children,
    };
    const avail = roomAvailableOnDates(room, stay, {
      bookings: expireHolds(ctx.bookings || [], now),
      blocks: ctx.blocks || [],
      now,
      today: ctx.today,
      timezone: ctx.settings?.timezone,
      ignoreId: hold.id,
      ignoreHolds: true,
    });
    if (!avail.ok) {
      return { ok: false, reason: avail.reason, alternatives: ctx.alternatives || [] };
    }
    const paid = round2(ctx.payment?.amount || (pay.payment_status === "paid" ? hold.total : 0));
    const booking = {
      ...hold,
      status: "confirmed",
      payment_status: pay.payment_status,
      paid,
      due: round2(Math.max(0, Number(hold.total) - paid)),
      confirmed_at: asDate(now).toISOString(),
      hold: false,
    };
    return { ok: true, booking };
  }

  function confirmFirstWins(holds, ctx) {
    let bookings = expireHolds(ctx.bookings || [], ctx.now);
    return (holds || []).map((hold) => {
      const result = confirmHold(hold, { ...ctx, bookings });
      if (result.ok) {
        bookings = bookings.map((row) => (row.id === hold.id ? result.booking : row));
        if (!bookings.some((row) => row.id === hold.id)) bookings = bookings.concat(result.booking);
      }
      return result;
    });
  }

  function cancelBooking(booking, ctx = {}) {
    const s = statusId(booking?.status);
    if (!booking) return { ok: false, reason: "missing" };
    if (s === "cancelled") return { ok: false, reason: "already_cancelled" };
    if (s === "checked_out") return { ok: false, reason: "checked_out" };
    if (s === "hold" && !isHoldActive(booking, ctx.now)) {
      return { ok: true, booking: { ...booking, status: "expired" } };
    }
    return {
      ok: true,
      booking: {
        ...booking,
        status: "cancelled",
        cancelled_at: asDate(ctx.now).toISOString(),
        cancel_reason: ctx.reason || "",
      },
    };
  }

  function isWeekend(date, weekendDays) {
    const days = Array.isArray(weekendDays) && weekendDays.length ? weekendDays : [0, 6];
    const d = new Date(`${ymd(date)}T12:00:00`);
    return days.includes(d.getDay());
  }

  function rateForDate(room, date, settings) {
    const day = ymd(date);
    const overrides = room?.date_rates || settings?.date_rates || [];
    const hit = overrides.find((r) => ymd(r.date) === day);
    if (hit && Number(hit.rate) > 0) return round2(hit.rate);
    const seasons = room?.seasons || settings?.seasons || [];
    const season = seasons.find((s) => datesOverlap(day, addDays(day, 1), s.start, addDays(s.end, 1)) || (ymd(s.start) <= day && day <= ymd(s.end)));
    if (season && Number(season.rate) > 0) return round2(season.rate);
    if (isWeekend(day, settings?.weekend_days) && Number(room?.weekend_rate || settings?.weekend_rate) > 0) {
      return round2(room.weekend_rate || settings.weekend_rate);
    }
    if (!isWeekend(day, settings?.weekend_days) && Number(room?.weekday_rate) > 0) return round2(room.weekday_rate);
    return round2(room?.rate || room?.standard_rate || 0);
  }

  function stayPrice({ room, checkIn, checkOut, adults, children, settings, extras, coupon }) {
    const nights = eachNight(checkIn, checkOut);
    const nightly = nights.map((date) => ({ date, rate: rateForDate(room, date, settings) }));
    const roomTotal = round2(nightly.reduce((sum, n) => sum + n.rate, 0));
    const baseAdults = Number(room?.base_adults) || 2;
    const extraAdults = Math.max(0, (Number(adults) || 1) - baseAdults);
    const extraChildren = Math.max(0, Number(children) || 0);
    const extraAdult = round2(extraAdults * nights.length * (Number(room?.extra_adult_rate ?? settings?.extra_adult_rate) || 0));
    const extraChild = round2(extraChildren * nights.length * (Number(room?.extra_child_rate ?? settings?.extra_child_rate) || 0));
    const extraBed = round2((Number(extras?.extra_beds) || 0) * nights.length * (Number(room?.extra_bed_rate ?? settings?.extra_bed_rate) || 0));
    const meal = round2(Number(extras?.meal_plan) || 0);
    const services = round2(
      (Array.isArray(extras?.services) ? extras.services : []).reduce((sum, s) => sum + (Number(s.amount) || 0), 0),
    );
    const extrasTotal = round2(extraAdult + extraChild + extraBed + meal + services);
    const subtotal = round2(roomTotal + extrasTotal);
    let discount = round2(Number(extras?.discount) || Number(coupon?.amount) || 0);
    if (coupon?.percent) discount = round2(subtotal * (Number(coupon.percent) / 100));
    const taxable = round2(Math.max(0, subtotal - discount));
    const taxRate = Number(room?.tax_rate ?? settings?.tax_rate) || 0;
    const serviceRate = Number(room?.service_rate ?? settings?.service_rate) || 0;
    const tax = round2(taxable * (taxRate / 100));
    const service = round2(taxable * (serviceRate / 100));
    const total = round2(taxable + tax + service);
    return {
      nights: nights.length,
      nightly,
      room: roomTotal,
      extra_adult: extraAdult,
      extra_child: extraChild,
      extra_bed: extraBed,
      meal,
      services,
      extras: extrasTotal,
      discount,
      subtotal,
      tax,
      service,
      tax_rate: taxRate,
      service_rate: serviceRate,
      total,
    };
  }

  function folioTotals({ roomCharges, extras, restaurant, taxes, service, discount, payments, deposit, lateFee }) {
    const room = round2(roomCharges);
    const extra = round2(extras);
    const resto = round2(restaurant);
    const late = round2(lateFee);
    const tax = round2(taxes);
    const svc = round2(service);
    const disc = round2(discount);
    const subtotal = round2(room + extra + resto + late);
    const total = round2(Math.max(0, subtotal + tax + svc - disc));
    const paid = round2(payments);
    const dep = round2(deposit);
    const due = round2(Math.max(0, total - paid));
    return { room, extras: extra, restaurant: resto, late_fee: late, tax, service: svc, discount: disc, subtotal, total, paid, deposit: dep, due };
  }

  function occupancyPct(occupied, available) {
    const rooms = Number(available);
    if (!rooms) return 0;
    return round2((Number(occupied) / rooms) * 100);
  }

  function adr(roomRevenue, roomsSold) {
    const sold = Number(roomsSold);
    if (!sold) return 0;
    return round2(Number(roomRevenue) / sold);
  }

  function revpar(roomRevenue, roomsAvailable) {
    const avail = Number(roomsAvailable);
    if (!avail) return 0;
    return round2(Number(roomRevenue) / avail);
  }

  function canCheckIn(booking, room, today) {
    if (!booking) return { ok: false, reason: "missing" };
    const s = statusId(booking.status);
    if (s !== "confirmed" && s !== "pending") return { ok: false, reason: "not_confirmed" };
    const day = ymd(today);
    if (day && ymd(booking.check_in) > day) return { ok: false, reason: "too_early" };
    if (room && statusId(room.physical_status) === "maintenance") return { ok: false, reason: "maintenance" };
    return { ok: true };
  }

  function applyCheckIn(booking, room, now) {
    const gate = canCheckIn(booking, room, ymdInZone(now));
    if (!gate.ok) return gate;
    return {
      ok: true,
      booking: { ...booking, status: "checked_in", checked_in_at: asDate(now).toISOString() },
      room: room ? { ...room, physical_status: "occupied", hk_status: "occupied" } : room,
    };
  }

  function canCheckOut(booking) {
    if (!booking) return { ok: false, reason: "missing" };
    if (statusId(booking.status) !== "checked_in") return { ok: false, reason: "not_in_house" };
    return { ok: true };
  }

  function applyCheckOut(booking, room, invoice, now, settings) {
    const gate = canCheckOut(booking);
    if (!gate.ok) return gate;
    const nextStatus = settings?.checkout_status || "cleaning";
    return {
      ok: true,
      booking: {
        ...booking,
        status: "checked_out",
        checked_out_at: asDate(now).toISOString(),
        invoice,
        payment_status: invoice?.due > 0 ? "partial" : "paid",
      },
      room: room ? { ...room, physical_status: nextStatus, hk_status: "dirty" } : room,
    };
  }

  function canPostFolio(booking, actor = {}) {
    if (!booking) return false;
    const s = statusId(booking.status);
    if (s === "checked_out" || s === "cancelled" || s === "no_show" || s === "expired") return false;
    if (s !== "checked_in" && s !== "confirmed") return false;
    const role = String(actor.role || "");
    if (role === "housekeeping" || role === "maintenance") return false;
    if (actor.sameStay === false) return false;
    return true;
  }

  function linkRestaurantCharge(order, booking) {
    if (!canPostFolio(booking)) return { ok: false, reason: "folio_closed" };
    const linkedStay = order?.stay_id || order?.booking_id || "";
    if (linkedStay && String(linkedStay) !== String(booking.id)) {
      return { ok: false, reason: "wrong_stay" };
    }
    return {
      ok: true,
      charge: {
        id: order.id || makeId("RST"),
        kind: "restaurant",
        booking_id: booking.id,
        room_id: booking.room_id,
        stay_id: booking.id,
        guest_name: booking.guest_name,
        amount: round2(order.total || order.amount),
        note: order.note || order.bill_no || "Restaurant",
      },
    };
  }

  const FINANCIAL_ACTIONS = new Set([
    "reports.financial",
    "refund",
    "rate_change",
    "modify_payment",
  ]);

  function canAccess(role, action) {
    const r = String(role || "");
    if (r === "master_admin" || r === "super_admin") return true;
    if (r === "business_admin" || r === "resort_owner" || r === "property_manager") return true;
    if (action === "reports.financial") {
      return r === "accountant";
    }
    if (action === "refund" || action === "rate_change" || action === "modify_payment") {
      return r === "accountant" || r === "cashier" ? action === "modify_payment" && r === "cashier" : false;
    }
    if (action === "block_room") return r === "receptionist" || r === "reservation_executive";
    if (action === "housekeeping") return r === "housekeeping" || r === "receptionist";
    if (action === "maintenance") return r === "maintenance" || r === "receptionist";
    if (action === "bookings.view") {
      return ["receptionist", "reservation_executive", "cashier", "restaurant_manager"].includes(r);
    }
    if (action === "bookings.guest_pii") {
      return ["receptionist", "reservation_executive", "property_manager", "resort_owner", "business_admin"].includes(r);
    }
    if (FINANCIAL_ACTIONS.has(action)) return false;
    return false;
  }

  function redactGuest(booking, role) {
    if (canAccess(role, "bookings.guest_pii") || ["business_admin", "resort_owner", "property_manager", "master_admin"].includes(String(role || ""))) {
      return booking;
    }
    return {
      ...booking,
      guest_name: "",
      guest_mobile: "",
      guest_email: "",
      id_number: "",
    };
  }

  function bookingBucket(booking, today) {
    const day = ymd(today);
    const s = statusId(booking.status);
    if (s === "cancelled") return "cancelled";
    if (s === "no_show") return "no_show";
    if (s === "hold" || s === "pending") return Number(booking.paid) > 0 ? "pending_payment" : "pending";
    if (s === "checked_in") return "in_house";
    if (s === "checked_out") return "checked_out";
    if (s === "confirmed" && ymd(booking.check_in) === day) return "arrivals";
    if (s === "checked_in" && ymd(booking.check_out) === day) return "departures";
    if (s === "confirmed" && ymd(booking.check_in) > day) return "upcoming";
    return s;
  }

  function classifyBookings(bookings, today) {
    const groups = {
      all: bookings || [],
      arrivals: [],
      departures: [],
      in_house: [],
      upcoming: [],
      pending: [],
      pending_payment: [],
      cancelled: [],
      no_show: [],
    };
    for (const row of bookings || []) {
      const bucket = bookingBucket(row, today);
      if (groups[bucket]) groups[bucket].push(row);
      if (statusId(row.status) === "checked_in" && ymd(row.check_out) === ymd(today)) groups.departures.push(row);
    }
    return groups;
  }

  function minStayOk(nights, settings) {
    const min = Number(settings?.min_stay) || 1;
    const max = Number(settings?.max_stay) || 365;
    return nights >= min && nights <= max;
  }

  return {
    ROOM_CATEGORIES,
    PHYSICAL_STATUSES,
    HOUSEKEEPING_STATUSES,
    BOOKING_STATUSES,
    PAY_STATUSES,
    PAY_MODES,
    BOOKING_SOURCES,
    DEFAULT_AMENITIES,
    EXTRA_SERVICES,
    ROLES,
    REPORTS,
    DEFAULT_SETTINGS,
    round2,
    flagOn,
    ymd,
    ymdInZone,
    addDays,
    nightsBetween,
    eachNight,
    datesOverlap,
    statusId,
    categoryId,
    categoryLabel,
    physicalLabel,
    isStandaloneResortType,
    isResortCategory,
    isResortShop,
    normalizeResortEnabled,
    isHoldActive,
    bookingBlocksDates,
    expireHolds,
    roomAvailableOnDates,
    searchAvailability,
    publicRoomCard,
    createHold,
    confirmHold,
    confirmFirstWins,
    cancelBooking,
    paymentAllowsConfirm,
    stayPrice,
    rateForDate,
    folioTotals,
    occupancyPct,
    adr,
    revpar,
    canCheckIn,
    canCheckOut,
    applyCheckIn,
    applyCheckOut,
    canPostFolio,
    linkRestaurantCharge,
    canAccess,
    redactGuest,
    classifyBookings,
    bookingBucket,
    bookingRef,
    holdMinutes,
    minStayOk,
  };
});
