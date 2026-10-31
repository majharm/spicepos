<?php
/** Scheduled stock, sales, collection, overdue, and day-end reports.
 *  WhatsApp goes out through the existing pos_wa_send_one sender. */

function pos_auto_round($n) {
  return round((float) $n, 2);
}

function pos_auto_inr($n) {
  $neg = ((float) $n) < 0;
  $parts = explode(".", number_format(abs(pos_auto_round($n)), 2, ".", ""));
  $int = $parts[0];
  $dec = $parts[1] ?? "00";
  if (strlen($int) > 3) {
    $last3 = substr($int, -3);
    $rest = preg_replace('/\B(?=(\d{2})+(?!\d))/', ",", substr($int, 0, -3));
    $int = $rest . "," . $last3;
  }
  return ($neg ? "-" : "") . $int . "." . $dec;
}

function pos_auto_money_mode($raw) {
  $m = strtolower(trim(str_replace([" ", "_"], "-", (string) $raw)));
  if (in_array($m, ["bank", "banktransfer", "net-banking", "netbanking"], true)) $m = "bank-transfer";
  if ($m === "check") $m = "cheque";
  if ($m === "credit-card" || $m === "debit-card") $m = "card";
  $ok = ["cash", "upi", "card", "bank-transfer", "neft", "rtgs", "imps", "cheque", "wallet", "other"];
  return in_array($m, $ok, true) ? $m : "";
}

function pos_auto_bucket($raw) {
  $method = strtolower(trim((string) $raw));
  if ($method === "credit") return "credit";
  $m = pos_auto_money_mode($method);
  if ($m === "cash" || $m === "upi" || $m === "card" || $m === "cheque" || $m === "wallet") return $m;
  if (in_array($m, ["bank-transfer", "neft", "rtgs", "imps"], true)) return "bank";
  if ($m !== "") return "other";
  return "";
}

function pos_auto_buckets() {
  return ["cash" => 0, "upi" => 0, "card" => 0, "bank" => 0, "cheque" => 0, "wallet" => 0, "other" => 0, "credit" => 0, "refunds" => 0, "failed" => 0];
}

function pos_auto_add(&$buckets, $key, $amount) {
  if ($key === "" || $key === "credit" || !isset($buckets[$key])) return;
  $buckets[$key] = pos_auto_round($buckets[$key] + (float) $amount);
}

function pos_auto_zone($name) {
  $zone = trim((string) $name) !== "" ? trim((string) $name) : "Asia/Kolkata";
  try {
    return new DateTimeZone($zone);
  } catch (Throwable $e) {
    return new DateTimeZone("Asia/Kolkata");
  }
}

function pos_auto_now($zone) {
  return new DateTime("now", pos_auto_zone($zone));
}

function pos_auto_reached($zone, $hm) {
  $now = pos_auto_now($zone);
  if (!preg_match('/^(\d{1,2}):(\d{2})$/', (string) $hm, $m)) return [false, $now];
  $have = ((int) $now->format("G")) * 60 + (int) $now->format("i");
  $want = ((int) $m[1]) * 60 + (int) $m[2];
  return [$have >= $want, $now];
}

function pos_auto_day_diff($today, $due) {
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $today) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $due)) return null;
  $a = strtotime($today . " UTC");
  $b = strtotime($due . " UTC");
  if ($a === false || $b === false) return null;
  return (int) round(($a - $b) / 86400);
}

function pos_auto_overdue_stage($due, $today) {
  $days = pos_auto_day_diff($today, $due);
  if ($days === null) return "";
  $map = [-1 => "before", 0 => "on", 3 => "d3", 7 => "d7", 15 => "d15", 30 => "d30"];
  return $map[$days] ?? "";
}

function pos_auto_key($job, $bid, $scope, $channel) {
  return substr($job . "|" . $bid . "|" . $scope . "|" . $channel, 0, 180);
}

function pos_auto_mobile($raw) {
  return function_exists("pos_normalize_in_mobile") ? pos_normalize_in_mobile($raw) : "";
}

function pos_automation_ensure_schema() {
  static $done = false;
  if ($done) return;
  $done = true;
  $db = pos_db();
  @$db->query("CREATE TABLE IF NOT EXISTS automation_jobs (
    job_key VARCHAR(32) PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    schedule VARCHAR(64) NOT NULL,
    enabled TINYINT NOT NULL DEFAULT 0,
    channels VARCHAR(32) NOT NULL DEFAULT 'whatsapp,in_app',
    last_run_at DATETIME NULL,
    last_status VARCHAR(16) NOT NULL DEFAULT 'pending',
    last_error VARCHAR(255) NOT NULL DEFAULT '',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )");
  @$db->query("CREATE TABLE IF NOT EXISTS automation_runs (
    id VARCHAR(64) PRIMARY KEY,
    job_key VARCHAR(32) NOT NULL,
    started_at DATETIME NOT NULL,
    finished_at DATETIME NULL,
    status VARCHAR(16) NOT NULL,
    enqueued INT NOT NULL DEFAULT 0,
    sent INT NOT NULL DEFAULT 0,
    failed INT NOT NULL DEFAULT 0,
    error VARCHAR(255) NOT NULL DEFAULT '',
    INDEX (job_key, started_at)
  )");
  @$db->query("CREATE TABLE IF NOT EXISTS automation_queue (
    id VARCHAR(64) PRIMARY KEY,
    job_key VARCHAR(32) NOT NULL,
    business_id VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(191) NOT NULL,
    channel VARCHAR(16) NOT NULL,
    recipient VARCHAR(32) NOT NULL DEFAULT '',
    title VARCHAR(180) NOT NULL DEFAULT '',
    body MEDIUMTEXT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at DATETIME NULL,
    last_error VARCHAR(255) NOT NULL DEFAULT '',
    provider_note VARCHAR(255) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME NULL,
    UNIQUE KEY uniq_auto_msg (idempotency_key),
    INDEX idx_auto_due (status, next_attempt_at)
  )");
  @$db->query("CREATE TABLE IF NOT EXISTS automation_shop (
    business_id VARCHAR(64) PRIMARY KEY,
    low_stock TINYINT NOT NULL DEFAULT 0,
    daily_sales TINYINT NOT NULL DEFAULT 0,
    collections TINYINT NOT NULL DEFAULT 0,
    overdue TINYINT NOT NULL DEFAULT 0,
    eod TINYINT NOT NULL DEFAULT 0,
    channel_whatsapp TINYINT NOT NULL DEFAULT 1,
    channel_in_app TINYINT NOT NULL DEFAULT 1,
    close_time CHAR(5) NOT NULL DEFAULT '21:00',
    report_time CHAR(5) NOT NULL DEFAULT '21:00',
    low_stock_hours INT NOT NULL DEFAULT 24,
    low_signature VARCHAR(191) NOT NULL DEFAULT '',
    low_sent_at DATETIME NULL,
    low_checked_at DATETIME NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )");
  if (function_exists("pos_ensure_columns")) {
    pos_ensure_columns("customers", [
      "whatsapp_consent" => "TINYINT NOT NULL DEFAULT 0",
      "whatsapp_opt_out" => "TINYINT NOT NULL DEFAULT 0",
    ]);
  }
  $seed = [
    ["low_stock", "Low Stock Alert", "Every 30 minutes"],
    ["overdue", "Overdue Reminder", "11:00"],
    ["daily_sales", "Daily Sales", "21:00"],
    ["collections", "Payment Summary", "21:15"],
    ["eod", "Day-End Report", "Business closing time"],
  ];
  foreach ($seed as $row) {
    try {
      pos_q(
        "INSERT INTO automation_jobs (job_key, name, schedule, enabled) VALUES (?,?,?,0)",
        "sss",
        $row
      );
    } catch (Throwable $e) {
      /* already seeded */
    }
  }
}

