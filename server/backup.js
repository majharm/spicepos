import { query, withTransaction } from "./db.js";
import { bid } from "./context.js";
import { requireStaff, requirePerm } from "./auth.js";
import { audit, platformAudit } from "./audit.js";
import { verifyPassword } from "./password.js";
import { sendMail } from "./mail.js";
import { getPlatformSettings, setPlatformSetting } from "./settings.js";
import {
  BACKUP_KIND,
  BACKUP_SKIP_TABLES,
  PLATFORM_BACKUP_KIND,
  PLATFORM_SKIP_TABLES,
  BACKUP_EMAIL_HOURS,
  assertPlatformBackup,
  assertShopBackup,
  backupFilename,
  backupEmailFilename,
  backupEmailParts,
  formatBackupBytes,
  isSafeTableName,
  normalizeBackupRow,
  platformBackupFilename,
  prepareBackupEmailAttachment,
  SHOP_CLEAN_KEEP_TABLES,
  sortBackupTables,
} from "./backup-util.js";

function sendBackupFile(res, filename, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(JSON.stringify(payload));
}

async function withFkOff(conn, fn) {
  await conn.query("SET FOREIGN_KEY_CHECKS=0");
  try {
    return await fn();
  } finally {
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  }
}

async function tableColumns(conn, table) {
  const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
  return new Set(cols.map((c) => c.Field));
}

async function insertBackupRows(conn, table, rows, patch) {
  const allowed = await tableColumns(conn, table);
  for (const row of rows || []) {
    if (!row || typeof row !== "object") continue;
    const rec = normalizeBackupRow(patch ? patch({ ...row }) : { ...row });
    const cols = Object.keys(rec).filter((k) => allowed.has(k));
    if (!cols.length) continue;
    const ph = cols.map(() => "?").join(",");
    const sql = `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(",")}) VALUES (${ph})`;
    await conn.query(
      sql,
      cols.map((c) => rec[c]),
    );
  }
}

export async function listBizTables() {
  const rows = await query(
    `SELECT DISTINCT TABLE_NAME AS t FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'business_id'
     ORDER BY TABLE_NAME`,
  );
  return rows.map((r) => r.t).filter((t) => t && isSafeTableName(t) && !BACKUP_SKIP_TABLES.has(t));
}

export async function listPlatformTables() {
  const rows = await query(
    `SELECT TABLE_NAME AS t FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`,
  );
  return rows.map((r) => r.t).filter((t) => t && isSafeTableName(t) && !PLATFORM_SKIP_TABLES.has(t));
}

export async function buildBackup(businessId) {
  const [business] = await query("SELECT id, name, gstin, status FROM businesses WHERE id = ? LIMIT 1", [
    businessId,
  ]);
  const tables = {};
  for (const t of await listBizTables()) {
    try {
      tables[t] = (await query(`SELECT * FROM \`${t}\` WHERE business_id = ?`, [businessId])).map(normalizeBackupRow);
    } catch {
      tables[t] = [];
    }
  }
  return {
    kind: BACKUP_KIND,
    version: 1,
    created_at: new Date().toISOString(),
    business_id: businessId,
    business: business || { id: businessId, name: "shop" },
    tables,
  };
}

export async function restoreBackup(payload, businessId, req, opts = {}) {
  assertShopBackup(payload, businessId);
  const known = new Set(await listBizTables());
  const names = Object.keys(payload.tables).filter((t) => known.has(t));
  if (!names.length) throw new Error("Backup has no matching tables");
  const deleteOrder = sortBackupTables(names, false);
  const insertOrder = sortBackupTables(names, true);
  await withTransaction(async (conn) => {
    await withFkOff(conn, async () => {
      for (const t of deleteOrder) {
        await conn.query(`DELETE FROM \`${t}\` WHERE business_id = ?`, [businessId]);
      }
      for (const t of insertOrder) {
        await insertBackupRows(conn, t, payload.tables[t], (row) => ({ ...row, business_id: businessId }));
      }
    });
  });
  const details = { module: "backup", tables: names.length, target_id: businessId, target_name: payload.business?.name };
  try {
    if (opts.masterAdmin) {
      await platformAudit(opts.masterAdmin, "Shop backup restored", details, req);
    } else {
      await audit("Shop backup restored", { module: "settings", tables: names.length }, req);
    }
  } catch {
    /* audit is best-effort */
  }
  return { ok: true, tables: names.length };
}

