<?php

function pos_checkout_sale($bid, $branchId, $uid, $auth, $body) {
  require_once __DIR__ . "/pos-accounting.php";
  pos_ensure_sales_schema();
  $qrOrderId = trim((string) ($body["qrOrderId"] ?? $body["qr_order_id"] ?? ""));
  if ($qrOrderId !== "") {
    require_once __DIR__ . "/pos-qr-ordering.php";
    pos_qr_ensure_schema();
    try {
      $qrRows = pos_q("SELECT sales_order_id, status FROM qr_orders WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$qrOrderId, $bid]);
      $st = strtolower((string) ($qrRows[0]["status"] ?? ""));
      if (!empty($qrRows[0]["sales_order_id"]) || in_array($st, ["cancelled", "rejected"], true)) {
        $qrOrderId = "";
      }
    } catch (Exception $e) { /* optional */ }
  }
  return pos_with_transaction(function () use ($body, $bid, $branchId, $uid, $auth, $qrOrderId) {
    $lines = $body["lines"] ?? [];
    if (!is_array($lines) || !$lines) throw new Exception("Cart is empty");
    $methodPay = pos_pay_normalize($body["paymentMethod"] ?? "cash");
    if (!pos_pay_is_sale($methodPay)) throw new Exception("Invalid payment method");
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
    $payStatus = $methodPay === "credit" ? "unpaid" : "paid";
    $packId = $body["packId"] ?? null;
    $packName = null;
    if ($packId) {
      $pk = pos_q("SELECT name FROM packs WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$packId, $bid]);
      $packName = $pk[0]["name"] ?? null;
    }
    $custName = pos_customer_label($customer);
    $billName = function_exists("pos_clip_invoice_text")
      ? pos_clip_invoice_text($body["customer_name"] ?? $body["customerName"] ?? "", 180)
      : trim((string) ($body["customer_name"] ?? $body["customerName"] ?? ""));
    if ($billName !== "") $custName = $billName;
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
    $tableNo = trim((string) ($body["table_no"] ?? $body["tableNo"] ?? ""));
    if ($tableNo !== "") {
      if (strlen($tableNo) > 64) $tableNo = substr($tableNo, 0, 64);
      try {
        pos_q("UPDATE sales_orders SET table_no = ? WHERE id = ? AND business_id = ?", "sss", [$tableNo, $orderId, $bid]);
      } catch (Exception $e) { /* optional column */ }
    }
    $doctorRx = function_exists("pos_clip_invoice_text")
      ? pos_clip_invoice_text($body["doctor_rx"] ?? $body["doctorRx"] ?? "", 180)
      : trim((string) ($body["doctor_rx"] ?? ""));
    $custAddr = function_exists("pos_clip_invoice_text")
      ? pos_clip_invoice_text($body["customer_address"] ?? $body["customerAddress"] ?? "", 500)
      : trim((string) ($body["customer_address"] ?? ""));
    $custMobile = preg_replace("/\D+/", "", (string) ($body["customer_mobile"] ?? $body["customerMobile"] ?? ""));
    if (strlen($custMobile) > 15) $custMobile = substr($custMobile, 0, 15);
    try {
      pos_q(
        "UPDATE sales_orders SET doctor_rx = ?, customer_address = ?, customer_mobile = ? WHERE id = ? AND business_id = ?",
        "sssss",
        [$doctorRx !== "" ? $doctorRx : null, $custAddr !== "" ? $custAddr : null, $custMobile !== "" ? $custMobile : null, $orderId, $bid]
      );
    } catch (Exception $e) { /* optional pharmacy bill columns */ }
    $walkIn = (($customer["code"] ?? "") === "CUS-001") || preg_match("/^walk-?in$/i", trim((string) ($customer["name"] ?? "")));
    if (!$walkIn && ($custAddr !== "" || $doctorRx !== "")) {
      try {
        pos_q("UPDATE customers SET address = COALESCE(?, address), doctor_rx = COALESCE(?, doctor_rx) WHERE id = ? AND business_id = ?", "ssss", [
          $custAddr !== "" ? $custAddr : null,
          $doctorRx !== "" ? $doctorRx : null,
          $customer["id"],
          $bid,
        ]);
      } catch (Exception $e) {
        if ($custAddr !== "") {
          try {
            pos_q("UPDATE customers SET address = ? WHERE id = ? AND business_id = ?", "sss", [$custAddr, $customer["id"], $bid]);
          } catch (Exception $e2) { /* optional */ }
        }
      }
    }
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
      if (function_exists("pos_persist_sale_line_note")) pos_persist_sale_line_note($lineId, $line["notes"] ?? "");
      $firstBatch = null;
      $stockQty = function_exists("pos_pack_stock_qty") ? pos_pack_stock_qty($line["item"], $line["qty"]) : $line["qty"];
      if (function_exists("pos_allocate_batches")) {
        $allocs = pos_allocate_batches($bid, $line["item"]["id"], $stockQty, $line["barcode"] ?? "", $line["batchId"] ?? "");
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
        if (function_exists("pos_pharmacy_line_snapshot")) {
          $snap = pos_pharmacy_line_snapshot($line["item"], $firstBatch);
          try {
            pos_q(
              "UPDATE sales_order_lines SET batch_no = ?, expiry_date = ?, pack_label = ? WHERE id = ?",
              "ssss",
              [$snap["batch_no"], $snap["expiry_date"], $snap["pack_label"], $lineId]
            );
          } catch (Exception $e) { /* optional */ }
        }
      }
      pos_q("UPDATE items SET stock_gm = stock_gm - ? WHERE id = ? AND business_id = ?", "dss", [$stockQty, $line["item"]["id"], $bid]);
      if (function_exists("pos_consume_piece_barcode")) {
        pos_consume_piece_barcode($bid, $line["barcode"] ?? ($firstBatch["barcode"] ?? ""), "sold");
      }
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
    if (function_exists("pos_record_offer_redemptions")) {
      try {
        pos_record_offer_redemptions($bid, $body["offerIds"] ?? $body["offer_ids"] ?? [], $orderId, $customer["id"] ?? "", $billDiscount ?? 0, $total ?? $afterBill);
      } catch (Exception $e) { /* optional */ }
    } else {
      try {
        require_once __DIR__ . "/pos-offers.php";
        pos_record_offer_redemptions($bid, $body["offerIds"] ?? $body["offer_ids"] ?? [], $orderId, $customer["id"] ?? "", $billDiscount ?? 0, $total ?? $afterBill);
      } catch (Exception $e) { /* optional */ }
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
    if ($qrOrderId !== "") {
      pos_qr_link_sale($bid, $qrOrderId, $orderId, $branchId);
    }
    try {
      $paidRaw = $body["amountPaid"] ?? $body["amount_paid"] ?? null;
      $payRef = $body["paymentReference"] ?? $body["payment_reference"] ?? null;
      $payDate = $body["paymentDate"] ?? $body["payment_date"] ?? null;
      $snap = pos_settle_customer_invoice($customer, $total, $methodPay, $orderId, $orderNumber, $bid, $uid, $paidRaw, $payRef, $payDate);
      if (is_array($snap)) {
        $orderRow["previous_due"] = $snap["previousDue"] ?? 0;
        $orderRow["amount_paid"] = $snap["amountPaid"] ?? 0;
        $orderRow["current_due"] = $snap["currentDue"] ?? 0;
        $orderRow["payment_status"] = $snap["paymentStatus"] ?? $orderRow["payment_status"];
        $orderRow["payment_reference"] = $snap["paymentReference"] ?? null;
        $orderRow["payment_date"] = $snap["paymentDate"] ?? null;
        $orderRow["receipt"] = $snap["receipt"] ?? null;
        $orderRow["customer_outstanding"] = $customer["outstanding"] ?? $snap["currentDue"] ?? 0;
        $orderRow["payments"] = function_exists("pos_list_customer_receipts")
          ? pos_list_customer_receipts($bid, [$customer["id"] ?? ""])
          : [];
      }
    } catch (Throwable $e) {
      if (stripos($e->getMessage(), "Credit limit") !== false) throw $e;
    }
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
