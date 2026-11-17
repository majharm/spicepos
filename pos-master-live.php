<?php

function pos_live_online_sql($alias = "") {
  $p = $alias !== "" ? "{$alias}." : "";
  return "{$p}revoked_at IS NULL AND {$p}expires_at > NOW() AND COALESCE({$p}last_seen_at, {$p}created_at) >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)";
}

function pos_insight_window($range) {
  $windows = [
    "today" => [
      "label" => "Today",
      "current" => "created_at >= CURDATE() AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)",
      "previous" => "created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND created_at < CURDATE()",
    ],
    "yesterday" => [
      "label" => "Yesterday",
      "current" => "created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND created_at < CURDATE()",
      "previous" => "created_at >= DATE_SUB(CURDATE(), INTERVAL 2 DAY) AND created_at < DATE_SUB(CURDATE(), INTERVAL 1 DAY)",
    ],
    "7" => [
      "label" => "Last 7 days",
      "current" => "created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)",
      "previous" => "created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY) AND created_at < DATE_SUB(CURDATE(), INTERVAL 6 DAY)",
    ],
    "30" => [
      "label" => "Last 30 days",
      "current" => "created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)",
      "previous" => "created_at >= DATE_SUB(CURDATE(), INTERVAL 59 DAY) AND created_at < DATE_SUB(CURDATE(), INTERVAL 29 DAY)",
    ],
    "month" => [
      "label" => "This month",
      "current" => "created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)",
      "previous" => "created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND created_at < DATE_FORMAT(CURDATE(), '%Y-%m-01')",
    ],
    "prev" => [
      "label" => "Last month",
      "current" => "created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND created_at < DATE_FORMAT(CURDATE(), '%Y-%m-01')",
      "previous" => "created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 2 MONTH), '%Y-%m-01') AND created_at < DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')",
    ],
  ];
  $key = isset($windows[$range]) ? (string) $range : "30";
  return ["key" => $key] + $windows[$key];
}

function pos_growth_pct($current, $previous) {
  $now = (float) $current;
  $prev = (float) $previous;
  if ($prev == 0.0) return $now == 0.0 ? 0 : null;
  return round((($now - $prev) / $prev) * 1000) / 10;
}

function pos_kpi_pair($value, $previous) {
  return [
    "value" => (float) $value,
    "previous" => (float) $previous,
    "growth" => pos_growth_pct($value, $previous),
  ];
}

function pos_client_device($ua) {
  $text = (string) $ua;
  $device = "—";
  if ($text !== "") $device = "Desktop";
  if (preg_match("/Mobile|Android|iPhone/i", $text)) $device = "Phone";
  if (preg_match("/iPad|Tablet/i", $text)) $device = "Tablet";
  $browser = "—";
  if (strpos($text, "Edg/") !== false) $browser = "Edge";
  elseif (strpos($text, "Chrome/") !== false || strpos($text, "CriOS/") !== false) $browser = "Chrome";
  elseif (strpos($text, "Firefox/") !== false) $browser = "Firefox";
  elseif (strpos($text, "Safari/") !== false) $browser = "Safari";
  return ["device" => $device, "browser" => $browser];
}

function pos_like_term($value) {
  return "%" . str_replace(["\\", "%", "_"], ["\\\\", "\\%", "\\_"], (string) $value) . "%";
}

function pos_live_scalar($sql) {
  $rows = pos_q($sql);
  return (int) ($rows[0]["n"] ?? 0);
}

function pos_live_sales_pair($where) {
  $rows = pos_q(
    "SELECT COALESCE(SUM(total), 0) AS sales, COUNT(*) AS bills FROM sales_orders
     WHERE {$where} AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'void')"
  );
  return ["sales" => (float) ($rows[0]["sales"] ?? 0), "bills" => (int) ($rows[0]["bills"] ?? 0)];
}

function pos_live_user_counts() {
  $online = pos_live_online_sql();
  $rows = pos_q(
    "SELECT
       (SELECT COUNT(*) FROM staff_users) AS registered,
       (SELECT COUNT(*) FROM staff_users WHERE status = 'active') AS active_accounts,
       (SELECT COUNT(*) FROM staff_users WHERE created_at >= CURDATE() AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)) AS new_today,
       (SELECT COUNT(*) FROM staff_sessions WHERE {$online}) AS sessions,
       (SELECT COUNT(DISTINCT staff_user_id) FROM staff_sessions WHERE {$online}) AS online,
       (SELECT COUNT(DISTINCT staff_user_id) FROM staff_sessions
         WHERE COALESCE(last_seen_at, created_at) >= CURDATE()
           AND COALESCE(last_seen_at, created_at) < DATE_ADD(CURDATE(), INTERVAL 1 DAY)) AS active_today"
  );
  $row = $rows[0] ?? [];
  $shops = pos_q("SELECT status, subscription_expires_at FROM businesses");
  $activeBusinesses = 0;
  foreach ($shops as $shop) {
    if (pos_public_status($shop) === "active") $activeBusinesses += 1;
  }
  $registered = (int) ($row["registered"] ?? 0);
  $onlineN = (int) ($row["online"] ?? 0);
  return [
    "registered" => $registered,
    "activeAccounts" => (int) ($row["active_accounts"] ?? 0),
    "online" => $onlineN,
    "offline" => max(0, $registered - $onlineN),
    "activeToday" => (int) ($row["active_today"] ?? 0),
    "newToday" => (int) ($row["new_today"] ?? 0),
    "sessions" => (int) ($row["sessions"] ?? 0),
    "activeBusinesses" => $activeBusinesses,
    "onlineWindowSeconds" => 300,
  ];
}

function pos_live_from_sql() {
  return "FROM staff_users u
    LEFT JOIN businesses b ON b.id = u.business_id
    LEFT JOIN subscription_plans p ON p.id = b.plan_id
    LEFT JOIN staff_sessions s ON s.id = (
      SELECT s2.id FROM staff_sessions s2
      WHERE s2.staff_user_id = u.id
      ORDER BY COALESCE(s2.last_seen_at, s2.created_at) DESC
      LIMIT 1
    )";
}

