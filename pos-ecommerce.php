<?php

function pos_ensure_ecommerce_schema() {
  static $done = false;
  if ($done) return;
  $done = true;
  try {
    pos_q("ALTER TABLE businesses ADD COLUMN ecommerce_store TINYINT(1) NOT NULL DEFAULT 0");
  } catch (Exception $e) { /* column already present */ }
  $tables = [
    "CREATE TABLE IF NOT EXISTS ecommerce_stores (
      business_id VARCHAR(255) PRIMARY KEY,
      slug VARCHAR(40) NOT NULL,
      store_name VARCHAR(160) NOT NULL,
      published TINYINT(1) NOT NULL DEFAULT 0,
      delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
      free_above DECIMAL(12,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP(3) NULL,
      UNIQUE KEY uq_ecommerce_slug (slug)
    )",
    "CREATE TABLE IF NOT EXISTS ecommerce_listings (
      business_id VARCHAR(255) NOT NULL,
      item_id VARCHAR(255) NOT NULL,
      listed TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (business_id, item_id)
    )",
    "CREATE TABLE IF NOT EXISTS ecommerce_orders (
      id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      order_number VARCHAR(32) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      customer_name VARCHAR(160) NOT NULL,
      mobile VARCHAR(32) NOT NULL,
      address VARCHAR(255) NULL,
      payment_method VARCHAR(16) NOT NULL DEFAULT 'cod',
      subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
      gst DECIMAL(12,2) NOT NULL DEFAULT 0,
      delivery DECIMAL(12,2) NOT NULL DEFAULT 0,
      total DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_ecommerce_orders_biz (business_id, created_at)
    )",
    "CREATE TABLE IF NOT EXISTS ecommerce_order_lines (
      id VARCHAR(255) PRIMARY KEY,
      order_id VARCHAR(255) NOT NULL,
      business_id VARCHAR(255) NOT NULL,
      item_id VARCHAR(255) NOT NULL,
      item_name VARCHAR(180) NOT NULL,
      quantity DECIMAL(12,3) NOT NULL,
      quantity_base DECIMAL(14,3) NOT NULL,
      rate DECIMAL(12,2) NOT NULL,
      gst_rate DECIMAL(8,2) NOT NULL DEFAULT 0,
      amount DECIMAL(12,2) NOT NULL,
      gst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      INDEX idx_ecommerce_lines_order (order_id),
      INDEX idx_ecommerce_lines_biz (business_id)
    )",
  ];
  foreach ($tables as $sql) pos_q($sql);
}

function pos_ecommerce_money($n) {
  return round((float) $n, 2);
}

function pos_ecommerce_totals($lines, $deliveryFee, $freeAbove) {
  $subtotal = 0.0;
  $gst = 0.0;
  foreach ($lines as $line) {
    $subtotal += (float) ($line["amount"] ?? 0);
    $gst += (float) ($line["gst"] ?? 0);
  }
  $subtotal = pos_ecommerce_money($subtotal);
  $gst = pos_ecommerce_money($gst);
  $goods = pos_ecommerce_money($subtotal + $gst);
  $fee = max(0, (float) $deliveryFee);
  $free = max(0, (float) $freeAbove);
  $delivery = ($free > 0 && $goods + 0.001 >= $free) ? 0 : pos_ecommerce_money($fee);
  return ["subtotal" => $subtotal, "gst" => $gst, "delivery" => $delivery, "total" => pos_ecommerce_money($goods + $delivery)];
}

function pos_ecommerce_public_row($slug) {
  $rows = pos_q(
    "SELECT b.id, b.name, b.status, b.ecommerce_store, s.slug, s.store_name, s.published, s.delivery_fee, s.free_above
     FROM ecommerce_stores s JOIN businesses b ON b.id = s.business_id
     WHERE s.slug = ? LIMIT 1",
    "s",
    [$slug]
  );
  return $rows[0] ?? null;
}

function pos_ecommerce_open($slug) {
  pos_ensure_ecommerce_schema();
  $row = pos_ecommerce_public_row(pos_online_store_slug($slug));
  if (!$row || pos_online_store_flag($row["ecommerce_store"] ?? 0) !== 1 || ($row["status"] ?? "") !== "active") {
    pos_send(404, ["error" => "E-Commerce Store is not available", "php" => true]);
  }
  return $row;
}

