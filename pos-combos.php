<?php

function pos_ensure_combo_offers() {
  pos_q(
    "CREATE TABLE IF NOT EXISTS combo_offers (
      id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      name VARCHAR(180) NOT NULL,
      item_a_id VARCHAR(255) NOT NULL,
      item_b_id VARCHAR(255) NOT NULL,
      discount_type VARCHAR(8) NOT NULL DEFAULT 'pct',
      discount_value DECIMAL(12,2) NOT NULL DEFAULT 8,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_combo_biz (business_id)
    )"
  );
}

function pos_list_combos($bid) {
  pos_ensure_combo_offers();
  return pos_q(
    "SELECT c.*, a.name AS item_a_name, b.name AS item_b_name
     FROM combo_offers c
     LEFT JOIN items a ON a.id = c.item_a_id
     LEFT JOIN items b ON b.id = c.item_b_id
     WHERE c.business_id = ? AND c.status = 'active'
     ORDER BY c.created_at DESC",
    "s",
    [$bid]
  );
}

function pos_create_combo($bid, $body) {
  $name = trim((string) ($body["name"] ?? ""));
  $a = trim((string) ($body["item_a_id"] ?? $body["itemA"] ?? ""));
  $b = trim((string) ($body["item_b_id"] ?? $body["itemB"] ?? ""));
  $type = strtolower((string) ($body["discount_type"] ?? $body["discountType"] ?? "pct")) === "amt" ? "amt" : "pct";
  $value = (float) ($body["discount_value"] ?? $body["discountValue"] ?? 8);
  if ($value < 0) $value = 0;
  if ($type === "pct" && $value > 50) $value = 50;
  if ($name === "" || $a === "" || $b === "" || $a === $b) {
    pos_send(400, ["error" => "Combo needs a name and two different items", "php" => true]);
  }
  $ia = pos_q("SELECT id, name FROM items WHERE id = ? AND business_id = ?", "ss", [$a, $bid]);
  $ib = pos_q("SELECT id, name FROM items WHERE id = ? AND business_id = ?", "ss", [$b, $bid]);
  if (!$ia || !$ib) pos_send(400, ["error" => "Both combo items must be in this shop's catalog", "php" => true]);
  pos_ensure_combo_offers();
  $id = pos_uuid();
  pos_q(
    "INSERT INTO combo_offers (id, business_id, name, item_a_id, item_b_id, discount_type, discount_value, status)
     VALUES (?,?,?,?,?,?,?,'active')",
    "ssssssd",
    [$id, $bid, $name, $a, $b, $type, $value]
  );
  $row = pos_q(
    "SELECT c.*, a.name AS item_a_name, b.name AS item_b_name
     FROM combo_offers c
     LEFT JOIN items a ON a.id = c.item_a_id
     LEFT JOIN items b ON b.id = c.item_b_id
     WHERE c.id = ?",
    "s",
    [$id]
  );
  return $row[0] ?? ["id" => $id, "name" => $name, "item_a_id" => $a, "item_b_id" => $b, "discount_type" => $type, "discount_value" => $value];
}

function pos_combos_dispatch($path, $method, $body, $bid) {
  if ($path === "combos" && $method === "GET") {
    pos_send(200, pos_list_combos($bid));
  }
  if ($path === "combos" && $method === "POST") {
    pos_send(200, ["ok" => true, "combo" => pos_create_combo($bid, $body ?: [])]);
  }
  return false;
}
