<?php
function pos_ga4_events() {
  return [
    "page_view", "scroll", "click", "login_click", "signup_click", "get_started", "book_demo",
    "contact_submit", "phone_click", "email_click", "whatsapp_click", "pricing_view", "pricing_click",
    "feature_view", "business_category_view", "business_category_select", "ai_growth_view",
    "hardware_view", "weighing_scale_view", "qr_order_view", "demo_video_play", "faq_open", "download_brochure",
  ];
}

function pos_ensure_analytics_schema() {
  pos_q("CREATE TABLE IF NOT EXISTS website_analytics_settings (
    id VARCHAR(16) PRIMARY KEY,
    measurement_id VARCHAR(32) NULL,
    google_tag_id VARCHAR(64) NULL,
    property_id VARCHAR(32) NULL,
    connected TINYINT NOT NULL DEFAULT 0,
    consent_required TINYINT NOT NULL DEFAULT 1,
    conversion_events TEXT NULL,
    data_api_configured TINYINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(3) NULL
  )");
  pos_q("CREATE TABLE IF NOT EXISTS website_analytics_events (
    id VARCHAR(36) PRIMARY KEY,
    occurred_at TIMESTAMP(3) NOT NULL,
    event_name VARCHAR(64) NOT NULL,
    page_path VARCHAR(255) NULL,
    page_title VARCHAR(255) NULL,
    business_category VARCHAR(64) NULL,
    page_type VARCHAR(64) NULL,
    cta_type VARCHAR(64) NULL,
    utm_source VARCHAR(64) NULL,
    utm_medium VARCHAR(64) NULL,
    utm_campaign VARCHAR(64) NULL,
    utm_term VARCHAR(64) NULL,
    utm_content VARCHAR(64) NULL,
    device VARCHAR(32) NULL,
    referrer VARCHAR(255) NULL,
    session_id VARCHAR(64) NULL,
    INDEX (occurred_at),
    INDEX (event_name)
  )");
  pos_q("CREATE TABLE IF NOT EXISTS website_analytics_alerts (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    metric VARCHAR(64) NOT NULL,
    condition_op VARCHAR(16) NOT NULL,
    threshold DECIMAL(12,2) NOT NULL DEFAULT 0,
    frequency VARCHAR(32) NOT NULL DEFAULT 'daily',
    email_on TINYINT NOT NULL DEFAULT 1,
    dashboard_on TINYINT NOT NULL DEFAULT 1,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    last_fired_at TIMESTAMP(3) NULL
  )");
  $row = pos_q("SELECT id FROM website_analytics_settings WHERE id = 'platform' LIMIT 1");
  if (!$row) {
    $conv = json_encode(["get_started", "book_demo", "contact_submit", "phone_click", "email_click", "whatsapp_click"]);
    pos_q(
      "INSERT INTO website_analytics_settings (id, conversion_events, consent_required, updated_at) VALUES ('platform', ?, 1, CURRENT_TIMESTAMP(3))",
      "s",
      [$conv]
    );
  }
}

function pos_analytics_settings() {
  pos_ensure_analytics_schema();
  $rows = pos_q("SELECT * FROM website_analytics_settings WHERE id = 'platform' LIMIT 1");
  $row = $rows[0] ?? [];
  $conv = json_decode($row["conversion_events"] ?? "[]", true);
  if (!is_array($conv) || !$conv) {
    $conv = ["get_started", "book_demo", "contact_submit", "phone_click", "email_click", "whatsapp_click"];
  }
  $mid = trim((string) ($row["measurement_id"] ?? ""));
  $ok = (bool) ($row["connected"] ?? 0) && preg_match("/^G-[A-Z0-9]{4,20}$/i", $mid);
  return [
    "measurement_id" => $mid,
    "google_tag_id" => trim((string) ($row["google_tag_id"] ?? $mid)),
    "property_id" => trim((string) ($row["property_id"] ?? "")),
    "connected" => $ok,
    "consent_required" => (($row["consent_required"] ?? 1) != 0),
    "conversion_events" => $conv,
    "data_api_configured" => false,
    "source" => "website_events",
  ];
}

