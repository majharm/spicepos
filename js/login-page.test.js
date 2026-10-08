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
  assert.equal(during.resolvedHero, "/api/login-page/file/c1");
  const after = L.resolveAppearance({ settings, images, campaigns }, new Date("2026-11-02T12:00:00"), "Pharmacy");
  assert.equal(after.resolvedSource, "business");
  assert.equal(after.resolvedHero, "/api/login-page/file/b1");
  assert.equal(after.heading, "Manage Your Pharmacy Smarter");
  const custom = L.resolveAppearance({ settings, images, campaigns: [] }, new Date("2026-11-02T12:00:00"), "");
  assert.equal(custom.resolvedSource, "custom");
  assert.equal(custom.resolvedHero, "/api/login-page/file/u1");
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
  const masterJs = read("js/master.js");
  const manager = read("js/master-login-page.js");
  assert.match(master, /Website Management/);
  assert.match(master, /data-tab="website" data-website-pane="images"/);
  assert.match(master, />Login Page</);
  assert.match(master, /js\/master-login-page\.js\?v=20261008loginfile1/);
  assert.match(master, /js\/login-page\.js\?v=20261008loginfile1/);
  assert.match(master, /css\/login-page\.css\?v=20261008loginfile1/);
  assert.match(masterJs, /function resolveWebsitePane/);
  assert.match(masterJs, /Login page and branding/);
  assert.match(manager, /function resolvePane/);
  assert.match(manager, /Login Page Management/);
  assert.doesNotMatch(master, /data-tab="website" data-website-pane="homepage"><span class="nav-icon"/);
  assert.match(login, /js\/login-page\.js\?v=20261008loginfile1/);
  assert.match(login, /js\/pos-api\.js\?v=20261006login1/);
  assert.match(login, /css\/login-page\.css\?v=20261008loginfile1/);
  assert.match(login, /x-pos-20260830e\.js\?v=20260922deploy207/);
  assert.match(index, /registerLoginPagePublic/);
  assert.match(index, /registerLoginPageMaster/);
  assert.match(index, /\/api\/login-page/);
  assert.match(core, /pos_login_page_public_dispatch/);
  assert.match(core, /pos_login_page_master_dispatch/);
  assert.match(core, /strpos\(\$path, "login-page\/"\) === 0/);
  assert.match(php, /function pos_login_page_validate/);
  assert.match(node, /Only JPG, PNG, or WebP/);
  assert.match(node, /login_page_settings/);
  assert.match(node, /login_page_campaigns/);
  assert.doesNotMatch(node, /password_hash/);
  assert.doesNotMatch(node, /otp/);
  assert.match(node, /uploaded: \{ id \}/);
  assert.match(node, /function usedImageIds/);
  assert.match(node, /\/api\/login-page\/file\/:id/);
  assert.match(node, /SELECT id, name, kind, width, height, bytes, mime/);
  assert.match(php, /uploaded/);
  assert.match(php, /function pos_login_page_used_ids/);
  assert.match(php, /function pos_login_page_send_file/);
  assert.match(php, /login-page\/file\//);
  assert.match(php, /SELECT id, name, kind, width, height, bytes, mime/);
  assert.match(read("js/login-page.js"), /function imageFileUrl/);
  assert.match(read("css/login-page.css"), /auth-scene-shots picture/);
  assert.match(manager, /assignUpload/);
  assert.match(manager, /login-page\/publish/);
  assert.match(auth, /\/api\/auth\/login/);
  assert.match(xpos, /\/api\/auth\/login/);
  assert.doesNotMatch(read("js/login-page.js"), /\/api\/auth\/login/);
});

test("uploaded login images skip srcset and map backgroundImageId", () => {
  const data = "data:image/jpeg;base64,abc,def";
  const html = L.heroPicture(data, data, data, "Hero", "eager", 3);
  assert.match(html, /<img src="data:image\/jpeg;base64,abc,def"/);
  assert.doesNotMatch(html, /srcset=/);
  const file = L.heroPicture("./assets/login-atav-smart-pos.jpg", "./t.jpg", "./m.jpg", "Hero", "eager", 4);
  assert.match(file, /srcset=/);
  const bg = L.resolveAppearance({
    settings: { backgroundImageId: "bg1" },
    images: [{ id: "bg1", url: "data:image/jpeg;base64,bg", status: "active" }],
  });
  assert.equal(bg.backgroundUrl, "/api/login-page/file/bg1");
});

test("Master Admin login can show a published custom image", () => {
  const src = read("js/login-page.js");
  assert.match(src, /shell\.id === "master-gate"/);
  assert.match(src, /getElementById\("master-login"\)/);
  assert.match(src, /window\.posRequest/);
  assert.doesNotMatch(src, /if \(!shell \|\| shell\.id === "master-gate"\) return/);
});

test("Website Homepage pane is its own desk", () => {
  vm.runInThisContext(read("js/master-login-page.js"), { filename: "js/master-login-page.js" });
  const M = globalThis.POSMasterLoginPage;
  assert.equal(M.resolvePane("homepage"), "homepage");
  assert.equal(M.resolvePane(""), "images");
  assert.equal(M.resolvePane("unknown"), "images");
  assert.equal(M.resolvePane("media"), "media");
  assert.equal(M.resolvePane("register"), "register");
  assert.equal(M.resolvePane("contact"), "contact");
  assert.equal(M.fieldForUpload("images", "library"), "desktopImageId");
  assert.equal(M.fieldForUpload("mobile", "mobile"), "mobileImageId");
  assert.equal(M.fieldForUpload("media", "desktop"), "desktopImageId");
  const assigned = M.assignUpload({}, "desktopImageId", "img-9");
  assert.equal(assigned.desktopImageId, "img-9");
  assert.equal(assigned.desktopUrl, "/api/login-page/file/img-9");
  assert.match(read("js/master.js"), /function resolveWebsitePane/);
  assert.match(read("js/master.js"), /WEBSITE_LOGIN_PANES/);
  assert.doesNotMatch(read("js/master.js"), /if \(!p \|\| p === "homepage"\) return "images"/);
});
