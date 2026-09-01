import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  BACKUP_KIND,
  BACKUP_SKIP_TABLES,
  PLATFORM_BACKUP_KIND,
  PLATFORM_SKIP_TABLES,
  assertPlatformBackup,
  assertShopBackup,
  backupFilename,
  backupTableRank,
  isSafeTableName,
  normalizeBackupRow,
  platformBackupFilename,
  sortBackupTables,
  toSqlValue,
} from "./backup-util.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("backup restore order deletes child rows first", () => {
  const names = ["items", "sales_order_lines", "sales_orders", "staff_users", "pack_items"];
  assert.equal(backupTableRank("sales_order_lines"), 0);
  assert.equal(backupTableRank("staff_users"), 2);
  const del = sortBackupTables(names, false);
  assert.ok(del.indexOf("sales_order_lines") < del.indexOf("sales_orders"));
  assert.ok(del.indexOf("pack_items") < del.indexOf("items"));
  assert.equal(del[del.length - 1], "staff_users");
  const ins = sortBackupTables(names, true);
  assert.equal(ins[0], "staff_users");
  assert.ok(ins.indexOf("sales_orders") < ins.indexOf("sales_order_lines"));
});

test("platform restore deletes shops before plans", () => {
  const names = ["items", "staff_users", "branches", "businesses", "subscription_plans", "platform_admins"];
  const del = sortBackupTables(names, false);
  assert.ok(del.indexOf("items") < del.indexOf("staff_users"));
  assert.ok(del.indexOf("staff_users") < del.indexOf("branches"));
  assert.ok(del.indexOf("branches") < del.indexOf("businesses"));
  assert.ok(del.indexOf("businesses") < del.indexOf("subscription_plans"));
  const ins = sortBackupTables(names, true);
  assert.equal(ins[0], "platform_admins");
  assert.ok(ins.indexOf("subscription_plans") < ins.indexOf("businesses"));
  assert.ok(ins.indexOf("businesses") < ins.indexOf("branches"));
});

test("shop backup files are rejected when kind or shop id mismatch", () => {
  assert.throws(() => assertShopBackup({}, "b1"), /Not a SpicePOS/);
  assert.throws(
    () => assertShopBackup({ kind: BACKUP_KIND, business_id: "other", tables: { items: [] } }, "b1"),
    /another shop/,
  );
  assert.doesNotThrow(() =>
    assertShopBackup({ kind: BACKUP_KIND, business_id: "b1", tables: { items: [] } }, "b1"),
  );
  assert.ok(BACKUP_SKIP_TABLES.has("staff_sessions"));
  assert.ok(BACKUP_SKIP_TABLES.has("platform_admins"));
  assert.match(backupFilename({ name: "Swami Masale" }), /^spicepos-backup-swami-masale-/);
});

test("platform backup files are rejected when kind is wrong", () => {
  assert.throws(() => assertPlatformBackup({ kind: BACKUP_KIND, tables: {} }), /platform backup/);
  assert.doesNotThrow(() => assertPlatformBackup({ kind: PLATFORM_BACKUP_KIND, tables: { businesses: [] } }));
  assert.ok(PLATFORM_SKIP_TABLES.has("staff_sessions"));
  assert.ok(PLATFORM_SKIP_TABLES.has("platform_sessions"));
  assert.equal(PLATFORM_SKIP_TABLES.has("platform_admins"), false);
  assert.match(platformBackupFilename(), /^spicepos-platform-backup-/);
  assert.equal(isSafeTableName("sales_orders"), true);
  assert.equal(isSafeTableName("sales orders"), false);
});

test("ISO timestamps are stored as MySQL datetimes", () => {
  assert.equal(toSqlValue("2026-08-30T12:20:31.196Z"), "2026-08-30 12:20:31.196");
  assert.equal(toSqlValue(true), 1);
  assert.equal(toSqlValue(false), 0);
  assert.equal(normalizeBackupRow({ created_at: "2026-08-30T12:20:31.000Z", ok: true }).created_at, "2026-08-30 12:20:31.000");
});

test("PHP and HTML wire shop backup", () => {
  const core = readFileSync(path.join(root, "pos-php-core.php"), "utf8");
  const backup = readFileSync(path.join(root, "pos-backup.php"), "utf8");
  const till = readFileSync(path.join(root, "pos-php-till.php"), "utf8");
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(core, /pos_dispatch_backup/);
  assert.match(core, /function pos_require_backup/);
  assert.match(backup, /function pos_backup_sql_value/);
  assert.match(backup, /function pos_dispatch_backup/);
  assert.match(backup, /spicepos-shop-backup/);
  assert.match(till, /pos_dispatch_backup/);
  assert.match(index, /btn-backup-download/);
  assert.match(index, /btn-backup-restore/);
  assert.match(index, /id="view-backup"/);
  assert.match(index, /data-view="backup"/);
});

test("PHP and HTML wire master admin backup", () => {
  const core = readFileSync(path.join(root, "pos-php-core.php"), "utf8");
  const backup = readFileSync(path.join(root, "pos-backup.php"), "utf8");
  const masterHtml = readFileSync(path.join(root, "master.html"), "utf8");
  const masterJs = readFileSync(path.join(root, "js/master.js"), "utf8");
  const masterApi = readFileSync(path.join(root, "server/master.js"), "utf8");
  const backupJs = readFileSync(path.join(root, "server/backup.js"), "utf8");
  assert.match(core, /pos_dispatch_master_backup/);
  assert.match(core, /master\/backup\/platform/);
  assert.match(backup, /function pos_dispatch_master_backup/);
  assert.match(backup, /spicepos-platform-backup/);
  assert.match(backup, /function pos_backup_build_platform/);
  assert.match(masterHtml, /data-tab="backup"/);
  assert.match(masterJs, /\/api\/master\/backup/);
  assert.match(masterJs, /\/api\/master\/backup\/platform\/restore/);
  assert.match(masterJs, /RESTORE PLATFORM/);
  assert.match(masterApi, /registerMasterBackup/);
  assert.match(backupJs, /registerMasterBackup/);
  assert.match(backupJs, /\/api\/master\/backup\/platform/);
  assert.match(readFileSync(path.join(root, "api/master/backup/index.php"), "utf8"), /master\/backup/);
  assert.match(readFileSync(path.join(root, "api/master/backup/restore/index.php"), "utf8"), /master\/backup\/restore/);
  assert.match(
    readFileSync(path.join(root, "api/master/backup/platform/index.php"), "utf8"),
    /master\/backup\/platform/,
  );
  assert.match(
    readFileSync(path.join(root, "api/master/backup/platform/restore/index.php"), "utf8"),
    /master\/backup\/platform\/restore/,
  );
});

test("HTML and CSS cache stickers match deploy38", () => {
  for (const name of ["index.html", "master.html", "login.html", "setup.html"]) {
    const html = readFileSync(path.join(root, name), "utf8");
    assert.match(html, /20260901deploy38/);
    assert.doesNotMatch(html, /20260901deploy3[0-7]/);
  }
  const saas = readFileSync(path.join(root, "css/saas.css"), "utf8");
  const pos = readFileSync(path.join(root, "css/pos.css"), "utf8");
  assert.match(saas, /body\.master-locked/);
  assert.match(saas, /max-width: 900px/);
  assert.match(pos, /backup-file-lab input\[type="file"\]/);
  assert.match(pos, /settings input:not\(\[type="file"\]\)/);
});