function pos_ecommerce_catalog($bid, $publicOnly) {
  $rows = pos_q(
    "SELECT i.id, i.name, i.category, i.retail_rate, i.gst_rate, i.stock_gm, i.unit, i.base_unit, i.image_url, l.listed
     FROM items i
     LEFT JOIN ecommerce_listings l ON l.business_id = i.business_id AND l.item_id = i.id
     WHERE i.business_id = ? AND i.status = 'active'
     ORDER BY i.category, i.name",
    "s",
    [$bid]
  );
  $out = [];
  foreach ($rows as $row) {
    $listed = $row["listed"] === null ? 1 : ((int) $row["listed"] === 1 ? 1 : 0);
    $stock = (float) ($row["stock_gm"] ?? 0);
    if ($publicOnly && ($listed !== 1 || $stock <= 0)) continue;
    $out[] = [
      "id" => $row["id"],
      "name" => $row["name"],
      "category" => $row["category"] ?: "General",
      "retail_rate" => (float) ($row["retail_rate"] ?? 0),
      "gst_rate" => (float) ($row["gst_rate"] ?? 0),
      "stock_gm" => $stock,
      "unit" => $row["base_unit"] ?: ($row["unit"] ?: "PCS"),
      "image_url" => $row["image_url"] ?? "",
      "listed" => $listed,
    ];
  }
  return $out;
}

function pos_ecommerce_place($row, $body) {
  if ((int) ($row["published"] ?? 0) !== 1) pos_send(403, ["error" => "This shop is not open for orders yet.", "php" => true]);
  if (!function_exists("pos_qr_quantity_to_base")) require_once __DIR__ . "/pos-qr-ordering.php";
  $name = trim((string) ($body["name"] ?? $body["customer_name"] ?? ""));
  $mobile = substr(preg_replace("/\D+/", "", (string) ($body["mobile"] ?? "")), -10);
  $address = trim((string) ($body["address"] ?? ""));
  if (strlen($name) < 2) throw new Exception("Name is required");
  if (strlen($mobile) < 10) throw new Exception("Enter a valid mobile number");
  if (strlen($address) < 5) throw new Exception("Delivery address is required");
  $wanted = [];
  foreach (is_array($body["lines"] ?? null) ? $body["lines"] : [] as $raw) {
    $id = (string) ($raw["item_id"] ?? $raw["itemId"] ?? "");
    $wanted[$id] = ($wanted[$id] ?? 0) + (float) ($raw["quantity"] ?? 0);
  }
  if (!$wanted) throw new Exception("Add at least one item");
  $byId = [];
  foreach (pos_ecommerce_catalog($row["id"], true) as $item) $byId[$item["id"]] = $item;
  $built = [];
  foreach ($wanted as $id => $quantity) {
    $item = $byId[$id] ?? null;
    if (!$item) throw new Exception("An item in the cart is not available");
    $base = pos_qr_quantity_to_base($quantity, $item["unit"]);
    if ($base > $item["stock_gm"] + 0.0000001) throw new Exception($item["name"] . " does not have enough stock");
    $amount = pos_ecommerce_money(pos_line_amount($base, $item["retail_rate"], $item["unit"]));
    $gst = pos_ecommerce_money($amount * $item["gst_rate"] / 100);
    $built[] = ["item" => $item, "quantity" => $quantity, "quantity_base" => $base, "amount" => $amount, "gst" => $gst, "rate" => $item["retail_rate"], "gst_rate" => $item["gst_rate"]];
  }
  $totals = pos_ecommerce_totals($built, $row["delivery_fee"] ?? 0, $row["free_above"] ?? 0);
  $count = pos_q("SELECT COUNT(*) AS n FROM ecommerce_orders WHERE business_id = ?", "s", [$row["id"]]);
  $number = "EC-" . str_pad((string) ((int) ($count[0]["n"] ?? 0) + 1), 4, "0", STR_PAD_LEFT);
  $id = pos_uuid();
  pos_q(
    "INSERT INTO ecommerce_orders (id, business_id, order_number, status, customer_name, mobile, address, payment_method, subtotal, gst, delivery, total)
     VALUES (?,?,?, 'pending', ?,?,?, 'cod', ?,?,?,?)",
    "ssssssdddd",
    [$id, $row["id"], $number, $name, $mobile, $address, $totals["subtotal"], $totals["gst"], $totals["delivery"], $totals["total"]]
  );
  foreach ($built as $line) {
    pos_q("UPDATE items SET stock_gm = stock_gm - ? WHERE id = ? AND business_id = ?", "dss", [$line["quantity_base"], $line["item"]["id"], $row["id"]]);
    pos_q(
      "INSERT INTO stock_movements (id, business_id, item_id, kind, quantity_gm, note) VALUES (?,?,?,?,?,?)",
      "ssssds",
      [pos_uuid(), $row["id"], $line["item"]["id"], "sale", -$line["quantity_base"], $number]
    );
    pos_q(
      "INSERT INTO ecommerce_order_lines (id, order_id, business_id, item_id, item_name, quantity, quantity_base, rate, gst_rate, amount, gst_amount)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      "sssssdddddd",
      [pos_uuid(), $id, $row["id"], $line["item"]["id"], $line["item"]["name"], $line["quantity"], $line["quantity_base"], $line["rate"], $line["gst_rate"], $line["amount"], $line["gst"]]
    );
  }
  pos_send(201, ["ok" => true, "order" => array_merge(["id" => $id, "order_number" => $number, "status" => "pending", "payment" => "Cash on delivery"], $totals), "php" => true]);
}

