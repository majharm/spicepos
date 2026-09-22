<?php
function pos_print_ensure() {
  $db = pos_db();
  @$db->query("ALTER TABLE customers ADD COLUMN email VARCHAR(160) NULL");
  @$db->query("ALTER TABLE customers ADD COLUMN password_hash VARCHAR(255) NULL");
  $db->query("CREATE TABLE IF NOT EXISTS print_settings (business_id VARCHAR(255) PRIMARY KEY, settings_json MEDIUMTEXT NULL, updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3))");
  @$db->query("ALTER TABLE print_settings MODIFY settings_json MEDIUMTEXT NULL");
  $db->query("CREATE TABLE IF NOT EXISTS print_materials (id VARCHAR(255) PRIMARY KEY, business_id VARCHAR(255) NOT NULL, name VARCHAR(180) NOT NULL, price_model VARCHAR(16) NOT NULL DEFAULT 'sqft', rate DECIMAL(12,2) NOT NULL DEFAULT 0, pack_qty INT NOT NULL DEFAULT 1, gst_rate DECIMAL(8,2) NOT NULL DEFAULT 18, min_sqft DECIMAL(12,2) NOT NULL DEFAULT 0, active TINYINT NOT NULL DEFAULT 1, sort_order INT NOT NULL DEFAULT 0, INDEX (business_id))");
  $db->query("CREATE TABLE IF NOT EXISTS print_finishing (id VARCHAR(255) PRIMARY KEY, business_id VARCHAR(255) NOT NULL, name VARCHAR(180) NOT NULL, rate DECIMAL(12,2) NOT NULL DEFAULT 0, unit VARCHAR(16) NOT NULL DEFAULT 'job', gst_rate DECIMAL(8,2) NOT NULL DEFAULT 18, active TINYINT NOT NULL DEFAULT 1, INDEX (business_id))");
  $db->query("CREATE TABLE IF NOT EXISTS print_orders (id VARCHAR(255) PRIMARY KEY, order_number VARCHAR(32) NOT NULL, business_id VARCHAR(255) NOT NULL, branch_id VARCHAR(255) NULL, customer_id VARCHAR(255) NOT NULL, customer_name VARCHAR(180) NULL, customer_mobile VARCHAR(32) NULL, customer_email VARCHAR(160) NULL, product VARCHAR(80) NOT NULL, print_type VARCHAR(16) NOT NULL DEFAULT 'single', material_id VARCHAR(255) NULL, material_name VARCHAR(180) NULL, width DECIMAL(12,4) NOT NULL DEFAULT 0, height DECIMAL(12,4) NOT NULL DEFAULT 0, unit VARCHAR(16) NOT NULL DEFAULT 'ft', dpi INT NULL, area_sqft DECIMAL(14,4) NOT NULL DEFAULT 0, quantity INT NOT NULL DEFAULT 1, rate DECIMAL(12,2) NOT NULL DEFAULT 0, price_model VARCHAR(16) NOT NULL DEFAULT 'sqft', printing_amount DECIMAL(12,2) NOT NULL DEFAULT 0, finishing_amount DECIMAL(12,2) NOT NULL DEFAULT 0, delivery_amount DECIMAL(12,2) NOT NULL DEFAULT 0, other_charges DECIMAL(12,2) NOT NULL DEFAULT 0, discount DECIMAL(12,2) NOT NULL DEFAULT 0, gst DECIMAL(12,2) NOT NULL DEFAULT 0, gst_rate DECIMAL(8,2) NOT NULL DEFAULT 18, estimate_total DECIMAL(12,2) NOT NULL DEFAULT 0, quote_total DECIMAL(12,2) NOT NULL DEFAULT 0, paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0, balance_due DECIMAL(12,2) NOT NULL DEFAULT 0, pay_status VARCHAR(16) NOT NULL DEFAULT 'pending', status VARCHAR(32) NOT NULL DEFAULT 'pending_review', notes TEXT NULL, admin_notes TEXT NULL, approved_file_id VARCHAR(255) NULL, sales_order_id VARCHAR(255) NULL, staff_id VARCHAR(255) NULL, staff_name VARCHAR(180) NULL, urgent TINYINT NOT NULL DEFAULT 0, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), INDEX (business_id), INDEX (customer_id), INDEX (status))");
  $db->query("CREATE TABLE IF NOT EXISTS print_order_finishing (id VARCHAR(255) PRIMARY KEY, order_id VARCHAR(255) NOT NULL, finishing_id VARCHAR(255) NULL, name VARCHAR(180) NOT NULL, rate DECIMAL(12,2) NOT NULL DEFAULT 0, unit VARCHAR(16) NOT NULL DEFAULT 'job', amount DECIMAL(12,2) NOT NULL DEFAULT 0, business_id VARCHAR(255) NOT NULL, INDEX (order_id))");
  $db->query("CREATE TABLE IF NOT EXISTS print_files (id VARCHAR(255) PRIMARY KEY, order_id VARCHAR(255) NULL, business_id VARCHAR(255) NOT NULL, customer_id VARCHAR(255) NULL, version INT NOT NULL DEFAULT 1, file_name VARCHAR(255) NOT NULL, file_type VARCHAR(32) NULL, file_size INT NOT NULL DEFAULT 0, mime VARCHAR(80) NULL, width_px INT NULL, height_px INT NULL, status VARCHAR(24) NOT NULL DEFAULT 'uploaded', uploaded_by VARCHAR(24) NOT NULL DEFAULT 'customer', content LONGBLOB NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (order_id), INDEX (business_id))");
  $db->query("CREATE TABLE IF NOT EXISTS print_quotes (id VARCHAR(255) PRIMARY KEY, order_id VARCHAR(255) NOT NULL, business_id VARCHAR(255) NOT NULL, quote_json TEXT NULL, total DECIMAL(12,2) NOT NULL DEFAULT 0, status VARCHAR(16) NOT NULL DEFAULT 'sent', created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (order_id))");
  $db->query("CREATE TABLE IF NOT EXISTS print_status_history (id VARCHAR(255) PRIMARY KEY, order_id VARCHAR(255) NOT NULL, status VARCHAR(32) NOT NULL, staff_id VARCHAR(255) NULL, staff_name VARCHAR(180) NULL, note TEXT NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (order_id))");
  $db->query("CREATE TABLE IF NOT EXISTS print_payments (id VARCHAR(255) PRIMARY KEY, order_id VARCHAR(255) NOT NULL, customer_id VARCHAR(255) NULL, amount DECIMAL(12,2) NOT NULL DEFAULT 0, method VARCHAR(32) NOT NULL DEFAULT 'upi', kind VARCHAR(24) NOT NULL DEFAULT 'advance', status VARCHAR(16) NOT NULL DEFAULT 'paid', reference VARCHAR(80) NULL, receipt_no VARCHAR(32) NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (order_id))");
  $db->query("CREATE TABLE IF NOT EXISTS print_otps (id VARCHAR(255) PRIMARY KEY, email VARCHAR(160) NOT NULL, mobile VARCHAR(32) NULL, code_hash VARCHAR(255) NOT NULL, purpose VARCHAR(24) NOT NULL DEFAULT 'login', business_id VARCHAR(255) NOT NULL, expires_at TIMESTAMP(3) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (email))");
  $db->query("CREATE TABLE IF NOT EXISTS print_sessions (id VARCHAR(255) PRIMARY KEY, token_hash VARCHAR(64) NOT NULL, customer_id VARCHAR(255) NOT NULL, business_id VARCHAR(255) NOT NULL, expires_at TIMESTAMP(3) NOT NULL, INDEX (token_hash))");
  $db->query("CREATE TABLE IF NOT EXISTS print_notifications (id VARCHAR(255) PRIMARY KEY, kind VARCHAR(32) NOT NULL, channel VARCHAR(16) NOT NULL, customer_id VARCHAR(255) NULL, order_id VARCHAR(255) NULL, body TEXT NULL, status VARCHAR(16) NOT NULL DEFAULT 'queued', business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (business_id))");
}

