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
  @$db->query("ALTER TABLE qr_orders ADD COLUMN discount DECIMAL(12,2) NOT NULL DEFAULT 0");
  @$db->query("ALTER TABLE qr_orders ADD COLUMN offer_label VARCHAR(255) NULL");
  @$db->query("ALTER TABLE qr_orders ADD COLUMN sales_order_id VARCHAR(255) NULL");
  @$db->query("ALTER TABLE sales_orders ADD COLUMN qr_order_id VARCHAR(255) NULL");
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
  pos_qr_ensure_schema();
  $sql = "SELECT q.*, s.order_number AS invoice_number FROM qr_orders q
          LEFT JOIN sales_orders s ON s.id = q.sales_order_id AND s.business_id = q.business_id
          WHERE q.business_id = ?";
  $types = "s";
  $params = [$bid];
  if ($status !== "" && in_array($status, pos_qr_statuses(), true)) {
    $sql .= " AND q.status = ?";
    $types .= "s";
    $params[] = $status;
  }
  $sql .= " ORDER BY CASE q.status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 WHEN 'preparing' THEN 2
            WHEN 'ready' THEN 3 ELSE 4 END, q.created_at DESC LIMIT 100";
  $orders = pos_q($sql, $types, $params);
  foreach ($orders as &$order) {
    $order["lines"] = pos_q("SELECT * FROM qr_order_lines WHERE order_id = ? ORDER BY created_at", "s", [$order["id"]]);
  }
  unset($order);
  return $orders;
}

function pos_qr_mobile_digits($raw) {
  return substr(preg_replace('/\D/', '', (string) $raw), -10);
}

function pos_qr_pay_method($raw) {
  $method = strtolower((string) $raw);
  return in_array($method, ["cash", "upi", "card", "credit"], true) ? $method : "cash";
}

function pos_qr_find_or_create_customer($bid, $order) {
  $digits = pos_qr_mobile_digits($order["mobile"] ?? "");
  $all = pos_q("SELECT * FROM customers WHERE business_id = ?", "s", [$bid]);
  foreach ($all as $row) {
    if ($digits !== "" && strlen($digits) >= 10 && pos_qr_mobile_digits($row["mobile"] ?? "") === $digits) return $row;
  }
  $id = pos_uuid();
  $n = pos_next_seq("customer", $bid, 4);
  $code = "CUS-" . str_pad((string) $n, 3, "0", STR_PAD_LEFT);
  $name = substr(trim((string) ($order["customer_name"] ?? "Customer")), 0, 160);
  $mobile = substr(trim((string) ($order["mobile"] ?? "")), 0, 32);
  pos_q(
    "INSERT INTO customers (id, code, name, business_name, mobile, type, gstin, state, credit_limit, outstanding, business_id)
     VALUES (?,?,?,?,?,?,?,?,?,0,?)",
    "ssssssssds",
    [$id, $code, $name, null, $mobile, "b2c", null, null, 0, $bid]
  );
  $rows = pos_q("SELECT * FROM customers WHERE id = ? LIMIT 1", "s", [$id]);
  return $rows[0];
}

