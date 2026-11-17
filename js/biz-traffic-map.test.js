import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./biz-traffic-map.js";
import "./ip-geo-map.js";

const M = globalThis.POSBizTraffic;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (name) => readFileSync(path.join(root, name), "utf8");
const now = Date.parse("2026-11-17T12:00:00Z");

test("a login without a heartbeat stays offline", () => {
  assert.equal(M.adminStatus({ loginAt: new Date(now - 5000).toISOString() }, now), "offline");
  assert.equal(M.adminStatus({ heartbeatAt: new Date(now - 30 * 1000).toISOString() }, now), "online");
  assert.equal(M.adminStatus({ heartbeatAt: new Date(now - 10 * 60 * 1000).toISOString() }, now), "recent");
  assert.equal(M.adminStatus({
    heartbeatAt: new Date(now - 10 * 60 * 1000).toISOString(),
    logoutAt: new Date(now - 60 * 1000).toISOString(),
  }, now), "recent");
  assert.equal(M.adminStatus({ heartbeatAt: new Date(now - 2 * 60 * 60 * 1000).toISOString() }, now), "offline");
});

test("one business keeps the most live admin and skips private networks", () => {
  const rows = M.foldBusinessAdmins([
    {
      businessId: "b1",
      businessName: "Spice",
      ownerName: "Asha",
      category: "Grocery",
      ip: "8.8.8.8",
      heartbeatAt: new Date(now - 20 * 1000).toISOString(),
      lat: 12.97,
      lon: 77.59,
      country: "India",
      region: "Karnataka",
      city: "Bengaluru",
    },
    {
      businessId: "b1",
      businessName: "Spice",
      ownerName: "Asha",
      category: "Grocery",
      ip: "1.1.1.1",
      heartbeatAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      businessId: "b2",
      businessName: "Quiet",
      ownerName: "Ravi",
      category: "Pharmacy",
      ip: "10.0.0.4",
      loginAt: new Date(now - 1000).toISOString(),
    },
  ], now);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].businessId, "b1");
  assert.equal(rows[0].status, "online");
  assert.equal(rows[0].plotted, true);
  assert.equal(rows[1].status, "offline");
  assert.equal(rows[1].plotted, false);
  assert.equal(rows[1].local, true);
  const summary = M.summarize(rows, now);
  assert.equal(summary.total, 2);
  assert.equal(summary.online, 1);
  assert.equal(summary.offline, 1);
  assert.equal(summary.plotted, 1);
});

test("active today follows the Asia/Kolkata day of the heartbeat", () => {
  const early = M.foldBusinessAdmins([{
    businessId: "b3",
    businessName: "Dawn",
    heartbeatAt: "2026-11-17T02:00:00Z",
    ip: "8.8.8.8",
    lat: 1,
    lon: 2,
  }], now);
  assert.equal(early[0].status, "offline");
  assert.equal(early[0].activeToday, true);
  const nextDay = M.foldBusinessAdmins([{
    businessId: "b4",
    businessName: "Night",
    heartbeatAt: "2026-11-16T12:00:00Z",
    ip: "8.8.8.8",
  }], now);
  assert.equal(nextDay[0].activeToday, false);
});

test("filters and popups keep business details and escape text", () => {
  const rows = M.foldBusinessAdmins([
    { businessId: "b1", businessName: "Spice <b>", ownerName: "Asha", category: "Grocery", country: "India", region: "Karnataka", city: "Bengaluru", status: "online", ip: "8.8.8.8", lat: 1, lon: 2 },
    { businessId: "b2", businessName: "Other", category: "Pharmacy", country: "India", region: "Delhi", city: "Delhi", status: "offline", ip: "1.1.1.1", lat: 3, lon: 4 },
  ], now);
  const online = M.filterBusinesses(rows, { status: "online", country: "India", region: "Karnataka" });
  assert.equal(online.length, 1);
  assert.equal(online[0].businessId, "b1");
  const html = M.popupHtml(online[0]);
  assert.match(html, /Spice &lt;b&gt;/);
  assert.match(html, /Business ID b1/);
  assert.match(html, /Asha/);
  assert.match(html, /8\.8\.8\.8/);
  assert.match(html, /Bengaluru/);
  assert.match(html, /Grocery/);
  assert.match(html, /Online/);
  assert.match(html, /not an exact address/);
  assert.doesNotMatch(html, /<b>/);
  const choices = M.choices(rows);
  assert.deepEqual(choices.category, ["Grocery", "Pharmacy"]);
});

test("each device of one business keeps its own pin", () => {
  const rows = M.foldBusinessAdmins([
    {
      businessId: "b1",
      businessName: "Spice",
      deviceId: "phonephone",
      deviceLabel: "Android app",
      category: "Grocery",
      ip: "10.1.1.1",
      lat: 19.07,
      lon: 72.87,
      locationSource: "device",
      heartbeatAt: new Date(now - 10 * 1000).toISOString(),
    },
    {
      businessId: "b1",
      businessName: "Spice",
      deviceId: "countercounter",
      deviceLabel: "Windows browser",
      category: "Grocery",
      ip: "10.1.1.2",
      lat: 18.52,
      lon: 73.85,
      locationSource: "device",
      heartbeatAt: new Date(now - 20 * 1000).toISOString(),
    },
  ], now);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].plotted, true);
  assert.equal(rows[1].plotted, true);
  assert.notEqual(rows[0].deviceId, rows[1].deviceId);
  const html = M.popupHtml(rows.find((row) => row.deviceLabel === "Android app"));
  assert.match(html, /Device Android app/);
  assert.match(html, /Device location/);
});

