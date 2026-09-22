import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
globalThis.document = {
  readyState: "complete",
  documentElement: { style: { setProperty() {} } },
  getElementById: () => null,
  addEventListener() {},
  querySelector: () => null,
};
vm.runInThisContext(read("js/login-page.js"), { filename: "js/login-page.js" });
const L = globalThis.POSLoginPage;

test("login appearance priority is campaign then business then custom then default", () => {
  const images = [
    { id: "c1", url: "data:image/jpeg;base64,aaa", status: "active" },
    { id: "b1", url: "data:image/jpeg;base64,bbb", status: "active" },
    { id: "u1", url: "data:image/jpeg;base64,uuu", status: "active" },
  ];
  const campaigns = [
    {
      name: "Diwali POS Offer",
      image_id: "c1",
      status: "active",
      start_date: "2026-10-01",
      end_date: "2026-10-31",
      start_time: "00:00",
      end_time: "23:59",
    },
  ];
  const settings = {
    desktopImageId: "u1",
    businessTypes: { Pharmacy: { imageId: "b1", heading: "Manage Your Pharmacy Smarter" } },
  };
  const during = L.resolveAppearance({ settings, images, campaigns }, new Date("2026-10-15T12:00:00"), "Pharmacy");
  assert.equal(during.resolvedSource, "campaign");
  assert.equal(during.resolvedHero, "data:image/jpeg;base64,aaa");
  const after = L.resolveAppearance({ settings, images, campaigns }, new Date("2026-11-02T12:00:00"), "Pharmacy");
  assert.equal(after.resolvedSource, "business");
  assert.equal(after.heading, "Manage Your Pharmacy Smarter");
  const custom = L.resolveAppearance({ settings, images, campaigns: [] }, new Date("2026-11-02T12:00:00"), "");
  assert.equal(custom.resolvedSource, "custom");
  const def = L.resolveAppearance({ settings: {}, images: [], campaigns: [] }, new Date());
  assert.equal(def.resolvedSource, "default");
  assert.match(def.resolvedHero, /login-atav-smart-pos\.jpg/);
  assert.equal(def.promo.on, false);
});

test("card customization is clamped so the login form stays usable", () => {
  const c = L.clampCard({ width: 40, radius: 200, opacity: 0.1, logoSize: 8, spacing: 1 });
  assert.equal(c.width, 320);
  assert.equal(c.radius, 28);
  assert.equal(c.opacity, 0.72);
  assert.equal(c.logoSize, 96);
  assert.equal(c.spacing, 8);
});

test("Master Admin Login Page manager is wired without touching auth", () => {
  const master = read("master.html");
  const login = read("login.html");
  const core = read("pos-php-core.php");
  const php = read("pos-login-page.php");
  const index = read("server/index.js");
  const node = read("server/login-page.js");
  const auth = read("server/auth.js");
  const xpos = read("js/x-pos-20260830e.js");
  assert.match(master, /Website Management/);
  assert.match(master, /data-website-pane="images"/);
  assert.match(master, /js\/master-login-page\.js\?v=20260920deploy203/);
  assert.match(master, /css\/login-page\.css\?v=20260920deploy203/);
  assert.match(login, /js\/login-page\.js\?v=20260920deploy203/);
  assert.match(login, /css\/login-page\.css\?v=20260920deploy203/);
  assert.match(login, /x-pos-20260830e\.js\?v=20260922deploy207/);
  assert.match(index, /registerLoginPagePublic/);
  assert.match(index, /registerLoginPageMaster/);
  assert.match(index, /\/api\/login-page/);
  assert.match(core, /pos_login_page_public_dispatch/);
  assert.match(core, /pos_login_page_master_dispatch/);
  assert.match(php, /function pos_login_page_validate/);
  assert.match(node, /Only JPG, PNG, or WebP/);
  assert.match(node, /login_page_settings/);
  assert.match(node, /login_page_campaigns/);
  assert.doesNotMatch(node, /password_hash/);
  assert.doesNotMatch(node, /otp/);
  assert.match(auth, /\/api\/auth\/login/);
  assert.match(xpos, /\/api\/auth\/login/);
  assert.doesNotMatch(read("js/login-page.js"), /\/api\/auth\/login/);
});
