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

function pos_master_health() {
  $started = microtime(true);
  pos_q("SELECT 1 AS ok");
  return [
    "ok" => true,
    "database" => "connected",
    "dbMs" => (int) round((microtime(true) - $started) * 1000),
    "uptimeSeconds" => null,
    "memoryRss" => memory_get_usage(true),
    "loadAvg" => null,
    "php" => true,
    "note" => "Host CPU and RAM are not exposed. Memory is this PHP request.",
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

function pos_master_live_dispatch($path, $method, $auth) {
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
