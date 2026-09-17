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

function pos_order_line_stock_qty($bid, $l) {
  $qty = (float) ($l["quantity_gm"] ?? 0);
  if (!function_exists("pos_pack_stock_qty")) return $qty;
  $item = $l["item"] ?? null;
  if (!$item && !empty($l["item_id"])) {
    $found = pos_q("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$l["item_id"], $bid]);
    $item = $found[0] ?? [];
  }
  return pos_pack_stock_qty($item ?: [], $qty);
}

function pos_restore_order_stock($bid, $lines) {
  foreach ($lines as $l) {
    if (($l["cancelled"] ?? 0) == 1 || ($l["cancelled"] ?? "0") === "1") continue;
    pos_q(
      "UPDATE items SET stock_gm = stock_gm + ? WHERE id = ? AND business_id = ?",
      "dss",
      [pos_order_line_stock_qty($bid, $l), $l["item_id"], $bid]
    );
  }
}

function pos_deduct_order_stock($bid, $lines) {
  foreach ($lines as $l) {
    pos_q(
      "UPDATE items SET stock_gm = stock_gm - ? WHERE id = ? AND business_id = ?",
      "dss",
      [pos_order_line_stock_qty($bid, $l), $l["item_id"], $bid]
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
    pos_send(400, ["error" => "Void bills cannot be edited. Change status first.", "php" => true]);
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

  if (is_file(__DIR__ . "/pos-advanced.php")) require_once __DIR__ . "/pos-advanced.php";
  $built = [];
  foreach ($lines as $line) {
    $it = pos_q("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$line["itemId"] ?? "", $bid]);
    $item = $it[0] ?? null;
    if (!$item) pos_send(400, ["error" => "Unknown item", "php" => true]);
    $qty = (float) ($line["quantity_gm"] ?? 0);
    if ($qty <= 0) pos_send(400, ["error" => "Invalid quantity", "php" => true]);
    if (function_exists("pos_compute_sale_line")) {
      $built[] = pos_compute_sale_line($item, $qty, $customer, $line);
    } else {
      $rate = (($customer["type"] ?? "") === "b2b") ? (float) $item["b2b_rate"] : (float) $item["retail_rate"];
      $amount = pos_round2(pos_line_amount_for_item($qty, $rate, $item));
      $built[] = ["item" => $item, "qty" => $qty, "rate" => $rate, "amount" => $amount, "gstRate" => (float) ($item["gst_rate"] ?? 0), "discount" => 0, "gst" => pos_round2(($amount * (float) ($item["gst_rate"] ?? 0)) / 100)];
    }
  }

  $subtotal = pos_round2(array_sum(array_column($built, "amount")));
  $gst = 0;
  foreach ($built as $l) $gst += isset($l["gst"]) ? (float) $l["gst"] : (($l["amount"] * $l["gstRate"]) / 100);
  $gst = pos_round2($gst);
  $billType = $body["discountType"] ?? $body["discount_type"] ?? "amt";
  $billValue = $body["discountValue"] ?? $body["discount_value"] ?? $body["discount"] ?? 0;
  $billDiscount = function_exists("pos_adv_discount_amount")
    ? pos_adv_discount_amount($subtotal + $gst, $billType, $billValue)
    : pos_round2((float) ($body["discount"] ?? 0));
  $total = pos_round2(max(0, $subtotal + $gst - $billDiscount));
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

  $custName = pos_customer_label($customer);
  pos_q(
    "UPDATE sales_orders SET
       customer_id = ?, customer_name = ?, customer_type = ?,
       pack_id = ?, pack_name = ?, pack_count = ?, status = ?,
       total_quantity_gm = ?, subtotal = ?, discount = ?, gst = ?, total = ?,
       payment_method = ?, payment_status = ?
     WHERE id = ? AND business_id = ?",
    "ssssssssssssssss",
    [
      $customer["id"], $custName, (string) ($customer["type"] ?? "b2c"),
      $packId ? (string) $packId : null, $packName ? (string) $packName : null, $packCount !== null ? (string) $packCount : null,
      $newStatus, (string) $totalGm, (string) $subtotal, (string) $billDiscount, (string) $gst, (string) $total,
      $methodPay, $payStatus, $orderId, $bid,
    ]
  );
  $dtype = function_exists("pos_adv_is_pct") && pos_adv_is_pct($billType) ? "pct" : "amt";
  try {
    pos_q(
      "UPDATE sales_orders SET discount_type = ?, discount_value = ? WHERE id = ? AND business_id = ?",
      "ssss",
      [$dtype, (string) ((float) $billValue), $orderId, $bid]
    );
  } catch (Exception $e) { /* optional columns */ }

  if ($newStatus !== "cancelled") {
    foreach ($built as $line) {
      $lineDisc = (string) ($line["discount"] ?? 0);
      try {
        pos_q(
          "INSERT INTO sales_order_lines (
             id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
             discount, amount, gst_rate, cancelled, business_id,
             mrp, discount_type, discount_value, barcode, cost, profit
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          "sssssssssssssssss",
          [
            pos_uuid(), $orderId, $line["item"]["id"], pos_item_bill_name($line["item"]), (string) $line["qty"], (string) $line["rate"],
            $lineDisc, (string) $line["amount"], (string) $line["gstRate"], "0", $bid,
            (string) ($line["mrp"] ?? 0), $line["discountType"] ?? "amt", (string) ($line["discountValue"] ?? 0),
            $line["barcode"] ?? null, (string) ($line["cost"] ?? 0), (string) ($line["profit"] ?? 0),
          ]
        );
      } catch (Exception $e) {
        pos_q(
          "INSERT INTO sales_order_lines (
             id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
             discount, amount, gst_rate, cancelled, business_id
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          "sssssssssss",
          [
            pos_uuid(), $orderId, $line["item"]["id"], pos_item_bill_name($line["item"]), (string) $line["qty"], (string) $line["rate"],
            $lineDisc, (string) $line["amount"], (string) $line["gstRate"], "0", $bid,
          ]
        );
      }
      if (function_exists("pos_persist_sale_line_note")) pos_persist_sale_line_note($lineId, $line["notes"] ?? "");
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
