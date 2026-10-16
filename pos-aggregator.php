<?php

function pos_agg_ensure_schema() {
  static $done = false;
  if ($done) return;
  $done = true;
  pos_q("CREATE TABLE IF NOT EXISTS aggregator_orders (
    id VARCHAR(36) PRIMARY KEY,
    business_id VARCHAR(36) NOT NULL,
    source VARCHAR(16) NOT NULL,
    external_id VARCHAR(80) NOT NULL,
    order_number VARCHAR(40) NOT NULL,
    restaurant_id VARCHAR(80) NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    fulfillment VARCHAR(16) NOT NULL DEFAULT 'delivery',
    customer_name VARCHAR(160) NULL,
    mobile VARCHAR(32) NULL,
    notes VARCHAR(250) NULL,
    address VARCHAR(400) NULL,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount DECIMAL(12,2) NOT NULL DEFAULT 0,
    packing DECIMAL(12,2) NOT NULL DEFAULT 0,
    delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    prep_minutes INT NULL,
    payment_status VARCHAR(24) NULL,
    kot_ticket_id VARCHAR(64) NULL,
    sales_order_id VARCHAR(64) NULL,
    raw_json MEDIUMTEXT NULL,
    accepted_at TIMESTAMP(3) NULL,
    rejected_at TIMESTAMP(3) NULL,
    ready_at TIMESTAMP(3) NULL,
    dispatched_at TIMESTAMP(3) NULL,
    delivered_at TIMESTAMP(3) NULL,
    cancelled_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_agg_ext (business_id, source, external_id),
    INDEX idx_agg_biz (business_id, status, created_at)
  )");
  pos_q("CREATE TABLE IF NOT EXISTS aggregator_order_lines (
    id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL,
    item_id VARCHAR(64) NULL,
    external_item_id VARCHAR(80) NULL,
    name VARCHAR(160) NOT NULL,
    qty DECIMAL(12,3) NOT NULL DEFAULT 1,
    rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    notes VARCHAR(240) NULL,
    INDEX (order_id)
  )");
  if (function_exists("pos_ensure_columns")) {
    pos_ensure_columns("company_settings", [
      "zomato_enabled" => "TINYINT(1) NOT NULL DEFAULT 0",
      "swiggy_enabled" => "TINYINT(1) NOT NULL DEFAULT 0",
      "aggregator_auto_accept" => "TINYINT(1) NOT NULL DEFAULT 0",
      "aggregator_prep_minutes" => "INT NULL",
      "zomato_restaurant_id" => "VARCHAR(80) NULL",
      "zomato_api_key" => "VARCHAR(180) NULL",
      "zomato_webhook_secret" => "VARCHAR(180) NULL",
      "zomato_api_base" => "VARCHAR(180) NULL",
      "swiggy_outlet_id" => "VARCHAR(80) NULL",
      "swiggy_api_key" => "VARCHAR(180) NULL",
      "swiggy_webhook_secret" => "VARCHAR(180) NULL",
      "swiggy_api_base" => "VARCHAR(180) NULL",
    ]);
  }
  if (function_exists("pos_ensure_columns")) {
    pos_ensure_columns("businesses", [
      "zomato_allowed" => "TINYINT(1) NOT NULL DEFAULT 0",
      "swiggy_allowed" => "TINYINT(1) NOT NULL DEFAULT 0",
    ]);
  }
}

function pos_agg_flag($raw) {
  return $raw === true || $raw === 1 || $raw === "1";
}

function pos_agg_source($raw) {
  $s = strtolower((string) $raw);
  if (strpos($s, "swiggy") !== false || $s === "swg") return "swiggy";
  if (strpos($s, "zomato") !== false || $s === "zmt") return "zomato";
  return "";
}

function pos_agg_status($raw) {
  $s = strtolower(preg_replace("/[\\s-]+/", "_", (string) $raw));
  $map = [
    "placed" => "pending", "new" => "pending", "relay" => "pending",
    "confirm" => "accepted", "confirmed" => "accepted", "acknowledged" => "accepted", "accept" => "accepted",
    "reject" => "rejected", "declined" => "rejected",
    "food_ready" => "ready", "prepared" => "ready",
    "picked_up" => "dispatched", "out_for_delivery" => "dispatched", "ofd" => "dispatched",
    "completed" => "delivered", "complete" => "delivered",
    "cancel" => "cancelled", "canceled" => "cancelled", "timeout" => "cancelled",
  ];
  if (isset($map[$s])) return $map[$s];
  $ok = ["pending","accepted","rejected","preparing","ready","dispatched","delivered","cancelled"];
  return in_array($s, $ok, true) ? $s : "";
}

