<?php
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

$suffix = $path . ($qs !== "" ? "?" . $qs : "");
foreach (pos_read_ports() as $port) {
  $got = pos_curl("http://127.0.0.1:" . $port . "/api/" . $suffix, $method, $body, $cookie);
  if ($got && pos_looks_json($got[3])) {
    pos_send_result($got[0], $got[1], $got[2], $got[3]);
    exit;
  }
}

http_response_code(503);
header("Content-Type: application/json; charset=utf-8");
echo json_encode([
  "error" => "Node.js is not running on this Hostinger site. In hPanel create/open a Node.js web app on pos.atavtelecom.in (Express, entry server.js), paste DB env vars, Deploy, then Restart. Put the app port in pos-node.json if login still fails.",
  "bridge" => "down",
]);
