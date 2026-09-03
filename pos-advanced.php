<?php

function pos_adv_round2($n) {
  return round((float) $n, 2);
}

function pos_adv_is_pct($type) {
  $t = strtolower(trim((string) $type));
  return $t === "pct" || $t === "percent" || $t === "%" || $t === "percentage";
}

function pos_adv_discount_amount($base, $type, $value) {
  $amount = pos_adv_round2(max(0, (float) $base));
  $v = max(0, (float) $value);
  if ($amount <= 0 || $v <= 0) return 0.0;
  if (pos_adv_is_pct($type)) return pos_adv_round2(min($amount, ($amount * $v) / 100));
  return pos_adv_round2(min($amount, $v));
}

function pos_ensure_advanced_schema() {
  static $done = false;
  if ($done) return;
  $done = true;
  $db = pos_db();
  if (function_exists("pos_ensure_item_unit_columns")) pos_ensure_item_unit_columns();
  if (function_exists("pos_ensure_columns")) {
    pos_ensure_columns("items", [
      "barcode" => "VARCHAR(64) NULL",
      "mrp" => "DECIMAL(12,2) NULL",
    ]);
    pos_ensure_columns("customers", [
      "dob" => "DATE NULL",
      "referred_by" => "VARCHAR(255) NULL",
    ]);
    pos_ensure_columns("sales_orders", [
      "discount_type" => "VARCHAR(16) NOT NULL DEFAULT 'amt'",
      "discount_value" => "DECIMAL(12,2) NOT NULL DEFAULT 0",
      "loyalty_points_redeemed" => "INT NOT NULL DEFAULT 0",
      "loyalty_points_earned" => "INT NOT NULL DEFAULT 0",
      "loyalty_discount" => "DECIMAL(12,2) NOT NULL DEFAULT 0",
    ]);
    pos_ensure_columns("sales_order_lines", [
      "mrp" => "DECIMAL(12,2) NOT NULL DEFAULT 0",
      "discount_type" => "VARCHAR(16) NOT NULL DEFAULT 'amt'",
      "discount_value" => "DECIMAL(12,2) NOT NULL DEFAULT 0",
      "barcode" => "VARCHAR(64) NULL",
      "batch_id" => "VARCHAR(255) NULL",
      "cost" => "DECIMAL(12,2) NOT NULL DEFAULT 0",
      "profit" => "DECIMAL(12,2) NOT NULL DEFAULT 0",
    ]);
    pos_ensure_columns("purchase_lines", [
      "batch_no" => "VARCHAR(64) NULL",
      "barcode" => "VARCHAR(64) NULL",
      "expiry_date" => "DATE NULL",
      "mrp" => "DECIMAL(12,2) NULL",
    ]);
    pos_ensure_columns("stock_movements", [
      "barcode" => "VARCHAR(64) NULL",
      "batch_id" => "VARCHAR(255) NULL",
      "unit_cost" => "DECIMAL(12,4) NOT NULL DEFAULT 0",
      "reason" => "VARCHAR(64) NULL",
      "ref_type" => "VARCHAR(32) NULL",
      "ref_id" => "VARCHAR(255) NULL",
    ]);
  }
  @$db->query(
    "CREATE TABLE IF NOT EXISTS item_barcodes (
      id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      item_id VARCHAR(255) NOT NULL,
      barcode VARCHAR(64) NOT NULL,
      kind VARCHAR(32) NOT NULL DEFAULT 'own',
      is_primary TINYINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_item_barcode (business_id, barcode),
      INDEX (business_id),
      INDEX (item_id)
    )"
  );
  @$db->query(
    "CREATE TABLE IF NOT EXISTS stock_batches (
      id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      branch_id VARCHAR(255) NULL,
      item_id VARCHAR(255) NOT NULL,
      purchase_id VARCHAR(255) NULL,
      purchase_line_id VARCHAR(255) NULL,
      supplier_id VARCHAR(255) NULL,
      batch_no VARCHAR(64) NULL,
      barcode VARCHAR(64) NULL,
      qty_gm DECIMAL(14,3) NOT NULL DEFAULT 0,
      remaining_gm DECIMAL(14,3) NOT NULL DEFAULT 0,
      unit_cost DECIMAL(12,4) NOT NULL DEFAULT 0,
      mrp DECIMAL(12,2) NULL,
      expiry_date DATE NULL,
      manufactured_date DATE NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX (business_id),
      INDEX (item_id),
      INDEX (purchase_id),
      INDEX (barcode)
    )"
  );
  @$db->query(
    "CREATE TABLE IF NOT EXISTS damage_records (
      id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      branch_id VARCHAR(255) NULL,
      item_id VARCHAR(255) NOT NULL,
      batch_id VARCHAR(255) NULL,
      barcode VARCHAR(64) NULL,
      quantity_gm DECIMAL(14,3) NOT NULL,
      reason VARCHAR(64) NOT NULL DEFAULT 'other',
      note VARCHAR(255) NULL,
      unit_cost DECIMAL(12,4) NOT NULL DEFAULT 0,
      loss_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      recorded_by VARCHAR(255) NULL,
      approved_by VARCHAR(255) NULL,
      approved_at TIMESTAMP(3) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX (business_id),
      INDEX (item_id),
      INDEX (status)
    )"
  );
  @$db->query(
    "CREATE TABLE IF NOT EXISTS loyalty_settings (
      business_id VARCHAR(255) PRIMARY KEY,
      enabled TINYINT NOT NULL DEFAULT 1,
      earn_per_100 DECIMAL(12,4) NOT NULL DEFAULT 1,
      rupees_per_point DECIMAL(12,4) NOT NULL DEFAULT 1,
      min_redeem INT NOT NULL DEFAULT 10,
      expiry_days INT NOT NULL DEFAULT 365,
      birthday_bonus INT NOT NULL DEFAULT 50,
      referral_points INT NOT NULL DEFAULT 25,
      silver_spend DECIMAL(12,2) NOT NULL DEFAULT 10000,
      gold_spend DECIMAL(12,2) NOT NULL DEFAULT 50000,
      platinum_spend DECIMAL(12,2) NOT NULL DEFAULT 150000,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    )"
  );
  @$db->query(
    "CREATE TABLE IF NOT EXISTS loyalty_accounts (
      customer_id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      points_balance INT NOT NULL DEFAULT 0,
      lifetime_earned INT NOT NULL DEFAULT 0,
      lifetime_redeemed INT NOT NULL DEFAULT 0,
      lifetime_spend DECIMAL(12,2) NOT NULL DEFAULT 0,
      tier VARCHAR(16) NOT NULL DEFAULT 'bronze',
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX (business_id)
    )"
  );
  @$db->query(
    "CREATE TABLE IF NOT EXISTS loyalty_ledger (
      id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      customer_id VARCHAR(255) NOT NULL,
      kind VARCHAR(32) NOT NULL,
      points INT NOT NULL,
      rupees DECIMAL(12,2) NOT NULL DEFAULT 0,
      note VARCHAR(255) NULL,
      order_id VARCHAR(255) NULL,
      created_by VARCHAR(255) NULL,
      expires_at TIMESTAMP(3) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX (business_id),
      INDEX (customer_id),
      INDEX (order_id)
    )"
  );
}