function pos_auto_flag($value) {
  $v = strtolower(trim((string) $value));
  return !in_array($v, ["0", "false", "no", "off", ""], true);
}

function pos_auto_platform($key, $default = "") {
  try {
    $rows = pos_q("SELECT setting_value FROM platform_settings WHERE setting_key = ? LIMIT 1", "s", [$key]);
    if ($rows && array_key_exists("setting_value", $rows[0])) return (string) $rows[0]["setting_value"];
  } catch (Throwable $e) {
    /* settings optional during setup */
  }
  return $default;
}

function pos_auto_test_mode() {
  $raw = pos_auto_platform("automation_test_mode", "1");
  return $raw === "" ? true : pos_auto_flag($raw);
}

function pos_auto_jobs() {
  pos_automation_ensure_schema();
  try {
    return pos_q("SELECT * FROM automation_jobs ORDER BY FIELD(job_key,'low_stock','overdue','daily_sales','collections','eod'), job_key");
  } catch (Throwable $e) {
    return pos_q("SELECT * FROM automation_jobs ORDER BY job_key");
  }
}

function pos_auto_job_enabled($key) {
  foreach (pos_auto_jobs() as $job) {
    if ($job["job_key"] === $key) return (int) $job["enabled"] === 1;
  }
  return false;
}

function pos_auto_shop_row($bid) {
  pos_automation_ensure_schema();
  $rows = pos_q("SELECT * FROM automation_shop WHERE business_id = ? LIMIT 1", "s", [$bid]);
  if ($rows) return $rows[0];
  pos_q("INSERT INTO automation_shop (business_id) VALUES (?)", "s", [$bid]);
  $rows = pos_q("SELECT * FROM automation_shop WHERE business_id = ? LIMIT 1", "s", [$bid]);
  return $rows[0];
}

function pos_auto_hm($value, $fallback) {
  $v = trim((string) $value);
  if (!preg_match('/^(\d{1,2}):(\d{2})$/', $v, $m)) return $fallback;
  $h = (int) $m[1];
  $min = (int) $m[2];
  if ($h > 23 || $min > 59) return $fallback;
  return sprintf("%02d:%02d", $h, $min);
}

function pos_auto_test_number() {
  return pos_auto_mobile(pos_auto_platform("automation_test_number", ""));
}

function pos_auto_wa_held() {
  return pos_auto_test_mode() && pos_auto_test_number() === "";
}

function pos_auto_save_shop($bid, $body) {
  $cur = pos_auto_shop_row($bid);
  $on = function ($key) use ($body, $cur) {
    if (!array_key_exists($key, $body)) return (int) $cur[$key];
    return pos_auto_flag($body[$key]) ? 1 : 0;
  };
  $hours = array_key_exists("low_stock_hours", $body) ? (int) $body["low_stock_hours"] : (int) $cur["low_stock_hours"];
  if ($hours < 1) $hours = 1;
  if ($hours > 168) $hours = 168;
  pos_q(
    "UPDATE automation_shop SET low_stock=?, daily_sales=?, collections=?, overdue=?, eod=?, channel_whatsapp=?, channel_in_app=?, close_time=?, report_time=?, low_stock_hours=? WHERE business_id=?",
    "iiiiiiissis",
    [
      $on("low_stock"), $on("daily_sales"), $on("collections"), $on("overdue"), $on("eod"),
      $on("channel_whatsapp"), $on("channel_in_app"),
      pos_auto_hm($body["close_time"] ?? $cur["close_time"], "21:00"),
      pos_auto_hm($body["report_time"] ?? $cur["report_time"], "21:00"),
      $hours,
      $bid,
    ]
  );
  return pos_auto_shop_row($bid);
}

