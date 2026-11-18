<?php
/* Business Admin login step: WhatsApp OTP or a 6-digit PIN. Not combined MFA. */

function pos_admin_exec($sql, $types, $params) {
  $db = pos_db();
  $st = $db->prepare($sql);
  if (!$st) throw new Exception($db->error ?: "SQL error");
  if ($types !== "") {
    $bind = [$types];
    foreach ($params as $i => $value) {
      $params[$i] = $value;
      $bind[] = &$params[$i];
    }
    call_user_func_array([$st, "bind_param"], $bind);
  }
  if (!$st->execute()) {
    $err = $st->error;
    $st->close();
    throw new Exception($err ?: "SQL error");
  }
  $n = $st->affected_rows;
  $st->close();
  return $n;
}

function pos_admin_ensure_schema() {
  static $done = false;
  if ($done) return;
  $tables = [
    "CREATE TABLE IF NOT EXISTS business_admin_security (
      staff_user_id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      otp_login_enabled TINYINT NOT NULL DEFAULT 0,
      whatsapp_number VARCHAR(20) NULL,
      whatsapp_verified_at TIMESTAMP(3) NULL,
      pin_fails INT NOT NULL DEFAULT 0,
      pin_locked_until TIMESTAMP(3) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX (business_id),
      CONSTRAINT fk_admin_sec_staff FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE,
      CONSTRAINT fk_admin_sec_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    )",
    "CREATE TABLE IF NOT EXISTS business_admin_pin (
      staff_user_id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      pin_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX (business_id),
      CONSTRAINT fk_admin_pin_staff FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE,
      CONSTRAINT fk_admin_pin_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    )",
    "CREATE TABLE IF NOT EXISTS business_admin_otp (
      id VARCHAR(255) PRIMARY KEY,
      staff_user_id VARCHAR(255) NOT NULL,
      business_id VARCHAR(255) NOT NULL,
      purpose VARCHAR(24) NOT NULL,
      challenge_hash CHAR(64) NOT NULL,
      code_hash CHAR(64) NULL,
      expires_at TIMESTAMP(3) NOT NULL,
      code_expires_at TIMESTAMP(3) NULL,
      code_sent_at TIMESTAMP(3) NULL,
      used_at TIMESTAMP(3) NULL,
      attempts INT NOT NULL DEFAULT 0,
      ip VARCHAR(64) NULL,
      device_id VARCHAR(64) NULL,
      remember_me TINYINT NOT NULL DEFAULT 0,
      branch_id VARCHAR(255) NULL,
      pending_number VARCHAR(20) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX (challenge_hash),
      INDEX (staff_user_id, purpose, created_at),
      INDEX (ip, created_at),
      INDEX (device_id, created_at),
      INDEX (business_id),
      CONSTRAINT fk_admin_otp_staff FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE,
      CONSTRAINT fk_admin_otp_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    )",
    "CREATE TABLE IF NOT EXISTS business_admin_login_logs (
      id VARCHAR(255) PRIMARY KEY,
      staff_user_id VARCHAR(255) NOT NULL,
      business_id VARCHAR(255) NOT NULL,
      event VARCHAR(40) NOT NULL,
      method VARCHAR(16) NULL,
      ip VARCHAR(64) NULL,
      device_id VARCHAR(64) NULL,
      detail VARCHAR(160) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX (staff_user_id, created_at),
      INDEX (created_at),
      INDEX (business_id),
      CONSTRAINT fk_admin_log_staff FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE,
      CONSTRAINT fk_admin_log_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    )",
    "CREATE TABLE IF NOT EXISTS business_admin_devices (
      id VARCHAR(255) PRIMARY KEY,
      staff_user_id VARCHAR(255) NOT NULL,
      business_id VARCHAR(255) NOT NULL,
      device_id VARCHAR(64) NOT NULL,
      device_label VARCHAR(80) NULL,
      ip VARCHAR(64) NULL,
      user_agent VARCHAR(255) NULL,
      last_session_id VARCHAR(255) NULL,
      pin_fails INT NOT NULL DEFAULT 0,
      pin_locked_until TIMESTAMP(3) NULL,
      last_seen_at TIMESTAMP(3) NULL,
      revoked_at TIMESTAMP(3) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_admin_device (staff_user_id, device_id),
      INDEX (business_id),
      INDEX (last_session_id),
      CONSTRAINT fk_admin_dev_staff FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE,
      CONSTRAINT fk_admin_dev_biz FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    )",
  ];
  foreach ($tables as $sql) {
    try {
      pos_q($sql);
    } catch (Exception $e) {
      $cut = strpos($sql, "CONSTRAINT fk_");
      if ($cut === false) throw $e;
      pos_q(rtrim(substr($sql, 0, $cut), " \n,") . "\n)");
    }
  }
  try { pos_q("DELETE FROM business_admin_login_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 180 DAY)"); } catch (Exception $e) { /* retention is best-effort */ }
  try { pos_q("DELETE FROM business_admin_otp WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 DAY)"); } catch (Exception $e) { /* retention is best-effort */ }
  $done = true;
}