function pos_list_live_users($input) {
  pos_ensure_staff_session_columns();
  $q = substr(trim((string) ($input["q"] ?? "")), 0, 80);
  $presence = in_array($input["presence"] ?? "", ["online", "offline"], true) ? $input["presence"] : "all";
  $category = substr(trim((string) ($input["category"] ?? "")), 0, 80);
  $plan = substr(trim((string) ($input["plan"] ?? "")), 0, 64);
  $sort = (($input["sort"] ?? "") === "name") ? "name" : "activity";
  $pageSize = min(50, max(1, (int) ($input["pageSize"] ?? 20)));
  $page = max(1, (int) ($input["page"] ?? 1));
  $where = ["1=1"];
  $types = "";
  $params = [];
  if ($q !== "") {
    $where[] = "(u.email LIKE ? OR u.mobile LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.username LIKE ? OR b.name LIKE ? OR b.owner_name LIKE ?)";
    $like = pos_like_term($q);
    $types .= "sssssss";
    $params = array_merge($params, [$like, $like, $like, $like, $like, $like, $like]);
  }
  $online = pos_live_online_sql("s");
  if ($presence === "online") $where[] = $online;
  if ($presence === "offline") $where[] = "NOT ({$online})";
  if ($category !== "") {
    $where[] = "(b.business_type = ? OR b.category = ?)";
    $types .= "ss";
    $params[] = $category;
    $params[] = $category;
  }
  if ($plan !== "") {
    $where[] = "b.plan_id = ?";
    $types .= "s";
    $params[] = $plan;
  }
  $filter = implode(" AND ", $where);
  $from = pos_live_from_sql();
  $order = $sort === "name" ? "b.name ASC, u.email ASC" : "COALESCE(s.last_seen_at, s.created_at) DESC, u.email ASC";
  $count = pos_q("SELECT COUNT(*) AS n {$from} WHERE {$filter}", $types, $params);
  $total = (int) ($count[0]["n"] ?? 0);
  $pages = max(1, (int) ceil($total / $pageSize));
  $safePage = min($page, $pages);
  $offset = ($safePage - 1) * $pageSize;
  $rows = pos_q(
    "SELECT u.id, u.email, u.first_name, u.last_name, u.mobile, u.username, u.role, u.status AS account_status,
            b.name AS business_name, b.owner_name, b.mobile AS business_mobile, b.category, b.business_type,
            b.status AS business_status, b.subscription_expires_at, b.plan_id, p.name AS plan_name,
            s.id AS session_id, s.created_at AS last_login, s.last_seen_at, s.user_agent,
            CASE WHEN {$online} THEN 1 ELSE 0 END AS online
     {$from}
     WHERE {$filter}
     ORDER BY {$order}
     LIMIT {$pageSize} OFFSET {$offset}",
    $types,
    $params
  );
  $out = [];
  foreach ($rows as $row) {
    $client = pos_client_device($row["user_agent"] ?? "");
    $name = trim((string) (($row["first_name"] ?? "") . " " . ($row["last_name"] ?? "")));
    $onlineFlag = (int) ($row["online"] ?? 0) === 1;
    $out[] = [
      "id" => $row["id"],
      "name" => $name !== "" ? $name : ($row["username"] ?? $row["email"] ?? "Staff"),
      "businessName" => $row["business_name"] ?? "—",
      "ownerName" => $row["owner_name"] ?? "—",
      "mobile" => $row["mobile"] ?: ($row["business_mobile"] ?? ""),
      "email" => $row["email"] ?? "",
      "category" => $row["business_type"] ?: ($row["category"] ?: "Other"),
      "online" => $onlineFlag,
      "lastLogin" => $row["last_login"] ?? null,
      "lastActivity" => $row["last_seen_at"] ?: ($row["last_login"] ?? null),
      "device" => $client["device"],
      "browser" => $client["browser"],
      "plan" => $row["plan_name"] ?: ($row["plan_id"] ?: "—"),
      "accountStatus" => $row["account_status"] ?? "active",
      "businessStatus" => pos_public_status([
        "status" => $row["business_status"] ?? "",
        "subscription_expires_at" => $row["subscription_expires_at"] ?? "",
      ]),
      "role" => $row["role"] ?? "",
      "sessionId" => $onlineFlag ? ($row["session_id"] ?? null) : null,
    ];
  }
  $cats = [];
  foreach (pos_q("SELECT business_type, category FROM businesses") as $shop) {
    $label = trim((string) ($shop["business_type"] ?: ($shop["category"] ?? "")));
    if ($label !== "") $cats[$label] = true;
  }
  $labels = array_keys($cats);
  sort($labels);
  return [
    "counts" => pos_live_user_counts(),
    "page" => $safePage,
    "pageSize" => $pageSize,
    "total" => $total,
    "pages" => $pages,
    "filters" => [
      "categories" => $labels,
      "plans" => pos_q("SELECT id, name FROM subscription_plans ORDER BY name"),
    ],
    "rows" => $out,
  ];
}

