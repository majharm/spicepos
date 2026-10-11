import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const vm = require("node:vm");

function loadBrowser(file) {
  const code = readFileSync(new URL(file, import.meta.url), "utf8");
  const sandbox = { console, Date, Math, Number, String, Array, Object, Map, Set, JSON };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

const footwear = loadBrowser("./footwear.js");
const resort = loadBrowser("./resort.js");
const F = footwear.POSFootwear;
const R = resort.POSResort;

function read(rel) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

const rooms = [
  {
    id: "101",
    number: "101",
    category: "deluxe",
    name: "Deluxe 101",
    max_adults: 2,
    max_children: 1,
    rate: 4000,
    weekday_rate: 4000,
    weekend_rate: 4800,
    extra_adult_rate: 800,
    extra_child_rate: 400,
    tax_rate: 12,
    active: 1,
    physical_status: "occupied",
    photos: ["101.jpg"],
    amenities: ["AC", "Wi-Fi"],
  },
  {
    id: "102",
    number: "102",
    category: "deluxe",
    name: "Deluxe 102",
    max_adults: 2,
    max_children: 1,
    rate: 4000,
    active: 1,
    physical_status: "reserved",
  },
  {
    id: "103",
    number: "103",
    category: "deluxe",
    name: "Deluxe 103",
    max_adults: 2,
    max_children: 1,
    rate: 4000,
    active: 1,
    physical_status: "available",
  },
  {
    id: "104",
    number: "104",
    category: "suite",
    name: "Suite 104",
    max_adults: 3,
    max_children: 2,
    rate: 8000,
    active: 1,
    physical_status: "available",
  },
];

const bookings = [
  { id: "b1", room_id: "101", status: "checked_in", check_in: "2026-10-11", check_out: "2026-10-13", guest_name: "Secret Guest" },
  { id: "b2", room_id: "102", status: "confirmed", check_in: "2026-10-12", check_out: "2026-10-14", guest_name: "Reserved Guest" },
];

const blocks = [{ id: "m1", room_id: "104", kind: "maintenance", start: "2026-10-12", end: "2026-10-16" }];
const today = "2026-10-11";
const now = new Date("2026-10-11T09:00:00+05:30");

function ctx(extra = {}) {
  return { bookings, blocks, today, now, ...extra };
}

test("Resort shop kind stays restaurant; only authorized shops enable the model", () => {
  assert.equal(F.shopKind({ business_type: "Resort" }), "restaurant");
  assert.equal(F.shopKind({ business_type: "Resort & Restaurant" }), "restaurant");
  assert.equal(F.shopKind({ category: "Resort & Restaurant with Room Booking" }), "restaurant");
  assert.equal(F.shopKind({ business_type: "Restaurant" }), "restaurant");
  assert.equal(F.isRestaurantShop({ business_type: "Resort" }), true);
  assert.equal(R.isResortShop({ business_type: "Restaurant" }), false);
  assert.equal(R.isResortShop({ business_type: "Restaurant", name: "Hillside Resort Cafe" }), false);
  assert.equal(R.isResortShop({ business_type: "Restaurant", resort_enabled: 1 }), true);
  assert.equal(R.isResortShop({ business_type: "Resort" }), true);
  assert.equal(R.isResortShop({ category: "Resort & Restaurant with Room Booking" }), true);
  assert.equal(R.normalizeResortEnabled(0, "Resort", ""), 1);
  assert.equal(R.normalizeResortEnabled(0, "Restaurant", "Food & beverage"), 0);
  assert.equal(R.normalizeResortEnabled(1, "Restaurant", "Food & beverage"), 1);
  assert.equal(F.isRestaurantShop({ business_type: "Restaurant", resort_enabled: 1 }), true);
});

test("1 occupied room cannot be booked for conflicting dates", () => {
  const stay = { checkIn: "2026-10-11", checkOut: "2026-10-12", adults: 2 };
  assert.equal(R.roomAvailableOnDates(rooms[0], stay, ctx()).ok, false);
  assert.equal(R.roomAvailableOnDates(rooms[0], stay, ctx()).reason, "booked");
  const search = R.searchAvailability({ rooms, bookings, blocks, ...stay, today, now });
  assert.equal(search.available_rooms.some((r) => r.id === "101"), false);
  assert.equal(JSON.stringify(search).includes("Secret Guest"), false);
});

test("2 occupied today can be booked after checkout", () => {
  const stay = { checkIn: "2026-10-13", checkOut: "2026-10-15", adults: 2 };
  assert.equal(R.roomAvailableOnDates(rooms[0], stay, ctx()).ok, true);
  const search = R.searchAvailability({ rooms, bookings, blocks, ...stay, today, now });
  assert.equal(search.available_rooms.some((r) => r.id === "101"), true);
});

test("3 reserved room is removed from overlapping online availability", () => {
  const stay = { checkIn: "2026-10-12", checkOut: "2026-10-13", adults: 2 };
  assert.equal(R.roomAvailableOnDates(rooms[1], stay, ctx()).ok, false);
  const search = R.searchAvailability({ rooms, bookings, blocks, ...stay, today, now });
  assert.equal(search.available_rooms.some((r) => r.id === "102"), false);
  assert.equal(search.available_rooms.some((r) => r.id === "103"), true);
  assert.equal(JSON.stringify(search).includes("Reserved Guest"), false);
});

test("4 maintenance-blocked room cannot be booked during the block", () => {
  const stay = { checkIn: "2026-10-12", checkOut: "2026-10-13", adults: 2 };
  assert.equal(R.roomAvailableOnDates(rooms[3], stay, ctx()).reason, "maintenance");
  const later = R.roomAvailableOnDates(rooms[3], { checkIn: "2026-10-16", checkOut: "2026-10-18", adults: 2 }, ctx());
  assert.equal(later.ok, true);
});

test("5 two simultaneous confirms cannot both take the same room", () => {
  const room = rooms[2];
  const stay = { checkIn: "2026-10-11", checkOut: "2026-10-13", adults: 2 };
  const holdA = R.createHold({ room, stay, guest: { name: "A" }, settings: { hold_minutes: 10 }, now });
  const holdB = R.createHold({ room, stay, guest: { name: "B" }, settings: { hold_minutes: 10 }, now });
  const results = R.confirmFirstWins([holdA, holdB], {
    rooms,
    bookings: [holdA, holdB, ...bookings],
    blocks,
    now,
    today,
    payment: { status: "paid", amount: holdA.total },
  });
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.equal(results.filter((r) => r.ok).length, 1);
});

test("6 expired hold releases availability automatically", () => {
  const room = rooms[2];
  const stay = { checkIn: "2026-10-11", checkOut: "2026-10-13", adults: 2 };
  const hold = R.createHold({ room, stay, guest: { name: "Late" }, settings: { hold_minutes: 10 }, now });
  const later = new Date(now.getTime() + 11 * 60 * 1000);
  const expired = R.expireHolds([hold], later);
  assert.equal(expired[0].status, "expired");
  assert.equal(R.roomAvailableOnDates(room, stay, { bookings: expired, now: later, today }).ok, true);
  const confirm = R.confirmHold(hold, { room, bookings: [hold], now: later, today, payment: { status: "paid", amount: hold.total } });
  assert.equal(confirm.ok, false);
  assert.equal(confirm.reason, "expired");
});

test("7 failed payment does not create a paid booking", () => {
  const room = rooms[2];
  const stay = { checkIn: "2026-10-11", checkOut: "2026-10-13", adults: 2 };
  const hold = R.createHold({ room, stay, guest: { name: "Pay" }, settings: { hold_minutes: 10 }, now });
  const failed = R.confirmHold(hold, { room, bookings: [hold], now, today, payment: { status: "failed" } });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, "payment_failed");
  assert.equal(failed.booking.status, "hold");
  assert.equal(failed.booking.payment_status, "failed");
  const pending = R.confirmHold(hold, { room, bookings: [hold], now, today, payment: { status: "pending" } });
  assert.equal(pending.ok, false);
});

