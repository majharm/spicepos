<?php
require_once __DIR__ . "/pos-php-scrypt.php";

function pos_env($key, $default = "") {
  foreach ([getenv($key), $_ENV[$key] ?? null, $_SERVER[$key] ?? null] as $v) {
    if ($v !== false && $v !== null && $v !== "") return (string) $v;
  }
  return $default;
}

function pos_set_env($key, $value) {
  $key = trim((string) $key);
  if ($key === "" || $value === null) return;
  $value = (string) $value;
  if (pos_env($key) !== "") return;
  putenv($key . "=" . $value);
  $_ENV[$key] = $value;
}

function pos_parse_env_text($raw) {
  foreach (preg_split("/\r\n|\n|\r/", (string) $raw) as $line) {
    $line = trim($line);
    if ($line === "" || $line[0] === "#") continue;
    if (stripos($line, "export ") === 0) $line = trim(substr($line, 7));
    if (strpos($line, "=") === false) continue;
    [$k, $v] = explode("=", $line, 2);
    $k = trim($k);
    $v = trim($v);
    if ($v !== "" && (($v[0] === '"' && substr($v, -1) === '"') || ($v[0] === "'" && substr($v, -1) === "'"))) {
      $v = substr($v, 1, -1);
    }
    pos_set_env($k, $v);
  }
}

function pos_config_roots() {
  $out = [];
  $add = function ($p) use (&$out) {
    $p = rtrim(str_replace("\\", "/", (string) $p), "/");
    if ($p !== "" && is_dir($p)) $out[$p] = $p;
  };
  $add(__DIR__);
  $add($_SERVER["DOCUMENT_ROOT"] ?? "");
  if (!empty($_SERVER["SCRIPT_FILENAME"])) $add(dirname($_SERVER["SCRIPT_FILENAME"]));
  $add(getcwd());
  $home = (string) (getenv("HOME") ?: ($_SERVER["HOME"] ?? ""));
  $add($home);
  $add($home . "/public_html");
  if ($home) {
    foreach (glob($home . "/domains/*/public_html") ?: [] as $d) $add($d);
  }
  return array_values($out);
}

function pos_apply_db_map($map) {
  if (!is_array($map)) return;
  foreach ($map as $k => $v) pos_set_env($k, $v);
}

function pos_include_db_php($file) {
  if (!is_file($file) || !is_readable($file)) return;
  $map = null;
  try {
    $map = include $file;
  } catch (Throwable $e) {
    $map = null;
  }
  if (is_array($map)) {
    pos_apply_db_map($map);
    return;
  }
  pos_parse_env_text((string) @file_get_contents($file));
}

function pos_load_dotenv($force = false) {
  static $done = false;
  if ($done && !$force) return;
  $done = true;
  $roots = pos_config_roots();
  foreach ($roots as $root) {
    pos_include_db_php($root . "/pos-db.php");
    foreach (["/.env", "/pos.env", "/pos-db.json"] as $rel) {
      $file = $root . $rel;
      if (!is_file($file) || !is_readable($file)) continue;
      if (substr($file, -5) === ".json") {
        $j = json_decode((string) @file_get_contents($file), true);
        pos_apply_db_map(is_array($j) ? $j : []);
      } else {
        pos_parse_env_text((string) @file_get_contents($file));
      }
    }
  }
}

function pos_write_dir() {
  foreach (pos_config_roots() as $root) {
    if (is_writable($root)) return $root;
  }
  return __DIR__;
}

function pos_mysql_configured($c) {
  return ($c["name"] ?? "") !== "" && ($c["user"] ?? "") !== "";
}

function pos_setup_payload($error) {
  return [
    "error" => $error,
    "php" => true,
    "setup" => "/setup.html",
    "hint" => "Open /setup.html on this domain, enter localhost plus the MySQL name, user and password from hPanel → Databases, then Save.",
  ];
}

function pos_db_cfg() {
  pos_load_dotenv();
  $url = pos_env("DATABASE_URL", pos_env("MYSQL_URL"));
  $cfg = [
    "host" => pos_env("DB_HOST", pos_env("MYSQL_HOST", "localhost")),
    "port" => (int) pos_env("DB_PORT", pos_env("MYSQL_PORT", "3306")),
    "name" => pos_env("DB_NAME", pos_env("MYSQL_DATABASE", pos_env("MYSQL_DB"))),
    "user" => pos_env("DB_USER", pos_env("MYSQL_USER")),
    "pass" => pos_env("DB_PASSWORD", pos_env("DB_PASS", pos_env("MYSQL_PASSWORD"))),
  ];
  if ($url && preg_match("#^mysql://#i", $url)) {
    $p = parse_url($url);
    if (!empty($p["host"])) $cfg["host"] = $p["host"];
    if (!empty($p["port"])) $cfg["port"] = (int) $p["port"];
    if (!empty($p["user"])) $cfg["user"] = urldecode($p["user"]);
    if (isset($p["pass"])) $cfg["pass"] = urldecode($p["pass"]);
    $cfg["name"] = ltrim((string) ($p["path"] ?? ""), "/");
  }
  if ($cfg["host"] === "" || $cfg["host"] === "127.0.0.1") $cfg["host"] = "localhost";
  return $cfg;
}

function pos_shop_timezone() {
  return pos_env("POS_TIMEZONE", "Asia/Kolkata");
}

function pos_shop_tz_offset() {
  return pos_env("POS_TZ_OFFSET", "+05:30");
}

function pos_timezone_options() {
  return [
    ["Asia/Kolkata", "India (IST, UTC+5:30)", "+05:30"],
    ["Asia/Dubai", "UAE (UTC+4)", "+04:00"],
    ["Asia/Singapore", "Singapore (UTC+8)", "+08:00"],
    ["Asia/Colombo", "Sri Lanka (UTC+5:30)", "+05:30"],
    ["Asia/Kathmandu", "Nepal (UTC+5:45)", "+05:45"],
    ["UTC", "UTC", "+00:00"],
  ];
}

function pos_tz_offset_for($timezone) {
  foreach (pos_timezone_options() as $row) {
    if ($row[0] === $timezone) return $row[2];
  }
  return pos_shop_tz_offset();
}

function pos_normalize_timezone($timezone) {
  $id = trim((string) $timezone);
  foreach (pos_timezone_options() as $row) {
    if ($row[0] === $id) return $id;
  }
  return pos_shop_timezone();
}

function pos_company_timezone($company = []) {
  $tz = !empty($company["timezone"]) ? (string) $company["timezone"] : pos_shop_timezone();
  $tz = pos_normalize_timezone($tz);
  $off = !empty($company["tz_offset"]) ? (string) $company["tz_offset"] : pos_tz_offset_for($tz);
  return ["timezone" => $tz, "tz_offset" => $off];
}

function pos_apply_business_timezone($businessId) {
  pos_ensure_company_timezone_columns();
  $rows = pos_q("SELECT timezone, tz_offset FROM company_settings WHERE business_id = ? LIMIT 1", "s", [$businessId]);
  $meta = pos_company_timezone($rows[0] ?? []);
  $db = pos_db();
  $off = $meta["tz_offset"];
  if ($off !== "") @$db->query("SET time_zone = '" . $db->real_escape_string($off) . "'");
  return $meta;
}

function pos_ensure_company_timezone_columns() {
  static $done = false;
  if ($done) return;
  $done = true;
  $db = pos_db();
  foreach (["timezone" => "VARCHAR(64) NULL", "tz_offset" => "VARCHAR(8) NULL"] as $name => $def) {
    $res = $db->query("SHOW COLUMNS FROM company_settings LIKE '" . $db->real_escape_string($name) . "'");
    if ($res && $res->num_rows === 0) {
      @$db->query("ALTER TABLE company_settings ADD COLUMN `{$name}` {$def}");
    }
    if ($res) $res->free();
  }
}

function pos_ensure_staff_session_columns() {
  static $done = false;
  if ($done) return;
  $done = true;
  $db = pos_db();
  foreach ([
    "ip" => "VARCHAR(64) NULL",
    "user_agent" => "VARCHAR(255) NULL",
    "branch_id" => "VARCHAR(255) NULL",
    "impersonator_admin_id" => "VARCHAR(255) NULL",
  ] as $name => $def) {
    $res = $db->query("SHOW COLUMNS FROM staff_sessions LIKE '" . $db->real_escape_string($name) . "'");
    if ($res && $res->num_rows === 0) {
      @$db->query("ALTER TABLE staff_sessions ADD COLUMN `{$name}` {$def}");
    }
    if ($res) $res->free();
  }
}

