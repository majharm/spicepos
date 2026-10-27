<?php
/** Recurring invoices on the PHP fallback. Same list shape as the Node route. */

function pos_recur_ensure() {
  static $done = false;
  if ($done) return;
  $db = pos_db();
  @$db->query("ALTER TABLE company_settings ADD COLUMN recurring_invoices_enabled TINYINT(1) NOT NULL DEFAULT 0");
  if (function_exists("pos_ensure_columns")) {
    pos_ensure_columns("sales_orders", [
      "due_date" => "DATE NULL",
      "recurring_schedule_id" => "VARCHAR(36) NULL",
    ]);
  }
  if (!$db->query("CREATE TABLE IF NOT EXISTS recurring_schedules (
    id VARCHAR(36) PRIMARY KEY,
    business_id VARCHAR(36) NOT NULL,
    name VARCHAR(180) NOT NULL,
    customer_id VARCHAR(36) NOT NULL,
    customer_name VARCHAR(180) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    frequency VARCHAR(16) NOT NULL,
    interval_days INT NULL,
    billing_day INT NULL,
    start_date DATE NOT NULL,
    end_date DATE NULL,
    max_cycles INT NULL,
    cycles_done INT NOT NULL DEFAULT 0,
    next_invoice_date DATE NOT NULL,
    payment_terms_days INT NOT NULL DEFAULT 0,
    auto_generate TINYINT(1) NOT NULL DEFAULT 1,
    whatsapp_invoice TINYINT(1) NOT NULL DEFAULT 0,
    whatsapp_reminder TINYINT(1) NOT NULL DEFAULT 0,
    email_invoice TINYINT(1) NOT NULL DEFAULT 0,
    discount_type VARCHAR(8) NULL,
    discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
    lines_json MEDIUMTEXT NOT NULL,
    last_order_id VARCHAR(36) NULL,
    last_order_number VARCHAR(32) NULL,
    last_error VARCHAR(255) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id),
    INDEX (business_id, status, next_invoice_date)
  )")) {
    throw new Exception($db->error ?: "Could not prepare recurring invoices");
  }
  if (!$db->query("CREATE TABLE IF NOT EXISTS recurring_runs (
    id VARCHAR(36) PRIMARY KEY,
    business_id VARCHAR(36) NOT NULL,
    schedule_id VARCHAR(36) NOT NULL,
    period_key VARCHAR(16) NOT NULL,
    sales_order_id VARCHAR(36) NULL,
    order_number VARCHAR(32) NULL,
    status VARCHAR(16) NOT NULL,
    notify_log TEXT NULL,
    error VARCHAR(255) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uniq_recur_period (business_id, schedule_id, period_key),
    INDEX (schedule_id)
  )")) {
    throw new Exception($db->error ?: "Could not prepare recurring invoices");
  }
  $done = true;
}

function pos_recur_exec($sql, $types, $params) {
  $db = pos_db();
  $st = $db->prepare($sql);
  if (!$st) throw new Exception($db->error ?: "SQL error");
  if ($types !== "") {
    $bind = [$types];
    foreach ($params as $i => $p) {
      $bind[] = &$params[$i];
    }
    call_user_func_array([$st, "bind_param"], $bind);
  }
  if (!$st->execute()) {
    $err = $st->error;
    $st->close();
    throw new Exception($err ?: "SQL error");
  }
  $st->close();
}

function pos_recur_flag($raw) {
  return $raw === true || $raw === 1 || $raw === "1";
}

function pos_recur_ymd($value) {
  $s = substr(trim((string) $value), 0, 10);
  return preg_match("/^\d{4}-\d{2}-\d{2}$/", $s) ? $s : "";
}

function pos_recur_today($tzName = "") {
  if (!is_string($tzName) || $tzName === "") {
    $tzName = function_exists("pos_shop_timezone") ? pos_shop_timezone() : "Asia/Kolkata";
  }
  try {
    return (new DateTime("now", new DateTimeZone($tzName)))->format("Y-m-d");
  } catch (Exception $e) {
    return (new DateTime("now", new DateTimeZone("Asia/Kolkata")))->format("Y-m-d");
  }
}