function pos_print_seed($shop) {
  $n = pos_q("SELECT id FROM print_materials WHERE business_id=? LIMIT 1", "s", [$shop]);
  if ($n) return;
  $mats = [
    ["frontlit", "Frontlit Flex", "sqft", 18],
    ["backlit", "Backlit Flex", "sqft", 35],
    ["vinyl", "Vinyl", "sqft", 30],
    ["sunboard", "Sunboard", "sqft", 45],
    ["canvas", "Canvas", "sqft", 80],
    ["acp", "ACP", "sqft", 120],
  ];
  foreach ($mats as $i => $m) {
    pos_q("INSERT INTO print_materials (id, business_id, name, price_model, rate, gst_rate, active, sort_order) VALUES (?,?,?,?,?,18,1,?)", "ssssdi", [$shop . ":" . $m[0], $shop, $m[1], $m[2], $m[3], $i]);
  }
  foreach ([["eyelets", "Eyelets", 100], ["delivery", "Delivery", 50], ["lamination", "Lamination", 15]] as $f) {
    pos_q("INSERT INTO print_finishing (id, business_id, name, rate, unit, gst_rate, active) VALUES (?,?,?,?, 'job', 18, 1)", "sssd", [$shop . ":" . $f[0], $shop, $f[1], $f[2]]);
  }
}

function pos_print_portal_image($raw) {
  $s = trim((string) $raw);
  if ($s === "") return "";
  if (preg_match('#^data:image/(jpeg|jpg|png|webp|gif);base64,#i', $s) && strlen($s) <= 1200000) return $s;
  if (preg_match('#^(\./assets/|https?://)#i', $s)) return substr($s, 0, 500);
  throw new Exception("Use a JPG, PNG or WebP under 900 KB for the customer portal image");
}

function pos_print_settings($shop) {
  $rows = pos_q("SELECT settings_json FROM print_settings WHERE business_id=?", "s", [$shop]);
  $extra = [];
  if (!empty($rows[0]["settings_json"])) {
    $decoded = json_decode($rows[0]["settings_json"], true);
    if (is_array($decoded)) $extra = $decoded;
  }
  return array_merge([
    "max_file_mb" => 25,
    "allowed_types" => ["pdf", "jpg", "jpeg", "png", "svg", "ai", "eps", "cdr"],
    "min_dpi" => 72,
    "warn_dpi" => 150,
    "block_low_res" => false,
    "customer_approval_required" => true,
    "gst_rate" => 18,
    "min_order_amount" => 0,
    "min_billing_sqft" => 0,
    "urgent_charge" => 0,
    "round" => "near",
    "portal_login_image" => "",
  ], $extra);
}

function pos_print_save_settings($shop, $incoming) {
  if (!is_array($incoming)) return pos_print_settings($shop);
  $next = array_merge(pos_print_settings($shop), $incoming);
  if (array_key_exists("portal_login_image", $incoming)) {
    $next["portal_login_image"] = pos_print_portal_image($incoming["portal_login_image"]);
  }
  pos_q(
    "INSERT INTO print_settings (business_id, settings_json) VALUES (?,?) ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json)",
    "ss",
    [$shop, json_encode($next, JSON_UNESCAPED_UNICODE)]
  );
  return pos_print_settings($shop);
}

function pos_print_catalog_payload($shop) {
  return [
    "materials" => pos_q("SELECT * FROM print_materials WHERE business_id=?", "s", [$shop]),
    "finishing" => pos_q("SELECT * FROM print_finishing WHERE business_id=?", "s", [$shop]),
    "settings" => pos_print_settings($shop),
    "products" => ["Flex", "Banner", "Vinyl", "Sunboard", "Poster", "Sticker", "Canvas", "Hoarding", "Photo", "ACP", "One-Way Vision", "Visiting Card", "Brochure", "Other Custom Print"],
    "units" => [["id" => "ft", "label" => "Feet"], ["id" => "in", "label" => "Inches"], ["id" => "cm", "label" => "Centimeters"], ["id" => "mm", "label" => "Millimeters"], ["id" => "px", "label" => "Pixels"]],
    "sides" => [["id" => "single", "label" => "Single Side"], ["id" => "double", "label" => "Double Side"]],
    "dpis" => [72, 96, 150, 200, 300],
  ];
}

function pos_print_clip($v, $n) {
  return substr(trim((string) $v), 0, (int) $n);
}

function pos_print_digits($v) {
  return preg_replace("/\D/", "", (string) $v);
}

function pos_print_round2($n) {
  return round((float) $n, 2);
}

function pos_print_bearer() {
  $h = (string) ($_SERVER["HTTP_AUTHORIZATION"] ?? $_SERVER["REDIRECT_HTTP_AUTHORIZATION"] ?? "");
  if ($h === "" && function_exists("apache_request_headers")) {
    $headers = apache_request_headers();
    foreach ($headers as $k => $v) {
      if (strcasecmp((string) $k, "Authorization") === 0) {
        $h = (string) $v;
        break;
      }
    }
  }
  if (stripos($h, "Bearer ") === 0) return trim(substr($h, 7));
  return trim((string) ($_SERVER["HTTP_X_PRINT_TOKEN"] ?? $_GET["token"] ?? ""));
}

function pos_print_issue_session($customerId, $shop) {
  $token = bin2hex(random_bytes(24));
  pos_q(
    "INSERT INTO print_sessions (id, token_hash, customer_id, business_id, expires_at) VALUES (?,?,?,?, DATE_ADD(NOW(), INTERVAL 30 DAY))",
    "ssss",
    [pos_uuid(), hash("sha256", $token), $customerId, $shop]
  );
  return $token;
}

function pos_print_customer($shop) {
  $token = pos_print_bearer();
  if ($token === "") return null;
  $rows = pos_q(
    "SELECT s.customer_id FROM print_sessions s WHERE s.token_hash=? AND s.business_id=? AND s.expires_at > NOW() LIMIT 1",
    "ss",
    [hash("sha256", $token), $shop]
  );
  if (!$rows) return null;
  $cust = pos_q("SELECT * FROM customers WHERE id=? AND business_id=?", "ss", [$rows[0]["customer_id"], $shop]);
  return $cust[0] ?? null;
}

function pos_print_require_customer($shop) {
  $c = pos_print_customer($shop);
  if (!$c) pos_send(401, ["error" => "Sign in required", "php" => true]);
  return $c;
}

