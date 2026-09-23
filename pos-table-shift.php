<?php

function pos_normalize_table_no($raw) {
  $t = trim(substr((string) $raw, 0, 64));
  if ($t === "") return "";
  if (preg_match("/^(parcel|takeaway|take away|pickup|pick up)$/i", $t)) return "Parcel";
  if (preg_match("/^table\\s*(\\d{1,3})$/i", $t, $m)) return (string) intval($m[1]);
  if (preg_match("/^\\d{1,3}$/", $t)) return (string) intval($t);
  return substr($t, 0, 32);
}

function pos_hold_table_label($tableNo) {
  $t = pos_normalize_table_no($tableNo);
  if ($t === "" || $t === "Parcel") return $t === "Parcel" ? "Parcel" : "";
  if (preg_match("/^\\d+$/", $t)) return "Table " . $t;
  return $t;
}

function pos_ensure_table_shift_schema() {
  pos_ensure_columns("company_settings", [
    "table_shifting_enabled" => "TINYINT(1) NOT NULL DEFAULT 0",
  ]);
  pos_q("CREATE TABLE IF NOT EXISTS table_shift_history (
    id VARCHAR(36) PRIMARY KEY,
    business_id VARCHAR(36) NOT NULL,
    order_number VARCHAR(180) NULL,
    old_table VARCHAR(64) NOT NULL,
    new_table VARCHAR(64) NOT NULL,
    shifted_by VARCHAR(180) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id), INDEX (created_at)
  )");
}

function pos_table_shifting_on($bid) {
  pos_ensure_table_shift_schema();
  $rows = pos_q("SELECT table_shifting_enabled FROM company_settings WHERE business_id = ? LIMIT 1", "s", [$bid]);
  $v = $rows[0]["table_shifting_enabled"] ?? 0;
  return $v === 1 || $v === "1" || $v === true;
}

function pos_table_layout_ids($bid) {
  $rows = pos_q("SELECT dining_tables_json FROM company_settings WHERE business_id = ? LIMIT 1", "s", [$bid]);
  $json = function_exists("pos_clip_dining_tables_json")
    ? pos_clip_dining_tables_json($rows[0]["dining_tables_json"] ?? "[]")
    : ($rows[0]["dining_tables_json"] ?? "[]");
  $parsed = json_decode((string) $json, true);
  $ids = [];
  $tables = is_array($parsed["tables"] ?? null) ? $parsed["tables"] : [];
  foreach ($tables as $t) {
    $id = pos_normalize_table_no($t["id"] ?? "");
    if ($id !== "" && $id !== "Parcel") $ids[$id] = true;
  }
  return $ids;
}

function pos_hold_payload_table($row) {
  $raw = $row["payload_json"] ?? "";
  $parsed = is_string($raw) ? json_decode($raw, true) : $raw;
  if (!is_array($parsed)) $parsed = [];
  $fromPayload = pos_normalize_table_no($parsed["table_no"] ?? $parsed["tableNo"] ?? "");
  if ($fromPayload) return [$fromPayload, $parsed];
  $label = pos_normalize_table_no($row["label"] ?? "");
  return [$label, $parsed];
}

function pos_table_qr_open($order) {
  $st = strtolower((string) ($order["status"] ?? ""));
  return !in_array($st, ["cancelled", "rejected"], true);
}

function pos_table_occupied($bid, $tableNo) {
  $want = pos_normalize_table_no($tableNo);
  if ($want === "" || $want === "Parcel") return false;
  try {
    $holds = pos_q("SELECT id, label, payload_json FROM held_bills WHERE business_id = ?", "s", [$bid]);
    foreach ($holds as $row) {
      [$have] = pos_hold_payload_table($row);
      if ($have === $want) return true;
    }
  } catch (Exception $e) { /* optional */ }
  try {
    $qrs = pos_q("SELECT table_no, status FROM qr_orders WHERE business_id = ?", "s", [$bid]);
    foreach ($qrs as $row) {
      if (!pos_table_qr_open($row)) continue;
      if (pos_normalize_table_no($row["table_no"] ?? "") === $want) return true;
    }
  } catch (Exception $e) { /* optional */ }
  return false;
}

