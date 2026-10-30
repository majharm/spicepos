import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeOwnerMobile,
  intlOwnerMobile,
  notifyChannels,
  notifyAudience,
  audienceMatch,
  subscriptionActive,
  fillNotifyVars,
  composeWhatsAppBody,
  safeHttpsUrl,
  classifyRecipient,
  waAcceptanceStatus,
  campaignStatusFromRollup,
  NOTIFY_TEMPLATES,
} from "./notify-campaigns.js";

const root = new URL("..", import.meta.url);

function read(name) {
  return readFileSync(new URL(name, root), "utf8");
}

test("owner mobiles normalize to 10 Indian digits", () => {
  assert.equal(normalizeOwnerMobile("9876543210"), "9876543210");
  assert.equal(normalizeOwnerMobile("+91 98765 43210"), "9876543210");
  assert.equal(normalizeOwnerMobile("09876543210"), "9876543210");
  assert.equal(normalizeOwnerMobile("919876543210"), "9876543210");
  assert.equal(normalizeOwnerMobile("12345"), "");
  assert.equal(normalizeOwnerMobile(""), "");
  assert.equal(intlOwnerMobile("9876543210"), "919876543210");
});

test("notification channels and audiences stay on the allowed set", () => {
  assert.deepEqual(notifyChannels("all"), ["in_app", "push", "whatsapp"]);
  assert.deepEqual(notifyChannels(["whatsapp", "whatsapp", "sms"]), ["whatsapp"]);
  assert.equal(notifyChannels([]).length, 0);
  assert.equal(notifyAudience("restaurant"), "restaurant");
  assert.equal(notifyAudience("nope"), "");
});

test("audience matching uses category, type, and subscription", () => {
  const cafe = { id: "c1", category: "Cafe", business_type: "Restaurant", status: "active", subscription_expires_at: "2026-12-01" };
  const shop = { id: "s1", category: "Garments", business_type: "Retail", status: "active", subscription_expires_at: "2020-01-01" };
  assert.equal(audienceMatch(cafe, "cafe", { today: "2026-10-31" }), true);
  assert.equal(audienceMatch(cafe, "restaurant", { today: "2026-10-31" }), true);
  assert.equal(audienceMatch(shop, "garment", { today: "2026-10-31" }), true);
  assert.equal(audienceMatch(shop, "expired", { today: "2026-10-31" }), true);
  assert.equal(audienceMatch(cafe, "active", { today: "2026-10-31" }), true);
  assert.equal(audienceMatch(cafe, "selected", { ids: ["c1"] }), true);
  assert.equal(audienceMatch(cafe, "selected", { ids: ["other"] }), false);
  assert.equal(audienceMatch(cafe, "category", { category: "cafe" }), true);
  assert.equal(subscriptionActive({ status: "suspended" }, "2026-10-31"), false);
});

test("personalization and opt-out line are applied before send", () => {
  const text = fillNotifyVars(NOTIFY_TEMPLATES.feature, {
    owner_name: "Ravi",
    name: "Spice House",
    mobile: "9876543210",
    plan_name: "Growth",
    subscription_expires_at: "2026-12-01",
  });
  assert.match(text, /Hello Ravi/);
  assert.doesNotMatch(text, /\{\{owner_name\}\}/);
  const body = composeWhatsAppBody(text, "https://pos.atavtelecom.in");
  assert.match(body, /https:\/\/pos\.atavtelecom\.in/);
  assert.match(body, /Reply STOP to opt out/);
  assert.equal(composeWhatsAppBody(`${text}\nReply STOP to opt out already.`).split("opt out").length, 2);
  assert.throws(() => safeHttpsUrl("http://example.com", "Website link"), /https/);
});

