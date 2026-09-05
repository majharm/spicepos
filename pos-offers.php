<?php

function pos_ensure_promo_offers() {
  pos_q(
    "CREATE TABLE IF NOT EXISTS promo_offers (
      id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      name VARCHAR(180) NOT NULL,
      offer_type VARCHAR(32) NOT NULL DEFAULT 'product',
      description TEXT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'draft',
      start_date DATE NULL,
      end_date DATE NULL,
      start_time VARCHAR(8) NULL,
      end_time VARCHAR(8) NULL,
      days_of_week VARCHAR(32) NULL,
      min_qty DECIMAL(12,2) NULL,
      max_qty DECIMAL(12,2) NULL,
      min_spend DECIMAL(12,2) NULL,
      discount_type VARCHAR(16) NOT NULL DEFAULT 'pct',
      discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
      offer_price DECIMAL(12,2) NULL,
      usage_limit INT NULL,
      used_count INT NOT NULL DEFAULT 0,
      customer_eligibility VARCHAR(32) NOT NULL DEFAULT 'all',
      branch_id VARCHAR(255) NULL,
      stacking VARCHAR(24) NOT NULL DEFAULT 'stack',
      priority INT NOT NULL DEFAULT 50,
      loyalty_multiplier DECIMAL(6,2) NOT NULL DEFAULT 1,
      conditions_json TEXT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX idx_promo_biz (business_id),
      INDEX idx_promo_status (business_id, status)
    )"
  );
  pos_q(
    "CREATE TABLE IF NOT EXISTS promo_offer_redemptions (
      id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      offer_id VARCHAR(255) NOT NULL,
      order_id VARCHAR(255) NULL,
      customer_id VARCHAR(255) NULL,
      discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      bill_total DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_por_offer (offer_id),
      INDEX idx_por_biz (business_id)
    )"
  );
  pos_q(
    "CREATE TABLE IF NOT EXISTS promo_settings (
      business_id VARCHAR(255) PRIMARY KEY,
      stacking VARCHAR(24) NOT NULL DEFAULT 'product_and_bill',
      allow_loyalty TINYINT(1) NOT NULL DEFAULT 1,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    )"
  );
}

function pos_offer_conditions($body, $existing = []) {
  $prev = [];
  if (!empty($existing["conditions_json"])) {
    $dec = json_decode($existing["conditions_json"], true);
    if (is_array($dec)) $prev = $dec;
  }
  $ids = $body["item_ids"] ?? $body["itemIds"] ?? $prev["item_ids"] ?? [];
  if (!empty($body["item_a_id"]) && !empty($body["item_b_id"])) $ids = [$body["item_a_id"], $body["item_b_id"]];
  if (!is_array($ids)) $ids = array_filter(array_map("trim", explode(",", (string) $ids)));
  return [
    "item_ids" => array_values(array_filter(array_map("strval", $ids))),
    "category" => trim((string) ($body["category"] ?? $prev["category"] ?? "")),
    "exclude_item_ids" => array_values(array_filter((array) ($body["exclude_item_ids"] ?? $prev["exclude_item_ids"] ?? []))),
    "buy_qty" => (float) ($body["buy_qty"] ?? $prev["buy_qty"] ?? 1),
    "get_qty" => (float) ($body["get_qty"] ?? $prev["get_qty"] ?? 1),
    "get_item_id" => trim((string) ($body["get_item_id"] ?? $prev["get_item_id"] ?? "")),
    "get_discount_type" => (($body["get_discount_type"] ?? $prev["get_discount_type"] ?? "pct") === "amt") ? "amt" : "pct",
    "get_discount_value" => (float) ($body["get_discount_value"] ?? $prev["get_discount_value"] ?? 100),
    "pick_count" => (float) ($body["pick_count"] ?? $prev["pick_count"] ?? 3),
    "bundle_price" => (float) ($body["bundle_price"] ?? $body["offer_price"] ?? $prev["bundle_price"] ?? 0),
    "qty_tiers" => $body["qty_tiers"] ?? $prev["qty_tiers"] ?? [],
    "spend_tiers" => $body["spend_tiers"] ?? $prev["spend_tiers"] ?? [],
    "repeat_bills" => (int) ($body["repeat_bills"] ?? $prev["repeat_bills"] ?? 5),
    "free_item_id" => trim((string) ($body["free_item_id"] ?? $prev["free_item_id"] ?? "")),
    "birthday" => !empty($body["birthday"] ?? $prev["birthday"] ?? false),
    "goal" => trim((string) ($body["goal"] ?? $prev["goal"] ?? "")),
  ];
}