function pos_ecommerce_public_dispatch($path, $method, $body) {
  if (strpos($path, "shop/") !== 0) return false;
  if (preg_match("#^shop/([^/]+)$#", $path, $m) && $method === "GET") {
    $row = pos_ecommerce_open($m[1]);
    pos_send(200, [
      "shop" => $row["slug"],
      "store_name" => $row["store_name"] ?: $row["name"],
      "published" => (int) ($row["published"] ?? 0) === 1 ? 1 : 0,
      "delivery_fee" => (float) ($row["delivery_fee"] ?? 0),
      "free_above" => (float) ($row["free_above"] ?? 0),
      "payment" => "Cash on delivery",
      "php" => true,
    ]);
  }
  if (preg_match("#^shop/([^/]+)/catalog$#", $path, $m) && $method === "GET") {
    $row = pos_ecommerce_open($m[1]);
    if ((int) ($row["published"] ?? 0) !== 1) pos_send(403, ["error" => "This shop is not open for orders yet.", "php" => true]);
    pos_send(200, pos_ecommerce_catalog($row["id"], true));
  }
  if (preg_match("#^shop/([^/]+)/orders$#", $path, $m) && $method === "POST") {
    pos_ecommerce_place(pos_ecommerce_open($m[1]), is_array($body) ? $body : []);
  }
  if (preg_match("#^shop/([^/]+)/track$#", $path, $m) && $method === "POST") {
    $row = pos_ecommerce_open($m[1]);
    $number = strtoupper(trim((string) ($body["order_number"] ?? $body["orderNumber"] ?? "")));
    $mobile = substr(preg_replace("/\D+/", "", (string) ($body["mobile"] ?? "")), -10);
    if ($number === "" || strlen($mobile) < 10) pos_send(400, ["error" => "Enter the order number and mobile", "php" => true]);
    $orders = pos_q(
      "SELECT id, order_number, status, customer_name, payment_method, subtotal, gst, delivery, total, created_at
       FROM ecommerce_orders WHERE business_id = ? AND order_number = ? AND mobile = ? LIMIT 1",
      "sss",
      [$row["id"], $number, $mobile]
    );
    if (!$orders) pos_send(404, ["error" => "No order matches that number and mobile", "php" => true]);
    $lines = pos_q("SELECT item_name, quantity, amount FROM ecommerce_order_lines WHERE order_id = ? AND business_id = ?", "ss", [$orders[0]["id"], $row["id"]]);
    unset($orders[0]["id"]);
    $orders[0]["lines"] = $lines;
    pos_send(200, ["order" => $orders[0], "php" => true]);
  }
  return false;
}