function pos_live_user_sessions($userId) {
  $users = pos_q(
    "SELECT u.id, u.email, u.first_name, u.last_name, u.mobile, b.name AS business_name
     FROM staff_users u LEFT JOIN businesses b ON b.id = u.business_id
     WHERE u.id = ? LIMIT 1",
    "s",
    [$userId]
  );
  if (!$users) return null;
  $user = $users[0];
  $rows = pos_q(
    "SELECT id, created_at, last_seen_at, expires_at, revoked_at, user_agent, ip
     FROM staff_sessions WHERE staff_user_id = ? ORDER BY created_at DESC LIMIT 30",
    "s",
    [$userId]
  );
  $sessions = [];
  foreach ($rows as $row) {
    $client = pos_client_device($row["user_agent"] ?? "");
    $seen = strtotime((string) ($row["last_seen_at"] ?? "")) ?: 0;
    $online = empty($row["revoked_at"]) && strtotime((string) $row["expires_at"]) > time() && $seen >= time() - 300;
    $sessions[] = [
      "id" => $row["id"],
      "started" => $row["created_at"],
      "lastActivity" => $row["last_seen_at"] ?? null,
      "expires" => $row["expires_at"],
      "ended" => $row["revoked_at"] ?? null,
      "device" => $client["device"],
      "browser" => $client["browser"],
      "ip" => $row["ip"] ?? "",
      "online" => $online,
    ];
  }
  $name = trim((string) (($user["first_name"] ?? "") . " " . ($user["last_name"] ?? "")));
  return [
    "user" => [
      "id" => $user["id"],
      "email" => $user["email"] ?? "",
      "name" => $name !== "" ? $name : ($user["email"] ?? "Staff"),
      "mobile" => $user["mobile"] ?? "",
      "businessName" => $user["business_name"] ?? "—",
    ],
    "sessions" => $sessions,
  ];
}

function pos_master_insights($range) {
  pos_ensure_staff_session_columns();
  $window = pos_insight_window((string) $range);
  $today = pos_insight_window("today");
  $month = pos_insight_window("month");
  $shops = pos_q("SELECT id, name, status, subscription_expires_at, plan_id, fee_monthly, business_type, category, created_at FROM businesses");
  $rangeSales = pos_live_sales_pair($window["current"]);
  $prevSales = pos_live_sales_pair($window["previous"]);
  $todaySales = pos_live_sales_pair($today["current"]);
  $yesterdaySales = pos_live_sales_pair($today["previous"]);
  $monthSales = pos_live_sales_pair($month["current"]);
  $prevMonthSales = pos_live_sales_pair($month["previous"]);
  $counts = pos_live_user_counts();
  $buckets = ["active" => 0, "expired" => 0, "trial" => 0, "suspended" => 0, "inactive" => 0];
  $categories = [];
  $arr = 0.0;
  $trial = 0;
  foreach ($shops as $shop) {
    $status = pos_public_status($shop);
    if (isset($buckets[$status]) && $status !== "trial") $buckets[$status] += 1;
    else $buckets["inactive"] += 1;
    if (($shop["plan_id"] ?? "") === "trial") {
      $buckets["trial"] += 1;
      $trial += 1;
    }
    if ($status === "active") $arr += (float) ($shop["fee_monthly"] ?? 0);
    $label = trim((string) ($shop["business_type"] ?: ($shop["category"] ?? "")));
    if ($label === "") $label = "Other";
    $categories[$label] = ($categories[$label] ?? 0) + 1;
  }
  $series = pos_q(
    "SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COALESCE(SUM(total), 0) AS sales, COUNT(*) AS bills
     FROM sales_orders
     WHERE {$window["current"]} AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'void')
     GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
     ORDER BY day
     LIMIT 120"
  );
  $points = [];
  foreach ($series as $row) {
    $points[] = ["day" => $row["day"], "sales" => (float) $row["sales"], "bills" => (int) $row["bills"]];
  }
  $catRows = [];
  foreach ($categories as $label => $n) $catRows[] = ["label" => $label, "n" => $n];
  usort($catRows, function ($a, $b) { return $b["n"] <=> $a["n"]; });
  $renewals = pos_q(
    "SELECT id, name, subscription_expires_at FROM businesses
     WHERE subscription_expires_at >= CURDATE() AND subscription_expires_at < DATE_ADD(CURDATE(), INTERVAL 14 DAY)
     ORDER BY subscription_expires_at, name LIMIT 20"
  );
  $newToday = pos_q(
    "SELECT id, name, created_at FROM businesses
     WHERE created_at >= CURDATE() AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
     ORDER BY created_at DESC LIMIT 10"
  );
  $notices = [];
  foreach ($newToday as $shop) {
    $notices[] = ["id" => "biz-" . $shop["id"], "kind" => "business", "title" => "New business", "body" => $shop["name"], "at" => $shop["created_at"]];
  }
  $renewalRows = [];
  foreach ($renewals as $shop) {
    $expires = substr((string) $shop["subscription_expires_at"], 0, 10);
    $renewalRows[] = ["id" => $shop["id"], "name" => $shop["name"], "expires" => $expires];
    $notices[] = ["id" => "renew-" . $shop["id"], "kind" => "renewal", "title" => "Renewal due", "body" => $shop["name"] . " · " . $expires, "at" => $shop["subscription_expires_at"]];
  }
  $expiredShown = 0;
  foreach ($shops as $shop) {
    if (pos_public_status($shop) !== "expired" || $expiredShown >= 8) continue;
    $expiredShown += 1;
    $notices[] = ["id" => "expired-" . $shop["id"], "kind" => "expired", "title" => "Subscription expired", "body" => $shop["name"], "at" => $shop["subscription_expires_at"] ?? ""];
  }
  return [
    "range" => ["key" => $window["key"], "label" => $window["label"]],
    "onlineWindowSeconds" => 300,
    "kpis" => [
      "businesses" => ["value" => count($shops), "previous" => null, "growth" => null],
      "users" => ["value" => $counts["registered"], "previous" => null, "growth" => null],
      "activeUsers" => ["value" => $counts["activeAccounts"], "previous" => null, "growth" => null],
      "online" => ["value" => $counts["online"], "previous" => null, "growth" => null],
      "offline" => ["value" => $counts["offline"], "previous" => null, "growth" => null],
      "activeToday" => ["value" => $counts["activeToday"], "previous" => null, "growth" => null],
      "sessions" => ["value" => $counts["sessions"], "previous" => null, "growth" => null],
      "newUsers" => pos_kpi_pair(pos_live_scalar("SELECT COUNT(*) AS n FROM staff_users WHERE {$window["current"]}"), pos_live_scalar("SELECT COUNT(*) AS n FROM staff_users WHERE {$window["previous"]}")),
      "newBusinesses" => pos_kpi_pair(pos_live_scalar("SELECT COUNT(*) AS n FROM businesses WHERE {$window["current"]}"), pos_live_scalar("SELECT COUNT(*) AS n FROM businesses WHERE {$window["previous"]}")),
      "activeSubscriptions" => ["value" => $buckets["active"], "previous" => null, "growth" => null],
      "expiredSubscriptions" => ["value" => $buckets["expired"], "previous" => null, "growth" => null],
      "trial" => ["value" => $trial, "previous" => null, "growth" => null],
      "arr" => ["value" => round($arr, 2), "previous" => null, "growth" => null],
      "mrr" => ["value" => round($arr / 12, 2), "previous" => null, "growth" => null],
      "todaySales" => pos_kpi_pair($todaySales["sales"], $yesterdaySales["sales"]),
      "rangeSales" => pos_kpi_pair($rangeSales["sales"], $prevSales["sales"]),
      "monthSales" => pos_kpi_pair($monthSales["sales"], $prevMonthSales["sales"]),
      "invoices" => pos_kpi_pair($rangeSales["bills"], $prevSales["bills"]),
    ],
    "feeNote" => "Plan fees are the yearly amount stored on each active shop. MRR is that yearly fee divided by 12. Card-gateway collections are not stored.",
    "series" => $points,
    "categories" => $catRows,
    "subscriptions" => $buckets,
    "renewals" => $renewalRows,
    "notices" => $notices,
    "failedPayments" => null,
    "failedPaymentsNote" => "No card-gateway failure ledger is stored. Unpaid bills stay on each shop's accounts screen.",
  ];
}