function pos_auto_shops() {
  try {
    return pos_q("SELECT b.id, b.name, b.owner_name, b.mobile, COALESCE(b.whatsapp_opt_out,0) AS whatsapp_opt_out, COALESCE(NULLIF(c.timezone,''),'Asia/Kolkata') AS timezone
      FROM businesses b LEFT JOIN company_settings c ON c.business_id = b.id
      WHERE COALESCE(b.status,'active') = 'active' ORDER BY b.name LIMIT 500");
  } catch (Throwable $e) {
    return pos_q("SELECT id, name, owner_name, mobile, 'Asia/Kolkata' AS timezone, 0 AS whatsapp_opt_out FROM businesses WHERE COALESCE(status,'active') = 'active' ORDER BY name LIMIT 500");
  }
}

function pos_auto_void($order) {
  $status = strtolower((string) ($order["status"] ?? ""));
  return $status === "cancelled" || $status === "void";
}

function pos_auto_sales_summary($orders, $returns, $items) {
  $buckets = pos_auto_buckets();
  $gross = 0;
  $discount = 0;
  $net = 0;
  $bills = 0;
  $cancelled = 0;
  foreach ($orders as $order) {
    if (pos_auto_void($order)) {
      $cancelled++;
      continue;
    }
    $bills++;
    $total = (float) ($order["total"] ?? 0);
    $disc = (float) ($order["discount"] ?? 0);
    $gross = pos_auto_round($gross + $total + $disc);
    $discount = pos_auto_round($discount + $disc);
    $net = pos_auto_round($net + $total);
    $bucket = pos_auto_bucket($order["payment_method"] ?? "");
    if ($bucket !== "" && isset($buckets[$bucket])) $buckets[$bucket] = pos_auto_round($buckets[$bucket] + $total);
    else $buckets["other"] = pos_auto_round($buckets["other"] + $total);
  }
  return [
    "bills" => $bills,
    "cancelled" => $cancelled,
    "orders" => $bills,
    "items" => (float) $items,
    "gross" => $gross,
    "discount" => $discount,
    "returns" => pos_auto_round($returns),
    "net" => pos_auto_round($net - (float) $returns),
    "cash" => $buckets["cash"],
    "upi" => $buckets["upi"],
    "card" => $buckets["card"],
    "credit" => $buckets["credit"],
    "other" => pos_auto_round($buckets["bank"] + $buckets["cheque"] + $buckets["wallet"] + $buckets["other"]),
  ];
}

function pos_auto_collections($receipts, $orders, $refunds) {
  $buckets = pos_auto_buckets();
  $covered = [];
  foreach ($receipts as $row) {
    if (strtolower((string) ($row["entry_type"] ?? "")) !== "receipt") continue;
    if (strtolower((string) ($row["party_type"] ?? "customer")) !== "customer") continue;
    $amount = (float) ($row["amount"] ?? 0);
    if ($amount <= 0) continue;
    pos_auto_add($buckets, pos_auto_bucket($row["payment_method"] ?? ""), $amount);
    if (!empty($row["reference_id"])) $covered[(string) $row["reference_id"]] = true;
  }
  foreach ($orders as $order) {
    if (pos_auto_void($order)) continue;
    $id = (string) ($order["id"] ?? "");
    if ($id !== "" && isset($covered[$id])) continue;
    if (!empty($order["customer_id"])) continue;
    $status = strtolower((string) ($order["payment_status"] ?? ""));
    $bucket = pos_auto_bucket($order["payment_method"] ?? "");
    if ($bucket === "" || $bucket === "credit") continue;
    $paid = (float) ($order["amount_paid"] ?? 0) > 0.004 ? (float) $order["amount_paid"] : ($status === "paid" ? (float) ($order["total"] ?? 0) : 0);
    if ($paid <= 0.004) continue;
    pos_auto_add($buckets, $bucket, $paid);
  }
  foreach ($refunds as $row) {
    $amount = (float) ($row["refund_amount"] ?? 0);
    if ($amount <= 0) continue;
    $buckets["refunds"] = pos_auto_round($buckets["refunds"] + $amount);
    $bucket = pos_auto_bucket($row["refund_mode"] ?? "");
    if ($bucket !== "" && $bucket !== "credit" && isset($buckets[$bucket])) $buckets[$bucket] = pos_auto_round($buckets[$bucket] - $amount);
  }
  $collected = 0;
  foreach (["cash", "upi", "card", "bank", "cheque", "wallet", "other"] as $key) $collected += $buckets[$key];
  $buckets["collected"] = pos_auto_round($collected);
  $buckets["pending"] = 0;
  $buckets["supplierDue"] = 0;
  return $buckets;
}

function pos_auto_q($sql, $types, $args) {
  try {
    return pos_q($sql, $types, $args);
  } catch (Throwable $e) {
    return [];
  }
}

function pos_auto_orders($bid, $ymd) {
  $rows = pos_auto_q(
    "SELECT id, customer_id, customer_name, status, discount, total, payment_method, payment_status, COALESCE(amount_paid,0) AS amount_paid
     FROM sales_orders WHERE business_id = ? AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY) LIMIT 2000",
    "sss",
    [$bid, $ymd, $ymd]
  );
  if ($rows) return $rows;
  return pos_auto_q(
    "SELECT id, customer_id, customer_name, status, discount, total, payment_method, payment_status, 0 AS amount_paid
     FROM sales_orders WHERE business_id = ? AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY) LIMIT 2000",
    "sss",
    [$bid, $ymd, $ymd]
  );
}

function pos_auto_receipts($bid, $ymd) {
  return pos_auto_q(
    "SELECT amount, payment_method, reference_id, entry_type, party_type FROM account_ledger
     WHERE business_id = ? AND LOWER(entry_type)='receipt' AND LOWER(party_type)='customer'
       AND COALESCE(NULLIF(payment_date, '0000-00-00'), DATE(created_at)) >= ?
       AND COALESCE(NULLIF(payment_date, '0000-00-00'), DATE(created_at)) < DATE_ADD(?, INTERVAL 1 DAY)
     LIMIT 2000",
    "sss",
    [$bid, $ymd, $ymd]
  );
}

function pos_auto_refunds($bid, $ymd) {
  return pos_auto_q(
    "SELECT refund_amount, refund_mode FROM sales_returns
     WHERE business_id = ? AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
       AND LOWER(COALESCE(status,'completed')) <> 'cancelled' LIMIT 500",
    "sss",
    [$bid, $ymd, $ymd]
  );
}

function pos_auto_items_sold($bid, $ymd) {
  $rows = pos_auto_q(
    "SELECT COALESCE(SUM(l.quantity_gm),0) AS qty, COUNT(DISTINCT l.item_id) AS products
     FROM sales_order_lines l JOIN sales_orders o ON o.id = l.order_id
     WHERE o.business_id = ? AND o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       AND LOWER(COALESCE(o.status,'')) NOT IN ('cancelled','void') AND COALESCE(l.cancelled,0) = 0",
    "sss",
    [$bid, $ymd, $ymd]
  );
  return ["qty" => (float) ($rows[0]["qty"] ?? 0), "products" => (int) ($rows[0]["products"] ?? 0)];
}

function pos_auto_expenses($bid, $ymd) {
  $rows = pos_auto_q(
    "SELECT COALESCE(SUM(amount + gst),0) AS total,
            COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'cash' THEN amount + gst ELSE 0 END),0) AS cash
     FROM expenses WHERE business_id = ? AND expense_date = ?",
    "ss",
    [$bid, $ymd]
  );
  $total = (float) ($rows[0]["total"] ?? 0);
  $cash = (float) ($rows[0]["cash"] ?? 0);
  return ["total" => pos_auto_round($total), "cash" => pos_auto_round($cash), "other" => pos_auto_round($total - $cash)];
}

function pos_auto_outstanding($bid) {
  $sql = function_exists("pos_invoice_open_remainder_sql") ? pos_invoice_open_remainder_sql() : "GREATEST(0, COALESCE(total,0) - COALESCE(amount_paid,0))";
  $rows = pos_auto_q(
    "SELECT COALESCE(SUM($sql),0) AS due FROM sales_orders WHERE business_id = ? AND LOWER(COALESCE(status,'')) NOT IN ('cancelled','void')",
    "s",
    [$bid]
  );
  return pos_auto_round($rows[0]["due"] ?? 0);
}

function pos_auto_supplier_due($bid) {
  $rows = pos_auto_q("SELECT COALESCE(SUM(payable_balance),0) AS due FROM suppliers WHERE business_id = ?", "s", [$bid]);
  return pos_auto_round($rows[0]["due"] ?? 0);
}

function pos_auto_low_items($bid) {
  return pos_auto_q(
    "SELECT id, name, stock_gm AS stock, reorder_level_gm AS minimum, COALESCE(unit,'') AS unit
     FROM items WHERE business_id = ? AND status = 'active' AND reorder_level_gm > 0 AND stock_gm <= reorder_level_gm
     ORDER BY stock_gm ASC, name LIMIT 40",
    "s",
    [$bid]
  );
}

function pos_auto_out_count($bid) {
  $rows = pos_auto_q("SELECT COUNT(*) AS n FROM items WHERE business_id = ? AND status = 'active' AND stock_gm <= 0", "s", [$bid]);
  return (int) ($rows[0]["n"] ?? 0);
}