function pos_agg_parse($body, $hint = "") {
  if (!is_array($body)) $body = [];
  if (isset($body["order"]) && is_array($body["order"])) $body = array_merge($body, $body["order"]);
  $source = pos_agg_source($hint ?: ($body["source"] ?? $body["platform"] ?? $body["channel"] ?? ""));
  if ($source === "") $source = (stripos(json_encode($body), "swiggy") !== false) ? "swiggy" : "zomato";
  $external = (string) ($body["order_id"] ?? $body["orderId"] ?? $body["id"] ?? ($body["details"]["id"] ?? ""));
  if ($external === "") return ["ok" => false, "error" => "Order id missing"];
  $items = $body["items"] ?? $body["dishes"] ?? $body["item_list"] ?? [];
  $status = pos_agg_status($body["status"] ?? $body["order_status"] ?? "");
  if (!$items && $status !== "") {
    return ["ok" => true, "kind" => "status", "source" => $source, "external_id" => $external, "status" => $status];
  }
  $lines = [];
  foreach ((array) $items as $row) {
    if (!is_array($row)) continue;
    $qty = (float) ($row["quantity"] ?? $row["qty"] ?? 1);
    if ($qty <= 0) continue;
    $rate = (float) ($row["unit_cost"] ?? $row["unit_price"] ?? $row["rate"] ?? $row["price"] ?? 0);
    $lines[] = [
      "external_item_id" => substr((string) ($row["id"] ?? $row["item_id"] ?? ""), 0, 80),
      "name" => substr(trim((string) ($row["name"] ?? $row["item_name"] ?? "Item")) ?: "Item", 0, 160),
      "qty" => $qty,
      "rate" => $rate,
      "amount" => (float) ($row["total_cost"] ?? $row["total"] ?? $row["amount"] ?? ($qty * $rate)),
      "notes" => substr(trim((string) ($row["instructions"] ?? $row["notes"] ?? "")), 0, 240),
    ];
  }
  if (!$lines) return ["ok" => false, "error" => "No order items"];
  $cust = is_array($body["customer"] ?? null) ? $body["customer"] : [];
  $type = strtolower((string) ($body["order_type"] ?? $body["delivery_mode"] ?? $body["fulfillment"] ?? "delivery"));
  return [
    "ok" => true,
    "kind" => "order",
    "source" => $source,
    "external_id" => substr($external, 0, 80),
    "restaurant_id" => substr((string) ($body["restaurant_id"] ?? $body["outlet_id"] ?? ""), 0, 80),
    "status" => $status ?: "pending",
    "fulfillment" => (preg_match("/pickup|takeaway|self/", $type) ? "pickup" : "delivery"),
    "customer_name" => substr(trim((string) ($cust["name"] ?? $body["customer_name"] ?? "Guest")) ?: "Guest", 0, 160),
    "mobile" => substr((string) ($cust["phone"] ?? $cust["mobile"] ?? ""), 0, 32),
    "notes" => substr(trim((string) ($body["notes"] ?? $body["instructions"] ?? "")), 0, 250),
    "address" => substr((string) ($cust["address"] ?? $body["address"] ?? ""), 0, 400),
    "subtotal" => (float) ($body["subtotal"] ?? 0),
    "tax" => (float) ($body["tax"] ?? $body["gst"] ?? 0),
    "discount" => (float) ($body["discount"] ?? 0),
    "packing" => (float) ($body["packing"] ?? 0),
    "delivery_fee" => (float) ($body["delivery_fee"] ?? $body["delivery_charge"] ?? 0),
    "total" => (float) ($body["total"] ?? $body["net_total"] ?? $body["order_total"] ?? 0),
    "prep_minutes" => (int) ($body["prep_time"] ?? $body["prep_minutes"] ?? 0) ?: null,
    "payment_status" => "paid",
    "lines" => $lines,
  ];
}

function pos_agg_number($source, $external) {
  $prefix = $source === "swiggy" ? "SWG" : "ZMT";
  $tail = substr(preg_replace("/[^a-zA-Z0-9]/", "", (string) $external), -10);
  return $prefix . "-" . ($tail !== "" ? $tail : substr((string) time(), -6));
}

