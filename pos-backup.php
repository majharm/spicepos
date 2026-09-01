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
  if (preg_match('/_lines$/', $name) || in_array($name, ["pack_items", "branch_stocks", "journal_lines", "stock_movements"], true)) {
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

function pos_backup_insert_row($table, $row) {
  $allowed = pos_backup_columns($table);
  $cols = [];
  $vals = [];
  foreach ($row as $k => $v) {
    if (!isset($allowed[$k])) continue;
    $cols[] = $k;
    $vals[] = $v;
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
        foreach ($tables[$t] as $row) {
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
        foreach ($tables[$t] as $row) {
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
  return false;
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
  return false;
}
