import { query } from "./db.js";
import { locateIps } from "./ip-geo.js";
import "../js/biz-traffic-map.js";

const ADMIN_ROLES = ["business_admin", "resort_owner"];
const NOTE = globalThis.POSBizTraffic.NOTE;

export async function ensureBusinessPresence() {
  await query(
    `CREATE TABLE IF NOT EXISTS business_admin_presence (
      staff_user_id VARCHAR(255) NOT NULL PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      ip VARCHAR(64) NULL,
      login_at DATETIME NULL,
      heartbeat_at DATETIME NULL,
      logout_at DATETIME NULL,
      country VARCHAR(80) NULL,
      region VARCHAR(80) NULL,
      city VARCHAR(80) NULL,
      lat DECIMAL(9,5) NULL,
      lon DECIMAL(9,5) NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_bap_business (business_id),
      KEY idx_bap_heartbeat (heartbeat_at)
    )`,
  );
  await query(`ALTER TABLE business_admin_presence ADD COLUMN location_source VARCHAR(16) NULL`).catch(() => {});
  await query(`ALTER TABLE business_admin_presence ADD COLUMN accuracy_m INT NULL`).catch(() => {});
  await query(`ALTER TABLE business_admin_presence ADD COLUMN device_id VARCHAR(64) NOT NULL DEFAULT ''`).catch(() => {});
  await query(`ALTER TABLE business_admin_presence ADD COLUMN device_label VARCHAR(40) NULL`).catch(() => {});
  const keys = await query(`SHOW INDEX FROM business_admin_presence WHERE Key_name = 'PRIMARY'`).catch(() => []);
  const cols = [...new Set((keys || []).map((row) => String(row.Column_name || row.column_name || "")))].filter(Boolean).sort();
  if (cols.length === 1 && cols[0] === "staff_user_id") {
    await query(`ALTER TABLE business_admin_presence DROP PRIMARY KEY, ADD PRIMARY KEY (staff_user_id, device_id)`);
  }
}

function cleanDeviceId(point) {
  const raw = String(point?.deviceId || point?.device_id || "").trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(raw) ? raw : "";
}

function cleanDeviceLabel(point) {
  return String(point?.deviceLabel || point?.device_label || "").replace(/\s+/g, " ").trim().slice(0, 40);
}

async function dropBlankDevice(userId, device) {
  if (!device) return;
  await query(`DELETE FROM business_admin_presence WHERE staff_user_id = ? AND device_id = ''`, [userId]).catch(() => {});
}

function devicePoint(point) {
  const lat = Number(point?.lat);
  const lon = Number(point?.lon ?? point?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat === 0 && lon === 0) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const accuracy = Number(point?.accuracy);
  return {
    lat: Math.round(lat * 1e5) / 1e5,
    lon: Math.round(lon * 1e5) / 1e5,
    accuracy: Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100000 ? Math.round(accuracy) : null,
  };
}

function isAdmin(user) {
  return Boolean(user?.id && user?.business_id && ADMIN_ROLES.includes(String(user.role || "")));
}

export async function recordAdminLogin(user, ip, point) {
  if (!isAdmin(user)) return;
  try {
    await ensureBusinessPresence();
    const clean = String(ip || "").trim().slice(0, 64);
    const device = cleanDeviceId(point);
    const label = cleanDeviceLabel(point);
    await query(
      `INSERT INTO business_admin_presence (staff_user_id, business_id, device_id, device_label, ip, login_at, heartbeat_at, logout_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NULL, NULL)
       ON DUPLICATE KEY UPDATE
         business_id = VALUES(business_id),
         device_label = IF(VALUES(device_label) = '', device_label, VALUES(device_label)),
         country = IF(ip <=> VALUES(ip), country, NULL),
         region = IF(ip <=> VALUES(ip), region, NULL),
         city = IF(ip <=> VALUES(ip), city, NULL),
         lat = IF(IFNULL(location_source, '') = 'device', lat, IF(ip <=> VALUES(ip), lat, NULL)),
         lon = IF(IFNULL(location_source, '') = 'device', lon, IF(ip <=> VALUES(ip), lon, NULL)),
         ip = VALUES(ip),
         login_at = NOW(),
         heartbeat_at = NULL,
         logout_at = NULL,
         updated_at = NOW()`,
      [user.id, user.business_id, device, label, clean],
    );
    await dropBlankDevice(user.id, device);
  } catch (err) {
    console.error("admin presence login", err.message);
  }
}