function pos_ga4_sql_in($names) {
  $ok = [];
  foreach ((array) $names as $n) {
    if (in_array($n, pos_ga4_events(), true)) $ok[] = "'" . $n . "'";
  }
  return $ok ? implode(",", $ok) : "'__none__'";
}

function pos_analytics_pct($cur, $prev) {
  $cur = (int) $cur;
  $prev = (int) $prev;
  if (!$prev) return $cur ? 100 : 0;
  return round((($cur - $prev) / $prev) * 1000) / 10;
}

function pos_analytics_range($range, $from = "", $to = "") {
  if ($from && $to) {
    return [date("Y-m-d H:i:s", strtotime($from)), date("Y-m-d H:i:s", strtotime($to))];
  }
  $now = time();
  if ($range === "yesterday") {
    $d = strtotime("yesterday");
    return [date("Y-m-d 00:00:00", $d), date("Y-m-d 00:00:00", $d + 86400)];
  }
  $days = ["today" => 1, "7d" => 7, "30d" => 30, "90d" => 90];
  $n = $days[$range] ?? 30;
  if ($range === "today") {
    return [date("Y-m-d 00:00:00"), date("Y-m-d H:i:s")];
  }
  return [date("Y-m-d H:i:s", $now - $n * 86400), date("Y-m-d H:i:s", $now)];
}