function pos_auto_adjustments($bid, $ymd) {
  $rows = pos_auto_q(
    "SELECT COUNT(*) AS n FROM stock_movements WHERE business_id = ? AND LOWER(kind) IN ('adjust','adjustment') AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)",
    "sss",
    [$bid, $ymd, $ymd]
  );
  return (int) ($rows[0]["n"] ?? 0);
}

function pos_auto_new_customers($bid, $ymd) {
  $rows = pos_auto_q(
    "SELECT COUNT(*) AS n FROM customers WHERE business_id = ? AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)",
    "sss",
    [$bid, $ymd, $ymd]
  );
  return (int) ($rows[0]["n"] ?? 0);
}

function pos_auto_profit($bid, $ymd) {
  $rows = pos_auto_q(
    "SELECT COALESCE(SUM(l.profit),0) AS profit, COALESCE(SUM(l.cost),0) AS cost
     FROM sales_order_lines l JOIN sales_orders o ON o.id = l.order_id
     WHERE o.business_id = ? AND o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       AND LOWER(COALESCE(o.status,'')) NOT IN ('cancelled','void') AND COALESCE(l.cancelled,0) = 0",
    "sss",
    [$bid, $ymd, $ymd]
  );
  return ["profit" => pos_auto_round($rows[0]["profit"] ?? 0), "cost" => pos_auto_round($rows[0]["cost"] ?? 0)];
}

function pos_auto_line($label, $value) {
  return $label . ": ₹" . pos_auto_inr($value);
}

function pos_auto_low_message($owner, $items, $out) {
  $lines = ["LOW STOCK ALERT – ATAV POS", "", "Hello " . ($owner !== "" ? $owner : "there") . ",", "", "The following products have low stock:", ""];
  $n = 0;
  foreach ($items as $item) {
    if ($n >= 20) break;
    $unit = trim((string) ($item["unit"] ?? ""));
    $suffix = $unit !== "" ? " " . $unit : "";
    $lines[] = "Product: " . $item["name"];
    $lines[] = "Available Stock: " . $item["stock"] . $suffix;
    $lines[] = "Minimum Stock: " . $item["minimum"] . $suffix;
    $lines[] = "";
    $n++;
  }
  if (count($items) > 20) $lines[] = "+" . (count($items) - 20) . " more";
  if ($out > 0) $lines[] = "Out of stock: " . $out;
  $lines[] = "Please arrange replenishment.";
  $lines[] = "";
  $lines[] = "Team ATAV POS";
  return implode("\n", $lines);
}

function pos_auto_sales_message($shop, $day, $sales, $collected) {
  return implode("\n", [
    "DAILY SALES REPORT", "",
    "Business: " . $shop, "Date: " . $day, "",
    pos_auto_line("Total Sales", $sales["gross"]),
    "Total Invoices: " . $sales["bills"],
    "Total Orders: " . $sales["orders"],
    "Total Items Sold: " . $sales["items"], "",
    "Sales by tender (credit is not money received):",
    pos_auto_line("Cash", $sales["cash"]),
    pos_auto_line("UPI", $sales["upi"]),
    pos_auto_line("Card", $sales["card"]),
    pos_auto_line("Credit", $sales["credit"]),
    pos_auto_line("Other", $sales["other"]), "",
    pos_auto_line("Collected", $collected),
    pos_auto_line("Returns", $sales["returns"]),
    pos_auto_line("Discount", $sales["discount"]),
    pos_auto_line("Net Sales", $sales["net"]), "",
    "Thank you for using ATAV POS.",
  ]);
}

function pos_auto_collection_message($shop, $day, $col) {
  return implode("\n", [
    "PAYMENT COLLECTION SUMMARY", "",
    "Business: " . $shop, "Date: " . $day, "",
    pos_auto_line("Total collection", $col["collected"]),
    pos_auto_line("Cash", $col["cash"]),
    pos_auto_line("UPI", $col["upi"]),
    pos_auto_line("Card", $col["card"]),
    pos_auto_line("Bank Transfer", $col["bank"]),
    pos_auto_line("Cheque", $col["cheque"]),
    pos_auto_line("Wallet", $col["wallet"]),
    pos_auto_line("Other", $col["other"]), "",
    pos_auto_line("Refunds", $col["refunds"]),
    pos_auto_line("Customer outstanding", $col["pending"]),
    pos_auto_line("Supplier outstanding", $col["supplierDue"]),
    "Failed transactions: " . (int) ($col["failed"] ?? 0), "",
    "Credit sales and unpaid invoices are not included as collected money.", "",
    "Team ATAV POS",
  ]);
}

function pos_auto_overdue_message($row) {
  $lines = [
    "PAYMENT REMINDER", "",
    "Dear " . $row["customerName"] . ",", "",
    "This is a friendly reminder from " . $row["businessName"] . ".", "",
    "Your invoice " . $row["invoiceNumber"] . " has an outstanding balance.", "",
    pos_auto_line("Invoice Amount", $row["total"]),
    pos_auto_line("Paid Amount", $row["paid"]),
    pos_auto_line("Pending Amount", $row["pending"]),
    "Due Date: " . $row["dueDate"],
  ];
  if ((int) $row["daysOverdue"] > 0) $lines[] = "Days overdue: " . $row["daysOverdue"];
  $lines[] = "";
  $lines[] = "Kindly clear the outstanding amount.";
  $lines[] = "";
  $lines[] = "Thank you.";
  return implode("\n", $lines);
}

