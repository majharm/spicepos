import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  BACKUP_KIND,
  BACKUP_SKIP_TABLES,
  PLATFORM_BACKUP_KIND,
  PLATFORM_SKIP_TABLES,
  BACKUP_EMAIL_HOURS,
  BACKUP_EMAIL_MAX_BYTES,
  assertPlatformBackup,
  assertShopBackup,
  backupFilename,
  backupEmailFilename,
  backupEmailSlot,
  backupTableRank,
  formatBackupBytes,
  gzipBackupJson,
  isSafeTableName,
  normalizeBackupRow,
  platformBackupFilename,
  prepareBackupEmailAttachment,
  SHOP_CLEAN_KEEP_TABLES,
  sortBackupTables,
  stripBackupDataImages,
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

test("shop clean keeps login and settings tables", () => {
  assert.ok(SHOP_CLEAN_KEEP_TABLES.has("businesses"));
  assert.ok(SHOP_CLEAN_KEEP_TABLES.has("staff_users"));
  assert.ok(SHOP_CLEAN_KEEP_TABLES.has("branches"));
  assert.ok(SHOP_CLEAN_KEEP_TABLES.has("pos_devices"));
  assert.ok(SHOP_CLEAN_KEEP_TABLES.has("company_settings"));
  assert.equal(SHOP_CLEAN_KEEP_TABLES.has("sales_orders"), false);
  assert.equal(SHOP_CLEAN_KEEP_TABLES.has("items"), false);
  assert.equal(SHOP_CLEAN_KEEP_TABLES.has("customers"), false);
  const backupPhp = readFileSync(path.join(root, "pos-backup.php"), "utf8");
  const backupJs = readFileSync(path.join(root, "server/backup.js"), "utf8");
  const masterApi = readFileSync(path.join(root, "server/master.js"), "utf8");
  const masterJs = readFileSync(path.join(root, "js/master.js"), "utf8");
  const core = readFileSync(path.join(root, "pos-php-core.php"), "utf8");
  assert.match(backupJs, /export async function cleanShopData/);
  assert.match(backupJs, /SHOP_CLEAN_KEEP_TABLES/);
  assert.match(backupPhp, /function pos_clean_shop_data/);
  assert.match(backupPhp, /function pos_shop_clean_keep_tables/);
  assert.match(masterApi, /\/api\/master\/businesses\/:id\/clean/);
  assert.match(masterApi, /verifyPassword\(password, admin\.password_hash\)/);
  assert.match(core, /businesses\/\(\[\^\/\]\+\)\/clean/);
  assert.match(core, /Master Admin password is incorrect/);
  assert.match(masterJs, /data-clean-biz/);
  assert.match(masterJs, /\/api\/master\/businesses\/\$\{businessId\}\/clean/);
  assert.match(masterJs, /id="biz-clean-form"/);
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
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const backupJs = readFileSync(path.join(root, "server/backup.js"), "utf8");
  assert.match(core, /pos_dispatch_backup/);
  assert.match(core, /function pos_require_backup/);
  assert.match(backup, /function pos_backup_sql_value/);
  assert.match(backup, /function pos_dispatch_backup/);
  assert.match(backup, /spicepos-shop-backup/);
  assert.match(core, /backup\/clean/);
  assert.match(till, /backup\/clean/);
  assert.match(index, /id="settings-form"/);
  assert.match(index, /id="set-name"/);
  assert.match(index, /id="set-timezone"/);
  assert.match(index, /id="set-invoice-footer"/);
  assert.match(index, /id="set-invoice-terms"/);
  assert.match(index, /id="set-pay-qr"/);
  assert.match(index, /id="set-payment-upi"/);
  assert.match(index, /id="set-logo"/);
  assert.match(index, /id="password-form"/);
  assert.match(index, /id="settings-pane-profile"/);
  assert.match(app, /showSettingsTab/);
  assert.match(index, /btn-backup-download/);
  assert.match(index, /btn-backup-restore/);
  assert.match(index, /id="shop-clean-form"/);
  assert.match(index, /id="shop-clean-card"/);
  assert.match(app, /\/api\/backup\/clean/);
  assert.match(app, /shop-clean-form/);
  assert.match(backup, /backup\/clean/);
  assert.match(backupJs, /\/api\/backup\/clean/);
  assert.match(readFileSync(path.join(root, "api/backup/clean/index.php"), "utf8"), /backup\/clean/);
  assert.match(index, /id="view-backup"/);
  assert.match(index, /data-settings-tab="backup"/);
  assert.match(index, /data-view="backup"/);
  assert.match(index, /Settings → Backup/);
  assert.doesNotMatch(index, /data-view="backup"><span class="nav-icon"/);
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
  assert.match(masterHtml, /data-backup-pane="settings">Settings</);
  assert.match(masterHtml, /nav-sub" data-tab="backup" data-backup-pane="backup">Backup</);
  assert.match(masterHtml, /nav-sub" data-tab="notes">Messages</);
  assert.match(masterHtml, /data-tab="managers"[^>]*>[\s\S]*?Account managers</);
  assert.match(masterHtml, /data-tab="expiry"[^>]*>[\s\S]*?Send alerts</);
  assert.match(masterJs, /tab === "managers"/);
  assert.match(masterJs, /\/api\/master\/account-managers/);
  assert.match(masterJs, /\/api\/master\/businesses\/\$\{shopId\}\/account-manager/);
  assert.match(masterApi, /\/api\/master\/account-managers/);
  assert.match(masterApi, /\/api\/master\/businesses\/:id\/account-manager/);
  assert.doesNotMatch(masterHtml, />Notifications</);
  assert.doesNotMatch(masterHtml, /data-tab="alerts"/);
  assert.match(masterJs, /function backupFamilyTabs/);
  assert.match(masterJs, /function advanceHubHtml/);
  assert.match(masterJs, /tab === "advance"/);
  assert.match(masterJs, /tabBtn\("settings"/);
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
  assert.match(backupJs, /\/api\/master\/backup\/email/);
  assert.match(backupJs, /export function tickBackupEmail/);
  assert.match(backupJs, /export function sendBackupEmailNow/);
  assert.doesNotMatch(backupJs, /from ["']\.\/alerts\.js["']/);
  assert.match(backup, /function pos_tick_backup_email/);
  assert.match(backup, /function pos_send_backup_email_now/);
  assert.match(backup, /GET_LOCK\('pos_backup_email'/);
  assert.match(core, /master\/backup\/email/);
  assert.match(core, /pos_tick_backup_email/);
  assert.match(masterJs, /Auto backup email/);
  assert.match(masterJs, /Send backup email now/);
  assert.match(masterJs, /five times/);
  assert.match(masterJs, /\/api\/master\/backup\/email\/settings/);
  assert.match(masterJs, /btn-master-backup-email-now/);
  const saas = readFileSync(path.join(root, "css/saas.css"), "utf8");
  assert.match(saas, /#master-pane-backup\[hidden\]/);
  assert.match(
    readFileSync(path.join(root, "api/master/backup/email/index.php"), "utf8"),
    /master\/backup\/email/,
  );
  assert.match(
    readFileSync(path.join(root, "api/master/backup/email/settings/index.php"), "utf8"),
    /master\/backup\/email\/settings/,
  );
});

test("platform backup email slots are 5 times a day in IST", () => {
  assert.deepEqual(BACKUP_EMAIL_HOURS, [6, 10, 14, 18, 22]);
  assert.equal(backupEmailSlot(new Date("2026-09-08T00:30:00.000Z")), "2026-09-08T06");
  assert.equal(backupEmailSlot(new Date("2026-09-08T04:30:00.000Z")), "2026-09-08T10");
  assert.equal(backupEmailSlot(new Date("2026-09-08T08:30:00.000Z")), "2026-09-08T14");
  assert.equal(backupEmailSlot(new Date("2026-09-08T12:30:00.000Z")), "2026-09-08T18");
  assert.equal(backupEmailSlot(new Date("2026-09-08T16:30:00.000Z")), "2026-09-08T22");
  assert.equal(backupEmailSlot(new Date("2026-09-08T05:30:00.000Z")), null);
  assert.match(backupEmailFilename(new Date("2026-09-08T04:30:00.000Z")), /spicepos-platform-backup-20260908-10\.json\.gz/);
  const php = readFileSync(path.join(root, "pos-backup.php"), "utf8");
  const health = readFileSync(path.join(root, "api/health/index.php"), "utf8");
  const alertsJs = readFileSync(path.join(root, "server/alerts.js"), "utf8");
  const alertsPhp = readFileSync(path.join(root, "pos-alerts.php"), "utf8");
  const mailJs = readFileSync(path.join(root, "server/mail.js"), "utf8");
  const mailPhp = readFileSync(path.join(root, "pos-mail.php"), "utf8");
  assert.match(php, /6, 10, 14, 18, 22/);
  assert.match(php, /Asia\/Kolkata/);
  assert.match(health, /function health_backup_email_due/);
  assert.match(health, /pos_tick_backup_email/);
  assert.match(alertsJs, /alert_backup_email/);
  assert.match(alertsJs, /backup_email_to/);
  assert.match(alertsJs, /runBackupEmailTick/);
  assert.match(alertsPhp, /alert_backup_email/);
  assert.match(mailJs, /multipart\/mixed/);
  assert.match(mailPhp, /multipart\/mixed/);
  assert.equal(BACKUP_EMAIL_MAX_BYTES, 12 * 1024 * 1024);
});

test("backup email gzip strips embedded photos when the file is too large", () => {
  const json = JSON.stringify({
    kind: PLATFORM_BACKUP_KIND,
    tables: { items: [{ image_url: "data:image/png;base64,aaaa" }] },
  });
  assert.match(json, /data:image\/png;base64,aaaa/);
  assert.equal(stripBackupDataImages(json).includes("data:image"), false);
  const att = prepareBackupEmailAttachment({ kind: PLATFORM_BACKUP_KIND, tables: { businesses: [] } });
  assert.equal(att.tooLarge, false);
  assert.ok(att.content.length > 16);
  assert.equal(att.content[0], 0x1f);
  assert.equal(att.content[1], 0x8b);
  assert.match(att.filename, /\.json\.gz$/);
  assert.match(formatBackupBytes(2048), /KB/);
  const round = gzipBackupJson("{}");
  assert.ok(round.length > 0);
});

test("HTML and CSS cache stickers match deploy136", () => {
  for (const name of ["index.html", "login.html", "setup.html"]) {
    const html = readFileSync(path.join(root, name), "utf8");
    assert.match(html, /20260905deploy136/);
    assert.doesNotMatch(html, /20260905deploy135/);
    assert.doesNotMatch(html, /20260905deploy134/);
    assert.doesNotMatch(html, /20260905deploy133/);
    assert.doesNotMatch(html, /20260905deploy132/);
    assert.doesNotMatch(html, /20260905deploy131/);
    assert.doesNotMatch(html, /20260905deploy130/);
    assert.doesNotMatch(html, /20260905deploy129/);
    assert.doesNotMatch(html, /20260905deploy128/);
    assert.doesNotMatch(html, /20260905deploy127/);
    assert.doesNotMatch(html, /20260905deploy125/);
    assert.doesNotMatch(html, /20260905deploy124/);
    assert.doesNotMatch(html, /20260905deploy123/);
    assert.doesNotMatch(html, /20260905deploy122/);
    assert.doesNotMatch(html, /20260905deploy121/);
    assert.doesNotMatch(html, /20260905deploy120/);
    assert.doesNotMatch(html, /20260905deploy119/);
    assert.doesNotMatch(html, /20260905deploy105/);
    assert.doesNotMatch(html, /20260904deploy90/);
    assert.doesNotMatch(html, /20260904deploy89/);
    assert.doesNotMatch(html, /20260903deploy88/);
    assert.doesNotMatch(html, /20260903deploy87/);
    assert.doesNotMatch(html, /20260903deploy84/);
    assert.doesNotMatch(html, /20260903deploy83/);
    assert.doesNotMatch(html, /20260903deploy82/);
    assert.doesNotMatch(html, /20260903deploy81/);
    assert.doesNotMatch(html, /20260903deploy80/);
    assert.doesNotMatch(html, /20260903deploy79/);
    assert.doesNotMatch(html, /20260903deploy78/);
    assert.doesNotMatch(html, /20260903deploy77/);
    assert.doesNotMatch(html, /20260903deploy76/);
    assert.doesNotMatch(html, /20260903deploy75/);
    assert.doesNotMatch(html, /20260903deploy73/);
    assert.doesNotMatch(html, /20260903deploy72/);
    assert.doesNotMatch(html, /20260903deploy71/);
    assert.doesNotMatch(html, /20260903deploy70/);
    assert.doesNotMatch(html, /20260903deploy69/);
    assert.doesNotMatch(html, /20260903deploy68/);
    assert.doesNotMatch(html, /20260903deploy67/);
    assert.doesNotMatch(html, /20260903deploy66/);
    assert.doesNotMatch(html, /20260903deploy64/);
    assert.doesNotMatch(html, /20260903deploy63/);
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
  const orderSticker = readFileSync(path.join(root, "order.html"), "utf8");
  assert.match(orderSticker, /20260905deploy170/);
  assert.doesNotMatch(orderSticker, /20260905deploy139/);
  assert.doesNotMatch(orderSticker, /20260905deploy136/);
  const masterHtml = readFileSync(path.join(root, "master.html"), "utf8");
  assert.match(masterHtml, /20260905deploy172/);
  assert.doesNotMatch(masterHtml, /20260905deploy137/);
  assert.doesNotMatch(masterHtml, /20260905deploy118/);
  assert.doesNotMatch(masterHtml, /20260905deploy113/);
  assert.match(masterHtml, /nav-group-label">Advance</);
  assert.match(masterHtml, /data-tab="advance"/);
  assert.match(masterHtml, /data-tab="alert-log"[^>]*>[\s\S]*?WA & Email log</);
  const saas = readFileSync(path.join(root, "css/saas.css"), "utf8");
  const pos = readFileSync(path.join(root, "css/pos.css"), "utf8");
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  const qrOrder = readFileSync(path.join(root, "order.html"), "utf8");
  const qrOrderJs = readFileSync(path.join(root, "js/qr-order.js"), "utf8");
  const qrOrderPhp = readFileSync(path.join(root, "pos-qr-ordering.php"), "utf8");
  assert.match(index, /data-view="qr-orders"/);
  assert.match(index, /id="qr-menu-code"/);
  assert.match(index, /id="qr-order-list"/);
  assert.match(index, /id="qr-shop-id"/);
  assert.match(index, /id="qr-order-toast"/);
  assert.match(index, /id="qr-sound-toggle"/);
  assert.match(index, /id="qr-sound-arm"/);
  assert.match(index, /id="qr-order-chime"/);
  assert.match(index, /preload="none"/);
  assert.match(index, /sounds\/qr-order\.wav/);
  assert.ok(existsSync(path.join(root, "sounds/qr-order.wav")));
  assert.match(index, /js\/qr-notify\.js/);
  const qrPoster = readFileSync(path.join(root, "qr.html"), "utf8");
  assert.match(qrPoster, /qrcode\.iife\.js/);
  assert.match(qrPoster, /order\.html\?shop=/);
  assert.match(qrPoster, /Scan to order spices/);
  assert.match(qrPoster, /#4a1416/);
  assert.match(qrOrder, /id="order-form"/);
  assert.match(qrOrder, /id="cart-sheet"/);
  assert.match(qrOrder, /id="offer-board"/);
  assert.match(qrOrder, /id="success-save"/);
  assert.match(qrOrder, /js\/offers\.js/);
  assert.match(qrOrderJs, /\/api\/qr\/menu/);
  assert.match(qrOrderJs, /\/api\/qr\/orders/);
  assert.match(qrOrderJs, /function offerResult/);
  assert.match(qrOrderJs, /Discount/);
  assert.match(qrOrderJs, /function isPack/);
  assert.match(qrOrderJs, /function mergeMenuItems/);
  const qrNotify = readFileSync(path.join(root, "js/qr-notify.js"), "utf8");
  assert.match(qrNotify, /function playTone/);
  assert.match(qrNotify, /function playWav/);
  assert.match(qrNotify, /qr-order-chime/);
  assert.match(qrNotify, /data:audio\/wav/);
  assert.match(pos, /qr-order-toast/);
  assert.match(pos, /qr-sound-arm/);
  assert.match(pos, /qr-sound-arm\[hidden\]/);
  assert.match(qrOrderPhp, /pos_apply_qr_offers/);
  assert.match(qrOrderPhp, /offer_label/);
  assert.match(qrOrderPhp, /pos_qr_pack_cards/);
  assert.match(qrOrderPhp, /pos_qr_expand_pack_line/);
  assert.match(qrOrderPhp, /"packs"/);
  assert.match(qrOrderPhp, /function pos_qr_public_dispatch/);
  assert.match(qrOrderPhp, /function pos_qr_staff_dispatch/);
  assert.match(qrOrderPhp, /function pos_qr_ensure_invoice/);
  assert.match(readFileSync(path.join(root, "js/app.js"), "utf8"), /openInvoiceFromQr/);
  assert.match(readFileSync(path.join(root, "js/app.js"), "utf8"), /function printQrPoster/);
  assert.match(readFileSync(path.join(root, "js/app.js"), "utf8"), /function printQrOrder/);
  assert.match(readFileSync(path.join(root, "js/app.js"), "utf8"), /function showInvoicePrintModal/);
  assert.match(readFileSync(path.join(root, "js/app.js"), "utf8"), /printOrder\(bill, "pos"\)/);
  assert.match(readFileSync(path.join(root, "js/app.js"), "utf8"), /Scan to order spices/);
  assert.match(readFileSync(path.join(root, "js/app.js"), "utf8"), /data-qr-print/);
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
  assert.match(pos, /settings-desk/);
  assert.match(pos, /settings-grid/);
  assert.match(pos, /logo-preview-frame/);
  assert.match(pos, /logo-row/);
  assert.match(pos, /po-table/);
  assert.match(pos, /stage:not\(\.is-counter\) > \.view:not\(\[hidden\]\)/);
  assert.match(pos, /overscroll-behavior: contain/);
  assert.match(pos, /mobile-counter: list scroll \+ stacked order line/);
  assert.match(pos, /\.stage\.is-counter \.line-ops/);
  assert.match(pos, /flex: 1 1 100%/);
  assert.match(pos, /display: contents/);
  assert.match(pos, /body\.footwear-mode #pack-choice/);
  assert.match(pos, /stage\.is-counter \.line-amt/);
  assert.match(pos, /minmax\(200px, 46vh\)/);
  assert.match(pos, /bill-type: compact till scale/);
  assert.match(pos, /\.line \.who \{ font-weight: 700; font-size: 14px/);
  assert.match(pos, /\.totals \.grand \{ font-size: 18px/);
  assert.match(pos, /\.stage\.is-counter \.totals \.grand \{ font-size: 16px; \}/);
  assert.doesNotMatch(pos, /minmax\(0, 240px\)/);
  const appJs = readFileSync(path.join(root, "js/app.js"), "utf8");
  assert.match(pos, /counter-cats: category chips/);
  assert.match(index, /id="catalog-cats"/);
  assert.match(appJs, /function renderCatalogCats/);
  assert.match(appJs, /function startQrOrderWatch/);
  assert.match(appJs, /input\.select/);
  assert.match(pos, /office-preview/);
  assert.match(appJs, /Print official bill/);
  assert.match(appJs, /Print duplicate/);
  assert.match(appJs, /invoice-print-office-dup/);
  assert.match(appJs, /officeInvoiceBody/);
  assert.match(appJs, /setLineQty/);
  assert.match(appJs, /qty-input/);
  assert.match(appJs, /Scan, tap, or search/);
  assert.match(appJs, /applyBarcodeScan/);
  assert.match(appJs, /data-edit-pack/);
  assert.match(appJs, /fillPackForm/);
  assert.match(appJs, /\/api\/packs\/\$\{id\}/);
  assert.match(index, /Scan or search/);
  assert.match(index, /id="pack-id"/);
  assert.match(index, /id="pack-save"/);
  assert.match(index, /id="pack-cancel"/);
  assert.match(pos, /\.pack-card-head/);
  assert.match(pos, /packs-desk: composer \+ library/);
  assert.match(index, /id="pack-item-search"/);
  assert.match(index, /id="pack-library-search"/);
  assert.match(index, /class="packs-desk"/);
  assert.match(appJs, /function paintPackLive/);
  assert.match(appJs, /function filterPackCompose/);
  assert.match(index, /class="items-desk"/);
  assert.match(index, /id="item-catalog-search"/);
  assert.match(index, /id="item-mode"/);
  assert.match(index, /id="item-save"/);
  assert.equal((index.match(/id="item-barcode"/g) || []).length, 0);
  assert.equal((index.match(/id="item-mfr-barcode"/g) || []).length, 0);
  assert.match(index, /id="item-barcode-qty"/);
  assert.doesNotMatch(index, /item-barcode-gen/);
  assert.match(appJs, /function fillItemForm/);
  assert.match(appJs, /function filterItemsCatalog/);
  assert.match(pos, /items-desk: composer \+ library/);
  assert.match(index, /id="item-import-file"/);
  assert.match(index, /id="item-import-template"/);
  assert.match(appJs, /function uploadItemsExcel/);
  assert.match(appJs, /\/api\/items\/import/);
  assert.match(pos, /\.item-import-bar/);
  assert.match(index, /id="view-expiry"/);
  assert.match(index, /expiry-desk/);
  assert.match(index, /id="expiry-search"/);
  assert.match(appJs, /function loadExpiryView/);
  assert.match(appJs, /function filterExpiryList/);
  assert.match(pos, /expiry-desk: dated on-hand batches/);
  assert.match(pos, /\.expiry-card\[hidden\]/);
  assert.match(index, /stock-desk/);
  assert.match(index, /id="stock-search"/);
  assert.match(index, /id="stock-low-only"/);
  assert.match(index, /id="stock-hint"/);
  assert.match(index, /id="stock-selected"/);
  assert.match(index, /id="stock-post"/);
  assert.match(index, /id="stock-excel"/);
  assert.match(appJs, /function paintStockExcelLink/);
  assert.match(appJs, /\/api\/stock\/excel/);
  assert.match(appJs, /function resolvePickerItem/);
  assert.match(appJs, /function paintStockList/);
  assert.match(appJs, /function filterStockList/);
  assert.match(appJs, /function selectStockItem/);
  assert.match(appJs, /Pick an item/);
  assert.match(pos, /stock-desk: on-hand \+ adjustments/);
  assert.match(pos, /\.stock-card\[hidden\]/);
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
  assert.match(appJs, /function orderCustomerName/);
  assert.match(appJs, /orderCustomerName\(o\)/);
  assert.match(appJs, /class="line-info"/);
  assert.match(appJs, /class="line-ops"/);
  assert.match(appJs, /class="line-amt"/);
  assert.match(pos, /body\.counter-mode \.platform-notices/);
  assert.match(pos, /counter-cats: category chips/);
  assert.match(pos, /counter-ux: till-desk-2026/);
  assert.match(pos, /scan-box: compact 2026/);
  assert.match(pos, /counter-row: one line small 2026/);
  assert.match(index, /id="scan-form"[\s\S]*id="pack-choice"[\s\S]*id="pay-method"[\s\S]*id="counter-mobile"[\s\S]*id="customer"/);
  assert.match(index, /id="bill-due"/);
  assert.match(appJs, /function paintCounterDue/);
  assert.match(pos, /catalog-empty/);
  assert.match(pos, /bill-slider: hide unhide/);
  assert.match(pos, /minmax\(152px, 1fr\)/);
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
  assert.match(index, /settings-desk/);
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
  assert.match(index, /id="acc-fy-year"/);
  assert.match(index, /id="rep-fy-year"/);
  assert.match(index, /class="items-desk reports-desk"/);
  assert.match(index, /id="reports-hero-stats"/);
  assert.match(index, /id="reports-tabs"/);
  assert.match(index, /id="rep-search"/);
  assert.match(index, /data-report-tab="gst"/);
  assert.match(index, /id="exp-fy-year"/);
  assert.match(index, /id="acc-print"/);
  assert.match(index, /id="rep-print"/);
  assert.match(index, /id="exp-print"/);
  assert.match(appJs, /function fyYearList/);
  assert.match(appJs, /function printFinance/);
  assert.match(appJs, /data-print-report/);
  assert.match(appJs, /function applyReportsFilter/);
  assert.match(appJs, /function paintReportsHero/);
  assert.match(appJs, /function setReportTab/);
  assert.match(pos, /reports-desk: hero \+ tabs/);
  assert.match(appJs, /printAccountsReport/);
  assert.match(pos, /\.report-toolbar select/);
  assert.match(appJs, /function printVoucher/);
  assert.match(appJs, /function showVoucherResult/);
  assert.match(appJs, /InvoicePrint\.voucherDocument/);
  assert.match(appJs, /InvoicePrint\.voucherBody/);
  assert.match(appJs, /data-voucher-print/);
  assert.match(appJs, /data-voucher-alter/);
  assert.match(appJs, /function showAlterVoucherModal/);
  assert.match(appJs, /Print \$\{label\.toLowerCase\(\)\}/);
  const invoiceJs = readFileSync(path.join(root, "js/invoice.js"), "utf8");
  assert.match(invoiceJs, /function voucherBody/);
  assert.match(invoiceJs, /function voucherDocument/);
  assert.match(invoiceJs, /RECEIPT VOUCHER/);
  assert.match(invoiceJs, /PAYMENT VOUCHER/);
  const login = readFileSync(path.join(root, "login.html"), "utf8");
  assert.match(login, /class="auth-shell"/);
  assert.match(login, /class="auth-scene"/);
  assert.match(login, /All types of businesses use ATAV POS/);
  assert.match(login, /class="auth-scene-shots"/);
  assert.match(login, /assets\/login-pos-counter\.jpg/);
  assert.match(login, /assets\/login-pos-invoice\.jpg/);
  assert.match(login, /assets\/login-pos-stock\.jpg/);
  assert.match(login, /Bakery \/ cake shop/);
  assert.match(login, />Bakery</);
  assert.match(login, /class="login-legal"/);
  assert.match(login, /href="https:\/\/atavtelecom\.in\/legal\/privacy"[^>]*>Privacy Policy</);
  assert.match(login, /href="https:\/\/atavtelecom\.in\/legal\/terms"[^>]*>Terms &amp; Conditions</);
  assert.match(login, /href="https:\/\/atavtelecom\.in\/legal\/data-deletion"[^>]*>Data Deletion Policy</);
  assert.match(login, /href="https:\/\/atavtelecom\.in\/legal\/refund"[^>]*>Refund &amp; Cancellation</);
  assert.match(login, /href="https:\/\/atavtelecom\.in\/legal\/shipping"[^>]*>Shipping &amp; Delivery</);
  assert.match(login, /href="https:\/\/atavtelecom\.in\/legal\/cookies"[^>]*>Cookie Policy</);
  assert.match(login, /class="signup-block"/);
  assert.match(login, /class="auth-trial-banner"/);
  assert.match(login, /class="auth-trial-invite"/);
  assert.match(login, /Start 2-day trial/);
  assert.match(login, /New shops get a 2-day trial/);
  const xpos = readFileSync(path.join(root, "js/x-pos-20260830e.js"), "utf8");
  assert.match(xpos, /\.get\("tab"\) === "signup"/);
  assert.match(xpos, /location\.hash === "#signup"/);
  assert.match(xpos, /2-day free trial, no card/);
  assert.match(saas, /auth-trial-ui: 2-day banner 2026/);
  assert.match(saas, /auth-login-scroll: visible 2026/);
  assert.match(saas, /\.auth-main::-webkit-scrollbar/);
  assert.match(saas, /overflow-y: scroll/);
  assert.match(saas, /auth-card > p\.auth-trial-invite/);
  assert.match(saas, /auth-scene-types/);
  assert.match(saas, /login-pos-shots: counter invoice stock/);
  assert.match(saas, /auth-body:has\(\.auth-scene\)/);
  assert.match(saas, /\.auth-shell /);
  assert.match(saas, /\.login-legal /);
  assert.match(saas, /\.legal-card /);
  assert.match(masterJs, /"Bakery"/);
  assert.doesNotMatch(index, /Local name/);
});