function pos_issue_staff_session($user, $branchId, $impersonatorAdminId = null) {
  pos_ensure_staff_session_columns();
  $oldSid = pos_cookie("pos_sid");
  if ($oldSid !== "") {
    try {
      pos_q("UPDATE staff_sessions SET revoked_at = NOW() WHERE token_hash = ?", "s", [pos_sha256($oldSid)]);
    } catch (Exception $e) { /* ignore */ }
  }
  $token = pos_new_token();
  $sid = pos_uuid();
  $ttl = 12 * 3600;
  if ($impersonatorAdminId) {
    pos_q(
      "INSERT INTO staff_sessions (id, staff_user_id, token_hash, expires_at, business_id, ip, user_agent, branch_id, impersonator_admin_id)
       VALUES (?,?,?,DATE_ADD(NOW(), INTERVAL ? SECOND),?,?,?,?,?)",
      "sssisssss",
      [$sid, $user["id"], pos_sha256($token), $ttl, $user["business_id"], pos_ip(), pos_ua(), $branchId, $impersonatorAdminId]
    );
  } else {
    pos_q(
      "INSERT INTO staff_sessions (id, staff_user_id, token_hash, expires_at, business_id, ip, user_agent, branch_id)
       VALUES (?,?,?,DATE_ADD(NOW(), INTERVAL ? SECOND),?,?,?,?)",
      "sssissss",
      [$sid, $user["id"], pos_sha256($token), $ttl, $user["business_id"], pos_ip(), pos_ua(), $branchId]
    );
  }
  pos_set_cookie("pos_sid", $token, $ttl);
  return $token;
}

function pos_db() {
  static $db = null;
  if ($db instanceof mysqli) return $db;
  if (!class_exists("mysqli")) throw new Exception("PHP mysqli is not enabled");
  $c = pos_db_cfg();
  if (!pos_mysql_configured($c)) {
    throw new Exception("Open /setup.html and save MySQL settings (DB_HOST=localhost, database name, user, password from hPanel).");
  }
  mysqli_report(MYSQLI_REPORT_OFF);
  $db = @new mysqli($c["host"], $c["user"], $c["pass"], $c["name"], $c["port"] ?: 3306);
  if ($db->connect_errno) {
    throw new Exception("MySQL connect failed. Check DB_* in .env (host is usually localhost on Hostinger).");
  }
  $db->set_charset("utf8mb4");
  $tz = pos_shop_tz_offset();
  if ($tz !== "") @$db->query("SET time_zone = '" . $db->real_escape_string($tz) . "'");
  return $db;
}

function pos_q($sql, $types = "", $params = []) {
  $db = pos_db();
  foreach ($params as $i => $p) {
    if ($p === null) $params[$i] = "";
  }
  if ($types === "") {
    $res = $db->query($sql);
    if ($res === false) throw new Exception("SQL error");
    if ($res === true) return [];
    $rows = $res->fetch_all(MYSQLI_ASSOC);
    $res->free();
    return $rows;
  }
  $st = $db->prepare($sql);
  if (!$st) throw new Exception("SQL error");
  $bind = [];
  foreach ($params as $i => $p) {
    $params[$i] = $p;
    $bind[] = &$params[$i];
  }
  array_unshift($bind, $types);
  call_user_func_array([$st, "bind_param"], $bind);
  if (!$st->execute()) {
    $err = $st->error;
    $st->close();
    throw new Exception($err ?: "SQL error");
  }
  $res = $st->get_result();
  $rows = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
  $st->close();
  return $rows;
}

function pos_with_transaction(callable $fn) {
  $db = pos_db();
  $db->begin_transaction();
  try {
    $out = $fn();
    $db->commit();
    return $out;
  } catch (Throwable $e) {
    $db->rollback();
    throw $e;
  }
}

function pos_line_amount($quantityGm, $ratePerKg) {
  return ((float) $quantityGm / 1000) * (float) $ratePerKg;
}

function pos_uuid() {
  $d = random_bytes(16);
  $d[6] = chr((ord($d[6]) & 0x0f) | 0x40);
  $d[8] = chr((ord($d[8]) & 0x3f) | 0x80);
  $h = bin2hex($d);
  return substr($h, 0, 8) . "-" . substr($h, 8, 4) . "-" . substr($h, 12, 4) . "-" . substr($h, 16, 4) . "-" . substr($h, 20, 12);
}

function pos_sha256($v) {
  return hash("sha256", (string) $v);
}

function pos_new_token() {
  return bin2hex(random_bytes(32));
}

function pos_json_body($raw) {
  $j = json_decode((string) $raw, true);
  return is_array($j) ? $j : [];
}

function pos_remember($body) {
  $v = $body["remember"] ?? false;
  return $v === true || $v === "true" || $v === "1" || $v === "on";
}

function pos_ttl($remember) {
  return $remember ? 30 * 24 * 3600 : 12 * 3600;
}

function pos_secure_cookie() {
  $proto = strtolower(explode(",", (string) ($_SERVER["HTTP_X_FORWARDED_PROTO"] ?? ""))[0]);
  return pos_env("COOKIE_SECURE") === "1" || $proto === "https" || (!empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off");
}

function pos_set_cookie($name, $value, $ttl) {
  $ttl = (int) $ttl;
  $secure = pos_secure_cookie() ? "; Secure" : "";
  $exp = gmdate("D, d M Y H:i:s", time() + $ttl) . " GMT";
  header(
    "Set-Cookie: " . $name . "=" . rawurlencode($value) .
    "; Expires=" . $exp . "; Max-Age=" . $ttl . "; Path=/; HttpOnly; SameSite=Lax" . $secure,
    false
  );
}

function pos_clear_cookie($name) {
  $secure = pos_secure_cookie() ? "; Secure" : "";
  header(
    "Set-Cookie: " . $name . "=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/; HttpOnly; SameSite=Lax" . $secure,
    false
  );
}

function pos_ip() {
  $xff = explode(",", (string) ($_SERVER["HTTP_X_FORWARDED_FOR"] ?? ""));
  $ip = trim($xff[0]);
  return $ip !== "" ? $ip : (string) ($_SERVER["REMOTE_ADDR"] ?? "");
}

function pos_ua() {
  return substr((string) ($_SERVER["HTTP_USER_AGENT"] ?? ""), 0, 250);
}

function pos_cookie($name) {
  return isset($_COOKIE[$name]) ? (string) $_COOKIE[$name] : "";
}

function pos_public_status($b) {
  if (!$b) return "inactive";
  $st = (string) ($b["status"] ?? "");
  if ($st === "suspended" || $st === "inactive") return $st;
  if (!empty($b["subscription_expires_at"])) {
    $exp = strtotime($b["subscription_expires_at"]);
    if ($exp && $exp < time()) return "expired";
  }
  return $st !== "" ? $st : "active";
}

function pos_display_name($u) {
  $joined = trim(($u["first_name"] ?? "") . " " . ($u["last_name"] ?? ""));
  return $joined !== "" ? $joined : ($u["email"] ?? "User");
}

function pos_parse_perms($user) {
  $defaults = pos_default_perms($user["role"] ?? "staff");
  $parsed = [];
  if (!empty($user["permissions_json"])) {
    $p = json_decode($user["permissions_json"], true);
    if (is_array($p)) $parsed = $p;
  }
  foreach ($defaults as $key => $value) {
    if (!array_key_exists($key, $parsed)) $parsed[$key] = $value;
  }
  return $parsed;
}

function pos_staff_me_payload($staff) {
  $status = pos_public_status($staff["business"]);
  $plan = null;
  if (!empty($staff["business"]["plan_id"])) {
    $pr = pos_q("SELECT id, code, name, fee_monthly FROM subscription_plans WHERE id = ? LIMIT 1", "s", [$staff["business"]["plan_id"]]);
    $plan = $pr[0] ?? null;
  }
  return [
    "ok" => true,
    "type" => "staff",
    "user" => [
      "id" => $staff["user"]["id"],
      "email" => $staff["user"]["email"],
      "name" => pos_display_name($staff["user"]),
      "role" => $staff["user"]["role"],
      "permissions" => pos_parse_perms($staff["user"]),
      "branch_id" => $staff["branchId"],
    ],
    "business" => [
      "id" => $staff["business"]["id"] ?? null,
      "name" => $staff["business"]["name"] ?? null,
      "status" => $status,
      "plan_id" => $staff["business"]["plan_id"] ?? null,
      "subscription_expires_at" => $staff["business"]["subscription_expires_at"] ?? null,
    ],
    "plan" => $plan,
    "devToolsAllowed" => pos_env("POS_DEV_TOOLS", "1") !== "0",
    "impersonating" => !empty($staff["impersonatorAdminId"]),
    "impersonator" => $staff["impersonator"] ?? null,
  ];
}

function pos_default_perms($role) {
  $all = [
    "dashboard" => true, "counter" => true, "items" => true, "customers" => true, "packs" => true,
    "orders" => true, "purchases" => true, "suppliers" => true, "stock" => true, "staff" => true,
    "branches" => true, "devices" => true, "reports" => true, "accounts" => true, "settings" => true,
    "support" => true, "discount" => true,
  ];
  if ($role === "business_admin") return $all;
  if ($role === "branch_manager" || $role === "manager") {
    return array_merge($all, [
      "staff" => $role === "branch_manager",
      "settings" => $role === "branch_manager",
      "discount" => true,
      "accounts" => true,
    ]);
  }
  if ($role === "cashier") {
    return ["dashboard" => true, "counter" => true, "customers" => true, "orders" => true, "support" => true];
  }
  if ($role === "stock_manager") {
    return ["dashboard" => true, "items" => true, "stock" => true, "purchases" => true, "suppliers" => true, "reports" => true, "support" => true];
  }
  if ($role === "accountant") {
    return ["dashboard" => true, "reports" => true, "accounts" => true, "purchases" => true, "suppliers" => true, "customers" => true, "orders" => true, "support" => true];
  }
  return ["dashboard" => true, "counter" => true, "support" => true];
}

function pos_can($user, $module) {
  if (($user["role"] ?? "") === "business_admin") return true;
  $perms = pos_parse_perms($user);
  return !empty($perms[$module]);
}

function pos_ensure_accounts_schema() {
  static $done = false;
  if ($done) return;
  $done = true;
  $db = pos_db();
  $res = $db->query("SHOW COLUMNS FROM suppliers LIKE 'payable_balance'");
  if ($res && $res->num_rows === 0) {
    @$db->query("ALTER TABLE suppliers ADD COLUMN payable_balance DECIMAL(12,2) NOT NULL DEFAULT 0");
  }
  if ($res) $res->free();
  @$db->query(
    "CREATE TABLE IF NOT EXISTS account_ledger (
      id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      entry_no VARCHAR(32) NOT NULL,
      entry_type VARCHAR(32) NOT NULL,
      party_type VARCHAR(16) NOT NULL,
      party_id VARCHAR(255) NOT NULL,
      party_name VARCHAR(255) NULL,
      amount DECIMAL(12,2) NOT NULL,
      payment_method VARCHAR(32) NULL,
      reference_type VARCHAR(32) NULL,
      reference_id VARCHAR(255) NULL,
      notes TEXT NULL,
      created_by VARCHAR(255) NULL,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_account_ledger_biz_date (business_id, created_at),
      INDEX idx_account_ledger_party (business_id, party_type, party_id)
    )"
  );
  @$db->query(
    "CREATE TABLE IF NOT EXISTS chart_of_accounts (
      id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      code VARCHAR(16) NOT NULL,
      name VARCHAR(255) NOT NULL,
      account_group VARCHAR(32) NOT NULL,
      parent_id VARCHAR(255) NULL,
      is_system TINYINT NOT NULL DEFAULT 0,
      active TINYINT NOT NULL DEFAULT 1,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_coa_biz_code (business_id, code),
      INDEX idx_coa_biz_group (business_id, account_group)
    )"
  );
  @$db->query(
    "CREATE TABLE IF NOT EXISTS journal_entries (
      id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      voucher_no VARCHAR(32) NOT NULL,
      voucher_date DATE NOT NULL,
      voucher_type VARCHAR(32) NOT NULL,
      narration TEXT NULL,
      reference_type VARCHAR(32) NULL,
      reference_id VARCHAR(255) NULL,
      created_by VARCHAR(255) NULL,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_journal_biz_date (business_id, voucher_date),
      INDEX idx_journal_ref (business_id, reference_type, reference_id)
    )"
  );
  @$db->query(
    "CREATE TABLE IF NOT EXISTS journal_lines (
      id VARCHAR(255) PRIMARY KEY,
      journal_id VARCHAR(255) NOT NULL,
      account_id VARCHAR(255) NOT NULL,
      debit DECIMAL(12,2) NOT NULL DEFAULT 0,
      credit DECIMAL(12,2) NOT NULL DEFAULT 0,
      business_id VARCHAR(255) NOT NULL,
      INDEX idx_jline_journal (journal_id),
      INDEX idx_jline_account (business_id, account_id)
    )"
  );
}