test("WhatsApp is skipped without consent, after opt-out, and for bad numbers", () => {
  const seen = new Set();
  const ready = classifyRecipient(
    { id: "a", mobile: "9876543210", whatsapp_consent: 1, whatsapp_opt_out: 0 },
    { channels: ["whatsapp", "in_app", "push"], seenMobiles: seen },
  );
  assert.equal(ready.wa, "pending");
  assert.equal(ready.dedupe, "9876543210");
  assert.equal(ready.app, "pending");
  const duplicate = classifyRecipient(
    { id: "b", mobile: "+91 9876543210", whatsapp_consent: 1 },
    { channels: "all", seenMobiles: seen },
  );
  assert.equal(duplicate.waReason, "duplicate");
  assert.equal(duplicate.dedupe, "biz:b");
  assert.equal(
    classifyRecipient({ id: "c", mobile: "9876543210", whatsapp_consent: 0 }, { channels: ["whatsapp"], seenMobiles: new Set() }).waReason,
    "no-consent",
  );
  assert.equal(
    classifyRecipient({ id: "d", mobile: "9876543210", whatsapp_consent: 1, whatsapp_opt_out: 1 }, { channels: ["whatsapp"], seenMobiles: new Set() }).waReason,
    "opt-out",
  );
  assert.equal(classifyRecipient({ id: "e", mobile: "" }, { channels: ["whatsapp"], seenMobiles: new Set() }).waReason, "missing-mobile");
  assert.equal(classifyRecipient({ id: "f", mobile: "123" }, { channels: ["whatsapp"], seenMobiles: new Set() }).waReason, "invalid-mobile");
  const appOnly = classifyRecipient({ id: "g", mobile: "9876543210", whatsapp_consent: 1 }, { channels: ["in_app"], seenMobiles: new Set() });
  assert.equal(appOnly.waReason, "channel-off");
  assert.equal(appOnly.push, "skipped");
});

test("API acceptance is sent or pending, never delivered", () => {
  assert.equal(waAcceptanceStatus({ ok: true, delivery: "sent" }), "sent");
  assert.equal(waAcceptanceStatus({ ok: true, queued: true }), "pending");
  assert.equal(waAcceptanceStatus({ ok: true, json: { status: "delivered" } }), "delivered");
  assert.equal(waAcceptanceStatus({ ok: true, json: { delivery: "read" } }), "read");
  assert.equal(waAcceptanceStatus({ ok: false, error: "down" }), "failed");
  assert.equal(
    campaignStatusFromRollup({ open: 0, wa: { failed: 1, sent: 1 }, app: {}, push: {} }),
    "partial",
  );
  assert.equal(campaignStatusFromRollup({ open: 2, wa: {}, app: {}, push: {} }), "sending");
  assert.equal(campaignStatusFromRollup({ open: 0, wa: { sent: 1 }, app: {}, push: {} }, { scheduled: true }), "scheduled");
});

test("campaign delivery reuses the existing WAMaster sender", () => {
  const php = read("pos-notify.php");
  const core = read("pos-php-core.php");
  const till = read("pos-php-till.php");
  const routes = read("server/notify-routes.js");
  const master = read("js/master.js");
  const app = read("js/app.js");
  const schema = read("scripts/base-schema.sql");
  assert.match(php, /pos_wa_send_one/);
  assert.match(php, /pos_alert_settings/);
  assert.match(php, /pos_save_dashboard_notification/);
  assert.doesNotMatch(php, /wamaster\.atavtelecom\.in/);
  assert.doesNotMatch(php, /api_key/);
  assert.match(core, /pos_notify_dispatch/);
  assert.match(till, /notifications\/ack/);
  assert.match(routes, /sendWhatsAppOne/);
  assert.match(routes, /loadAlertSettings/);
  assert.doesNotMatch(routes, /wamaster\.atavtelecom\.in/);
  assert.match(master, /id="wa-campaign-form"/);
  assert.match(master, /id="note-form"/);
  assert.match(master, /id="note-image"/);
  assert.match(master, /image_url/);
  assert.match(master, /\/api\/master\/notify-campaigns/);
  assert.doesNotMatch(master, /wamaster\.atavtelecom\.in/);
  assert.match(app, /\/api\/notifications\/ack/);
  assert.match(app, /id="notice-popup"/);
  assert.match(app, /openNoticePopup/);
  assert.match(read("pos-notify.php"), /function pos_shop_notice_rows/);
  assert.match(read("pos-php-till.php"), /pos_shop_notice_rows/);
  assert.match(read("css/saas.css"), /notice-popup-photo/);
  assert.match(schema, /whatsapp_consent/);
  assert.match(schema, /whatsapp_opt_out/);
});
