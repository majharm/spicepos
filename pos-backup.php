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

function pos_backup_schema_name() {
  $db = pos_db();
  $res = $db->query("SELECT DATABASE()");
  if (!$res) return "";
  $row = $res->fetch_row();
  $res->free();
  return (string) ($row[0] ?? "");
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
  $skip = pos_backup_skip_tables();
  $out = [];
  foreach ($rows as $row) {
    $t = (string) ($row["t"] ?? "");
    if ($t === "" || isset($skip[$t])) continue;
    $out[] = $t;
  }
  return $out;
}

function pos_backup_table_rank($name) {
  if (preg_match('/_lines$/', $name) || in_array($name, ["pack_items", "branch_stocks", "journal_lines", "stock_movements"], true)) {
    return 0;
  }
  if ($name === "staff_users") return 2;
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
  $safe = str_replace("`", "", $table);
  $res = $db->query("SHOW COLUMNS FROM `{$safe}`");
  $cols = [];
  if ($res) {
    while ($row = $res->fetch_assoc()) $cols[$row["Field"]] = true;
    $res->free();
  }
  $cache[$table] = $cols;
  return $cols;
}

function pos_backup_filename($business) {
  $name = preg_replace("/[^a-zA-Z0-9]+/", "-", (string) ($business["name"] ?? "shop"));
  $name = trim($name, "-") ?: "shop";
  return "spicepos-backup-" . strtolower($name) . "-" . date("Ymd-His") . ".json";
}

function pos_backup_build($bid) {
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
  $safe = str_replace("`", "", $table);
  $colSql = "`" . implode("`,`", $cols) . "`";
  $ph = implode(",", array_fill(0, count($cols), "?"));
  $types = str_repeat("s", count($cols));
  pos_q("INSERT INTO `{$safe}` ({$colSql}) VALUES ({$ph})", $types, $vals);
}

function pos_backup_restore($bid, $payload, $auth) {
  if (!is_array($payload) || ($payload["kind"] ?? "") !== "spicepos-shop-backup") {
    throw new Exception("Not a SpicePOS shop backup file");
  }
  if (($payload["business_id"] ?? "") !== $bid) {
    throw new Exception("This backup belongs to another shop");
  }
  $tables = $payload["tables"] ?? [];
  if (!is_array($tables) || !$tables) throw new Exception("Backup has no tables");
  $known = pos_backup_biz_tables();
  $knownMap = array_fill_keys($known, true);
  $names = array_values(array_filter(array_keys($tables), function ($t) use ($knownMap) {
    return isset($knownMap[$t]);
  }));
  $deleteOrder = pos_backup_sort_tables($names, false);
  $insertOrder = pos_backup_sort_tables($names, true);
  pos_with_transaction(function () use ($bid, $tables, $deleteOrder, $insertOrder) {
    foreach ($deleteOrder as $t) {
      $safe = str_replace("`", "", $t);
      pos_q("DELETE FROM `{$safe}` WHERE business_id = ?", "s", [$bid]);
    }
    foreach ($insertOrder as $t) {
      foreach ($tables[$t] as $row) {
        if (!is_array($row)) continue;
        $row["business_id"] = $bid;
        pos_backup_insert_row($t, $row);
      }
    }
  });
  pos_staff_audit($auth["user"], "Shop backup restored", [
    "module" => "settings",
    "target_id" => $bid,
    "target_name" => $payload["business"]["name"] ?? "shop",
    "tables" => count($names),
  ], $bid, $auth["branchId"] ?? $auth["user"]["branch_id"] ?? null);
  return ["ok" => true, "tables" => count($names), "php" => true];
}

function pos_dispatch_backup($path, $method, $body, $bid, $branchId, $uid, $auth) {
  if (!pos_can($auth["user"], "settings")) {
    pos_send(403, ["error" => "You do not have permission for this module"]);
  }
  if ($path === "backup" && $method === "GET") {
    $payload = pos_backup_build($bid);
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
    if ($json === false) throw new Exception("Could not encode backup");
    $biz = $payload["business"] ?? [];
    pos_send_file(200, "application/json; charset=utf-8", pos_backup_filename($biz), $json);
  }
  if (($path === "backup/restore" || $path === "backup") && $method === "POST") {
    pos_send(200, pos_backup_restore($bid, $body, $auth));
  }
  return false;
}
