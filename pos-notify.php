<?php

function pos_notify_ist_now() {
  try {
    return new DateTime("now", new DateTimeZone("Asia/Kolkata"));
  } catch (Throwable $e) {
    return new DateTime("now");
  }
}

function pos_notify_ensure_schema() {
  static $done = false;
  if ($done) return;
  $done = true;
  $db = pos_db();
  @$db->query(
    "CREATE TABLE IF NOT EXISTS notify_campaigns (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      title VARCHAR(180) NOT NULL,
      body TEXT NULL,
      template_key VARCHAR(64) NOT NULL DEFAULT '',
      image_url MEDIUMTEXT NULL,
      document_url VARCHAR(500) NOT NULL DEFAULT '',
      link_url VARCHAR(500) NOT NULL DEFAULT '',
      audience VARCHAR(32) NOT NULL,
      audience_json TEXT NULL,
      channels VARCHAR(64) NOT NULL,
      status VARCHAR(24) NOT NULL,
      scheduled_at DATETIME NULL,
      last_error VARCHAR(255) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX (status)
    )"
  );
  @$db->query(
    "CREATE TABLE IF NOT EXISTS notify_recipients (
      id VARCHAR(64) PRIMARY KEY,
      campaign_id VARCHAR(64) NOT NULL,
      business_id VARCHAR(64) NOT NULL,
      business_name VARCHAR(180) NOT NULL DEFAULT '',
      owner_name VARCHAR(180) NOT NULL DEFAULT '',
      mobile VARCHAR(20) NOT NULL DEFAULT '',
      plan_name VARCHAR(120) NOT NULL DEFAULT '',
      expiry_date VARCHAR(16) NOT NULL DEFAULT '',
      wa_status VARCHAR(16) NOT NULL DEFAULT 'skipped',
      wa_error VARCHAR(255) NOT NULL DEFAULT '',
      app_status VARCHAR(16) NOT NULL DEFAULT 'skipped',
      push_status VARCHAR(16) NOT NULL DEFAULT 'skipped',
      notification_id VARCHAR(64) NOT NULL DEFAULT '',
      dedupe_key VARCHAR(80) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_campaign_dedupe (campaign_id, dedupe_key),
      INDEX (campaign_id),
      INDEX (notification_id)
    )"
  );
  if (function_exists("pos_ensure_columns")) {
    pos_ensure_columns("businesses", [
      "whatsapp_consent" => "TINYINT(1) NOT NULL DEFAULT 0",
      "whatsapp_opt_out" => "TINYINT(1) NOT NULL DEFAULT 0",
    ]);
  }
}

function pos_notify_channels($raw) {
  $allowed = ["in_app", "push", "whatsapp"];
  if ($raw === null || $raw === "" || $raw === "all") return $allowed;
  $list = is_array($raw) ? $raw : explode(",", (string) $raw);
  $out = [];
  foreach ($list as $item) {
    $key = strtolower(trim((string) $item));
    if ($key === "all") return $allowed;
    if (in_array($key, $allowed, true) && !in_array($key, $out, true)) $out[] = $key;
  }
  return $out;
}

function pos_notify_audience($raw) {
  $key = strtolower(trim((string) $raw));
  $allowed = ["all", "selected", "one", "restaurant", "retail", "garment", "pharmacy", "cafe", "salon", "active", "expired", "category"];
  return in_array($key, $allowed, true) ? $key : "";
}

function pos_notify_mobile($raw) {
  $digits = preg_replace("/\D+/", "", (string) $raw);
  if (strpos($digits, "00") === 0) $digits = substr($digits, 2);
  if (strpos($digits, "91") === 0 && strlen($digits) >= 12) $digits = substr($digits, -10);
  elseif (strpos($digits, "0") === 0 && strlen($digits) === 11) $digits = substr($digits, 1);
  elseif (strlen($digits) > 10) $digits = substr($digits, -10);
  return preg_match("/^\d{10}$/", $digits) ? $digits : "";
}

function pos_notify_active($biz, $today) {
  $status = strtolower((string) ($biz["status"] ?? "active"));
  if (in_array($status, ["inactive", "suspended", "expired"], true)) return false;
  $exp = substr((string) ($biz["subscription_expires_at"] ?? ""), 0, 10);
  if ($exp === "") return true;
  return $exp >= $today;
}