function pos_application_load() {
  if (function_exists("sys_getloadavg")) {
    $load = @sys_getloadavg();
    if (is_array($load) && isset($load[0])) return $load;
  }
  $raw = @file_get_contents("/proc/loadavg");
  if (is_string($raw) && preg_match("/^([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)/", $raw, $m)) {
    return [(float) $m[1], (float) $m[2], (float) $m[3]];
  }
  return null;
}

function pos_master_health() {
  $started = microtime(true);
  pos_q("SELECT 1 AS ok");
  $load = pos_application_load();
  $one = is_array($load) ? ($load[0] ?? null) : null;
  return [
    "ok" => true,
    "database" => "connected",
    "dbMs" => (int) round((microtime(true) - $started) * 1000),
    "uptimeSeconds" => null,
    "memoryRss" => memory_get_usage(true),
    "loadAvg" => $one,
    "load1" => $one,
    "load5" => is_array($load) ? ($load[1] ?? null) : null,
    "load15" => is_array($load) ? ($load[2] ?? null) : null,
    "php" => true,
    "note" => "Application load is the 1, 5, and 15 minute average. Memory is this PHP request.",
  ];
}

function pos_businesses_csv($rows) {
  $handle = fopen("php://temp", "r+");
  fwrite($handle, "\xEF\xBB\xBF");
  fputcsv($handle, ["id", "name", "owner", "mobile", "email", "type", "category", "status", "plan", "yearly_fee", "expires", "city", "state", "created"]);
  foreach ($rows as $row) {
    fputcsv($handle, [
      $row["id"] ?? "",
      $row["name"] ?? "",
      $row["owner_name"] ?? "",
      $row["mobile"] ?? "",
      $row["email"] ?? "",
      $row["business_type"] ?? "",
      $row["category"] ?? "",
      $row["computed_status"] ?? ($row["status"] ?? ""),
      $row["plan_name"] ?? ($row["plan_id"] ?? ""),
      $row["fee_monthly"] ?? "",
      substr((string) ($row["subscription_expires_at"] ?? ""), 0, 10),
      $row["city"] ?? "",
      $row["state"] ?? "",
      substr((string) ($row["created_at"] ?? ""), 0, 19),
    ]);
  }
  rewind($handle);
  $csv = stream_get_contents($handle);
  fclose($handle);
  return $csv;
}

function pos_ip_is_private($ip) {
  $ip = strtolower(trim((string) $ip));
  if ($ip === "" || $ip === "localhost" || $ip === "0.0.0.0" || $ip === "::1" || $ip === "::") return true;
  if (str_starts_with($ip, "::ffff:")) $ip = substr($ip, 7);
  $zone = strpos($ip, "%");
  if ($zone !== false) $ip = substr($ip, 0, $zone);
  if (str_contains($ip, ":") && !str_contains($ip, ".")) {
    return str_starts_with($ip, "fe80") || str_starts_with($ip, "fc") || str_starts_with($ip, "fd");
  }
  if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) return true;
  if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return true;
  $parts = array_map("intval", explode(".", $ip));
  if ($parts[0] === 100 && $parts[1] >= 64 && $parts[1] <= 127) return true;
  return false;
}

function pos_ip_map_empty() {
  return [
    "places" => [],
    "countries" => [],
    "totals" => ["ips" => 0, "views" => 0, "sessions" => 0, "online" => 0, "countries" => 0, "mapped" => 0],
    "windowDays" => 14,
    "traffic" => "website",
    "note" => "Website page views from the last 14 days. Locations are estimated from the visitor IP. Private networks stay off the map.",
  ];
}

function pos_ip_geo_http($ip) {
  $url = "https://ipwho.is/" . rawurlencode($ip);
  if (function_exists("curl_init")) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT => 3,
      CURLOPT_CONNECTTIMEOUT => 2,
      CURLOPT_FOLLOWLOCATION => false,
      CURLOPT_HTTPHEADER => ["Accept: application/json"],
    ]);
    $raw = curl_exec($ch);
    curl_close($ch);
    return is_string($raw) ? $raw : "";
  }
  $ctx = stream_context_create(["http" => ["timeout" => 3, "header" => "Accept: application/json\r\n"], "https" => ["timeout" => 3]]);
  $raw = @file_get_contents($url, false, $ctx);
  return is_string($raw) ? $raw : "";
}

