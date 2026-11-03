<?php
/** Send each new sales invoice to the customer mobile through WAMaster. */

function pos_invoice_inr($n) {
  $neg = ((float) $n) < 0;
  $abs = number_format(abs((float) $n), 2, ".", "");
  $parts = explode(".", $abs, 2);
  $int = $parts[0];
  $dec = $parts[1] ?? "00";
  if (strlen($int) > 3) {
    $last = substr($int, -3);
    $rest = substr($int, 0, -3);
    $rest = preg_replace("/\B(?=(?:\d{2})+(?!\d))/", ",", $rest);
    $int = $rest . "," . $last;
  }
  return ($neg ? "-" : "") . "₹" . $int . "." . $dec;
}

function pos_invoice_whatsapp_text($shop, $order, $url, $extra = "") {
  $lines = [];
  $name = trim(preg_replace("/[\r\n]+/", " ", (string) $shop));
  if ($name !== "") $lines[] = $name;
  $number = trim((string) ($order["order_number"] ?? ""));
  if ($number !== "") $lines[] = "Invoice " . $number;
  $sub = (float) ($order["subtotal"] ?? 0);
  $disc = (float) ($order["discount"] ?? 0);
  $loy = (float) ($order["loyalty_discount"] ?? 0);
  $gst = (float) ($order["gst"] ?? 0);
  $total = (float) ($order["total"] ?? 0);
  if ($sub > 0.009) $lines[] = "Subtotal " . pos_invoice_inr($sub);
  if ($disc > 0.009) $lines[] = "Discount " . pos_invoice_inr($disc);
  if ($loy > 0.009) $lines[] = "Royalty points redeemed " . pos_invoice_inr($loy);
  if ($disc > 0.009 || $loy > 0.009) {
    $taxable = max(0, round(($sub - $disc - $loy) * 100) / 100);
    $lines[] = "Taxable " . pos_invoice_inr($taxable);
  }
  if ($gst > 0.009) $lines[] = "GST " . pos_invoice_inr($gst);
  $lines[] = "Amount " . pos_invoice_inr($total);
  if ((string) $url !== "") $lines[] = $url;
  $note = trim(preg_replace("/[\r\n]+/", " ", (string) $extra));
  if ($note !== "") $lines[] = $note;
  return implode("\n", $lines);
}

function pos_invoice_customer_mobile($order, $customer) {
  $onBill = function_exists("pos_normalize_in_mobile")
    ? pos_normalize_in_mobile($order["customer_mobile"] ?? ($order["customerMobile"] ?? ""))
    : "";
  if ($onBill !== "") return $onBill;
  if (!is_array($customer)) return "";
  $code = (string) ($customer["code"] ?? "");
  $name = trim((string) ($customer["name"] ?? ""));
  if ($code === "CUS-001" || preg_match("/^walk-?in$/i", $name)) return "";
  $raw = $customer["mobile"] ?? ($customer["phone"] ?? "");
  return function_exists("pos_normalize_in_mobile") ? pos_normalize_in_mobile($raw) : "";
}

function pos_invoice_public_url($orderId) {
  $base = function_exists("pos_public_app_url") ? pos_public_app_url() : "";
  if ($base === "") $base = "https://pos.atavtelecom.in";
  return rtrim($base, "/") . "/invoice.html?id=" . rawurlencode((string) $orderId);
}

function pos_invoice_whatsapp_schema() {
  static $done = false;
  if ($done) return;
  $done = true;
  $db = pos_db();
  $ok = $db->query("CREATE TABLE IF NOT EXISTS invoice_whatsapp (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    business_id VARCHAR(36) NOT NULL,
    sales_order_id VARCHAR(36) NOT NULL,
    order_number VARCHAR(40) NULL,
    recipient VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    error VARCHAR(180) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_invoice_wa (business_id, sales_order_id)
  )");
  if ($ok === false) throw new Exception($db->error ?: "Could not prepare invoice WhatsApp");
}