function pos_notify_match($biz, $audience, $ids, $category, $today) {
  if (!$audience || empty($biz["id"])) return false;
  if ($audience === "all") return true;
  if ($audience === "selected" || $audience === "one") return in_array((string) $biz["id"], $ids, true);
  if ($audience === "active") return pos_notify_active($biz, $today);
  if ($audience === "expired") return !pos_notify_active($biz, $today);
  $text = strtolower(trim((string) ($biz["category"] ?? "") . " " . (string) ($biz["business_type"] ?? "")));
  if ($audience === "category") {
    $want = strtolower(trim((string) $category));
    return $want !== "" && strpos($text, $want) !== false;
  }
  return strpos($text, $audience) !== false;
}

function pos_notify_fill($text, $row) {
  $mobile = pos_notify_mobile($row["mobile"] ?? "");
  $map = [
    "{{business_name}}" => $row["business_name"] ?? ($row["name"] ?? "your business"),
    "{{owner_name}}" => ($row["owner_name"] ?? "") !== "" ? $row["owner_name"] : "there",
    "{{mobile_number}}" => $mobile !== "" ? "+91" . $mobile : "",
    "{{subscription_plan}}" => ($row["plan_name"] ?? "") !== "" ? $row["plan_name"] : "your plan",
    "{{expiry_date}}" => substr((string) ($row["expiry_date"] ?? ($row["subscription_expires_at"] ?? "")), 0, 10) ?: "—",
  ];
  return strtr((string) $text, $map);
}

function pos_notify_compose($text, $link) {
  $body = trim((string) $text);
  $href = trim((string) $link);
  if ($href !== "" && strpos($body, $href) === false) $body = trim($body . "\n" . $href);
  if ($body !== "" && !preg_match("/opt out/i", $body)) {
    $body .= "\n\nReply STOP to opt out of ATAV POS WhatsApp updates.";
  }
  return $body;
}

function pos_notify_https($raw, $label) {
  $value = trim((string) $raw);
  if ($value === "") return "";
  if (stripos($value, "https://") !== 0 || strlen($value) > 500) {
    throw new Exception($label . " must be an https link");
  }
  return $value;
}

function pos_notify_businesses() {
  pos_notify_ensure_schema();
  try {
    return pos_q(
      "SELECT b.id, b.name, b.owner_name, b.mobile, b.category, b.business_type, b.status, b.subscription_expires_at,
              COALESCE(b.whatsapp_consent,0) AS whatsapp_consent, COALESCE(b.whatsapp_opt_out,0) AS whatsapp_opt_out,
              COALESCE(p.name,'') AS plan_name
       FROM businesses b
       LEFT JOIN subscription_plans p ON p.id = b.plan_id
       ORDER BY b.name
       LIMIT 2000"
    );
  } catch (Throwable $e) {
    return pos_q(
      "SELECT id, name, owner_name, mobile, category, business_type, status, subscription_expires_at,
              0 AS whatsapp_consent, 0 AS whatsapp_opt_out, '' AS plan_name
       FROM businesses ORDER BY name LIMIT 2000"
    );
  }
}

function pos_notify_ids($raw) {
  $list = is_array($raw) ? $raw : explode(",", (string) $raw);
  $out = [];
  foreach ($list as $id) {
    $id = trim((string) $id);
    if ($id !== "" && !in_array($id, $out, true)) $out[] = $id;
  }
  return $out;
}

function pos_notify_classify_row($biz, $channels, &$seen) {
  $use = array_fill_keys($channels, true);
  $mobile = pos_notify_mobile($biz["mobile"] ?? "");
  $reason = "";
  $wa = "skipped";
  if (empty($use["whatsapp"])) $reason = "channel-off";
  elseif ($mobile === "") $reason = trim((string) ($biz["mobile"] ?? "")) !== "" ? "invalid-mobile" : "missing-mobile";
  elseif ((int) ($biz["whatsapp_opt_out"] ?? 0) === 1) $reason = "opt-out";
  elseif ((int) ($biz["whatsapp_consent"] ?? 0) !== 1) $reason = "no-consent";
  elseif (isset($seen[$mobile])) $reason = "duplicate";
  else {
    $wa = "pending";
    $seen[$mobile] = true;
  }
  return [
    "mobile" => $mobile,
    "dedupe" => ($wa === "pending" && $mobile !== "") ? $mobile : "biz:" . ($biz["id"] ?? ""),
    "wa" => $wa,
    "waReason" => $reason,
    "app" => !empty($use["in_app"]) ? "pending" : "skipped",
    "push" => !empty($use["push"]) ? "pending" : "skipped",
  ];
}

