import crypto from "node:crypto";
import { query, withTransaction } from "./db.js";
import { sha256 } from "./audit.js";
import { loadAlertSettings, sendWhatsApp, waCfg } from "./alerts.js";
import { normalizeInMobile, waIntlNumber } from "./alerts.js";
import { hashPin, verifyPin } from "./admin-pin.js";
import {
  CHALLENGE_TTL_MIN,
  FAIL_MESSAGE,
  LIMIT_MESSAGE,
  LOCK_MIN,
  LOG_KEEP_DAYS,
  MAX_OTP_FAILS,
  MAX_PIN_FAILS,
  OTP_KEEP_DAYS,
  OTP_TTL_MIN,
  RESEND_SEC,
  SEND_WINDOW_MIN,
  availableMethods,
  cleanDeviceId,
  cleanPurpose,
  hashOtp,
  isBusinessAdmin,
  maskWhatsapp,
  originAllowed,
  otpCode,
  otpMatches,
  otpSendResponse,
  pinFormatOk,
  publicChallenge,
  safeDetail,
  sendAllowed,
} from "./admin-security-rules.js";

function withoutFk(sql) {
  const cut = sql.indexOf("CONSTRAINT fk_");
  if (cut < 0) return sql;
  return `${sql.slice(0, cut).replace(/,\s*$/, "")}\n  )`;
}

