import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./footwear.js";
import "./restaurant.js";
import "./counter-desk.js";

const Desk = globalThis.POSCounterDesk;
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, "..", rel), "utf8");

const SHARED_SHOPS = [
  { category: "Garment & Fashion" },
  { business_type: "Pharmacy" },
  { category: "Grocery / Retail" },
  { category: "Supermarket" },
  { category: "Salon / Spa" },
  { category: "Beauty Parlour" },
  { category: "Electronics" },
  { category: "Jewellery" },
  { category: "Medical / Healthcare" },
  { business_type: "printing" },
  { category: "Services" },
  { category: "Kirana / FMCG" },
];

const RESTAURANT_SHOPS = [
  { business_type: "Restaurant" },
  { business_type: "Cafe" },
  { business_type: "Bakery" },
  { category: "Food & beverage" },
];

function memoryStore(start = {}) {
  const data = { ...start };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    data,
  };
}

test("Shared Counter applies to non-restaurant shops and excludes Restaurant & Cafe", () => {
  for (const shop of SHARED_SHOPS) {
    assert.equal(Desk.isSharedCounterShop(shop), true, JSON.stringify(shop));
    assert.equal(Desk.isRestaurantShop(shop), false, JSON.stringify(shop));
  }
  for (const shop of RESTAURANT_SHOPS) {
    assert.equal(Desk.isSharedCounterShop(shop), false, JSON.stringify(shop));
    assert.equal(Desk.isRestaurantShop(shop), true, JSON.stringify(shop));
    assert.deepEqual(Desk.bodyLayoutClasses(shop, "mobile"), { desktop: false, mobile: false });
    assert.deepEqual(Desk.bodyLayoutClasses(shop, "desktop"), { desktop: false, mobile: false });
  }
});

test("Default counters are unique and Counter 1 / Counter 2 never share a cart", () => {
  const list = Desk.defaultCounters();
  assert.equal(list.length, 3);
  assert.deepEqual(list.map((row) => row.id), ["c1", "c2", "c3"]);
  assert.deepEqual(list.map((row) => row.name), ["Counter 1", "Counter 2", "Counter 3"]);
  assert.ok(list.every((row) => row.status === "active"));

  const store = memoryStore();
  const one = { cart: [{ itemId: "kurti", qtyGm: 2 }], customerId: "cust-a", billDiscountValue: 10 };
  const two = { cart: [{ itemId: "shirt", qtyGm: 1 }], customerId: "cust-b", billDiscountValue: 0 };
  Desk.saveSession("c1", Desk.snapshotSession(one), store);
  Desk.saveSession("c2", Desk.snapshotSession(two), store);
  assert.equal(Desk.sessionOf("c1", store).cart[0].itemId, "kurti");
  assert.equal(Desk.sessionOf("c2", store).cart[0].itemId, "shirt");
  assert.notEqual(Desk.sessionOf("c1", store).customerId, Desk.sessionOf("c2", store).customerId);

  const live = { cart: [{ itemId: "kurti", qtyGm: 2 }], customerId: "cust-a", billDiscountType: "amt", billDiscountValue: 10 };
  Desk.switchCounter("c1", "c2", live, {}, store);
  assert.equal(live.cart[0].itemId, "shirt");
  assert.equal(live.customerId, "cust-b");
  assert.equal(Desk.sessionOf("c1", store).cart[0].itemId, "kurti");
  live.cart[0].qtyGm = 9;
  assert.equal(Desk.sessionOf("c2", store).cart[0].qtyGm, 1);
});