function pos_notify_targets($input) {
  $audience = pos_notify_audience($input["audience"] ?? "all");
  if ($audience === "") throw new Exception("Choose a target audience");
  $channels = pos_notify_channels($input["channels"] ?? "all");
  if (!$channels) throw new Exception("Choose at least one channel");
  $ids = pos_notify_ids($input["business_ids"] ?? ($input["business_id"] ?? ""));
  if ($audience === "one" && count($ids) !== 1) throw new Exception("Choose one business");
  if ($audience === "selected" && !$ids) throw new Exception("Choose at least one business");
  $category = trim((string) ($input["category"] ?? ""));
  $today = pos_notify_ist_now()->format("Y-m-d");
  $seen = [];
  $rows = [];
  foreach (pos_notify_businesses() as $biz) {
    if (!pos_notify_match($biz, $audience, $ids, $category, $today)) continue;
    $plan = $biz["plan_name"] ?? "";
    $class = pos_notify_classify_row($biz, $channels, $seen);
    $rows[] = [
      "id" => $biz["id"],
      "name" => $biz["name"] ?? "",
      "owner_name" => $biz["owner_name"] ?? "",
      "mobile" => $biz["mobile"] ?? "",
      "plan_name" => $plan,
      "subscription_expires_at" => substr((string) ($biz["subscription_expires_at"] ?? ""), 0, 10),
      "class" => $class,
    ];
  }
  return ["audience" => $audience, "channels" => $channels, "rows" => $rows, "category" => $category];
}

function pos_notify_summary($rows) {
  $sum = ["total" => count($rows), "whatsapp" => 0, "skipped" => 0, "missing" => 0, "invalid" => 0, "opt_out" => 0, "no_consent" => 0, "duplicate" => 0];
  foreach ($rows as $row) {
    $reason = $row["class"]["waReason"] ?? "";
    if (($row["class"]["wa"] ?? "") === "pending") $sum["whatsapp"]++;
    else $sum["skipped"]++;
    if ($reason === "missing-mobile") $sum["missing"]++;
    if ($reason === "invalid-mobile") $sum["invalid"]++;
    if ($reason === "opt-out") $sum["opt_out"]++;
    if ($reason === "no-consent") $sum["no_consent"]++;
    if ($reason === "duplicate") $sum["duplicate"]++;
  }
  return $sum;
}

function pos_notify_preview($input) {
  $title = trim((string) ($input["title"] ?? ""));
  $body = trim((string) ($input["body"] ?? ""));
  if ($title === "" && $body === "") throw new Exception("Enter a title or message");
  $link = pos_notify_https($input["link_url"] ?? "", "Website link");
  $pack = pos_notify_targets($input);
  $sample = $pack["rows"][0] ?? [
    "name" => "Sample Shop",
    "owner_name" => "Owner",
    "mobile" => "9876543210",
    "plan_name" => "Growth",
    "subscription_expires_at" => pos_notify_ist_now()->format("Y-m-d"),
  ];
  $filled = pos_notify_fill($body !== "" ? $body : $title, [
    "business_name" => $sample["name"],
    "owner_name" => $sample["owner_name"],
    "mobile" => $sample["mobile"],
    "plan_name" => $sample["plan_name"],
    "subscription_expires_at" => $sample["subscription_expires_at"],
  ]);
  return [
    "ok" => true,
    "summary" => pos_notify_summary($pack["rows"]),
    "channels" => $pack["channels"],
    "audience" => $pack["audience"],
    "preview" => pos_notify_compose($filled, $link),
  ];
}

function pos_notify_recent_duplicate($mobile, $body) {
  if ($mobile === "") return false;
  $rows = pos_q(
    "SELECT r.id FROM notify_recipients r
     JOIN notify_campaigns c ON c.id = r.campaign_id
     WHERE r.mobile = ? AND r.wa_status IN ('sent','delivered','read','pending')
       AND c.body = ? AND r.created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
     LIMIT 1",
    "ss",
    [$mobile, $body]
  );
  return (bool) $rows;
}