function pos_normalize_offer($body, $existing = []) {
  $name = trim((string) ($body["name"] ?? $existing["name"] ?? ""));
  if ($name === "") pos_send(400, ["error" => "Offer needs a name", "php" => true]);
  $types = ["combo","product","category","bogo","mix_match","qty","spend","min_purchase","free_gift","customer","first_purchase","repeat","time","day","festival","clearance"];
  $type = (string) ($body["offer_type"] ?? $body["type"] ?? $existing["offer_type"] ?? "product");
  if (!in_array($type, $types, true)) $type = "product";
  $statuses = ["draft","scheduled","active","paused","expired","completed"];
  $status = (string) ($body["status"] ?? $existing["status"] ?? "draft");
  if (!in_array($status, $statuses, true)) $status = "draft";
  $dtype = strtolower((string) ($body["discount_type"] ?? $existing["discount_type"] ?? "pct"));
  if (!in_array($dtype, ["pct","amt","price","combo_price"], true)) $dtype = "pct";
  $elig = (string) ($body["customer_eligibility"] ?? $existing["customer_eligibility"] ?? "all");
  $okElig = ["all","vip","new","regular","inactive","high_value","wholesale","b2b"];
  if (!in_array($elig, $okElig, true)) $elig = "all";
  $stack = (string) ($body["stacking"] ?? $existing["stacking"] ?? "stack");
  $cond = pos_offer_conditions($body, $existing);
  $empty = function ($v) { return $v === "" || $v === null; };
  return [
    "name" => $name,
    "offer_type" => $type,
    "description" => trim((string) ($body["description"] ?? $existing["description"] ?? "")),
    "status" => $status,
    "start_date" => $empty($body["start_date"] ?? $existing["start_date"] ?? "") ? "" : substr((string) ($body["start_date"] ?? $existing["start_date"]), 0, 10),
    "end_date" => $empty($body["end_date"] ?? $existing["end_date"] ?? "") ? "" : substr((string) ($body["end_date"] ?? $existing["end_date"]), 0, 10),
    "start_time" => trim((string) ($body["start_time"] ?? $existing["start_time"] ?? "")),
    "end_time" => trim((string) ($body["end_time"] ?? $existing["end_time"] ?? "")),
    "days_of_week" => trim((string) ($body["days_of_week"] ?? $existing["days_of_week"] ?? "")),
    "min_qty" => $empty($body["min_qty"] ?? "") ? ($existing["min_qty"] ?? "") : (float) $body["min_qty"],
    "max_qty" => $empty($body["max_qty"] ?? "") ? ($existing["max_qty"] ?? "") : (float) $body["max_qty"],
    "min_spend" => $empty($body["min_spend"] ?? "") ? ($existing["min_spend"] ?? "") : (float) $body["min_spend"],
    "discount_type" => $dtype,
    "discount_value" => (float) ($body["discount_value"] ?? $existing["discount_value"] ?? 0),
    "offer_price" => $empty($body["offer_price"] ?? "") ? ($existing["offer_price"] ?? "") : (float) $body["offer_price"],
    "usage_limit" => $empty($body["usage_limit"] ?? "") ? ($existing["usage_limit"] ?? "") : (int) $body["usage_limit"],
    "customer_eligibility" => $elig,
    "branch_id" => trim((string) ($body["branch_id"] ?? $existing["branch_id"] ?? "")),
    "stacking" => $stack,
    "priority" => max(1, min(100, (int) ($body["priority"] ?? $existing["priority"] ?? 50))),
    "loyalty_multiplier" => max(1, (float) ($body["loyalty_multiplier"] ?? $existing["loyalty_multiplier"] ?? 1)),
    "conditions_json" => json_encode($cond),
    "conditions" => $cond,
  ];
}