test("a device fix is plotted even on a private network", () => {
  const rows = M.foldBusinessAdmins([{
    businessId: "b8",
    businessName: "Counter",
    ip: "10.0.0.8",
    lat: 12.9716,
    lon: 77.5946,
    locationSource: "device",
    accuracy: 18,
    heartbeatAt: new Date(now - 10 * 1000).toISOString(),
  }], now);
  assert.equal(rows[0].plotted, true);
  assert.equal(rows[0].locationSource, "device");
  assert.equal(rows[0].local, true);
  const html = M.popupHtml(rows[0]);
  assert.match(html, /Device location/);
  assert.match(html, /18 m/);
  const kept = M.withShopPlaces(rows);
  assert.equal(kept[0].placeSource, undefined);
  assert.ok(Math.abs(kept[0].lat - 12.9716) < 0.001);
});

test("a shop city is plotted when the admin IP does not resolve", () => {
  const rows = M.withShopPlaces(M.foldBusinessAdmins([
    {
      businessId: "b9",
      businessName: "Local Mart",
      ip: "10.1.1.8",
      shopCity: "Bengaluru",
      shopState: "Karnataka",
    },
    {
      businessId: "b10",
      businessName: "State Only",
      ip: "",
      shopState: "Kerala",
    },
  ], now));
  assert.equal(rows[0].plotted, true);
  assert.equal(rows[0].placeSource, "shop");
  assert.ok(Math.abs(rows[0].lat - 12.9716) < 0.01);
  assert.equal(rows[1].plotted, true);
  assert.ok(Math.abs(rows[1].lat - 10.8505) < 0.01);
  const html = M.popupHtml(rows[0]);
  assert.match(html, /shop city/);
});

test("business map is polled from Master Admin and heartbeats are separate from login", () => {
  const html = read("master.html");
  const master = read("js/master.js");
  const auth = read("server/auth.js");
  const php = read("pos-php-core.php");
  assert.match(html, /data-tab="bizmap"/);
  assert.match(html, /biz-traffic-map\.js\?v=20261118pwa1/);
  assert.match(html, /vendor\/leaflet\/leaflet\.js\?v=20261117map1/);
  assert.match(html, /master\.js\?v=20261118alert1/);
  assert.match(read("index.html"), /admin-heartbeat\.js\?v=20261118pwa1/);
  assert.match(read("index.html"), /manifest\.webmanifest/);
  assert.match(read("index.html"), /pos-device\.js\?v=20261118pwa2/);
  assert.match(read("js/pos-device.js"), /pwa-notice/);
  assert.match(read("js/pos-device.js"), /beforeinstallprompt/);
  assert.match(read("login.html"), /manifest\.webmanifest/);
  assert.match(read("sw.js"), /pathname\.startsWith\("\/api\/"\)/);
  assert.match(read("js/pos-device.js"), /pos\.device\.id/);
  assert.match(read("js/admin-heartbeat.js"), /\/api\/session\/heartbeat/);
  assert.match(read("js/admin-heartbeat.js"), /POSDevice/);
  assert.match(read("js/admin-heartbeat.js"), /enableHighAccuracy: true/);
  assert.match(read("js/admin-heartbeat.js"), /reply\?\.data\?\.tracked/);
  assert.match(read("js/admin-heartbeat.js"), /visibilityState === "hidden"/);
  assert.doesNotMatch(read("js/session-pulse.js"), /setInterval/);
  assert.match(master, /tab === "bizmap"/);
  assert.match(master, /\/api\/master\/biz-traffic/);
  assert.match(master, /30000/);
  assert.match(auth, /\/api\/session\/heartbeat/);
  assert.match(auth, /recordAdminLogin/);
  assert.match(read("server/biz-traffic.js"), /heartbeat_at = NULL/);
  assert.match(read("server/biz-traffic.js"), /INTERVAL 90 SECOND/);
  assert.match(read("server/biz-traffic.js"), /INTERVAL 30 MINUTE/);
  assert.match(read("server/master-live.js"), /\/api\/master\/biz-traffic/);
  assert.match(read("pos-master-live.php"), /function pos_master_biz_traffic/);
  assert.match(read("pos-master-live.php"), /master\/biz-traffic/);
  assert.match(php, /session\/heartbeat/);
  assert.match(php, /function pos_record_admin_login/);
  assert.match(php, /heartbeat_at = NULL/);
  assert.match(read("js/biz-traffic-map.js"), /not an exact address/);
  assert.match(read("js/biz-traffic-map.js"), /maps\.googleapis\.com\/maps\/api\/js/);
  assert.match(read("js/biz-traffic-map.js"), /AIzaSyAG8q32DcFtFKmgK3V20L4K_FsN4lI3jB4/);
  assert.match(read("server/biz-traffic.js"), /shop_city/);
  assert.match(read("server/biz-traffic.js"), /location_source = 'device'/);
  assert.match(read("pos-master-live.php"), /shopCity/);
  assert.match(read("pos-php-core.php"), /function pos_device_point/);
  assert.match(read("server/biz-traffic.js"), /ADD PRIMARY KEY \(staff_user_id, device_id\)/);
  assert.match(read("pos-php-core.php"), /function pos_device_id/);
  const board = M.render({ businesses: [], summary: { total: 0, online: 0, offline: 0, activeToday: 0 } });
  assert.match(board, /Total businesses/);
  assert.match(board, /Online now/);
  assert.match(board, /Offline/);
  assert.match(board, /Active today/);
  assert.match(board, /id="biz-country"/);
  assert.match(board, /id="biz-status"/);
});
