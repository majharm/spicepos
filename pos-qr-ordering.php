<?php

function pos_qr_statuses() {
  return ["pending", "accepted", "preparing", "ready", "completed", "cancelled"];
}

function pos_qr_ensure_schema() {
  $db = pos_db();
  $db->query(
    "CREATE TABLE IF NOT EXISTS qr_orders (
      id VARCHAR(255) PRIMARY KEY,
      order_number VARCHAR(32) NOT NULL,
      business_id VARCHAR(255) NOT NULL,
      branch_id VARCHAR(255) NULL,
      customer_name VARCHAR(160) NOT NULL,
      mobile VARCHAR(32) NOT NULL,
      table_no VARCHAR(64) NULL,
      notes TEXT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
      gst DECIMAL(12,2) NOT NULL DEFAULT 0,
      total DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_qr_order_number (business_id, order_number),
      INDEX idx_qr_orders_business_status (business_id, status, created_at)
    )"
  );
  if ($db->errno) throw new Exception($db->error ?: "Could not prepare QR ordering");
  $db->query(
    "CREATE TABLE IF NOT EXISTS qr_order_lines (
      id VARCHAR(255) PRIMARY KEY,
      order_id VARCHAR(255) NOT NULL,
      business_id VARCHAR(255) NOT NULL,
      item_id VARCHAR(255) NOT NULL,
      item_name VARCHAR(255) NOT NULL,
      unit VARCHAR(32) NOT NULL,
      quantity_gm DECIMAL(14,3) NOT NULL,
      rate_per_kg DECIMAL(12,4) NOT NULL,
      gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      gst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_qr_order_lines_order (order_id),
      INDEX idx_qr_order_lines_business (business_id)
    )"
  );
  if ($db->errno) throw new Exception($db->error ?: "Could not prepare QR order lines");
}

function pos_qr_clean($value, $max) {
  return substr(trim((string) $value), 0, $max);
}

function pos_qr_business($shop) {
  $key = pos_qr_clean($shop, 255);
  if ($key === "") return null;
  $rows = pos_q(
    "SELECT b.*, c.name AS company_name, c.address AS company_address, c.phone AS company_phone,
            c.logo_url AS company_logo
     FROM businesses b LEFT JOIN company_settings c ON c.business_id = b.id
     WHERE (b.id = ? OR b.code = ?) AND b.status = 'active' LIMIT 1",
    "ss",
    [$key, $key]
  );
  return $rows[0] ?? null;
}

function pos_qr_quantity_to_base($quantity, $unit) {
  $n = (float) $quantity;
  if (!is_finite($n) || $n <= 0) throw new Exception("Invalid item quantity");
  $code = pos_item_unit($unit);
  if ($code === "GM" || $code === "ML" || $code === "KG" || $code === "LTR") return round($n * 1000, 3);
  return round($n, 3);
}

function pos_qr_validate_order($body) {
  $name = pos_qr_clean($body["customer_name"] ?? $body["customerName"] ?? "", 160);
  $mobile = preg_replace('/[^\d+]/', '', pos_qr_clean($body["mobile"] ?? "", 32));
  $table = pos_qr_clean($body["table_no"] ?? $body["tableNo"] ?? "", 64);
  $notes = pos_qr_clean($body["notes"] ?? "", 1000);
  if ($name === "") throw new Exception("Customer name is required");
  if (strlen(preg_replace('/\D/', '', $mobile)) < 10) throw new Exception("Valid mobile number is required");
  $lines = [];
  foreach (array_slice(is_array($body["lines"] ?? null) ? $body["lines"] : [], 0, 50) as $line) {
    $itemId = pos_qr_clean($line["item_id"] ?? $line["itemId"] ?? "", 255);
    $quantity = (float) ($line["quantity"] ?? 0);
    if ($itemId !== "" && $quantity > 0) $lines[] = ["item_id" => $itemId, "quantity" => $quantity];
  }
  if (!$lines) throw new Exception("Add at least one item");
  return ["customer_name" => $name, "mobile" => $mobile, "table_no" => $table, "notes" => $notes, "lines" => $lines];
}

function pos_qr_order_number() {
  return "QRO-" . strtoupper(substr(base_convert((string) round(microtime(true) * 1000), 10, 36), -5)) . strtoupper(base_convert((string) random_int(0, 35), 10, 36));
}

function pos_qr_orders_with_lines($bid, $status = "") {
  $sql = "SELECT * FROM qr_orders WHERE business_id = ?";
  $types = "s";
  $params = [$bid];
  if ($status !== "" && in_array($status, pos_qr_statuses(), true)) {
    $sql .= " AND status = ?";
    $types .= "s";
    $params[] = $status;
  }
  $sql .= " ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 WHEN 'preparing' THEN 2
            WHEN 'ready' THEN 3 ELSE 4 END, created_at DESC LIMIT 100";
  $orders = pos_q($sql, $types, $params);
  foreach ($orders as &$order) {
    $order["lines"] = pos_q("SELECT * FROM qr_order_lines WHERE order_id = ? ORDER BY created_at", "s", [$order["id"]]);
  }
  unset($order);
  return $orders;
}