function pos_notify_public_campaign($row, $counts = null) {
  return [
    "id" => $row["id"],
    "name" => $row["name"],
    "title" => $row["title"],
    "body" => $row["body"],
    "audience" => $row["audience"],
    "channels" => $row["channels"],
    "status" => $row["status"],
    "scheduled_at" => $row["scheduled_at"],
    "created_at" => $row["created_at"],
    "last_error" => $row["last_error"] ?? "",
    "counts" => $counts,
  ];
}

function pos_notify_counts($campaignId) {
  $rows = pos_q("SELECT wa_status, app_status, push_status FROM notify_recipients WHERE campaign_id = ?", "s", [$campaignId]);
  $blank = ["sent" => 0, "delivered" => 0, "read" => 0, "failed" => 0, "pending" => 0, "skipped" => 0, "cancelled" => 0];
  $out = ["total" => count($rows), "whatsapp" => $blank, "in_app" => $blank, "push" => $blank];
  foreach ($rows as $row) {
    foreach (["wa_status" => "whatsapp", "app_status" => "in_app", "push_status" => "push"] as $col => $key) {
      $st = $row[$col] ?: "skipped";
      if (!isset($out[$key][$st])) $out[$key][$st] = 0;
      $out[$key][$st]++;
    }
  }
  return $out;
}

function pos_notify_refresh_status($campaignId) {
  $camp = pos_q("SELECT status, scheduled_at FROM notify_campaigns WHERE id = ? LIMIT 1", "s", [$campaignId]);
  if (!$camp) return;
  $cur = $camp[0]["status"];
  if ($cur === "cancelled") return;
  $counts = pos_notify_counts($campaignId);
  $open = ($counts["whatsapp"]["pending"] ?? 0) + ($counts["in_app"]["pending"] ?? 0) + ($counts["push"]["pending"] ?? 0);
  $failed = ($counts["whatsapp"]["failed"] ?? 0) + ($counts["push"]["failed"] ?? 0);
  $sent = ($counts["whatsapp"]["sent"] ?? 0) + ($counts["whatsapp"]["delivered"] ?? 0) + ($counts["whatsapp"]["read"] ?? 0)
    + ($counts["in_app"]["sent"] ?? 0) + ($counts["in_app"]["read"] ?? 0) + ($counts["push"]["sent"] ?? 0);
  if ($cur === "scheduled") $status = "scheduled";
  elseif ($open > 0) $status = "sending";
  elseif ($failed && $sent) $status = "partial";
  elseif ($failed && !$sent) $status = "failed";
  else $status = "sent";
  pos_q("UPDATE notify_campaigns SET status = ? WHERE id = ?", "ss", [$status, $campaignId]);
}

function pos_notify_wa_status($result) {
  if (empty($result["ok"])) return "failed";
  $json = is_array($result["json"] ?? null) ? $result["json"] : [];
  $raw = strtolower((string) ($json["status"] ?? ($json["delivery"] ?? ($result["delivery"] ?? ""))));
  if ($raw === "read") return "read";
  if ($raw === "delivered") return "delivered";
  if ($raw === "queued" || !empty($result["queued"]) || $raw === "pending") return "pending";
  return "sent";
}