function pos_recur_add_days($from, $days) {
  $d = DateTime::createFromFormat("!Y-m-d", pos_recur_ymd($from));
  if (!$d) return "";
  $d->modify(($days < 0 ? "" : "+") . (int) $days . " days");
  return $d->format("Y-m-d");
}

function pos_recur_add_months($from, $months, $billingDay) {
  $d = DateTime::createFromFormat("!Y-m-d", pos_recur_ymd($from));
  if (!$d) return "";
  $y = (int) $d->format("Y");
  $m = (int) $d->format("n") + (int) $months;
  $y += intdiv($m - 1, 12);
  $m = (($m - 1) % 12) + 1;
  $dim = (int) (new DateTime(sprintf("%04d-%02d-01", $y, $m)))->format("t");
  $day = max(1, min(31, (int) $billingDay ?: (int) $d->format("j")));
  return sprintf("%04d-%02d-%02d", $y, $m, min($day, $dim));
}

function pos_recur_next_date($schedule, $from) {
  $from = pos_recur_ymd($from);
  $freq = (string) ($schedule["frequency"] ?? "");
  if ($from === "") return "";
  if ($freq === "daily") return pos_recur_add_days($from, 1);
  if ($freq === "weekly") return pos_recur_add_days($from, 7);
  if ($freq === "custom") {
    $interval = max(1, min(366, (int) ($schedule["interval_days"] ?? 1)));
    return pos_recur_add_days($from, $interval);
  }
  $months = ["monthly" => 1, "bimonthly" => 2, "quarterly" => 3, "half_yearly" => 6, "yearly" => 12][$freq] ?? 0;
  if (!$months) return "";
  $day = (int) ($schedule["billing_day"] ?? 0);
  if ($day < 1) $day = (int) substr($from, 8, 2);
  return pos_recur_add_months($from, $months, $day);
}

function pos_recur_frequencies() {
  return ["daily", "weekly", "monthly", "bimonthly", "quarterly", "half_yearly", "yearly", "custom"];
}

function pos_recur_shop($bid) {
  $rows = pos_q(
    "SELECT recurring_invoices_enabled, timezone FROM company_settings WHERE business_id = ? LIMIT 1",
    "s",
    [$bid]
  );
  return [
    "enabled" => pos_recur_flag($rows[0]["recurring_invoices_enabled"] ?? 0),
    "timezone" => $rows[0]["timezone"] ?? "Asia/Kolkata",
  ];
}

function pos_recur_require_on($bid) {
  $shop = pos_recur_shop($bid);
  if (!$shop["enabled"]) throw new Exception("Turn on Recurring Invoices in Invoice & Print Settings");
  return $shop;
}

function pos_recur_public($row) {
  if (!$row) return null;
  $lines = json_decode((string) ($row["lines_json"] ?? "[]"), true);
  if (!is_array($lines)) $lines = [];
  unset($row["lines_json"]);
  $row["start_date"] = pos_recur_ymd($row["start_date"] ?? "");
  $row["end_date"] = pos_recur_ymd($row["end_date"] ?? "");
  $row["next_invoice_date"] = pos_recur_ymd($row["next_invoice_date"] ?? "");
  $row["lines"] = $lines;
  return $row;
}

function pos_recur_stats($rows, $generated, $today) {
  $upcomingEnd = $today ? pos_recur_add_days($today, 7) : "";
  $active = 0;
  $upcoming = 0;
  $overdue = 0;
  $paused = 0;
  foreach ($rows as $row) {
    $status = strtolower((string) ($row["status"] ?? ""));
    $next = pos_recur_ymd($row["next_invoice_date"] ?? "");
    if ($status === "active") $active += 1;
    if ($status === "paused" || $status === "cancelled") $paused += 1;
    if ($status === "active" && $today && $next && $next < $today) $overdue += 1;
    if ($status === "active" && $today && $next && $next >= $today && $upcomingEnd && $next <= $upcomingEnd) $upcoming += 1;
  }
  return [
    "total" => count($rows),
    "active" => $active,
    "generatedThisMonth" => (int) $generated,
    "upcoming" => $upcoming,
    "overdue" => $overdue,
    "pausedOrCancelled" => $paused,
  ];
}

