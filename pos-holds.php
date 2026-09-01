<?php

function pos_hold_row($row) {
  $payload = [];
  if (isset($row["payload"]) && is_array($row["payload"])) {
    $payload = $row["payload"];
  } else {
    $raw = $row["payload_json"] ?? "{}";
    $parsed = is_string($raw) ? json_decode($raw, true) : $raw;
    $payload = is_array($parsed) ? $parsed : [];
  }
  unset($row["payload_json"]);
  $row["payload"] = $payload;
  return $row;
}

function pos_dispatch_holds($path, $method, $body, $bid, $branchId, $uid, $auth) {
  pos_ensure_held_bills_schema();

  if ($path === "holds" && $method === "GET") {
    try {
      $rows = pos_q(
        "SELECT id, label, created_at, payload_json FROM held_bills WHERE business_id = ? ORDER BY created_at DESC LIMIT 50",
        "s",
        [$bid]
      );
    } catch (Exception $e) {
      pos_send(200, []);
    }
    $out = [];
    foreach ($rows as $row) $out[] = pos_hold_row($row);
    pos_send(200, $out);
  }

  if ($path === "holds" && $method === "POST") {
    $payload = $body["payload"] ?? [];
    if (!is_array($payload)) $payload = [];
    $cart = $payload["cart"] ?? [];
    if (!is_array($cart) || !$cart) {
      pos_send(400, ["error" => "Cart is empty", "php" => true]);
    }
    $id = pos_uuid();
    $label = trim((string) ($body["label"] ?? "Held bill"));
    if ($label === "") $label = "Held bill";
    pos_q(
      "INSERT INTO held_bills (id, business_id, branch_id, user_id, label, payload_json) VALUES (?,?,?,?,?,?)",
      "ssssss",
      [
        $id,
        $bid,
        $branchId ? (string) $branchId : null,
        $uid ? (string) $uid : null,
        $label,
        json_encode($payload),
      ]
    );
    pos_send(200, ["ok" => true, "id" => $id, "php" => true]);
  }

  if (preg_match('#^holds/([^/]+)$#', $path, $m)) {
    $id = $m[1];
    if ($method === "GET") {
      $rows = pos_q("SELECT * FROM held_bills WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$id, $bid]);
      if (!$rows) pos_send(404, ["error" => "Held bill not found", "php" => true]);
      pos_send(200, pos_hold_row($rows[0]));
    }
    if ($method === "DELETE") {
      pos_q("DELETE FROM held_bills WHERE id = ? AND business_id = ?", "ss", [$id, $bid]);
      pos_send(200, ["ok" => true, "php" => true]);
    }
    pos_send(405, ["error" => "Use GET or DELETE", "php" => true]);
  }

  pos_send(405, ["error" => "Unsupported held-bill action", "path" => $path, "method" => $method, "php" => true]);
}