function pos_admin_hash_otp($code, $challengeId) {
  return hash_hmac("sha256", (string) $code, (string) $challengeId);
}

function pos_admin_mask($raw) {
  $n = preg_replace("/\D+/", "", (string) $raw);
  if (strlen($n) < 4) return "";
  $last = substr($n, -4);
  $head = substr($n, 0, min(2, strlen($n) - 4));
  return "+" . $head . "••••" . $last;
}

function pos_admin_origin_ok() {
  $origin = trim((string) ($_SERVER["HTTP_ORIGIN"] ?? ""));
  if ($origin === "") return true;
  $host = parse_url($origin, PHP_URL_HOST);
  $port = parse_url($origin, PHP_URL_PORT);
  $originHost = $host . ($port ? ":" . $port : "");
  $expected = trim(explode(",", (string) ($_SERVER["HTTP_X_FORWARDED_HOST"] ?? ($_SERVER["HTTP_HOST"] ?? "")))[0]);
  return $originHost !== "" && strcasecmp($originHost, $expected) === 0;
}

function pos_admin_fail($status, $message) {
  pos_send($status, ["error" => $message]);
}

function pos_admin_log($userId, $businessId, $event, $method, $deviceId, $detail = "") {
  $detail = substr(preg_replace("/\d{4,}/", "######", (string) $detail), 0, 160);
  pos_q(
    "INSERT INTO business_admin_login_logs (id, staff_user_id, business_id, event, method, ip, device_id, detail)
     VALUES (?,?,?,?,?,?,?,?)",
    "ssssssss",
    [pos_uuid(), $userId, $businessId, substr($event, 0, 40), substr((string) $method, 0, 16), substr(pos_ip(), 0, 64), substr((string) $deviceId, 0, 64), $detail]
  );
}

function pos_admin_verified($sec) {
  return is_array($sec) && !empty($sec["whatsapp_verified_at"]) && !empty($sec["whatsapp_number"]);
}

function pos_admin_methods($sec, $pin) {
  $methods = [];
  if ((int) ($sec["otp_login_enabled"] ?? 0) === 1 && pos_admin_verified($sec)) $methods[] = "whatsapp";
  if (!empty($pin["pin_hash"])) $methods[] = "pin";
  return $methods;
}

function pos_admin_security_row($userId) {
  $rows = pos_q("SELECT * FROM business_admin_security WHERE staff_user_id = ? LIMIT 1", "s", [$userId]);
  return $rows[0] ?? null;
}

function pos_admin_pin_row($userId) {
  $rows = pos_q("SELECT staff_user_id, pin_hash FROM business_admin_pin WHERE staff_user_id = ? LIMIT 1", "s", [$userId]);
  return $rows[0] ?? null;
}

function pos_admin_login_challenge($user, $body) {
  if (($user["role"] ?? "") !== "business_admin") return null;
  try {
    pos_admin_ensure_schema();
    $sec = pos_admin_security_row($user["id"]);
    $pin = pos_admin_pin_row($user["id"]);
    $methods = pos_admin_methods($sec, $pin);
    if (!$methods) return null;
    $challengeId = bin2hex(random_bytes(32));
    $device = pos_device_id($body);
    pos_q(
      "INSERT INTO business_admin_otp
        (id, staff_user_id, business_id, purpose, challenge_hash, expires_at, ip, device_id, remember_me, branch_id)
       VALUES (?,?,?,?,?,DATE_ADD(NOW(), INTERVAL 10 MINUTE),?,?,?,?)",
      "sssssssis",
      [
        pos_uuid(),
        $user["id"],
        $user["business_id"],
        "login",
        pos_sha256($challengeId),
        substr(pos_ip(), 0, 64),
        $device,
        pos_remember($body) ? 1 : 0,
        (string) ($body["branchId"] ?? $user["branch_id"] ?? ""),
      ]
    );
    pos_admin_log($user["id"], $user["business_id"], "login_challenge", "", $device, implode(",", $methods));
    return [
      "ok" => true,
      "challenge" => true,
      "challengeId" => $challengeId,
      "methods" => $methods,
      "whatsappMasked" => in_array("whatsapp", $methods, true) ? pos_admin_mask($sec["whatsapp_number"]) : "",
      "resendAfter" => 45,
      "php" => true,
    ];
  } catch (Throwable $e) {
    pos_admin_fail(503, "Sign-in is temporarily unavailable.");
  }
}

