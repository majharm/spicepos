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
    "alert_closing_hour" => "22",
  ];
}

function pos_alert_flag($value, $fallback = true) {
  if ($value === null || $value === "") return $fallback;
  return !in_array(strtolower(trim((string) $value)), ["0", "false", "no", "off"], true);
}

function pos_normalize_in_mobile($raw) {
  $d = preg_replace("/\D+/", "", (string) $raw);
  if (strpos($d, "91") === 0 && strlen($d) >= 12) $d = substr($d, -10);
  if (strpos($d, "0") === 0 && strlen($d) === 11) $d = substr($d, 1);
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
    "alert_closing_hour" => (string) $hour,
  ];
}

function pos_alert_settings_public($cfg = null) {
  $cfg = $cfg ?: pos_alert_settings();
  $cfg["wa_api_key_set"] = ($cfg["wa_api_key"] ?? "") !== "";
  $cfg["wa_api_key"] = pos_mask_secret($cfg["wa_api_key"] ?? "");
  return $cfg;
}

function pos_save_alert_settings($body) {
  $cur = pos_alert_settings();
  $keys = array_keys(pos_alert_defaults());
  foreach ($keys as $key) {
    if (!array_key_exists($key, $body)) continue;
    if ($key === "wa_api_key" && pos_looks_masked_secret($body[$key])) continue;
    $cur[$key] = trim((string) $body[$key]);
  }
  if ($cur["wa_api_url"] !== "" && stripos($cur["wa_api_url"], "https://") !== 0) {
    throw new Exception("WhatsApp API URL must be https");
  }
  $cur["wa_enabled"] = pos_alert_flag($cur["wa_enabled"]) ? "1" : "0";
  foreach (["alert_welcome", "alert_credentials", "alert_updates", "alert_closing", "alert_low_stock"] as $k) {
    $cur[$k] = pos_alert_flag($cur[$k]) ? "1" : "0";
  }
  $hour = (int) $cur["alert_closing_hour"];
  if ($hour < 0 || $hour > 23) $hour = 22;
  $cur["alert_closing_hour"] = (string) $hour;
  $cur["wa_country_code"] = substr(preg_replace("/\D+/", "", $cur["wa_country_code"]) ?: "91", 0, 3);
  foreach ($keys as $key) pos_set_setting($key, $cur[$key]);
  return pos_alert_settings();
}

function pos_alert_welcome_text($shop, $who) {
  $shop = $shop ?: "your shop";
  $who = $who ?: "there";
  return "Welcome to ATAV POS.\n\nHello {$who}, shop \"{$shop}\" is ready.\n\nSign in at the POS login page. Keep your login private.\n\n— ATAV Telecom POS";
}

function pos_alert_credentials_text($payload) {
  $shop = $payload["shopName"] ?? "your shop";
  $role = str_replace("_", " ", (string) ($payload["role"] ?? ""));
  $lines = ["ATAV POS login for \"{$shop}\""];
  if ($role !== "") $lines[] = "Role: {$role}";
  if (!empty($payload["username"])) $lines[] = "User ID: " . $payload["username"];
  if (!empty($payload["email"])) $lines[] = "Email: " . $payload["email"];
  $lines[] = !empty($payload["password"]) ? ("Password: " . $payload["password"]) : "Password: the one you set. Keep it private.";
  if (!empty($payload["signInUrl"])) $lines[] = "Sign in: " . $payload["signInUrl"];
  $lines[] = "";
  $lines[] = "Do not share this message.";
  $lines[] = "— ATAV Telecom POS";
  return implode("\n", $lines);
}

function pos_alert_update_text($shop, $title, $body) {
  $head = "ATAV POS update" . ($shop ? " · {$shop}" : "");
  return trim($head . "\n\n" . ($title ?: "Update") . ($body ? "\n\n{$body}" : "") . "\n\n— ATAV Telecom POS");
}

function pos_alert_low_stock_text($shop, $items) {
  $rows = [];
  foreach ($items as $i) $rows[] = "• " . ($i["name"] ?? "Item");
  return ($shop ?: "Shop") . " — low stock alert\n\n" . implode("\n", $rows) . "\n\n— ATAV Telecom POS";
}

function pos_alert_closing_text($payload) {
  $low = "";
  if (!empty($payload["lowStock"])) {
    $names = [];
    foreach (array_slice($payload["lowStock"], 0, 8) as $i) $names[] = $i["name"] ?? "";
    $low = "\nLow stock: " . implode(", ", array_filter($names));
  }
  return ($payload["shopName"] ?? "Shop") . " — closing " . ($payload["day"] ?? "")
    . "\nBills: " . (int) ($payload["bills"] ?? 0)
    . "\nTotal: " . pos_alert_inr($payload["takings"] ?? 0)
    . "\nCash " . pos_alert_inr($payload["cash"] ?? 0)
    . " · UPI " . pos_alert_inr($payload["upi"] ?? 0)
    . " · Card " . pos_alert_inr($payload["card"] ?? 0)
    . " · Credit " . pos_alert_inr($payload["credit"] ?? 0)
    . "\nGST: " . pos_alert_inr($payload["gst"] ?? 0)
    . $low
    . "\n\n— ATAV Telecom POS";
}