function pos_agg_stamp($status) {
  $map = ["accepted" => "accepted_at", "rejected" => "rejected_at", "ready" => "ready_at", "dispatched" => "dispatched_at", "delivered" => "delivered_at", "cancelled" => "cancelled_at"];
  return $map[$status] ?? "";
}

function pos_agg_with_lines($row) {
  if (!$row) return null;
  $lines = pos_q("SELECT * FROM aggregator_order_lines WHERE order_id = ? ORDER BY name", "s", [$row["id"]]);
  $row["lines"] = $lines;
  $row["subtotal"] = (float) $row["subtotal"];
  $row["tax"] = (float) $row["tax"];
  $row["total"] = (float) $row["total"];
  return $row;
}

function pos_agg_settings($bid) {
  pos_agg_ensure_schema();
  $rows = pos_q("SELECT * FROM company_settings WHERE business_id = ? LIMIT 1", "s", [$bid]);
  $biz = [];
  try {
    $biz = pos_q("SELECT zomato_allowed, swiggy_allowed FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
  } catch (Exception $e) { $biz = []; }
  $row = $rows[0] ?? [];
  $row["zomato_allowed"] = $biz[0]["zomato_allowed"] ?? 0;
  $row["swiggy_allowed"] = $biz[0]["swiggy_allowed"] ?? 0;
  return $row;
}

function pos_agg_mask($raw) {
  $v = (string) $raw;
  if ($v === "") return "";
  if (strlen($v) <= 4) return "••••";
  return substr($v, 0, 2) . "••••" . substr($v, -2);
}

function pos_agg_live($source, $row) {
  $allowed = $source === "swiggy" ? pos_agg_flag($row["swiggy_allowed"] ?? 0) : pos_agg_flag($row["zomato_allowed"] ?? 0);
  $on = $source === "swiggy" ? pos_agg_flag($row["swiggy_enabled"] ?? 0) : pos_agg_flag($row["zomato_enabled"] ?? 0);
  return $allowed && $on;
}

function pos_agg_block($source, $row, $wantEnable = false) {
  $label = $source === "swiggy" ? "Swiggy" : "Zomato";
  $allowed = $source === "swiggy" ? pos_agg_flag($row["swiggy_allowed"] ?? 0) : pos_agg_flag($row["zomato_allowed"] ?? 0);
  if (!$allowed) return "$label is not authorized for this shop. Ask Master Admin to allow it first.";
  if ($wantEnable) {
    $id = $source === "swiggy" ? trim((string) ($row["swiggy_outlet_id"] ?? "")) : trim((string) ($row["zomato_restaurant_id"] ?? ""));
    $key = $source === "swiggy" ? trim((string) ($row["swiggy_api_key"] ?? "")) : trim((string) ($row["zomato_api_key"] ?? ""));
    if ($id === "") return "Save the $label " . ($source === "swiggy" ? "outlet ID" : "restaurant ID") . " before activating.";
    if ($key === "") return "Save the $label API key before activating.";
  }
  if (!pos_agg_live($source, $row)) return "$label is disabled. A Business Admin must turn it on in Settings.";
  return "";
}

function pos_agg_public_settings($row) {
  return [
    "zomato_allowed" => pos_agg_flag($row["zomato_allowed"] ?? 0),
    "swiggy_allowed" => pos_agg_flag($row["swiggy_allowed"] ?? 0),
    "zomato_enabled" => pos_agg_flag($row["zomato_enabled"] ?? 0),
    "swiggy_enabled" => pos_agg_flag($row["swiggy_enabled"] ?? 0),
    "zomato_live" => pos_agg_live("zomato", $row),
    "swiggy_live" => pos_agg_live("swiggy", $row),
    "aggregator_auto_accept" => ((int) ($row["aggregator_auto_accept"] ?? 0)) === 1,
    "aggregator_prep_minutes" => (int) ($row["aggregator_prep_minutes"] ?? 20),
    "zomato_restaurant_id" => $row["zomato_restaurant_id"] ?? "",
    "swiggy_outlet_id" => $row["swiggy_outlet_id"] ?? "",
    "zomato_api_base" => $row["zomato_api_base"] ?? "https://api.zomato.com",
    "swiggy_api_base" => $row["swiggy_api_base"] ?? "https://partner.swiggy.com",
    "zomato_api_key" => pos_agg_mask($row["zomato_api_key"] ?? ""),
    "zomato_webhook_secret" => pos_agg_mask($row["zomato_webhook_secret"] ?? ""),
    "swiggy_api_key" => pos_agg_mask($row["swiggy_api_key"] ?? ""),
    "swiggy_webhook_secret" => pos_agg_mask($row["swiggy_webhook_secret"] ?? ""),
  ];
}

function pos_agg_find_business($source, $parsed) {
  $shop = trim((string) ($_GET["shop"] ?? ($_SERVER["HTTP_X_SHOP_ID"] ?? "")));
  if ($shop !== "") {
    $rows = pos_q("SELECT id FROM businesses WHERE (id = ? OR code = ?) AND status = 'active' LIMIT 1", "ss", [$shop, $shop]);
    if ($rows) return $rows[0]["id"];
  }
  $outlet = $parsed["restaurant_id"] ?? "";
  if ($outlet !== "") {
    $col = $source === "swiggy" ? "swiggy_outlet_id" : "zomato_restaurant_id";
    try {
      $rows = pos_q("SELECT business_id FROM company_settings WHERE $col = ? LIMIT 1", "s", [$outlet]);
      if ($rows) return $rows[0]["business_id"];
    } catch (Exception $e) { /* optional */ }
  }
  return "";
}

function pos_agg_upsert($bid, $parsed, $raw) {
  $have = pos_q("SELECT * FROM aggregator_orders WHERE business_id = ? AND source = ? AND external_id = ? LIMIT 1", "sss", [$bid, $parsed["source"], $parsed["external_id"]]);
  if ($have) {
    if (($parsed["kind"] ?? "") === "status" && ($parsed["status"] ?? "") !== "" && $parsed["status"] !== $have[0]["status"]) {
      $col = pos_agg_stamp($parsed["status"]);
      $sql = $col ? "UPDATE aggregator_orders SET status = ?, $col = COALESCE($col, NOW(3)) WHERE id = ?" : "UPDATE aggregator_orders SET status = ? WHERE id = ?";
      pos_q($sql, "ss", [$parsed["status"], $have[0]["id"]]);
    }
    return ["order" => pos_agg_with_lines(pos_q("SELECT * FROM aggregator_orders WHERE id = ? LIMIT 1", "s", [$have[0]["id"]])[0]), "replay" => true];
  }
  $id = function_exists("pos_uuid") ? pos_uuid() : bin2hex(random_bytes(16));
  $number = pos_agg_number($parsed["source"], $parsed["external_id"]);
  pos_q(
    "INSERT INTO aggregator_orders (id, business_id, source, external_id, order_number, restaurant_id, status, fulfillment, customer_name, mobile, notes, address, subtotal, tax, discount, packing, delivery_fee, total, prep_minutes, payment_status, raw_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    "ssssssssssssddddddiss",
    [
      $id, $bid, $parsed["source"], $parsed["external_id"], $number, $parsed["restaurant_id"] ?: null, $parsed["status"] ?: "pending",
      $parsed["fulfillment"] ?: "delivery", $parsed["customer_name"], $parsed["mobile"] ?: null, $parsed["notes"] ?: null, $parsed["address"] ?: null,
      (string) $parsed["subtotal"], (string) $parsed["tax"], (string) $parsed["discount"], (string) $parsed["packing"], (string) $parsed["delivery_fee"],
      (string) $parsed["total"], $parsed["prep_minutes"], $parsed["payment_status"] ?: "paid", substr(json_encode($raw), 0, 20000),
    ]
  );
  foreach ($parsed["lines"] as $line) {
    pos_q(
      "INSERT INTO aggregator_order_lines (id, order_id, external_item_id, name, qty, rate, amount, notes) VALUES (?,?,?,?,?,?,?,?)",
      "ssssddds",
      [function_exists("pos_uuid") ? pos_uuid() : bin2hex(random_bytes(8)), $id, $line["external_item_id"] ?: null, $line["name"], (string) $line["qty"], (string) $line["rate"], (string) $line["amount"], $line["notes"] ?: null]
    );
  }
  return ["order" => pos_agg_with_lines(pos_q("SELECT * FROM aggregator_orders WHERE id = ? LIMIT 1", "s", [$id])[0]), "replay" => false];
}

function pos_agg_push($source, $status, $settings, $order) {
  $key = $source === "swiggy" ? ($settings["swiggy_api_key"] ?? "") : ($settings["zomato_api_key"] ?? "");
  if ($key === "") return ["skipped" => true];
  $base = rtrim($source === "swiggy" ? ($settings["swiggy_api_base"] ?: "https://partner.swiggy.com") : ($settings["zomato_api_base"] ?: "https://api.zomato.com"), "/");
  $id = $order["external_id"];
  $rid = $order["restaurant_id"] ?: ($source === "swiggy" ? ($settings["swiggy_outlet_id"] ?? "") : ($settings["zomato_restaurant_id"] ?? ""));
  if ($source === "zomato") {
    $path = $status === "accepted" ? "/online-ordering/v1/order/confirm" : ($status === "rejected" ? "/online-ordering/v1/order/reject" : ($status === "ready" ? "/online-ordering/v1/order/food-ready" : ($status === "dispatched" ? "/online-ordering/v1/order/picked-up" : "")));
    $url = $path ? $base . $path : "";
    $payload = ["order_id" => $id, "restaurant_id" => $rid];
  } else {
    $action = $status === "accepted" ? "accept" : ($status === "rejected" ? "reject" : ($status === "ready" ? "ready" : ($status === "dispatched" ? "dispatched" : "")));
    $url = $action ? $base . "/pos/v1/orders/" . rawurlencode($id) . "/" . $action : "";
    $payload = ["order_id" => $id, "outlet_id" => $rid, "status" => $action];
  }
  if ($url === "") return ["skipped" => true];
  if (!function_exists("curl_init")) return ["skipped" => true];
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ["Content-Type: application/json", "Authorization: Bearer " . $key, "X-Api-Key: " . $key],
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_TIMEOUT => 12,
  ]);
  $body = curl_exec($ch);
  $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($code >= 400) throw new Exception("Platform API $code");
  return ["ok" => true, "http" => $code, "body" => $body];
}