function pos_print_customer_code($shop) {
  $n = function_exists("pos_next_seq") ? pos_next_seq("customer", $shop, 4) : random_int(100, 9999);
  return "CUS-" . str_pad((string) $n, 3, "0", STR_PAD_LEFT);
}

function pos_print_create_customer($shop, $name, $email, $mobile, $password = "") {
  $id = pos_uuid();
  $code = pos_print_customer_code($shop);
  $hash = $password !== "" ? pos_hash_password($password) : null;
  try {
    pos_q(
      "INSERT INTO customers (id, code, name, mobile, email, password_hash, type, outstanding, business_id) VALUES (?,?,?,?,?,?,'b2c',0,?)",
      "sssssss",
      [$id, $code, $name, $mobile, $email, $hash ?: "", $shop]
    );
  } catch (Exception $e) {
    pos_q(
      "INSERT INTO customers (id, name, mobile, email, password_hash, type, business_id) VALUES (?,?,?,?,?,'b2c',?)",
      "ssssss",
      [$id, $name, $mobile, $email, $hash ?: "", $shop]
    );
  }
  $rows = pos_q("SELECT * FROM customers WHERE id=? LIMIT 1", "s", [$id]);
  return $rows[0] ?? ["id" => $id, "name" => $name, "email" => $email, "mobile" => $mobile];
}

function pos_print_area($width, $height, $unit, $dpi = 150) {
  $u = strtolower(trim((string) $unit));
  $w = (float) $width;
  $h = (float) $height;
  if ($u === "sqft") return pos_print_round2($w);
  if ($u === "ft" || $u === "feet" || $u === "foot") return pos_print_round2($w * $h);
  if ($u === "in" || $u === "inch" || $u === "inches") return pos_print_round2(($w * $h) / 144);
  if ($u === "cm") return pos_print_round2(($w * $h) / 929.0304);
  if ($u === "mm") return pos_print_round2(($w * $h) / 92903.04);
  if ($u === "px") {
    $d = (float) $dpi ?: 150;
    return pos_print_round2((($w / $d) * ($h / $d)) / 144);
  }
  return pos_print_round2($w * $h);
}

function pos_print_finish_amount($f, $area, $qty) {
  $rate = (float) ($f["rate"] ?? 0);
  $unit = strtolower((string) ($f["unit"] ?? "job"));
  $q = max(1, (int) $qty);
  if ($unit === "sqft") return pos_print_round2($rate * (float) $area * $q);
  return pos_print_round2($rate * $q);
}

function pos_print_quote($material, $body, $finishing, $settings) {
  $area = pos_print_area($body["width"] ?? 0, $body["height"] ?? 0, $body["unit"] ?? "ft", $body["dpi"] ?? 150);
  $qty = max(1, (int) ($body["quantity"] ?? 1));
  $minSq = (float) ($material["min_sqft"] ?? 0);
  $billed = max($area, $minSq);
  $rate = (float) ($material["rate"] ?? 0);
  $model = strtolower((string) ($material["price_model"] ?? "sqft"));
  if ($model === "piece" || $model === "size") $printing = pos_print_round2($rate * $qty);
  else $printing = pos_print_round2($billed * $rate * $qty);
  if (strtolower((string) ($body["print_type"] ?? "single")) === "double" && $model === "sqft") {
    $printing = pos_print_round2($printing * 2);
  }
  $finAmt = 0;
  foreach ($finishing as $f) $finAmt += pos_print_finish_amount($f, $area, $qty);
  $finAmt = pos_print_round2($finAmt);
  $delivery = pos_print_round2($body["delivery_amount"] ?? $body["delivery"] ?? 0);
  foreach ($finishing as $f) {
    if (preg_match("/delivery/i", (string) ($f["name"] ?? ""))) $delivery = 0;
  }
  $other = pos_print_round2($body["other_charges"] ?? $body["other"] ?? 0);
  $gstRate = (float) ($settings["gst_rate"] ?? $body["gst_rate"] ?? 18);
  $discount = pos_print_round2($body["discount"] ?? 0);
  $subtotal = pos_print_round2($printing + $finAmt + $delivery + $other);
  $taxable = pos_print_round2(max(0, $subtotal - $discount));
  $gst = pos_print_round2($taxable * ($gstRate / 100));
  $total = pos_print_round2($taxable + $gst);
  $paid = pos_print_round2($body["paid_amount"] ?? $body["paid"] ?? 0);
  $pay = $paid <= 0 ? "pending" : ($paid + 0.009 >= $total ? "paid" : "partial");
  return [
    "area" => $area,
    "qty" => $qty,
    "printing" => $printing,
    "finishing" => $finAmt,
    "delivery" => $delivery,
    "other" => $other,
    "discount" => $discount,
    "taxable" => $taxable,
    "gst" => $gst,
    "gst_rate" => $gstRate,
    "total" => $total,
    "paid" => $paid,
    "balance" => pos_print_round2(max(0, $total - $paid)),
    "pay_status" => $pay,
    "rate" => $rate,
    "totalArea" => pos_print_round2($billed * $qty),
  ];
}

function pos_print_staff_name($auth) {
  $u = is_array($auth) ? ($auth["user"] ?? $auth) : [];
  if (!is_array($u)) return "";
  $name = trim(($u["first_name"] ?? "") . " " . ($u["last_name"] ?? ""));
  if ($name !== "") return pos_print_clip($name, 180);
  return pos_print_clip($u["name"] ?? $u["username"] ?? $u["email"] ?? "", 180);
}

function pos_print_history($orderId, $status, $shop, $note = "", $auth = null) {
  $staffId = "";
  if (is_array($auth)) $staffId = (string) ($auth["user"]["id"] ?? $auth["id"] ?? "");
  pos_q(
    "INSERT INTO print_status_history (id, order_id, status, staff_id, staff_name, note, business_id) VALUES (?,?,?,?,?,?,?)",
    "sssssss",
    [pos_uuid(), $orderId, $status, $staffId, pos_print_staff_name($auth), pos_print_clip($note, 500), $shop]
  );
}

function pos_print_public_order($row) {
  $row["status_label"] = $row["status"] ?? "";
  $row["timeline"] = [];
  return $row;
}

function pos_print_order_bundle($id, $shop) {
  $rows = pos_q("SELECT * FROM print_orders WHERE id=? AND business_id=?", "ss", [$id, $shop]);
  if (!$rows) return null;
  $order = pos_print_public_order($rows[0]);
  $files = pos_q(
    "SELECT id, order_id, version, file_name, file_type, file_size, mime, width_px, height_px, status, uploaded_by, created_at FROM print_files WHERE order_id=? ORDER BY version DESC",
    "s",
    [$id]
  );
  foreach ($files as &$f) {
    $f["download"] = "/api/print/files/" . $f["id"];
    $f["preview"] = (strpos((string) ($f["mime"] ?? ""), "image/") === 0) ? ("/api/print/files/" . $f["id"]) : "";
  }
  unset($f);
  $order["files"] = $files;
  $order["finishing"] = pos_q("SELECT * FROM print_order_finishing WHERE order_id=?", "s", [$id]);
  $order["history"] = pos_q("SELECT * FROM print_status_history WHERE order_id=? ORDER BY created_at", "s", [$id]);
  $order["payments"] = pos_q("SELECT * FROM print_payments WHERE order_id=? ORDER BY created_at", "s", [$id]);
  $order["quote"] = pos_print_quote(
    ["rate" => $order["rate"], "price_model" => $order["price_model"], "min_sqft" => 0],
    $order,
    $order["finishing"],
    ["gst_rate" => $order["gst_rate"]]
  );
  return $order;
}

