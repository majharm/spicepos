<?php
@set_time_limit(180);
@ini_set("memory_limit", "256M");
header("Access-Control-Allow-Credentials: true");
if (!empty($_SERVER["HTTP_ORIGIN"])) {
  header("Access-Control-Allow-Origin: " . $_SERVER["HTTP_ORIGIN"]);
}
if (($_SERVER["REQUEST_METHOD"] ?? "") === "OPTIONS") {
  http_response_code(204);
  exit;
}

$path = $_GET["p"] ?? $_GET["path"] ?? ($_SERVER["HTTP_X_POS_PATH"] ?? "health");
$path = preg_replace("#^/+#", "", (string) $path);
$path = preg_replace("#^api/#", "", $path);
if ($path === "" || !preg_match("#^[A-Za-z0-9][A-Za-z0-9/_-]*$#", $path)) {
  http_response_code(400);
  header("Content-Type: application/json; charset=utf-8");
  echo json_encode(["error" => "Bad API path"]);
  exit;
}

$q = $_GET;
unset($q["p"], $q["path"]);
$qs = http_build_query($q);
$method = $_SERVER["REQUEST_METHOD"] ?? "GET";
$body = file_get_contents("php://input");
$cookie = $_SERVER["HTTP_COOKIE"] ?? "";

if ($path === "health" && $method === "GET") {
  require __DIR__ . "/api/health/index.php";
  exit;
}

function pos_send_result($status, $contentType, $setCookies, $body) {
  http_response_code($status > 0 ? $status : 502);
  header("Content-Type: " . ($contentType ?: "application/json; charset=utf-8"));
  foreach ($setCookies as $c) header("Set-Cookie: " . $c, false);
  echo $body;
}

function pos_parse_http($raw, $headerSize, $fallbackStatus) {
  $headerBlob = substr($raw, 0, $headerSize);
  $respBody = substr($raw, $headerSize);
  $contentType = "";
  $setCookies = [];
  foreach (preg_split("/\r\n|\n|\r/", $headerBlob) as $line) {
    if (stripos($line, "Content-Type:") === 0) $contentType = trim(substr($line, 13));
    if (stripos($line, "Set-Cookie:") === 0) $setCookies[] = trim(substr($line, 11));
  }
  return [$fallbackStatus, $contentType, $setCookies, $respBody];
}

function pos_looks_json($body) {
  $t = ltrim((string) $body);
  return $t !== "" && ($t[0] === "{" || $t[0] === "[");
}

function pos_curl($url, $method, $body, $cookie, $hostHeader = "") {
  if (!function_exists("curl_init")) return null;
  $ch = curl_init($url);
  $headers = ["Accept: application/json"];
  if ($hostHeader) $headers[] = "Host: " . $hostHeader;
  if ($cookie) $headers[] = "Cookie: " . $cookie;
  if ($body !== false && $body !== "") {
    $headers[] = "Content-Type: application/json";
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
  }
  curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER => true,
    CURLOPT_CONNECTTIMEOUT => 1,
    CURLOPT_TIMEOUT => 3,
    CURLOPT_HTTPHEADER => $headers,
  ]);
  $raw = curl_exec($ch);
  if ($raw === false) return null;
  $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
  $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
  return pos_parse_http($raw, $headerSize, $status);
}

function pos_collect_files() {
  $doc = rtrim((string) ($_SERVER["DOCUMENT_ROOT"] ?? __DIR__), "/");
  $home = (string) (getenv("HOME") ?: "");
  $out = [];
  $add = function ($p) use (&$out) {
    if ($p && is_file($p)) $out[$p] = $p;
  };
  foreach ([$doc, __DIR__, dirname(__DIR__), getcwd(), dirname($doc)] as $dir) {
    if (!$dir) continue;
    $add($dir . "/pos-node.json");
    $add($dir . "/pos-bridge.json");
    $add($dir . "/pos-port.txt");
    $add($dir . "/.env");
  }
  if ($home) {
    foreach (glob($home . "/domains/*/public_html/pos-bridge.json") ?: [] as $f) $add($f);
    foreach (glob($home . "/domains/*/public_html/pos-node.json") ?: [] as $f) $add($f);
    foreach (glob($home . "/domains/*/public_html/.env") ?: [] as $f) $add($f);
    foreach (glob($home . "/domains/*/public_html/pos-port.txt") ?: [] as $f) $add($f);
  }
  return array_values($out);
}

function pos_ports_from_file($file) {
  $ports = [];
  $raw = (string) @file_get_contents($file);
  $base = basename($file);
  if ($base === "pos-port.txt") {
    $ports[] = (int) trim($raw);
    return $ports;
  }
  if (substr($base, -5) === ".json") {
    $cfg = json_decode($raw, true);
    if (!empty($cfg["port"])) $ports[] = (int) $cfg["port"];
    return $ports;
  }
  foreach (preg_split("/\r\n|\n|\r/", $raw) as $line) {
    $line = trim($line);
    if ($line === "" || $line[0] === "#") continue;
    if (preg_match("/^(?:PORT|POS_BRIDGE_PORT|NODE_PORT)\\s*=\\s*(\\d+)/i", $line, $m)) {
      $ports[] = (int) $m[1];
    }
  }
  return $ports;
}