export async function buildPlatformBackup() {
  const tables = {};
  for (const t of await listPlatformTables()) {
    try {
      tables[t] = (await query(`SELECT * FROM \`${t}\``)).map(normalizeBackupRow);
    } catch {
      tables[t] = [];
    }
  }
  return {
    kind: PLATFORM_BACKUP_KIND,
    version: 1,
    created_at: new Date().toISOString(),
    tables,
  };
}

export async function restorePlatformBackup(payload, req, admin) {
  assertPlatformBackup(payload);
  const known = new Set(await listPlatformTables());
  const names = Object.keys(payload.tables).filter((t) => known.has(t));
  if (!names.length) throw new Error("Backup has no matching tables");
  const deleteOrder = sortBackupTables(names, false);
  const insertOrder = sortBackupTables(names, true);
  await withTransaction(async (conn) => {
    await withFkOff(conn, async () => {
      for (const t of deleteOrder) {
        await conn.query(`DELETE FROM \`${t}\``);
      }
      for (const t of insertOrder) {
        await insertBackupRows(conn, t, payload.tables[t]);
      }
    });
  });
  try {
    await platformAudit(admin, "Platform backup restored", { module: "backup", tables: names.length }, req);
  } catch {
    /* audit is best-effort */
  }
  return { ok: true, tables: names.length };
}

export async function cleanShopData(businessId) {
  const known = await listBizTables();
  const names = known.filter((t) => !SHOP_CLEAN_KEEP_TABLES.has(t));
  const deleteOrder = sortBackupTables(names, false);
  await withTransaction(async (conn) => {
    await withFkOff(conn, async () => {
      try {
        await conn.query("DELETE FROM staff_sessions WHERE business_id = ?", [businessId]);
      } catch {
        /* optional table */
      }
      try {
        await conn.query(
          `DELETE s FROM staff_sessions s
           INNER JOIN staff_users u ON u.id = s.staff_user_id
           WHERE u.business_id = ?`,
          [businessId],
        );
      } catch {
        /* optional table */
      }
      for (const t of deleteOrder) {
        await conn.query(`DELETE FROM \`${t}\` WHERE business_id = ?`, [businessId]);
      }
    });
  });
  return { ok: true, tables: names.length, kept: [...SHOP_CLEAN_KEEP_TABLES].sort() };
}

async function requireShop(businessId) {
  const id = String(businessId || "").trim();
  if (!id) throw new Error("Select a shop");
  const [biz] = await query("SELECT id, name FROM businesses WHERE id = ? LIMIT 1", [id]);
  if (!biz) throw new Error("Shop not found");
  return biz;
}

function flagOn(value, fallback = true) {
  if (value == null || value === "") return fallback;
  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
}

function validBackupEmail(value) {
  const to = String(value || "").trim();
  return to && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) ? to : "";
}

async function readBackupEmailMap() {
  let rows = [];
  try {
    rows = await query(
      `SELECT setting_key, setting_value FROM platform_settings
       WHERE setting_key IN ('alert_backup_email','backup_email_to','backup_email_last_slot','backup_email_last_error','smtp_user')`,
    );
  } catch {
    rows = [];
  }
  return Object.fromEntries((rows || []).map((r) => [r.setting_key, r.setting_value ?? ""]));
}

export async function backupEmailRecipient(map = null) {
  const settings = map || (await readBackupEmailMap());
  const support = await getPlatformSettings().catch(() => ({ support_email: "" }));
  return (
    validBackupEmail(settings.backup_email_to) ||
    validBackupEmail(support.support_email) ||
    validBackupEmail(settings.smtp_user) ||
    "pos@atavtelecom.in"
  );
}

export async function backupEmailStatus() {
  const map = await readBackupEmailMap();
  const parts = backupEmailParts();
  return {
    enabled: flagOn(map.alert_backup_email, true) ? "1" : "0",
    to: map.backup_email_to || "",
    fallback_to: await backupEmailRecipient(map),
    last_slot: map.backup_email_last_slot || "",
    last_error: map.backup_email_last_error || "",
    hours: BACKUP_EMAIL_HOURS,
    next_slot: parts.slot,
    timezone: "Asia/Kolkata",
  };
}

