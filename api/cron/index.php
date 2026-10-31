<?php
/** Five-minute scheduler entry. The response has counts only, never shop figures. */
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");
if (($_SERVER["REQUEST_METHOD"] ?? "GET") !== "GET" && ($_SERVER["REQUEST_METHOD"] ?? "GET") !== "POST") {
  http_response_code(405);
  echo json_encode(["ok" => false, "error" => "Use GET"]);
  exit;
}
$root = dirname(__DIR__, 2);
try {
  require_once $root . "/pos-php-core.php";
  require_once $root . "/pos-automation.php";
  $result = pos_automation_tick();
  echo json_encode([
    "ok" => true,
    "php" => true,
    "skipped" => !empty($result["skipped"]),
    "enqueued" => (int) ($result["enqueued"] ?? 0),
    "sent" => (int) ($result["sent"] ?? 0),
    "failed" => (int) ($result["failed"] ?? 0),
    "dropped" => (int) ($result["dropped"] ?? 0),
    "removedNotices" => (int) ($result["removedNotices"] ?? 0),
    "testMode" => !empty($result["testMode"]),
    "seoUpdated" => !empty($result["seoUpdated"]),
  ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
  http_response_code(500);
  error_log("automation cron: " . $e->getMessage());
  echo json_encode(["ok" => false, "error" => "Automation tick failed"]);
}
