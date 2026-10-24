<?php
/** Customer outstanding WhatsApp reminders. Keeps invoices unpaid. */

function pos_due_round($n) {
  return round((float) $n, 2);
}

function pos_due_inr($n) {
  $neg = ((float) $n) < 0;
  $n = abs(pos_due_round($n));
  $parts = explode(".", number_format($n, 2, ".", ""));
  $int = $parts[0];
  $dec = $parts[1] ?? "00";
  if (strlen($int) > 3) {
    $last3 = substr($int, -3);
    $rest = substr($int, 0, -3);
    $rest = preg_replace('/\B(?=(\d{2})+(?!\d))/', ",", $rest);
    $int = $rest . "," . $last3;
  }
  return ($neg ? "-" : "") . $int . "." . $dec;
}

function pos_due_open_remainder($order) {
  $total = (float) ($order["total"] ?? 0);
  $paid = (float) ($order["amount_paid"] ?? 0);
  if ($paid > 0.004) return pos_due_round(max(0, $total - $paid));
  $status = strtolower(trim((string) ($order["payment_status"] ?? "")));
  $method = strtolower(trim((string) ($order["payment_method"] ?? "")));
  if ($status === "paid") return 0.0;
  if ($status === "unpaid" || $status === "due" || $status === "partial" || $method === "credit") {
    return pos_due_round(max(0, $total - $paid));
  }
  if ($method !== "" && $method !== "credit") return 0.0;
  return pos_due_round(max(0, $total - $paid));
}

function pos_due_payment_status($order) {
  $left = pos_due_open_remainder($order);
  if ($left <= 0.004) return "paid";
  $paid = (float) ($order["amount_paid"] ?? 0);
  $status = strtolower(trim((string) ($order["payment_status"] ?? "")));
  if ($paid > 0.004 || $status === "partial") return "partial";
  return "due";
}

function pos_due_ymd($value) {
  $text = trim((string) $value);
  if ($text === "") return "";
  if (preg_match('/^\d{4}-\d{2}-\d{2}$/', substr($text, 0, 10)) && strpos($text, "T") === false) return substr($text, 0, 10);
  try {
    $dt = new DateTime($text);
    $dt->setTimezone(new DateTimeZone("Asia/Kolkata"));
    return $dt->format("Y-m-d");
  } catch (Exception $e) {
    return "";
  }
}

function pos_due_format_day($value) {
  $ymd = pos_due_ymd($value);
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $ymd)) return "—";
  $dt = DateTime::createFromFormat("Y-m-d", $ymd, new DateTimeZone("Asia/Kolkata"));
  return $dt ? $dt->format("j M Y") : "—";
}

function pos_due_today() {
  $dt = new DateTime("now", new DateTimeZone("Asia/Kolkata"));
  return $dt->format("Y-m-d");
}

function pos_due_dash($value) {
  $text = trim(preg_replace('/\s+/', " ", (string) $value));
  return $text !== "" ? $text : "—";
}

function pos_due_reminder_message($payload) {
  $name = pos_due_dash($payload["customerName"] ?? "");
  $shop = pos_due_dash($payload["businessName"] ?? "");
  return implode("\n", [
    "Dear *{$name}*,",
    "",
    "Greetings from *{$shop}*!",
    "",
    "This is a friendly reminder that your payment is pending.",
    "",
    "📋 *Outstanding Payment Details*",
    "- Invoice No.: " . pos_due_dash($payload["invoiceNumber"] ?? ""),
    "- Invoice Date: " . pos_due_dash($payload["invoiceDate"] ?? ""),
    "- Invoice Amount: ₹" . pos_due_dash($payload["invoiceAmount"] ?? ""),
    "- Amount Paid: ₹" . pos_due_dash($payload["amountPaid"] ?? ""),
    "- *Balance Due: ₹" . pos_due_dash($payload["outstanding"] ?? "") . "*",
    "- Due Date: " . pos_due_dash($payload["dueDate"] ?? ""),
    "",
    "We kindly request you to clear the outstanding amount at your earliest convenience.",
    "",
    "If you have already paid, please ignore this reminder and share the payment confirmation if needed.",
    "",
    "Thank you for your business and continued support!",
    "",
    "Regards,",
    "*{$shop}*",
    "Powered by ATAV POS",
  ]);
}