export async function saveBackupEmailSettings(body = {}) {
  if (Object.prototype.hasOwnProperty.call(body, "enabled") || Object.prototype.hasOwnProperty.call(body, "alert_backup_email")) {
    const raw = body.enabled ?? body.alert_backup_email;
    await setPlatformSetting("alert_backup_email", flagOn(raw, true) ? "1" : "0");
  }
  if (Object.prototype.hasOwnProperty.call(body, "to") || Object.prototype.hasOwnProperty.call(body, "backup_email_to")) {
    const to = String(body.to ?? body.backup_email_to ?? "").trim();
    if (to && !validBackupEmail(to)) throw new Error("Enter a valid backup email address");
    await setPlatformSetting("backup_email_to", to);
  }
  return backupEmailStatus();
}

async function logBackupEmail(to, subject, text, result) {
  try {
    await query(
      `INSERT INTO alert_delivery_logs
       (id, channel, kind, business_id, shop_name, recipient, subject, preview, status, ok, error, detail)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        "email",
        "backup",
        "",
        "Platform",
        String(to || ""),
        String(subject || "").slice(0, 255),
        String(text || "").slice(0, 400),
        result?.ok ? "sent" : result?.skipped ? "skipped" : "failed",
        result?.ok ? 1 : 0,
        String(result?.error || "").slice(0, 255) || null,
        String(result?.detail || result?.error || "").slice(0, 255) || null,
      ],
    );
  } catch (err) {
    console.error("backup email log failed:", err.message);
  }
}

function backupEmailMessage(att, parts, force) {
  const when = `${parts.day} ${parts.hh}:00 IST`;
  const subject = `ATAV POS platform backup · ${when}`;
  const size = att?.tooLarge ? formatBackupBytes(att.bytes) : formatBackupBytes(att?.bytes || 0);
  const lines = [
    "ATAV POS platform backup",
    "",
    `Time: ${when}`,
    force ? "Sent manually from Master Admin." : "Automatic backup (five times a day).",
    att?.tooLarge
      ? `The gzipped backup was ${size}, which is too large to attach. Download it from Master Admin → Backup.`
      : `Attachment: ${att?.filename || backupEmailFilename()} (${size}). Restore from Master Admin → Backup.`,
    att?.stripped ? "Item photos were omitted so the file would fit in email." : null,
    "",
    "Keep this file private. It can restore every shop on the platform.",
    "",
    "— ATAV Telecom POS",
  ].filter((line) => line !== null);
  const text = lines.join("\n");
  const html = `<p><strong>ATAV POS platform backup</strong></p>
<p>Time: ${when}<br>${force ? "Sent manually from Master Admin." : "Automatic backup (five times a day)."}</p>
<p>${
    att?.tooLarge
      ? `The gzipped backup was ${size}, which is too large to attach. Download it from Master Admin → Backup.`
      : `Attachment: <code>${att?.filename || backupEmailFilename()}</code> (${size}). Restore from Master Admin → Backup.`
  }${att?.stripped ? "<br>Item photos were omitted so the file would fit in email." : ""}</p>
<p>Keep this file private. It can restore every shop on the platform.</p>
<p>— ATAV Telecom POS</p>`;
  return { subject, text, html };
}

let backupEmailBusy = false;

async function runBackupEmail({ force = false } = {}) {
  const parts = backupEmailParts();
  const slot = parts.slot;
  if (!force && !slot) return { skipped: true, reason: "off-slot" };
  if (backupEmailBusy) return { skipped: true, reason: "busy" };
  backupEmailBusy = true;
  try {
    const map = await readBackupEmailMap();
    if (!force && !flagOn(map.alert_backup_email, true)) return { skipped: true, reason: "disabled" };
    if (!force && slot && map.backup_email_last_slot === slot) return { skipped: true, reason: "already" };
    const to = await backupEmailRecipient(map);
    if (!to) return { ok: false, error: "No backup email recipient" };
    if (!force && slot) await setPlatformSetting("backup_email_last_slot", slot);
    else if (force && slot) await setPlatformSetting("backup_email_last_slot", slot);

    const payload = await buildPlatformBackup();
    const att = prepareBackupEmailAttachment(payload);
    const msg = backupEmailMessage(att, parts, force);
    const mail = await sendMail({
      to,
      ...msg,
      attachments: att.tooLarge
        ? []
        : [{ filename: att.filename, content: att.content, mimeType: att.mimeType }],
      timeoutMs: 60000,
    });
    if (mail.ok) {
      await setPlatformSetting("backup_email_last_error", "");
    } else {
      await setPlatformSetting("backup_email_last_error", String(mail.error || "send failed").slice(0, 255));
    }
    await logBackupEmail(to, msg.subject, msg.text, { ...mail, detail: att.tooLarge ? "no-attachment" : att.filename });
    return { ...mail, to, slot: slot || `${parts.day}T${parts.hh}`, bytes: att.bytes, attached: !att.tooLarge && mail.ok };
  } catch (err) {
    const error = String(err.message || err);
    try {
      await setPlatformSetting("backup_email_last_error", error.slice(0, 255));
    } catch {
      /* ignore */
    }
    return { ok: false, error };
  } finally {
    backupEmailBusy = false;
  }
}

export function tickBackupEmail() {
  return runBackupEmail({ force: false });
}

export function sendBackupEmailNow() {
  return runBackupEmail({ force: true });
}

export function registerMasterBackup(app) {
  app.get("/api/master/backup", (req, res) => {
    Promise.resolve()
      .then(async () => {
        const biz = await requireShop(req.query.business_id);
        return buildBackup(biz.id);
      })
      .then((payload) => sendBackupFile(res, backupFilename(payload.business), payload))
      .catch((err) => res.status(400).json({ error: String(err.message) }));
  });

  app.post("/api/master/backup/restore", (req, res) => {
    Promise.resolve()
      .then(async () => {
        const payload = req.body || {};
        const biz = await requireShop(req.query.business_id || payload.business_id);
        return restoreBackup(payload, biz.id, req, { masterAdmin: req.auth?.admin });
      })
      .then((out) => res.json(out))
      .catch((err) => res.status(400).json({ error: String(err.message) }));
  });

  app.get("/api/master/backup/platform", (_req, res) => {
    Promise.resolve()
      .then(() => buildPlatformBackup())
      .then((payload) => sendBackupFile(res, platformBackupFilename(), payload))
      .catch((err) => res.status(400).json({ error: String(err.message) }));
  });

  app.post("/api/master/backup/platform/restore", (req, res) => {
    Promise.resolve()
      .then(() => restorePlatformBackup(req.body || {}, req, req.auth?.admin))
      .then((out) => res.json(out))
      .catch((err) => res.status(400).json({ error: String(err.message) }));
  });

  app.get("/api/master/backup/email", (_req, res) => {
    Promise.resolve()
      .then(() => backupEmailStatus())
      .then((out) => res.json(out))
      .catch((err) => res.status(400).json({ error: String(err.message) }));
  });

  app.post("/api/master/backup/email", (_req, res) => {
    Promise.resolve()
      .then(() => sendBackupEmailNow())
      .then((out) => {
        if (!out.ok && !out.skipped) res.status(400).json(out);
        else res.json(out);
      })
      .catch((err) => res.status(400).json({ error: String(err.message) }));
  });

  app.post("/api/master/backup/email/settings", (req, res) => {
    Promise.resolve()
      .then(() => saveBackupEmailSettings(req.body || {}))
      .then((out) => res.json(out))
      .catch((err) => res.status(400).json({ error: String(err.message) }));
  });
}

export function registerBackup(app) {
  app.get("/api/backup", requireStaff, requirePerm("settings"), (req, res) => {
    Promise.resolve()
      .then(() => buildBackup(bid()))
      .then((payload) => sendBackupFile(res, backupFilename(payload.business), payload))
      .catch((err) => res.status(400).json({ error: String(err.message) }));
  });

  app.post("/api/backup/restore", requireStaff, requirePerm("settings"), (req, res) => {
    Promise.resolve()
      .then(() => restoreBackup(req.body || {}, bid(), req))
      .then((out) => res.json(out))
      .catch((err) => res.status(400).json({ error: String(err.message) }));
  });

  app.post("/api/backup/clean", requireStaff, requirePerm("settings"), async (req, res) => {
    try {
      const password = String(req.body?.password || "");
      if (!password) {
        res.status(400).json({ error: "Your login password is required" });
        return;
      }
      const [user] = await query("SELECT * FROM staff_users WHERE id = ? LIMIT 1", [req.auth.user.id]);
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        res.status(401).json({ error: "Login password is incorrect" });
        return;
      }
      const result = await cleanShopData(bid());
      try {
        await audit("Shop data cleaned", { module: "settings", tables: result.tables }, req);
      } catch {
        /* audit is best-effort */
      }
      res.json({
        ok: true,
        tables: result.tables,
        note: "Sales, stock, items, and customers were removed. Login, branches, devices, and shop settings were kept.",
      });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });
}
