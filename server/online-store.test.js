import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildStoreLine,
  normalizeOnlineStore,
  normalizeSlug,
  onlineStoreForSignup,
  storefrontBanner,
  validateBannerDataUrl,
} from "./online-store.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("Online Store stays off for a new business unless Master Admin allows it", () => {
  assert.equal(onlineStoreForSignup({}, 0), 0);
  assert.equal(onlineStoreForSignup({ name: "Cafe" }, 0), 0);
  assert.equal(onlineStoreForSignup({}, 1), 1);
  assert.equal(onlineStoreForSignup({ onlineStore: 0 }, 1), 0);
  assert.equal(onlineStoreForSignup({ online_store: 1 }, 0), 1);
  assert.equal(onlineStoreForSignup({ onlineStore: "yes" }, 0), 1);
  assert.equal(normalizeOnlineStore(Buffer.from([1])), 1);
  assert.equal(normalizeOnlineStore(Buffer.from([0])), 0);
  assert.equal(normalizeOnlineStore("1"), 1);
  assert.equal(normalizeOnlineStore(true), 1);
});

test("store URL and login banner stay specific to one business", () => {
  assert.equal(normalizeSlug(" Cafe Nova "), "cafe-nova");
  assert.throws(() => normalizeSlug("a"), /3–40/);
  assert.throws(() => normalizeSlug("admin"), /different store URL/);
  const jpeg = `data:image/jpeg;base64,${"A".repeat(80)}`;
  assert.equal(validateBannerDataUrl(jpeg), jpeg);
  assert.throws(() => validateBannerDataUrl("data:image/gif;base64,AAAA"), /JPG, PNG, or WebP/);
  assert.deepEqual(storefrontBanner({ banner_enabled: 0, banner_desktop: "data:image/png;base64,cafe" }), { desktop: "", mobile: "" });
  assert.deepEqual(storefrontBanner({ banner_enabled: 1, banner_desktop: "data:image/png;base64,cafe", banner_mobile: "data:image/png;base64,cafe-mobile" }), {
    desktop: "data:image/png;base64,cafe",
    mobile: "data:image/png;base64,cafe-mobile",
  });
  const line = buildStoreLine({ retail_rate: 100, gst_rate: 5, unit: "PCS", base_unit: "PCS" }, 2);
  assert.equal(line.amount, 200);
  assert.equal(line.gst, 10);
});

test("Master Admin and the owner dashboard wire the Online Store permission", () => {
  const master = read("js/master.js");
  const app = read("js/app.js");
  const php = read("pos-php-core.php");
  const schema = read("server/schema.js");
  assert.match(master, /Module Permissions/);
  assert.match(master, /Enable Online Store for All Existing and New Businesses/);
  assert.match(master, /Enable for All Businesses/);
  assert.match(master, /Disable for All Businesses/);
  assert.match(master, /data-store-toggle/);
  assert.match(app, /function onlineStoreOn/);
  assert.match(app, /function onlineStoreAllowed/);
  assert.match(app, /function paintOnlineStoreNav/);
  assert.match(app, /function applyBusinessFlags/);
  assert.match(app, /window\.addEventListener\("focus", \(\) => void pull\(\)\)/);
  assert.match(app, /void pull\(\);/);
  assert.match(app, /data-view="online-store"/);
  assert.match(read("index.html"), /id="open-online-store"/);
  assert.match(read("server/online-store.js"), /requirePermAny\("settings", "items", "orders"\)/);
  assert.match(read("pos-php-till.php"), /"online-store"/);
  assert.match(read("pos-online-store.php"), /function pos_online_store_staff_allowed/);
  assert.match(read("index.html"), /data-view="online-store"/);
  assert.match(read("js/online-store-desk.js"), /Login page banner/);
  assert.match(read("js/storefront.js"), /store-banner-default/);
  assert.match(schema, /online_store", "TINYINT\(1\) NOT NULL DEFAULT 0/);
  assert.match(php, /function pos_online_store_for_signup/);
  assert.match(read("pos-online-store.php"), /function pos_online_store_banner/);
  assert.match(read("server/online-store.js"), /UPDATE items SET stock_gm = stock_gm - \?/);
  assert.doesNotMatch(read("server/online-store.js"), /DELETE FROM online_orders/);
});