test("Layout prefers a manual switch and otherwise follows the device", () => {
  const storage = memoryStore();
  assert.equal(Desk.resolveLayout("", () => ({ matches: true })), "mobile");
  assert.equal(Desk.resolveLayout("", () => ({ matches: false })), "desktop");
  Desk.saveLayoutPref("desktop", storage);
  assert.equal(Desk.savedLayoutPref(storage), "desktop");
  assert.equal(Desk.resolveLayout(Desk.savedLayoutPref(storage), () => ({ matches: true })), "desktop");
  Desk.saveLayoutPref("mobile", storage);
  assert.equal(Desk.resolveLayout(Desk.savedLayoutPref(storage), () => ({ matches: false })), "mobile");
  const garment = { category: "Garment & Fashion" };
  assert.deepEqual(Desk.bodyLayoutClasses(garment, "mobile"), { desktop: false, mobile: true });
  assert.deepEqual(Desk.bodyLayoutClasses(garment, "desktop"), { desktop: true, mobile: false });
});

test("Counter definitions normalize ids, status, and operator assignment", () => {
  const rows = Desk.normalizeCounters({
    counters: [
      { id: "C1", name: "Front desk", status: "active", operator_id: "staff-1" },
      { id: "c1", name: "Duplicate", status: "inactive" },
      { name: "Back office" },
    ],
  });
  assert.equal(rows[0].id, "c1");
  assert.equal(rows[0].operator_id, "staff-1");
  assert.equal(rows[1].id, "c1-2");
  assert.equal(rows[1].status, "inactive");
  assert.equal(rows[2].name, "Back office");
  assert.equal(Desk.pickActiveId(rows, "c1-2"), "c1");
  assert.equal(Desk.pickActiveId(rows, "c1"), "c1");
  const added = Desk.addCounter(rows);
  assert.ok(added.some((row) => row.name.startsWith("Counter")));
  const parsed = JSON.parse(Desk.serializeCounters(added));
  assert.ok(Array.isArray(parsed.counters));
});

test("Shared Counter markup and restaurant isolation stay wired", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const css = read("css/pos.css");
  const tenant = read("server/tenant.js");
  const schema = read("server/schema.js");
  const core = read("pos-php-core.php");
  const till = read("pos-php-till.php");

  assert.match(index, /id="counter-desk-bar"/);
  assert.match(index, /id="counter-layout-desktop"/);
  assert.match(index, /id="counter-layout-mobile"/);
  assert.match(index, /Windows\/Desktop/);
  assert.match(index, /id="counter-chips"/);
  assert.match(index, /id="set-pos-counters"/);
  assert.match(index, /shared-counter-only/);
  assert.match(index, /counter-desk\.js\?v=20260925cd1/);
  assert.match(index, /pos\.css\?v=20260925cd1/);
  assert.match(index, /app\.js\?v=20260925cd1/);

  assert.match(app, /function isSharedCounterShop/);
  assert.match(app, /function applyCounterDeskChrome/);
  assert.match(app, /function persistPosCounters/);
  assert.match(app, /function switchSharedCounter/);
  assert.match(app, /POSCounterDesk/);
  assert.match(app, /counter_id: isSharedCounterShop\(\) \? activeSharedCounterId\(\)/);
  assert.match(app, /if \(!isSharedCounterShop\(\)\) \{\s*document\.body\.classList\.remove\("counter-desktop", "counter-mobile"\)/);

  assert.match(css, /shared-counter-desk/);
  assert.match(css, /body\.counter-desktop:not\(\.restaurant-mode\)/);
  assert.match(css, /body\.counter-mobile:not\(\.restaurant-mode\)/);
  assert.match(css, /body\.restaurant-mode \.shared-counter-only/);
  assert.match(css, /min-height: 44px/);
  assert.doesNotMatch(css, /body\.restaurant-mode\.counter-desktop/);
  assert.doesNotMatch(css, /body\.restaurant-mode\.counter-mobile/);

  assert.match(tenant, /\/api\/pos-counters/);
  assert.match(tenant, /function clipPosCountersJson/);
  assert.match(schema, /pos_counters_json/);
  assert.match(core, /function pos_clip_pos_counters_json/);
  assert.match(core, /pos_counters_json/);
  assert.match(till, /pos-counters/);
  assert.match(read("api/pos-counters/index.php"), /pos-counters/);
});
