<?php

function pos_default_unit_masters() {
  return [
    ["GM", "Grams (g)", "weight", "/kg", "g", 100, 1000, 1, 1],
    ["KG", "Kilogram (kg)", "weight", "/kg", "kg", 100, 1000, 1000, 2],
    ["ML", "Millilitre (ml)", "volume", "/ltr", "ml", 100, 1000, 1, 3],
    ["LTR", "Litre (L)", "volume", "/ltr", "L", 100, 1000, 1000, 4],
    ["PCS", "Quantity (pcs)", "count", "/pc", "pcs", 1, 1, 1, 5],
  ];
}

function pos_ensure_inventory_units_schema($bid = null) {
  static $ready = false;
  $db = pos_db();
  if (!$ready) {
    $ready = true;
    @$db->query(
      "CREATE TABLE IF NOT EXISTS inventory_units (
         id VARCHAR(255) PRIMARY KEY,
         business_id VARCHAR(255) NOT NULL,
         code VARCHAR(32) NOT NULL,
         name VARCHAR(128) NOT NULL,
         family VARCHAR(16) NOT NULL DEFAULT 'count',
         rate_suffix VARCHAR(16) NOT NULL DEFAULT '/pc',
         stock_suffix VARCHAR(16) NOT NULL DEFAULT 'pcs',
         step DECIMAL(14,3) NOT NULL DEFAULT 1,
         receive_qty DECIMAL(14,3) NOT NULL DEFAULT 1,
         display_div DECIMAL(14,3) NOT NULL DEFAULT 1,
         sort_order INT NOT NULL DEFAULT 0,
         status VARCHAR(16) NOT NULL DEFAULT 'active',
         UNIQUE KEY uniq_unit_biz_code (business_id, code),
         INDEX (business_id)
       )"
    );
  }
  if (!$bid) return;
  $n = pos_q("SELECT COUNT(*) AS c FROM inventory_units WHERE business_id = ?", "s", [$bid]);
  if ((int) ($n[0]["c"] ?? 0) > 0) return;
  foreach (pos_default_unit_masters() as $row) {
    pos_q(
      "INSERT INTO inventory_units (
         id, business_id, code, name, family, rate_suffix, stock_suffix, step, receive_qty, display_div, sort_order, status
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,'active')",
      "sssssssdddi",
      [pos_uuid(), $bid, $row[0], $row[1], $row[2], $row[3], $row[4], $row[5], $row[6], $row[7], $row[8]]
    );
  }
}

function pos_unit_code($raw) {
  $key = strtoupper(preg_replace("/[^A-Z0-9]/", "", (string) $raw));
  $alias = [
    "G" => "GM", "GRAM" => "GM", "GRAMS" => "GM", "GM" => "GM",
    "KG" => "KG", "KILO" => "KG", "KILOGRAM" => "KG",
    "ML" => "ML", "MILLILITRE" => "ML", "MILLILITER" => "ML",
    "L" => "LTR", "LTR" => "LTR", "LITRE" => "LTR", "LITER" => "LTR",
    "PCS" => "PCS", "PC" => "PCS", "QTY" => "PCS", "NOS" => "PCS", "NO" => "PCS",
    "COUNT" => "PCS", "UNIT" => "PCS", "UNITS" => "PCS",
  ];
  if (isset($alias[$key])) return $alias[$key];
  return $key !== "" ? $key : "GM";
}

function pos_unit_family_map($bid) {
  static $cache = [];
  if (isset($cache[$bid])) return $cache[$bid];
  $map = [];
  try {
    pos_ensure_inventory_units_schema($bid);
    foreach (pos_q("SELECT code, family FROM inventory_units WHERE business_id = ?", "s", [$bid]) as $row) {
      $map[strtoupper((string) $row["code"])] = strtolower((string) ($row["family"] ?? "count"));
    }
  } catch (Exception $e) { /* table optional */ }
  $cache[$bid] = $map;
  return $map;
}

function pos_unit_is_count($code, $item = null) {
  $c = pos_unit_code(is_array($item) ? ($item["base_unit"] ?? $item["unit"] ?? $code) : $code);
  if ($c === "PCS") return true;
  if (in_array($c, ["GM", "KG", "ML", "LTR"], true)) return false;
  $bid = is_array($item) ? ($item["business_id"] ?? null) : null;
  if ($bid) {
    $map = pos_unit_family_map($bid);
    if (isset($map[$c])) return $map[$c] === "count";
  }
  return true;
}

function pos_list_units($bid) {
  pos_ensure_inventory_units_schema($bid);
  return pos_q(
    "SELECT * FROM inventory_units WHERE business_id = ? ORDER BY sort_order, code",
    "s",
    [$bid]
  );
}

