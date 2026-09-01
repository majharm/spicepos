<?php

function pos_crud_dispatch($path, $method, $body, $bid, $auth, $branchId, $uid) {
  if ($path === "checkout" && $method === "POST") {
    pos_require_checkout();
    pos_dispatch_checkout($path, $method, $body, $bid, $branchId, $uid, $auth);
    return true;
  }

  if ($path === "customers" && $method === "POST") {
    $name = trim((string) ($body["name"] ?? ""));
    $mobile = trim((string) ($body["mobile"] ?? ""));
    if ($name === "" || $mobile === "") pos_send(400, ["error" => "Name and mobile are required"]);
    $type = (($body["type"] ?? "") === "b2b") ? "b2b" : "b2c";
    $id = pos_uuid();
    $n = pos_next_seq("customer", $bid, 4);
    $code = "CUS-" . str_pad((string) $n, 3, "0", STR_PAD_LEFT);
    pos_q(
      "INSERT INTO customers (id, code, name, business_name, mobile, type, gstin, credit_limit, outstanding, business_id)
       VALUES (?,?,?,?,?,?,?,?,0,?)",
      "sssssssds",
      [$id, $code, $name, $body["business_name"] ?? null, $mobile, $type, $body["gstin"] ?? null, (float) ($body["credit_limit"] ?? 0), $bid]
    );
    $rows = pos_q("SELECT * FROM customers WHERE id = ? LIMIT 1", "s", [$id]);
    pos_send(200, ["ok" => true, "customer" => $rows[0] ?? null]);
  }

  if ($path === "items" && $method === "POST") {
    $name = trim((string) ($body["name"] ?? ""));
    if ($name === "") pos_send(400, ["error" => "Item name is required"]);
    $id = pos_uuid();
    $n = pos_next_seq("item", $bid, 7);
    $code = $body["code"] ?? ("SP-" . str_pad((string) $n, 3, "0", STR_PAD_LEFT));
    $unit = pos_item_unit($body["base_unit"] ?? $body["unit"] ?? "GM");
    pos_ensure_item_unit_columns();
    $image = pos_item_image_url($body);
    pos_q(
      "INSERT INTO items (
         id, code, name, local_name, category, subcategory, base_unit,
         purchase_rate, retail_rate, b2b_rate, gst_rate, hsn, image_url, stock_gm,
         reorder_level_gm, status, business_id
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'active', ?)",
      "sssssssddddssdds",
      [
        $id, $code, $name, $body["local_name"] ?? null, $body["category"] ?? "Whole Spices",
        $body["subcategory"] ?? null, $unit,
        (float) ($body["purchase_rate"] ?? 0), (float) ($body["retail_rate"] ?? 0),
        (float) ($body["b2b_rate"] ?? 0), (float) ($body["gst_rate"] ?? 5),
        trim((string) ($body["hsn"] ?? $body["local_name"] ?? "")) ?: null,
        ($image === null || $image === "") ? null : $image,
        (float) ($body["stock_gm"] ?? 0), (float) ($body["reorder_level_gm"] ?? 0), $bid,
      ]
    );
    try {
      pos_q("UPDATE items SET unit = ? WHERE id = ?", "ss", [$unit, $id]);
    } catch (Exception $e) { /* unit column optional */ }
    $rows = pos_q("SELECT * FROM items WHERE id = ? LIMIT 1", "s", [$id]);
    pos_send(200, ["ok" => true, "item" => $rows[0] ?? null]);
  }

  if (preg_match('#^items/([^/]+)$#', $path, $m) && $method === "PUT") {
    $itemId = $m[1];
    $unit = pos_item_unit($body["base_unit"] ?? $body["unit"] ?? "GM");
    pos_ensure_item_unit_columns();
    $image = pos_item_image_url($body);
    $imageSql = "";
    $imageType = "";
    $imageVal = [];
    if ($image !== null) {
      $imageSql = ", image_url=?";
      $imageType = "s";
      $imageVal = [$image === "" ? null : $image];
    }
    pos_q(
      "UPDATE items SET name=?, local_name=?, category=?, subcategory=?, base_unit=?,
         purchase_rate=?, retail_rate=?, b2b_rate=?, gst_rate=?, hsn=?, stock_gm=?, reorder_level_gm=?, status=?{$imageSql}
       WHERE id=? AND business_id=?",
      "sssssddddsdds{$imageType}ss",
      array_merge(
        [
          $body["name"] ?? "", $body["local_name"] ?? null, $body["category"] ?? "Whole Spices",
          $body["subcategory"] ?? null, $unit,
          (float) ($body["purchase_rate"] ?? 0), (float) ($body["retail_rate"] ?? 0),
          (float) ($body["b2b_rate"] ?? 0), (float) ($body["gst_rate"] ?? 5),
          trim((string) ($body["hsn"] ?? "")) ?: null,
          (float) ($body["stock_gm"] ?? 0), (float) ($body["reorder_level_gm"] ?? 0),
          $body["status"] ?? "active",
        ],
        $imageVal,
        [$itemId, $bid]
      )
    );
    try {
      pos_q("UPDATE items SET unit = ? WHERE id = ?", "ss", [$unit, $itemId]);
    } catch (Exception $e) { /* unit column optional */ }
    $rows = pos_q("SELECT * FROM items WHERE id = ? LIMIT 1", "s", [$itemId]);
    pos_send(200, ["ok" => true, "item" => $rows[0] ?? null]);
  }

  if (preg_match('#^items/([^/]+)/receive$#', $path, $m) && $method === "POST") {
    $qty = (float) ($body["quantity_gm"] ?? 0);
    if ($qty <= 0) pos_send(400, ["error" => "quantity_gm must be positive"]);
    pos_q("UPDATE items SET stock_gm = stock_gm + ? WHERE id = ? AND business_id = ?", "dss", [$qty, $m[1], $bid]);
    $rows = pos_q("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$m[1], $bid]);
    pos_send(200, ["ok" => true, "item" => $rows[0] ?? null]);
  }

  if ($path === "packs" && $method === "POST") {
    $name = trim((string) ($body["name"] ?? ""));
    $items = $body["items"] ?? [];
    if ($name === "" || !is_array($items) || !$items) pos_send(400, ["error" => "Pack name and at least one spice are required"]);
    $packId = pos_uuid();
    $n = pos_next_seq("pack", $bid, 6);
    $total = 0;
    foreach ($items as $row) $total += (float) ($row["quantity_gm"] ?? 0);
    pos_q(
      "INSERT INTO packs (id, code, name, total_quantity_gm, status, business_id) VALUES (?,?,?,?,'active',?)",
      "sssds",
      [$packId, "PK-" . str_pad((string) $n, 3, "0", STR_PAD_LEFT), $name, $total, $bid]
    );
    $sort = 1;
    foreach ($items as $row) {
      $it = pos_q("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$row["item_id"] ?? "", $bid]);
      $item = $it[0] ?? null;
      if (!$item) throw new Exception("Unknown item in pack");
      pos_q(
        "INSERT INTO pack_items (id, pack_id, item_id, quantity_gm, retail_rate, b2b_rate, sort_order, business_id)
         VALUES (?,?,?,?,?,?,?,?)",
        "sssdddis",
        [pos_uuid(), $packId, $item["id"], (float) ($row["quantity_gm"] ?? 0), (float) $item["retail_rate"], (float) $item["b2b_rate"], $sort++, $bid]
      );
    }
    $rows = pos_q("SELECT * FROM packs WHERE id = ? LIMIT 1", "s", [$packId]);
    pos_send(200, ["ok" => true, "pack" => $rows[0] ?? null]);
  }

  if ($path === "suppliers" && $method === "POST") {
    $name = trim((string) ($body["name"] ?? ""));
    if ($name === "") pos_send(400, ["error" => "Supplier name is required"]);
    pos_ensure_accounts_schema();
    $id = pos_uuid();
    $code = "SUP-" . strtoupper(base_convert((string) time(), 10, 36));
    pos_q(
      "INSERT INTO suppliers (id, code, name, contact_name, mobile, email, address, gstin, opening_balance, payable_balance, business_id)
       VALUES (?,?,?,?,?,?,?,?,0,0,?)",
      "sssssssss",
      [$id, $code, $name, $body["contact_name"] ?? null, $body["mobile"] ?? null, $body["email"] ?? null, $body["address"] ?? null, $body["gstin"] ?? null, $bid]
    );
    $rows = pos_q("SELECT * FROM suppliers WHERE id = ? LIMIT 1", "s", [$id]);
    pos_send(200, ["ok" => true, "supplier" => $rows[0] ?? null]);
  }

  if ($path === "purchases" && $method === "POST") {
    $supplierId = $body["supplier_id"] ?? "";
    $lines = $body["lines"] ?? [];
    if (!$supplierId || !is_array($lines) || !$lines) pos_send(400, ["error" => "Supplier and purchase lines are required"]);
    require_once __DIR__ . "/pos-accounting.php";
    try {
      $purchase = pos_with_transaction(function () use ($body, $bid, $uid, $supplierId, $lines) {
        $sup = pos_q("SELECT * FROM suppliers WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$supplierId, $bid]);
        $supplier = $sup[0] ?? null;
        if (!$supplier) throw new Exception("Supplier not found");
        $built = [];
        foreach ($lines as $line) {
          $it = pos_q("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$line["item_id"] ?? "", $bid]);
          $item = $it[0] ?? null;
          if (!$item) throw new Exception("Unknown item");
          $qty = (float) ($line["quantity_gm"] ?? 0);
          $rate = (float) ($line["rate_per_kg"] ?? $item["purchase_rate"]);
          $amount = pos_round2(pos_line_amount_for_item($qty, $rate, $item));
          $gstRate = (float) ($item["gst_rate"] ?? 0);
          $gstAmount = pos_round2(($amount * $gstRate) / 100);
          $built[] = ["item" => $item, "qty" => $qty, "rate" => $rate, "amount" => $amount, "gstRate" => $gstRate, "gstAmount" => $gstAmount, "total" => pos_round2($amount + $gstAmount)];
        }
        $subtotal = pos_round2(array_sum(array_column($built, "amount")));
        $gst = pos_round2(array_sum(array_column($built, "gstAmount")));
        $total = pos_round2($subtotal + $gst);
        $n = pos_next_seq("purchase", $bid, 10002);
        $id = pos_uuid();
        $purchaseNumber = "PO-{$n}";
        $method = strtolower((string) ($body["payment_method"] ?? "cash"));
        $payStatus = $method === "credit" ? "unpaid" : "paid";
        pos_q(
          "INSERT INTO purchases (
             id, purchase_number, supplier_id, supplier_name, supplier_invoice_number,
             purchase_date, notes, subtotal, gst, total, payment_method, payment_status, business_id
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
          "sssssssddssss",
          [
            $id, $purchaseNumber, $supplier["id"], $supplier["name"], $body["supplier_invoice_number"] ?? null,
            $body["purchase_date"] ?? date("Y-m-d"), $body["notes"] ?? null, $subtotal, $gst, $total, $method, $payStatus, $bid,
          ]
        );
        foreach ($built as $line) {
          pos_q(
            "INSERT INTO purchase_lines (
               id, purchase_id, item_id, item_name, quantity_gm, rate_per_kg,
               gst_rate, amount, gst_amount, total_amount, business_id
             ) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            "ssssdddddds",
            [
              pos_uuid(), $id, $line["item"]["id"], $line["item"]["name"], $line["qty"], $line["rate"],
              $line["gstRate"], $line["amount"], $line["gstAmount"], $line["total"], $bid,
            ]
          );
          pos_q("UPDATE items SET stock_gm = stock_gm + ? WHERE id = ? AND business_id = ?", "dss", [$line["qty"], $line["item"]["id"], $bid]);
        }
        $rows = pos_q("SELECT * FROM purchases WHERE id = ? LIMIT 1", "s", [$id]);
        $purchase = $rows[0] ?? null;
        $purchase["lines"] = pos_q("SELECT * FROM purchase_lines WHERE purchase_id = ?", "s", [$id]);
        pos_record_credit_purchase($supplier, $total, $id, $purchaseNumber, $method, $bid, $uid);
        pos_post_purchase_journal($bid, $uid, $purchase);
        return $purchase;
      });
      pos_send(200, ["ok" => true, "purchase" => $purchase]);
    } catch (Exception $e) {
      pos_send(400, ["error" => $e->getMessage(), "php" => true]);
    }
  }

  if ($path === "holds" || preg_match('#^holds/#', $path)) {
    pos_require_holds();
    pos_dispatch_holds($path, $method, $body, $bid, $branchId, $uid, $auth);
    return true;
  }

  if ($path === "stock/adjust" && $method === "POST") {
    $itemId = $body["item_id"] ?? "";
    $qty = (float) ($body["quantity_gm"] ?? 0);
    if (!$itemId || !$qty) pos_send(400, ["error" => "Item and quantity required"]);
    $it = pos_q("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$itemId, $bid]);
    if (!$it) pos_send(400, ["error" => "Item not found"]);
    pos_q("UPDATE items SET stock_gm = stock_gm + ? WHERE id = ? AND business_id = ?", "dss", [$qty, $itemId, $bid]);
    if ($branchId) {
      try {
        pos_q(
          "INSERT INTO branch_stocks (id, business_id, branch_id, item_id, stock_gm) VALUES (?,?,?,?,?)
           ON DUPLICATE KEY UPDATE stock_gm = stock_gm + VALUES(stock_gm)",
          "ssssd",
          [pos_uuid(), $bid, $branchId, $itemId, $qty]
        );
      } catch (Exception $e) { /* optional */ }
    }
    try {
      pos_q(
        "INSERT INTO stock_movements (id, business_id, branch_id, item_id, kind, quantity_gm, note, created_by) VALUES (?,?,?,?,?,?,?,?)",
        "sssssdsi",
        [pos_uuid(), $bid, (string) $branchId, $itemId, (string) ($body["kind"] ?? "adjustment"), $qty, $body["note"] ?? null, $uid]
      );
    } catch (Exception $e) { /* optional */ }
    pos_send(200, ["ok" => true]);
  }

  if ($path === "branches" && $method === "POST") {
    $name = trim((string) ($body["name"] ?? ""));
    if ($name === "") pos_send(400, ["error" => "Branch name is required"]);
    $id = pos_uuid();
    pos_q(
      "INSERT INTO branches (id, business_id, name, address, phone, status) VALUES (?,?,?,?,?,?)",
      "ssssss",
      [$id, $bid, $name, $body["address"] ?? null, $body["phone"] ?? null, $body["status"] ?? "active"]
    );
    $rows = pos_q("SELECT * FROM branches WHERE id = ? LIMIT 1", "s", [$id]);
    pos_send(200, ["ok" => true, "branch" => $rows[0] ?? null]);
  }

  if ($path === "devices" && $method === "POST") {
    $name = trim((string) ($body["name"] ?? ""));
    if ($name === "") pos_send(400, ["error" => "Device name is required"]);
    $id = pos_uuid();
    $code = $body["code"] ?? ("POS-" . strtoupper(base_convert((string) time(), 10, 36)));
    pos_q(
      "INSERT INTO pos_devices (id, business_id, branch_id, name, code, status) VALUES (?,?,?,?,?,?)",
      "ssssss",
      [$id, $bid, $body["branch_id"] ?? $branchId, $name, $code, $body["status"] ?? "active"]
    );
    $rows = pos_q("SELECT * FROM pos_devices WHERE id = ? LIMIT 1", "s", [$id]);
    pos_send(200, ["ok" => true, "device" => $rows[0] ?? null]);
  }

  if ($path === "staff" && $method === "POST") {
    $email = strtolower(trim((string) ($body["email"] ?? "")));
    $password = (string) ($body["password"] ?? "");
    if ($email === "" || $password === "") pos_send(400, ["error" => "Email and password are required"]);
    $role = $body["role"] ?? "staff";
    $perms = is_array($body["permissions"] ?? null) ? $body["permissions"] : pos_default_perms($role);
    $id = pos_uuid();
    $username = $body["username"] ?? explode("@", $email)[0];
    pos_q(
      "INSERT INTO staff_users (
         id, clerk_user_id, email, first_name, last_name, role, status, password_hash,
         business_id, branch_id, permissions_json, username, mobile
       ) VALUES (?,?,?,?,?,?, 'active', ?,?,?,?,?,?)",
      "ssssssssssss",
      [
        $id, "local:{$id}", $email, $body["first_name"] ?? $body["name"] ?? "Staff", $body["last_name"] ?? "",
        $role, pos_hash_password($password), $bid, $body["branch_id"] ?? $branchId,
        json_encode($perms), $username, $body["mobile"] ?? null,
      ]
    );
    $shop = pos_q("SELECT name FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
    if (function_exists("pos_send_welcome_staff")) {
      pos_send_welcome_staff([
        "shopName" => $shop[0]["name"] ?? "",
        "name" => $body["first_name"] ?? $body["name"] ?? "Staff",
        "email" => $email,
        "username" => $username,
        "role" => $role,
      ]);
    }
    pos_send(200, ["ok" => true, "id" => $id]);
  }

  return false;
}
