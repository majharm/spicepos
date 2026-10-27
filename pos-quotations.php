<?php
/** Quotations on the PHP fallback. A quotation does not post stock, take payment, or create a sales invoice. */

class PosQuoteHttp extends Exception {
  public $status;
  function __construct($status, $message) {
    parent::__construct($message);
    $this->status = (int) $status;
  }
}

function pos_quote_ensure() {
  static $done = false;
  if ($done) return;
  if (function_exists("pos_ensure_columns")) {
    pos_ensure_columns("company_settings", [
      "quotations_enabled" => "TINYINT(1) NOT NULL DEFAULT 0",
      "quotation_valid_days" => "INT NOT NULL DEFAULT 15",
      "quotation_terms" => "TEXT NULL",
    ]);
    pos_ensure_columns("sales_orders", [
      "quotation_id" => "VARCHAR(36) NULL",
    ]);
  }
  $db = pos_db();
  if (!$db->query("CREATE TABLE IF NOT EXISTS quotations (
    id VARCHAR(36) PRIMARY KEY,
    business_id VARCHAR(36) NOT NULL,
    quotation_number VARCHAR(32) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'draft',
    customer_id VARCHAR(36) NULL,
    customer_name VARCHAR(180) NULL,
    customer_phone VARCHAR(32) NULL,
    customer_email VARCHAR(160) NULL,
    billing_address VARCHAR(500) NULL,
    shipping_address VARCHAR(500) NULL,
    quotation_date DATE NOT NULL,
    valid_until DATE NULL,
    reference_no VARCHAR(64) NULL,
    salesperson VARCHAR(120) NULL,
    subtotal DECIMAL(14,4) NOT NULL DEFAULT 0,
    discount DECIMAL(14,4) NOT NULL DEFAULT 0,
    discount_type VARCHAR(8) NULL,
    discount_value DECIMAL(14,4) NOT NULL DEFAULT 0,
    extra_charges DECIMAL(14,4) NOT NULL DEFAULT 0,
    gst DECIMAL(14,4) NOT NULL DEFAULT 0,
    cgst DECIMAL(14,4) NOT NULL DEFAULT 0,
    sgst DECIMAL(14,4) NOT NULL DEFAULT 0,
    igst DECIMAL(14,4) NOT NULL DEFAULT 0,
    round_off DECIMAL(14,4) NOT NULL DEFAULT 0,
    total DECIMAL(14,4) NOT NULL DEFAULT 0,
    terms TEXT NULL,
    notes TEXT NULL,
    lines_json MEDIUMTEXT NOT NULL,
    order_id VARCHAR(36) NULL,
    order_number VARCHAR(32) NULL,
    converted_at TIMESTAMP(3) NULL,
    created_by VARCHAR(36) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_quote_no (business_id, quotation_number),
    INDEX (business_id, status),
    INDEX (business_id, quotation_date)
  )")) {
    throw new Exception($db->error ?: "Could not prepare quotations");
  }
  if (!$db->query("CREATE TABLE IF NOT EXISTS quotation_events (
    id VARCHAR(36) PRIMARY KEY,
    business_id VARCHAR(36) NOT NULL,
    quotation_id VARCHAR(36) NOT NULL,
    action VARCHAR(32) NOT NULL,
    from_status VARCHAR(24) NULL,
    to_status VARCHAR(24) NULL,
    note VARCHAR(255) NULL,
    created_by VARCHAR(36) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (quotation_id),
    INDEX (business_id, quotation_id)
  )")) {
    throw new Exception($db->error ?: "Could not prepare quotation history");
  }
  $done = true;
}

function pos_quote_exec($sql, $types, $params) {
  $db = pos_db();
  $st = $db->prepare($sql);
  if (!$st) throw new Exception($db->error ?: "SQL error");
  if ($types !== "") {
    $bind = [$types];
    foreach ($params as $i => $value) {
      $bind[] = &$params[$i];
    }
    call_user_func_array([$st, "bind_param"], $bind);
  }
  if (!$st->execute()) {
    $err = $st->error;
    $st->close();
    throw new Exception($err ?: "SQL error");
  }
  $affected = $st->affected_rows;
  $st->close();
  return $affected;
}

function pos_quote_flag($raw) {
  return $raw === true || $raw === 1 || $raw === "1";
}

function pos_quote_clip($value, $max) {
  $s = trim((string) $value);
  if (function_exists("mb_substr")) return mb_substr($s, 0, $max);
  return substr($s, 0, $max);
}

function pos_quote_num($value) {
  return is_numeric($value) ? (float) $value : 0.0;
}

function pos_quote_ymd($value) {
  $s = substr(trim((string) $value), 0, 10);
  return preg_match("/^\d{4}-\d{2}-\d{2}$/", $s) ? $s : "";
}

function pos_quote_today() {
  $tzName = function_exists("pos_shop_timezone") ? pos_shop_timezone() : "Asia/Kolkata";
  try {
    return (new DateTime("now", new DateTimeZone($tzName)))->format("Y-m-d");
  } catch (Exception $e) {
    return (new DateTime("now", new DateTimeZone("Asia/Kolkata")))->format("Y-m-d");
  }
}

function pos_quote_add_days($from, $days) {
  $d = DateTime::createFromFormat("!Y-m-d", pos_quote_ymd($from));
  if (!$d) return "";
  $d->modify("+" . max(0, (int) $days) . " days");
  return $d->format("Y-m-d");
}

function pos_quote_status($raw) {
  $s = strtolower(trim((string) $raw));
  $s = preg_replace("/\s+/", "_", $s);
  if ($s === "converted_to_invoice") return "converted";
  $ok = ["draft", "sent", "accepted", "rejected", "expired", "converted", "cancelled"];
  return in_array($s, $ok, true) ? $s : "draft";
}

function pos_quote_label($raw) {
  $map = [
    "draft" => "Draft",
    "sent" => "Sent",
    "accepted" => "Accepted",
    "rejected" => "Rejected",
    "expired" => "Expired",
    "converted" => "Converted to Invoice",
    "cancelled" => "Cancelled",
  ];
  $s = pos_quote_status($raw);
  return $map[$s] ?? "Draft";
}

function pos_quote_effective($row, $today) {
  $status = pos_quote_status($row["status"] ?? "");
  if (in_array($status, ["converted", "cancelled", "rejected", "expired"], true)) return $status;
  $until = pos_quote_ymd($row["valid_until"] ?? "");
  $day = pos_quote_ymd($today);
  if ($until !== "" && $day !== "" && $until < $day) return "expired";
  return $status;
}

function pos_quote_is_pct($type) {
  $t = strtolower(trim((string) $type));
  return $t === "pct" || $t === "percent" || $t === "%" || $t === "percentage";
}

function pos_quote_discount($base, $type, $value) {
  $amount = pos_round8(max(0, (float) $base));
  $v = max(0, (float) $value);
  if ($amount <= 0 || $v <= 0) return 0.0;
  if (pos_quote_is_pct($type)) return pos_round8(min($amount, ($amount * $v) / 100));
  return pos_round8(min($amount, $v));
}

