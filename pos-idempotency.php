<?php

function pos_clip_idempotency_key($raw) {
  return substr(trim((string) $raw), 0, 80);
}

function pos_ensure_idempotency_table() {
  pos_q("CREATE TABLE IF NOT EXISTS pos_idempotency (
    business_id VARCHAR(36) NOT NULL,
    idempotency_key VARCHAR(80) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    ref_id VARCHAR(64) NOT NULL,
    payload_json MEDIUMTEXT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (business_id, idempotency_key)
  )");
}

function pos_find_idempotent($bid, $key) {
  $k = pos_clip_idempotency_key($key);
  if ($k === "") return null;
  pos_ensure_idempotency_table();
  try {
    $rows = pos_q(
      "SELECT * FROM pos_idempotency WHERE business_id = ? AND idempotency_key = ? LIMIT 1",
      "ss",
      [$bid, $k]
    );
    return $rows[0] ?? null;
  } catch (Exception $e) {
    return null;
  }
}

function pos_save_idempotent($bid, $key, $kind, $refId, $payload = null) {
  $k = pos_clip_idempotency_key($key);
  if ($k === "") return null;
  pos_ensure_idempotency_table();
  try {
    pos_q(
      "INSERT INTO pos_idempotency (business_id, idempotency_key, kind, ref_id, payload_json) VALUES (?,?,?,?,?)",
      "sssss",
      [$bid, $k, substr((string) $kind, 0, 32), substr((string) $refId, 0, 64), $payload ? json_encode($payload) : ""]
    );
  } catch (Exception $e) {
    return pos_find_idempotent($bid, $k);
  }
  return ["idempotency_key" => $k, "ref_id" => $refId];
}

function pos_idempotent_payload($row) {
  if (!$row) return null;
  $raw = $row["payload_json"] ?? "";
  if ($raw === "" || $raw === null) return null;
  $parsed = json_decode((string) $raw, true);
  return is_array($parsed) ? $parsed : null;
}
