import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  buildWaUrl,
  fillTemplate,
  noticeHtml,
  renderAlert,
  sanitizeNoticeImage,
  updateText,
  welcomeText,
  credentialsText,
  DEFAULT_TEMPLATES,
  WA_DEFAULT_URL,
} from "./alerts.js";
import { parseDataImage } from "./mail.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("update text names the shop and title", () => {
  const text = updateText({ shopName: "SWAMI MASALE", title: "Holiday hours", body: "Closed Sunday." });
  assert.match(text, /SWAMI MASALE/);
  assert.match(text, /Holiday hours/);
  assert.match(text, /Closed Sunday/);
});

test("message templates fill placeholders and honor custom text", () => {
  assert.equal(fillTemplate("Hello {{name}}", { name: "Ravi" }), "Hello Ravi");
  assert.match(DEFAULT_TEMPLATES.welcome, /\{\{shop\}\}/);
  const welcome = welcomeText({ shopName: "SWAMI MASALE", ownerName: "Ravi", signInUrl: "/login.html" });
  assert.match(welcome, /SWAMI MASALE/);
  assert.match(welcome, /Ravi/);
  assert.match(welcome, /\/login\.html/);
  const custom = renderAlert("welcome", { shopName: "Demo", ownerName: "Asha" }, {
    tpl_welcome: "Namaste {{name}} at {{shop}}",
  });
  assert.equal(custom, "Namaste Asha at Demo");
  const login = credentialsText({
    shopName: "SWAMI MASALE",
    username: "swami.admin",
    password: "Secret#1",
    email: "admin@shop.local",
    role: "business_admin",
  });
  assert.match(login, /swami\.admin/);
  assert.match(login, /Secret#1/);
});

test("Master Admin Settings shows Active/Inactive message templates", () => {
  const masterHtml = readFileSync(path.join(root, "master.html"), "utf8");
  const master = readFileSync(path.join(root, "js/master.js"), "utf8");
  const php = readFileSync(path.join(root, "pos-php-core.php"), "utf8");
  const alerts = readFileSync(path.join(root, "pos-alerts.php"), "utf8");
  const nodeAlerts = readFileSync(path.join(root, "server/alerts.js"), "utf8");
  const index = readFileSync(path.join(root, "server/index.js"), "utf8");
  assert.match(masterHtml, /data-tab="alerts"/);
  assert.match(master, /id="alert-form"/);
  assert.match(master, /User ID & password/);
  assert.match(master, /Closing sales summary/);
  assert.match(master, /Low stock alert/);
  assert.match(master, /alert-switch-label/);
  assert.match(php, /pos_send_shop_welcome_alerts/);
  assert.match(php, /pos_send_credential_alerts/);
  assert.match(php, /pos_tick_shop_alerts/);
  assert.match(alerts, /tpl_welcome/);
  assert.match(alerts, /pos_fill_template/);
  assert.match(nodeAlerts, /startAlertScheduler/);
  assert.match(index, /startAlertScheduler/);
  assert.match(index, /sendLowStockAlerts/);
});

test("notice HTML inlines https images and uses CID for uploads", () => {
  const https = noticeHtml({ title: "Hi", body: "Body", image: "https://cdn.example/a.jpg" });
  assert.match(https, /src="https:\/\/cdn\.example\/a\.jpg"/);
  const cid = noticeHtml({ title: "Hi", body: "Body", image: "data:image/jpeg;base64,abc" });
  assert.match(cid, /cid:notice-image/);
});

test("WhatsApp URL adds https media and keeps the message", () => {
  const url = buildWaUrl(
    { apiUrl: WA_DEFAULT_URL, apiKey: "k", profileId: "acc_1", countryCode: "91" },
    ["9876543210"],
    "Hello",
    "https://cdn.example/notice.jpg",
  );
  assert.match(url, /numbers=9876543210/);
  assert.match(url, /message=Hello/);
  assert.match(url, /media=https/);
  assert.doesNotMatch(url, /data:image/);
});

test("notice images must be uploads or https", () => {
  assert.equal(sanitizeNoticeImage(""), "");
  assert.equal(sanitizeNoticeImage("data:image/jpeg;base64,xx"), "data:image/jpeg;base64,xx");
  assert.equal(sanitizeNoticeImage("https://cdn.example/a.jpg"), "https://cdn.example/a.jpg");
  assert.throws(() => sanitizeNoticeImage("javascript:alert(1)"));
  assert.ok(parseDataImage("data:image/png;base64,QQ==").mime.includes("png"));
});

test("Master Admin notifications form can attach an image", () => {
  const master = readFileSync(path.join(root, "js/master.js"), "utf8");
  const php = readFileSync(path.join(root, "pos-php-core.php"), "utf8");
  const alerts = readFileSync(path.join(root, "pos-alerts.php"), "utf8");
  const mail = readFileSync(path.join(root, "pos-mail.php"), "utf8");
  assert.match(master, /id="note-image"/);
  assert.match(master, /image_url/);
  assert.match(master, /WhatsApp API/);
  assert.match(php, /master\/alerts/);
  assert.match(php, /image_url/);
  assert.match(php, /pos_send_update_alerts/);
  assert.match(alerts, /pos_notice_image/);
  assert.match(alerts, /cid:notice-image/);
  assert.match(mail, /Content-ID: <notice-image>/);
});
