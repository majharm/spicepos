import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function hasPhpCli() {
  return spawnSync("php", ["-v"], { encoding: "utf8" }).status === 0;
}

function read(name) {
  return readFileSync(path.join(root, name), "utf8");
}

test("PHP fallback routes checkout, holds, and order updates through core", () => {
  const core = read("pos-php-core.php");
  const till = read("pos-php-till.php");
  const crud = read("pos-crud.php");
  const checkout = read("pos-checkout.php");
  const holds = read("pos-holds.php");
  const orders = read("pos-orders.php");

  assert.match(core, /checkout.*POST.*pos_dispatch_checkout/s);
  assert.match(core, /orders\/\[\^\/\]\+.*pos_dispatch_order_route/s);
  assert.match(core, /holds.*pos_dispatch_holds/s);
  assert.match(core, /backup.*pos_dispatch_backup/s);
  assert.match(core, /pos_dispatch_master_backup/);
  assert.match(core, /units.*pos_dispatch_units/s);
  assert.match(core, /function pos_require_backup/);
  assert.match(core, /function pos_require_units/);
  assert.match(core, /function pos_require_advanced/);
  assert.match(core, /pos_dispatch_advanced/);
  assert.match(core, /function pos_round2/);
  assert.match(core, /function pos_ensure_held_bills_schema/);
  assert.match(till, /pos_dispatch_order_route/);
  assert.match(till, /pos_dispatch_holds/);
  assert.match(crud, /checkout.*POST.*pos_dispatch_checkout/s);
  assert.match(crud, /pos_dispatch_holds/);
  assert.match(core, /function pos_customer_label/);
  assert.match(checkout, /pos_customer_label\(\$customer\)/);
  assert.match(orders, /pos_customer_label\(\$customer\)/);
  assert.doesNotMatch(checkout, /\$customer\["business_name"\] \?\? \$customer\["name"\]/);
  assert.doesNotMatch(orders, /\$customer\["business_name"\] \?\? \$customer\["name"\]/);
  assert.match(till, /NULLIF\(TRIM\(o\.customer_name\)/);
  assert.match(read("server/index.js"), /NULLIF\(TRIM\(o\.customer_name\)/);
  assert.match(checkout, /function pos_checkout_sale/);
  assert.match(checkout, /pos_alert_low_stock/);
  assert.match(checkout, /pos_tick_shop_alerts/);
  assert.match(holds, /function pos_dispatch_holds/);
  assert.match(holds, /INSERT INTO held_bills/);
  assert.match(orders, /function pos_dispatch_order_route/);
  assert.match(core, /This POS action is not available in PHP fallback yet \(\{\$method\} \{\$path\}\)/);
  assert.match(read("pos-accounting.php"), /\$path === "expenses"/);
  assert.match(read("pos-accounting.php"), /accounts\/receipts\/\(\[\^\/\]\+\)/);
  assert.match(read("pos-accounting.php"), /function pos_replace_ledger_journal/);
  assert.match(read("pos-php-core.php"), /function pos_indian_fy/);
  assert.match(core, /function pos_ensure_account_managers/);
  assert.match(core, /function pos_shop_support/);
  assert.match(core, /function pos_list_account_managers/);
  assert.match(core, /master\/account-managers/);
  assert.match(core, /businesses\/\(\[\^\/\]\+\)\/account-manager/);
  assert.match(core, /account_manager_id/);
  assert.match(read("pos-php-till.php"), /pos_shop_support\(\$bid\)/);
  assert.match(read("server/settings.js"), /export async function shopSupportContact/);
  assert.match(read("api/master/account-managers/index.php"), /master\/account-managers/);
  const ht = read("api/.htaccess");
  assert.match(ht, /DirectorySlash Off/);
  assert.doesNotMatch(ht, /!-d/);
  const apiJs = read("js/pos-api.js");
  assert.match(apiJs, /isPhpUnimplemented/);
  assert.match(apiJs, /orderedSpecs/);
});

test("PHP customer insert bind types match placeholders", () => {
  const crud = read("pos-crud.php");
  const core = read("pos-php-core.php");
  const cust = crud.match(
    /INSERT INTO customers[\s\S]*?VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,\?,0,\?\)",\s*"([sid]+)",\s*\[/,
  );
  assert.ok(cust, "customer INSERT found");
  assert.equal(cust[1].length, 10);
  assert.equal(cust[1], "ssssssssds");

  assert.match(crud, /color, size, wearer_type, base_unit/);
  const items = crud.match(/INSERT INTO items[\s\S]{0,500}"(ssssssssssddddssdds)"/);
  assert.ok(items, "item INSERT found");
  assert.equal(items[1].length, 19);
  assert.equal(items[1], "ssssssssssddddssdds");
  assert.match(crud, /image_url/);
  assert.match(core, /function pos_item_image_url/);
  assert.match(core, /image_url.*MEDIUMTEXT/);
  assert.match(core, /pos-alerts\.php/);
  assert.match(core, /master\/alerts/);
  assert.match(core, /INSERT INTO notifications[\s\S]*image_url/);
  assert.match(read("pos-alerts.php"), /function pos_send_update_alerts/);
  assert.match(read("pos-alerts.php"), /function pos_notice_image/);
  assert.match(read("pos-alerts.php"), /cid:notice-image/);
  assert.match(read("pos-mail.php"), /Content-ID: <notice-image>/);
  assert.match(read("js/master.js"), /id="note-image"/);
  assert.match(read("js/app.js"), /notice-thumb/);

  assert.match(core, /function pos_ensure_business_columns/);
  assert.match(core, /function pos_is_footwear_shop/);
  assert.match(crud, /pos_is_footwear_shop/);
  assert.match(crud, /FW-/);
  assert.match(crud, /\$unitRaw = trim\(\(string\) \(\$body\["base_unit"\] \?\? \$body\["unit"\] \?\? ""\)\)/);
  assert.match(crud, /\$unitRaw !== "" \? \$unitRaw : \(\$footwear \? "PCS" : "GM"\)/);
  assert.match(core, /function pos_item_unit/);
  assert.match(read("pos-checkout.php"), /pos_line_amount_for_item/);
  assert.match(crud, /pos_line_amount_for_item/);
  assert.match(crud, /items\/import/);
  assert.match(read("pos-item-import.php"), /function pos_item_import_run/);
  assert.match(read("pos-item-import.php"), /pos_parse_item_xlsx/);
  assert.match(read("pos-item-import.php"), /\(string\) \$src, \$blocks/);
  assert.match(read("server/crud.js"), /\/api\/items\/import/);
  assert.match(read("server/item-import.js"), /ITEM_IMPORT_HEADERS/);
  assert.match(read("pos-php-core.php"), /pos_qr_public_dispatch/);
  assert.match(read("pos-php-till.php"), /pos_qr_staff_dispatch/);
  assert.match(read("pos-qr-ordering.php"), /CREATE TABLE IF NOT EXISTS qr_orders/);
  assert.match(read("server/index.js"), /registerQrPublic/);
  assert.match(read("server/index.js"), /registerQrStaff/);
  const index = read("index.html");
  assert.match(index, /js\/units\.js/);
  assert.match(index, /js\/footwear\.js/);
  assert.match(index, /id="item-wearer"/);
  assert.match(index, /id="item-unit"/);
  assert.match(index, /id="view-units"/);
  assert.match(index, /data-view="units"/);
  assert.match(read("pos-units.php"), /function pos_dispatch_units/);
  assert.match(read("pos-units.php"), /CREATE TABLE IF NOT EXISTS inventory_units/);
  assert.match(read("pos-php-till.php"), /pos_dispatch_units/);
  assert.match(read("api/units/index.php"), /p.*=.*units/);
  const unitInsert = read("pos-units.php").match(
    /VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,'active'\)",\s*"([sid]+)",/,
  );
  assert.ok(unitInsert, "unit seed INSERT found");
  assert.equal(unitInsert[1], "sssssssdddi");
  const unitPost = read("pos-units.php").match(
    /VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?\)",\s*"([sid]+)",/,
  );
  assert.ok(unitPost, "unit POST INSERT found");
  assert.equal(unitPost[1], "sssssssdddis");
  assert.match(read("server/units.js"), /registerUnits/);
  assert.match(read("server/index.js"), /registerUnits\(app\)/);
  assert.match(read("js/app.js"), /applyUnitMaster/);
  assert.match(read("server/crud.js"), /POSUnits\.lineAmount/);
  assert.match(read("js/app.js"), /POSUnits\.lineAmount/);
  assert.match(read("pos-orders.php"), /pos_line_amount_for_item/);
  assert.match(read("pos-reports.php"), /payDaywise/);
  assert.match(read("pos-reports.php"), /Payment daywise/);
  assert.match(read("js/app.js"), /Payment daywise/);
  assert.match(read("server/reports.js"), /payDaywise/);
  const reportPhp = read("pos-reports.php");
  const reportJs = read("server/reports.js");
  assert.match(reportPhp, /GROUP BY i\.hsn, i\.code, l\.item_name, l\.gst_rate/);
  assert.match(reportJs, /GROUP BY i\.hsn, i\.code, l\.item_name, l\.gst_rate/);
  assert.doesNotMatch(reportPhp, /GROUP BY COALESCE\(i\.code/);
  assert.doesNotMatch(reportJs, /GROUP BY COALESCE\(i\.code/);
  assert.match(read("pos-php-core.php"), /\$db->error \?: "SQL error"/);
  assert.match(crud, /function pos_normalize_pack_items/);
  assert.match(crud, /function pos_insert_pack_lines/);
  assert.match(crud, /#\^packs\/\(\[\^\/\]\+\)\$#.*PUT/s);
  assert.match(crud, /DELETE FROM pack_items WHERE pack_id/);
  assert.match(read("server/crud.js"), /app\.put\("\/api\/packs\/:id"/);
  assert.match(read("js/app.js"), /data-edit-pack/);
  assert.match(read("js/app.js"), /Update pack/);
  assert.match(index, /id="pack-id"/);
});

test("PHP password hashes include sha256 and verify round-trip", { skip: hasPhpCli() ? false : "php CLI not installed" }, () => {
  const src = read("pos-php-scrypt.php");
  assert.match(src, /pos_password_needs_rehash/);
  assert.doesNotMatch(src, /return "pbkdf2\$sha256\$"/);
  const out = execFileSync(
    "php",
    [
      "-r",
      'require "pos-php-scrypt.php"; $h = pos_hash_password("Swami@12345"); if (!str_starts_with($h, \'pbkdf2$sha256$100000$\')) { fwrite(STDERR, $h); exit(2); } if (!pos_verify_password("Swami@12345", $h)) exit(3); if (pos_verify_password("wrong", $h)) exit(4); echo "HASH_OK needs=". (pos_password_needs_rehash($h) ? "yes" : "no");',
    ],
    { encoding: "utf8", cwd: root },
  );
  assert.match(out, /HASH_OK/);
  assert.match(out, /needs=no/);
});

test("Master Admin can set passwords and unlock locked accounts", () => {
  const masterJs = read("js/master.js");
  const masterApi = read("server/master.js");
  const core = read("pos-php-core.php");
  assert.match(masterJs, /data-reset-biz/);
  assert.match(masterJs, /data-reset-user/);
  assert.match(masterJs, /data-unlock/);
  assert.match(masterJs, /accountStatusLabel/);
  assert.match(masterApi, /\/api\/master\/users\/:id\/unlock/);
  assert.match(masterApi, /\/api\/master\/businesses\/:id\/reset-password/);
  assert.match(masterApi, /\/api\/master\/businesses\/:id\/clean/);
  assert.match(masterJs, /data-clean-biz/);
  assert.match(core, /users\/\(\[\^\/\]\+\)\/unlock/);
  assert.match(core, /businesses\/\(\[\^\/\]\+\)\/reset-password/);
  assert.match(core, /businesses\/\(\[\^\/\]\+\)\/clean/);
  assert.match(core, /function pos_unlock_staff_user/);
  assert.match(core, /auth\/reset-password/);
  assert.match(read("js/app.js"), /data-edit-staff/);
  assert.match(read("js/app.js"), /\/api\/auth\/reset-password/);
  assert.match(read("index.html"), /id="password-form"/);
  assert.match(read("pos-crud.php"), /staff\/\(\[\^\/\]\+\)\$#.*PUT/s);
});
