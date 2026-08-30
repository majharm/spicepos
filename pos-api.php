<?php
header("Access-Control-Allow-Origin: " . (isset($_SERVER["HTTP_ORIGIN"]) ? $_SERVER["HTTP_ORIGIN"] : "*"));
header("Access-Control-Allow-Credentials: true");
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
$cfgFile = __DIR__ . "/pos-bridge.json";
$port = 0;
$host = "127.0.0.1";
if (is_file($cfgFile)) {
  $cfg = json_decode((string) file_get_contents($cfgFile), true);
  $port = (int) ($cfg["port"] ?? 0);
  if (!empty($cfg["host"])) $host = (string) $cfg["host"];
}
if ($port < 1) {
  $port = (int) getenv("PORT");
}
if ($port < 1) {
  http_response_code(503);
  header("Content-Type: application/json; charset=utf-8");
  echo json_encode([
    "error" => "POS Node is not listening. In hPanel open the Node.js web app, entry server.js, then Restart.",
  ]);
  exit;
}

$url = "http://" . $host . ":" . $port . "/api/" . $path . ($qs !== "" ? "?" . $qs : "");
$method = $_SERVER["REQUEST_METHOD"] ?? "GET";
$body = file_get_contents("php://input");
$cookie = $_SERVER["HTTP_COOKIE"] ?? "";

function pos_send_result($status, $contentType, $setCookies, $body) {
  http_response_code($status > 0 ? $status : 502);
  if ($contentType) header("Content-Type: " . $contentType);
  else header("Content-Type: application/json; charset=utf-8");
  foreach ($setCookies as $c) header("Set-Cookie: " . $c, false);
  echo $body;
}

if (function_exists("curl_init")) {
  $ch = curl_init($url);
  $headers = ["Accept: application/json"];
  if ($cookie) $headers[] = "Cookie: " . $cookie;
  if ($body !== false && $body !== "") {
    $headers[] = "Content-Type: application/json";
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
  }
  curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER => true,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_HTTPHEADER => $headers,
  ]);
  $raw = curl_exec($ch);
  if ($raw === false) {
    pos_send_result(502, "application/json; charset=utf-8", [], json_encode(["error" => "Could not reach POS Node on port " . $port]));
    exit;
  }
  $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
  $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $headerBlob = substr($raw, 0, $headerSize);
  $respBody = substr($raw, $headerSize);
  $contentType = "";
  $setCookies = [];
  foreach (preg_split("/\r\n|\n|\r/", $headerBlob) as $line) {
    if (stripos($line, "Content-Type:") === 0) $contentType = trim(substr($line, 13));
    if (stripos($line, "Set-Cookie:") === 0) $setCookies[] = trim(substr($line, 11));
  }
  pos_send_result($status, $contentType, $setCookies, $respBody);
  exit;
}

$opts = [
  "http" => [
    "method" => $method,
    "header" => "Accept: application/json\r\n" . ($cookie ? "Cookie: $cookie\r\n" : "") . ($body ? "Content-Type: application/json\r\n" : ""),
    "content" => $body === false ? "" : $body,
    "ignore_errors" => true,
    "timeout" => 20,
  ],
];
$ctx = stream_context_create($opts);
$respBody = @file_get_contents($url, false, $ctx);
$status = 502;
$contentType = "application/json; charset=utf-8";
$setCookies = [];
if (isset($http_response_header) && is_array($http_response_header)) {
  foreach ($http_response_header as $line) {
    if (preg_match("#^HTTP/\\S+ (\\d+)#", $line, $m)) $status = (int) $m[1];
    if (stripos($line, "Content-Type:") === 0) $contentType = trim(substr($line, 13));
    if (stripos($line, "Set-Cookie:") === 0) $setCookies[] = trim(substr($line, 11));
  }
}
if ($respBody === false) {
  pos_send_result(502, "application/json; charset=utf-8", [], json_encode(["error" => "Could not reach POS Node on port " . $port]));
  exit;
}
pos_send_result($status, $contentType, $setCookies, $respBody);