function pos_recur_list($bid, $filters) {
  $shop = pos_recur_shop($bid);
  $today = pos_recur_today($shop["timezone"] ?? "");
  if (!$shop["enabled"]) {
    return ["enabled" => false, "today" => $today, "stats" => pos_recur_stats([], 0, $today), "schedules" => []];
  }
  $rows = pos_q(
    "SELECT * FROM recurring_schedules WHERE business_id = ? ORDER BY next_invoice_date, name",
    "s",
    [$bid]
  );
  $month = substr($today, 0, 7);
  $counts = pos_q(
    "SELECT COUNT(*) AS n FROM recurring_runs WHERE business_id = ? AND status = 'generated' AND created_at >= ?",
    "ss",
    [$bid, $month . "-01"]
  );
  $public = array_map("pos_recur_public", $rows);
  $q = strtolower(trim((string) ($filters["q"] ?? "")));
  $status = strtolower(trim((string) ($filters["status"] ?? "")));
  $frequency = trim((string) ($filters["frequency"] ?? ""));
  $customerId = trim((string) ($filters["customer_id"] ?? $filters["customerId"] ?? ""));
  $from = pos_recur_ymd($filters["from"] ?? "");
  $to = pos_recur_ymd($filters["to"] ?? "");
  $list = [];
  foreach ($public as $row) {
    if ($status !== "" && strtolower((string) $row["status"]) !== $status) continue;
    if ($frequency !== "" && (string) $row["frequency"] !== $frequency) continue;
    if ($customerId !== "" && (string) $row["customer_id"] !== $customerId) continue;
    if ($from !== "" && (string) $row["next_invoice_date"] < $from) continue;
    if ($to !== "" && (string) $row["next_invoice_date"] > $to) continue;
    if ($q !== "") {
      $hay = strtolower(($row["name"] ?? "") . " " . ($row["customer_name"] ?? "") . " " . ($row["frequency"] ?? "") . " " . ($row["last_order_number"] ?? ""));
      if (strpos($hay, $q) === false) continue;
    }
    $list[] = $row;
  }
  return [
    "enabled" => true,
    "today" => $today,
    "stats" => pos_recur_stats($public, (int) ($counts[0]["n"] ?? 0), $today),
    "schedules" => $list,
  ];
}