function pos_agg_ingest($path, $method, $body) {
  pos_agg_ensure_schema();
  $source = strpos($path, "swiggy") !== false ? "swiggy" : "zomato";
  $parsed = pos_agg_parse($body, $source);
  if (empty($parsed["ok"])) pos_send(400, ["error" => $parsed["error"] ?? "Invalid order", "php" => true]);
  $bid = pos_agg_find_business($parsed["source"], $parsed);
  if ($bid === "") pos_send(400, ["error" => "Unknown restaurant. Add ?shop= to the webhook URL.", "php" => true]);
  $settings = pos_agg_settings($bid);
  $block = pos_agg_block($parsed["source"], $settings);
  if ($block !== "") pos_send(400, ["error" => $block, "php" => true]);
  $want = $parsed["source"] === "swiggy" ? ($settings["swiggy_webhook_secret"] ?? "") : ($settings["zomato_webhook_secret"] ?? "");
  $have = trim((string) ($_SERVER["HTTP_X_WEBHOOK_SECRET"] ?? ($_SERVER["HTTP_X_API_KEY"] ?? "")));
  if (trim((string) $want) === "") pos_send(401, ["error" => "Webhook secret is required before live orders can be accepted", "php" => true]);
  if (!hash_equals((string) $want, $have)) pos_send(401, ["error" => "Webhook secret does not match", "php" => true]);
  $saved = pos_agg_upsert($bid, $parsed, $body);
  pos_send(200, ["ok" => true, "php" => true] + $saved);
}

