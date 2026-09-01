import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  BACKUP_KIND,
  BACKUP_SKIP_TABLES,
  assertShopBackup,
  backupFilename,
  backupTableRank,
  sortBackupTables,
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
  assert.match(backupFilename({ name: "Swami Masale" }), /^spicepos-backup-swami-masale-/);
});

test("PHP and HTML wire shop backup", () => {
  const core = readFileSync(path.join(root, "pos-php-core.php"), "utf8");
  const backup = readFileSync(path.join(root, "pos-backup.php"), "utf8");
  const till = readFileSync(path.join(root, "pos-php-till.php"), "utf8");
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(core, /pos_dispatch_backup/);
  assert.match(core, /function pos_require_backup/);
  assert.match(backup, /function pos_dispatch_backup/);
  assert.match(backup, /spicepos-shop-backup/);
  assert.match(till, /pos_dispatch_backup/);
  assert.match(index, /btn-backup-download/);
  assert.match(index, /btn-backup-restore/);
  assert.match(index, /id="view-backup"/);
  assert.match(index, /data-view="backup"/);
});