function pos_next_seq($name, $businessId, $start = 1001) {
  pos_ensure_accounts_schema();
  $seq = pos_q("SELECT next_value FROM number_sequences WHERE name = ? AND business_id = ? LIMIT 1", "ss", [$name, $businessId]);
  $next = $seq ? (int) $seq[0]["next_value"] : $start;
  if ($seq) {
    pos_q("UPDATE number_sequences SET next_value = ? WHERE name = ? AND business_id = ?", "iss", [$next + 1, $name, $businessId]);
  } else {
    try {
      pos_q("INSERT INTO number_sequences (name, next_value, business_id) VALUES (?,?,?)", "sis", [$name, $next + 1, $businessId]);
    } catch (Exception $e) { /* ignore */ }
  }
  return $next;
}

function pos_insert_ledger($row, $businessId, $createdBy = null) {
  pos_ensure_accounts_schema();
  $id = pos_uuid();
  pos_q(
    "INSERT INTO account_ledger (
       id, business_id, entry_no, entry_type, party_type, party_id, party_name,
       amount, payment_method, reference_type, reference_id, notes, created_by
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    "sssssssdsssss",
    [
      $id, $businessId, $row["entry_no"], $row["entry_type"], $row["party_type"], $row["party_id"],
      $row["party_name"] ?? null, (float) $row["amount"], $row["payment_method"] ?? null,
      $row["reference_type"] ?? null, $row["reference_id"] ?? null, $row["notes"] ?? null, $createdBy,
    ]
  );
  return $id;
}

function pos_record_credit_sale($customer, $total, $orderId, $orderNumber, $method, $businessId, $uid = null) {
  if ($method !== "credit") return;
  $amt = pos_round2($total);
  $current = pos_round2((float) ($customer["outstanding"] ?? 0));
  $next = pos_round2($current + $amt);
  $limit = (float) ($customer["credit_limit"] ?? 0);
  if ($limit > 0 && $next > $limit) {
    throw new Exception("Credit limit exceeded (limit ₹" . number_format($limit, 2) . ", outstanding would be ₹" . number_format($next, 2) . ")");
  }
  pos_q("UPDATE customers SET outstanding = ? WHERE id = ? AND business_id = ?", "dss", [$next, $customer["id"], $businessId]);
  $n = pos_next_seq("account", $businessId, 1001);
  pos_insert_ledger([
    "entry_no" => "JV-{$n}",
    "entry_type" => "sale_credit",
    "party_type" => "customer",
    "party_id" => $customer["id"],
    "party_name" => $customer["business_name"] ?? $customer["name"],
    "amount" => $amt,
    "payment_method" => "credit",
    "reference_type" => "sales_order",
    "reference_id" => $orderId,
    "notes" => $orderNumber,
  ], $businessId, $uid);
}

function pos_record_credit_purchase($supplier, $total, $purchaseId, $purchaseNumber, $method, $businessId, $uid = null) {
  if ($method !== "credit") return;
  $amt = pos_round2($total);
  pos_q("UPDATE suppliers SET payable_balance = COALESCE(payable_balance,0) + ? WHERE id = ? AND business_id = ?", "dss", [$amt, $supplier["id"], $businessId]);
  $n = pos_next_seq("account", $businessId, 1001);
  pos_insert_ledger([
    "entry_no" => "JV-{$n}",
    "entry_type" => "purchase_credit",
    "party_type" => "supplier",
    "party_id" => $supplier["id"],
    "party_name" => $supplier["name"],
    "amount" => $amt,
    "payment_method" => "credit",
    "reference_type" => "purchase",
    "reference_id" => $purchaseId,
    "notes" => $purchaseNumber,
  ], $businessId, $uid);
}


function pos_send($status, $payload) {
  http_response_code((int) $status);
  header("Content-Type: application/json; charset=utf-8");
  echo json_encode($payload, JSON_UNESCAPED_UNICODE);
  exit;
}

function pos_send_file($status, $contentType, $filename, $body) {
  http_response_code((int) $status);
  header("Content-Type: " . $contentType);
  header('Content-Disposition: attachment; filename="' . str_replace(['"', "\r", "\n"], "", (string) $filename) . '"');
  echo $body;
  exit;
}

function pos_master_session() {
  $token = pos_cookie("pos_master");
  if ($token === "") return null;
  $hash = pos_sha256($token);
  $rows = pos_q(
    "SELECT s.*, a.email, a.name, a.status
     FROM platform_sessions s
     JOIN platform_admins a ON a.id = s.admin_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > NOW() LIMIT 1",
    "s",
    [$hash]
  );
  $row = $rows[0] ?? null;
  if (!$row || ($row["status"] ?? "") !== "active") return null;
  return ["type" => "master", "admin" => ["id" => $row["admin_id"], "email" => $row["email"], "name" => $row["name"]]];
}