function pos_admin_finish_login($user, $business, $body) {
  if (($user["status"] ?? "") !== "active" || !$business || (($business["status"] ?? "") === "deleted")) {
    pos_send(403, ["error" => "User is inactive"]);
  }
  $ttl = pos_ttl(pos_remember($body));
  $token = pos_new_token();
  $sid = pos_uuid();
  $branchId = $body["branchId"] ?? $user["branch_id"];
  $old = pos_cookie("pos_sid");
  if ($old !== "") {
    try { pos_q("UPDATE staff_sessions SET revoked_at = NOW() WHERE token_hash = ?", "s", [pos_sha256($old)]); } catch (Exception $e) { /* old cookie revoke is best-effort */ }
  }
  pos_q(
    "INSERT INTO staff_sessions (id, staff_user_id, token_hash, expires_at, business_id, ip, user_agent, branch_id)
     VALUES (?,?,?,DATE_ADD(NOW(), INTERVAL ? SECOND),?,?,?,?)",
    "sssissss",
    [$sid, $user["id"], pos_sha256($token), $ttl, $user["business_id"], pos_ip(), pos_ua(), $branchId]
  );
  try { pos_q("UPDATE staff_sessions SET last_seen_at = NOW() WHERE token_hash = ?", "s", [pos_sha256($token)]); } catch (Exception $e) { /* seen-at is optional */ }
  $device = pos_device_id($body);
  if (($user["role"] ?? "") === "business_admin") {
    try {
      pos_admin_ensure_schema();
      pos_q(
        "INSERT INTO business_admin_devices
          (id, staff_user_id, business_id, device_id, device_label, ip, user_agent, last_session_id, last_seen_at)
         VALUES (?,?,?,?,?,?,?,?,NOW())
         ON DUPLICATE KEY UPDATE device_label = VALUES(device_label), ip = VALUES(ip), user_agent = VALUES(user_agent),
           last_session_id = VALUES(last_session_id), last_seen_at = NOW(), revoked_at = NULL",
        "ssssssss",
        [pos_uuid(), $user["id"], $user["business_id"], $device !== "" ? $device : "browser", substr(pos_device_label($body), 0, 80), substr(pos_ip(), 0, 64), substr(pos_ua(), 0, 250), $sid]
      );
    } catch (Exception $e) { /* device list is optional once the session exists */ }
  }
  pos_record_admin_login($user, pos_ip(), ["deviceId" => $device, "deviceLabel" => pos_device_label($body)]);
  pos_set_cookie("pos_sid", $token, $ttl);
  $status = pos_public_status($business);
  pos_send(200, [
    "ok" => true,
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
      "category" => $business["category"] ?? null,
      "business_type" => $business["business_type"] ?? null,
      "bar_enabled" => (int) ($business["bar_enabled"] ?? 0),
      "resort_enabled" => (int) ($business["resort_enabled"] ?? 0),
      "zomato_allowed" => ((int) ($business["zomato_allowed"] ?? 0)) === 1 ? 1 : 0,
      "swiggy_allowed" => ((int) ($business["swiggy_allowed"] ?? 0)) === 1 ? 1 : 0,
      "qr_module" => ((int) ($business["qr_module"] ?? 0)) === 1 ? 1 : 0,
      "online_store" => pos_online_store_flag($business["online_store"] ?? 0),
      "store_banner_allowed" => pos_online_store_flag($business["store_banner_allowed"] ?? 0),
      "ecommerce_store" => pos_online_store_flag($business["ecommerce_store"] ?? 0),
      "subscription_expires_at" => $business["subscription_expires_at"] ?? null,
    ],
  ]);
}

function pos_admin_load_challenge($challengeId, $purpose) {
  if (!preg_match("/^[a-f0-9]{64}$/", (string) $challengeId)) return null;
  $rows = pos_q(
    "SELECT * FROM business_admin_otp WHERE challenge_hash = ? AND purpose = ? LIMIT 1",
    "ss",
    [pos_sha256($challengeId), $purpose]
  );
  return $rows[0] ?? null;
}

function pos_admin_send_counts($userId, $device) {
  $account = pos_q("SELECT COUNT(*) AS n FROM business_admin_otp WHERE staff_user_id = ? AND code_sent_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)", "s", [$userId]);
  $ip = pos_q("SELECT COUNT(*) AS n FROM business_admin_otp WHERE ip = ? AND code_sent_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)", "s", [substr(pos_ip(), 0, 64)]);
  $dev = pos_q("SELECT COUNT(*) AS n FROM business_admin_otp WHERE device_id = ? AND code_sent_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)", "s", [$device]);
  return [
    "account" => (int) ($account[0]["n"] ?? 0),
    "ip" => (int) ($ip[0]["n"] ?? 0),
    "device" => (int) ($dev[0]["n"] ?? 0),
  ];
}

