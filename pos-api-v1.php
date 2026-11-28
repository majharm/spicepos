<?php
function pos_api_v1_routes() {
  return [
    ["module" => "Overview", "method" => "GET", "path" => "/dashboard/overview"],
    ["module" => "Live Users", "method" => "GET", "path" => "/users/live"],
    ["module" => "Traffic Map", "method" => "GET", "path" => "/analytics/traffic-map"],
    ["module" => "Business Map", "method" => "GET", "path" => "/businesses/map"],
    ["module" => "Offline Sync", "method" => "GET", "path" => "/sync/status"],
    ["module" => "Business", "method" => "GET", "path" => "/businesses"],
    ["module" => "Users", "method" => "GET", "path" => "/users"],
    ["module" => "Subscription", "method" => "GET", "path" => "/subscriptions"],
    ["module" => "Plans", "method" => "GET", "path" => "/plans"],
    ["module" => "Payments", "method" => "GET", "path" => "/payments"],
    ["module" => "Revenue", "method" => "GET", "path" => "/analytics/revenue"],
    ["module" => "Offers", "method" => "GET", "path" => "/offers"],
    ["module" => "Profit", "method" => "GET", "path" => "/analytics/profit"],
    ["module" => "Reports", "method" => "GET", "path" => "/reports"],
    ["module" => "Monitoring", "method" => "GET", "path" => "/system/health"],
    ["module" => "Activity Logs", "method" => "GET", "path" => "/logs/activity"],
  ];
}

function pos_api_v1_base() {
  $env = rtrim((string) pos_env("APP_PUBLIC_URL", pos_env("POS_PUBLIC_URL", "https://pos.atavtelecom.in")), "/");
  return $env . "/api/v1";
}

function pos_api_v1_money($value) {
  return round((float) $value, 2);
}

function pos_api_v1_rows($sql) {
  try {
    return pos_q($sql);
  } catch (Throwable $e) {
    return null;
  }
}

function pos_api_v1_businesses() {
  $rows = pos_q(
    "SELECT b.id, b.name, b.owner_name, b.mobile, b.email, b.city, b.state, b.business_type, b.category, b.status, b.plan_id, b.subscription_expires_at, b.created_at, p.name AS plan_name, p.fee_monthly
     FROM businesses b
     LEFT JOIN subscription_plans p ON p.id = b.plan_id
     WHERE COALESCE(b.status, '') <> 'deleted'
     ORDER BY b.name
     LIMIT 500"
  );
  $out = [];
  foreach ($rows as $row) {
    $out[] = [
      "id" => $row["id"],
      "name" => $row["name"],
      "owner_name" => $row["owner_name"] ?? "",
      "mobile" => $row["mobile"] ?? "",
      "email" => $row["email"] ?? "",
      "city" => $row["city"] ?? "",
      "state" => $row["state"] ?? "",
      "business_type" => $row["business_type"] ?? "",
      "category" => $row["category"] ?? "",
      "status" => pos_public_status($row),
      "plan_id" => $row["plan_id"] ?? "",
      "plan_name" => $row["plan_name"] ?? "",
      "fee_monthly" => pos_api_v1_money($row["fee_monthly"] ?? 0),
      "subscription_expires_at" => substr((string) ($row["subscription_expires_at"] ?? ""), 0, 10),
      "created_at" => $row["created_at"] ?? null,
    ];
  }
  return $out;
}

function pos_api_v1_overview() {
  $shops = pos_q("SELECT id, status, subscription_expires_at, plan_id FROM businesses WHERE COALESCE(status, '') <> 'deleted'");
  $plans = pos_q("SELECT id, fee_monthly FROM subscription_plans");
  $fee = [];
  foreach ($plans as $plan) $fee[$plan["id"]] = (float) ($plan["fee_monthly"] ?? 0);
  $counts = ["active" => 0, "inactive" => 0, "expired" => 0, "suspended" => 0];
  $trial = 0;
  $subscription = 0;
  foreach ($shops as $shop) {
    $status = pos_public_status($shop);
    if (isset($counts[$status])) $counts[$status] += 1;
    if (($shop["plan_id"] ?? "") === "trial") $trial += 1;
    if ($status === "active") $subscription += $fee[$shop["plan_id"] ?? ""] ?? 0;
  }
  $users = pos_q(
    "SELECT COUNT(*) AS n FROM staff_users u JOIN businesses b ON b.id = u.business_id WHERE u.status <> 'deleted' AND COALESCE(b.status, '') <> 'deleted'"
  );
  $sales = pos_q(
    "SELECT COALESCE(SUM(total), 0) AS sales, COUNT(*) AS bills FROM sales_orders WHERE " . pos_created_today() . " AND " . pos_sale_not_void()
  );
  $devices = pos_api_v1_rows("SELECT COUNT(*) AS n FROM pos_devices");
  return [
    "businesses" => count($shops),
    "active" => $counts["active"],
    "inactive" => $counts["inactive"],
    "expired" => $counts["expired"],
    "suspended" => $counts["suspended"],
    "trial" => $trial,
    "users" => (int) ($users[0]["n"] ?? 0),
    "devices" => is_array($devices) ? (int) ($devices[0]["n"] ?? 0) : 0,
    "today_sales" => pos_api_v1_money($sales[0]["sales"] ?? 0),
    "today_bills" => (int) ($sales[0]["bills"] ?? 0),
    "subscription_revenue" => pos_api_v1_money($subscription),
  ];
}

