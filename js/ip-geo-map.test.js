import test from "node:test";
import assert from "node:assert/strict";
import "./ip-geo-map.js";

const map = globalThis.POSIpMap;

test("private and reserved addresses stay off the geolocation lookup", () => {
  for (const ip of [
    "",
    "localhost",
    "10.1.2.3",
    "192.168.1.9",
    "172.16.0.1",
    "172.31.255.1",
    "127.0.0.1",
    "169.254.1.1",
    "100.64.0.8",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12::1",
    "::ffff:10.0.0.1",
    "192.168.0.1%eth0",
  ]) {
    assert.equal(map.isPrivateIp(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "49.36.12.10", "172.15.0.1", "172.32.0.1", "::ffff:8.8.8.8", "2001:4860:4860::8888"]) {
    assert.equal(map.isPrivateIp(ip), false, ip);
  }
});

test("sessions group by IP and only a live sign-in counts as online", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  const places = map.groupIpSessions([
    { ip: "8.8.8.8", last_seen_at: "2026-11-17T11:58:00Z", business_name: "Spice", expires_at: "2026-11-18T00:00:00Z" },
    { ip: "8.8.8.8", last_seen_at: "2026-11-17T10:00:00Z", business_name: "Other", expires_at: "2026-11-18T00:00:00Z" },
    { ip: "10.0.0.4", last_seen_at: "2026-11-17T11:59:00Z", business_name: "Shop", expires_at: "2026-11-18T00:00:00Z" },
    { ip: "1.1.1.1", last_seen_at: "2026-11-17T11:59:30Z", business_name: "Closed", revoked_at: "2026-11-17T11:59:40Z", expires_at: "2026-11-18T00:00:00Z" },
  ], now);
  const pub = places.find((place) => place.ip === "8.8.8.8");
  assert.equal(pub.sessions, 2);
  assert.equal(pub.online, 1);
  assert.equal(pub.local, false);
  assert.deepEqual(pub.businesses, ["Other", "Spice"]);
  const local = places.find((place) => place.ip === "10.0.0.4");
  assert.equal(local.local, true);
  assert.equal(local.online, 1);
  const closed = places.find((place) => place.ip === "1.1.1.1");
  assert.equal(closed.online, 0);
});

test("equirectangular projection keeps the equator and date line in place", () => {
  assert.deepEqual(map.project(0, 0, 360, 180), { x: 180, y: 90 });
  assert.deepEqual(map.project(-180, 90, 360, 180), { x: 0, y: 0 });
  assert.deepEqual(map.project(180, -90, 360, 180), { x: 360, y: 180 });
});

test("whois replies need a real coordinate", () => {
  assert.equal(map.parseWhois({ success: false, latitude: 1, longitude: 2 }), null);
  assert.equal(map.parseWhois({ latitude: 91, longitude: 10 }), null);
  assert.deepEqual(map.parseWhois({ country: "India", country_code: "IN", region: "Maharashtra", city: "Mumbai", latitude: 19.076, longitude: 72.8777 }), {
    lat: 19.076,
    lon: 72.8777,
    country: "India",
    countryCode: "IN",
    region: "Maharashtra",
    city: "Mumbai",
  });
});

test("country totals and pins collapse a city without plotting private networks", () => {
  const places = [
    { ip: "1.1.1.1", sessions: 2, online: 1, local: false, lat: 19.07, lon: 72.87, city: "Mumbai", country: "India" },
    { ip: "8.8.8.8", sessions: 1, online: 0, local: false, lat: 19.08, lon: 72.88, city: "Mumbai", country: "India" },
    { ip: "10.0.0.2", sessions: 4, online: 1, local: true },
  ];
  const countries = map.countryTotals(places);
  const india = countries.find((row) => row.country === "India");
  assert.equal(india.sessions, 3);
  assert.equal(india.ips, 2);
  assert.equal(countries.find((row) => row.country === "Private network").ips, 1);
  const pins = map.mapPins(places);
  assert.equal(pins.length, 1);
  assert.equal(pins[0].sessions, 3);
  assert.equal(pins[0].online, 1);
  assert.equal(map.totals(places).mapped, 2);
  assert.equal(map.totals(places).countries, 1);
});

test("website page views group by visitor IP and keep private traffic off the map", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  const places = map.groupWebsiteTraffic([
    { ip: "49.36.12.10", session_id: "s1", page_path: "/pricing", occurred_at: "2026-11-17T11:58:00Z" },
    { ip: "49.36.12.10", session_id: "s1", page_path: "/", occurred_at: "2026-11-17T11:57:00Z" },
    { ip: "49.36.12.10", session_id: "s2", page_path: "/", occurred_at: "2026-11-16T08:00:00Z" },
    { ip: "192.168.0.8", session_id: "lan", page_path: "/login.html", occurred_at: "2026-11-17T11:59:00Z" },
  ], now);
  const pub = places.find((place) => place.ip === "49.36.12.10");
  assert.equal(pub.views, 3);
  assert.equal(pub.sessions, 2);
  assert.equal(pub.online, 1);
  assert.equal(pub.local, false);
  assert.deepEqual(pub.businesses, ["/", "/pricing"]);
  const local = places.find((place) => place.ip === "192.168.0.8");
  assert.equal(local.local, true);
  assert.equal(map.mapPins(places).length, 0);
  const html = map.render({ traffic: "website", places, countries: map.countryTotals(places) });
  assert.match(html, /id="ip-leaflet"/);
  assert.match(html, /3 views/);
  assert.match(html, /\/pricing/);
  assert.equal(map.dashboardStats(places.map(map.toRecord)).plotted, 0);
});

test("the map dashboard escapes location text", () => {
  const html = map.render({
    places: [{
      ip: "1.2.3.4",
      sessions: 1,
      online: 1,
      local: false,
      lat: 19,
      lon: 72,
      city: `<img src=x onerror=alert(1)>`,
      country: "India",
      businesses: ["A&B"],
      lastSeen: "2026-11-17T12:00:00Z",
    }],
    note: `Staff "sign-in" map`,
  });
  assert.match(html, /id="ip-leaflet"/);
  assert.match(html, /aria-label="World map of IP locations"/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /A&amp;B/);
  assert.match(html, /Staff &quot;sign-in&quot; map/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /Locate IPs/);
  assert.match(html, /Private networks stay off the map/);
  assert.match(map.popupHtml(map.toRecord({ ip: "8.8.8.8", city: "<b>x</b>", country: "US", lat: 1, lon: 2 })), /&lt;b&gt;x&lt;\/b&gt;/);
  assert.deepEqual(map.parseIpList("8.8.8.8, 1.1.1.1 8.8.8.8"), ["8.8.8.8", "1.1.1.1"]);
  assert.match(map.recordsCsv([{ ip: "1.1.1.1", city: 'A"B', country: "US", lat: 1, lon: 2, views: 3 }]), /"A""B"/);
});