function pos_ip_geo_lookup($ip) {
  $data = json_decode(pos_ip_geo_http($ip), true);
  if (!is_array($data) || (isset($data["success"]) && $data["success"] === false)) return null;
  $lat = isset($data["latitude"]) ? (float) $data["latitude"] : null;
  $lon = isset($data["longitude"]) ? (float) $data["longitude"] : null;
  if ($lat === null || $lon === null || $lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) return null;
  return [
    "lat" => round($lat, 5),
    "lon" => round($lon, 5),
    "country" => substr((string) ($data["country"] ?? ""), 0, 80),
    "countryCode" => substr((string) ($data["country_code"] ?? ""), 0, 8),
    "region" => substr((string) ($data["region"] ?? ""), 0, 80),
    "city" => substr((string) ($data["city"] ?? ""), 0, 80),
  ];
}

function pos_ip_geo_save($ip, $hit) {
  $hit = is_array($hit) ? $hit : [];
  pos_q(
    "INSERT INTO ip_geo_cache (ip, country, country_code, region, city, lat, lon, ok, looked_up_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE country=VALUES(country), country_code=VALUES(country_code), region=VALUES(region), city=VALUES(city), lat=VALUES(lat), lon=VALUES(lon), ok=VALUES(ok), looked_up_at=NOW()",
    "sssssddi",
    [
      $ip,
      $hit["country"] ?? "",
      $hit["countryCode"] ?? "",
      $hit["region"] ?? "",
      $hit["city"] ?? "",
      isset($hit["lat"]) ? (float) $hit["lat"] : 0,
      isset($hit["lon"]) ? (float) $hit["lon"] : 0,
      isset($hit["lat"]) ? 1 : 0,
    ]
  );
}

function pos_master_ip_map() {
  try {
    if (!function_exists("pos_ensure_analytics_schema")) {
      require_once __DIR__ . "/pos-analytics.php";
    }
    pos_ensure_analytics_schema();
    pos_q(
      "CREATE TABLE IF NOT EXISTS ip_geo_cache (
        ip VARCHAR(64) NOT NULL PRIMARY KEY,
        country VARCHAR(80) NULL,
        country_code VARCHAR(8) NULL,
        region VARCHAR(80) NULL,
        city VARCHAR(80) NULL,
        lat DECIMAL(9,5) NULL,
        lon DECIMAL(9,5) NULL,
        ok TINYINT NOT NULL DEFAULT 0,
        looked_up_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_ip_geo_lookup (looked_up_at)
      )"
    );
    $rows = pos_q(
      "SELECT ip, session_id, page_path, occurred_at
       FROM website_analytics_events
       WHERE event_name = 'page_view'
         AND ip IS NOT NULL AND ip <> ''
         AND occurred_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
       ORDER BY occurred_at DESC
       LIMIT 800"
    );
  } catch (Exception $e) {
    return pos_ip_map_empty();
  }
  $grouped = [];
  $now = time();
  foreach ($rows as $row) {
    $ip = substr(trim((string) ($row["ip"] ?? "")), 0, 64);
    if ($ip === "") continue;
    if (!isset($grouped[$ip])) {
      $grouped[$ip] = [
        "ip" => $ip,
        "views" => 0,
        "sessions" => 0,
        "online" => 0,
        "businesses" => [],
        "sessionIds" => [],
        "lastSeen" => null,
        "lastMs" => 0,
        "local" => pos_ip_is_private($ip),
      ];
    }
    $place = &$grouped[$ip];
    $place["views"] += 1;
    $session = trim((string) ($row["session_id"] ?? ""));
    if ($session !== "" && !in_array($session, $place["sessionIds"], true)) $place["sessionIds"][] = $session;
    $seen = (string) ($row["occurred_at"] ?? "");
    $seenMs = $seen !== "" ? strtotime($seen) : 0;
    if ($seenMs && $seenMs >= $place["lastMs"]) {
      $place["lastMs"] = $seenMs;
      $place["lastSeen"] = $seen;
    }
    if ($seenMs && ($now - $seenMs) <= 300 && ($now - $seenMs) >= 0) $place["online"] = 1;
    $page = trim((string) ($row["page_path"] ?? ""));
    if ($page !== "" && !in_array($page, $place["businesses"], true) && count($place["businesses"]) < 4) {
      $place["businesses"][] = $page;
    }
    unset($place);
  }
  $places = array_values($grouped);
  foreach ($places as &$place) {
    $place["sessions"] = count($place["sessionIds"]) ?: (int) $place["views"];
    unset($place["sessionIds"]);
  }
  unset($place);
  usort($places, function ($a, $b) {
    if ($a["views"] !== $b["views"]) return $b["views"] <=> $a["views"];
    if ($a["online"] !== $b["online"]) return $b["online"] <=> $a["online"];
    return strcmp((string) $b["lastSeen"], (string) $a["lastSeen"]);
  });
  $public = [];
  foreach ($places as $place) {
    if (!$place["local"]) $public[] = $place["ip"];
  }
  $fresh = [];
  if ($public) {
    $marks = implode(",", array_fill(0, count($public), "?"));
    try {
      $cached = pos_q(
        "SELECT ip, country, country_code, region, city, lat, lon, ok, looked_up_at FROM ip_geo_cache WHERE ip IN ($marks)",
        str_repeat("s", count($public)),
        $public
      );
    } catch (Exception $e) {
      $cached = [];
    }
    foreach ($cached as $row) {
      $age = $now - (strtotime((string) ($row["looked_up_at"] ?? "")) ?: 0);
      $keep = ((int) $row["ok"] === 1 && $age < 30 * 86400) || ((int) $row["ok"] !== 1 && $age < 86400);
      if ($keep) $fresh[(string) $row["ip"]] = $row;
    }
  }
  $lookups = 0;
  foreach ($places as &$place) {
    unset($place["lastMs"]);
    if ($place["local"]) continue;
    $row = $fresh[$place["ip"]] ?? null;
    if ($row) {
      if ((int) $row["ok"] === 1) {
        $place["lat"] = (float) $row["lat"];
        $place["lon"] = (float) $row["lon"];
        $place["country"] = (string) ($row["country"] ?? "");
        $place["countryCode"] = (string) ($row["country_code"] ?? "");
        $place["region"] = (string) ($row["region"] ?? "");
        $place["city"] = (string) ($row["city"] ?? "");
      }
      continue;
    }
    if ($lookups >= 12) continue;
    $lookups += 1;
    $hit = pos_ip_geo_lookup($place["ip"]);
    try {
      pos_ip_geo_save($place["ip"], $hit);
    } catch (Exception $e) {
    }
    if ($hit) {
      $place["lat"] = $hit["lat"];
      $place["lon"] = $hit["lon"];
      $place["country"] = $hit["country"];
      $place["countryCode"] = $hit["countryCode"];
      $place["region"] = $hit["region"];
      $place["city"] = $hit["city"];
    }
  }
  unset($place);
  $countries = [];
  foreach ($places as $place) {
    $name = !empty($place["local"]) ? "Private network" : (trim((string) ($place["country"] ?? "")) ?: "Unmapped");
    if (!isset($countries[$name])) $countries[$name] = ["country" => $name, "sessions" => 0, "views" => 0, "ips" => 0, "online" => 0];
    $countries[$name]["sessions"] += (int) $place["sessions"];
    $countries[$name]["views"] += (int) ($place["views"] ?? 0);
    $countries[$name]["ips"] += 1;
    $countries[$name]["online"] += (int) $place["online"];
  }
  $countryRows = array_values($countries);
  usort($countryRows, function ($a, $b) {
    $av = (int) ($a["views"] ?? 0) ?: (int) $a["sessions"];
    $bv = (int) ($b["views"] ?? 0) ?: (int) $b["sessions"];
    if ($av !== $bv) return $bv <=> $av;
    return strcmp($a["country"], $b["country"]);
  });
  $mapped = 0;
  $sessions = 0;
  $views = 0;
  $online = 0;
  $named = [];
  foreach ($places as $place) {
    $sessions += (int) $place["sessions"];
    $views += (int) ($place["views"] ?? 0);
    $online += (int) $place["online"];
    if (empty($place["local"]) && isset($place["lat"]) && isset($place["lon"])) {
      $mapped += 1;
      if (!empty($place["country"])) $named[$place["country"]] = true;
    }
  }
  return [
    "places" => $places,
    "countries" => $countryRows,
    "totals" => [
      "ips" => count($places),
      "views" => $views,
      "sessions" => $sessions,
      "online" => $online,
      "countries" => count($named),
      "mapped" => $mapped,
    ],
    "windowDays" => 14,
    "traffic" => "website",
    "note" => "Website page views from the last 14 days. Locations are estimated from the visitor IP. Private networks stay off the map.",
  ];
}

