import { query, withTransaction } from "./db.js";
import { bid } from "./context.js";
import { requireStaff, requirePerm } from "./auth.js";
import { audit } from "./audit.js";
import {
  BACKUP_KIND,
  BACKUP_SKIP_TABLES,
  assertShopBackup,
  backupFilename,
  sortBackupTables,
} from "./backup-util.js";

export async function listBizTables() {
  const rows = await query(
    `SELECT DISTINCT TABLE_NAME AS t FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'business_id'
     ORDER BY TABLE_NAME`,
  );
  return rows.map((r) => r.t).filter((t) => t && !BACKUP_SKIP_TABLES.has(t));
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

export async function restoreBackup(payload, businessId, req) {
  assertShopBackup(payload, businessId);
  const known = new Set(await listBizTables());
  const names = Object.keys(payload.tables).filter((t) => known.has(t));
  if (!names.length) throw new Error("Backup has no matching tables");
  const deleteOrder = sortBackupTables(names, false);
  const insertOrder = sortBackupTables(names, true);
  const colCache = new Map();
  await withTransaction(async (conn) => {
    for (const t of deleteOrder) {
      await conn.query(`DELETE FROM \`${t}\` WHERE business_id = ?`, [businessId]);
    }
    for (const t of insertOrder) {
      if (!colCache.has(t)) {
        const [cols] = await conn.query(`SHOW COLUMNS FROM \`${t}\``);
        colCache.set(t, new Set(cols.map((c) => c.Field)));
      }
      const allowed = colCache.get(t);
      for (const row of payload.tables[t] || []) {
        if (!row || typeof row !== "object") continue;
        const rec = { ...row, business_id: businessId };
        const cols = Object.keys(rec).filter((k) => allowed.has(k));
        if (!cols.length) continue;
        const ph = cols.map(() => "?").join(",");
        const sql = `INSERT INTO \`${t}\` (${cols.map((c) => `\`${c}\``).join(",")}) VALUES (${ph})`;
        await conn.query(
          sql,
          cols.map((c) => rec[c]),
        );
      }
    }
  });
  await audit("Shop backup restored", { module: "settings", tables: names.length }, req);
  return { ok: true, tables: names.length };
}

export function registerBackup(app) {
  app.get("/api/backup", requireStaff, requirePerm("settings"), (req, res) => {
    Promise.resolve()
      .then(() => buildBackup(bid()))
      .then((payload) => {
        const filename = backupFilename(payload.business);
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(JSON.stringify(payload));
      })
      .catch((err) => res.status(400).json({ error: String(err.message) }));
  });

  app.post("/api/backup/restore", requireStaff, requirePerm("settings"), (req, res) => {
    Promise.resolve()
      .then(() => restoreBackup(req.body || {}, bid(), req))
      .then((out) => res.json(out))
      .catch((err) => res.status(400).json({ error: String(err.message) }));
  });
}
