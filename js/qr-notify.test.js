import test from "node:test";
import assert from "node:assert/strict";
import "./qr-notify.js";

const N = globalThis.POSQrNotify;

test("QR notify finds only new pending orders", () => {
  const seen = new Set(["old"]);
  const rows = [
    { id: "old", status: "pending", order_number: "QRO-OLD" },
    { id: "done", status: "completed", order_number: "QRO-DONE" },
    { id: "new1", status: "pending", order_number: "QRO-NEW", customer_name: "Ramesh", table_no: "4" },
  ];
  assert.deepEqual(N.newPending(null, rows), []);
  const fresh = N.newPending(seen, rows);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].id, "new1");
  assert.match(N.toastCopy(fresh[0], 1), /QRO-NEW · Ramesh · 4 · \+1 more/);
});

test("QR notify sound preference defaults on and can be turned off", () => {
  N.setSoundOn(true);
  assert.equal(N.soundOn(), true);
  N.setSoundOn(false);
  assert.equal(N.soundOn(), false);
  N.setSoundOn(true);
  assert.equal(N.soundOn(), true);
});

test("QR notify does not play when sound is off", () => {
  N.setSoundOn(false);
  assert.equal(N.playTone(), false);
  N.setSoundOn(true);
});

test("QR notify asks for a tap until sound is unlocked", () => {
  N.setSoundOn(true);
  assert.equal(N.needsUnlock(), !N.isArmed());
  N.unlock();
  assert.equal(N.isArmed(), true);
  assert.equal(N.needsUnlock(), false);
});