function pos_admin_limited($counts) {
  return $counts["account"] >= 5 || $counts["ip"] >= 20 || $counts["device"] >= 8;
}

function pos_admin_deliver($number) {
  $code = str_pad((string) random_int(0, 999999), 6, "0", STR_PAD_LEFT);
  $message = "ATAV POS login code: " . $code . ". It expires in 5 minutes. Do not share this code.";
  if (!function_exists("pos_alert_settings") || !function_exists("pos_wa_send")) return ["ok" => false];
  try {
    $cfg = pos_alert_settings();
    $result = pos_wa_send($cfg, [$number], $message);
    if (empty($result["ok"])) return ["ok" => false];
    return ["ok" => true, "code" => $code];
  } catch (Throwable $e) {
    return ["ok" => false];
  }
}

function pos_admin_current_session_id() {
  $token = pos_cookie("pos_sid");
  if ($token === "") return "";
  $rows = pos_q("SELECT id FROM staff_sessions WHERE token_hash = ? AND revoked_at IS NULL LIMIT 1", "s", [pos_sha256($token)]);
  return (string) ($rows[0]["id"] ?? "");
}

function pos_admin_revoke_other_sessions($userId) {
  $keep = pos_admin_current_session_id();
  pos_admin_exec(
    "UPDATE staff_sessions SET revoked_at = NOW() WHERE staff_user_id = ? AND revoked_at IS NULL AND id <> ?",
    "ss",
    [$userId, $keep]
  );
}

function pos_admin_require_admin() {
  $staff = pos_staff_session();
  if (!$staff) pos_admin_fail(401, "Sign in required");
  if (($staff["user"]["role"] ?? "") !== "business_admin") pos_admin_fail(403, "Business admin only");
  return $staff;
}

function pos_admin_history($userId) {
  $rows = pos_q(
    "SELECT event, method, ip, device_id, created_at FROM business_admin_login_logs WHERE staff_user_id = ? ORDER BY created_at DESC LIMIT 50",
    "s",
    [$userId]
  );
  $out = [];
  foreach ($rows as $row) {
    $out[] = [
      "event" => $row["event"],
      "method" => $row["method"] ?? "",
      "ip" => $row["ip"] ?? "",
      "deviceId" => $row["device_id"] ?? "",
      "at" => $row["created_at"],
    ];
  }
  return $out;
}

function pos_admin_devices($userId) {
  $rows = pos_q(
    "SELECT d.device_id, d.device_label, d.ip, d.last_seen_at, d.revoked_at, d.last_session_id, s.expires_at, s.revoked_at AS session_revoked
     FROM business_admin_devices d
     LEFT JOIN staff_sessions s ON s.id = d.last_session_id
     WHERE d.staff_user_id = ?
     ORDER BY d.last_seen_at DESC LIMIT 30",
    "s",
    [$userId]
  );
  $out = [];
  foreach ($rows as $row) {
    $active = empty($row["revoked_at"]) && !empty($row["last_session_id"]) && empty($row["session_revoked"]) && !empty($row["expires_at"]) && strtotime($row["expires_at"]) > time();
    $out[] = [
      "deviceId" => $row["device_id"],
      "label" => $row["device_label"] ?: "Browser",
      "ip" => $row["ip"] ?? "",
      "lastSeen" => $row["last_seen_at"],
      "sessionId" => $row["last_session_id"] ?? "",
      "active" => $active,
    ];
  }
  return $out;
}

function pos_admin_settings_payload($userId) {
  $sec = pos_admin_security_row($userId);
  $pin = pos_admin_pin_row($userId);
  return [
    "ok" => true,
    "applicable" => true,
    "php" => true,
    "otpLoginEnabled" => (int) ($sec["otp_login_enabled"] ?? 0) === 1,
    "whatsappMasked" => pos_admin_mask($sec["whatsapp_number"] ?? ""),
    "whatsappVerified" => pos_admin_verified($sec),
    "pinSet" => !empty($pin["pin_hash"]),
    "note" => "WhatsApp OTP and the 6-digit PIN are alternative checks after your password. They are not combined into multi-factor authentication.",
    "history" => pos_admin_history($userId),
    "devices" => pos_admin_devices($userId),
  ];
}

function pos_admin_pin_ok($pin, $hash) {
  if (!defined("PASSWORD_ARGON2ID")) return false;
  if (!is_string($hash) || strncmp($hash, '$argon2id$', 10) !== 0) return false;
  return password_verify((string) $pin, $hash);
}

