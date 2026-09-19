<?php
function pos_salon_ensure() {
  $db = pos_db();
  @$db->query("ALTER TABLE customers ADD COLUMN email VARCHAR(160) NULL");
  @$db->query("ALTER TABLE customers ADD COLUMN password_hash VARCHAR(255) NULL");
  @$db->query("ALTER TABLE customers ADD COLUMN wallet_balance DECIMAL(12,2) NOT NULL DEFAULT 0");
  @$db->query("ALTER TABLE customers ADD COLUMN favourite_json TEXT NULL");
  $db->query("CREATE TABLE IF NOT EXISTS salon_service_meta (item_id VARCHAR(255) PRIMARY KEY, duration_min INT NOT NULL DEFAULT 30, gender VARCHAR(16) NOT NULL DEFAULT 'unisex', online_booking TINYINT NOT NULL DEFAULT 1, staff_ids TEXT NULL, branch_id VARCHAR(255) NULL, discount_pct DECIMAL(8,2) NOT NULL DEFAULT 0, business_id VARCHAR(255) NOT NULL, INDEX (business_id))");
  $db->query("CREATE TABLE IF NOT EXISTS salon_packages (id VARCHAR(255) PRIMARY KEY, name VARCHAR(180) NOT NULL, description TEXT NULL, category VARCHAR(80) NULL, price DECIMAL(12,2) NOT NULL DEFAULT 0, discount_pct DECIMAL(8,2) NOT NULL DEFAULT 0, gst_rate DECIMAL(8,2) NOT NULL DEFAULT 0, validity_days INT NOT NULL DEFAULT 90, sessions INT NOT NULL DEFAULT 1, staff_ids TEXT NULL, branch_id VARCHAR(255) NULL, gender VARCHAR(16) NOT NULL DEFAULT 'unisex', status VARCHAR(16) NOT NULL DEFAULT 'active', terms TEXT NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (business_id))");
  $db->query("CREATE TABLE IF NOT EXISTS salon_package_items (id VARCHAR(255) PRIMARY KEY, package_id VARCHAR(255) NOT NULL, item_id VARCHAR(255) NOT NULL, qty INT NOT NULL DEFAULT 1, price DECIMAL(12,2) NOT NULL DEFAULT 0, business_id VARCHAR(255) NOT NULL, INDEX (package_id))");
  $db->query("CREATE TABLE IF NOT EXISTS salon_customer_packages (id VARCHAR(255) PRIMARY KEY, customer_id VARCHAR(255) NOT NULL, package_id VARCHAR(255) NOT NULL, package_name VARCHAR(180) NOT NULL, total_sessions INT NOT NULL DEFAULT 0, used_sessions INT NOT NULL DEFAULT 0, remaining_sessions INT NOT NULL DEFAULT 0, purchase_date DATE NULL, expires_at DATE NULL, paid_value DECIMAL(12,2) NOT NULL DEFAULT 0, status VARCHAR(16) NOT NULL DEFAULT 'active', order_id VARCHAR(255) NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (customer_id), INDEX (business_id))");
  $db->query("CREATE TABLE IF NOT EXISTS salon_bookings (id VARCHAR(255) PRIMARY KEY, booking_number VARCHAR(32) NOT NULL, customer_id VARCHAR(255) NOT NULL, customer_name VARCHAR(180) NULL, staff_id VARCHAR(255) NULL, staff_name VARCHAR(180) NULL, branch_id VARCHAR(255) NULL, booking_date DATE NOT NULL, start_time VARCHAR(8) NOT NULL, duration_min INT NOT NULL DEFAULT 30, status VARCHAR(24) NOT NULL DEFAULT 'pending', coupon_code VARCHAR(40) NULL, coupon_pct DECIMAL(8,2) NOT NULL DEFAULT 0, subtotal DECIMAL(12,2) NOT NULL DEFAULT 0, gst DECIMAL(12,2) NOT NULL DEFAULT 0, total DECIMAL(12,2) NOT NULL DEFAULT 0, advance_mode VARCHAR(16) NOT NULL DEFAULT 'none', advance_value DECIMAL(12,2) NOT NULL DEFAULT 0, advance_paid DECIMAL(12,2) NOT NULL DEFAULT 0, paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0, balance_due DECIMAL(12,2) NOT NULL DEFAULT 0, previous_due DECIMAL(12,2) NOT NULL DEFAULT 0, package_id VARCHAR(255) NULL, recurring_rule VARCHAR(40) NULL, notes TEXT NULL, sales_order_id VARCHAR(255) NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), INDEX (business_id), INDEX (booking_date), INDEX (customer_id))");
  $db->query("CREATE TABLE IF NOT EXISTS salon_booking_lines (id VARCHAR(255) PRIMARY KEY, booking_id VARCHAR(255) NOT NULL, item_id VARCHAR(255) NULL, name VARCHAR(180) NOT NULL, qty INT NOT NULL DEFAULT 1, duration_min INT NOT NULL DEFAULT 30, price DECIMAL(12,2) NOT NULL DEFAULT 0, discount_pct DECIMAL(8,2) NOT NULL DEFAULT 0, gst_rate DECIMAL(8,2) NOT NULL DEFAULT 0, staff_id VARCHAR(255) NULL, business_id VARCHAR(255) NOT NULL, INDEX (booking_id))");
  $db->query("CREATE TABLE IF NOT EXISTS salon_booking_payments (id VARCHAR(255) PRIMARY KEY, booking_id VARCHAR(255) NOT NULL, customer_id VARCHAR(255) NULL, kind VARCHAR(24) NOT NULL DEFAULT 'advance', amount DECIMAL(12,2) NOT NULL DEFAULT 0, method VARCHAR(32) NOT NULL DEFAULT 'upi', reference VARCHAR(80) NULL, receipt_no VARCHAR(32) NULL, txn_id VARCHAR(64) NULL, ledger_id VARCHAR(255) NULL, invoice_id VARCHAR(255) NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (booking_id), INDEX (business_id))");
  $db->query("CREATE TABLE IF NOT EXISTS salon_otps (id VARCHAR(255) PRIMARY KEY, email VARCHAR(160) NOT NULL, mobile VARCHAR(32) NULL, code_hash VARCHAR(255) NOT NULL, purpose VARCHAR(24) NOT NULL DEFAULT 'login', business_id VARCHAR(255) NOT NULL, expires_at TIMESTAMP(3) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (email), INDEX (business_id))");
  $db->query("CREATE TABLE IF NOT EXISTS salon_sessions (id VARCHAR(255) PRIMARY KEY, token_hash VARCHAR(64) NOT NULL, customer_id VARCHAR(255) NOT NULL, business_id VARCHAR(255) NOT NULL, expires_at TIMESTAMP(3) NOT NULL, INDEX (token_hash))");
  $db->query("CREATE TABLE IF NOT EXISTS salon_waitlist (id VARCHAR(255) PRIMARY KEY, customer_id VARCHAR(255) NOT NULL, item_id VARCHAR(255) NULL, staff_id VARCHAR(255) NULL, booking_date DATE NOT NULL, notes TEXT NULL, status VARCHAR(16) NOT NULL DEFAULT 'open', business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (business_id))");
  $db->query("CREATE TABLE IF NOT EXISTS salon_notifications (id VARCHAR(255) PRIMARY KEY, kind VARCHAR(32) NOT NULL, channel VARCHAR(16) NOT NULL, customer_id VARCHAR(255) NULL, booking_id VARCHAR(255) NULL, body TEXT NULL, status VARCHAR(16) NOT NULL DEFAULT 'queued', business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (business_id))");
}

