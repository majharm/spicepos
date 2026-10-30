import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("Forgot password emails a code and saves a new password", () => {
  const login = read("login.html");
  const js = read("js/x-pos-20260830e.js");
  const php = read("pos-php-core.php");
  const auth = read("server/auth.js");
  const schema = read("server/schema.js");
  const sql = read("scripts/base-schema.sql");
  const phone = read("css/mobile-app.css");
  const panel = login.slice(login.indexOf('id="forgot-panel"'), login.indexOf('id="signup-form"'));

  assert.match(login, /x-pos-20260830e\.js\?v=20261030forgot1/);
  assert.match(panel, /id="forgot-id"/);
  assert.match(panel, /id="forgot-code"/);
  assert.match(panel, /id="forgot-next"/);
  assert.match(panel, /id="forgot-confirm"/);
  assert.match(panel, /id="forgot-send"/);
  assert.match(panel, /id="forgot-save"/);
  assert.match(panel, /id="forgot-hint"/);
  assert.match(panel, /id="forgot-help"/);
  assert.ok(login.indexOf('id="forgot-panel"') < login.indexOf('id="login-support"'));
  assert.doesNotMatch(panel, /id="login-support"/);

  assert.match(js, /auth\/forgot-password\/confirm/);
  assert.match(js, /function openForgotPanel/);
  assert.match(js, /\^https\?:\\\/\\\//);
  assert.doesNotMatch(js, /Ask your business admin or ATAV support to reset the password/);
  assert.match(js, /forgotPanel\.hidden = true/);

  assert.match(php, /function pos_forgot_password_start/);
  assert.match(php, /function pos_forgot_password_confirm/);
  assert.match(php, /function pos_ensure_password_reset_columns/);
  assert.match(php, /auth\/forgot-password\/confirm/);
  assert.match(php, /Password saved\. Sign in with the new password\./);
  assert.match(php, /Could not email a sign-in code/);
  assert.match(auth, /\/api\/auth\/forgot-password\/confirm/);
  assert.match(auth, /password_reset_hash/);
  assert.match(schema, /password_reset_hash/);
  assert.match(schema, /password_reset_expires/);
  assert.match(sql, /password_reset_hash VARCHAR\(128\) NULL/);
  assert.match(phone, /#forgot-panel:not\(\[hidden\]\)/);
  assert.match(phone, /display: grid !important/);
});

function bootLogin(forgotHref) {
  const els = new Map();
  const listeners = new Map();
  function make(id, attrs = {}) {
    const node = {
      id,
      hidden: id === "forgot-panel" || id === "signup-form",
      value: attrs.value || "",
      className: "",
      textContent: "",
      innerHTML: "",
      disabled: false,
      dataset: {},
      _attr: { ...attrs },
      addEventListener(type, fn) {
        listeners.set(node, fn);
        void type;
      },
      focus() {},
      scrollIntoView() {},
      classList: { toggle() {}, add() {}, remove() {} },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      getAttribute(name) {
        return node._attr[name] ?? null;
      },
    };
    if (id) els.set(id, node);
    return node;
  }

  const forgot = make("auth-forgot", { href: forgotHref });
  make("login-form");
  make("signup-form");
  make("auth-card");
  make("auth-lead");
  make("forgot-panel");
  make("forgot-hint");
  make("forgot-id");
  make("login-identifier", { value: "shop@example.com" });
  const support = make("login-support");
  support.hidden = false;
  make("forgot-help");
  make("forgot-code");
  make("forgot-next");
  make("forgot-confirm");
  make("forgot-send");
  make("forgot-save");
  make("forgot-back");
  make("login-password");
  make("hint");

  globalThis.document = {
    readyState: "complete",
    getElementById: (id) => els.get(id) || null,
    querySelector(sel) {
      if (sel === ".auth-forgot") return forgot;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === ".auth-tab") return [];
      return [];
    },
    addEventListener() {},
  };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.location = { search: "", hash: "", href: "/login.html" };
  globalThis.window = globalThis;
  window.posRequest = async () => ({ res: { ok: true }, data: {} });
  window.SupportPage = { loginHtml: () => "" };
  vm.runInThisContext(read("js/x-pos-20260830e.js"), { filename: "js/x-pos-20260830e.js" });
  return { els, forgot, listeners };
}

test("Forgot password opens on the phone even when support is already loaded", () => {
  const { els, forgot, listeners } = bootLogin("#login-support");
  const blocked = { defaultPrevented: false };
  listeners.get(forgot)({
    preventDefault() {
      blocked.defaultPrevented = true;
    },
    currentTarget: forgot,
  });
  assert.equal(blocked.defaultPrevented, true);
  assert.equal(els.get("forgot-panel").hidden, false);
  assert.equal(els.get("login-form").hidden, true);
  assert.equal(els.get("forgot-id").value, "shop@example.com");
});

test("An external forgot link still leaves the login page", () => {
  const { els, forgot, listeners } = bootLogin("https://example.com/reset");
  const event = { defaultPrevented: false, currentTarget: forgot, preventDefault() { this.defaultPrevented = true; } };
  listeners.get(forgot)(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(els.get("forgot-panel").hidden, true);
});
