import { query } from "./db.js";
import { ensureAnalyticsSchema } from "./analytics.js";
import "../js/ip-geo-map.js";

const WINDOW_DAYS = 14;
const LOOKUP_CAP = 12;
const NOTE = "Website page views from the last 14 days. Locations are estimated from the visitor IP. Private networks stay off the map.";

function mapApi() {
  return globalThis.POSIpMap;
}

export async function ensureIpGeoCache() {
  await query(
    `CREATE TABLE IF NOT EXISTS ip_geo_cache (
      ip VARCHAR(64) NOT NULL PRIMARY KEY,
      country VARCHAR(80) NULL,
      country_code VARCHAR(8) NULL,
      region VARCHAR(80) NULL,
      city VARCHAR(80) NULL,
      lat DECIMAL(9,5) NULL,
      lon DECIMAL(9,5) NULL,
      ok TINYINT NOT NULL DEFAULT 0,
      looked_up_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_ip_geo_lookup (looked_up_at)
    )`,
  );
}

function geoFromRow(row) {
  return {
    lat: Number(row.lat),
    lon: Number(row.lon),
    country: row.country || "",
    countryCode: row.country_code || "",
    region: row.region || "",
    city: row.city || "",
  };
}

async function lookupIp(ip) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return mapApi().parseWhois(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function saveGeo(ip, hit) {
  await query(
    `INSERT INTO ip_geo_cache (ip, country, country_code, region, city, lat, lon, ok, looked_up_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       country = VALUES(country),
       country_code = VALUES(country_code),
       region = VALUES(region),
       city = VALUES(city),
       lat = VALUES(lat),
       lon = VALUES(lon),
       ok = VALUES(ok),
       looked_up_at = NOW()`,
    [
      ip,
      hit?.country || "",
      hit?.countryCode || "",
      hit?.region || "",
      hit?.city || "",
      hit ? hit.lat : 0,
      hit ? hit.lon : 0,
      hit ? 1 : 0,
    ],
  );
}

async function attachGeo(ips) {
  const found = new Map();
  if (!ips.length) return found;
  const marks = ips.map(() => "?").join(",");
  const cached = await query(
    `SELECT ip, country, country_code, region, city, lat, lon, ok, looked_up_at
     FROM ip_geo_cache WHERE ip IN (${marks})`,
    ips,
  );
  const fresh = new Map();
  const now = Date.now();
  for (const row of cached) {
    const age = now - new Date(row.looked_up_at).getTime();
    const keep = Number(row.ok) === 1 ? age < 30 * 86400000 : age < 86400000;
    if (keep) fresh.set(String(row.ip), row);
  }
  let lookups = 0;
  for (const ip of ips) {
    const row = fresh.get(ip);
    if (row) {
      if (Number(row.ok) === 1) found.set(ip, geoFromRow(row));
      continue;
    }
    if (lookups >= LOOKUP_CAP) continue;
    lookups += 1;
    const hit = await lookupIp(ip);
    await saveGeo(ip, hit);
    if (hit) found.set(ip, hit);
  }
  return found;
}

function emptyMap() {
  return {
    places: [],
    countries: [],
    totals: { ips: 0, views: 0, sessions: 0, online: 0, countries: 0, mapped: 0 },
    windowDays: WINDOW_DAYS,
    traffic: "website",
    note: NOTE,
  };
}

export async function masterIpMap() {
  const api = mapApi();
  try {
    await ensureAnalyticsSchema();
    await ensureIpGeoCache();
    const rows = await query(
      `SELECT ip, session_id, page_path, occurred_at
       FROM website_analytics_events
       WHERE event_name = 'page_view'
         AND ip IS NOT NULL AND ip <> ''
         AND occurred_at >= DATE_SUB(NOW(), INTERVAL ${WINDOW_DAYS} DAY)
       ORDER BY occurred_at DESC
       LIMIT 800`,
    );
    const grouped = api.groupWebsiteTraffic(rows);
    const geos = await attachGeo(grouped.filter((place) => !place.local).map((place) => place.ip));
    const places = grouped.map((place) => {
      const hit = geos.get(place.ip);
      return hit ? { ...place, ...hit } : place;
    });
    return {
      places,
      countries: api.countryTotals(places),
      totals: api.totals(places),
      windowDays: WINDOW_DAYS,
      traffic: "website",
      note: NOTE,
    };
  } catch {
    return emptyMap();
  }
}
