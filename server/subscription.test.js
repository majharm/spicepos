import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  publicStatus,
  subscriptionDenial,
  extendExpiryYmd,
  addYearsYmd,
  calendarYmd,
  shopTodayYmd,
  isRenewalApiPath,
  SUBSCRIPTION_EXPIRED_TITLE,
  SUBSCRIPTION_EXPIRED_MESSAGE,
} from "./subscription.js";

const today = "2026-10-23";

test("the paid expiry day stays active", () => {
  assert.equal(publicStatus({ status: "active", subscription_expires_at: "2026-10-23" }, today), "active");
  assert.equal(
    publicStatus({ status: "active", subscription_expires_at: new Date("2026-10-23T00:00:00Z") }, today),
    "active",
  );
});

test("the day before today is expired", () => {
  assert.equal(publicStatus({ status: "active", subscription_expires_at: "2026-10-22" }, today), "expired");
  assert.equal(
    publicStatus({ status: "active", subscription_expires_at: "2026-10-22 18:30:00" }, today),
    "expired",
  );
});

test("suspended and inactive win over the expiry date", () => {
  assert.equal(publicStatus({ status: "suspended", subscription_expires_at: "2027-01-01" }, today), "suspended");
  assert.equal(publicStatus({ status: "inactive", subscription_expires_at: "2027-01-01" }, today), "inactive");
});

test("a shop with no expiry date stays on its stored status", () => {
  assert.equal(publicStatus({ status: "active", subscription_expires_at: null }, today), "active");
  assert.equal(publicStatus(null, today), "inactive");
});

test("shop today follows Asia/Kolkata", () => {
  assert.equal(shopTodayYmd(new Date("2026-10-23T10:00:00Z")), "2026-10-23");
  assert.equal(shopTodayYmd(new Date("2026-10-23T20:00:00Z")), "2026-10-24");
});

test("expired denial uses the login alert copy", () => {
  const body = subscriptionDenial(
    { id: "b1", name: "Mehta Garments", subscription_expires_at: "2026-10-01" },
    "expired",
    { id: "p1", code: "PRO", name: "Pro", fee_monthly: 4999 },
  );
  assert.equal(body.ok, false);
  assert.equal(body.code, "subscription_expired");
  assert.equal(body.title, SUBSCRIPTION_EXPIRED_TITLE);
  assert.equal(body.error, SUBSCRIPTION_EXPIRED_MESSAGE);
  assert.equal(body.business.name, "Mehta Garments");
  assert.equal(body.business.subscription_expires_at, "2026-10-01");
  assert.equal(body.plan.name, "Pro");
  assert.equal(body.plan.fee_monthly, 4999);
});

test("suspended and inactive denials stay distinct", () => {
  assert.equal(subscriptionDenial({ id: "b" }, "suspended").code, "subscription_suspended");
  assert.equal(subscriptionDenial({ id: "b" }, "inactive").code, "subscription_inactive");
  assert.equal(subscriptionDenial({ id: "b" }, "active"), null);
});

test("renewal extends one year from the later of today and the current expiry", () => {
  assert.equal(extendExpiryYmd("2027-01-15", today), "2028-01-15");
  assert.equal(extendExpiryYmd("2026-01-01", today), "2027-10-23");
  assert.equal(extendExpiryYmd(null, today), "2027-10-23");
  assert.equal(addYearsYmd("2024-02-29", 1), "2025-03-01");
  assert.equal(calendarYmd("2026-10-23T00:00:00.000Z"), "2026-10-23");
});

test("only a GET of the renewal path is open to an expired shop", () => {
  assert.equal(isRenewalApiPath("GET", "/api/billing/renewal"), true);
  assert.equal(isRenewalApiPath("POST", "/api/billing/renewal"), false);
  assert.equal(isRenewalApiPath("GET", "/api/dashboard"), false);
});

test("login and master renewal stay wired on the server and the login page", () => {
  const auth = fs.readFileSync(new URL("./auth.js", import.meta.url), "utf8");
  const master = fs.readFileSync(new URL("./master.js", import.meta.url), "utf8");
  const core = fs.readFileSync(new URL("../pos-php-core.php", import.meta.url), "utf8");
  const till = fs.readFileSync(new URL("../pos-php-till.php", import.meta.url), "utf8");
  const login = fs.readFileSync(new URL("../login.html", import.meta.url), "utf8");
  const xpos = fs.readFileSync(new URL("../js/x-pos-20260830e.js", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const ui = fs.readFileSync(new URL("../js/master.js", import.meta.url), "utf8");
  assert.match(auth, /subscriptionDenial/);
  assert.match(auth, /\/api\/billing\/renewal/);
  assert.doesNotMatch(auth, /expired: status === "expired"/);
  assert.match(master, /businesses\/:id\/renew/);
  assert.match(master, /businesses\/:id\/subscription/);
  assert.match(core, /function pos_subscription_denial/);
  assert.match(core, /master\/businesses\/\(\[\^\/\]\+\)\/renew/);
  assert.match(core, /business_subscription_events/);
  assert.doesNotMatch(core, /"expired" => \$status === "expired"/);
  assert.match(till, /pos_reject_inactive_subscription/);
  assert.match(login, /Subscription Expired!/);
  assert.match(login, new RegExp(SUBSCRIPTION_EXPIRED_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(login, /Renew Subscription/);
  assert.match(login, /Contact Support/);
  assert.match(xpos, /showSubscriptionAlert/);
  assert.doesNotMatch(xpos, /renewal message after opening the dashboard/);
  assert.match(app, /pos_subscription_notice/);
  assert.match(ui, /data-renew/);
  assert.match(ui, /data-history/);
});
