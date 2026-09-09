<?php
/** Standalone health check — does not load pos-php-core.php unless a backup email slot is due. */
header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Credentials: true");
if (($_SERVER["REQUEST_METHOD"] ?? "GET") === "OPTIONS") {
  http_response_code(204);
  exit;
}

function health_out($status, $payload) {
  http_response_code((int) $status);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE);
  exit;
}

$root = dirname(__DIR__, 2);
$out = ["ok" => true, "multiTenant" => true, "php" => true, "node" => false];

function health_load_db_map($root) {
  $dbFile = $root . "/pos-db.php";
  if (is_file($dbFile)) {
    $map = include $dbFile;
    if (is_array($map)) return $map;
  }
  foreach ([$root . "/.env", dirname($root) . "/.env"] as $envFile) {
    if (!is_file($envFile)) continue;
    $map = [];
    foreach (preg_split("/\r\n|\n|\r/", (string) file_get_contents($envFile)) as $line) {
      $line = trim($line);
      if ($line === "" || $line[0] === "#" || strpos($line, "=") === false) continue;
      [$k, $v] = explode("=", $line, 2);
      $map[trim($k)] = trim($v, " \t\"'");
    }
    if (!empty($map["DB_NAME"]) && !empty($map["DB_USER"])) return $map;
  }
  return null;
}

function health_backup_email_due($db) {
  try {
    $tz = new DateTimeZone("Asia/Kolkata");
  } catch (Exception $e) {
    return false;
  }
  $now = new DateTime("now", $tz);
  $hour = (int) $now->format("G");
  if (!in_array($hour, [6, 10, 14, 18, 22], true)) return false;
  $slot = $now->format("Y-m-d") . "T" . $now->format("H");
  $map = [];
  $res = @$db->query(
    "SELECT setting_key, setting_value FROM platform_settings
     WHERE setting_key IN ('alert_backup_email','backup_email_last_slot')"
  );
  if ($res) {
    while ($row = $res->fetch_assoc()) $map[$row["setting_key"]] = $row["setting_value"] ?? "";
    $res->free();
  }
  $flag = strtolower(trim((string) ($map["alert_backup_email"] ?? "1")));
  if (in_array($flag, ["0", "false", "no", "off"], true)) return false;
  return ($map["backup_email_last_slot"] ?? "") !== $slot;
}

try {
  $map = health_load_db_map($root);
  if (!$map || empty($map["DB_NAME"]) || empty($map["DB_USER"])) {
    health_out(503, $out + [
      "ok" => false,
      "setup" => "/setup.html",
      "error" => "MySQL not configured. Open /setup.html and save database settings.",
    ]);
  }
  $host = trim((string) ($map["DB_HOST"] ?? "localhost")) ?: "localhost";
  if ($host === "127.0.0.1" || $host === "::1") $host = "localhost";
  $db = @new mysqli(
    $host,
    (string) $map["DB_USER"],
    (string) ($map["DB_PASSWORD"] ?? ""),
    (string) $map["DB_NAME"],
    (int) ($map["DB_PORT"] ?? 3306)
  );
  if (!$db || $db->connect_errno) {
    health_out(503, $out + [
      "ok" => false,
      "error" => "MySQL connect failed",
      "hint" => "Use DB_HOST=localhost on Hostinger",
    ]);
  }
  $res = $db->query("SELECT 1");
  if (!$res) {
    $db->close();
    health_out(503, $out + ["ok" => false, "error" => "MySQL query failed"]);
  }

  $due = false;
  try {
    $due = health_backup_email_due($db);
  } catch (Throwable $e) {
    $due = false;
  }
  $db->close();

  if ($due) {
    ignore_user_abort(true);
    http_response_code(200);
    header("Content-Type: application/json; charset=utf-8");
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    if (function_exists("fastcgi_finish_request")) {
      @fastcgi_finish_request();
    } else {
      if (function_exists("ob_flush")) @ob_flush();
      @flush();
    }
    try {
      @set_time_limit(180);
      require_once $root . "/pos-php-core.php";
      $backup = $root . "/pos-backup.php";
      if (is_file($backup)) {
        require_once $backup;
        if (function_exists("pos_tick_backup_email")) pos_tick_backup_email();
      }
    } catch (Throwable $e) {
      error_log("backup email tick: " . $e->getMessage());
    }
    exit;
  }
} catch (Throwable $e) {
  health_out(503, $out + ["ok" => false, "error" => $e->getMessage()]);
}

health_out(200, $out);
