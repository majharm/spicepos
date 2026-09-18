<?php

function pos_ensure_returns_schema() {
  static $done = false;
  if ($done) return;
  $done = true;
  if (function_exists("pos_ensure_advanced_schema")) pos_ensure_advanced_schema();
  $db = pos_db();
  @$db->query("ALTER TABLE stock_batches ADD COLUMN quarantine_gm DECIMAL(14,3) NOT NULL DEFAULT 0");
  @$db->query(
    "CREATE TABLE IF NOT EXISTS sales_returns (
      id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      branch_id VARCHAR(255) NULL,
      return_number VARCHAR(32) NOT NULL,
      order_id VARCHAR(255) NOT NULL,
      order_number VARCHAR(32) NULL,
      customer_id VARCHAR(255) NULL,
      customer_name VARCHAR(255) NULL,
      customer_mobile VARCHAR(32) NULL,
      shop_kind VARCHAR(16) NOT NULL DEFAULT 'general',
      return_type VARCHAR(16) NOT NULL DEFAULT 'partial',
      reason VARCHAR(64) NOT NULL DEFAULT 'other',
      notes VARCHAR(255) NULL,
      refund_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      refund_mode VARCHAR(32) NOT NULL DEFAULT 'cash',
      status VARCHAR(16) NOT NULL DEFAULT 'completed',
      created_by VARCHAR(255) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_return_no (business_id, return_number),
      INDEX (business_id),
      INDEX (order_id)
    )"
  );
  @$db->query(
    "CREATE TABLE IF NOT EXISTS sales_return_lines (
      id VARCHAR(255) PRIMARY KEY,
      return_id VARCHAR(255) NOT NULL,
      business_id VARCHAR(255) NOT NULL,
      order_line_id VARCHAR(255) NOT NULL,
      item_id VARCHAR(255) NOT NULL,
      item_name VARCHAR(255) NULL,
      item_code VARCHAR(64) NULL,
      size VARCHAR(32) NULL,
      color VARCHAR(64) NULL,
      quantity_gm DECIMAL(14,3) NOT NULL,
      sold_qty_gm DECIMAL(14,3) NOT NULL DEFAULT 0,
      rate_per_kg DECIMAL(12,2) NOT NULL DEFAULT 0,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      gst_rate DECIMAL(8,2) NOT NULL DEFAULT 0,
      batch_id VARCHAR(255) NULL,
      batch_no VARCHAR(64) NULL,
      expiry_date DATE NULL,
      barcode VARCHAR(64) NULL,
      condition_label VARCHAR(16) NULL,
      stock_disposition VARCHAR(16) NOT NULL DEFAULT 'quarantine',
      INDEX (return_id),
      INDEX (order_line_id),
      INDEX (business_id)
    )"
  );
}

function pos_return_round2($n) {
  return round((float) $n, 2);
}