function pos_salon_public_dispatch($path, $method, $body) {
  if (!preg_match("#^salon/public/([^/]+)(/.*)?$#", $path, $m)) return false;
  pos_salon_ensure();
  $shop = $m[1];
  $rest = trim($m[2] ?? "", "/");
  if ($method === "GET" && $rest === "") {
    $items = pos_q("SELECT i.id, i.name, i.category, i.retail_rate AS price, i.gst_rate, COALESCE(m.duration_min,30) AS duration_min, COALESCE(m.online_booking,1) AS online_booking FROM items i LEFT JOIN salon_service_meta m ON m.item_id=i.id WHERE i.business_id=?", "s", [$shop]);
    $staff = pos_q("SELECT id, TRIM(CONCAT_WS(' ', first_name, last_name)) AS name, role FROM staff_users WHERE business_id=?", "s", [$shop]);
    $packages = pos_q("SELECT * FROM salon_packages WHERE business_id=? AND status='active'", "s", [$shop]);
    $biz = pos_q("SELECT id, name, category, address, mobile FROM businesses WHERE id=?", "s", [$shop]);
    pos_send(200, ["shop" => $biz[0] ?? ["id" => $shop], "items" => $items, "staff" => $staff, "packages" => $packages]);
  }
  if ($method === "GET" && $rest === "slots") {
    pos_send(200, ["slots" => [["date" => $_GET["date"] ?? "", "start" => "10:00", "duration_min" => 30, "available" => true]]]);
  }
  pos_send(404, ["error" => "Salon route not found", "php" => true]);
  return true;
}

function pos_salon_staff_dispatch($path, $method, $body, $bid, $auth) {
  if (strpos($path, "salon/") !== 0 || strpos($path, "salon/public/") === 0) return false;
  pos_salon_ensure();
  if ($path === "salon/board" && $method === "GET") {
    $n = pos_q("SELECT COUNT(*) n FROM salon_bookings WHERE business_id=?", "s", [$bid]);
    pos_send(200, ["stats" => ["todayBookings" => (int) ($n[0]["n"] ?? 0)], "cards" => [], "bookings" => pos_q("SELECT * FROM salon_bookings WHERE business_id=? ORDER BY created_at DESC LIMIT 80", "s", [$bid]), "reports" => []]);
  }
  if ($path === "salon/bookings" && $method === "GET") {
    pos_send(200, pos_q("SELECT * FROM salon_bookings WHERE business_id=? ORDER BY booking_date DESC LIMIT 300", "s", [$bid]));
  }
  if ($path === "salon/packages" && $method === "GET") {
    pos_send(200, pos_q("SELECT * FROM salon_packages WHERE business_id=?", "s", [$bid]));
  }
  return false;
}