function pos_api_v1_data($path) {
  if ($path === "/" || $path === "") {
    $base = pos_api_v1_base();
    $routes = [];
    foreach (pos_api_v1_routes() as $route) {
      $route["url"] = $base . $route["path"];
      $routes[] = $route;
    }
    return [
      "base" => "/api/v1",
      "public_base" => $base,
      "auth" => "Master admin session (pos_master cookie)",
      "routes" => $routes,
    ];
  }
  if ($path === "/dashboard/overview") return pos_api_v1_overview();
  if (is_file(__DIR__ . "/pos-master-live.php")) require_once __DIR__ . "/pos-master-live.php";
  if ($path === "/users/live") return pos_list_live_users($_GET);
  if ($path === "/analytics/traffic-map") return pos_master_ip_map();
  if ($path === "/businesses/map") return pos_master_biz_traffic();
  if ($path === "/sync/status") return pos_master_sync_status();
  if ($path === "/businesses") return ["businesses" => pos_api_v1_businesses()];
  if ($path === "/users") {
    return ["users" => pos_q(
      "SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.status, u.business_id, u.mobile, u.username, b.name AS business_name
       FROM staff_users u LEFT JOIN businesses b ON b.id = u.business_id
       WHERE u.status <> 'deleted' AND COALESCE(b.status, '') <> 'deleted'
       ORDER BY u.email LIMIT 500"
    )];
  }
  if ($path === "/subscriptions") {
    $rows = [];
    foreach (pos_api_v1_businesses() as $row) {
      $rows[] = [
        "business_id" => $row["id"],
        "business_name" => $row["name"],
        "status" => $row["status"],
        "plan_id" => $row["plan_id"],
        "plan_name" => $row["plan_name"],
        "fee_monthly" => $row["fee_monthly"],
        "expires_at" => $row["subscription_expires_at"],
      ];
    }
    return ["subscriptions" => $rows];
  }
  if ($path === "/plans") {
    $rows = pos_q("SELECT id, code, name, max_branches, max_users, max_devices, max_products, max_invoices, fee_monthly, active FROM subscription_plans ORDER BY fee_monthly, name");
    foreach ($rows as &$row) {
      $row["fee_monthly"] = pos_api_v1_money($row["fee_monthly"] ?? 0);
      $row["active"] = (int) ($row["active"] ?? 0) === 1;
    }
    return ["plans" => $rows];
  }
  if ($path === "/payments") {
    $rows = pos_api_v1_rows(
      "SELECT e.id, e.business_id, b.name AS business_name, e.action, e.status, e.plan_id, p.name AS plan_name, p.fee_monthly, e.expires_at, e.note, e.actor_email, e.created_at
       FROM business_subscription_events e
       LEFT JOIN businesses b ON b.id = e.business_id
       LEFT JOIN subscription_plans p ON p.id = e.plan_id
       ORDER BY e.created_at DESC LIMIT 200"
    ) ?: [];
    foreach ($rows as &$row) $row["fee_monthly"] = pos_api_v1_money($row["fee_monthly"] ?? 0);
    return [
      "note" => "These are subscription changes recorded by Master Admin. Shop bill receipts stay on each business.",
      "payments" => $rows,
    ];
  }
  if ($path === "/analytics/revenue") {
    $days = pos_q(
      "SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS bills, COALESCE(SUM(total), 0) AS sales
       FROM sales_orders
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND " . pos_sale_not_void() . "
       GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d') ORDER BY day"
    );
    $sales = 0;
    $bills = 0;
    foreach ($days as &$day) {
      $sales += (float) $day["sales"];
      $bills += (int) $day["bills"];
      $day["sales"] = pos_api_v1_money($day["sales"]);
      $day["bills"] = (int) $day["bills"];
    }
    $head = pos_api_v1_overview();
    return [
      "range_days" => 30,
      "sales" => pos_api_v1_money($sales),
      "bills" => $bills,
      "subscription_revenue" => $head["subscription_revenue"],
      "days" => $days,
    ];
  }
  if ($path === "/offers") {
    $rows = pos_api_v1_rows(
      "SELECT o.id, o.business_id, b.name AS business_name, o.name, o.offer_type, o.status, o.discount_type, o.discount_value, o.start_date, o.end_date, o.used_count
       FROM promo_offers o LEFT JOIN businesses b ON b.id = o.business_id
       ORDER BY o.updated_at DESC LIMIT 200"
    ) ?: [];
    $counts = [];
    foreach ($rows as &$row) {
      $key = (string) ($row["status"] ?? "draft");
      $counts[$key] = ($counts[$key] ?? 0) + 1;
      $row["discount_value"] = pos_api_v1_money($row["discount_value"] ?? 0);
      $row["used_count"] = (int) ($row["used_count"] ?? 0);
    }
    return ["counts" => $counts, "offers" => $rows];
  }
  if ($path === "/analytics/profit") {
    $rows = pos_api_v1_rows(
      "SELECT COALESCE(SUM(l.amount), 0) AS sales, COALESCE(SUM(l.cost), 0) AS cost, COALESCE(SUM(l.profit), 0) AS profit
       FROM sales_order_lines l JOIN sales_orders o ON o.id = l.order_id
       WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND " . pos_sale_not_void("o") . " AND COALESCE(l.cancelled, 0) = 0"
    );
    if (!$rows) {
      $head = pos_q(
        "SELECT COALESCE(SUM(total), 0) AS sales FROM sales_orders WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND " . pos_sale_not_void()
      );
      return ["range_days" => 30, "sales" => pos_api_v1_money($head[0]["sales"] ?? 0), "cost" => null, "profit" => null, "note" => "Line cost is not available."];
    }
    return [
      "range_days" => 30,
      "sales" => pos_api_v1_money($rows[0]["sales"] ?? 0),
      "cost" => pos_api_v1_money($rows[0]["cost"] ?? 0),
      "profit" => pos_api_v1_money($rows[0]["profit"] ?? 0),
    ];
  }
  if ($path === "/reports") {
    $rows = pos_q(
      "SELECT b.id AS business_id, b.name AS business_name, COUNT(*) AS bills, COALESCE(SUM(o.total), 0) AS sales
       FROM sales_orders o JOIN businesses b ON b.id = o.business_id
       WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND " . pos_sale_not_void("o") . " AND COALESCE(b.status, '') <> 'deleted'
       GROUP BY b.id, b.name ORDER BY sales DESC LIMIT 50"
    );
    foreach ($rows as &$row) {
      $row["bills"] = (int) $row["bills"];
      $row["sales"] = pos_api_v1_money($row["sales"]);
    }
    return [
      "range_days" => 30,
      "businesses" => $rows,
      "catalog" => [
        ["id" => "sales", "title" => "Sales", "path" => "/api/reports"],
        ["id" => "item-sales", "title" => "Item sales", "path" => "/api/reports/item-sales"],
        ["id" => "item-purchases", "title" => "Item purchases", "path" => "/api/reports/item-purchases"],
        ["id" => "item-oversells", "title" => "Item oversells", "path" => "/api/reports/item-oversells"],
        ["id" => "offer-profit", "title" => "Offer profit", "path" => "/api/reports/offer-profit"],
        ["id" => "dsa-sales", "title" => "DSA sales", "path" => "/api/master/dsa-sales"],
      ],
    ];
  }
  if ($path === "/system/health") return pos_master_health();
  if ($path === "/logs/activity") {
    return ["logs" => pos_q(
      "SELECT l.id, l.created_at, l.actor_name, l.module, l.action, l.target_name, l.business_id, b.name AS business_name
       FROM staff_audit_logs l
       LEFT JOIN businesses b ON b.id = l.business_id AND l.business_id <> 'platform'
       ORDER BY l.created_at DESC LIMIT 200"
    )];
  }
  pos_send(404, ["ok" => false, "version" => "v1", "error" => "Unknown API path", "path" => $path]);
}

function pos_api_v1_dispatch($path, $method) {
  if ($path !== "v1" && strpos($path, "v1/") !== 0) return false;
  $auth = function_exists("pos_master_session") ? pos_master_session() : null;
  if (!$auth) pos_send(401, ["ok" => false, "version" => "v1", "error" => "Master admin sign in required"]);
  if (strtoupper((string) $method) !== "GET") {
    pos_send(405, ["ok" => false, "version" => "v1", "error" => "This API is read-only"]);
  }
  $rest = $path === "v1" ? "/" : "/" . substr($path, 3);
  $rest = rtrim($rest, "/") ?: "/";
  $module = "Index";
  foreach (pos_api_v1_routes() as $route) {
    if ($route["path"] === $rest) $module = $route["module"];
  }
  pos_send(200, [
    "ok" => true,
    "version" => "v1",
    "base" => "/api/v1",
    "module" => $module,
    "path" => $rest,
    "generated_at" => gmdate("c"),
    "data" => pos_api_v1_data($rest),
  ]);
}
