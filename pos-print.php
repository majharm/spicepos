<?php
function pos_print_ensure() {
  $db = pos_db();
  @$db->query("ALTER TABLE customers ADD COLUMN email VARCHAR(160) NULL");
  @$db->query("ALTER TABLE customers ADD COLUMN password_hash VARCHAR(255) NULL");
  $db->query("CREATE TABLE IF NOT EXISTS print_settings (business_id VARCHAR(255) PRIMARY KEY, settings_json TEXT NULL, updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3))");
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
    pos_q("INSERT INTO print_materials (id, business_id, name, price_model, rate, gst_rate, active, sort_order) VALUES (?,?,?,?,?,18,1,?)", "sssddi", [$shop . ":" . $m[0], $shop, $m[1], $m[2], $m[3], $i]);
  }
  foreach ([["eyelets", "Eyelets", 100], ["delivery", "Delivery", 50], ["lamination", "Lamination", 15]] as $f) {
    pos_q("INSERT INTO print_finishing (id, business_id, name, rate, unit, gst_rate, active) VALUES (?,?,?,?, 'job', 18, 1)", "sssd", [$shop . ":" . $f[0], $shop, $f[1], $f[2]]);
  }
}

function pos_print_public_dispatch($path, $method, $body) {
  if (!preg_match("#^print/public/([^/]+)(/.*)?$#", $path, $m)) return false;
  pos_print_ensure();
  $shop = $m[1];
  $rest = trim($m[2] ?? "", "/");
  pos_print_seed($shop);
  if ($method === "GET" && $rest === "") {
    $biz = pos_q("SELECT id, name, category, address, mobile FROM businesses WHERE id=?", "s", [$shop]);
    pos_send(200, [
      "shop" => $biz[0] ?? ["id" => $shop],
      "materials" => pos_q("SELECT * FROM print_materials WHERE business_id=?", "s", [$shop]),
      "finishing" => pos_q("SELECT * FROM print_finishing WHERE business_id=?", "s", [$shop]),
      "settings" => ["max_file_mb" => 25, "gst_rate" => 18, "customer_approval_required" => true, "allowed_types" => ["pdf", "jpg", "jpeg", "png", "svg", "ai", "eps", "cdr"]],
      "products" => ["Flex", "Banner", "Vinyl", "Sunboard", "Poster", "Sticker", "Canvas", "Hoarding", "Photo", "ACP", "One-Way Vision", "Visiting Card", "Brochure", "Other Custom Print"],
      "units" => [["id" => "ft", "label" => "Feet"], ["id" => "in", "label" => "Inches"], ["id" => "cm", "label" => "Centimeters"], ["id" => "mm", "label" => "Millimeters"], ["id" => "px", "label" => "Pixels"]],
      "sides" => [["id" => "single", "label" => "Single Side"], ["id" => "double", "label" => "Double Side"]],
      "dpis" => [72, 96, 150, 200, 300],
    ]);
  }
  pos_send(404, ["error" => "Print route not found", "php" => true]);
  return true;
}

function pos_print_staff_dispatch($path, $method, $body, $bid, $auth) {
  if (strpos($path, "print/") !== 0 || strpos($path, "print/public") === 0) return false;
  pos_print_ensure();
  pos_print_seed($bid);
  if ($path === "print/board" && $method === "GET") {
    $rows = pos_q("SELECT * FROM print_orders WHERE business_id=? ORDER BY created_at DESC LIMIT 80", "s", [$bid]);
    pos_send(200, ["cards" => [["id" => "pending", "label" => "Pending Approval", "value" => count($rows)]], "orders" => $rows, "tabs" => []]);
  }
  if ($path === "print/orders" && $method === "GET") {
    pos_send(200, pos_q("SELECT * FROM print_orders WHERE business_id=? ORDER BY created_at DESC LIMIT 400", "s", [$bid]));
  }
  if ($path === "print/catalog" && $method === "GET") {
    pos_send(200, [
      "materials" => pos_q("SELECT * FROM print_materials WHERE business_id=?", "s", [$bid]),
      "finishing" => pos_q("SELECT * FROM print_finishing WHERE business_id=?", "s", [$bid]),
      "settings" => ["max_file_mb" => 25, "gst_rate" => 18],
    ]);
  }
  return false;
}