function pos_auto_eod_message($shop, $day, $report) {
  $otherCol = pos_auto_round($report["collections"]["bank"] + $report["collections"]["cheque"] + $report["collections"]["wallet"] + $report["collections"]["other"]);
  $lines = [
    "DAY-END REPORT", "", "Business: " . $shop, "Date: " . $day, "",
    "SALES",
    pos_auto_line("Total Gross Sales", $report["sales"]["gross"]),
    pos_auto_line("Net Sales", $report["sales"]["net"]),
    "Total Bills: " . $report["sales"]["bills"],
    "Cancelled Bills: " . $report["sales"]["cancelled"],
    pos_auto_line("Sales Returns", $report["sales"]["returns"]),
    pos_auto_line("Discounts", $report["sales"]["discount"]), "",
    "PAYMENT COLLECTION",
    pos_auto_line("Opening Cash", 0),
    pos_auto_line("Cash collected", pos_auto_round($report["collections"]["cash"] + ($report["cashRefunds"] ?? 0))),
    pos_auto_line("UPI Collections", $report["collections"]["upi"]),
    pos_auto_line("Card Collections", $report["collections"]["card"]),
    pos_auto_line("Credit Sales", $report["sales"]["credit"]),
    pos_auto_line("Other Collections", $otherCol),
    pos_auto_line("Cash Expenses", $report["expenses"]["cash"]),
    pos_auto_line("Cash Refunds", $report["cashRefunds"] ?? 0),
    pos_auto_line("Expected Closing Cash", $report["expectedCash"]), "",
    "INVENTORY",
    "Total Products Sold: " . $report["products"],
    "Low Stock Items: " . $report["lowStock"],
    "Out-of-Stock Items: " . $report["outOfStock"],
    "Stock Adjustments: " . $report["adjustments"], "",
    "CUSTOMERS",
    "New Customers: " . $report["newCustomers"],
    pos_auto_line("Credit Sales", $report["sales"]["credit"]),
    pos_auto_line("Outstanding Amount", $report["outstanding"]),
    pos_auto_line("Payments Received", $report["collections"]["collected"]), "",
    "EXPENSES",
    pos_auto_line("Total Expenses", $report["expenses"]["total"]),
    pos_auto_line("Cash Expenses", $report["expenses"]["cash"]),
    pos_auto_line("Other Expenses", $report["expenses"]["other"]), "",
    "SUMMARY",
    pos_auto_line("Total Revenue", $report["sales"]["net"]),
    pos_auto_line("Total Collections", $report["collections"]["collected"]),
    pos_auto_line("Total Outstanding", $report["outstanding"]),
    pos_auto_line("Total Expenses", $report["expenses"]["total"]),
  ];
  if (!empty($report["profitSupported"])) $lines[] = pos_auto_line("Net Profit", $report["profit"]);
  else $lines[] = "Net Profit: not calculated (item cost is missing)";
  $lines[] = "Opening cash is 0 because this shop has no recorded cash drawer.";
  $lines[] = "";
  $lines[] = "Team ATAV POS";
  return implode("\n", $lines);
}

function pos_auto_enqueue($job, $bid, $scope, $channel, $title, $body, $recipient = "", $forced = false) {
  $key = pos_auto_key($job, $bid, $scope, $channel);
  $id = function_exists("pos_uuid") ? pos_uuid() : bin2hex(random_bytes(16));
  try {
    pos_q(
      "INSERT INTO automation_queue (id, job_key, business_id, idempotency_key, channel, recipient, title, body, status, attempts, provider_note) VALUES (?,?,?,?,?,?,?,?,'pending',0,?)",
      "sssssssss",
      [$id, $job, $bid, $key, $channel, pos_auto_mobile($recipient), substr($title, 0, 180), substr($body, 0, 4000), $forced ? "forced" : ""]
    );
    return true;
  } catch (Throwable $e) {
    return false;
  }
}

function pos_auto_channels($shop) {
  $out = [];
  if ((int) $shop["channel_in_app"] === 1) $out[] = "in_app";
  if ((int) $shop["channel_whatsapp"] === 1) $out[] = "whatsapp";
  return $out;
}

function pos_auto_queue_report($job, $bid, $scope, $shopRow, $title, $body, $recipient = "", $forced = false) {
  $n = 0;
  $hold = pos_auto_wa_held();
  foreach (pos_auto_channels($shopRow) as $channel) {
    if ($channel === "whatsapp" && $hold) continue;
    if (pos_auto_enqueue($job, $bid, $scope, $channel, $title, $body, $recipient, $forced)) $n++;
  }
  return $n;
}

function pos_auto_low_signature($items) {
  $parts = [];
  foreach ($items as $item) $parts[] = $item["id"] . ":" . pos_auto_round($item["stock"]);
  sort($parts);
  return implode("|", $parts);
}

function pos_auto_shop_wants($bid, $job) {
  $allowed = ["low_stock", "daily_sales", "collections", "overdue", "eod"];
  if (!in_array($job, $allowed, true)) return false;
  try {
    $rows = pos_q("SELECT `$job` AS on_flag FROM automation_shop WHERE business_id = ? LIMIT 1", "s", [$bid]);
  } catch (Throwable $e) {
    return false;
  }
  return (int) ($rows[0]["on_flag"] ?? 0) === 1;
}

function pos_auto_release_unwanted() {
  $jobs = ["low_stock", "daily_sales", "collections", "overdue", "eod"];
  $dropped = 0;
  $removed = 0;
  $clearSent = pos_auto_platform("automation_blast_cleared", "") !== "1";
  foreach ($jobs as $job) {
    $statusSql = $clearSent
      ? "(q.status IN ('pending','sending') OR (q.status = 'sent' AND q.channel = 'in_app'))"
      : "q.status IN ('pending','sending')";
    try {
      $rows = pos_q(
        "SELECT q.id, q.business_id, q.title, q.channel, q.status
         FROM automation_queue q
         LEFT JOIN automation_shop s ON s.business_id = q.business_id
         WHERE q.job_key = ? AND COALESCE(s.`$job`, 0) = 0 AND $statusSql",
        "s",
        [$job]
      );
    } catch (Throwable $e) {
      continue;
    }
    foreach ($rows as $row) {
      if (($row["channel"] ?? "") === "in_app" && ($row["status"] ?? "") === "sent") {
        try {
          pos_q(
            "DELETE FROM notifications WHERE business_id = ? AND title = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 3 DAY)",
            "ss",
            [$row["business_id"], $row["title"]]
          );
          $removed++;
        } catch (Throwable $e) {
          /* notice may already be gone */
        }
      }
      try {
        pos_q("DELETE FROM automation_queue WHERE id = ?", "s", [$row["id"]]);
        $dropped++;
      } catch (Throwable $e) {
        /* row already gone */
      }
    }
  }
  if ($clearSent && function_exists("pos_set_setting")) {
    try { pos_set_setting("automation_blast_cleared", "1"); } catch (Throwable $e) { /* setting is optional */ }
  }
  return ["dropped" => $dropped, "removed" => $removed];
}