function pos_return_shop_kind($bid) {
  $rows = pos_q("SELECT category, business_type FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
  $t = strtolower(trim((string) (($rows[0]["category"] ?? "") . " " . ($rows[0]["business_type"] ?? ""))));
  if (preg_match("/pharmacy|medical/", $t)) return "pharmacy";
  if (preg_match("/garment|clothing|fashion|apparel|boutique/", $t)) return "apparel";
  return "general";
}

function pos_return_line_refund($line, $qty) {
  $sold = (float) ($line["quantity_gm"] ?? 0);
  if ($sold <= 0 || $qty <= 0) return 0.0;
  $gst = (float) ($line["gst_rate"] ?? 0);
  $taxable = (float) ($line["amount"] ?? 0);
  return pos_return_round2(($qty / $sold) * $taxable * (1 + $gst / 100));
}

function pos_return_restore_barcode($bid, $code) {
  $raw = trim((string) $code);
  if ($raw === "") return;
  pos_q(
    "UPDATE item_barcodes SET status='active', used_kind=NULL, used_at=NULL WHERE business_id=? AND barcode=?",
    "ss",
    [$bid, $raw]
  );
}

function pos_apply_return_stock($bid, $branchId, $uid, $ctx) {
  $qty = (float) ($ctx["qty"] ?? 0);
  if (function_exists("pos_pack_stock_qty") && !empty($ctx["item"])) {
    $qty = (float) pos_pack_stock_qty($ctx["item"], $qty);
  }
  if ($qty <= 0) return;
  $itemId = $ctx["item_id"];
  $disposition = $ctx["disposition"];
  if ($disposition === "sellable") {
    pos_q("UPDATE items SET stock_gm = stock_gm + ? WHERE id = ? AND business_id = ?", "dss", [$qty, $itemId, $bid]);
    if (!empty($ctx["batch_id"])) {
      pos_q("UPDATE stock_batches SET remaining_gm = remaining_gm + ? WHERE id = ? AND business_id = ?", "dss", [$qty, $ctx["batch_id"], $bid]);
    }
    if (!empty($ctx["barcode"])) pos_return_restore_barcode($bid, $ctx["barcode"]);
  } else {
    if (!empty($ctx["batch_id"])) {
      pos_q("UPDATE stock_batches SET quarantine_gm = COALESCE(quarantine_gm,0) + ? WHERE id = ? AND business_id = ?", "dss", [$qty, $ctx["batch_id"], $bid]);
    } else {
      $id = pos_uuid();
      pos_q(
        "INSERT INTO stock_batches (id, business_id, branch_id, item_id, batch_no, qty_gm, remaining_gm, quarantine_gm, expiry_date)
         VALUES (?,?,?,?,?,?,0,?,?)",
        "sssssdss",
        [$id, $bid, $branchId, $itemId, $ctx["batch_no"] ?: "RETURN", $qty, $qty, $ctx["expiry"] ?: null]
      );
    }
  }
  if (function_exists("pos_write_stock_movement")) {
    pos_write_stock_movement($bid, $branchId, $uid, $itemId, "sale_return", $qty, $ctx["return_number"] ?? "", [
      "barcode" => $ctx["barcode"] ?? null,
      "batch_id" => $ctx["batch_id"] ?? null,
      "reason" => $disposition,
      "ref_type" => "sale_return",
      "ref_id" => $ctx["return_id"] ?? null,
    ]);
  }
}

function pos_decorate_return_invoice($order, $lines, $items, $returned) {
  $byItem = [];
  foreach ($items as $it) $byItem[$it["id"]] = $it;
  $out = [];
  foreach ($lines as $line) {
    $item = $byItem[$line["item_id"]] ?? [];
    $sold = (float) $line["quantity_gm"];
    $already = (float) ($returned[$line["id"]] ?? 0);
    $line["item_code"] = $item["code"] ?? "";
    $line["size"] = $item["size"] ?? "";
    $line["color"] = $item["color"] ?? "";
    $line["sku"] = $item["code"] ?? ($item["barcode"] ?? "");
    $line["sold_qty"] = $sold;
    $line["returned_qty"] = $already;
    $line["returnable_qty"] = max(0, $sold - $already);
    $out[] = $line;
  }
  $order["lines"] = $out;
  return $order;
}

function pos_dispatch_returns($path, $method, $body, $bid, $branchId, $uid, $auth) {
  pos_ensure_returns_schema();
  $method = strtoupper((string) $method);
  $user = $auth["user"] ?? [];
  if (!pos_can($user, "orders")) pos_send(403, ["error" => "No permission", "php" => true]);

  if ($path === "returns/invoice" && $method === "GET") {
    $q = trim((string) ($_GET["q"] ?? $_GET["order"] ?? $_GET["invoice"] ?? ""));
    if ($q === "") pos_send(400, ["error" => "Enter an invoice or order number", "php" => true]);
    $like = "%" . $q . "%";
    $orders = pos_q(
      "SELECT o.*, COALESCE(NULLIF(TRIM(o.customer_name),''), NULLIF(TRIM(c.business_name),''), NULLIF(TRIM(c.name),''), 'Walk-in') AS customer_name,
              COALESCE(NULLIF(TRIM(o.customer_mobile),''), c.mobile) AS customer_mobile,
              COALESCE(NULLIF(TRIM(o.customer_address),''), c.address) AS customer_address
       FROM sales_orders o
       LEFT JOIN customers c ON c.id = o.customer_id AND c.business_id = o.business_id
       WHERE o.business_id = ? AND o.held = 0
         AND (o.order_number LIKE ? OR o.customer_name LIKE ? OR c.name LIKE ? OR c.mobile LIKE ? OR o.customer_mobile LIKE ?)
       ORDER BY o.created_at DESC LIMIT 20",
      "ssssss",
      [$bid, $like, $like, $like, $like, $like]
    );
    if (!$orders) pos_send(404, ["error" => "No invoice matches that search", "php" => true]);
    $ids = array_column($orders, "id");
    $ph = implode(",", array_fill(0, count($ids), "?"));
    $types = str_repeat("s", count($ids));
    $lines = pos_q("SELECT * FROM sales_order_lines WHERE order_id IN ($ph) ORDER BY created_at", $types, $ids);
    $itemIds = array_values(array_unique(array_filter(array_column($lines, "item_id"))));
    $items = [];
    if ($itemIds) {
      $iph = implode(",", array_fill(0, count($itemIds), "?"));
      $items = pos_q("SELECT id, name, code, barcode, size, color FROM items WHERE id IN ($iph)", str_repeat("s", count($itemIds)), $itemIds);
    }
    $out = [];
    foreach ($orders as $order) {
      $ret = pos_q(
        "SELECT rl.order_line_id, SUM(rl.quantity_gm) AS returned_qty
         FROM sales_return_lines rl JOIN sales_returns r ON r.id = rl.return_id
         WHERE r.order_id = ? AND r.status <> 'cancelled' GROUP BY rl.order_line_id",
        "s",
        [$order["id"]]
      );
      $map = [];
      foreach ($ret as $r) $map[$r["order_line_id"]] = (float) $r["returned_qty"];
      $mine = array_values(array_filter($lines, function ($l) use ($order) { return $l["order_id"] === $order["id"]; }));
      $out[] = pos_decorate_return_invoice($order, $mine, $items, $map);
    }
    pos_send(200, ["ok" => true, "orders" => $out, "php" => true]);
  }

  if ($path === "returns" && $method === "GET") {
    $rows = pos_q(
      "SELECT r.*, COALESCE(
          NULLIF(TRIM(CONCAT(IFNULL(s.first_name,''), ' ', IFNULL(s.last_name,''))), ''),
          NULLIF(TRIM(s.username), ''),
          NULLIF(TRIM(s.email), ''),
          ''
        ) AS staff_name
       FROM sales_returns r LEFT JOIN staff_users s ON s.id = r.created_by
       WHERE r.business_id = ? ORDER BY r.created_at DESC LIMIT 80",
      "s",
      [$bid]
    );
    $ids = array_column($rows, "id");
    $lines = [];
    if ($ids) {
      $ph = implode(",", array_fill(0, count($ids), "?"));
      $lines = pos_q("SELECT * FROM sales_return_lines WHERE return_id IN ($ph) ORDER BY item_name", str_repeat("s", count($ids)), $ids);
    }
    foreach ($rows as &$r) {
      $rid = $r["id"];
      $r["lines"] = array_values(array_filter($lines, function ($l) use ($rid) { return $l["return_id"] === $rid; }));
    }
    pos_send(200, $rows);
  }

  if ($path === "returns" && $method === "POST") {
    $orderId = trim((string) ($body["orderId"] ?? $body["order_id"] ?? ""));
    $wanted = $body["lines"] ?? [];
    if ($orderId === "" || !is_array($wanted) || !$wanted) pos_send(400, ["error" => "Choose an invoice and return quantity", "php" => true]);
    $kind = pos_return_shop_kind($bid);
    $orders = pos_q("SELECT * FROM sales_orders WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$orderId, $bid]);
    if (!$orders) pos_send(404, ["error" => "Invoice not found", "php" => true]);
    $order = $orders[0];
    if (strtolower((string) ($order["status"] ?? "")) === "cancelled") pos_send(400, ["error" => "Voided invoices cannot be returned", "php" => true]);
    $orderLines = pos_q("SELECT * FROM sales_order_lines WHERE order_id = ? AND business_id = ?", "ss", [$orderId, $bid]);
    $byId = [];
    foreach ($orderLines as $l) $byId[$l["id"]] = $l;
    $prior = pos_q(
      "SELECT rl.order_line_id, SUM(rl.quantity_gm) AS returned_qty
       FROM sales_return_lines rl JOIN sales_returns r ON r.id = rl.return_id
       WHERE r.order_id = ? AND r.status <> 'cancelled' GROUP BY rl.order_line_id",
      "s",
      [$orderId]
    );
    $already = [];
    foreach ($prior as $p) $already[$p["order_line_id"]] = (float) $p["returned_qty"];
    $canRelease = in_array($user["role"] ?? "", ["business_admin", "branch_manager", "manager", "stock_manager"], true);
    $built = [];
    foreach ($wanted as $row) {
      $lid = (string) ($row["orderLineId"] ?? $row["order_line_id"] ?? $row["id"] ?? "");
      $line = $byId[$lid] ?? null;
      if (!$line || (int) ($line["cancelled"] ?? 0) === 1) continue;
      $qty = abs((float) ($row["qty"] ?? $row["quantity_gm"] ?? 0));
      if ($qty <= 0) continue;
      $left = max(0, (float) $line["quantity_gm"] - ($already[$line["id"]] ?? 0));
      if ($qty - $left > 0.0005) pos_send(400, ["error" => "Return qty exceeds sold qty for " . $line["item_name"], "php" => true]);
      $items = pos_q("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$line["item_id"], $bid]);
      $item = $items[0] ?? ["id" => $line["item_id"], "name" => $line["item_name"]];
      $condition = strtolower((string) ($row["condition"] ?? $row["condition_label"] ?? ""));
      $disposition = "sellable";
      if ($kind === "pharmacy") $disposition = (!empty($body["sellableStock"]) && $canRelease) ? "sellable" : "quarantine";
      else if ($kind === "apparel") $disposition = ($condition === "damaged" || $condition === "used") ? "quarantine" : "sellable";
      $built[] = ["line" => $line, "item" => $item, "qty" => $qty, "amount" => pos_return_line_refund($line, $qty), "condition" => $condition ?: null, "disposition" => $disposition];
    }
    if (!$built) pos_send(400, ["error" => "Enter a return quantity on at least one item", "php" => true]);
    $refund = 0;
    foreach ($built as $b) $refund += $b["amount"];
    $refund = pos_return_round2($refund);
    $full = true;
    foreach ($orderLines as $l) {
      if ((int) ($l["cancelled"] ?? 0) === 1) continue;
      $take = 0;
      foreach ($built as $b) if ($b["line"]["id"] === $l["id"]) $take = $b["qty"];
      if ((float) $l["quantity_gm"] - ($already[$l["id"]] ?? 0) - $take > 0.0005) $full = false;
    }
    $returnId = pos_uuid();
    $returnNumber = "SR-" . pos_next_seq("sale_return", $bid, 10001);
    $cust = pos_q("SELECT * FROM customers WHERE id = ? LIMIT 1", "s", [$order["customer_id"]]);
    $c = $cust[0] ?? [];
    pos_q(
      "INSERT INTO sales_returns (
         id, business_id, branch_id, return_number, order_id, order_number, customer_id, customer_name, customer_mobile,
         shop_kind, return_type, reason, notes, refund_amount, refund_mode, status, created_by
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      "sssssssssssssdsss",
      [
        $returnId, $bid, $branchId, $returnNumber, $order["id"], $order["order_number"],
        $order["customer_id"], $order["customer_name"] ?: ($c["business_name"] ?? $c["name"] ?? "Walk-in"),
        $order["customer_mobile"] ?: ($c["mobile"] ?? ""),
        $kind, $full ? "full" : "partial", substr((string) ($body["reason"] ?? "other"), 0, 64),
        substr((string) ($body["notes"] ?? ""), 0, 255) ?: null,
        $refund, substr((string) ($body["refundMode"] ?? $body["refund_mode"] ?? "cash"), 0, 32),
        "completed", $uid,
      ]
    );
    foreach ($built as $row) {
      $lid = pos_uuid();
      pos_q(
        "INSERT INTO sales_return_lines (
           id, return_id, business_id, order_line_id, item_id, item_name, item_code, size, color,
           quantity_gm, sold_qty_gm, rate_per_kg, amount, gst_rate, batch_id, batch_no, expiry_date,
           barcode, condition_label, stock_disposition
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        "sssssssssdddddssssss",
        [
          $lid, $returnId, $bid, $row["line"]["id"], $row["item"]["id"], $row["line"]["item_name"], $row["item"]["code"] ?? "",
          $row["item"]["size"] ?? "", $row["item"]["color"] ?? "", $row["qty"], $row["line"]["quantity_gm"], $row["line"]["rate_per_kg"],
          $row["amount"], $row["line"]["gst_rate"], $row["line"]["batch_id"] ?? null, $row["line"]["batch_no"] ?? null,
          $row["line"]["expiry_date"] ?? null, $row["line"]["barcode"] ?? "", $row["condition"], $row["disposition"],
        ]
      );
      pos_apply_return_stock($bid, $branchId, $uid, [
        "item_id" => $row["item"]["id"],
        "item" => $row["item"],
        "qty" => $row["qty"],
        "batch_id" => $row["line"]["batch_id"] ?? null,
        "batch_no" => $row["line"]["batch_no"] ?? null,
        "expiry" => $row["line"]["expiry_date"] ?? null,
        "barcode" => $row["line"]["barcode"] ?? "",
        "disposition" => $row["disposition"],
        "return_id" => $returnId,
        "return_number" => $returnNumber,
      ]);
    }
    $saved = pos_q("SELECT * FROM sales_returns WHERE id = ? LIMIT 1", "s", [$returnId]);
    $savedLines = pos_q("SELECT * FROM sales_return_lines WHERE return_id = ?", "s", [$returnId]);
    $row = $saved[0] ?? [];
    $row["lines"] = $savedLines;
    pos_send(200, ["ok" => true, "return" => $row, "php" => true]);
  }

  return false;
}