function pos_shop_alert_contacts($bid) {
  $biz = $bid ? pos_q("SELECT id, name, mobile, email FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]) : [];
  $co = $bid ? pos_q("SELECT phone, email, name, timezone FROM company_settings WHERE business_id = ? LIMIT 1", "s", [$bid]) : [];
  $b = $biz[0] ?? [];
  $c = $co[0] ?? [];
  $phones = [];
  foreach ([pos_normalize_in_mobile($b["mobile"] ?? ""), pos_normalize_in_mobile($c["phone"] ?? "")] as $n) {
    if ($n !== "") $phones[$n] = $n;
  }
  $emails = [];
  foreach ([$b["email"] ?? "", $c["email"] ?? ""] as $e) {
    $e = strtolower(trim((string) $e));
    if (strpos($e, "@") !== false) $emails[$e] = $e;
  }
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
  $httpsMedia = (stripos((string) $media, "https://") === 0) ? $media : "";
  $dataMedia = (strpos((string) $media, "data:image/") === 0) ? $media : "";
  $base = $cfg["wa_api_url"] ?: "https://wamaster.atavtelecom.in/api/v1/send";
  $endpoint = explode("?", $base, 2)[0];
  if ($dataMedia !== "") {
    $payload = json_encode([
      "api_key" => $cfg["wa_api_key"],
      "profile_id" => $cfg["wa_profile_id"],
      "numbers" => implode(",", $list),
      "message" => $message,
      "country_code" => $cfg["wa_country_code"] ?: "91",
      "media" => $dataMedia,
      "type" => "media",
    ]);
    $ctx = stream_context_create([
      "http" => [
        "method" => "POST",
        "header" => "Content-Type: application/json\r\nAccept: application/json\r\n",
        "content" => $payload,
        "timeout" => 20,
        "ignore_errors" => true,
      ],
      "ssl" => ["verify_peer" => true],
    ]);
    $body = @file_get_contents($endpoint, false, $ctx);
    $status = 0;
    if (!empty($http_response_header[0]) && preg_match("/\\s(\\d{3})\\s/", $http_response_header[0], $m)) $status = (int) $m[1];
    if ($body !== false && $status && $status < 400) {
      return ["ok" => true, "status" => $status, "body" => substr((string) $body, 0, 240)];
    }
    $media = "";
    $httpsMedia = "";
  }
  $query = [
    "api_key" => $cfg["wa_api_key"],
    "profile_id" => $cfg["wa_profile_id"],
    "numbers" => implode(",", $list),
    "message" => $message,
    "country_code" => $cfg["wa_country_code"] ?: "91",
  ];
  if ($httpsMedia !== "") {
    $query["media"] = $httpsMedia;
    $query["media_url"] = $httpsMedia;
  }
  $url = $endpoint . "?" . http_build_query($query);
  $ctx = stream_context_create([
    "http" => ["method" => "GET", "timeout" => 8, "ignore_errors" => true],
    "ssl" => ["verify_peer" => true],
  ]);
  $body = @file_get_contents($url, false, $ctx);
  $status = 0;
  if (!empty($http_response_header[0]) && preg_match("/\\s(\\d{3})\\s/", $http_response_header[0], $m)) $status = (int) $m[1];
  if ($body === false) return ["ok" => false, "error" => "WhatsApp request failed"];
  if ($status && $status >= 400) return ["ok" => false, "error" => "WhatsApp HTTP {$status}", "status" => $status];
  return ["ok" => true, "status" => $status, "body" => substr((string) $body, 0, 240)];
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
      pos_wa_send($cfg, $phones, pos_alert_welcome_text($name, $payload["ownerName"] ?? $payload["name"] ?? ""));
    }
    if (pos_alert_flag($cfg["alert_credentials"]) && (!empty($payload["username"]) || !empty($payload["email"]) || !empty($payload["password"]))) {
      $text = pos_alert_credentials_text(array_merge($payload, ["shopName" => $name, "signInUrl" => $payload["signInUrl"] ?? pos_login_url()]));
      pos_alert_dispatch($phones, $emails, "ATAV POS login · {$name}", $text);
    }
  } catch (Throwable $e) {
    error_log("shop welcome alerts failed: " . $e->getMessage());
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
      $text = pos_alert_update_text($shop["shopName"], $title, $body);
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
    pos_alert_dispatch($shop["phones"], $shop["emails"], "Low stock · " . $shop["shopName"], pos_alert_low_stock_text($shop["shopName"], $fresh));
  } catch (Throwable $e) {
    error_log("low stock alert failed: " . $e->getMessage());
  }
}

function pos_send_closing_alert($bid) {
  $cfg = pos_alert_settings();
  if (!pos_alert_flag($cfg["alert_closing"])) return ["skipped" => true];
  $shop = pos_shop_alert_contacts($bid);
  if (!$shop["businessId"]) return ["skipped" => true];
  $hour = (int) date("G");
  $close = (int) $cfg["alert_closing_hour"];
  if ($hour < $close) return ["skipped" => true, "reason" => "before-close"];
  $day = date("Y-m-d");
  if (pos_alert_sent($shop["businessId"], "closing", $day, "")) return ["skipped" => true, "reason" => "already-sent"];
  if (!pos_alert_mark($shop["businessId"], "closing", $day, "")) return ["skipped" => true, "reason" => "already-sent"];
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
  ]);
  return pos_alert_dispatch($shop["phones"], $shop["emails"], "Closing sales · {$shop["shopName"]} · {$day}", $text);
}

function pos_tick_shop_alerts($bid = null) {
  try {
    if ($bid) {
      pos_apply_business_timezone($bid);
      return pos_send_closing_alert($bid);
    }
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
