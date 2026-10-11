<?php
function pos_bar_ensure() {
  $db = pos_db();
  $db->query("CREATE TABLE IF NOT EXISTS bar_products (id VARCHAR(255) PRIMARY KEY, name VARCHAR(180) NOT NULL, brand VARCHAR(120) NULL, category VARCHAR(64) NOT NULL DEFAULT 'Whisky', pack_type VARCHAR(32) NOT NULL DEFAULT 'bottle', bottle_ml DECIMAL(12,2) NOT NULL DEFAULT 750, barcode VARCHAR(64) NULL, price_peg30 DECIMAL(12,2) NOT NULL DEFAULT 0, price_peg60 DECIMAL(12,2) NOT NULL DEFAULT 0, price_quarter DECIMAL(12,2) NOT NULL DEFAULT 0, price_half DECIMAL(12,2) NOT NULL DEFAULT 0, price_bottle DECIMAL(12,2) NOT NULL DEFAULT 0, cost_bottle DECIMAL(12,2) NOT NULL DEFAULT 0, on_hand_ml DECIMAL(14,2) NOT NULL DEFAULT 0, low_stock_ml DECIMAL(14,2) NOT NULL DEFAULT 0, batch_no VARCHAR(64) NULL, expiry_date DATE NULL, gst_rate DECIMAL(8,2) NOT NULL DEFAULT 0, status VARCHAR(16) NOT NULL DEFAULT 'active', business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), INDEX (business_id), INDEX (category), INDEX (barcode))");
  $db->query("CREATE TABLE IF NOT EXISTS bar_movements (id VARCHAR(255) PRIMARY KEY, product_id VARCHAR(255) NOT NULL, kind VARCHAR(32) NOT NULL, qty_ml DECIMAL(14,2) NOT NULL DEFAULT 0, note VARCHAR(255) NULL, ref_id VARCHAR(255) NULL, user_id VARCHAR(255) NULL, user_name VARCHAR(180) NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (business_id), INDEX (product_id))");
  $db->query("CREATE TABLE IF NOT EXISTS bar_tables (id VARCHAR(255) PRIMARY KEY, name VARCHAR(80) NOT NULL, seats INT NOT NULL DEFAULT 4, floor VARCHAR(64) NULL, service_type VARCHAR(32) NOT NULL DEFAULT 'dine-in', status VARCHAR(16) NOT NULL DEFAULT 'free', hold_json MEDIUMTEXT NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (business_id))");
  $db->query("CREATE TABLE IF NOT EXISTS bar_sales (id VARCHAR(255) PRIMARY KEY, bill_no VARCHAR(32) NOT NULL, table_id VARCHAR(255) NULL, table_name VARCHAR(80) NULL, service_type VARCHAR(32) NOT NULL DEFAULT 'dine-in', method VARCHAR(32) NOT NULL DEFAULT 'cash', item_gross DECIMAL(12,2) NOT NULL DEFAULT 0, item_discount DECIMAL(12,2) NOT NULL DEFAULT 0, bill_discount DECIMAL(12,2) NOT NULL DEFAULT 0, tax DECIMAL(12,2) NOT NULL DEFAULT 0, total DECIMAL(12,2) NOT NULL DEFAULT 0, cogs DECIMAL(12,2) NOT NULL DEFAULT 0, profit DECIMAL(12,2) NOT NULL DEFAULT 0, status VARCHAR(16) NOT NULL DEFAULT 'paid', void_reason VARCHAR(255) NULL, cashier_id VARCHAR(255) NULL, cashier_name VARCHAR(180) NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (business_id), INDEX (created_at))");
  $db->query("CREATE TABLE IF NOT EXISTS bar_sale_lines (id VARCHAR(255) PRIMARY KEY, sale_id VARCHAR(255) NOT NULL, product_id VARCHAR(255) NULL, name VARCHAR(180) NOT NULL, brand VARCHAR(120) NULL, category VARCHAR(64) NULL, serve VARCHAR(16) NOT NULL, qty DECIMAL(10,2) NOT NULL DEFAULT 1, serve_ml DECIMAL(12,2) NOT NULL DEFAULT 0, unit_price DECIMAL(12,2) NOT NULL DEFAULT 0, discount DECIMAL(12,2) NOT NULL DEFAULT 0, tax DECIMAL(12,2) NOT NULL DEFAULT 0, total DECIMAL(12,2) NOT NULL DEFAULT 0, cogs DECIMAL(12,2) NOT NULL DEFAULT 0, business_id VARCHAR(255) NOT NULL, INDEX (sale_id), INDEX (business_id))");
  $db->query("CREATE TABLE IF NOT EXISTS bar_settings (business_id VARCHAR(255) PRIMARY KEY, settings_json MEDIUMTEXT NULL, updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3))");
  $db->query("CREATE TABLE IF NOT EXISTS bar_audit (id VARCHAR(255) PRIMARY KEY, action VARCHAR(64) NOT NULL, detail VARCHAR(500) NULL, user_id VARCHAR(255) NULL, user_name VARCHAR(180) NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (business_id))");
}

function pos_bar_clip($v, $n) {
  return substr(trim((string) $v), 0, (int) $n);
}

function pos_bar_num($v, $fallback = 0) {
  return is_numeric($v) ? (float) $v : (float) $fallback;
}

function pos_bar_flag($v) {
  return ($v === true || $v === 1 || $v === "1" || $v === "on" || $v === "true") ? 1 : 0;
}

function pos_bar_round2($n) {
  return round((float) $n, 2);
}

function pos_bar_assert($bid) {
  $rows = pos_q("SELECT * FROM businesses WHERE id=? LIMIT 1", "s", [$bid]);
  $biz = $rows[0] ?? null;
  if (!$biz || !pos_is_bar_shop($biz)) {
    pos_send(403, ["error" => "Bar model is not enabled for this shop"]);
  }
  return $biz;
}

