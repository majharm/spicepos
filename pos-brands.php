<?php

function pos_brand_clip($value, $max) {
  $s = trim((string) $value);
  if ($s === "") return "";
  return function_exists("mb_substr") ? mb_substr($s, 0, $max) : substr($s, 0, $max);
}

function pos_brand_key($name) {
  return strtolower(preg_replace("/\s+/", " ", pos_brand_clip($name, 128)));
}

function pos_ensure_brand_schema() {
  static $done = false;
  if ($done) return;
  $done = true;
  $db = $GLOBALS["pos_db"] ?? null;
  if (!$db) return;
  $db->query("CREATE TABLE IF NOT EXISTS brands (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    company VARCHAR(160) NULL,
    notes VARCHAR(255) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_brands_biz_name (business_id, name),
    INDEX idx_brands_biz (business_id)
  )");
  if (function_exists("pos_ensure_columns")) {
    pos_ensure_columns("items", [
      "brand" => "VARCHAR(128) NULL",
      "brand_id" => "VARCHAR(255) NULL",
    ]);
  }
}

function pos_upsert_brand($bid, $body) {
  pos_ensure_brand_schema();
  $name = pos_brand_clip($body["name"] ?? $body["brand"] ?? "", 128);
  $id = trim((string) ($body["id"] ?? $body["brand_id"] ?? ""));
  $company = pos_brand_clip($body["company"] ?? $body["manufacturer"] ?? "", 160);
  $notes = pos_brand_clip($body["notes"] ?? "", 255);
  $status = (($body["status"] ?? "active") === "inactive") ? "inactive" : "active";
  if ($id !== "") {
    $rows = pos_q("SELECT * FROM brands WHERE id=? AND business_id=? LIMIT 1", "ss", [$id, $bid]);
    if (!empty($rows[0])) {
      $next = $name !== "" ? $name : $rows[0]["name"];
      $keepStatus = array_key_exists("status", $body) ? $status : ($rows[0]["status"] ?? "active");
      pos_q(
        "UPDATE brands SET name=?, company=COALESCE(NULLIF(?, ''), company), notes=COALESCE(NULLIF(?, ''), notes), status=? WHERE id=? AND business_id=?",
        "ssssss",
        [$next, $company, $notes, $keepStatus, $id, $bid]
      );
      $again = pos_q("SELECT * FROM brands WHERE id=? AND business_id=? LIMIT 1", "ss", [$id, $bid]);
      return $again[0] ?? $rows[0];
    }
  }
  if ($name === "") return null;
  $found = pos_q("SELECT * FROM brands WHERE business_id=? AND LOWER(TRIM(name))=? LIMIT 1", "ss", [$bid, pos_brand_key($name)]);
  if (!empty($found[0])) {
    $keepStatus = array_key_exists("status", $body) ? $status : ($found[0]["status"] ?? "active");
    pos_q(
      "UPDATE brands SET company=COALESCE(NULLIF(?, ''), company), notes=COALESCE(NULLIF(?, ''), notes), status=? WHERE id=? AND business_id=?",
      "sssss",
      [$company, $notes, $keepStatus, $found[0]["id"], $bid]
    );
    $again = pos_q("SELECT * FROM brands WHERE id=? AND business_id=? LIMIT 1", "ss", [$found[0]["id"], $bid]);
    return $again[0] ?? $found[0];
  }
  $createdId = pos_uuid();
  pos_q(
    "INSERT INTO brands (id, name, company, notes, status, business_id) VALUES (?,?,?,?,?,?)",
    "ssssss",
    [$createdId, $name, $company !== "" ? $company : null, $notes !== "" ? $notes : null, $status, $bid]
  );
  return [
    "id" => $createdId,
    "name" => $name,
    "company" => $company !== "" ? $company : null,
    "notes" => $notes !== "" ? $notes : null,
    "status" => $status,
    "business_id" => $bid,
  ];
}