function pos_qr_public_dispatch($path, $method, $body) {
  if ($path === "qr/menu" && $method === "GET") {
    pos_qr_ensure_schema();
    $business = pos_qr_business($_GET["shop"] ?? "");
    if (!$business) pos_send(404, ["error" => "Shop not found", "php" => true]);
    $items = pos_q(
      "SELECT id, code, name, category, subcategory, base_unit, unit, retail_rate, gst_rate,
              hsn, image_url, stock_gm
       FROM items WHERE business_id = ? AND status = 'active' AND stock_gm > 0
       ORDER BY category, subcategory, name",
      "s",
      [$business["id"]]
    );
    pos_send(200, [
      "shop" => [
        "id" => $business["id"], "code" => $business["code"],
        "name" => $business["company_name"] ?: $business["name"],
        "address" => $business["company_address"] ?: ($business["address"] ?? ""),
        "phone" => $business["company_phone"] ?: ($business["mobile"] ?? ""),
        "logo_url" => $business["company_logo"] ?: ($business["logo_url"] ?? ""),
      ],
      "items" => $items,
      "php" => true,
    ]);
  }

  if ($path === "qr/orders" && $method === "POST") {
    pos_qr_ensure_schema();
    $input = pos_qr_validate_order(is_array($body) ? $body : []);
    $business = pos_qr_business($body["shop"] ?? "");
    if (!$business) pos_send(404, ["error" => "Shop not found", "php" => true]);
    $built = [];
    foreach ($input["lines"] as $line) {
      $items = pos_q(
        "SELECT id, name, base_unit, unit, retail_rate, gst_rate, stock_gm
         FROM items WHERE id = ? AND business_id = ? AND status = 'active' LIMIT 1",
        "ss",
        [$line["item_id"], $business["id"]]
      );
      $item = $items[0] ?? null;
      if (!$item) throw new Exception("One selected item is no longer available");
      $unit = pos_item_unit($item);
      $qty = pos_qr_quantity_to_base($line["quantity"], $unit);
      if ($qty > (float) ($item["stock_gm"] ?? 0)) throw new Exception($item["name"] . " does not have enough stock");
      $amount = pos_round2(pos_line_amount_for_item($qty, (float) $item["retail_rate"], $item));
      $gstRate = (float) ($item["gst_rate"] ?? 0);
      $built[] = ["item" => $item, "unit" => $unit, "qty" => $qty, "amount" => $amount, "gst_rate" => $gstRate, "gst" => pos_round2($amount * $gstRate / 100)];
    }
    $subtotal = pos_round2(array_sum(array_column($built, "amount")));
    $gst = pos_round2(array_sum(array_column($built, "gst")));
    $total = pos_round2($subtotal + $gst);
    $id = pos_uuid();
    $number = pos_qr_order_number();
    $db = pos_db();
    $db->begin_transaction();
    try {
      pos_q(
        "INSERT INTO qr_orders
         (id, order_number, business_id, customer_name, mobile, table_no, notes, status, subtotal, gst, total)
         VALUES (?,?,?,?,?,?,?,'pending',?,?,?)",
        "sssssssddd",
        [$id, $number, $business["id"], $input["customer_name"], $input["mobile"], $input["table_no"], $input["notes"], $subtotal, $gst, $total]
      );
      foreach ($built as $line) {
        pos_q(
          "INSERT INTO qr_order_lines
           (id, order_id, business_id, item_id, item_name, unit, quantity_gm, rate_per_kg, gst_rate, amount, gst_amount)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          "ssssssddddd",
          [pos_uuid(), $id, $business["id"], $line["item"]["id"], $line["item"]["name"], $line["unit"], $line["qty"], (float) $line["item"]["retail_rate"], $line["gst_rate"], $line["amount"], $line["gst"]]
        );
      }
      $db->commit();
    } catch (Throwable $e) {
      $db->rollback();
      throw $e;
    }
    pos_send(201, ["ok" => true, "order" => ["id" => $id, "order_number" => $number, "status" => "pending", "subtotal" => $subtotal, "gst" => $gst, "total" => $total], "php" => true]);
  }
  return false;
}

function pos_qr_staff_dispatch($path, $method, $body, $bid, $branchId) {
  pos_qr_ensure_schema();
  if ($path === "qr-orders" && $method === "GET") {
    $status = strtolower(pos_qr_clean($_GET["status"] ?? "", 24));
    pos_send(200, pos_qr_orders_with_lines($bid, $status));
  }
  if (preg_match('#^qr-orders/([^/]+)$#', $path, $m) && $method === "PATCH") {
    $status = strtolower(pos_qr_clean($body["status"] ?? "", 24));
    if (!in_array($status, pos_qr_statuses(), true)) pos_send(400, ["error" => "Invalid QR order status", "php" => true]);
    pos_q("UPDATE qr_orders SET status = ?, branch_id = COALESCE(branch_id, ?) WHERE id = ? AND business_id = ?", "ssss", [$status, $branchId, $m[1], $bid]);
    $rows = pos_qr_orders_with_lines($bid);
    $found = null;
    foreach ($rows as $row) if ($row["id"] === $m[1]) $found = $row;
    if (!$found) pos_send(404, ["error" => "QR order not found", "php" => true]);
    pos_send(200, ["ok" => true, "order" => $found, "php" => true]);
  }
  return false;
}
