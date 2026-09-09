import test from "node:test";
import assert from "node:assert/strict";
import "./footwear.js";
import "./restaurant.js";

const R = globalThis.POSRestaurant;
const F = globalThis.POSFootwear;

test("Restaurant shops include cafe, bakery, and food & beverage", () => {
  assert.equal(R.isRestaurantShop({ category: "Food & beverage" }), true);
  assert.equal(R.isRestaurantShop({ business_type: "Restaurant" }), true);
  assert.equal(R.isRestaurantShop({ business_type: "Cafe" }), true);
  assert.equal(R.isRestaurantShop({ business_type: "Bakery" }), true);
  assert.equal(R.isRestaurantShop({ category: "Spices & masala" }), false);
  assert.equal(R.isRestaurantShop({ category: "Kirana / FMCG" }), false);
  assert.equal(F.shopKind({ category: "Food & beverage" }), "restaurant");
  assert.equal(F.shopKind({ business_type: "Restaurant", category: "Spices & masala" }), "restaurant");
  assert.equal(F.defaultCategory({ category: "Food & beverage" }), "Menu");
});

test("Table numbers normalize from free text and Parcel", () => {
  assert.equal(R.normalizeTableNo("4"), "4");
  assert.equal(R.normalizeTableNo("Table 12"), "12");
  assert.equal(R.normalizeTableNo("pickup"), "Parcel");
  assert.equal(R.normalizeTableNo("Takeaway"), "Parcel");
  assert.equal(R.displayTable("7"), "Table 7");
  assert.equal(R.displayTable("Parcel"), "Parcel");
  assert.equal(R.holdLabel("3"), "Table 3");
});

test("Occupied table holds are found by table_no on the payload", () => {
  const holds = [
    { id: "h1", label: "Hold 1", payload: { cart: [{ itemId: "a", qtyGm: 1 }] } },
    { id: "h2", label: "Table 4", payload: { table_no: "4", cart: [{ itemId: "dosa", qtyGm: 2 }] } },
  ];
  assert.equal(R.isTableHold(holds[0]), false);
  assert.equal(R.findTableHold(holds, "Table 4")?.id, "h2");
  assert.equal(R.tableNoFromHold(holds[1]), "4");
  assert.deepEqual(R.seatIds(4).slice(-1), ["Parcel"]);
  assert.ok(R.seatIds(4).includes("1"));
});

test("Kitchen KOT prints new dishes only, then reprint of the full ticket", () => {
  const cart = [
    { itemId: "dosa", qtyGm: 2, name: "Masala dosa" },
    { itemId: "tea", qtyGm: 1, name: "Tea" },
  ];
  const printed = [{ itemId: "dosa", qtyGm: 1 }];
  const delta = R.kotDelta(cart, printed);
  assert.deepEqual(delta, [
    { itemId: "dosa", qtyGm: 1 },
    { itemId: "tea", qtyGm: 1 },
  ]);
  const first = R.kotKind(cart, []);
  assert.equal(first.kind, "new");
  assert.equal(first.lines.length, 2);
  const again = R.kotKind(cart, cart);
  assert.equal(again.kind, "reprint");
  assert.equal(again.lines.length, 2);

  const html = R.kotBody({
    shop: "Demo Kitchen",
    tableNo: "4",
    when: "2:15 pm",
    kind: "new",
    notes: "Less spicy",
    lines: [
      { name: "Masala dosa", qtyGm: 1, unit: "PCS" },
      { name: "Tea", qtyGm: 1, unit: "PCS" },
    ],
  });
  assert.match(html, /KOT/);
  assert.match(html, /Table 4/);
  assert.match(html, /Masala dosa/);
  assert.match(html, /Less spicy/);
  assert.doesNotMatch(html, /TAX INVOICE/);
  assert.doesNotMatch(html, /Grand total/);
});
