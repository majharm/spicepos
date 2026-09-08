<?php

function pos_backup_skip_tables() {
  return [
    "staff_sessions" => true,
    "platform_admins" => true,
    "platform_sessions" => true,
    "platform_settings" => true,
    "subscription_plans" => true,
  ];
}

function pos_backup_platform_skip_tables() {
  return [
    "staff_sessions" => true,
    "platform_sessions" => true,
  ];
}

function pos_shop_clean_keep_tables() {
  return [
    "businesses" => true,
    "staff_users" => true,
    "branches" => true,
    "pos_devices" => true,
    "company_settings" => true,
    "inventory_units" => true,
    "units" => true,
    "loyalty_settings" => true,
  ];
}

function pos_backup_prepare() {
  @set_time_limit(300);
  @ini_set("memory_limit", "512M");
}

function pos_backup_safe_table($name) {
  $t = (string) $name;
  if ($t === "" || !preg_match('/^[A-Za-z0-9_]+$/', $t)) return "";
  return $t;
}

function pos_backup_schema_name() {
  $db = pos_db();
  $res = $db->query("SELECT DATABASE()");
  if (!$res) return "";
  $row = $res->fetch_row();
  $res->free();
  return (string) ($row[0] ?? "");
}

function pos_backup_filter_tables($rows, $skip) {
  $out = [];
  foreach ($rows as $row) {
    $t = pos_backup_safe_table($row["t"] ?? "");
    if ($t === "" || isset($skip[$t])) continue;
    $out[] = $t;
  }
  return $out;
}

function pos_backup_biz_tables() {
  $schema = pos_backup_schema_name();
  if ($schema === "") return [];
  $rows = pos_q(
    "SELECT DISTINCT TABLE_NAME AS t FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'business_id' ORDER BY TABLE_NAME",
    "s",
    [$schema]
  );
  return pos_backup_filter_tables($rows, pos_backup_skip_tables());
}

function pos_backup_all_tables() {
  $schema = pos_backup_schema_name();
  if ($schema === "") return [];
  $rows = pos_q(
    "SELECT TABLE_NAME AS t FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
    "s",
    [$schema]
  );
  return pos_backup_filter_tables($rows, pos_backup_platform_skip_tables());
}

function pos_backup_table_rank($name) {
  if (preg_match('/_lines$/', $name) || in_array($name, ["pack_items", "branch_stocks", "journal_lines", "stock_movements", "item_barcodes", "stock_batches", "damage_records", "loyalty_ledger", "loyalty_accounts"], true)) {
    return 0;
  }
  if ($name === "staff_users") return 2;
  if ($name === "branches" || $name === "pos_devices") return 3;
  if ($name === "businesses") return 4;
  if (in_array($name, ["subscription_plans", "platform_admins", "platform_settings"], true)) return 5;
  return 1;
}

function pos_backup_sort_tables($names, $forInsert) {
  usort($names, function ($a, $b) use ($forInsert) {
    $d = pos_backup_table_rank($a) - pos_backup_table_rank($b);
    if ($forInsert) $d = -$d;
    if ($d !== 0) return $d;
    return strcmp($a, $b);
  });
  return $names;
}

function pos_backup_columns($table) {
  static $cache = [];
  if (isset($cache[$table])) return $cache[$table];
  $db = pos_db();
  $safe = pos_backup_safe_table($table);
  $cols = [];
  if ($safe !== "") {
    $res = $db->query("SHOW COLUMNS FROM `{$safe}`");
    if ($res) {
      while ($row = $res->fetch_assoc()) $cols[$row["Field"]] = true;
      $res->free();
    }
  }
  $cache[$table] = $cols;
  return $cols;
}

function pos_backup_filename($business) {
  $name = preg_replace("/[^a-zA-Z0-9]+/", "-", (string) ($business["name"] ?? "shop"));
  $name = trim($name, "-") ?: "shop";
  return "spicepos-backup-" . strtolower($name) . "-" . date("Ymd-His") . ".json";
}

function pos_backup_platform_filename() {
  return "spicepos-platform-backup-" . date("Ymd-His") . ".json";
}

function pos_backup_send_json_file($filename, $payload) {
  $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
  if ($json === false) throw new Exception("Could not encode backup");
  pos_send_file(200, "application/json; charset=utf-8", $filename, $json);
}