test("8 confirmed booking immediately leaves online availability", () => {
  const room = rooms[2];
  const stay = { checkIn: "2026-10-11", checkOut: "2026-10-13", adults: 2 };
  const hold = R.createHold({ room, stay, guest: { name: "Now" }, settings: { hold_minutes: 10 }, now });
  const confirmed = R.confirmHold(hold, {
    room,
    bookings: [hold],
    now,
    today,
    payment: { status: "paid", amount: hold.total },
  });
  assert.equal(confirmed.ok, true);
  const search = R.searchAvailability({
    rooms,
    bookings: [confirmed.booking, ...bookings],
    blocks,
    ...stay,
    today,
    now,
  });
  assert.equal(search.available_rooms.some((r) => r.id === "103"), false);
});

test("9 cancellation releases availability only after it is processed", () => {
  const live = { id: "b9", room_id: "103", status: "confirmed", check_in: "2026-10-11", check_out: "2026-10-13" };
  const stay = { checkIn: "2026-10-11", checkOut: "2026-10-13", adults: 2 };
  assert.equal(R.roomAvailableOnDates(rooms[2], stay, { bookings: [live], today, now }).ok, false);
  const cancelled = R.cancelBooking(live, { now });
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.booking.status, "cancelled");
  assert.equal(R.roomAvailableOnDates(rooms[2], stay, { bookings: [cancelled.booking], today, now }).ok, true);
});

