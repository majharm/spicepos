import test from "node:test";
import assert from "node:assert/strict";
import "./support.js";

const S = globalThis.SupportPage;

test("support tel WhatsApp and mail hrefs", () => {
  assert.equal(S.telHref("98765 43210"), "tel:9876543210");
  assert.equal(S.telHref("+91-98765-43210"), "tel:+919876543210");
  assert.equal(S.waHref("9876543210"), "https://wa.me/919876543210");
  assert.equal(S.waHref("09876543210"), "https://wa.me/919876543210");
  assert.equal(S.waHref("+91 98765 43210"), "https://wa.me/919876543210");
  assert.equal(S.mailHref("help@atavtelecom.in"), "mailto:help@atavtelecom.in");
  assert.equal(S.mailHref("not-an-email"), "");
  assert.equal(S.telHref(""), "");
});

test("support page names the assigned account manager", () => {
  const html = S.pageHtml(
    { support_phone: "9876543210", support_email: "am@atavtelecom.in", account_manager_name: "Priya Shah" },
    { name: "SWAMI MASALE" },
  );
  assert.match(html, /Your account manager/);
  assert.match(html, /Priya Shah/);
  assert.match(html, /assigned ATAV POS account manager/);
  assert.doesNotMatch(html, /ATAV POS helpline/);
});

test("support page html has call actions and shop details", () => {
  const html = S.pageHtml(
    { support_phone: "9876543210", support_email: "help@atavtelecom.in" },
    { name: "SWAMI MASALE", address: "Pune", phone: "020111", email: "shop@local", gstin: "27ABCDE1234F1Z5" },
  );
  assert.match(html, /support-hero/);
  assert.match(html, /Call now/);
  assert.match(html, /WhatsApp/);
  assert.match(html, /href="tel:9876543210"/);
  assert.match(html, /href="https:\/\/wa\.me\/919876543210"/);
  assert.match(html, /mailto:help@atavtelecom\.in/);
  assert.match(html, /Copy number/);
  assert.match(html, /SWAMI MASALE/);
  assert.match(html, /27ABCDE1234F1Z5/);
  assert.match(html, /Before you call/);
});

test("support page empty state and compact preview", () => {
  const empty = S.pageHtml({}, { name: "Shop" });
  assert.match(empty, /Helpline not set yet/);
  assert.doesNotMatch(empty, /Call now/);
  assert.match(empty, /This shop/);
  const compact = S.pageHtml({ support_phone: "9876543210" }, { name: "Shop" }, { compact: true });
  assert.match(compact, /Call now/);
  assert.doesNotMatch(compact, /Copy number/);
  assert.doesNotMatch(compact, /This shop/);
});

test("login support chips", () => {
  assert.equal(S.loginHtml({}), "");
  const html = S.loginHtml({ support_phone: "9876543210", support_email: "help@atavtelecom.in" });
  assert.match(html, /Need help signing in/);
  assert.match(html, /Call 9876543210/);
  assert.match(html, /WhatsApp/);
  assert.match(html, /mailto:help@atavtelecom\.in/);
});