function pos_automation_consider($biz, $shop, $forceJob, $forceShop = false) {
  $zone = $biz["timezone"] ?? "Asia/Kolkata";
  if (function_exists("pos_apply_business_timezone")) {
    try { pos_apply_business_timezone($biz["id"]); } catch (Throwable $e) { /* keep the shop clock below */ }
  }
  $enqueued = 0;
  $ymd = pos_auto_now($zone)->format("Y-m-d");
  $owner = trim((string) ($biz["owner_name"] ?? ""));
  $shopName = trim((string) ($biz["name"] ?? "Shop"));
  $want = function ($key) use ($forceJob, $shop, $forceShop) {
    if ($forceJob !== "" && $forceJob !== $key) return false;
    if ($forceJob === $key && $forceShop) return true;
    if (!pos_auto_job_enabled($key)) return false;
    return (int) ($shop[$key] ?? 0) === 1;
  };
  if ($want("low_stock")) {
    $gate = pos_q("SELECT CASE WHEN low_checked_at IS NULL OR low_checked_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE) THEN 1 ELSE 0 END AS due FROM automation_shop WHERE business_id = ?", "s", [$biz["id"]]);
    if ($forceJob === "low_stock" || (int) ($gate[0]["due"] ?? 1) === 1) {
      pos_q("UPDATE automation_shop SET low_checked_at = NOW() WHERE business_id = ?", "s", [$biz["id"]]);
      $items = pos_auto_low_items($biz["id"]);
      $rawSig = pos_auto_low_signature($items);
      $sig = $rawSig === "" ? "" : md5($rawSig);
      $same = $sig !== "" && $sig === (string) ($shop["low_signature"] ?? "");
      $hours = max(1, (int) ($shop["low_stock_hours"] ?? 24));
      $sentGate = pos_q("SELECT CASE WHEN low_sent_at IS NULL OR low_sent_at < DATE_SUB(NOW(), INTERVAL ? HOUR) THEN 1 ELSE 0 END AS due FROM automation_shop WHERE business_id = ?", "is", [$hours, $biz["id"]]);
      $due = $sig !== "" && (!$same || (int) ($sentGate[0]["due"] ?? 1) === 1);
      if ($due) {
        $body = pos_auto_low_message($owner, $items, pos_auto_out_count($biz["id"]));
        $enqueued += pos_auto_queue_report("low_stock", $biz["id"], $sig, $shop, "Low stock alert", $body, "", $forceShop);
        $waOn = (int) ($shop["channel_whatsapp"] ?? 0) === 1;
        if (!$waOn || !pos_auto_wa_held()) {
          pos_q("UPDATE automation_shop SET low_signature = ?, low_sent_at = NOW() WHERE business_id = ?", "ss", [$sig, $biz["id"]]);
        }
      }
    }
  }
  $reportTime = $shop["report_time"] ?? "21:00";
  $closeTime = $shop["close_time"] ?? "21:00";
  [$salesDue] = pos_auto_reached($zone, $reportTime);
  [$payDue] = pos_auto_reached($zone, "21:15");
  [$dueDue] = pos_auto_reached($zone, "11:00");
  [$eodDue] = pos_auto_reached($zone, $closeTime);
  if ($want("daily_sales") && ($forceJob === "daily_sales" || $salesDue)) {
    $orders = pos_auto_orders($biz["id"], $ymd);
    $refunds = pos_auto_refunds($biz["id"], $ymd);
    $returns = 0;
    foreach ($refunds as $row) $returns += (float) $row["refund_amount"];
    $sold = pos_auto_items_sold($biz["id"], $ymd);
    $sales = pos_auto_sales_summary($orders, $returns, $sold["qty"]);
    $col = pos_auto_collections(pos_auto_receipts($biz["id"], $ymd), $orders, $refunds);
    $body = pos_auto_sales_message($shopName, $ymd, $sales, $col["collected"]);
    $enqueued += pos_auto_queue_report("daily_sales", $biz["id"], $ymd, $shop, "Daily sales " . $ymd, $body, "", $forceShop);
  }
  if ($want("collections") && ($forceJob === "collections" || $payDue)) {
    $orders = pos_auto_orders($biz["id"], $ymd);
    $refunds = pos_auto_refunds($biz["id"], $ymd);
    $col = pos_auto_collections(pos_auto_receipts($biz["id"], $ymd), $orders, $refunds);
    $col["pending"] = pos_auto_outstanding($biz["id"]);
    $col["supplierDue"] = pos_auto_supplier_due($biz["id"]);
    $body = pos_auto_collection_message($shopName, $ymd, $col);
    $enqueued += pos_auto_queue_report("collections", $biz["id"], $ymd, $shop, "Collections " . $ymd, $body, "", $forceShop);
  }
  if ($want("overdue") && ($forceJob === "overdue" || $dueDue)) {
    $enqueued += pos_auto_enqueue_overdue($biz, $shop, $ymd, $forceShop);
  }
  if ($want("eod") && ($forceJob === "eod" || $eodDue)) {
    $orders = pos_auto_orders($biz["id"], $ymd);
    $refunds = pos_auto_refunds($biz["id"], $ymd);
    $returns = 0;
    foreach ($refunds as $row) $returns += (float) $row["refund_amount"];
    $sold = pos_auto_items_sold($biz["id"], $ymd);
    $sales = pos_auto_sales_summary($orders, $returns, $sold["qty"]);
    $col = pos_auto_collections(pos_auto_receipts($biz["id"], $ymd), $orders, $refunds);
    $exp = pos_auto_expenses($biz["id"], $ymd);
    $profit = pos_auto_profit($biz["id"], $ymd);
    $cashRefunds = 0;
    foreach ($refunds as $row) {
      if (pos_auto_bucket($row["refund_mode"] ?? "") === "cash") $cashRefunds += (float) ($row["refund_amount"] ?? 0);
    }
    $cashRefunds = pos_auto_round($cashRefunds);
    $grossCash = pos_auto_round($col["cash"] + $cashRefunds);
    $expected = pos_auto_round($grossCash - $exp["cash"] - $cashRefunds);
    $report = [
      "sales" => $sales,
      "collections" => $col,
      "cashRefunds" => $cashRefunds,
      "expenses" => $exp,
      "products" => $sold["products"],
      "lowStock" => count(pos_auto_low_items($biz["id"])),
      "outOfStock" => pos_auto_out_count($biz["id"]),
      "adjustments" => pos_auto_adjustments($biz["id"], $ymd),
      "newCustomers" => pos_auto_new_customers($biz["id"], $ymd),
      "outstanding" => pos_auto_outstanding($biz["id"]),
      "expectedCash" => $expected,
      "profit" => pos_auto_round($profit["profit"] - $exp["total"]),
      "profitSupported" => $profit["cost"] > 0.004,
    ];
    $body = pos_auto_eod_message($shopName, $ymd, $report);
    $enqueued += pos_auto_queue_report("eod", $biz["id"], $ymd, $shop, "Day-end " . $ymd, $body, "", $forceShop);
  }
  return $enqueued;
}

