<?php
$uri = parse_url($_SERVER["REQUEST_URI"] ?? "", PHP_URL_PATH) ?: "";
if (preg_match('#/api/(aggregator(?:/.*)?)$#', $uri, $m)) {
  $_GET["p"] = trim($m[1], "/");
} else {
  $_GET["p"] = "aggregator/orders";
}
require dirname(__DIR__, 2) . "/pos-api.php";
