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