function pos_qr_link_sale($bid, $qrOrderId, $saleId, $branchId = "") {
  $qrOrderId = trim((string) $qrOrderId);
  if ($qrOrderId === "" || !$saleId) return;
  pos_qr_ensure_schema();
  pos_ensure_sales_schema();
  $rows = pos_q("SELECT id, sales_order_id FROM qr_orders WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$qrOrderId, $bid]);
  $qr = $rows[0] ?? null;
  if (!$qr) throw new Exception("QR order not found");
  if (!empty($qr["sales_order_id"]) && $qr["sales_order_id"] !== $saleId) throw new Exception("This QR order is already invoiced");
  pos_q(
    "UPDATE qr_orders SET status = 'completed', sales_order_id = ?, branch_id = COALESCE(branch_id, ?) WHERE id = ? AND business_id = ?",
    "ssss",
    [$saleId, $branchId, $qrOrderId, $bid]
  );
  try {
    pos_q("UPDATE sales_orders SET qr_order_id = ? WHERE id = ? AND business_id = ?", "sss", [$qrOrderId, $saleId, $bid]);
  } catch (Exception $e) { /* optional */ }
}

function pos_qr_load_sale($bid, $saleId) {
  $orders = pos_q("SELECT * FROM sales_orders WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$saleId, $bid]);
  if (!$orders) return null;
  $order = $orders[0];
  $order["lines"] = pos_q("SELECT * FROM sales_order_lines WHERE order_id = ?", "s", [$saleId]);
  return $order;
}

function pos_qr_ensure_invoice($bid, $branchId, $uid, $qrOrderId, $paymentMethod = "cash") {
  pos_qr_ensure_schema();
  pos_ensure_sales_schema();
  return pos_with_transaction(function () use ($bid, $branchId, $uid, $qrOrderId, $paymentMethod) {
    $rows = pos_q("SELECT * FROM qr_orders WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$qrOrderId, $bid]);
    $order = $rows[0] ?? null;
    if (!$order) throw new Exception("QR order not found");
    if (($order["status"] ?? "") === "cancelled") throw new Exception("Cancelled QR orders cannot be invoiced");
    if (!empty($order["sales_order_id"])) {
      $existing = pos_qr_load_sale($bid, $order["sales_order_id"]);
      if ($existing) return $existing;
    }
    $qrLines = pos_q("SELECT * FROM qr_order_lines WHERE order_id = ? ORDER BY created_at", "s", [$qrOrderId]);
    if (!$qrLines) throw new Exception("This QR order has no items");
    $customer = pos_qr_find_or_create_customer($bid, $order);
    $methodPay = pos_qr_pay_method($paymentMethod);
    $payStatus = $methodPay === "credit" ? "partial" : "paid";
    $discount = pos_round2($order["discount"] ?? 0);
    $subtotal = pos_round2(pos_round2($order["subtotal"] ?? 0) + $discount);
    $gst = pos_round2($order["gst"] ?? 0);
    $total = pos_round2($order["total"] ?? 0);
    $totalGm = 0;
    foreach ($qrLines as $line) $totalGm += (float) ($line["quantity_gm"] ?? 0);
    $next = pos_next_seq("order", $bid, 10001);
    $orderNumber = "SO-" . $next;
    $orderId = pos_uuid();
    $custName = function_exists("pos_customer_label") ? pos_customer_label($customer) : ($customer["name"] ?? $order["customer_name"]);
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
        null, null, null, "confirmed", (string) $totalGm,
        (string) $subtotal, (string) $discount, (string) $gst, (string) $total, $methodPay, $payStatus, $bid,
        $branchId ? (string) $branchId : null, $uid ? (string) $uid : null,
      ]
    );
    try {
      pos_q(
        "UPDATE sales_orders SET qr_order_id = ?, discount_type = ?, discount_value = ? WHERE id = ? AND business_id = ?",
        "sssss",
        [$qrOrderId, "amt", (string) $discount, $orderId, $bid]
      );
    } catch (Exception $e) {
      try {
        pos_q("UPDATE sales_orders SET qr_order_id = ? WHERE id = ? AND business_id = ?", "sss", [$qrOrderId, $orderId, $bid]);
      } catch (Exception $e2) { /* optional */ }
    }
    if (is_file(__DIR__ . "/pos-advanced.php")) require_once __DIR__ . "/pos-advanced.php";
    if (is_file(__DIR__ . "/pos-accounting.php")) require_once __DIR__ . "/pos-accounting.php";
    foreach ($qrLines as $line) {
      $it = pos_q("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$line["item_id"], $bid]);
      $item = $it[0] ?? null;
      if (!$item) throw new Exception("One selected item is no longer available");
      $qty = (float) ($line["quantity_gm"] ?? 0);
      if ($qty <= 0) throw new Exception("Invalid quantity");
      if ($qty > (float) ($item["stock_gm"] ?? 0)) throw new Exception($item["name"] . " does not have enough stock");
      $lineId = pos_uuid();
      $lineDisc = (string) ($line["discount"] ?? 0);
      pos_q(
        "INSERT INTO sales_order_lines (
           id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
           discount, amount, gst_rate, cancelled, business_id
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        "sssssssssss",
        [
          $lineId, $orderId, $item["id"], $line["item_name"] ?: ($item["name"] ?? "Item"), (string) $qty, (string) ($line["rate_per_kg"] ?? 0),
          $lineDisc, (string) ($line["amount"] ?? 0), (string) ($line["gst_rate"] ?? 0), "0", $bid,
        ]
      );
      if (function_exists("pos_allocate_batches")) {
        $allocs = pos_allocate_batches($bid, $item["id"], $qty, "", "");
        foreach ($allocs as $al) {
          if (function_exists("pos_write_stock_movement")) {
            pos_write_stock_movement($bid, $branchId, $uid, $item["id"], "sale", -((float) $al["qty"]), $orderNumber, [
              "barcode" => $al["batch"]["barcode"] ?? null, "batch_id" => $al["batch"]["id"] ?? null,
              "unit_cost" => $al["batch"]["unit_cost"] ?? 0, "ref_type" => "sale", "ref_id" => $orderId,
            ]);
          }
        }
      }
      pos_q("UPDATE items SET stock_gm = stock_gm - ? WHERE id = ? AND business_id = ?", "dss", [$qty, $item["id"], $bid]);
    }
    $sale = pos_qr_load_sale($bid, $orderId);
    try {
      if (function_exists("pos_record_credit_sale")) pos_record_credit_sale($customer, $total, $orderId, $orderNumber, $methodPay, $bid, $uid);
    } catch (Throwable $e) { /* optional */ }
    try {
      if (function_exists("pos_post_sale_journal")) pos_post_sale_journal($bid, $uid, $sale);
    } catch (Throwable $e) { /* optional */ }
    pos_q(
      "UPDATE qr_orders SET status = 'completed', sales_order_id = ?, branch_id = COALESCE(branch_id, ?) WHERE id = ? AND business_id = ?",
      "ssss",
      [$orderId, $branchId, $qrOrderId, $bid]
    );
    return $sale;
  });
}

function pos_qr_pack_menu_id($packId) {
  return "pack:" . (string) $packId;
}

function pos_qr_parse_pack_id($id) {
  $raw = (string) $id;
  return str_starts_with($raw, "pack:") ? substr($raw, 5) : "";
}

function pos_qr_load_packs($bid) {
  try {
    $packs = pos_q(
      "SELECT * FROM packs WHERE business_id = ? AND (status = 'active' OR status IS NULL OR status = '') ORDER BY name",
      "s",
      [$bid]
    );
  } catch (Throwable $e) {
    return [];
  }
  if (!$packs) return [];
  $ids = array_column($packs, "id");
  $ph = implode(",", array_fill(0, count($ids), "?"));
  try {
    $rows = pos_q(
      "SELECT pi.*, i.name AS spice_name, i.local_name, i.code AS item_code
       FROM pack_items pi JOIN items i ON i.id = pi.item_id
       WHERE pi.pack_id IN ($ph) ORDER BY pi.sort_order",
      str_repeat("s", count($ids)),
      $ids
    );
  } catch (Throwable $e) {
    return [];
  }
  $out = [];
  foreach ($packs as $pack) {
    $pack["items"] = [];
    foreach ($rows as $row) {
      if (($row["pack_id"] ?? "") === $pack["id"]) $pack["items"][] = $row;
    }
    $out[] = $pack;
  }
  return $out;
}

function pos_qr_pack_available($rows, $byId) {
  $max = PHP_INT_MAX;
  foreach ($rows as $row) {
    $item = $byId[$row["item_id"] ?? ""] ?? null;
    $need = (float) ($row["quantity_gm"] ?? 0);
    if (!$item || $need <= 0) return 0;
    if (($item["status"] ?? "active") !== "active") return 0;
    $max = min($max, (int) floor(((float) ($item["stock_gm"] ?? 0)) / $need));
  }
  return $max === PHP_INT_MAX ? 0 : max(0, $max);
}

function pos_qr_pack_price($rows, $byId) {
  $amount = 0.0;
  $gstAmt = 0.0;
  foreach ($rows as $row) {
    $item = $byId[$row["item_id"] ?? ""] ?? null;
    if (!$item) continue;
    $qty = (float) ($row["quantity_gm"] ?? 0);
    $line = pos_round2(pos_line_amount_for_item($qty, (float) $item["retail_rate"], $item));
    $amount += $line;
    $gstAmt += $line * ((float) ($item["gst_rate"] ?? 0)) / 100;
  }
  $amount = pos_round2($amount);
  return [
    "price" => $amount,
    "gst_rate" => $amount > 0 ? pos_round2(($gstAmt / $amount) * 100) : 0,
  ];
}

function pos_qr_pack_cards($packs, $items) {
  $byId = [];
  foreach ($items as $item) $byId[(string) $item["id"]] = $item;
  $cards = [];
  foreach ($packs as $pack) {
    $status = (string) ($pack["status"] ?? "active");
    if ($status !== "active" && $status !== "") continue;
    $rows = $pack["items"] ?? [];
    if (!$rows) continue;
    $available = pos_qr_pack_available($rows, $byId);
    if ($available <= 0) continue;
    $priced = pos_qr_pack_price($rows, $byId);
    if ($priced["price"] <= 0) continue;
    $contents = [];
    foreach ($rows as $row) {
      $contents[] = [
        "item_id" => $row["item_id"] ?? "",
        "name" => $row["spice_name"] ?? $row["item_name"] ?? $row["name"] ?? "",
        "quantity_gm" => (float) ($row["quantity_gm"] ?? 0),
      ];
    }
    $cards[] = [
      "id" => pos_qr_pack_menu_id($pack["id"]),
      "pack_id" => $pack["id"],
      "code" => $pack["code"] ?? "",
      "name" => $pack["name"],
      "category" => "Packs",
      "base_unit" => "PCS",
      "unit" => "PCS",
      "retail_rate" => $priced["price"],
      "gst_rate" => $priced["gst_rate"],
      "stock_gm" => $available,
      "kind" => "pack",
      "image_url" => "",
      "pack_items" => $contents,
    ];
  }
  return $cards;
}

function pos_qr_expand_pack_line($line, $pack, $byId) {
  $count = (int) round((float) ($line["quantity"] ?? 0));
  if ($count <= 0) throw new Exception("Invalid pack quantity");
  $status = (string) ($pack["status"] ?? "active");
  if (!$pack || ($status !== "active" && $status !== "")) throw new Exception("That pack is no longer available");
  $rows = $pack["items"] ?? [];
  if (!$rows) throw new Exception("That pack has no items");
  $out = [];
  foreach ($rows as $row) {
    $item = $byId[$row["item_id"] ?? ""] ?? null;
    if (!$item || (($item["status"] ?? "active") !== "active")) {
      throw new Exception(($pack["name"] ?? "Pack") . " is no longer available");
    }
    $qty = ((float) ($row["quantity_gm"] ?? 0)) * $count;
    if ($qty <= 0) throw new Exception(($pack["name"] ?? "Pack") . " is no longer available");
    if ($qty > (float) ($item["stock_gm"] ?? 0)) throw new Exception(($pack["name"] ?? "Pack") . " does not have enough stock");
    $unit = pos_item_unit($item);
    $amount = pos_round2(pos_line_amount_for_item($qty, (float) $item["retail_rate"], $item));
    $gstRate = (float) ($item["gst_rate"] ?? 0);
    $out[] = [
      "item" => $item,
      "unit" => $unit,
      "qty" => $qty,
      "amount" => $amount,
      "gst_rate" => $gstRate,
      "gst" => pos_round2($amount * $gstRate / 100),
    ];
  }
  return $out;
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
    $catalog = [];
    $packCards = [];
    try {
      $catalog = pos_q(
        "SELECT id, name, category, base_unit, unit, retail_rate, gst_rate, stock_gm, status
         FROM items WHERE business_id = ?",
        "s",
        [$business["id"]]
      );
      $packCards = pos_qr_pack_cards(pos_qr_load_packs($business["id"]), $catalog);
    } catch (Throwable $e) {
      $packCards = [];
    }
    require_once __DIR__ . "/pos-offers.php";
    $offers = [];
    $stacking = "product_and_bill";
    try {
      $offers = pos_qr_live_offers($business["id"]);
      $stacking = pos_get_promo_settings($business["id"])["stacking"] ?? "product_and_bill";
    } catch (Throwable $e) { /* menu still opens */ }
    pos_send(200, [
      "shop" => [
        "id" => $business["id"], "code" => $business["code"],
        "name" => $business["company_name"] ?: $business["name"],
        "address" => $business["company_address"] ?: ($business["address"] ?? ""),
        "phone" => $business["company_phone"] ?: ($business["mobile"] ?? ""),
        "logo_url" => $business["company_logo"] ?: ($business["logo_url"] ?? ""),
      ],
      "items" => array_merge($packCards, $items),
      "packs" => $packCards,
      "offers" => $offers,
      "offerSettings" => ["stacking" => $stacking],
      "php" => true,
    ]);
  }

  if ($path === "qr/orders" && $method === "POST") {
    pos_qr_ensure_schema();
    $input = pos_qr_validate_order(is_array($body) ? $body : []);
    $business = pos_qr_business($body["shop"] ?? "");
    if (!$business) pos_send(404, ["error" => "Shop not found", "php" => true]);
    $catalog = pos_q(
      "SELECT id, name, category, base_unit, unit, retail_rate, gst_rate, stock_gm, status
       FROM items WHERE business_id = ?",
      "s",
      [$business["id"]]
    );
    $byId = [];
    foreach ($catalog as $row) $byId[(string) $row["id"]] = $row;
    $packById = [];
    foreach (pos_qr_load_packs($business["id"]) as $pack) $packById[(string) $pack["id"]] = $pack;
    $built = [];
    foreach ($input["lines"] as $line) {
      $packId = pos_qr_parse_pack_id($line["item_id"]);
      if ($packId !== "") {
        foreach (pos_qr_expand_pack_line($line, $packById[$packId] ?? null, $byId) as $row) $built[] = $row;
        continue;
      }
      $item = $byId[(string) $line["item_id"]] ?? null;
      if (!$item || (($item["status"] ?? "active") !== "active")) throw new Exception("One selected item is no longer available");
      $unit = pos_item_unit($item);
      $qty = pos_qr_quantity_to_base($line["quantity"], $unit);
      if ($qty > (float) ($item["stock_gm"] ?? 0)) throw new Exception($item["name"] . " does not have enough stock");
      $amount = pos_round2(pos_line_amount_for_item($qty, (float) $item["retail_rate"], $item));
      $gstRate = (float) ($item["gst_rate"] ?? 0);
      $built[] = ["item" => $item, "unit" => $unit, "qty" => $qty, "amount" => $amount, "gst_rate" => $gstRate, "gst" => pos_round2($amount * $gstRate / 100)];
    }
    if (!$built || count($built) > 200) throw new Exception("That pack order is too large.");
    require_once __DIR__ . "/pos-offers.php";
    $priced = pos_apply_qr_offers($built, $business["id"]);
    $built = $priced["built"];
    $subtotal = $priced["subtotal"];
    $gst = $priced["gst"];
    $total = $priced["total"];
    $discount = $priced["discount"];
    $offerLabel = $priced["message"];
    $id = pos_uuid();
    $number = pos_qr_order_number();
    $db = pos_db();
    $db->begin_transaction();
    try {
      pos_q(
        "INSERT INTO qr_orders
         (id, order_number, business_id, customer_name, mobile, table_no, notes, status, subtotal, gst, total, discount, offer_label)
         VALUES (?,?,?,?,?,?,?,'pending',?,?,?,?,?)",
        "sssssssdddds",
        [$id, $number, $business["id"], $input["customer_name"], $input["mobile"], $input["table_no"], $input["notes"], $subtotal, $gst, $total, $discount, $offerLabel]
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
    pos_send(201, ["ok" => true, "order" => ["id" => $id, "order_number" => $number, "status" => "pending", "subtotal" => $subtotal, "gst" => $gst, "total" => $total, "discount" => $discount, "offer_label" => $offerLabel], "php" => true]);
  }
  return false;
}

function pos_qr_staff_dispatch($path, $method, $body, $bid, $branchId, $uid = "") {
  pos_qr_ensure_schema();
  if ($path === "qr-orders" && $method === "GET") {
    $status = strtolower(pos_qr_clean($_GET["status"] ?? "", 24));
    pos_send(200, pos_qr_orders_with_lines($bid, $status));
  }
  if (preg_match('#^qr-orders/([^/]+)$#', $path, $m) && $method === "PATCH") {
    $status = strtolower(pos_qr_clean($body["status"] ?? "", 24));
    if (!in_array($status, pos_qr_statuses(), true)) pos_send(400, ["error" => "Invalid QR order status", "php" => true]);
    $invoice = null;
    if ($status === "completed") {
      $invoice = pos_qr_ensure_invoice($bid, $branchId, $uid, $m[1], $body["payment_method"] ?? $body["paymentMethod"] ?? "cash");
    } else {
      pos_q("UPDATE qr_orders SET status = ?, branch_id = COALESCE(branch_id, ?) WHERE id = ? AND business_id = ?", "ssss", [$status, $branchId, $m[1], $bid]);
    }
    $rows = pos_qr_orders_with_lines($bid);
    $found = null;
    foreach ($rows as $row) if ($row["id"] === $m[1]) $found = $row;
    if (!$found) pos_send(404, ["error" => "QR order not found", "php" => true]);
    pos_send(200, ["ok" => true, "order" => $found, "invoice" => $invoice, "php" => true]);
  }
  return false;
}