function pos_quote_is_count($line) {
  if (is_array($line) && array_key_exists("isCount", $line) && ($line["isCount"] === true || $line["isCount"] === false || $line["isCount"] === 1 || $line["isCount"] === 0 || $line["isCount"] === "1" || $line["isCount"] === "0")) {
    return $line["isCount"] === true || $line["isCount"] === 1 || $line["isCount"] === "1";
  }
  $unit = strtoupper(trim((string) (is_array($line) ? ($line["unit"] ?? $line["base_unit"] ?? "PCS") : "PCS")));
  return !in_array($unit, ["GM", "KG", "G"], true);
}

function pos_quote_split($gst, $inter) {
  $total = pos_round8($gst);
  if ($inter) return ["cgst" => 0.0, "sgst" => 0.0, "igst" => $total];
  $cgst = pos_round8($total / 2);
  return ["cgst" => $cgst, "sgst" => pos_round8($total - $cgst), "igst" => 0.0];
}

function pos_quote_line($raw) {
  $qty = pos_quote_num($raw["quantity"] ?? $raw["qty"] ?? $raw["quantity_gm"] ?? 0);
  if ($qty <= 0) return null;
  $rate = pos_quote_num($raw["rate"] ?? 0);
  $gstRate = pos_quote_num($raw["gstRate"] ?? $raw["gst_rate"] ?? 0);
  $isCount = pos_quote_is_count($raw);
  $gross = pos_round8($isCount ? $qty * $rate : ($qty / 1000) * $rate);
  $dtype = pos_quote_is_pct($raw["discountType"] ?? $raw["discount_type"] ?? "amt") ? "pct" : "amt";
  $dval = pos_quote_num($raw["discountValue"] ?? $raw["discount_value"] ?? 0);
  $discount = pos_quote_discount($gross, $dtype, $dval);
  $taxable = pos_round8(max(0, $gross - $discount));
  $gst = pos_round8(($taxable * $gstRate) / 100);
  return [
    "itemId" => trim((string) ($raw["itemId"] ?? $raw["item_id"] ?? "")),
    "sku" => pos_quote_clip($raw["sku"] ?? $raw["code"] ?? "", 64),
    "name" => pos_quote_clip($raw["name"] ?? $raw["item_name"] ?? "Item", 180) ?: "Item",
    "description" => pos_quote_clip($raw["description"] ?? "", 500),
    "quantity" => $qty,
    "unit" => pos_quote_clip($raw["unit"] ?? $raw["base_unit"] ?? "PCS", 16) ?: "PCS",
    "isCount" => $isCount,
    "rate" => $rate,
    "discountType" => $dtype,
    "discountValue" => $dval,
    "discount" => $discount,
    "gstRate" => $gstRate,
    "gst" => $gst,
    "taxable" => $taxable,
    "total" => pos_round8($taxable + $gst),
    "size" => pos_quote_clip($raw["size"] ?? "", 32),
    "color" => pos_quote_clip($raw["color"] ?? "", 32),
  ];
}