function pos_offer_public($row) {
  if (!$row) return null;
  $cond = [];
  if (!empty($row["conditions_json"])) {
    $dec = json_decode($row["conditions_json"], true);
    if (is_array($dec)) $cond = $dec;
  }
  $row["conditions"] = $cond;
  $today = date("Y-m-d");
  $st = $row["status"] ?? "draft";
  if (!in_array($st, ["paused", "completed", "draft"], true)) {
    if (!empty($row["end_date"]) && substr($row["end_date"], 0, 10) < $today) $st = "expired";
    else if (!empty($row["start_date"]) && substr($row["start_date"], 0, 10) > $today) $st = "scheduled";
    else if ($st === "scheduled") $st = "active";
  }
  $row["live_status"] = $st;
  return $row;
}

function pos_get_promo_settings($bid) {
  pos_ensure_promo_offers();
  $rows = pos_q("SELECT * FROM promo_settings WHERE business_id = ?", "s", [$bid]);
  return $rows[0] ?? ["business_id" => $bid, "stacking" => "product_and_bill", "allow_loyalty" => 1];
}

function pos_save_promo_settings($bid, $body) {
  pos_ensure_promo_offers();
  $stack = (string) ($body["stacking"] ?? "product_and_bill");
  $allow = empty($body["allow_loyalty"]) ? 0 : 1;
  pos_q(
    "INSERT INTO promo_settings (business_id, stacking, allow_loyalty) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE stacking=VALUES(stacking), allow_loyalty=VALUES(allow_loyalty)",
    "ssi",
    [$bid, $stack, $allow]
  );
  return pos_get_promo_settings($bid);
}

function pos_list_offers($bid) {
  pos_ensure_promo_offers();
  $rows = pos_q("SELECT * FROM promo_offers WHERE business_id = ? ORDER BY created_at DESC", "s", [$bid]);
  $out = [];
  foreach ($rows as $row) $out[] = pos_offer_public($row);
  try {
    $combos = pos_q("SELECT * FROM combo_offers WHERE business_id = ? AND status = 'active'", "s", [$bid]);
    foreach ($combos as $c) {
      $out[] = pos_offer_public([
        "id" => $c["id"],
        "name" => $c["name"],
        "offer_type" => "combo",
        "status" => $c["status"],
        "discount_type" => $c["discount_type"],
        "discount_value" => $c["discount_value"],
        "customer_eligibility" => "all",
        "priority" => 40,
        "stacking" => "stack",
        "loyalty_multiplier" => 1,
        "conditions_json" => json_encode(["item_ids" => [$c["item_a_id"], $c["item_b_id"]]]),
        "legacy_combo" => true,
      ]);
    }
  } catch (Exception $e) { /* optional */ }
  return $out;
}

function pos_get_offer($bid, $id) {
  pos_ensure_promo_offers();
  $rows = pos_q("SELECT * FROM promo_offers WHERE id = ? AND business_id = ?", "ss", [$id, $bid]);
  if (!$rows) pos_send(404, ["error" => "Offer not found", "php" => true]);
  return pos_offer_public($rows[0]);
}

function pos_insert_offer($bid, $n) {
  $id = pos_uuid();
  pos_q(
    "INSERT INTO promo_offers (
      id, business_id, name, offer_type, description, status,
      start_date, end_date, start_time, end_time, days_of_week,
      min_qty, max_qty, min_spend, discount_type, discount_value, offer_price,
      usage_limit, used_count, customer_eligibility, branch_id, stacking, priority, loyalty_multiplier, conditions_json
    ) VALUES (?,?,?,?,?,?,NULLIF(?,''),NULLIF(?,''),NULLIF(?,''),NULLIF(?,''),?,?,?,?,?,?,?,?,0,?,?,?,?,?,?)",
    "ssssssssssssssssssssssss",
    [
      $id, $bid, $n["name"], $n["offer_type"], $n["description"], $n["status"],
      $n["start_date"], $n["end_date"], $n["start_time"], $n["end_time"], $n["days_of_week"],
      $n["min_qty"] === "" ? 0 : $n["min_qty"], $n["max_qty"] === "" ? 0 : $n["max_qty"], $n["min_spend"] === "" ? 0 : $n["min_spend"],
      $n["discount_type"], $n["discount_value"], $n["offer_price"] === "" ? 0 : $n["offer_price"],
      $n["usage_limit"] === "" ? 0 : $n["usage_limit"], $n["customer_eligibility"], $n["branch_id"],
      $n["stacking"], $n["priority"], $n["loyalty_multiplier"], $n["conditions_json"],
    ]
  );
  return pos_get_offer($bid, $id);
}

