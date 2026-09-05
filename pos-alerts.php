<?php

function pos_wa_revoked_api_keys() {
  return ["b99fcac4528c679916dcd461f5d834a098c9f9fa2fd349c67395fb028579cc1b"];
}

function pos_alert_defaults() {
  return [
    "wa_enabled" => "1",
    "wa_api_url" => "https://wamaster.atavtelecom.in/api/v1/send",
    "wa_api_key" => "56e4be3511d76e32c1ec4b9c26afc48e9cb8d2833984095a62f9357894c6f814",
    "wa_profile_id" => "acc_1782484414096",
    "wa_country_code" => "91",
    "alert_welcome" => "1",
    "alert_credentials" => "1",
    "alert_updates" => "1",
    "alert_closing" => "1",
    "alert_low_stock" => "1",
    "alert_renewal_before" => "1",
    "alert_renewal_expired" => "1",
    "alert_closing_hour" => "22",
    "smtp_enabled" => "1",
    "smtp_host" => "smtp.hostinger.com",
    "smtp_port" => "465",
    "smtp_secure" => "1",
    "smtp_user" => "pos@atavtelecom.in",
    "smtp_pass" => "J:0TL0h>",
    "mail_from" => "pos@atavtelecom.in",
    "mail_from_name" => "ATAV POS",
    "tpl_welcome" => "",
    "tpl_credentials" => "",
    "tpl_updates" => "",
    "tpl_closing" => "",
    "tpl_low_stock" => "",
    "tpl_renewal_before" => "",
    "tpl_renewal_expired" => "",
  ];
}

function pos_alert_kinds() {
  return ["welcome", "credentials", "updates", "closing", "low_stock", "renewal_before", "renewal_expired"];
}

function pos_alert_default_templates() {
  return [
    "welcome" => "Welcome to ATAV POS.\n\nHello {{name}}, shop \"{{shop}}\" is ready.\n\nSign in: {{signInUrl}}\nKeep your login private.\n\n— ATAV Telecom POS",
    "credentials" => "ATAV POS login for \"{{shop}}\"\nRole: {{role}}\nUser ID: {{username}}\nEmail: {{email}}\nPassword: {{password}}\nSign in: {{signInUrl}}\n\nDo not share this message.\n— ATAV Telecom POS",
    "updates" => "ATAV POS update · {{shop}}\n\n{{title}}\n\n{{body}}\n\n— ATAV Telecom POS",
    "closing" => "{{shop}} — closing {{day}}\nBills: {{bills}}\nTotal: {{takings}}\nCash {{cash}} · UPI {{upi}} · Card {{card}} · Credit {{credit}}\nGST: {{gst}}\n{{lowStock}}\n\n— ATAV Telecom POS",
    "low_stock" => "{{shop}} — low stock alert\n\n{{lowStock}}\n\n— ATAV Telecom POS",
    "renewal_before" => "ATAV POS renewal reminder · {{shop}}\n\nHello {{name}}, your {{plan}} plan expires on {{expiry}} ({{days}} day(s) left).\n\nRenew now so billing and login stay on.\nSign in: {{signInUrl}}\nHelp: {{supportPhone}}\n\n— ATAV Telecom POS",
    "renewal_expired" => "ATAV POS subscription expired · {{shop}}\n\nHello {{name}}, the {{plan}} plan expired on {{expiry}}.\n\nRenew to restore billing and staff login.\nSign in: {{signInUrl}}\nHelp: {{supportPhone}}\n\n— ATAV Telecom POS",
  ];
}

function pos_fill_template($tpl, $vars) {
  return preg_replace_callback('/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/', function ($m) use ($vars) {
    return (string) ($vars[$m[1]] ?? "");
  }, (string) $tpl);
}

function pos_effective_tpl($kind, $stored) {
  $text = trim((string) $stored);
  if ($text !== "") return $text;
  $defaults = pos_alert_default_templates();
  return $defaults[$kind] ?? "";
}

function pos_alert_vars($payload) {
  $items = $payload["items"] ?? ($payload["lowStock"] ?? []);
  $bullets = [];
  foreach ($items as $item) {
    if (is_string($item)) {
      $name = $item;
      $qty = "";
    } else {
      $name = $item["name"] ?? "";
      $qty = !empty($item["qtyLabel"]) ? (" (" . $item["qtyLabel"] . ")") : "";
    }
    if ($name !== "") $bullets[] = "• {$name}{$qty}";
  }
  $money = function ($key) use ($payload) {
    $value = $payload[$key] ?? "";
    if ($value === "" || $value === null) return "";
    if (is_string($value) && strpos($value, "₹") !== false) return $value;
    return pos_alert_inr($value);
  };
  $bills = $payload["bills"] ?? "";
  return [
    "shop" => $payload["shopName"] ?? ($payload["shop"] ?? ""),
    "name" => $payload["ownerName"] ?? ($payload["name"] ?? ""),
    "username" => $payload["username"] ?? "",
    "email" => $payload["email"] ?? "",
    "password" => $payload["password"] ?? "",
    "role" => str_replace("_", " ", (string) ($payload["role"] ?? "")),
    "signInUrl" => $payload["signInUrl"] ?? "",
    "title" => $payload["title"] ?? "",
    "body" => $payload["body"] ?? "",
    "day" => $payload["day"] ?? "",
    "bills" => ($bills === "" || $bills === null) ? "" : (string) ((int) $bills),
    "takings" => $money("takings"),
    "cash" => $money("cash"),
    "upi" => $money("upi"),
    "card" => $money("card"),
    "credit" => $money("credit"),
    "gst" => $money("gst"),
    "lowStock" => $payload["lowStockText"] ?? implode("\n", $bullets),
    "expiry" => $payload["expiry"] ?? "",
    "days" => (($payload["days"] ?? "") === "" || ($payload["days"] ?? null) === null) ? "" : (string) $payload["days"],
    "plan" => $payload["plan"] ?? ($payload["planName"] ?? ""),
    "supportPhone" => $payload["supportPhone"] ?? ($payload["support_phone"] ?? ""),
  ];
}

function pos_alert_sample_payload() {
  return [
    "shopName" => "SWAMI MASALE SASWAD",
    "ownerName" => "Shop owner",
    "username" => "swami.admin",
    "email" => "admin@shop.local",
    "password" => "********",
    "role" => "business_admin",
    "signInUrl" => "https://pos.atavtelecom.in/login.html",
    "title" => "Holiday hours",
    "body" => "Closed this Sunday.",
    "day" => "2026-09-01",
    "bills" => 12,
    "takings" => 4500,
    "cash" => 2000,
    "upi" => 1500,
    "card" => 800,
    "credit" => 200,
    "gst" => 225,
    "items" => [["name" => "Turmeric powder", "qtyLabel" => "2 kg"]],
    "expiry" => "2026-09-12",
    "days" => "7",
    "plan" => "Yearly",
    "supportPhone" => "9876543210",
  ];
}

function pos_render_alert($kind, $payload, $settings = null) {
  $settings = $settings ?: [];
  $tpl = pos_effective_tpl($kind, $settings["tpl_{$kind}"] ?? "");
  return trim(pos_fill_template($tpl, pos_alert_vars($payload)));
}

function pos_alert_flag($value, $fallback = true) {
  if ($value === null || $value === "") return $fallback;
  return !in_array(strtolower(trim((string) $value)), ["0", "false", "no", "off"], true);
}