function pos_bar_defaults() {
  return [
    "license_no" => "",
    "license_state" => "",
    "license_expires" => "",
    "open_hour" => "11:00",
    "close_hour" => "23:30",
    "peg30_ml" => 30,
    "peg60_ml" => 60,
    "allow_peg" => 1,
    "allow_quarter" => 1,
    "allow_half" => 1,
    "allow_bottle" => 1,
    "tax_rate" => 18,
    "invoice_title" => "Bar Invoice",
    "min_age" => 21,
    "regulated" => 1,
    "allow_after_hours" => 0,
  ];
}

function pos_bar_settings($bid) {
  $rows = pos_q("SELECT settings_json FROM bar_settings WHERE business_id=?", "s", [$bid]);
  $parsed = [];
  if (!empty($rows[0]["settings_json"])) {
    $decoded = json_decode($rows[0]["settings_json"], true);
    if (is_array($decoded)) $parsed = $decoded;
  }
  return array_merge(pos_bar_defaults(), $parsed);
}

function pos_bar_save_settings($bid, $body) {
  $cur = pos_bar_settings($bid);
  $next = array_merge($cur, [
    "license_no" => pos_bar_clip($body["license_no"] ?? $cur["license_no"], 80),
    "license_state" => pos_bar_clip($body["license_state"] ?? $cur["license_state"], 64),
    "license_expires" => pos_bar_clip($body["license_expires"] ?? $cur["license_expires"], 10),
    "open_hour" => pos_bar_clip($body["open_hour"] ?? $cur["open_hour"], 8) ?: "11:00",
    "close_hour" => pos_bar_clip($body["close_hour"] ?? $cur["close_hour"], 8) ?: "23:30",
    "peg30_ml" => pos_bar_num($body["peg30_ml"] ?? $cur["peg30_ml"], 30),
    "peg60_ml" => pos_bar_num($body["peg60_ml"] ?? $cur["peg60_ml"], 60),
    "allow_peg" => pos_bar_flag($body["allow_peg"] ?? $cur["allow_peg"]),
    "allow_quarter" => pos_bar_flag($body["allow_quarter"] ?? $cur["allow_quarter"]),
    "allow_half" => pos_bar_flag($body["allow_half"] ?? $cur["allow_half"]),
    "allow_bottle" => pos_bar_flag($body["allow_bottle"] ?? $cur["allow_bottle"]),
    "tax_rate" => pos_bar_num($body["tax_rate"] ?? $cur["tax_rate"], 18),
    "invoice_title" => pos_bar_clip($body["invoice_title"] ?? $cur["invoice_title"], 80) ?: "Bar Invoice",
    "min_age" => pos_bar_num($body["min_age"] ?? $cur["min_age"], 21),
    "regulated" => pos_bar_flag($body["regulated"] ?? $cur["regulated"]),
    "allow_after_hours" => pos_bar_flag($body["allow_after_hours"] ?? $cur["allow_after_hours"]),
  ]);
  pos_q("INSERT INTO bar_settings (business_id, settings_json) VALUES (?,?) ON DUPLICATE KEY UPDATE settings_json=VALUES(settings_json)", "ss", [$bid, json_encode($next)]);
  return $next;
}

function pos_bar_serve_ml($product, $serve, $settings) {
  $bottle = pos_bar_num($product["bottle_ml"] ?? 750, 750);
  if ($bottle <= 0) $bottle = 750;
  $id = strtolower((string) $serve);
  if ($id === "peg30") return pos_bar_num($settings["peg30_ml"] ?? 30, 30);
  if ($id === "peg60") return pos_bar_num($settings["peg60_ml"] ?? 60, 60);
  if ($id === "quarter") return pos_bar_round2($bottle * 0.25);
  if ($id === "half") return pos_bar_round2($bottle * 0.5);
  return $bottle;
}

function pos_bar_serve_price($product, $serve, $settings) {
  $map = ["peg30" => "price_peg30", "peg60" => "price_peg60", "quarter" => "price_quarter", "half" => "price_half", "bottle" => "price_bottle"];
  $key = $map[strtolower((string) $serve)] ?? "price_bottle";
  $explicit = pos_bar_num($product[$key] ?? 0);
  if ($explicit > 0) return pos_bar_round2($explicit);
  $full = pos_bar_num($product["price_bottle"] ?? 0);
  $ml = pos_bar_serve_ml($product, $serve, $settings);
  $bottle = pos_bar_num($product["bottle_ml"] ?? 750, 750);
  if ($full <= 0 || $bottle <= 0) return 0;
  return pos_bar_round2($full * ($ml / $bottle));
}

function pos_bar_line($product, $serve, $qty, $discount, $settings) {
  $units = max(0, pos_bar_num($qty, 0));
  $unit = pos_bar_serve_price($product, $serve, $settings);
  $gross = pos_bar_round2($unit * $units);
  $disc = pos_bar_round2(min($gross, max(0, pos_bar_num($discount))));
  $taxable = pos_bar_round2(max(0, $gross - $disc));
  $rate = pos_bar_num($product["gst_rate"] ?? 0);
  if ($rate <= 0) $rate = pos_bar_num($settings["tax_rate"] ?? 0);
  $tax = pos_bar_round2($taxable * ($rate / 100));
  $used = pos_bar_round2(pos_bar_serve_ml($product, $serve, $settings) * $units);
  $cost = pos_bar_num($product["cost_bottle"] ?? 0);
  $bottle = pos_bar_num($product["bottle_ml"] ?? 750, 750);
  $cogs = $bottle > 0 ? pos_bar_round2($cost * ($used / $bottle)) : 0;
  return [
    "serve" => strtolower((string) $serve) ?: "bottle",
    "qty" => $units,
    "unit_price" => $unit,
    "gross" => $gross,
    "discount" => $disc,
    "tax" => $tax,
    "total" => pos_bar_round2($taxable + $tax),
    "serve_ml" => $used,
    "cogs" => $cogs,
    "profit" => pos_bar_round2($taxable - $cogs),
  ];
}