function pos_create_offer($bid, $body) {
  pos_ensure_promo_offers();
  return pos_insert_offer($bid, pos_normalize_offer($body ?: []));
}

function pos_update_offer($bid, $id, $body) {
  $existing = pos_get_offer($bid, $id);
  $n = pos_normalize_offer($body ?: [], $existing);
  pos_q(
    "UPDATE promo_offers SET
      name=?, offer_type=?, description=?, status=?,
      start_date=NULLIF(?,''), end_date=NULLIF(?,''), start_time=NULLIF(?,''), end_time=NULLIF(?,''),
      days_of_week=?, min_qty=?, max_qty=?, min_spend=?, discount_type=?, discount_value=?, offer_price=?,
      usage_limit=?, customer_eligibility=?, branch_id=?, stacking=?, priority=?, loyalty_multiplier=?, conditions_json=?
     WHERE id=? AND business_id=?",
    "ssssssssssssssssssssssss",
    [
      $n["name"], $n["offer_type"], $n["description"], $n["status"],
      $n["start_date"], $n["end_date"], $n["start_time"], $n["end_time"],
      $n["days_of_week"], $n["min_qty"] === "" ? 0 : $n["min_qty"], $n["max_qty"] === "" ? 0 : $n["max_qty"], $n["min_spend"] === "" ? 0 : $n["min_spend"],
      $n["discount_type"], $n["discount_value"], $n["offer_price"] === "" ? 0 : $n["offer_price"],
      $n["usage_limit"] === "" ? 0 : $n["usage_limit"], $n["customer_eligibility"], $n["branch_id"],
      $n["stacking"], $n["priority"], $n["loyalty_multiplier"], $n["conditions_json"],
      $id, $bid,
    ]
  );
  return pos_get_offer($bid, $id);
}

function pos_record_offer_redemptions($bid, $offerIds, $orderId, $customerId, $discount, $total) {
  if (!$offerIds) return;
  pos_ensure_promo_offers();
  foreach ((array) $offerIds as $oid) {
    $oid = trim((string) $oid);
    if ($oid === "") continue;
    pos_q(
      "INSERT INTO promo_offer_redemptions (id, business_id, offer_id, order_id, customer_id, discount_amount, bill_total) VALUES (?,?,?,?,?,?,?)",
      "sssssdd",
      [pos_uuid(), $bid, $oid, $orderId ?: "", $customerId ?: "", (float) $discount, (float) $total]
    );
    pos_q("UPDATE promo_offers SET used_count = used_count + 1 WHERE id = ? AND business_id = ?", "ss", [$oid, $bid]);
  }
}

function pos_offer_stats($bid) {
  $offers = pos_list_offers($bid);
  $agg = pos_q(
    "SELECT COUNT(*) AS bills, COALESCE(SUM(discount_amount),0) AS discount, COALESCE(SUM(bill_total),0) AS revenue, COUNT(DISTINCT customer_id) AS customers
     FROM promo_offer_redemptions WHERE business_id = ?",
    "s",
    [$bid]
  );
  $counts = ["draft" => 0, "scheduled" => 0, "active" => 0, "paused" => 0, "expired" => 0, "completed" => 0];
  $expiring = [];
  foreach ($offers as $o) {
    $st = $o["live_status"] ?? $o["status"] ?? "draft";
    if (isset($counts[$st])) $counts[$st]++;
    if (!empty($o["end_date"])) {
      $days = (strtotime($o["end_date"]) - time()) / 86400;
      if ($days >= 0 && $days <= 7 && $st === "active") $expiring[] = $o;
    }
  }
  return ["counts" => $counts, "expiring" => $expiring, "totals" => $agg[0] ?? ["bills" => 0, "discount" => 0, "revenue" => 0, "customers" => 0], "offers" => $offers];
}