function pos_due_shape($order, $today) {
  $outstanding = pos_due_open_remainder($order);
  $invoiceDate = pos_due_ymd($order["created_at"] ?? "");
  $dueDate = pos_due_ymd($order["due_date"] ?? ($order["created_at"] ?? ""));
  $mobile = (string) ($order["mobile"] ?? "");
  $name = trim((string) ($order["business_name"] ?? ($order["name"] ?? "")));
  return [
    "customerId" => (string) ($order["customer_id"] ?? ""),
    "customerName" => $name,
    "mobile" => $mobile,
    "mobileOk" => function_exists("pos_normalize_in_mobile") ? pos_normalize_in_mobile($mobile) !== "" : false,
    "orderId" => (string) ($order["id"] ?? ""),
    "invoiceNumber" => (string) ($order["order_number"] ?? ($order["id"] ?? "")),
    "invoiceDate" => $invoiceDate,
    "invoiceDateLabel" => pos_due_format_day($invoiceDate),
    "dueDate" => $dueDate,
    "dueDateLabel" => pos_due_format_day($dueDate),
    "total" => pos_due_round($order["total"] ?? 0),
    "amountPaid" => pos_due_round($order["amount_paid"] ?? 0),
    "outstanding" => $outstanding,
    "paymentStatus" => pos_due_payment_status($order),
    "overdue" => $outstanding > 0.004 && $dueDate !== "" && $dueDate < $today,
  ];
}

function pos_due_invoice_message($row, $shop) {
  return pos_due_reminder_message([
    "customerName" => $row["customerName"],
    "businessName" => $shop,
    "invoiceNumber" => $row["invoiceNumber"],
    "invoiceDate" => $row["invoiceDateLabel"],
    "invoiceAmount" => pos_due_inr($row["total"]),
    "amountPaid" => pos_due_inr($row["amountPaid"]),
    "outstanding" => pos_due_inr($row["outstanding"]),
    "dueDate" => $row["dueDateLabel"],
  ]);
}

function pos_due_customer_message($rows, $shop) {
  $open = array_values(array_filter($rows, function ($row) {
    return (float) ($row["outstanding"] ?? 0) > 0.004;
  }));
  if (!$open) return "";
  $numbers = [];
  foreach ($open as $row) {
    if (($row["invoiceNumber"] ?? "") !== "") $numbers[] = $row["invoiceNumber"];
  }
  $invoiceNumber = count($numbers) > 4
    ? implode(", ", array_slice($numbers, 0, 4)) . " +" . (count($numbers) - 4) . " more"
    : implode(", ", $numbers);
  $dates = [];
  $dues = [];
  $total = 0;
  $paid = 0;
  $due = 0;
  foreach ($open as $row) {
    if (($row["invoiceDate"] ?? "") !== "") $dates[] = $row["invoiceDate"];
    if (($row["dueDate"] ?? "") !== "") $dues[] = $row["dueDate"];
    $total += (float) $row["total"];
    $paid += (float) $row["amountPaid"];
    $due += (float) $row["outstanding"];
  }
  sort($dates);
  sort($dues);
  return pos_due_reminder_message([
    "customerName" => $open[0]["customerName"],
    "businessName" => $shop,
    "invoiceNumber" => $invoiceNumber,
    "invoiceDate" => pos_due_format_day($dates[0] ?? ""),
    "invoiceAmount" => pos_due_inr($total),
    "amountPaid" => pos_due_inr($paid),
    "outstanding" => pos_due_inr($due),
    "dueDate" => pos_due_format_day($dues[0] ?? ""),
  ]);
}

function pos_due_dedupe_key($customerId, $orderId, $outstanding, $day) {
  $scope = $orderId !== "" ? $orderId : "total";
  return $customerId . "|" . $scope . "|" . number_format(pos_due_round($outstanding), 2, ".", "") . "|" . $day;
}

function pos_due_wa_url($mobile, $text) {
  $local = function_exists("pos_normalize_in_mobile") ? pos_normalize_in_mobile($mobile) : "";
  $digits = $local !== "" ? "91" . $local : "";
  $q = "text=" . rawurlencode((string) $text);
  return $digits !== "" ? "https://wa.me/{$digits}?{$q}" : "https://wa.me/?{$q}";
}

