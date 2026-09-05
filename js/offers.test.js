import test from "node:test";
import assert from "node:assert/strict";
import "./offers.js";

const O = globalThis.POSOffers;

function line(id, gross, extra = {}) {
  return { itemId: id, lineId: id, qty: extra.qty ?? 1, qtyGm: extra.qty ?? 1, isCount: extra.isCount !== false, gross, taxable: gross, total: gross, category: extra.category || "", item: { id, category: extra.category || "" } };
}

test("combo offer needs both items and can use a fixed combo price", () => {
  const offer = O.normalize({
    name: "Tea + Biscuits",
    type: "combo",
    status: "active",
    discount_type: "combo_price",
    offer_price: 179,
    item_ids: ["tea", "biscuits"],
  });
  assert.ok(offer);
  const miss = O.evaluateOffer(offer, { cart: [line("tea", 150)], now: new Date("2026-09-05T10:00:00") });
  assert.equal(miss, null);
  const hit = O.evaluateOffer(offer, { cart: [line("tea", 150), line("biscuits", 50)], now: new Date("2026-09-05T10:00:00") });
  assert.equal(hit.discount, 21);
  assert.equal(hit.scope, "bill");
});

test("buy 2 get 1 free on the same item", () => {
  const offer = O.normalize({
    name: "Buy 2 Get 1",
    type: "bogo",
    status: "active",
    item_ids: ["soap"],
    buy_qty: 2,
    get_qty: 1,
    get_item_id: "soap",
  });
  const hit = O.evaluateOffer(offer, {
    cart: [line("soap", 90, { qty: 3, isCount: true })],
    now: new Date("2026-09-05T10:00:00"),
  });
  assert.ok(hit);
  assert.equal(hit.discount, 30);
});

test("mix and match pick 3 for 299", () => {
  const offer = O.normalize({
    name: "Pick any 3",
    type: "mix_match",
    status: "active",
    item_ids: ["a", "b", "c", "d"],
    pick_count: 3,
    bundle_price: 299,
  });
  const hit = O.evaluateOffer(offer, {
    cart: [line("a", 120), line("b", 110), line("c", 100)],
    now: new Date("2026-09-05T10:00:00"),
  });
  assert.equal(hit.discount, 31);
});

test("minimum purchase and first-purchase eligibility", () => {
  const offer = O.normalize({
    name: "Welcome ₹100",
    type: "first_purchase",
    status: "active",
    discount_type: "amt",
    discount_value: 100,
    min_spend: 999,
    customer_eligibility: "new",
  });
  const now = new Date("2026-09-05T10:00:00");
  assert.equal(O.evaluateOffer(offer, { cart: [line("x", 500)], customer: { bills: 0 }, now }), null);
  const hit = O.evaluateOffer(offer, { cart: [line("x", 1200)], customer: { bills: 0 }, now });
  assert.equal(hit.discount, 100);
  assert.equal(O.evaluateOffer(offer, { cart: [line("x", 1200)], customer: { bills: 2 }, now }), null);
});

test("happy hours only apply inside the time window", () => {
  const offer = O.normalize({
    name: "Happy hours",
    type: "time",
    status: "active",
    discount_type: "pct",
    discount_value: 15,
    start_time: "16:00",
    end_time: "19:00",
  });
  const cart = [line("tea", 200)];
  assert.equal(O.evaluateOffer(offer, { cart, now: new Date("2026-09-05T10:00:00") }), null);
  const hit = O.evaluateOffer(offer, { cart, now: new Date("2026-09-05T17:00:00") });
  assert.equal(hit.discount, 30);
});

test("stacking keeps one product offer and one bill offer", () => {
  const product = O.normalize({ name: "Tea 10%", type: "product", status: "active", item_ids: ["tea"], discount_type: "pct", discount_value: 10 });
  const bill = O.normalize({ name: "Spend 500", type: "min_purchase", status: "active", discount_type: "amt", discount_value: 50, min_spend: 500 });
  const out = O.evaluateAll([product, bill], {
    cart: [line("tea", 600)],
    now: new Date("2026-09-05T10:00:00"),
    stacking: "product_and_bill",
  });
  assert.equal(out.applied.length, 2);
  assert.ok(out.discount >= 50);
});

test("profit preview warns when margin collapses", () => {
  const offer = O.normalize({ name: "Deep cut", type: "product", status: "draft", item_ids: ["tea"], discount_type: "pct", discount_value: 40 });
  const preview = O.profitPreview(offer, [{ id: "tea", retail_rate: 100, purchase_rate: 80 }]);
  assert.equal(preview.expectedRevenue, 60);
  assert.match(preview.warning, /20%/);
  assert.match(preview.warning, /margin/i);
});

test("duplicate clone keeps products and names the copy", () => {
  const src = O.normalize({
    name: "Tea + Biscuits",
    type: "combo",
    status: "active",
    discount_type: "pct",
    discount_value: 8,
    item_ids: ["tea", "biscuits"],
  });
  src.id = "offer-1";
  src.live_status = "active";
  src.profit = { warning: "ignore" };
  const copy = O.cloneOfferInput(src);
  assert.equal(copy.name, "Tea + Biscuits copy");
  assert.equal(copy.status, "draft");
  assert.deepEqual(copy.conditions.item_ids, ["tea", "biscuits"]);
  assert.equal(copy.discount_value, 8);
});

test("legacy combo rows convert and AI suggest builds a combo draft", () => {
  const legacy = O.comboFromLegacy({ id: "c1", name: "Tea combo", item_a_id: "a", item_b_id: "b", discount_type: "pct", discount_value: 8, status: "active" });
  assert.equal(legacy.offer_type, "combo");
  const ideas = O.suggestFromGrowth({ products: { top: [{ itemId: "a", name: "Tea" }, { itemId: "b", name: "Biscuits" }], slow: [{ itemId: "x", name: "Old stock" }] } }, []);
  assert.ok(ideas.some((i) => i.type === "combo"));
  assert.ok(ideas.some((i) => i.type === "clearance"));
});
