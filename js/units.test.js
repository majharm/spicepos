import test from "node:test";
import assert from "node:assert/strict";
import "./units.js";

const U = globalThis.POSUnits;

test("unit aliases and count pricing", () => {
  assert.equal(U.normalize("qty"), "PCS");
  assert.equal(U.normalize("ltr"), "LTR");
  assert.equal(U.normalize("kg"), "KG");
  assert.equal(U.lineAmount(1200, 280, "GM"), 336);
  assert.equal(U.lineAmount(3, 40, "PCS"), 120);
  assert.equal(U.lineAmount(500, 200, "ML"), 100);
  assert.equal(U.formatQty(3, "PCS"), "3 pcs");
  assert.equal(U.toBase(2, "KG"), 2000);
  assert.equal(U.fromBase(2000, "LTR"), 2);
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
  assert.doesNotMatch(U.optionsHtml("GM"), /value="BOX"/);
});