function pos_ensure_due_wa_table() {
  pos_q("CREATE TABLE IF NOT EXISTS due_whatsapp_reminders (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    customer_id VARCHAR(255) NOT NULL,
    order_id VARCHAR(255) NOT NULL DEFAULT '',
    invoice_number VARCHAR(255) NOT NULL DEFAULT '',
    recipient VARCHAR(32) NOT NULL DEFAULT '',
    outstanding DECIMAL(12,2) NOT NULL DEFAULT 0,
    message TEXT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    provider_message_id VARCHAR(128) NULL,
    error VARCHAR(255) NULL,
    http_status INT NULL,
    attempts INT NOT NULL DEFAULT 0,
    dedupe_key VARCHAR(191) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    sent_at TIMESTAMP(3) NULL,
    INDEX idx_due_wa_biz (business_id, created_at),
    INDEX idx_due_wa_key (business_id, dedupe_key)
  )");
}

function pos_due_shop_name($bid) {
  try {
    $rows = pos_q("SELECT name FROM company_settings WHERE business_id = ? LIMIT 1", "s", [$bid]);
    if (!empty($rows[0]["name"])) return (string) $rows[0]["name"];
  } catch (Exception $e) {
    /* optional */
  }
  try {
    $rows = pos_q("SELECT name FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
    if (!empty($rows[0]["name"])) return (string) $rows[0]["name"];
  } catch (Exception $e) {
    /* optional */
  }
  return "ATAV POS";
}

function pos_due_load_invoices($bid) {
  pos_ensure_due_wa_table();
  try {
    return pos_q(
      "SELECT o.id, o.order_number, o.created_at, o.total, COALESCE(o.amount_paid,0) AS amount_paid,
              o.payment_method, o.payment_status, o.customer_id, c.name, c.business_name, c.mobile
       FROM sales_orders o
       JOIN customers c ON c.id = o.customer_id AND c.business_id = o.business_id
       WHERE o.business_id = ?
         AND LOWER(TRIM(COALESCE(o.status,'confirmed'))) <> 'cancelled'
         AND COALESCE(o.total,0) - CASE
           WHEN COALESCE(o.amount_paid,0) > 0.004 THEN COALESCE(o.amount_paid,0)
           WHEN LOWER(TRIM(COALESCE(o.payment_status,''))) = 'paid' THEN COALESCE(o.total,0)
           WHEN LOWER(TRIM(COALESCE(o.payment_method,''))) = 'credit'
             OR LOWER(TRIM(COALESCE(o.payment_status,''))) IN ('unpaid','due','partial')
             THEN COALESCE(o.amount_paid,0)
           WHEN NULLIF(LOWER(TRIM(COALESCE(o.payment_method,''))), '') IS NOT NULL THEN COALESCE(o.total,0)
           ELSE COALESCE(o.amount_paid,0)
         END > 0.004
       ORDER BY c.business_name, c.name, o.created_at
       LIMIT 800",
      "s",
      [$bid]
    );
  } catch (Exception $e) {
    return [];
  }
}

function pos_due_filter_rows($rows, $filters, $today) {
  $q = strtolower(trim((string) ($filters["customer"] ?? "")));
  $qDigits = preg_replace("/\D+/", "", $q);
  $from = (string) ($filters["from"] ?? "");
  $to = (string) ($filters["to"] ?? "");
  $status = strtolower((string) ($filters["status"] ?? ""));
  $overdueOnly = ($filters["overdue"] ?? "") === "1" || $status === "overdue";
  $min = ($filters["min"] ?? "") === "" ? null : (float) $filters["min"];
  $max = ($filters["max"] ?? "") === "" ? null : (float) $filters["max"];
  $out = [];
  foreach ($rows as $row) {
    if ((float) $row["outstanding"] <= 0.004 || ($row["paymentStatus"] ?? "") === "paid") continue;
    if ($q !== "") {
      $name = strtolower(($row["customerName"] ?? "") . " " . ($row["mobile"] ?? ""));
      $digits = preg_replace("/\D+/", "", (string) ($row["mobile"] ?? ""));
      if (strpos($name, $q) === false && !($qDigits !== "" && strpos($digits, $qDigits) !== false)) continue;
    }
    if ($from !== "" && ($row["invoiceDate"] ?? "") < $from) continue;
    if ($to !== "" && ($row["invoiceDate"] ?? "") > $to) continue;
    if ($overdueOnly && empty($row["overdue"])) continue;
    if (($status === "partial" || $status === "due") && ($row["paymentStatus"] ?? "") !== $status) continue;
    if ($min !== null && (float) $row["outstanding"] + 0.001 < $min) continue;
    if ($max !== null && (float) $row["outstanding"] - 0.001 > $max) continue;
    $out[] = $row;
  }
  return $out;
}

function pos_due_prepare($body, $invoices, $shop, $today) {
  $shaped = [];
  foreach ($invoices as $order) {
    $row = pos_due_shape($order, $today);
    if ($row["outstanding"] > 0.004) $shaped[] = $row;
  }
  $byCustomer = [];
  foreach ($shaped as $row) {
    $byCustomer[$row["customerId"]][] = $row;
  }
  $sends = array_slice(is_array($body["sends"] ?? null) ? $body["sends"] : [], 0, 40);
  $seen = [];
  $messages = [];
  foreach ($sends as $send) {
    $customerId = trim((string) ($send["customerId"] ?? ($send["customer_id"] ?? "")));
    $orderId = trim((string) ($send["orderId"] ?? ($send["order_id"] ?? "")));
    $scope = (($send["scope"] ?? "") === "customer" || ($orderId === "" && ($send["scope"] ?? "") !== "invoice")) ? "customer" : "invoice";
    $seenKey = $customerId . "|" . ($scope === "customer" ? "total" : $orderId);
    if ($customerId === "" || isset($seen[$seenKey])) continue;
    $seen[$seenKey] = true;
    $list = $byCustomer[$customerId] ?? [];
    if ($scope === "invoice") {
      $row = null;
      foreach ($list as $item) {
        if ($item["orderId"] === $orderId) $row = $item;
      }
      if (!$row) {
        $messages[] = ["ok" => false, "customerId" => $customerId, "orderId" => $orderId, "scope" => $scope, "reason" => "nothing-due", "message" => ""];
        continue;
      }
      $edited = trim((string) ($send["message"] ?? ""));
      $messages[] = pos_due_message_item($row, $scope, $orderId, $row["outstanding"], $row["invoiceNumber"], $edited !== "" ? $edited : pos_due_invoice_message($row, $shop), $customerId, $today);
      continue;
    }
    if (!$list) {
      $messages[] = ["ok" => false, "customerId" => $customerId, "orderId" => "", "scope" => $scope, "reason" => "nothing-due", "message" => ""];
      continue;
    }
    $outstanding = 0;
    $numbers = [];
    foreach ($list as $item) {
      $outstanding += (float) $item["outstanding"];
      if ($item["invoiceNumber"] !== "") $numbers[] = $item["invoiceNumber"];
    }
    $edited = trim((string) ($send["message"] ?? ""));
    $messages[] = pos_due_message_item($list[0], "customer", "", pos_due_round($outstanding), implode(", ", $numbers), $edited !== "" ? $edited : pos_due_customer_message($list, $shop), $customerId, $today);
  }
  return $messages;
}

function pos_due_message_item($row, $scope, $orderId, $outstanding, $invoiceNumber, $message, $customerId, $today) {
  $recipient = function_exists("pos_normalize_in_mobile") ? pos_normalize_in_mobile($row["mobile"]) : "";
  return [
    "ok" => true,
    "customerId" => $customerId,
    "orderId" => $orderId,
    "scope" => $scope,
    "customerName" => $row["customerName"],
    "mobile" => $row["mobile"],
    "mobileOk" => $recipient !== "",
    "recipient" => $recipient,
    "outstanding" => pos_due_round($outstanding),
    "invoiceNumber" => $invoiceNumber,
    "message" => substr($message, 0, 2000),
    "dedupeKey" => pos_due_dedupe_key($customerId, $orderId, $outstanding, $today),
    "fallbackUrl" => pos_due_wa_url($row["mobile"], $message),
  ];
}

function pos_due_wa_profile() {
  return "acc_1792638026073";
}

function pos_due_apply_profile($cfg) {
  $cfg["wa_profile_id"] = pos_due_wa_profile();
  return $cfg;
}

function pos_due_wa_configured($cfg) {
  $flag = $cfg["wa_enabled"] ?? "1";
  $off = $flag === 0 || $flag === "0" || $flag === false || $flag === "off";
  return !$off && ($cfg["wa_api_key"] ?? "") !== "";
}

function pos_due_map_status($wa) {
  $json = $wa["results"][0]["json"] ?? [];
  $raw = strtolower((string) ($json["status"] ?? ($wa["results"][0]["delivery"] ?? "")));
  if ($raw === "delivered" || $raw === "read") return "delivered";
  if ($raw === "queued" || !empty($json["queued"]) || !empty($wa["results"][0]["queued"])) return "queued";
  if (!empty($wa["ok"])) return "sent";
  return "failed";
}

function pos_due_send_one($item, $cfg, $bid, $shop, $resend) {
  if (empty($item["ok"])) {
    return ["ok" => false, "customerId" => $item["customerId"] ?? "", "orderId" => $item["orderId"] ?? "", "status" => "failed", "reason" => $item["reason"] ?? "nothing-due", "error" => "This invoice has no balance due"];
  }
  if (empty($item["mobileOk"]) || ($item["message"] ?? "") === "") {
    return ["ok" => false, "customerId" => $item["customerId"], "orderId" => $item["orderId"], "status" => "failed", "reason" => "bad-mobile", "error" => "Enter a 10-digit mobile number before sending WhatsApp"];
  }
  if (!pos_due_wa_configured($cfg)) {
    return [
      "ok" => false,
      "customerId" => $item["customerId"],
      "orderId" => $item["orderId"],
      "status" => "failed",
      "reason" => "wa-off",
      "error" => "WhatsApp API is not configured",
      "fallbackUrl" => $item["fallbackUrl"] ?? pos_due_wa_url($item["mobile"], $item["message"]),
      "outstanding" => $item["outstanding"],
    ];
  }
  $existing = pos_q(
    "SELECT * FROM due_whatsapp_reminders WHERE business_id = ? AND dedupe_key = ? ORDER BY created_at DESC LIMIT 1",
    "ss",
    [$bid, $item["dedupeKey"]]
  );
  $row = $existing[0] ?? null;
  if ($row) {
    $status = (string) ($row["status"] ?? "");
    $created = strtotime((string) ($row["updated_at"] ?? ($row["created_at"] ?? ""))) ?: 0;
    $age = $created ? (time() - $created) * 1000 : 999999;
    if ($status === "pending" && $age < 60000) {
      return ["ok" => true, "duplicate" => true, "status" => "pending", "customerId" => $item["customerId"], "orderId" => $item["orderId"], "reason" => "in-flight"];
    }
    if (in_array($status, ["sent", "delivered", "queued"], true) && !$resend) {
      return [
        "ok" => true,
        "duplicate" => true,
        "status" => $status,
        "customerId" => $item["customerId"],
        "orderId" => $item["orderId"],
        "providerMessageId" => $row["provider_message_id"] ?? "",
        "recipient" => $row["recipient"] ?? $item["recipient"],
        "outstanding" => $item["outstanding"],
      ];
    }
    $storedTemporary = function_exists("pos_signup_wa_temporary") ? pos_signup_wa_temporary($row) : false;
    if ($status === "failed" && !$resend && $storedTemporary && (int) ($row["attempts"] ?? 0) < 4) {
      return pos_due_finish_send($row["id"], $item, $cfg, $bid, $shop, (int) $row["attempts"] + 1);
    }
  }
  $id = function_exists("pos_uuid") ? pos_uuid() : bin2hex(random_bytes(16));
  $attempts = 1;
  pos_q(
    "INSERT INTO due_whatsapp_reminders
     (id, business_id, customer_id, order_id, invoice_number, recipient, outstanding, message, status, attempts, dedupe_key)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    "ssssssdssis",
    [
      $id, $bid, $item["customerId"], $item["orderId"], substr((string) $item["invoiceNumber"], 0, 255),
      $item["recipient"], $item["outstanding"], $item["message"], "pending", $attempts, $item["dedupeKey"],
    ]
  );
  return pos_due_finish_send($id, $item, $cfg, $bid, $shop, $attempts);
}

function pos_due_finish_send($id, $item, $cfg, $bid, $shop, $attempts) {
  $wa = function_exists("pos_wa_send") ? pos_wa_send($cfg, [$item["recipient"]], $item["message"]) : ["ok" => false, "error" => "WhatsApp sender missing"];
  $temporary = function_exists("pos_signup_wa_temporary") ? pos_signup_wa_temporary($wa) : false;
  if (empty($wa["ok"]) && $temporary && $attempts < 4) {
    $attempts += 1;
    $wa = pos_wa_send($cfg, [$item["recipient"]], $item["message"]);
  }
  $status = pos_due_map_status($wa);
  $provider = function_exists("pos_wa_provider_message_id") ? pos_wa_provider_message_id($wa) : "";
  $error = !empty($wa["ok"]) ? "" : substr((string) ($wa["error"] ?? ($wa["reason"] ?? "WhatsApp failed")), 0, 255);
  $http = (int) ($wa["results"][0]["status"] ?? ($wa["status"] ?? 0));
  $sentSql = in_array($status, ["sent", "queued", "delivered"], true) ? ", sent_at=CURRENT_TIMESTAMP(3)" : ", sent_at=NULL";
  pos_q(
    "UPDATE due_whatsapp_reminders
     SET status=?, provider_message_id=?, error=?, http_status=?, attempts=?{$sentSql}
     WHERE id=? AND status NOT IN ('sent','delivered')",
    "sssiis",
    [$status, $provider, $error, $http, $attempts, $id]
  );
  if (function_exists("pos_log_alert_deliveries")) {
    pos_log_alert_deliveries(
      ["kind" => "due-reminder", "businessId" => $bid, "shopName" => $shop],
      "Outstanding payment reminder",
      $item["message"],
      $wa,
      []
    );
  }
  return [
    "ok" => !empty($wa["ok"]),
    "customerId" => $item["customerId"],
    "orderId" => $item["orderId"],
    "scope" => $item["scope"],
    "status" => $status,
    "recipient" => $item["recipient"],
    "outstanding" => $item["outstanding"],
    "invoiceNumber" => $item["invoiceNumber"],
    "error" => $error,
    "providerMessageId" => $provider,
    "attempts" => $attempts,
    "duplicate" => false,
  ];
}

function pos_due_reminders_dispatch($path, $method, $body, $bid, $auth) {
  if ($path !== "customers/outstanding" && $path !== "customers/due-reminders") return false;
  $user = $auth["user"] ?? [];
  if (function_exists("pos_can") && !pos_can($user, "customers")) {
    pos_send(403, ["error" => "You do not have permission for this module", "php" => true]);
  }
  if ($path === "customers/outstanding" && $method === "GET") {
    $today = pos_due_today();
    $shop = pos_due_shop_name($bid);
    $shaped = [];
    foreach (pos_due_load_invoices($bid) as $order) {
      $shaped[] = pos_due_shape($order, $today);
    }
    $rows = pos_due_filter_rows($shaped, [
      "customer" => $_GET["customer"] ?? "",
      "from" => $_GET["from"] ?? "",
      "to" => $_GET["to"] ?? "",
      "status" => $_GET["status"] ?? "",
      "overdue" => $_GET["overdue"] ?? "",
      "min" => $_GET["min"] ?? "",
      "max" => $_GET["max"] ?? "",
    ], $today);
    $customers = [];
    $outstanding = 0;
    foreach ($rows as $row) {
      $customers[$row["customerId"]] = true;
      $outstanding += (float) $row["outstanding"];
    }
    pos_send(200, [
      "ok" => true,
      "php" => true,
      "shopName" => $shop,
      "today" => $today,
      "rows" => $rows,
      "summary" => [
        "invoices" => count($rows),
        "customers" => count($customers),
        "outstanding" => pos_due_round($outstanding),
      ],
    ]);
  }
  if ($path === "customers/due-reminders" && $method === "POST") {
    $sends = $body["sends"] ?? [];
    if (!is_array($sends) || !$sends) pos_send(400, ["error" => "Choose a customer or invoice", "php" => true]);
    $today = pos_due_today();
    $shop = pos_due_shop_name($bid);
    $cfg = pos_due_apply_profile(function_exists("pos_alert_settings") ? pos_alert_settings() : []);
    $messages = pos_due_prepare($body, pos_due_load_invoices($bid), $shop, $today);
    if (!$messages) pos_send(200, ["ok" => false, "error" => "Choose a customer or invoice with a balance due", "php" => true, "results" => []]);
    if (!empty($body["preview"])) {
      pos_send(200, [
        "ok" => true,
        "preview" => true,
        "php" => true,
        "shopName" => $shop,
        "waOff" => !pos_due_wa_configured($cfg),
        "messages" => $messages,
      ]);
    }
    $results = [];
    $resend = !empty($body["resend"]);
    foreach ($messages as $item) {
      try {
        $results[] = pos_due_send_one($item, $cfg, $bid, $shop, $resend);
      } catch (Throwable $e) {
        $results[] = ["ok" => false, "customerId" => $item["customerId"] ?? "", "orderId" => $item["orderId"] ?? "", "status" => "failed", "error" => $e->getMessage()];
      }
    }
    $ok = false;
    foreach ($results as $result) {
      if (!empty($result["ok"])) $ok = true;
    }
    pos_send(200, ["ok" => $ok, "preview" => false, "php" => true, "results" => $results]);
  }
  pos_send(405, ["error" => "Method not allowed", "php" => true]);
}
