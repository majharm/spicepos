<?php

function pos_default_unit_masters() {
  return [
    ["PCS", "Piece", "count", "/pc", "pcs", 1, 1, 1, 1],
    ["NOS", "Number", "count", "/no", "nos", 1, 1, 1, 2],
    ["UNT", "Unit", "count", "/unit", "units", 1, 1, 1, 3],
    ["PR", "Pair", "count", "/pr", "pr", 1, 1, 1, 4],
    ["SET", "Set", "count", "/set", "set", 1, 1, 1, 5],
    ["DOZ", "Dozen", "count", "/doz", "doz", 1, 1, 1, 6],
    ["GRS", "Gross", "count", "/grs", "grs", 1, 1, 1, 7],
    ["HDOZ", "Half Dozen", "count", "/hdoz", "hdoz", 1, 1, 1, 8],
    ["MG", "Milligram", "count", "/mg", "mg", 1, 1, 1, 9],
    ["G", "Gram", "weight", "/kg", "g", 1, 1000, 1, 10],
    ["GM", "Grams (g)", "weight", "/kg", "g", 1, 1000, 1, 11],
    ["KG", "Kilogram", "weight", "/kg", "kg", 1, 1000, 1000, 12],
    ["QTL", "Quintal", "count", "/qtl", "qtl", 1, 1, 1, 13],
    ["TON", "Metric Ton", "count", "/ton", "ton", 1, 1, 1, 14],
    ["LB", "Pound", "count", "/lb", "lb", 1, 1, 1, 15],
    ["OZ", "Ounce", "count", "/oz", "oz", 1, 1, 1, 16],
    ["MM", "Millimeter", "length", "/mm", "mm", 1, 1, 1, 17],
    ["CM", "Centimeter", "length", "/cm", "cm", 1, 1, 1, 18],
    ["M", "Meter", "length", "/m", "m", 1, 1, 1, 19],
    ["KM", "Kilometer", "length", "/km", "km", 1, 1, 1, 20],
    ["IN", "Inch", "length", "/in", "in", 1, 1, 1, 21],
    ["FT", "Foot", "length", "/ft", "ft", 1, 1, 1, 22],
    ["YD", "Yard", "length", "/yd", "yd", 1, 1, 1, 23],
    ["MI", "Mile", "length", "/mi", "mi", 1, 1, 1, 24],
    ["SQMM", "Square Millimeter", "area", "/sqmm", "sqmm", 1, 1, 1, 25],
    ["SQCM", "Square Centimeter", "area", "/sqcm", "sqcm", 1, 1, 1, 26],
    ["SQM", "Square Meter", "area", "/sqm", "sqm", 1, 1, 1, 27],
    ["SQIN", "Square Inch", "area", "/sqin", "sqin", 1, 1, 1, 28],
    ["SQFT", "Square Foot", "area", "/sqft", "sqft", 1, 1, 1, 29],
    ["SQYD", "Square Yard", "area", "/sqyd", "sqyd", 1, 1, 1, 30],
    ["ACRE", "Acre", "area", "/acre", "acre", 1, 1, 1, 31],
    ["HA", "Hectare", "area", "/ha", "ha", 1, 1, 1, 32],
    ["ML", "Millilitre", "volume", "/ltr", "ml", 1, 1000, 1, 33],
    ["L", "Litre", "volume", "/ltr", "L", 1, 1000, 1000, 34],
    ["LTR", "Litre (L)", "volume", "/ltr", "L", 1, 1000, 1000, 35],
    ["KL", "Kilolitre", "count", "/kl", "kl", 1, 1, 1, 36],
    ["CC", "Cubic Centimeter", "count", "/cc", "cc", 1, 1, 1, 37],
    ["CBM", "Cubic Meter", "count", "/cbm", "cbm", 1, 1, 1, 38],
    ["CFT", "Cubic Foot", "count", "/cft", "cft", 1, 1, 1, 39],
    ["GAL", "Gallon", "count", "/gal", "gal", 1, 1, 1, 40],
    ["BOX", "Box", "count", "/box", "box", 1, 1, 1, 41],
    ["CTN", "Carton", "count", "/ctn", "ctn", 1, 1, 1, 42],
    ["PKT", "Packet", "count", "/pkt", "pkt", 1, 1, 1, 43],
    ["PACK", "Pack", "count", "/pack", "pack", 1, 1, 1, 44],
    ["BAG", "Bag", "count", "/bag", "bag", 1, 1, 1, 45],
    ["BTL", "Bottle", "count", "/btl", "btl", 1, 1, 1, 46],
    ["JAR", "Jar", "count", "/jar", "jar", 1, 1, 1, 47],
    ["CAN", "Can", "count", "/can", "can", 1, 1, 1, 48],
    ["TIN", "Tin", "count", "/tin", "tin", 1, 1, 1, 49],
    ["TUBE", "Tube", "count", "/tube", "tube", 1, 1, 1, 50],
    ["PCH", "Pouch", "count", "/pch", "pch", 1, 1, 1, 51],
    ["BDL", "Bundle", "count", "/bdl", "bdl", 1, 1, 1, 52],
    ["ROLL", "Roll", "count", "/roll", "roll", 1, 1, 1, 53],
    ["CASE", "Case", "count", "/case", "case", 1, 1, 1, 54],
    ["CRT", "Crate", "count", "/crt", "crt", 1, 1, 1, 55],
    ["DRM", "Drum", "count", "/drm", "drm", 1, 1, 1, 56],
    ["BKT", "Bucket", "count", "/bkt", "bkt", 1, 1, 1, 57],
    ["SACK", "Sack", "count", "/sack", "sack", 1, 1, 1, 58],
    ["TAB", "Tablet", "count", "/tab", "tab", 1, 1, 1, 59],
    ["CAP", "Capsule", "count", "/cap", "cap", 1, 1, 1, 60],
    ["STRIP", "Strip", "count", "/strip", "strip", 1, 1, 1, 61],
    ["VIAL", "Vial", "count", "/vial", "vial", 1, 1, 1, 62],
    ["AMP", "Ampoule", "count", "/amp", "amp", 1, 1, 1, 63],
    ["INJ", "Injection", "count", "/inj", "inj", 1, 1, 1, 64],
    ["SACHET", "Sachet", "count", "/sachet", "sachet", 1, 1, 1, 65],
    ["DROP", "Dropper", "count", "/drop", "drop", 1, 1, 1, 66],
    ["INH", "Inhaler", "count", "/inh", "inh", 1, 1, 1, 67],
    ["SPRAY", "Spray", "count", "/spray", "spray", 1, 1, 1, 68],
    ["KIT", "Kit", "count", "/kit", "kit", 1, 1, 1, 69],
    ["PLT", "Plate", "count", "/plt", "plt", 1, 1, 1, 70],
    ["PORT", "Portion", "count", "/port", "port", 1, 1, 1, 71],
    ["SRV", "Serving", "count", "/srv", "srv", 1, 1, 1, 72],
    ["BOWL", "Bowl", "count", "/bowl", "bowl", 1, 1, 1, 73],
    ["CUP", "Cup", "count", "/cup", "cup", 1, 1, 1, 74],
    ["GLS", "Glass", "count", "/gls", "gls", 1, 1, 1, 75],
    ["HR", "Hour", "time", "/hr", "hrs", 1, 1, 1, 76],
    ["DAY", "Day", "time", "/day", "days", 1, 1, 1, 77],
    ["WEEK", "Week", "time", "/week", "weeks", 1, 1, 1, 78],
    ["MONTH", "Month", "time", "/month", "months", 1, 1, 1, 79],
    ["YEAR", "Year", "time", "/year", "years", 1, 1, 1, 80],
    ["VISIT", "Visit", "time", "/visit", "visits", 1, 1, 1, 81],
    ["JOB", "Job", "time", "/job", "jobs", 1, 1, 1, 82],
    ["SERVICE", "Service", "time", "/svc", "svc", 1, 1, 1, 83],
    ["SESSION", "Session", "time", "/session", "sessions", 1, 1, 1, 84],
    ["PROJECT", "Project", "time", "/project", "projects", 1, 1, 1, 85],
    ["CONSULT", "Consultation", "time", "/consult", "consults", 1, 1, 1, 86],
    ["APPT", "Appointment", "time", "/appt", "appts", 1, 1, 1, 87],
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
    @$db->query("UPDATE inventory_units SET step = 1 WHERE family IN ('weight', 'volume') AND step > 1");
  }
  if (!$bid) return;
  foreach (pos_default_unit_masters() as $row) {
    pos_q(
      "INSERT IGNORE INTO inventory_units (
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
    "GRAM" => "G", "GRAMS" => "G",
    "KILO" => "KG", "KILOGRAM" => "KG",
    "MILLILITRE" => "ML", "MILLILITER" => "ML",
    "LITRE" => "L", "LITER" => "L",
    "PCS" => "PCS", "PC" => "PCS", "QTY" => "PCS", "PIECE" => "PCS", "PIECES" => "PCS",
    "PAIR" => "PR",
    "TABLET" => "TAB", "CAPSULE" => "CAP",
    "HOUR" => "HR", "HOURS" => "HR",
  ];
  if (isset($alias[$key])) return $alias[$key];
  return $key !== "" ? $key : "PCS";
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
  if ($c === "PCS" || $c === "NOS" || $c === "UNT") return true;
  if (in_array($c, ["GM", "G", "KG", "ML", "L", "LTR"], true)) return false;
  $bid = is_array($item) ? ($item["business_id"] ?? null) : null;
  if ($bid) {
    $map = pos_unit_family_map($bid);
    if (isset($map[$c])) {
      $fam = $map[$c];
      return $fam !== "weight" && $fam !== "volume";
    }
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
  if (!in_array($family, ["weight", "volume", "count", "length", "area", "time"], true)) $family = "count";
  $rate = trim((string) ($body["rate_suffix"] ?? ""));
  $stock = trim((string) ($body["stock_suffix"] ?? ""));
  if ($rate === "") $rate = $family === "volume" ? "/ltr" : ($family === "weight" ? "/kg" : "/pc");
  if ($stock === "") $stock = $family === "volume" ? "ml" : ($family === "weight" ? "g" : "pcs");
  $step = (float) ($body["step"] ?? 1);
  $recv = (float) ($body["receive_qty"] ?? ($family === "count" ? 1 : 1000));
  $div = (float) ($body["display_div"] ?? (($code === "KG" || $code === "LTR" || $code === "L") ? 1000 : 1));
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