function pos_agg_public_dispatch($path, $method, $body) {
  if ($method !== "POST") return false;
  if ($path === "webhooks/zomato" || $path === "webhooks/swiggy") {
    pos_agg_ingest($path, $method, $body);
    return true;
  }
  return false;
}

function pos_agg_staff_dispatch($path, $method, $body, $bid, $auth) {
  pos_agg_ensure_schema();
  if ($path === "aggregator/settings" && $method === "GET") {
    pos_send(200, ["ok" => true, "settings" => pos_agg_public_settings(pos_agg_settings($bid)), "webhooks" => [
      "zomato" => "/api/webhooks/zomato?shop=" . rawurlencode($bid),
      "swiggy" => "/api/webhooks/swiggy?shop=" . rawurlencode($bid),
    ], "php" => true]);
  }
  if ($path === "aggregator/settings" && $method === "PUT") {
    $current = pos_agg_settings($bid);
    $draft = $current;
    $draft["zomato_restaurant_id"] = substr((string) ($body["zomato_restaurant_id"] ?? $current["zomato_restaurant_id"] ?? ""), 0, 80);
    $draft["swiggy_outlet_id"] = substr((string) ($body["swiggy_outlet_id"] ?? $current["swiggy_outlet_id"] ?? ""), 0, 80);
    $zKey = (string) ($body["zomato_api_key"] ?? "");
    $sKey = (string) ($body["swiggy_api_key"] ?? "");
    if ($zKey !== "" && strpos($zKey, "•") === false) $draft["zomato_api_key"] = $zKey;
    if ($sKey !== "" && strpos($sKey, "•") === false) $draft["swiggy_api_key"] = $sKey;
    $draft["zomato_enabled"] = pos_agg_flag($body["zomato_enabled"] ?? 0) ? 1 : 0;
    $draft["swiggy_enabled"] = pos_agg_flag($body["swiggy_enabled"] ?? 0) ? 1 : 0;
    if (pos_agg_flag($body["zomato_enabled"] ?? 0)) {
      $err = pos_agg_block("zomato", $draft, true);
      if ($err !== "") pos_send(400, ["error" => $err, "php" => true]);
    }
    if (pos_agg_flag($body["swiggy_enabled"] ?? 0)) {
      $err = pos_agg_block("swiggy", $draft, true);
      if ($err !== "") pos_send(400, ["error" => $err, "php" => true]);
    }
    $sets = [
      "zomato_enabled" => pos_agg_flag($body["zomato_enabled"] ?? 0) ? 1 : 0,
      "swiggy_enabled" => pos_agg_flag($body["swiggy_enabled"] ?? 0) ? 1 : 0,
      "aggregator_auto_accept" => !empty($body["aggregator_auto_accept"]) ? 1 : 0,
      "aggregator_prep_minutes" => max(5, min(90, (int) ($body["aggregator_prep_minutes"] ?? 20))),
      "zomato_restaurant_id" => substr((string) ($body["zomato_restaurant_id"] ?? ""), 0, 80),
      "swiggy_outlet_id" => substr((string) ($body["swiggy_outlet_id"] ?? ""), 0, 80),
      "zomato_api_base" => substr((string) ($body["zomato_api_base"] ?? "https://api.zomato.com"), 0, 180),
      "swiggy_api_base" => substr((string) ($body["swiggy_api_base"] ?? "https://partner.swiggy.com"), 0, 180),
    ];
    foreach (["zomato_api_key","zomato_webhook_secret","swiggy_api_key","swiggy_webhook_secret"] as $col) {
      $v = (string) ($body[$col] ?? "");
      if ($v !== "" && strpos($v, "•") === false) $sets[$col] = substr($v, 0, 180);
    }
    $sql = [];
    $vals = [];
    $types = "";
    foreach ($sets as $col => $val) {
      $sql[] = "$col = ?";
      $vals[] = $val;
      $types .= is_int($val) ? "i" : "s";
    }
    $vals[] = $bid;
    $types .= "s";
    pos_q("UPDATE company_settings SET " . implode(", ", $sql) . " WHERE business_id = ?", $types, $vals);
    pos_send(200, ["ok" => true, "settings" => pos_agg_public_settings(pos_agg_settings($bid)), "php" => true]);
  }
  if ($path === "aggregator/orders" && $method === "GET") {
    $rows = pos_q("SELECT * FROM aggregator_orders WHERE business_id = ? ORDER BY created_at DESC LIMIT 80", "s", [$bid]);
    $out = [];
    foreach ($rows as $row) $out[] = pos_agg_with_lines($row);
    pos_send(200, $out);
  }
  if (preg_match('#^aggregator/orders/([^/]+)$#', $path, $m) && $method === "PATCH") {
    $id = $m[1];
    $status = pos_agg_status($body["status"] ?? "");
    $rows = pos_q("SELECT * FROM aggregator_orders WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$id, $bid]);
    if (!$rows) pos_send(404, ["error" => "Order not found", "php" => true]);
    if ($status === "") pos_send(400, ["error" => "Invalid status", "php" => true]);
    $order = pos_agg_with_lines($rows[0]);
    if ($order["status"] !== $status) {
      pos_agg_push($order["source"], $status, pos_agg_settings($bid), $order);
      $col = pos_agg_stamp($status);
      if ($col) pos_q("UPDATE aggregator_orders SET status = ?, $col = COALESCE($col, NOW(3)) WHERE id = ? AND business_id = ?", "sss", [$status, $id, $bid]);
      else pos_q("UPDATE aggregator_orders SET status = ? WHERE id = ? AND business_id = ?", "sss", [$status, $id, $bid]);
    }
    pos_send(200, ["ok" => true, "order" => pos_agg_with_lines(pos_q("SELECT * FROM aggregator_orders WHERE id = ? LIMIT 1", "s", [$id])[0]), "php" => true]);
  }
  if (preg_match('#^aggregator/orders/([^/]+)/kot$#', $path, $m) && $method === "POST") {
    $id = $m[1];
    $rows = pos_q("SELECT * FROM aggregator_orders WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$id, $bid]);
    if (!$rows) pos_send(404, ["error" => "Order not found", "php" => true]);
    $order = pos_agg_with_lines($rows[0]);
    $shop = pos_q("SELECT business_type, category, bar_enabled FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
    $barShop = ((int) ($shop[0]["bar_enabled"] ?? 0) === 1)
      || strtolower((string) ($shop[0]["business_type"] ?? "")) === "bar"
      || preg_match("/bar\\s*&\\s*lounge/i", (string) (($shop[0]["category"] ?? "") . " " . ($shop[0]["business_type"] ?? "")));
    $table = (($order["fulfillment"] ?? "") === "pickup" || $barShop) ? "Parcel" : ($order["source"] === "swiggy" ? "Swiggy" : "Zomato");
    $kotId = function_exists("pos_uuid") ? pos_uuid() : bin2hex(random_bytes(16));
    $lines = [];
    foreach ($order["lines"] as $line) {
      $lines[] = ["itemId" => $line["external_item_id"] ?: $line["name"], "name" => $line["name"], "qtyGm" => (float) $line["qty"], "unit" => "PCS", "notes" => $line["notes"] ?? ""];
    }
    if (is_file(__DIR__ . "/pos-kots.php")) require_once __DIR__ . "/pos-kots.php";
    if (function_exists("pos_ensure_kitchen_tickets_schema")) pos_ensure_kitchen_tickets_schema();
    pos_q(
      "INSERT INTO kitchen_tickets (id, business_id, table_no, kind, status, notes, lines_json, created_at, updated_at) VALUES (?,?,?,?, 'new', ?, ?, NOW(3), NOW(3))",
      "ssssss",
      [$kotId, $bid, $table, "new", ($order["source"] === "swiggy" ? "Swiggy" : "Zomato") . " " . $order["order_number"], json_encode($lines)]
    );
    pos_q("UPDATE aggregator_orders SET kot_ticket_id = ?, status = CASE WHEN status = 'accepted' THEN 'preparing' ELSE status END WHERE id = ? AND business_id = ?", "sss", [$kotId, $id, $bid]);
    pos_send(200, ["ok" => true, "kot_ticket_id" => $kotId, "order" => pos_agg_with_lines(pos_q("SELECT * FROM aggregator_orders WHERE id = ? LIMIT 1", "s", [$id])[0]), "php" => true]);
  }
  if ($path === "aggregator/sandbox" && $method === "POST") {
    $source = pos_agg_source($body["source"] ?? "zomato") ?: "zomato";
    $gate = pos_agg_block($source, pos_agg_settings($bid));
    if ($gate !== "") pos_send(400, ["error" => $gate, "php" => true]);
    $sample = $body["order"] ?? ($source === "swiggy"
      ? ["orderId" => "SWG-DEMO-" . substr((string) time(), -6), "items" => [["name" => "Masala Dosa", "quantity" => 1, "unit_price" => 120]], "customer" => ["name" => "Swiggy guest"], "order_total" => 120]
      : ["order_id" => "ZMT-DEMO-" . substr((string) time(), -6), "dishes" => [["name" => "Paneer Tikka", "quantity" => 1, "unit_cost" => 249]], "customer" => ["name" => "Zomato guest"], "net_total" => 249]);
    $parsed = pos_agg_parse($sample, $source);
    if (empty($parsed["ok"])) pos_send(400, ["error" => $parsed["error"], "php" => true]);
    $saved = pos_agg_upsert($bid, $parsed, $sample);
    pos_send(200, ["ok" => true, "sandbox" => true, "php" => true] + $saved);
  }
  return false;
}