function pos_analytics_summarize($range = "30d", $from = "", $to = "") {
  pos_ensure_analytics_schema();
  [$since, $until] = pos_analytics_range($range, $from, $to);
  $len = max(1, strtotime($until) - strtotime($since));
  $prevSince = date("Y-m-d H:i:s", strtotime($since) - $len);
  $s = pos_analytics_settings();
  $inConv = pos_ga4_sql_in($s["conversion_events"]);
  $cnt = function ($extra, $a, $b) {
    $rows = pos_q("SELECT COUNT(*) AS n FROM website_analytics_events WHERE occurred_at >= '$a' AND occurred_at < '$b' $extra");
    return (int) ($rows[0]["n"] ?? 0);
  };
  $pageViews = $cnt("AND event_name = 'page_view'", $since, $until);
  $prevPageViews = $cnt("AND event_name = 'page_view'", $prevSince, $since);
  $events = $cnt("", $since, $until);
  $prevEvents = $cnt("", $prevSince, $since);
  $conversions = $cnt("AND event_name IN ($inConv)", $since, $until);
  $prevConversions = $cnt("AND event_name IN ($inConv)", $prevSince, $since);
  $leads = $cnt("AND event_name IN ('contact_submit','book_demo','get_started')", $since, $until);
  $users = pos_q("SELECT COUNT(DISTINCT session_id) AS n FROM website_analytics_events WHERE occurred_at >= '$since' AND occurred_at < '$until' AND session_id IS NOT NULL AND session_id <> ''");
  $prevUsers = pos_q("SELECT COUNT(DISTINCT session_id) AS n FROM website_analytics_events WHERE occurred_at >= '$prevSince' AND occurred_at < '$since' AND session_id IS NOT NULL AND session_id <> ''");
  $engaged = pos_q("SELECT COUNT(DISTINCT session_id) AS n FROM website_analytics_events WHERE occurred_at >= '$since' AND occurred_at < '$until' AND event_name IN ('scroll','click')");
  $userN = (int) ($users[0]["n"] ?? 0);
  $prevUserN = (int) ($prevUsers[0]["n"] ?? 0);
  $engN = (int) ($engaged[0]["n"] ?? 0);
  $bySource = pos_q("SELECT COALESCE(NULLIF(utm_source,''), IF(referrer='', 'direct', 'referral')) AS source, COUNT(*) AS n FROM website_analytics_events WHERE occurred_at >= '$since' AND occurred_at < '$until' AND event_name = 'page_view' GROUP BY source ORDER BY n DESC LIMIT 12");
  $byDevice = pos_q("SELECT COALESCE(device,'desktop') AS device, COUNT(*) AS n FROM website_analytics_events WHERE occurred_at >= '$since' AND occurred_at < '$until' GROUP BY device");
  $byPage = pos_q("SELECT COALESCE(NULLIF(page_path,''),'/') AS page, COUNT(DISTINCT session_id) AS users, SUM(event_name='page_view') AS sessions, SUM(event_name IN ($inConv)) AS conversions FROM website_analytics_events WHERE occurred_at >= '$since' AND occurred_at < '$until' GROUP BY page ORDER BY users DESC LIMIT 40");
  $byCategory = pos_q("SELECT COALESCE(NULLIF(business_category,''),'(none)') AS category, COUNT(DISTINCT session_id) AS visitors, SUM(event_name='get_started') AS get_started, SUM(event_name='book_demo') AS demo_requests, SUM(event_name IN ('contact_submit','book_demo','get_started')) AS leads FROM website_analytics_events WHERE occurred_at >= '$since' AND occurred_at < '$until' GROUP BY category ORDER BY visitors DESC LIMIT 30");
  $byCampaign = pos_q("SELECT COALESCE(NULLIF(utm_campaign,''),'(none)') AS campaign, COUNT(*) AS sessions, SUM(event_name IN ($inConv)) AS conversions FROM website_analytics_events WHERE occurred_at >= '$since' AND occurred_at < '$until' GROUP BY campaign ORDER BY sessions DESC LIMIT 20");
  $byEvent = pos_q("SELECT event_name, COUNT(*) AS n FROM website_analytics_events WHERE occurred_at >= '$since' AND occurred_at < '$until' GROUP BY event_name ORDER BY n DESC");
  $leadsRows = pos_q("SELECT id, occurred_at, event_name, COALESCE(NULLIF(utm_source,''), IF(referrer='', 'direct', 'referral')) AS source, utm_campaign, page_path, business_category FROM website_analytics_events WHERE occurred_at >= '$since' AND occurred_at < '$until' AND event_name IN ('contact_submit','book_demo','get_started') ORDER BY occurred_at DESC LIMIT 80");
  $realtime = pos_q("SELECT event_name, page_path, device, occurred_at FROM website_analytics_events WHERE occurred_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE) ORDER BY occurred_at DESC LIMIT 40");
  $active = pos_q("SELECT COUNT(DISTINCT session_id) AS n FROM website_analytics_events WHERE occurred_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)");
  $lines = [];
  if ($events === 0) {
    $lines[] = "No website events are stored for the selected period. Connect a GA4 Measurement ID and wait for traffic, or browse the public site with consent accepted.";
  } else {
    $lines[] = $pageViews >= $prevPageViews
      ? "Page views are at or above the previous equivalent period."
      : "Page views decreased compared with the previous selected period.";
    foreach ($byCategory as $c) {
      if (($c["category"] ?? "") !== "(none)") {
        $lines[] = $c["category"] . " pages received the most recorded visitors in this period.";
        break;
      }
    }
    $topDev = $byDevice[0]["device"] ?? "";
    if ($topDev) $lines[] = $topDev . " accounted for the largest share of recorded events.";
    $lines[] = $conversions >= $prevConversions
      ? "Marked conversion events are at or above the previous period."
      : "Marked conversion events decreased compared with the previous period.";
  }
  $kpi = function ($v, $ch) {
    return ["value" => (int) $v, "change" => $ch];
  };
  $zero = $kpi(0, 0);
  return [
    "source" => "website_events",
    "ga4_data_api" => false,
    "php" => true,
    "range" => ["since" => $since, "until" => $until],
    "kpis" => [
      "users" => $kpi($userN, pos_analytics_pct($userN, $prevUserN)),
      "new_users" => $kpi($userN, pos_analytics_pct($userN, $prevUserN)),
      "sessions" => $kpi($pageViews, pos_analytics_pct($pageViews, $prevPageViews)),
      "engaged_sessions" => $kpi($engN, 0),
      "engagement_rate" => $kpi($pageViews ? (int) round(($engN / max($pageViews, 1)) * 100) : 0, 0),
      "avg_engagement_time" => $zero,
      "page_views" => $kpi($pageViews, pos_analytics_pct($pageViews, $prevPageViews)),
      "events" => $kpi($events, pos_analytics_pct($events, $prevEvents)),
      "conversions" => $kpi($conversions, pos_analytics_pct($conversions, $prevConversions)),
      "leads" => $kpi($leads, 0),
    ],
    "acquisition" => $bySource,
    "devices" => $byDevice,
    "landing_pages" => $byPage,
    "categories" => $byCategory,
    "campaigns" => $byCampaign,
    "events_by_name" => $byEvent,
    "leads" => $leadsRows,
    "realtime" => ["active_users" => (int) ($active[0]["n"] ?? 0), "events" => $realtime],
    "ai_summary" => $lines,
    "note" => "Figures are first-party website events stored by ATAV POS. They are not Google Analytics Data API numbers. GA4 Measurement ID only loads gtag.js on the public site. Search Console rankings are not included.",
  ];
}