function pos_ean13_checksum($digits12) {
  $d = substr(str_pad(preg_replace("/\D/", "", (string) $digits12), 12, "0", STR_PAD_LEFT), 0, 12);
  $sum = 0;
  for ($i = 0; $i < 12; $i++) {
    $sum += intval($d[$i]) * ($i % 2 === 0 ? 1 : 3);
  }
  return (10 - ($sum % 10)) % 10;
}

function pos_new_ean13($bid) {
  $n = pos_next_seq("barcode", $bid, 1);
  $shop = substr(preg_replace("/\D/", "", md5((string) $bid)) . "00000", 0, 5);
  $seq = str_pad((string) ($n % 1000000), 6, "0", STR_PAD_LEFT);
  $body = substr("2" . $shop . $seq, 0, 12);
  return $body . (string) pos_ean13_checksum($body);
}

function pos_barcode_taken($bid, $code, $exceptId = "") {
  $code = trim((string) $code);
  if ($code === "") return false;
  $rows = pos_q("SELECT id FROM item_barcodes WHERE business_id = ? AND barcode = ? LIMIT 1", "ss", [$bid, $code]);
  if ($rows && ($exceptId === "" || ($rows[0]["id"] ?? "") !== $exceptId)) return true;
  $items = pos_q("SELECT id FROM items WHERE business_id = ? AND barcode = ? LIMIT 1", "ss", [$bid, $code]);
  if ($items && ($exceptId === "" || ($items[0]["id"] ?? "") !== $exceptId)) return true;
  $batches = pos_q("SELECT id FROM stock_batches WHERE business_id = ? AND barcode = ? LIMIT 1", "ss", [$bid, $code]);
  return (bool) $batches;
}

function pos_unique_ean13($bid) {
  for ($i = 0; $i < 8; $i++) {
    $code = pos_new_ean13($bid);
    if (!pos_barcode_taken($bid, $code)) return $code;
  }
  return pos_new_ean13($bid) . "X";
}

function pos_attach_item_barcode($bid, $itemId, $code, $kind = "own", $primary = false) {
  $code = trim((string) $code);
  if ($code === "") return null;
  $existing = pos_q(
    "SELECT * FROM item_barcodes WHERE business_id = ? AND barcode = ? LIMIT 1",
    "ss",
    [$bid, $code]
  );
  if ($existing) {
    if (($existing[0]["item_id"] ?? "") !== $itemId) throw new Exception("Barcode already used on another item");
    return $existing[0];
  }
  $id = pos_uuid();
  pos_q(
    "INSERT INTO item_barcodes (id, business_id, item_id, barcode, kind, is_primary) VALUES (?,?,?,?,?,?)",
    "sssssi",
    [$id, $bid, $itemId, $code, $kind, $primary ? 1 : 0]
  );
  if ($primary || $kind === "own") {
    try {
      pos_q("UPDATE items SET barcode = ? WHERE id = ? AND business_id = ?", "sss", [$code, $itemId, $bid]);
    } catch (Exception $e) { /* barcode column optional */ }
  }
  $rows = pos_q("SELECT * FROM item_barcodes WHERE id = ? LIMIT 1", "s", [$id]);
  return $rows[0] ?? null;
}

function pos_parse_manual_barcodes($raw) {
  $parts = is_array($raw) ? $raw : preg_split('/[\s,;]+/', (string) $raw);
  $out = [];
  $seen = [];
  foreach ($parts as $part) {
    $code = preg_replace('/\s+/', '', trim((string) $part));
    if ($code === "") continue;
    if (isset($seen[$code])) throw new Exception("Duplicate barcode {$code}");
    $seen[$code] = true;
    $out[] = $code;
    if (count($out) > 500) throw new Exception("Max 500 barcodes at once");
  }
  return $out;
}

function pos_resolve_purchase_barcodes($item, $qty, $lineIn = []) {
  if (!pos_item_is_count($item)) return [];
  $pieces = max(0, (int) round((float) $qty));
  $raw = array_key_exists("barcodes", $lineIn) ? $lineIn["barcodes"] : ($lineIn["barcode"] ?? []);
  $codes = pos_parse_manual_barcodes($raw);
  if ($pieces < 1) throw new Exception("Quantity required");
  if ($pieces > 500) throw new Exception("Max 500 barcodes at once");
  if (count($codes) !== $pieces) {
    throw new Exception("Enter {$pieces} barcodes for {$pieces} pcs (you entered " . count($codes) . ")");
  }
  return $codes;
}

