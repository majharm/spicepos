import { query, withTransaction } from "./db.js";
import { bid } from "./context.js";
import { requireStaff, requirePerm } from "./auth.js";
import { audit, platformAudit } from "./audit.js";
import {
  BACKUP_KIND,
  BACKUP_SKIP_TABLES,
  PLATFORM_BACKUP_KIND,
  PLATFORM_SKIP_TABLES,
  assertPlatformBackup,
  assertShopBackup,
  backupFilename,
  isSafeTableName,
  platformBackupFilename,
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
    const rec = patch ? patch({ ...row }) : { ...row };
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
      tables[t] = await query(`SELECT * FROM \`${t}\` WHERE business_id = ?`, [businessId]);
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
      tables[t] = await query(`SELECT * FROM \`${t}\``);
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

async function requireShop(businessId) {
  const id = String(businessId || "").trim();
  if (!id) throw new Error("Select a shop");
  const [biz] = await query("SELECT id, name FROM businesses WHERE id = ? LIMIT 1", [id]);
  if (!biz) throw new Error("Shop not found");
  return biz;
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
}