function pos_bar_totals($lines, $billDiscount) {
  $gross = 0; $disc = 0; $taxRaw = 0; $cogs = 0;
  foreach ($lines as $l) {
    $gross += pos_bar_num($l["gross"] ?? 0);
    $disc += pos_bar_num($l["discount"] ?? 0);
    $taxRaw += pos_bar_num($l["tax"] ?? 0);
    $cogs += pos_bar_num($l["cogs"] ?? 0);
  }
  $extra = max(0, pos_bar_num($billDiscount));
  $preTaxable = pos_bar_round2(max(0, $gross - $disc));
  $taxable = pos_bar_round2(max(0, $preTaxable - $extra));
  $tax = $preTaxable > 0 ? pos_bar_round2($taxRaw * ($taxable / $preTaxable)) : 0;
  return [
    "item_gross" => pos_bar_round2($gross),
    "item_discount" => pos_bar_round2($disc),
    "bill_discount" => pos_bar_round2($extra),
    "taxable" => $taxable,
    "tax" => $tax,
    "total" => pos_bar_round2($taxable + $tax),
    "cogs" => pos_bar_round2($cogs),
    "profit" => pos_bar_round2($taxable - $cogs),
  ];
}

function pos_bar_parse_minutes($hhmm) {
  if (!preg_match('/^(\d{1,2}):(\d{2})$/', trim((string) $hhmm), $m)) return null;
  $h = (int) $m[1];
  $min = (int) $m[2];
  if ($h > 23 || $min > 59) return null;
  return $h * 60 + $min;
}

function pos_bar_in_hours($settings, $now = null) {
  $open = pos_bar_parse_minutes($settings["open_hour"] ?? "");
  $close = pos_bar_parse_minutes($settings["close_hour"] ?? "");
  if ($open === null || $close === null) return true;
  if (!$now instanceof DateTime) {
    $tz = function_exists("pos_shop_timezone") ? (pos_shop_timezone() ?: "Asia/Kolkata") : "Asia/Kolkata";
    $now = new DateTime("now", new DateTimeZone($tz));
  }
  $cur = ((int) $now->format("H")) * 60 + (int) $now->format("i");
  if ($open === $close) return true;
  if ($close > $open) return $cur >= $open && $cur < $close;
  return $cur >= $open || $cur < $close;
}

function pos_bar_today() {
  if (function_exists("pos_shop_timezone")) {
    return (new DateTime("now", new DateTimeZone(pos_shop_timezone() ?: "Asia/Kolkata")))->format("Y-m-d");
  }
  return date("Y-m-d");
}

function pos_bar_can_operate($settings, $today = null) {
  $regulated = pos_bar_flag($settings["regulated"] ?? 1);
  $exp = substr((string) ($settings["license_expires"] ?? ""), 0, 10);
  $day = $today ?: pos_bar_today();
  if ($regulated && $exp !== "" && $exp < $day) {
    return ["ok" => false, "reason" => "License expired on $exp"];
  }
  if ($regulated && !pos_bar_flag($settings["allow_after_hours"] ?? 0) && !pos_bar_in_hours($settings)) {
    return ["ok" => false, "reason" => "Sales allowed " . ($settings["open_hour"] ?? "") . "–" . ($settings["close_hour"] ?? "")];
  }
  return ["ok" => true];
}

function pos_bar_can_discount($auth) {
  $role = (string) ($auth["user"]["role"] ?? "");
  $perms = $auth["user"]["permissions"] ?? [];
  if (!empty($perms["discount"])) return true;
  return in_array($role, ["business_admin", "branch_manager", "manager"], true);
}

function pos_bar_can_void($auth) {
  $role = (string) ($auth["user"]["role"] ?? "");
  return in_array($role, ["business_admin", "branch_manager", "manager"], true);
}

function pos_bar_can_stock($auth) {
  $role = (string) ($auth["user"]["role"] ?? "");
  return in_array($role, ["business_admin", "branch_manager", "manager", "stock_manager"], true);
}

function pos_bar_audit($bid, $auth, $action, $detail) {
  $user = $auth["user"] ?? [];
  pos_q("INSERT INTO bar_audit (id, action, detail, user_id, user_name, business_id) VALUES (?,?,?,?,?,?)", "ssssss", [
    pos_uuid(), pos_bar_clip($action, 64), pos_bar_clip($detail, 500), $user["id"] ?? "", pos_bar_clip($user["name"] ?? ($user["email"] ?? ""), 180), $bid
  ]);
}

function pos_bar_seed($bid) {
  $have = pos_q("SELECT id FROM bar_products WHERE business_id=? LIMIT 1", "s", [$bid]);
  if (!$have) {
    $seed = [
      ["Johnnie Walker Black Label", "Johnnie Walker", "Whisky", "bottle", 750, 220, 400, 950, 1800, 3400, 2200, 1500, 375, "BAR-WHISKY-JWB"],
      ["Old Monk", "Old Monk", "Rum", "bottle", 750, 90, 160, 380, 720, 1350, 750, 2250, 375, "BAR-RUM-OM"],
      ["Smirnoff", "Smirnoff", "Vodka", "bottle", 750, 120, 220, 520, 980, 1850, 1100, 1500, 375, "BAR-VODKA-SM"],
      ["Kingfisher Strong", "Kingfisher", "Beer", "bottle", 650, 0, 0, 0, 0, 180, 95, 6500, 1300, "BAR-BEER-KF"],
      ["Sula Red", "Sula", "Wine", "bottle", 750, 0, 0, 280, 520, 980, 520, 1500, 375, "BAR-WINE-SULA"],
      ["Classic Mojito", "House", "Cocktails", "mixer", 300, 0, 0, 0, 0, 320, 90, 3000, 300, "BAR-CKTL-MOJ"],
      ["Coca-Cola", "Coca-Cola", "Soft Drinks", "can", 330, 0, 0, 0, 0, 60, 28, 6600, 990, "BAR-SOFT-COKE"],
    ];
    foreach ($seed as $p) {
      pos_q(
        "INSERT INTO bar_products (id, name, brand, category, pack_type, bottle_ml, price_peg30, price_peg60, price_quarter, price_half, price_bottle, cost_bottle, on_hand_ml, low_stock_ml, barcode, business_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        "sssssdddddddddss",
        [pos_uuid(), $p[0], $p[1], $p[2], $p[3], $p[4], $p[5], $p[6], $p[7], $p[8], $p[9], $p[10], $p[11], $p[12], $p[13], $bid]
      );
    }
  }
  $tables = pos_q("SELECT id FROM bar_tables WHERE business_id=? LIMIT 1", "s", [$bid]);
  if (!$tables) {
    foreach ([["Bar 1", 4, "Bar"], ["Bar 2", 4, "Bar"], ["Bar 3", 6, "Bar"], ["High Top 1", 2, "Bar"], ["High Top 2", 2, "Bar"], ["Lounge A", 8, "Lounge"], ["Lounge B", 8, "Lounge"], ["Takeaway", 0, "Counter"]] as $t) {
      pos_q("INSERT INTO bar_tables (id, name, seats, floor, service_type, business_id) VALUES (?,?,?,?,?,?)", "ssisss", [pos_uuid(), $t[0], $t[1], $t[2], $t[0] === "Takeaway" ? "takeaway" : "dine-in", $bid]);
    }
  }
}

