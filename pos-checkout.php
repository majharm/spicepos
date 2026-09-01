<?php

function pos_checkout_sale($bid, $branchId, $uid, $auth, $body) {
  require_once __DIR__ . "/pos-accounting.php";
  pos_ensure_sales_schema();
  return pos_with_transaction(function () use ($body, $bid, $branchId, $uid, $auth) {
    $lines = $body["lines"] ?? [];
    if (!is_array($lines) || !$lines) throw new Exception("Cart is empty");
    $methodPay = strtolower((string) ($body["paymentMethod"] ?? "cash"));
    if (!in_array($methodPay, ["cash", "upi", "card", "credit"], true)) throw new Exception("Invalid payment method");
    $customerId = $body["customerId"] ?? "";
    $cust = pos_q("SELECT * FROM customers WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$customerId, $bid]);
    $customer = $cust[0] ?? null;
    if (!$customer) throw new Exception("Customer not found");
    $built = [];
    foreach ($lines as $line) {
      $it = pos_q("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$line["itemId"] ?? "", $bid]);
      $item = $it[0] ?? null;
      if (!$item) throw new Exception("Unknown item");
      $qty = (float) ($line["quantity_gm"] ?? 0);
      if ($qty <= 0) throw new Exception("Invalid quantity");
      $rate = (($customer["type"] ?? "") === "b2b") ? (float) $item["b2b_rate"] : (float) $item["retail_rate"];
      $amount = pos_round2(pos_line_amount_for_item($qty, $rate, $item));
      $built[] = ["item" => $item, "qty" => $qty, "rate" => $rate, "amount" => $amount, "gstRate" => (float) ($item["gst_rate"] ?? 0)];
    }
    $subtotal = pos_round2(array_sum(array_column($built, "amount")));
    $billDiscount = pos_round2((float) ($body["discount"] ?? 0));
    $gst = 0;
    foreach ($built as $l) $gst += ($l["amount"] * $l["gstRate"]) / 100;
    $gst = pos_round2($gst);
    $total = pos_round2(max(0, $subtotal + $gst - $billDiscount));
    $totalGm = array_sum(array_column($built, "qty"));
    $next = pos_next_seq("order", $bid, 10001);
    $orderNumber = "SO-" . $next;
    $orderId = pos_uuid();
    $payStatus = $methodPay === "credit" ? "partial" : "paid";
    $packId = $body["packId"] ?? null;
    $packName = null;
    if ($packId) {
      $pk = pos_q("SELECT name FROM packs WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$packId, $bid]);
      $packName = $pk[0]["name"] ?? null;
    }
    $custName = $customer["business_name"] ?? $customer["name"];
    pos_q(
      "INSERT INTO sales_orders (
         id, order_number, customer_id, customer_name, customer_type,
         pack_id, pack_name, pack_count, status, total_quantity_gm,
         subtotal, discount, gst, total, payment_method, payment_status, business_id,
         branch_id, cashier_id
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      "sssssssssssssssssss",
      [
        $orderId, $orderNumber, $customer["id"], $custName, (string) ($customer["type"] ?? "b2c"),
        $packId ? (string) $packId : null, $packName, $body["packCount"] ?? null, "confirmed", (string) $totalGm,
        (string) $subtotal, (string) $billDiscount, (string) $gst, (string) $total, $methodPay, $payStatus, $bid,
        $branchId ? (string) $branchId : null, $uid ? (string) $uid : null,
      ]
    );
    foreach ($built as $line) {
      pos_q(
        "INSERT INTO sales_order_lines (
           id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
           discount, amount, gst_rate, cancelled, business_id
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        "sssssssssss",
        [
          pos_uuid(), $orderId, $line["item"]["id"], $line["item"]["name"], (string) $line["qty"], (string) $line["rate"],
          "0", (string) $line["amount"], (string) $line["gstRate"], "0", $bid,
        ]
      );
      pos_q("UPDATE items SET stock_gm = stock_gm - ? WHERE id = ? AND business_id = ?", "dss", [$line["qty"], $line["item"]["id"], $bid]);
    }
    $orders = pos_q("SELECT * FROM sales_orders WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$orderId, $bid]);
    $orderLines = pos_q("SELECT * FROM sales_order_lines WHERE order_id = ?", "s", [$orderId]);
    $orderRow = $orders[0] ?? [
      "id" => $orderId, "order_number" => $orderNumber, "customer_id" => $customer["id"],
      "customer_name" => $custName, "customer_type" => (string) ($customer["type"] ?? "b2c"),
      "pack_id" => $packId, "pack_name" => $packName, "pack_count" => $body["packCount"] ?? null,
      "status" => "confirmed", "total_quantity_gm" => $totalGm, "subtotal" => $subtotal,
      "discount" => $billDiscount, "gst" => $gst, "total" => $total,
      "payment_method" => $methodPay, "payment_status" => $payStatus, "business_id" => $bid,
      "created_at" => date("c"),
    ];
    $orderRow["lines"] = $orderLines;
    try {
      pos_record_credit_sale($customer, $total, $orderId, $orderNumber, $methodPay, $bid, $uid);
    } catch (Throwable $e) { /* credit ledger optional */ }
    try {
      pos_post_sale_journal($bid, $uid, $orderRow);
    } catch (Throwable $e) { /* GL journal optional on PHP-only shops */ }
    return $orderRow;
  });
}

function pos_dispatch_checkout($path, $method, $body, $bid, $branchId, $uid, $auth) {
  if ($path !== "checkout" || $method !== "POST") return false;
  try {
    $row = pos_checkout_sale($bid, $branchId, $uid, $auth, $body);
    pos_staff_audit($auth["user"], "Sale Created", [
      "module" => "sales",
      "target_id" => $row["id"],
      "target_name" => $row["order_number"],
      "total" => $row["total"],
      "payment_method" => $row["payment_method"],
      "customer_name" => $row["customer_name"],
    ], $bid, $branchId);
    pos_send(200, ["ok" => true, "order" => $row, "php" => true]);
  } catch (Throwable $e) {
    pos_send(400, ["error" => $e->getMessage(), "php" => true]);
  }
  return true;
}