function pos_print_apply_totals($orderId, $shop, $extra = []) {
  $rows = pos_q("SELECT * FROM print_orders WHERE id=? AND business_id=?", "ss", [$orderId, $shop]);
  if (!$rows) return null;
  $row = array_merge($rows[0], is_array($extra) ? $extra : []);
  $finishing = pos_q("SELECT * FROM print_order_finishing WHERE order_id=?", "s", [$orderId]);
  $q = pos_print_quote(
    ["rate" => $row["rate"], "price_model" => $row["price_model"], "min_sqft" => $row["min_sqft"] ?? 0],
    $row,
    $finishing,
    ["gst_rate" => $row["gst_rate"]]
  );
  pos_q(
    "UPDATE print_orders SET area_sqft=?, printing_amount=?, finishing_amount=?, delivery_amount=?, other_charges=?, estimate_total=?, quote_total=?, gst=?, paid_amount=?, balance_due=?, pay_status=? WHERE id=?",
    "ddddddddddss",
    [$q["area"], $q["printing"], $q["finishing"], $q["delivery"], $q["other"] ?? 0, $q["total"], $q["total"], $q["gst"], $q["paid"], $q["balance"], $q["pay_status"], $orderId]
  );
  return $q;
}

function pos_print_known_status($status) {
  return in_array($status, [
    "pending_review", "file_approved", "file_rejected", "changes_requested", "quote_sent", "customer_approved",
    "payment_pending", "paid", "production_pending", "printing", "finishing", "quality_check", "ready",
    "dispatched", "delivered", "rejected", "cancelled",
  ], true);
}

