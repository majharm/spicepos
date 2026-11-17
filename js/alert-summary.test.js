import assert from "node:assert/strict";
import test from "node:test";
import "./alert-summary.js";

const S = globalThis.POSAlertSummary;
const page = "Sign-in did not reach the POS server (got a web page). Open /pos-api.php?p=health — it must be JSON.";

test("the alert result lists every number and every email", () => {
  const numbers = ["919876543210", "919988776655", "919765040588", "911234567890"];
  const emails = ["majhar.mulani@gmail.com", "info@atavtelecomm.in", "a@a.com"];
  const msg = S.summarizeAlertDelivery({
    summary: { wa: 3, mail: 2, sent: 3, skipped: 1 },
    results: [
      { shopName: "Spice", wa: { ok: true, to: numbers.slice(0, 2), results: [{ number: "919765040588" }] }, mail: [{ ok: true, to: emails[0] }] },
      { shopName: "Press", wa: { ok: true, to: ["911234567890"] }, mail: [{ ok: true, to: emails[1] }, { ok: false, to: emails[2], error: "SMTP not configured" }] },
      { shopName: "Login Probe", skipped: true, reason: "no-low-stock" },
      { shopName: "ABC GARMENT", wa: { ok: false, error: page }, mail: [] },
      { shopName: "OM Printing Press", wa: { ok: false, error: page }, mail: [] },
    ],
  });
  assert.match(msg, /WhatsApp 3\/5/);
  assert.match(msg, /Every number\n\+919876543210\n\+919988776655\n\+919765040588\n\+911234567890/);
  assert.match(msg, /Every email\nmajhar.mulani@gmail.com\ninfo@atavtelecomm.in\na@a.com/);
  assert.match(msg, /Login Probe: no low-stock or out-of-stock items/);
  assert.match(msg, /ABC GARMENT: Sign-in did not reach the POS server/);
  assert.match(msg, /OM Printing Press: Sign-in did not reach the POS server/);
  assert.doesNotMatch(msg, /\+\d+ more/);
});