function pos_staff_session() {
  $token = pos_cookie("pos_sid");
  if ($token === "") return null;
  pos_ensure_staff_session_columns();
  $hash = pos_sha256($token);
  $rows = pos_q(
    "SELECT s.*, u.email, u.first_name, u.last_name, u.role, u.status AS user_status,
            u.business_id, u.branch_id AS user_branch_id, u.permissions_json, u.clerk_user_id, u.id AS staff_id
     FROM staff_sessions s
     JOIN staff_users u ON u.id = s.staff_user_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > NOW() LIMIT 1",
    "s",
    [$hash]
  );
  $row = $rows[0] ?? null;
  if (!$row || ($row["user_status"] ?? "") !== "active") return null;
  $biz = pos_q("SELECT * FROM businesses WHERE id = ? LIMIT 1", "s", [$row["business_id"]]);
  $impersonator = null;
  if (!empty($row["impersonator_admin_id"])) {
    $adm = pos_q("SELECT id, email, name FROM platform_admins WHERE id = ? LIMIT 1", "s", [$row["impersonator_admin_id"]]);
    $impersonator = $adm[0] ?? ["id" => $row["impersonator_admin_id"]];
  }
  return [
    "type" => "staff",
    "impersonatorAdminId" => $row["impersonator_admin_id"] ?? null,
    "impersonator" => $impersonator,
    "user" => [
      "id" => $row["staff_id"],
      "clerk_user_id" => $row["clerk_user_id"],
      "email" => $row["email"],
      "first_name" => $row["first_name"],
      "last_name" => $row["last_name"],
      "role" => $row["role"],
      "business_id" => $row["business_id"],
      "branch_id" => $row["branch_id"] ?: $row["user_branch_id"],
      "permissions_json" => $row["permissions_json"],
    ],
    "business" => $biz[0] ?? null,
    "branchId" => $row["branch_id"] ?: $row["user_branch_id"],
  ];
}

function pos_require_master($path) {
  if (strpos($path, "master/") !== 0) return pos_master_session() ?: pos_staff_session();
  $auth = pos_master_session();
  if (!$auth) pos_send(401, ["error" => "Master admin sign in required"]);
  return $auth;
}

function pos_pick($body, ...$keys) {
  foreach ($keys as $k) {
    if (isset($body[$k]) && trim((string) $body[$k]) !== "") return $body[$k];
  }
  return "";
}

function pos_normalize_date_only($val) {
  if ($val === null || $val === "") return null;
  $s = trim((string) $val);
  if (preg_match('/^\d{4}-\d{2}-\d{2}/', $s)) return substr($s, 0, 10);
  $ts = strtotime($s);
  if ($ts === false) return null;
  return gmdate("Y-m-d", $ts);
}

function pos_validate_signup($raw, $requireAdmin = true) {
  $b = [
    "name" => pos_pick($raw, "name", "businessName"),
    "business_type" => pos_pick($raw, "business_type", "businessType"),
    "category" => pos_pick($raw, "category", "businessCategory"),
    "owner_name" => pos_pick($raw, "owner_name", "ownerName"),
    "mobile" => pos_pick($raw, "mobile"),
    "email" => pos_pick($raw, "email", "admin_email"),
    "gstin" => pos_pick($raw, "gstin", "gstNumber"),
    "pan" => pos_pick($raw, "pan", "panNumber"),
    "address" => pos_pick($raw, "address"),
    "city" => pos_pick($raw, "city"),
    "state" => pos_pick($raw, "state"),
    "pin_code" => pos_pick($raw, "pin_code", "pinCode"),
    "logo_url" => pos_pick($raw, "logo_url", "logoDataUrl"),
    "username" => pos_pick($raw, "username", "adminUsername", "admin_username"),
    "password" => pos_pick($raw, "password", "admin_password"),
    "confirm_password" => pos_pick($raw, "confirm_password", "confirmPassword", "admin_password_confirm"),
    "plan_id" => pos_pick($raw, "plan_id"),
    "subscription_expires_at" => pos_pick($raw, "subscription_expires_at"),
    "status" => pos_pick($raw, "status"),
  ];
  $required = ["name", "business_type", "category", "owner_name", "mobile", "email", "address", "city", "state", "pin_code"];
  if ($requireAdmin) {
    $required[] = "username";
    $required[] = "password";
  }
  foreach ($required as $key) {
    if (trim((string) ($b[$key] ?? "")) === "") throw new Exception(str_replace("_", " ", $key) . " is required");
  }
  if ($requireAdmin || $b["password"] || $b["confirm_password"]) {
    if (!$requireAdmin && ($b["password"] || $b["confirm_password"])) {
      if (!$b["password"] || !$b["confirm_password"]) {
        throw new Exception("Enter and confirm the new password");
      }
    }
    if ((string) $b["password"] !== (string) $b["confirm_password"]) throw new Exception("Password and confirm password do not match");
    if (strlen((string) $b["password"]) < 8) throw new Exception("Password must be at least 8 characters");
  }
  $mobile = preg_replace("/\D/", "", (string) $b["mobile"]);
  if (strlen($mobile) < 10) throw new Exception("Enter a valid mobile number");
  $email = strtolower(trim((string) $b["email"]));
  if (!preg_match("/^[^\s@]+@[^\s@]+\.[^\s@]+$/", $email)) throw new Exception("Enter a valid email ID");
  $username = strtolower(trim((string) $b["username"]));
  if (($requireAdmin || $username) && !preg_match("/^[a-z0-9._-]{3,32}$/", $username)) {
    throw new Exception("Username must be 3–32 letters, numbers, dot, dash or underscore");
  }
  $pin = preg_replace("/\D/", "", (string) $b["pin_code"]);
  if (strlen($pin) !== 6) throw new Exception("PIN code must be 6 digits");
  $logo = $b["logo_url"] ? (string) $b["logo_url"] : "";
  if ($logo && strpos($logo, "data:image/") !== 0) throw new Exception("Logo must be an uploaded image");
  $status = trim((string) ($b["status"] ?: "active")) ?: "active";
  if (!in_array($status, ["active", "inactive", "suspended"], true)) throw new Exception("Invalid status");
  return [
    "name" => trim((string) $b["name"]),
    "business_type" => trim((string) $b["business_type"]),
    "category" => trim((string) $b["category"]),
    "owner_name" => trim((string) $b["owner_name"]),
    "mobile" => $mobile,
    "email" => $email,
    "gstin" => trim((string) $b["gstin"]) ?: null,
    "pan" => strtoupper(trim((string) $b["pan"])) ?: null,
    "address" => trim((string) $b["address"]),
    "city" => trim((string) $b["city"]),
    "state" => trim((string) $b["state"]),
    "pin_code" => $pin,
    "logo_url" => $logo ?: null,
    "username" => $username,
    "password" => (string) $b["password"],
    "plan_id" => trim((string) ($b["plan_id"] ?: "trial")) ?: "trial",
    "subscription_expires_at" => pos_normalize_date_only(trim((string) $b["subscription_expires_at"]) ?: null),
    "status" => $status,
  ];
}

function pos_register_business($raw) {
  $b = pos_validate_signup($raw, true);
  $taken = pos_q("SELECT id FROM staff_users WHERE email = ? LIMIT 1", "s", [$b["email"]]);
  if ($taken) throw new Exception("This email is already registered");
  $ut = pos_q("SELECT id FROM staff_users WHERE username = ? LIMIT 1", "s", [$b["username"]]);
  if ($ut) throw new Exception("This username is already taken");
  $full = $b["address"] . ", " . $b["city"] . ", " . $b["state"] . " " . $b["pin_code"];
  $id = pos_uuid();
  $code = substr("B" . strtoupper(base_convert((string) (int) (microtime(true) * 1000), 10, 36)), 0, 12);
  $shop = $b["name"];
  $nameHit = pos_q("SELECT id FROM businesses WHERE name = ? LIMIT 1", "s", [$shop]);
  if ($nameHit) $shop = $b["name"] . " (" . $b["city"] . ")";
  $planRow = pos_q("SELECT id FROM subscription_plans WHERE id = ? OR code = ? LIMIT 1", "ss", [$b["plan_id"], strtoupper($b["plan_id"])]);
  $planId = $planRow[0]["id"] ?? "trial";
  $expiry = $b["subscription_expires_at"] ?: date("Y-m-d", strtotime("+30 days"));
  $hash = pos_hash_password($b["password"]);
  $branchId = pos_uuid();
  $uid = pos_uuid();
  $perms = json_encode(pos_default_perms("business_admin"));
  pos_q(
    "INSERT INTO businesses (
       id, code, name, status, owner_name, mobile, email, address, gstin,
       business_type, plan_id, subscription_expires_at, logo_url, category, pan, city, state, pin_code
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    "ssssssssssssssssss",
    [
      $id, $code, $shop, $b["status"] ?: "active", $b["owner_name"], $b["mobile"], $b["email"], $full, $b["gstin"],
      $b["business_type"], $planId, $expiry, $b["logo_url"], $b["category"], $b["pan"], $b["city"], $b["state"], $b["pin_code"],
    ]
  );
  try {
    pos_q(
      "INSERT INTO company_settings (id, name, address, phone, email, gstin, pan, city, state, pincode, logo_url, business_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      "ssssssssssss",
      [pos_uuid(), $shop, $full, $b["mobile"], $b["email"], $b["gstin"], $b["pan"], $b["city"], $b["state"], $b["pin_code"], $b["logo_url"], $id]
    );
  } catch (Exception $e) { /* optional table */ }
  pos_q(
    "INSERT INTO branches (id, business_id, name, address, phone, status) VALUES (?,?,?,?,?, 'active')",
    "sssss",
    [$branchId, $id, "Main Branch", $full, $b["mobile"]]
  );
  try {
    pos_q(
      "INSERT INTO pos_devices (id, business_id, branch_id, name, code, status) VALUES (?,?,?,?,?, 'active')",
      "sssss",
      [pos_uuid(), $id, $branchId, "POS 01", "POS-" . $code]
    );
  } catch (Exception $e) { /* optional */ }
  pos_q(
    "INSERT INTO staff_users (
       id, clerk_user_id, email, first_name, last_name, role, status, password_hash,
       business_id, branch_id, permissions_json, username, mobile
     ) VALUES (?,?,?,?,?,?, 'active', ?,?,?,?,?,?)",
    "ssssssssssss",
    [$uid, "local:" . $uid, $b["email"], $b["owner_name"], "", "business_admin", $hash, $id, $branchId, $perms, $b["username"], $b["mobile"]]
  );
  $users = pos_q("SELECT * FROM staff_users WHERE id = ? LIMIT 1", "s", [$uid]);
  return ["businessId" => $id, "user" => $users[0]];
}