function pos_backup_build($bid) {
  pos_backup_prepare();
  $biz = pos_q("SELECT id, name, gstin, status FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
  $business = $biz[0] ?? ["id" => $bid, "name" => "shop"];
  $tables = [];
  foreach (pos_backup_biz_tables() as $t) {
    try {
      $tables[$t] = pos_q("SELECT * FROM `{$t}` WHERE business_id = ?", "s", [$bid]);
    } catch (Exception $e) {
      $tables[$t] = [];
    }
  }
  return [
    "kind" => "spicepos-shop-backup",
    "version" => 1,
    "created_at" => date("c"),
    "business_id" => $bid,
    "business" => $business,
    "tables" => $tables,
  ];
}

function pos_backup_build_platform() {
  pos_backup_prepare();
  $tables = [];
  foreach (pos_backup_all_tables() as $t) {
    try {
      $tables[$t] = pos_q("SELECT * FROM `{$t}`");
    } catch (Exception $e) {
      $tables[$t] = [];
    }
  }
  return [
    "kind" => "spicepos-platform-backup",
    "version" => 1,
    "created_at" => date("c"),
    "tables" => $tables,
  ];
}

function pos_backup_sql_value($v) {
  if (is_bool($v)) return $v ? 1 : 0;
  if (!is_string($v)) return $v;
  if (preg_match('/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/', $v, $m)) {
    return $m[1] . " " . $m[2] . ($m[3] ?? "");
  }
  return $v;
}

function pos_backup_insert_row($table, $row) {
  $allowed = pos_backup_columns($table);
  $cols = [];
  $vals = [];
  foreach ($row as $k => $v) {
    if (!isset($allowed[$k])) continue;
    $cols[] = $k;
    $vals[] = pos_backup_sql_value($v);
  }
  if (!$cols) return;
  $safe = pos_backup_safe_table($table);
  if ($safe === "") return;
  $colSql = "`" . implode("`,`", $cols) . "`";
  $ph = implode(",", array_fill(0, count($cols), "?"));
  $types = str_repeat("s", count($cols));
  pos_q("INSERT INTO `{$safe}` ({$colSql}) VALUES ({$ph})", $types, $vals);
}

function pos_backup_matching_tables($payloadTables, $known) {
  if (!is_array($payloadTables) || !$payloadTables) throw new Exception("Backup has no tables");
  $knownMap = array_fill_keys($known, true);
  return array_values(array_filter(array_keys($payloadTables), function ($t) use ($knownMap) {
    return isset($knownMap[$t]);
  }));
}

function pos_clean_shop_data($bid) {
  pos_backup_prepare();
  $keep = pos_shop_clean_keep_tables();
  $names = [];
  foreach (pos_backup_biz_tables() as $t) {
    if (!isset($keep[$t])) $names[] = $t;
  }
  $deleteOrder = pos_backup_sort_tables($names, false);
  pos_with_transaction(function () use ($bid, $deleteOrder) {
    pos_q("SET FOREIGN_KEY_CHECKS=0");
    try {
      try {
        pos_q("DELETE FROM staff_sessions WHERE business_id = ?", "s", [$bid]);
      } catch (Exception $e) {
        /* optional */
      }
      try {
        pos_q(
          "DELETE s FROM staff_sessions s INNER JOIN staff_users u ON u.id = s.staff_user_id WHERE u.business_id = ?",
          "s",
          [$bid]
        );
      } catch (Exception $e) {
        /* optional */
      }
      foreach ($deleteOrder as $t) {
        pos_q("DELETE FROM `{$t}` WHERE business_id = ?", "s", [$bid]);
      }
    } finally {
      pos_q("SET FOREIGN_KEY_CHECKS=1");
    }
  });
  return ["ok" => true, "tables" => count($names)];
}

function pos_backup_restore($bid, $payload, $auth, $masterAdmin = null) {
  pos_backup_prepare();
  if (!is_array($payload) || ($payload["kind"] ?? "") !== "spicepos-shop-backup") {
    throw new Exception("Not a SpicePOS shop backup file");
  }
  if (($payload["business_id"] ?? "") !== $bid) {
    throw new Exception("This backup belongs to another shop");
  }
  $tables = $payload["tables"] ?? [];
  $names = pos_backup_matching_tables($tables, pos_backup_biz_tables());
  if (!$names) throw new Exception("Backup has no matching tables");
  $deleteOrder = pos_backup_sort_tables($names, false);
  $insertOrder = pos_backup_sort_tables($names, true);
  pos_with_transaction(function () use ($bid, $tables, $deleteOrder, $insertOrder) {
    pos_q("SET FOREIGN_KEY_CHECKS=0");
    try {
      foreach ($deleteOrder as $t) {
        pos_q("DELETE FROM `{$t}` WHERE business_id = ?", "s", [$bid]);
      }
      foreach ($insertOrder as $t) {
        $rows = $tables[$t] ?? [];
        if (!is_array($rows)) continue;
        foreach ($rows as $row) {
          if (!is_array($row)) continue;
          $row["business_id"] = $bid;
          pos_backup_insert_row($t, $row);
        }
      }
    } finally {
      pos_q("SET FOREIGN_KEY_CHECKS=1");
    }
  });
  $details = [
    "module" => "backup",
    "target_id" => $bid,
    "target_name" => $payload["business"]["name"] ?? "shop",
    "tables" => count($names),
  ];
  if ($masterAdmin) {
    pos_audit($masterAdmin, "Shop backup restored", $details);
  } else {
    pos_staff_audit($auth["user"], "Shop backup restored", [
      "module" => "settings",
      "target_id" => $bid,
      "target_name" => $payload["business"]["name"] ?? "shop",
      "tables" => count($names),
    ], $bid, $auth["branchId"] ?? $auth["user"]["branch_id"] ?? null);
  }
  return ["ok" => true, "tables" => count($names), "php" => true];
}

function pos_backup_restore_platform($payload, $admin) {
  pos_backup_prepare();
  if (!is_array($payload) || ($payload["kind"] ?? "") !== "spicepos-platform-backup") {
    throw new Exception("Not a SpicePOS platform backup file");
  }
  $tables = $payload["tables"] ?? [];
  $names = pos_backup_matching_tables($tables, pos_backup_all_tables());
  if (!$names) throw new Exception("Backup has no matching tables");
  $deleteOrder = pos_backup_sort_tables($names, false);
  $insertOrder = pos_backup_sort_tables($names, true);
  pos_with_transaction(function () use ($tables, $deleteOrder, $insertOrder) {
    pos_q("SET FOREIGN_KEY_CHECKS=0");
    try {
      foreach ($deleteOrder as $t) {
        pos_q("DELETE FROM `{$t}`");
      }
      foreach ($insertOrder as $t) {
        $rows = $tables[$t] ?? [];
        if (!is_array($rows)) continue;
        foreach ($rows as $row) {
          if (!is_array($row)) continue;
          pos_backup_insert_row($t, $row);
        }
      }
    } finally {
      pos_q("SET FOREIGN_KEY_CHECKS=1");
    }
  });
  pos_audit($admin, "Platform backup restored", [
    "module" => "backup",
    "tables" => count($names),
  ]);
  return ["ok" => true, "tables" => count($names), "php" => true];
}

function pos_backup_require_shop($shopId) {
  $id = trim((string) $shopId);
  if ($id === "") throw new Exception("Select a shop");
  $rows = pos_q("SELECT id, name FROM businesses WHERE id = ? LIMIT 1", "s", [$id]);
  if (!$rows) throw new Exception("Shop not found");
  return $rows[0];
}

function pos_dispatch_backup($path, $method, $body, $bid, $branchId, $uid, $auth) {
  if (!pos_can($auth["user"], "settings")) {
    pos_send(403, ["error" => "You do not have permission for this module"]);
  }
  if ($path === "backup" && $method === "GET") {
    $payload = pos_backup_build($bid);
    pos_backup_send_json_file(pos_backup_filename($payload["business"] ?? []), $payload);
  }
  if (($path === "backup/restore" || $path === "backup") && $method === "POST") {
    pos_send(200, pos_backup_restore($bid, $body, $auth));
  }
  if ($path === "backup/clean" && $method === "POST") {
    $password = (string) ($body["password"] ?? "");
    if ($password === "") pos_send(400, ["error" => "Your login password is required", "php" => true]);
    $rows = pos_q("SELECT id, password_hash FROM staff_users WHERE id = ? LIMIT 1", "s", [$uid]);
    $user = $rows[0] ?? null;
    if (!$user || !pos_verify_password($password, $user["password_hash"] ?? "")) {
      pos_send(401, ["error" => "Login password is incorrect", "php" => true]);
    }
    $out = pos_clean_shop_data($bid);
    pos_staff_audit($auth["user"], "Shop data cleaned", [
      "module" => "settings",
      "tables" => $out["tables"] ?? 0,
    ], $bid, $branchId);
    pos_send(200, [
      "ok" => true,
      "tables" => $out["tables"] ?? 0,
      "note" => "Sales, stock, items, and customers were removed. Login, branches, devices, and shop settings were kept.",
      "php" => true,
    ]);
  }
  return false;
}

function pos_backup_email_hours() {
  return [6, 10, 14, 18, 22];
}

function pos_backup_email_max_bytes() {
  return 12 * 1024 * 1024;
}

function pos_backup_email_parts($now = null) {
  try {
    $tz = new DateTimeZone("Asia/Kolkata");
  } catch (Exception $e) {
    $tz = new DateTimeZone("UTC");
  }
  $dt = $now instanceof DateTimeInterface ? clone $now : new DateTime("now", $tz);
  if ($dt->getTimezone()->getName() !== "Asia/Kolkata") {
    try { $dt->setTimezone(new DateTimeZone("Asia/Kolkata")); } catch (Exception $e) { /* keep */ }
  }
  $hour = (int) $dt->format("G");
  $day = $dt->format("Y-m-d");
  $hh = $dt->format("H");
  $hours = pos_backup_email_hours();
  return [
    "day" => $day,
    "hour" => $hour,
    "hh" => $hh,
    "slot" => in_array($hour, $hours, true) ? $day . "T" . $hh : null,
  ];
}

function pos_backup_email_filename($parts = null) {
  $parts = $parts ?: pos_backup_email_parts();
  return "spicepos-platform-backup-" . str_replace("-", "", $parts["day"]) . "-" . $parts["hh"] . ".json.gz";
}

function pos_backup_strip_data_images($json) {
  return preg_replace('#data:image/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\\s]+#', "", (string) $json);
}

function pos_backup_format_bytes($n) {
  $bytes = (int) $n;
  if ($bytes < 1024) return $bytes . " B";
  if ($bytes < 1024 * 1024) return number_format($bytes / 1024, 1) . " KB";
  return number_format($bytes / (1024 * 1024), 1) . " MB";
}

function pos_backup_email_map() {
  try {
    $rows = pos_q(
      "SELECT setting_key, setting_value FROM platform_settings
       WHERE setting_key IN ('alert_backup_email','backup_email_to','backup_email_last_slot','backup_email_last_error','smtp_user','support_email')"
    );
  } catch (Exception $e) {
    return [];
  }
  $map = [];
  foreach ($rows as $r) $map[$r["setting_key"]] = $r["setting_value"] ?? "";
  return $map;
}

function pos_backup_email_valid($value) {
  $to = trim((string) $value);
  return $to !== "" && preg_match("/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/", $to) ? $to : "";
}

function pos_backup_email_recipient($map = null) {
  $map = $map !== null ? $map : pos_backup_email_map();
  $support = function_exists("pos_platform_settings") ? pos_platform_settings() : [];
  return pos_backup_email_valid($map["backup_email_to"] ?? "")
    ?: pos_backup_email_valid($support["support_email"] ?? "")
    ?: pos_backup_email_valid($map["smtp_user"] ?? "")
    ?: "pos@atavtelecom.in";
}

function pos_backup_email_enabled($map = null) {
  $map = $map !== null ? $map : pos_backup_email_map();
  $v = strtolower(trim((string) ($map["alert_backup_email"] ?? "1")));
  return !in_array($v, ["0", "false", "no", "off"], true);
}

function pos_backup_email_status() {
  $map = pos_backup_email_map();
  $parts = pos_backup_email_parts();
  return [
    "enabled" => pos_backup_email_enabled($map) ? "1" : "0",
    "to" => $map["backup_email_to"] ?? "",
    "fallback_to" => pos_backup_email_recipient($map),
    "last_slot" => $map["backup_email_last_slot"] ?? "",
    "last_error" => $map["backup_email_last_error"] ?? "",
    "hours" => pos_backup_email_hours(),
    "next_slot" => $parts["slot"],
    "timezone" => "Asia/Kolkata",
    "php" => true,
  ];
}

function pos_save_backup_email_settings($body) {
  if (array_key_exists("enabled", $body) || array_key_exists("alert_backup_email", $body)) {
    $raw = $body["enabled"] ?? $body["alert_backup_email"];
    $on = !in_array(strtolower(trim((string) $raw)), ["0", "false", "no", "off", ""], true);
    if ($raw === true || $raw === 1 || $raw === "1" || $raw === "on") $on = true;
    if ($raw === false || $raw === 0 || $raw === "0") $on = false;
    pos_set_setting("alert_backup_email", $on ? "1" : "0");
  }
  if (array_key_exists("to", $body) || array_key_exists("backup_email_to", $body)) {
    $to = trim((string) ($body["to"] ?? $body["backup_email_to"] ?? ""));
    if ($to !== "" && !pos_backup_email_valid($to)) throw new Exception("Enter a valid backup email address");
    pos_set_setting("backup_email_to", $to);
  }
  return pos_backup_email_status();
}

function pos_backup_prepare_email_attachment($payload) {
  $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
  if ($json === false) throw new Exception("Could not encode backup");
  $gz = gzencode($json, 9);
  if ($gz === false) throw new Exception("Could not compress backup");
  $stripped = false;
  $max = pos_backup_email_max_bytes();
  if (strlen($gz) > $max) {
    $json = pos_backup_strip_data_images($json);
    $gz = gzencode($json, 9);
    $stripped = true;
    if ($gz === false) throw new Exception("Could not compress backup");
  }
  $parts = pos_backup_email_parts();
  return [
    "tooLarge" => strlen($gz) > $max,
    "stripped" => $stripped,
    "bytes" => strlen($gz),
    "filename" => pos_backup_email_filename($parts),
    "content" => $gz,
    "mimeType" => "application/gzip",
  ];
}

function pos_backup_email_message($att, $parts, $force) {
  $when = $parts["day"] . " " . $parts["hh"] . ":00 IST";
  $subject = "ATAV POS platform backup · " . $when;
  $size = pos_backup_format_bytes($att["bytes"] ?? 0);
  $name = $att["filename"] ?? pos_backup_email_filename($parts);
  if (!empty($att["tooLarge"])) {
    $body = "The gzipped backup was {$size}, which is too large to attach. Download it from Master Admin → Backup.";
  } else {
    $body = "Attachment: {$name} ({$size}). Restore from Master Admin → Backup.";
  }
  $extra = !empty($att["stripped"]) ? "\nItem photos were omitted so the file would fit in email." : "";
  $mode = $force ? "Sent manually from Master Admin." : "Automatic backup (five times a day).";
  $text = "ATAV POS platform backup\n\nTime: {$when}\n{$mode}\n{$body}{$extra}\n\nKeep this file private. It can restore every shop on the platform.\n\n— ATAV Telecom POS";
  $htmlExtra = !empty($att["stripped"]) ? "<br>Item photos were omitted so the file would fit in email." : "";
  $htmlBody = !empty($att["tooLarge"])
    ? "The gzipped backup was {$size}, which is too large to attach. Download it from Master Admin → Backup."
    : "Attachment: <code>{$name}</code> ({$size}). Restore from Master Admin → Backup.";
  $html = "<p><strong>ATAV POS platform backup</strong></p><p>Time: {$when}<br>{$mode}</p><p>{$htmlBody}{$htmlExtra}</p><p>Keep this file private. It can restore every shop on the platform.</p><p>— ATAV Telecom POS</p>";
  return ["subject" => $subject, "text" => $text, "html" => $html];
}

function pos_log_backup_email($to, $subject, $text, $result) {
  $ok = !empty($result["ok"]);
  $skipped = !empty($result["skipped"]);
  if (function_exists("pos_log_alert_deliveries")) {
    pos_log_alert_deliveries(
      ["kind" => "backup", "businessId" => "", "shopName" => "Platform"],
      $subject,
      $text,
      ["ok" => false, "skipped" => true],
      [["ok" => $ok, "skipped" => $skipped, "to" => $to, "error" => $result["error"] ?? "", "detail" => $result["detail"] ?? ""]]
    );
    return;
  }
  try {
    pos_q(
      "INSERT INTO alert_delivery_logs
       (id, channel, kind, business_id, shop_name, recipient, subject, preview, status, ok, error, detail)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      "ssssssssssss",
      [
        pos_uuid(),
        "email",
        "backup",
        "",
        "Platform",
        (string) $to,
        substr((string) $subject, 0, 255),
        substr((string) $text, 0, 400),
        $ok ? "sent" : ($skipped ? "skipped" : "failed"),
        $ok ? "1" : "0",
        substr((string) ($result["error"] ?? ""), 0, 255),
        substr((string) ($result["detail"] ?? $result["error"] ?? ""), 0, 255),
      ]
    );
  } catch (Throwable $e) {
    error_log("backup email log failed: " . $e->getMessage());
  }
}

function pos_backup_email_lock($acquire) {
  try {
    if ($acquire) {
      $rows = pos_q("SELECT GET_LOCK('pos_backup_email', 0) AS g");
      return (int) ($rows[0]["g"] ?? 0) === 1;
    }
    pos_q("SELECT RELEASE_LOCK('pos_backup_email')");
  } catch (Exception $e) {
    return !$acquire;
  }
  return true;
}

function pos_run_backup_email($force = false) {
  $parts = pos_backup_email_parts();
  $slot = $parts["slot"];
  if (!$force && $slot === null) return ["skipped" => true, "reason" => "off-slot"];
  if (!pos_backup_email_lock(true)) return ["skipped" => true, "reason" => "busy"];
  try {
    $map = pos_backup_email_map();
    if (!$force && !pos_backup_email_enabled($map)) return ["skipped" => true, "reason" => "disabled"];
    if (!$force && $slot && ($map["backup_email_last_slot"] ?? "") === $slot) {
      return ["skipped" => true, "reason" => "already"];
    }
    $to = pos_backup_email_recipient($map);
    if ($to === "") return ["ok" => false, "error" => "No backup email recipient"];
    if ($slot) pos_set_setting("backup_email_last_slot", $slot);
    pos_backup_prepare();
    @set_time_limit(180);
    $payload = pos_backup_build_platform();
    $att = pos_backup_prepare_email_attachment($payload);
    $msg = pos_backup_email_message($att, $parts, $force);
    $attachments = !empty($att["tooLarge"]) ? [] : [[
      "filename" => $att["filename"],
      "content" => $att["content"],
      "mimeType" => $att["mimeType"],
    ]];
    $mail = pos_send_mail($to, $msg["subject"], $msg["text"], $msg["html"], "", $attachments, 60);
    if (!empty($mail["ok"])) pos_set_setting("backup_email_last_error", "");
    else pos_set_setting("backup_email_last_error", substr((string) ($mail["error"] ?? "send failed"), 0, 255));
    $mail["detail"] = !empty($att["tooLarge"]) ? "no-attachment" : ($att["filename"] ?? "");
    pos_log_backup_email($to, $msg["subject"], $msg["text"], $mail);
    return $mail + [
      "to" => $to,
      "slot" => $slot ?: ($parts["day"] . "T" . $parts["hh"]),
      "bytes" => $att["bytes"],
      "attached" => empty($att["tooLarge"]) && !empty($mail["ok"]),
      "php" => true,
    ];
  } catch (Throwable $e) {
    try { pos_set_setting("backup_email_last_error", substr($e->getMessage(), 0, 255)); } catch (Throwable $ignore) { /* ignore */ }
    return ["ok" => false, "error" => $e->getMessage(), "php" => true];
  } finally {
    pos_backup_email_lock(false);
  }
}

function pos_tick_backup_email() {
  return pos_run_backup_email(false);
}

function pos_send_backup_email_now() {
  return pos_run_backup_email(true);
}

function pos_dispatch_master_backup($path, $method, $body, $auth) {
  $shopId = trim((string) ($_GET["business_id"] ?? $body["business_id"] ?? ""));
  $admin = $auth["admin"] ?? ["id" => "master", "email" => "master"];
  if ($path === "master/backup" && $method === "GET") {
    $biz = pos_backup_require_shop($shopId);
    $payload = pos_backup_build($biz["id"]);
    pos_backup_send_json_file(pos_backup_filename($payload["business"] ?? $biz), $payload);
  }
  if (($path === "master/backup/restore" || $path === "master/backup") && $method === "POST") {
    $biz = pos_backup_require_shop($shopId !== "" ? $shopId : ($body["business_id"] ?? ""));
    pos_send(200, pos_backup_restore($biz["id"], $body, $auth, $admin));
  }
  if ($path === "master/backup/platform" && $method === "GET") {
    $payload = pos_backup_build_platform();
    pos_backup_send_json_file(pos_backup_platform_filename(), $payload);
  }
  if (($path === "master/backup/platform/restore" || $path === "master/backup/platform") && $method === "POST") {
    pos_send(200, pos_backup_restore_platform($body, $admin));
  }
  if ($path === "master/backup/email/settings" && $method === "POST") {
    pos_send(200, pos_save_backup_email_settings($body));
  }
  if ($path === "master/backup/email" && $method === "GET") {
    pos_send(200, pos_backup_email_status());
  }
  if ($path === "master/backup/email" && $method === "POST") {
    $out = pos_send_backup_email_now();
    if (empty($out["ok"]) && empty($out["skipped"])) pos_send(400, $out);
    pos_send(200, $out);
  }
  return false;
}