function pos_invoice_saved_order($bid, $order) {
  $id = (string) ($order["id"] ?? "");
  if ($id === "") return is_array($order) ? $order : [];
  try {
    $rows = pos_q("SELECT * FROM sales_orders WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$id, $bid]);
    if (!empty($rows[0])) {
      $row = $rows[0];
      $passed = (string) ($order["customer_mobile"] ?? ($order["customerMobile"] ?? ""));
      $have = function_exists("pos_normalize_in_mobile") ? pos_normalize_in_mobile($row["customer_mobile"] ?? "") : "";
      $fromCall = function_exists("pos_normalize_in_mobile") ? pos_normalize_in_mobile($passed) : "";
      if ($have === "" && $fromCall !== "") $row["customer_mobile"] = $passed;
      return $row;
    }
  } catch (Throwable $e) { /* use the order already in hand */ }
  return $order;
}

function pos_invoice_customer_row($bid, $order) {
  $id = (string) ($order["customer_id"] ?? "");
  if ($id === "") return null;
  try {
    $rows = pos_q("SELECT id, code, name, mobile, phone FROM customers WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$id, $bid]);
    return $rows[0] ?? null;
  } catch (Throwable $e) {
    return null;
  }
}

function pos_invoice_shop_name($bid) {
  try {
    $rows = pos_q("SELECT name FROM company_settings WHERE business_id = ? LIMIT 1", "s", [$bid]);
    $name = trim((string) ($rows[0]["name"] ?? ""));
    if ($name !== "") return $name;
  } catch (Throwable $e) { /* optional */ }
  try {
    $rows = pos_q("SELECT name FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
    $name = trim((string) ($rows[0]["name"] ?? ""));
    if ($name !== "") return $name;
  } catch (Throwable $e) { /* optional */ }
  return "Shop";
}

function pos_invoice_whatsapp_claim($bid, $order, $mobile) {
  pos_invoice_whatsapp_schema();
  $id = function_exists("pos_uuid") ? pos_uuid() : bin2hex(random_bytes(16));
  $number = substr((string) ($order["order_number"] ?? ""), 0, 40);
  try {
    pos_q(
      "INSERT INTO invoice_whatsapp (id, business_id, sales_order_id, order_number, recipient, status) VALUES (?,?,?,?,?, 'pending')",
      "sssss",
      [$id, $bid, (string) $order["id"], $number, $mobile]
    );
    return $id;
  } catch (Throwable $e) {
    if (stripos($e->getMessage(), "Duplicate") === false) throw $e;
    pos_q(
      "UPDATE invoice_whatsapp SET status = 'pending', recipient = ?, error = NULL WHERE business_id = ? AND sales_order_id = ? AND status = 'failed'",
      "sss",
      [$mobile, $bid, (string) $order["id"]]
    );
    $rows = pos_q(
      "SELECT id, status FROM invoice_whatsapp WHERE business_id = ? AND sales_order_id = ? LIMIT 1",
      "ss",
      [$bid, (string) $order["id"]]
    );
    if (($rows[0]["status"] ?? "") !== "pending") return "";
    return (string) ($rows[0]["id"] ?? "");
  }
}

function pos_invoice_whatsapp_finish($job) {
  $ok = false;
  $error = "";
  try {
    $sent = function_exists("pos_wa_send")
      ? pos_wa_send($job["cfg"], [$job["mobile"]], $job["message"])
      : ["ok" => false, "error" => "WhatsApp sender missing"];
    $ok = !empty($sent["ok"]);
    $error = $ok ? "" : substr((string) ($sent["reason"] ?? ($sent["error"] ?? "not sent")), 0, 180);
  } catch (Throwable $e) {
    $error = substr($e->getMessage(), 0, 180);
  }
  try {
    pos_q(
      "UPDATE invoice_whatsapp SET status = ?, error = ? WHERE id = ? AND business_id = ?",
      "ssss",
      [$ok ? "sent" : "failed", $error !== "" ? $error : null, $job["logId"], $job["bid"]]
    );
  } catch (Throwable $e) { /* the invoice is already saved */ }
}

function pos_deliver_invoice_whatsapp($bid, $order, $extra = "") {
  $logId = "";
  try {
    if (!function_exists("pos_wa_send") || !function_exists("pos_alert_settings")) {
      return ["ok" => false, "skipped" => true, "reason" => "wa-missing"];
    }
    $order = pos_invoice_saved_order($bid, is_array($order) ? $order : []);
    $id = (string) ($order["id"] ?? "");
    if ($id === "") return ["ok" => false, "skipped" => true, "reason" => "no-order"];
    $mobile = pos_invoice_customer_mobile($order, pos_invoice_customer_row($bid, $order));
    if ($mobile === "") return ["ok" => false, "skipped" => true, "reason" => "no-number"];
    $message = pos_invoice_whatsapp_text(pos_invoice_shop_name($bid), $order, pos_invoice_public_url($id), $extra);
    $cfg = pos_alert_settings();
    $logId = pos_invoice_whatsapp_claim($bid, $order, $mobile);
    if ($logId === "") return ["ok" => false, "skipped" => true, "reason" => "already-sent", "to" => $mobile];
    $job = [
      "cfg" => $cfg,
      "mobile" => $mobile,
      "message" => $message,
      "bid" => $bid,
      "logId" => $logId,
    ];
    register_shutdown_function(function () use ($job) {
      ignore_user_abort(true);
      if (function_exists("fastcgi_finish_request")) @fastcgi_finish_request();
      pos_invoice_whatsapp_finish($job);
    });
    return ["ok" => true, "queued" => true, "to" => $mobile];
  } catch (Throwable $e) {
    $error = substr($e->getMessage(), 0, 180);
    if ($logId !== "") {
      try {
        pos_q("UPDATE invoice_whatsapp SET status = 'failed', error = ? WHERE id = ? AND business_id = ?", "sss", [$error, $logId, $bid]);
      } catch (Throwable $e2) { /* the invoice is already saved */ }
    }
    return ["ok" => false, "error" => $error];
  }
}
