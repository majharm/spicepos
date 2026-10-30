<?php
function pos_tax_defaults() {
  return [
    ["EXEMPT", "Exempt", "exempt", 0, 10],
    ["GST0", "GST Nil 0%", "gst", 0, 20],
    ["GST5", "GST 5%", "gst", 5, 30],
    ["GST12", "GST 12%", "gst", 12, 40],
    ["GST18", "GST 18%", "gst", 18, 50],
    ["GST28", "GST 28%", "gst", 28, 60],
  ];
}

function pos_tax_split($type, $rate) {
  $kind = ($type === "igst" || $type === "exempt") ? $type : "gst";
  $pct = round((float) $rate, 2);
  if ($pct < 0) $pct = 0;
  if ($pct > 100) $pct = 100;
  if ($kind === "exempt") return ["exempt", 0, 0, 0, 0];
  if ($kind === "igst") return ["igst", $pct, 0, 0, $pct];
  $cgst = round($pct / 2, 2);
  $sgst = round($pct - $cgst, 2);
  return ["gst", $pct, $cgst, $sgst, $pct];
}

function pos_ensure_tax_schema($businessId = "") {
  pos_q("CREATE TABLE IF NOT EXISTS tax_rates (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    code VARCHAR(16) NOT NULL,
    name VARCHAR(80) NOT NULL,
    tax_type VARCHAR(16) NOT NULL DEFAULT 'gst',
    rate DECIMAL(6,2) NOT NULL DEFAULT 0,
    cgst_rate DECIMAL(6,2) NOT NULL DEFAULT 0,
    sgst_rate DECIMAL(6,2) NOT NULL DEFAULT 0,
    igst_rate DECIMAL(6,2) NOT NULL DEFAULT 0,
    hsn VARCHAR(32) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    sort_order INT NOT NULL DEFAULT 0,
    UNIQUE KEY uniq_tax_biz_code (business_id, code),
    INDEX (business_id)
  )");
  if ($businessId === "") return;
  foreach (pos_tax_defaults() as $row) {
    [$code, $name, $type, $rate, $sort] = $row;
    [$type, $rate, $cgst, $sgst, $igst] = pos_tax_split($type, $rate);
    pos_q(
      "INSERT IGNORE INTO tax_rates (
         id, business_id, code, name, tax_type, rate, cgst_rate, sgst_rate, igst_rate, hsn, status, sort_order
       ) VALUES (?,?,?,?,?,?,?,?,?,NULL,'active',?)",
      "sssssddddi",
      [pos_uuid(), $businessId, $code, $name, $type, $rate, $cgst, $sgst, $igst, $sort]
    );
  }
}

function pos_list_taxes($bid) {
  pos_ensure_tax_schema($bid);
  return pos_q("SELECT * FROM tax_rates WHERE business_id = ? ORDER BY sort_order, name", "s", [$bid]);
}

function pos_tax_code($name, $raw) {
  $code = strtoupper(preg_replace("/[^A-Z0-9]/", "", (string) $raw));
  if ($code === "") $code = strtoupper(preg_replace("/[^A-Z0-9]/", "", (string) $name));
  return substr($code, 0, 16);
}

function pos_tax_payload($body) {
  $name = trim((string) ($body["name"] ?? ""));
  if ($name === "") throw new Exception("Name is required");
  if (strlen($name) > 80) $name = substr($name, 0, 80);
  $code = pos_tax_code($name, $body["code"] ?? "");
  if ($code === "") throw new Exception("Name is required");
  [$type, $rate, $cgst, $sgst, $igst] = pos_tax_split($body["tax_type"] ?? "gst", $body["rate"] ?? 0);
  $hsn = trim((string) ($body["hsn"] ?? ""));
  if (strlen($hsn) > 32) $hsn = substr($hsn, 0, 32);
  $status = (($body["status"] ?? "") === "inactive") ? "inactive" : "active";
  return [$code, $name, $type, $rate, $cgst, $sgst, $igst, $hsn, $status];
}