function pos_analytics_public_dispatch($path, $method, $body) {
  if ($path === "analytics/config" && $method === "GET") {
    $s = pos_analytics_settings();
    pos_send(200, [
      "measurement_id" => $s["connected"] ? $s["measurement_id"] : "",
      "google_tag_id" => $s["connected"] ? $s["google_tag_id"] : "",
      "consent_required" => $s["consent_required"],
      "connected" => $s["connected"],
      "php" => true,
    ]);
    return true;
  }
  if ($path === "analytics/event" && $method === "POST") {
    $name = trim((string) ($body["event_name"] ?? ""));
    if (!in_array($name, pos_ga4_events(), true)) pos_send(400, ["error" => "Unknown analytics event"]);
    $ua = (string) ($_SERVER["HTTP_USER_AGENT"] ?? "");
    $device = "desktop";
    if (preg_match("/tablet|ipad/i", $ua)) $device = "tablet";
    elseif (preg_match("/mobile|android|iphone/i", $ua)) $device = "mobile";
    $params = is_array($body["params"] ?? null) ? $body["params"] : [];
    foreach (["phone", "email", "name", "password", "mobile", "address"] as $pii) unset($params[$pii]);
    pos_ensure_analytics_schema();
    pos_q(
      "INSERT INTO website_analytics_events (
         id, occurred_at, event_name, page_path, page_title, business_category, page_type, cta_type,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content, device, referrer, session_id
       ) VALUES (?, CURRENT_TIMESTAMP(3), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      "sssssssssssssss",
      [
        pos_uuid(),
        $name,
        substr((string) ($body["page_path"] ?? ""), 0, 255),
        substr((string) ($body["page_title"] ?? ""), 0, 255),
        substr((string) ($params["business_category"] ?? $body["business_category"] ?? ""), 0, 64),
        substr((string) ($params["page_type"] ?? "landing_page"), 0, 64),
        substr((string) ($params["cta_type"] ?? ""), 0, 64),
        substr((string) ($params["utm_source"] ?? $body["utm_source"] ?? ""), 0, 64),
        substr((string) ($params["utm_medium"] ?? ""), 0, 64),
        substr((string) ($params["utm_campaign"] ?? ""), 0, 64),
        substr((string) ($params["utm_term"] ?? ""), 0, 64),
        substr((string) ($params["utm_content"] ?? ""), 0, 64),
        $device,
        substr((string) ($body["referrer"] ?? ""), 0, 255),
        substr((string) ($body["session_id"] ?? ""), 0, 64),
      ]
    );
    pos_send(200, ["ok" => true, "php" => true]);
    return true;
  }
  return false;
}