function pos_save_item_brand($bid, $itemId, $body) {
  if (!is_array($body)) return null;
  if (!array_key_exists("brand", $body) && !array_key_exists("brand_id", $body) && !array_key_exists("brand_name", $body)) {
    return null;
  }
  pos_ensure_brand_schema();
  $name = pos_brand_clip($body["brand"] ?? $body["brand_name"] ?? "", 128);
  $id = trim((string) ($body["brand_id"] ?? ""));
  $payload = [
    "name" => $name,
    "company" => $body["manufacturer"] ?? $body["company"] ?? "",
  ];
  if ($id !== "" && $name !== "") {
    $existing = pos_q("SELECT * FROM brands WHERE id=? AND business_id=? LIMIT 1", "ss", [$id, $bid]);
    if (!empty($existing[0]) && pos_brand_key($existing[0]["name"] ?? "") === pos_brand_key($name)) {
      $payload["id"] = $id;
    }
  } elseif ($id !== "") {
    $payload["id"] = $id;
  }
  $brand = pos_upsert_brand($bid, $payload);
  $name = $brand["name"] ?? pos_brand_clip($body["brand"] ?? $body["brand_name"] ?? "", 128);
  pos_q(
    "UPDATE items SET brand=?, brand_id=? WHERE id=? AND business_id=?",
    "ssss",
    [$name !== "" ? $name : null, $brand["id"] ?? null, $itemId, $bid]
  );
  return $brand;
}

function pos_list_brands($bid) {
  pos_ensure_brand_schema();
  $brands = pos_q("SELECT * FROM brands WHERE business_id=? ORDER BY name", "s", [$bid]);
  $counts = [];
  try {
    $counts = pos_q("SELECT brand_id, brand, COUNT(*) n FROM items WHERE business_id=? GROUP BY brand_id, brand", "s", [$bid]);
  } catch (Exception $e) {
    $counts = [];
  }
  $byId = [];
  $byName = [];
  foreach ($counts as $row) {
    if (!empty($row["brand_id"])) $byId[$row["brand_id"]] = (int) $row["n"];
    $key = strtolower((string) ($row["brand"] ?? ""));
    if ($key !== "") $byName[$key] = ($byName[$key] ?? 0) + (int) $row["n"];
  }
  $seen = [];
  foreach ($brands as &$b) {
    $seen[pos_brand_key($b["name"] ?? "")] = true;
    $b["item_count"] = $byId[$b["id"] ?? ""] ?? $byName[strtolower((string) ($b["name"] ?? ""))] ?? 0;
  }
  unset($b);
  try {
    $extras = pos_q("SELECT DISTINCT brand FROM bar_products WHERE business_id=? AND brand IS NOT NULL AND brand<>''", "s", [$bid]);
    foreach ($extras as $row) {
      $name = pos_brand_clip($row["brand"] ?? "", 128);
      if ($name === "" || isset($seen[pos_brand_key($name)])) continue;
      $brands[] = [
        "id" => "",
        "name" => $name,
        "company" => "",
        "notes" => "",
        "status" => "active",
        "item_count" => $byName[strtolower($name)] ?? 0,
        "source" => "bar",
      ];
    }
  } catch (Exception $e) { /* bar table optional */ }
  return $brands;
}

function pos_brands_dispatch($path, $method, $body, $bid) {
  if ($path === "brands" && $method === "GET") {
    pos_send(200, ["brands" => pos_list_brands($bid)]);
    return true;
  }
  if ($path === "brands" && $method === "POST") {
    $name = pos_brand_clip($body["name"] ?? "", 128);
    if ($name === "") pos_send(400, ["error" => "Brand name is required"]);
    pos_send(200, ["ok" => true, "brand" => pos_upsert_brand($bid, $body)]);
    return true;
  }
  if (preg_match('#^brands/([^/]+)$#', $path, $m) && $method === "PUT") {
    $brand = pos_upsert_brand($bid, array_merge(is_array($body) ? $body : [], ["id" => $m[1]]));
    if (!$brand) pos_send(404, ["error" => "Brand not found"]);
    try {
      pos_q("UPDATE items SET brand=? WHERE brand_id=? AND business_id=?", "sss", [$brand["name"], $brand["id"], $bid]);
    } catch (Exception $e) { /* optional */ }
    pos_send(200, ["ok" => true, "brand" => $brand]);
    return true;
  }
  if (preg_match('#^brands/([^/]+)$#', $path, $m) && $method === "DELETE") {
    pos_ensure_brand_schema();
    $used = pos_q("SELECT COUNT(*) n FROM items WHERE brand_id=? AND business_id=?", "ss", [$m[1], $bid]);
    if ((int) ($used[0]["n"] ?? 0) > 0) {
      pos_q("UPDATE brands SET status='inactive' WHERE id=? AND business_id=?", "ss", [$m[1], $bid]);
      pos_send(200, ["ok" => true, "inactive" => true]);
      return true;
    }
    pos_q("DELETE FROM brands WHERE id=? AND business_id=?", "ss", [$m[1], $bid]);
    pos_send(200, ["ok" => true, "deleted" => true]);
    return true;
  }
  return false;
}
