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
    pos_reverse_credit_sale($bid, $existing);
    pos_recompute_customer_outstanding($bid, $existing["customer_id"] ?? "");
  } elseif ($oldStatus === "cancelled" && $newStatus !== "cancelled") {
    $allLines = $existing["lines"] ?? [];
    pos_deduct_order_stock($bid, $allLines);
    foreach ($allLines as $l) {
      pos_q("UPDATE sales_order_lines SET cancelled = 0 WHERE id = ?", "s", [$l["id"]]);
    }
    $cust = pos_q("SELECT * FROM customers WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$existing["customer_id"] ?? "", $bid]);
    if ($cust && function_exists("pos_settle_customer_invoice")) {
      pos_settle_customer_invoice(
        $cust[0],
        $existing["total"] ?? 0,
        $existing["payment_method"] ?? "cash",
        $orderId,
        $existing["order_number"] ?? "",
        $bid,
        $auth["user"]["id"] ?? null,
        $existing["amount_paid"] ?? null,
        $existing["payment_reference"] ?? null,
        $existing["payment_date"] ?? null
      );
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
      $built[] = pos_compute_sale_line($item, $qty, $customer, $line, $auth["user"] ?? null);
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
  $extraCharges = pos_round2(max(0, (float) ($body["extraCharges"] ?? $body["extra_charges"] ?? 0)));
  $total = pos_round2(max(0, $subtotal + $gst - $billDiscount + $extraCharges));
  $totalGm = array_sum(array_column($built, "qty"));
  $methodPay = pos_pay_normalize($body["paymentMethod"] ?? $existing["payment_method"] ?? "cash");
  if (!pos_pay_is_sale($methodPay)) {
    pos_send(400, ["error" => "Invalid payment method", "php" => true]);
  }
  $payStatus = $methodPay === "credit" ? "unpaid" : "paid";
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

  try {
    pos_q("UPDATE sales_orders SET extra_charges = ? WHERE id = ? AND business_id = ?", "sss", [(string) $extraCharges, $orderId, $bid]);
  } catch (Exception $e) { /* optional */ }

  if ($newStatus !== "cancelled") {
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
      if (function_exists("pos_persist_print_sale_line")) pos_persist_print_sale_line($lineId, $line, $bid);
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

function pos_delete_order($bid, $orderId, $auth) {
  pos_require_business_admin_delete($auth["user"] ?? [], "invoices");
  if (is_file(__DIR__ . "/pos-accounting.php")) require_once __DIR__ . "/pos-accounting.php";
  if (is_file(__DIR__ . "/pos-advanced.php")) require_once __DIR__ . "/pos-advanced.php";

  $existing = pos_order_with_lines($bid, $orderId);
  if (!$existing) pos_send(404, ["error" => "Order not found", "php" => true]);

  try {
    $returns = pos_q(
      "SELECT id FROM sales_returns WHERE order_id = ? AND business_id = ? AND status <> 'cancelled' LIMIT 1",
      "ss",
      [$orderId, $bid]
    );
    if ($returns) pos_send(400, ["error" => "Cannot delete invoice with returns. Remove those returns first.", "php" => true]);
  } catch (Exception $e) {
    if (stripos($e->getMessage(), "sales_returns") === false && stripos($e->getMessage(), "Unknown table") === false) {
      pos_send(400, ["error" => $e->getMessage(), "php" => true]);
    }
  }

  try {
    pos_with_transaction(function () use ($bid, $orderId, $existing) {
      $oldStatus = strtolower((string) ($existing["status"] ?? "confirmed"));
      $lines = $existing["lines"] ?? [];
      if ($oldStatus !== "cancelled") {
        pos_restore_order_stock($bid, $lines);
      }
      pos_reverse_credit_sale($bid, $existing);
      if (function_exists("pos_delete_journal_ref")) {
        pos_delete_journal_ref($bid, "sales_order", $orderId);
      }
      if (function_exists("pos_loyalty_reverse_sale")) {
        pos_loyalty_reverse_sale($bid, $orderId);
      }
      try {
        pos_q("UPDATE qr_orders SET sales_order_id = NULL WHERE sales_order_id = ? AND business_id = ?", "ss", [$orderId, $bid]);
      } catch (Exception $e) { /* optional */ }
      pos_q("DELETE FROM sales_order_lines WHERE order_id = ?", "s", [$orderId]);
      pos_q("DELETE FROM sales_orders WHERE id = ? AND business_id = ?", "ss", [$orderId, $bid]);
      pos_recompute_customer_outstanding($bid, $existing["customer_id"] ?? "");
    });
  } catch (Exception $e) {
    pos_send(400, ["error" => $e->getMessage(), "php" => true]);
  }

  pos_staff_audit($auth["user"], "Sale Deleted", [
    "module" => "sales",
    "target_id" => $orderId,
    "target_name" => $existing["order_number"] ?? $orderId,
    "total" => $existing["total"] ?? 0,
  ], $bid, $auth["branchId"] ?? $auth["user"]["branch_id"] ?? null);
  pos_send(200, ["ok" => true, "deleted" => true, "order" => $existing, "php" => true]);
}

function pos_collect_order_payment($bid, $orderId, $body, $auth) {
  if (is_file(__DIR__ . "/pos-idempotency.php")) require_once __DIR__ . "/pos-idempotency.php";
  require_once __DIR__ . "/pos-accounting.php";
  $key = function_exists("pos_clip_idempotency_key")
    ? pos_clip_idempotency_key($body["idempotencyKey"] ?? $body["idempotency_key"] ?? "")
    : "";
  if ($key !== "" && function_exists("pos_find_idempotent")) {
    $prior = pos_find_idempotent($bid, $key);
    $replay = function_exists("pos_idempotent_payload") ? pos_idempotent_payload($prior) : null;
    if (is_array($replay)) pos_send(200, array_merge($replay, ["replay" => true, "php" => true]));
  }
  $order = pos_order_with_lines($bid, $orderId);
  if (!$order) pos_send(404, ["error" => "Order not found", "php" => true]);
  if (strtolower((string) ($order["status"] ?? "")) === "cancelled") {
    pos_send(400, ["error" => "Cancelled bills cannot take payments", "php" => true]);
  }
  $cust = pos_q("SELECT * FROM customers WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$order["customer_id"], $bid]);
  $customer = $cust[0] ?? null;
  if (!$customer) pos_send(400, ["error" => "Customer not found", "php" => true]);
  $amount = pos_round2($body["amount"] ?? $body["amountPaid"] ?? $body["amount_paid"] ?? 0);
  $total = pos_round2($order["total"] ?? 0);
  $already = pos_round2($order["amount_paid"] ?? 0);
  $due = pos_round2(max(0, $total - $already));
  if ($amount <= 0) pos_send(400, ["error" => "Enter a payment amount", "php" => true]);
  if ($amount > $due + 0.004) pos_send(400, ["error" => "Amount exceeds outstanding (₹" . number_format($due, 2) . ")", "php" => true]);
  $method = pos_pay_normalize($body["payment_method"] ?? $body["paymentMethod"] ?? "cash");
  if (!pos_pay_is_money($method)) $method = "cash";
  $uid = $auth["user"]["id"] ?? null;
  $out = pos_with_transaction(function () use ($bid, $order, $customer, $amount, $method, $body, $already, $total, $uid, $key) {
    $previousDue = pos_round2($customer["outstanding"] ?? 0);
    $nextOut = pos_round2(max(0, $previousDue - $amount));
    pos_q("UPDATE customers SET outstanding = ? WHERE id = ? AND business_id = ?", "dss", [$nextOut, $customer["id"], $bid]);
    $rn = pos_next_seq("receipt", $bid, 1);
    $entryNo = pos_format_payment_receipt_no($rn);
    $ledgerId = pos_insert_ledger([
      "entry_no" => $entryNo,
      "entry_type" => "receipt",
      "party_type" => "customer",
      "party_id" => $customer["id"],
      "party_name" => pos_customer_label($customer),
      "amount" => $amount,
      "payment_method" => $method,
      "reference_type" => "sales_order",
      "reference_id" => $order["id"],
      "notes" => $order["order_number"],
    ], $bid, $uid);
    pos_stamp_ledger_due($ledgerId, [
      "payment_reference" => $body["payment_reference"] ?? $body["paymentReference"] ?? null,
      "invoice_no" => $order["order_number"],
      "invoice_amount" => $total,
      "previous_due" => $previousDue,
      "remaining_due" => $nextOut,
    ], $bid);
    pos_apply_invoice_paid_delta($order["id"], $amount, $bid);
    $amountPaid = pos_round2($already + $amount);
    $payStatus = $amountPaid + 0.0001 < $total ? "partial" : "paid";
    $currentDue = pos_round2(max(0, pos_round2($order["previous_due"] ?? 0) + $total - $amountPaid));
    if (function_exists("pos_persist_invoice_settlement")) {
      pos_persist_invoice_settlement($order["id"], [
        "previousDue" => $order["previous_due"] ?? 0,
        "amountPaid" => $amountPaid,
        "currentDue" => $currentDue,
        "paymentStatus" => $payStatus,
        "paymentReference" => $body["payment_reference"] ?? $body["paymentReference"] ?? $order["payment_reference"] ?? null,
        "paymentDate" => $body["payment_date"] ?? $body["paymentDate"] ?? $order["payment_date"] ?? null,
      ], $bid);
    } else {
      pos_q(
        "UPDATE sales_orders SET amount_paid = ?, current_due = ?, payment_status = ? WHERE id = ? AND business_id = ?",
        "ddsss",
        [(string) $amountPaid, (string) $currentDue, $payStatus, $order["id"], $bid]
      );
    }
    $fresh = pos_order_with_lines($bid, $order["id"]);
    $payload = ["ok" => true, "order" => $fresh, "receipt" => ["entryNo" => $entryNo, "ledgerId" => $ledgerId, "amount" => $amount], "remaining" => pos_round2(max(0, $total - $amountPaid)), "php" => true];
    if ($key !== "" && function_exists("pos_save_idempotent")) pos_save_idempotent($bid, $key, "receipt", $ledgerId, $payload);
    return $payload;
  });
  pos_send(200, $out);
}

function pos_dispatch_order_route($path, $method, $body, $bid, $auth) {
  if (preg_match('#^orders/([^/]+)/payments$#', $path, $pm) && $method === "POST") {
    pos_collect_order_payment($bid, $pm[1], $body, $auth);
    return true;
  }
  if (!preg_match('#^orders/([^/]+)$#', $path, $m)) return false;
  $orderId = $m[1];
  if ($method === "PUT") pos_update_order($bid, $orderId, $body, $auth);
  if ($method === "PATCH") pos_patch_order($bid, $orderId, $body, $auth);
  if ($method === "DELETE") pos_delete_order($bid, $orderId, $auth);
  pos_send(405, ["error" => "Method not allowed", "path" => $path, "method" => $method, "php" => true]);
  return true;
}