function pos_admin_save_pin($body, $purpose) {
  if (!pos_admin_origin_ok()) pos_admin_fail(403, "Verification failed.");
  $staff = pos_admin_require_admin();
  $user = $staff["user"];
  $pin = (string) ($body["pin"] ?? "");
  $confirm = (string) ($body["confirm"] ?? "");
  if (!preg_match("/^\d{6}$/", $pin) || $pin !== $confirm) pos_admin_fail(400, "Enter the same 6-digit PIN twice.");
  if (!defined("PASSWORD_ARGON2ID")) pos_admin_fail(503, "PIN setup needs the main app server.");
  pos_admin_ensure_schema();
  $sec = pos_admin_security_row($user["id"]);
  if (!pos_admin_verified($sec)) pos_admin_fail(400, "Verify the WhatsApp number first.");
  $device = pos_device_id($body);
  $row = pos_admin_load_challenge($body["challengeId"] ?? "", $purpose);
  if (!$row || ($row["staff_user_id"] ?? "") !== $user["id"] || !empty($row["used_at"]) || (string) ($row["device_id"] ?? "") !== $device) {
    pos_admin_fail(400, "Verification failed.");
  }
  $code = (string) ($body["code"] ?? "");
  $fresh = pos_q("SELECT code_hash, code_expires_at > NOW() AS code_open, attempts FROM business_admin_otp WHERE id = ? LIMIT 1", "s", [$row["id"]]);
  $current = $fresh[0] ?? null;
  $expect = pos_admin_hash_otp($code, $body["challengeId"] ?? "");
  $known = (string) ($current["code_hash"] ?? "");
  $match = $current && (int) $current["code_open"] === 1 && strlen($known) === strlen($expect) && hash_equals($known, $expect);
  if (!$match) {
    pos_admin_exec("UPDATE business_admin_otp SET attempts = attempts + 1 WHERE id = ? AND used_at IS NULL", "s", [$row["id"]]);
    pos_admin_fail(400, "Verification failed.");
  }
  if (pos_admin_exec("UPDATE business_admin_otp SET used_at = NOW() WHERE id = ? AND used_at IS NULL", "s", [$row["id"]]) < 1) {
    pos_admin_fail(400, "Verification failed.");
  }
  $hash = password_hash($pin, PASSWORD_ARGON2ID, ["memory_cost" => 19456, "time_cost" => 2, "threads" => 1]);
  pos_q(
    "INSERT INTO business_admin_pin (staff_user_id, business_id, pin_hash) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE pin_hash = VALUES(pin_hash), updated_at = CURRENT_TIMESTAMP(3)",
    "sss",
    [$user["id"], $user["business_id"], $hash]
  );
  pos_q("UPDATE business_admin_security SET pin_fails = 0, pin_locked_until = NULL WHERE staff_user_id = ?", "s", [$user["id"]]);
  pos_admin_revoke_other_sessions($user["id"]);
  pos_admin_log($user["id"], $user["business_id"], $purpose === "pin_reset" ? "pin_reset" : "pin_setup", "pin", $device);
  pos_send(200, ["ok" => true, "pinSet" => true, "php" => true]);
}

