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
  daysUntilExpiry,
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

test("renewal alerts cover the week before expiry and after expiry", () => {
  assert.equal(daysUntilExpiry("2026-09-12", "2026-09-05"), 7);
  assert.equal(daysUntilExpiry("2026-09-05", "2026-09-06"), -1);
  const before = renderAlert("renewal_before", {
    shopName: "SWAMI MASALE",
    ownerName: "Ravi",
    plan: "Yearly",
    expiry: "2026-09-12",
    days: 7,
    signInUrl: "https://pos.atavtelecom.in/login.html",
    supportPhone: "9876543210",
  });
  assert.match(before, /renewal reminder/);
  assert.match(before, /SWAMI MASALE/);
  assert.match(before, /2026-09-12/);
  assert.match(before, /7 day/);
  const expired = renderAlert("renewal_expired", {
    shopName: "SWAMI MASALE",
    ownerName: "Ravi",
    plan: "Yearly",
    expiry: "2026-09-01",
    signInUrl: "https://pos.atavtelecom.in/login.html",
  });
  assert.match(expired, /expired/);
  assert.match(expired, /SWAMI MASALE/);
});

test("Master Admin Settings lives under Backup with Active/Inactive templates", () => {
  const masterHtml = readFileSync(path.join(root, "master.html"), "utf8");
  const master = readFileSync(path.join(root, "js/master.js"), "utf8");
  const php = readFileSync(path.join(root, "pos-php-core.php"), "utf8");
  const alerts = readFileSync(path.join(root, "pos-alerts.php"), "utf8");
  const nodeAlerts = readFileSync(path.join(root, "server/alerts.js"), "utf8");
  const index = readFileSync(path.join(root, "server/index.js"), "utf8");
  assert.doesNotMatch(masterHtml, /data-tab="alerts"/);
  assert.match(masterHtml, /data-backup-pane="settings">Settings</);
  assert.match(masterHtml, /nav-sub" data-tab="backup" data-backup-pane="backup">Backup</);
  assert.match(masterHtml, /nav-sub" data-tab="notes">Messages</);
  assert.doesNotMatch(masterHtml, />Notifications</);
  assert.match(master, /function backupFamilyTabs/);
  assert.match(master, /id="alert-form"/);
  assert.match(master, /class="msg-settings"/);
  assert.match(master, /WhatsApp connection/);
  assert.match(master, /User ID & password/);
  assert.match(master, /Closing sales summary/);
  assert.match(master, /Low stock alert/);
  assert.match(master, /Renewal before expiry/);
  assert.match(master, /Expired plan/);
  assert.match(master, /alert-switch-label/);
  assert.doesNotMatch(master, /Today platform sales/);
  assert.match(master, /id="biz-search"/);
  assert.match(master, /id="note-form"/);
  assert.match(php, /pos_send_shop_welcome_alerts/);
  assert.match(php, /pos_send_credential_alerts/);
  assert.match(php, /pos_tick_shop_alerts/);
  assert.match(alerts, /pos_send_renewal_alerts/);
  assert.match(alerts, /tpl_renewal_before/);
  assert.match(alerts, /renewal_expired/);
  assert.match(nodeAlerts, /sendRenewalAlerts/);
  assert.match(nodeAlerts, /summarizeAlertResults/);
  assert.match(master, /alert-send-expiry/);
  assert.match(master, /data-send-expiry/);
  assert.match(master, /summarizeAlertDelivery/);
  assert.match(master, /\/api\/master\/alerts\/send-expiry/);
  assert.match(php, /master\/alerts\/send-expiry/);
  assert.match(php, /send-expiry-alert/);
  assert.match(alerts, /pos_summarize_alert_results/);
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
  assert.match(master, /WhatsApp connection/);
  assert.match(php, /master\/alerts/);
  assert.match(php, /image_url/);
  assert.match(php, /pos_send_update_alerts/);
  assert.match(alerts, /pos_notice_image/);
  assert.match(alerts, /cid:notice-image/);
  assert.match(mail, /Content-ID: <notice-image>/);
});