function pos_notify_process($campaignId, $limit = 5) {
  pos_notify_ensure_schema();
  require_once __DIR__ . "/pos-alerts.php";
  $campRows = pos_q("SELECT * FROM notify_campaigns WHERE id = ? LIMIT 1", "s", [$campaignId]);
  if (!$campRows) throw new Exception("Campaign not found");
  $camp = $campRows[0];
  if ($camp["status"] === "cancelled") return pos_notify_public_campaign($camp, pos_notify_counts($campaignId));
  if ($camp["status"] === "scheduled") {
    $when = (string) ($camp["scheduled_at"] ?? "");
    if ($when !== "" && $when > pos_notify_ist_now()->format("Y-m-d H:i:s")) {
      return pos_notify_public_campaign($camp, pos_notify_counts($campaignId));
    }
    pos_q("UPDATE notify_campaigns SET status = 'sending' WHERE id = ?", "s", [$campaignId]);
  }
  $channels = pos_notify_channels($camp["channels"]);
  $cfg = function_exists("pos_alert_settings") ? pos_alert_settings() : [];
  $batch = pos_q(
    "SELECT * FROM notify_recipients WHERE campaign_id = ? AND (wa_status = 'pending' OR app_status = 'pending' OR push_status = 'pending') ORDER BY created_at LIMIT " . (int) $limit,
    "s",
    [$campaignId]
  );
  foreach ($batch as $row) {
    if ($row["app_status"] === "pending" && in_array("in_app", $channels, true)) {
      $noteId = pos_uuid();
      $text = pos_notify_fill($camp["body"], $row);
      if (function_exists("pos_save_dashboard_notification")) {
        $saved = pos_save_dashboard_notification($row["business_id"], $camp["title"], $text, $camp["image_url"] ?? "", "");
        if ($saved) $noteId = $saved;
      }
      pos_q("UPDATE notify_recipients SET app_status = 'sent', notification_id = ? WHERE id = ?", "ss", [$noteId, $row["id"]]);
      $row["notification_id"] = $noteId;
    } elseif ($row["app_status"] === "pending") {
      pos_q("UPDATE notify_recipients SET app_status = 'skipped' WHERE id = ?", "s", [$row["id"]]);
    }
    if ($row["push_status"] === "pending" && !in_array("push", $channels, true)) {
      pos_q("UPDATE notify_recipients SET push_status = 'skipped' WHERE id = ?", "s", [$row["id"]]);
    }
    if ($row["wa_status"] !== "pending") continue;
    $dup = pos_q(
      "SELECT id FROM notify_recipients WHERE mobile = ? AND campaign_id <> ? AND wa_status IN ('sent','delivered','read','pending') AND created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE) LIMIT 1",
      "ss",
      [$row["mobile"], $campaignId]
    );
    if ($dup) {
      pos_q("UPDATE notify_recipients SET wa_status = 'skipped', wa_error = 'duplicate' WHERE id = ?", "s", [$row["id"]]);
      continue;
    }
    $message = pos_notify_compose(pos_notify_fill($camp["body"], $row), $camp["link_url"] ?? "");
    $media = "";
    if (!empty($camp["document_url"])) $media = $camp["document_url"];
    elseif (!empty($camp["image_url"]) && stripos((string) $camp["image_url"], "https://") === 0) $media = $camp["image_url"];
    try {
      $sent = function_exists("pos_wa_send_one") ? pos_wa_send_one($cfg, $row["mobile"], $message, $media) : ["ok" => false, "error" => "WhatsApp sender missing"];
    } catch (Throwable $e) {
      $sent = ["ok" => false, "error" => $e->getMessage()];
    }
    $status = pos_notify_wa_status($sent);
    $err = $status === "failed" ? substr((string) ($sent["error"] ?? "failed"), 0, 255) : "";
    pos_q("UPDATE notify_recipients SET wa_status = ?, wa_error = ? WHERE id = ?", "sss", [$status, $err, $row["id"]]);
    if (function_exists("pos_log_alert_deliveries")) {
      pos_log_alert_deliveries(
        ["kind" => "notify", "businessId" => $row["business_id"], "shopName" => $row["business_name"]],
        $camp["title"],
        $message,
        ["ok" => !empty($sent["ok"]), "results" => [$sent]],
        []
      );
    }
  }
  pos_notify_refresh_status($campaignId);
  $fresh = pos_q("SELECT * FROM notify_campaigns WHERE id = ? LIMIT 1", "s", [$campaignId]);
  return pos_notify_public_campaign($fresh[0], pos_notify_counts($campaignId));
}