function pos_master_biz_traffic() {
  $empty = [
    "businesses" => [],
    "summary" => ["total" => 0, "online" => 0, "recent" => 0, "offline" => 0, "activeToday" => 0, "plotted" => 0],
    "pollSeconds" => 30,
    "note" => "Each phone, tablet, and computer keeps its own pin. A pin is that device's location when the admin allows it. Otherwise it is estimated from the IP address and is not an exact street address. A login by itself does not mark a business online.",
  ];
  try {
    pos_ensure_business_presence();
    pos_q(
      "CREATE TABLE IF NOT EXISTS ip_geo_cache (
        ip VARCHAR(64) NOT NULL PRIMARY KEY,
        country VARCHAR(80) NULL,
        country_code VARCHAR(8) NULL,
        region VARCHAR(80) NULL,
        city VARCHAR(80) NULL,
        lat DECIMAL(9,5) NULL,
        lon DECIMAL(9,5) NULL,
        ok TINYINT NOT NULL DEFAULT 0,
        looked_up_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_ip_geo_lookup (looked_up_at)
      )"
    );
    $rows = pos_q(
      "SELECT u.id AS admin_id, b.id AS business_id, b.name AS business_name, b.owner_name,
              COALESCE(NULLIF(TRIM(b.business_type), ''), NULLIF(TRIM(b.category), ''), 'Other') AS category,
              COALESCE(b.city, '') AS shop_city, COALESCE(b.state, '') AS shop_state,
              COALESCE(NULLIF(p.ip, ''), s.ip, '') AS ip,
              COALESCE(p.login_at, s.created_at) AS login_at,
              p.heartbeat_at, p.logout_at,
              p.country, p.region, p.city, p.lat, p.lon, p.location_source, p.accuracy_m,
              COALESCE(p.device_id, '') AS device_id, COALESCE(p.device_label, '') AS device_label,
              CASE
                WHEN p.heartbeat_at IS NOT NULL
                  AND p.heartbeat_at >= DATE_SUB(NOW(), INTERVAL 90 SECOND)
                  AND (p.logout_at IS NULL OR p.logout_at < p.heartbeat_at)
                THEN 'online'
                WHEN (p.heartbeat_at IS NOT NULL AND p.heartbeat_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE))
                  OR (p.logout_at IS NOT NULL AND p.logout_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE))
                THEN 'recent'
                ELSE 'offline'
              END AS status,
              CASE
                WHEN p.heartbeat_at >= CURDATE() AND p.heartbeat_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN 1
                ELSE 0
              END AS active_today
       FROM staff_users u
       JOIN businesses b ON b.id = u.business_id
       LEFT JOIN business_admin_presence p ON p.staff_user_id = u.id
       LEFT JOIN staff_sessions s ON s.staff_user_id = u.id AND s.created_at = (
         SELECT MAX(s2.created_at) FROM staff_sessions s2 WHERE s2.staff_user_id = u.id
       )
       WHERE u.role IN ('business_admin', 'resort_owner') AND u.status = 'active'"
    );
    $best = [];
    $rank = ["offline" => 1, "recent" => 2, "online" => 3];
    foreach ($rows as $row) {
      $id = (string) $row["business_id"];
      $deviceId = (string) ($row["device_id"] ?? "");
      $key = $deviceId !== "" ? $id . "\n" . $deviceId : $id;
      $status = (string) ($row["status"] ?? "offline");
      $lat = isset($row["lat"]) ? (float) $row["lat"] : 0;
      $lon = isset($row["lon"]) ? (float) $row["lon"] : 0;
      $ip = (string) ($row["ip"] ?? "");
      $local = pos_ip_is_private($ip);
      $device = (string) ($row["location_source"] ?? "") === "device";
      $plotted = ($device || !$local) && $lat !== 0.0 && $lon !== 0.0 && abs($lat) <= 90 && abs($lon) <= 180;
      $item = [
        "businessId" => $id,
        "businessName" => $row["business_name"] ?: "Business",
        "ownerName" => $row["owner_name"] ?: "—",
        "category" => $row["category"] ?: "Other",
        "ip" => $ip,
        "loginAt" => $row["login_at"] ?? null,
        "lastActive" => $row["heartbeat_at"] ?? null,
        "logoutAt" => $row["logout_at"] ?? null,
        "country" => $row["country"] ?? "",
        "region" => $row["region"] ?? "",
        "city" => $row["city"] ?? "",
        "shopCity" => $row["shop_city"] ?? "",
        "shopState" => $row["shop_state"] ?? "",
        "lat" => $plotted ? $lat : null,
        "lon" => $plotted ? $lon : null,
        "locationSource" => $device ? "device" : "",
        "accuracy" => isset($row["accuracy_m"]) ? (int) $row["accuracy_m"] : null,
        "deviceId" => $deviceId,
        "deviceLabel" => (string) ($row["device_label"] ?? ""),
        "status" => $status,
        "activeToday" => (int) ($row["active_today"] ?? 0) === 1,
        "local" => $local,
        "plotted" => $plotted,
      ];
      if (!isset($best[$key]) || ($rank[$status] ?? 0) > ($rank[$best[$key]["status"]] ?? 0)) {
        if (isset($best[$key]) && !empty($best[$key]["activeToday"])) $item["activeToday"] = true;
        $best[$key] = $item;
      } elseif (!empty($item["activeToday"])) {
        $best[$key]["activeToday"] = true;
      }
    }
    $lookups = 0;
    foreach ($best as $id => $item) {
      if ($item["plotted"] || $item["local"] || $item["ip"] === "" || $lookups >= 12) continue;
      $cached = pos_q(
        "SELECT country, region, city, lat, lon, ok, looked_up_at FROM ip_geo_cache WHERE ip = ? LIMIT 1",
        "s",
        [$item["ip"]]
      );
      $hit = null;
      $row = $cached[0] ?? null;
      $fresh = false;
      if ($row) {
        $age = time() - (strtotime((string) ($row["looked_up_at"] ?? "")) ?: 0);
        $fresh = ((int) $row["ok"] === 1 && $age < 30 * 86400) || ((int) $row["ok"] !== 1 && $age < 86400);
        if ($fresh && (int) $row["ok"] === 1) {
          $hit = ["country" => $row["country"], "region" => $row["region"], "city" => $row["city"], "lat" => (float) $row["lat"], "lon" => (float) $row["lon"]];
        }
      }
      if (!$fresh) {
        $lookups += 1;
        $found = pos_ip_geo_lookup($item["ip"]);
        pos_ip_geo_save($item["ip"], $found);
        if ($found) $hit = $found;
      }
      if (!$hit) continue;
      $best[$id]["country"] = $hit["country"] ?? "";
      $best[$id]["region"] = $hit["region"] ?? "";
      $best[$id]["city"] = $hit["city"] ?? "";
      $best[$id]["lat"] = $hit["lat"];
      $best[$id]["lon"] = $hit["lon"];
      $best[$id]["plotted"] = true;
      try {
        pos_q(
          "UPDATE business_admin_presence SET country = ?, region = ?, city = ?, lat = ?, lon = ? WHERE ip = ? AND IFNULL(location_source, '') <> 'device' AND (lat IS NULL OR lat = 0)",
          "sssdds",
          [$hit["country"] ?? "", $hit["region"] ?? "", $hit["city"] ?? "", (float) $hit["lat"], (float) $hit["lon"], $item["ip"]]
        );
      } catch (Exception $e) { /* cache still serves the next poll */ }
    }
    $businesses = array_values($best);
    usort($businesses, function ($a, $b) use ($rank) {
      $diff = ($rank[$b["status"]] ?? 0) - ($rank[$a["status"]] ?? 0);
      if ($diff !== 0) return $diff;
      return strcmp($a["businessName"], $b["businessName"]);
    });
    $summary = ["total" => count($businesses), "online" => 0, "recent" => 0, "offline" => 0, "activeToday" => 0, "plotted" => 0];
    foreach ($businesses as $item) {
      $summary[$item["status"]] = ($summary[$item["status"]] ?? 0) + 1;
      if (!empty($item["activeToday"])) $summary["activeToday"] += 1;
      if (!empty($item["plotted"])) $summary["plotted"] += 1;
    }
    return [
      "businesses" => $businesses,
      "summary" => $summary,
      "pollSeconds" => 30,
      "note" => $empty["note"],
    ];
  } catch (Exception $e) {
    return $empty;
  }
}

