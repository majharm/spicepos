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
    if (is_file(__DIR__ . "/pos-advanced.php")) require_once __DIR__ . "/pos-advanced.php";
    if (function_exists("pos_ensure_advanced_schema")) pos_ensure_advanced_schema();
    $built = [];
    foreach ($lines as $line) {
      $it = pos_q("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$line["itemId"] ?? "", $bid]);
      $item = $it[0] ?? null;
      if (!$item) throw new Exception("Unknown item");
      $qty = (float) ($line["quantity_gm"] ?? 0);
      if ($qty <= 0) throw new Exception("Invalid quantity");
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
    $afterBill = pos_round2(max(0, $subtotal + $gst - $billDiscount));
    $total = $afterBill;
    $loyaltyDiscount = 0;
    $loyaltyEarn = 0;
    $loyaltyRedeem = 0;
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
      $lineId = pos_uuid();
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
            $lineId, $orderId, $line["item"]["id"], pos_item_bill_name($line["item"]), (string) $line["qty"], (string) $line["rate"],
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
            $lineId, $orderId, $line["item"]["id"], pos_item_bill_name($line["item"]), (string) $line["qty"], (string) $line["rate"],
            $lineDisc, (string) $line["amount"], (string) $line["gstRate"], "0", $bid,
          ]
        );
      }
      $firstBatch = null;
      if (function_exists("pos_allocate_batches")) {
        $allocs = pos_allocate_batches($bid, $line["item"]["id"], $line["qty"], $line["barcode"] ?? "", $line["batchId"] ?? "");
        $firstBatch = $allocs[0]["batch"] ?? null;
        foreach ($allocs as $al) {
          if (function_exists("pos_write_stock_movement")) {
            pos_write_stock_movement($bid, $branchId, $uid, $line["item"]["id"], "sale", -((float) $al["qty"]), $orderNumber, [
              "barcode" => $al["batch"]["barcode"] ?? null, "batch_id" => $al["batch"]["id"] ?? null,
              "unit_cost" => $al["batch"]["unit_cost"] ?? 0, "ref_type" => "sale", "ref_id" => $orderId,
            ]);
          }
        }
        if ($firstBatch) {
          try {
            pos_q("UPDATE sales_order_lines SET batch_id = ?, barcode = COALESCE(NULLIF(barcode,''), ?) WHERE id = ?", "sss", [$firstBatch["id"], $firstBatch["barcode"] ?? null, $lineId]);
          } catch (Exception $e) { /* optional */ }
        }
      }
      pos_q("UPDATE items SET stock_gm = stock_gm - ? WHERE id = ? AND business_id = ?", "dss", [$line["qty"], $line["item"]["id"], $bid]);
    }
    if (function_exists("pos_loyalty_apply_sale")) {
      $loy = pos_loyalty_apply_sale($bid, $customer, $orderId, $afterBill, $body["loyaltyPoints"] ?? $body["loyalty_points"] ?? 0, $uid);
      $loyaltyDiscount = (float) ($loy["rupees"] ?? 0);
      $loyaltyEarn = (int) ($loy["earned"] ?? 0);
      $loyaltyRedeem = (int) ($loy["points"] ?? 0);
      $total = pos_round2(max(0, $afterBill - $loyaltyDiscount));
      try {
        pos_q(
          "UPDATE sales_orders SET total = ?, discount_type = ?, discount_value = ?, loyalty_points_redeemed = ?, loyalty_points_earned = ?, loyalty_discount = ? WHERE id = ?",
          "sssiids",
          [(string) $total, pos_adv_is_pct($billType) ? "pct" : "amt", (string) pos_adv_round2($billValue), $loyaltyRedeem, $loyaltyEarn, $loyaltyDiscount, $orderId]
        );
      } catch (Exception $e) {
        pos_q("UPDATE sales_orders SET total = ? WHERE id = ?", "ss", [(string) $total, $orderId]);
      }
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
    if (function_exists("pos_alert_low_stock")) {
      pos_alert_low_stock($bid, array_column($row["lines"] ?? [], "item_id"));
    }
    if (function_exists("pos_tick_shop_alerts")) {
      pos_tick_shop_alerts($bid);
    }
    pos_send(200, ["ok" => true, "order" => $row, "php" => true]);
  } catch (Throwable $e) {
    pos_send(400, ["error" => $e->getMessage(), "php" => true]);
  }
  return true;
}