function pos_notify_create($input) {
  pos_notify_ensure_schema();
  $name = trim((string) ($input["name"] ?? $input["title"] ?? ""));
  $title = trim((string) ($input["title"] ?? ""));
  $body = trim((string) ($input["body"] ?? ""));
  if ($name === "") $name = $title;
  if ($title === "") throw new Exception("Message title is required");
  if ($body === "") throw new Exception("WhatsApp message is required");
  if (strlen($name) > 180 || strlen($title) > 180) throw new Exception("Title is too long");
  if (strlen($body) > 2000) throw new Exception("Message is too long");
  $link = pos_notify_https($input["link_url"] ?? "", "Website link");
  $document = pos_notify_https($input["document_url"] ?? "", "Document");
  $image = "";
  if (!empty($input["image_url"]) && function_exists("pos_notice_image")) $image = pos_notice_image($input["image_url"]);
  $pack = pos_notify_targets($input);
  $when = trim((string) ($input["scheduled_at"] ?? ""));
  $scheduled = false;
  $scheduleSql = null;
  if ($when !== "") {
    $dt = DateTime::createFromFormat("Y-m-d\\TH:i", $when, new DateTimeZone("Asia/Kolkata"));
    if (!$dt) $dt = DateTime::createFromFormat("Y-m-d H:i:s", $when, new DateTimeZone("Asia/Kolkata"));
    if (!$dt) throw new Exception("Schedule time is not valid");
    $scheduleSql = $dt->format("Y-m-d H:i:s");
    $scheduled = $scheduleSql > pos_notify_ist_now()->format("Y-m-d H:i:s");
  }
  $id = pos_uuid();
  $audienceJson = json_encode([
    "business_ids" => pos_notify_ids($input["business_ids"] ?? ($input["business_id"] ?? "")),
    "category" => $pack["category"],
  ]);
  pos_q(
    "INSERT INTO notify_campaigns
     (id, name, title, body, template_key, image_url, document_url, link_url, audience, audience_json, channels, status, scheduled_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULLIF(?, ''))",
    "sssssssssssss",
    [
      $id,
      $name,
      $title,
      $body,
      substr((string) ($input["template_key"] ?? ""), 0, 64),
      $image,
      $document,
      $link,
      $pack["audience"],
      $audienceJson,
      implode(",", $pack["channels"]),
      $scheduled ? "scheduled" : "sending",
      $scheduleSql ?: "",
    ]
  );
  foreach ($pack["rows"] as $row) {
    $class = $row["class"];
    if ($class["wa"] === "pending" && pos_notify_recent_duplicate($class["mobile"], $body)) {
      $class["wa"] = "skipped";
      $class["waReason"] = "duplicate";
    }
    pos_q(
      "INSERT INTO notify_recipients
       (id, campaign_id, business_id, business_name, owner_name, mobile, plan_name, expiry_date, wa_status, wa_error, app_status, push_status, dedupe_key)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      "sssssssssssss",
      [
        pos_uuid(),
        $id,
        $row["id"],
        substr((string) $row["name"], 0, 180),
        substr((string) $row["owner_name"], 0, 180),
        $class["mobile"],
        substr((string) $row["plan_name"], 0, 120),
        substr((string) $row["subscription_expires_at"], 0, 16),
        $class["wa"],
        substr((string) $class["waReason"], 0, 255),
        $class["app"],
        $class["push"],
        substr((string) $class["dedupe"], 0, 80),
      ]
    );
  }
  if (!$scheduled) return pos_notify_process($id, 5);
  $fresh = pos_q("SELECT * FROM notify_campaigns WHERE id = ? LIMIT 1", "s", [$id]);
  return pos_notify_public_campaign($fresh[0], pos_notify_counts($id));
}

function pos_notify_list() {
  pos_notify_ensure_schema();
  $due = pos_q("SELECT id, scheduled_at FROM notify_campaigns WHERE status = 'scheduled' ORDER BY scheduled_at LIMIT 5");
  $now = pos_notify_ist_now()->format("Y-m-d H:i:s");
  foreach ($due as $row) {
    if ((string) ($row["scheduled_at"] ?? "") <= $now) {
      pos_notify_process($row["id"], 5);
      break;
    }
  }
  $camps = pos_q("SELECT * FROM notify_campaigns ORDER BY created_at DESC LIMIT 50");
  $out = [];
  foreach ($camps as $row) $out[] = pos_notify_public_campaign($row, pos_notify_counts($row["id"]));
  return ["ok" => true, "campaigns" => $out];
}

function pos_notify_contacts() {
  $rows = [];
  $seen = [];
  foreach (pos_notify_businesses() as $biz) {
    $mobile = pos_notify_mobile($biz["mobile"] ?? "");
    $issue = "";
    if (trim((string) ($biz["mobile"] ?? "")) === "") $issue = "missing";
    elseif ($mobile === "") $issue = "invalid";
    elseif (isset($seen[$mobile])) $issue = "duplicate";
    if ($mobile !== "") $seen[$mobile] = true;
    if ($issue === "" && (int) ($biz["whatsapp_opt_out"] ?? 0) !== 1 && (int) ($biz["whatsapp_consent"] ?? 0) === 1) continue;
    $rows[] = [
      "id" => $biz["id"],
      "name" => $biz["name"] ?? "",
      "owner_name" => $biz["owner_name"] ?? "",
      "mobile" => $biz["mobile"] ?? "",
      "normalized" => $mobile !== "" ? "+91" . $mobile : "",
      "issue" => $issue,
      "whatsapp_consent" => (int) ($biz["whatsapp_consent"] ?? 0),
      "whatsapp_opt_out" => (int) ($biz["whatsapp_opt_out"] ?? 0),
    ];
  }
  return ["ok" => true, "rows" => $rows];
}