function pos_assign_item_barcodes($bid, $itemId, $body = []) {
  pos_ensure_advanced_schema();
  $item = pos_q("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$itemId, $bid]);
  $row = $item[0] ?? $body;
  if (!pos_item_is_count($row)) return "";
  $own = trim((string) ($body["barcode"] ?? ""));
  $mfr = trim((string) ($body["mfr_barcode"] ?? $body["manufacturer_barcode"] ?? ""));
  if ($own !== "") pos_attach_item_barcode($bid, $itemId, $own, "own", true);
  if ($mfr !== "" && $mfr !== $own) pos_attach_item_barcode($bid, $itemId, $mfr, "manufacturer", false);
  $extras = pos_parse_manual_barcodes($body["barcodes"] ?? $body["barcode_list"] ?? []);
  foreach ($extras as $code) {
    if ($code !== $own && $code !== $mfr) pos_attach_item_barcode($bid, $itemId, $code, "unit", false);
  }
  return $own;
}

function pos_clamp_barcode_qty($raw) {
  $n = (int) $raw;
  if ($n < 1) throw new Exception("Quantity required");
  if ($n > 500) throw new Exception("Max 500 barcodes at once");
  return $n;
}

function pos_generate_qty_barcodes($bid, $itemId, $qty) {
  pos_ensure_advanced_schema();
  $n = pos_clamp_barcode_qty($qty);
  $item = pos_q("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$itemId, $bid]);
  if (!$item) throw new Exception("Item not found");
  if (!pos_item_is_count($item[0])) throw new Exception("Barcodes are only for Quantity (pcs) items");
  $out = [];
  for ($i = 0; $i < $n; $i++) {
    $code = pos_unique_ean13($bid);
    $out[] = pos_attach_item_barcode($bid, $itemId, $code, "unit", false);
  }
  return $out;
}

function pos_lookup_barcode($bid, $code) {
  pos_ensure_advanced_schema();
  $code = trim((string) $code);
  if ($code === "") return null;
  $batch = pos_q(
    "SELECT b.*, i.name AS item_name, i.code AS item_code, i.retail_rate, i.mrp AS item_mrp, i.gst_rate, i.base_unit, i.unit, i.purchase_rate, i.stock_gm
     FROM stock_batches b JOIN items i ON i.id = b.item_id
     WHERE b.business_id = ? AND b.barcode = ? LIMIT 1",
    "ss",
    [$bid, $code]
  );
  if ($batch) {
    $row = $batch[0];
    $row["source"] = "batch";
    $row["item_id"] = $row["item_id"];
    return $row;
  }
  $bc = pos_q(
    "SELECT ib.*, i.name AS item_name, i.code AS item_code, i.retail_rate, i.mrp AS item_mrp, i.gst_rate, i.base_unit, i.unit, i.purchase_rate, i.stock_gm, i.barcode AS item_barcode
     FROM item_barcodes ib JOIN items i ON i.id = ib.item_id
     WHERE ib.business_id = ? AND ib.barcode = ? LIMIT 1",
    "ss",
    [$bid, $code]
  );
  if ($bc) {
    $row = $bc[0];
    $row["source"] = "item";
    return $row;
  }
  $item = pos_q("SELECT * FROM items WHERE business_id = ? AND barcode = ? LIMIT 1", "ss", [$bid, $code]);
  if ($item) {
    $row = $item[0];
    $row["source"] = "item";
    $row["item_id"] = $row["id"];
    $row["item_name"] = $row["name"];
    $row["item_code"] = $row["code"];
    $row["item_mrp"] = $row["mrp"] ?? $row["retail_rate"];
    return $row;
  }
  return null;
}

function pos_item_is_count($item) {
  if (function_exists("pos_unit_is_count")) return pos_unit_is_count(pos_item_unit($item), $item);
  return pos_item_unit($item) === "PCS";
}

function pos_compute_sale_line($item, $qty, $customer, $lineIn) {
  $isB2b = (($customer["type"] ?? "") === "b2b");
  $rate = $isB2b ? (float) $item["b2b_rate"] : (float) $item["retail_rate"];
  if (isset($lineIn["rate"]) && $lineIn["rate"] !== "" && $lineIn["rate"] !== null) {
    $rate = (float) $lineIn["rate"];
  }
  $isCount = pos_item_is_count($item);
  $gross = pos_adv_round2($isCount ? $qty * $rate : ($qty / 1000) * $rate);
  $mrpRate = (float) ($item["mrp"] ?? 0);
  if ($mrpRate <= 0) $mrpRate = (float) $item["retail_rate"];
  $mrp = pos_adv_round2($isCount ? $qty * $mrpRate : ($qty / 1000) * $mrpRate);
  $costRate = (float) ($item["purchase_rate"] ?? 0);
  $cost = pos_adv_round2($isCount ? $qty * $costRate : ($qty / 1000) * $costRate);
  $dtype = pos_adv_is_pct($lineIn["discountType"] ?? $lineIn["discount_type"] ?? "amt") ? "pct" : "amt";
  $dval = (float) ($lineIn["discountValue"] ?? $lineIn["discount_value"] ?? 0);
  $discount = pos_adv_discount_amount($gross, $dtype, $dval);
  $taxable = pos_adv_round2(max(0, $gross - $discount));
  $gstRate = (float) ($item["gst_rate"] ?? 0);
  $gst = pos_adv_round2(($taxable * $gstRate) / 100);
  return [
    "item" => $item,
    "qty" => $qty,
    "rate" => $rate,
    "gstRate" => $gstRate,
    "amount" => $taxable,
    "gross" => $gross,
    "discount" => $discount,
    "discountType" => $dtype,
    "discountValue" => $dval,
    "gst" => $gst,
    "mrp" => $mrp,
    "cost" => $cost,
    "profit" => pos_adv_round2($taxable - $cost),
    "barcode" => trim((string) ($lineIn["barcode"] ?? "")),
    "batchId" => trim((string) ($lineIn["batchId"] ?? $lineIn["batch_id"] ?? "")),
  ];
}

function pos_write_stock_movement($bid, $branchId, $uid, $itemId, $kind, $qty, $note, $extra = []) {
  try {
    pos_q(
      "INSERT INTO stock_movements (id, business_id, branch_id, item_id, kind, quantity_gm, note, created_by, barcode, batch_id, unit_cost, reason, ref_type, ref_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      "sssssdssssdsss",
      [
        pos_uuid(), $bid, $branchId ? (string) $branchId : null, $itemId, $kind, (float) $qty,
        $note ? (string) $note : null, $uid ? (string) $uid : null,
        $extra["barcode"] ?? null, $extra["batch_id"] ?? null, (float) ($extra["unit_cost"] ?? 0),
        $extra["reason"] ?? null, $extra["ref_type"] ?? null, $extra["ref_id"] ?? null,
      ]
    );
  } catch (Exception $e) {
    try {
      pos_q(
        "INSERT INTO stock_movements (id, business_id, branch_id, item_id, kind, quantity_gm, note, created_by) VALUES (?,?,?,?,?,?,?,?)",
        "sssssdss",
        [pos_uuid(), $bid, $branchId ? (string) $branchId : null, $itemId, $kind, (float) $qty, $note, $uid]
      );
    } catch (Exception $e2) { /* optional */ }
  }
}

function pos_allocate_batches($bid, $itemId, $qty, $preferBarcode = "", $preferBatch = "") {
  $need = (float) $qty;
  $out = [];
  if ($need <= 0) return $out;
  $rows = [];
  if ($preferBatch !== "") {
    $rows = pos_q("SELECT * FROM stock_batches WHERE id = ? AND business_id = ? AND remaining_gm > 0 LIMIT 1", "ss", [$preferBatch, $bid]);
  } elseif ($preferBarcode !== "") {
    $rows = pos_q("SELECT * FROM stock_batches WHERE business_id = ? AND barcode = ? AND remaining_gm > 0 LIMIT 1", "ss", [$bid, $preferBarcode]);
  }
  $fifo = pos_q(
    "SELECT * FROM stock_batches WHERE business_id = ? AND item_id = ? AND remaining_gm > 0
     ORDER BY (expiry_date IS NULL), expiry_date ASC, created_at ASC",
    "ss",
    [$bid, $itemId]
  );
  $seen = [];
  foreach (array_merge($rows, $fifo) as $row) {
    $id = $row["id"];
    if (isset($seen[$id])) continue;
    $seen[$id] = true;
    if ($need <= 0) break;
    $take = min((float) $row["remaining_gm"], $need);
    if ($take <= 0) continue;
    pos_q("UPDATE stock_batches SET remaining_gm = remaining_gm - ? WHERE id = ? AND business_id = ?", "dss", [$take, $id, $bid]);
    $out[] = ["batch" => $row, "qty" => $take];
    $need -= $take;
  }
  return $out;
}

function pos_restore_batches_for_lines($bid, $lines) {
  foreach ($lines as $l) {
    $batchId = $l["batch_id"] ?? "";
    $qty = (float) ($l["quantity_gm"] ?? 0);
    if ($batchId && $qty > 0) {
      try {
        pos_q("UPDATE stock_batches SET remaining_gm = remaining_gm + ? WHERE id = ? AND business_id = ?", "dss", [$qty, $batchId, $bid]);
      } catch (Exception $e) { /* optional */ }
    }
  }
}

function pos_insert_purchase_batch($bid, $branchId, $uid, $purchase, $lineId, $item, $qty, $rate, $barcode, $batchNo, $expiry, $mrp, $kind) {
  $id = pos_uuid();
  pos_q(
    "INSERT INTO stock_batches (
       id, business_id, branch_id, item_id, purchase_id, purchase_line_id, supplier_id,
       batch_no, barcode, qty_gm, remaining_gm, unit_cost, mrp, expiry_date
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    "sssssssssdddds",
    [
      $id, $bid, $branchId ? (string) $branchId : null, $item["id"], $purchase["id"], $lineId,
      $purchase["supplier_id"] ?? null, $batchNo, $barcode, (float) $qty, (float) $qty, (float) $rate, $mrp,
      $expiry !== "" ? $expiry : null,
    ]
  );
  if (trim((string) $barcode) !== "") {
    try {
      pos_attach_item_barcode($bid, $item["id"], $barcode, $kind, false);
    } catch (Exception $e) { /* unique */ }
  }
  pos_write_stock_movement($bid, $branchId, $uid, $item["id"], "purchase", $qty, $batchNo, [
    "barcode" => $barcode, "batch_id" => $id, "unit_cost" => $rate, "ref_type" => "purchase", "ref_id" => $purchase["id"],
  ]);
  return ["id" => $id, "batch_no" => $batchNo, "barcode" => $barcode];
}

function pos_create_purchase_batch($bid, $branchId, $uid, $purchase, $lineId, $item, $qty, $rate, $lineIn = []) {
  pos_ensure_advanced_schema();
  $baseNo = trim((string) ($lineIn["batch_no"] ?? $lineIn["batchNo"] ?? ""));
  if ($baseNo === "") {
    $baseNo = ($purchase["purchase_number"] ?? "PO") . "-" . ($item["code"] ?? "IT") . "-" . substr($lineId, 0, 4);
  }
  $expiry = trim((string) ($lineIn["expiry_date"] ?? $lineIn["expiryDate"] ?? ""));
  $mrp = (float) ($lineIn["mrp"] ?? $item["mrp"] ?? $item["retail_rate"] ?? 0);
  $codes = pos_resolve_purchase_barcodes($item, $qty, $lineIn);
  if ($codes) {
    $rows = [];
    for ($i = 0; $i < count($codes); $i++) {
      $used = pos_q("SELECT id FROM stock_batches WHERE business_id = ? AND barcode = ? AND remaining_gm > 0 LIMIT 1", "ss", [$bid, $codes[$i]]);
      if ($used) throw new Exception("Barcode {$codes[$i]} is already in stock");
      $rows[] = pos_insert_purchase_batch($bid, $branchId, $uid, $purchase, $lineId, $item, 1, $rate, $codes[$i], $baseNo . "-" . str_pad((string) ($i + 1), 3, "0", STR_PAD_LEFT), $expiry, $mrp, "unit");
    }
    try {
      pos_q("UPDATE purchase_lines SET batch_no = ?, barcode = ?, expiry_date = ?, mrp = ? WHERE id = ?", "sssds", [$rows[0]["batch_no"], $rows[0]["barcode"], $expiry !== "" ? $expiry : null, $mrp, $lineId]);
    } catch (Exception $e) { /* optional */ }
    $first = $rows[0];
    $first["barcodes"] = $rows;
    return $first;
  }
  $row = pos_insert_purchase_batch($bid, $branchId, $uid, $purchase, $lineId, $item, $qty, $rate, "", $baseNo, $expiry, $mrp, "batch");
  try {
    pos_q("UPDATE purchase_lines SET batch_no = ?, barcode = ?, expiry_date = ?, mrp = ? WHERE id = ?", "sssds", [$row["batch_no"], $row["barcode"], $expiry !== "" ? $expiry : null, $mrp, $lineId]);
  } catch (Exception $e) { /* optional */ }
  return $row;
}

function pos_loyalty_settings($bid) {
  pos_ensure_advanced_schema();
  $rows = pos_q("SELECT * FROM loyalty_settings WHERE business_id = ? LIMIT 1", "s", [$bid]);
  if ($rows) return $rows[0];
  pos_q(
    "INSERT INTO loyalty_settings (business_id) VALUES (?) ON DUPLICATE KEY UPDATE business_id = business_id",
    "s",
    [$bid]
  );
  $rows = pos_q("SELECT * FROM loyalty_settings WHERE business_id = ? LIMIT 1", "s", [$bid]);
  return $rows[0] ?? [
    "business_id" => $bid, "enabled" => 1, "earn_per_100" => 1, "rupees_per_point" => 1,
    "min_redeem" => 10, "expiry_days" => 365, "birthday_bonus" => 50, "referral_points" => 25,
    "silver_spend" => 10000, "gold_spend" => 50000, "platinum_spend" => 150000,
  ];
}

function pos_loyalty_tier($spend, $settings) {
  $spend = (float) $spend;
  if ($spend >= (float) ($settings["platinum_spend"] ?? 150000)) return "platinum";
  if ($spend >= (float) ($settings["gold_spend"] ?? 50000)) return "gold";
  if ($spend >= (float) ($settings["silver_spend"] ?? 10000)) return "silver";
  return "bronze";
}

function pos_loyalty_recompute($bid, $customerId) {
  $settings = pos_loyalty_settings($bid);
  $rows = pos_q("SELECT * FROM loyalty_ledger WHERE business_id = ? AND customer_id = ? ORDER BY created_at", "ss", [$bid, $customerId]);
  $bal = 0;
  $earned = 0;
  $redeemed = 0;
  $now = time();
  foreach ($rows as $r) {
    $pts = (int) $r["points"];
    $kind = $r["kind"];
    $exp = $r["expires_at"] ?? null;
    if ($pts > 0 && $exp && strtotime((string) $exp) < $now) continue;
    $bal += $pts;
    if ($pts > 0) $earned += $pts;
    if ($kind === "redeem") $redeemed += abs($pts);
  }
  $acc = pos_q("SELECT * FROM loyalty_accounts WHERE customer_id = ? LIMIT 1", "s", [$customerId]);
  $spend = (float) ($acc[0]["lifetime_spend"] ?? 0);
  $tier = pos_loyalty_tier($spend, $settings);
  if ($acc) {
    pos_q(
      "UPDATE loyalty_accounts SET points_balance = ?, lifetime_earned = ?, lifetime_redeemed = ?, tier = ? WHERE customer_id = ?",
      "iiiss",
      [$bal, $earned, $redeemed, $tier, $customerId]
    );
  } else {
    pos_q(
      "INSERT INTO loyalty_accounts (customer_id, business_id, points_balance, lifetime_earned, lifetime_redeemed, lifetime_spend, tier)
       VALUES (?,?,?,?,?,0,?)",
      "ssiiis",
      [$customerId, $bid, $bal, $earned, $redeemed, $tier]
    );
  }
  $rows = pos_q("SELECT * FROM loyalty_accounts WHERE customer_id = ? LIMIT 1", "s", [$customerId]);
  return $rows[0] ?? null;
}

function pos_loyalty_account($bid, $customerId) {
  pos_ensure_advanced_schema();
  $acc = pos_q("SELECT * FROM loyalty_accounts WHERE customer_id = ? AND business_id = ? LIMIT 1", "ss", [$customerId, $bid]);
  if (!$acc) {
    pos_q(
      "INSERT INTO loyalty_accounts (customer_id, business_id, points_balance, lifetime_earned, lifetime_redeemed, lifetime_spend, tier)
       VALUES (?,?,0,0,0,0,'bronze')",
      "ss",
      [$customerId, $bid]
    );
  }
  return pos_loyalty_recompute($bid, $customerId);
}

function pos_loyalty_post($bid, $customerId, $kind, $points, $rupees, $note, $orderId, $uid, $expiresAt = null) {
  pos_q(
    "INSERT INTO loyalty_ledger (id, business_id, customer_id, kind, points, rupees, note, order_id, created_by, expires_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)",
    "ssssidsiss",
    [pos_uuid(), $bid, $customerId, $kind, (int) $points, pos_adv_round2($rupees), $note, $orderId, $uid, $expiresAt]
  );
}

function pos_loyalty_apply_sale($bid, $customer, $orderId, $total, $wantRedeem, $uid) {
  $settings = pos_loyalty_settings($bid);
  $customerId = $customer["id"];
  $acc = pos_loyalty_account($bid, $customerId);
  $redeemPts = 0;
  $redeemRs = 0.0;
  if (!empty($settings["enabled"]) && (int) $wantRedeem > 0) {
    $want = (int) $wantRedeem;
    $min = (int) ($settings["min_redeem"] ?? 10);
    $bal = (int) ($acc["points_balance"] ?? 0);
    if ($want >= $min && $want <= $bal) {
      $rate = (float) ($settings["rupees_per_point"] ?? 1);
      $redeemRs = pos_adv_round2(min($total, $want * $rate));
      $redeemPts = $rate > 0 ? (int) floor($redeemRs / $rate) : 0;
      if ($redeemPts > 0) {
        pos_loyalty_post($bid, $customerId, "redeem", -$redeemPts, $redeemRs, "Bill redeem", $orderId, $uid, null);
      }
    }
  }
  $paid = pos_adv_round2(max(0, $total - $redeemRs));
  $earn = 0;
  if (!empty($settings["enabled"])) {
    $earn = (int) floor(($paid * (float) ($settings["earn_per_100"] ?? 1)) / 100);
    if ($earn > 0) {
      $days = (int) ($settings["expiry_days"] ?? 365);
      $exp = $days > 0 ? date("Y-m-d H:i:s", time() + $days * 86400) : null;
      pos_loyalty_post($bid, $customerId, "earn", $earn, $paid, "Sale earn", $orderId, $uid, $exp);
    }
  }
  $dob = $customer["dob"] ?? "";
  if ($dob && substr((string) $dob, 5, 5) === date("m-d") && (int) ($settings["birthday_bonus"] ?? 0) > 0) {
    $given = pos_q(
      "SELECT id FROM loyalty_ledger WHERE business_id = ? AND customer_id = ? AND kind = 'birthday' AND created_at >= ? LIMIT 1",
      "sss",
      [$bid, $customerId, date("Y") . "-01-01"]
    );
    if (!$given) {
      $bonus = (int) $settings["birthday_bonus"];
      pos_loyalty_post($bid, $customerId, "birthday", $bonus, 0, "Birthday bonus", $orderId, $uid, null);
    }
  }
  $ref = $customer["referred_by"] ?? "";
  if ($ref && (int) ($settings["referral_points"] ?? 0) > 0) {
    $prior = pos_q("SELECT id FROM sales_orders WHERE customer_id = ? AND business_id = ? AND id <> ? LIMIT 1", "sss", [$customerId, $bid, $orderId]);
    $already = pos_q("SELECT id FROM loyalty_ledger WHERE business_id = ? AND customer_id = ? AND kind = 'referral' AND note LIKE ? LIMIT 1", "sss", [$bid, $ref, "%" . $customerId . "%"]);
    if (!$prior && !$already) {
      pos_loyalty_account($bid, $ref);
      pos_loyalty_post($bid, $ref, "referral", (int) $settings["referral_points"], 0, "Referral " . $customerId, $orderId, $uid, null);
    }
  }
  pos_q(
    "UPDATE loyalty_accounts SET lifetime_spend = lifetime_spend + ? WHERE customer_id = ?",
    "ds",
    [$paid, $customerId]
  );
  pos_loyalty_recompute($bid, $customerId);
  return ["points" => $redeemPts, "rupees" => $redeemRs, "earned" => $earn];
}

function pos_apply_damage_stock($bid, $branchId, $uid, $row) {
  $qty = abs((float) $row["quantity_gm"]);
  $itemId = $row["item_id"];
  pos_q("UPDATE items SET stock_gm = stock_gm - ? WHERE id = ? AND business_id = ?", "dss", [$qty, $itemId, $bid]);
  if (!empty($row["batch_id"])) {
    pos_q("UPDATE stock_batches SET remaining_gm = GREATEST(0, remaining_gm - ?) WHERE id = ? AND business_id = ?", "dss", [$qty, $row["batch_id"], $bid]);
  }
  pos_write_stock_movement($bid, $branchId, $uid, $itemId, "damaged", -$qty, $row["note"] ?? $row["reason"], [
    "barcode" => $row["barcode"] ?? null,
    "batch_id" => $row["batch_id"] ?? null,
    "unit_cost" => $row["unit_cost"] ?? 0,
    "reason" => $row["reason"] ?? null,
    "ref_type" => "damage",
    "ref_id" => $row["id"],
  ]);
}

function pos_staff_name_map($bid, $ids) {
  $ids = array_values(array_unique(array_filter($ids)));
  if (!$ids) return [];
  $ph = implode(",", array_fill(0, count($ids), "?"));
  $rows = pos_q(
    "SELECT id, first_name, last_name, email FROM staff_users WHERE business_id = ? AND id IN ($ph)",
    "s" . str_repeat("s", count($ids)),
    array_merge([$bid], $ids)
  );
  $map = [];
  foreach ($rows as $r) {
    $map[$r["id"]] = trim(($r["first_name"] ?? "") . " " . ($r["last_name"] ?? "")) ?: ($r["email"] ?? $r["id"]);
  }
  return $map;
}

function pos_dispatch_advanced($path, $method, $body, $bid, $branchId, $uid, $auth) {
  pos_ensure_advanced_schema();
  $method = strtoupper((string) $method);

  if ($path === "barcodes/lookup" && $method === "GET") {
    $code = trim((string) ($_GET["code"] ?? $_GET["barcode"] ?? ""));
    $row = pos_lookup_barcode($bid, $code);
    if (!$row) pos_send(404, ["error" => "Barcode not found", "php" => true]);
    pos_send(200, ["ok" => true, "match" => $row, "php" => true]);
  }

  if ($path === "barcodes" && $method === "GET") {
    $itemId = trim((string) ($_GET["item_id"] ?? ""));
    $purchaseId = trim((string) ($_GET["purchase_id"] ?? ""));
    if ($purchaseId !== "") {
      $rows = pos_q(
        "SELECT b.*, i.name AS item_name, i.code AS item_code, i.retail_rate, COALESCE(b.mrp, i.mrp, i.retail_rate) AS label_mrp
         FROM stock_batches b JOIN items i ON i.id = b.item_id
         WHERE b.business_id = ? AND b.purchase_id = ? ORDER BY i.name",
        "ss",
        [$bid, $purchaseId]
      );
      pos_send(200, $rows);
    }
    if ($itemId !== "") {
      $rows = pos_q(
        "SELECT ib.*, i.name AS item_name, i.code AS item_code, i.retail_rate, COALESCE(i.mrp, i.retail_rate) AS label_mrp
         FROM item_barcodes ib JOIN items i ON i.id = ib.item_id
         WHERE ib.business_id = ? AND ib.item_id = ? ORDER BY ib.is_primary DESC, ib.created_at",
        "ss",
        [$bid, $itemId]
      );
      pos_send(200, $rows);
    }
    $rows = pos_q(
      "SELECT ib.*, i.name AS item_name, i.code AS item_code, i.retail_rate, COALESCE(i.mrp, i.retail_rate) AS label_mrp, i.stock_gm
       FROM item_barcodes ib JOIN items i ON i.id = ib.item_id
       WHERE ib.business_id = ? ORDER BY i.name, ib.is_primary DESC",
      "s",
      [$bid]
    );
    pos_send(200, $rows);
  }

  if ($path === "barcodes/generate-missing" && $method === "POST") {
    $items = pos_q("SELECT id, barcode, base_unit, unit FROM items WHERE business_id = ?", "s", [$bid]);
    $made = 0;
    foreach ($items as $it) {
      if (!pos_item_is_count($it)) continue;
      $has = pos_q("SELECT id FROM item_barcodes WHERE business_id = ? AND item_id = ? LIMIT 1", "ss", [$bid, $it["id"]]);
      if ($has) continue;
      pos_assign_item_barcodes($bid, $it["id"], ["barcode" => $it["barcode"] ?? ""]);
      $made++;
    }
    pos_send(200, ["ok" => true, "generated" => $made, "php" => true]);
  }

  if ($path === "barcodes/generate-qty" && $method === "POST") {
    $itemId = trim((string) ($body["item_id"] ?? $body["itemId"] ?? ""));
    $qty = $body["qty"] ?? $body["quantity"] ?? $body["barcode_qty"] ?? 0;
    try {
      $rows = pos_generate_qty_barcodes($bid, $itemId, $qty);
    } catch (Exception $e) {
      pos_send(400, ["error" => $e->getMessage(), "php" => true]);
    }
    pos_send(200, ["ok" => true, "generated" => count($rows), "barcodes" => $rows, "php" => true]);
  }

  if (preg_match('#^items/([^/]+)/barcodes$#', $path, $m) && $method === "POST") {
    $item = pos_q("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$m[1], $bid]);
    if (!$item) pos_send(400, ["error" => "Item not found", "php" => true]);
    if (!pos_item_is_count($item[0])) pos_send(400, ["error" => "Barcodes are only for Quantity (pcs) items", "php" => true]);
    $kind = trim((string) ($body["kind"] ?? "own")) ?: "own";
    if (!in_array($kind, ["own", "manufacturer", "batch", "unit"], true)) $kind = "own";
    $code = trim((string) ($body["barcode"] ?? ""));
    if ($code === "") $code = pos_unique_ean13($bid);
    try {
      $row = pos_attach_item_barcode($bid, $m[1], $code, $kind, $kind === "own");
    } catch (Exception $e) {
      pos_send(400, ["error" => $e->getMessage(), "php" => true]);
    }
    pos_send(200, ["ok" => true, "barcode" => $row, "php" => true]);
  }

  if (preg_match('#^barcodes/([^/]+)$#', $path, $m) && $method === "DELETE") {
    pos_q("DELETE FROM item_barcodes WHERE id = ? AND business_id = ?", "ss", [$m[1], $bid]);
    pos_send(200, ["ok" => true, "php" => true]);
  }

  if ($path === "batches" && $method === "GET") {
    $itemId = trim((string) ($_GET["item_id"] ?? ""));
    $sql = "SELECT b.*, i.name AS item_name, i.code AS item_code, s.name AS supplier_name
            FROM stock_batches b
            JOIN items i ON i.id = b.item_id
            LEFT JOIN suppliers s ON s.id = b.supplier_id
            WHERE b.business_id = ?";
    $args = [$bid];
    $types = "s";
    if ($itemId !== "") {
      $sql .= " AND b.item_id = ?";
      $types .= "s";
      $args[] = $itemId;
    }
    $sql .= " ORDER BY b.created_at DESC LIMIT 300";
    pos_send(200, pos_q($sql, $types, $args));
  }

  if ($path === "stock/ledger" || $path === "stock/movements") {
    if ($method !== "GET") pos_send(405, ["error" => "Use GET"]);
    $kind = trim((string) ($_GET["kind"] ?? ""));
    $itemId = trim((string) ($_GET["item_id"] ?? ""));
    $sql = "SELECT m.*, i.name AS item_name, i.code AS item_code
            FROM stock_movements m JOIN items i ON i.id = m.item_id
            WHERE m.business_id = ?";
    $args = [$bid];
    $types = "s";
    if ($kind !== "") {
      $sql .= " AND m.kind = ?";
      $types .= "s";
      $args[] = $kind;
    }
    if ($itemId !== "") {
      $sql .= " AND m.item_id = ?";
      $types .= "s";
      $args[] = $itemId;
    }
    $sql .= " ORDER BY m.created_at DESC LIMIT 400";
    $rows = pos_q($sql, $types, $args);
    $map = pos_staff_name_map($bid, array_column($rows, "created_by"));
    foreach ($rows as &$r) $r["staff_name"] = $map[$r["created_by"] ?? ""] ?? "";
    pos_send(200, $rows);
  }

  if ($path === "damage" && $method === "GET") {
    $status = trim((string) ($_GET["status"] ?? ""));
    $sql = "SELECT d.*, i.name AS item_name, i.code AS item_code, b.batch_no
            FROM damage_records d
            JOIN items i ON i.id = d.item_id
            LEFT JOIN stock_batches b ON b.id = d.batch_id
            WHERE d.business_id = ?";
    $args = [$bid];
    $types = "s";
    if ($status !== "") {
      $sql .= " AND d.status = ?";
      $types .= "s";
      $args[] = $status;
    }
    $sql .= " ORDER BY d.created_at DESC LIMIT 300";
    $rows = pos_q($sql, $types, $args);
    $ids = array_merge(array_column($rows, "recorded_by"), array_column($rows, "approved_by"));
    $map = pos_staff_name_map($bid, $ids);
    foreach ($rows as &$r) {
      $r["recorded_name"] = $map[$r["recorded_by"] ?? ""] ?? "";
      $r["approved_name"] = $map[$r["approved_by"] ?? ""] ?? "";
    }
    pos_send(200, $rows);
  }

  if ($path === "damage/report" && $method === "GET") {
    $rows = pos_q(
      "SELECT reason, status, COUNT(*) AS entries, SUM(quantity_gm) AS qty, SUM(loss_amount) AS loss
       FROM damage_records WHERE business_id = ? GROUP BY reason, status",
      "s",
      [$bid]
    );
    pos_send(200, ["ok" => true, "rows" => $rows, "php" => true]);
  }

  if ($path === "damage" && $method === "POST") {
    $itemId = trim((string) ($body["item_id"] ?? ""));
    $qty = abs((float) ($body["quantity_gm"] ?? 0));
    if ($itemId === "" || $qty <= 0) pos_send(400, ["error" => "Item and quantity required"]);
    $it = pos_q("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$itemId, $bid]);
    if (!$it) pos_send(400, ["error" => "Item not found"]);
    $item = $it[0];
    $reason = trim((string) ($body["reason"] ?? "other")) ?: "other";
    $barcode = trim((string) ($body["barcode"] ?? ""));
    $batchId = trim((string) ($body["batch_id"] ?? ""));
    if ($barcode !== "" && $batchId === "") {
      $found = pos_lookup_barcode($bid, $barcode);
      if ($found && ($found["item_id"] ?? "") === $itemId) {
        $batchId = $found["id"] ?? ($found["batch_id"] ?? "");
        if (($found["source"] ?? "") !== "batch") $batchId = $found["id"] && isset($found["remaining_gm"]) ? $found["id"] : $batchId;
      }
    }
    $unitCost = (float) ($item["purchase_rate"] ?? 0);
    if ($batchId) {
      $b = pos_q("SELECT * FROM stock_batches WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$batchId, $bid]);
      if ($b) $unitCost = (float) ($b[0]["unit_cost"] ?? $unitCost);
    }
    $isCount = pos_item_is_count($item);
    $loss = pos_adv_round2($isCount ? $qty * $unitCost : ($qty / 1000) * $unitCost);
    $role = $auth["user"]["role"] ?? "";
    $auto = in_array($role, ["business_admin", "branch_manager", "manager", "stock_manager"], true);
    $status = !empty($body["auto_approve"]) || $auto ? "approved" : "pending";
    $id = pos_uuid();
    pos_q(
      "INSERT INTO damage_records (
         id, business_id, branch_id, item_id, batch_id, barcode, quantity_gm, reason, note,
         unit_cost, loss_amount, status, recorded_by, approved_by, approved_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      "ssssssdssddssss",
      [
        $id, $bid, $branchId ? (string) $branchId : null, $itemId, $batchId !== "" ? $batchId : null,
        $barcode !== "" ? $barcode : ($item["barcode"] ?? null), $qty, $reason, $body["note"] ?? null,
        $unitCost, $loss, $status, $uid, $status === "approved" ? $uid : null,
        $status === "approved" ? date("Y-m-d H:i:s") : null,
      ]
    );
    $rows = pos_q("SELECT * FROM damage_records WHERE id = ? LIMIT 1", "s", [$id]);
    $row = $rows[0];
    if ($status === "approved") pos_apply_damage_stock($bid, $branchId, $uid, $row);
    pos_send(200, ["ok" => true, "damage" => $row, "php" => true]);
  }

  if (preg_match('#^damage/([^/]+)/(approve|reject)$#', $path, $m) && $method === "POST") {
    $id = $m[1];
    $act = $m[2];
    $rows = pos_q("SELECT * FROM damage_records WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$id, $bid]);
    if (!$rows) pos_send(404, ["error" => "Damage record not found"]);
    $row = $rows[0];
    if (($row["status"] ?? "") !== "pending") pos_send(400, ["error" => "Already processed"]);
    if ($act === "reject") {
      pos_q("UPDATE damage_records SET status = 'rejected', approved_by = ?, approved_at = NOW() WHERE id = ?", "ss", [$uid, $id]);
    } else {
      pos_q("UPDATE damage_records SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?", "ss", [$uid, $id]);
      $row["status"] = "approved";
      pos_apply_damage_stock($bid, $branchId, $uid, $row);
    }
    $fresh = pos_q("SELECT * FROM damage_records WHERE id = ? LIMIT 1", "s", [$id]);
    pos_send(200, ["ok" => true, "damage" => $fresh[0] ?? $row, "php" => true]);
  }

  if ($path === "loyalty/settings" && $method === "GET") {
    pos_send(200, pos_loyalty_settings($bid));
  }

  if ($path === "loyalty/settings" && $method === "PUT") {
    $cur = pos_loyalty_settings($bid);
    $fields = [
      "enabled" => isset($body["enabled"]) ? (!empty($body["enabled"]) ? 1 : 0) : (int) $cur["enabled"],
      "earn_per_100" => (float) ($body["earn_per_100"] ?? $cur["earn_per_100"]),
      "rupees_per_point" => (float) ($body["rupees_per_point"] ?? $cur["rupees_per_point"]),
      "min_redeem" => (int) ($body["min_redeem"] ?? $cur["min_redeem"]),
      "expiry_days" => (int) ($body["expiry_days"] ?? $cur["expiry_days"]),
      "birthday_bonus" => (int) ($body["birthday_bonus"] ?? $cur["birthday_bonus"]),
      "referral_points" => (int) ($body["referral_points"] ?? $cur["referral_points"]),
      "silver_spend" => (float) ($body["silver_spend"] ?? $cur["silver_spend"]),
      "gold_spend" => (float) ($body["gold_spend"] ?? $cur["gold_spend"]),
      "platinum_spend" => (float) ($body["platinum_spend"] ?? $cur["platinum_spend"]),
    ];
    pos_q(
      "UPDATE loyalty_settings SET enabled=?, earn_per_100=?, rupees_per_point=?, min_redeem=?, expiry_days=?,
         birthday_bonus=?, referral_points=?, silver_spend=?, gold_spend=?, platinum_spend=?
       WHERE business_id=?",
      "iddiiiiddds",
      [
        $fields["enabled"], $fields["earn_per_100"], $fields["rupees_per_point"], $fields["min_redeem"], $fields["expiry_days"],
        $fields["birthday_bonus"], $fields["referral_points"], $fields["silver_spend"], $fields["gold_spend"], $fields["platinum_spend"],
        $bid,
      ]
    );
    pos_send(200, ["ok" => true, "settings" => pos_loyalty_settings($bid), "php" => true]);
  }

  if (preg_match('#^loyalty/customer/([^/]+)$#', $path, $m) && $method === "GET") {
    $acc = pos_loyalty_account($bid, $m[1]);
    $hist = pos_q(
      "SELECT * FROM loyalty_ledger WHERE business_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT 80",
      "ss",
      [$bid, $m[1]]
    );
    pos_send(200, ["ok" => true, "account" => $acc, "ledger" => $hist, "settings" => pos_loyalty_settings($bid), "php" => true]);
  }

  if ($path === "loyalty/adjust" && $method === "POST") {
    $customerId = trim((string) ($body["customer_id"] ?? ""));
    $points = (int) ($body["points"] ?? 0);
    if ($customerId === "" || $points === 0) pos_send(400, ["error" => "Customer and points required"]);
    pos_loyalty_account($bid, $customerId);
    $days = (int) (pos_loyalty_settings($bid)["expiry_days"] ?? 365);
    $exp = $points > 0 && $days > 0 ? date("Y-m-d H:i:s", time() + $days * 86400) : null;
    pos_loyalty_post($bid, $customerId, "adjust", $points, 0, $body["note"] ?? "Manual adjustment", null, $uid, $exp);
    pos_send(200, ["ok" => true, "account" => pos_loyalty_recompute($bid, $customerId), "php" => true]);
  }

  if ($path === "loyalty/birthday" && $method === "POST") {
    $customerId = trim((string) ($body["customer_id"] ?? ""));
    $cust = pos_q("SELECT * FROM customers WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$customerId, $bid]);
    if (!$cust) pos_send(400, ["error" => "Customer not found"]);
    $settings = pos_loyalty_settings($bid);
    $bonus = (int) ($settings["birthday_bonus"] ?? 0);
    if ($bonus <= 0) pos_send(400, ["error" => "Birthday bonus is 0"]);
    pos_loyalty_account($bid, $customerId);
    pos_loyalty_post($bid, $customerId, "birthday", $bonus, 0, "Birthday bonus", null, $uid, null);
    pos_send(200, ["ok" => true, "account" => pos_loyalty_recompute($bid, $customerId), "php" => true]);
  }

  return false;
}