test("10 checked-out room stays unavailable until it is ready", () => {
  const dirty = { ...rooms[2], physical_status: "cleaning" };
  const sameDay = R.roomAvailableOnDates(dirty, { checkIn: "2026-10-11", checkOut: "2026-10-12", adults: 2 }, ctx());
  assert.equal(sameDay.ok, false);
  assert.equal(sameDay.reason, "not_ready");
  const later = R.roomAvailableOnDates(dirty, { checkIn: "2026-10-12", checkOut: "2026-10-14", adults: 2 }, ctx());
  assert.equal(later.ok, true);
});

test("11 restaurant charges post only to the active stay folio", () => {
  const stay = { id: "st1", status: "checked_in", room_id: "101", guest_name: "Patel" };
  const linked = R.linkRestaurantCharge({ id: "kot-1", total: 850, bill_no: "KOT-4" }, stay);
  assert.equal(linked.ok, true);
  assert.equal(linked.charge.booking_id, "st1");
  assert.equal(linked.charge.amount, 850);
  assert.equal(R.canPostFolio({ status: "checked_out" }), false);
  assert.equal(R.canPostFolio(stay, { role: "housekeeping" }), false);
  assert.equal(R.canPostFolio({ status: "cancelled" }), false);
});

test("12 final invoice includes room, services, restaurant, tax, and payments", () => {
  const price = R.stayPrice({
    room: rooms[0],
    checkIn: "2026-10-13",
    checkOut: "2026-10-15",
    adults: 3,
    children: 1,
    settings: { tax_rate: 12, extra_adult_rate: 800, extra_child_rate: 400 },
    extras: { services: [{ amount: 500, name: "Laundry" }] },
  });
  assert.equal(price.nights, 2);
  assert.ok(price.room > 0);
  assert.ok(price.extra_adult > 0);
  assert.ok(price.tax > 0);
  const invoice = R.folioTotals({
    roomCharges: price.room,
    extras: price.extras,
    restaurant: 850,
    taxes: price.tax,
    service: price.service,
    discount: 0,
    payments: 2000,
    deposit: 1000,
    lateFee: 300,
  });
  assert.equal(invoice.restaurant, 850);
  assert.equal(invoice.late_fee, 300);
  assert.ok(invoice.total > invoice.paid);
  assert.equal(invoice.due, R.round2(invoice.total - invoice.paid));
});