export async function recordAdminHeartbeat(user, ip, point) {
  if (!isAdmin(user)) return { ok: true, tracked: false };
  await ensureBusinessPresence();
  const clean = String(ip || "").trim().slice(0, 64);
  const deviceId = cleanDeviceId(point);
  const label = cleanDeviceLabel(point);
  const device = devicePoint(point);
  if (device) {
    await query(
      `INSERT INTO business_admin_presence
         (staff_user_id, business_id, device_id, device_label, ip, login_at, heartbeat_at, logout_at, lat, lon, location_source, accuracy_m)
       VALUES (?, ?, ?, ?, ?, NULL, NOW(), NULL, ?, ?, 'device', ?)
       ON DUPLICATE KEY UPDATE
         business_id = VALUES(business_id),
         device_label = IF(VALUES(device_label) = '', device_label, VALUES(device_label)),
         heartbeat_at = IF(heartbeat_at IS NULL OR heartbeat_at < DATE_SUB(NOW(), INTERVAL 20 SECOND), NOW(), heartbeat_at),
         logout_at = NULL,
         ip = VALUES(ip),
         lat = VALUES(lat),
         lon = VALUES(lon),
         location_source = 'device',
         accuracy_m = VALUES(accuracy_m),
         country = NULL,
         region = NULL,
         city = NULL,
         updated_at = NOW()`,
      [user.id, user.business_id, deviceId, label, clean, device.lat, device.lon, device.accuracy],
    );
  } else {
    await query(
      `INSERT INTO business_admin_presence (staff_user_id, business_id, device_id, device_label, ip, login_at, heartbeat_at, logout_at)
       VALUES (?, ?, ?, ?, ?, NULL, NOW(), NULL)
       ON DUPLICATE KEY UPDATE
         business_id = VALUES(business_id),
         device_label = IF(VALUES(device_label) = '', device_label, VALUES(device_label)),
         heartbeat_at = IF(heartbeat_at IS NULL OR heartbeat_at < DATE_SUB(NOW(), INTERVAL 20 SECOND), NOW(), heartbeat_at),
         logout_at = NULL,
         country = IF(IFNULL(location_source, '') = 'device', country, IF(ip <=> VALUES(ip), country, NULL)),
         region = IF(IFNULL(location_source, '') = 'device', region, IF(ip <=> VALUES(ip), region, NULL)),
         city = IF(IFNULL(location_source, '') = 'device', city, IF(ip <=> VALUES(ip), city, NULL)),
         lat = IF(IFNULL(location_source, '') = 'device', lat, IF(ip <=> VALUES(ip), lat, NULL)),
         lon = IF(IFNULL(location_source, '') = 'device', lon, IF(ip <=> VALUES(ip), lon, NULL)),
         ip = VALUES(ip),
         updated_at = NOW()`,
      [user.id, user.business_id, deviceId, label, clean],
    );
  }
  await dropBlankDevice(user.id, deviceId);
  return { ok: true, tracked: true, onlineWindowSeconds: 90 };
}

export async function recordAdminLogout(user, point) {
  if (!isAdmin(user)) return;
  try {
    await ensureBusinessPresence();
    const device = cleanDeviceId(point);
    if (device) {
      await query(
        `UPDATE business_admin_presence SET logout_at = NOW(), updated_at = NOW() WHERE staff_user_id = ? AND device_id = ?`,
        [user.id, device],
      );
    } else {
      await query(
        `UPDATE business_admin_presence SET logout_at = NOW(), updated_at = NOW() WHERE staff_user_id = ?`,
        [user.id],
      );
    }
  } catch (err) {
    console.error("admin presence logout", err.message);
  }
}

function emptyTraffic() {
  return {
    businesses: [],
    summary: { total: 0, online: 0, recent: 0, offline: 0, activeToday: 0, plotted: 0 },
    pollSeconds: 30,
    note: NOTE,
  };
}