function pos_recur_load($bid, $id) {
  $rows = pos_q("SELECT * FROM recurring_schedules WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$id, $bid]);
  return $rows[0] ?? null;
}

function pos_recur_parse_lines($raw) {
  if (is_string($raw)) $raw = json_decode($raw, true);
  if (!is_array($raw)) return [];
  $out = [];
  foreach ($raw as $line) {
    if (!is_array($line)) continue;
    $itemId = trim((string) ($line["itemId"] ?? $line["item_id"] ?? ""));
    $qty = (float) ($line["quantity_gm"] ?? $line["quantity"] ?? $line["qty"] ?? 0);
    if ($itemId === "" || $qty <= 0) continue;
    $rate = $line["rate"] ?? null;
    $gst = $line["gstRate"] ?? $line["gst_rate"] ?? null;
    $out[] = [
      "itemId" => $itemId,
      "quantity_gm" => $qty,
      "rate" => ($rate === null || $rate === "") ? null : (float) $rate,
      "discountType" => substr((string) ($line["discountType"] ?? $line["discount_type"] ?? "amt"), 0, 8),
      "discountValue" => (float) ($line["discountValue"] ?? $line["discount_value"] ?? $line["discount"] ?? 0),
      "gstRate" => ($gst === null || $gst === "") ? null : (float) $gst,
      "name" => substr((string) ($line["name"] ?? $line["item_name"] ?? ""), 0, 180),
    ];
  }
  return $out;
}

function pos_recur_clean($body, $existing) {
  $clip = function_exists("pos_clip_invoice_text")
    ? "pos_clip_invoice_text"
    : function ($v, $n) { return substr(trim((string) $v), 0, (int) $n); };
  $name = trim($clip($body["name"] ?? ($existing["name"] ?? ""), 180));
  $customerId = trim((string) ($body["customer_id"] ?? $body["customerId"] ?? ($existing["customer_id"] ?? "")));
  $frequency = trim((string) ($body["frequency"] ?? ($existing["frequency"] ?? "")));
  $hasLines = array_key_exists("lines", $body) || array_key_exists("lines_json", $body);
  $lines = $hasLines
    ? pos_recur_parse_lines($body["lines"] ?? $body["lines_json"])
    : pos_recur_parse_lines($existing["lines_json"] ?? "[]");
  $start = pos_recur_ymd($body["start_date"] ?? $body["startDate"] ?? ($existing["start_date"] ?? ""));
  $next = pos_recur_ymd($body["next_invoice_date"] ?? $body["nextInvoiceDate"] ?? ($existing["next_invoice_date"] ?? $start));
  $endRaw = $body["end_date"] ?? $body["endDate"] ?? ($existing["end_date"] ?? "");
  $end = $endRaw === "" || $endRaw === null ? "" : pos_recur_ymd($endRaw);
  $interval = (int) round((float) ($body["interval_days"] ?? $body["intervalDays"] ?? ($existing["interval_days"] ?? 0)));
  $billingDay = (int) round((float) ($body["billing_day"] ?? $body["billingDay"] ?? ($existing["billing_day"] ?? 0)));
  $terms = max(0, min(365, (int) round((float) ($body["payment_terms_days"] ?? $body["paymentTermsDays"] ?? ($existing["payment_terms_days"] ?? 0)))));
  $maxRaw = $body["max_cycles"] ?? $body["maxCycles"] ?? ($existing["max_cycles"] ?? null);
  $maxCycles = ($maxRaw === null || $maxRaw === "") ? null : max(1, min(1000, (int) round((float) $maxRaw)));
  $status = strtolower((string) ($body["status"] ?? ($existing["status"] ?? "active")));
  if ($name === "") throw new Exception("Enter a recurring invoice name");
  if ($customerId === "") throw new Exception("Choose a customer");
  if (!in_array($frequency, pos_recur_frequencies(), true)) throw new Exception("Choose a billing frequency");
  if (!$lines) throw new Exception("Add at least one product or service");
  if ($start === "" || $next === "") throw new Exception("Enter a valid start date and next invoice date");
  if ($endRaw !== "" && $endRaw !== null && $end === "") throw new Exception("End date is not valid");
  if ($end !== "" && $next > $end) throw new Exception("Next invoice date is after the end date");
  if ($frequency === "custom" && ($interval < 1 || $interval > 366)) throw new Exception("Custom interval must be between 1 and 366 days");
  if (in_array($frequency, ["monthly", "bimonthly", "quarterly", "half_yearly", "yearly"], true)) {
    if ($billingDay < 1 || $billingDay > 31) throw new Exception("Choose a billing day from 1 to 31");
  }
  if ($frequency === "weekly" && $billingDay && ($billingDay < 0 || $billingDay > 6)) {
    throw new Exception("Weekly billing day must be 0 (Sunday) to 6 (Saturday)");
  }
  if (!in_array($status, ["active", "paused", "completed", "cancelled"], true)) {
    throw new Exception("Status must be active, paused, completed, or cancelled");
  }
  if (!$existing && $status !== "active" && $status !== "paused") {
    throw new Exception("Start a schedule as active or paused");
  }
  $flag = function ($keys, $fallback) use ($body, $existing) {
    foreach ($keys as $key) {
      if (is_array($body) && array_key_exists($key, $body)) return pos_recur_flag($body[$key]) ? 1 : 0;
    }
    if ($existing) {
      foreach ($keys as $key) {
        if (array_key_exists($key, $existing)) return pos_recur_flag($existing[$key]) ? 1 : 0;
      }
    }
    return $fallback;
  };
  return [
    "name" => $name,
    "customerId" => $customerId,
    "frequency" => $frequency,
    "lines" => $lines,
    "start" => $start,
    "next" => $next,
    "end" => $end !== "" ? $end : null,
    "interval" => $frequency === "custom" ? $interval : null,
    "billingDay" => $billingDay ?: null,
    "terms" => $terms,
    "maxCycles" => $maxCycles ?: null,
    "status" => $status,
    "autoGenerate" => $flag(["auto_generate", "autoGenerate"], 1),
    "whatsappInvoice" => $flag(["whatsapp_invoice", "whatsappInvoice"], 0),
    "whatsappReminder" => $flag(["whatsapp_reminder", "whatsappReminder"], 0),
    "emailInvoice" => $flag(["email_invoice", "emailInvoice"], 0),
    "discountType" => substr((string) ($body["discount_type"] ?? $body["discountType"] ?? ($existing["discount_type"] ?? "amt")), 0, 8) ?: "amt",
    "discountValue" => max(0, (float) ($body["discount_value"] ?? $body["discountValue"] ?? ($existing["discount_value"] ?? 0))),
  ];
}

function pos_recur_customer($bid, $customerId) {
  $rows = pos_q("SELECT * FROM customers WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$customerId, $bid]);
  $customer = $rows[0] ?? null;
  if (!$customer) throw new Exception("Customer not found");
  $name = trim((string) ($customer["name"] ?? ""));
  if (($customer["code"] ?? "") === "CUS-001" || preg_match("/^walk-?in$/i", $name)) {
    throw new Exception("Choose a customer account. Walk-in cannot hold a recurring invoice.");
  }
  return $customer;
}

function pos_recur_customer_name($customer) {
  if (function_exists("pos_customer_label")) return pos_customer_label($customer);
  $biz = trim((string) ($customer["business_name"] ?? ""));
  return $biz !== "" ? $biz : trim((string) ($customer["name"] ?? ""));
}

function pos_recur_save_new($bid, $input, $customerName) {
  $id = pos_uuid();
  pos_recur_exec(
    "INSERT INTO recurring_schedules (
      id, business_id, name, customer_id, customer_name, status, frequency, interval_days, billing_day,
      start_date, end_date, max_cycles, next_invoice_date, payment_terms_days, auto_generate,
      whatsapp_invoice, whatsapp_reminder, email_invoice, discount_type, discount_value, lines_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    "sssssssiissisiiiiisds",
    [
      $id, $bid, $input["name"], $input["customerId"], $customerName, $input["status"], $input["frequency"],
      $input["interval"], $input["billingDay"], $input["start"], $input["end"], $input["maxCycles"], $input["next"],
      $input["terms"], $input["autoGenerate"], $input["whatsappInvoice"], $input["whatsappReminder"], $input["emailInvoice"],
      $input["discountType"], $input["discountValue"], json_encode($input["lines"]),
    ]
  );
  return pos_recur_load($bid, $id);
}

function pos_recur_set_status($bid, $id, $from, $to) {
  pos_recur_require_on($bid);
  $row = pos_recur_load($bid, $id);
  if (!$row) throw new Exception("Schedule not found");
  if ($from && !in_array((string) $row["status"], $from, true)) {
    throw new Exception("Cannot {$to} a {$row["status"]} schedule");
  }
  pos_q("UPDATE recurring_schedules SET status = ? WHERE id = ? AND business_id = ?", "sss", [$to, $id, $bid]);
  return pos_recur_public(pos_recur_load($bid, $id));
}

function pos_recur_plan($schedule, $today, $run, $manual) {
  $status = strtolower((string) ($schedule["status"] ?? ""));
  if ($status === "cancelled" || $status === "completed") return ["action" => "skip"];
  if (!$manual && $status !== "active") return ["action" => "skip"];
  if (!$manual && !pos_recur_flag($schedule["auto_generate"] ?? 0)) return ["action" => "skip"];
  $due = pos_recur_ymd($schedule["next_invoice_date"] ?? "");
  if ($due === "") return ["action" => "skip"];
  if (!$manual && $due > (string) $today) return ["action" => "skip"];
  $end = pos_recur_ymd($schedule["end_date"] ?? "");
  if ($end !== "" && $due > $end) return ["action" => "complete"];
  $max = (int) ($schedule["max_cycles"] ?? 0);
  $done = (int) ($schedule["cycles_done"] ?? 0);
  if ($max > 0 && $done >= $max) return ["action" => "complete"];
  if (!empty($run["sales_order_id"])) {
    return ["action" => "replay", "orderId" => $run["sales_order_id"], "orderNumber" => $run["order_number"] ?? ""];
  }
  if (strtolower((string) ($run["status"] ?? "")) === "pending") {
    $age = time() - strtotime((string) ($run["created_at"] ?? ""));
    if ($age >= 0 && $age < 120) return ["action" => "busy"];
  }
  $next = pos_recur_next_date($schedule, $due);
  $cycles = $done + 1;
  $after = ($status === "paused" && $manual) ? "paused" : "active";
  if (($max > 0 && $cycles >= $max) || ($end !== "" && $next !== "" && $next > $end)) $after = "completed";
  return ["action" => "create", "period" => $due, "nextDate" => $next, "afterStatus" => $after, "cyclesDone" => $cycles];
}

function pos_recur_generate($bid, $id, $auth) {
  $shop = pos_recur_require_on($bid);
  $schedule = pos_recur_load($bid, $id);
  if (!$schedule) throw new Exception("Schedule not found");
  $customer = pos_recur_customer($bid, $schedule["customer_id"]);
  $today = pos_recur_today($shop["timezone"] ?? "");
  $period = pos_recur_ymd($schedule["next_invoice_date"] ?? "");
  $runs = $period === "" ? [] : pos_q(
    "SELECT * FROM recurring_runs WHERE business_id = ? AND schedule_id = ? AND period_key = ? LIMIT 1",
    "sss",
    [$bid, $id, $period]
  );
  $plan = pos_recur_plan($schedule, $today, $runs[0] ?? [], true);
  if ($plan["action"] === "complete") {
    pos_q("UPDATE recurring_schedules SET status = 'completed', last_error = NULL WHERE id = ? AND business_id = ?", "ss", [$id, $bid]);
    return ["ok" => true, "schedule" => pos_recur_public(pos_recur_load($bid, $id)), "results" => []];
  }
  if ($plan["action"] === "replay") {
    return ["ok" => true, "schedule" => pos_recur_public($schedule), "results" => [[
      "replay" => true, "busy" => false, "error" => "", "period" => $period,
      "orderId" => $plan["orderId"], "orderNumber" => $plan["orderNumber"], "paymentStatus" => "",
    ]]];
  }
  if ($plan["action"] === "busy") {
    return ["ok" => true, "schedule" => pos_recur_public($schedule), "results" => [[
      "replay" => false, "busy" => true, "error" => "", "period" => $period, "orderId" => "", "orderNumber" => "", "paymentStatus" => "",
    ]]];
  }
  if ($plan["action"] !== "create") {
    return ["ok" => true, "schedule" => pos_recur_public($schedule), "results" => []];
  }
  $runId = $runs[0]["id"] ?? pos_uuid();
  if (empty($runs[0])) {
    pos_recur_exec(
      "INSERT INTO recurring_runs (id, business_id, schedule_id, period_key, status) VALUES (?,?,?,?, 'pending')",
      "ssss",
      [$runId, $bid, $id, $plan["period"]]
    );
  } else {
    pos_q("UPDATE recurring_runs SET status = 'pending', error = NULL WHERE id = ?", "s", [$runId]);
  }
  try {
    if (function_exists("pos_require_checkout")) pos_require_checkout();
    $user = $auth["user"] ?? [];
    $lines = pos_recur_parse_lines($schedule["lines_json"] ?? "[]");
    $order = pos_checkout_sale(
      $bid,
      $auth["branchId"] ?? ($user["branch_id"] ?? null),
      $user["id"] ?? null,
      $auth,
      [
        "customerId" => $schedule["customer_id"],
        "paymentMethod" => "credit",
        "discountType" => $schedule["discount_type"] ?: "amt",
        "discountValue" => $schedule["discount_value"] ?? 0,
        "lines" => $lines,
      ]
    );
    $paid = (float) ($order["amount_paid"] ?? 0);
    if (strtolower((string) ($order["payment_status"] ?? "")) === "paid" && $paid <= 0) {
      throw new Exception("Recurring invoice was marked paid without a payment");
    }
    $due = pos_recur_add_days($plan["period"], (int) ($schedule["payment_terms_days"] ?? 0));
    try {
      pos_recur_exec(
        "UPDATE sales_orders SET due_date = ?, recurring_schedule_id = ? WHERE id = ? AND business_id = ?",
        "ssss",
        [$due !== "" ? $due : null, $id, $order["id"], $bid]
      );
    } catch (Exception $e) { /* columns are optional until the schema migrate */ }
    pos_recur_exec(
      "UPDATE recurring_runs SET status = 'generated', sales_order_id = ?, order_number = ?, error = NULL WHERE id = ?",
      "sss",
      [$order["id"], $order["order_number"], $runId]
    );
    pos_recur_exec(
      "UPDATE recurring_schedules SET next_invoice_date = ?, cycles_done = ?, status = ?, last_order_id = ?, last_order_number = ?, last_error = NULL, customer_name = ? WHERE id = ? AND business_id = ?",
      "sissssss",
      [
        $plan["nextDate"], $plan["cyclesDone"], $plan["afterStatus"], $order["id"], $order["order_number"],
        pos_recur_customer_name($customer), $id, $bid,
      ]
    );
    return ["ok" => true, "schedule" => pos_recur_public(pos_recur_load($bid, $id)), "results" => [[
      "replay" => false,
      "busy" => false,
      "error" => "",
      "period" => $plan["period"],
      "orderId" => $order["id"],
      "orderNumber" => $order["order_number"],
      "paymentStatus" => $order["payment_status"] ?? "unpaid",
    ]]];
  } catch (Exception $e) {
    $message = substr($e->getMessage(), 0, 240);
    pos_q("UPDATE recurring_runs SET status = 'error', error = ? WHERE id = ?", "ss", [$message, $runId]);
    pos_q("UPDATE recurring_schedules SET last_error = ? WHERE id = ? AND business_id = ?", "sss", [$message, $id, $bid]);
    return ["ok" => true, "schedule" => pos_recur_public(pos_recur_load($bid, $id)), "results" => [[
      "replay" => false, "busy" => false, "error" => $message, "period" => $plan["period"],
      "orderId" => "", "orderNumber" => "", "paymentStatus" => "",
    ]]];
  }
}

function pos_recurring_dispatch($path, $method, $body, $bid, $auth) {
  if ($path !== "recurring" && strpos($path, "recurring/") !== 0) return false;
  pos_recur_ensure();
  $user = $auth["user"] ?? [];
  if (!pos_can($user, "orders")) {
    pos_send(403, ["error" => "You do not have permission for sales invoices", "php" => true]);
  }
  $body = is_array($body) ? $body : [];
  $method = strtoupper((string) $method);
  try {
    if ($path === "recurring" && $method === "GET") {
      pos_send(200, pos_recur_list($bid, $_GET));
    }
    if ($path === "recurring" && $method === "POST") {
      pos_recur_require_on($bid);
      $input = pos_recur_clean($body, null);
      $customer = pos_recur_customer($bid, $input["customerId"]);
      $row = pos_recur_save_new($bid, $input, pos_recur_customer_name($customer));
      pos_send(200, ["ok" => true, "schedule" => pos_recur_public($row)]);
    }
    if (preg_match("#^recurring/([^/]+)$#", $path, $m) && $method === "GET") {
      pos_recur_require_on($bid);
      $row = pos_recur_load($bid, $m[1]);
      if (!$row) pos_send(404, ["error" => "Schedule not found", "php" => true]);
      $runs = pos_q(
        "SELECT * FROM recurring_runs WHERE business_id = ? AND schedule_id = ? ORDER BY period_key DESC",
        "ss",
        [$bid, $row["id"]]
      );
      pos_send(200, ["schedule" => pos_recur_public($row), "runs" => $runs]);
    }
    if (preg_match("#^recurring/([^/]+)$#", $path, $m) && $method === "POST") {
      pos_recur_require_on($bid);
      $existing = pos_recur_load($bid, $m[1]);
      if (!$existing) pos_send(404, ["error" => "Schedule not found", "php" => true]);
      if (in_array((string) $existing["status"], ["cancelled", "completed"], true)) {
        throw new Exception("This schedule is closed. Previously generated invoices stay as they are.");
      }
      $input = pos_recur_clean($body, $existing);
      if ($input["status"] === "cancelled" || $input["status"] === "completed") {
        throw new Exception("Use pause, resume, or cancel for status changes");
      }
      $customer = pos_recur_customer($bid, $input["customerId"]);
      pos_recur_exec(
        "UPDATE recurring_schedules SET
          name=?, customer_id=?, customer_name=?, status=?, frequency=?, interval_days=?, billing_day=?,
          start_date=?, end_date=?, max_cycles=?, next_invoice_date=?, payment_terms_days=?, auto_generate=?,
          whatsapp_invoice=?, whatsapp_reminder=?, email_invoice=?, discount_type=?, discount_value=?, lines_json=?, last_error=NULL
         WHERE id=? AND business_id=?",
        "sssssiissisiiiiisdsss",
        [
          $input["name"], $input["customerId"], pos_recur_customer_name($customer), $input["status"], $input["frequency"],
          $input["interval"], $input["billingDay"], $input["start"], $input["end"], $input["maxCycles"], $input["next"],
          $input["terms"], $input["autoGenerate"], $input["whatsappInvoice"], $input["whatsappReminder"], $input["emailInvoice"],
          $input["discountType"], $input["discountValue"], json_encode($input["lines"]), $existing["id"], $bid,
        ]
      );
      pos_send(200, ["ok" => true, "schedule" => pos_recur_public(pos_recur_load($bid, $existing["id"]))]);
    }
    if (preg_match("#^recurring/([^/]+)/(pause|resume|cancel)$#", $path, $m) && $method === "POST") {
      $map = [
        "pause" => [["active"], "paused"],
        "resume" => [["paused"], "active"],
        "cancel" => [["active", "paused"], "cancelled"],
      ];
      $rule = $map[$m[2]];
      pos_send(200, ["ok" => true, "schedule" => pos_recur_set_status($bid, $m[1], $rule[0], $rule[1])]);
    }
    if (preg_match("#^recurring/([^/]+)/generate$#", $path, $m) && $method === "POST") {
      pos_send(200, pos_recur_generate($bid, $m[1], $auth));
    }
  } catch (Exception $e) {
    $msg = $e->getMessage();
    $code = 400;
    if (stripos($msg, "not found") !== false) $code = 404;
    if (stripos($msg, "Turn on Recurring") !== false) $code = 403;
    pos_send($code, ["error" => $msg, "php" => true]);
  }
  return false;
}