function pos_admin_security_dispatch($path, $method, $body) {
  $routes = [
    "auth/otp/send" => "POST",
    "auth/otp/verify" => "POST",
    "auth/pin/verify" => "POST",
    "auth/pin/setup" => "POST",
    "auth/pin/reset" => "POST",
    "auth/security/settings" => "",
    "auth/login/history" => "GET",
    "auth/session/revoke" => "POST",
  ];
  if (!array_key_exists($path, $routes)) return false;
  if ($routes[$path] !== "" && $routes[$path] !== $method) return false;
  if ($path === "auth/security/settings" && $method !== "GET" && $method !== "POST") return false;
  if ($method !== "GET" && !pos_admin_origin_ok()) pos_admin_fail(403, "Verification failed.");
  try {
    pos_admin_ensure_schema();
  } catch (Throwable $e) {
    pos_admin_fail(503, "Sign-in is temporarily unavailable.");
  }
  $device = pos_device_id($body);
  if ($path === "auth/otp/send") {
    $purpose = (string) ($body["purpose"] ?? "login");
    if (!in_array($purpose, ["login", "verify_number", "pin_setup", "pin_reset"], true)) pos_admin_fail(400, "Verification failed.");
    if ($purpose === "login") {
      $row = pos_admin_load_challenge($body["challengeId"] ?? "", "login");
      if (!$row || !empty($row["used_at"]) || (string) ($row["device_id"] ?? "") !== $device) pos_admin_fail(400, "Verification failed.");
      if ((int) ($row["attempts"] ?? 0) >= 5) pos_admin_fail(429, "Too many attempts. Wait and try again.");
      $fresh = pos_q("SELECT expires_at > NOW() AS open_row, code_sent_at, TIMESTAMPDIFF(SECOND, code_sent_at, NOW()) AS age FROM business_admin_otp WHERE id = ?", "s", [$row["id"]]);
      if (empty($fresh[0]["open_row"])) pos_admin_fail(400, "Verification failed.");
      if (!empty($fresh[0]["code_sent_at"]) && (int) $fresh[0]["age"] < 45) {
        pos_send(429, ["error" => "Too many attempts. Wait and try again.", "retryAfter" => 45 - (int) $fresh[0]["age"]]);
      }
      $sec = pos_admin_security_row($row["staff_user_id"]);
      if (!pos_admin_verified($sec) || (int) ($sec["otp_login_enabled"] ?? 0) !== 1) pos_admin_fail(400, "Verification failed.");
      if (pos_admin_limited(pos_admin_send_counts($row["staff_user_id"], $device))) pos_admin_fail(429, "Too many attempts. Wait and try again.");
      $sent = pos_admin_deliver($sec["whatsapp_number"]);
      if (empty($sent["ok"])) pos_admin_fail(503, "Could not send the WhatsApp code. Try again.");
      pos_q(
        "UPDATE business_admin_otp SET code_hash = ?, code_expires_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE), code_sent_at = NOW() WHERE id = ?",
        "ss",
        [pos_admin_hash_otp($sent["code"], $body["challengeId"]), $row["id"]]
      );
      pos_admin_log($row["staff_user_id"], $row["business_id"], "otp_sent", "whatsapp", $device);
      pos_send(200, ["ok" => true, "sent" => true, "resendAfter" => 45, "php" => true]);
    }
    $staff = pos_admin_require_admin();
    $user = $staff["user"];
    $sec = pos_admin_security_row($user["id"]);
    $number = pos_admin_verified($sec) ? $sec["whatsapp_number"] : "";
    if ($purpose === "verify_number") {
      $local = function_exists("pos_normalize_in_mobile") ? pos_normalize_in_mobile($body["number"] ?? "") : "";
      $number = $local && function_exists("pos_wa_api_number") ? pos_wa_api_number($local, "91") : "";
    } elseif ($number === "") {
      pos_admin_fail(400, "Verify the WhatsApp number first.");
    }
    if ($number === "") pos_admin_fail(400, "Enter a valid WhatsApp number.");
    if (pos_admin_limited(pos_admin_send_counts($user["id"], $device))) pos_admin_fail(429, "Too many attempts. Wait and try again.");
    $challengeId = bin2hex(random_bytes(32));
    $sent = pos_admin_deliver($number);
    if (empty($sent["ok"])) pos_admin_fail(503, "Could not send the WhatsApp code. Try again.");
    pos_q(
      "INSERT INTO business_admin_otp
        (id, staff_user_id, business_id, purpose, challenge_hash, code_hash, expires_at, code_expires_at, code_sent_at, ip, device_id, pending_number)
       VALUES (?,?,?,?,?,?,DATE_ADD(NOW(), INTERVAL 10 MINUTE),DATE_ADD(NOW(), INTERVAL 5 MINUTE),NOW(),?,?,?)",
      "sssssssss",
      [
        pos_uuid(), $user["id"], $user["business_id"], $purpose, pos_sha256($challengeId),
        pos_admin_hash_otp($sent["code"], $challengeId), substr(pos_ip(), 0, 64), $device,
        $purpose === "verify_number" ? $number : "",
      ]
    );
    pos_admin_log($user["id"], $user["business_id"], "otp_sent", "whatsapp", $device, $purpose);
    pos_send(200, ["ok" => true, "sent" => true, "resendAfter" => 45, "challengeId" => $challengeId, "php" => true]);
  }
  if ($path === "auth/otp/verify") {
    $purpose = (string) ($body["purpose"] ?? "login");
    $row = pos_admin_load_challenge($body["challengeId"] ?? "", $purpose);
    if (!$row || !empty($row["used_at"]) || (string) ($row["device_id"] ?? "") !== $device) pos_admin_fail(400, "Verification failed.");
    $fresh = pos_q("SELECT code_hash, attempts, used_at, code_expires_at > NOW() AS code_open FROM business_admin_otp WHERE id = ? LIMIT 1", "s", [$row["id"]]);
    $current = $fresh[0] ?? null;
    if (!$current || !empty($current["used_at"]) || !(int) $current["code_open"]) pos_admin_fail(400, "Verification failed.");
    if ((int) $current["attempts"] >= 5) pos_admin_fail(429, "Too many attempts. Wait and try again.");
    $expect = pos_admin_hash_otp((string) ($body["code"] ?? ""), $body["challengeId"] ?? "");
    $known = (string) ($current["code_hash"] ?? "");
    $match = strlen($known) === strlen($expect) && $known !== "" && hash_equals($known, $expect);
    if (!$match) {
      $next = (int) $current["attempts"] + 1;
      if ($next >= 5) pos_q("UPDATE business_admin_otp SET attempts = ?, used_at = NOW() WHERE id = ?", "is", [$next, $row["id"]]);
      else pos_q("UPDATE business_admin_otp SET attempts = ? WHERE id = ?", "is", [$next, $row["id"]]);
      pos_admin_log($row["staff_user_id"], $row["business_id"], $next >= 5 ? "otp_lockout" : "otp_fail", "whatsapp", $device);
      pos_admin_fail($next >= 5 ? 429 : 400, $next >= 5 ? "Too many attempts. Wait and try again." : "Verification failed.");
    }
    if (pos_admin_exec("UPDATE business_admin_otp SET used_at = NOW() WHERE id = ? AND used_at IS NULL", "s", [$row["id"]]) < 1) {
      pos_admin_fail(400, "Verification failed.");
    }
    if ($purpose === "login") {
      $users = pos_q("SELECT * FROM staff_users WHERE id = ? AND status = 'active' LIMIT 1", "s", [$row["staff_user_id"]]);
      $user = $users[0] ?? null;
      if (!$user) pos_admin_fail(400, "Verification failed.");
      $biz = pos_q("SELECT * FROM businesses WHERE id = ? LIMIT 1", "s", [$row["business_id"]]);
      pos_admin_log($user["id"], $user["business_id"], "otp_ok", "whatsapp", $device);
      $body["remember"] = (int) ($row["remember_me"] ?? 0) === 1;
      $body["branchId"] = $row["branch_id"] ?: ($user["branch_id"] ?? "");
      pos_admin_finish_login($user, $biz[0] ?? null, $body);
    }
    $staff = pos_admin_require_admin();
    if (($staff["user"]["id"] ?? "") !== $row["staff_user_id"]) pos_admin_fail(401, "Sign in required");
    if ($purpose === "verify_number" && !empty($row["pending_number"])) {
      pos_q(
        "INSERT INTO business_admin_security (staff_user_id, business_id, whatsapp_number, whatsapp_verified_at, otp_login_enabled)
         VALUES (?,?,?,NOW(),0)
         ON DUPLICATE KEY UPDATE whatsapp_number = VALUES(whatsapp_number), whatsapp_verified_at = NOW(), otp_login_enabled = 0",
        "sss",
        [$staff["user"]["id"], $staff["user"]["business_id"], $row["pending_number"]]
      );
      pos_admin_revoke_other_sessions($staff["user"]["id"]);
      pos_admin_log($staff["user"]["id"], $staff["user"]["business_id"], "whatsapp_verified", "whatsapp", $device);
      pos_send(200, ["ok" => true, "whatsappMasked" => pos_admin_mask($row["pending_number"]), "whatsappVerified" => true, "php" => true]);
    }
    pos_send(200, ["ok" => true, "purpose" => $purpose, "php" => true]);
  }
  if ($path === "auth/pin/verify") {
    $row = pos_admin_load_challenge($body["challengeId"] ?? "", "login");
    if (!$row || !empty($row["used_at"]) || (string) ($row["device_id"] ?? "") !== $device) pos_admin_fail(400, "Verification failed.");
    $open = pos_q("SELECT expires_at > NOW() AS open_row FROM business_admin_otp WHERE id = ?", "s", [$row["id"]]);
    if (empty($open[0]["open_row"])) pos_admin_fail(400, "Verification failed.");
    $users = pos_q("SELECT * FROM staff_users WHERE id = ? AND status = 'active' LIMIT 1", "s", [$row["staff_user_id"]]);
    $user = $users[0] ?? null;
    if (!$user) pos_admin_fail(400, "Verification failed.");
    $locked = pos_q("SELECT staff_user_id FROM business_admin_security WHERE staff_user_id = ? AND pin_locked_until > NOW() LIMIT 1", "s", [$user["id"]]);
    $devLock = $device !== "" ? pos_q("SELECT device_id FROM business_admin_devices WHERE staff_user_id = ? AND device_id = ? AND pin_locked_until > NOW() LIMIT 1", "ss", [$user["id"], $device]) : [];
    if ($locked || $devLock) pos_admin_fail(429, "Too many attempts. Wait and try again.");
    $pinRow = pos_admin_pin_row($user["id"]);
    $pin = (string) ($body["pin"] ?? "");
    $ok = preg_match("/^\d{6}$/", $pin) && $pinRow && pos_admin_pin_ok($pin, $pinRow["pin_hash"]);
    if (!$ok) {
      pos_q("UPDATE business_admin_otp SET attempts = attempts + 1, used_at = IF(attempts + 1 >= 5, NOW(), used_at) WHERE id = ? AND used_at IS NULL", "s", [$row["id"]]);
      pos_q(
        "INSERT INTO business_admin_security (staff_user_id, business_id, pin_fails) SELECT id, business_id, 1 FROM staff_users WHERE id = ?
         ON DUPLICATE KEY UPDATE pin_fails = pin_fails + 1",
        "s",
        [$user["id"]]
      );
      $fails = pos_q("SELECT pin_fails FROM business_admin_security WHERE staff_user_id = ?", "s", [$user["id"]]);
      $n = (int) ($fails[0]["pin_fails"] ?? 0);
      if ($n >= 5) {
        pos_q("UPDATE business_admin_security SET pin_fails = 5, pin_locked_until = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE staff_user_id = ?", "s", [$user["id"]]);
      }
      pos_admin_log($user["id"], $user["business_id"], $n >= 5 ? "pin_lockout" : "pin_fail", "pin", $device);
      pos_admin_fail($n >= 5 ? 429 : 400, $n >= 5 ? "Too many attempts. Wait and try again." : "Verification failed.");
    }
    if (pos_admin_exec("UPDATE business_admin_otp SET used_at = NOW() WHERE id = ? AND used_at IS NULL", "s", [$row["id"]]) < 1) {
      pos_admin_fail(400, "Verification failed.");
    }
    pos_q("UPDATE business_admin_security SET pin_fails = 0, pin_locked_until = NULL WHERE staff_user_id = ?", "s", [$user["id"]]);
    pos_admin_log($user["id"], $user["business_id"], "pin_ok", "pin", $device);
    $biz = pos_q("SELECT * FROM businesses WHERE id = ? LIMIT 1", "s", [$user["business_id"]]);
    $body["remember"] = (int) ($row["remember_me"] ?? 0) === 1;
    $body["branchId"] = $row["branch_id"] ?: ($user["branch_id"] ?? "");
    pos_admin_finish_login($user, $biz[0] ?? null, $body);
  }
  if ($path === "auth/pin/setup") pos_admin_save_pin($body, "pin_setup");
  if ($path === "auth/pin/reset") pos_admin_save_pin($body, "pin_reset");
  if ($path === "auth/security/settings" && $method === "GET") {
    $staff = pos_staff_session();
    if (!$staff) pos_admin_fail(401, "Sign in required");
    if (($staff["user"]["role"] ?? "") !== "business_admin") pos_send(200, ["ok" => true, "applicable" => false, "php" => true]);
    pos_send(200, pos_admin_settings_payload($staff["user"]["id"]));
  }
  if ($path === "auth/security/settings" && $method === "POST") {
    $staff = pos_admin_require_admin();
    $user = $staff["user"];
    $enable = !empty($body["otpLoginEnabled"]);
    $sec = pos_admin_security_row($user["id"]);
    if ($enable && !pos_admin_verified($sec)) pos_admin_fail(400, "Verify the WhatsApp number first.");
    pos_q(
      "INSERT INTO business_admin_security (staff_user_id, business_id, otp_login_enabled) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE otp_login_enabled = VALUES(otp_login_enabled)",
      "ssi",
      [$user["id"], $user["business_id"], $enable ? 1 : 0]
    );
    if ($enable) pos_admin_revoke_other_sessions($user["id"]);
    pos_admin_log($user["id"], $user["business_id"], $enable ? "otp_login_on" : "otp_login_off", "whatsapp", $device);
    pos_send(200, pos_admin_settings_payload($user["id"]));
  }
  if ($path === "auth/login/history") {
    $staff = pos_admin_require_admin();
    pos_send(200, ["ok" => true, "history" => pos_admin_history($staff["user"]["id"]), "php" => true]);
  }
  if ($path === "auth/session/revoke") {
    $staff = pos_admin_require_admin();
    $user = $staff["user"];
    $current = pos_admin_current_session_id();
    $target = (string) ($body["sessionId"] ?? "");
    $dev = pos_device_id($body);
    if ($dev !== "") {
      $rows = pos_q("SELECT last_session_id FROM business_admin_devices WHERE staff_user_id = ? AND device_id = ? LIMIT 1", "ss", [$user["id"], $dev]);
      $target = (string) ($rows[0]["last_session_id"] ?? "");
      pos_q("UPDATE business_admin_devices SET revoked_at = NOW() WHERE staff_user_id = ? AND device_id = ?", "ss", [$user["id"], $dev]);
    }
    if ($target !== "") {
      pos_q("UPDATE staff_sessions SET revoked_at = NOW() WHERE id = ? AND staff_user_id = ? AND revoked_at IS NULL", "ss", [$target, $user["id"]]);
    }
    pos_admin_log($user["id"], $user["business_id"], "session_revoke", "", $dev);
    pos_send(200, ["ok" => true, "signedOut" => $target !== "" && $target === $current, "php" => true]);
  }
  return false;
}
