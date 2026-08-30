<?php
/** Standalone health check — does not load pos-php-core.php (avoids 500 if core has errors). */
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
  $db->close();
  if (!$res) {
    health_out(503, $out + ["ok" => false, "error" => "MySQL query failed"]);
  }
} catch (Throwable $e) {
  health_out(503, $out + ["ok" => false, "error" => $e->getMessage()]);
}

health_out(200, $out);