let schemaReady = null;
let pruned = false;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS business_admin_security (
    staff_user_id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    otp_login_enabled TINYINT NOT NULL DEFAULT 0,
    whatsapp_number VARCHAR(20) NULL,
    whatsapp_verified_at TIMESTAMP(3) NULL,
    pin_fails INT NOT NULL DEFAULT 0,
    pin_locked_until TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id),
    CONSTRAINT fk_admin_sec_staff FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE,
    CONSTRAINT fk_admin_sec_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS business_admin_pin (
    staff_user_id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    pin_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id),
    CONSTRAINT fk_admin_pin_staff FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE,
    CONSTRAINT fk_admin_pin_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS business_admin_otp (
    id VARCHAR(255) PRIMARY KEY,
    staff_user_id VARCHAR(255) NOT NULL,
    business_id VARCHAR(255) NOT NULL,
    purpose VARCHAR(24) NOT NULL,
    challenge_hash CHAR(64) NOT NULL,
    code_hash CHAR(64) NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    code_expires_at TIMESTAMP(3) NULL,
    code_sent_at TIMESTAMP(3) NULL,
    used_at TIMESTAMP(3) NULL,
    attempts INT NOT NULL DEFAULT 0,
    ip VARCHAR(64) NULL,
    device_id VARCHAR(64) NULL,
    remember_me TINYINT NOT NULL DEFAULT 0,
    branch_id VARCHAR(255) NULL,
    pending_number VARCHAR(20) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (challenge_hash),
    INDEX (staff_user_id, purpose, created_at),
    INDEX (ip, created_at),
    INDEX (device_id, created_at),
    INDEX (business_id),
    CONSTRAINT fk_admin_otp_staff FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE,
    CONSTRAINT fk_admin_otp_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS business_admin_login_logs (
    id VARCHAR(255) PRIMARY KEY,
    staff_user_id VARCHAR(255) NOT NULL,
    business_id VARCHAR(255) NOT NULL,
    event VARCHAR(40) NOT NULL,
    method VARCHAR(16) NULL,
    ip VARCHAR(64) NULL,
    device_id VARCHAR(64) NULL,
    detail VARCHAR(160) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (staff_user_id, created_at),
    INDEX (created_at),
    INDEX (business_id),
    CONSTRAINT fk_admin_log_staff FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE,
    CONSTRAINT fk_admin_log_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS business_admin_devices (
    id VARCHAR(255) PRIMARY KEY,
    staff_user_id VARCHAR(255) NOT NULL,
    business_id VARCHAR(255) NOT NULL,
    device_id VARCHAR(64) NOT NULL,
    device_label VARCHAR(80) NULL,
    ip VARCHAR(64) NULL,
    user_agent VARCHAR(255) NULL,
    last_session_id VARCHAR(255) NULL,
    pin_fails INT NOT NULL DEFAULT 0,
    pin_locked_until TIMESTAMP(3) NULL,
    last_seen_at TIMESTAMP(3) NULL,
    revoked_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uniq_admin_device (staff_user_id, device_id),
    INDEX (business_id),
    INDEX (last_session_id),
    CONSTRAINT fk_admin_dev_staff FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE,
    CONSTRAINT fk_admin_dev_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
  )`,
];

export async function ensureAdminSecuritySchema() {
  schemaReady ||= (async () => {
    for (const sql of SCHEMA) {
      try {
        await query(sql);
      } catch {
        await query(withoutFk(sql));
      }
    }
    if (!pruned) {
      pruned = true;
      await query(`DELETE FROM business_admin_login_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ${LOG_KEEP_DAYS} DAY)`);
      await query(`DELETE FROM business_admin_otp WHERE created_at < DATE_SUB(NOW(), INTERVAL ${OTP_KEEP_DAYS} DAY)`);
      await query("DELETE FROM business_admin_devices WHERE revoked_at IS NOT NULL AND revoked_at < DATE_SUB(NOW(), INTERVAL 90 DAY)");
    }
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

function clientIpOf(req, clientIp) {
  if (typeof clientIp === "function") return clientIp(req);
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
}

function deviceOf(req) {
  return cleanDeviceId(req.body?.deviceId || req.body?.device_id);
}

function deviceLabelOf(req) {
  return String(req.body?.deviceLabel || req.body?.device_label || "").slice(0, 80);
}

async function logEvent({ userId, businessId, event, method = "", ip = "", deviceId = "", detail = "" }) {
  await query(
    `INSERT INTO business_admin_login_logs
      (id, staff_user_id, business_id, event, method, ip, device_id, detail)
     VALUES (?,?,?,?,?,?,?,?)`,
    [crypto.randomUUID(), userId, businessId, String(event).slice(0, 40), String(method).slice(0, 16), String(ip).slice(0, 64), String(deviceId).slice(0, 64), safeDetail(detail)],
  );
}

async function loadSecurity(userId) {
  const [row] = await query("SELECT * FROM business_admin_security WHERE staff_user_id = ? LIMIT 1", [userId]);
  return row || null;
}

async function loadPin(userId) {
  const [row] = await query("SELECT staff_user_id, pin_hash FROM business_admin_pin WHERE staff_user_id = ? LIMIT 1", [userId]);
  return row || null;
}

function verified(sec) {
  return Boolean(sec?.whatsapp_verified_at && sec?.whatsapp_number);
}

export async function prepareLoginChallenge({ user, req, branchId, remember, clientIp }) {
  if (!isBusinessAdmin(user?.role)) return null;
  await ensureAdminSecuritySchema();
  const sec = await loadSecurity(user.id);
  const pin = await loadPin(user.id);
  const methods = availableMethods({
    otpEnabled: Number(sec?.otp_login_enabled) === 1,
    whatsappVerified: verified(sec),
    pinSet: Boolean(pin?.pin_hash),
  });
  if (!methods.length) return null;
  const challengeId = crypto.randomBytes(32).toString("hex");
  const ip = clientIpOf(req, clientIp);
  const deviceId = deviceOf(req);
  await query(
    `INSERT INTO business_admin_otp
      (id, staff_user_id, business_id, purpose, challenge_hash, expires_at, ip, device_id, remember_me, branch_id)
     VALUES (?,?,?,?,?,DATE_ADD(NOW(), INTERVAL ${CHALLENGE_TTL_MIN} MINUTE),?,?,?,?)`,
    [
      crypto.randomUUID(),
      user.id,
      user.business_id,
      "login",
      sha256(challengeId),
      String(ip).slice(0, 64),
      deviceId,
      remember ? 1 : 0,
      branchId || user.branch_id || "",
    ],
  );
  await logEvent({
    userId: user.id,
    businessId: user.business_id,
    event: "login_challenge",
    ip,
    deviceId,
    detail: methods.join(","),
  });
  return publicChallenge({
    challengeId,
    methods,
    whatsappMasked: methods.includes("whatsapp") ? maskWhatsapp(sec.whatsapp_number) : "",
  });
}

async function sendCounts(staffId, ip, deviceId) {
  const [account] = await query(
    `SELECT COUNT(*) AS n FROM business_admin_otp
     WHERE staff_user_id = ? AND code_sent_at > DATE_SUB(NOW(), INTERVAL ${SEND_WINDOW_MIN} MINUTE)`,
    [staffId],
  );
  const [byIp] = await query(
    `SELECT COUNT(*) AS n FROM business_admin_otp
     WHERE ip = ? AND code_sent_at > DATE_SUB(NOW(), INTERVAL ${SEND_WINDOW_MIN} MINUTE)`,
    [ip || ""],
  );
  const [byDevice] = await query(
    `SELECT COUNT(*) AS n FROM business_admin_otp
     WHERE device_id = ? AND code_sent_at > DATE_SUB(NOW(), INTERVAL ${SEND_WINDOW_MIN} MINUTE)`,
    [deviceId || ""],
  );
  return { account: Number(account?.n || 0), ip: Number(byIp?.n || 0), device: Number(byDevice?.n || 0) };
}

async function deliverCode(number) {
  const code = otpCode();
  const message = `ATAV POS login code: ${code}. It expires in 5 minutes. Do not share this code.`;
  try {
    const settings = await loadAlertSettings();
    const result = await sendWhatsApp(waCfg(settings), [number], message);
    if (!result?.ok) return { ok: false };
    return { ok: true, code };
  } catch {
    return { ok: false };
  }
}

function whatsappLocal(raw) {
  return normalizeInMobile(raw);
}

async function loadChallenge(challengeId, purpose) {
  if (!/^[a-f0-9]{64}$/.test(String(challengeId || ""))) return null;
  const [row] = await query(
    "SELECT * FROM business_admin_otp WHERE challenge_hash = ? AND purpose = ? LIMIT 1",
    [sha256(challengeId), purpose],
  );
  return row || null;
}

function challengeOpen(row, deviceId) {
  if (!row || row.used_at) return "used";
  if (Number(row.attempts) >= MAX_OTP_FAILS) return "locked";
  if (String(row.device_id || "") !== String(deviceId || "")) return "device";
  return "";
}

async function bumpAttempts(id) {
  await query(
    `UPDATE business_admin_otp
     SET attempts = attempts + 1,
         used_at = IF(attempts + 1 >= ${MAX_OTP_FAILS}, NOW(), used_at)
     WHERE id = ? AND used_at IS NULL`,
    [id],
  );
}

export async function rememberAdminDevice({ user, req, sessionId, clientIp }) {
  if (!isBusinessAdmin(user?.role)) return;
  await ensureAdminSecuritySchema();
  const deviceId = deviceOf(req) || "browser";
  const ip = String(clientIpOf(req, clientIp) || "").slice(0, 64);
  const label = deviceLabelOf(req);
  const ua = String(req.headers["user-agent"] || "").slice(0, 250);
  await query(
    `INSERT INTO business_admin_devices
      (id, staff_user_id, business_id, device_id, device_label, ip, user_agent, last_session_id, last_seen_at)
     VALUES (?,?,?,?,?,?,?,?, NOW())
     ON DUPLICATE KEY UPDATE
       device_label = VALUES(device_label),
       ip = VALUES(ip),
       user_agent = VALUES(user_agent),
       last_session_id = VALUES(last_session_id),
       last_seen_at = NOW(),
       revoked_at = NULL`,
    [crypto.randomUUID(), user.id, user.business_id, deviceId, label, ip, ua, sessionId || null],
  );
}

export async function revokeOtherStaffSessions(userId, keepSessionId) {
  await query(
    `UPDATE staff_sessions
     SET revoked_at = NOW()
     WHERE staff_user_id = ? AND revoked_at IS NULL AND id <> ?`,
    [userId, keepSessionId || ""],
  );
}

function guardOrigin(req, res) {
  if (originAllowed(req)) return true;
  res.status(403).json({ error: FAIL_MESSAGE });
  return false;
}

function adminUser(req) {
  return req.auth?.type === "staff" ? req.auth.user : null;
}

async function lockPin(userId, deviceId) {
  await query(
    `INSERT INTO business_admin_security (staff_user_id, business_id, pin_fails, pin_locked_until)
     SELECT id, business_id, ${MAX_PIN_FAILS}, DATE_ADD(NOW(), INTERVAL ${LOCK_MIN} MINUTE)
     FROM staff_users WHERE id = ?
     ON DUPLICATE KEY UPDATE pin_fails = ${MAX_PIN_FAILS}, pin_locked_until = DATE_ADD(NOW(), INTERVAL ${LOCK_MIN} MINUTE)`,
    [userId],
  );
  if (deviceId) {
    await query(
      `UPDATE business_admin_devices
       SET pin_fails = ${MAX_PIN_FAILS}, pin_locked_until = DATE_ADD(NOW(), INTERVAL ${LOCK_MIN} MINUTE)
       WHERE staff_user_id = ? AND device_id = ?`,
      [userId, deviceId],
    );
  }
}

async function pinLocked(userId, deviceId) {
  const [sec] = await query(
    "SELECT pin_locked_until FROM business_admin_security WHERE staff_user_id = ? AND pin_locked_until > NOW() LIMIT 1",
    [userId],
  );
  if (sec) return true;
  if (!deviceId) return false;
  const [dev] = await query(
    "SELECT pin_locked_until FROM business_admin_devices WHERE staff_user_id = ? AND device_id = ? AND pin_locked_until > NOW() LIMIT 1",
    [userId, deviceId],
  );
  return Boolean(dev);
}

async function notePinFail(user, deviceId, ip) {
  await query(
    `INSERT INTO business_admin_security (staff_user_id, business_id, pin_fails)
     SELECT id, business_id, 1 FROM staff_users WHERE id = ?
     ON DUPLICATE KEY UPDATE pin_fails = pin_fails + 1`,
    [user.id],
  );
  const [sec] = await query("SELECT pin_fails FROM business_admin_security WHERE staff_user_id = ?", [user.id]);
  let deviceFails = 0;
  if (deviceId) {
    await query(
      `INSERT INTO business_admin_devices (id, staff_user_id, business_id, device_id, pin_fails, last_seen_at)
       VALUES (?,?,?,?,1,NOW())
       ON DUPLICATE KEY UPDATE pin_fails = pin_fails + 1, last_seen_at = NOW()`,
      [crypto.randomUUID(), user.id, user.business_id, deviceId],
    );
    const [dev] = await query(
      "SELECT pin_fails FROM business_admin_devices WHERE staff_user_id = ? AND device_id = ?",
      [user.id, deviceId],
    );
    deviceFails = Number(dev?.pin_fails || 0);
  }
  const locked = Number(sec?.pin_fails || 0) >= MAX_PIN_FAILS || deviceFails >= MAX_PIN_FAILS;
  if (locked) await lockPin(user.id, deviceId);
  await logEvent({
    userId: user.id,
    businessId: user.business_id,
    event: locked ? "pin_lockout" : "pin_fail",
    method: "pin",
    ip,
    deviceId,
  });
  return locked;
}

async function clearPinFails(userId, deviceId) {
  await query("UPDATE business_admin_security SET pin_fails = 0, pin_locked_until = NULL WHERE staff_user_id = ?", [userId]);
  if (deviceId) {
    await query(
      "UPDATE business_admin_devices SET pin_fails = 0, pin_locked_until = NULL WHERE staff_user_id = ? AND device_id = ?",
      [userId, deviceId],
    );
  }
}

export function registerAdminSecurity(app, deps) {
  const { finishStaffLogin, clientIp } = deps;

  app.post("/api/auth/otp/send", async (req, res) => {
    if (!guardOrigin(req, res)) return;
    try {
      await ensureAdminSecuritySchema();
      const purpose = cleanPurpose(req.body?.purpose || "login");
      const deviceId = deviceOf(req);
      const ip = clientIpOf(req, clientIp);
      if (purpose === "login") {
        const row = await loadChallenge(req.body?.challengeId, "login");
        const why = challengeOpen(row, deviceId);
        if (!row || why === "used" || why === "device") {
          res.status(400).json({ error: FAIL_MESSAGE });
          return;
        }
        if (why === "locked") {
          res.status(429).json({ error: LIMIT_MESSAGE });
          return;
        }
        const [fresh] = await query("SELECT expires_at > NOW() AS open_row, code_sent_at, TIMESTAMPDIFF(SECOND, code_sent_at, NOW()) AS age FROM business_admin_otp WHERE id = ?", [row.id]);
        if (!Number(fresh?.open_row)) {
          res.status(400).json({ error: FAIL_MESSAGE });
          return;
        }
        if (fresh.code_sent_at && Number(fresh.age) < RESEND_SEC) {
          res.status(429).json({ error: LIMIT_MESSAGE, retryAfter: RESEND_SEC - Number(fresh.age) });
          return;
        }
        const sec = await loadSecurity(row.staff_user_id);
        if (!verified(sec) || Number(sec.otp_login_enabled) !== 1) {
          res.status(400).json({ error: FAIL_MESSAGE });
          return;
        }
        const counts = await sendCounts(row.staff_user_id, ip, deviceId);
        if (!sendAllowed(counts)) {
          res.status(429).json({ error: LIMIT_MESSAGE, retryAfter: SEND_WINDOW_MIN * 60 });
          return;
        }
        const sent = await deliverCode(sec.whatsapp_number);
        if (!sent.ok) {
          res.status(503).json({ error: "Could not send the WhatsApp code. Try again." });
          return;
        }
        const codeHash = hashOtp(sent.code, req.body.challengeId);
        await query(
          `UPDATE business_admin_otp
           SET code_hash = ?, code_expires_at = DATE_ADD(NOW(), INTERVAL ${OTP_TTL_MIN} MINUTE), code_sent_at = NOW()
           WHERE id = ?`,
          [codeHash, row.id],
        );
        await logEvent({ userId: row.staff_user_id, businessId: row.business_id, event: "otp_sent", method: "whatsapp", ip, deviceId });
        res.json(otpSendResponse());
        return;
      }
      const user = adminUser(req);
      if (!user) {
        res.status(401).json({ error: "Sign in required" });
        return;
      }
      if (!isBusinessAdmin(user.role)) {
        res.status(403).json({ error: "Business admin only" });
        return;
      }
      const sec = await loadSecurity(user.id);
      let number = verified(sec) ? sec.whatsapp_number : "";
      if (purpose === "verify_number") number = whatsappLocal(req.body?.number);
      else if (!number) {
        res.status(400).json({ error: "Verify the WhatsApp number first." });
        return;
      }
      if (!number) {
        res.status(400).json({ error: "Enter a valid WhatsApp number." });
        return;
      }
      const counts = await sendCounts(user.id, ip, deviceId);
      if (!sendAllowed(counts)) {
        res.status(429).json({ error: LIMIT_MESSAGE, retryAfter: SEND_WINDOW_MIN * 60 });
        return;
      }
      const challengeId = crypto.randomBytes(32).toString("hex");
      const sent = await deliverCode(number);
      if (!sent.ok) {
        res.status(503).json({ error: "Could not send the WhatsApp code. Try again." });
        return;
      }
      await query(
        `INSERT INTO business_admin_otp
          (id, staff_user_id, business_id, purpose, challenge_hash, code_hash, expires_at, code_expires_at, code_sent_at, ip, device_id, pending_number)
         VALUES (?,?,?,?,?,?,DATE_ADD(NOW(), INTERVAL ${CHALLENGE_TTL_MIN} MINUTE),DATE_ADD(NOW(), INTERVAL ${OTP_TTL_MIN} MINUTE),NOW(),?,?,?)`,
        [
          crypto.randomUUID(),
          user.id,
          user.business_id,
          purpose,
          sha256(challengeId),
          hashOtp(sent.code, challengeId),
          String(ip).slice(0, 64),
          deviceId,
          purpose === "verify_number" ? waIntlNumber(number) : "",
        ],
      );
      await logEvent({ userId: user.id, businessId: user.business_id, event: "otp_sent", method: "whatsapp", ip, deviceId, detail: purpose });
      res.json(otpSendResponse({ challengeId }));
    } catch {
      res.status(500).json({ error: "Could not send the WhatsApp code. Try again." });
    }
  });

  app.post("/api/auth/otp/verify", async (req, res) => {
    if (!guardOrigin(req, res)) return;
    try {
      await ensureAdminSecuritySchema();
      const purpose = cleanPurpose(req.body?.purpose || "login");
      const deviceId = deviceOf(req);
      const ip = clientIpOf(req, clientIp);
      const row = await loadChallenge(req.body?.challengeId, purpose);
      if (!row || challengeOpen(row, deviceId)) {
        res.status(400).json({ error: row && Number(row.attempts) >= MAX_OTP_FAILS ? LIMIT_MESSAGE : FAIL_MESSAGE });
        return;
      }
      const code = String(req.body?.code || "");
      const matched = await withTransaction(async (conn) => {
        const [rows] = await conn.query(
          `SELECT id, code_hash, attempts, used_at,
                  code_expires_at > NOW() AS code_open
           FROM business_admin_otp WHERE id = ? FOR UPDATE`,
          [row.id],
        );
        const current = rows[0];
        if (!current || current.used_at || !Number(current.code_open) || Number(current.attempts) >= MAX_OTP_FAILS) {
          return { ok: false, locked: Number(current?.attempts) >= MAX_OTP_FAILS };
        }
        if (!otpMatches(code, req.body.challengeId, current.code_hash)) {
          const next = Number(current.attempts) + 1;
          await conn.query(
            `UPDATE business_admin_otp SET attempts = ?, used_at = IF(? >= ${MAX_OTP_FAILS}, NOW(), NULL) WHERE id = ?`,
            [next, next, current.id],
          );
          return { ok: false, locked: next >= MAX_OTP_FAILS };
        }
        await conn.query("UPDATE business_admin_otp SET used_at = NOW() WHERE id = ? AND used_at IS NULL", [current.id]);
        return { ok: true };
      });
      if (!matched.ok) {
        await logEvent({
          userId: row.staff_user_id,
          businessId: row.business_id,
          event: matched.locked ? "otp_lockout" : "otp_fail",
          method: "whatsapp",
          ip,
          deviceId,
        });
        res.status(matched.locked ? 429 : 400).json({ error: matched.locked ? LIMIT_MESSAGE : FAIL_MESSAGE });
        return;
      }
      if (purpose === "login") {
        const [user] = await query("SELECT * FROM staff_users WHERE id = ? AND status = 'active' LIMIT 1", [row.staff_user_id]);
        const [business] = await query("SELECT * FROM businesses WHERE id = ?", [row.business_id]);
        if (!user) {
          res.status(400).json({ error: FAIL_MESSAGE });
          return;
        }
        await logEvent({ userId: user.id, businessId: user.business_id, event: "otp_ok", method: "whatsapp", ip, deviceId });
        await finishStaffLogin(req, res, {
          user,
          business,
          branchId: row.branch_id || user.branch_id,
          remember: Number(row.remember_me) === 1,
        });
        return;
      }
      const user = adminUser(req);
      if (!user || user.id !== row.staff_user_id) {
        res.status(401).json({ error: "Sign in required" });
        return;
      }
      if (purpose === "verify_number") {
        const number = row.pending_number || "";
        if (!number) {
          res.status(400).json({ error: FAIL_MESSAGE });
          return;
        }
        await query(
          `INSERT INTO business_admin_security (staff_user_id, business_id, whatsapp_number, whatsapp_verified_at, otp_login_enabled)
           VALUES (?,?,?,NOW(),0)
           ON DUPLICATE KEY UPDATE whatsapp_number = VALUES(whatsapp_number), whatsapp_verified_at = NOW(), otp_login_enabled = 0`,
          [user.id, user.business_id, number],
        );
        await revokeOtherStaffSessions(user.id, req.auth.sessionId);
        await logEvent({ userId: user.id, businessId: user.business_id, event: "whatsapp_verified", method: "whatsapp", ip, deviceId });
        res.json({ ok: true, whatsappMasked: maskWhatsapp(number), whatsappVerified: true });
        return;
      }
      res.json({ ok: true, purpose });
    } catch {
      res.status(400).json({ error: FAIL_MESSAGE });
    }
  });

  app.post("/api/auth/pin/verify", async (req, res) => {
    if (!guardOrigin(req, res)) return;
    try {
      await ensureAdminSecuritySchema();
      const deviceId = deviceOf(req);
      const ip = clientIpOf(req, clientIp);
      const row = await loadChallenge(req.body?.challengeId, "login");
      if (!row || challengeOpen(row, deviceId)) {
        res.status(400).json({ error: FAIL_MESSAGE });
        return;
      }
      const [open] = await query("SELECT expires_at > NOW() AS open_row FROM business_admin_otp WHERE id = ?", [row.id]);
      if (!Number(open?.open_row)) {
        res.status(400).json({ error: FAIL_MESSAGE });
        return;
      }
      const [user] = await query("SELECT * FROM staff_users WHERE id = ? AND status = 'active' LIMIT 1", [row.staff_user_id]);
      if (!user) {
        res.status(400).json({ error: FAIL_MESSAGE });
        return;
      }
      if (await pinLocked(user.id, deviceId)) {
        res.status(429).json({ error: LIMIT_MESSAGE });
        return;
      }
      const pinRow = await loadPin(user.id);
      const pin = String(req.body?.pin || "");
      const ok = pinFormatOk(pin) && pinRow?.pin_hash ? await verifyPin(pin, pinRow.pin_hash) : false;
      if (!ok) {
        await bumpAttempts(row.id);
        const locked = await notePinFail(user, deviceId, ip);
        res.status(locked ? 429 : 400).json({ error: locked ? LIMIT_MESSAGE : FAIL_MESSAGE });
        return;
      }
      const spent = await query("UPDATE business_admin_otp SET used_at = NOW() WHERE id = ? AND used_at IS NULL", [row.id]);
      if (!spent?.affectedRows) {
        res.status(400).json({ error: FAIL_MESSAGE });
        return;
      }
      await clearPinFails(user.id, deviceId);
      await logEvent({ userId: user.id, businessId: user.business_id, event: "pin_ok", method: "pin", ip, deviceId });
      const [business] = await query("SELECT * FROM businesses WHERE id = ?", [user.business_id]);
      await finishStaffLogin(req, res, {
        user,
        business,
        branchId: row.branch_id || user.branch_id,
        remember: Number(row.remember_me) === 1,
      });
    } catch {
      res.status(400).json({ error: FAIL_MESSAGE });
    }
  });

  async function savePin(req, res, purpose) {
    if (!guardOrigin(req, res)) return;
    const user = adminUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    if (!isBusinessAdmin(user.role)) {
      res.status(403).json({ error: "Business admin only" });
      return;
    }
    const pin = String(req.body?.pin || "");
    const confirm = String(req.body?.confirm || "");
    if (!pinFormatOk(pin) || pin !== confirm) {
      res.status(400).json({ error: "Enter the same 6-digit PIN twice." });
      return;
    }
    try {
      await ensureAdminSecuritySchema();
      const deviceId = deviceOf(req);
      const ip = clientIpOf(req, clientIp);
      const row = await loadChallenge(req.body?.challengeId, purpose);
      if (!row || row.staff_user_id !== user.id || challengeOpen(row, deviceId)) {
        res.status(400).json({ error: FAIL_MESSAGE });
        return;
      }
      const sec = await loadSecurity(user.id);
      if (!verified(sec)) {
        res.status(400).json({ error: "Verify the WhatsApp number first." });
        return;
      }
      const code = String(req.body?.code || "");
      const matched = await withTransaction(async (conn) => {
        const [rows] = await conn.query(
          `SELECT id, code_hash, attempts, used_at, code_expires_at > NOW() AS code_open
           FROM business_admin_otp WHERE id = ? FOR UPDATE`,
          [row.id],
        );
        const current = rows[0];
        if (!current || current.used_at || !Number(current.code_open)) return false;
        if (!otpMatches(code, req.body.challengeId, current.code_hash)) {
          await conn.query("UPDATE business_admin_otp SET attempts = attempts + 1 WHERE id = ?", [current.id]);
          return false;
        }
        const [upd] = await conn.query("UPDATE business_admin_otp SET used_at = NOW() WHERE id = ? AND used_at IS NULL", [current.id]);
        return Boolean(upd.affectedRows);
      });
      if (!matched) {
        res.status(400).json({ error: FAIL_MESSAGE });
        return;
      }
      const encoded = await hashPin(pin);
      await query(
        `INSERT INTO business_admin_pin (staff_user_id, business_id, pin_hash)
         VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE pin_hash = VALUES(pin_hash), updated_at = CURRENT_TIMESTAMP(3)`,
        [user.id, user.business_id, encoded],
      );
      await clearPinFails(user.id, deviceId);
      await revokeOtherStaffSessions(user.id, req.auth.sessionId);
      await logEvent({
        userId: user.id,
        businessId: user.business_id,
        event: purpose === "pin_reset" ? "pin_reset" : "pin_setup",
        method: "pin",
        ip,
        deviceId,
      });
      res.json({ ok: true, pinSet: true });
    } catch {
      res.status(400).json({ error: FAIL_MESSAGE });
    }
  }

  app.post("/api/auth/pin/setup", (req, res) => savePin(req, res, "pin_setup"));
  app.post("/api/auth/pin/reset", (req, res) => savePin(req, res, "pin_reset"));

  app.get("/api/auth/security/settings", async (req, res) => {
    const user = adminUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    if (!isBusinessAdmin(user.role)) {
      res.json({ ok: true, applicable: false });
      return;
    }
    try {
      await ensureAdminSecuritySchema();
      res.set("Cache-Control", "no-store");
      res.json(await settingsPayload(user));
    } catch {
      res.status(500).json({ error: "Could not load security settings." });
    }
  });

  app.post("/api/auth/security/settings", async (req, res) => {
    if (!guardOrigin(req, res)) return;
    const user = adminUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    if (!isBusinessAdmin(user.role)) {
      res.status(403).json({ error: "Business admin only" });
      return;
    }
    try {
      await ensureAdminSecuritySchema();
      const enable = Boolean(req.body?.otpLoginEnabled);
      const sec = await loadSecurity(user.id);
      if (enable && !verified(sec)) {
        res.status(400).json({ error: "Verify the WhatsApp number first." });
        return;
      }
      await query(
        `INSERT INTO business_admin_security (staff_user_id, business_id, otp_login_enabled)
         VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE otp_login_enabled = VALUES(otp_login_enabled)`,
        [user.id, user.business_id, enable ? 1 : 0],
      );
      if (enable) await revokeOtherStaffSessions(user.id, req.auth.sessionId);
      await logEvent({
        userId: user.id,
        businessId: user.business_id,
        event: enable ? "otp_login_on" : "otp_login_off",
        method: "whatsapp",
        ip: clientIpOf(req, clientIp),
        deviceId: deviceOf(req),
      });
      res.json(await settingsPayload(user));
    } catch {
      res.status(400).json({ error: FAIL_MESSAGE });
    }
  });

  app.get("/api/auth/login/history", async (req, res) => {
    const user = adminUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    if (!isBusinessAdmin(user.role)) {
      res.status(403).json({ error: "Business admin only" });
      return;
    }
    try {
      await ensureAdminSecuritySchema();
      res.set("Cache-Control", "no-store");
      res.json({ ok: true, history: await historyFor(user.id) });
    } catch {
      res.status(500).json({ error: "Could not load login history." });
    }
  });

  app.post("/api/auth/session/revoke", async (req, res) => {
    if (!guardOrigin(req, res)) return;
    const user = adminUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    if (!isBusinessAdmin(user.role)) {
      res.status(403).json({ error: "Business admin only" });
      return;
    }
    try {
      await ensureAdminSecuritySchema();
      const deviceId = cleanDeviceId(req.body?.deviceId);
      const sessionId = String(req.body?.sessionId || "");
      let target = sessionId;
      if (deviceId) {
        const [dev] = await query(
          "SELECT last_session_id FROM business_admin_devices WHERE staff_user_id = ? AND device_id = ? LIMIT 1",
          [user.id, deviceId],
        );
        target = dev?.last_session_id || "";
        await query(
          "UPDATE business_admin_devices SET revoked_at = NOW() WHERE staff_user_id = ? AND device_id = ?",
          [user.id, deviceId],
        );
      }
      if (target) {
        await query(
          "UPDATE staff_sessions SET revoked_at = NOW() WHERE id = ? AND staff_user_id = ? AND revoked_at IS NULL",
          [target, user.id],
        );
      }
      await logEvent({
        userId: user.id,
        businessId: user.business_id,
        event: "session_revoke",
        ip: clientIpOf(req, clientIp),
        deviceId,
      });
      const signedOut = Boolean(target) && target === req.auth.sessionId;
      res.json({ ok: true, signedOut });
    } catch {
      res.status(400).json({ error: FAIL_MESSAGE });
    }
  });
}

async function historyFor(userId) {
  const rows = await query(
    `SELECT event, method, ip, device_id, created_at
     FROM business_admin_login_logs
     WHERE staff_user_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId],
  );
  return rows.map((row) => ({
    event: row.event,
    method: row.method || "",
    ip: row.ip || "",
    deviceId: row.device_id || "",
    at: row.created_at,
  }));
}