function pos_normalize_in_mobile($raw) {
  $d = preg_replace("/\D+/", "", (string) $raw);
  if (strpos($d, "00") === 0) $d = substr($d, 2);
  if (strpos($d, "91") === 0 && strlen($d) >= 12) $d = substr($d, -10);
  elseif (strpos($d, "0") === 0 && strlen($d) === 11) $d = substr($d, 1);
  elseif (strlen($d) > 10) $d = substr($d, -10);
  return preg_match("/^\d{10}$/", $d) ? $d : "";
}

function pos_wa_intl_number($raw, $country = "91") {
  $local = pos_normalize_in_mobile($raw);
  $cc = preg_replace("/\D+/", "", (string) $country) ?: "91";
  return $local !== "" ? $cc . $local : "";
}

function pos_wa_rate_limit_error() {
  return "WhatsApp rate limited (HTTP 429). Wait a minute and send again.";
}

function pos_wa_retry_wait_us($status, $headers, $attempt = 0) {
  if ((int) $status !== 429) return 0;
  foreach ((array) $headers as $line) {
    if (stripos($line, "Retry-After:") === 0) {
      $sec = (int) trim(substr($line, 12));
      if ($sec > 0) return min(60000000, $sec * 1000000);
    }
  }
  return min(60000000, 20000000 * ((int) $attempt + 1));
}

function pos_wa_pace() {
  static $last = 0;
  $now = (int) floor(microtime(true) * 1000000);
  $wait = $last + 220000 - $now;
  if ($wait > 0) usleep($wait);
  $last = (int) floor(microtime(true) * 1000000);
}

function pos_wa_response_ok($status, $body) {
  $code = (int) $status;
  if ($code === 429) return ["ok" => false, "error" => pos_wa_rate_limit_error(), "status" => 429];
  if ($code >= 400) return ["ok" => false, "error" => "WhatsApp HTTP {$code}"];
  $text = trim((string) $body);
  if ($text === "") return ["ok" => false, "error" => "WhatsApp empty response"];
  if (isset($text[0]) && $text[0] === "<") return ["ok" => false, "error" => "WhatsApp API returned a web page, not JSON"];
  $json = json_decode($text, true);
  if (!is_array($json)) {
    if (preg_match("/sent|success|ok/i", $text) && !preg_match("/error|fail/i", $text)) return ["ok" => true];
    return ["ok" => false, "error" => substr($text, 0, 160) ?: "WhatsApp response was not JSON"];
  }
  if (($json["ok"] ?? null) === false) return ["ok" => false, "error" => $json["error"] ?? ($json["message"] ?? "WhatsApp rejected the send")];
  if (($json["ok"] ?? null) === true || (int) ($json["sent"] ?? 0) > 0) {
    return ["ok" => true, "to" => $json["results"][0]["number"] ?? ($json["number"] ?? "")];
  }
  if (($json["success"] ?? null) === true || ($json["status"] ?? "") === "success") return ["ok" => true];
  return ["ok" => false, "error" => $json["error"] ?? ($json["message"] ?? "WhatsApp did not confirm the send")];
}

function pos_mask_secret($value) {
  $s = (string) $value;
  if ($s === "") return "";
  if (strlen($s) <= 4) return "••••";
  return "••••" . substr($s, -4);
}

function pos_looks_masked_secret($value) {
  $s = (string) $value;
  return $s === "" || strpos($s, "••••") === 0;
}

function pos_alert_inr($n) {
  return "₹" . number_format((float) $n, 2, ".", ",");
}

function pos_ensure_notification_schema() {
  static $done = false;
  if ($done) return;
  $done = true;
  $db = pos_db();
  @$db->query(
    "CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NULL,
      title VARCHAR(255) NOT NULL,
      body TEXT NULL,
      image_url MEDIUMTEXT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    )"
  );
  @$db->query("ALTER TABLE notifications ADD COLUMN image_url MEDIUMTEXT NULL");
}

function pos_ensure_alert_schema() {
  static $done = false;
  if ($done) return;
  $done = true;
  pos_ensure_notification_schema();
  $db = pos_db();
  @$db->query(
    "CREATE TABLE IF NOT EXISTS alert_sends (
      id VARCHAR(255) PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      kind VARCHAR(32) NOT NULL,
      item_id VARCHAR(255) NOT NULL DEFAULT '',
      send_day DATE NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_alert_send (business_id, kind, item_id, send_day)
    )"
  );
  @$db->query(
    "CREATE TABLE IF NOT EXISTS alert_delivery_logs (
      id VARCHAR(255) PRIMARY KEY,
      channel VARCHAR(16) NOT NULL,
      kind VARCHAR(32) NOT NULL DEFAULT '',
      business_id VARCHAR(255) NOT NULL DEFAULT '',
      shop_name VARCHAR(255) NOT NULL DEFAULT '',
      recipient VARCHAR(255) NOT NULL DEFAULT '',
      subject VARCHAR(255) NOT NULL DEFAULT '',
      preview TEXT NULL,
      status VARCHAR(16) NOT NULL DEFAULT '',
      ok TINYINT(1) NOT NULL DEFAULT 0,
      error VARCHAR(255) NULL,
      detail VARCHAR(255) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_adl_created (created_at),
      INDEX idx_adl_channel (channel),
      INDEX idx_adl_biz (business_id)
    )"
  );
  foreach (pos_alert_defaults() as $key => $value) {
    $row = pos_q("SELECT setting_value FROM platform_settings WHERE setting_key = ? LIMIT 1", "s", [$key]);
    if (!$row) pos_set_setting($key, $value);
    elseif (($row[0]["setting_value"] ?? "") === "" && in_array($key, ["wa_api_key", "wa_profile_id", "wa_api_url", "smtp_host", "smtp_user", "smtp_pass", "mail_from"], true)) {
      pos_set_setting($key, $value);
    } elseif ($key === "wa_api_key" && in_array($row[0]["setting_value"] ?? "", pos_wa_revoked_api_keys(), true)) {
      pos_set_setting($key, $value);
    }
  }
}

