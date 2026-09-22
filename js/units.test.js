import test from "node:test";
import assert from "node:assert/strict";
import "./units.js";

const U = globalThis.POSUnits;

test("counter qty is any grams from 1 to 1e9, not a 100 g step", () => {
  U.hydrate([]);
  assert.equal(U.step("GM"), 1);
  assert.equal(U.counterStep("GM"), 1);
  assert.equal(U.counterStep("KG"), 1000);
  assert.equal(U.counterStep("PCS"), 1);
  assert.equal(U.formatQty(2, "KG"), "0.002 kg");
  assert.equal(U.formatQty(2000, "KG"), "2 kg");
  assert.equal(U.qtySuffix("KG"), "kg");
  assert.equal(U.qtySuffix("PCS"), "pcs");
  assert.equal(U.displayQty(2000, "KG"), 2);
  assert.equal(U.displayQty(2, "GM"), 2);
  assert.equal(U.qtyMin(), 1);
  assert.equal(U.qtyMax(), 1000000000);
  assert.equal(U.clampQty(5), 5);
  assert.equal(U.clampQty(1), 1);
  assert.equal(U.clampQty(1000000000), 1000000000);
  assert.equal(U.clampQty(1000000001), 1000000000);
  assert.equal(U.clampQty(0), 0);
  assert.equal(U.clampQty(0.4), 0);
  assert.equal(U.lineAmount(5, 1000, "GM"), 5);
});

test("unit aliases and count pricing", () => {
  assert.equal(U.normalize("qty"), "PCS");
  assert.equal(U.normalize("ltr"), "LTR");
  assert.equal(U.normalize("litre"), "L");
  assert.equal(U.normalize("kg"), "KG");
  assert.equal(U.normalize("nos"), "NOS");
  assert.notEqual(U.normalize("nos"), "PCS");
  assert.equal(U.lineAmount(1200, 280, "GM"), 336);
  assert.equal(U.lineAmount(3, 40, "PCS"), 120);
  assert.equal(U.lineAmount(500, 200, "ML"), 100);
  assert.equal(U.formatQty(3, "PCS"), "3 pcs");
  assert.equal(U.toBase(2, "KG"), 2000);
  assert.equal(U.fromBase(2000, "LTR"), 2);
  assert.equal(U.fromBase(2000, "L"), 2);
  assert.equal(U.itemUnit({ base_unit: "qty" }), "PCS");
  assert.equal(U.receiveLabel("PCS"), "+1 pc");
});

test("unit master hydrate adds custom count units", () => {
  U.hydrate([{ code: "BOX", name: "Box", family: "count", rate_suffix: "/box", stock_suffix: "box", step: 1, receive_qty: 1 }]);
  assert.equal(U.normalize("box"), "BOX");
  assert.equal(U.isCount("BOX"), true);
  assert.equal(U.lineAmount(4, 25, "BOX"), 100);
  assert.equal(U.formatQty(4, "BOX"), "4 box");
  assert.match(U.optionsHtml("BOX"), /value="BOX"/);
  U.hydrate([]);
  assert.equal(U.isCount("BOX"), true);
  assert.equal(U.lineAmount(4, 25, "BOX"), 100);
  assert.match(U.optionsHtml("GM"), /value="BOX"/);
  assert.match(U.optionsHtml("PCS"), /optgroup label="Quantity \/ General"/);
});

test("unit master catalog covers quantity through service units", () => {
  U.hydrate([]);
  const codes = U.CATALOG.map((r) => r.code);
  for (const code of ["PCS", "NOS", "UNT", "G", "KG", "MM", "SQFT", "ML", "L", "BOX", "STRIP", "TAB", "PLT", "HR", "APPT", "SQM", "CBM", "PKT"]) {
    assert.ok(codes.includes(code), code);
  }
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.length >= 80);
  assert.equal(U.normalize("strip"), "STRIP");
  assert.equal(U.isCount("HR"), true);
  assert.equal(U.isCount("SQFT"), true);
  assert.equal(U.lineAmount(150, 10, "SQFT"), 1500);
  assert.equal(U.lineAmount(150, 15, "SQFT"), 2250);
  assert.equal(U.isCount("G"), false);
  assert.equal(U.lineAmount(2, 50, "STRIP"), 100);
});
