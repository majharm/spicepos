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
  assert.match(masterHtml, /data-tab="alerts"/);
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

test("HTML and CSS cache stickers match deploy63", () => {
  for (const name of ["index.html", "master.html", "login.html", "setup.html"]) {
    const html = readFileSync(path.join(root, name), "utf8");
    assert.match(html, /20260903deploy63/);
    assert.doesNotMatch(html, /20260902deploy62/);
    assert.doesNotMatch(html, /20260902deploy61/);
    assert.doesNotMatch(html, /20260902deploy60/);
    assert.doesNotMatch(html, /20260901deploy59/);
    assert.doesNotMatch(html, /20260901deploy[0-3][0-9]/);
    assert.doesNotMatch(html, /20260901deploy41/);
    assert.doesNotMatch(html, /20260901deploy42/);
    assert.doesNotMatch(html, /20260901deploy43/);
    assert.doesNotMatch(html, /20260901deploy44/);
    assert.doesNotMatch(html, /20260901deploy45/);
    assert.doesNotMatch(html, /20260901deploy46/);
    assert.doesNotMatch(html, /20260901deploy47/);
    assert.doesNotMatch(html, /20260901deploy48/);
    assert.doesNotMatch(html, /20260901deploy49/);
    assert.doesNotMatch(html, /20260901deploy50/);
    assert.doesNotMatch(html, /20260901deploy51/);
    assert.doesNotMatch(html, /20260901deploy52/);
    assert.doesNotMatch(html, /20260901deploy53/);
    assert.doesNotMatch(html, /20260901deploy54/);
    assert.doesNotMatch(html, /20260901deploy55/);
    assert.doesNotMatch(html, /20260901deploy56/);
    assert.doesNotMatch(html, /20260901deploy57/);
    assert.doesNotMatch(html, /20260901deploy58/);
    assert.doesNotMatch(html, /20260901deploy59/);
  }
  const saas = readFileSync(path.join(root, "css/saas.css"), "utf8");
  const pos = readFileSync(path.join(root, "css/pos.css"), "utf8");
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(saas, /alert-switch-ui/);
  assert.match(saas, /alert-card/);
  assert.match(saas, /max-width: 900px/);
  assert.match(saas, /height: 100dvh/);
  assert.match(saas, /margin-block: auto/);
  assert.match(pos, /page-scroll: shop views, master main, and auth document/);
  assert.match(pos, /body:has\(\.app\),\s*body:has\(\.master-shell\)/);
  assert.match(pos, /body\.auth-body/);
  assert.match(pos, /backup-file-lab input\[type="file"\]/);
  assert.match(pos, /settings input:not\(\[type="file"\]\)/);
  assert.match(pos, /settings-page/);
  assert.match(pos, /settings-grid/);
  assert.match(pos, /logo-preview-frame/);
  assert.match(pos, /logo-row/);
  assert.match(pos, /po-table/);
  assert.match(pos, /stage:not\(\.is-counter\) > \.view:not\(\[hidden\]\)/);
  assert.match(pos, /overscroll-behavior: contain/);
  assert.match(pos, /mobile-counter: list scroll \+ compact order list/);
  assert.match(pos, /body\.footwear-mode #pack-choice/);
  assert.match(pos, /stage\.is-counter \.line-ops/);
  assert.match(pos, /stage\.is-counter \.line-amt/);
  assert.match(pos, /minmax\(0, 240px\)/);
  assert.doesNotMatch(pos, /minmax\(240px, 48vh\)/);
  const appJs = readFileSync(path.join(root, "js/app.js"), "utf8");
  assert.match(pos, /office-preview/);
  assert.match(appJs, /Print official bill/);
  assert.match(appJs, /Print duplicate/);
  assert.match(appJs, /invoice-print-office-dup/);
  assert.match(appJs, /officeInvoiceBody/);
  assert.match(appJs, /setLineQty/);
  assert.match(appJs, /qty-input/);
  assert.match(appJs, /type any grams/);
  assert.match(appJs, /data-edit-pack/);
  assert.match(appJs, /fillPackForm/);
  assert.match(appJs, /\/api\/packs\/\$\{id\}/);
  assert.match(index, /type any grams/);
  assert.match(index, /id="pack-id"/);
  assert.match(index, /id="pack-save"/);
  assert.match(index, /id="pack-cancel"/);
  assert.match(pos, /\.pack-card-head/);
  assert.doesNotMatch(index, /100 g each/);
  assert.match(pos, /\.qty-input/);
  assert.match(index, /duplicate copy/);
  assert.match(index, /id="support-page"/);
  assert.match(index, /js\/support\.js/);
  assert.match(pos, /support-page: helpline-first shop Support/);
  assert.match(pos, /support-hero/);
  assert.match(pos, /support-cols/);
  assert.match(saas, /support-admin/);
  assert.match(saas, /login-support-link/);
  const supportJs = readFileSync(path.join(root, "js/support.js"), "utf8");
  assert.match(supportJs, /Call now/);
  assert.match(supportJs, /WhatsApp/);
  assert.match(supportJs, /Helpline not set yet/);
  assert.match(appJs, /SupportPage\.pageHtml/);
  assert.match(appJs, /class="line-info"/);
  assert.match(appJs, /class="line-ops"/);
  assert.match(appJs, /class="pack line-amt"/);
  assert.match(pos, /body\.counter-mode \.platform-notices/);
  assert.match(pos, /body:not\(\.dashboard-mode\):not\(\.counter-mode\) \.platform-notices/);
  assert.match(appJs, /dashboard-mode/);
  assert.match(pos, /compact-catalog: smaller item cards/);
  assert.match(pos, /bill-slider: hide unhide/);
  assert.match(pos, /minmax\(118px, 1fr\)/);
  assert.match(pos, /repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(pos, /\.stage\.is-counter \.catalog[\s\S]{0,500}flex-direction: column/);
  assert.match(pos, /stage\.is-counter > \.view-counter:not\(\[hidden\]\)/);
  assert.doesNotMatch(pos, /height: auto; max-height: none; overflow: visible/);
  assert.match(index, /<title>ATAV POS<\/title>/);
  assert.doesNotMatch(index, /SWAMI MASALE POS/);
  assert.match(index, /id="item-wearer"/);
  assert.match(index, /id="wearer-filter"/);
  assert.match(index, /id="bill-toggle"/);
  assert.match(index, /id="bill-panel"/);
  const masterJs = readFileSync(path.join(root, "js/master.js"), "utf8");
  assert.match(masterJs, /id="note-image"/);
  assert.match(masterJs, /id="alert-form"/);
  assert.match(saas, /notice-thumb/);
  assert.match(index, /settings-page/);
  assert.match(index, /logo-preview-frame/);
  assert.match(index, /logo-pick/);
  assert.match(index, /id="set-address"/);
  assert.match(index, /<textarea id="set-address"/);
  assert.match(index, /id="sup-email"/);
  assert.match(index, /id="sup-address"/);
  assert.match(index, /<textarea id="sup-address"/);
  assert.match(pos, /card-photo/);
  assert.match(pos, /item-image-frame/);
  assert.match(index, /id="item-image"/);
  assert.match(index, /id="item-image-preview"/);
  assert.match(index, /id="item-image-clear"/);
  assert.match(index, /id="item-hsn"/);
  assert.match(index, /HSN code/);
  assert.match(index, /id="po-lines"/);
  assert.match(index, /class="po-lines"/);
  assert.match(index, /id="po-item-search"/);
  assert.match(index, /id="view-expenses"/);
  assert.match(index, /data-view="expenses"/);
  assert.match(index, /id="rep-this-fy"/);
  assert.doesNotMatch(index, /Local name/);
});