function pos_notify_save_contact($businessId, $input) {
  pos_notify_ensure_schema();
  $mobileRaw = trim((string) ($input["mobile"] ?? ""));
  $mobile = $mobileRaw === "" ? "" : pos_notify_mobile($mobileRaw);
  if ($mobileRaw !== "" && $mobile === "") throw new Exception("Enter a 10-digit Indian mobile number");
  $owner = substr(trim((string) ($input["owner_name"] ?? "")), 0, 180);
  $consent = !empty($input["whatsapp_consent"]) ? 1 : 0;
  $opt = !empty($input["whatsapp_opt_out"]) ? 1 : 0;
  if ($opt) $consent = 0;
  $stored = $mobile === "" ? "" : $mobile;
  pos_q(
    "UPDATE businesses SET mobile = ?, owner_name = IF(? = '', owner_name, ?), whatsapp_consent = ?, whatsapp_opt_out = ? WHERE id = ?",
    "sssiis",
    [$stored, $owner, $owner, $consent, $opt, $businessId]
  );
  return ["ok" => true];
}

function pos_notify_ack($businessId, $ids, $push) {
  pos_notify_ensure_schema();
  $pushStatus = $push === "sent" ? "sent" : "failed";
  $n = 0;
  foreach ((array) $ids as $id) {
    $id = trim((string) $id);
    if ($id === "") continue;
    $rows = pos_q(
      "SELECT id, campaign_id FROM notify_recipients WHERE notification_id = ? AND business_id = ? LIMIT 1",
      "ss",
      [$id, $businessId]
    );
    if (!$rows) continue;
    pos_q(
      "UPDATE notify_recipients SET push_status = IF(push_status = 'pending', ?, push_status), app_status = IF(app_status = 'sent', 'read', app_status) WHERE id = ?",
      "ss",
      [$pushStatus, $rows[0]["id"]]
    );
    pos_notify_refresh_status($rows[0]["campaign_id"]);
    $n++;
  }
  return ["ok" => true, "updated" => $n];
}

function pos_notify_retry($campaignId) {
  pos_q("UPDATE notify_recipients SET wa_status = 'pending', wa_error = '' WHERE campaign_id = ? AND wa_status = 'failed'", "s", [$campaignId]);
  pos_q("UPDATE notify_campaigns SET status = 'sending' WHERE id = ? AND status <> 'cancelled'", "s", [$campaignId]);
  return pos_notify_process($campaignId, 5);
}

function pos_notify_cancel($campaignId) {
  pos_q("UPDATE notify_campaigns SET status = 'cancelled' WHERE id = ?", "s", [$campaignId]);
  pos_q(
    "UPDATE notify_recipients SET wa_status = IF(wa_status = 'pending', 'cancelled', wa_status), app_status = IF(app_status = 'pending', 'cancelled', app_status), push_status = IF(push_status = 'pending', 'cancelled', push_status) WHERE campaign_id = ?",
    "s",
    [$campaignId]
  );
  $fresh = pos_q("SELECT * FROM notify_campaigns WHERE id = ? LIMIT 1", "s", [$campaignId]);
  if (!$fresh) throw new Exception("Campaign not found");
  return pos_notify_public_campaign($fresh[0], pos_notify_counts($campaignId));
}

function pos_notify_export($campaignId) {
  $camp = pos_q("SELECT name FROM notify_campaigns WHERE id = ? LIMIT 1", "s", [$campaignId]);
  if (!$camp) throw new Exception("Campaign not found");
  $rows = pos_q("SELECT * FROM notify_recipients WHERE campaign_id = ? ORDER BY business_name", "s", [$campaignId]);
  $lines = ["business,owner,mobile,whatsapp,whatsapp_error,in_app,browser_push"];
  foreach ($rows as $row) {
    $cells = [$row["business_name"], $row["owner_name"], $row["mobile"], $row["wa_status"], $row["wa_error"], $row["app_status"], $row["push_status"]];
    $lines[] = implode(",", array_map(function ($cell) {
      return '"' . str_replace('"', '""', (string) $cell) . '"';
    }, $cells));
  }
  if (function_exists("pos_send_file")) {
    pos_send_file(200, "text/csv; charset=utf-8", "campaign-" . substr($campaignId, 0, 8) . ".csv", implode("\n", $lines));
  }
  header("Content-Type: text/csv; charset=utf-8");
  echo implode("\n", $lines);
  exit;
}