export async function masterBizTraffic() {
  const api = globalThis.POSBizTraffic;
  try {
    await ensureBusinessPresence();
    const rows = await query(
      `SELECT u.id AS admin_id, b.id AS business_id, b.name AS business_name, b.owner_name,
              COALESCE(NULLIF(TRIM(b.business_type), ''), NULLIF(TRIM(b.category), ''), 'Other') AS category,
              COALESCE(b.city, '') AS shop_city, COALESCE(b.state, '') AS shop_state,
              COALESCE(NULLIF(p.ip, ''), s.ip, '') AS ip,
              COALESCE(p.login_at, s.created_at) AS login_at,
              p.heartbeat_at, p.logout_at,
              p.country, p.region, p.city, p.lat, p.lon, p.location_source, p.accuracy_m,
              COALESCE(p.device_id, '') AS device_id, COALESCE(p.device_label, '') AS device_label,
              CASE
                WHEN p.heartbeat_at IS NOT NULL
                  AND p.heartbeat_at >= DATE_SUB(NOW(), INTERVAL 90 SECOND)
                  AND (p.logout_at IS NULL OR p.logout_at < p.heartbeat_at)
                THEN 'online'
                WHEN (p.heartbeat_at IS NOT NULL AND p.heartbeat_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE))
                  OR (p.logout_at IS NOT NULL AND p.logout_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE))
                THEN 'recent'
                ELSE 'offline'
              END AS status,
              CASE
                WHEN p.heartbeat_at >= CURDATE() AND p.heartbeat_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN 1
                ELSE 0
              END AS active_today
       FROM staff_users u
       JOIN businesses b ON b.id = u.business_id
       LEFT JOIN business_admin_presence p ON p.staff_user_id = u.id
       LEFT JOIN staff_sessions s ON s.staff_user_id = u.id AND s.created_at = (
         SELECT MAX(s2.created_at) FROM staff_sessions s2 WHERE s2.staff_user_id = u.id
       )
       WHERE u.role IN ('business_admin', 'resort_owner') AND u.status = 'active'`,
    );
    const seeded = rows.map((row) => ({
      businessId: row.business_id,
      businessName: row.business_name,
      ownerName: row.owner_name || "—",
      category: row.category || "Other",
      ip: row.ip || "",
      loginAt: row.login_at,
      heartbeatAt: row.heartbeat_at,
      logoutAt: row.logout_at,
      country: row.country || "",
      region: row.region || "",
      city: row.city || "",
      shopCity: row.shop_city || "",
      shopState: row.shop_state || "",
      lat: row.lat,
      lon: row.lon,
      locationSource: row.location_source === "device" ? "device" : "",
      accuracy: row.accuracy_m,
      deviceId: row.device_id || "",
      deviceLabel: row.device_label || "",
      status: row.status,
      activeToday: Number(row.active_today) === 1,
    }));
    let businesses = api.foldBusinessAdmins(seeded, Date.now());
    const missing = businesses.filter((row) => row.ip && !row.local && !row.plotted).map((row) => row.ip);
    const geos = await locateIps(missing);
    if (geos.size) {
      businesses = businesses.map((row) => {
        const hit = geos.get(row.ip);
        if (!hit || row.plotted || row.locationSource === "device") return row;
        return api.foldBusinessAdmins([{ ...row, ...hit, status: row.status, activeToday: row.activeToday }])[0] || row;
      });
      await Promise.all([...geos.entries()].map(([ip, hit]) => query(
        `UPDATE business_admin_presence
         SET country = ?, region = ?, city = ?, lat = ?, lon = ?
         WHERE ip = ? AND IFNULL(location_source, '') <> 'device' AND (lat IS NULL OR lat = 0)`,
        [hit.country || "", hit.region || "", hit.city || "", hit.lat, hit.lon, ip],
      ).catch(() => {})));
    }
    const summary = {
      total: businesses.length,
      online: businesses.filter((row) => row.status === "online").length,
      recent: businesses.filter((row) => row.status === "recent").length,
      offline: businesses.filter((row) => row.status === "offline").length,
      activeToday: businesses.filter((row) => row.activeToday).length,
      plotted: businesses.filter((row) => row.plotted).length,
    };
    return { businesses, summary, pollSeconds: 30, note: NOTE };
  } catch (err) {
    console.error("business traffic map", err.message);
    return emptyTraffic();
  }
}