function pos_print_public_dispatch($path, $method, $body) {
  if (!preg_match("#^print/public/([^/]+)(/.*)?$#", $path, $m)) return false;
  pos_print_ensure();
  $shop = $m[1];
  $rest = trim($m[2] ?? "", "/");
  pos_print_seed($shop);
  $body = is_array($body) ? $body : [];
  try {
    if ($method === "GET" && $rest === "") {
      $biz = pos_q("SELECT id, name, category, address, mobile FROM businesses WHERE id=?", "s", [$shop]);
      $cat = pos_print_catalog_payload($shop);
      $cat["shop"] = $biz[0] ?? ["id" => $shop];
      pos_send(200, $cat);
    }
    if ($method === "POST" && $rest === "register") {
      $email = strtolower(pos_print_clip($body["email"] ?? "", 160));
      $name = pos_print_clip($body["name"] ?? "", 180);
      $mobile = substr(pos_print_digits($body["mobile"] ?? ""), 0, 15);
      $password = (string) ($body["password"] ?? "");
      if ($email === "" || $name === "" || strlen($password) < 6) {
        pos_send(400, ["error" => "Name, email, and a 6+ character password are required", "php" => true]);
      }
      $dup = pos_q("SELECT id FROM customers WHERE business_id=? AND email=? LIMIT 1", "ss", [$shop, $email]);
      if ($dup) pos_send(400, ["error" => "This email is already registered", "php" => true]);
      $c = pos_print_create_customer($shop, $name, $email, $mobile, $password);
      $token = pos_print_issue_session($c["id"], $shop);
      pos_send(200, ["token" => $token, "customer" => ["id" => $c["id"], "name" => $c["name"], "email" => $email, "mobile" => $mobile]]);
    }
    if ($method === "POST" && $rest === "login") {
      $ident = strtolower(pos_print_clip($body["email"] ?? $body["mobile"] ?? $body["identifier"] ?? "", 160));
      $password = (string) ($body["password"] ?? "");
      if ($ident === "" || $password === "") pos_send(400, ["error" => "Email/mobile and password required", "php" => true]);
      $rows = pos_q(
        "SELECT * FROM customers WHERE business_id=? AND (LOWER(email)=? OR mobile=?) LIMIT 1",
        "sss",
        [$shop, $ident, pos_print_digits($ident)]
      );
      $c = $rows[0] ?? null;
      if (!$c || empty($c["password_hash"]) || !pos_verify_password($password, $c["password_hash"])) {
        pos_send(400, ["error" => "Invalid login", "php" => true]);
      }
      $token = pos_print_issue_session($c["id"], $shop);
      pos_send(200, ["token" => $token, "customer" => ["id" => $c["id"], "name" => $c["name"], "email" => $c["email"] ?? "", "mobile" => $c["mobile"] ?? ""]]);
    }
    if ($method === "POST" && $rest === "otp/send") {
      $email = strtolower(pos_print_clip($body["email"] ?? "", 160));
      $mobile = substr(pos_print_digits($body["mobile"] ?? ""), 0, 15);
      if ($email === "" && $mobile === "") pos_send(400, ["error" => "Email or mobile required", "php" => true]);
      $code = (string) random_int(100000, 999999);
      pos_q(
        "INSERT INTO print_otps (id, email, mobile, code_hash, purpose, business_id, expires_at) VALUES (?,?,?,?, 'login', ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))",
        "sssss",
        [pos_uuid(), $email !== "" ? $email : ($mobile . "@otp.local"), $mobile, pos_hash_password($code), $shop]
      );
      if ($email !== "" && function_exists("pos_send_mail")) {
        try { pos_send_mail($email, "Print portal OTP", "Your OTP is $code"); } catch (Exception $e) { /* mail optional */ }
      }
      pos_send(200, ["ok" => true]);
    }
    if ($method === "POST" && $rest === "otp/verify") {
      $email = strtolower(pos_print_clip($body["email"] ?? "", 160));
      $code = (string) ($body["otp"] ?? "");
      $rows = pos_q(
        "SELECT * FROM print_otps WHERE business_id=? AND email=? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
        "ss",
        [$shop, $email]
      );
      $otp = $rows[0] ?? null;
      if (!$otp || !pos_verify_password($code, $otp["code_hash"])) pos_send(400, ["error" => "Invalid OTP", "php" => true]);
      $found = pos_q("SELECT * FROM customers WHERE business_id=? AND email=? LIMIT 1", "ss", [$shop, $email]);
      $c = $found[0] ?? pos_print_create_customer($shop, explode("@", $email)[0], $email, "", "");
      if (!empty($body["password"])) {
        pos_q("UPDATE customers SET password_hash=? WHERE id=?", "ss", [pos_hash_password((string) $body["password"]), $c["id"]]);
      }
      $token = pos_print_issue_session($c["id"], $shop);
      pos_send(200, ["token" => $token, "customer" => ["id" => $c["id"], "name" => $c["name"], "email" => $c["email"] ?? $email, "mobile" => $c["mobile"] ?? ""]]);
    }
    if ($method === "GET" && $rest === "me") {
      $c = pos_print_require_customer($shop);
      $orders = pos_q("SELECT * FROM print_orders WHERE customer_id=? AND business_id=? ORDER BY created_at DESC LIMIT 200", "ss", [$c["id"], $shop]);
      $payments = pos_q("SELECT * FROM print_payments WHERE customer_id=? AND business_id=? ORDER BY created_at DESC LIMIT 200", "ss", [$c["id"], $shop]);
      $files = pos_q(
        "SELECT id, order_id, version, file_name, file_type, file_size, mime, width_px, height_px, status, uploaded_by, created_at FROM print_files WHERE customer_id=? AND business_id=? ORDER BY created_at DESC LIMIT 200",
        "ss",
        [$c["id"], $shop]
      );
      $inbox = pos_q(
        "SELECT id, kind, body, created_at FROM print_notifications WHERE customer_id=? AND channel='in_app' ORDER BY created_at DESC LIMIT 40",
        "s",
        [$c["id"]]
      );
      pos_send(200, [
        "customer" => ["id" => $c["id"], "name" => $c["name"], "email" => $c["email"] ?? "", "mobile" => $c["mobile"] ?? ""],
        "orders" => array_map("pos_print_public_order", $orders ?: []),
        "payments" => $payments,
        "files" => $files,
        "inbox" => $inbox,
      ]);
    }
    if ($method === "POST" && $rest === "profile") {
      $c = pos_print_require_customer($shop);
      $name = pos_print_clip($body["name"] ?? "", 180) ?: $c["name"];
      $mobile = substr(pos_print_digits($body["mobile"] ?? ""), 0, 15);
      pos_q("UPDATE customers SET name=?, mobile=? WHERE id=?", "sss", [$name, $mobile, $c["id"]]);
      pos_send(200, ["ok" => true]);
    }
    if ($method === "POST" && $rest === "orders") {
      $c = pos_print_require_customer($shop);
      $cat = pos_print_catalog_payload($shop);
      $material = null;
      foreach ($cat["materials"] as $mrow) {
        if (($mrow["id"] ?? "") === ($body["material_id"] ?? "")) {
          $material = $mrow;
          break;
        }
      }
      if (!$material) $material = $cat["materials"][0] ?? null;
      if (!$material) pos_send(400, ["error" => "Select a material", "php" => true]);
      $finishIds = is_array($body["finishing_ids"] ?? null) ? $body["finishing_ids"] : [];
      $finishing = [];
      foreach ($cat["finishing"] as $f) {
        if (in_array($f["id"], $finishIds, true) && (int) ($f["active"] ?? 1) !== 0) $finishing[] = $f;
      }
      $q = pos_print_quote($material, $body, $finishing, $cat["settings"]);
      $id = pos_uuid();
      $year = (int) date("Y");
      $cnt = pos_q("SELECT COUNT(*) n FROM print_orders WHERE business_id=? AND order_number LIKE ?", "ss", [$shop, "FP-{$year}-%"]);
      $number = "FP-" . $year . "-" . str_pad((string) (((int) ($cnt[0]["n"] ?? 0)) + 1), 5, "0", STR_PAD_LEFT);
      pos_q(
        "INSERT INTO print_orders (
           id, order_number, business_id, customer_id, customer_name, customer_mobile, customer_email,
           product, print_type, material_id, material_name, width, height, unit, dpi, area_sqft, quantity,
           rate, price_model, printing_amount, finishing_amount, delivery_amount, gst, gst_rate,
           estimate_total, quote_total, paid_amount, balance_due, pay_status, status, notes, urgent
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        "sssssssssssddsididsdddddddddsssi",
        [
          $id, $number, $shop, $c["id"], $c["name"], $c["mobile"] ?? "", $c["email"] ?? "",
          pos_print_clip($body["product"] ?? "Flex", 80) ?: "Flex",
          pos_print_clip($body["print_type"] ?? "single", 16) ?: "single",
          $material["id"], $material["name"],
          (float) ($body["width"] ?? 0), (float) ($body["height"] ?? 0),
          pos_print_clip($body["unit"] ?? "ft", 16) ?: "ft",
          !empty($body["dpi"]) ? (int) $body["dpi"] : 0,
          $q["area"], $q["qty"], $material["rate"], $material["price_model"],
          $q["printing"], $q["finishing"], $q["delivery"], $q["gst"], $q["gst_rate"],
          $q["total"], $q["total"], 0, $q["total"], "pending", "pending_review",
          pos_print_clip($body["notes"] ?? "", 2000), !empty($body["urgent"]) ? 1 : 0,
        ]
      );
      foreach ($finishing as $f) {
        pos_q(
          "INSERT INTO print_order_finishing (id, order_id, finishing_id, name, rate, unit, amount, business_id) VALUES (?,?,?,?,?,?,?,?)",
          "ssssdsds",
          [pos_uuid(), $id, $f["id"], $f["name"], $f["rate"], $f["unit"] ?? "job", pos_print_finish_amount($f, $q["area"], $q["qty"]), $shop]
        );
      }
      pos_print_history($id, "pending_review", $shop, "Submitted by customer");
      pos_send(200, [
        "order" => pos_print_order_bundle($id, $shop),
        "message" => "Your print order has been submitted. Our team will review your file and confirm the final price.",
      ]);
    }
    if (preg_match("#^orders/([^/]+)$#", $rest, $om) && $method === "GET") {
      $c = pos_print_require_customer($shop);
      $row = pos_q("SELECT id FROM print_orders WHERE id=? AND customer_id=?", "ss", [$om[1], $c["id"]]);
      if (!$row) pos_send(404, ["error" => "Order not found", "php" => true]);
      pos_send(200, ["order" => pos_print_order_bundle($om[1], $shop)]);
    }
    if (preg_match("#^orders/([^/]+)/files$#", $rest, $om) && $method === "POST") {
      $c = pos_print_require_customer($shop);
      $orders = pos_q("SELECT * FROM print_orders WHERE id=? AND customer_id=?", "ss", [$om[1], $c["id"]]);
      $order = $orders[0] ?? null;
      if (!$order) pos_send(400, ["error" => "Order not found", "php" => true]);
      if (in_array($order["status"], ["printing", "finishing", "quality_check", "ready", "dispatched", "delivered"], true)) {
        pos_send(400, ["error" => "Files are locked after production starts", "php" => true]);
      }
      $raw = (string) ($body["content"] ?? "");
      if ($raw === "") pos_send(400, ["error" => "Upload a print file", "php" => true]);
      $mime = "application/octet-stream";
      $bin = $raw;
      if (preg_match("#^data:([^;]+);base64,(.+)$#s", $raw, $dm)) {
        $mime = $dm[1];
        $bin = base64_decode($dm[2], true);
        if ($bin === false) pos_send(400, ["error" => "Upload a print file", "php" => true]);
      }
      $name = pos_print_clip($body["file_name"] ?? "design.bin", 255) ?: "design.bin";
      $settings = pos_print_settings($shop);
      $max = ((int) ($settings["max_file_mb"] ?? 25)) * 1024 * 1024;
      if (strlen($bin) > $max) pos_send(400, ["error" => "File exceeds " . ($settings["max_file_mb"] ?? 25) . " MB", "php" => true]);
      $ver = pos_q("SELECT COALESCE(MAX(version),0) v FROM print_files WHERE order_id=?", "s", [$order["id"]]);
      $version = ((int) ($ver[0]["v"] ?? 0)) + 1;
      $fid = pos_uuid();
      $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
      pos_q(
        "INSERT INTO print_files (id, order_id, business_id, customer_id, version, file_name, file_type, file_size, mime, width_px, height_px, status, uploaded_by, content)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'customer', ?)",
        "ssssissisiiss",
        [
          $fid, $order["id"], $shop, $c["id"], $version, $name, $ext, strlen($bin), $mime,
          (int) ($body["width_px"] ?? 0), (int) ($body["height_px"] ?? 0), "uploaded", $bin,
        ]
      );
      pos_send(200, ["file" => [
        "id" => $fid, "order_id" => $order["id"], "version" => $version, "file_name" => $name,
        "file_size" => strlen($bin), "mime" => $mime, "status" => "uploaded", "uploaded_by" => "customer",
      ]]);
    }
    if (preg_match("#^orders/([^/]+)/approve$#", $rest, $om) && $method === "POST") {
      $c = pos_print_require_customer($shop);
      $orders = pos_q("SELECT * FROM print_orders WHERE id=? AND customer_id=?", "ss", [$om[1], $c["id"]]);
      $order = $orders[0] ?? null;
      if (!$order) pos_send(400, ["error" => "Order not found", "php" => true]);
      if ($order["status"] !== "quote_sent") pos_send(400, ["error" => "Quote is not waiting for approval", "php" => true]);
      pos_q("UPDATE print_orders SET status='customer_approved' WHERE id=?", "s", [$order["id"]]);
      pos_print_history($order["id"], "customer_approved", $shop, "Customer approved quote");
      pos_send(200, ["order" => pos_print_order_bundle($order["id"], $shop)]);
    }
    if (preg_match("#^orders/([^/]+)/changes$#", $rest, $om) && $method === "POST") {
      $c = pos_print_require_customer($shop);
      $note = pos_print_clip($body["notes"] ?? "", 1000);
      pos_q("UPDATE print_orders SET status='changes_requested' WHERE id=? AND customer_id=?", "ss", [$om[1], $c["id"]]);
      pos_print_history($om[1], "changes_requested", $shop, $note);
      pos_send(200, ["ok" => true]);
    }
    if (preg_match("#^orders/([^/]+)/reject$#", $rest, $om) && $method === "POST") {
      $c = pos_print_require_customer($shop);
      pos_q("UPDATE print_orders SET status='cancelled' WHERE id=? AND customer_id=?", "ss", [$om[1], $c["id"]]);
      pos_print_history($om[1], "cancelled", $shop, "Rejected by customer");
      pos_send(200, ["ok" => true]);
    }
    if (preg_match("#^orders/([^/]+)/pay$#", $rest, $om) && $method === "POST") {
      $c = pos_print_require_customer($shop);
      $orders = pos_q("SELECT * FROM print_orders WHERE id=? AND customer_id=?", "ss", [$om[1], $c["id"]]);
      $order = $orders[0] ?? null;
      if (!$order) pos_send(400, ["error" => "Order not found", "php" => true]);
      $amt = pos_print_round2($body["amount"] ?? ($order["balance_due"] ?? $order["quote_total"]));
      if ($amt <= 0) pos_send(400, ["error" => "Enter an amount", "php" => true]);
      $paid = pos_print_round2((float) $order["paid_amount"] + $amt);
      $total = (float) ($order["quote_total"] ?? 0);
      $payStatus = $paid <= 0 ? "pending" : ($paid + 0.009 >= $total ? "paid" : "partial");
      $status = $payStatus === "paid" ? "paid" : "payment_pending";
      pos_q(
        "INSERT INTO print_payments (id, order_id, customer_id, amount, method, kind, status, reference, receipt_no, business_id) VALUES (?,?,?,?,?,?,'paid',?,?,?)",
        "sssdsssss",
        [
          pos_uuid(), $order["id"], $c["id"], $amt, pos_print_clip($body["method"] ?? "upi", 32) ?: "upi",
          $paid >= $total ? "full" : "advance", pos_print_clip($body["reference"] ?? "", 80),
          "FPAY-" . substr((string) time(), -8), $shop,
        ]
      );
      pos_q(
        "UPDATE print_orders SET paid_amount=?, balance_due=?, pay_status=?, status=? WHERE id=?",
        "ddsss",
        [$paid, pos_print_round2(max(0, $total - $paid)), $payStatus, $status, $order["id"]]
      );
      pos_print_history($order["id"], $status, $shop, "Payment " . $amt);
      if (!empty($order["sales_order_id"]) && function_exists("pos_apply_invoice_paid_delta")) {
        pos_apply_invoice_paid_delta($order["sales_order_id"], $amt, $shop);
      }
      if (!empty($order["customer_id"]) && function_exists("pos_recompute_customer_outstanding")) {
        try { pos_recompute_customer_outstanding($shop, $order["customer_id"]); } catch (Exception $e) { /* optional */ }
      }
      pos_send(200, ["order" => pos_print_order_bundle($order["id"], $shop)]);
    }
  } catch (Exception $e) {
    pos_send(400, ["error" => $e->getMessage(), "php" => true]);
  }
  pos_send(404, ["error" => "Print route not found", "php" => true]);
  return true;
}

