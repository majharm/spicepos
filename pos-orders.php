<?php

function pos_order_statuses() {
  return ["confirmed", "delivered", "cancelled"];
}

function pos_payment_statuses() {
  return ["paid", "partial", "unpaid"];
}

function pos_order_with_lines($bid, $orderId) {
  $orders = pos_q("SELECT * FROM sales_orders WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$orderId, $bid]);
  $row = $orders[0] ?? null;
  if (!$row) return null;
  $row["lines"] = pos_q("SELECT * FROM sales_order_lines WHERE order_id = ? ORDER BY created_at", "s", [$orderId]);
  return $row;
}

function pos_restore_order_stock($bid, $lines) {
  foreach ($lines as $l) {
    if (($l["cancelled"] ?? 0) == 1 || ($l["cancelled"] ?? "0") === "1") continue;
    pos_q(
      "UPDATE items SET stock_gm = stock_gm + ? WHERE id = ? AND business_id = ?",
      "dss",
      [(float) $l["quantity_gm"], $l["item_id"], $bid]
    );
  }
}

function pos_deduct_order_stock($bid, $lines) {
  foreach ($lines as $l) {
    pos_q(
      "UPDATE items SET stock_gm = stock_gm - ? WHERE id = ? AND business_id = ?",
      "dss",
      [(float) $l["quantity_gm"], $l["item_id"], $bid]
    );
  }
}

function pos_patch_order($bid, $orderId, $body, $auth) {
  $existing = pos_order_with_lines($bid, $orderId);
  if (!$existing) pos_send(404, ["error" => "Order not found", "php" => true]);

  $oldStatus = strtolower((string) ($existing["status"] ?? "confirmed"));
  $newStatus = isset($body["status"]) ? strtolower(trim((string) $body["status"])) : $oldStatus;
  if (!in_array($newStatus, pos_order_statuses(), true)) {
    pos_send(400, ["error" => "Invalid order status", "php" => true]);
  }

  $payStatus = $existing["payment_status"] ?? "paid";
  if (isset($body["payment_status"])) {
    $payStatus = strtolower(trim((string) $body["payment_status"]));
    if (!in_array($payStatus, pos_payment_statuses(), true)) {
      pos_send(400, ["error" => "Invalid payment status", "php" => true]);
    }
  }

  $activeLines = array_values(array_filter($existing["lines"] ?? [], function ($l) {
    return ($l["cancelled"] ?? 0) != 1 && ($l["cancelled"] ?? "0") !== "1";
  }));

  if ($newStatus === "cancelled" && $oldStatus !== "cancelled") {
    pos_restore_order_stock($bid, $activeLines);
    foreach ($activeLines as $l) {
      pos_q("UPDATE sales_order_lines SET cancelled = 1 WHERE id = ?", "s", [$l["id"]]);
    }
  } elseif ($oldStatus === "cancelled" && $newStatus !== "cancelled") {
    $allLines = $existing["lines"] ?? [];
    pos_deduct_order_stock($bid, $allLines);
    foreach ($allLines as $l) {
      pos_q("UPDATE sales_order_lines SET cancelled = 0 WHERE id = ?", "s", [$l["id"]]);
    }
  }

  pos_q(
    "UPDATE sales_orders SET status = ?, payment_status = ? WHERE id = ? AND business_id = ?",
    "ssss",
    [$newStatus, $payStatus, $orderId, $bid]
  );

  $row = pos_order_with_lines($bid, $orderId);
  pos_staff_audit($auth["user"], "Sale Status Changed", [
    "module" => "sales",
    "target_id" => $orderId,
    "target_name" => $row["order_number"] ?? $orderId,
    "status" => $newStatus,
    "payment_status" => $payStatus,
  ], $bid, $auth["branchId"] ?? $auth["user"]["branch_id"] ?? null);
  pos_send(200, ["ok" => true, "order" => $row, "php" => true]);
}

function pos_update_order($bid, $orderId, $body, $auth) {
  $lines = $body["lines"] ?? null;
  if (!is_array($lines) || !$lines) pos_send(400, ["error" => "Order must have lines", "php" => true]);

  $existing = pos_order_with_lines($bid, $orderId);
  if (!$existing) pos_send(404, ["error" => "Order not found", "php" => true]);
  if (strtolower((string) ($existing["status"] ?? "")) === "cancelled") {
    pos_send(400, ["error" => "Cancelled orders cannot be edited. Change status first.", "php" => true]);
  }

  $oldActive = array_values(array_filter($existing["lines"] ?? [], function ($l) {
    return ($l["cancelled"] ?? 0) != 1 && ($l["cancelled"] ?? "0") !== "1";
  }));
  pos_restore_order_stock($bid, $oldActive);
  pos_q("DELETE FROM sales_order_lines WHERE order_id = ?", "s", [$orderId]);

  $customerId = $body["customerId"] ?? $existing["customer_id"];
  $cust = pos_q("SELECT * FROM customers WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$customerId, $bid]);
  $customer = $cust[0] ?? null;
  if (!$customer) pos_send(400, ["error" => "Customer not found", "php" => true]);

  $built = [];
  foreach ($lines as $line) {
    $it = pos_q("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$line["itemId"] ?? "", $bid]);
    $item = $it[0] ?? null;
    if (!$item) pos_send(400, ["error" => "Unknown item", "php" => true]);
    $qty = (float) ($line["quantity_gm"] ?? 0);
    if ($qty <= 0) pos_send(400, ["error" => "Invalid quantity", "php" => true]);
    $rate = (($customer["type"] ?? "") === "b2b") ? (float) $item["b2b_rate"] : (float) $item["retail_rate"];
    $amount = pos_round2(pos_line_amount_for_item($qty, $rate, $item));
    $built[] = ["item" => $item, "qty" => $qty, "rate" => $rate, "amount" => $amount, "gstRate" => (float) ($item["gst_rate"] ?? 0)];
  }

  $subtotal = pos_round2(array_sum(array_column($built, "amount")));
  $gst = pos_round2(array_sum(array_map(function ($l) {
    return ($l["amount"] * $l["gstRate"]) / 100;
  }, $built)));
  $total = pos_round2($subtotal + $gst);
  $totalGm = array_sum(array_column($built, "qty"));
  $methodPay = strtolower((string) ($body["paymentMethod"] ?? $existing["payment_method"] ?? "cash"));
  if (!in_array($methodPay, ["cash", "upi", "card", "credit"], true)) {
    pos_send(400, ["error" => "Invalid payment method", "php" => true]);
  }
  $payStatus = $methodPay === "credit" ? "partial" : "paid";
  if (!empty($body["payment_status"])) {
    $maybe = strtolower(trim((string) $body["payment_status"]));
    if (in_array($maybe, pos_payment_statuses(), true)) $payStatus = $maybe;
  }

  $newStatus = strtolower(trim((string) ($body["status"] ?? $existing["status"] ?? "confirmed")));
  if (!in_array($newStatus, pos_order_statuses(), true)) $newStatus = "confirmed";

  $packId = array_key_exists("packId", $body) ? $body["packId"] : $existing["pack_id"];
  $packName = $existing["pack_name"] ?? null;
  $packCount = $body["packCount"] ?? $existing["pack_count"] ?? null;
  if ($packId) {
    $pk = pos_q("SELECT name FROM packs WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$packId, $bid]);
    $packName = $pk[0]["name"] ?? $packName;
  } elseif ($packId === null || $packId === "") {
    $packName = null;
    $packCount = null;
  }

  $custName = $customer["business_name"] ?? $customer["name"];
  pos_q(
    "UPDATE sales_orders SET
       customer_id = ?, customer_name = ?, customer_type = ?,
       pack_id = ?, pack_name = ?, pack_count = ?, status = ?,
       total_quantity_gm = ?, subtotal = ?, gst = ?, total = ?,
       payment_method = ?, payment_status = ?
     WHERE id = ? AND business_id = ?",
    "sssssssssssssss",
    [
      $customer["id"], $custName, (string) ($customer["type"] ?? "b2c"),
      $packId ? (string) $packId : null, $packName ? (string) $packName : null, $packCount !== null ? (string) $packCount : null,
      $newStatus, (string) $totalGm, (string) $subtotal, (string) $gst, (string) $total,
      $methodPay, $payStatus, $orderId, $bid,
    ]
  );

  if ($newStatus !== "cancelled") {
    foreach ($built as $line) {
      pos_q(
        "INSERT INTO sales_order_lines (
           id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
           discount, amount, gst_rate, cancelled, business_id
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        "sssssssssss",
        [
          pos_uuid(), $orderId, $line["item"]["id"], pos_item_bill_name($line["item"]), (string) $line["qty"], (string) $line["rate"],
          "0", (string) $line["amount"], (string) $line["gstRate"], "0", $bid,
        ]
      );
      pos_q("UPDATE items SET stock_gm = stock_gm - ? WHERE id = ? AND business_id = ?", "dss", [$line["qty"], $line["item"]["id"], $bid]);
    }
  }

  $row = pos_order_with_lines($bid, $orderId);
  pos_staff_audit($auth["user"], "Sale Updated", [
    "module" => "sales",
    "target_id" => $orderId,
    "target_name" => $row["order_number"] ?? $orderId,
    "total" => $total,
    "payment_method" => $methodPay,
    "customer_name" => $custName,
  ], $bid, $auth["branchId"] ?? $auth["user"]["branch_id"] ?? null);
  pos_send(200, ["ok" => true, "order" => $row, "php" => true]);
}

function pos_dispatch_order_route($path, $method, $body, $bid, $auth) {
  if (!preg_match('#^orders/([^/]+)$#', $path, $m)) return false;
  $orderId = $m[1];
  if ($method === "PUT") pos_update_order($bid, $orderId, $body, $auth);
  if ($method === "PATCH") pos_patch_order($bid, $orderId, $body, $auth);
  pos_send(405, ["error" => "Method not allowed", "path" => $path, "method" => $method, "php" => true]);
  return true;
}