test("13 Master Admin activation is per business and restaurant stays restaurant", () => {
  assert.equal(R.isResortShop({ business_type: "Restaurant" }), false);
  assert.equal(R.isResortShop({ business_type: "Restaurant", resort_enabled: 0 }), false);
  assert.equal(R.isResortShop({ business_type: "Cafe", resort_enabled: 1 }), true);
  assert.equal(F.shopKind({ business_type: "Cafe", resort_enabled: 1 }), "restaurant");
  assert.equal(R.canAccess("master_admin", "rate_change"), true);
});

test("14 unauthorized roles cannot read guest PII or financial controls", () => {
  const booking = { guest_name: "Asha", guest_mobile: "9999999999", guest_email: "a@b.c", id_number: "X" };
  const hidden = R.redactGuest(booking, "housekeeping");
  assert.equal(hidden.guest_name, "");
  assert.equal(hidden.guest_mobile, "");
  assert.equal(R.canAccess("housekeeping", "reports.financial"), false);
  assert.equal(R.canAccess("maintenance", "refund"), false);
  assert.equal(R.canAccess("restaurant_staff", "rate_change"), false);
  assert.ok(R.canAccess("receptionist", "bookings.view"));
  assert.equal(R.canAccess("housekeeping", "bookings.guest_pii"), false);
});

test("dates use exclusive checkout and stay pricing is date-aware", () => {
  assert.equal(R.datesOverlap("2026-10-11", "2026-10-13", "2026-10-13", "2026-10-15"), false);
  assert.equal(R.nightsBetween("2026-10-11", "2026-10-13"), 2);
  assert.equal(R.minStayOk(1, { min_stay: 2 }), false);
  const weekend = R.rateForDate({ rate: 4000, weekend_rate: 4800 }, "2026-10-11", { weekend_days: [0, 6] });
  assert.equal(weekend, 4800);
});

test("Resort POS, PHP, signup, Master Admin toggle, and hub are wired", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const node = read("server/index.js");
  const core = read("pos-php-core.php");
  assert.match(index, /id="view-resort-board"/);
  assert.match(index, /id="view-resort-rooms"/);
  assert.match(index, /id="view-resort-bookings"/);
  assert.match(index, /id="view-resort-desk"/);
  assert.match(index, /id="view-resort-housekeeping"/);
  assert.match(index, /id="resort-settings-box"/);
  assert.match(index, /js\/resort\.js\?v=20261011resort1/);
  assert.match(index, /js\/resort-ui\.js\?v=20261011resort1/);
  assert.match(index, /css\/resort\.css\?v=20261011resort1/);
  assert.match(index, /receptionist/);
  assert.match(index, /housekeeping/);
  assert.match(app, /function isResortShop/);
  assert.match(app, /resort-mode/);
  assert.match(node, /registerResortStaff/);
  assert.match(node, /ensureResortSchema/);
  assert.match(core, /pos_resort_staff_dispatch/);
  assert.match(core, /function pos_is_resort_shop/);
  assert.match(core, /resort_enabled/);
  assert.match(read("js/login.js"), /Resort & Restaurant with Room Booking/);
  assert.match(read("js/master.js"), /Resort & Restaurant/);
  assert.match(read("js/master.js"), /resortEnabled/);
  assert.match(read("js/master.js"), /Enable Resort Business Model/);
  assert.match(read("login.html"), />Resort</);
  assert.match(read("login.html"), /Resort &amp; Restaurant with Room Booking/);
  assert.match(read("home.html"), /Resort &amp; Restaurant/);
  assert.match(read("js/biz-hub.js"), /resort-board/);
  assert.match(read("server/onboard.js"), /resort_enabled/);
  assert.match(read("server/roles.js"), /receptionist/);
  assert.match(read("package.json"), /js\/resort\.test\.js/);
  assert.match(read("pos-resort.php"), /function pos_resort_staff_dispatch/);
  assert.match(read("server/resort.js"), /FOR UPDATE/);
  assert.match(read("resort-book.html"), /Check-in/);
  assert.ok(R.REPORTS.length >= 8);
  assert.ok(R.PAY_MODES.includes("upi"));
  assert.equal(R.ROLES.some((r) => r.id === "receptionist"), true);
});