function pos_dispatch_table_shift($path, $method, $body, $bid, $auth) {
    pos_ensure_table_shift_schema();
    pos_ensure_held_bills_schema();
    if ($path === "tables/shifts" && $method === "GET") {
    $rows = [];
    try {
      $rows = pos_q(
        "SELECT id, order_number, old_table, new_table, shifted_by, created_at
         FROM table_shift_history WHERE business_id = ? ORDER BY created_at DESC LIMIT 80",
        "s",
        [$bid]
      );
    } catch (Exception $e) {
      $rows = [];
    }
    pos_send(200, ["ok" => true, "shifts" => $rows, "php" => true]);
  }

  if ($path === "tables/shift" && $method === "POST") {
    $biz = pos_q("SELECT * FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
    if (function_exists("pos_shop_kind") && pos_shop_kind($biz[0] ?? []) !== "restaurant") {
      pos_send(400, ["error" => "Table shifting is for restaurant and cafe shops", "php" => true]);
    }
    if (!pos_table_shifting_on($bid)) {
      pos_send(400, ["error" => "Table shifting is turned off in Settings", "php" => true]);
    }
    $from = pos_normalize_table_no($body["from_table"] ?? $body["fromTable"] ?? $body["from"] ?? "");
    $to = pos_normalize_table_no($body["to_table"] ?? $body["toTable"] ?? $body["to"] ?? "");
    if ($from === "" || $to === "") pos_send(400, ["error" => "Choose the current table and the new table", "php" => true]);
    if ($from === $to) pos_send(400, ["error" => "Pick a different table", "php" => true]);
    if ($from === "Parcel" || $to === "Parcel") pos_send(400, ["error" => "Parcel / takeaway cannot be shifted", "php" => true]);
    $ids = pos_table_layout_ids($bid);
    if (!isset($ids[$to])) pos_send(400, ["error" => "New table is not on the floor plan", "php" => true]);
    if (!isset($ids[$from])) pos_send(400, ["error" => "Current table is not on the floor plan", "php" => true]);
    if (!pos_table_occupied($bid, $from)) pos_send(400, ["error" => "No active order on that table", "php" => true]);
    if (pos_table_occupied($bid, $to)) pos_send(400, ["error" => "Destination table is occupied", "php" => true]);

    $movedQr = [];
    $movedKots = 0;
    $movedHold = false;
    $orderNumbers = [];

    try {
      $holds = pos_q("SELECT id, label, payload_json FROM held_bills WHERE business_id = ?", "s", [$bid]);
      foreach ($holds as $row) {
        [$have, $payload] = pos_hold_payload_table($row);
        if ($have !== $from) continue;
        $payload["table_no"] = $to;
        $label = pos_hold_table_label($to);
        pos_q(
          "UPDATE held_bills SET label = ?, payload_json = ? WHERE id = ? AND business_id = ?",
          "ssss",
          [$label, json_encode($payload), $row["id"], $bid]
        );
        $movedHold = true;
      }
    } catch (Exception $e) { /* optional */ }

    try {
      $kots = pos_q("SELECT id, table_no, status FROM kitchen_tickets WHERE business_id = ?", "s", [$bid]);
      foreach ($kots as $row) {
        if (pos_normalize_table_no($row["table_no"] ?? "") !== $from) continue;
        $st = strtolower((string) ($row["status"] ?? ""));
        if (in_array($st, ["cancelled", "void"], true)) continue;
        try {
          pos_q("UPDATE kitchen_tickets SET table_no = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND business_id = ?", "sss", [$to, $row["id"], $bid]);
        } catch (Exception $e) {
          pos_q("UPDATE kitchen_tickets SET table_no = ? WHERE id = ? AND business_id = ?", "sss", [$to, $row["id"], $bid]);
        }
        $movedKots += 1;
      }
    } catch (Exception $e) { /* optional */ }

    try {
      $qrs = pos_q("SELECT id, order_number, table_no, status FROM qr_orders WHERE business_id = ?", "s", [$bid]);
      foreach ($qrs as $row) {
        if (!pos_table_qr_open($row)) continue;
        if (pos_normalize_table_no($row["table_no"] ?? "") !== $from) continue;
        pos_q("UPDATE qr_orders SET table_no = ? WHERE id = ? AND business_id = ?", "sss", [$to, $row["id"], $bid]);
        $movedQr[] = $row["id"];
        if (!empty($row["order_number"])) $orderNumbers[] = $row["order_number"];
      }
    } catch (Exception $e) { /* optional */ }

    $who = (string) ($auth["user"]["name"] ?? $auth["user"]["email"] ?? $auth["user"]["username"] ?? "staff");
    $orderNumber = $orderNumbers ? implode(", ", array_values(array_unique($orderNumbers))) : ($movedHold ? pos_hold_table_label($from) : "");
    pos_q(
      "INSERT INTO table_shift_history (id, business_id, order_number, old_table, new_table, shifted_by) VALUES (?,?,?,?,?,?)",
      "ssssss",
      [bin2hex(random_bytes(16)), $bid, $orderNumber, $from, $to, $who]
    );
    pos_send(200, [
      "ok" => true,
      "from" => $from,
      "to" => $to,
      "hold" => $movedHold,
      "kots" => $movedKots,
      "qr_orders" => $movedQr,
      "order_number" => $orderNumber,
      "php" => true,
    ]);
  }
  return false;
}