function pos_print_staff_dispatch($path, $method, $body, $bid, $auth) {
  if (strpos($path, "print/") !== 0 || strpos($path, "print/public") === 0) return false;
  pos_print_ensure();
  pos_print_seed($bid);
  $body = is_array($body) ? $body : [];
  try {
    if ($path === "print/board" && $method === "GET") {
      $rows = pos_q("SELECT * FROM print_orders WHERE business_id=? ORDER BY created_at DESC LIMIT 400", "s", [$bid]);
      $today = date("Y-m-d");
      $month = date("Y-m");
      $pending = 0;
      $quotes = 0;
      foreach ($rows as $r) {
        if (($r["status"] ?? "") === "pending_review") $pending++;
        if (($r["status"] ?? "") === "quote_sent") $quotes++;
      }
      pos_send(200, [
        "cards" => [
          ["id" => "pending", "label" => "Pending Approval", "value" => $pending],
          ["id" => "quotes", "label" => "Quotes Pending", "value" => $quotes],
          ["id" => "today", "label" => "Today's Orders", "value" => count(array_filter($rows, function ($r) use ($today) { return substr((string) ($r["created_at"] ?? ""), 0, 10) === $today; }))],
        ],
        "orders" => array_slice($rows, 0, 80),
        "tabs" => [],
      ]);
    }
    if ($path === "print/orders" && $method === "GET") {
      $rows = pos_q("SELECT * FROM print_orders WHERE business_id=? ORDER BY created_at DESC LIMIT 400", "s", [$bid]);
      $tab = (string) ($_GET["tab"] ?? "");
      $q = strtolower(trim((string) ($_GET["q"] ?? "")));
      $tabs = [
        "new" => ["pending_review"],
        "pending_review" => ["pending_review"],
        "file_approved" => ["file_approved"],
        "quote_sent" => ["quote_sent"],
        "customer_approved" => ["customer_approved"],
        "payment_pending" => ["payment_pending"],
        "paid" => ["paid"],
        "production" => ["production_pending", "printing", "finishing", "quality_check"],
        "ready" => ["ready"],
        "dispatched" => ["dispatched"],
        "delivered" => ["delivered"],
        "rejected" => ["rejected", "file_rejected"],
        "cancelled" => ["cancelled"],
      ];
      if ($tab !== "" && isset($tabs[$tab])) {
        $allow = $tabs[$tab];
        $rows = array_values(array_filter($rows, function ($r) use ($allow) { return in_array($r["status"] ?? "", $allow, true); }));
      }
      if ($q !== "") {
        $rows = array_values(array_filter($rows, function ($r) use ($q) {
          $hay = strtolower(($r["order_number"] ?? "") . " " . ($r["customer_name"] ?? "") . " " . ($r["material_name"] ?? "") . " " . ($r["product"] ?? ""));
          return strpos($hay, $q) !== false;
        }));
      }
      pos_send(200, array_values($rows));
    }
    if (preg_match("#^print/orders/([^/]+)$#", $path, $m) && $method === "GET") {
      $order = pos_print_order_bundle($m[1], $bid);
      if (!$order) pos_send(404, ["error" => "Not found", "php" => true]);
      pos_send(200, ["order" => $order]);
    }
    if (preg_match("#^print/orders/([^/]+)/review$#", $path, $m) && $method === "POST") {
      $action = (string) ($body["action"] ?? "");
      $map = ["approve" => "file_approved", "reject" => "file_rejected", "request_file" => "changes_requested", "request_changes" => "changes_requested"];
      $status = $map[$action] ?? "";
      if ($status === "") pos_send(400, ["error" => "Unknown review action", "php" => true]);
      $rows = pos_q("SELECT * FROM print_orders WHERE id=? AND business_id=?", "ss", [$m[1], $bid]);
      $order = $rows[0] ?? null;
      if (!$order) pos_send(400, ["error" => "Order not found", "php" => true]);
      if ($action === "approve") {
        $fileId = (string) ($body["file_id"] ?? "");
        if ($fileId === "") {
          $latest = pos_q("SELECT id FROM print_files WHERE order_id=? ORDER BY version DESC LIMIT 1", "s", [$order["id"]]);
          $fileId = (string) ($latest[0]["id"] ?? "");
        }
        if ($fileId !== "") {
          pos_q("UPDATE print_files SET status='approved' WHERE id=? AND order_id=?", "ss", [$fileId, $order["id"]]);
          pos_q("UPDATE print_orders SET approved_file_id=? WHERE id=?", "ss", [$fileId, $order["id"]]);
        }
      }
      pos_q("UPDATE print_orders SET status=?, admin_notes=? WHERE id=?", "sss", [$status, pos_print_clip($body["notes"] ?? "", 2000), $order["id"]]);
      pos_print_history($order["id"], $status, $bid, $body["notes"] ?? "", $auth);
      pos_send(200, ["order" => pos_print_order_bundle($order["id"], $bid)]);
    }
    if (preg_match("#^print/orders/([^/]+)/quote$#", $path, $m) && $method === "POST") {
      $rows = pos_q("SELECT * FROM print_orders WHERE id=? AND business_id=?", "ss", [$m[1], $bid]);
      $order = $rows[0] ?? null;
      if (!$order) pos_send(400, ["error" => "Order not found", "php" => true]);
      $fields = ["width", "height", "unit", "quantity", "rate", "price_model", "delivery_amount", "discount", "other_charges", "gst_rate", "material_name"];
      $sets = [];
      $types = "";
      $args = [];
      foreach ($fields as $f) {
        if (!array_key_exists($f, $body) || $body[$f] === null) continue;
        $sets[] = "$f=?";
        if (in_array($f, ["unit", "price_model", "material_name"], true)) {
          $types .= "s";
          $args[] = pos_print_clip($body[$f], 180);
        } else {
          $types .= "d";
          $args[] = (float) $body[$f];
        }
      }
      if ($sets) {
        $types .= "s";
        $args[] = $order["id"];
        pos_q("UPDATE print_orders SET " . implode(", ", $sets) . " WHERE id=?", $types, $args);
      }
      $q = pos_print_apply_totals($order["id"], $bid, $body);
      $settings = pos_print_settings($bid);
      $next = (($settings["customer_approval_required"] ?? true) === false) ? "customer_approved" : "quote_sent";
      pos_q("UPDATE print_orders SET status=? WHERE id=?", "ss", [$next, $order["id"]]);
      pos_q(
        "INSERT INTO print_quotes (id, order_id, business_id, quote_json, total, status) VALUES (?,?,?,?,?,?)",
        "ssssds",
        [pos_uuid(), $order["id"], $bid, json_encode($q, JSON_UNESCAPED_UNICODE), (float) ($q["total"] ?? 0), "sent"]
      );
      pos_print_history($order["id"], $next, $bid, "Final quote", $auth);
      pos_send(200, ["order" => pos_print_order_bundle($order["id"], $bid), "quote" => $q]);
    }
    if (preg_match("#^print/orders/([^/]+)/bill$#", $path, $m) && $method === "POST") {
      $order = pos_print_order_bundle($m[1], $bid);
      if (!$order) pos_send(400, ["error" => "Order not found", "php" => true]);
      $invoiceId = pos_uuid();
      $q = $order["quote"] ?? [];
      $uid = (string) ($auth["user"]["id"] ?? "");
      $payStatus = (($order["pay_status"] ?? "") === "paid") ? "paid" : "unpaid";
      pos_q(
        "INSERT INTO sales_orders (
           id, order_number, customer_id, customer_name, customer_type,
           pack_id, pack_name, pack_count, status, total_quantity_gm,
           subtotal, discount, gst, total, payment_method, payment_status, business_id,
           branch_id, cashier_id
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        "sssssssssssssssssss",
        [
          $invoiceId, $order["order_number"], $order["customer_id"], $order["customer_name"], "b2c",
          null, null, null, "confirmed", (string) ($q["qty"] ?? $order["quantity"] ?? 1),
          (string) ($q["taxable"] ?? $order["estimate_total"] ?? 0),
          (string) ($q["discount"] ?? $order["discount"] ?? 0),
          (string) ($q["gst"] ?? $order["gst"] ?? 0),
          (string) ($q["total"] ?? $order["quote_total"] ?? 0),
          "upi", $payStatus, $bid, null, $uid !== "" ? $uid : null,
        ]
      );
      try {
        pos_q(
          "INSERT INTO sales_order_lines (
             id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
             discount, amount, gst_rate, cancelled, business_id
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          "sssssssssss",
          [
            pos_uuid(), $invoiceId, "",
            trim(($order["product"] ?? "") . " " . ($order["width"] ?? "") . "×" . ($order["height"] ?? "") . " " . ($order["unit"] ?? "") . " · " . ($order["material_name"] ?? "")),
            (string) ($q["totalArea"] ?? $order["area_sqft"] ?? 0),
            (string) ($q["rate"] ?? $order["rate"] ?? 0),
            (string) ($q["discount"] ?? 0),
            (string) ($q["printing"] ?? $order["printing_amount"] ?? 0),
            (string) ($q["gst_rate"] ?? $order["gst_rate"] ?? 18),
            "0", $bid,
          ]
        );
      } catch (Exception $e) { /* line shape varies */ }
      pos_q("UPDATE print_orders SET sales_order_id=? WHERE id=?", "ss", [$invoiceId, $order["id"]]);
      $custRows = pos_q("SELECT * FROM customers WHERE id=? AND business_id=?", "ss", [$order["customer_id"] ?? "", $bid]);
      $customer = $custRows[0] ?? null;
      $billTotal = (float) ($q["total"] ?? $order["quote_total"] ?? 0);
      $billPaid = (float) ($order["paid_amount"] ?? 0);
      if ($customer && function_exists("pos_settle_customer_invoice")) {
        try {
          pos_settle_customer_invoice(
            $customer,
            $billTotal,
            $billPaid > 0.009 ? "upi" : "credit",
            $invoiceId,
            $order["order_number"],
            $bid,
            $uid !== "" ? $uid : null,
            $billPaid
          );
        } catch (Exception $e) { /* settlement optional */ }
      }
      if (!in_array($order["status"], ["paid", "production_pending", "printing"], true)) {
        pos_q("UPDATE print_orders SET status='payment_pending' WHERE id=?", "s", [$order["id"]]);
      }
      pos_send(200, ["invoice_id" => $invoiceId, "order" => pos_print_order_bundle($order["id"], $bid)]);
    }
    if (preg_match("#^print/orders/([^/]+)/status$#", $path, $m) && $method === "POST") {
      $status = pos_print_clip($body["status"] ?? "", 32);
      if (!pos_print_known_status($status)) pos_send(400, ["error" => "Unknown status", "php" => true]);
      $rows = pos_q("SELECT * FROM print_orders WHERE id=? AND business_id=?", "ss", [$m[1], $bid]);
      $order = $rows[0] ?? null;
      if (!$order) pos_send(400, ["error" => "Order not found", "php" => true]);
      pos_q(
        "UPDATE print_orders SET status=?, staff_id=?, staff_name=? WHERE id=?",
        "ssss",
        [$status, (string) ($auth["user"]["id"] ?? ""), pos_print_staff_name($auth), $order["id"]]
      );
      pos_print_history($order["id"], $status, $bid, $body["note"] ?? "", $auth);
      pos_send(200, ["order" => pos_print_order_bundle($order["id"], $bid)]);
    }
    if (preg_match("#^print/files/([^/]+)$#", $path, $m) && $method === "GET") {
      $files = pos_q("SELECT * FROM print_files WHERE id=? AND business_id=?", "ss", [$m[1], $bid]);
      $file = $files[0] ?? null;
      if (!$file) pos_send(404, ["error" => "File not found", "php" => true]);
      $name = $file["file_name"] ?: "print-file.bin";
      $mime = $file["mime"] ?: "application/octet-stream";
      pos_send_file(200, $mime, $name, $file["content"] ?? "");
    }
    if (preg_match("#^print/reports/([^/]+)$#", $path, $m) && $method === "GET") {
      $rows = pos_q("SELECT * FROM print_orders WHERE business_id=? ORDER BY created_at DESC LIMIT 1000", "s", [$bid]);
      $id = $m[1];
      $out = $rows;
      if ($id === "print-quotes") $out = array_values(array_filter($rows, function ($r) { return ($r["status"] ?? "") === "quote_sent"; }));
      if ($id === "print-dues") $out = array_values(array_filter($rows, function ($r) { return (float) ($r["balance_due"] ?? 0) > 0; }));
      if ($id === "print-production") $out = array_values(array_filter($rows, function ($r) { return in_array($r["status"] ?? "", ["production_pending", "printing", "finishing", "quality_check"], true); }));
      if ($id === "print-delivery") $out = array_values(array_filter($rows, function ($r) { return in_array($r["status"] ?? "", ["ready", "dispatched", "delivered"], true); }));
      $sqft = 0;
      $sales = 0;
      foreach ($rows as $r) {
        $sqft += ((float) ($r["area_sqft"] ?? 0)) * ((float) ($r["quantity"] ?? 1));
        $sales += (float) ($r["quote_total"] ?? 0);
      }
      pos_send(200, ["rows" => $out, "kpi" => ["total_sqft" => pos_print_round2($sqft), "orders" => count($rows), "sales" => pos_print_round2($sales)]]);
    }
    if ($path === "print/catalog" && $method === "GET") {
      pos_send(200, pos_print_catalog_payload($bid));
    }
    if ($path === "print/catalog" && $method === "POST") {
      $payload = $body;
      if (!empty($payload["materials"]) && is_array($payload["materials"])) {
        foreach ($payload["materials"] as $m) {
          if (!is_array($m)) continue;
          $id = trim((string) ($m["id"] ?? ""));
          if ($id === "") $id = $bid . ":" . bin2hex(random_bytes(6));
          $name = substr(trim((string) ($m["name"] ?? "")), 0, 180);
          $model = substr(trim((string) ($m["price_model"] ?? "sqft")), 0, 16);
          if ($model === "") $model = "sqft";
          $rate = (float) ($m["rate"] ?? 0);
          $pack = (int) ($m["pack_qty"] ?? 1);
          if ($pack < 1) $pack = 1;
          $gst = isset($m["gst_rate"]) ? (float) $m["gst_rate"] : 18;
          $min = (float) ($m["min_sqft"] ?? 0);
          $active = (isset($m["active"]) && (int) $m["active"] === 0) ? 0 : 1;
          $sort = (int) ($m["sort_order"] ?? 0);
          pos_q(
            "INSERT INTO print_materials (id, business_id, name, price_model, rate, pack_qty, gst_rate, min_sqft, active, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE name=VALUES(name), price_model=VALUES(price_model), rate=VALUES(rate), pack_qty=VALUES(pack_qty), gst_rate=VALUES(gst_rate), min_sqft=VALUES(min_sqft), active=VALUES(active)",
            "ssssdiddii",
            [$id, $bid, $name, $model, $rate, $pack, $gst, $min, $active, $sort]
          );
        }
      }
      if (!empty($payload["finishing"]) && is_array($payload["finishing"])) {
        foreach ($payload["finishing"] as $f) {
          if (!is_array($f)) continue;
          $id = trim((string) ($f["id"] ?? ""));
          if ($id === "") $id = $bid . ":" . bin2hex(random_bytes(6));
          $name = substr(trim((string) ($f["name"] ?? "")), 0, 180);
          $rate = (float) ($f["rate"] ?? 0);
          $unit = substr(trim((string) ($f["unit"] ?? "job")), 0, 16);
          if ($unit === "") $unit = "job";
          $gst = isset($f["gst_rate"]) ? (float) $f["gst_rate"] : 18;
          $active = (isset($f["active"]) && (int) $f["active"] === 0) ? 0 : 1;
          pos_q(
            "INSERT INTO print_finishing (id, business_id, name, rate, unit, gst_rate, active) VALUES (?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE name=VALUES(name), rate=VALUES(rate), unit=VALUES(unit), gst_rate=VALUES(gst_rate), active=VALUES(active)",
            "sssdsdi",
            [$id, $bid, $name, $rate, $unit, $gst, $active]
          );
        }
      }
      if (!empty($payload["settings"]) && is_array($payload["settings"])) {
        pos_print_save_settings($bid, $payload["settings"]);
      }
      pos_send(200, pos_print_catalog_payload($bid));
    }
  } catch (Exception $e) {
    pos_send(400, ["error" => $e->getMessage(), "php" => true]);
  }
  pos_send(404, ["error" => "Print route not found", "php" => true]);
}