function pos_ensure_sync_status() {
  static $ready = false;
  if ($ready) return;
  pos_q("CREATE TABLE IF NOT EXISTS device_sync_status (
    device_id VARCHAR(64) NOT NULL PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    device_label VARCHAR(40) NULL,
    pending_count INT NOT NULL DEFAULT 0,
    conflict_count INT NOT NULL DEFAULT 0,
    last_sync_at DATETIME NULL,
    last_error VARCHAR(255) NULL,
    reported_at DATETIME NOT NULL,
    KEY idx_sync_business (business_id)
  )");
  $ready = true;
}

function pos_report_sync_status($staff, $body) {
  $device = trim((string) ($body["deviceId"] ?? ($body["device_id"] ?? "")));
  if (!preg_match('/^[A-Za-z0-9_-]{8,64}$/', $device)) return ["ok" => false, "error" => "Device id required"];
  $business = (string) ($staff["user"]["business_id"] ?? ($staff["business_id"] ?? ""));
  if ($business === "") return ["ok" => false, "error" => "Shop sign in required"];
  pos_ensure_sync_status();
  $pending = max(0, min(100000, (int) ($body["pending"] ?? 0)));
  $conflicts = max(0, min(100000, (int) ($body["conflicts"] ?? 0)));
  $label = substr(trim(preg_replace('/\s+/', ' ', (string) ($body["deviceLabel"] ?? ""))), 0, 40);
  $error = substr(trim((string) ($body["lastError"] ?? "")), 0, 255);
  $last = "";
  $raw = (string) ($body["lastSyncAt"] ?? "");
  if ($raw !== "") {
    $stamp = strtotime($raw);
    if ($stamp) $last = gmdate("Y-m-d H:i:s", $stamp);
  }
  pos_q(
    "INSERT INTO device_sync_status
       (device_id, business_id, device_label, pending_count, conflict_count, last_sync_at, last_error, reported_at)
     VALUES (?,?,?,?,?,NULLIF(?, ''),NULLIF(?, ''),NOW())
     ON DUPLICATE KEY UPDATE
       business_id = VALUES(business_id),
       device_label = VALUES(device_label),
       pending_count = VALUES(pending_count),
       conflict_count = VALUES(conflict_count),
       last_sync_at = VALUES(last_sync_at),
       last_error = VALUES(last_error),
       reported_at = NOW()",
    "sssiiss",
    [$device, $business, $label, $pending, $conflicts, $last, $error]
  );
  return ["ok" => true];
}