function pos_auto_enqueue_overdue($biz, $shop, $today, $forceShop = false) {
  $open = function_exists("pos_invoice_open_remainder_sql") ? pos_invoice_open_remainder_sql() : "GREATEST(0, COALESCE(o.total,0) - COALESCE(o.amount_paid,0))";
  $rows = pos_auto_q(
    "SELECT o.id, o.order_number, o.total, COALESCE(o.amount_paid,0) AS amount_paid, o.due_date, o.created_at,
            COALESCE(c.name,'Customer') AS customer_name, c.mobile, COALESCE(c.whatsapp_consent,0) AS whatsapp_consent, COALESCE(c.whatsapp_opt_out,0) AS whatsapp_opt_out,
            $open AS pending
     FROM sales_orders o
     JOIN customers c ON c.id = o.customer_id AND c.business_id = o.business_id
     WHERE o.business_id = ? AND LOWER(COALESCE(o.status,'')) NOT IN ('cancelled','void')
     HAVING pending > 0.004
     LIMIT 300",
    "s",
    [$biz["id"]]
  );
  $n = 0;
  foreach ($rows as $row) {
    $due = substr((string) ($row["due_date"] ?: $row["created_at"]), 0, 10);
    $stage = pos_auto_overdue_stage($due, $today);
    if ($stage === "") continue;
    if ((int) $row["whatsapp_opt_out"] === 1 || (int) $row["whatsapp_consent"] !== 1) continue;
    if (pos_auto_mobile($row["mobile"]) === "") continue;
    $days = pos_auto_day_diff($today, $due);
    $body = pos_auto_overdue_message([
      "customerName" => $row["customer_name"],
      "businessName" => $biz["name"],
      "invoiceNumber" => $row["order_number"] ?: $row["id"],
      "total" => $row["total"],
      "paid" => $row["amount_paid"],
      "pending" => $row["pending"],
      "dueDate" => $due,
      "daysOverdue" => max(0, (int) $days),
    ]);
    if ((int) $shop["channel_whatsapp"] === 1 && !pos_auto_wa_held() && pos_auto_enqueue("overdue", $biz["id"], $row["id"] . "|" . $stage, "whatsapp", "Payment reminder", $body, $row["mobile"], $forceShop)) $n++;
  }
  return $n;
}

function pos_auto_mark_job($key, $status, $error = "") {
  try {
    pos_q("UPDATE automation_jobs SET last_run_at = NOW(), last_status = ?, last_error = ? WHERE job_key = ?", "sss", [$status, substr($error, 0, 255), $key]);
  } catch (Throwable $e) {
    /* log row is optional */
  }
}

function pos_automation_drain($deadline) {
  $sent = 0;
  $failed = 0;
  $testMode = pos_auto_test_mode();
  $testNumber = pos_auto_mobile(pos_auto_platform("automation_test_number", ""));
  $cfg = function_exists("pos_alert_settings") ? pos_alert_settings() : [];
  $guard = 0;
  $whatsapp = 0;
  while (microtime(true) < $deadline && ($sent + $failed) < 25 && $whatsapp < 5 && $guard < 40) {
    $guard++;
    $rows = pos_q(
      "SELECT * FROM automation_queue WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW()) ORDER BY created_at LIMIT 1"
    );
    if (!$rows) break;
    $row = $rows[0];
    if (($row["provider_note"] ?? "") !== "forced" && !pos_auto_shop_wants($row["business_id"], $row["job_key"])) {
      try { pos_q("DELETE FROM automation_queue WHERE id = ?", "s", [$row["id"]]); } catch (Throwable $e) { /* already gone */ }
      continue;
    }
    pos_q("UPDATE automation_queue SET status = 'sending' WHERE id = ? AND status = 'pending'", "s", [$row["id"]]);
    $locked = pos_q("SELECT id FROM automation_queue WHERE id = ? AND status = 'sending' LIMIT 1", "s", [$row["id"]]);
    if (!$locked) continue;
    $error = "";
    $note = "";
    $ok = false;
    try {
      if ($row["channel"] === "in_app") {
        if (function_exists("pos_save_dashboard_notification")) {
          pos_save_dashboard_notification($row["business_id"], $row["title"], $row["body"]);
        }
        $ok = true;
        $note = "in-app";
      } else {
        $bizRows = pos_auto_q("SELECT mobile, owner_name, COALESCE(whatsapp_opt_out,0) AS whatsapp_opt_out FROM businesses WHERE id = ? LIMIT 1", "s", [$row["business_id"]]);
        $biz = $bizRows[0] ?? [];
        $optOut = (int) ($biz["whatsapp_opt_out"] ?? 0) === 1;
        $mobile = "";
        if ($row["job_key"] === "overdue") {
          if ($optOut && !$testMode) $error = "opt-out";
          elseif ($testMode) {
            $mobile = $testNumber;
            if ($mobile === "") $error = "test-number-missing";
          } else {
            $mobile = pos_auto_mobile($row["recipient"]);
            if ($mobile === "") $error = "invalid-mobile";
          }
        } else {
          if ($optOut) $error = "opt-out";
          elseif ($testMode) {
            $mobile = $testNumber;
            if ($mobile === "") $error = "test-number-missing";
          } else {
            $mobile = pos_auto_mobile($biz["mobile"] ?? "");
            if ($mobile === "") $error = "invalid-mobile";
          }
        }
        if ($error === "" && function_exists("pos_wa_send_one")) {
          $text = $row["body"];
          if ($testMode) $text = "[TEST " . $row["business_id"] . "]\n" . $text;
          $whatsapp++;
          $result = pos_wa_send_one($cfg, $mobile, $text, "");
          $ok = !empty($result["ok"]);
          $note = substr((string) ($result["delivery"] ?? ($result["error"] ?? "")), 0, 240);
          if (!$ok) $error = substr((string) ($result["error"] ?? "failed"), 0, 240);
          if ($ok && in_array($note, ["delivered", "read"], true)) {
            /* provider confirmed delivery */
          } elseif ($ok) {
            $note = $note !== "" ? $note : "sent";
          }
        } elseif ($error === "") {
          $error = "WhatsApp sender missing";
        }
      }
    } catch (Throwable $e) {
      $ok = false;
      $error = $e->getMessage();
    }
    $attempts = (int) $row["attempts"] + ($ok ? 0 : 1);
    if ($ok) {
      $status = in_array($note, ["delivered", "read"], true) ? $note : "sent";
      pos_q("UPDATE automation_queue SET status = ?, attempts = ?, sent_at = NOW(), provider_note = ?, last_error = '' WHERE id = ?", "siss", [$status, (int) $row["attempts"], substr($note, 0, 240), $row["id"]]);
      $sent++;
    } elseif (in_array($error, ["opt-out", "test-number-missing", "invalid-mobile", "no-consent"], true)) {
      pos_q("UPDATE automation_queue SET status = 'skipped', attempts = ?, last_error = ? WHERE id = ?", "iss", [$attempts, substr($error, 0, 240), $row["id"]]);
      $failed++;
    } elseif ($attempts >= 4) {
      pos_q("UPDATE automation_queue SET status = 'failed', attempts = ?, last_error = ? WHERE id = ?", "iss", [$attempts, substr($error, 0, 240), $row["id"]]);
      $failed++;
    } else {
      $wait = (int) (60 * (2 ** $attempts));
      pos_q("UPDATE automation_queue SET status = 'pending', attempts = ?, last_error = ?, next_attempt_at = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = ?", "isis", [$attempts, substr($error, 0, 240), $wait, $row["id"]]);
      $failed++;
    }
  }
  return ["sent" => $sent, "failed" => $failed];
}