function pos_bar_products($bid, $q, $category) {
  $sql = "SELECT * FROM bar_products WHERE business_id=? AND status='active'";
  $types = "s";
  $args = [$bid];
  if ($category !== "") {
    $sql .= " AND category=?";
    $types .= "s";
    $args[] = $category;
  }
  if ($q !== "") {
    $sql .= " AND (name LIKE ? OR brand LIKE ? OR barcode LIKE ? OR category LIKE ?)";
    $like = "%" . $q . "%";
    $types .= "ssss";
    array_push($args, $like, $like, $like, $like);
  }
  $sql .= " ORDER BY category, name";
  return pos_q($sql, $types, $args);
}

function pos_bar_low($p) {
  $on = pos_bar_num($p["on_hand_ml"] ?? 0);
  $low = pos_bar_num($p["low_stock_ml"] ?? 0);
  return $low > 0 ? $on <= $low : $on <= 0;
}

function pos_bar_reports() {
  return [
    ["id" => "bar-sales-daily", "title" => "Daily sales"],
    ["id" => "bar-sales-weekly", "title" => "Weekly sales"],
    ["id" => "bar-sales-monthly", "title" => "Monthly sales"],
    ["id" => "bar-sales-product", "title" => "Product-wise sales"],
    ["id" => "bar-sales-brand", "title" => "Brand-wise sales"],
    ["id" => "bar-sales-category", "title" => "Category-wise sales"],
    ["id" => "bar-consumption", "title" => "Bottle / peg consumption"],
    ["id" => "bar-stock", "title" => "Opening vs closing stock"],
    ["id" => "bar-variance", "title" => "Purchase, wastage, breakage, variance"],
    ["id" => "bar-collection", "title" => "Cashier / payment collection"],
    ["id" => "bar-profit", "title" => "Gross sales, tax, COGS, profit"],
    ["id" => "bar-tables", "title" => "Table-wise sales"],
    ["id" => "bar-top", "title" => "Top-selling products"],
  ];
}

function pos_bar_cards($stats) {
  return [
    ["id" => "today", "label" => "Today's bar sales", "value" => $stats["todaySales"] ?? 0, "money" => true],
    ["id" => "bills", "label" => "Bills today", "value" => $stats["todayBills"] ?? 0],
    ["id" => "pegs", "label" => "Pegs served", "value" => $stats["todayPegs"] ?? 0],
    ["id" => "bottles", "label" => "Bottles sold", "value" => $stats["todayBottles"] ?? 0],
    ["id" => "open", "label" => "Open tables", "value" => $stats["openTables"] ?? 0],
    ["id" => "pending", "label" => "Pending payments", "value" => $stats["pendingPay"] ?? 0, "money" => true],
    ["id" => "low", "label" => "Low stock", "value" => $stats["lowStock"] ?? 0],
    ["id" => "expiry", "label" => "Expiry alerts", "value" => $stats["expiryAlerts"] ?? 0],
    ["id" => "profit", "label" => "Est. gross profit", "value" => $stats["todayProfit"] ?? 0, "money" => true],
  ];
}

