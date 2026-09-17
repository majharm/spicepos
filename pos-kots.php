<?php

function pos_ensure_kitchen_tickets_schema() {
  static $done = false;
  if ($done) return;
  $done = true;
  $db = pos_db();
  @$db->query(
    "CREATE TABLE IF NOT EXISTS kitchen_tickets (
      id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      table_no VARCHAR(64) NULL,
      kind VARCHAR(16) NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'new',
      notes VARCHAR(250) NULL,
      lines_json MEDIUMTEXT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NULL,
      INDEX (business_id),
      INDEX (business_id, status)
    )"
  );
}

function pos_clip_kot_lines($raw) {
  $list = is_array($raw) ? $raw : [];
  $out = [];
  foreach (array_slice($list, 0, 80) as $line) {
    if (!is_array($line)) continue;
    $qty = (float) ($line["qtyGm"] ?? $line["quantity_gm"] ?? 0);
    if ($qty <= 0) continue;
    $out[] = [
      "itemId" => substr((string) ($line["itemId"] ?? $line["item_id"] ?? ""), 0, 64),
      "name" => substr(trim((string) ($line["name"] ?? $line["item_name"] ?? "Item")) ?: "Item", 0, 120),
      "qtyGm" => $qty,
      "unit" => substr((string) ($line["unit"] ?? "PCS"), 0, 16),
      "notes" => substr(trim((string) ($line["notes"] ?? $line["special_instruction"] ?? $line["specialInstruction"] ?? "")), 0, 240),
    ];
  }
  return $out;
}

function pos_kot_row($row) {
  $parsed = json_decode($row["lines_json"] ?? "[]", true);
  return [
    "id" => $row["id"] ?? "",
    "table_no" => $row["table_no"] ?? "",
    "kind" => $row["kind"] ?? "new",
    "status" => $row["status"] ?? "new",
    "notes" => $row["notes"] ?? "",
    "lines" => is_array($parsed) ? $parsed : [],
    "created_at" => $row["created_at"] ?? null,
    "updated_at" => $row["updated_at"] ?? null,
  ];
}

function pos_can_kot_board($user) {
  return pos_can($user, "kot") || pos_can($user, "counter");
}

function pos_dispatch_kots($path, $method, $body, $bid, $auth) {
  pos_ensure_kitchen_tickets_schema();
  $user = $auth["user"] ?? [];

  if ($path === "kots" && $method === "GET") {
    if (!pos_can_kot_board($user)) pos_send(403, ["error" => "You do not have permission for this module"]);
    $rows = pos_q(
      "SELECT * FROM kitchen_tickets
       WHERE business_id = ?
         AND (status <> 'done' OR updated_at >= DATE_SUB(NOW(), INTERVAL 12 HOUR) OR created_at >= DATE_SUB(NOW(), INTERVAL 12 HOUR))
       ORDER BY created_at DESC
       LIMIT 80",
      "s",
      [$bid]
    );
    $out = [];
    foreach ($rows as $row) $out[] = pos_kot_row($row);
    pos_send(200, $out);
  }

  if ($path === "kots" && $method === "POST") {
    if (!pos_can($user, "counter")) pos_send(403, ["error" => "You do not have permission for this module"]);
    $lines = pos_clip_kot_lines($body["lines"] ?? []);
    if (!$lines) pos_send(400, ["error" => "Nothing to send to kitchen"]);
    $id = pos_uuid();
    $tableNo = substr(trim((string) ($body["table_no"] ?? $body["tableNo"] ?? "")), 0, 64);
    $kind = (($body["kind"] ?? "") === "reprint") ? "reprint" : "new";
    $notes = substr(trim((string) ($body["notes"] ?? "")), 0, 250);
    pos_q(
      "INSERT INTO kitchen_tickets (id, business_id, table_no, kind, status, notes, lines_json, created_at, updated_at)
       VALUES (?,?,?,?, 'new', ?, ?, NOW(3), NOW(3))",
      "ssssss",
      [$id, $bid, $tableNo !== "" ? $tableNo : null, $kind, $notes !== "" ? $notes : null, json_encode($lines, JSON_UNESCAPED_UNICODE)]
    );
    $rows = pos_q("SELECT * FROM kitchen_tickets WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$id, $bid]);
    pos_send(200, ["ok" => true, "ticket" => pos_kot_row($rows[0] ?? ["id" => $id, "lines_json" => json_encode($lines)])]);
  }

  if (preg_match('#^kots/([^/]+)$#', $path, $m) && ($method === "PATCH" || $method === "POST")) {
    if (!pos_can_kot_board($user)) pos_send(403, ["error" => "You do not have permission for this module"]);
    $id = $m[1];
    $status = trim((string) ($body["status"] ?? ""));
    if (!in_array($status, ["new", "preparing", "ready", "done"], true)) {
      pos_send(400, ["error" => "Invalid KOT status"]);
    }
    $rows = pos_q("SELECT * FROM kitchen_tickets WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$id, $bid]);
    if (!$rows) pos_send(404, ["error" => "KOT not found"]);
    pos_q("UPDATE kitchen_tickets SET status = ?, updated_at = NOW(3) WHERE id = ? AND business_id = ?", "sss", [$status, $id, $bid]);
    $next = pos_q("SELECT * FROM kitchen_tickets WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$id, $bid]);
    pos_send(200, ["ok" => true, "ticket" => pos_kot_row($next[0])]);
  }

  return false;
}
