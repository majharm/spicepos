<?php
function pos_round2($n) {
  return round((float) $n, 2);
}

function pos_php_till_dispatch($path, $method, $body) {
  $head = explode("/", $path)[0];
  $staff = [
    "bootstrap", "dashboard", "today", "suppliers", "items", "customers", "packs",
    "orders", "purchases", "stock", "staff", "branches", "devices", "holds",
    "checkout", "settings", "reports", "audit", "accounts",
  ];
  if (!in_array($head, $staff, true)) return false;
  $auth = pos_staff_session();
  if (!$auth || ($auth["type"] ?? "") !== "staff") pos_send(401, ["error" => "Sign in required"]);
  $bid = $auth["user"]["business_id"];
  $branchId = $auth["branchId"] ?? $auth["user"]["branch_id"] ?? null;
  $uid = $auth["user"]["id"];
  pos_apply_business_timezone($bid);

  require_once __DIR__ . "/pos-checkout.php";
  if ($path === "checkout" && $method === "POST") {
    pos_dispatch_checkout($path, $method, $body, $bid, $branchId, $uid, $auth);
  }

  if ($path === "bootstrap" && $method === "GET") {
    pos_ensure_accounts_schema();
    $co = [];
    try {
      $co = pos_q("SELECT * FROM company_settings WHERE business_id = ? LIMIT 1", "s", [$bid]);
    } catch (Exception $e) { /* optional */ }
    $biz = pos_q("SELECT * FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
    $business = $biz[0] ?? null;
    $items = [];
    $customers = [];
    $packs = [];
    try {
      $items = pos_q("SELECT * FROM items WHERE business_id = ? ORDER BY category, subcategory, name", "s", [$bid]);
    } catch (Exception $e) { /* optional */ }
    try {
      $customers = pos_q("SELECT * FROM customers WHERE business_id = ? ORDER BY name", "s", [$bid]);
    } catch (Exception $e) { /* optional */ }
    try {
      $packs = pos_q("SELECT * FROM packs WHERE business_id = ? ORDER BY name", "s", [$bid]);
    } catch (Exception $e) {
      $packs = [];
    }
    $packItems = [];
    if ($packs) {
      $ids = array_column($packs, "id");
      $ph = implode(",", array_fill(0, count($ids), "?"));
      $types = str_repeat("s", count($ids));
      $packItems = pos_q(
        "SELECT pi.*, i.name AS spice_name, i.local_name, i.code AS item_code
         FROM pack_items pi JOIN items i ON i.id = pi.item_id
         WHERE pi.pack_id IN ($ph) ORDER BY pi.sort_order",
        $types,
        $ids
      );
    }
    $plan = null;
    if (!empty($business["plan_id"])) {
      $pr = pos_q(
        "SELECT id, code, name, fee_monthly, max_branches, max_users, max_devices FROM subscription_plans WHERE id = ? LIMIT 1",
        "s",
        [$business["plan_id"]]
      );
      $plan = $pr[0] ?? null;
    }
    $outPacks = [];
    foreach ($packs as $p) {
      $p["items"] = [];
      foreach ($packItems as $row) {
        if ($row["pack_id"] === $p["id"]) $p["items"][] = $row;
      }
      $outPacks[] = $p;
    }
    $coRow = $co[0] ?? ["name" => $business["name"] ?? "POS"];
    $tzMeta = pos_company_timezone($coRow);
    $coRow["timezone"] = $tzMeta["timezone"];
    $coRow["tz_offset"] = $tzMeta["tz_offset"];
    $notes = [];
    try {
      $notes = pos_q(
        "SELECT id, title, body, created_at FROM notifications WHERE business_id IS NULL OR business_id = ? ORDER BY created_at DESC LIMIT 8",
        "s",
        [$bid]
      );
    } catch (Exception $e) { /* optional */ }
    pos_send(200, [
      "company" => $coRow,
      "business" => $business,
      "plan" => $plan,
      "support" => pos_platform_settings(),
      "notes" => $notes,
      "items" => $items,
      "customers" => $customers,
      "packs" => $outPacks,
      "php" => true,
    ]);
  }

  if ($path === "dashboard" && $method === "GET") {
    $sales = pos_q(
      "SELECT COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings, COALESCE(SUM(gst),0) AS gst
       FROM sales_orders WHERE business_id = ? AND DATE(created_at)=CURDATE()",
      "s",
      [$bid]
    );
    $purchase = pos_q(
      "SELECT COALESCE(SUM(total),0) AS total FROM purchases WHERE business_id = ? AND purchase_date = CURDATE()",
      "s",
      [$bid]
    );
    $stock = pos_q(
      "SELECT COALESCE(SUM(stock_gm/1000 * purchase_rate),0) AS value FROM items WHERE business_id = ?",
      "s",
      [$bid]
    );
    $out = pos_q("SELECT COALESCE(SUM(outstanding),0) AS outstanding FROM customers WHERE business_id = ?", "s", [$bid]);
    $branches = pos_q("SELECT * FROM branches WHERE business_id = ? ORDER BY name", "s", [$bid]);
    $notes = pos_q(
      "SELECT * FROM notifications WHERE business_id IS NULL OR business_id = ? ORDER BY created_at DESC LIMIT 8",
      "s",
      [$bid]
    );
    pos_send(200, [
      "today" => $sales[0] ?? ["bills" => 0, "takings" => 0, "gst" => 0],
      "purchase" => $purchase[0]["total"] ?? 0,
      "stockValue" => $stock[0]["value"] ?? 0,
      "outstanding" => $out[0]["outstanding"] ?? 0,
      "branches" => $branches,
      "notes" => $notes,
      "user" => ["name" => $auth["user"]["email"], "role" => $auth["user"]["role"], "permissions" => pos_parse_perms($auth["user"])],
    ]);
  }

  if ($path === "today" && $method === "GET") {
    $today = pos_q(
      "SELECT COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings, COALESCE(SUM(gst),0) AS gst
       FROM sales_orders WHERE business_id = ? AND DATE(created_at) = CURDATE()",
      "s",
      [$bid]
    );
    pos_send(200, ["today" => $today[0] ?? ["bills" => 0, "takings" => 0, "gst" => 0]]);
  }

  if ($path === "settings" && $method === "POST") {
    $name = trim((string) ($body["name"] ?? ""));
    if ($name === "") pos_send(400, ["error" => "Shop name is required"]);
    $tz = pos_normalize_timezone($body["timezone"] ?? "");
    $tzOff = pos_tz_offset_for($tz);
    $address = $body["address"] ?? null;
    $phone = $body["phone"] ?? null;
    $email = $body["email"] ?? null;
    $gstin = $body["gstin"] ?? null;
    $logoSql = "";
    $params = [$name, $address, $phone, $email, $gstin, $tz, $tzOff];
    $types = "sssssss";
    if (array_key_exists("logo_url", $body)) {
      $logo = (string) ($body["logo_url"] ?? "");
      if ($logo !== "" && strpos($logo, "data:image/") !== 0) pos_send(400, ["error" => "Logo must be an uploaded image"]);
      if (strlen($logo) > 6000000) pos_send(400, ["error" => "Logo is too large"]);
      $logoSql = ", logo_url = ?";
      $params[] = $logo !== "" ? $logo : null;
      $types .= "s";
    }
    $params[] = $bid;
    $types .= "s";
    pos_q(
      "UPDATE company_settings SET name = ?, address = ?, phone = ?, email = ?, gstin = ?, timezone = ?, tz_offset = ?{$logoSql} WHERE business_id = ?",
      $types,
      $params
    );
    pos_q(
      "UPDATE businesses SET name = ?, address = COALESCE(?, address), mobile = COALESCE(?, mobile),
         email = COALESCE(?, email), gstin = COALESCE(?, gstin) WHERE id = ?",
      "ssssss",
      [$name, $address, $phone, $email, $gstin, $bid]
    );
    $rows = pos_q("SELECT * FROM company_settings WHERE business_id = ? LIMIT 1", "s", [$bid]);
    $co = $rows[0] ?? ["name" => $name];
    $meta = pos_company_timezone($co);
    $co["timezone"] = $meta["timezone"];
    $co["tz_offset"] = $meta["tz_offset"];
    pos_apply_business_timezone($bid);
    pos_send(200, ["ok" => true, "company" => $co]);
  }

  if ($path === "suppliers" && $method === "GET") {
    pos_ensure_accounts_schema();
    pos_send(200, pos_q("SELECT * FROM suppliers WHERE business_id = ? ORDER BY name", "s", [$bid]));
  }

  if ($path === "items" && $method === "GET") {
    pos_send(200, pos_q("SELECT * FROM items WHERE business_id = ? ORDER BY category, subcategory, name", "s", [$bid]));
  }

  if ($path === "customers" && $method === "GET") {
    pos_send(200, pos_q("SELECT * FROM customers WHERE business_id = ? ORDER BY name", "s", [$bid]));
  }

  if ($path === "packs" && $method === "GET") {
    $packs = pos_q("SELECT * FROM packs WHERE business_id = ? ORDER BY name", "s", [$bid]);
    $ids = array_column($packs, "id");
    $packItems = [];
    if ($ids) {
      $ph = implode(",", array_fill(0, count($ids), "?"));
      $packItems = pos_q(
        "SELECT pi.*, i.name AS spice_name, i.local_name, i.code AS item_code
         FROM pack_items pi JOIN items i ON i.id = pi.item_id
         WHERE pi.pack_id IN ($ph) ORDER BY pi.sort_order",
        str_repeat("s", count($ids)),
        $ids
      );
    }
    $outPacks = [];
    foreach ($packs as $p) {
      $p["items"] = [];
      foreach ($packItems as $row) {
        if ($row["pack_id"] === $p["id"]) $p["items"][] = $row;
      }
      $outPacks[] = $p;
    }
    pos_send(200, $outPacks);
  }

  if ($path === "stock" && $method === "GET") {
    pos_send(200, pos_q("SELECT * FROM items WHERE business_id = ? ORDER BY name", "s", [$bid]));
  }

  if ($path === "staff" && $method === "GET") {
    pos_send(200, pos_q(
      "SELECT id, email, first_name, last_name, role, status, username, mobile FROM staff_users WHERE business_id = ? ORDER BY email",
      "s",
      [$bid]
    ));
  }

  if ($path === "branches" && $method === "GET") {
    pos_send(200, pos_q("SELECT * FROM branches WHERE business_id = ? ORDER BY name", "s", [$bid]));
  }

  if ($path === "devices" && $method === "GET") {
    pos_send(200, pos_q(
      "SELECT d.*, br.name AS branch_name FROM pos_devices d
       LEFT JOIN branches br ON br.id = d.branch_id
       WHERE d.business_id = ? ORDER BY d.code",
      "s",
      [$bid]
    ));
  }

  if ($path === "orders" && $method === "GET") {
    $orders = pos_q(
      "SELECT * FROM sales_orders WHERE business_id = ?
       ORDER BY CAST(SUBSTRING(order_number, 4) AS UNSIGNED) DESC, created_at DESC
       LIMIT 80",
      "s",
      [$bid]
    );
    $ids = array_column($orders, "id");
    $lines = [];
    if ($ids) {
      $ph = implode(",", array_fill(0, count($ids), "?"));
      $lines = pos_q("SELECT * FROM sales_order_lines WHERE order_id IN ($ph) ORDER BY created_at", str_repeat("s", count($ids)), $ids);
    }
    foreach ($orders as &$o) {
      $o["lines"] = [];
      foreach ($lines as $l) {
        if ($l["order_id"] === $o["id"]) $o["lines"][] = $l;
      }
    }
    pos_send(200, $orders);
  }

  if (preg_match('#^orders/([^/]+)$#', $path, $m)) {
    require_once __DIR__ . "/pos-orders.php";
    $orderId = $m[1];
    if ($method === "PUT") pos_update_order($bid, $orderId, $body, $auth);
    if ($method === "PATCH") pos_patch_order($bid, $orderId, $body, $auth);
    pos_send(405, ["error" => "Method not allowed", "php" => true]);
  }

  if ($path === "purchases" && $method === "GET") {
    $purchases = pos_q("SELECT * FROM purchases WHERE business_id = ? ORDER BY purchase_date DESC, created_at DESC LIMIT 80", "s", [$bid]);
    $ids = array_column($purchases, "id");
    $lines = [];
    if ($ids) {
      $ph = implode(",", array_fill(0, count($ids), "?"));
      $lines = pos_q("SELECT * FROM purchase_lines WHERE purchase_id IN ($ph) ORDER BY created_at", str_repeat("s", count($ids)), $ids);
    }
    foreach ($purchases as &$p) {
      $p["lines"] = [];
      foreach ($lines as $l) {
        if ($l["purchase_id"] === $p["id"]) $p["lines"][] = $l;
      }
    }
    unset($p);
    pos_send(200, $purchases);
  }

  if ($path === "holds" && $method === "GET") {
    try {
      pos_send(200, pos_q("SELECT * FROM held_bills WHERE business_id = ? ORDER BY created_at DESC LIMIT 50", "s", [$bid]));
    } catch (Exception $e) {
      pos_send(200, []);
    }
  }

  if ($path === "audit" && $method === "GET") {
    pos_send(200, pos_q("SELECT * FROM staff_audit_logs WHERE business_id = ? ORDER BY created_at DESC LIMIT 100", "s", [$bid]));
  }

  require_once __DIR__ . "/pos-accounting.php";
  if (pos_accounts_dispatch($path, $method, $body, $bid, $auth, $branchId, $uid)) {
    return;
  }

  require_once __DIR__ . "/pos-crud.php";
  if (pos_crud_dispatch($path, $method, $body, $bid, $auth, $branchId, $uid)) {
    return;
  }

  if (($path === "reports" || $path === "reports/excel") && $method === "GET") {
    require_once __DIR__ . "/pos-reports.php";
    $from = $_GET["from"] ?? date("Y-m-d");
    $to = $_GET["to"] ?? $from;
    if ($path === "reports/excel") {
      pos_reports_excel_response($bid, $from, $to, trim((string) ($_GET["sheet"] ?? "")));
    }
    pos_send(200, pos_build_reports($bid, $from, $to));
  }

  return false;
}