function pos_bar_staff_dispatch($path, $method, $body, $bid, $auth) {
  if (strpos($path, "bar/") !== 0) return false;
  pos_bar_ensure();
  pos_bar_assert($bid);
  pos_bar_seed($bid);
  $body = is_array($body) ? $body : [];
  try {
    if ($path === "bar/board" && $method === "GET") {
      $today = pos_bar_today();
      $sales = pos_q("SELECT COALESCE(SUM(total),0) sales, COUNT(*) bills, COALESCE(SUM(profit),0) profit FROM bar_sales WHERE business_id=? AND status='paid' AND DATE(created_at)=?", "ss", [$bid, $today]);
      $pegs = pos_q("SELECT COALESCE(SUM(l.qty),0) n FROM bar_sale_lines l JOIN bar_sales s ON s.id=l.sale_id WHERE l.business_id=? AND s.status='paid' AND DATE(s.created_at)=? AND l.serve IN ('peg30','peg60')", "ss", [$bid, $today]);
      $bottles = pos_q("SELECT COALESCE(SUM(l.qty),0) n FROM bar_sale_lines l JOIN bar_sales s ON s.id=l.sale_id WHERE l.business_id=? AND s.status='paid' AND DATE(s.created_at)=? AND l.serve='bottle'", "ss", [$bid, $today]);
      $open = pos_q("SELECT COUNT(*) n FROM bar_tables WHERE business_id=? AND status='busy'", "s", [$bid]);
      $holds = pos_q("SELECT hold_json FROM bar_tables WHERE business_id=? AND status='busy'", "s", [$bid]);
      $pendingPay = 0;
      foreach ($holds as $h) {
        $hold = json_decode($h["hold_json"] ?? "{}", true) ?: [];
        $pendingPay += pos_bar_num($hold["total"] ?? 0);
      }
      $products = pos_bar_products($bid, "", "");
      $low = [];
      $exp = [];
      foreach ($products as $p) {
        if (pos_bar_low($p)) $low[] = $p;
        $ex = substr((string) ($p["expiry_date"] ?? ""), 0, 10);
        if ($ex !== "" && $ex !== "0000-00-00" && $ex <= date("Y-m-d", strtotime("+30 days"))) $exp[] = $p;
      }
      $stats = [
        "todaySales" => (float) ($sales[0]["sales"] ?? 0),
        "todayBills" => (int) ($sales[0]["bills"] ?? 0),
        "todayProfit" => (float) ($sales[0]["profit"] ?? 0),
        "todayPegs" => (float) ($pegs[0]["n"] ?? 0),
        "todayBottles" => (float) ($bottles[0]["n"] ?? 0),
        "openTables" => (int) ($open[0]["n"] ?? 0),
        "pendingPay" => pos_bar_round2($pendingPay),
        "lowStock" => count($low),
        "expiryAlerts" => count($exp),
      ];
      pos_send(200, ["stats" => $stats, "cards" => pos_bar_cards($stats), "lowStock" => $low, "expiring" => $exp, "reports" => pos_bar_reports()]);
    }
    if ($path === "bar/settings" && $method === "GET") {
      pos_send(200, pos_bar_settings($bid));
    }
    if ($path === "bar/settings" && $method === "POST") {
      $saved = pos_bar_save_settings($bid, $body);
      pos_bar_audit($bid, $auth, "settings", "Updated bar settings");
      pos_send(200, $saved);
    }
    if ($path === "bar/products" && $method === "GET") {
      pos_send(200, pos_bar_products($bid, pos_bar_clip($_GET["q"] ?? "", 80), pos_bar_clip($_GET["category"] ?? "", 64)));
    }
    if ($path === "bar/products" && $method === "POST") {
      $id = pos_bar_clip($body["id"] ?? "", 64) ?: pos_uuid();
      $exists = pos_q("SELECT id FROM bar_products WHERE id=? AND business_id=?", "ss", [$id, $bid]);
      $vals = [
        pos_bar_clip($body["name"] ?? "Bar item", 180),
        pos_bar_clip($body["brand"] ?? "", 120),
        pos_bar_clip($body["category"] ?? "Whisky", 64),
        pos_bar_clip($body["pack_type"] ?? "bottle", 32),
        pos_bar_num($body["bottle_ml"] ?? 750, 750),
        pos_bar_clip($body["barcode"] ?? "", 64),
        pos_bar_num($body["price_peg30"] ?? 0),
        pos_bar_num($body["price_peg60"] ?? 0),
        pos_bar_num($body["price_quarter"] ?? 0),
        pos_bar_num($body["price_half"] ?? 0),
        pos_bar_num($body["price_bottle"] ?? 0),
        pos_bar_num($body["cost_bottle"] ?? 0),
        pos_bar_num($body["on_hand_ml"] ?? 0),
        pos_bar_num($body["low_stock_ml"] ?? 0),
        pos_bar_clip($body["batch_no"] ?? "", 64),
        pos_bar_clip($body["expiry_date"] ?? "", 10),
        pos_bar_num($body["gst_rate"] ?? 0),
        pos_bar_clip($body["status"] ?? "active", 16) ?: "active",
      ];
      if ($exists) {
        pos_q("UPDATE bar_products SET name=?, brand=?, category=?, pack_type=?, bottle_ml=?, barcode=?, price_peg30=?, price_peg60=?, price_quarter=?, price_half=?, price_bottle=?, cost_bottle=?, on_hand_ml=?, low_stock_ml=?, batch_no=?, expiry_date=NULLIF(?, ''), gst_rate=?, status=? WHERE id=? AND business_id=?", "ssssdsddddddddssdsss", array_merge($vals, [$id, $bid]));
      } else {
        pos_q("INSERT INTO bar_products (id, name, brand, category, pack_type, bottle_ml, barcode, price_peg30, price_peg60, price_quarter, price_half, price_bottle, cost_bottle, on_hand_ml, low_stock_ml, batch_no, expiry_date, gst_rate, status, business_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULLIF(?, ''),?,?,?,?)", "sssssdsddddddddssdss", array_merge([$id], $vals, [$bid]));
      }
      pos_bar_audit($bid, $auth, "product", ($exists ? "Updated " : "Added ") . $vals[0]);
      pos_send(200, ["ok" => true, "id" => $id]);
    }
    if ($path === "bar/stock" && $method === "GET") {
      $products = pos_bar_products($bid, "", "");
      $movements = pos_q("SELECT m.*, p.name product_name FROM bar_movements m LEFT JOIN bar_products p ON p.id=m.product_id WHERE m.business_id=? ORDER BY m.created_at DESC LIMIT 80", "s", [$bid]);
      pos_send(200, ["products" => $products, "movements" => $movements]);
    }
    if ($path === "bar/movements" && $method === "POST") {
      if (!pos_bar_can_stock($auth)) pos_send(403, ["error" => "Stock adjustments need manager or stock permission"]);
      $productId = pos_bar_clip($body["product_id"] ?? "", 64);
      $kind = pos_bar_clip($body["kind"] ?? "adjust", 32);
      $qty = pos_bar_num($body["qty_ml"] ?? 0);
      $prod = pos_q("SELECT * FROM bar_products WHERE id=? AND business_id=?", "ss", [$productId, $bid]);
      if (!$prod) throw new Exception("Product not found");
      $sign = in_array($kind, ["opening", "purchase", "transfer_in", "return"], true) ? 1 : (in_array($kind, ["wastage", "breakage", "transfer_out", "sale"], true) ? -1 : 1);
      $delta = $kind === "adjust" ? $qty : $sign * abs($qty);
      $next = max(0, pos_bar_num($prod[0]["on_hand_ml"]) + $delta);
      pos_q("UPDATE bar_products SET on_hand_ml=? WHERE id=? AND business_id=?", "dss", [$next, $productId, $bid]);
      pos_q("INSERT INTO bar_movements (id, product_id, kind, qty_ml, note, user_name, business_id) VALUES (?,?,?,?,?,?,?)", "sssdsss", [pos_uuid(), $productId, $kind, $delta, pos_bar_clip($body["note"] ?? "", 255), pos_bar_clip($auth["user"]["name"] ?? "", 180), $bid]);
      pos_bar_audit($bid, $auth, "stock", "$kind $delta ml");
      pos_send(200, ["ok" => true, "on_hand_ml" => $next]);
    }
    if ($path === "bar/tables" && $method === "GET") {
      $rows = pos_q("SELECT * FROM bar_tables WHERE business_id=? ORDER BY floor, name", "s", [$bid]);
      foreach ($rows as &$t) {
        $hold = json_decode($t["hold_json"] ?? "{}", true) ?: [];
        $t["hold"] = $hold;
        $t["pending"] = (float) ($hold["total"] ?? 0);
        $t["status"] = !empty($hold["lines"]) ? "busy" : ($t["status"] ?: "free");
      }
      pos_send(200, $rows);
    }
    if ($path === "bar/tables" && $method === "POST") {
      $id = pos_bar_clip($body["id"] ?? "", 64) ?: pos_uuid();
      $name = pos_bar_clip($body["name"] ?? "Bar table", 80);
      $seats = (int) ($body["seats"] ?? 4);
      $floor = pos_bar_clip($body["floor"] ?? "Bar", 64);
      $service = pos_bar_clip($body["service_type"] ?? "dine-in", 32);
      $exists = pos_q("SELECT id FROM bar_tables WHERE id=? AND business_id=?", "ss", [$id, $bid]);
      if ($exists) pos_q("UPDATE bar_tables SET name=?, seats=?, floor=?, service_type=? WHERE id=? AND business_id=?", "sissss", [$name, $seats, $floor, $service, $id, $bid]);
      else pos_q("INSERT INTO bar_tables (id, name, seats, floor, service_type, business_id) VALUES (?,?,?,?,?,?)", "ssisss", [$id, $name, $seats, $floor, $service, $bid]);
      pos_send(200, ["ok" => true, "id" => $id]);
    }
    if (preg_match("#^bar/tables/([^/]+)/hold$#", $path, $mm) && $method === "POST") {
      $settings = pos_bar_settings($bid);
      $priced = [];
      foreach (($body["lines"] ?? []) as $line) {
        $prod = pos_q("SELECT * FROM bar_products WHERE id=? AND business_id=?", "ss", [pos_bar_clip($line["product_id"] ?? "", 64), $bid]);
        if (!$prod) throw new Exception("Unknown product");
        $row = pos_bar_line($prod[0], $line["serve"] ?? "bottle", $line["qty"] ?? 1, $line["discount"] ?? 0, $settings);
        $priced[] = array_merge($row, ["product_id" => $prod[0]["id"], "name" => $prod[0]["name"]]);
      }
      $tot = pos_bar_totals($priced, 0);
      $hold = [
        "lines" => $body["lines"] ?? [],
        "priced" => $priced,
        "total" => $tot["total"],
        "service_type" => pos_bar_clip($body["service_type"] ?? "dine-in", 32),
      ];
      pos_q("UPDATE bar_tables SET status='busy', hold_json=? WHERE id=? AND business_id=?", "sss", [json_encode($hold), $mm[1], $bid]);
      pos_send(200, ["ok" => true, "hold" => $hold]);
    }
    if ($path === "bar/tables/transfer" && $method === "POST") {
      $from = pos_q("SELECT * FROM bar_tables WHERE id=? AND business_id=?", "ss", [pos_bar_clip($body["from_id"] ?? "", 64), $bid]);
      $to = pos_q("SELECT id FROM bar_tables WHERE id=? AND business_id=?", "ss", [pos_bar_clip($body["to_id"] ?? "", 64), $bid]);
      if (!$from || !$to) throw new Exception("Table not found");
      pos_q("UPDATE bar_tables SET status='busy', hold_json=? WHERE id=? AND business_id=?", "sss", [$from[0]["hold_json"], $body["to_id"], $bid]);
      pos_q("UPDATE bar_tables SET status='free', hold_json=NULL WHERE id=? AND business_id=?", "ss", [$body["from_id"], $bid]);
      pos_bar_audit($bid, $auth, "table", "Transferred order");
      pos_send(200, ["ok" => true]);
    }
    if (preg_match("#^bar/tables/([^/]+)/split$#", $path, $mm) && $method === "POST") {
      $tbl = pos_q("SELECT * FROM bar_tables WHERE id=? AND business_id=?", "ss", [$mm[1], $bid]);
      if (!$tbl) throw new Exception("Table not found");
      $hold = json_decode($tbl[0]["hold_json"] ?? "{}", true) ?: [];
      $lines = $hold["lines"] ?? [];
      $pick = array_map("intval", $body["indexes"] ?? []);
      $a = []; $b = [];
      foreach ($lines as $i => $line) {
        if (in_array($i, $pick, true)) $a[] = $line; else $b[] = $line;
      }
      $holdB = $hold; $holdB["lines"] = $b;
      $holdA = $hold; $holdA["lines"] = $a;
      pos_q("UPDATE bar_tables SET hold_json=? WHERE id=? AND business_id=?", "sss", [json_encode($holdB), $mm[1], $bid]);
      pos_q("INSERT INTO bar_tables (id, name, seats, floor, service_type, status, hold_json, business_id) VALUES (?,?,?,?,?,'busy',?,?)", "ssissss", [pos_uuid(), $tbl[0]["name"] . " B", (int) $tbl[0]["seats"], $tbl[0]["floor"], $tbl[0]["service_type"], json_encode($holdA), $bid]);
      pos_send(200, ["ok" => true]);
    }
    if ($path === "bar/tables/combine" && $method === "POST") {
      $a = pos_q("SELECT * FROM bar_tables WHERE id=? AND business_id=?", "ss", [pos_bar_clip($body["a_id"] ?? "", 64), $bid]);
      $b = pos_q("SELECT * FROM bar_tables WHERE id=? AND business_id=?", "ss", [pos_bar_clip($body["b_id"] ?? "", 64), $bid]);
      if (!$a || !$b) throw new Exception("Table not found");
      $ha = json_decode($a[0]["hold_json"] ?? "{}", true) ?: [];
      $hb = json_decode($b[0]["hold_json"] ?? "{}", true) ?: [];
      $ha["lines"] = array_merge($ha["lines"] ?? [], $hb["lines"] ?? []);
      pos_q("UPDATE bar_tables SET status='busy', hold_json=? WHERE id=? AND business_id=?", "sss", [json_encode($ha), $body["a_id"], $bid]);
      pos_q("UPDATE bar_tables SET status='free', hold_json=NULL WHERE id=? AND business_id=?", "ss", [$body["b_id"], $bid]);
      pos_send(200, ["ok" => true]);
    }
    if ($path === "bar/checkout" && $method === "POST") {
      $settings = pos_bar_settings($bid);
      $operate = pos_bar_can_operate($settings);
      if (empty($operate["ok"]) && !pos_bar_can_void($auth)) {
        throw new Exception($operate["reason"] ?? "Bar sales restricted");
      }
      if (pos_bar_num($body["bill_discount"] ?? 0) > 0 && !pos_bar_can_discount($auth)) {
        throw new Exception("Bill discount needs manager authorization");
      }
      $raw = $body["lines"] ?? [];
      if (!$raw) throw new Exception("Add at least one serve");
      $priced = [];
      $remaining = [];
      foreach ($raw as $line) {
        $prod = pos_q("SELECT * FROM bar_products WHERE id=? AND business_id=?", "ss", [pos_bar_clip($line["product_id"] ?? "", 64), $bid]);
        if (!$prod) throw new Exception("Unknown product");
        if (pos_bar_num($line["discount"] ?? 0) > 0 && !pos_bar_can_discount($auth)) throw new Exception("Item discount needs manager authorization");
        $id = $prod[0]["id"];
        if (!isset($remaining[$id])) $remaining[$id] = pos_bar_num($prod[0]["on_hand_ml"]);
        $live = $prod[0];
        $live["on_hand_ml"] = $remaining[$id];
        $row = pos_bar_line($live, $line["serve"] ?? "bottle", $line["qty"] ?? 1, $line["discount"] ?? 0, $settings);
        if ($remaining[$id] + 0.001 < $row["serve_ml"]) throw new Exception($live["name"] . ": Only " . $remaining[$id] . " ml left");
        $remaining[$id] = pos_bar_round2(max(0, $remaining[$id] - $row["serve_ml"]));
        $priced[] = ["product" => $live, "row" => $row, "remaining_ml" => $remaining[$id]];
      }
      $tot = pos_bar_totals(array_column($priced, "row"), $body["bill_discount"] ?? 0);
      $saleId = pos_uuid();
      $count = pos_q("SELECT COUNT(*) n FROM bar_sales WHERE business_id=?", "s", [$bid]);
      $billNo = "BAR-" . (1001 + (int) ($count[0]["n"] ?? 0));
      foreach ($priced as $line) {
        pos_q("UPDATE bar_products SET on_hand_ml=? WHERE id=? AND business_id=?", "dss", [$line["remaining_ml"], $line["product"]["id"], $bid]);
        pos_q("INSERT INTO bar_movements (id, product_id, kind, qty_ml, note, ref_id, user_name, business_id) VALUES (?,?,?,?,?,?,?,?)", "sssdssss", [pos_uuid(), $line["product"]["id"], "sale", -abs($line["row"]["serve_ml"]), $billNo, $saleId, pos_bar_clip($auth["user"]["name"] ?? "", 180), $bid]);
        pos_q("INSERT INTO bar_sale_lines (id, sale_id, product_id, name, brand, category, serve, qty, serve_ml, unit_price, discount, tax, total, cogs, business_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", "sssssssddddddds", [
          pos_uuid(), $saleId, $line["product"]["id"], $line["product"]["name"], $line["product"]["brand"], $line["product"]["category"], $line["row"]["serve"], $line["row"]["qty"], $line["row"]["serve_ml"], $line["row"]["unit_price"], $line["row"]["discount"], $line["row"]["tax"], $line["row"]["total"], $line["row"]["cogs"], $bid
        ]);
      }
      pos_q("INSERT INTO bar_sales (id, bill_no, table_id, table_name, service_type, method, item_gross, item_discount, bill_discount, tax, total, cogs, profit, cashier_id, cashier_name, business_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", "ssssssdddddddsss", [
        $saleId, $billNo, pos_bar_clip($body["table_id"] ?? "", 64), pos_bar_clip($body["table_name"] ?? "", 80), pos_bar_clip($body["service_type"] ?? "dine-in", 32), pos_bar_clip($body["method"] ?? "cash", 32),
        $tot["item_gross"], $tot["item_discount"], $tot["bill_discount"], $tot["tax"], $tot["total"], $tot["cogs"], $tot["profit"], $auth["user"]["id"] ?? "", pos_bar_clip($auth["user"]["name"] ?? "", 180), $bid
      ]);
      if (!empty($body["table_id"])) {
        pos_q("UPDATE bar_tables SET status='free', hold_json=NULL WHERE id=? AND business_id=?", "ss", [$body["table_id"], $bid]);
      }
      pos_bar_audit($bid, $auth, "sale", "$billNo {$tot["total"]}");
      $html = "<div class=\"bar-ticket\"><h3>" . htmlspecialchars($settings["invoice_title"]) . "</h3><p>$billNo</p><p>Total ₹" . $tot["total"] . "</p></div>";
      pos_send(200, array_merge($tot, ["id" => $saleId, "bill_no" => $billNo, "receipt_html" => $html]));
    }
    if (preg_match("#^bar/sales/([^/]+)/(void|refund)$#", $path, $mm) && $method === "POST") {
      if (!pos_bar_can_void($auth)) throw new Exception("Voids need manager authorization");
      $sale = pos_q("SELECT * FROM bar_sales WHERE id=? AND business_id=?", "ss", [$mm[1], $bid]);
      if (!$sale) throw new Exception("Bill not found");
      if (($sale[0]["status"] ?? "") !== "paid") throw new Exception("Bill is not open");
      $lines = pos_q("SELECT * FROM bar_sale_lines WHERE sale_id=? AND business_id=?", "ss", [$mm[1], $bid]);
      foreach ($lines as $line) {
        pos_q("UPDATE bar_products SET on_hand_ml = on_hand_ml + ? WHERE id=? AND business_id=?", "dss", [$line["serve_ml"], $line["product_id"], $bid]);
        pos_q("INSERT INTO bar_movements (id, product_id, kind, qty_ml, note, ref_id, business_id) VALUES (?,?,?,?,?,?,?)", "sssdsss", [pos_uuid(), $line["product_id"], "return", $line["serve_ml"], $mm[2] . " " . $sale[0]["bill_no"], $sale[0]["id"], $bid]);
      }
      $status = $mm[2] === "refund" ? "refunded" : "void";
      pos_q("UPDATE bar_sales SET status=?, void_reason=? WHERE id=? AND business_id=?", "ssss", [$status, pos_bar_clip($body["reason"] ?? $mm[2], 255), $mm[1], $bid]);
      pos_bar_audit($bid, $auth, $mm[2], $sale[0]["bill_no"]);
      pos_send(200, ["ok" => true]);
    }
    if (preg_match("#^bar/reports/([^/]+)$#", $path, $mm) && $method === "GET") {
      $id = $mm[1];
      $rows = [];
      if ($id === "bar-sales-daily" || $id === "bar-sales-weekly" || $id === "bar-sales-monthly") {
        $days = str_ends_with($id, "weekly") ? 7 : (str_ends_with($id, "monthly") ? 30 : 1);
        $rows = pos_q("SELECT DATE(created_at) day, COUNT(*) bills, SUM(total) sales, SUM(tax) tax, SUM(cogs) cogs, SUM(profit) profit FROM bar_sales WHERE business_id=? AND status='paid' AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY DATE(created_at) ORDER BY day DESC", "si", [$bid, $days]);
      } elseif ($id === "bar-sales-product") {
        $rows = pos_q("SELECT l.name, SUM(l.qty) qty, SUM(l.total) sales, SUM(l.serve_ml) ml FROM bar_sale_lines l JOIN bar_sales s ON s.id=l.sale_id WHERE l.business_id=? AND s.status='paid' GROUP BY l.name ORDER BY sales DESC LIMIT 80", "s", [$bid]);
      } elseif ($id === "bar-sales-brand") {
        $rows = pos_q("SELECT l.brand, SUM(l.qty) qty, SUM(l.total) sales FROM bar_sale_lines l JOIN bar_sales s ON s.id=l.sale_id WHERE l.business_id=? AND s.status='paid' GROUP BY l.brand ORDER BY sales DESC", "s", [$bid]);
      } elseif ($id === "bar-sales-category") {
        $rows = pos_q("SELECT l.category, SUM(l.qty) qty, SUM(l.total) sales FROM bar_sale_lines l JOIN bar_sales s ON s.id=l.sale_id WHERE l.business_id=? AND s.status='paid' GROUP BY l.category ORDER BY sales DESC", "s", [$bid]);
      } elseif ($id === "bar-consumption") {
        $rows = pos_q("SELECT l.serve, SUM(l.qty) qty, SUM(l.serve_ml) ml, SUM(l.total) sales FROM bar_sale_lines l JOIN bar_sales s ON s.id=l.sale_id WHERE l.business_id=? AND s.status='paid' GROUP BY l.serve ORDER BY ml DESC", "s", [$bid]);
      } elseif ($id === "bar-stock") {
        $rows = pos_q("SELECT name, brand, category, on_hand_ml, low_stock_ml, batch_no, expiry_date, cost_bottle FROM bar_products WHERE business_id=? ORDER BY name", "s", [$bid]);
      } elseif ($id === "bar-variance") {
        $rows = pos_q("SELECT kind, SUM(qty_ml) ml, COUNT(*) n FROM bar_movements WHERE business_id=? GROUP BY kind ORDER BY kind", "s", [$bid]);
      } elseif ($id === "bar-collection") {
        $rows = pos_q("SELECT cashier_name, method, COUNT(*) bills, SUM(total) collected FROM bar_sales WHERE business_id=? AND status='paid' GROUP BY cashier_name, method", "s", [$bid]);
      } elseif ($id === "bar-profit") {
        $rows = pos_q("SELECT DATE(created_at) day, SUM(item_gross) gross, SUM(item_discount+bill_discount) discounts, SUM(tax) tax, SUM(cogs) cogs, SUM(profit) profit FROM bar_sales WHERE business_id=? AND status='paid' GROUP BY DATE(created_at) ORDER BY day DESC LIMIT 40", "s", [$bid]);
      } elseif ($id === "bar-tables") {
        $rows = pos_q("SELECT table_name, COUNT(*) bills, SUM(total) sales FROM bar_sales WHERE business_id=? AND status='paid' GROUP BY table_name ORDER BY sales DESC", "s", [$bid]);
      } elseif ($id === "bar-top") {
        $rows = pos_q("SELECT l.name, l.brand, l.category, SUM(l.qty) qty, SUM(l.total) sales FROM bar_sale_lines l JOIN bar_sales s ON s.id=l.sale_id WHERE l.business_id=? AND s.status='paid' GROUP BY l.name, l.brand, l.category ORDER BY qty DESC LIMIT 20", "s", [$bid]);
      }
      pos_send(200, ["id" => $id, "rows" => $rows]);
    }
    if ($path === "bar/audit" && $method === "GET") {
      pos_send(200, pos_q("SELECT * FROM bar_audit WHERE business_id=? ORDER BY created_at DESC LIMIT 120", "s", [$bid]));
    }
  } catch (Exception $e) {
    pos_send(400, ["error" => $e->getMessage()]);
  }
  return false;
}