function pos_ecommerce_master_dispatch($path, $method, $body) {
  if (strpos($path, "master/ecommerce") !== 0) return false;
  pos_ensure_ecommerce_schema();
  if ($path === "master/ecommerce" && $method === "GET") {
    $rows = pos_q(
      "SELECT b.id, b.name, b.city, b.business_type, b.category, b.status, b.ecommerce_store, s.slug, s.published, s.store_name
       FROM businesses b LEFT JOIN ecommerce_stores s ON s.business_id = b.id ORDER BY b.name"
    );
    $list = [];
    foreach ($rows as $b) {
      $on = pos_online_store_flag($b["ecommerce_store"] ?? 0);
      $b["ecommerce_store"] = $on;
      $b["status_label"] = $on ? "Enabled" : "Disabled";
      $list[] = $b;
    }
    pos_send(200, ["businesses" => $list, "php" => true]);
  }
  if ($path === "master/ecommerce/enable-all" && $method === "POST") {
    pos_q("UPDATE businesses SET ecommerce_store = 1");
    pos_send(200, ["ok" => true, "ecommerce_store" => 1, "php" => true]);
  }
  if ($path === "master/ecommerce/disable-all" && $method === "POST") {
    pos_q("UPDATE businesses SET ecommerce_store = 0");
    pos_send(200, ["ok" => true, "ecommerce_store" => 0, "php" => true]);
  }
  if (preg_match("#^master/ecommerce/businesses/([^/]+)$#", $path, $m) && $method === "PUT") {
    $rows = pos_q("SELECT id, ecommerce_store FROM businesses WHERE id = ? LIMIT 1", "s", [$m[1]]);
    if (!$rows) pos_send(404, ["error" => "Business not found", "php" => true]);
    $on = array_key_exists("ecommerce_store", $body) ? pos_online_store_flag($body["ecommerce_store"]) : pos_online_store_flag($rows[0]["ecommerce_store"] ?? 0);
    pos_q("UPDATE businesses SET ecommerce_store = ? WHERE id = ?", "is", [$on, $m[1]]);
    pos_send(200, ["ok" => true, "id" => $m[1], "ecommerce_store" => $on, "status_label" => $on ? "Enabled" : "Disabled", "php" => true]);
  }
  return false;
}

function pos_ecommerce_staff_allowed($auth) {
  $user = is_array($auth["user"] ?? null) ? $auth["user"] : [];
  $role = (string) ($user["role"] ?? "");
  if ($role === "business_admin" || $role === "resort_owner") return true;
  return pos_can($user, "settings") || pos_can($user, "items") || pos_can($user, "orders");
}

