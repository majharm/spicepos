<?php
function pos_round2($n) {
  return round((float) $n, 2);
}

function pos_php_till_dispatch($path, $method, $body) {
  $head = explode("/", $path)[0];
  $staff = [
    "bootstrap", "dashboard", "today", "suppliers", "items", "customers", "packs",
    "orders", "purchases", "stock", "staff", "branches", "devices", "holds",
    "checkout", "settings", "reports", "audit",
  ];
  if (!in_array($head, $staff, true)) return;
  $auth = pos_staff_session();
  if (!$auth || ($auth["type"] ?? "") !== "staff") pos_send(401, ["error" => "Sign in required"]);
  $bid = $auth["user"]["business_id"];
  $branchId = $auth["branchId"] ?? $auth["user"]["branch_id"] ?? null;
  $uid = $auth["user"]["id"];
  pos_apply_business_timezone($bid);

  if ($path === "bootstrap" && $method === "GET") {
    $co = [];
    try {
      $co = pos_q("SELECT * FROM company_settings WHERE business_id = ? LIMIT 1", "s", [$bid]);
    } catch (Exception $e) { /* optional */ }
    $biz = pos_q("SELECT * FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
    $business = $biz[0] ?? null;
    $items = [];
    $customers = [];
    $packs = [];
    try {
      $items = pos_q("SELECT * FROM items WHERE business_id = ? ORDER BY category, subcategory, name", "s", [$bid]);
    } catch (Exception $e) { /* optional */ }
    try {
      $customers = pos_q("SELECT * FROM customers WHERE business_id = ? ORDER BY name", "s", [$bid]);
    } catch (Exception $e) { /* optional */ }
    try {
      $packs = pos_q("SELECT * FROM packs WHERE business_id = ? ORDER BY name", "s", [$bid]);
    } catch (Exception $e) {
      $packs = [];
    }
    $packItems = [];
    if ($packs) {
      $ids = array_column($packs, "id");
      $ph = implode(",", array_fill(0, count($ids), "?"));
      $types = str_repeat("s", count($ids));
      $packItems = pos_q(
        "SELECT pi.*, i.name AS spice_name, i.local_name, i.code AS item_code
         FROM pack_items pi JOIN items i ON i.id = pi.item_id
         WHERE pi.pack_id IN ($ph) ORDER BY pi.sort_order",
        $types,
        $ids
      );
    }
    $plan = null;
    if (!empty($business["plan_id"])) {
      $pr = pos_q(
        "SELECT id, code, name, fee_monthly, max_branches, max_users, max_devices FROM subscription_plans WHERE id = ? LIMIT 1",
        "s",
        [$business["plan_id"]]
      );
      $plan = $pr[0] ?? null;
    }
    $outPacks = [];
    foreach ($packs as $p) {
      $p["items"] = [];
      foreach ($packItems as $row) {
        if ($row["pack_id"] === $p["id"]) $p["items"][] = $row;
      }
      $outPacks[] = $p;
    }
    $coRow = $co[0] ?? ["name" => $business["name"] ?? "POS"];
    $tzMeta = pos_company_timezone($coRow);
    $coRow["timezone"] = $tzMeta["timezone"];
    $coRow["tz_offset"] = $tzMeta["tz_offset"];
    $notes = [];
    try {
      $notes = pos_q(
        "SELECT id, title, body, created_at FROM notifications WHERE business_id IS NULL OR business_id = ? ORDER BY created_at DESC LIMIT 8",
        "s",
        [$bid]
      );
    } catch (Exception $e) { /* optional */ }
    pos_send(200, [
      "company" => $coRow,
      "business" => $business,
      "plan" => $plan,
      "support" => pos_platform_settings(),
      "notes" => $notes,
      "items" => $items,
      "customers" => $customers,
      "packs" => $outPacks,
      "php" => true,
    ]);
  }

  if ($path === "dashboard" && $method === "GET") {
    $sales = pos_q(
      "SELECT COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings, COALESCE(SUM(gst),0) AS gst
       FROM sales_orders WHERE business_id = ? AND DATE(created_at)=CURDATE()",
      "s",
      [$bid]
    );
    $purchase = pos_q(
      "SELECT COALESCE(SUM(total),0) AS total FROM purchases WHERE business_id = ? AND purchase_date = CURDATE()",
      "s",
      [$bid]
    );
    $stock = pos_q(
      "SELECT COALESCE(SUM(stock_gm/1000 * purchase_rate),0) AS value FROM items WHERE business_id = ?",
      "s",
      [$bid]
    );
    $out = pos_q("SELECT COALESCE(SUM(outstanding),0) AS outstanding FROM customers WHERE business_id = ?", "s", [$bid]);
    $branches = pos_q("SELECT * FROM branches WHERE business_id = ? ORDER BY name", "s", [$bid]);
    $notes = pos_q(
      "SELECT * FROM notifications WHERE business_id IS NULL OR business_id = ? ORDER BY created_at DESC LIMIT 8",
      "s",
      [$bid]
    );
    pos_send(200, [
      "today" => $sales[0] ?? ["bills" => 0, "takings" => 0, "gst" => 0],
      "purchase" => $purchase[0]["total"] ?? 0,
      "stockValue" => $stock[0]["value"] ?? 0,
      "outstanding" => $out[0]["outstanding"] ?? 0,
      "branches" => $branches,
      "notes" => $notes,
      "user" => ["name" => $auth["user"]["email"], "role" => $auth["user"]["role"], "permissions" => pos_parse_perms($auth["user"])],
    ]);
  }

  if ($path === "today" && $method === "GET") {
    $today = pos_q(
      "SELECT COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings, COALESCE(SUM(gst),0) AS gst
       FROM sales_orders WHERE business_id = ? AND DATE(created_at) = CURDATE()",
      "s",
      [$bid]
    );
    pos_send(200, ["today" => $today[0] ?? ["bills" => 0, "takings" => 0, "gst" => 0]]);
  }

  if ($path === "settings" && $method === "POST") {
    $name = trim((string) ($body["name"] ?? ""));
    if ($name === "") pos_send(400, ["error" => "Shop name is required"]);
    $tz = pos_normalize_timezone($body["timezone"] ?? "");
    $tzOff = pos_tz_offset_for($tz);
    $address = $body["address"] ?? null;
    $phone = $body["phone"] ?? null;
    $email = $body["email"] ?? null;
    $gstin = $body["gstin"] ?? null;
    $logoSql = "";
    $params = [$name, $address, $phone, $email, $gstin, $tz, $tzOff];
    $types = "sssssss";
    if (array_key_exists("logo_url", $body)) {
      $logo = (string) ($body["logo_url"] ?? "");
      if ($logo !== "" && strpos($logo, "data:image/") !== 0) pos_send(400, ["error" => "Logo must be an uploaded image"]);
      if (strlen($logo) > 6000000) pos_send(400, ["error" => "Logo is too large"]);
      $logoSql = ", logo_url = ?";
      $params[] = $logo !== "" ? $logo : null;
      $types .= "s";
    }
    $params[] = $bid;
    $types .= "s";
    pos_q(
      "UPDATE company_settings SET name = ?, address = ?, phone = ?, email = ?, gstin = ?, timezone = ?, tz_offset = ?{$logoSql} WHERE business_id = ?",
      $types,
      $params
    );
    pos_q(
      "UPDATE businesses SET name = ?, address = COALESCE(?, address), mobile = COALESCE(?, mobile),
         email = COALESCE(?, email), gstin = COALESCE(?, gstin) WHERE id = ?",
      "ssssss",
      [$name, $address, $phone, $email, $gstin, $bid]
    );
    $rows = pos_q("SELECT * FROM company_settings WHERE business_id = ? LIMIT 1", "s", [$bid]);
    $co = $rows[0] ?? ["name" => $name];
    $meta = pos_company_timezone($co);
    $co["timezone"] = $meta["timezone"];
    $co["tz_offset"] = $meta["tz_offset"];
    pos_apply_business_timezone($bid);
    pos_send(200, ["ok" => true, "company" => $co]);
  }

  if ($path === "suppliers" && $method === "GET") {
    pos_send(200, pos_q("SELECT * FROM suppliers WHERE business_id = ? ORDER BY name", "s", [$bid]));
  }

  if ($path === "stock" && $method === "GET") {
    pos_send(200, pos_q("SELECT * FROM items WHERE business_id = ? ORDER BY name", "s", [$bid]));
  }

  if ($path === "staff" && $method === "GET") {
    pos_send(200, pos_q(
      "SELECT id, email, first_name, last_name, role, status, username, mobile FROM staff_users WHERE business_id = ? ORDER BY email",
      "s",
      [$bid]
    ));
  }

  if ($path === "branches" && $method === "GET") {
    pos_send(200, pos_q("SELECT * FROM branches WHERE business_id = ? ORDER BY name", "s", [$bid]));
  }

  if ($path === "devices" && $method === "GET") {
    pos_send(200, pos_q(
      "SELECT d.*, br.name AS branch_name FROM pos_devices d
       LEFT JOIN branches br ON br.id = d.branch_id
       WHERE d.business_id = ? ORDER BY d.code",
      "s",
      [$bid]
    ));
  }

  if ($path === "orders" && $method === "GET") {
    $orders = pos_q("SELECT * FROM sales_orders WHERE business_id = ? ORDER BY created_at DESC LIMIT 80", "s", [$bid]);
    $ids = array_column($orders, "id");
    $lines = [];
    if ($ids) {
      $ph = implode(",", array_fill(0, count($ids), "?"));
      $lines = pos_q("SELECT * FROM sales_order_lines WHERE order_id IN ($ph) ORDER BY created_at", str_repeat("s", count($ids)), $ids);
    }
    foreach ($orders as &$o) {
      $o["lines"] = [];
      foreach ($lines as $l) {
        if ($l["order_id"] === $o["id"]) $o["lines"][] = $l;
      }
    }
    pos_send(200, $orders);
  }

  if ($path === "purchases" && $method === "GET") {
    pos_send(200, pos_q("SELECT * FROM purchases WHERE business_id = ? ORDER BY purchase_date DESC, created_at DESC LIMIT 80", "s", [$bid]));
  }

  if ($path === "holds" && $method === "GET") {
    try {
      pos_send(200, pos_q("SELECT * FROM held_bills WHERE business_id = ? ORDER BY created_at DESC LIMIT 50", "s", [$bid]));
    } catch (Exception $e) {
      pos_send(200, []);
    }
  }

  if ($path === "audit" && $method === "GET") {
    pos_send(200, pos_q("SELECT * FROM staff_audit_logs WHERE business_id = ? ORDER BY created_at DESC LIMIT 100", "s", [$bid]));
  }

  if ($path === "reports" && $method === "GET") {
    $from = $_GET["from"] ?? date("Y-m-d");
    $to = $_GET["to"] ?? $from;
    $sum = pos_q(
      "SELECT COUNT(*) AS bills, COALESCE(SUM(subtotal),0) AS taxable, COALESCE(SUM(gst),0) AS gst, COALESCE(SUM(total),0) AS total
       FROM sales_orders WHERE business_id = ? AND DATE(created_at) BETWEEN ? AND ?",
      "sss",
      [$bid, $from, $to]
    );
    pos_send(200, ["from" => $from, "to" => $to, "summary" => $sum[0] ?? ["bills" => 0, "taxable" => 0, "gst" => 0, "total" => 0], "php" => true]);
  }

  if ($path === "checkout" && $method === "POST") {
    $lines = $body["lines"] ?? [];
    if (!is_array($lines) || !$lines) pos_send(400, ["error" => "Cart is empty"]);
    $methodPay = strtolower((string) ($body["paymentMethod"] ?? "cash"));
    if (!in_array($methodPay, ["cash", "upi", "card", "credit"], true)) pos_send(400, ["error" => "Invalid payment method"]);
    $customerId = $body["customerId"] ?? "";
    $cust = pos_q("SELECT * FROM customers WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$customerId, $bid]);
    $customer = $cust[0] ?? null;
    if (!$customer) pos_send(400, ["error" => "Customer not found"]);
    $built = [];
    foreach ($lines as $line) {
      $it = pos_q("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$line["itemId"] ?? "", $bid]);
      $item = $it[0] ?? null;
      if (!$item) pos_send(400, ["error" => "Unknown item"]);
      $qty = (float) ($line["quantity_gm"] ?? 0);
      if ($qty <= 0) pos_send(400, ["error" => "Invalid quantity"]);
      $rate = (($customer["type"] ?? "") === "b2b") ? (float) $item["b2b_rate"] : (float) $item["retail_rate"];
      $amount = pos_round2(($qty / 1000) * $rate);
      $built[] = ["item" => $item, "qty" => $qty, "rate" => $rate, "amount" => $amount, "gstRate" => (float) ($item["gst_rate"] ?? 0)];
    }
    $subtotal = pos_round2(array_sum(array_column($built, "amount")));
    $billDiscount = pos_round2((float) ($body["discount"] ?? 0));
    $gst = 0;
    foreach ($built as $l) $gst += ($l["amount"] * $l["gstRate"]) / 100;
    $gst = pos_round2($gst);
    $total = pos_round2(max(0, $subtotal + $gst - $billDiscount));
    $totalGm = array_sum(array_column($built, "qty"));
    $seq = pos_q("SELECT next_value FROM number_sequences WHERE name = 'order' AND business_id = ? LIMIT 1", "s", [$bid]);
    $next = $seq ? (int) $seq[0]["next_value"] : 10001;
    if ($seq) pos_q("UPDATE number_sequences SET next_value = ? WHERE name = 'order' AND business_id = ?", "is", [$next + 1, $bid]);
    else {
      try {
        pos_q("INSERT INTO number_sequences (name, next_value, business_id) VALUES ('order', ?, ?)", "is", [$next + 1, $bid]);
      } catch (Exception $e) { /* ignore */ }
    }
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
        $orderId, $orderNumber, $customer["id"], $custName, (string) $customer["type"],
        (string) $packId, (string) $packName, (string) ($body["packCount"] ?? ""), "confirmed", (string) $totalGm,
        (string) $subtotal, (string) $billDiscount, (string) $gst, (string) $total, $methodPay, $payStatus, $bid,
        (string) $branchId, (string) $uid,
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
    $row = $orders[0] ?? null;
    if (!$row) {
      $row = [
        "id" => $orderId,
        "order_number" => $orderNumber,
        "customer_id" => $customer["id"],
        "customer_name" => $custName,
        "customer_type" => (string) $customer["type"],
        "pack_id" => $packId,
        "pack_name" => $packName,
        "pack_count" => $body["packCount"] ?? null,
        "status" => "confirmed",
        "total_quantity_gm" => $totalGm,
        "subtotal" => $subtotal,
        "discount" => $billDiscount,
        "gst" => $gst,
        "total" => $total,
        "payment_method" => $methodPay,
        "payment_status" => $payStatus,
        "business_id" => $bid,
      ];
    }
    $row["lines"] = $orderLines;
    pos_staff_audit($auth["user"], "Sale Created", [
      "module" => "sales",
      "target_id" => $orderId,
      "target_name" => $orderNumber,
      "total" => $total,
      "payment_method" => $methodPay,
      "customer_name" => $custName,
    ], $bid, $branchId);
    pos_send(200, ["ok" => true, "order" => $row]);
  }
}
