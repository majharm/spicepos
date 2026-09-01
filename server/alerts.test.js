import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  buildWaUrl,
  noticeHtml,
  sanitizeNoticeImage,
  updateText,
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