function pos_suggest_offers($bid) {
  $ideas = [];
  try {
    require_once __DIR__ . "/pos-growth.php";
    $g = pos_build_growth($bid);
    $top = $g["products"]["top"] ?? [];
    $slow = $g["products"]["slow"] ?? [];
    if (count($top) > 1) {
      $ideas[] = [
        "goal" => "sales",
        "type" => "combo",
        "name" => $top[0]["name"] . " + " . $top[1]["name"] . " combo",
        "text" => "Customers who buy " . $top[0]["name"] . " often add other fast movers. Create a combo.",
        "draft" => pos_normalize_offer([
          "name" => $top[0]["name"] . " + " . $top[1]["name"],
          "type" => "combo",
          "status" => "draft",
          "discount_type" => "pct",
          "discount_value" => 8,
          "item_ids" => [$top[0]["itemId"] ?? "", $top[1]["itemId"] ?? ""],
        ]),
      ];
    }
    if ($slow) {
      $ideas[] = [
        "goal" => "stock",
        "type" => "clearance",
        "name" => "Clearance opportunity",
        "text" => count($slow) . " products are slow-moving. A 20% clearance offer can free stock.",
        "draft" => pos_normalize_offer([
          "name" => "Clearance 20% off",
          "type" => "clearance",
          "status" => "draft",
          "discount_type" => "pct",
          "discount_value" => 20,
          "item_ids" => array_values(array_filter(array_map(function ($p) { return $p["itemId"] ?? ""; }, array_slice($slow, 0, 12)))),
        ]),
      ];
    }
  } catch (Exception $e) { /* still return static ideas */ }
  $ideas[] = [
    "goal" => "customers",
    "type" => "first_purchase",
    "name" => "Welcome offer",
    "text" => "₹100 OFF on the first purchase above ₹999.",
    "draft" => pos_normalize_offer(["name" => "Welcome ₹100 off", "type" => "first_purchase", "status" => "draft", "discount_type" => "amt", "discount_value" => 100, "min_spend" => 999, "customer_eligibility" => "new"]),
  ];
  return $ideas;
}

function pos_offers_dispatch($path, $method, $body, $bid) {
  if ($path === "offers" && $method === "GET") pos_send(200, pos_list_offers($bid));
  if ($path === "offers" && $method === "POST") pos_send(200, ["ok" => true, "offer" => pos_create_offer($bid, $body ?: [])]);
  if ($path === "offers/stats" && $method === "GET") pos_send(200, pos_offer_stats($bid));
  if ($path === "offers/settings" && $method === "GET") pos_send(200, pos_get_promo_settings($bid));
  if ($path === "offers/settings" && in_array($method, ["POST", "PUT"], true)) pos_send(200, ["ok" => true, "settings" => pos_save_promo_settings($bid, $body ?: [])]);
  if ($path === "offers/suggest" && $method === "GET") pos_send(200, ["ok" => true, "ideas" => pos_suggest_offers($bid)]);
  if (preg_match('#^offers/([^/]+)/status$#', $path, $m) && in_array($method, ["POST", "PATCH"], true)) {
    $st = (string) (($body["status"] ?? ""));
    pos_q("UPDATE promo_offers SET status = ? WHERE id = ? AND business_id = ?", "sss", [$st, $m[1], $bid]);
    pos_send(200, ["ok" => true, "offer" => pos_get_offer($bid, $m[1])]);
  }
  if (preg_match('#^offers/([^/]+)/duplicate$#', $path, $m) && $method === "POST") {
    $row = pos_get_offer($bid, $m[1]);
    $row["name"] = $row["name"] . " copy";
    $row["status"] = "draft";
    pos_send(200, ["ok" => true, "offer" => pos_create_offer($bid, $row)]);
  }
  if (preg_match('#^offers/([^/]+)$#', $path, $m) && $method === "GET") pos_send(200, pos_get_offer($bid, $m[1]));
  if (preg_match('#^offers/([^/]+)$#', $path, $m) && in_array($method, ["PUT", "PATCH"], true)) {
    pos_send(200, ["ok" => true, "offer" => pos_update_offer($bid, $m[1], $body ?: [])]);
  }
  return false;
}
