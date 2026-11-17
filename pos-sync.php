<?php

function pos_sync_batch($staff, $body) {
  $device = trim((string) ($body["deviceId"] ?? ($body["device_id"] ?? "")));
  $business = (string) ($staff["user"]["business_id"] ?? "");
  $rows = array_slice(is_array($body["transactions"] ?? null) ? $body["transactions"] : [], 0, 20);
  $rejected = [];
  foreach ($rows as $txn) {
    if (!is_array($txn)) continue;
    $id = trim((string) ($txn["transactionId"] ?? ($txn["idempotencyKey"] ?? "")));
    $error = "";
    if (!preg_match('/^[A-Za-z0-9_-]{8,80}$/', $id)) $error = "Transaction id required";
    else if (!preg_match('/^[A-Za-z0-9_-]{8,64}$/', $device)) $error = "This device is not authorized";
    else if (($txn["deviceId"] ?? "") !== "" && (string) $txn["deviceId"] !== $device) $error = "This device is not authorized";
    else if ($business === "") $error = "Shop sign in required";
    else if (($txn["businessId"] ?? "") !== "" && (string) $txn["businessId"] !== $business) $error = "This transaction belongs to another shop";
    if ($error !== "") $rejected[] = ["transactionId" => $id, "error" => $error];
  }
  return [
    "accepted" => [],
    "duplicate" => [],
    "rejected" => $rejected,
    "pending" => [],
    "applied" => new stdClass(),
    "fallback" => true,
    "changes" => ["items" => [], "customers" => [], "taxes" => [], "settings" => ["company" => null, "business" => null]],
  ];
}