function pos_read_ports() {
  $ports = [];
  foreach (pos_collect_files() as $file) {
    foreach (pos_ports_from_file($file) as $p) $ports[] = $p;
  }
  foreach ([getenv("PORT"), getenv("POS_BRIDGE_PORT"), getenv("NODE_PORT"), 3000, 3001, 5000, 5173, 8000, 8080, 8081, 4173, 38473, 10000, 12000, 16000] as $p) {
    $ports[] = (int) $p;
  }
  $out = [];
  foreach ($ports as $p) {
    if ($p > 0 && $p < 65536) $out[$p] = $p;
  }
  return array_values($out);
}

function pos_try_proxy($suffix, $method, $body, $cookie) {
  foreach (pos_read_ports() as $port) {
    $got = pos_curl("http://127.0.0.1:" . $port . "/api/" . $suffix, $method, $body, $cookie);
    if ($got && pos_looks_json($got[3])) return $got;
  }
  return null;
}

function pos_which_node() {
  foreach (["/opt/alt/alt-nodejs22/root/usr/bin/node", "/opt/alt/alt-nodejs20/root/usr/bin/node", "/opt/alt/alt-nodejs18/root/usr/bin/node", "/usr/bin/node", "/usr/local/bin/node"] as $p) {
    if (is_executable($p)) return $p;
  }
  if (!function_exists("shell_exec")) return "";
  foreach (["node", "nodejs"] as $bin) {
    $p = trim((string) @shell_exec("command -v " . escapeshellarg($bin) . " 2>/dev/null"));
    if ($p !== "" && is_executable($p)) return $p;
  }
  return "";
}

function pos_try_start_node() {
  $root = rtrim((string) ($_SERVER["DOCUMENT_ROOT"] ?? __DIR__), "/");
  if (!is_file($root . "/server.js")) return "missing server.js";
  $lock = $root . "/pos-node.startlock";
  if (is_file($lock) && filemtime($lock) > time() - 20) return "start already attempted";
  @touch($lock);
  $node = pos_which_node();
  if ($node === "") return "node binary not found";
  if (!function_exists("exec") && !function_exists("shell_exec")) return "PHP exec is disabled";
  $port = 38473;
  $log = $root . "/pos-node.log";
  $cmd = "cd " . escapeshellarg($root) . " && HOST=127.0.0.1 PORT=" . $port . " nohup " . escapeshellarg($node) . " server.js >> " . escapeshellarg($log) . " 2>&1 & echo \$!";
  $pid = "";
  if (function_exists("exec")) {
    $out = [];
    @exec($cmd, $out);
    $pid = trim((string) ($out[0] ?? ""));
  } else {
    $pid = trim((string) @shell_exec($cmd));
  }
  @file_put_contents($root . "/pos-node.json", json_encode(["host" => "127.0.0.1", "port" => $port]));
  usleep(1500000);
  return $pid !== "" ? "started pid " . $pid : "start command ran";
}

$suffix = $path . ($qs !== "" ? "?" . $qs : "");
$got = pos_try_proxy($suffix, $method, $body, $cookie);
if ($got) {
  pos_send_result($got[0], $got[1], $got[2], $got[3]);
  exit;
}

$start = "skipped";
$canExec = function_exists("exec") || function_exists("shell_exec");
if ($canExec) {
  $start = pos_try_start_node();
  $got = pos_try_proxy($suffix, $method, $body, $cookie);
  if ($got) {
    pos_send_result($got[0], $got[1], $got[2], $got[3]);
    exit;
  }
} else {
  $start = "PHP exec is disabled";
}

$hint = "";
$logFile = rtrim((string) ($_SERVER["DOCUMENT_ROOT"] ?? __DIR__), "/") . "/pos-node.log";
if (is_file($logFile)) {
  $tail = trim((string) substr((string) @file_get_contents($logFile), -400));
  $tail = preg_replace("/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/", "[email]", $tail);
  $tail = preg_replace("/password\\s*[=:]\\s*\\S+/i", "password=***", $tail);
  if ($tail !== "") $hint = $tail;
}

$coreFile = __DIR__ . "/pos-php-core.php";
if (!is_file($coreFile)) {
  http_response_code(503);
  header("Content-Type: application/json; charset=utf-8");
  echo json_encode(["error" => "pos-php-core.php missing on server", "php" => true]);
  exit;
}
$coreSrc = (string) @file_get_contents($coreFile);
if (!preg_match('/function\s+pos_send\s*\(/', $coreSrc)) {
  http_response_code(503);
  header("Content-Type: application/json; charset=utf-8");
  echo json_encode([
    "error" => "pos-php-core.php on server is broken. Re-upload pos-php-core.php from the latest deploy bundle.",
    "php" => true,
    "health" => "/api/health/",
  ]);
  exit;
}

require_once $coreFile;
try {
  pos_php_dispatch($path, $method, $body);
} catch (Throwable $e) {
  http_response_code(503);
  header("Content-Type: application/json; charset=utf-8");
  echo json_encode([
    "error" => $e->getMessage(),
    "php" => true,
    "nodeStart" => $start,
    "log" => $hint,
  ]);
}