function pos_unit_payload($body) {
  $code = pos_unit_code($body["code"] ?? "");
  if ($code === "") throw new Exception("Unit code is required");
  $name = trim((string) ($body["name"] ?? $code));
  if ($name === "") $name = $code;
  $family = strtolower((string) ($body["family"] ?? "count"));
  if (!in_array($family, ["weight", "volume", "count"], true)) $family = "count";
  $rate = trim((string) ($body["rate_suffix"] ?? ""));
  $stock = trim((string) ($body["stock_suffix"] ?? ""));
  if ($rate === "") $rate = $family === "volume" ? "/ltr" : ($family === "weight" ? "/kg" : "/pc");
  if ($stock === "") $stock = $family === "volume" ? "ml" : ($family === "weight" ? "g" : "pcs");
  $step = (float) ($body["step"] ?? ($family === "count" ? 1 : 100));
  $recv = (float) ($body["receive_qty"] ?? ($family === "count" ? 1 : 1000));
  $div = (float) ($body["display_div"] ?? (($code === "KG" || $code === "LTR") ? 1000 : 1));
  if ($step <= 0) $step = 1;
  if ($recv <= 0) $recv = 1;
  if ($div <= 0) $div = 1;
  return [$code, $name, $family, $rate, $stock, $step, $recv, $div];
}

function pos_dispatch_units($path, $method, $body, $bid, $branchId, $uid, $auth) {
  if (!pos_can($auth["user"], "items") && !pos_can($auth["user"], "settings")) {
    pos_send(403, ["error" => "You do not have permission for this module"]);
  }
  pos_ensure_inventory_units_schema($bid);

  if ($path === "units" && $method === "GET") {
    pos_send(200, pos_list_units($bid));
  }

  if ($path === "units" && $method === "POST") {
    [$code, $name, $family, $rate, $stock, $step, $recv, $div] = pos_unit_payload($body);
    $exists = pos_q("SELECT id FROM inventory_units WHERE business_id = ? AND code = ? LIMIT 1", "ss", [$bid, $code]);
    if ($exists) pos_send(400, ["error" => "Unit code already exists"]);
    $id = pos_uuid();
    $sort = (int) ($body["sort_order"] ?? 99);
    pos_q(
      "INSERT INTO inventory_units (
         id, business_id, code, name, family, rate_suffix, stock_suffix, step, receive_qty, display_div, sort_order, status
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      "sssssssdddis",
      [$id, $bid, $code, $name, $family, $rate, $stock, $step, $recv, $div, $sort, ($body["status"] ?? "active")]
    );
    $rows = pos_q("SELECT * FROM inventory_units WHERE id = ? LIMIT 1", "s", [$id]);
    pos_send(200, ["ok" => true, "unit" => $rows[0] ?? null]);
  }

  if (preg_match('#^units/([^/]+)$#', $path, $m) && $method === "PUT") {
    $id = $m[1];
    [$code, $name, $family, $rate, $stock, $step, $recv, $div] = pos_unit_payload($body);
    $dup = pos_q("SELECT id FROM inventory_units WHERE business_id = ? AND code = ? AND id <> ? LIMIT 1", "sss", [$bid, $code, $id]);
    if ($dup) pos_send(400, ["error" => "Unit code already exists"]);
    pos_q(
      "UPDATE inventory_units SET code=?, name=?, family=?, rate_suffix=?, stock_suffix=?, step=?, receive_qty=?, display_div=?, status=?
       WHERE id=? AND business_id=?",
      "sssssdddsss",
      [$code, $name, $family, $rate, $stock, $step, $recv, $div, $body["status"] ?? "active", $id, $bid]
    );
    $rows = pos_q("SELECT * FROM inventory_units WHERE id = ? LIMIT 1", "s", [$id]);
    pos_send(200, ["ok" => true, "unit" => $rows[0] ?? null]);
  }

  if (preg_match('#^units/([^/]+)$#', $path, $m) && $method === "DELETE") {
    $id = $m[1];
    $row = pos_q("SELECT * FROM inventory_units WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$id, $bid]);
    if (!$row) pos_send(404, ["error" => "Unit not found"]);
    $code = $row[0]["code"];
    $used = pos_q(
      "SELECT COUNT(*) AS c FROM items WHERE business_id = ? AND (base_unit = ? OR unit = ?)",
      "sss",
      [$bid, $code, $code]
    );
    if ((int) ($used[0]["c"] ?? 0) > 0) pos_send(400, ["error" => "Unit is used on items"]);
    pos_q("DELETE FROM inventory_units WHERE id = ? AND business_id = ?", "ss", [$id, $bid]);
    pos_send(200, ["ok" => true]);
  }

  pos_send(404, ["error" => "Unknown units action"]);
}