function pos_dispatch_taxes($path, $method, $body, $bid, $auth) {
  if (!pos_can($auth["user"], "items") && !pos_can($auth["user"], "settings")) {
    pos_send(403, ["error" => "You do not have permission for this module"]);
  }
  pos_ensure_tax_schema($bid);

  if ($path === "taxes" && $method === "GET") {
    pos_send(200, pos_list_taxes($bid));
  }

  if ($path === "taxes" && $method === "POST") {
    [$code, $name, $type, $rate, $cgst, $sgst, $igst, $hsn, $status] = pos_tax_payload($body);
    $dup = pos_q(
      "SELECT id FROM tax_rates WHERE business_id = ? AND (code = ? OR LOWER(name) = LOWER(?)) LIMIT 1",
      "sss",
      [$bid, $code, $name]
    );
    if ($dup) pos_send(400, ["error" => "That tax name is already used"]);
    $id = pos_uuid();
    $sort = (int) ($body["sort_order"] ?? 90);
    pos_q(
      "INSERT INTO tax_rates (
         id, business_id, code, name, tax_type, rate, cgst_rate, sgst_rate, igst_rate, hsn, status, sort_order
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      "sssssddddssi",
      [$id, $bid, $code, $name, $type, $rate, $cgst, $sgst, $igst, $hsn, $status, $sort]
    );
    $rows = pos_q("SELECT * FROM tax_rates WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$id, $bid]);
    pos_send(200, ["ok" => true, "tax" => $rows[0] ?? null, "php" => true]);
  }

  if (preg_match('#^taxes/([^/]+)$#', $path, $m) && $method === "PUT") {
    $id = $m[1];
    [$code, $name, $type, $rate, $cgst, $sgst, $igst, $hsn, $status] = pos_tax_payload($body);
    $dup = pos_q(
      "SELECT id FROM tax_rates WHERE business_id = ? AND id <> ? AND (code = ? OR LOWER(name) = LOWER(?)) LIMIT 1",
      "ssss",
      [$bid, $id, $code, $name]
    );
    if ($dup) pos_send(400, ["error" => "That tax name is already used"]);
    pos_q(
      "UPDATE tax_rates
       SET code=?, name=?, tax_type=?, rate=?, cgst_rate=?, sgst_rate=?, igst_rate=?, hsn=?, status=?
       WHERE id=? AND business_id=?",
      "sssddddssss",
      [$code, $name, $type, $rate, $cgst, $sgst, $igst, $hsn, $status, $id, $bid]
    );
    $rows = pos_q("SELECT * FROM tax_rates WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$id, $bid]);
    if (!$rows) pos_send(404, ["error" => "Tax not found"]);
    pos_send(200, ["ok" => true, "tax" => $rows[0], "php" => true]);
  }

  if (preg_match('#^taxes/([^/]+)$#', $path, $m) && $method === "DELETE") {
    $id = $m[1];
    $rows = pos_q("SELECT * FROM tax_rates WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$id, $bid]);
    if (!$rows) pos_send(404, ["error" => "Tax not found"]);
    $rate = (float) $rows[0]["rate"];
    $used = pos_q(
      "SELECT COUNT(*) AS c FROM items WHERE business_id = ? AND ROUND(gst_rate, 2) = ?",
      "sd",
      [$bid, $rate]
    );
    $count = (int) ($used[0]["c"] ?? 0);
    if ($count > 0) {
      pos_send(400, ["error" => "{$count} items use this rate. Mark the tax inactive, or change those items first."]);
    }
    pos_q("DELETE FROM tax_rates WHERE id = ? AND business_id = ?", "ss", [$id, $bid]);
    pos_send(200, ["ok" => true, "php" => true]);
  }

  pos_send(404, ["error" => "Unknown tax path", "path" => $path, "php" => true]);
}