function pos_shop_notice_rows($businessId) {
  $sql = "SELECT n.id, n.title, n.body,
      COALESCE(NULLIF(n.image_url, ''), (
        SELECT c.image_url FROM notify_recipients r
        JOIN notify_campaigns c ON c.id = r.campaign_id
        WHERE r.notification_id = n.id AND c.image_url IS NOT NULL AND c.image_url <> ''
        ORDER BY r.created_at DESC LIMIT 1
      )) AS image_url,
      n.locale, n.created_at
    FROM notifications n
    WHERE n.business_id IS NULL OR n.business_id = '' OR n.business_id = ?
    ORDER BY n.created_at DESC LIMIT 20";
  try {
    return pos_q($sql, "s", [$businessId]);
  } catch (Throwable $e) {
    return pos_q(
      "SELECT id, title, body, image_url, locale, created_at FROM notifications WHERE business_id IS NULL OR business_id = '' OR business_id = ? ORDER BY created_at DESC LIMIT 20",
      "s",
      [$businessId]
    );
  }
}

function pos_notify_dispatch($path, $method, $body) {
  $contact = preg_match("#^master/businesses/[^/]+/whatsapp-contact$#", $path);
  if (strpos($path, "master/notify-campaigns") !== 0 && !$contact) return false;
  pos_notify_ensure_schema();
  if ($path === "master/notify-campaigns/preview" && $method === "POST") {
    pos_send(200, pos_notify_preview($body));
  }
  if ($path === "master/notify-campaigns/contacts" && $method === "GET") {
    pos_send(200, pos_notify_contacts());
  }
  if ($path === "master/notify-campaigns" && $method === "GET") {
    pos_send(200, pos_notify_list());
  }
  if ($path === "master/notify-campaigns" && $method === "POST") {
    pos_send(200, ["ok" => true, "campaign" => pos_notify_create($body)]);
  }
  if (preg_match("#^master/notify-campaigns/([^/]+)$#", $path, $m) && $method === "GET") {
    $rows = pos_q("SELECT * FROM notify_campaigns WHERE id = ? LIMIT 1", "s", [$m[1]]);
    if (!$rows) throw new Exception("Campaign not found");
    pos_send(200, ["ok" => true, "campaign" => pos_notify_public_campaign($rows[0], pos_notify_counts($m[1]))]);
  }
  if (preg_match("#^master/notify-campaigns/([^/]+)/recipients$#", $path, $m) && $method === "GET") {
    pos_send(200, ["ok" => true, "recipients" => pos_q("SELECT id, business_id, business_name, owner_name, mobile, wa_status, wa_error, app_status, push_status FROM notify_recipients WHERE campaign_id = ? ORDER BY business_name LIMIT 500", "s", [$m[1]])]);
  }
  if (preg_match("#^master/notify-campaigns/([^/]+)/continue$#", $path, $m) && $method === "POST") {
    pos_send(200, ["ok" => true, "campaign" => pos_notify_process($m[1], 5)]);
  }
  if (preg_match("#^master/notify-campaigns/([^/]+)/retry$#", $path, $m) && $method === "POST") {
    pos_send(200, ["ok" => true, "campaign" => pos_notify_retry($m[1])]);
  }
  if (preg_match("#^master/notify-campaigns/([^/]+)/cancel$#", $path, $m) && $method === "POST") {
    pos_send(200, ["ok" => true, "campaign" => pos_notify_cancel($m[1])]);
  }
  if (preg_match("#^master/notify-campaigns/([^/]+)/export$#", $path, $m) && $method === "GET") {
    pos_notify_export($m[1]);
  }
  if (preg_match("#^master/businesses/([^/]+)/whatsapp-contact$#", $path, $m) && $method === "POST") {
    pos_send(200, pos_notify_save_contact($m[1], $body));
  }
  return false;
}