function pos_ecommerce_staff_dispatch($path, $method, $body, $bid, $auth = null) {
  if ($path !== "ecommerce" && strpos($path, "ecommerce/") !== 0) return false;
  pos_ensure_ecommerce_schema();
  $rows = pos_q("SELECT id, name, status, ecommerce_store FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
  $biz = $rows[0] ?? [];
  if (pos_online_store_flag($biz["ecommerce_store"] ?? 0) !== 1) {
    pos_send(403, ["error" => "E-Commerce Store is turned off for this shop", "php" => true]);
  }
  if (!pos_ecommerce_staff_allowed($auth)) pos_send(403, ["error" => "You do not have permission for this module", "php" => true]);
  if ($path === "ecommerce" && $method === "GET") {
    $store = pos_q("SELECT * FROM ecommerce_stores WHERE business_id = ? LIMIT 1", "s", [$bid]);
    $row = $store[0] ?? null;
    pos_send(200, [
      "business" => ["id" => $bid, "name" => $biz["name"] ?? ""],
      "store" => $row,
      "php" => true,
    ]);
  }
  if ($path === "ecommerce" && $method === "PUT") {
    $slug = pos_online_store_slug($body["slug"] ?? "");
    $name = trim((string) ($body["store_name"] ?? $body["storeName"] ?? ($biz["name"] ?? "")));
    if (strlen($name) < 2) pos_send(400, ["error" => "Store name is required", "php" => true]);
    $published = pos_online_store_flag($body["published"] ?? 0);
    $delivery = pos_ecommerce_money($body["delivery_fee"] ?? $body["deliveryFee"] ?? 0);
    $free = pos_ecommerce_money($body["free_above"] ?? $body["freeAbove"] ?? 0);
    $taken = pos_q("SELECT business_id FROM ecommerce_stores WHERE slug = ? AND business_id <> ? LIMIT 1", "ss", [$slug, $bid]);
    if ($taken) pos_send(400, ["error" => "That store URL is already used", "php" => true]);
    $existing = pos_q("SELECT business_id FROM ecommerce_stores WHERE business_id = ? LIMIT 1", "s", [$bid]);
    if ($existing) {
      pos_q(
        "UPDATE ecommerce_stores SET slug = ?, store_name = ?, published = ?, delivery_fee = ?, free_above = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE business_id = ?",
        "ssidds",
        [$slug, $name, $published, $delivery, $free, $bid]
      );
    } else {
      pos_q(
        "INSERT INTO ecommerce_stores (business_id, slug, store_name, published, delivery_fee, free_above, updated_at) VALUES (?,?,?,?,?,?, CURRENT_TIMESTAMP(3))",
        "sssidd",
        [$bid, $slug, $name, $published, $delivery, $free]
      );
    }
    pos_send(200, ["ok" => true, "slug" => $slug, "published" => $published, "delivery_fee" => $delivery, "free_above" => $free, "php" => true]);
  }
  if ($path === "ecommerce/catalog" && $method === "GET") {
    pos_send(200, pos_ecommerce_catalog($bid, false));
  }
  if (preg_match("#^ecommerce/items/([^/]+)$#", $path, $m) && $method === "PUT") {
    $items = pos_q("SELECT id FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$m[1], $bid]);
    if (!$items) pos_send(404, ["error" => "Item not found", "php" => true]);
    $listed = pos_online_store_flag($body["listed"] ?? 0);
    pos_q(
      "INSERT INTO ecommerce_listings (business_id, item_id, listed) VALUES (?,?,?) ON DUPLICATE KEY UPDATE listed = VALUES(listed)",
      "ssi",
      [$bid, $m[1], $listed]
    );
    pos_send(200, ["ok" => true, "listed" => $listed, "php" => true]);
  }
  if ($path === "ecommerce/orders" && $method === "GET") {
    $orders = pos_q(
      "SELECT id, order_number, status, customer_name, mobile, address, payment_method, subtotal, gst, delivery, total, created_at
       FROM ecommerce_orders WHERE business_id = ? ORDER BY created_at DESC LIMIT 200",
      "s",
      [$bid]
    );
    pos_send(200, $orders);
  }
  if (preg_match("#^ecommerce/orders/([^/]+)$#", $path, $m) && $method === "PATCH") {
    $status = strtolower(trim((string) ($body["status"] ?? "")));
    if (!in_array($status, ["pending", "packed", "out", "delivered", "cancelled"], true)) {
      pos_send(400, ["error" => "Invalid order status", "php" => true]);
    }
    $orders = pos_q("SELECT * FROM ecommerce_orders WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$m[1], $bid]);
    if (!$orders) pos_send(404, ["error" => "Order not found", "php" => true]);
    $order = $orders[0];
    if (($order["status"] ?? "") === "cancelled") pos_send(200, ["ok" => true, "status" => "cancelled", "php" => true]);
    if ($status === "cancelled") {
      $lines = pos_q("SELECT item_id, quantity_base FROM ecommerce_order_lines WHERE order_id = ? AND business_id = ?", "ss", [$order["id"], $bid]);
      foreach ($lines as $line) {
        pos_q("UPDATE items SET stock_gm = stock_gm + ? WHERE id = ? AND business_id = ?", "dss", [(float) $line["quantity_base"], $line["item_id"], $bid]);
        pos_q(
          "INSERT INTO stock_movements (id, business_id, item_id, kind, quantity_gm, note) VALUES (?,?,?,?,?,?)",
          "ssssds",
          [pos_uuid(), $bid, $line["item_id"], "return", (float) $line["quantity_base"], $order["order_number"]]
        );
      }
    }
    pos_q("UPDATE ecommerce_orders SET status = ? WHERE id = ? AND business_id = ?", "sss", [$status, $order["id"], $bid]);
    pos_send(200, ["ok" => true, "status" => $status, "php" => true]);
  }
  return false;
}