function pos_analytics_master_dispatch($path, $method, $body) {
  if ($path === "master/analytics/settings" && $method === "GET") {
    pos_send(200, array_merge(pos_analytics_settings(), ["php" => true]));
    return true;
  }
  if ($path === "master/analytics/settings" && $method === "POST") {
    $mid = strtoupper(trim((string) ($body["measurement_id"] ?? "")));
    if ($mid !== "" && !preg_match("/^G-[A-Z0-9]{4,20}$/", $mid)) {
      pos_send(400, ["error" => "Enter a GA4 Measurement ID like G-XXXXXXXXXX"]);
    }
    $connected = !empty($body["connected"]) && $mid !== "" ? 1 : 0;
    $consent = isset($body["consent_required"]) && !$body["consent_required"] ? 0 : 1;
    $conv = $body["conversion_events"] ?? ["get_started", "book_demo", "contact_submit", "phone_click", "email_click", "whatsapp_click"];
    if (!is_array($conv)) $conv = [];
    $conv = array_values(array_filter($conv, function ($n) {
      return in_array($n, pos_ga4_events(), true);
    }));
    pos_ensure_analytics_schema();
    pos_q(
      "INSERT INTO website_analytics_settings
         (id, measurement_id, google_tag_id, property_id, connected, consent_required, conversion_events, updated_at)
       VALUES ('platform', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE measurement_id=VALUES(measurement_id), google_tag_id=VALUES(google_tag_id),
         property_id=VALUES(property_id), connected=VALUES(connected), consent_required=VALUES(consent_required),
         conversion_events=VALUES(conversion_events), updated_at=CURRENT_TIMESTAMP(3)",
      "sssiss",
      [
        $mid,
        trim((string) ($body["google_tag_id"] ?? $mid)),
        preg_replace("/\D/", "", (string) ($body["property_id"] ?? "")),
        $connected,
        $consent,
        json_encode($conv),
      ]
    );
    pos_send(200, array_merge(pos_analytics_settings(), ["php" => true]));
    return true;
  }
  if ($path === "master/analytics/test" && $method === "POST") {
    $s = pos_analytics_settings();
    $id = trim((string) ($body["measurement_id"] ?? $s["measurement_id"]));
    if (!preg_match("/^G-[A-Z0-9]{4,20}$/i", $id)) pos_send(400, ["error" => "Measurement ID is not a valid G-XXXXXXXXXX value"]);
    pos_send(200, [
      "ok" => true,
      "tagging" => true,
      "data_api" => false,
      "message" => "Measurement ID is valid for gtag.js. GA4 Data API is not configured on PHP.",
      "php" => true,
    ]);
    return true;
  }
  if ($path === "master/analytics/overview" && $method === "GET") {
    $range = (string) ($_GET["range"] ?? "30d");
    $from = (string) ($_GET["from"] ?? "");
    $to = (string) ($_GET["to"] ?? "");
    pos_send(200, pos_analytics_summarize($range, $from, $to));
    return true;
  }
  if ($path === "master/analytics/alerts" && $method === "GET") {
    pos_ensure_analytics_schema();
    pos_send(200, pos_q("SELECT * FROM website_analytics_alerts ORDER BY name"));
    return true;
  }
  if ($path === "master/analytics/alerts" && $method === "POST") {
    pos_ensure_analytics_schema();
    $id = pos_uuid();
    pos_q(
      "INSERT INTO website_analytics_alerts (id, name, metric, condition_op, threshold, frequency, email_on, dashboard_on, status)
       VALUES (?,?,?,?,?,?,?,?,?)",
      "ssssdsiis",
      [
        $id,
        substr((string) ($body["name"] ?? "Alert"), 0, 128),
        substr((string) ($body["metric"] ?? "page_views"), 0, 64),
        substr((string) ($body["condition_op"] ?? "lt"), 0, 16),
        (float) ($body["threshold"] ?? 0),
        substr((string) ($body["frequency"] ?? "daily"), 0, 32),
        (!isset($body["email_on"]) || $body["email_on"]) ? 1 : 0,
        (!isset($body["dashboard_on"]) || $body["dashboard_on"]) ? 1 : 0,
        (($body["status"] ?? "") === "inactive") ? "inactive" : "active",
      ]
    );
    pos_send(200, ["ok" => true, "id" => $id, "php" => true]);
    return true;
  }
  if ($path === "master/analytics/export" && $method === "GET") {
    $data = pos_analytics_summarize((string) ($_GET["range"] ?? "30d"), (string) ($_GET["from"] ?? ""), (string) ($_GET["to"] ?? ""));
    $lines = ["metric,value,change_pct"];
    foreach ($data["kpis"] as $k => $v) {
      $lines[] = $k . "," . $v["value"] . "," . $v["change"];
    }
    pos_send(200, ["csv" => implode("\n", $lines), "note" => $data["note"], "php" => true]);
    return true;
  }
  return false;
}