function pos_update_business($id, $raw) {
  $b = pos_validate_signup($raw, false);
  $existing = pos_q("SELECT * FROM businesses WHERE id = ? LIMIT 1", "s", [$id]);
  if (!$existing) throw new Exception("Business not found");
  $emailTaken = pos_q("SELECT id FROM staff_users WHERE email = ? AND business_id <> ? LIMIT 1", "ss", [$b["email"], $id]);
  if ($emailTaken) throw new Exception("This email is already registered");
  if ($b["username"]) {
    $userTaken = pos_q("SELECT id FROM staff_users WHERE username = ? AND business_id <> ? LIMIT 1", "ss", [$b["username"], $id]);
    if ($userTaken) throw new Exception("This username is already taken");
  }
  $planRow = pos_q("SELECT id FROM subscription_plans WHERE id = ? OR code = ? LIMIT 1", "ss", [$b["plan_id"], strtoupper($b["plan_id"])]);
  $planId = $planRow[0]["id"] ?? $existing[0]["plan_id"] ?? "trial";
  $full = $b["address"] . ", " . $b["city"] . ", " . $b["state"] . " " . $b["pin_code"];
  $logo = $b["logo_url"] ?: ($existing[0]["logo_url"] ?? null);
  $expiry = pos_normalize_date_only($b["subscription_expires_at"]) ?: pos_normalize_date_only($existing[0]["subscription_expires_at"] ?? null);
  pos_q(
    "UPDATE businesses SET name=?, owner_name=?, mobile=?, email=?, address=?, gstin=?, business_type=?,
       status=?, plan_id=?, subscription_expires_at=?, logo_url=?, category=?, pan=?, city=?, state=?, pin_code=?
     WHERE id=?",
    "sssssssssssssssss",
    [
      $b["name"], $b["owner_name"], $b["mobile"], $b["email"], $full, $b["gstin"], $b["business_type"],
      $b["status"], $planId, $expiry, $logo, $b["category"], $b["pan"], $b["city"], $b["state"], $b["pin_code"], $id,
    ]
  );
  try {
    pos_q(
      "UPDATE company_settings SET name=?, address=?, phone=?, email=?, gstin=?, pan=?, city=?, state=?, pincode=?, logo_url=? WHERE business_id=?",
      "sssssssssss",
      [$b["name"], $full, $b["mobile"], $b["email"], $b["gstin"], $b["pan"], $b["city"], $b["state"], $b["pin_code"], $logo, $id]
    );
  } catch (Exception $e) { /* optional table */ }
  $admins = pos_q("SELECT * FROM staff_users WHERE business_id = ? AND role = 'business_admin' LIMIT 1", "s", [$id]);
  if ($admins) {
    $admin = $admins[0];
    $nextUser = $b["username"] ?: ($admin["username"] ?? "");
    $nextHash = $b["password"] ? pos_hash_password($b["password"]) : $admin["password_hash"];
    pos_q(
      "UPDATE staff_users SET email=?, first_name=?, mobile=?, username=?, password_hash=?, failed_logins=0, locked_until=NULL WHERE id=?",
      "ssssss",
      [$b["email"], $b["owner_name"], $b["mobile"], $nextUser, $nextHash, $admin["id"]]
    );
  }
  $row = pos_q("SELECT * FROM businesses WHERE id = ? LIMIT 1", "s", [$id]);
  return $row[0];
}

function pos_platform_settings() {
  $rows = pos_q("SELECT setting_key, setting_value FROM platform_settings");
  $map = [];
  foreach ($rows as $r) $map[$r["setting_key"]] = $r["setting_value"] ?: "";
  return ["support_phone" => $map["support_phone"] ?? "", "support_email" => $map["support_email"] ?? ""];
}

function pos_set_setting($key, $value) {
  pos_q(
    "INSERT INTO platform_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP(3)",
    "ss",
    [$key, $value === null ? "" : trim((string) $value)]
  );
}

function pos_audit($admin, $action, $details) {
  try {
    pos_q(
      "INSERT INTO staff_audit_logs (
         id, actor_clerk_user_id, actor_name, module, target_id, target_name, action, details, business_id, ip
       ) VALUES (?,?,?,?,?,?,?,?, 'platform', ?)",
      "sssssssss",
      [
        pos_uuid(),
        $admin["id"] ?? "master",
        $admin["email"] ?? "master",
        $details["module"] ?? "master",
        $details["target_id"] ?? null,
        $details["target_name"] ?? $action,
        $action,
        json_encode($details),
        pos_ip(),
      ]
    );
  } catch (Exception $e) { /* audit is best-effort */ }
}

function pos_staff_audit($user, $action, $details, $businessId, $branchId = null) {
  try {
    $actorName = trim((string) ($user["email"] ?? ""));
    if ($actorName === "") {
      $actorName = trim(((string) ($user["first_name"] ?? "")) . " " . ((string) ($user["last_name"] ?? "")));
    }
    if ($actorName === "") $actorName = "staff";
    pos_q(
      "INSERT INTO staff_audit_logs (
         id, actor_clerk_user_id, actor_name, module, target_id, target_name, action, details, business_id, branch_id, ip
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      "sssssssssss",
      [
        pos_uuid(),
        $user["clerk_user_id"] ?? $user["id"] ?? "staff",
        $actorName,
        $details["module"] ?? "sales",
        $details["target_id"] ?? null,
        $details["target_name"] ?? $action,
        $action,
        json_encode($details),
        $businessId,
        $branchId,
        pos_ip(),
      ]
    );
  } catch (Exception $e) { /* audit is best-effort */ }
}

function pos_n($v, $fallback) {
  if ($v === null || $v === "") return $fallback;
  return (int) $v;
}