function pos_master_sync_status() {
  pos_ensure_sync_status();
  $businesses = pos_q("SELECT id, name FROM businesses ORDER BY name");
  $devices = pos_q("SELECT * FROM device_sync_status");
  $rows = [];
  foreach ($businesses as $business) {
    $mine = array_values(array_filter($devices, function ($row) use ($business) {
      return ($row["business_id"] ?? "") === ($business["id"] ?? "");
    }));
    $pending = 0;
    $conflicts = 0;
    $reported = "";
    $lastError = "";
    foreach ($mine as $row) {
      $pending += (int) ($row["pending_count"] ?? 0);
      $conflicts += (int) ($row["conflict_count"] ?? 0);
      $at = (string) ($row["reported_at"] ?? "");
      if ($at > $reported) $reported = $at;
      if ($lastError === "" && trim((string) ($row["last_error"] ?? "")) !== "") $lastError = (string) $row["last_error"];
    }
    $rows[] = [
      "id" => $business["id"],
      "name" => $business["name"] ?? "Shop",
      "devices" => count($mine),
      "pending" => $pending,
      "conflicts" => $conflicts,
      "lastError" => $lastError,
      "reportedAt" => $reported !== "" ? $reported : null,
    ];
  }
  usort($rows, function ($a, $b) {
    $score = ($b["pending"] + $b["conflicts"]) - ($a["pending"] + $a["conflicts"]);
    if ($score !== 0) return $score;
    return strcmp((string) $a["name"], (string) $b["name"]);
  });
  return [
    "note" => "Bills, payments, and stock are saved on each device first. Waiting is the count still on that device. Conflicts need a person to look.",
    "businesses" => $rows,
  ];
}

function pos_master_live_dispatch($path, $method, $auth) {
  if ($path === "master/ip-map" && $method === "GET") {
    pos_send(200, pos_master_ip_map());
  }
  if ($path === "master/biz-traffic" && $method === "GET") {
    pos_send(200, pos_master_biz_traffic());
  }
  if ($path === "master/sync-status" && $method === "GET") {
    pos_send(200, pos_master_sync_status());
  }
  if ($path === "master/insights" && $method === "GET") {
    pos_send(200, pos_master_insights($_GET["range"] ?? "30"));
  }
  if ($path === "master/health" && $method === "GET") {
    pos_send(200, pos_master_health());
  }
  if ($path === "master/live-users" && $method === "GET") {
    pos_send(200, pos_list_live_users($_GET));
  }
  if (preg_match("#^master/live-users/([^/]+)$#", $path, $m) && $method === "GET") {
    $detail = pos_live_user_sessions($m[1]);
    if (!$detail) pos_send(404, ["error" => "User not found"]);
    pos_send(200, $detail);
  }
  if (preg_match("#^master/sessions/([^/]+)/revoke$#", $path, $m) && $method === "POST") {
    $rows = pos_q(
      "SELECT s.id, s.staff_user_id, u.email FROM staff_sessions s
       LEFT JOIN staff_users u ON u.id = s.staff_user_id WHERE s.id = ? LIMIT 1",
      "s",
      [$m[1]]
    );
    if (!$rows) pos_send(404, ["error" => "Session not found"]);
    pos_q("UPDATE staff_sessions SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL", "s", [$m[1]]);
    pos_audit($auth["admin"], "Session ended", ["module" => "users", "target_id" => $rows[0]["staff_user_id"] ?? "", "target_name" => $rows[0]["email"] ?? ""]);
    pos_send(200, ["ok" => true, "id" => $m[1]]);
  }
  if ($path === "master/businesses/export" && $method === "GET") {
    $rows = pos_q(
      "SELECT b.*, p.name AS plan_name FROM businesses b
       LEFT JOIN subscription_plans p ON p.id = b.plan_id ORDER BY b.name"
    );
    foreach ($rows as &$row) $row["computed_status"] = pos_public_status($row);
    unset($row);
    pos_audit($auth["admin"], "Business export", ["module" => "businesses", "target_name" => count($rows) . " shops"]);
    pos_send_file(200, "text/csv; charset=utf-8", "atav-businesses.csv", pos_businesses_csv($rows));
  }
  return false;
}
