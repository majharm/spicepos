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
}

function isAdmin(user) {
  return Boolean(user?.id && user?.business_id && ADMIN_ROLES.includes(String(user.role || "")));
}

export async function recordAdminLogin(user, ip) {
  if (!isAdmin(user)) return;
  try {
    await ensureBusinessPresence();
    const clean = String(ip || "").trim().slice(0, 64);
    await query(
      `INSERT INTO business_admin_presence (staff_user_id, business_id, ip, login_at, heartbeat_at, logout_at)
       VALUES (?, ?, ?, NOW(), NULL, NULL)
       ON DUPLICATE KEY UPDATE
         business_id = VALUES(business_id),
         country = IF(ip <=> VALUES(ip), country, NULL),
         region = IF(ip <=> VALUES(ip), region, NULL),
         city = IF(ip <=> VALUES(ip), city, NULL),
         lat = IF(ip <=> VALUES(ip), lat, NULL),
         lon = IF(ip <=> VALUES(ip), lon, NULL),
         ip = VALUES(ip),
         login_at = NOW(),
         heartbeat_at = NULL,
         logout_at = NULL,
         updated_at = NOW()`,
      [user.id, user.business_id, clean],
    );
  } catch (err) {
    console.error("admin presence login", err.message);
  }
}

export async function recordAdminHeartbeat(user, ip) {
  if (!isAdmin(user)) return { ok: true, tracked: false };
  await ensureBusinessPresence();
  const clean = String(ip || "").trim().slice(0, 64);
  await query(
    `INSERT INTO business_admin_presence (staff_user_id, business_id, ip, login_at, heartbeat_at, logout_at)
     VALUES (?, ?, ?, NULL, NOW(), NULL)
     ON DUPLICATE KEY UPDATE
       business_id = VALUES(business_id),
       heartbeat_at = IF(heartbeat_at IS NULL OR heartbeat_at < DATE_SUB(NOW(), INTERVAL 20 SECOND), NOW(), heartbeat_at),
       logout_at = NULL,
       country = IF(ip <=> VALUES(ip), country, NULL),
       region = IF(ip <=> VALUES(ip), region, NULL),
       city = IF(ip <=> VALUES(ip), city, NULL),
       lat = IF(ip <=> VALUES(ip), lat, NULL),
       lon = IF(ip <=> VALUES(ip), lon, NULL),
       ip = VALUES(ip),
       updated_at = NOW()`,
    [user.id, user.business_id, clean],
  );
  return { ok: true, tracked: true, onlineWindowSeconds: 90 };
}

export async function recordAdminLogout(user) {
  if (!isAdmin(user)) return;
  try {
    await ensureBusinessPresence();
    await query(
      `UPDATE business_admin_presence SET logout_at = NOW(), updated_at = NOW() WHERE staff_user_id = ?`,
      [user.id],
    );
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
              COALESCE(NULLIF(p.ip, ''), s.ip, '') AS ip,
              COALESCE(p.login_at, s.created_at) AS login_at,
              p.heartbeat_at, p.logout_at,
              p.country, p.region, p.city, p.lat, p.lon,
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
      lat: row.lat,
      lon: row.lon,
      status: row.status,
      activeToday: Number(row.active_today) === 1,
    }));
    let businesses = api.foldBusinessAdmins(seeded, Date.now());
    const missing = businesses.filter((row) => row.ip && !row.local && !row.plotted).map((row) => row.ip);
    const geos = await locateIps(missing);
    if (geos.size) {
      businesses = businesses.map((row) => {
        const hit = geos.get(row.ip);
        if (!hit || row.plotted) return row;
        return api.foldBusinessAdmins([{ ...row, ...hit, status: row.status, activeToday: row.activeToday }])[0] || row;
      });
      await Promise.all([...geos.entries()].map(([ip, hit]) => query(
        `UPDATE business_admin_presence
         SET country = ?, region = ?, city = ?, lat = ?, lon = ?
         WHERE ip = ? AND (lat IS NULL OR lat = 0)`,
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