function pos_alert_settings() {
  pos_ensure_alert_schema();
  $rows = pos_q("SELECT setting_key, setting_value FROM platform_settings");
  $map = [];
  foreach ($rows as $r) $map[$r["setting_key"]] = $r["setting_value"] ?? "";
  $d = pos_alert_defaults();
  $hour = (int) ($map["alert_closing_hour"] ?? $d["alert_closing_hour"]);
  if ($hour < 0 || $hour > 23) $hour = 22;
  return [
    "wa_enabled" => pos_alert_flag($map["wa_enabled"] ?? "1") ? "1" : "0",
    "wa_api_url" => $map["wa_api_url"] ?: $d["wa_api_url"],
    "wa_api_key" => $map["wa_api_key"] ?: "",
    "wa_profile_id" => $map["wa_profile_id"] ?: "",
    "wa_country_code" => $map["wa_country_code"] ?: $d["wa_country_code"],
    "alert_welcome" => pos_alert_flag($map["alert_welcome"] ?? "1") ? "1" : "0",
    "alert_credentials" => pos_alert_flag($map["alert_credentials"] ?? "1") ? "1" : "0",
    "alert_updates" => pos_alert_flag($map["alert_updates"] ?? "1") ? "1" : "0",
    "alert_closing" => pos_alert_flag($map["alert_closing"] ?? "1") ? "1" : "0",
    "alert_low_stock" => pos_alert_flag($map["alert_low_stock"] ?? "1") ? "1" : "0",
    "alert_renewal_before" => pos_alert_flag($map["alert_renewal_before"] ?? "1") ? "1" : "0",
    "alert_renewal_expired" => pos_alert_flag($map["alert_renewal_expired"] ?? "1") ? "1" : "0",
    "alert_closing_hour" => (string) $hour,
    "smtp_enabled" => pos_alert_flag($map["smtp_enabled"] ?? "1") ? "1" : "0",
    "smtp_host" => $map["smtp_host"] ?: $d["smtp_host"],
    "smtp_port" => (string) (((int) ($map["smtp_port"] ?? $d["smtp_port"])) ?: 465),
    "smtp_secure" => pos_alert_flag($map["smtp_secure"] ?? "1") ? "1" : "0",
    "smtp_user" => $map["smtp_user"] ?: $d["smtp_user"],
    "smtp_pass" => $map["smtp_pass"] ?: $d["smtp_pass"],
    "mail_from" => $map["mail_from"] ?: $d["mail_from"],
    "mail_from_name" => $map["mail_from_name"] ?: $d["mail_from_name"],
    "tpl_welcome" => $map["tpl_welcome"] ?? "",
    "tpl_credentials" => $map["tpl_credentials"] ?? "",
    "tpl_updates" => $map["tpl_updates"] ?? "",
    "tpl_closing" => $map["tpl_closing"] ?? "",
    "tpl_low_stock" => $map["tpl_low_stock"] ?? "",
    "tpl_renewal_before" => $map["tpl_renewal_before"] ?? "",
    "tpl_renewal_expired" => $map["tpl_renewal_expired"] ?? "",
  ];
}

function pos_alert_settings_public($cfg = null) {
  $raw = $cfg ?: pos_alert_settings();
  $cfg = $raw;
  $cfg["wa_api_key_set"] = ($raw["wa_api_key"] ?? "") !== "";
  $cfg["wa_api_key"] = pos_mask_secret($raw["wa_api_key"] ?? "");
  $cfg["smtp_pass_set"] = ($raw["smtp_pass"] ?? "") !== "";
  $cfg["smtp_pass"] = pos_mask_secret($raw["smtp_pass"] ?? "");
  $cfg["defaults"] = pos_alert_default_templates();
  $cfg["sample_vars"] = pos_alert_vars(pos_alert_sample_payload());
  $cfg["samples"] = [];
  foreach (pos_alert_kinds() as $kind) {
    $cfg["tpl_{$kind}"] = pos_effective_tpl($kind, $raw["tpl_{$kind}"] ?? "");
    $cfg["samples"][$kind] = pos_render_alert($kind, pos_alert_sample_payload(), $raw);
  }
  return $cfg;
}

function pos_save_alert_settings($body) {
  $cur = pos_alert_settings();
  $d = pos_alert_defaults();
  $keys = array_keys($d);
  foreach ($keys as $key) {
    if (!array_key_exists($key, $body)) continue;
    if (in_array($key, ["wa_api_key", "smtp_pass"], true) && pos_looks_masked_secret($body[$key])) continue;
    $value = (string) $body[$key];
    if (strpos($key, "tpl_") === 0) $value = substr($value, 0, 8000);
    $cur[$key] = trim($value);
  }
  if ($cur["wa_api_url"] !== "" && stripos($cur["wa_api_url"], "https://") !== 0) {
    throw new Exception("WhatsApp API URL must be https");
  }
  $cur["wa_enabled"] = pos_alert_flag($cur["wa_enabled"]) ? "1" : "0";
  foreach (["alert_welcome", "alert_credentials", "alert_updates", "alert_closing", "alert_low_stock", "alert_renewal_before", "alert_renewal_expired"] as $k) {
    $cur[$k] = pos_alert_flag($cur[$k]) ? "1" : "0";
  }
  $hour = (int) $cur["alert_closing_hour"];
  if ($hour < 0 || $hour > 23) $hour = 22;
  $cur["alert_closing_hour"] = (string) $hour;
  $cur["wa_country_code"] = substr(preg_replace("/\D+/", "", $cur["wa_country_code"]) ?: "91", 0, 3);
  $cur["smtp_enabled"] = pos_alert_flag($cur["smtp_enabled"] ?? "1") ? "1" : "0";
  $cur["smtp_port"] = (string) (((int) ($cur["smtp_port"] ?? 465)) ?: 465);
  $cur["smtp_secure"] = pos_alert_flag($cur["smtp_secure"] ?? ($cur["smtp_port"] === "465" ? "1" : "0")) ? "1" : "0";
  $cur["smtp_host"] = $cur["smtp_host"] ?: $d["smtp_host"];
  $cur["smtp_user"] = $cur["smtp_user"] ?: $d["smtp_user"];
  $cur["mail_from"] = $cur["mail_from"] ?: ($cur["smtp_user"] ?: $d["mail_from"]);
  $cur["mail_from_name"] = $cur["mail_from_name"] ?: $d["mail_from_name"];
  foreach ($keys as $key) pos_set_setting($key, $cur[$key]);
  return pos_alert_settings();
}

function pos_alert_welcome_text($shop, $who, $settings = null, $extra = []) {
  $settings = $settings ?: pos_alert_settings();
  return pos_render_alert("welcome", array_merge($extra, [
    "shopName" => $shop ?: "your shop",
    "ownerName" => $who ?: "there",
  ]), $settings);
}

function pos_alert_credentials_text($payload, $settings = null) {
  $settings = $settings ?: pos_alert_settings();
  $payload["shopName"] = $payload["shopName"] ?? "your shop";
  if (empty($payload["password"])) $payload["password"] = "the one you set. Keep it private.";
  return pos_render_alert("credentials", $payload, $settings);
}

function pos_alert_update_text($shop, $title, $body, $settings = null) {
  $settings = $settings ?: pos_alert_settings();
  return pos_render_alert("updates", [
    "shopName" => $shop,
    "title" => $title ?: "Update",
    "body" => $body,
  ], $settings);
}

function pos_alert_low_stock_text($shop, $items, $settings = null) {
  $settings = $settings ?: pos_alert_settings();
  return pos_render_alert("low_stock", [
    "shopName" => $shop ?: "Shop",
    "items" => $items ?: [["name" => "One or more items are at or below reorder level."]],
  ], $settings);
}

function pos_alert_closing_text($payload, $settings = null) {
  $settings = $settings ?: pos_alert_settings();
  $payload["shopName"] = $payload["shopName"] ?? "Shop";
  return pos_render_alert("closing", $payload, $settings);
}

