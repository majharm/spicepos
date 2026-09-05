<?php

function pos_alert_defaults() {
  return [
    "wa_enabled" => "1",
    "wa_api_url" => "https://wamaster.atavtelecom.in/api/v1/send",
    "wa_api_key" => "b99fcac4528c679916dcd461f5d834a098c9f9fa2fd349c67395fb028579cc1b",
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
  foreach (pos_alert_defaults() as $key => $value) {
    $row = pos_q("SELECT setting_value FROM platform_settings WHERE setting_key = ? LIMIT 1", "s", [$key]);
    if (!$row) pos_set_setting($key, $value);
    elseif (($row[0]["setting_value"] ?? "") === "" && in_array($key, ["wa_api_key", "wa_profile_id", "wa_api_url"], true)) {
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
  $keys = array_keys(pos_alert_defaults());
  foreach ($keys as $key) {
    if (!array_key_exists($key, $body)) continue;
    if ($key === "wa_api_key" && pos_looks_masked_secret($body[$key])) continue;
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
  foreach ($results as $row) {
    if (!empty($row["ok"])) $ok = true;
  }
  return ["ok" => $ok, "results" => $results, "skipped" => !$ok, "reason" => $ok ? "" : ($results[0]["reason"] ?? $results[0]["error"] ?? "wa-failed")];
}

function pos_wa_send_one($cfg, $number, $message, $media = "") {
  $httpsMedia = (stripos((string) $media, "https://") === 0) ? $media : "";
  $dataMedia = (strpos((string) $media, "data:image/") === 0) ? $media : "";
  $base = $cfg["wa_api_url"] ?: "https://wamaster.atavtelecom.in/api/v1/send";
  $endpoint = explode("?", $base, 2)[0];
  $country = $cfg["wa_country_code"] ?: "91";
  $payload = [
    "api_key" => $cfg["wa_api_key"],
    "profile_id" => $cfg["wa_profile_id"],
    "numbers" => $number,
    "message" => $message,
    "country_code" => $country,
  ];
  if ($dataMedia !== "") {
    $payload["media"] = $dataMedia;
    $payload["type"] = "media";
  } elseif ($httpsMedia !== "") {
    $payload["media"] = $httpsMedia;
    $payload["media_url"] = $httpsMedia;
  }
  $ctx = stream_context_create([
    "http" => [
      "method" => "POST",
      "header" => "Content-Type: application/json\r\nAccept: application/json\r\n",
      "content" => json_encode($payload),
      "timeout" => 20,
      "ignore_errors" => true,
    ],
    "ssl" => ["verify_peer" => true],
  ]);
  $body = @file_get_contents($endpoint, false, $ctx);
  $status = 0;
  if (!empty($http_response_header[0]) && preg_match("/\\s(\\d{3})\\s/", $http_response_header[0], $m)) $status = (int) $m[1];
  if ($body !== false && $status && $status < 400) {
    return ["ok" => true, "status" => $status, "body" => substr((string) $body, 0, 240), "number" => $number];
  }
  if ($dataMedia !== "") return pos_wa_send_one($cfg, $number, $message, "");
  $query = $payload;
  unset($query["type"]);
  $url = $endpoint . "?" . http_build_query($query);
  if (strlen($url) > 1800) return ["ok" => false, "error" => "WhatsApp HTTP {$status}", "status" => $status, "number" => $number];
  $ctx = stream_context_create([
    "http" => ["method" => "GET", "timeout" => 8, "ignore_errors" => true],
    "ssl" => ["verify_peer" => true],
  ]);
  $body = @file_get_contents($url, false, $ctx);
  $status = 0;
  if (!empty($http_response_header[0]) && preg_match("/\\s(\\d{3})\\s/", $http_response_header[0], $m)) $status = (int) $m[1];
  if ($body === false) return ["ok" => false, "error" => "WhatsApp request failed", "number" => $number];
  if ($status && $status >= 400) return ["ok" => false, "error" => "WhatsApp HTTP {$status}", "status" => $status, "number" => $number];
  return ["ok" => true, "status" => $status, "body" => substr((string) $body, 0, 240), "number" => $number];
}

function pos_alert_delivered($out) {
  if (!empty($out["wa"]["ok"])) return true;
  foreach ($out["mail"] ?? [] as $row) {
    if (!empty($row["ok"])) return true;
  }
  return false;
}

function pos_alert_dispatch($phones, $emails, $subject, $text, $html = "", $image = "") {
  $cfg = pos_alert_settings();
  $wa = pos_wa_send($cfg, $phones, $text, $image);
  $mail = [];
  $html = $html !== "" ? $html : "<pre style=\"font-family:inherit\">" . pos_mail_escape($text) . "</pre>";
  foreach (array_unique($emails) as $to) {
    if (strpos($to, "@") === false) continue;
    $mail[] = pos_send_mail($to, $subject, $text, $html, $image);
  }
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
      pos_alert_dispatch($phones, $emails, "Welcome to ATAV POS · {$name}", $text);
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
    return pos_alert_dispatch($phones, $emails, "ATAV POS login · {$name}", $text);
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
      $results[] = pos_alert_dispatch($shop["phones"], $shop["emails"], "ATAV POS update · {$title}", $text, $html, $image);
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
    pos_alert_dispatch($shop["phones"], $shop["emails"], "Low stock · " . $shop["shopName"], pos_alert_low_stock_text($shop["shopName"], $fresh, $cfg));
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

function pos_send_closing_alert($bid) {
  $cfg = pos_alert_settings();
  if (!pos_alert_flag($cfg["alert_closing"])) return ["skipped" => true];
  $shop = pos_shop_alert_contacts($bid);
  if (!$shop["businessId"]) return ["skipped" => true];
  if (!$shop["phones"] && !$shop["emails"]) return ["skipped" => true, "reason" => "no-number"];
  $hour = (int) date("G");
  $close = (int) $cfg["alert_closing_hour"];
  $today = date("Y-m-d");
  $day = pos_closing_alert_day($hour, $close, $today);
  if ($day === "") return ["skipped" => true];
  if (pos_alert_sent($shop["businessId"], "closing", $day, "")) return ["skipped" => true, "reason" => "already-sent"];
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
  $out = pos_alert_dispatch($shop["phones"], $shop["emails"], "Closing sales · {$shop["shopName"]} · {$day}", $text);
  if (pos_alert_delivered($out)) pos_alert_mark($shop["businessId"], "closing", $day, "");
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
    $out = pos_alert_dispatch($shop["phones"], $shop["emails"], $subject, $text);
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
  return pos_alert_dispatch([$phone], $emails, "ATAV POS WhatsApp test", $text);
}