function pos_php_dispatch($path, $method, $rawBody) {
  $method = strtoupper((string) $method);
  $path = trim((string) $path, "/");
  $body = pos_json_body($rawBody);
  try {
    if ($path === "install") {
      if ($method === "GET") {
        $c = pos_db_cfg();
        pos_send(pos_mysql_configured($c) ? 200 : 503, pos_setup_payload(
          pos_mysql_configured($c)
            ? "Database settings are already present."
            : "Open /setup.html and save MySQL settings."
        ) + ["ok" => pos_mysql_configured($c), "configured" => pos_mysql_configured($c)]);
      }
      if ($method !== "POST") pos_send(405, ["error" => "Use POST"]);
      $host = trim((string) ($body["DB_HOST"] ?? $body["host"] ?? "localhost")) ?: "localhost";
      if ($host === "127.0.0.1" || $host === "::1") $host = "localhost";
      $name = trim((string) ($body["DB_NAME"] ?? $body["name"] ?? ""));
      $user = trim((string) ($body["DB_USER"] ?? $body["user"] ?? ""));
      $pass = (string) ($body["DB_PASSWORD"] ?? $body["password"] ?? "");
      $master = (string) ($body["MASTER_ADMIN_PASSWORD"] ?? $body["master_password"] ?? "");
      if ($name === "" || $user === "" || $pass === "") {
        pos_send(400, pos_setup_payload("Database name, user and password are required."));
      }
      if (!preg_match("/^[A-Za-z0-9._-]{2,80}$/", $name) || !preg_match("/^[A-Za-z0-9._-]{2,80}$/", $user)) {
        pos_send(400, pos_setup_payload("Database name and user look invalid."));
      }
      if (!preg_match("/^[A-Za-z0-9._-]{1,80}$/", $host)) {
        pos_send(400, pos_setup_payload("DB host looks invalid. Use localhost on Hostinger."));
      }
      $existing = pos_db_cfg();
      if (pos_mysql_configured($existing) && ($existing["pass"] ?? "") !== "") {
        $probe = @new mysqli($existing["host"] ?: "localhost", $existing["user"], $existing["pass"], $existing["name"], (int) ($existing["port"] ?: 3306));
        if ($probe && !$probe->connect_errno) {
          $probe->close();
          pos_send(409, ["error" => "Database is already configured.", "ok" => true, "php" => true]);
        }
      }
      $dir = pos_write_dir();
      if (!is_writable($dir)) {
        pos_send(500, pos_setup_payload("PHP cannot write files in " . $dir . ". Create pos-db.php in File Manager."));
      }
      $map = [
        "DB_HOST" => $host,
        "DB_PORT" => "3306",
        "DB_NAME" => $name,
        "DB_USER" => $user,
        "DB_PASSWORD" => $pass,
      ];
      if ($master !== "") $map["MASTER_ADMIN_PASSWORD"] = $master;
      $code = "<?php\nreturn " . var_export($map, true) . ";\n";
      if (@file_put_contents($dir . "/pos-db.php", $code, LOCK_EX) === false) {
        pos_send(500, pos_setup_payload("Could not write pos-db.php. Use File Manager."));
      }
      pos_load_dotenv(true);
      $db = @new mysqli($host, $user, $pass, $name, 3306);
      if (!$db || $db->connect_errno) {
        pos_send(503, [
          "ok" => false,
          "php" => true,
          "setup" => "/setup.html",
          "wrote" => $dir . "/pos-db.php",
          "error" => "Saved pos-db.php but MySQL connect failed. Use DB_HOST=localhost (not the public IP) and the password from hPanel → Databases.",
        ]);
      }
      $db->close();
      pos_send(200, ["ok" => true, "php" => true, "wrote" => "pos-db.php", "next" => "/master.html"]);
    }

    if ($path === "health") {
      $c = pos_db_cfg();
      if (!pos_mysql_configured($c)) {
        pos_send(503, pos_setup_payload("Open /setup.html and save MySQL settings (localhost, database name, user, password)."));
      }
      pos_q("SELECT 1");
      pos_send(200, ["ok" => true, "multiTenant" => true, "php" => true, "node" => false]);
    }
    if ($path === "support-contact" && $method === "GET") {
      pos_send(200, pos_platform_settings());
    }

    if ($path === "auth/master-login" && $method === "POST") {
      $email = strtolower(trim((string) ($body["email"] ?? "")));
      $rows = pos_q("SELECT * FROM platform_admins WHERE email = ? LIMIT 1", "s", [$email]);
      $admin = $rows[0] ?? null;
      $pass = (string) ($body["password"] ?? "");
      $envPass = pos_env("MASTER_ADMIN_PASSWORD");
      $ok = false;
      if ($admin && ($admin["status"] ?? "") === "active") {
        if ($envPass !== "" && strlen($envPass) === strlen($pass) && hash_equals($envPass, $pass)) $ok = true;
        else $ok = pos_verify_password($pass, $admin["password_hash"]);
      }
      if (!$ok) {
        pos_send(401, ["error" => "Invalid master login"]);
      }
      $ttl = pos_ttl(pos_remember($body));
      $token = pos_new_token();
      pos_q(
        "INSERT INTO platform_sessions (id, admin_id, token_hash, expires_at, ip, user_agent)
         VALUES (?,?,?,DATE_ADD(NOW(), INTERVAL ? SECOND),?,?)",
        "sssiss",
        [pos_uuid(), $admin["id"], pos_sha256($token), $ttl, pos_ip(), pos_ua()]
      );
      pos_set_cookie("pos_master", $token, $ttl);
      try {
        pos_q(
          "INSERT INTO staff_audit_logs (id, actor_clerk_user_id, actor_name, module, target_name, action, details, business_id, ip)
           VALUES (?,?,?,?,?,?,?, 'platform', ?)",
          "ssssssss",
          [pos_uuid(), $admin["id"], $admin["email"], "master", "login", "User Login", "{}", pos_ip()]
        );
      } catch (Exception $e) { /* ignore */ }
      pos_send(200, ["ok" => true, "admin" => ["id" => $admin["id"], "email" => $admin["email"], "name" => $admin["name"]], "php" => true]);
    }

    if ($path === "auth/login" && $method === "POST") {
      $id = trim((string) ($body["identifier"] ?? $body["email"] ?? ""));
      $low = strtolower($id);
      $rows = pos_q(
        "SELECT * FROM staff_users WHERE LOWER(email) = ? OR LOWER(IFNULL(username,'')) = ? OR mobile = ? OR clerk_user_id = ? LIMIT 1",
        "ssss",
        [$low, $low, $id, $id]
      );
      $user = $rows[0] ?? null;
      if (!$user) pos_send(401, ["error" => "Invalid login"]);
      if (!empty($user["locked_until"]) && strtotime($user["locked_until"]) > time()) {
        pos_send(423, ["error" => "Account locked. Try later."]);
      }
      if (($user["status"] ?? "") !== "active") pos_send(403, ["error" => "User is inactive"]);
      $pass = (string) ($body["password"] ?? "");
      $ok = pos_verify_password($pass, $user["password_hash"]);
      if (!$ok) {
        $envStaff = pos_env("SWAMI_ADMIN_PASSWORD");
        $email = strtolower((string) ($user["email"] ?? ""));
        if ($envStaff !== "" && $email === "swami@atavtelecom.in" && strlen($envStaff) === strlen($pass) && hash_equals($envStaff, $pass)) {
          $ok = true;
          try {
            pos_q("UPDATE staff_users SET password_hash = ? WHERE id = ?", "ss", [pos_hash_password($pass), $user["id"]]);
          } catch (Exception $e) { /* ignore rehash */ }
        }
      }
      if (!$ok) {
        $fails = ((int) ($user["failed_logins"] ?? 0)) + 1;
        if ($fails >= 8) {
          pos_q("UPDATE staff_users SET failed_logins = ?, locked_until = ? WHERE id = ?", "iss", [$fails, date("Y-m-d H:i:s", time() + 15 * 60), $user["id"]]);
        } else {
          pos_q("UPDATE staff_users SET failed_logins = ? WHERE id = ?", "is", [$fails, $user["id"]]);
        }
        pos_send(401, ["error" => "Invalid login"]);
      }
      $bizRows = pos_q("SELECT * FROM businesses WHERE id = ? LIMIT 1", "s", [$user["business_id"]]);
      $business = $bizRows[0] ?? null;
      $status = pos_public_status($business);
      if ($status === "suspended" || $status === "inactive") pos_send(403, ["error" => "Business is " . $status]);
      pos_q("UPDATE staff_users SET failed_logins = 0, locked_until = NULL WHERE id = ?", "s", [$user["id"]]);
      $ttl = pos_ttl(pos_remember($body));
      $token = pos_new_token();
      $branchId = $body["branchId"] ?? $user["branch_id"];
      pos_q(
        "INSERT INTO staff_sessions (id, staff_user_id, token_hash, expires_at, business_id, ip, user_agent, branch_id)
         VALUES (?,?,?,DATE_ADD(NOW(), INTERVAL ? SECOND),?,?,?,?)",
        "sssissss",
        [pos_uuid(), $user["id"], pos_sha256($token), $ttl, $user["business_id"], pos_ip(), pos_ua(), $branchId]
      );
      pos_set_cookie("pos_sid", $token, $ttl);
      pos_send(200, [
        "ok" => true,
        "expired" => $status === "expired",
        "php" => true,
        "user" => [
          "id" => $user["id"],
          "email" => $user["email"],
          "name" => pos_display_name($user),
          "role" => $user["role"],
          "permissions" => pos_parse_perms($user),
        ],
        "business" => [
          "id" => $business["id"] ?? null,
          "name" => $business["name"] ?? null,
          "status" => $status,
          "subscription_expires_at" => $business["subscription_expires_at"] ?? null,
        ],
      ]);
    }

    if ($path === "auth/signup" && $method === "POST") {
      $reg = pos_register_business($body);
      $user = $reg["user"];
      $bizRows = pos_q("SELECT * FROM businesses WHERE id = ? LIMIT 1", "s", [$user["business_id"]]);
      $business = $bizRows[0];
      $ttl = pos_ttl(pos_remember($body));
      $token = pos_new_token();
      pos_q(
        "INSERT INTO staff_sessions (id, staff_user_id, token_hash, expires_at, business_id, ip, user_agent, branch_id)
         VALUES (?,?,?,DATE_ADD(NOW(), INTERVAL ? SECOND),?,?,?,?)",
        "sssissss",
        [pos_uuid(), $user["id"], pos_sha256($token), $ttl, $user["business_id"], pos_ip(), pos_ua(), $user["branch_id"]]
      );
      pos_set_cookie("pos_sid", $token, $ttl);
      pos_send(200, [
        "ok" => true,
        "php" => true,
        "user" => ["id" => $user["id"], "email" => $user["email"], "name" => pos_display_name($user), "role" => $user["role"]],
        "business" => ["id" => $business["id"], "name" => $business["name"], "status" => "active"],
      ]);
    }

    if ($path === "auth/logout" && $method === "POST") {
      $sid = pos_cookie("pos_sid");
      $master = pos_cookie("pos_master");
      if ($sid) pos_q("UPDATE staff_sessions SET revoked_at = NOW() WHERE token_hash = ?", "s", [pos_sha256($sid)]);
      if ($master) pos_q("UPDATE platform_sessions SET revoked_at = NOW() WHERE token_hash = ?", "s", [pos_sha256($master)]);
      pos_clear_cookie("pos_sid");
      pos_clear_cookie("pos_master");
      pos_send(200, ["ok" => true]);
    }

    if ($path === "auth/exit-impersonate" && $method === "POST") {
      $sid = pos_cookie("pos_sid");
      if ($sid !== "") {
        $staff = pos_staff_session();
        if ($staff && !empty($staff["impersonatorAdminId"])) {
          pos_q("UPDATE staff_sessions SET revoked_at = NOW() WHERE token_hash = ?", "s", [pos_sha256($sid)]);
          pos_clear_cookie("pos_sid");
        }
      }
      pos_send(200, ["ok" => true]);
    }

    if ($path === "auth/me" && $method === "GET") {
      $staff = pos_staff_session();
      if ($staff) pos_send(200, pos_staff_me_payload($staff));
      $master = pos_master_session();
      if ($master) pos_send(200, ["ok" => true, "type" => "master", "admin" => $master["admin"]]);
      pos_send(401, ["error" => "Not signed in"]);
    }

    $auth = pos_require_master($path);

    if ($path === "master/dashboard" && $method === "GET") {
      $businesses = pos_q("SELECT * FROM businesses");
      $statuses = array_map("pos_public_status", $businesses);
      $users = pos_q("SELECT COUNT(*) AS n FROM staff_users");
      $branches = pos_q("SELECT COUNT(*) AS n FROM branches");
      $devices = pos_q("SELECT COUNT(*) AS n FROM pos_devices");
      $tx = pos_q("SELECT COUNT(*) AS n FROM sales_orders");
      $sales = pos_q("SELECT COALESCE(SUM(total),0) AS takings FROM sales_orders WHERE DATE(created_at)=CURDATE()");
      $plans = pos_q("SELECT * FROM subscription_plans");
      $planMap = [];
      foreach ($plans as $p) $planMap[$p["id"]] = $p;
      $monthly = 0;
      foreach ($businesses as $b) {
        if (pos_public_status($b) !== "active") continue;
        $monthly += (float) ($planMap[$b["plan_id"]]["fee_monthly"] ?? 0);
      }
      $byBiz = pos_q(
        "SELECT b.id, b.name, b.status, b.subscription_expires_at, b.plan_id,
                p.name AS plan_name, p.fee_monthly,
                (SELECT COUNT(*) FROM staff_users u WHERE u.business_id=b.id) AS users,
                (SELECT COUNT(*) FROM branches br WHERE br.business_id=b.id) AS branches,
                (SELECT COALESCE(SUM(total),0) FROM sales_orders s WHERE s.business_id=b.id AND DATE(s.created_at)=CURDATE()) AS today_sales
         FROM businesses b
         LEFT JOIN subscription_plans p ON p.id = b.plan_id
         ORDER BY b.name"
      );
      foreach ($byBiz as &$row) $row["computed_status"] = pos_public_status($row);
      pos_send(200, [
        "totals" => [
          "businesses" => count($businesses),
          "active" => count(array_filter($statuses, function ($s) { return $s === "active"; })),
          "inactive" => count(array_filter($statuses, function ($s) { return $s === "inactive"; })),
          "expired" => count(array_filter($statuses, function ($s) { return $s === "expired"; })),
          "suspended" => count(array_filter($statuses, function ($s) { return $s === "suspended"; })),
          "trial" => count(array_filter($businesses, function ($b) { return ($b["plan_id"] ?? "") === "trial"; })),
          "users" => (int) ($users[0]["n"] ?? 0),
          "branches" => (int) ($branches[0]["n"] ?? 0),
          "devices" => (int) ($devices[0]["n"] ?? 0),
          "transactions" => (int) ($tx[0]["n"] ?? 0),
          "todaySales" => $sales[0]["takings"] ?? 0,
          "subscriptionRevenue" => $monthly,
        ],
        "businesses" => $byBiz,
      ]);
    }

    if ($path === "master/plans" && $method === "GET") {
      pos_send(200, pos_q("SELECT * FROM subscription_plans ORDER BY max_users"));
    }

    if ($path === "master/plans" && $method === "POST") {
      $id = strtolower((string) ($body["code"] ?? $body["name"] ?? "plan"));
      $id = substr(preg_replace("/[^a-z0-9]+/", "-", $id), 0, 32);
      pos_q(
        "INSERT INTO subscription_plans
           (id, code, name, max_branches, max_users, max_devices, max_products, max_invoices, fee_monthly, active)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), max_branches=VALUES(max_branches),
           max_users=VALUES(max_users), max_devices=VALUES(max_devices),
           max_products=VALUES(max_products), max_invoices=VALUES(max_invoices),
           fee_monthly=VALUES(fee_monthly), active=VALUES(active)",
        "sssiiiiidi",
        [
          $id,
          strtoupper((string) ($body["code"] ?? $id)),
          $body["name"] ?? $id,
          (int) ($body["max_branches"] ?? 1),
          (int) ($body["max_users"] ?? 3),
          (int) ($body["max_devices"] ?? 2),
          (int) ($body["max_products"] ?? 500),
          (int) ($body["max_invoices"] ?? 1000),
          (float) ($body["fee_monthly"] ?? 0),
          ($body["active"] === false || $body["active"] === 0 || $body["active"] === "0") ? 0 : 1,
        ]
      );
      $plan = pos_q("SELECT * FROM subscription_plans WHERE id = ? LIMIT 1", "s", [$id]);
      pos_audit($auth["admin"], "Plan Saved", ["module" => "plans", "target_name" => $id]);
      pos_send(200, ["ok" => true, "plan" => $plan[0] ?? null]);
    }

    if (preg_match("#^master/plans/([^/]+)$#", $path, $m) && $method === "PUT") {
      $id = $m[1];
      $existing = pos_q("SELECT * FROM subscription_plans WHERE id = ? LIMIT 1", "s", [$id]);
      if (!$existing) throw new Exception("Plan not found");
      $ex = $existing[0];
      $code = strtoupper((string) ($body["code"] ?? $ex["code"]));
      $code = substr(preg_replace("/[^A-Z0-9]+/", "", $code), 0, 32) ?: $ex["code"];
      pos_q(
        "UPDATE subscription_plans SET code=?, name=?, max_branches=?, max_users=?, max_devices=?, max_products=?,
           max_invoices=?, fee_monthly=?, active=? WHERE id=?",
        "ssiiiiidis",
        [
          $code,
          $body["name"] ?? $ex["name"],
          pos_n($body["max_branches"] ?? null, $ex["max_branches"]),
          pos_n($body["max_users"] ?? null, $ex["max_users"]),
          pos_n($body["max_devices"] ?? null, $ex["max_devices"]),
          pos_n($body["max_products"] ?? null, $ex["max_products"]),
          pos_n($body["max_invoices"] ?? null, $ex["max_invoices"]),
          pos_n($body["fee_monthly"] ?? null, $ex["fee_monthly"]),
          ($body["active"] === false || $body["active"] === 0 || $body["active"] === "0") ? 0 : 1,
          $id,
        ]
      );
      $plan = pos_q("SELECT * FROM subscription_plans WHERE id = ? LIMIT 1", "s", [$id]);
      pos_audit($auth["admin"], "Plan Edited", ["module" => "plans", "target_id" => $id, "target_name" => $code]);
      pos_send(200, ["ok" => true, "plan" => $plan[0]]);
    }

    if ($path === "master/businesses" && $method === "GET") {
      $rows = pos_q(
        "SELECT b.*, p.name AS plan_name, p.fee_monthly,
                (SELECT u.username FROM staff_users u
                 WHERE u.business_id = b.id AND u.role = 'business_admin' LIMIT 1) AS admin_username
         FROM businesses b
         LEFT JOIN subscription_plans p ON p.id = b.plan_id
         ORDER BY b.name"
      );
      foreach ($rows as &$row) $row["computed_status"] = pos_public_status($row);
      pos_send(200, $rows);
    }

    if ($path === "master/businesses" && $method === "POST") {
      $reg = pos_register_business($body);
      pos_audit($auth["admin"], "Business Created", ["module" => "businesses", "target_id" => $reg["businessId"], "target_name" => $body["name"] ?? ""]);
      $row = pos_q("SELECT * FROM businesses WHERE id = ? LIMIT 1", "s", [$reg["businessId"]]);
      pos_send(200, ["ok" => true, "business" => $row[0]]);
    }

    if (preg_match("#^master/businesses/([^/]+)/status$#", $path, $m) && $method === "POST") {
      $status = (string) ($body["status"] ?? "active");
      if (!in_array($status, ["active", "inactive", "suspended"], true)) throw new Exception("Invalid status");
      pos_q("UPDATE businesses SET status = ? WHERE id = ?", "ss", [$status, $m[1]]);
      pos_audit($auth["admin"], "Business Status", ["module" => "businesses", "target_id" => $m[1], "status" => $status]);
      pos_send(200, ["ok" => true, "status" => $status]);
    }

    if (preg_match("#^master/businesses/([^/]+)$#", $path, $m) && $method === "PUT") {
      $row = pos_update_business($m[1], $body);
      pos_audit($auth["admin"], "Business Edited", ["module" => "businesses", "target_id" => $m[1], "target_name" => $row["name"] ?? ""]);
      pos_send(200, ["ok" => true, "business" => $row]);
    }

    if (preg_match("#^master/businesses/([^/]+)$#", $path, $m) && $method === "DELETE") {
      $id = $m[1];
      $swami = pos_env("BUSINESS_ID", "00000000-0000-4000-8000-000000000001");
      if ($id === $swami) throw new Exception("The primary live business cannot be deleted");
      pos_q("UPDATE businesses SET status = 'inactive' WHERE id = ?", "s", [$id]);
      pos_send(200, ["ok" => true, "note" => "Business set inactive. Data is retained."]);
    }

    if (preg_match("#^master/businesses/([^/]+)/enter$#", $path, $m) && $method === "POST") {
      $bizId = $m[1];
      $biz = pos_q("SELECT * FROM businesses WHERE id = ? LIMIT 1", "s", [$bizId]);
      if (!$biz) throw new Exception("Business not found");
      $users = pos_q(
        "SELECT * FROM staff_users WHERE business_id = ? AND status = 'active'
         ORDER BY CASE role WHEN 'business_admin' THEN 0 ELSE 1 END, email ASC LIMIT 1",
        "s",
        [$bizId]
      );
      if (!$users) throw new Exception("No active staff user for this business. Create a business admin first.");
      $user = $users[0];
      $branch = pos_q("SELECT id FROM branches WHERE business_id = ? LIMIT 1", "s", [$bizId]);
      $branchId = $branch[0]["id"] ?? ($user["branch_id"] ?? null);
      pos_issue_staff_session($user, $branchId, $auth["admin"]["id"]);
      pos_audit($auth["admin"], "Entered Business POS", [
        "module" => "businesses",
        "target_id" => $biz[0]["id"],
        "target_name" => $biz[0]["name"],
        "staff_user_id" => $user["id"],
      ]);
      pos_send(200, [
        "ok" => true,
        "redirect" => "/index.html",
        "business" => ["id" => $biz[0]["id"], "name" => $biz[0]["name"]],
        "user" => [
          "id" => $user["id"],
          "email" => $user["email"],
          "name" => pos_display_name($user),
          "role" => $user["role"],
        ],
      ]);
    }

    if (preg_match("#^master/users/([^/]+)/enter$#", $path, $m) && $method === "POST") {
      $users = pos_q("SELECT * FROM staff_users WHERE id = ? LIMIT 1", "s", [$m[1]]);
      $user = $users[0] ?? null;
      if (!$user || ($user["status"] ?? "") !== "active") throw new Exception("User not found or inactive");
      $biz = pos_q("SELECT * FROM businesses WHERE id = ? LIMIT 1", "s", [$user["business_id"]]);
      if (!$biz) throw new Exception("Business not found");
      $branch = pos_q("SELECT id FROM branches WHERE business_id = ? LIMIT 1", "s", [$user["business_id"]]);
      $branchId = $branch[0]["id"] ?? ($user["branch_id"] ?? null);
      pos_issue_staff_session($user, $branchId, $auth["admin"]["id"]);
      pos_audit($auth["admin"], "Entered User POS", [
        "module" => "users",
        "target_id" => $user["id"],
        "target_name" => $user["email"],
        "business_id" => $user["business_id"],
      ]);
      pos_send(200, [
        "ok" => true,
        "redirect" => "/index.html",
        "business" => ["id" => $biz[0]["id"], "name" => $biz[0]["name"]],
        "user" => [
          "id" => $user["id"],
          "email" => $user["email"],
          "name" => pos_display_name($user),
          "role" => $user["role"],
        ],
      ]);
    }

    if ($path === "master/users" && $method === "GET") {
      pos_send(200, pos_q(
        "SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.status, u.business_id, u.mobile, u.username,
                b.name AS business_name
         FROM staff_users u LEFT JOIN businesses b ON b.id = u.business_id
         ORDER BY u.email"
      ));
    }

    if (preg_match("#^master/users/([^/]+)/reset-password$#", $path, $m) && $method === "POST") {
      $password = $body["password"] ?? "";
      if (strlen((string) $password) < 8) throw new Exception("Password must be 8+ characters");
      pos_q("UPDATE staff_users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?", "ss", [pos_hash_password($password), $m[1]]);
      pos_send(200, ["ok" => true]);
    }

    if ($path === "master/branches" && $method === "GET") {
      pos_send(200, pos_q(
        "SELECT br.*, b.name AS business_name FROM branches br
         JOIN businesses b ON b.id = br.business_id ORDER BY b.name, br.name"
      ));
    }

    if ($path === "master/devices" && $method === "GET") {
      pos_send(200, pos_q(
        "SELECT d.*, b.name AS business_name, br.name AS branch_name
         FROM pos_devices d
         JOIN businesses b ON b.id = d.business_id
         LEFT JOIN branches br ON br.id = d.branch_id
         ORDER BY b.name, d.code"
      ));
    }

    if ($path === "master/audit" && $method === "GET") {
      pos_send(200, pos_q(
        "SELECT l.*, b.name AS business_name
         FROM staff_audit_logs l
         LEFT JOIN businesses b ON b.id = l.business_id AND l.business_id <> 'platform'
         ORDER BY l.created_at DESC
         LIMIT 200"
      ));
    }

    if ($path === "master/settings" && $method === "GET") {
      pos_send(200, [
        "platform" => "ATAV Multi-Tenant POS",
        "lockoutAttempts" => 8,
        "sessionHours" => 12,
        "notifications" => pos_q("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20"),
      ]);
    }

    if ($path === "master/support" && $method === "GET") {
      pos_send(200, pos_platform_settings());
    }

    if ($path === "master/support" && $method === "POST") {
      $phone = trim((string) ($body["support_phone"] ?? ""));
      $email = trim((string) ($body["support_email"] ?? ""));
      if ($phone === "") throw new Exception("Support number is required");
      pos_set_setting("support_phone", $phone);
      pos_set_setting("support_email", $email);
      pos_send(200, array_merge(["ok" => true], pos_platform_settings()));
    }

    if ($path === "master/notifications" && $method === "POST") {
      $title = $body["title"] ?? "";
      if (!$title) throw new Exception("Title is required");
      $nid = pos_uuid();
      pos_q("INSERT INTO notifications (id, business_id, title, body) VALUES (?,?,?,?)", "ssss", [$nid, $body["business_id"] ?? null, $title, $body["body"] ?? null]);
      pos_send(200, ["ok" => true, "id" => $nid]);
    }

    if (strpos($path, "master/") !== 0) {
      require_once __DIR__ . "/pos-php-till.php";
      pos_php_till_dispatch($path, $method, $body);
    }

    pos_send(501, ["error" => "This action needs the Node.js POS process. PHP fallback covers sign-in and Master Admin lists only.", "php" => true]);
  } catch (Exception $e) {
    $msg = $e->getMessage();
    $dup = preg_match("/duplicate|already (registered|taken)/i", $msg);
    $code = $dup ? 409 : 400;
    if (stripos($msg, "MySQL") !== false || stripos($msg, "setup.html") !== false || stripos($msg, "mysqli") !== false) {
      pos_send(503, pos_setup_payload($msg));
    }
    pos_send($code, ["error" => $msg, "php" => true]);
  }
}