function pos_shop_alert_contacts($bid) {
  $biz = $bid ? pos_q("SELECT id, name, mobile, email FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]) : [];
  $co = $bid ? pos_q("SELECT phone, email, name, timezone FROM company_settings WHERE business_id = ? LIMIT 1", "s", [$bid]) : [];
  $staff = [];
  try {
    $staff = $bid ? pos_q("SELECT mobile, email FROM staff_users WHERE business_id = ?", "s", [$bid]) : [];
  } catch (Throwable $e) {
    $staff = [];
  }
  $b = $biz[0] ?? [];
  $c = $co[0] ?? [];
  $phones = [];
  foreach ([$b["mobile"] ?? "", $c["phone"] ?? ""] as $n) {
    $d = pos_normalize_in_mobile($n);
    if ($d !== "") $phones[$d] = $d;
  }
  foreach ($staff as $row) {
    $d = pos_normalize_in_mobile($row["mobile"] ?? "");
    if ($d !== "") $phones[$d] = $d;
  }
  $emails = [];
  foreach ([$b["email"] ?? "", $c["email"] ?? ""] as $e) {
    $e = strtolower(trim((string) $e));
    if (strpos($e, "@") !== false) $emails[$e] = $e;
  }
  foreach ($staff as $row) {
    $e = strtolower(trim((string) ($row["email"] ?? "")));
    if (strpos($e, "@") !== false) $emails[$e] = $e;
  }
  try {
    $branches = $bid ? pos_q("SELECT phone FROM branches WHERE business_id = ?", "s", [$bid]) : [];
    foreach ($branches as $row) {
      $d = pos_normalize_in_mobile($row["phone"] ?? "");
      if ($d !== "") $phones[$d] = $d;
    }
  } catch (Throwable $e) { /* optional */ }
  return [
    "businessId" => $b["id"] ?? $bid,
    "shopName" => $b["name"] ?? ($c["name"] ?? ""),
    "timezone" => $c["timezone"] ?? "Asia/Kolkata",
    "phones" => array_values($phones),
    "emails" => array_values($emails),
  ];
}

function pos_notice_image($raw) {
  $img = trim((string) $raw);
  if ($img === "") return "";
  if (strpos($img, "data:image/") === 0) {
    if (strlen($img) > 6000000) throw new Exception("Notification image is too large");
    return $img;
  }
  if (stripos($img, "https://") === 0 && strlen($img) < 2048) return $img;
  throw new Exception("Notification image must be an uploaded image");
}

function pos_notice_html($title, $body, $image = "") {
  $img = "";
  if ($image !== "" && stripos($image, "https://") === 0) {
    $img = "<p><img src=\"" . pos_mail_escape($image) . "\" alt=\"\" style=\"max-width:100%;border-radius:8px\" /></p>";
  } elseif (strpos($image, "data:image/") === 0) {
    $img = "<p><img src=\"cid:notice-image\" alt=\"\" style=\"max-width:100%;border-radius:8px\" /></p>";
  }
  $html = "<p><strong>" . pos_mail_escape($title ?: "Update") . "</strong></p>";
  if ((string) $body !== "") $html .= "<p>" . nl2br(pos_mail_escape($body), false) . "</p>";
  return $html . $img . "<p>— ATAV Telecom POS</p>";
}

function pos_wa_send($cfg, $numbers, $message, $media = "") {
  $list = [];
  foreach ($numbers as $n) {
    $d = pos_normalize_in_mobile($n);
    if ($d !== "") $list[$d] = $d;
  }
  $list = array_values($list);
  if (!$list || $message === "") return ["ok" => false, "skipped" => true, "reason" => "no-number"];
  if (!pos_alert_flag($cfg["wa_enabled"] ?? "1") || ($cfg["wa_api_key"] ?? "") === "" || ($cfg["wa_profile_id"] ?? "") === "") {
    return ["ok" => false, "skipped" => true, "reason" => "wa-off"];
  }
  $results = [];
  foreach ($list as $number) {
    $results[] = pos_wa_send_one($cfg, $number, $message, $media);
  }
  $ok = false;
  $to = [];
  foreach ($results as $row) {
    if (!empty($row["ok"])) {
      $ok = true;
      if (!empty($row["number"])) $to[] = $row["number"];
    }
  }
  return ["ok" => $ok, "results" => $results, "to" => $to, "skipped" => !$ok, "reason" => $ok ? "" : ($results[0]["reason"] ?? $results[0]["error"] ?? "wa-failed")];
}

function pos_wa_post($endpoint, $payload, $apiKey) {
  pos_wa_pace();
  $ctx = stream_context_create([
    "http" => [
      "method" => "POST",
      "header" => "Content-Type: application/json\r\nAccept: application/json\r\nX-API-Key: " . $apiKey . "\r\n",
      "content" => json_encode($payload),
      "timeout" => 20,
      "ignore_errors" => true,
      "follow_location" => 1,
      "max_redirects" => 3,
    ],
    "ssl" => ["verify_peer" => true],
  ]);
  $body = @file_get_contents($endpoint, false, $ctx);
  $status = 0;
  $headers = $http_response_header ?? [];
  if (!empty($headers[0]) && preg_match("/\\s(\\d{3})\\s/", $headers[0], $m)) $status = (int) $m[1];
  return ["status" => $status, "body" => $body === false ? "" : $body, "headers" => $headers];
}

function pos_wa_send_one($cfg, $number, $message, $media = "") {
  $httpsMedia = (stripos((string) $media, "https://") === 0) ? $media : "";
  $dataMedia = (strpos((string) $media, "data:image/") === 0) ? $media : "";
  $base = $cfg["wa_api_url"] ?: "https://wamaster.atavtelecom.in/api/v1/send";
  $endpoint = explode("?", $base, 2)[0];
  $country = $cfg["wa_country_code"] ?: "91";
  $local = pos_normalize_in_mobile($number) ?: (string) $number;
  $intl = pos_wa_intl_number($number, $country);
  $payload = [
    "api_key" => $cfg["wa_api_key"],
    "profile_id" => $cfg["wa_profile_id"],
    "numbers" => $local,
    "message" => $message,
    "country_code" => $country,
    "type" => "text",
  ];
  if ($dataMedia !== "") {
    $payload["media"] = $dataMedia;
    $payload["type"] = "media";
  } elseif ($httpsMedia !== "") {
    $payload["media"] = $httpsMedia;
    $payload["media_url"] = $httpsMedia;
  }
  $last = ["status" => 0, "body" => "", "headers" => []];
  $parsed = ["ok" => false, "error" => "WhatsApp request failed"];
  for ($attempt = 0; $attempt < 4; $attempt++) {
    $last = pos_wa_post($endpoint, $payload, $cfg["wa_api_key"]);
    $parsed = pos_wa_response_ok($last["status"], $last["body"]);
    $shown = $parsed["to"] ?? ($intl !== "" ? $intl : $local);
    if (!empty($parsed["ok"])) {
      return ["ok" => true, "queued" => true, "status" => $last["status"], "body" => substr((string) $last["body"], 0, 240), "number" => $shown];
    }
    if (($last["status"] ?? 0) === 429 && $attempt < 3) {
      $wait = pos_wa_retry_wait_us($last["status"], $last["headers"], $attempt);
      if ($wait > 0) usleep($wait);
      continue;
    }
    break;
  }
  $shown = $parsed["to"] ?? ($intl !== "" ? $intl : $local);
  if ($dataMedia !== "") return pos_wa_send_one($cfg, $number, $message, "");
  if (($last["status"] ?? 0) === 429) {
    return ["ok" => false, "error" => $parsed["error"] ?? pos_wa_rate_limit_error(), "status" => 429, "number" => $shown];
  }
  $body = $last["body"];
  $status = $last["status"];
  $query = $payload;
  unset($query["type"]);
  $url = $endpoint . "?" . http_build_query($query);
  if (strlen($url) > 1800) return ["ok" => false, "error" => $parsed["error"] ?? "WhatsApp HTTP {$status}", "status" => $status, "number" => $shown];
  $ctx = stream_context_create([
    "http" => [
      "method" => "GET",
      "header" => "Accept: application/json\r\nX-API-Key: " . $cfg["wa_api_key"] . "\r\n",
      "timeout" => 8,
      "ignore_errors" => true,
      "follow_location" => 1,
      "max_redirects" => 3,
    ],
    "ssl" => ["verify_peer" => true],
  ]);
  $body = @file_get_contents($url, false, $ctx);
  $status = 0;
  if (!empty($http_response_header[0]) && preg_match("/\\s(\\d{3})\\s/", $http_response_header[0], $m)) $status = (int) $m[1];
  if ($body === false) return ["ok" => false, "error" => "WhatsApp request failed", "number" => $shown];
  $getParsed = pos_wa_response_ok($status, $body);
  if (empty($getParsed["ok"])) return ["ok" => false, "error" => $getParsed["error"] ?? "WhatsApp HTTP {$status}", "status" => $status, "number" => $shown];
  return ["ok" => true, "queued" => true, "status" => $status, "body" => substr((string) $body, 0, 240), "number" => $getParsed["to"] ?? $shown];
}

function pos_alert_delivered($out) {
  if (!empty($out["wa"]["ok"])) return true;
  foreach ($out["mail"] ?? [] as $row) {
    if (!empty($row["ok"])) return true;
  }
  return false;
}

function pos_alert_log_meta($kind, $shop = [], $extra = []) {
  return [
    "kind" => (string) ($kind ?: ""),
    "businessId" => (string) ($extra["businessId"] ?? ($shop["businessId"] ?? ($shop["id"] ?? ""))),
    "shopName" => (string) ($extra["shopName"] ?? ($shop["shopName"] ?? ($shop["name"] ?? ""))),
  ];
}

function pos_build_delivery_log_rows($meta, $subject, $text, $wa, $mail) {
  $preview = substr(trim(preg_replace("/\\s+/", " ", (string) $text)), 0, 160);
  $base = [
    "kind" => (string) ($meta["kind"] ?? ""),
    "businessId" => (string) ($meta["businessId"] ?? ""),
    "shopName" => (string) ($meta["shopName"] ?? ""),
    "subject" => substr((string) $subject, 0, 255),
    "preview" => $preview,
  ];
  $rows = [];
  $waResults = $wa["results"] ?? [];
  if ($waResults) {
    foreach ($waResults as $r) {
      $ok = !empty($r["ok"]);
      $rows[] = array_merge($base, [
        "channel" => "whatsapp",
        "recipient" => (string) ($r["number"] ?? ($r["to"] ?? "")),
        "status" => $ok ? "queued" : (!empty($r["skipped"]) ? "skipped" : "failed"),
        "ok" => $ok ? 1 : 0,
        "error" => substr((string) ($r["error"] ?? ($r["reason"] ?? "")), 0, 255),
        "detail" => substr((string) ($ok ? ("HTTP " . ($r["status"] ?? 200)) : ($r["body"] ?? ($r["error"] ?? ""))), 0, 255),
      ]);
    }
  } elseif (is_array($wa)) {
    $ok = !empty($wa["ok"]);
    $to = $wa["to"] ?? "";
    if (is_array($to)) $to = $to[0] ?? "";
    $rows[] = array_merge($base, [
      "channel" => "whatsapp",
      "recipient" => (string) $to,
      "status" => $ok ? "queued" : (!empty($wa["skipped"]) ? "skipped" : "failed"),
      "ok" => $ok ? 1 : 0,
      "error" => substr((string) ($wa["reason"] ?? ($wa["error"] ?? "")), 0, 255),
      "detail" => "",
    ]);
  }
  foreach ($mail ?? [] as $r) {
    if (!is_array($r)) continue;
    $ok = !empty($r["ok"]);
    $rows[] = array_merge($base, [
      "channel" => "email",
      "recipient" => (string) ($r["to"] ?? ""),
      "status" => $ok ? "sent" : (!empty($r["skipped"]) ? "skipped" : "failed"),
      "ok" => $ok ? 1 : 0,
      "error" => substr((string) ($r["error"] ?? ""), 0, 255),
      "detail" => substr((string) ($r["via"] ?? ($r["error"] ?? "")), 0, 255),
    ]);
  }
  return $rows;
}

function pos_log_alert_deliveries($meta, $subject, $text, $wa, $mail) {
  try {
    pos_ensure_alert_schema();
    foreach (pos_build_delivery_log_rows($meta, $subject, $text, $wa, $mail) as $row) {
      pos_q(
        "INSERT INTO alert_delivery_logs
         (id, channel, kind, business_id, shop_name, recipient, subject, preview, status, ok, error, detail)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        "ssssssssssss",
        [
          pos_uuid(),
          $row["channel"],
          $row["kind"],
          $row["businessId"],
          $row["shopName"],
          $row["recipient"],
          $row["subject"],
          $row["preview"],
          $row["status"],
          !empty($row["ok"]) ? "1" : "0",
          $row["error"] !== "" ? $row["error"] : "",
          $row["detail"] !== "" ? $row["detail"] : "",
        ]
      );
    }
  } catch (Throwable $e) {
    error_log("alert delivery log failed: " . $e->getMessage());
  }
}

function pos_list_alert_delivery_logs($limit = 200) {
  pos_ensure_alert_schema();
  $n = (int) $limit;
  if ($n < 1) $n = 200;
  if ($n > 500) $n = 500;
  return pos_q("SELECT * FROM alert_delivery_logs ORDER BY created_at DESC LIMIT {$n}");
}

function pos_alert_dispatch($phones, $emails, $subject, $text, $html = "", $image = "", $meta = []) {
  $cfg = pos_alert_settings();
  $wa = pos_wa_send($cfg, $phones, $text, $image);
  $mail = [];
  $html = $html !== "" ? $html : "<pre style=\"font-family:inherit\">" . pos_mail_escape($text) . "</pre>";
  foreach (array_unique($emails) as $to) {
    if (strpos($to, "@") === false) continue;
    $mail[] = array_merge(pos_send_mail($to, $subject, $text, $html, $image), ["to" => $to]);
  }
  pos_log_alert_deliveries(is_array($meta) ? $meta : [], $subject, $text, $wa, $mail);
  return ["wa" => $wa, "mail" => $mail];
}

function pos_alert_mark($bid, $kind, $day, $itemId = "") {
  pos_ensure_alert_schema();
  try {
    pos_q(
      "INSERT INTO alert_sends (id, business_id, kind, item_id, send_day) VALUES (?,?,?,?,?)",
      "sssss",
      [pos_uuid(), $bid, $kind, $itemId, $day]
    );
    return true;
  } catch (Throwable $e) {
    return false;
  }
}

function pos_alert_sent($bid, $kind, $day, $itemId = "") {
  pos_ensure_alert_schema();
  $rows = pos_q(
    "SELECT id FROM alert_sends WHERE business_id = ? AND kind = ? AND item_id = ? AND send_day = ? LIMIT 1",
    "ssss",
    [$bid, $kind, $itemId, $day]
  );
  return (bool) ($rows[0] ?? null);
}

function pos_send_shop_welcome_alerts($payload) {
  try {
    $cfg = pos_alert_settings();
    $shop = pos_shop_alert_contacts($payload["businessId"] ?? "");
    $phones = $shop["phones"];
    $extra = pos_normalize_in_mobile($payload["mobile"] ?? "");
    if ($extra !== "") $phones[] = $extra;
    $phones = array_values(array_unique($phones));
    $emails = $shop["emails"];
    if (!empty($payload["email"])) $emails[] = strtolower($payload["email"]);
    $emails = array_values(array_unique($emails));
    $name = $payload["shopName"] ?? $shop["shopName"];
    if (pos_alert_flag($cfg["alert_welcome"])) {
      $text = pos_alert_welcome_text($name, $payload["ownerName"] ?? $payload["name"] ?? "", $cfg, [
        "signInUrl" => $payload["signInUrl"] ?? pos_login_url(),
      ]);
      pos_alert_dispatch($phones, $emails, "Welcome to ATAV POS · {$name}", $text, "", "", pos_alert_log_meta("welcome", $shop, ["businessId" => $payload["businessId"] ?? "", "shopName" => $name]));
    }
    if (pos_alert_flag($cfg["alert_credentials"]) && (!empty($payload["username"]) || !empty($payload["email"]) || !empty($payload["password"]))) {
      pos_send_credential_alerts(array_merge($payload, ["shopName" => $name, "phones" => $phones, "emails" => $emails, "settings" => $cfg]));
    }
  } catch (Throwable $e) {
    error_log("shop welcome alerts failed: " . $e->getMessage());
  }
}

function pos_send_credential_alerts($payload) {
  try {
    $cfg = $payload["settings"] ?? pos_alert_settings();
    if (!pos_alert_flag($cfg["alert_credentials"])) return ["skipped" => true];
    if (empty($payload["username"]) && empty($payload["email"]) && empty($payload["password"])) return ["skipped" => true];
    $shop = pos_shop_alert_contacts($payload["businessId"] ?? "");
    $phones = $payload["phones"] ?? $shop["phones"];
    $extra = pos_normalize_in_mobile($payload["mobile"] ?? "");
    if ($extra !== "") $phones[] = $extra;
    $phones = array_values(array_unique($phones));
    $emails = $payload["emails"] ?? $shop["emails"];
    if (!empty($payload["email"])) $emails[] = strtolower($payload["email"]);
    $emails = array_values(array_unique($emails));
    $name = $payload["shopName"] ?? $shop["shopName"];
    $text = pos_alert_credentials_text(array_merge($payload, [
      "shopName" => $name,
      "signInUrl" => $payload["signInUrl"] ?? pos_login_url(),
    ]), $cfg);
    return pos_alert_dispatch($phones, $emails, "ATAV POS login · {$name}", $text, "", "", pos_alert_log_meta("credentials", $shop, ["businessId" => $payload["businessId"] ?? "", "shopName" => $name]));
  } catch (Throwable $e) {
    error_log("credential alerts failed: " . $e->getMessage());
    return ["ok" => false, "error" => $e->getMessage()];
  }
}

function pos_send_update_alerts($title, $body, $businessId = null, $image = "", $force = false) {
  try {
    $cfg = pos_alert_settings();
    if (!$force && !pos_alert_flag($cfg["alert_updates"])) return ["skipped" => true];
    $ids = $businessId ? [$businessId] : array_column(pos_q("SELECT id FROM businesses WHERE COALESCE(status,'active') = 'active'"), "id");
    $results = [];
    foreach ($ids as $id) {
      $shop = pos_shop_alert_contacts($id);
      $text = pos_alert_update_text($shop["shopName"], $title, $body, $cfg);
      $html = pos_notice_html($title, $body, $image);
      $results[] = pos_alert_dispatch($shop["phones"], $shop["emails"], "ATAV POS update · {$title}", $text, $html, $image, pos_alert_log_meta("updates", $shop));
    }
    return ["ok" => true, "results" => $results];
  } catch (Throwable $e) {
    error_log("update alerts failed: " . $e->getMessage());
    return ["ok" => false, "error" => $e->getMessage()];
  }
}

function pos_alert_low_stock($bid, $itemIds) {
  try {
    $cfg = pos_alert_settings();
    if (!pos_alert_flag($cfg["alert_low_stock"]) || !$bid || !$itemIds) return;
    $ids = array_values(array_unique(array_filter($itemIds)));
    if (!$ids) return;
    $ph = implode(",", array_fill(0, count($ids), "?"));
    $items = pos_q(
      "SELECT id, name, stock_gm, reorder_level_gm FROM items
       WHERE business_id = ? AND id IN ($ph) AND status = 'active'
         AND reorder_level_gm > 0 AND stock_gm <= reorder_level_gm",
      "s" . str_repeat("s", count($ids)),
      array_merge([$bid], $ids)
    );
    if (!$items) return;
    $day = date("Y-m-d");
    $fresh = [];
    foreach ($items as $item) {
      if (pos_alert_sent($bid, "low_stock", $day, $item["id"])) continue;
      if (pos_alert_mark($bid, "low_stock", $day, $item["id"])) $fresh[] = $item;
    }
    if (!$fresh) return;
    $shop = pos_shop_alert_contacts($bid);
    pos_alert_dispatch($shop["phones"], $shop["emails"], "Low stock · " . $shop["shopName"], pos_alert_low_stock_text($shop["shopName"], $fresh, $cfg), "", "", pos_alert_log_meta("low_stock", $shop));
  } catch (Throwable $e) {
    error_log("low stock alert failed: " . $e->getMessage());
  }
}

function pos_add_ymd($ymd, $days) {
  $day = pos_expiry_ymd($ymd);
  if ($day === "") return "";
  $ts = strtotime($day . " UTC") + ((int) $days * 86400);
  return gmdate("Y-m-d", $ts);
}

function pos_closing_alert_day($hour, $closeHour, $todayYmd) {
  $today = pos_expiry_ymd($todayYmd);
  if ($today === "") return "";
  if ((int) $hour < (int) $closeHour) return pos_add_ymd($today, -1);
  return $today;
}

function pos_send_closing_alert($bid, $force = false) {
  $cfg = pos_alert_settings();
  if (!$force && !pos_alert_flag($cfg["alert_closing"])) return ["skipped" => true];
  $shop = pos_shop_alert_contacts($bid);
  if (!$shop["businessId"]) return ["skipped" => true];
  if (!$shop["phones"] && !$shop["emails"]) return ["skipped" => true, "reason" => "no-number"];
  $hour = (int) date("G");
  $close = (int) $cfg["alert_closing_hour"];
  $today = date("Y-m-d");
  $day = $force ? $today : pos_closing_alert_day($hour, $close, $today);
  if ($day === "") return ["skipped" => true];
  if (!$force && pos_alert_sent($shop["businessId"], "closing", $day, "")) return ["skipped" => true, "reason" => "already-sent"];
  $sum = pos_q(
    "SELECT COUNT(*) AS bills,
            COALESCE(SUM(total),0) AS takings,
            COALESCE(SUM(gst),0) AS gst,
            COALESCE(SUM(CASE WHEN LOWER(payment_method)='cash' THEN total ELSE 0 END),0) AS cash,
            COALESCE(SUM(CASE WHEN LOWER(payment_method)='upi' THEN total ELSE 0 END),0) AS upi,
            COALESCE(SUM(CASE WHEN LOWER(payment_method)='card' THEN total ELSE 0 END),0) AS card,
            COALESCE(SUM(CASE WHEN LOWER(payment_method)='credit' THEN total ELSE 0 END),0) AS credit
     FROM sales_orders
     WHERE business_id = ? AND DATE(created_at) = ? AND COALESCE(status,'') <> 'cancelled'",
    "ss",
    [$shop["businessId"], $day]
  );
  $low = [];
  if (pos_alert_flag($cfg["alert_low_stock"])) {
    $low = pos_q(
      "SELECT name FROM items WHERE business_id = ? AND status = 'active' AND reorder_level_gm > 0 AND stock_gm <= reorder_level_gm ORDER BY name LIMIT 12",
      "s",
      [$shop["businessId"]]
    );
  }
  $row = $sum[0] ?? [];
  $text = pos_alert_closing_text([
    "shopName" => $shop["shopName"],
    "day" => $day,
    "bills" => $row["bills"] ?? 0,
    "takings" => $row["takings"] ?? 0,
    "gst" => $row["gst"] ?? 0,
    "cash" => $row["cash"] ?? 0,
    "upi" => $row["upi"] ?? 0,
    "card" => $row["card"] ?? 0,
    "credit" => $row["credit"] ?? 0,
    "lowStock" => $low,
  ], $cfg);
  $out = pos_alert_dispatch($shop["phones"], $shop["emails"], "Closing sales · {$shop["shopName"]} · {$day}", $text, "", "", pos_alert_log_meta("closing", $shop));
  if (!$force && pos_alert_delivered($out)) pos_alert_mark($shop["businessId"], "closing", $day, "");
  return $out;
}

function pos_expiry_ymd($value) {
  $s = trim((string) $value);
  if (preg_match("/^(\d{4}-\d{2}-\d{2})/", $s, $m)) return $m[1];
  $ts = strtotime($s);
  return $ts ? gmdate("Y-m-d", $ts) : "";
}

function pos_days_until_expiry($expiry, $today) {
  $exp = pos_expiry_ymd($expiry);
  $day = pos_expiry_ymd($today);
  if ($exp === "" || $day === "") return null;
  return (int) round((strtotime($exp . " UTC") - strtotime($day . " UTC")) / 86400);
}

function pos_send_renewal_alerts($bid = null, $force = false, $opts = []) {
  $expiredOnly = !empty($opts["expiredOnly"]);
  $dueOnly = !empty($opts["dueOnly"]);
  if ($expiredOnly && $dueOnly) $dueOnly = false;
  $cfg = pos_alert_settings();
  $beforeOn = pos_alert_flag($cfg["alert_renewal_before"] ?? "1");
  $expiredOn = pos_alert_flag($cfg["alert_renewal_expired"] ?? "1");
  if (!$force && !$beforeOn && !$expiredOn) return ["skipped" => true, "reason" => "alerts-off"];
  $support = function_exists("pos_platform_settings") ? pos_platform_settings() : [];
  $signIn = function_exists("pos_login_url") ? pos_login_url() : "/login.html";
  $sql = "SELECT b.id, b.name, b.owner_name, b.subscription_expires_at, p.name AS plan_name
          FROM businesses b
          LEFT JOIN subscription_plans p ON p.id = b.plan_id
          WHERE b.subscription_expires_at IS NOT NULL";
  $types = "";
  $args = [];
  if ($bid) {
    $sql .= " AND b.id = ?";
    $types = "s";
    $args[] = $bid;
  }
  $shops = $types ? pos_q($sql, $types, $args) : pos_q($sql);
  $results = [];
  foreach ($shops as $row) {
    $expiry = pos_expiry_ymd($row["subscription_expires_at"] ?? "");
    if ($expiry === "") continue;
    try {
      if (function_exists("pos_apply_business_timezone")) pos_apply_business_timezone($row["id"]);
    } catch (Throwable $e) { /* keep IST */ }
    $today = date("Y-m-d");
    $days = pos_days_until_expiry($expiry, $today);
    if ($days === null) continue;
    $shop = pos_shop_alert_contacts($row["id"]);
    if (!$shop["phones"] && !$shop["emails"]) {
      $results[] = ["businessId" => $row["id"], "shopName" => $row["name"], "skipped" => true, "reason" => "no-number"];
      continue;
    }
    $payload = [
      "shopName" => $row["name"] ?? $shop["shopName"],
      "ownerName" => $row["owner_name"] ?? "",
      "plan" => ($row["plan_name"] ?? "") !== "" ? $row["plan_name"] : "subscription",
      "expiry" => $expiry,
      "days" => $days,
      "signInUrl" => $signIn,
      "supportPhone" => $support["support_phone"] ?? "",
    ];
    $expired = $days <= 0;
    $dueSoon = $days >= 0 && $days <= 7;
    if ($expiredOnly && !$expired) {
      $results[] = [
        "businessId" => $row["id"],
        "shopName" => $payload["shopName"],
        "skipped" => true,
        "reason" => "not-expired",
        "days" => $days,
      ];
      continue;
    }
    if ($dueOnly && !$dueSoon) {
      $results[] = [
        "businessId" => $row["id"],
        "shopName" => $payload["shopName"],
        "skipped" => true,
        "reason" => $expired ? "already-expired" : "not-due-yet",
        "days" => $days,
      ];
      continue;
    }
    $kind = $expired ? "renewal_expired" : "renewal_before";
    $kindOn = $expired ? $expiredOn : $beforeOn;
    if (!$force && !$kindOn) continue;
    if (!$force && !$expired && !$dueSoon) continue;
    if (!$force && pos_alert_sent($row["id"], $kind, $expiry, "")) continue;
    $text = pos_render_alert($kind, $payload, $cfg);
    $subject = $expired ? "ATAV POS expired · {$payload["shopName"]}" : "Renew ATAV POS · {$payload["shopName"]}";
    $out = pos_alert_dispatch($shop["phones"], $shop["emails"], $subject, $text, "", "", pos_alert_log_meta($kind, $shop, ["shopName" => $payload["shopName"]]));
    if (!$force && pos_alert_delivered($out)) pos_alert_mark($row["id"], $kind, $expiry, "");
    $results[] = array_merge(["businessId" => $row["id"], "shopName" => $payload["shopName"], "kind" => $kind, "days" => $days], $out);
  }
  if ($bid && !$results) throw new Exception("This shop has no subscription expiry date, or is not due for a renewal/expired alert yet");
  return ["ok" => true, "results" => $results, "summary" => pos_summarize_alert_results($results)];
}

function pos_summarize_alert_results($results = []) {
  $wa = 0;
  $mail = 0;
  $sent = 0;
  $skipped = 0;
  foreach ($results as $row) {
    if (!empty($row["skipped"])) {
      $skipped++;
      continue;
    }
    if (!empty($row["wa"]["ok"])) $wa++;
    $mailOk = false;
    foreach ($row["mail"] ?? [] as $m) {
      if (!empty($m["ok"])) $mailOk = true;
    }
    if ($mailOk) $mail++;
    if (!empty($row["wa"]["ok"]) || $mailOk) $sent++;
  }
  return ["sent" => $sent, "skipped" => $skipped, "wa" => $wa, "mail" => $mail, "total" => count($results)];
}

function pos_send_low_stock_now($bid) {
  $cfg = pos_alert_settings();
  $items = pos_q(
    "SELECT id, name, stock_gm, reorder_level_gm FROM items
     WHERE business_id = ? AND status = 'active' AND reorder_level_gm > 0 AND stock_gm <= reorder_level_gm",
    "s",
    [$bid]
  );
  if (!$items) return ["skipped" => true, "reason" => "no-low-stock"];
  $shop = pos_shop_alert_contacts($bid);
  return pos_alert_dispatch($shop["phones"], $shop["emails"], "Low stock · " . $shop["shopName"], pos_alert_low_stock_text($shop["shopName"], $items, $cfg), "", "", pos_alert_log_meta("low_stock", $shop));
}

function pos_send_manual_alerts($kinds = [], $bid = null, $title = "", $body = "") {
  if (function_exists("set_time_limit")) @set_time_limit(180);
  $all = pos_alert_kinds();
  $wanted = [];
  foreach ((array) $kinds as $k) {
    if (in_array($k, $all, true)) $wanted[] = $k;
  }
  if (!$wanted) $wanted = $all;
  $ids = $bid ? [$bid] : array_column(pos_q("SELECT id FROM businesses ORDER BY name"), "id");
  if (!$ids) throw new Exception("No shops to send to");
  $cfg = pos_alert_settings();
  $support = function_exists("pos_platform_settings") ? pos_platform_settings() : [];
  $signIn = function_exists("pos_login_url") ? pos_login_url() : "/login.html";
  $bothRenewal = in_array("renewal_before", $wanted, true) && in_array("renewal_expired", $wanted, true);
  $results = [];
  foreach ($ids as $id) {
    $biz = pos_q(
      "SELECT b.id, b.name, b.owner_name, b.mobile, b.email, b.subscription_expires_at, p.name AS plan_name
       FROM businesses b LEFT JOIN subscription_plans p ON p.id = b.plan_id WHERE b.id = ? LIMIT 1",
      "s",
      [$id]
    );
    $row = $biz[0] ?? null;
    if (!$row) {
      $results[] = ["businessId" => $id, "shopName" => $id, "skipped" => true, "reason" => "not-found"];
      continue;
    }
    $shop = pos_shop_alert_contacts($id);
    if (!$shop["phones"] && !$shop["emails"]) {
      $results[] = ["businessId" => $id, "shopName" => $row["name"], "skipped" => true, "reason" => "no-number"];
      continue;
    }
    $admin = [];
    try {
      $admins = pos_q("SELECT username, email, mobile, first_name, role FROM staff_users WHERE business_id = ? AND role = 'business_admin' LIMIT 1", "s", [$id]);
      $admin = $admins[0] ?? [];
    } catch (Throwable $e) {
      $admin = [];
    }
    try {
      if (function_exists("pos_apply_business_timezone")) pos_apply_business_timezone($id);
    } catch (Throwable $e) { /* IST */ }
    $expiry = pos_expiry_ymd($row["subscription_expires_at"] ?? "");
    $today = date("Y-m-d");
    $days = $expiry !== "" ? pos_days_until_expiry($expiry, $today) : null;
    $expired = $days !== null && $days <= 0;
    foreach ($wanted as $kind) {
      if ($bothRenewal && $kind === "renewal_before" && $expired) continue;
      if ($bothRenewal && $kind === "renewal_expired" && !$expired) continue;
      $out = pos_send_one_manual_alert($kind, $row, $shop, $admin, $cfg, $support, $signIn, $expiry, $days, $title, $body);
      $results[] = array_merge(["businessId" => $id, "shopName" => $row["name"], "kind" => $kind, "days" => $days], $out);
    }
  }
  return ["ok" => true, "results" => $results, "summary" => pos_summarize_alert_results($results)];
}

function pos_send_one_manual_alert($kind, $biz, $shop, $admin, $cfg, $support, $signIn, $expiry, $days, $title, $body) {
  $name = $biz["name"] ?? $shop["shopName"];
  $owner = $biz["owner_name"] ?? ($admin["first_name"] ?? "");
  $email = $admin["email"] ?? ($biz["email"] ?? ($shop["emails"][0] ?? ""));
  $username = $admin["username"] ?? $email;
  if ($kind === "welcome") {
    $text = pos_alert_welcome_text($name, $owner, $cfg, ["signInUrl" => $signIn]);
    return pos_alert_dispatch($shop["phones"], $shop["emails"], "Welcome to ATAV POS · {$name}", $text, "", "", pos_alert_log_meta("welcome", $shop, ["shopName" => $name]));
  }
  if ($kind === "credentials") {
    $text = pos_alert_credentials_text([
      "shopName" => $name,
      "ownerName" => $owner,
      "username" => $username,
      "email" => $email,
      "password" => "the password already set for this login",
      "role" => $admin["role"] ?? "business_admin",
      "signInUrl" => $signIn,
    ], $cfg);
    return pos_alert_dispatch($shop["phones"], $shop["emails"], "ATAV POS login · {$name}", $text, "", "", pos_alert_log_meta("credentials", $shop, ["shopName" => $name]));
  }
  if ($kind === "updates") {
    $heading = trim((string) $title) !== "" ? trim((string) $title) : "ATAV POS update";
    $text = pos_alert_update_text($name, $heading, $body, $cfg);
    return pos_alert_dispatch($shop["phones"], $shop["emails"], "ATAV POS update · {$heading}", $text, pos_notice_html($heading, $body, ""), "", pos_alert_log_meta("updates", $shop, ["shopName" => $name]));
  }
  if ($kind === "closing") return pos_send_closing_alert($biz["id"], true);
  if ($kind === "low_stock") return pos_send_low_stock_now($biz["id"]);
  if ($kind === "renewal_before" || $kind === "renewal_expired") {
    if ($expiry === "") return ["skipped" => true, "reason" => "no-expiry"];
    $payload = [
      "shopName" => $name,
      "ownerName" => $owner,
      "plan" => ($biz["plan_name"] ?? "") !== "" ? $biz["plan_name"] : "subscription",
      "expiry" => $expiry,
      "days" => $days,
      "signInUrl" => $signIn,
      "supportPhone" => $support["support_phone"] ?? "",
    ];
    $text = pos_render_alert($kind, $payload, $cfg);
    $subject = $kind === "renewal_expired" ? "ATAV POS expired · {$name}" : "Renew ATAV POS · {$name}";
    return pos_alert_dispatch($shop["phones"], $shop["emails"], $subject, $text, "", "", pos_alert_log_meta($kind, $shop, ["shopName" => $name]));
  }
  return ["skipped" => true, "reason" => "unknown-kind"];
}

function pos_tick_shop_alerts($bid = null) {
  try {
    if ($bid) {
      pos_apply_business_timezone($bid);
      pos_send_renewal_alerts($bid);
      return pos_send_closing_alert($bid);
    }
    pos_send_renewal_alerts();
    foreach (pos_q("SELECT id FROM businesses WHERE COALESCE(status,'active') = 'active'") as $s) {
      try {
        pos_apply_business_timezone($s["id"]);
        pos_send_closing_alert($s["id"]);
      } catch (Throwable $e) { /* keep ticking other shops */ }
    }
  } catch (Throwable $e) {
    error_log("alert tick failed: " . $e->getMessage());
  }
  return ["ok" => true];
}

function pos_send_test_alert($number = "", $businessId = null) {
  $shop = $businessId ? pos_shop_alert_contacts($businessId) : ["phones" => [], "emails" => []];
  $phone = pos_normalize_in_mobile($number) ?: ($shop["phones"][0] ?? "");
  if ($phone === "") throw new Exception("Enter a 10-digit mobile number");
  $text = "ATAV POS WhatsApp test from Master Admin. Alerts are working.\n\n— ATAV Telecom POS";
  $support = pos_platform_settings();
  $emails = $shop["emails"];
  if (!empty($support["support_email"]) && strpos($support["support_email"], "@") !== false) $emails[] = $support["support_email"];
  return pos_alert_dispatch([$phone], $emails, "ATAV POS WhatsApp test", $text, "", "", pos_alert_log_meta("test", $shop, ["businessId" => (string) $businessId, "shopName" => $shop["shopName"] ?? "Master Admin"]));
}