function pos_automation_tick($opts = []) {
  pos_automation_ensure_schema();
  require_once __DIR__ . "/pos-alerts.php";
  $db = pos_db();
  $lock = @$db->query("SELECT GET_LOCK('pos_automation_tick', 0) AS l");
  $got = $lock ? $lock->fetch_assoc() : null;
  if ($lock) $lock->free();
  if ((int) ($got["l"] ?? 0) !== 1) return ["ok" => true, "skipped" => true, "reason" => "locked"];
  $started = microtime(true);
  try {
    $released = pos_auto_release_unwanted();
    $forceJob = trim((string) ($opts["job"] ?? ""));
    $forceBiz = trim((string) ($opts["business_id"] ?? ""));
    $shops = pos_auto_shops();
    $enqueued = 0;
    $deadline = $started + 18;
    foreach ($shops as $biz) {
      if (microtime(true) > $deadline) break;
      if ($forceBiz !== "" && $biz["id"] !== $forceBiz) continue;
      try {
        $shop = pos_auto_shop_row($biz["id"]);
        $enqueued += pos_automation_consider($biz, $shop, $forceJob, $forceBiz !== "");
      } catch (Throwable $e) {
        error_log("automation shop " . $biz["id"] . ": " . $e->getMessage());
      }
    }
    $drain = pos_automation_drain($started + 28);
    $status = $drain["failed"] > 0 && $drain["sent"] === 0 ? "failed" : "ok";
    $runId = function_exists("pos_uuid") ? pos_uuid() : bin2hex(random_bytes(8));
    try {
      pos_q(
        "INSERT INTO automation_runs (id, job_key, started_at, finished_at, status, enqueued, sent, failed, error) VALUES (?,?,NOW(),NOW(),?,?,?,?,?)",
        "sssiiis",
        [$runId, $forceJob !== "" ? $forceJob : "scheduler", $status, $enqueued, $drain["sent"], $drain["failed"], ""]
      );
    } catch (Throwable $e) {
      /* run log is best-effort */
    }
    if ($forceJob !== "") pos_auto_mark_job($forceJob, $status, "");
    return [
      "ok" => true,
      "enqueued" => $enqueued,
      "sent" => $drain["sent"],
      "failed" => $drain["failed"],
      "dropped" => $released["dropped"],
      "removedNotices" => $released["removed"],
      "scope" => $forceBiz !== "" ? "one-shop" : ($forceJob !== "" ? "enabled-shops" : "schedule"),
      "testMode" => pos_auto_test_mode(),
    ];
  } finally {
    @$db->query("SELECT RELEASE_LOCK('pos_automation_tick')");
  }
}

function pos_auto_summary() {
  pos_automation_ensure_schema();
  $jobs = pos_auto_jobs();
  $counts = ["pending" => 0, "sent" => 0, "failed" => 0, "skipped" => 0];
  foreach (pos_q("SELECT status, COUNT(*) AS n FROM automation_queue GROUP BY status") as $row) {
    $counts[$row["status"]] = (int) $row["n"];
  }
  $runs = pos_q("SELECT * FROM automation_runs ORDER BY started_at DESC LIMIT 20");
  $queue = pos_q("SELECT id, job_key, business_id, channel, status, attempts, last_error, provider_note, created_at, sent_at, title FROM automation_queue ORDER BY created_at DESC LIMIT 40");
  $last = $runs[0]["finished_at"] ?? ($runs[0]["started_at"] ?? "");
  return [
    "ok" => true,
    "testMode" => pos_auto_test_mode(),
    "testNumber" => pos_auto_platform("automation_test_number", ""),
    "jobs" => $jobs,
    "counts" => [
      "scheduled" => count($jobs),
      "enabled" => count(array_filter($jobs, function ($job) { return (int) $job["enabled"] === 1; })),
      "pending" => $counts["pending"] ?? 0,
      "sent" => ($counts["sent"] ?? 0) + ($counts["delivered"] ?? 0) + ($counts["read"] ?? 0),
      "failed" => $counts["failed"] ?? 0,
      "skipped" => $counts["skipped"] ?? 0,
      "lastRun" => $last,
    ],
    "runs" => $runs,
    "queue" => $queue,
    "cron" => "/api/cron/",
    "schedule" => [
      ["job" => "Low stock monitoring", "time" => "Every 30 minutes"],
      ["job" => "Customer overdue reminders", "time" => "11:00 IST"],
      ["job" => "Daily sales summary", "time" => "21:00 or the shop report time"],
      ["job" => "Payment collection summary", "time" => "21:15 IST"],
      ["job" => "Day-end report", "time" => "Each shop's closing time"],
    ],
  ];
}

function pos_automation_master_dispatch($path, $method, $body) {
  if (strpos($path, "master/automation") !== 0) return false;
  pos_automation_ensure_schema();
  if ($path === "master/automation" && $method === "GET") pos_send(200, pos_auto_summary());
  if ($path === "master/automation" && $method === "POST") {
    if (array_key_exists("test_mode", $body) && function_exists("pos_set_setting")) {
      pos_set_setting("automation_test_mode", pos_auto_flag($body["test_mode"]) ? "1" : "0");
    }
    if (array_key_exists("test_number", $body) && function_exists("pos_set_setting")) {
      $num = pos_auto_mobile($body["test_number"]);
      if (trim((string) $body["test_number"]) !== "" && $num === "") throw new Exception("Test number must be a 10-digit Indian mobile");
      pos_set_setting("automation_test_number", $num);
    }
    if (!empty($body["job"]) && array_key_exists("enabled", $body)) {
      pos_q("UPDATE automation_jobs SET enabled = ? WHERE job_key = ?", "is", [pos_auto_flag($body["enabled"]) ? 1 : 0, $body["job"]]);
    }
    if (!empty($body["business_id"])) pos_auto_save_shop($body["business_id"], $body);
    pos_send(200, pos_auto_summary());
  }
  if ($path === "master/automation/run" && $method === "POST") {
    $job = trim((string) ($body["job"] ?? ""));
    if ($job === "") throw new Exception("Choose a job");
    pos_send(200, pos_automation_tick(["job" => $job, "business_id" => trim((string) ($body["business_id"] ?? ""))]));
  }
  if ($path === "master/automation/logs" && $method === "GET") pos_send(200, pos_auto_summary());
  if ($path === "master/automation/retry" && $method === "POST") {
    $id = trim((string) ($body["id"] ?? ""));
    if ($id === "") {
      pos_q("UPDATE automation_queue SET status = 'pending', next_attempt_at = NULL WHERE status = 'failed'");
    } else {
      pos_q("UPDATE automation_queue SET status = 'pending', next_attempt_at = NULL, attempts = 0 WHERE id = ? AND status IN ('failed','skipped')", "s", [$id]);
    }
    pos_send(200, pos_automation_tick());
  }
  return false;
}

function pos_automation_shop_dispatch($path, $method, $body, $bid) {
  if ($path !== "automation/settings") return false;
  if ($method === "GET") {
    pos_send(200, ["ok" => true, "settings" => pos_auto_shop_row($bid), "testMode" => pos_auto_test_mode()]);
  }
  if ($method === "POST") pos_send(200, ["ok" => true, "settings" => pos_auto_save_shop($bid, $body)]);
  return false;
}