async function devicesFor(userId) {
  const rows = await query(
    `SELECT d.device_id, d.device_label, d.ip, d.last_seen_at, d.revoked_at, d.last_session_id,
            s.expires_at, s.revoked_at AS session_revoked
     FROM business_admin_devices d
     LEFT JOIN staff_sessions s ON s.id = d.last_session_id
     WHERE d.staff_user_id = ?
     ORDER BY d.last_seen_at DESC
     LIMIT 30`,
    [userId],
  );
  return rows.map((row) => ({
    deviceId: row.device_id,
    label: row.device_label || "Browser",
    ip: row.ip || "",
    lastSeen: row.last_seen_at,
    sessionId: row.last_session_id || "",
    active: !row.revoked_at && row.last_session_id && !row.session_revoked && row.expires_at && new Date(row.expires_at) > new Date(),
  }));
}

async function settingsPayload(user) {
  const sec = await loadSecurity(user.id);
  const pin = await loadPin(user.id);
  return {
    ok: true,
    applicable: true,
    otpLoginEnabled: Number(sec?.otp_login_enabled) === 1,
    whatsappMasked: maskWhatsapp(sec?.whatsapp_number),
    whatsappVerified: verified(sec),
    pinSet: Boolean(pin?.pin_hash),
    note: "WhatsApp OTP and the 6-digit PIN are alternative checks after your password. They are not combined into multi-factor authentication.",
    history: await historyFor(user.id),
    devices: await devicesFor(user.id),
  };
}