function pos_quote_prepare_lines($bid, $rawLines) {
  if (!is_array($rawLines)) $rawLines = [];
  $out = [];
  foreach ($rawLines as $raw) {
    if (!is_array($raw)) continue;
    $itemId = trim((string) ($raw["itemId"] ?? $raw["item_id"] ?? ""));
    $qty = pos_quote_num($raw["quantity"] ?? $raw["qty"] ?? $raw["quantity_gm"] ?? 0);
    if ($itemId === "" && $qty <= 0) continue;
    if ($itemId === "") throw new PosQuoteHttp(400, "Choose a product or service for every line");
    if ($qty <= 0) throw new PosQuoteHttp(400, "Enter a quantity for every line");
    $rows = pos_q("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$itemId, $bid]);
    $item = $rows[0] ?? null;
    if (!$item) throw new PosQuoteHttp(400, "Choose a product or service for every line");
    $raw["itemId"] = $itemId;
    $raw["name"] = $item["name"] ?? ($raw["name"] ?? "Item");
    if (trim((string) ($raw["sku"] ?? $raw["code"] ?? "")) === "") $raw["sku"] = $item["code"] ?? ($item["sku"] ?? "");
    if (trim((string) ($raw["unit"] ?? "")) === "") $raw["unit"] = $item["base_unit"] ?? ($item["unit"] ?? "PCS");
    if (!array_key_exists("gstRate", $raw) && !array_key_exists("gst_rate", $raw)) $raw["gstRate"] = $item["gst_rate"] ?? 0;
    if (trim((string) ($raw["size"] ?? "")) === "" && !empty($item["size"])) $raw["size"] = $item["size"];
    if (trim((string) ($raw["color"] ?? "")) === "" && !empty($item["color"])) $raw["color"] = $item["color"];
    $line = pos_quote_line($raw);
    if ($line) $out[] = $line;
  }
  if (!$out) throw new PosQuoteHttp(400, "Add at least one product or service");
  return $out;
}

function pos_quote_price($bid, $body, $shop, $customer) {
  $lines = pos_quote_prepare_lines($bid, $body["lines"] ?? []);
  $subtotal = 0.0;
  $gst = 0.0;
  foreach ($lines as $line) {
    $subtotal += (float) $line["taxable"];
    $gst += (float) $line["gst"];
  }
  $subtotal = pos_round8($subtotal);
  $gst = pos_round8($gst);
  $dtype = pos_quote_is_pct($body["discount_type"] ?? $body["discountType"] ?? "amt") ? "pct" : "amt";
  $dval = pos_quote_num($body["discount_value"] ?? $body["discountValue"] ?? 0);
  $billDiscount = pos_quote_discount($subtotal + $gst, $dtype, $dval);
  $charges = pos_round8(max(0, pos_quote_num($body["extra_charges"] ?? $body["extraCharges"] ?? 0)));
  $roundOff = pos_round8(pos_quote_num($body["round_off"] ?? $body["roundOff"] ?? 0));
  $inter = false;
  if (is_file(__DIR__ . "/pos-gst-supply.php")) {
    require_once __DIR__ . "/pos-gst-supply.php";
    $inter = pos_is_inter_state_supply(
      ["gstin" => ($shop["gstin"] ?? "") !== "" ? $shop["gstin"] : ($shop["settings_gstin"] ?? ""), "state" => $shop["state"] ?? ""],
      ["gstin" => $customer["gstin"] ?? "", "state" => $customer["state"] ?? ""]
    );
  }
  $tax = pos_quote_split($gst, $inter);
  $total = pos_round8(max(0, pos_round8($subtotal + $gst - $billDiscount) + $charges + $roundOff));
  return array_merge([
    "lines" => $lines,
    "subtotal" => $subtotal,
    "discount" => $billDiscount,
    "discountType" => $dtype,
    "discountValue" => $dval,
    "extraCharges" => $charges,
    "gst" => $gst,
    "roundOff" => $roundOff,
    "total" => $total,
  ], $tax);
}

function pos_quote_shop($bid) {
  $rows = pos_q(
    "SELECT b.name, b.phone, b.email, b.gstin, b.address, b.state, b.category, b.logo_url,
            s.quotations_enabled, s.quotation_valid_days, s.quotation_terms, s.invoice_terms, s.timezone, s.gstin AS settings_gstin
     FROM businesses b
     LEFT JOIN company_settings s ON s.business_id = b.id
     WHERE b.id = ? LIMIT 1",
    "s",
    [$bid]
  );
  return $rows[0] ?? [];
}

function pos_quote_require_on($bid) {
  $shop = pos_quote_shop($bid);
  if (!pos_quote_flag($shop["quotations_enabled"] ?? 0)) {
    throw new PosQuoteHttp(403, "Turn on Enable Quotations in Business Settings before using quotations.");
  }
  return $shop;
}

function pos_quote_public($row, $today) {
  if (!$row) return null;
  $lines = json_decode((string) ($row["lines_json"] ?? "[]"), true);
  if (!is_array($lines)) $lines = [];
  $out = $row;
  unset($out["lines_json"]);
  $out["lines"] = $lines;
  $out["stored_status"] = pos_quote_status($row["status"] ?? "");
  $out["status"] = pos_quote_effective($row, $today);
  return $out;
}

function pos_quote_load($bid, $id) {
  $rows = pos_q("SELECT * FROM quotations WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$id, $bid]);
  return $rows[0] ?? null;
}

function pos_quote_event($bid, $quotationId, $action, $from, $to, $note, $uid) {
  pos_quote_exec(
    "INSERT INTO quotation_events (id, business_id, quotation_id, action, from_status, to_status, note, created_by) VALUES (?,?,?,?,?,?,?,?)",
    "ssssssss",
    [
      pos_uuid(),
      $bid,
      $quotationId,
      pos_quote_clip($action, 32),
      $from !== "" ? pos_quote_clip($from, 24) : null,
      $to !== "" ? pos_quote_clip($to, 24) : null,
      pos_quote_clip($note, 255) !== "" ? pos_quote_clip($note, 255) : null,
      $uid ?: null,
    ]
  );
}

function pos_quote_expire($bid, $today) {
  pos_quote_exec(
    "UPDATE quotations SET status = 'expired'
     WHERE business_id = ? AND valid_until IS NOT NULL AND valid_until < ?
       AND status IN ('draft','sent','accepted') AND order_id IS NULL",
    "ss",
    [$bid, $today]
  );
}

function pos_quote_summarize($rows) {
  $stats = [
    "total" => 0, "draft" => 0, "sent" => 0, "accepted" => 0, "rejected" => 0,
    "expired" => 0, "converted" => 0, "cancelled" => 0, "quotedValue" => 0, "acceptedValue" => 0,
  ];
  $keys = ["draft", "sent", "accepted", "rejected", "expired", "converted", "cancelled"];
  foreach ($rows as $row) {
    $status = (string) ($row["status"] ?? "");
    $stats["total"]++;
    if (in_array($status, $keys, true)) $stats[$status]++;
    $total = pos_round8($row["total"] ?? 0);
    $stats["quotedValue"] = pos_round8($stats["quotedValue"] + $total);
    if ($status === "accepted" || $status === "converted") $stats["acceptedValue"] = pos_round8($stats["acceptedValue"] + $total);
  }
  return $stats;
}

function pos_quote_customer_name($customer) {
  $name = trim((string) ($customer["business_name"] ?? ""));
  if ($name === "") $name = trim((string) ($customer["name"] ?? ""));
  return $name;
}

function pos_quote_input($bid, $body, $shop, $customer) {
  $date = pos_quote_ymd($body["quotation_date"] ?? $body["quotationDate"] ?? "") ?: pos_quote_today();
  $days = max(0, min(365, (int) ($shop["quotation_valid_days"] ?? 15)));
  $valid = pos_quote_ymd($body["valid_until"] ?? $body["validUntil"] ?? "") ?: pos_quote_add_days($date, $days);
  $priced = pos_quote_price($bid, $body, $shop, $customer);
  $terms = pos_quote_clip($body["terms"] ?? "", 4000);
  if ($terms === "") $terms = pos_quote_clip($shop["quotation_terms"] ?? ($shop["invoice_terms"] ?? ""), 4000);
  return [
    "date" => $date,
    "valid" => $valid,
    "reference" => pos_quote_clip($body["reference_no"] ?? $body["reference"] ?? "", 64),
    "salesperson" => pos_quote_clip($body["salesperson"] ?? "", 120),
    "shipping" => pos_quote_clip($body["shipping_address"] ?? $body["shippingAddress"] ?? "", 500),
    "billing" => pos_quote_clip($body["billing_address"] ?? $body["billingAddress"] ?? ($customer["address"] ?? ""), 500),
    "phone" => pos_quote_clip($body["customer_phone"] ?? $body["customerPhone"] ?? ($customer["mobile"] ?? ""), 32),
    "email" => pos_quote_clip($body["customer_email"] ?? $body["customerEmail"] ?? ($customer["email"] ?? ""), 160),
    "notes" => pos_quote_clip($body["notes"] ?? "", 4000),
    "terms" => $terms,
    "priced" => $priced,
    "name" => pos_quote_clip($body["customer_name"] ?? pos_quote_customer_name($customer), 180),
  ];
}

function pos_quote_insert_row($bid, $id, $number, $status, $customerId, $input, $uid) {
  $p = $input["priced"];
  $cols = [
    "id", "business_id", "quotation_number", "status", "customer_id", "customer_name", "customer_phone", "customer_email",
    "billing_address", "shipping_address", "quotation_date", "valid_until", "reference_no", "salesperson",
    "subtotal", "discount", "discount_type", "discount_value", "extra_charges", "gst", "cgst", "sgst", "igst", "round_off", "total",
    "terms", "notes", "lines_json", "created_by",
  ];
  $params = [
    $id, $bid, $number, $status, $customerId, $input["name"], $input["phone"], $input["email"] !== "" ? $input["email"] : null,
    $input["billing"] !== "" ? $input["billing"] : null, $input["shipping"] !== "" ? $input["shipping"] : null,
    $input["date"], $input["valid"] !== "" ? $input["valid"] : null,
    $input["reference"] !== "" ? $input["reference"] : null, $input["salesperson"] !== "" ? $input["salesperson"] : null,
    (string) $p["subtotal"], (string) $p["discount"], $p["discountType"], (string) $p["discountValue"], (string) $p["extraCharges"],
    (string) $p["gst"], (string) $p["cgst"], (string) $p["sgst"], (string) $p["igst"], (string) $p["roundOff"], (string) $p["total"],
    $input["terms"] !== "" ? $input["terms"] : null, $input["notes"] !== "" ? $input["notes"] : null,
    json_encode($p["lines"], JSON_UNESCAPED_UNICODE), $uid ?: null,
  ];
  if (count($cols) !== count($params)) throw new Exception("Quotation save is incomplete");
  pos_quote_exec(
    "INSERT INTO quotations (" . implode(",", $cols) . ") VALUES (" . implode(",", array_fill(0, count($cols), "?")) . ")",
    str_repeat("s", count($params)),
    $params
  );
}

function pos_quote_settings_payload($shop) {
  return [
    "valid_days" => (int) ($shop["quotation_valid_days"] ?? 15) ?: 15,
    "terms" => (string) ($shop["quotation_terms"] ?? ""),
  ];
}

function pos_quote_list($bid, $query) {
  $shop = pos_quote_shop($bid);
  $today = pos_quote_today();
  $settings = pos_quote_settings_payload($shop);
  if (!pos_quote_flag($shop["quotations_enabled"] ?? 0)) {
    return [
      "enabled" => false,
      "today" => $today,
      "quotes" => [],
      "stats" => pos_quote_summarize([]),
      "shop" => $shop,
      "settings" => $settings,
    ];
  }
  pos_quote_expire($bid, $today);
  $rows = pos_q(
    "SELECT * FROM quotations WHERE business_id = ? ORDER BY quotation_date DESC, quotation_number DESC LIMIT 500",
    "s",
    [$bid]
  );
  $all = [];
  foreach ($rows as $row) $all[] = pos_quote_public($row, $today);
  $quotes = $all;
  $q = strtolower(trim((string) ($query["q"] ?? "")));
  $status = trim((string) ($query["status"] ?? ""));
  $from = pos_quote_ymd($query["from"] ?? "");
  $to = pos_quote_ymd($query["to"] ?? "");
  $customerId = trim((string) ($query["customer_id"] ?? ""));
  $salesperson = strtolower(trim((string) ($query["salesperson"] ?? "")));
  if ($status !== "") {
    $want = pos_quote_status($status);
    $quotes = array_values(array_filter($quotes, function ($row) use ($want) { return $row["status"] === $want; }));
  }
  if ($customerId !== "") {
    $quotes = array_values(array_filter($quotes, function ($row) use ($customerId) { return (string) ($row["customer_id"] ?? "") === $customerId; }));
  }
  if ($from !== "") {
    $quotes = array_values(array_filter($quotes, function ($row) use ($from) { return substr((string) ($row["quotation_date"] ?? ""), 0, 10) >= $from; }));
  }
  if ($to !== "") {
    $quotes = array_values(array_filter($quotes, function ($row) use ($to) { return substr((string) ($row["quotation_date"] ?? ""), 0, 10) <= $to; }));
  }
  if ($salesperson !== "") {
    $quotes = array_values(array_filter($quotes, function ($row) use ($salesperson) {
      return strpos(strtolower((string) ($row["salesperson"] ?? "")), $salesperson) !== false;
    }));
  }
  if ($q !== "") {
    $quotes = array_values(array_filter($quotes, function ($row) use ($q) {
      $hay = strtolower(($row["quotation_number"] ?? "") . " " . ($row["customer_name"] ?? "") . " " . ($row["reference_no"] ?? "") . " " . ($row["salesperson"] ?? ""));
      return strpos($hay, $q) !== false;
    }));
  }
  return [
    "enabled" => true,
    "today" => $today,
    "stats" => pos_quote_summarize($all),
    "quotes" => $quotes,
    "settings" => $settings,
    "shop" => $shop,
  ];
}

function pos_quote_save_new($bid, $body, $uid) {
  $shop = pos_quote_require_on($bid);
  $customerId = trim((string) ($body["customer_id"] ?? $body["customerId"] ?? ""));
  $customers = pos_q("SELECT * FROM customers WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$customerId, $bid]);
  $customer = $customers[0] ?? null;
  if (!$customer) throw new PosQuoteHttp(400, "Choose a customer");
  $input = pos_quote_input($bid, $body, $shop, $customer);
  $id = pos_uuid();
  $status = pos_quote_status($body["status"] ?? "") === "sent" ? "sent" : "draft";
  $number = "";
  pos_with_transaction(function () use ($bid, $id, &$number, $status, $customer, $input, $uid) {
    $number = sprintf("QT-%05d", (int) pos_next_seq("quotation", $bid, 1));
    pos_quote_insert_row($bid, $id, $number, $status, $customer["id"], $input, $uid);
    pos_quote_event($bid, $id, "created", "", $status, $number, $uid);
  });
  return pos_quote_public(pos_quote_load($bid, $id), pos_quote_today());
}

function pos_quote_update($bid, $id, $body, $uid) {
  $shop = pos_quote_require_on($bid);
  $today = pos_quote_today();
  $existing = pos_quote_load($bid, $id);
  if (!$existing) throw new PosQuoteHttp(404, "Quotation not found");
  $current = pos_quote_public($existing, $today);
  if (($current["status"] ?? "") !== "draft" || !empty($existing["order_id"])) {
    throw new PosQuoteHttp(400, "Only a draft quotation can be edited");
  }
  $customerId = trim((string) ($body["customer_id"] ?? $body["customerId"] ?? $existing["customer_id"] ?? ""));
  $customers = pos_q("SELECT * FROM customers WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$customerId, $bid]);
  $customer = $customers[0] ?? null;
  if (!$customer) throw new PosQuoteHttp(400, "Choose a customer");
  if (!isset($body["lines"])) $body["lines"] = $current["lines"];
  $input = pos_quote_input($bid, $body, $shop, $customer);
  $p = $input["priced"];
  $params = [
    $customer["id"], $input["name"], $input["phone"], $input["email"] !== "" ? $input["email"] : null,
    $input["billing"] !== "" ? $input["billing"] : null, $input["shipping"] !== "" ? $input["shipping"] : null,
    $input["date"], $input["valid"] !== "" ? $input["valid"] : null,
    $input["reference"] !== "" ? $input["reference"] : null, $input["salesperson"] !== "" ? $input["salesperson"] : null,
    (string) $p["subtotal"], (string) $p["discount"], $p["discountType"], (string) $p["discountValue"], (string) $p["extraCharges"],
    (string) $p["gst"], (string) $p["cgst"], (string) $p["sgst"], (string) $p["igst"], (string) $p["roundOff"], (string) $p["total"],
    $input["terms"] !== "" ? $input["terms"] : null, $input["notes"] !== "" ? $input["notes"] : null,
    json_encode($p["lines"], JSON_UNESCAPED_UNICODE), $existing["id"], $bid,
  ];
  $n = pos_quote_exec(
    "UPDATE quotations SET customer_id=?, customer_name=?, customer_phone=?, customer_email=?, billing_address=?, shipping_address=?,
      quotation_date=?, valid_until=?, reference_no=?, salesperson=?, subtotal=?, discount=?, discount_type=?, discount_value=?,
      extra_charges=?, gst=?, cgst=?, sgst=?, igst=?, round_off=?, total=?, terms=?, notes=?, lines_json=?
     WHERE id=? AND business_id=? AND status='draft'",
    str_repeat("s", count($params)),
    $params
  );
  if ($n < 1) {
    $still = pos_quote_load($bid, $existing["id"]);
    if (!$still || ($still["status"] ?? "") !== "draft") throw new PosQuoteHttp(400, "Only a draft quotation can be edited");
  }
  pos_quote_event($bid, $existing["id"], "updated", "draft", "draft", "", $uid);
  return pos_quote_public(pos_quote_load($bid, $existing["id"]), $today);
}

function pos_quote_duplicate($bid, $id, $uid) {
  pos_quote_require_on($bid);
  $existing = pos_quote_load($bid, $id);
  if (!$existing) throw new PosQuoteHttp(404, "Quotation not found");
  $shop = pos_quote_shop($bid);
  $newId = pos_uuid();
  $date = pos_quote_today();
  $days = max(1, (int) ($shop["quotation_valid_days"] ?? 15));
  $number = "";
  pos_with_transaction(function () use ($bid, $existing, $newId, &$number, $date, $days, $uid) {
    $number = sprintf("QT-%05d", (int) pos_next_seq("quotation", $bid, 1));
    pos_quote_exec(
      "INSERT INTO quotations (
        id, business_id, quotation_number, status, customer_id, customer_name, customer_phone, customer_email,
        billing_address, shipping_address, quotation_date, valid_until, reference_no, salesperson,
        subtotal, discount, discount_type, discount_value, extra_charges, gst, cgst, sgst, igst, round_off, total,
        terms, notes, lines_json, created_by
      ) SELECT ?, business_id, ?, 'draft', customer_id, customer_name, customer_phone, customer_email,
        billing_address, shipping_address, ?, ?, reference_no, salesperson,
        subtotal, discount, discount_type, discount_value, extra_charges, gst, cgst, sgst, igst, round_off, total,
        terms, notes, lines_json, ?
       FROM quotations WHERE id = ? AND business_id = ?",
      "sssssss",
      [$newId, $number, $date, pos_quote_add_days($date, $days), $uid ?: null, $existing["id"], $bid]
    );
    pos_quote_event($bid, $newId, "duplicated", "", "draft", $existing["quotation_number"] ?? "", $uid);
  });
  return pos_quote_public(pos_quote_load($bid, $newId), $date);
}

function pos_quote_set_status($bid, $id, $nextRaw, $note, $uid) {
  pos_quote_require_on($bid);
  $today = pos_quote_today();
  $existing = pos_quote_load($bid, $id);
  if (!$existing) throw new PosQuoteHttp(404, "Quotation not found");
  $current = pos_quote_effective($existing, $today);
  $next = pos_quote_status($nextRaw);
  $allowed = [
    "draft" => ["sent", "cancelled"],
    "sent" => ["accepted", "rejected", "cancelled"],
    "accepted" => ["cancelled"],
  ];
  if (!in_array($next, $allowed[$current] ?? [], true)) {
    throw new PosQuoteHttp(400, "Cannot mark a " . strtolower(pos_quote_label($current)) . " quotation as " . strtolower(pos_quote_label($next)));
  }
  $n = pos_quote_exec(
    "UPDATE quotations SET status = ? WHERE id = ? AND business_id = ? AND order_id IS NULL",
    "sss",
    [$next, $existing["id"], $bid]
  );
  if ($n < 1) throw new PosQuoteHttp(400, "This quotation can no longer change status");
  pos_quote_event($bid, $existing["id"], $next, $current, $next, $note, $uid);
  return pos_quote_public(pos_quote_load($bid, $existing["id"]), $today);
}

function pos_quote_share($bid, $id, $channel, $uid) {
  pos_quote_require_on($bid);
  $existing = pos_quote_load($bid, $id);
  if (!$existing) throw new PosQuoteHttp(404, "Quotation not found");
  $channel = strtolower((string) $channel) === "email" ? "email" : "whatsapp";
  $status = pos_quote_status($existing["status"] ?? "");
  if ($status === "draft") {
    pos_quote_exec("UPDATE quotations SET status = 'sent' WHERE id = ? AND business_id = ?", "ss", [$existing["id"], $bid]);
    $status = "sent";
  }
  pos_quote_event($bid, $existing["id"], $channel === "whatsapp" ? "whatsapp" : "shared", $existing["status"] ?? "", $status, $channel, $uid);
  return pos_quote_public(pos_quote_load($bid, $existing["id"]), pos_quote_today());
}

function pos_quote_ascii($value) {
  $s = str_replace("₹", "Rs ", (string) $value);
  $s = preg_replace('/[^\x20-\x7E]/', " ", $s);
  $s = preg_replace('/\s+/', " ", (string) $s);
  return trim((string) $s);
}

function pos_quote_pdf_escape($value) {
  return str_replace(["\\", "(", ")"], ["\\\\", "\\(", "\\)"], pos_quote_ascii($value));
}

function pos_quote_pdf($company, $quote) {
  $shop = pos_quote_ascii($company["name"] ?? "") ?: "Shop";
  $rows = [
    $shop,
    pos_quote_ascii($company["address"] ?? ""),
    trim(implode("   ", array_filter([
      !empty($company["phone"]) ? "Phone " . pos_quote_ascii($company["phone"]) : "",
      !empty($company["gstin"]) ? "GSTIN " . pos_quote_ascii($company["gstin"]) : "",
    ]))),
    "QUOTATION",
    "QUOTATION - NOT A TAX INVOICE",
    "Number " . (pos_quote_ascii($quote["quotation_number"] ?? "") ?: "Quotation"),
    "Date " . pos_quote_ascii($quote["quotation_date"] ?? ""),
    "Valid until " . pos_quote_ascii($quote["valid_until"] ?? ""),
    "Customer " . (pos_quote_ascii($quote["customer_name"] ?? "") ?: "Customer"),
    !empty($quote["billing_address"]) ? pos_quote_ascii($quote["billing_address"]) : "",
    "Item                          Qty        Rate       Amount",
  ];
  $items = is_array($quote["lines"] ?? null) ? $quote["lines"] : [];
  $shown = array_slice($items, 0, 18);
  foreach ($shown as $line) {
    $name = str_pad(substr(pos_quote_ascii($line["name"] ?? "Item"), 0, 28), 28, " ");
    $qty = str_pad(substr(pos_quote_ascii($line["quantity"] ?? ""), 0, 8), 8, " ", STR_PAD_LEFT);
    $rate = str_pad("Rs " . number_format((float) ($line["rate"] ?? 0), 2, ".", ""), 12, " ", STR_PAD_LEFT);
    $amount = str_pad("Rs " . number_format((float) ($line["total"] ?? $line["amount"] ?? 0), 2, ".", ""), 12, " ", STR_PAD_LEFT);
    $rows[] = $name . $qty . $rate . $amount;
  }
  if (count($items) > count($shown)) $rows[] = "+ " . (count($items) - count($shown)) . " more lines on the printed quotation";
  if ((float) ($quote["subtotal"] ?? 0)) $rows[] = "Subtotal Rs " . number_format((float) $quote["subtotal"], 2, ".", "");
  if ((float) ($quote["discount"] ?? 0)) $rows[] = "Discount Rs " . number_format((float) $quote["discount"], 2, ".", "");
  if ((float) ($quote["gst"] ?? 0)) $rows[] = "Tax Rs " . number_format((float) $quote["gst"], 2, ".", "");
  $rows[] = "Grand total Rs " . number_format((float) ($quote["total"] ?? 0), 2, ".", "");
  $rows[] = "This document is a quotation, not a tax invoice.";
  $rows[] = "Stock and payment are unchanged until a sales invoice is posted.";
  $rows[] = "Page 1";
  $rows = array_values(array_filter($rows, function ($line) { return $line !== ""; }));
  $commands = ["BT", "/F1 11 Tf", "48 800 Td", "14 TL"];
  foreach ($rows as $index => $line) {
    $text = "(" . substr(pos_quote_pdf_escape($line), 0, 110) . ")";
    $commands[] = $index === 0 ? "{$text} Tj" : "{$text} '";
  }
  $commands[] = "ET";
  $stream = implode("\n", $commands);
  $objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "<< /Length " . strlen($stream) . " >>\nstream\n{$stream}\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  $body = "%PDF-1.4\n";
  $offsets = [0];
  foreach ($objects as $index => $obj) {
    $offsets[] = strlen($body);
    $body .= ($index + 1) . " 0 obj\n{$obj}\nendobj\n";
  }
  $xrefAt = strlen($body);
  $xref = "xref\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";
  for ($i = 1; $i < count($offsets); $i++) $xref .= str_pad((string) $offsets[$i], 10, "0", STR_PAD_LEFT) . " 00000 n \n";
  $body .= $xref . "trailer << /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n{$xrefAt}\n%%EOF";
  return $body;
}

function pos_quote_subject($number, $shop) {
  $name = trim((string) $shop) ?: "Shop";
  return "Quotation " . trim((string) $number) . " – " . $name;
}

function pos_quote_email($bid, $id, $toRaw, $uid) {
  $shop = pos_quote_require_on($bid);
  $existing = pos_quote_load($bid, $id);
  if (!$existing) throw new PosQuoteHttp(404, "Quotation not found");
  $quote = pos_quote_public($existing, pos_quote_today());
  if (($quote["status"] ?? "") === "cancelled") throw new PosQuoteHttp(400, "A cancelled quotation cannot be emailed");
  $to = trim((string) ($toRaw !== "" ? $toRaw : ($quote["customer_email"] ?? "")));
  if (!preg_match("/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/", $to)) throw new PosQuoteHttp(400, "Enter the customer email before sending");
  if (is_file(__DIR__ . "/pos-business-email.php")) require_once __DIR__ . "/pos-business-email.php";
  if (is_file(__DIR__ . "/pos-mail.php")) require_once __DIR__ . "/pos-mail.php";
  $mailbox = function_exists("pos_bizmail_load") ? pos_bizmail_load($bid) : null;
  if (empty($mailbox["smtp_pass_enc"]) || empty($mailbox["from_email"])) {
    throw new PosQuoteHttp(400, "Save the mailbox before sending a quotation");
  }
  $subject = pos_quote_subject($quote["quotation_number"] ?? "", $shop["name"] ?? "");
  $text = $subject . "\n\nThis quotation is not a tax invoice. Total " . number_format((float) ($quote["total"] ?? 0), 2, ".", "") . ". Valid until " . ($quote["valid_until"] ?? "") . ".";
  $pdf = pos_quote_pdf(
    ["name" => $shop["name"] ?? "", "address" => $shop["address"] ?? "", "phone" => $shop["phone"] ?? "", "gstin" => ($shop["gstin"] ?? "") !== "" ? $shop["gstin"] : ($shop["settings_gstin"] ?? "")],
    $quote
  );
  $cfg = function_exists("pos_bizmail_smtp") ? pos_bizmail_smtp($mailbox, $shop) : [];
  $sent = function_exists("pos_send_mail")
    ? pos_send_mail($to, $subject, $text, "<p>" . htmlspecialchars($subject, ENT_QUOTES, "UTF-8") . "</p><p>This quotation is not a tax invoice.</p>", "", [
        ["filename" => "Quotation-" . ($quote["quotation_number"] ?? "quote") . ".pdf", "mimeType" => "application/pdf", "content" => $pdf],
      ], null, $cfg)
    : ["ok" => false, "error" => "Email is not available"];
  $ok = !empty($sent["ok"]);
  $next = (($quote["stored_status"] ?? "") === "draft" && $ok) ? "sent" : ($quote["stored_status"] ?? "draft");
  if ($next !== ($quote["stored_status"] ?? "")) {
    pos_quote_exec("UPDATE quotations SET status = 'sent' WHERE id = ? AND business_id = ?", "ss", [$existing["id"], $bid]);
  }
  $fail = pos_quote_clip($sent["error"] ?? "Email was not sent", 180);
  pos_quote_event($bid, $existing["id"], $ok ? "emailed" : "email_failed", $quote["stored_status"] ?? "", $next, $ok ? $to : $fail, $uid);
  return [
    "ok" => $ok,
    "error" => $ok ? "" : ($sent["error"] ?? "Email was not sent"),
    "to" => $to,
    "subject" => $subject,
    "quote" => pos_quote_public(pos_quote_load($bid, $existing["id"]), pos_quote_today()),
  ];
}

function pos_quote_skips_stock($item) {
  $unit = strtoupper(trim((string) ($item["base_unit"] ?? $item["unit"] ?? "")));
  if ($unit === "SERVICE") return true;
  return strtolower(trim((string) ($item["kind"] ?? $item["item_kind"] ?? ""))) === "service";
}

function pos_quote_convert($bid, $id, $auth) {
  $shop = pos_quote_require_on($bid);
  $today = pos_quote_today();
  $uid = $auth["user"]["id"] ?? null;
  $branchId = $auth["branchId"] ?? ($auth["user"]["branch_id"] ?? null);
  if (is_file(__DIR__ . "/pos-advanced.php")) require_once __DIR__ . "/pos-advanced.php";
  if (is_file(__DIR__ . "/pos-checkout.php")) require_once __DIR__ . "/pos-checkout.php";
  if (is_file(__DIR__ . "/pos-accounting.php")) require_once __DIR__ . "/pos-accounting.php";
  if (function_exists("pos_ensure_advanced_schema")) pos_ensure_advanced_schema();
  if (function_exists("pos_ensure_sales_schema")) pos_ensure_sales_schema();
  return pos_with_transaction(function () use ($bid, $id, $auth, $today, $uid, $branchId, $shop) {
    $rows = pos_q("SELECT * FROM quotations WHERE id = ? AND business_id = ? FOR UPDATE", "ss", [$id, $bid]);
    $existing = $rows[0] ?? null;
    if (!$existing) throw new PosQuoteHttp(404, "Quotation not found");
    if (!empty($existing["order_id"])) {
      return [
        "replay" => true,
        "orderId" => $existing["order_id"],
        "orderNumber" => $existing["order_number"],
        "quote" => pos_quote_public($existing, $today),
      ];
    }
    $status = pos_quote_effective($existing, $today);
    if ($status === "expired") throw new PosQuoteHttp(400, "This quotation has expired");
    if ($status !== "accepted") throw new PosQuoteHttp(400, "Accept the quotation before converting it to an invoice");
    $customers = pos_q("SELECT * FROM customers WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$existing["customer_id"], $bid]);
    $customer = $customers[0] ?? null;
    if (!$customer) throw new Exception("Customer not found");
    $lines = json_decode((string) ($existing["lines_json"] ?? "[]"), true);
    if (!is_array($lines) || !$lines) throw new Exception("Add at least one product or service");
    $built = [];
    foreach ($lines as $line) {
      $items = pos_q("SELECT * FROM items WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$line["itemId"] ?? "", $bid]);
      $item = $items[0] ?? null;
      if (!$item) throw new Exception("A quoted product is no longer on this business");
      if (!empty($line["size"])) $item["size"] = $line["size"];
      if (!empty($line["color"])) $item["color"] = $line["color"];
      $qty = (float) ($line["quantity"] ?? 0);
      if ($qty <= 0) throw new Exception("Invalid quantity");
      $built[] = ["item" => $item, "line" => $line, "qty" => $qty, "skipStock" => pos_quote_skips_stock($item)];
    }
    $stockLines = [];
    foreach ($built as $row) {
      if (!$row["skipStock"]) $stockLines[] = ["item" => $row["item"], "qty" => $row["qty"]];
    }
    if ($stockLines && function_exists("pos_assert_apparel_sale_stock")) pos_assert_apparel_sale_stock($bid, $stockLines);
    $orderNumber = "SO-" . pos_next_seq("order", $bid, 10001);
    $orderId = pos_uuid();
    $subtotal = (float) ($existing["subtotal"] ?? 0);
    $discount = (float) ($existing["discount"] ?? 0);
    $gst = (float) ($existing["gst"] ?? 0);
    $total = (float) ($existing["total"] ?? 0);
    $totalQty = 0.0;
    foreach ($built as $row) $totalQty += (float) $row["qty"];
    pos_q(
      "INSERT INTO sales_orders (
         id, order_number, customer_id, customer_name, customer_type,
         pack_id, pack_name, pack_count, status, total_quantity_gm,
         subtotal, discount, gst, total, payment_method, payment_status, business_id,
         branch_id, cashier_id
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      "sssssssssssssssssss",
      [
        $orderId, $orderNumber, $customer["id"], $existing["customer_name"] ?: pos_quote_customer_name($customer), (string) ($customer["type"] ?? "b2c"),
        null, null, null, "confirmed", (string) $totalQty,
        (string) $subtotal, (string) $discount, (string) $gst, (string) $total, "credit", "unpaid", $bid,
        $branchId ? (string) $branchId : null, $uid ? (string) $uid : null,
      ]
    );
    try {
      pos_q("UPDATE sales_orders SET quotation_id = ? WHERE id = ? AND business_id = ?", "sss", [$existing["id"], $orderId, $bid]);
    } catch (Exception $e) { /* column arrives with the quotation schema */ }
    $extra = (float) ($existing["extra_charges"] ?? 0);
    if ($extra > 0) {
      try {
        pos_q("UPDATE sales_orders SET extra_charges = ? WHERE id = ? AND business_id = ?", "sss", [(string) $extra, $orderId, $bid]);
      } catch (Exception $e) { /* optional */ }
    }
    $billing = trim((string) ($existing["billing_address"] ?? ""));
    $phone = preg_replace("/\D+/", "", (string) ($existing["customer_phone"] ?? ""));
    if (strlen($phone) > 15) $phone = substr($phone, 0, 15);
    if ($billing !== "" || $phone !== "") {
      try {
        pos_q(
          "UPDATE sales_orders SET customer_address = ?, customer_mobile = ? WHERE id = ? AND business_id = ?",
          "ssss",
          [$billing !== "" ? $billing : null, $phone !== "" ? $phone : null, $orderId, $bid]
        );
      } catch (Exception $e) { /* optional bill columns */ }
    }
    foreach ($built as $row) {
      $line = $row["line"];
      $item = $row["item"];
      $lineId = pos_uuid();
      $name = trim((string) ($line["name"] ?? ""));
      if ($name === "" && function_exists("pos_item_bill_name")) $name = pos_item_bill_name($item);
      $taxable = isset($line["taxable"]) ? (float) $line["taxable"] : max(0, (float) ($line["total"] ?? 0) - (float) ($line["gst"] ?? 0));
      pos_q(
        "INSERT INTO sales_order_lines (
           id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
           discount, amount, gst_rate, cancelled, business_id
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        "sssssssssss",
        [
          $lineId, $orderId, $item["id"], $name !== "" ? $name : "Item", (string) $row["qty"], (string) ($line["rate"] ?? 0),
          (string) ($line["discount"] ?? 0), (string) $taxable, (string) ($line["gstRate"] ?? 0), "0", $bid,
        ]
      );
      if (function_exists("pos_persist_sale_line_note")) pos_persist_sale_line_note($lineId, $line["description"] ?? "");
      if (function_exists("pos_stamp_sale_line_variant")) pos_stamp_sale_line_variant($lineId, $item);
      if ($row["skipStock"]) continue;
      $stockQty = function_exists("pos_pack_stock_qty") ? (float) pos_pack_stock_qty($item, $row["qty"]) : (float) $row["qty"];
      if (function_exists("pos_allocate_batches")) {
        $allocs = pos_allocate_batches($bid, $item["id"], $stockQty, $line["sku"] ?? "", "");
        foreach ($allocs as $al) {
          if (function_exists("pos_write_stock_movement")) {
            pos_write_stock_movement($bid, $branchId, $uid, $item["id"], "sale", -((float) $al["qty"]), $orderNumber, [
              "barcode" => $al["batch"]["barcode"] ?? null,
              "batch_id" => $al["batch"]["id"] ?? null,
              "unit_cost" => $al["batch"]["unit_cost"] ?? 0,
              "ref_type" => "sale",
              "ref_id" => $orderId,
            ]);
          }
        }
      }
      pos_q("UPDATE items SET stock_gm = stock_gm - ? WHERE id = ? AND business_id = ?", "dss", [$stockQty, $item["id"], $bid]);
    }
    pos_settle_customer_invoice($customer, $total, "credit", $orderId, $orderNumber, $bid, $uid, 0);
    $orders = pos_q("SELECT * FROM sales_orders WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$orderId, $bid]);
    $order = $orders[0] ?? ["id" => $orderId, "order_number" => $orderNumber, "total" => $total, "payment_method" => "credit", "business_id" => $bid];
    if (function_exists("pos_post_sale_journal")) {
      try { pos_post_sale_journal($bid, $uid, $order); } catch (Throwable $e) { /* journal follows other credit invoices */ }
    }
    $updated = pos_quote_exec(
      "UPDATE quotations SET status = 'converted', order_id = ?, order_number = ?, converted_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND business_id = ? AND order_id IS NULL AND status = 'accepted'",
      "ssss",
      [$orderId, $orderNumber, $existing["id"], $bid]
    );
    if ($updated < 1) throw new PosQuoteHttp(409, "This quotation was already converted");
    pos_quote_event($bid, $existing["id"], "converted", "accepted", "converted", $orderNumber, $uid);
    return [
      "replay" => false,
      "orderId" => $orderId,
      "orderNumber" => $orderNumber,
      "quote" => pos_quote_public(pos_quote_load($bid, $existing["id"]), $today),
    ];
  });
}

function pos_quotations_dispatch($path, $method, $body, $bid, $auth) {
  if ($path !== "quotations" && strpos($path, "quotations/") !== 0) return false;
  $user = $auth["user"] ?? [];
  $uid = $user["id"] ?? null;
  $method = strtoupper((string) $method);
  $body = is_array($body) ? $body : [];
  $settings = $path === "quotations/settings";
  if ($settings) {
    if (!pos_can($user, "settings")) pos_send(403, ["error" => "You do not have permission for this module", "php" => true]);
  } elseif (!pos_can($user, "orders")) {
    pos_send(403, ["error" => "You do not have permission for this module", "php" => true]);
  }
  try {
    pos_quote_ensure();
    if ($settings && $method === "POST") {
      $days = max(1, min(365, (int) ($body["valid_days"] ?? $body["quotation_valid_days"] ?? 15)));
      $terms = pos_quote_clip($body["terms"] ?? $body["quotation_terms"] ?? "", 4000);
      $hasEnabled = array_key_exists("enabled", $body) || array_key_exists("quotations_enabled", $body);
      $sql = "UPDATE company_settings SET quotation_valid_days = ?, quotation_terms = ?";
      $params = [(string) $days, $terms !== "" ? $terms : null];
      $types = "ss";
      $enabled = null;
      if ($hasEnabled) {
        $enabled = pos_quote_flag($body["enabled"] ?? $body["quotations_enabled"] ?? 0) ? 1 : 0;
        $sql .= ", quotations_enabled = ?";
        $params[] = (string) $enabled;
        $types .= "s";
      }
      $sql .= " WHERE business_id = ?";
      $params[] = $bid;
      $types .= "s";
      pos_quote_exec($sql, $types, $params);
      pos_send(200, ["ok" => true, "quotations_enabled" => $enabled, "valid_days" => $days, "terms" => $terms, "php" => true]);
    }
    if ($path === "quotations" && $method === "GET") pos_send(200, pos_quote_list($bid, $_GET));
    if ($path === "quotations" && $method === "POST") {
      pos_send(200, ["ok" => true, "quote" => pos_quote_save_new($bid, $body, $uid), "php" => true]);
    }
    if (preg_match("#^quotations/([^/]+)/pdf$#", $path, $m) && $method === "GET") {
      $shop = pos_quote_require_on($bid);
      $row = pos_quote_load($bid, $m[1]);
      if (!$row) throw new PosQuoteHttp(404, "Quotation not found");
      $quote = pos_quote_public($row, pos_quote_today());
      $pdf = pos_quote_pdf(
        ["name" => $shop["name"] ?? "", "address" => $shop["address"] ?? "", "phone" => $shop["phone"] ?? "", "email" => $shop["email"] ?? "", "gstin" => ($shop["gstin"] ?? "") !== "" ? $shop["gstin"] : ($shop["settings_gstin"] ?? "")],
        $quote
      );
      pos_send(200, [
        "ok" => true,
        "filename" => "Quotation-" . ($quote["quotation_number"] ?? "quote") . ".pdf",
        "pdfBase64" => base64_encode($pdf),
        "php" => true,
      ]);
    }
    if (preg_match("#^quotations/([^/]+)/email$#", $path, $m) && $method === "POST") {
      $result = pos_quote_email($bid, $m[1], trim((string) ($body["to"] ?? "")), $uid);
      $result["php"] = true;
      pos_send(200, $result);
    }
    if (preg_match("#^quotations/([^/]+)/convert$#", $path, $m) && $method === "POST") {
      $result = pos_quote_convert($bid, $m[1], $auth);
      $result["ok"] = true;
      $result["php"] = true;
      pos_send(200, $result);
    }
    if (preg_match("#^quotations/([^/]+)/duplicate$#", $path, $m) && $method === "POST") {
      pos_send(200, ["ok" => true, "quote" => pos_quote_duplicate($bid, $m[1], $uid), "php" => true]);
    }
    if (preg_match("#^quotations/([^/]+)/status$#", $path, $m) && $method === "POST") {
      pos_send(200, ["ok" => true, "quote" => pos_quote_set_status($bid, $m[1], $body["status"] ?? "", $body["note"] ?? "", $uid), "php" => true]);
    }
    if (preg_match("#^quotations/([^/]+)/share$#", $path, $m) && $method === "POST") {
      pos_send(200, ["ok" => true, "quote" => pos_quote_share($bid, $m[1], $body["channel"] ?? "whatsapp", $uid), "php" => true]);
    }
    if (preg_match("#^quotations/([^/]+)$#", $path, $m) && $method === "GET") {
      $shop = pos_quote_require_on($bid);
      $today = pos_quote_today();
      pos_quote_expire($bid, $today);
      $row = pos_quote_load($bid, $m[1]);
      if (!$row) throw new PosQuoteHttp(404, "Quotation not found");
      $events = pos_q(
        "SELECT action, from_status, to_status, note, created_at FROM quotation_events WHERE quotation_id = ? AND business_id = ? ORDER BY created_at ASC",
        "ss",
        [$m[1], $bid]
      );
      pos_send(200, ["quote" => pos_quote_public($row, $today), "events" => $events, "shopName" => $shop["name"] ?? "", "php" => true]);
    }
    if (preg_match("#^quotations/([^/]+)$#", $path, $m) && $method === "POST") {
      pos_send(200, ["ok" => true, "quote" => pos_quote_update($bid, $m[1], $body, $uid), "php" => true]);
    }
    pos_send(404, ["error" => "Unknown quotation action", "php" => true]);
  } catch (Throwable $e) {
    $code = $e instanceof PosQuoteHttp ? $e->status : 400;
    if (stripos($e->getMessage(), "not found") !== false) $code = 404;
    pos_send($code, ["error" => $e->getMessage(), "php" => true]);
  }
  return true;
}
